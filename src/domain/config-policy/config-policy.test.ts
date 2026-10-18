import { describe, expect, it } from "vitest";
import { PLATFORM_DEFAULT_CONFIG } from "@carekind/shared/policy";
import type { EscalationRoutingConfig, ReviewChainConfig } from "@carekind/shared/schemas";
import {
	activationTime,
	baselineFor,
	findInvalidRecipients,
	findLooserThanBaseline,
	pickEffectiveVersion,
	requiresSecondApproval,
} from "./config-proposal";
import { DEFAULT_SHIFT_START_TIMES, nextShiftStart } from "./shift-boundaries";

// 虚构场景（Provider Portal PRD §12 场景 6）。
const platformReviewChain = PLATFORM_DEFAULT_CONFIG.ReviewChain as ReviewChainConfig;
const platformRouting = PLATFORM_DEFAULT_CONFIG.EscalationRouting as EscalationRoutingConfig;
const tomBeckerId = "7a000000-0000-4000-8000-000000000011";

describe("only stricter (\"只能调严\")", () => {
	it("rejects setting falls to Tier 2 at a facility", () => {
		const candidate: ReviewChainConfig = {
			...platformReviewChain,
			categoryTiers: { ...platformReviewChain.categoryTiers, Fall: 2 },
		};
		const baseline = baselineFor("Facility", "ReviewChain", platformReviewChain, null);
		expect(findLooserThanBaseline(candidate, baseline).map((issue) => issue.field)).toEqual(["categoryTiers.Fall"]);
	});

	it("rejects a facility turning on 'EN can confirm Tier 2' when the company policy has it off", () => {
		const providerPolicy: ReviewChainConfig = { ...platformReviewChain, canEnConfirmTier2: false };
		const candidate: ReviewChainConfig = { ...providerPolicy, canEnConfirmTier2: true };
		const baseline = baselineFor("Facility", "ReviewChain", platformReviewChain, providerPolicy);
		expect(findLooserThanBaseline(candidate, baseline).map((issue) => issue.field)).toEqual(["canEnConfirmTier2"]);
	});

	it("allows shortening the backup time from 15 to 10 minutes but not lengthening it", () => {
		const baseline = baselineFor("Provider", "EscalationRouting", platformRouting, null);
		expect(findLooserThanBaseline({ ...platformRouting, backupTimeoutMinutes: 10 }, baseline)).toEqual([]);
		expect(findLooserThanBaseline({ ...platformRouting, backupTimeoutMinutes: 20 }, baseline)).toHaveLength(1);
	});

	it("allows raising skin to Tier 3 at the company level", () => {
		const candidate: ReviewChainConfig = {
			...platformReviewChain,
			categoryTiers: { ...platformReviewChain.categoryTiers, Skin: 3 },
		};
		expect(findLooserThanBaseline(candidate, baselineFor("Provider", "ReviewChain", platformReviewChain, null))).toEqual(
			[],
		);
	});

	it("compares a new platform minimum with the hard floor, not the current platform version", () => {
		const candidate: ReviewChainConfig = {
			...platformReviewChain,
			categoryTiers: { ...platformReviewChain.categoryTiers, Fall: 1 },
		};
		const baseline = baselineFor("Platform", "ReviewChain", platformReviewChain, null);
		expect(findLooserThanBaseline(candidate, baseline).map((issue) => issue.field)).toEqual(["categoryTiers.Fall"]);
	});
});

describe("second approval", () => {
	it("requires a second person for clinical items and every platform change", () => {
		expect(requiresSecondApproval("Facility", "ReviewChain")).toBe(true);
		expect(requiresSecondApproval("Provider", "EscalationRouting")).toBe(true);
		expect(requiresSecondApproval("Facility", "LifecycleChecklist")).toBe(false);
		expect(requiresSecondApproval("Platform", "StaffOnboarding")).toBe(true);
	});
});

describe("findInvalidRecipients", () => {
	it("rejects a named backup who is not active staff at the facility", () => {
		const routing: EscalationRoutingConfig = { ...platformRouting, backupRecipient: { type: "Staff", staffId: tomBeckerId } };
		expect(findInvalidRecipients(routing, new Set()).map((issue) => issue.field)).toEqual(["backupRecipient"]);
		expect(findInvalidRecipients(routing, new Set([tomBeckerId]))).toEqual([]);
	});
});

describe("shift boundaries", () => {
	it("moves a change saved mid-PM shift in Melbourne to the 23:00 night shift (AEDT, UTC+11)", () => {
		// 18/10/2026 16:05 Melbourne = 05:05 UTC
		const next = nextShiftStart(new Date("2026-10-18T05:05:00.000Z"), "Australia/Melbourne", DEFAULT_SHIFT_START_TIMES);
		expect(next.toISOString()).toBe("2026-10-18T12:00:00.000Z");
	});

	it("uses Brisbane time (no daylight saving) for Queensland", () => {
		// 18/10/2026 23:30 Brisbane = 13:30 UTC → next shift 19/10 07:00 Brisbane = 18/10 21:00 UTC
		const next = nextShiftStart(new Date("2026-10-18T13:30:00.000Z"), "Australia/Brisbane", DEFAULT_SHIFT_START_TIMES);
		expect(next.toISOString()).toBe("2026-10-18T21:00:00.000Z");
	});

	it("handles the daylight saving start in Sydney (04/10/2026)", () => {
		// 04/10/2026 01:00 AEST (UTC+10) = 03/10 15:00 UTC → next shift 07:00 AEDT (UTC+11) = 03/10 20:00 UTC
		const next = nextShiftStart(new Date("2026-10-03T15:00:00.000Z"), "Australia/Sydney", DEFAULT_SHIFT_START_TIMES);
		expect(next.toISOString()).toBe("2026-10-03T20:00:00.000Z");
	});
});

describe("effective versions", () => {
	const decidedAt = new Date("2026-10-18T05:05:00.000Z");
	const now = new Date("2026-10-18T06:00:00.000Z");

	it("keeps the previous version in force until the next shift starts", () => {
		const versions = [
			{ versionNumber: 3, isApproved: true, effectiveMode: "NextShift" as const, decidedAt },
			{ versionNumber: 2, isApproved: true, effectiveMode: "Immediate" as const, decidedAt: new Date("2026-10-01T00:00:00Z") },
		];
		const effective = pickEffectiveVersion(versions, "Australia/Melbourne", DEFAULT_SHIFT_START_TIMES, now);
		expect(effective?.versionNumber).toBe(2);
		const later = pickEffectiveVersion(versions, "Australia/Melbourne", DEFAULT_SHIFT_START_TIMES, new Date("2026-10-18T12:00:00Z"));
		expect(later?.versionNumber).toBe(3);
	});

	it("never activates a version that is waiting for a second approval", () => {
		expect(
			activationTime({ isApproved: false, effectiveMode: "Immediate", decidedAt }, "Australia/Melbourne", DEFAULT_SHIFT_START_TIMES),
		).toBeNull();
	});

	it("activates an urgent stricter change immediately", () => {
		expect(
			activationTime({ isApproved: true, effectiveMode: "Immediate", decidedAt }, "Australia/Melbourne", DEFAULT_SHIFT_START_TIMES),
		).toEqual(decidedAt);
	});
});
