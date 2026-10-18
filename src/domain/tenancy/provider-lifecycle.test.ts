import { describe, expect, it } from "vitest";
import { isProviderWritable, planLifecycleTransition, type LifecycleFacts } from "./provider-lifecycle";

// 测试数据只用虚构场景（Wattle Grove Care Group）。

const readyFacts: LifecycleFacts = {
	isPilotAgreementSigned: true,
	isDpaSigned: true,
	hasCurrentInsurance: true,
	hasFacilityReadyForGoLive: true,
	isDataReturnConfirmed: false,
	unexportedConfirmedRecordCount: 0,
};

describe("planLifecycleTransition", () => {
	it("allows Draft → Onboarding without a second approver", () => {
		const plan = planLifecycleTransition("Draft", "Onboarding", readyFacts);
		expect(plan).toEqual({ isAllowed: true, requiresFourEyes: false, blockers: [] });
	});

	it("rejects transitions that are not in the state diagram", () => {
		expect(planLifecycleTransition("Draft", "Active", readyFacts).blockers).toEqual(["TransitionNotAllowed"]);
		expect(planLifecycleTransition("Terminated", "Active", readyFacts).isAllowed).toBe(false);
		expect(planLifecycleTransition("Cancelled", "Onboarding", readyFacts).isAllowed).toBe(false);
		expect(planLifecycleTransition("Onboarding", "Suspended", readyFacts).isAllowed).toBe(false);
	});

	it("requires four-eyes and every go-live gate before Onboarding → Active", () => {
		const plan = planLifecycleTransition("Onboarding", "Active", {
			...readyFacts,
			isDpaSigned: false,
			hasCurrentInsurance: false,
			hasFacilityReadyForGoLive: false,
		});
		expect(plan.isAllowed).toBe(false);
		expect(plan.requiresFourEyes).toBe(true);
		expect(plan.blockers).toEqual(["DpaNotSigned", "InsuranceNotCurrent", "NoFacilityReadyForGoLive"]);
	});

	it("allows Onboarding → Active when the gates are met", () => {
		expect(planLifecycleTransition("Onboarding", "Active", readyFacts)).toEqual({
			isAllowed: true,
			requiresFourEyes: true,
			blockers: [],
		});
	});

	it("does not re-check go-live gates when resuming a suspended provider", () => {
		const plan = planLifecycleTransition("Suspended", "Active", { ...readyFacts, isDpaSigned: false });
		expect(plan).toEqual({ isAllowed: true, requiresFourEyes: true, blockers: [] });
	});

	it("blocks deletion while the provider has not confirmed receiving its data", () => {
		const plan = planLifecycleTransition("Terminating", "Terminated", readyFacts);
		expect(plan.blockers).toEqual(["DataReturnNotConfirmed"]);
	});

	it("blocks deletion while confirmed records have not been exported to the provider's CMS", () => {
		const plan = planLifecycleTransition("Terminating", "Terminated", {
			...readyFacts,
			isDataReturnConfirmed: true,
			unexportedConfirmedRecordCount: 3,
		});
		expect(plan.blockers).toEqual(["UnexportedConfirmedRecords"]);
	});

	it("allows Terminating → Terminated only after data return and exports are complete", () => {
		const plan = planLifecycleTransition("Terminating", "Terminated", { ...readyFacts, isDataReturnConfirmed: true });
		expect(plan).toEqual({ isAllowed: true, requiresFourEyes: true, blockers: [] });
	});
});

describe("isProviderWritable", () => {
	it("only allows writes while onboarding or active", () => {
		expect(isProviderWritable("Onboarding")).toBe(true);
		expect(isProviderWritable("Active")).toBe(true);
		expect(isProviderWritable("Suspended")).toBe(false);
		expect(isProviderWritable("Terminating")).toBe(false);
		expect(isProviderWritable("Draft")).toBe(false);
	});
});
