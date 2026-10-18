import { canDecideApproval } from "@carekind/shared/policy";

// four-eyes（Super Admin PRD §4-C；Provider Portal PRD §4.2 规则 1、§4.6.0）：
// "发起"和"批准"同一操作必须是两个不同的人。核心规则在 @carekind/shared 的 canDecideApproval（唯一来源）；
// 这里只加上 API 侧的一步：批准人本身要有批准资格（Super Admin 的 approvals.decide 权限、
// Portal 的 Clinical Lead 等角色，由调用方按各自的权限模型判断后传入）。
// 单人 break-glass 第一阶段不做（SA §11.9 #2：默认关），所以这里没有例外分支。

export interface PendingDecision {
	requestedBy: string;
	status: string;
}

export interface Approver {
	id: string;
	canApprove: boolean;
}

/** 返回给用户看的拒绝原因；null = 可以由此人批准或拒绝。 */
export function checkFourEyes(decision: PendingDecision, approver: Approver): string | null {
	if (!approver.canApprove) return "You don't have permission to approve this request.";
	const check = canDecideApproval(decision, approver.id);
	return check.isAllowed ? null : check.reason;
}
