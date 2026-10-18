import { findLooserSettings, PLATFORM_HARD_FLOOR, resolveEffectiveConfig, type LooserSetting } from "@carekind/shared/policy";
import {
	CLINICAL_WORKFLOW_ITEMS,
	type ConfigLayer,
	type EffectiveMode,
	type WorkflowConfig,
	type WorkflowItem,
} from "@carekind/shared/schemas";
import { nextShiftStart } from "./shift-boundaries";

// 配置分层（Super Admin PRD §4-G、Provider Portal PRD §4.6.0）。
// "更严"的比较和逐层合并只在 @carekind/shared/policy 定义（findLooserSettings、resolveEffectiveConfig）；
// 这里只编排 API 需要的判断：和哪一层比、要不要第二人批准、收件人是否有效、什么时候生效。

/**
 * 新版本要和谁比：
 *   Platform（careKind 下限）→ 代码内硬底线（Layer 0），任何人都不能放松；
 *   Provider → 当前生效的 Platform 下限；
 *   Facility → Platform 与 Provider 合并后的生效值。
 */
export function baselineFor(
	layer: ConfigLayer,
	item: WorkflowItem,
	platform: WorkflowConfig,
	provider: WorkflowConfig | null,
): WorkflowConfig {
	if (layer === "Platform") return PLATFORM_HARD_FLOOR[item];
	if (layer === "Provider") return platform;
	return resolveEffectiveConfig(platform, provider, null);
}

export function findLooserThanBaseline(candidate: WorkflowConfig, baseline: WorkflowConfig): LooserSetting[] {
	return findLooserSettings(candidate, baseline);
}

/** Platform 层全部需要 four-eyes；Provider / Facility 层只有临床项（审核链、升级路由）需要第二人批准。 */
export function requiresSecondApproval(layer: ConfigLayer, item: WorkflowItem): boolean {
	return layer === "Platform" || CLINICAL_WORKFLOW_ITEMS.includes(item);
}

/**
 * 升级路由里指定到具体员工的收件人，必须是 Active 且分配到相关院的员工（HAZ-P-PP-01）。
 * 默认路由到角色，不受员工变动影响；只有写了具体人名时才需要这项检查。
 */
export function findInvalidRecipients(config: WorkflowConfig, eligibleStaffIds: ReadonlySet<string>): LooserSetting[] {
	if (config.item !== "EscalationRouting") return [];
	const positions = [
		["primaryRecipient", config.primaryRecipient],
		["backupRecipient", config.backupRecipient],
		["sirsAssessmentOwner", config.sirsAssessmentOwner],
	] as const;
	return positions
		.filter(([, recipient]) => recipient.type === "Staff" && !eligibleStaffIds.has(recipient.staffId))
		.map(([field]) => ({ field, message: "Recipients must be active staff assigned to this facility." }));
}

/** 用于计算生效时间的版本信息。 */
export interface VersionTiming {
	isApproved: boolean;
	effectiveMode: EffectiveMode;
	/** 批准时刻；不需要批准的版本 = 保存时刻。 */
	decidedAt: Date;
}

/** 版本在某个时区（某家院）开始生效的时刻；未批准的版本永远不生效。 */
export function activationTime(timing: VersionTiming, timeZone: string, shiftStartTimes: readonly string[]): Date | null {
	if (!timing.isApproved) return null;
	if (timing.effectiveMode === "Immediate") return timing.decidedAt;
	return nextShiftStart(timing.decidedAt, timeZone, shiftStartTimes);
}

/** 从版本号从新到旧的列表里，找出此刻在该时区已经生效的最新版本。 */
export function pickEffectiveVersion<Version extends VersionTiming>(
	versionsNewestFirst: readonly Version[],
	timeZone: string,
	shiftStartTimes: readonly string[],
	now: Date,
): Version | null {
	for (const version of versionsNewestFirst) {
		const activatesAt = activationTime(version, timeZone, shiftStartTimes);
		if (activatesAt !== null && activatesAt.getTime() <= now.getTime()) return version;
	}
	return null;
}
