import { Inject, Injectable } from "@nestjs/common";
import { superAdminPlatformEndpoints as platform } from "@carekind/shared/contracts";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { superAdminScope, type SuperAdminActor } from "./actors";
import { cursorArgs, toAuditEvent, toPage } from "./mappers";
import { TenantDatabase } from "./ports";
import { findVisibleProvider } from "./super-admin-providers.service";

// Super Admin 审计查询（只读）。不带 providerId = 平台层事件（providerId 为空）；带 providerId = 该 Provider 的审计链。
// 审计内容只有 ID 和代码，查询本身不需要再写读取审计（PRD 只要求读取住户临床内容时写读取审计）。

type AuditQuery = z.output<(typeof platform)["listAuditEvents"]["query"]>;
type AuditPage = z.input<(typeof platform)["listAuditEvents"]["response"]>;

@Injectable()
export class SuperAdminAuditService {
	constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

	async list(actor: SuperAdminActor, query: AuditQuery): Promise<AuditPage> {
		const providerId = query.providerId ?? null;
		const rows = await this.database.run(superAdminScope(providerId), async (transaction) => {
			if (providerId) await findVisibleProvider(transaction, actor, providerId);
			const where: Prisma.AuditEventWhereInput = {
				// 不传 providerId = 看全平台（含各 Provider）的事件；传了就只看该 Provider
				providerId: query.providerId,
				facilityId: query.facilityId,
				actorId: query.actorId,
				targetType: query.targetType,
				targetId: query.targetId,
				action: query.action,
				occurredAt: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined },
			};
			return transaction.auditEvent.findMany({ where, orderBy: { seq: "desc" }, ...cursorArgs(query.cursor, query.limit) });
		});
		return toPage(rows, query.limit, toAuditEvent);
	}
}
