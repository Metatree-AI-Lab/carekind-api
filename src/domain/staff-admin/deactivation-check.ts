import type {
	DeactivationBlocker,
	DeactivationCheck,
	EscalationRoutingConfig,
	Recipient,
} from "@carekind/shared/schemas";

// 员工停用前检查（Provider Portal PRD §4.4，HAZ-P-PP-01）：
// 停用一个仍在 Tier 3 升级路由里的人，Tier 3 就可能没人接。所以停用是阻断式的：
// 先列出 ① 未处理的 Tier 2/3 审核项 ② 升级路由 / 备岗位置 ③ 未关闭 FollowUp ④ 未接收交接，
// 全部重新分配或关闭后才能停用。

/** 护士端产生的待办计数。第一阶段没有护士端，由 API 的占位实现返回 0（第二阶段护士端提供）。 */
export interface NurseWorkloadCounts {
	openReviewItems: number;
	openFollowUps: number;
	unacceptedHandovers: number;
}

export interface FacilityRouting {
	facilityId: string;
	facilityName: string;
	/** 该院当前生效的升级与通知路由（流程第 2 项）。 */
	routing: EscalationRoutingConfig;
}

export interface DeactivationInput {
	staffId: string;
	staffDisplayName: string;
	routings: readonly FacilityRouting[];
	/** 按 Facility 的护士端待办计数。 */
	workloadByFacility: ReadonlyMap<string, NurseWorkloadCounts>;
}

/** 生成停用前检查结果。没有任何阻断项才可以停用。 */
export function checkDeactivation(input: DeactivationInput): DeactivationCheck {
	const blockers: DeactivationBlocker[] = [
		...input.routings.flatMap((facilityRouting) => routingBlockers(input, facilityRouting)),
		...[...input.workloadByFacility.entries()].flatMap(([facilityId, counts]) => workloadBlockers(facilityId, counts)),
	];
	return { staffId: input.staffId, canDeactivate: blockers.length === 0, blockers };
}

function routingBlockers(input: DeactivationInput, facilityRouting: FacilityRouting): DeactivationBlocker[] {
	const positions = namedPositions(facilityRouting.routing).filter(([, recipient]) =>
		isStaffRecipient(recipient, input.staffId),
	);
	if (positions.length === 0) return [];
	const positionNames = positions.map(([name]) => name).join(" and ");
	return [
		{
			kind: "EscalationRouteMember",
			facilityId: facilityRouting.facilityId,
			count: positions.length,
			description: `${input.staffDisplayName} is the ${positionNames} at ${facilityRouting.facilityName}.`,
		},
	];
}

function namedPositions(routing: EscalationRoutingConfig): [string, Recipient][] {
	return [
		["primary contact for Tier 3 notes", routing.primaryRecipient],
		["backup contact for Tier 3 notes", routing.backupRecipient],
		["SIRS assessment lead", routing.sirsAssessmentOwner],
	];
}

function isStaffRecipient(recipient: Recipient, staffId: string): boolean {
	return recipient.type === "Staff" && recipient.staffId === staffId;
}

function workloadBlockers(facilityId: string, counts: NurseWorkloadCounts): DeactivationBlocker[] {
	const candidates: DeactivationBlocker[] = [
		{
			kind: "OpenReviewItems",
			facilityId,
			count: counts.openReviewItems,
			description: `${counts.openReviewItems} Tier 2 or Tier 3 notes are waiting for review.`,
		},
		{
			kind: "OpenFollowUps",
			facilityId,
			count: counts.openFollowUps,
			description: `${counts.openFollowUps} follow-ups are still open.`,
		},
		{
			kind: "UnacceptedHandovers",
			facilityId,
			count: counts.unacceptedHandovers,
			description: `${counts.unacceptedHandovers} handovers have not been accepted.`,
		},
	];
	return candidates.filter((blocker) => blocker.count > 0);
}
