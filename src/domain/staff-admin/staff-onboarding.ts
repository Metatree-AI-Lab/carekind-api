import { MANDATORY_STAFF_ONBOARDING_STEP_IDS, type NurseAppRole, type StaffStatus } from "@carekind/shared/schemas";

// 员工上线（Provider Portal PRD §4.4、流程第 7 项）：录音 / AI 告知、careKind 培训、RN/EN 资质 attest
// 三项不可移除；机构可以自加步骤。全部完成才 Active——Onboarding 未完成不能口述、不能确认记录。

/** RN / EN 才需要资质 attest；其他角色这一步视为不适用。 */
export const REGISTRATION_ATTESTATION_STEP_ID: string = "registration-attestation";

export function requiresRegistrationAttestation(role: NurseAppRole): boolean {
	return role === "RN" || role === "EN";
}

/** 这个人需要完成的步骤 ID：机构配置的步骤 ∪ 不可移除的步骤，去掉不适用的资质 attest。 */
export function requiredStepIds(configuredStepIds: readonly string[], role: NurseAppRole): string[] {
	const allStepIds = new Set([...MANDATORY_STAFF_ONBOARDING_STEP_IDS, ...configuredStepIds]);
	if (!requiresRegistrationAttestation(role)) allStepIds.delete(REGISTRATION_ATTESTATION_STEP_ID);
	return [...allStepIds];
}

/** 完成一个步骤后员工应处于的状态。只在 Invited / Onboarding 之间推进，不会把停用的人重新激活。 */
export function statusAfterOnboardingProgress(
	current: StaffStatus,
	requiredIds: readonly string[],
	completedIds: ReadonlySet<string>,
): StaffStatus {
	if (current !== "Invited" && current !== "Onboarding") return current;
	const isComplete = requiredIds.every((stepId) => completedIds.has(stepId));
	return isComplete ? "Active" : "Onboarding";
}

/** 占用套餐席位的状态（Deactivated 不占）。 */
export const SEAT_OCCUPYING_STATUSES: readonly StaffStatus[] = ["Invited", "Onboarding", "Active", "Suspended"];
