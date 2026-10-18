import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { EndpointContract } from "@carekind/shared/contracts";
import { forbidden } from "../application/errors";
import { SuperAdminAuthService } from "../application/super-admin-auth.service";
import { SUPER_ADMIN_ACCESS_COOKIE } from "./cookies";
import { ENDPOINT_METADATA, type RequestWithActor } from "./endpoint";

// 全局 guard：默认拒绝。只有带 @Endpoint 契约的路由能通过，且按契约的 access 检查登录和权限。
// 第一阶段只实现 Super Admin；portal 端点在 src/interfaces/not-implemented.ts 统一返回 501，不会走到这里。

export const HEALTH_METADATA: string = "carekind:health";

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		@Inject(Reflector) private readonly reflector: Reflector,
		@Inject(SuperAdminAuthService) private readonly superAdminAuth: SuperAdminAuthService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (this.reflector.get<boolean>(HEALTH_METADATA, context.getHandler())) return true;
		const contract = this.reflector.get<EndpointContract | undefined>(ENDPOINT_METADATA, context.getHandler());
		if (!contract) throw forbidden();
		const access = contract.access;
		if (access.isPublic) return true;
		if (access.app !== "super-admin") throw forbidden();
		const request = context.switchToHttp().getRequest<RequestWithActor>();
		const actor = await this.superAdminAuth.authenticate(request.cookies[SUPER_ADMIN_ACCESS_COOKIE]);
		// 空权限列表 = 任何已登录的 Super Admin 用户；否则至少要有其中一个权限。
		const isPermitted =
			access.permissions.length === 0 || access.permissions.some((permission) => actor.permissions.has(permission));
		if (!isPermitted) throw forbidden("Your careKind role doesn't allow this action.");
		request.superAdminActor = actor;
		return true;
	}
}
