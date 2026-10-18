import { z } from "zod";

// 环境变量是系统边界：启动时用 zod 校验一次，之后全程信任（rules/02 核心要求 07）。
// 密钥只从环境变量读取（本地 .env，生产由密钥管理服务注入），代码里没有默认密钥（核心要求 03）。

const booleanFlag = z.enum(["true", "false"]).transform((value) => value === "true");

const EnvSchema = z.object({
	DATABASE_URL: z.string().min(1),
	PORT: z.coerce.number().int().min(1).max(65535).default(3100),
	CORS_ALLOWED_ORIGINS: z.string().default(""),
	COOKIE_SECURE: booleanFlag.default(true),
	SUPER_ADMIN_JWT_SECRET: z.string().min(32, "SUPER_ADMIN_JWT_SECRET must be at least 32 characters."),
	PORTAL_JWT_SECRET: z.string().min(32, "PORTAL_JWT_SECRET must be at least 32 characters."),
	ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
	REFRESH_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(28800).default(900),
	SESSION_MAX_SECONDS: z.coerce.number().int().min(600).max(86400).default(28800),
	PORTAL_INVITE_BASE_URL: z.string().default(""),
	// 只给本地开发用：还没有邮件服务（子处理方未评估），打开后邀请接口在响应里多返回 inviteUrl。生产必须为 false。
	DEV_RETURN_INVITE_LINKS: booleanFlag.default(false),
});

export interface AppConfig {
	port: number;
	corsAllowedOrigins: string[];
	isCookieSecure: boolean;
	superAdminJwtSecret: string;
	portalJwtSecret: string;
	accessTokenTtlSeconds: number;
	refreshIdleTimeoutSeconds: number;
	sessionMaxSeconds: number;
	portalInviteBaseUrl: string;
	shouldReturnInviteLinks: boolean;
}

/** Nest 依赖注入用的令牌。 */
export const APP_CONFIG: unique symbol = Symbol("APP_CONFIG");

export function loadAppConfig(environment: NodeJS.ProcessEnv): AppConfig {
	const env = EnvSchema.parse(environment);
	return {
		port: env.PORT,
		corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS.split(",")
			.map((origin) => origin.trim())
			.filter((origin) => origin !== ""),
		isCookieSecure: env.COOKIE_SECURE,
		superAdminJwtSecret: env.SUPER_ADMIN_JWT_SECRET,
		portalJwtSecret: env.PORTAL_JWT_SECRET,
		accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
		refreshIdleTimeoutSeconds: env.REFRESH_IDLE_TIMEOUT_SECONDS,
		sessionMaxSeconds: env.SESSION_MAX_SECONDS,
		portalInviteBaseUrl: env.PORTAL_INVITE_BASE_URL,
		shouldReturnInviteLinks: env.DEV_RETURN_INVITE_LINKS,
	};
}
