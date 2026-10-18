import { isApprovedDurationAllowed, supportScopeIncludesHealthInformation } from "@carekind/shared/policy";
import {
	DEFAULT_SUPPORT_ACCESS_MINUTES,
	MAX_SUPPORT_ACCESS_MINUTES,
	type SupportAccessScope,
	type SupportAccessStatus,
} from "@carekind/shared/schemas";

// careKind 支持访问（Super Admin PRD §4-M、Provider Portal PRD §4.8）：
// 工单 + 机构批准 + 限范围 + 限时（≤ 4 小时，默认 2 小时）+ 可撤销 + 全程审计。
// 上限、默认值、"是否含健康信息"、"审批只能缩短" 来自 @carekind/shared（唯一来源）；
// 这里补充 API 侧的状态判断（开始、撤销、到期）。

export const MIN_SUPPORT_ACCESS_MINUTES: number = 15;

export type SupportAccessViolation =
	| "DurationTooLong"
	| "DurationTooShort"
	| "ContentAccessAlwaysDenied"
	| "ApprovedDurationLonger"
	| "InvalidStatusForAction"
	| "OnlyRequesterCanStart"
	| "Expired";

/** 只有元数据级不含健康信息（shared 规则）。 */
export function includesHealthInformation(scope: SupportAccessScope): boolean {
	return supportScopeIncludesHealthInformation(scope);
}

/** 申请时长：没填用默认 2 小时；超过 4 小时或少于 15 分钟拒绝（不静默截断，避免申请人以为拿到了更长时间）。 */
export function resolveRequestedMinutes(requested: number | undefined): number | SupportAccessViolation {
	const minutes = requested ?? DEFAULT_SUPPORT_ACCESS_MINUTES;
	if (minutes > MAX_SUPPORT_ACCESS_MINUTES) return "DurationTooLong";
	if (minutes < MIN_SUPPORT_ACCESS_MINUTES) return "DurationTooShort";
	return minutes;
}

/** 机构设置了"始终拒绝内容级访问"时，内容级申请直接不能发起（PRD §4-M：更严的机构设置）。 */
export function checkScopeAllowed(scope: SupportAccessScope, isContentAccessAlwaysDenied: boolean): SupportAccessViolation | null {
	if (isContentAccessAlwaysDenied && includesHealthInformation(scope)) return "ContentAccessAlwaysDenied";
	return null;
}

/** 审批人可以缩短时长，不能延长（PRD §4-M 第 3 步："或缩短时长"）。 */
export function resolveApprovedMinutes(requestedMinutes: number, approvedMinutes: number | undefined): number | SupportAccessViolation {
	const minutes = approvedMinutes ?? requestedMinutes;
	if (minutes < MIN_SUPPORT_ACCESS_MINUTES) return "DurationTooShort";
	return isApprovedDurationAllowed(requestedMinutes, minutes) ? minutes : "ApprovedDurationLonger";
}

export interface SupportAccessState {
	status: SupportAccessStatus;
	expiresAt: Date | null;
}

/**
 * 到期判断在读取时做：数据库里仍是 Active，但已过 expiresAt 的一律视为 Expired。
 * 为什么不靠定时任务：定时任务延迟或失败时，过期的 grant 不能继续生效（默认安全）。
 */
export function effectiveSupportStatus(state: SupportAccessState, now: Date): SupportAccessStatus {
	if (state.status === "Active" && state.expiresAt !== null && state.expiresAt.getTime() <= now.getTime()) {
		return "Expired";
	}
	return state.status;
}

/** 机构批准 / 拒绝：只能对 Pending 的申请。 */
export function checkCanDecide(state: SupportAccessState, now: Date): SupportAccessViolation | null {
	return effectiveSupportStatus(state, now) === "Pending" ? null : "InvalidStatusForAction";
}

/** 支持人员开始会话：只能是申请人本人，只能对已批准的申请；开始后才计时。 */
export function checkCanStart(
	state: SupportAccessState,
	requestedBy: string,
	actorId: string,
	now: Date,
): SupportAccessViolation | null {
	if (effectiveSupportStatus(state, now) !== "Approved") return "InvalidStatusForAction";
	if (requestedBy !== actorId) return "OnlyRequesterCanStart";
	return null;
}

/** 机构可以随时撤销尚未结束的申请（Pending、Approved、Active）。 */
export function checkCanRevoke(state: SupportAccessState, now: Date): SupportAccessViolation | null {
	const status = effectiveSupportStatus(state, now);
	if (status === "Expired") return "Expired";
	if (status === "Pending" || status === "Approved" || status === "Active") return null;
	return "InvalidStatusForAction";
}

export function computeExpiry(startedAt: Date, approvedMinutes: number): Date {
	return new Date(startedAt.getTime() + approvedMinutes * 60_000);
}
