import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	SUPER_ADMIN_GROUP_PERMISSIONS,
	SuperAdminPermissionGroupSchema,
	type LoginRequest,
	type SessionInfo,
	type SuperAdminCurrentUser,
	type SuperAdminPermission,
} from "@carekind/shared/schemas";
import type { Session, SuperAdminUser } from "@prisma/client";
import { APP_CONFIG, type AppConfig } from "../adapters/app-config";
import { AFTER_SUCCESSFUL_LOGIN, afterFailedLogin, isLockedOut } from "../domain/access-control/login-lockout";
import type { SuperAdminActor } from "./actors";
import { AuditService } from "./audit.service";
import { ApiError, unauthenticated } from "./errors";
import { AccessTokenSigner, PasswordHasher, TenantDatabase, type DbTransaction } from "./ports";

// Super Admin 认证（ADR-0006）：邮箱 + 密码（argon2id）、短期 access token + 轮换 refresh token；不做 MFA（ADR-0005）。
// refresh token 只存 SHA-256 哈希。轮换后旧 token 再次出现 = 很可能被盗用，撤销整个 token 家族。

const SCOPE = { audience: "SUPER_ADMIN", providerId: null } as const;

export interface IssuedTokens {
	accessToken: string;
	refreshToken: string;
	session: SessionInfo;
}

@Injectable()
export class SuperAdminAuthService {
	constructor(
		@Inject(TenantDatabase) private readonly database: TenantDatabase,
		@Inject(PasswordHasher) private readonly passwords: PasswordHasher,
		@Inject(AccessTokenSigner) private readonly tokens: AccessTokenSigner,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(APP_CONFIG) private readonly config: AppConfig,
	) {}

	async login(request: LoginRequest): Promise<{ user: SuperAdminCurrentUser; tokens: IssuedTokens }> {
		const now = new Date();
		const user = await this.database.run(SCOPE, (transaction) =>
			transaction.superAdminUser.findUnique({ where: { email: request.email.toLowerCase() } }),
		);
		if (!user || user.status !== "Active") {
			await this.passwords.verifyAgainstDummy(request.password);
			throw wrongCredentials();
		}
		if (isLockedOut(user, now)) {
			throw new ApiError("RateLimited", "Too many failed sign-in attempts. Try again in 15 minutes.");
		}
		if (!(await this.passwords.verify(user.passwordHash, request.password))) {
			await this.recordFailedLogin(user, now);
			throw wrongCredentials();
		}
		const tokens = await this.database.run(SCOPE, async (transaction) => {
			await transaction.superAdminUser.update({
				where: { id: user.id },
				data: { ...AFTER_SUCCESSFUL_LOGIN, lastLoginAt: now },
			});
			const issued = await this.startSession(transaction, user.id, randomUUID(), null);
			await this.audit.record(transaction, loginAudit(user.id, "auth.login", "Succeeded"));
			return issued;
		});
		return { user: await this.currentUser(user.id), tokens };
	}

	async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
		if (!refreshToken) throw unauthenticated();
		const now = new Date();
		const outcome = await this.database.run(SCOPE, async (transaction) => {
			const session = await transaction.session.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) } });
			if (!session || session.audience !== "SUPER_ADMIN") return null;
			if (session.rotatedAt !== null) {
				await transaction.session.updateMany({ where: { familyId: session.familyId }, data: { revokedAt: now } });
				await this.audit.record(transaction, loginAudit(session.subjectId, "auth.refresh_reuse_detected", "Rejected"));
				return "reuse" as const;
			}
			if (!this.isSessionUsable(session, now)) return null;
			await transaction.session.update({ where: { id: session.id }, data: { rotatedAt: now } });
			return this.startSession(transaction, session.subjectId, session.familyId, session.expiresAt);
		});
		if (outcome === null || outcome === "reuse") throw unauthenticated();
		return outcome;
	}

	async logout(refreshToken: string | undefined): Promise<void> {
		if (!refreshToken) return;
		await this.database.run(SCOPE, async (transaction) => {
			const session = await transaction.session.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) } });
			if (!session || session.revokedAt !== null) return;
			await transaction.session.updateMany({ where: { familyId: session.familyId }, data: { revokedAt: new Date() } });
			await this.audit.record(transaction, loginAudit(session.subjectId, "auth.logout", "Succeeded"));
		});
	}

	/** 全局 guard 调用：校验 access token、会话仍有效、用户仍是 Active，并刷新空闲计时。 */
	async authenticate(accessToken: string | undefined): Promise<SuperAdminActor> {
		if (!accessToken) throw unauthenticated();
		const claims = await this.tokens.verify("SUPER_ADMIN", accessToken);
		if (!claims) throw unauthenticated();
		const now = new Date();
		const actor = await this.database.run(SCOPE, async (transaction) => {
			const session = await transaction.session.findUnique({ where: { id: claims.sessionId } });
			if (!session || session.subjectId !== claims.subjectId || !this.isSessionUsable(session, now)) return null;
			const user = await loadUserWithGroups(transaction, claims.subjectId);
			if (!user || user.status !== "Active") return null;
			await transaction.session.update({ where: { id: session.id }, data: { lastUsedAt: now } });
			return buildActor(user, session);
		});
		if (!actor) throw unauthenticated();
		return actor;
	}

	async currentUser(userId: string): Promise<SuperAdminCurrentUser> {
		const user = await this.database.run(SCOPE, (transaction) => loadUserWithGroups(transaction, userId));
		if (!user) throw unauthenticated();
		const groups = groupsOf(user);
		return {
			audience: "super-admin",
			userId: user.id,
			email: user.email,
			displayName: user.displayName,
			groups,
			permissions: [...permissionsOf(groups)],
			isDemo: false,
		};
	}

	private async startSession(
		transaction: DbTransaction,
		userId: string,
		familyId: string,
		absoluteExpiry: Date | null,
	): Promise<IssuedTokens> {
		const refreshToken = randomBytes(32).toString("base64url");
		const expiresAt = absoluteExpiry ?? new Date(Date.now() + this.config.sessionMaxSeconds * 1000);
		const session = await transaction.session.create({
			data: { audience: "SUPER_ADMIN", subjectId: userId, familyId, refreshTokenHash: hashToken(refreshToken), expiresAt },
		});
		const access = await this.tokens.sign("SUPER_ADMIN", {
			subjectId: userId,
			sessionId: session.id,
			providerId: null,
			isDemo: false,
		});
		return {
			accessToken: access.token,
			refreshToken,
			session: {
				accessExpiresAt: access.expiresAt.toISOString(),
				idleTimeoutMinutes: Math.round(this.config.refreshIdleTimeoutSeconds / 60),
			},
		};
	}

	/** 会话未撤销、未超过 8 小时绝对时长、空闲未超过 15 分钟（SA PRD §4-N）。 */
	private isSessionUsable(session: Session, now: Date): boolean {
		if (session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) return false;
		return session.lastUsedAt.getTime() + this.config.refreshIdleTimeoutSeconds * 1000 > now.getTime();
	}

	private async recordFailedLogin(user: SuperAdminUser, now: Date): Promise<void> {
		await this.database.run(SCOPE, async (transaction) => {
			await transaction.superAdminUser.update({ where: { id: user.id }, data: afterFailedLogin(user, now) });
			await this.audit.record(transaction, loginAudit(user.id, "auth.login_failed", "Rejected"));
		});
	}
}

type UserWithGroups = SuperAdminUser & { memberships: { group: { key: string } }[] };

function loadUserWithGroups(transaction: DbTransaction, userId: string): Promise<UserWithGroups | null> {
	return transaction.superAdminUser.findUnique({
		where: { id: userId },
		include: { memberships: { include: { group: { select: { key: true } } } } },
	});
}

/** 权限组 key 是数据库读出的数据，用 shared 枚举校验；组 → 权限的映射只在 shared 定义。 */
function groupsOf(user: UserWithGroups): SuperAdminCurrentUser["groups"] {
	return user.memberships.map((membership) => SuperAdminPermissionGroupSchema.parse(membership.group.key));
}

function permissionsOf(groups: SuperAdminCurrentUser["groups"]): Set<SuperAdminPermission> {
	return new Set(groups.flatMap((group) => SUPER_ADMIN_GROUP_PERMISSIONS[group]));
}

function buildActor(user: UserWithGroups, session: Session): SuperAdminActor {
	const groups = groupsOf(user);
	return {
		audience: "super-admin",
		userId: user.id,
		sessionId: session.id,
		groups,
		permissions: permissionsOf(groups),
		isDemo: session.isDemo,
		demoProviderId: session.isDemo ? session.providerId : null,
	};
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function wrongCredentials(): ApiError {
	return new ApiError("Unauthenticated", "The email or password is incorrect.");
}

function loginAudit(userId: string, action: string, outcome: "Succeeded" | "Rejected") {
	return {
		providerId: null,
		facilityId: null,
		actorType: "SuperAdminUser" as const,
		actorId: userId,
		action,
		targetType: "Session" as const,
		targetId: userId,
		outcome,
		context: {},
	};
}
