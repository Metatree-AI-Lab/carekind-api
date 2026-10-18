import { describe, expect, it } from "vitest";
import { assertSafeAuditContext, computeAuditHash, verifyAuditChain, type AuditEventContent } from "./audit-chain";

const providerId = "7d000000-0000-4000-8000-000000000001";

function event(id: string, action: string): AuditEventContent {
	return {
		id,
		providerId,
		facilityId: null,
		actorType: "ProviderStaff",
		actorId: "7a000000-0000-4000-8000-000000000001",
		action,
		targetType: "ConfigVersion",
		targetId: "7e000000-0000-4000-8000-000000000001",
		outcome: "Succeeded",
		occurredAt: new Date("2026-10-18T05:05:00.000Z"),
		context: { item: "EscalationRouting", versionNumber: 3 },
	};
}

function chain(events: AuditEventContent[]) {
	let previousHash: string | null = null;
	return events.map((content) => {
		const hash = computeAuditHash(previousHash, content);
		const linked = { ...content, previousHash, hash };
		previousHash = hash;
		return linked;
	});
}

describe("audit hash chain", () => {
	it("produces the same hash regardless of context key order", () => {
		const first = event("7f000000-0000-4000-8000-000000000001", "config.propose");
		const reordered = { ...first, context: { versionNumber: 3, item: "EscalationRouting" } };
		expect(computeAuditHash(null, first)).toBe(computeAuditHash(null, reordered));
	});

	it("detects an edited event", () => {
		const linked = chain([
			event("7f000000-0000-4000-8000-000000000001", "config.propose"),
			event("7f000000-0000-4000-8000-000000000002", "config.approve"),
		]);
		expect(verifyAuditChain(linked)).toBe(true);
		const tampered = linked.map((entry, index) => (index === 0 ? { ...entry, action: "config.reject" } : entry));
		expect(verifyAuditChain(tampered)).toBe(false);
	});

	it("detects a deleted event", () => {
		const linked = chain([
			event("7f000000-0000-4000-8000-000000000001", "config.propose"),
			event("7f000000-0000-4000-8000-000000000002", "config.approve"),
			event("7f000000-0000-4000-8000-000000000003", "config.activate"),
		]);
		expect(verifyAuditChain([linked[0]!, linked[2]!])).toBe(false);
	});
});

describe("assertSafeAuditContext", () => {
	it("rejects long free text that could carry names or health information", () => {
		expect(() => assertSafeAuditContext({ note: "x".repeat(121) })).toThrow();
		expect(() => assertSafeAuditContext({ nested: { name: "Edna Hall" } })).toThrow();
		expect(assertSafeAuditContext({ residentId: "8a000000-0000-4000-8000-000000000001", isUrgent: false })).toEqual({
			residentId: "8a000000-0000-4000-8000-000000000001",
			isUrgent: false,
		});
	});
});
