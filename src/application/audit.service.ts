import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { AuditActorType, AuditTargetType } from "@carekind/shared/schemas";
import { assertSafeAuditContext, computeAuditHash } from "../domain/audit/audit-chain";
import { TenantDatabase, type DbTransaction, type TenantScope } from "./ports";

// 所有写操作都经由这里写审计（只追加）。和业务写入在同一个事务里：业务成功才有审计，审计失败业务也回滚。
// 被拒绝的操作（例如"只能调严"被拒、登录失败）用 recordInNewTransaction：业务事务已回滚，拒绝记录仍要留下。

export interface AuditEntry {
	providerId: string | null;
	facilityId: string | null;
	actorType: AuditActorType;
	actorId: string | null;
	/** `<对象>.<动词>`，例如 "provider.create"。 */
	action: string;
	targetType: AuditTargetType;
	targetId: string;
	outcome: "Succeeded" | "Rejected";
	/** 只放 ID、代码、数字、布尔值（会被校验）；不放姓名、原因正文或健康信息。 */
	context: Record<string, string | number | boolean | null>;
}

@Injectable()
export class AuditService {
	constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

	async record(transaction: DbTransaction, entry: AuditEntry): Promise<void> {
		const context = assertSafeAuditContext(entry.context);
		// 同一条哈希链（同一 Provider 或平台层）串行写入，否则两个并发事务会拿到同一个"上一条"。
		const chainKey = entry.providerId ?? "platform";
		// pg_advisory_xact_lock 返回 void，$queryRaw 无法解析 void 列，所以用 $executeRaw
		await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chainKey}))`;
		const previous = await transaction.auditEvent.findFirst({
			where: { providerId: entry.providerId },
			orderBy: { seq: "desc" },
			select: { hash: true },
		});
		const content = { ...entry, id: randomUUID(), occurredAt: new Date(), context };
		const previousHash = previous?.hash ?? null;
		await transaction.auditEvent.create({
			data: { ...content, previousHash, hash: computeAuditHash(previousHash, content) },
		});
	}

	async recordInNewTransaction(scope: TenantScope, entry: AuditEntry): Promise<void> {
		await this.database.run(scope, (transaction) => this.record(transaction, entry));
	}
}
