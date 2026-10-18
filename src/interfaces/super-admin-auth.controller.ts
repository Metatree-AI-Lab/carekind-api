import { Controller, Inject, Req, Res } from "@nestjs/common";
import { authEndpoints as auth } from "@carekind/shared/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { APP_CONFIG, type AppConfig } from "../adapters/app-config";
import type { SuperAdminActor } from "../application/actors";
import { SuperAdminAuthService } from "../application/super-admin-auth.service";
import { clearSuperAdminCookies, setSuperAdminCookies, SUPER_ADMIN_REFRESH_COOKIE } from "./cookies";
import { CurrentSuperAdmin, Endpoint, Input, type EndpointInput, type EndpointOutput } from "./endpoint";

// Super Admin 认证端点（shared authEndpoints 的 super-admin 部分）。token 只写进 cookie，响应体不含 token。

@Controller()
export class SuperAdminAuthController {
	constructor(
		@Inject(SuperAdminAuthService) private readonly authService: SuperAdminAuthService,
		@Inject(APP_CONFIG) private readonly config: AppConfig,
	) {}

	@Endpoint(auth.superAdminLogin)
	async login(
		@Input() input: EndpointInput<typeof auth.superAdminLogin>,
		@Res({ passthrough: true }) reply: FastifyReply,
	): Promise<EndpointOutput<typeof auth.superAdminLogin>> {
		const { user, tokens } = await this.authService.login(input.body);
		setSuperAdminCookies(reply, tokens, this.config.isCookieSecure);
		return { user, session: tokens.session };
	}

	@Endpoint(auth.superAdminRefresh)
	async refresh(
		@Req() request: FastifyRequest,
		@Res({ passthrough: true }) reply: FastifyReply,
	): Promise<EndpointOutput<typeof auth.superAdminRefresh>> {
		const tokens = await this.authService.refresh(request.cookies[SUPER_ADMIN_REFRESH_COOKIE]);
		setSuperAdminCookies(reply, tokens, this.config.isCookieSecure);
		return tokens.session;
	}

	@Endpoint(auth.superAdminLogout)
	async logout(
		@Req() request: FastifyRequest,
		@Res({ passthrough: true }) reply: FastifyReply,
	): Promise<EndpointOutput<typeof auth.superAdminLogout>> {
		await this.authService.logout(request.cookies[SUPER_ADMIN_REFRESH_COOKIE]);
		clearSuperAdminCookies(reply, this.config.isCookieSecure);
		return { ok: true };
	}

	@Endpoint(auth.superAdminMe)
	async me(@CurrentSuperAdmin() actor: SuperAdminActor): Promise<EndpointOutput<typeof auth.superAdminMe>> {
		return this.authService.currentUser(actor.userId);
	}
}
