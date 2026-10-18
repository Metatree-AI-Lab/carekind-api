import type { PortalRole, RoleScope } from "@carekind/shared/schemas";

// Provider Portal 的角色 + 范围（Provider Portal PRD §4.2、§4.3）。
// 一个人的每个管理端角色都带范围：整个 Provider / 某个 Region / 指定 Facility 集合。
// 端点声明"需要哪些角色之一"（shared 契约）；这里算出"这个人凭这些角色能看哪些 Facility"。
// 为什么在后端算：前端只是隐藏按钮，真正的范围检查必须在 API 执行（PRD §4.8 租户隔离）。

export interface RoleGrant {
	role: PortalRole;
	scope: RoleScope;
}

export interface FacilityRef {
	id: string;
	regionId: string | null;
}

export interface PortalAuthorisation {
	/** 凭端点要求的角色可以访问的 Facility。 */
	allowedFacilityIds: ReadonlySet<string>;
	/** 是否有整个 Provider 范围的所需角色（公司层写操作需要它）。 */
	hasProviderWideRole: boolean;
	/** 是否至少有一个所需角色（端点的粗粒度门槛）。 */
	hasAnyRequiredRole: boolean;
}

/** requiredRoles 为空 = 任何管理端角色都可以。 */
export function authorisePortal(
	grants: readonly RoleGrant[],
	requiredRoles: readonly PortalRole[],
	facilities: readonly FacilityRef[],
): PortalAuthorisation {
	const matchingGrants = grants.filter((grant) => requiredRoles.length === 0 || requiredRoles.includes(grant.role));
	const allowedFacilityIds = new Set<string>();
	for (const grant of matchingGrants) {
		for (const facilityId of facilitiesInScope(grant.scope, facilities)) allowedFacilityIds.add(facilityId);
	}
	return {
		allowedFacilityIds,
		hasProviderWideRole: matchingGrants.some((grant) => grant.scope.type === "Provider"),
		hasAnyRequiredRole: matchingGrants.length > 0,
	};
}

function facilitiesInScope(scope: RoleScope, facilities: readonly FacilityRef[]): string[] {
	if (scope.type === "Provider") return facilities.map((facility) => facility.id);
	if (scope.type === "Region") {
		return facilities.filter((facility) => facility.regionId === scope.regionId).map((facility) => facility.id);
	}
	const known = new Set(facilities.map((facility) => facility.id));
	return scope.facilityIds.filter((facilityId) => known.has(facilityId));
}

/** 是否有临床角色（need-to-know：只有临床角色能看住户临床内容，Owner 默认没有）。 */
export function hasClinicalRole(grants: readonly RoleGrant[]): boolean {
	return grants.some((grant) => grant.role === "ClinicalLead" || grant.role === "CareManager");
}
