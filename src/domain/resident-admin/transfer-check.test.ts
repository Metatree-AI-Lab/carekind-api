import { describe, expect, it } from "vitest";
import {
	buildTransferBlockers,
	checkIdentityConfirmation,
	checkTransferRequest,
	hasUnresolvedBlockers,
	type ResidentOpenItems,
} from "./transfer-check";

// 虚构场景（Provider Portal PRD §12 场景 4）：Mrs Dorothy Fraser（虚构）从 Banksia Park（VIC）转到
// Grevillea House（NSW），发起时有 1 条未确认的 Tier 2 草稿。
const banksiaParkId = "7b000000-0000-4000-8000-000000000002";
const grevilleaHouseId = "7b000000-0000-4000-8000-000000000003";

const oneUnconfirmedDraft: ResidentOpenItems = {
	unconfirmedDrafts: 1,
	unassignedSegments: 0,
	openFollowUps: 0,
	unacceptedHandovers: 0,
};

describe("checkTransferRequest", () => {
	it("rejects a transfer to the same facility", () => {
		expect(checkTransferRequest("Admitted", banksiaParkId, banksiaParkId)).toBe("SameFacility");
	});

	it("rejects residents who have departed", () => {
		expect(checkTransferRequest("Departed", banksiaParkId, grevilleaHouseId)).toBe("ResidentNotInCare");
		expect(checkTransferRequest("PreAdmission", banksiaParkId, grevilleaHouseId)).toBe("ResidentNotInCare");
	});

	it("allows admitted residents, including those on leave or in hospital", () => {
		expect(checkTransferRequest("Admitted", banksiaParkId, grevilleaHouseId)).toBeNull();
		expect(checkTransferRequest("InHospital", banksiaParkId, grevilleaHouseId)).toBeNull();
	});
});

describe("transfer blockers", () => {
	it("blocks the transfer while an unconfirmed draft has not been handled", () => {
		const blockers = buildTransferBlockers(oneUnconfirmedDraft, {});
		expect(blockers).toEqual([{ kind: "UnconfirmedDrafts", count: 1, resolution: "Unresolved" }]);
		expect(hasUnresolvedBlockers(blockers)).toBe(true);
	});

	it("unblocks once the origin facility handled the draft", () => {
		const blockers = buildTransferBlockers(oneUnconfirmedDraft, { UnconfirmedDrafts: "HandledAtOrigin" });
		expect(hasUnresolvedBlockers(blockers)).toBe(false);
	});

	it("has no blockers when the resident has no open items", () => {
		const blockers = buildTransferBlockers(
			{ unconfirmedDrafts: 0, unassignedSegments: 0, openFollowUps: 0, unacceptedHandovers: 0 },
			{},
		);
		expect(blockers).toEqual([]);
	});

	it("requires each open item kind to be resolved separately", () => {
		const blockers = buildTransferBlockers(
			{ unconfirmedDrafts: 1, unassignedSegments: 0, openFollowUps: 2, unacceptedHandovers: 0 },
			{ UnconfirmedDrafts: "HandedToDestination" },
		);
		expect(blockers.map((blocker) => blocker.resolution)).toEqual(["HandedToDestination", "Unresolved"]);
		expect(hasUnresolvedBlockers(blockers)).toBe(true);
	});
});

describe("checkIdentityConfirmation", () => {
	it("needs at least three distinct identity checks", () => {
		expect(checkIdentityConfirmation(["legalName", "dateOfBirth"])).toBe("NotEnoughIdentityChecks");
		expect(checkIdentityConfirmation(["legalName", "legalName", "dateOfBirth"])).toBe("NotEnoughIdentityChecks");
		expect(checkIdentityConfirmation(["legalName", "dateOfBirth", "facilityResidentId"])).toBeNull();
	});
});
