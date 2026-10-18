import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { superAdminTenancyEndpoints as tenancy } from "@carekind/shared/contracts";
import { checkPlanLimit, planLimitMessage, PLATFORM_HARD_FLOOR } from "@carekind/shared/policy";
import type { AustralianState, FacilityGoLiveConfig, Provider } from "@carekind/shared/schemas";
import { Prisma, type Provider as ProviderRow } from "@prisma/client";
import type { z } from "zod";
import { APP_CONFIG, type AppConfig } from "../adapters/app-config";
import { superAdminScope, type SuperAdminActor } from "./actors";
import { AuditService, type AuditEntry } from "./audit.service";
import { ApiError, conflict, notFound } from "./errors";
import { cursorArgs, toFacility, toPage, toPlan, toProvider, toUnit } from "./mappers";
import { TenantDatabase, type DbTransaction } from "./ports";

// Super Admin：Provider / Facility / Unit 代建与首个 Owner 邀请（Super Admin PRD §4-E）。
// 这里没有任何读取住户的代码：住户只以计数出现（ck_resident_count）。

type Body<Key extends keyof typeof tenancy> = z.output<(typeof tenancy)[Key]["body"]>;
type Query<Key extends keyof typeof tenancy> = z.output<(typeof tenancy)[Key]["query"]>;
type Response<Key extends keyof typeof tenancy> = z.input<(typeof tenancy)[Key]["response"]>;

/** 邀请链接 72 小时过期（SA PRD §4-E 第 5 步）。 */
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class SuperAdminProvidersService {
	constructor(
		@Inject(TenantDatabase) private readonly database: TenantDatabase,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(APP_CONFIG) private readonly config: AppConfig,
	) {}

	async listProviders(actor: SuperAdminActor, query: Query<"listProviders">): Promise<Response<"listProviders">> {
		const rows = await this.database.run(superAdminScope(null), (transaction) =>
			transaction.provider.findMany({
				where: { ...visibleProviders(actor), status: query.status },
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				...cursorArgs(query.cursor, query.limit),
			}),
		);
		const page = toPage(rows, query.limit, (row) => row);
		const items = await Promise.all(page.items.map((row) => this.withCounts(toProvider(row))));
		return { items, nextCursor: page.nextCursor };
	}

	async getProvider(actor: SuperAdminActor, providerId: string): Promise<Response<"getProvider">> {
		const row = await this.database.run(superAdminScope(providerId), (transaction) =>
			findVisibleProvider(transaction, actor, providerId),
		);
		return this.withCounts(toProvider(row));
	}

	async createProvider(actor: SuperAdminActor, body: Body<"createProvider">): Promise<Provider> {
		try {
			const row = await this.database.run(superAdminScope(null), async (transaction) => {
				const created = await transaction.provider.create({
					data: { legalName: body.legalName, tradingName: body.tradingName, abn: body.abn, slug: slugFor(body.legalName) },
				});
				await this.audit.record(transaction, entry(actor, created.id, null, "provider.create", "Provider", created.id));
				return created;
			});
			return toProvider(row);
		} catch (error) {
			if (isUniqueViolation(error)) throw conflict("A provider with this legal name already exists.");
			throw error;
		}
	}

	async listFacilities(actor: SuperAdminActor, providerId: string): Promise<Response<"listFacilities">> {
		return this.database.run(superAdminScope(providerId), async (transaction) => {
			await findVisibleProvider(transaction, actor, providerId);
			const facilities = await transaction.facility.findMany({ where: { providerId }, orderBy: { name: "asc" } });
			const checklist = await transaction.goLiveChecklistItem.findMany({
				where: { providerId },
				select: { facilityId: true, isComplete: true },
			});
			return facilities.map((facility) => {
				const items = checklist.filter((item) => item.facilityId === facility.id);
				return {
					...toFacility(facility),
					goLiveCompleted: items.filter((item) => item.isComplete).length,
					goLiveTotal: items.length,
				};
			});
		});
	}

	async createFacility(
		actor: SuperAdminActor,
		providerId: string,
		body: Body<"createFacility">,
	): Promise<Response<"createFacility">> {
		return this.database.run(superAdminScope(providerId), async (transaction) => {
			await findVisibleProvider(transaction, actor, providerId);
			await assertFacilityLimit(transaction, providerId);
			const rulePackId = await currentRulePackId(transaction, body.address.state);
			const facility = await transaction.facility.create({
				data: {
					providerId,
					regionId: body.regionId,
					name: body.name,
					addressLine1: body.address.line1,
					addressLine2: body.address.line2,
					suburb: body.address.suburb,
					state: body.address.state,
					postcode: body.address.postcode,
					isStateGovernmentOperated: body.isStateGovernmentOperated,
					operationalBeds: body.operationalBeds,
					rulePackId,
				},
			});
			await createGoLiveChecklist(transaction, providerId, facility.id);
			await this.audit.record(transaction, entry(actor, providerId, facility.id, "facility.create", "Facility", facility.id));
			return {
				facility: toFacility(facility),
				boundRulePackId: rulePackId,
				enabledTemplateNames: await publishedTemplateNames(transaction, body.address.state),
			};
		});
	}

	async listUnits(actor: SuperAdminActor, facilityId: string): Promise<Response<"listUnits">> {
		const providerId = await this.providerOfFacility(actor, facilityId);
		const rows = await this.database.run(superAdminScope(providerId), (transaction) =>
			transaction.unit.findMany({ where: { facilityId }, orderBy: { name: "asc" } }),
		);
		return rows.map(toUnit);
	}

	async createUnit(actor: SuperAdminActor, facilityId: string, body: Body<"createUnit">): Promise<Response<"createUnit">> {
		const providerId = await this.providerOfFacility(actor, facilityId);
		try {
			const row = await this.database.run(superAdminScope(providerId), async (transaction) => {
				const unit = await transaction.unit.create({
					data: { providerId, facilityId, name: body.name, description: body.description },
				});
				await this.audit.record(transaction, entry(actor, providerId, facilityId, "unit.create", "Unit", unit.id));
				return unit;
			});
			return toUnit(row);
		} catch (error) {
			if (isUniqueViolation(error)) throw conflict("This facility already has a unit with that name.");
			throw error;
		}
	}

	/**
	 * 邀请首个 Owner：建员工账号（Invited）+ Owner 角色（整个 Provider）+ 一次性邀请。
	 * 第一阶段没有邮件服务（需先做子处理方评估），所以不发邮件，isSimulated = true；
	 * 本地开发打开 DEV_RETURN_INVITE_LINKS 时在响应里额外返回 inviteUrl。
	 */
	async inviteOwner(
		actor: SuperAdminActor,
		providerId: string,
		body: Body<"inviteOwner">,
	): Promise<Response<"inviteOwner"> & { inviteUrl?: string }> {
		const secret = randomBytes(32).toString("base64url");
		const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
		try {
			const staffId = await this.database.run(superAdminScope(providerId), async (transaction) => {
				const provider = await findVisibleProvider(transaction, actor, providerId);
				if (provider.status === "Terminated" || provider.status === "Cancelled") {
					throw new ApiError("TenantStateDisallows", "This provider is closed. Owners can't be invited.");
				}
				return this.createOwnerInvitation(transaction, actor, providerId, body, secret, expiresAt);
			});
			const inviteUrl = `${this.config.portalInviteBaseUrl}?token=${providerId}.${secret}`;
			const result = { staffId, expiresAt: expiresAt.toISOString(), isSimulated: true };
			return this.config.shouldReturnInviteLinks ? { ...result, inviteUrl } : result;
		} catch (error) {
			if (isUniqueViolation(error)) throw conflict("Someone with this email already has an account at this provider.");
			throw error;
		}
	}

	private async createOwnerInvitation(
		transaction: DbTransaction,
		actor: SuperAdminActor,
		providerId: string,
		body: Body<"inviteOwner">,
		secret: string,
		expiresAt: Date,
	): Promise<string> {
		const staff = await transaction.staffMember.create({
			data: { providerId, fullName: body.fullName, loginEmail: body.email.toLowerCase(), nurseAppRole: "OtherStaff" },
		});
		await transaction.portalRoleAssignment.create({
			data: { providerId, staffId: staff.id, role: "Owner", grantedBy: actor.userId },
		});
		await transaction.invitation.create({
			data: { providerId, staffId: staff.id, tokenHash: hashSecret(secret), expiresAt, createdBy: actor.userId },
		});
		await this.audit.record(transaction, entry(actor, providerId, null, "staff.invite_owner", "StaffMember", staff.id));
		return staff.id;
	}

	private async withCounts(provider: Provider): Promise<Response<"getProvider">> {
		const [facilityCount, staffAccountCount] = await this.database.run(superAdminScope(provider.id), (transaction) =>
			Promise.all([
				transaction.facility.count({ where: { providerId: provider.id } }),
				transaction.staffMember.count({ where: { providerId: provider.id, status: { not: "Deactivated" } } }),
			]),
		);
		const residentCount = await this.database.countResidents(provider.id);
		return { ...provider, facilityCount, residentCount, staffAccountCount };
	}

	private async providerOfFacility(actor: SuperAdminActor, facilityId: string): Promise<string> {
		return this.database.run(superAdminScope(null), async (transaction) => {
			const facility = await transaction.facility.findUnique({ where: { id: facilityId }, select: { providerId: true } });
			if (!facility) throw notFound("Facility");
			await findVisibleProvider(transaction, actor, facility.providerId);
			return facility.providerId;
		});
	}
}

/** 真实控制台看不到 Demo 克隆；Demo console 只看到本会话的虚构 Provider（SA PRD §11.1）。 */
export function visibleProviders(actor: SuperAdminActor): Prisma.ProviderWhereInput {
	return actor.isDemo ? { id: actor.demoProviderId ?? "", isDemo: true } : { isDemo: false };
}

export async function findVisibleProvider(
	transaction: DbTransaction,
	actor: SuperAdminActor,
	providerId: string,
): Promise<ProviderRow> {
	const provider = await transaction.provider.findFirst({ where: { id: providerId, ...visibleProviders(actor) } });
	if (!provider) throw notFound("Provider");
	return provider;
}

async function assertFacilityLimit(transaction: DbTransaction, providerId: string): Promise<void> {
	const planRow = await transaction.plan.findUnique({ where: { providerId } });
	const facilityCount = await transaction.facility.count({ where: { providerId } });
	const check = checkPlanLimit(planRow ? toPlan(planRow) : null, "facility", facilityCount);
	if (!check.isAllowed) throw new ApiError("PlanLimitReached", planLimitMessage(check));
}

/** 按州自动绑定当前已发布的规则包（SA PRD §4-H）；该州还没有发布的包时为 null。 */
async function currentRulePackId(transaction: DbTransaction, state: AustralianState): Promise<string | null> {
	const pack = await transaction.stateRulePack.findFirst({
		where: { state, status: "Published" },
		orderBy: { publishedAt: "desc" },
		select: { id: true },
	});
	return pack?.id ?? null;
}

async function publishedTemplateNames(transaction: DbTransaction, state: AustralianState): Promise<string[]> {
	const templates = await transaction.documentTemplateVersion.findMany({
		where: { status: "Published" },
		select: { templateName: true, applicableStates: true },
	});
	const applies = (states: unknown): boolean => states === "All" || (Array.isArray(states) && states.includes(state));
	return [...new Set(templates.filter((template) => applies(template.applicableStates)).map((template) => template.templateName))];
}

/** 每家新 Facility 一份 19 项上线清单；条目和 ★ 门槛来自 shared 的硬底线（唯一来源）。 */
async function createGoLiveChecklist(transaction: DbTransaction, providerId: string, facilityId: string): Promise<void> {
	const goLive = PLATFORM_HARD_FLOOR.FacilityGoLive as FacilityGoLiveConfig;
	await transaction.goLiveChecklistItem.createMany({
		data: goLive.entries.map((goLiveEntry) => ({
			providerId,
			facilityId,
			itemNumber: goLiveEntry.itemNumber,
			isGoLiveGate: goLiveEntry.isGoLiveGate,
			source: goLiveEntry.side === "CareKind" ? ("SuperAdmin" as const) : ("ProviderPortal" as const),
		})),
	});
}

export function entry(
	actor: SuperAdminActor,
	providerId: string | null,
	facilityId: string | null,
	action: string,
	targetType: AuditEntry["targetType"],
	targetId: string,
): AuditEntry {
	return {
		providerId,
		facilityId,
		actorType: "SuperAdminUser",
		actorId: actor.userId,
		action,
		targetType,
		targetId,
		outcome: "Succeeded",
		context: {},
	};
}

export function isUniqueViolation(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function slugFor(legalName: string): string {
	const base = legalName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
	return `${base}-${randomBytes(3).toString("hex")}`;
}

function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}
