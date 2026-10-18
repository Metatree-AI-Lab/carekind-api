// 种子脚本：本地开发数据库的虚构数据（全部 fictional）。开发者手动运行：npm run db:seed（AI 会话没有运行）。
// 用 DATABASE_MIGRATION_URL（表的 owner）连接；owner 不受 RLS 约束，所以这里每一行都显式写 providerId。
// 可以重复运行：已经有 Wattle Grove Care Group 时跳过租户数据，只补全平台数据和账号。
// 密码只从环境变量读取（SEED_*），不写在代码里。

import { PLATFORM_DEFAULT_CONFIG, PLATFORM_HARD_FLOOR } from "@carekind/shared/policy";
import { SUPER_ADMIN_PERMISSION_GROUPS, WORKFLOW_ITEMS, type FacilityGoLiveConfig } from "@carekind/shared/schemas";
import { PrismaClient, type Prisma } from "@prisma/client";
import argon2 from "argon2";
import {
	COMPLIANCE,
	FACILITIES,
	FEATURE_FLAGS,
	PROVIDER,
	REGION_NAME,
	RESIDENTS,
	roleScopeFor,
	RULE_PACK_HINTS,
	SHARED_HINTS,
	STAFF,
} from "./seed-data";

const prisma = new PrismaClient({ datasourceUrl: requireEnv("DATABASE_MIGRATION_URL") });

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Set ${name} in .env before seeding.`);
	return value;
}

const hashPassword = (password: string): Promise<string> =>
	argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

async function seedSuperAdminUsers(): Promise<string> {
	for (const key of SUPER_ADMIN_PERMISSION_GROUPS) {
		await prisma.permissionGroup.upsert({ where: { key }, update: {}, create: { key, name: key } });
	}
	const groups = await prisma.permissionGroup.findMany();
	const groupId = (key: string): string => groups.find((group) => group.key === key)?.id ?? "";
	// 两个虚构的 careKind 内部用户，方便本地演练 four-eyes（发起人和批准人必须是两个人）。
	const users = [
		{ email: requireEnv("SEED_SUPER_ADMIN_EMAIL"), password: requireEnv("SEED_SUPER_ADMIN_PASSWORD"), name: "Avery Collins (fictional)", groups: ["Onboarding", "Commercial", "ContentGovernance", "Support", "ReadOnlyAuditor", "EngineerOnCall"] },
		{ email: process.env["SEED_SECOND_SUPER_ADMIN_EMAIL"], password: process.env["SEED_SECOND_SUPER_ADMIN_PASSWORD"], name: "Jordan Lee (fictional)", groups: ["PlatformOwner", "ContentGovernance"] },
	];
	let firstUserId = "";
	for (const user of users) {
		if (!user.email || !user.password) continue;
		const email = user.email.toLowerCase();
		const passwordHash = await hashPassword(user.password);
		const saved = await prisma.superAdminUser.upsert({ where: { email }, update: { passwordHash }, create: { email, displayName: user.name, passwordHash } });
		for (const key of user.groups) {
			await prisma.superAdminGroupMembership.upsert({
				where: { userId_groupId: { userId: saved.id, groupId: groupId(key) } },
				update: {},
				create: { userId: saved.id, groupId: groupId(key) },
			});
		}
		firstUserId ||= saved.id;
	}
	return firstUserId;
}

async function seedPlatform(seedUserId: string): Promise<void> {
	for (const flag of FEATURE_FLAGS) {
		await prisma.featureFlag.upsert({ where: { key: flag.key }, update: {}, create: { ...flag, updatedBy: seedUserId } });
	}
	for (const [state, hint] of Object.entries(RULE_PACK_HINTS)) {
		const id = `${state}-2026.10-1`;
		const entries = [
			{ kind: "HintText", templateId: "clinical-restrictive-practice-consent-record", fieldKey: "consent-source", text: hint, isVerified: true },
			...SHARED_HINTS.map((sharedHint) => ({ kind: "HintText", ...sharedHint, isVerified: true })),
		];
		const sources = [{ reference: "03-legal-compliance/references/state-clinical-practice-rules.md §1.3", verifiedOn: "2026-10-18" }];
		await prisma.stateRulePack.upsert({
			where: { id },
			update: {},
			create: { id, state: state as "VIC" | "NSW" | "QLD", status: "Published", entries, sources, draftedBy: seedUserId, publishedAt: new Date() },
		});
	}
	await seedTemplates(seedUserId);
	await prisma.platformSetting.upsert({
		where: { key: "rp_consent_cth_transition" },
		update: {},
		create: { key: "rp_consent_cth_transition", value: { global: { status: "Active" }, stateOverrides: [] }, reason: "Initial setting (seed)", changedBy: seedUserId },
	});
	for (const item of WORKFLOW_ITEMS) {
		const existing = await prisma.configVersion.findFirst({ where: { layer: "Platform", item } });
		if (existing) continue;
		await prisma.configVersion.create({
			data: { layer: "Platform", item, versionNumber: 1, config: PLATFORM_DEFAULT_CONFIG[item] as Prisma.InputJsonValue, status: "Scheduled", changedBy: seedUserId, approvedBy: seedUserId, approvedAt: new Date("2026-10-01T00:00:00Z"), reason: "careKind default minimums (seed)", effectiveMode: "Immediate", effectiveFrom: new Date("2026-10-01T00:00:00Z") },
		});
	}
}

async function seedTemplates(seedUserId: string): Promise<void> {
	const templates = [
		{ templateName: "daily-progress-note", title: "Daily progress note", defaultTier: 1, humanOnlyFields: ["Resident", "Author / role", "Clinical assessment / interpretation", "Reviewed by / time"] },
		{ templateName: "daily-shift-handover-isbar", title: "Shift handover (ISBAR)", defaultTier: 1, humanOnlyFields: ["Handover from / to", "Scope", "A Assessment", "R Recommendation / actions", "Handover accepted"] },
	];
	for (const template of templates) {
		await prisma.documentTemplateVersion.upsert({
			where: { templateName_version: { templateName: template.templateName, version: "1.0.0" } },
			update: {},
			create: { ...template, version: "1.0.0", applicableStates: "All", status: "Published", draftedBy: seedUserId, publishedAt: new Date() },
		});
	}
}

async function seedProvider(seedUserId: string, portalPasswordHash: string | null): Promise<void> {
	if (await prisma.provider.findUnique({ where: { slug: PROVIDER.slug } })) {
		console.log("Wattle Grove Care Group (fictional) already exists — skipping tenant data.");
		return;
	}
	const provider = await prisma.provider.create({ data: { ...PROVIDER, status: "Active" } });
	const providerId = provider.id;
	const region = await prisma.region.create({ data: { providerId, name: REGION_NAME } });
	const facilityIds = await seedFacilities(providerId, region.id);
	await prisma.plan.create({
		data: { providerId, name: "Pilot", limits: [{ unit: "seat", maxValue: 60 }, { unit: "facility", maxValue: 3 }], billingStatus: "NotInvoiced", updatedBy: seedUserId },
	});
	for (const item of COMPLIANCE) {
		await prisma.complianceStatus.create({
			data: { providerId, documentType: item.documentType, status: item.status, effectiveOn: new Date(item.effectiveOn), expiresOn: item.expiresOn ? new Date(item.expiresOn) : null, updatedBy: seedUserId },
		});
	}
	await prisma.breachNotificationRegistration.create({
		data: { providerId, contactName: "Ruth Kim", contactPosition: "Privacy Officer (fictional)", regime: "CommonwealthNdb", carekindCommitmentHours: 24, updatedBy: seedUserId },
	});
	await seedStaff(providerId, facilityIds, region.id, seedUserId, portalPasswordHash);
	await seedResidents(providerId, facilityIds);
	console.log(`Seeded fictional provider ${PROVIDER.legalName}.`);
}

async function seedFacilities(providerId: string, regionId: string): Promise<Record<string, string>> {
	const ids: Record<string, string> = {};
	const goLive = PLATFORM_HARD_FLOOR.FacilityGoLive as FacilityGoLiveConfig;
	for (const seed of FACILITIES) {
		const facility = await prisma.facility.create({
			data: { providerId, regionId: seed.isInRegion ? regionId : null, name: seed.name, addressLine1: seed.addressLine1, suburb: seed.suburb, state: seed.state, postcode: seed.postcode, status: seed.status, operationalBeds: seed.operationalBeds, rulePackId: `${seed.state}-2026.10-1` },
		});
		ids[seed.key] = facility.id;
		await prisma.unit.createMany({ data: seed.units.map((unit) => ({ providerId, facilityId: facility.id, ...unit })) });
		await prisma.goLiveChecklistItem.createMany({
			data: goLive.entries.map((entry) => {
				const isComplete = !seed.incompleteGoLiveItems.includes(entry.itemNumber);
				return { providerId, facilityId: facility.id, itemNumber: entry.itemNumber, isGoLiveGate: entry.isGoLiveGate, isComplete, completedAt: isComplete ? new Date("2026-10-10T00:00:00Z") : null, source: entry.side === "CareKind" ? "SuperAdmin" : "ProviderPortal" };
			}),
		});
	}
	return ids;
}

async function seedStaff(providerId: string, facilityIds: Record<string, string>, regionId: string, seedUserId: string, portalPasswordHash: string | null): Promise<void> {
	for (const seed of STAFF) {
		const staff = await prisma.staffMember.create({
			data: { providerId, fullName: seed.fullName, preferredName: seed.preferredName, loginEmail: seed.email, nurseAppRole: seed.nurseAppRole, registrationType: seed.nurseAppRole === "RN" ? "RN" : "None", status: "Active", activatedAt: new Date("2026-10-10T00:00:00Z"), passwordHash: seed.canSignInToPortal ? portalPasswordHash : null },
		});
		await prisma.staffFacilityAssignment.createMany({ data: seed.facilities.map((key) => ({ providerId, staffId: staff.id, facilityId: facilityIds[key] ?? "" })) });
		for (const grant of seed.portalRoles) {
			const scope = roleScopeFor(grant.scope, facilityIds, regionId);
			const rows = scope.type === "Facilities" ? scope.facilityIds.map((facilityId) => ({ facilityId, regionId: null })) : [{ facilityId: null, regionId: scope.type === "Region" ? scope.regionId : null }];
			await prisma.portalRoleAssignment.createMany({ data: rows.map((row) => ({ providerId, staffId: staff.id, role: grant.role, grantedBy: seedUserId, ...row })) });
		}
	}
}

async function seedResidents(providerId: string, facilityIds: Record<string, string>): Promise<void> {
	const staffMember = await prisma.staffMember.findFirstOrThrow({ where: { providerId, loginEmail: "grace.liu@wattlegrove.example" } });
	for (const seed of RESIDENTS) {
		const facilityId = facilityIds[seed.facility] ?? "";
		const unit = await prisma.unit.findFirstOrThrow({ where: { facilityId, name: seed.unit } });
		const source = { type: "Representative", representativeName: "Marco Bianchi", relationship: "son" };
		const resident = await prisma.resident.create({
			data: { providerId, facilityId, unitId: unit.id, room: seed.room, legalName: seed.legalName, preferredName: seed.preferredName, dateOfBirth: new Date(seed.dateOfBirth), facilityResidentId: seed.facilityResidentId, status: "Admitted", startDay: new Date("2026-01-15"), aiDocumentationConsent: seed.isOptedOut ? "OptedOut" : "Consented", consentSource: seed.isOptedOut ? source : { type: "Self" }, consentRecordedOn: new Date("2026-10-08"), consentRecordedBy: staffMember.id },
		});
		if (seed.isOptedOut) {
			await prisma.residentConsentEvent.create({
				data: { providerId, residentId: resident.id, aiDocumentation: "OptedOut", isRecordingOptedOut: true, source, recordedOn: new Date("2026-10-08"), recordedBy: staffMember.id },
			});
		}
	}
}

async function main(): Promise<void> {
	const seedUserId = await seedSuperAdminUsers();
	await seedPlatform(seedUserId);
	const portalPassword = process.env["SEED_DEMO_PORTAL_PASSWORD"];
	await seedProvider(seedUserId, portalPassword ? await hashPassword(portalPassword) : null);
	console.log("Seed complete (all data is fictional).");
}

main()
	.catch((error: unknown) => {
		console.error("Seed failed:", error instanceof Error ? error.message : "unknown error");
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
