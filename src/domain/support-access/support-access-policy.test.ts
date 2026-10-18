import { describe, expect, it } from "vitest";
import {
	checkCanDecide,
	checkCanRevoke,
	checkCanStart,
	checkScopeAllowed,
	computeExpiry,
	effectiveSupportStatus,
	includesHealthInformation,
	resolveApprovedMinutes,
	resolveRequestedMinutes,
} from "./support-access-policy";

// 场景：虚构工单 SUP-0142（Wattle Grove Residential Care 的 PDF 导出失败），元数据级，2 小时。
const supportUserId = "6f1c2a40-0000-4000-8000-000000000003";
const otherSupportUserId = "6f1c2a40-0000-4000-8000-000000000004";
const now = new Date("2026-10-18T05:00:00.000Z");

describe("support access duration", () => {
	it("defaults to 2 hours when no duration is requested", () => {
		expect(resolveRequestedMinutes(undefined)).toBe(120);
	});

	it("accepts the 4-hour maximum and rejects anything longer", () => {
		expect(resolveRequestedMinutes(240)).toBe(240);
		expect(resolveRequestedMinutes(241)).toBe("DurationTooLong");
	});

	it("rejects durations shorter than 15 minutes", () => {
		expect(resolveRequestedMinutes(10)).toBe("DurationTooShort");
	});

	it("lets the approver shorten but never lengthen the grant", () => {
		expect(resolveApprovedMinutes(120, 60)).toBe(60);
		expect(resolveApprovedMinutes(120, undefined)).toBe(120);
		expect(resolveApprovedMinutes(120, 180)).toBe("ApprovedDurationLonger");
	});

	it("computes expiry from the moment the session starts", () => {
		expect(computeExpiry(now, 120).toISOString()).toBe("2026-10-18T07:00:00.000Z");
	});
});

describe("support access scope", () => {
	it("treats only metadata access as free of health information", () => {
		expect(includesHealthInformation("Metadata")).toBe(false);
		expect(includesHealthInformation("SingleRecordOrExportJob")).toBe(true);
		expect(includesHealthInformation("UnitShiftRecordList")).toBe(true);
	});

	it("blocks content-level requests when the provider always denies content access", () => {
		expect(checkScopeAllowed("SingleRecordOrExportJob", true)).toBe("ContentAccessAlwaysDenied");
		expect(checkScopeAllowed("Metadata", true)).toBeNull();
		expect(checkScopeAllowed("UnitShiftRecordList", false)).toBeNull();
	});
});

describe("support access state", () => {
	it("treats an active grant past its expiry as expired", () => {
		const state = { status: "Active" as const, expiresAt: new Date("2026-10-18T04:59:59.000Z") };
		expect(effectiveSupportStatus(state, now)).toBe("Expired");
		expect(checkCanRevoke(state, now)).toBe("Expired");
	});

	it("only allows decisions on pending requests", () => {
		expect(checkCanDecide({ status: "Pending", expiresAt: null }, now)).toBeNull();
		expect(checkCanDecide({ status: "Approved", expiresAt: null }, now)).toBe("InvalidStatusForAction");
	});

	it("only lets the original requester start an approved session", () => {
		const approved = { status: "Approved" as const, expiresAt: null };
		expect(checkCanStart(approved, supportUserId, supportUserId, now)).toBeNull();
		expect(checkCanStart(approved, supportUserId, otherSupportUserId, now)).toBe("OnlyRequesterCanStart");
		expect(checkCanStart({ status: "Pending", expiresAt: null }, supportUserId, supportUserId, now)).toBe(
			"InvalidStatusForAction",
		);
	});

	it("lets the provider revoke pending, approved or active requests", () => {
		expect(checkCanRevoke({ status: "Pending", expiresAt: null }, now)).toBeNull();
		expect(checkCanRevoke({ status: "Active", expiresAt: new Date("2026-10-18T06:00:00.000Z") }, now)).toBeNull();
		expect(checkCanRevoke({ status: "Rejected", expiresAt: null }, now)).toBe("InvalidStatusForAction");
	});
});
