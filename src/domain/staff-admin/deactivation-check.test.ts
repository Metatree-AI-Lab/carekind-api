import { describe, expect, it } from "vitest";
import type { EscalationRoutingConfig } from "@carekind/shared/schemas";
import { checkDeactivation, type NurseWorkloadCounts } from "./deactivation-check";

// 虚构场景（Provider Portal PRD §12 场景 5）：Tom Becker RN（虚构）是 Banksia Park 的 Tier 3 备岗人。
const tomBeckerId = "7a000000-0000-4000-8000-000000000011";
const banksiaParkId = "7b000000-0000-4000-8000-000000000002";
const wattleGroveId = "7b000000-0000-4000-8000-000000000001";

const roleOnlyRouting: EscalationRoutingConfig = {
	item: "EscalationRouting",
	primaryRecipient: { type: "Role", role: "RnInCharge" },
	backupRecipient: { type: "Role", role: "CareManager" },
	backupTimeoutMinutes: 15,
	sirsAssessmentOwner: { type: "Role", role: "CareManager" },
};

const noWorkload: NurseWorkloadCounts = { openReviewItems: 0, openFollowUps: 0, unacceptedHandovers: 0 };

describe("checkDeactivation", () => {
	it("allows deactivation when the person holds no routing position and has no open items", () => {
		const check = checkDeactivation({
			staffId: tomBeckerId,
			staffDisplayName: "Tom Becker",
			routings: [{ facilityId: banksiaParkId, facilityName: "Banksia Park", routing: roleOnlyRouting }],
			workloadByFacility: new Map([[banksiaParkId, noWorkload]]),
		});
		expect(check).toEqual({ staffId: tomBeckerId, canDeactivate: true, blockers: [] });
	});

	it("blocks deactivation while the person is the Tier 3 backup contact", () => {
		const check = checkDeactivation({
			staffId: tomBeckerId,
			staffDisplayName: "Tom Becker",
			routings: [
				{
					facilityId: banksiaParkId,
					facilityName: "Banksia Park",
					routing: { ...roleOnlyRouting, backupRecipient: { type: "Staff", staffId: tomBeckerId } },
				},
				{ facilityId: wattleGroveId, facilityName: "Wattle Grove Residential Care", routing: roleOnlyRouting },
			],
			workloadByFacility: new Map(),
		});
		expect(check.canDeactivate).toBe(false);
		expect(check.blockers).toEqual([
			{
				kind: "EscalationRouteMember",
				facilityId: banksiaParkId,
				count: 1,
				description: "Tom Becker is the backup contact for Tier 3 notes at Banksia Park.",
			},
		]);
	});

	it("counts every routing position the person holds at one facility", () => {
		const check = checkDeactivation({
			staffId: tomBeckerId,
			staffDisplayName: "Tom Becker",
			routings: [
				{
					facilityId: banksiaParkId,
					facilityName: "Banksia Park",
					routing: {
						...roleOnlyRouting,
						backupRecipient: { type: "Staff", staffId: tomBeckerId },
						sirsAssessmentOwner: { type: "Staff", staffId: tomBeckerId },
					},
				},
			],
			workloadByFacility: new Map(),
		});
		expect(check.blockers[0]?.count).toBe(2);
	});

	it("blocks deactivation while nurse-side items are still open", () => {
		const check = checkDeactivation({
			staffId: tomBeckerId,
			staffDisplayName: "Tom Becker",
			routings: [],
			workloadByFacility: new Map([[banksiaParkId, { openReviewItems: 0, openFollowUps: 2, unacceptedHandovers: 1 }]]),
		});
		expect(check.canDeactivate).toBe(false);
		expect(check.blockers.map((blocker) => blocker.kind)).toEqual(["OpenFollowUps", "UnacceptedHandovers"]);
	});
});
