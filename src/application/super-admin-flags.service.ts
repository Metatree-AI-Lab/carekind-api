import { Inject, Injectable } from "@nestjs/common";
import { superAdminPlatformEndpoints as platform } from "@carekind/shared/contracts";
import { FeatureFlagOverrideSchema, ReasonTextSchema, type FeatureFlag, type FeatureFlagOverride } from "@carekind/shared/schemas";
import { z } from "zod";
import { superAdminScope, type SuperAdminActor } from "./actors";
import { AuditService } from "./audit.service";
import { ApiError, notFound } from "./errors";
import { toApprovalRequest, toFeatureFlag } from "./mappers";
import { TenantDatabase, type DbTransaction } from "./ports";
import { entry } from "./super-admin-providers.service";

// 功能开关（Super Admin PRD §4-K）：默认关；每次切换写审计（谁、何时、原因、范围）。
//   - 风险开关（例如 whole_shift_capture）在登记律师书面意见之前不能打开；
//   - 全局打开需要 four-eyes（生成审批，批准后才生效）；
//   - 关闭开关不删除任何数据。

type SetOverrideResponse = z.input<(typeof platform)["setFeatureFlagOverride"]["response"]>;

/** 全局打开开关的审批 payload：批准后按它执行。 */
export const FlagApprovalPayloadSchema = z.object({
	flagKey: z.string().min(1).max(64),
	override: FeatureFlagOverrideSchema,
	reason: ReasonTextSchema,
});
export type FlagApprovalPayload = z.infer<typeof FlagApprovalPayloadSchema>;

@Injectable()
export class SuperAdminFlagsService {
	constructor(
		@Inject(TenantDatabase) private readonly database: TenantDatabase,
		@Inject(AuditService) private readonly audit: AuditService,
	) {}

	async list(): Promise<FeatureFlag[]> {
		const rows = await this.database.run(superAdminScope(null), (transaction) =>
			transaction.featureFlag.findMany({ include: { overrides: true }, orderBy: { key: "asc" } }),
		);
		return rows.map(toFeatureFlag);
	}

	async setOverride(
		actor: SuperAdminActor,
		flagKey: string,
		override: FeatureFlagOverride,
		reason: string,
	): Promise<SetOverrideResponse> {
		const providerId = "providerId" in override ? override.providerId : null;
		return this.database.run(superAdminScope(providerId), async (transaction) => {
			const flag = await transaction.featureFlag.findUnique({ where: { key: flagKey } });
			if (!flag) throw notFound("Feature flag");
			if (flag.category === "Risk" && override.isEnabled && flag.legalOpinionRef === null) {
				throw new ApiError("Forbidden", "This flag needs a written legal opinion on file before it can be turned on.");
			}
			if (override.scope === "Global" && override.isEnabled) {
				const approval = await transaction.approvalRequest.create({
					data: {
						kind: "FeatureFlagGlobalEnable",
						targetType: "FeatureFlag",
						targetId: flagKey,
						payload: { flagKey, override, reason },
						summary: `Turn on ${flagKey} for everyone`,
						reason,
						requestedBy: actor.userId,
					},
				});
				await this.audit.record(transaction, entry(actor, null, null, "flag.global_enable_request", "ApprovalRequest", approval.id));
				return { flag: await loadFlag(transaction, flagKey), approval: toApprovalRequest(approval) };
			}
			await applyFlagOverride(transaction, this.audit, actor, { flagKey, override, reason });
			return { flag: await loadFlag(transaction, flagKey), approval: null };
		});
	}
}

/** 写入（或更新）一条开关覆盖并记审计。也被审批服务在全局打开获批后调用。 */
export async function applyFlagOverride(
	transaction: DbTransaction,
	audit: AuditService,
	actor: SuperAdminActor,
	payload: FlagApprovalPayload,
): Promise<void> {
	const { override } = payload;
	const location = {
		flagKey: payload.flagKey,
		scope: override.scope,
		state: override.scope === "State" ? override.state : null,
		providerId: "providerId" in override ? override.providerId : null,
		facilityId: override.scope === "Facility" ? override.facilityId : null,
	};
	const existing = await transaction.featureFlagOverride.findFirst({ where: location, select: { id: true } });
	const change = { isEnabled: override.isEnabled, reason: payload.reason, changedBy: actor.userId, changedAt: new Date() };
	if (existing) await transaction.featureFlagOverride.update({ where: { id: existing.id }, data: change });
	else await transaction.featureFlagOverride.create({ data: { ...location, ...change } });
	await transaction.featureFlag.update({ where: { key: payload.flagKey }, data: { updatedBy: actor.userId } });
	await audit.record(transaction, {
		...entry(actor, location.providerId, null, "flag.set_override", "FeatureFlag", payload.flagKey),
		context: { scope: override.scope, isEnabled: override.isEnabled },
	});
}

async function loadFlag(transaction: DbTransaction, flagKey: string): Promise<FeatureFlag> {
	const row = await transaction.featureFlag.findUniqueOrThrow({ where: { key: flagKey }, include: { overrides: true } });
	return toFeatureFlag(row);
}
