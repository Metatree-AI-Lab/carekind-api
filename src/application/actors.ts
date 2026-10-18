import type { SuperAdminPermission, SuperAdminPermissionGroup } from "@carekind/shared/schemas";
import type { PortalAuthorisation, RoleGrant } from "../domain/access-control/portal-scope";
import type { TenantScope } from "./ports";

// 已认证的请求发起人。由全局 guard（src/interfaces/auth.guard.ts）在每个请求里构造，
// 显式传给应用层的每个用例——不用隐式的全局状态，读代码时能一眼看到"谁在操作哪个租户"。

export interface SuperAdminActor {
	audience: "super-admin";
	userId: string;
	sessionId: string;
	groups: SuperAdminPermissionGroup[];
	permissions: ReadonlySet<SuperAdminPermission>;
	/** Demo console 会话：只能看到本会话克隆出来的虚构 Provider。 */
	isDemo: boolean;
	demoProviderId: string | null;
}

export interface PortalActor {
	audience: "portal";
	staffId: string;
	providerId: string;
	sessionId: string;
	grants: RoleGrant[];
	/** 按当前端点要求的角色算出的范围（Facility 集合、是否公司层）。 */
	authorisation: PortalAuthorisation;
	isDemo: boolean;
}

export function portalScope(actor: PortalActor): TenantScope {
	return { audience: "PORTAL", providerId: actor.providerId };
}

/** Super Admin 访问某个 Provider 时的事务上下文。 */
export function superAdminScope(providerId: string | null): TenantScope {
	return { audience: "SUPER_ADMIN", providerId };
}
