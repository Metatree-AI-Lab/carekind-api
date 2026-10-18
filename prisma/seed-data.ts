// 种子数据：虚构的 Wattle Grove Care Group（Super Admin PRD §11.2、Provider Portal PRD §12、Demo 工作区 PRD §4.4）。
// 全部是虚构的人和机构（fictional）。地址是明显的虚构地址；ABN 是明显的占位号码 00 000 000 001。
// 人名与 Demo 工作区 PRD 一致；PRD 里写 {{TBD}} 的角色（区域 DON、Banksia Park FM、Provider admin）
// 由本文件暂定虚构姓名，⚠️ 需与 Provider Portal / Super Admin 前端和 Demo PRD 对齐。

import type { AustralianState, PortalRole, RoleScope } from "@carekind/shared/schemas";

export const PROVIDER = {
	slug: "wattle-grove-care-group",
	legalName: "Wattle Grove Care Group (fictional)",
	tradingName: "Wattle Grove Care Group",
	abn: "00000000001",
} as const;

export const REGION_NAME: string = "VIC Metro & Regional";

export interface FacilitySeed {
	key: "wattleGrove" | "banksiaPark" | "grevilleaHouse";
	name: string;
	state: AustralianState;
	suburb: string;
	postcode: string;
	addressLine1: string;
	isInRegion: boolean;
	status: "Active" | "Onboarding";
	operationalBeds: number;
	units: { name: string; description: string | null }[];
	/** 未完成的上线清单项（Grevillea House：14/19，缺 ★6、★7 等，SA PRD §11.2）。 */
	incompleteGoLiveItems: number[];
}

export const FACILITIES: readonly FacilitySeed[] = [
	{
		key: "wattleGrove",
		name: "Wattle Grove Residential Care",
		state: "VIC",
		suburb: "Melbourne",
		postcode: "3000",
		addressLine1: "1 Fictional Wattle Way",
		isInRegion: true,
		status: "Active",
		operationalBeds: 60,
		units: [
			{ name: "Wattle wing", description: null },
			{ name: "Banksia wing", description: "memory support" },
		],
		incompleteGoLiveItems: [],
	},
	{
		key: "banksiaPark",
		name: "Banksia Park Aged Care",
		state: "VIC",
		suburb: "Geelong",
		postcode: "3220",
		addressLine1: "2 Fictional Banksia Road",
		isInRegion: true,
		status: "Active",
		operationalBeds: 45,
		units: [
			{ name: "Jacaranda wing", description: null },
			{ name: "Bottlebrush wing", description: null },
		],
		incompleteGoLiveItems: [],
	},
	{
		key: "grevilleaHouse",
		name: "Grevillea House",
		state: "NSW",
		suburb: "Albury",
		postcode: "2640",
		addressLine1: "3 Fictional Grevillea Street",
		isInRegion: false,
		status: "Onboarding",
		operationalBeds: 30,
		units: [{ name: "Riverside wing", description: null }],
		incompleteGoLiveItems: [6, 7, 12, 15, 17],
	},
];

type FacilityKey = FacilitySeed["key"];

export interface StaffSeed {
	key: string;
	fullName: string;
	preferredName: string | null;
	email: string;
	nurseAppRole: "PCW" | "EN" | "RN" | "OtherStaff";
	facilities: FacilityKey[];
	portalRoles: { role: PortalRole; scope: "Provider" | "Region" | FacilityKey[] }[];
	/** 有管理端角色的人用 SEED_DEMO_PORTAL_PASSWORD 设置密码；一线员工不进管理端。 */
	canSignInToPortal: boolean;
}

export const STAFF: readonly StaffSeed[] = [
	{
		key: "helen",
		fullName: "Helen Tran",
		preferredName: "Helen",
		email: "helen.tran@wattlegrove.example",
		nurseAppRole: "OtherStaff",
		facilities: ["wattleGrove", "banksiaPark", "grevilleaHouse"],
		portalRoles: [{ role: "Owner", scope: "Provider" }],
		canSignInToPortal: true,
	},
	{
		key: "ruth",
		fullName: "Ruth Kim",
		preferredName: null,
		email: "ruth.kim@wattlegrove.example",
		nurseAppRole: "OtherStaff",
		facilities: ["wattleGrove"],
		portalRoles: [{ role: "ProviderAdmin", scope: "Provider" }],
		canSignInToPortal: true,
	},
	{
		key: "anita",
		fullName: "Anita Sharma",
		preferredName: null,
		email: "anita.sharma@wattlegrove.example",
		nurseAppRole: "RN",
		facilities: ["wattleGrove", "banksiaPark", "grevilleaHouse"],
		portalRoles: [{ role: "ClinicalLead", scope: ["wattleGrove", "banksiaPark", "grevilleaHouse"] }],
		canSignInToPortal: true,
	},
	{
		key: "grace",
		fullName: "Grace Liu",
		preferredName: "Grace",
		email: "grace.liu@wattlegrove.example",
		nurseAppRole: "RN",
		facilities: ["wattleGrove"],
		portalRoles: [{ role: "CareManager", scope: ["wattleGrove"] }],
		canSignInToPortal: true,
	},
	{
		key: "liam",
		fullName: "Liam Walker",
		preferredName: null,
		email: "liam.walker@wattlegrove.example",
		nurseAppRole: "OtherStaff",
		facilities: ["banksiaPark"],
		portalRoles: [{ role: "FacilityManager", scope: ["banksiaPark"] }],
		canSignInToPortal: true,
	},
	{ key: "daniel", fullName: "Daniel Reyes", preferredName: "Daniel", email: "daniel.reyes@wattlegrove.example", nurseAppRole: "RN", facilities: ["wattleGrove"], portalRoles: [], canSignInToPortal: false },
	{ key: "priya", fullName: "Priya Singh", preferredName: "Priya", email: "priya.singh@wattlegrove.example", nurseAppRole: "PCW", facilities: ["wattleGrove"], portalRoles: [], canSignInToPortal: false },
	{ key: "sofia", fullName: "Sofia Martins", preferredName: "Sofia", email: "sofia.martins@wattlegrove.example", nurseAppRole: "RN", facilities: ["wattleGrove"], portalRoles: [], canSignInToPortal: false },
	{ key: "tom", fullName: "Tom Becker", preferredName: "Tom", email: "tom.becker@wattlegrove.example", nurseAppRole: "RN", facilities: ["banksiaPark"], portalRoles: [], canSignInToPortal: false },
];

export function roleScopeFor(
	scope: StaffSeed["portalRoles"][number]["scope"],
	facilityIds: Readonly<Record<string, string>>,
	regionId: string,
): RoleScope {
	if (scope === "Provider") return { type: "Provider" };
	if (scope === "Region") return { type: "Region", regionId };
	return { type: "Facilities", facilityIds: scope.map((key) => facilityIds[key] ?? "") };
}

export interface ResidentSeed {
	facility: FacilityKey;
	unit: string;
	room: string;
	legalName: string;
	preferredName: string | null;
	dateOfBirth: string;
	facilityResidentId: string;
	isOptedOut?: boolean;
}

// Wattle Grove 的 8 位住户与 Demo 工作区 PRD §4.4 一致；Banksia Park 的 Dorothy Fraser 来自 Provider Portal PRD §12 场景 4。
export const RESIDENTS: readonly ResidentSeed[] = [
	{ facility: "wattleGrove", unit: "Wattle wing", room: "12", legalName: "Edna Hall", preferredName: "Edna", dateOfBirth: "1938-03-14", facilityResidentId: "WG-0412" },
	{ facility: "wattleGrove", unit: "Banksia wing", room: "7", legalName: "Tomasz Nowak", preferredName: "Tomasz", dateOfBirth: "1945-06-02", facilityResidentId: "WG-0287" },
	{ facility: "wattleGrove", unit: "Wattle wing", room: "15", legalName: "Joan Walsh", preferredName: "Joan", dateOfBirth: "1941-07-02", facilityResidentId: "WG-0331" },
	{ facility: "wattleGrove", unit: "Wattle wing", room: "16", legalName: "June Walsh", preferredName: "June", dateOfBirth: "1939-05-20", facilityResidentId: "WG-0332" },
	{ facility: "wattleGrove", unit: "Wattle wing", room: "18", legalName: "Rosa Bianchi", preferredName: "Rosa", dateOfBirth: "1940-09-11", facilityResidentId: "WG-0305", isOptedOut: true },
	{ facility: "wattleGrove", unit: "Wattle wing", room: "3", legalName: "Arjun Mehta", preferredName: "Arjun", dateOfBirth: "1945-02-02", facilityResidentId: "WG-0356" },
	{ facility: "wattleGrove", unit: "Wattle wing", room: "4", legalName: "Mei Chen", preferredName: "Mei", dateOfBirth: "1940-12-08", facilityResidentId: "WG-0378" },
	{ facility: "wattleGrove", unit: "Wattle wing", room: "21", legalName: "George Papadopoulos", preferredName: "George", dateOfBirth: "1944-11-30", facilityResidentId: "WG-0198" },
	{ facility: "banksiaPark", unit: "Jacaranda wing", room: "2", legalName: "Dorothy Fraser", preferredName: "Dorothy", dateOfBirth: "1947-01-22", facilityResidentId: "BP-0101" },
];

/** 合同与合规状态（SA PRD §11.2；日期为示例，fictional）。 */
export const COMPLIANCE = [
	{ documentType: "PilotAgreement", status: "Signed", effectiveOn: "2026-10-06", expiresOn: null },
	{ documentType: "Dpa", status: "Signed", effectiveOn: "2026-10-06", expiresOn: null },
	{ documentType: "CarekindPia", status: "Sent", effectiveOn: "2026-10-08", expiresOn: null },
	{ documentType: "InsuranceProfessionalIndemnity", status: "Signed", effectiveOn: "2026-07-01", expiresOn: "2027-06-30" },
] as const;

/** 功能开关定义（SA PRD §4-K）。全部默认关；风险开关在登记律师意见前不能打开。 */
export const FEATURE_FLAGS = [
	{ key: "isbar_handover", category: "Release", description: "ISBAR handover summaries in the nurse app." },
	{ key: "whole_shift_capture", category: "Risk", description: "Whole-shift background capture (mode A). Needs a legal opinion first." },
	{ key: "ambient_recording", category: "Risk", description: "Ambient recording. Needs a legal opinion first." },
	{ key: "offline_cache_allowed", category: "Operations", description: "Encrypted offline draft cache on facility devices." },
] as const;

/** 州规则包首批条目：文字来自 SA PRD §5 表（第 1、3、4 行与 5–7 行），已过 TGA 文字检查。 */
export const RULE_PACK_HINTS: Readonly<Record<"VIC" | "NSW" | "QLD", string>> = {
	VIC: "In Victoria, record the restrictive practices substitute decision-maker under the Aged Care Restrictive Practices Substitute Decision-maker Act 2024 (Vic). Select the basis yourself — careKind does not decide who can give consent.",
	NSW: "In NSW, check that the guardian or enduring guardian holds a restrictive practices function.",
	QLD: "In Queensland, a general health care appointment may not cover restrictive practices. Check the appointment document.",
};

export const SHARED_HINTS: readonly { templateId: string; fieldKey: string; text: string }[] = [
	{
		templateId: "eol-death-record-notifications",
		fieldKey: "coroner",
		text: "Whether a death is reportable to the coroner is decided by your organisation under your state's requirements. careKind does not make this decision.",
	},
	{
		templateId: "incident-medication-incident",
		fieldKey: "medication-details",
		text: "Medication details come from your eNRMC. careKind does not record medication administration.",
	},
	{
		templateId: "plan-admission-entry-assessment",
		fieldKey: "care-plan",
		text: "The care and services plan needs to be in place on or before the resident's start day.",
	},
];
