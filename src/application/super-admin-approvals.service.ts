import { Inject, Injectable } from "@nestjs/common";
import { superAdminPlatformEndpoints as platform, superAdminTenancyEndpoints as tenancy } from "@carekind/shared/contracts";
import { ProviderStatusSchema, type ApprovalKind, type ApprovalRequest, type ProviderStatus } from "@carekind/shared/schemas";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { planLifecycleTransition, type LifecycleFacts, type LifecycleTarget } from "../domain/tenancy/provider-lifecycle";
import { checkFourEyes } from "../domain/approvals/four-eyes";
import { superAdminScope, type SuperAdminActor } from "./actors";
import { AuditService } from "./audit.service";
import { ApiError, notFound } from "./errors";
import { cursorArgs, toApprovalRequest, toPage } from "./mappers";
import { NurseWorkloadReader, TenantDatabase, type DbTransaction } from "./ports";
import { entry, findVisibleProvider, visibleProviders } from "./super-admin-providers.service";
import { applyFlagOverride, FlagApprovalPayloadSchema } from "./super-admin-flags.service";

// Provider 生命周期变更与 four-eyes 审批（Super Admin PRD §4-C、§4-D）。
// 生命周期申请先生成 ApprovalRequest；需要第二人批准的转换等另一位有 approvals.decide 的人批准后才执行，
// 批准时用最新事实重新检查一遍（申请和批准之间清单或合同状态可能变了）。

type LifecycleBody = z.output<(typeof tenancy)["requestProviderLifecycleChange"]["body"]>;
type ApprovalQuery = z.output<(typeof platform)["listApprovals"]["query"]>;

const LifecyclePayloadSchema = z.object({ toStatus: ProviderStatusSchema.exclude(["Draft"]) });

const BLOCKER_MESSAGES: Readonly<Record<string, string>> = {
	TransitionNotAllowed: "This status change isn't allowed from the provider's current status.",
	PilotAgreementNotSigned: "The Pilot Agreement must be signed.",
	DpaNotSigned: "The DPA must be signed.",
	InsuranceNotCurrent: "A current insurance certificate is required.",
	NoFacilityReadyForGoLive: "At least one facility must complete every required go-live item.",
	DataReturnNotConfirmed: "The provider must confirm it has received its data.",
	UnexportedConfirmedRecords: "Some confirmed records have not been exported to the provider's system.",
};

@Injectable()
export class SuperAdminApprovalsService {
	constructor(
		@Inject(TenantDatabase) private readonly database: TenantDatabase,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(NurseWorkloadReader) private readonly nurseWorkload: NurseWorkloadReader,
	) {}

	async requestLifecycleChange(actor: SuperAdminActor, providerId: string, body: LifecycleBody): Promise<ApprovalRequest> {
		return this.database.run(superAdminScope(providerId), async (transaction) => {
			const provider = await findVisibleProvider(transaction, actor, providerId);
			const plan = await this.planTransition(transaction, provider.id, provider.status, body.toStatus);
			const kind = approvalKindFor(provider.status, body.toStatus);
			const summary = `${provider.legalName}: ${provider.status} → ${body.toStatus}`;
			const approval = await transaction.approvalRequest.create({
				data: {
					providerId,
					kind,
					targetType: "Provider",
					targetId: providerId,
					payload: { toStatus: body.toStatus },
					summary,
					reason: body.reason,
					requestedBy: actor.userId,
					status: plan.requiresFourEyes ? "Pending" : "Approved",
					decisionNote: plan.requiresFourEyes ? null : "No second approval is required for this change.",
					decidedAt: plan.requiresFourEyes ? null : new Date(),
				},
			});
			if (!plan.requiresFourEyes) await this.applyLifecycle(transaction, actor, providerId, body.toStatus, body.reason);
			await this.audit.record(transaction, entry(actor, providerId, null, "provider.lifecycle_request", "ApprovalRequest", approval.id));
			return toApprovalRequest(approval);
		});
	}

	async list(actor: SuperAdminActor, query: ApprovalQuery): Promise<z.input<(typeof platform)["listApprovals"]["response"]>> {
		const rows = await this.database.run(superAdminScope(null), async (transaction) => {
			const providerIds = (await transaction.provider.findMany({ where: visibleProviders(actor), select: { id: true } })).map(
				(provider) => provider.id,
			);
			// 平台层审批（providerId 为空，例如全局功能开关）只在真实控制台显示，Demo console 看不到。
			const scopes: Prisma.ApprovalRequestWhereInput[] = [{ providerId: { in: providerIds } }];
			if (!actor.isDemo) scopes.push({ providerId: null });
			return transaction.approvalRequest.findMany({
				where: { status: query.status, OR: scopes },
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				...cursorArgs(query.cursor, query.limit),
			});
		});
		return toPage(rows, query.limit, toApprovalRequest);
	}

	async decide(actor: SuperAdminActor, approvalId: string, isApproved: boolean, note: string | null): Promise<ApprovalRequest> {
		const providerId = await this.database.run(superAdminScope(null), async (transaction) => {
			const found = await transaction.approvalRequest.findUnique({ where: { id: approvalId }, select: { providerId: true } });
			if (!found) throw notFound("Approval request");
			return found.providerId;
		});
		return this.database.run(superAdminScope(providerId), async (transaction) => {
			const approval = await transaction.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
			if (approval.providerId) await findVisibleProvider(transaction, actor, approval.providerId);
			const refusal = checkFourEyes(approval, { id: actor.userId, canApprove: actor.permissions.has("approvals.decide") });
			if (refusal) throw new ApiError("FourEyesRequired", refusal);
			if (isApproved) await this.applyApproved(transaction, actor, approval);
			const decided = await transaction.approvalRequest.update({
				where: { id: approvalId },
				data: { status: isApproved ? "Approved" : "Rejected", decidedBy: actor.userId, decidedAt: new Date(), decisionNote: note },
			});
			const action = isApproved ? "approval.approve" : "approval.reject";
			await this.audit.record(transaction, entry(actor, approval.providerId, null, action, "ApprovalRequest", approval.id));
			return toApprovalRequest(decided);
		});
	}

	private async applyApproved(
		transaction: DbTransaction,
		actor: SuperAdminActor,
		approval: { kind: ApprovalKind; providerId: string | null; payload: Prisma.JsonValue; reason: string },
	): Promise<void> {
		if (approval.kind === "FeatureFlagGlobalEnable") {
			await applyFlagOverride(transaction, this.audit, actor, FlagApprovalPayloadSchema.parse(approval.payload));
			return;
		}
		if (!approval.providerId || !isLifecycleKind(approval.kind)) {
			throw new ApiError("Conflict", "This kind of approval can't be applied in phase 1 yet.");
		}
		const { toStatus } = LifecyclePayloadSchema.parse(approval.payload);
		const provider = await transaction.provider.findUniqueOrThrow({ where: { id: approval.providerId } });
		await this.planTransition(transaction, provider.id, provider.status, toStatus);
		await this.applyLifecycle(transaction, actor, provider.id, toStatus, approval.reason);
	}

	/** 收集事实并检查；有阻断项时拒绝并逐条列出原因。 */
	private async planTransition(transaction: DbTransaction, providerId: string, current: ProviderStatus, target: LifecycleTarget) {
		const facts = await this.collectFacts(transaction, providerId);
		const plan = planLifecycleTransition(current, target, facts);
		if (!plan.isAllowed) {
			const fieldIssues = plan.blockers.map((blocker) => ({ path: "toStatus", issue: BLOCKER_MESSAGES[blocker] ?? blocker }));
			throw new ApiError("BlockedByOpenItems", "This status change is blocked. See the listed items.", fieldIssues);
		}
		return plan;
	}

	private async applyLifecycle(
		transaction: DbTransaction,
		actor: SuperAdminActor,
		providerId: string,
		toStatus: LifecycleTarget,
		reason: string,
	): Promise<void> {
		await transaction.provider.update({
			where: { id: providerId },
			data: { status: toStatus, suspensionReason: toStatus === "Suspended" ? reason : null },
		});
		await this.audit.record(transaction, {
			...entry(actor, providerId, null, "provider.status_change", "Provider", providerId),
			context: { toStatus },
		});
	}

	private async collectFacts(transaction: DbTransaction, providerId: string): Promise<LifecycleFacts> {
		const today = new Date();
		const compliance = await transaction.complianceStatus.findMany({ where: { providerId } });
		const isSigned = (type: string): boolean => compliance.some((item) => item.documentType === type && item.status === "Signed");
		const hasCurrentInsurance = compliance.some(
			(item) =>
				item.documentType.startsWith("Insurance") &&
				item.status === "Signed" &&
				(item.expiresOn === null || item.expiresOn.getTime() > today.getTime()),
		);
		const incompleteGateFacilities = await transaction.goLiveChecklistItem.findMany({
			where: { providerId, isGoLiveGate: true, isComplete: false },
			select: { facilityId: true },
		});
		const facilities = await transaction.facility.findMany({ where: { providerId }, select: { id: true } });
		const blockedIds = new Set(incompleteGateFacilities.map((item) => item.facilityId));
		const provider = await transaction.provider.findUniqueOrThrow({ where: { id: providerId } });
		return {
			isPilotAgreementSigned: isSigned("PilotAgreement"),
			isDpaSigned: isSigned("Dpa"),
			hasCurrentInsurance,
			hasFacilityReadyForGoLive: facilities.some((facility) => !blockedIds.has(facility.id)),
			isDataReturnConfirmed: provider.dataReturnConfirmedAt !== null,
			unexportedConfirmedRecordCount: await this.nurseWorkload.unexportedConfirmedRecords(transaction, providerId),
		};
	}
}

const LIFECYCLE_KINDS: readonly ApprovalKind[] = ["ProviderActivate", "ProviderSuspend", "ProviderResume", "ProviderTerminate"];

function isLifecycleKind(kind: ApprovalKind): boolean {
	return LIFECYCLE_KINDS.includes(kind);
}

/**
 * shared 的审批类型只有激活 / 暂停 / 恢复 / 终止四种；转 Onboarding 归为激活流程，
 * 转 Cancelled、Terminating、Terminated 归为终止流程（payload 里记录确切的目标状态）。
 */
function approvalKindFor(current: ProviderStatus, target: LifecycleTarget): ApprovalKind {
	if (target === "Suspended") return "ProviderSuspend";
	if (target === "Active" && current === "Suspended") return "ProviderResume";
	if (target === "Active" || target === "Onboarding") return "ProviderActivate";
	return "ProviderTerminate";
}
