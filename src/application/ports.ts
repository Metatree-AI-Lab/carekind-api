import type { Prisma } from "@prisma/client";

// 应用层依赖的外部能力（依赖倒置：这里定义接口，src/adapters/ 实现）。
// 说明：数据访问直接用 Prisma 的事务客户端类型（ADR-0006 已选 Prisma）。
// 为每张表再包一层 repository 会让第一阶段的代码量翻倍，却没有第二个实现（YAGNI）；换 ORM 时影响面只在应用层。

/** 一次数据库事务。所有租户数据访问都在事务里进行，事务开头已设置 app.provider_id / app.audience（RLS）。 */
export type DbTransaction = Prisma.TransactionClient;

export type DbAudience = "SUPER_ADMIN" | "PORTAL";

/** 事务的租户上下文。providerId 为 null = 只能看平台层数据（RLS 默认拒绝所有租户行）。 */
export interface TenantScope {
	audience: DbAudience;
	providerId: string | null;
}

export abstract class TenantDatabase {
	/** 在一个事务里执行 work；事务开头用 SET LOCAL 设置 RLS 上下文，结束后自动失效。 */
	abstract run<Result>(scope: TenantScope, work: (transaction: DbTransaction) => Promise<Result>): Promise<Result>;

	/**
	 * 门户登录前按邮箱找账号：这时还不知道租户，只能通过数据库里的受限函数拿到 (providerId, staffId)，
	 * 拿不到密码哈希或其他字段（prisma/rls.sql 的 ck_find_portal_logins）。
	 */
	abstract findPortalLoginCandidates(email: string): Promise<{ providerId: string; staffId: string }[]>;

	/** Super Admin 只能拿到住户计数，不能读住户行（prisma/rls.sql 的 ck_resident_count）。 */
	abstract countResidents(providerId: string): Promise<number>;
}

export abstract class PasswordHasher {
	abstract hash(password: string): Promise<string>;
	abstract verify(hash: string, password: string): Promise<boolean>;
	/** 账号不存在时也做一次同样耗时的校验，避免通过响应时间判断邮箱是否存在。 */
	abstract verifyAgainstDummy(password: string): Promise<void>;
}

export interface AccessTokenClaims {
	subjectId: string;
	sessionId: string;
	providerId: string | null;
	isDemo: boolean;
}

export abstract class AccessTokenSigner {
	abstract sign(audience: DbAudience, claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }>;
	/** 校验失败（签名、过期、audience 不对）时返回 null，由调用方转成 401。 */
	abstract verify(audience: DbAudience, token: string): Promise<AccessTokenClaims | null>;
}

/** 护士端产生的待办计数（第二阶段护士端提供）。第一阶段的实现见 src/adapters/nurse-workload-reader.ts。 */
export interface NurseWorkloadCounts {
	openReviewItems: number;
	openFollowUps: number;
	unacceptedHandovers: number;
}

export interface ResidentOpenItemCounts {
	unconfirmedDrafts: number;
	unassignedSegments: number;
	openFollowUps: number;
	unacceptedHandovers: number;
}

export abstract class NurseWorkloadReader {
	/** 某员工在各 Facility 名下的待办（停用前检查用）。 */
	abstract forStaff(transaction: DbTransaction, providerId: string, staffId: string): Promise<Map<string, NurseWorkloadCounts>>;
	/** 某住户在发起院的待办（转院阻断用）。 */
	abstract forResident(transaction: DbTransaction, providerId: string, residentId: string): Promise<ResidentOpenItemCounts>;
	/** 尚未导出到机构 CMS 的已确认记录数（终止前检查用）。 */
	abstract unexportedConfirmedRecords(transaction: DbTransaction, providerId: string): Promise<number>;
	/** 住户是否已有确认记录（导入撤销、身份更正用）。 */
	abstract residentsWithConfirmedRecords(transaction: DbTransaction, providerId: string, residentIds: string[]): Promise<Set<string>>;
}
