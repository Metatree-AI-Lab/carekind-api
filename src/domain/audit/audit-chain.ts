import { createHash } from "node:crypto";
import { AuditContextSchema, type AuditContext } from "@carekind/shared/schemas";

// 审计哈希链（Super Admin PRD §4-N："Event logs are protected from unauthorised modification and deletion"）。
// 每条事件的哈希 = SHA-256(上一条哈希 + 本条规范化内容)；改动或删除任何一条，之后所有哈希都对不上。
// 数据库层面 audit_event 只允许 INSERT（prisma/rls.sql）；哈希链是第二道证明。

export interface AuditEventContent {
	id: string;
	providerId: string | null;
	facilityId: string | null;
	actorType: string;
	actorId: string | null;
	action: string;
	targetType: string;
	targetId: string;
	outcome: string;
	occurredAt: Date;
	context: AuditContext;
}

/**
 * 只取事件内容字段（不含 seq、previousHash、hash 等存储字段），键按字母排序后序列化，
 * 保证同样的内容永远得到同样的字符串。
 */
export function canonicalise(content: AuditEventContent): string {
	const plain: Record<string, unknown> = {
		id: content.id,
		providerId: content.providerId,
		facilityId: content.facilityId,
		actorType: content.actorType,
		actorId: content.actorId,
		action: content.action,
		targetType: content.targetType,
		targetId: content.targetId,
		outcome: content.outcome,
		occurredAt: content.occurredAt.toISOString(),
		context: content.context,
	};
	return JSON.stringify(sortKeys(plain));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, nested]) => [key, sortKeys(nested)]),
	);
}

export function computeAuditHash(previousHash: string | null, content: AuditEventContent): string {
	return createHash("sha256")
		.update(previousHash ?? "")
		.update(canonicalise(content))
		.digest("hex");
}

/**
 * 写入前校验附加上下文：只允许 ID、代码、数字、布尔值，字符串 ≤ 120 字符（shared AuditContextSchema）。
 * 审计里不能出现姓名或健康信息；字段名白名单之外的写法在这里直接报错，而不是悄悄写进去。
 */
export function assertSafeAuditContext(context: Record<string, unknown>): AuditContext {
	return AuditContextSchema.parse(context);
}

/** 校验一段哈希链是否完整（用于审计导出和复核）。events 按 seq 从小到大排列。 */
export function verifyAuditChain(events: readonly (AuditEventContent & { previousHash: string | null; hash: string })[]): boolean {
	let expectedPrevious: string | null = events[0]?.previousHash ?? null;
	for (const event of events) {
		if (event.previousHash !== expectedPrevious) return false;
		if (computeAuditHash(event.previousHash, event) !== event.hash) return false;
		expectedPrevious = event.hash;
	}
	return true;
}
