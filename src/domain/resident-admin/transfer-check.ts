import type { ResidentStatus, TransferBlocker } from "@carekind/shared/schemas";

// 同公司转院（Provider Portal PRD §4.5，HAZ-P-PP-02）：转院后记录跟错住户是"极高"危害。
// 所以发起院还有该住户的 未确认草稿 / 未分配片段 / 未关闭 FollowUp / 未接收交接 时，转院被阻断，
// 必须由发起院处理完，或逐项明确移交给目标院，才能进入"等待目标院接收"。
// 转院永远按住户 ID，不按房间。

/** 发起院针对该住户的护士端待办计数。第一阶段没有护士端，由 API 的占位实现返回 0（第二阶段护士端提供）。 */
export interface ResidentOpenItems {
	unconfirmedDrafts: number;
	unassignedSegments: number;
	openFollowUps: number;
	unacceptedHandovers: number;
}

export type TransferBlockerKind = TransferBlocker["kind"];
export type TransferResolution = Exclude<TransferBlocker["resolution"], "Unresolved">;

export type TransferViolation = "SameFacility" | "ResidentNotInCare" | "NotEnoughIdentityChecks";

/** 可以转院的住户状态：已入住或暂时离开（请假、住院）。 */
const TRANSFERABLE_STATUSES: readonly ResidentStatus[] = ["Admitted", "OnLeave", "InHospital"];

/** 目标院接收时至少核对 3 项识别信息（PRD §4.5："核对 ≥ 3 项识别信息 + 照片"）。 */
export const MIN_IDENTITY_CHECKS: number = 3;

export function checkTransferRequest(
	residentStatus: ResidentStatus,
	fromFacilityId: string,
	toFacilityId: string,
): TransferViolation | null {
	if (fromFacilityId === toFacilityId) return "SameFacility";
	if (!TRANSFERABLE_STATUSES.includes(residentStatus)) return "ResidentNotInCare";
	return null;
}

/**
 * 把待办计数和发起人给出的处理方式合成阻断项列表。
 * 没有给出处理方式的项保持 Unresolved；只要有一项 Unresolved，转院状态就是 Blocked。
 */
export function buildTransferBlockers(
	openItems: ResidentOpenItems,
	resolutions: Partial<Record<TransferBlockerKind, TransferResolution>>,
): TransferBlocker[] {
	const counts: [TransferBlockerKind, number][] = [
		["UnconfirmedDrafts", openItems.unconfirmedDrafts],
		["UnassignedSegments", openItems.unassignedSegments],
		["OpenFollowUps", openItems.openFollowUps],
		["UnacceptedHandovers", openItems.unacceptedHandovers],
	];
	return counts
		.filter(([, count]) => count > 0)
		.map(([kind, count]) => ({ kind, count, resolution: resolutions[kind] ?? "Unresolved" }));
}

export function hasUnresolvedBlockers(blockers: readonly TransferBlocker[]): boolean {
	return blockers.some((blocker) => blocker.resolution === "Unresolved");
}

/** 目标院接收前的识别核对（去重后计数）。 */
export function checkIdentityConfirmation(identityChecks: readonly string[]): TransferViolation | null {
	return new Set(identityChecks).size >= MIN_IDENTITY_CHECKS ? null : "NotEnoughIdentityChecks";
}
