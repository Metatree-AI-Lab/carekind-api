import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyReply } from "fastify";
import type { IssuedTokens } from "../application/super-admin-auth.service";

// token 只放在 httpOnly、SameSite=Strict 的 cookie 里（ADR-0006），前端 JavaScript 读不到。
// refresh cookie 只在 /auth/super-admin 路径下发送，减少暴露面。Super Admin 和 Portal 用不同的 cookie 名。

export const SUPER_ADMIN_ACCESS_COOKIE: string = "ck_sa_access";
export const SUPER_ADMIN_REFRESH_COOKIE: string = "ck_sa_refresh";
const SUPER_ADMIN_REFRESH_PATH = "/auth/super-admin";

function baseOptions(isSecure: boolean): CookieSerializeOptions {
	return { httpOnly: true, sameSite: "strict", secure: isSecure };
}

export function setSuperAdminCookies(reply: FastifyReply, tokens: IssuedTokens, isSecure: boolean): void {
	reply.setCookie(SUPER_ADMIN_ACCESS_COOKIE, tokens.accessToken, {
		...baseOptions(isSecure),
		path: "/",
		expires: new Date(tokens.session.accessExpiresAt),
	});
	reply.setCookie(SUPER_ADMIN_REFRESH_COOKIE, tokens.refreshToken, { ...baseOptions(isSecure), path: SUPER_ADMIN_REFRESH_PATH });
}

export function clearSuperAdminCookies(reply: FastifyReply, isSecure: boolean): void {
	reply.clearCookie(SUPER_ADMIN_ACCESS_COOKIE, { ...baseOptions(isSecure), path: "/" });
	reply.clearCookie(SUPER_ADMIN_REFRESH_COOKIE, { ...baseOptions(isSecure), path: SUPER_ADMIN_REFRESH_PATH });
}
