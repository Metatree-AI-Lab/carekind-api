import { describe, expect, it } from "vitest";
import { checkFourEyes } from "./four-eyes";

// 虚构的 careKind 内部用户 ID。
const implementationUserId = "6f1c2a40-0000-4000-8000-000000000001";
const governanceUserId = "6f1c2a40-0000-4000-8000-000000000002";

describe("checkFourEyes", () => {
	it("rejects the requester approving their own request", () => {
		const reason = checkFourEyes(
			{ requestedBy: implementationUserId, status: "Pending" },
			{ id: implementationUserId, canApprove: true },
		);
		expect(reason).toBe("A second person must approve this. You can't approve your own request.");
	});

	it("allows a different person who is authorised to approve", () => {
		const reason = checkFourEyes(
			{ requestedBy: implementationUserId, status: "Pending" },
			{ id: governanceUserId, canApprove: true },
		);
		expect(reason).toBeNull();
	});

	it("rejects a different person without approval permission", () => {
		const reason = checkFourEyes(
			{ requestedBy: implementationUserId, status: "Pending" },
			{ id: governanceUserId, canApprove: false },
		);
		expect(reason).toBe("You don't have permission to approve this request.");
	});

	it("rejects decisions on requests that are no longer pending", () => {
		const reason = checkFourEyes(
			{ requestedBy: implementationUserId, status: "Approved" },
			{ id: governanceUserId, canApprove: true },
		);
		expect(reason).toBe("This request has already been decided.");
	});
});
