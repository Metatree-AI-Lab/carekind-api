import { canTransitionProvider } from "@carekind/shared/policy";
import type { ProviderStatus } from "@carekind/shared/schemas";

// Provider 生命周期状态机（Super Admin PRD §4-D）。
// 允许哪些转换由 @carekind/shared 的 canTransitionProvider 定义（唯一来源，前端也用它决定显示哪些按钮）；
// 这里补充只有 API 才需要的部分：每个转换的前置检查（阻断项）和是否需要 four-eyes。
// 为什么做成纯函数：这些检查是合同和隐私承诺（暂停不删草稿、终止前不能删机构唯一副本），
// 必须能脱离数据库单独测试；API 只负责收集事实（facts）并执行结果。

export type LifecycleTarget = Exclude<ProviderStatus, "Draft">;

export type LifecycleBlocker =
	| "TransitionNotAllowed"
	| "PilotAgreementNotSigned"
	| "DpaNotSigned"
	| "InsuranceNotCurrent"
	| "NoFacilityReadyForGoLive"
	| "DataReturnNotConfirmed"
	| "UnexportedConfirmedRecords";

/** 申请转换时由 API 从数据库收集的事实。 */
export interface LifecycleFacts {
	isPilotAgreementSigned: boolean;
	isDpaSigned: boolean;
	/** 至少一份保险证书状态为 Signed 且未过期。 */
	hasCurrentInsurance: boolean;
	/** 至少一家 Facility 的 ★ 上线门槛项全部完成。 */
	hasFacilityReadyForGoLive: boolean;
	/** Owner 已在 Provider Portal 确认收到返还数据。 */
	isDataReturnConfirmed: boolean;
	/** 还没有成功导出到机构 CMS 的已确认记录数（第二阶段护士端提供，第一阶段为 0）。 */
	unexportedConfirmedRecordCount: number;
}

export interface LifecyclePlan {
	isAllowed: boolean;
	requiresFourEyes: boolean;
	blockers: LifecycleBlocker[];
}

/**
 * 需要第二人批准的转换。PRD §4-C 列出：转 Active、恢复、终止；
 * 暂停在 PRD 里不强制，但 shared 的审批类型包含 ProviderSuspend，这里按"默认更严"一并要求。
 */
const FOUR_EYES_TARGETS: readonly LifecycleTarget[] = ["Active", "Suspended", "Terminating", "Terminated"];

/** 判断一次生命周期转换是否允许、是否需要 four-eyes、有哪些阻断项。 */
export function planLifecycleTransition(
	current: ProviderStatus,
	target: LifecycleTarget,
	facts: LifecycleFacts,
): LifecyclePlan {
	if (!canTransitionProvider(current, target)) {
		return { isAllowed: false, requiresFourEyes: false, blockers: ["TransitionNotAllowed"] };
	}
	const blockers = collectBlockers(current, target, facts);
	return {
		isAllowed: blockers.length === 0,
		requiresFourEyes: FOUR_EYES_TARGETS.includes(target),
		blockers,
	};
}

function collectBlockers(current: ProviderStatus, target: LifecycleTarget, facts: LifecycleFacts): LifecycleBlocker[] {
	// 恢复（Suspended → Active）不重新检查上线门槛：机构已经上线过，暂停期间清单不会倒退。
	if (target === "Active" && current === "Onboarding") return goLiveBlockers(facts);
	if (target === "Terminated") return terminationBlockers(facts);
	return [];
}

function goLiveBlockers(facts: LifecycleFacts): LifecycleBlocker[] {
	const blockers: LifecycleBlocker[] = [];
	if (!facts.isPilotAgreementSigned) blockers.push("PilotAgreementNotSigned");
	if (!facts.isDpaSigned) blockers.push("DpaNotSigned");
	if (!facts.hasCurrentInsurance) blockers.push("InsuranceNotCurrent");
	if (!facts.hasFacilityReadyForGoLive) blockers.push("NoFacilityReadyForGoLive");
	return blockers;
}

// SA §4-D 终止第 2–3 步：只要还有未导出到机构 CMS 的已确认记录，或机构还没书面确认收到返还数据，
// 就不能进入删除——careKind 不能删除机构的唯一副本（Rules 154-1000 要求 provider 保存 7 年）。
function terminationBlockers(facts: LifecycleFacts): LifecycleBlocker[] {
	const blockers: LifecycleBlocker[] = [];
	if (!facts.isDataReturnConfirmed) blockers.push("DataReturnNotConfirmed");
	if (facts.unexportedConfirmedRecordCount > 0) blockers.push("UnexportedConfirmedRecords");
	return blockers;
}

/** 暂停、终止中的 Provider 只读：不能新建员工、住户、导入或改配置（SA §4-D 表）。 */
export function isProviderWritable(status: ProviderStatus): boolean {
	return status === "Onboarding" || status === "Active";
}
