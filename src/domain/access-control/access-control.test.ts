import { describe, expect, it } from "vitest";
import { afterFailedLogin, isLockedOut } from "./login-lockout";
import { authorisePortal, type FacilityRef, type RoleGrant } from "./portal-scope";

// 虚构的 Wattle Grove Care Group：两家 VIC 院在 Region "VIC Metro & Regional"，Grevillea House 在 NSW。
const vicRegionId = "7c000000-0000-4000-8000-000000000001";
const wattleGroveId = "7b000000-0000-4000-8000-000000000001";
const banksiaParkId = "7b000000-0000-4000-8000-000000000002";
const grevilleaHouseId = "7b000000-0000-4000-8000-000000000003";
const facilities: FacilityRef[] = [
	{ id: wattleGroveId, regionId: vicRegionId },
	{ id: banksiaParkId, regionId: vicRegionId },
	{ id: grevilleaHouseId, regionId: null },
];

describe("authorisePortal", () => {
	it("gives an Owner every facility but no resident access when the endpoint needs resident roles", () => {
		const owner: RoleGrant[] = [{ role: "Owner", scope: { type: "Provider" } }];
		const residentRoles = authorisePortal(owner, ["FacilityManager", "ClinicalLead", "CareManager"], facilities);
		expect(residentRoles.hasAnyRequiredRole).toBe(false);
		expect(residentRoles.allowedFacilityIds.size).toBe(0);
		const dashboard = authorisePortal(owner, ["Owner"], facilities);
		expect([...dashboard.allowedFacilityIds]).toEqual([wattleGroveId, banksiaParkId, grevilleaHouseId]);
		expect(dashboard.hasProviderWideRole).toBe(true);
	});

	it("limits a Care Manager to their own facility", () => {
		const careManager: RoleGrant[] = [{ role: "CareManager", scope: { type: "Facilities", facilityIds: [wattleGroveId] } }];
		const result = authorisePortal(careManager, [], facilities);
		expect([...result.allowedFacilityIds]).toEqual([wattleGroveId]);
		expect(result.hasProviderWideRole).toBe(false);
	});

	it("expands a regional scope to the facilities in that region only", () => {
		const regionalLead: RoleGrant[] = [{ role: "ClinicalLead", scope: { type: "Region", regionId: vicRegionId } }];
		const result = authorisePortal(regionalLead, ["ClinicalLead"], facilities);
		expect([...result.allowedFacilityIds]).toEqual([wattleGroveId, banksiaParkId]);
	});

	it("ignores facility IDs that do not belong to this provider", () => {
		const foreignFacilityId = "7b000000-0000-4000-8000-000000000099";
		const grant: RoleGrant[] = [{ role: "FacilityManager", scope: { type: "Facilities", facilityIds: [foreignFacilityId] } }];
		expect(authorisePortal(grant, [], facilities).allowedFacilityIds.size).toBe(0);
	});
});

describe("login lockout", () => {
	const now = new Date("2026-10-18T05:00:00.000Z");

	it("locks the account for 15 minutes after the fifth failure", () => {
		let state = { failedLoginCount: 0, lockedUntil: null as Date | null };
		for (let attempt = 0; attempt < 5; attempt++) state = afterFailedLogin(state, now);
		expect(state.lockedUntil?.toISOString()).toBe("2026-10-18T05:15:00.000Z");
		expect(isLockedOut(state, now)).toBe(true);
		expect(isLockedOut(state, new Date("2026-10-18T05:15:00.001Z"))).toBe(false);
	});
});
