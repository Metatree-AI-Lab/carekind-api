import { describe, expect, it } from "vitest";
import { requiredStepIds, statusAfterOnboardingProgress } from "./staff-onboarding";

describe("requiredStepIds", () => {
	it("always includes the three mandatory steps for RN and EN", () => {
		expect(requiredStepIds([], "RN")).toEqual(["recording-ai-notice", "carekind-training", "registration-attestation"]);
	});

	it("drops registration attestation for PCW and other staff", () => {
		expect(requiredStepIds(["policy-reading"], "PCW")).toEqual([
			"recording-ai-notice",
			"carekind-training",
			"policy-reading",
		]);
	});
});

describe("statusAfterOnboardingProgress", () => {
	const required = ["recording-ai-notice", "carekind-training"];

	it("stays in Onboarding until every required step is complete", () => {
		expect(statusAfterOnboardingProgress("Invited", required, new Set(["recording-ai-notice"]))).toBe("Onboarding");
	});

	it("becomes Active once every required step is complete", () => {
		expect(statusAfterOnboardingProgress("Onboarding", required, new Set(required))).toBe("Active");
	});

	it("never reactivates a deactivated person", () => {
		expect(statusAfterOnboardingProgress("Deactivated", required, new Set(required))).toBe("Deactivated");
	});
});
