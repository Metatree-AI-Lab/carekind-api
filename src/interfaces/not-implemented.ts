import { authEndpoints, endpoints, type EndpointContract } from "@carekind/shared/contracts";
import type { ApiErrorBody } from "@carekind/shared/schemas";
import type { FastifyInstance } from "fastify";
import { IMPLEMENTED_SUPER_ADMIN_PATHS } from "./super-admin.controller";

// Lightman 18/10/2026：第一阶段只完成 Super Admin。shared 契约里其余端点（Portal 全部、Super Admin 的
// 规则包、模板、平台下限、支持访问、指标、内部用户、Demo、Portal / Demo 登录等）注册为 501，
// 让前端拿到明确的"还没做"，而不是 404 或静默成功。完整清单见 README"第一阶段后续"。

const IMPLEMENTED_AUTH_PATHS: ReadonlySet<string> = new Set(
	[authEndpoints.superAdminLogin, authEndpoints.superAdminRefresh, authEndpoints.superAdminLogout, authEndpoints.superAdminMe].map(
		(contract) => key(contract),
	),
);

function key(contract: EndpointContract): string {
	return `${contract.method} ${contract.path}`;
}

/** 列出还没实现的契约端点。 */
export function notImplementedEndpoints(): EndpointContract[] {
	const all: EndpointContract[] = [
		...Object.values(endpoints.auth),
		...Object.values(endpoints.superAdmin),
		...Object.values(endpoints.portal),
	];
	return all.filter((contract) => !IMPLEMENTED_AUTH_PATHS.has(key(contract)) && !IMPLEMENTED_SUPER_ADMIN_PATHS.has(key(contract)));
}

export function registerNotImplementedRoutes(fastify: FastifyInstance): void {
	const body: ApiErrorBody = {
		code: "Internal",
		message: "This part of careKind isn't available yet. It's planned for a later part of phase 1.",
	};
	for (const contract of notImplementedEndpoints()) {
		fastify.route({ method: contract.method, url: contract.path, handler: async (_request, reply) => reply.status(501).send(body) });
	}
}
