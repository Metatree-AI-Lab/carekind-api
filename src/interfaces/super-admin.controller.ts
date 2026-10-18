import { Controller, Inject } from "@nestjs/common";
import { superAdminPlatformEndpoints as platform, superAdminTenancyEndpoints as tenancy } from "@carekind/shared/contracts";
import type { SuperAdminActor } from "../application/actors";
import { SuperAdminApprovalsService } from "../application/super-admin-approvals.service";
import { SuperAdminAuditService } from "../application/super-admin-audit.service";
import { SuperAdminFlagsService } from "../application/super-admin-flags.service";
import { SuperAdminProvidersService } from "../application/super-admin-providers.service";
import { CurrentSuperAdmin, Endpoint, Input, type EndpointInput, type EndpointOutput } from "./endpoint";

// 第一阶段已实现的 Super Admin 端点。只做"收参数 → 调用例 → 返回"，不写业务规则。
// 其余契约端点由 not-implemented.ts 返回 501。

type In<Contract extends (typeof tenancy)[keyof typeof tenancy] | (typeof platform)[keyof typeof platform]> =
	EndpointInput<Contract>;
type Out<Contract extends (typeof tenancy)[keyof typeof tenancy] | (typeof platform)[keyof typeof platform]> =
	EndpointOutput<Contract>;

@Controller()
export class SuperAdminController {
	constructor(
		@Inject(SuperAdminProvidersService) private readonly providers: SuperAdminProvidersService,
		@Inject(SuperAdminApprovalsService) private readonly approvals: SuperAdminApprovalsService,
		@Inject(SuperAdminFlagsService) private readonly flags: SuperAdminFlagsService,
		@Inject(SuperAdminAuditService) private readonly auditEvents: SuperAdminAuditService,
	) {}

	@Endpoint(tenancy.listProviders)
	listProviders(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.listProviders>,
	): Promise<Out<typeof tenancy.listProviders>> {
		return this.providers.listProviders(actor, input.query);
	}

	@Endpoint(tenancy.createProvider)
	createProvider(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.createProvider>,
	): Promise<Out<typeof tenancy.createProvider>> {
		return this.providers.createProvider(actor, input.body);
	}

	@Endpoint(tenancy.getProvider)
	getProvider(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.getProvider>,
	): Promise<Out<typeof tenancy.getProvider>> {
		return this.providers.getProvider(actor, input.params.providerId);
	}

	@Endpoint(tenancy.requestProviderLifecycleChange)
	requestLifecycleChange(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.requestProviderLifecycleChange>,
	): Promise<Out<typeof tenancy.requestProviderLifecycleChange>> {
		return this.approvals.requestLifecycleChange(actor, input.params.providerId, input.body);
	}

	@Endpoint(tenancy.listFacilities)
	listFacilities(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.listFacilities>,
	): Promise<Out<typeof tenancy.listFacilities>> {
		return this.providers.listFacilities(actor, input.params.providerId);
	}

	@Endpoint(tenancy.createFacility)
	createFacility(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.createFacility>,
	): Promise<Out<typeof tenancy.createFacility>> {
		return this.providers.createFacility(actor, input.params.providerId, input.body);
	}

	@Endpoint(tenancy.listUnits)
	listUnits(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.listUnits>,
	): Promise<Out<typeof tenancy.listUnits>> {
		return this.providers.listUnits(actor, input.params.facilityId);
	}

	@Endpoint(tenancy.createUnit)
	createUnit(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.createUnit>,
	): Promise<Out<typeof tenancy.createUnit>> {
		return this.providers.createUnit(actor, input.params.facilityId, input.body);
	}

	@Endpoint(tenancy.inviteOwner)
	inviteOwner(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof tenancy.inviteOwner>,
	): Promise<Out<typeof tenancy.inviteOwner>> {
		return this.providers.inviteOwner(actor, input.params.providerId, input.body);
	}

	@Endpoint(platform.listApprovals)
	listApprovals(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof platform.listApprovals>,
	): Promise<Out<typeof platform.listApprovals>> {
		return this.approvals.list(actor, input.query);
	}

	@Endpoint(platform.approve)
	approve(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof platform.approve>,
	): Promise<Out<typeof platform.approve>> {
		return this.approvals.decide(actor, input.params.approvalId, true, input.body.note);
	}

	@Endpoint(platform.reject)
	reject(@CurrentSuperAdmin() actor: SuperAdminActor, @Input() input: In<typeof platform.reject>): Promise<Out<typeof platform.reject>> {
		return this.approvals.decide(actor, input.params.approvalId, false, input.body.note);
	}

	@Endpoint(platform.listFeatureFlags)
	listFeatureFlags(): Promise<Out<typeof platform.listFeatureFlags>> {
		return this.flags.list();
	}

	@Endpoint(platform.setFeatureFlagOverride)
	setFeatureFlagOverride(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof platform.setFeatureFlagOverride>,
	): Promise<Out<typeof platform.setFeatureFlagOverride>> {
		return this.flags.setOverride(actor, input.params.flagKey, input.body.override, input.body.reason);
	}

	@Endpoint(platform.listAuditEvents)
	listAuditEvents(
		@CurrentSuperAdmin() actor: SuperAdminActor,
		@Input() input: In<typeof platform.listAuditEvents>,
	): Promise<Out<typeof platform.listAuditEvents>> {
		return this.auditEvents.list(actor, input.query);
	}
}

/** 已实现的契约（not-implemented.ts 用它判断哪些端点返回 501）。 */
export const IMPLEMENTED_SUPER_ADMIN_PATHS: ReadonlySet<string> = new Set(
	[
		tenancy.listProviders,
		tenancy.createProvider,
		tenancy.getProvider,
		tenancy.requestProviderLifecycleChange,
		tenancy.listFacilities,
		tenancy.createFacility,
		tenancy.listUnits,
		tenancy.createUnit,
		tenancy.inviteOwner,
		platform.listApprovals,
		platform.approve,
		platform.reject,
		platform.listFeatureFlags,
		platform.setFeatureFlagOverride,
		platform.listAuditEvents,
	].map((contract) => `${contract.method} ${contract.path}`),
);
