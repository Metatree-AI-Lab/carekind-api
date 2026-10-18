import type { DashboardMetricKey, MetricValue } from "@carekind/shared/schemas";

// 看板指标的名称和口径（Provider Portal PRD §4.7、Super Admin PRD §4-O）。
// 每张卡必须能回答 "How this is measured"；口径只在这里写一次，Demo 样例和真实数据共用。
// 禁止：员工个人排名、个人统计、风险评分、临床事件趋势、"节省时间"类数字（护栏 G10、rules/01 §1）。

export interface MetricDefinition {
	label: string;
	measurementMethod: string;
}

export const METRIC_DEFINITIONS: Readonly<Record<DashboardMetricKey, MetricDefinition>> = {
	ActiveStaff: {
		label: "Active staff",
		measurementMethod:
			"Accounts that submitted at least one dictation or review action in the last 7 days, divided by active accounts assigned to the facility.",
	},
	DictationVolume: {
		label: "Dictations",
		measurementMethod: "Dictated events submitted per day, counted by facility or unit. Never counted per person.",
	},
	ConfirmationTimeliness: {
		label: "Note confirmation time",
		measurementMethod:
			"Time from dictation to confirmation, shown as the median and 90th percentile, split by tier. Only notes confirmed in this period are counted.",
	},
	Tier3ConfirmationTime: {
		label: "Tier 3 confirmation time",
		measurementMethod:
			"Time from a Tier 3 draft being created to an RN confirming it: median, mean and 90th percentile. The number of Tier 3 events is not shown.",
	},
	GoLiveChecklistCompletion: {
		label: "Go-live checklist",
		measurementMethod: "Completed go-live checklist items divided by the 19 required items, per facility.",
	},
	TenantCount: {
		label: "Providers",
		measurementMethod: "Number of provider organisations in each lifecycle status. Demo providers are not counted.",
	},
	ActiveUsers: {
		label: "Active users",
		measurementMethod:
			"Distinct portal accounts that signed in at least once in the last 24 hours. Groups with fewer than 5 accounts are not shown.",
	},
	DraftVolume: {
		label: "Drafts",
		measurementMethod: "New drafts created per facility per day (counts only, no content).",
	},
	ConfirmationRate: {
		label: "Confirmation rate",
		measurementMethod: "Drafts confirmed within 12 hours of the end of the shift, divided by all drafts from that shift.",
	},
	ExportSuccessRate: {
		label: "Export success rate",
		measurementMethod: "Exports with a receipt, divided by exported, failed and unknown exports. 'Filed (attested)' is not counted as a success.",
	},
	ErrorRate: {
		label: "Error rate",
		measurementMethod: "Server errors, speech-to-text and drafting failures and timeouts, divided by requests, per service per hour.",
	},
};

/** 指标的最小人数（Provider Portal PRD §12.9 #6：配置项，默认 5）。少于这个数只显示 "Fewer than 5"。 */
export const MINIMUM_GROUP_SIZE: number = 5;

/** 人数类指标：分组人数少于最小人数时不显示具体数字，防止推断到个人。 */
export function countOrSuppressed(count: number, groupSize: number, minimumGroupSize: number): MetricValue {
	if (groupSize < minimumGroupSize) return { kind: "Suppressed", minimumGroupSize };
	return { kind: "Count", value: count };
}

/** 比例类指标：分母为 0 时没有数据（不能显示 0%）。 */
export function ratioOrNoData(numerator: number, denominator: number): MetricValue {
	if (denominator === 0) return { kind: "NoData" };
	return { kind: "Ratio", numerator, denominator };
}

/** 依赖护士端的指标：第一阶段没有护士端，真实租户一律 NoData（界面显示 "No data yet"），不填 0。 */
export const NURSE_SIDE_METRICS: readonly DashboardMetricKey[] = [
	"ActiveStaff",
	"DictationVolume",
	"ConfirmationTimeliness",
	"Tier3ConfirmationTime",
	"DraftVolume",
	"ConfirmationRate",
	"ExportSuccessRate",
];
