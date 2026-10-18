import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { APP_CONFIG, loadAppConfig } from "./adapters/app-config";
import { Argon2PasswordHasher } from "./adapters/argon2-password-hasher";
import { JwtAccessTokenSigner } from "./adapters/jwt-access-token-signer";
import { PhaseOneNurseWorkloadReader } from "./adapters/nurse-workload-reader";
import { PrismaTenantDatabase } from "./adapters/prisma-tenant-database";
import { AuditService } from "./application/audit.service";
import { AccessTokenSigner, NurseWorkloadReader, PasswordHasher, TenantDatabase } from "./application/ports";
import { SuperAdminApprovalsService } from "./application/super-admin-approvals.service";
import { SuperAdminAuditService } from "./application/super-admin-audit.service";
import { SuperAdminAuthService } from "./application/super-admin-auth.service";
import { SuperAdminFlagsService } from "./application/super-admin-flags.service";
import { SuperAdminProvidersService } from "./application/super-admin-providers.service";
import { ApiErrorFilter } from "./interfaces/api-error.filter";
import { AuthGuard } from "./interfaces/auth.guard";
import { HealthController } from "./interfaces/health.controller";
import { SuperAdminAuthController } from "./interfaces/super-admin-auth.controller";
import { SuperAdminController } from "./interfaces/super-admin.controller";

// 第一阶段只有一个模块：端点少，拆模块只会增加样板代码（KISS）。
// 抽象类（ports）作为注入令牌，adapters 提供实现（依赖倒置）。

@Module({
	controllers: [HealthController, SuperAdminAuthController, SuperAdminController],
	providers: [
		{ provide: APP_CONFIG, useFactory: () => loadAppConfig(process.env) },
		{ provide: TenantDatabase, useClass: PrismaTenantDatabase },
		{ provide: PasswordHasher, useClass: Argon2PasswordHasher },
		{ provide: AccessTokenSigner, useClass: JwtAccessTokenSigner },
		{ provide: NurseWorkloadReader, useClass: PhaseOneNurseWorkloadReader },
		{ provide: APP_GUARD, useClass: AuthGuard },
		{ provide: APP_FILTER, useClass: ApiErrorFilter },
		AuditService,
		SuperAdminAuthService,
		SuperAdminProvidersService,
		SuperAdminApprovalsService,
		SuperAdminFlagsService,
		SuperAdminAuditService,
	],
})
export class AppModule {}
