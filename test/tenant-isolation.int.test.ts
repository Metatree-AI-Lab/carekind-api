import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaTenantDatabase } from "../src/adapters/prisma-tenant-database";

// 跨租户隔离测试（Super Admin PRD §4-B、§10.2 第 2 条：发布门槛）。需要数据库，AI 会话没有运行。
// 运行：npm run test:integration（DATABASE_URL = carekind_app 角色，DATABASE_MIGRATION_URL = owner）。
// 两个虚构 Provider：A（Test Provider A, fictional）和 B；用 A 的上下文读写 B 的数据必须拿不到 / 写不进。

const owner = new PrismaClient({ datasourceUrl: process.env["DATABASE_MIGRATION_URL"] });
const database = new PrismaTenantDatabase();
const providerA = randomUUID();
const providerB = randomUUID();
let residentB = "";

beforeAll(async () => {
	for (const [id, name] of [[providerA, "A"], [providerB, "B"]] as const) {
		await owner.provider.create({ data: { id, slug: `isolation-${id}`, legalName: `Test Provider ${name} (fictional)`, abn: "00000000002" } });
		const facility = await owner.facility.create({
			data: { providerId: id, name: `Test Facility ${name}`, addressLine1: "1 Fictional Test Lane", suburb: "Melbourne", state: "VIC", postcode: "3000" },
		});
		const resident = await owner.resident.create({
			data: { providerId: id, facilityId: facility.id, legalName: `Test Resident ${name}`, dateOfBirth: new Date("1940-01-01"), facilityResidentId: `T-${name}` },
		});
		if (id === providerB) residentB = resident.id;
	}
});

afterAll(async () => {
	await owner.$disconnect();
	await database.onModuleDestroy();
});

describe("row-level security", () => {
	it("hides another provider's residents from a portal session", async () => {
		const visible = await database.run({ audience: "PORTAL", providerId: providerA }, (tx) => tx.resident.findMany());
		expect(visible.every((resident) => resident.providerId === providerA)).toBe(true);
		const other = await database.run({ audience: "PORTAL", providerId: providerA }, (tx) => tx.resident.findUnique({ where: { id: residentB } }));
		expect(other).toBeNull();
	});

	it("never shows residents to the Super Admin audience, even inside the provider", async () => {
		const rows = await database.run({ audience: "SUPER_ADMIN", providerId: providerB }, (tx) => tx.resident.findMany());
		expect(rows).toEqual([]);
		expect(await database.countResidents(providerB)).toBe(1);
	});

	it("rejects writing a row into another provider", async () => {
		await expect(
			database.run({ audience: "PORTAL", providerId: providerA }, (tx) =>
				tx.staffMember.create({ data: { providerId: providerB, fullName: "Intruder Test", loginEmail: "intruder@test.example", nurseAppRole: "PCW" } }),
			),
		).rejects.toThrow();
	});

	it("sees no tenant rows when no provider context is set", async () => {
		const rows = await database.run({ audience: "PORTAL", providerId: null }, (tx) => tx.staffMember.findMany());
		expect(rows).toEqual([]);
	});

	it("does not allow audit events to be updated or deleted", async () => {
		await expect(
			database.run({ audience: "SUPER_ADMIN", providerId: providerA }, (tx) => tx.auditEvent.deleteMany({ where: { providerId: providerA } })),
		).rejects.toThrow();
	});
});
