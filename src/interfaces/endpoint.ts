import { applyDecorators, createParamDecorator, RequestMapping, RequestMethod, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { EndpointContract } from "@carekind/shared/contracts";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import type { SuperAdminActor } from "../application/actors";
import { unauthenticated, validationFailed } from "../application/errors";

// 路由直接由 @carekind/shared 的契约生成：路径、方法、权限、请求校验只定义一次（ADR-0006 DRY）。
// 没有 @Endpoint 的路由会被全局 guard 拒绝（默认拒绝，rules/02 §7）。

export const ENDPOINT_METADATA: string = "carekind:endpoint";

const METHODS: Readonly<Record<EndpointContract["method"], RequestMethod>> = {
	GET: RequestMethod.GET,
	POST: RequestMethod.POST,
	PUT: RequestMethod.PUT,
	PATCH: RequestMethod.PATCH,
	DELETE: RequestMethod.DELETE,
};

/** 把契约注册成 Nest 路由，并把契约挂在 handler 上给 guard 和 @Input 使用。 */
export function Endpoint(contract: EndpointContract): MethodDecorator {
	return applyDecorators(
		RequestMapping({ path: contract.path, method: METHODS[contract.method] }),
		SetMetadata(ENDPOINT_METADATA, contract),
	);
}

export interface EndpointInput<Contract extends EndpointContract> {
	params: z.output<Contract["params"]>;
	query: z.output<Contract["query"]>;
	body: z.output<Contract["body"]>;
}

export type EndpointOutput<Contract extends EndpointContract> = z.input<Contract["response"]>;

/** 系统边界：用契约里的 zod schema 校验路径参数、查询参数和请求体。校验失败只返回字段路径和问题代码，不回显输入。 */
export const Input = createParamDecorator((_unused: unknown, context: ExecutionContext): unknown => {
	const contract: EndpointContract | undefined = Reflect.getMetadata(ENDPOINT_METADATA, context.getHandler());
	if (!contract) throw new Error("@Input() used on a route without @Endpoint().");
	const request = context.switchToHttp().getRequest<FastifyRequest>();
	return {
		params: parsePart(contract.params, request.params ?? {}, "params"),
		query: parsePart(contract.query, request.query ?? {}, "query"),
		body: parsePart(contract.body, request.body ?? {}, "body"),
	};
});

function parsePart(schema: z.ZodType, value: unknown, part: string): unknown {
	const result = schema.safeParse(value);
	if (result.success) return result.data;
	const fieldIssues = result.error.issues.map((issue) => ({
		path: [part, ...issue.path.map(String)].join("."),
		issue: issue.code,
	}));
	throw validationFailed("Some fields need attention.", fieldIssues);
}

/** guard 放在请求上的 Super Admin 身份。 */
export interface RequestWithActor extends FastifyRequest {
	superAdminActor?: SuperAdminActor;
}

export const CurrentSuperAdmin = createParamDecorator((_unused: unknown, context: ExecutionContext): SuperAdminActor => {
	const actor = context.switchToHttp().getRequest<RequestWithActor>().superAdminActor;
	if (!actor) throw unauthenticated();
	return actor;
});
