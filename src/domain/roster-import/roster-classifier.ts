import type { ResidentStatus, RosterCsvRow, RosterIssueCode, RosterRowStatus } from "@carekind/shared/schemas";
import { isConfusableName, isSimilarName, normaliseName } from "./name-similarity";
import type { RowValidation } from "./row-validation";

// 第 ② 步：把文件的每一行与现有名单比对（Provider Portal PRD §4.5，HAZ-P-PP-04 / 05）。
// 不变量（每一条都有测试）：
//   1. 姓名永远不是匹配键：匹配只用 机构住户 ID，或 CMS ID + 出生日期；姓名相似只会产生"需要人决定"。
//   2. 同一住户 ID 出现两个出生日期 → Conflict（阻断，必须先修正文件）。
//   3. 同一房间两人 → Conflict。
//   4. 现有在住住户不在文件里 → Missing，只列出，不自动办理离开。

export interface ExistingResident {
	id: string;
	facilityResidentId: string;
	cmsId: string | null;
	legalName: string;
	/** YYYY-MM-DD */
	dateOfBirth: string;
	room: string | null;
	status: ResidentStatus;
}

export interface InputRow {
	rowNumber: number;
	validation: RowValidation;
}

export interface ClassifiedRow {
	rowNumber: number | null;
	status: RosterRowStatus;
	parsed: RosterCsvRow | null;
	matchedResidentId: string | null;
	issues: RosterIssueCode[];
}

/** 在名单上的状态（只有这些人会被列为 Missing，也会占用房间）。 */
const IN_CARE_STATUSES: readonly ResidentStatus[] = ["PreAdmission", "Admitted", "OnLeave", "InHospital"];

export interface RosterContext {
	/** 本 Facility 的现有住户（含已离开的，用于按 ID 匹配）。 */
	existing: readonly ExistingResident[];
	/** 同一 Provider 其他 Facility 已使用的机构住户 ID：导入不能"顺手"把别院的人搬过来，转院要走 Transfer。 */
	facilityResidentIdsInOtherFacilities: ReadonlySet<string>;
}

/** 比对整份文件。返回顺序：文件行（按行号），然后是 Missing 行。 */
export function classifyRoster(rows: readonly InputRow[], context: RosterContext): ClassifiedRow[] {
	const duplicateRowNumbers = findDuplicateRows(rows);
	const matched = rows.map((row) => classifyRow(row, duplicateRowNumbers, context));
	const withRoomConflicts = markRoomConflicts(matched, context.existing);
	const withNearNames = markNearNames(withRoomConflicts, context.existing);
	return [...withNearNames, ...missingRows(withNearNames, context.existing)];
}

function classifyRow(row: InputRow, duplicates: ReadonlySet<number>, context: RosterContext): ClassifiedRow {
	if (!row.validation.isValid) return conflict(row.rowNumber, null, null, row.validation.issues);
	const parsed = row.validation.row;
	if (duplicates.has(row.rowNumber)) return conflict(row.rowNumber, parsed, null, ["DuplicateRowInFile"]);
	if (context.facilityResidentIdsInOtherFacilities.has(parsed.facilityResidentId)) {
		// 该 ID 属于同公司另一家院：不能在这里匹配，也不能新建同号住户。
		return conflict(row.rowNumber, parsed, null, ["MatchKeyMissing"]);
	}
	return matchRow(row.rowNumber, parsed, context.existing);
}

function matchRow(rowNumber: number, parsed: RosterCsvRow, existing: readonly ExistingResident[]): ClassifiedRow {
	const byId = existing.find((resident) => resident.facilityResidentId === parsed.facilityResidentId);
	if (byId) return compareWithMatch(rowNumber, parsed, byId);
	const byCmsId = parsed.cmsId ? existing.find((resident) => resident.cmsId === parsed.cmsId) : undefined;
	if (byCmsId && byCmsId.dateOfBirth !== parsed.dateOfBirth) {
		return conflict(rowNumber, parsed, byCmsId.id, ["DateOfBirthMismatch"]);
	}
	if (byCmsId) return row(rowNumber, "PossibleMatch", parsed, byCmsId.id, ["MatchKeyMissing"]);
	// 没有任何匹配键命中，但有同出生日期的近似名：可能是同一个人换了编号，必须人工决定。
	const lookAlike = existing.find(
		(resident) => resident.dateOfBirth === parsed.dateOfBirth && isConfusableName(resident.legalName, parsed.legalName),
	);
	if (lookAlike) return row(rowNumber, "PossibleMatch", parsed, lookAlike.id, ["SimilarName"]);
	return row(rowNumber, "New", parsed, null, []);
}

function compareWithMatch(rowNumber: number, parsed: RosterCsvRow, match: ExistingResident): ClassifiedRow {
	if (match.dateOfBirth !== parsed.dateOfBirth) return conflict(rowNumber, parsed, match.id, ["DateOfBirthMismatch"]);
	if (normaliseName(match.legalName) !== normaliseName(parsed.legalName)) {
		// 匹配键一致但法定姓名变了 = 身份字段变化，不能当普通 Update 批量接受。
		const issues: RosterIssueCode[] = isSimilarName(match.legalName, parsed.legalName) ? ["SimilarName"] : [];
		return row(rowNumber, "PossibleMatch", parsed, match.id, issues);
	}
	return row(rowNumber, "Update", parsed, match.id, []);
}

/** 文件内重复：同一机构住户 ID 或同一 CMS ID 出现多次，所有相关行都标出。 */
function findDuplicateRows(rows: readonly InputRow[]): Set<number> {
	const rowNumbersByKey = new Map<string, number[]>();
	for (const input of rows) {
		if (!input.validation.isValid) continue;
		const keys = [`id:${input.validation.row.facilityResidentId}`];
		if (input.validation.row.cmsId) keys.push(`cms:${input.validation.row.cmsId}`);
		for (const key of keys) rowNumbersByKey.set(key, [...(rowNumbersByKey.get(key) ?? []), input.rowNumber]);
	}
	return new Set([...rowNumbersByKey.values()].filter((numbers) => numbers.length > 1).flat());
}

// 导入后的房间占用 = 文件里的行 + 不在文件里、仍在住的现有住户。同一房间出现两个人就冲突。
function markRoomConflicts(rows: readonly ClassifiedRow[], existing: readonly ExistingResident[]): ClassifiedRow[] {
	const occupants = new Map<string, number>();
	const matchedIds = new Set(rows.map((candidate) => candidate.matchedResidentId).filter(isPresent));
	const addOccupant = (room: string): void => {
		occupants.set(normaliseRoom(room), (occupants.get(normaliseRoom(room)) ?? 0) + 1);
	};
	rows.filter((candidate) => candidate.status !== "Conflict" && candidate.parsed?.room).forEach((candidate) =>
		addOccupant(candidate.parsed?.room ?? ""),
	);
	existing
		.filter((resident) => IN_CARE_STATUSES.includes(resident.status) && !matchedIds.has(resident.id) && resident.room)
		.forEach((resident) => addOccupant(resident.room ?? ""));
	return rows.map((candidate) => {
		const room = candidate.parsed?.room;
		if (candidate.status === "Conflict" || !room || (occupants.get(normaliseRoom(room)) ?? 0) < 2) return candidate;
		return { ...candidate, status: "Conflict", issues: [...candidate.issues, "BedOccupiedByAnotherResident"] };
	});
}

// 近似名提醒：New / Update 行与同院其他人（现有住户或文件里的其他行）同名或名字近似 → NearName，需要逐行确认。
function markNearNames(rows: readonly ClassifiedRow[], existing: readonly ExistingResident[]): ClassifiedRow[] {
	return rows.map((candidate) => {
		if ((candidate.status !== "New" && candidate.status !== "Update") || !candidate.parsed) return candidate;
		const name = candidate.parsed.legalName;
		const hasSimilarResident = existing.some(
			(resident) => resident.id !== candidate.matchedResidentId && isConfusableName(resident.legalName, name),
		);
		const hasSimilarRow = rows.some(
			(other) => other !== candidate && other.parsed !== null && isConfusableName(other.parsed.legalName, name),
		);
		if (!hasSimilarResident && !hasSimilarRow) return candidate;
		return { ...candidate, status: "NearName", issues: [...candidate.issues, "SimilarName"] };
	});
}

function missingRows(rows: readonly ClassifiedRow[], existing: readonly ExistingResident[]): ClassifiedRow[] {
	const mentioned = new Set(rows.map((candidate) => candidate.matchedResidentId).filter(isPresent));
	return existing
		.filter((resident) => IN_CARE_STATUSES.includes(resident.status) && !mentioned.has(resident.id))
		.map((resident) => row(null, "Missing", null, resident.id, ["NotInFile"]));
}

function row(
	rowNumber: number | null,
	status: RosterRowStatus,
	parsed: RosterCsvRow | null,
	matchedResidentId: string | null,
	issues: RosterIssueCode[],
): ClassifiedRow {
	return { rowNumber, status, parsed, matchedResidentId, issues };
}

function conflict(
	rowNumber: number,
	parsed: RosterCsvRow | null,
	matchedResidentId: string | null,
	issues: RosterIssueCode[],
): ClassifiedRow {
	return row(rowNumber, "Conflict", parsed, matchedResidentId, issues);
}

function normaliseRoom(room: string): string {
	return room.trim().toLowerCase().replace(/^room\s+/, "");
}

function isPresent<Value>(value: Value | null): value is Value {
	return value !== null;
}
