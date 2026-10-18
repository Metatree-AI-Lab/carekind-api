import type { ApiErrorCode } from "@carekind/shared/schemas";

// 应用层错误：只带对外可见的错误代码（shared ApiErrorCode）和澳式英语说明。
// HTTP 状态码映射在 src/interfaces/api-error.filter.ts；这里不依赖 HTTP 框架。
// 对外说明不能包含内部细节、住户姓名或健康信息（rules/02 §5）。

export interface FieldIssue {
	path: string;
	issue: string;
}

/** 被拒绝的操作需要写一条 outcome = Rejected 的审计（例如"只能调严"被拒）。 */
export interface RejectionAudit {
	providerId: string | null;
	facilityId: string | null;
	action: string;
	targetType: string;
	targetId: string;
	context: Record<string, string | number | boolean | null>;
}

export class ApiError extends Error {
	constructor(
		readonly code: ApiErrorCode,
		message: string,
		readonly fieldIssues: FieldIssue[] = [],
		readonly rejectionAudit: RejectionAudit | null = null,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export function notFound(what: string): ApiError {
	return new ApiError("NotFound", `${what} was not found.`);
}

export function forbidden(message: string = "You don't have access to this."): ApiError {
	return new ApiError("Forbidden", message);
}

export function unauthenticated(): ApiError {
	return new ApiError("Unauthenticated", "Please sign in again.");
}

export function conflict(message: string): ApiError {
	return new ApiError("Conflict", message);
}

export function validationFailed(message: string, fieldIssues: FieldIssue[] = []): ApiError {
	return new ApiError("ValidationFailed", message, fieldIssues);
}

export function tenantStateDisallows(): ApiError {
	return new ApiError(
		"TenantStateDisallows",
		"Your organisation's careKind access is paused. You can still view information, but changes are not allowed.",
	);
}
