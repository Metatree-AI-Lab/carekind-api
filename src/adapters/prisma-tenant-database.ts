import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantDatabase, type DbTransaction, type TenantScope } from "../application/ports";

// Prisma 实现的租户数据库。每个事务开头用 set_config(..., true)（= SET LOCAL）设置 RLS 上下文，
// 事务结束自动失效，连接池里的连接不会把上一个请求的租户带到下一个请求。
// 运行时连接必须是 carekind_app 角色（prisma/rls.sql），它受 RLS 约束。

@Injectable()
export class PrismaTenantDatabase extends TenantDatabase implements OnModuleDestroy {
	private readonly client: PrismaClient = new PrismaClient();

	async run<Result>(scope: TenantScope, work: (transaction: DbTransaction) => Promise<Result>): Promise<Result> {
		return this.client.$transaction(async (transaction) => {
			// 用 $executeRaw：两个 set_config 返回同名列，$queryRaw 解析结果时会报错；这里只需要执行，不需要结果
			await transaction.$executeRaw`SELECT set_config('app.audience', ${scope.audience}, true), set_config('app.provider_id', ${scope.providerId ?? ""}, true)`;
			return work(transaction);
		});
	}

	async findPortalLoginCandidates(email: string): Promise<{ providerId: string; staffId: string }[]> {
		const rows = await this.client.$queryRaw<{ provider_id: string; staff_id: string }[]>`
			SELECT provider_id, staff_id FROM ck_find_portal_logins(${email})`;
		return rows.map((row) => ({ providerId: row.provider_id, staffId: row.staff_id }));
	}

	async countResidents(providerId: string): Promise<number> {
		const rows = await this.client.$queryRaw<{ count: bigint }[]>`SELECT ck_resident_count(${providerId}::uuid) AS count`;
		return Number(rows[0]?.count ?? 0);
	}

	async onModuleDestroy(): Promise<void> {
		await this.client.$disconnect();
	}
}
