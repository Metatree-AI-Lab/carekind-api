import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { ApiErrorBody, ApiErrorCode } from "@carekind/shared/schemas";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../application/errors";

// 所有错误都转成 shared 的 ApiErrorBody。对外不暴露内部细节；日志只记错误名称、代码和请求 ID，
// 不记请求体（可能有姓名）或 token（rules/02 §7）。

const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
	Unauthenticated: 401,
	Forbidden: 403,
	NotFound: 404,
	ValidationFailed: 400,
	Conflict: 409,
	LooserThanBaseline: 422,
	PlanLimitReached: 409,
	FourEyesRequired: 403,
	BlockedByOpenItems: 409,
	TenantStateDisallows: 409,
	RateLimited: 429,
	Internal: 500,
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
	private readonly logger: Logger = new Logger("ApiErrorFilter");

	catch(exception: unknown, host: ArgumentsHost): void {
		const request = host.switchToHttp().getRequest<FastifyRequest>();
		const reply = host.switchToHttp().getResponse<FastifyReply>();
		const { status, body } = this.toResponse(exception);
		if (status >= 500) {
			const name = exception instanceof Error ? exception.name : "UnknownError";
			// 只记录错误类型、Prisma 错误码和出错的字段 / 表名（meta），不记录任何数据值或健康信息
			const code = typeof exception === "object" && exception !== null && "code" in exception ? String(exception.code) : "-";
			const meta =
				typeof exception === "object" && exception !== null && "meta" in exception ? JSON.stringify(exception.meta) : "-";
			this.logger.error(
				`Unhandled ${name} [code ${code}] [meta ${meta}] on ${request.method} ${request.routeOptions.url ?? "unknown route"} (${request.id})`,
			);
		}
		void reply.status(status).send({ ...body, requestId: request.id });
	}

	private toResponse(exception: unknown): { status: number; body: ApiErrorBody } {
		if (exception instanceof ApiError) {
			const body: ApiErrorBody = { code: exception.code, message: exception.message };
			if (exception.fieldIssues.length > 0) body.fieldIssues = exception.fieldIssues;
			return { status: STATUS_BY_CODE[exception.code], body };
		}
		if (exception instanceof HttpException && exception.getStatus() === 404) {
			return { status: 404, body: { code: "NotFound", message: "This page or action doesn't exist." } };
		}
		return { status: 500, body: { code: "Internal", message: "Something went wrong. Please try again." } };
	}
}
