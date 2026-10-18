import { RosterCsvRowSchema, type RosterCsvRow, type RosterIssueCode } from "@carekind/shared/schemas";

// 第 ① 步：结构校验（必填列、日期格式、出生日期合理范围、房间格式）。这是系统边界，
// 用 shared 的 RosterCsvRowSchema 校验；之后的比对逻辑信任这里的结果。

export const ROSTER_TEMPLATE_COLUMNS: readonly (keyof RosterCsvRow)[] = [
	"facilityResidentId",
	"cmsId",
	"legalName",
	"preferredName",
	"dateOfBirth",
	"unitName",
	"room",
	"startDay",
];

const REQUIRED_COLUMNS: readonly (keyof RosterCsvRow)[] = ["facilityResidentId", "legalName", "dateOfBirth"];

/** 出生日期合理范围：不能晚于今天，也不能早于 120 年前（防止日 / 月颠倒或年份打错）。 */
export const MAX_RESIDENT_AGE_YEARS: number = 120;

/** 房间 / 床位格式：字母、数字、空格、点和短横线（例如 "12"、"7B"、"Room 12"）。 */
const ROOM_PATTERN = /^[A-Za-z0-9 .-]{1,20}$/;

export type RowValidation = { isValid: true; row: RosterCsvRow } | { isValid: false; issues: RosterIssueCode[] };

/** 表头缺少必填列时整份文件不能导入。 */
export function findMissingRequiredColumns(header: readonly string[]): string[] {
	return REQUIRED_COLUMNS.filter((column) => !header.includes(column));
}

export function validateRosterRow(cells: Readonly<Record<string, string>>, today: Date): RowValidation {
	const candidate = Object.fromEntries(
		ROSTER_TEMPLATE_COLUMNS.filter((column) => (cells[column] ?? "") !== "").map((column) => [column, cells[column]]),
	);
	const parsed = RosterCsvRowSchema.safeParse(candidate);
	if (!parsed.success) return { isValid: false, issues: schemaIssues(parsed.error.issues) };
	const issues: RosterIssueCode[] = [];
	if (!isPlausibleDateOfBirth(parsed.data.dateOfBirth, today)) issues.push("DateOfBirthOutOfRange");
	if (parsed.data.room !== undefined && !ROOM_PATTERN.test(parsed.data.room)) issues.push("InvalidRoomFormat");
	return issues.length > 0 ? { isValid: false, issues } : { isValid: true, row: parsed.data };
}

function schemaIssues(zodIssues: readonly { path: readonly PropertyKey[] }[]): RosterIssueCode[] {
	const codes = new Set<RosterIssueCode>();
	for (const issue of zodIssues) {
		const column = String(issue.path[0] ?? "");
		if (column === "dateOfBirth" || column === "startDay") codes.add("InvalidDate");
		else if (column === "room") codes.add("InvalidRoomFormat");
		else codes.add("MissingRequiredColumn");
	}
	return [...codes];
}

function isPlausibleDateOfBirth(isoDate: string, today: Date): boolean {
	const dateOfBirth = new Date(`${isoDate}T00:00:00Z`);
	const earliest = new Date(today);
	earliest.setUTCFullYear(today.getUTCFullYear() - MAX_RESIDENT_AGE_YEARS);
	return dateOfBirth.getTime() <= today.getTime() && dateOfBirth.getTime() >= earliest.getTime();
}
