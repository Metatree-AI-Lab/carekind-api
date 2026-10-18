import {
	AuditContextSchema,
	AuditTargetTypeSchema,
	FeatureFlagOverrideSchema,
	PlanLimitSchema,
	type ApprovalRequest,
	type AuditEvent,
	type Facility,
	type FeatureFlag,
	type FeatureFlagOverride,
	type Plan,
	type Provider,
	type Unit,
} from "@carekind/shared/schemas";
import { z } from "zod";
import type {
	ApprovalRequest as ApprovalRow,
	AuditEvent as AuditRow,
	Facility as FacilityRow,
	FeatureFlag as FeatureFlagRow,
	FeatureFlagOverride as FeatureFlagOverrideRow,
	Plan as PlanRow,
	Provider as ProviderRow,
	Unit as UnitRow,
} from "@prisma/client";

// 数据库行 → shared 契约里的响应结构。日期一律转 ISO 字符串；JSON 列是"数据库读出的旧数据"，
// 属于边界，读出时用 shared schema 再校验一次（rules/02 核心要求 07）。

export function toIsoDate(value: Date | null): string | null {
	return value === null ? null : value.toISOString().slice(0, 10);
}

export function toProvider(row: ProviderRow): Provider {
	return {
		id: row.id,
		legalName: row.legalName,
		tradingName: row.tradingName,
		abn: row.abn,
		status: row.status,
		isDemo: row.isDemo,
		suspensionReason: row.suspensionReason,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function toFacility(row: FacilityRow): Facility {
	return {
		id: row.id,
		providerId: row.providerId,
		regionId: row.regionId,
		name: row.name,
		address: {
			line1: row.addressLine1,
			line2: row.addressLine2,
			suburb: row.suburb,
			state: row.state,
			postcode: row.postcode,
		},
		isStateGovernmentOperated: row.isStateGovernmentOperated,
		status: row.status,
		rulePackId: row.rulePackId,
		operationalBeds: row.operationalBeds,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function toUnit(row: UnitRow): Unit {
	return {
		id: row.id,
		providerId: row.providerId,
		facilityId: row.facilityId,
		name: row.name,
		description: row.description,
		isActive: row.isActive,
		createdAt: row.createdAt.toISOString(),
	};
}

export function toPlan(row: PlanRow): Plan {
	return {
		id: row.id,
		providerId: row.providerId,
		name: row.name,
		limits: z.array(PlanLimitSchema).parse(row.limits),
		contractStart: toIsoDate(row.contractStart),
		contractEnd: toIsoDate(row.contractEnd),
		billingStatus: row.billingStatus,
		accountingRef: row.accountingRef,
		updatedBy: row.updatedBy,
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function toApprovalRequest(row: ApprovalRow): ApprovalRequest {
	return {
		id: row.id,
		kind: row.kind,
		providerId: row.providerId,
		targetType: AuditTargetTypeSchema.parse(row.targetType),
		targetId: row.targetId,
		summary: row.summary,
		reason: row.reason,
		status: row.status,
		requestedBy: row.requestedBy,
		requestedAt: row.createdAt.toISOString(),
		decidedBy: row.decidedBy,
		decidedAt: row.decidedAt?.toISOString() ?? null,
		decisionNote: row.decisionNote,
	};
}

export function toFeatureFlagOverride(row: FeatureFlagOverrideRow): FeatureFlagOverride {
	return FeatureFlagOverrideSchema.parse({
		scope: row.scope,
		state: row.state ?? undefined,
		providerId: row.providerId ?? undefined,
		facilityId: row.facilityId ?? undefined,
		isEnabled: row.isEnabled,
	});
}

export function toFeatureFlag(row: FeatureFlagRow & { overrides: FeatureFlagOverrideRow[] }): FeatureFlag {
	return {
		key: row.key,
		description: row.description,
		category: row.category,
		isEnabledByDefault: false,
		overrides: row.overrides.map(toFeatureFlagOverride),
		legalOpinionRef: row.legalOpinionRef,
		updatedBy: row.updatedBy,
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function toAuditEvent(row: AuditRow): AuditEvent {
	return {
		id: row.id,
		providerId: row.providerId,
		facilityId: row.facilityId,
		actorType: row.actorType,
		actorId: row.actorId,
		action: row.action,
		targetType: AuditTargetTypeSchema.parse(row.targetType),
		targetId: row.targetId,
		outcome: row.outcome,
		occurredAt: row.occurredAt.toISOString(),
		context: AuditContextSchema.parse(row.context),
		previousHash: row.previousHash,
		hash: row.hash,
	};
}

/** 游标分页：多取一条判断是否还有下一页；游标是最后一条的 id。 */
export function toPage<Item extends { id: string }, Mapped>(
	rows: Item[],
	limit: number,
	map: (row: Item) => Mapped,
): { items: Mapped[]; nextCursor: string | null } {
	const hasMore = rows.length > limit;
	const pageRows = hasMore ? rows.slice(0, limit) : rows;
	return { items: pageRows.map(map), nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null };
}

/** Prisma findMany 的游标参数。 */
export function cursorArgs(cursor: string | undefined, limit: number): { take: number; skip?: number; cursor?: { id: string } } {
	return cursor ? { take: limit + 1, skip: 1, cursor: { id: cursor } } : { take: limit + 1 };
}
