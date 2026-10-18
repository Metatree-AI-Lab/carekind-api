import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { z } from "zod";
import { AccessTokenSigner, type AccessTokenClaims, type DbAudience } from "../application/ports";
import { APP_CONFIG, type AppConfig } from "./app-config";

// 短期 access token（HS256 JWT）。两个 audience 用不同的密钥和不同的 aud 声明：
// Portal 的 token 拿到 Super Admin 那边一定校验失败，反之亦然（ADR-0006）。

const AUDIENCE_CLAIMS: Readonly<Record<DbAudience, string>> = {
	SUPER_ADMIN: "carekind-super-admin",
	PORTAL: "carekind-portal",
};

// token 内容在解码后仍然视为外部输入，再校验一次结构。
const PayloadSchema = z.object({
	sub: z.string().uuid(),
	sid: z.string().uuid(),
	prv: z.string().uuid().nullable(),
	demo: z.boolean(),
});

@Injectable()
export class JwtAccessTokenSigner extends AccessTokenSigner {
	private readonly jwt: JwtService = new JwtService();

	constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
		super();
	}

	async sign(audience: DbAudience, claims: AccessTokenClaims): Promise<{ token: string; expiresAt: Date }> {
		const expiresAt = new Date(Date.now() + this.config.accessTokenTtlSeconds * 1000);
		const token = await this.jwt.signAsync(
			{ sub: claims.subjectId, sid: claims.sessionId, prv: claims.providerId, demo: claims.isDemo },
			{
				secret: this.secretFor(audience),
				audience: AUDIENCE_CLAIMS[audience],
				expiresIn: this.config.accessTokenTtlSeconds,
				algorithm: "HS256",
			},
		);
		return { token, expiresAt };
	}

	async verify(audience: DbAudience, token: string): Promise<AccessTokenClaims | null> {
		try {
			const decoded: unknown = await this.jwt.verifyAsync(token, {
				secret: this.secretFor(audience),
				audience: AUDIENCE_CLAIMS[audience],
				algorithms: ["HS256"],
			});
			const payload = PayloadSchema.parse(decoded);
			return { subjectId: payload.sub, sessionId: payload.sid, providerId: payload.prv, isDemo: payload.demo };
		} catch (error) {
			// 签名错误、过期、audience 不符、结构不符都按"未登录"处理；不记录 token 内容。
			if (error instanceof Error) return null;
			throw error;
		}
	}

	private secretFor(audience: DbAudience): string {
		return audience === "SUPER_ADMIN" ? this.config.superAdminJwtSecret : this.config.portalJwtSecret;
	}
}
