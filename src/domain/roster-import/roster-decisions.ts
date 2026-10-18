import type { RosterBatchStatus, RosterCsvRow, RosterRowDecision, RosterRowStatus } from "@carekind/shared/schemas";

// 第 ③–⑤ 步：差异预览上的人工决定、第二人确认、生效（Provider Portal PRD §4.5）。
//   - 只有 New 和 Update 可以批量接受；
//   - Possible match 必须逐行选择"同一个人 / 不同的人"并写原因；
//   - NearName 必须逐行确认（不能批量）；
//   - Conflict 必须先修正文件；Missing 只列出，不能"接受"成离开。

export type DecisionViolation = "DecisionNotAllowedForStatus" | "ReasonRequired";

const ALLOWED_DECISIONS: Readonly<Record<RosterRowStatus, readonly RosterRowDecision[]>> = {
	New: ["Accept", "Skip"],
	Update: ["Accept", "Skip"],
	NearName: ["Accept", "Skip"],
	PossibleMatch: ["SamePerson", "DifferentPerson", "Skip"],
	Conflict: [],
	Missing: [],
};

/** 可以用"全部接受"批量处理的状态。 */
export const BULK_ACCEPTABLE_STATUSES: readonly RosterRowStatus[] = ["New", "Update"];

/**
 * sharesResidentId = 这一行和匹配到的住户用的是同一个机构住户 ID。这种情况下不能选"不同的人"：
 * 同一个 ID 不能属于两个人，必须先修正文件。
 */
export function checkRowDecision(
	status: RosterRowStatus,
	decision: RosterRowDecision,
	reason: string | null,
	sharesResidentId: boolean,
): DecisionViolation | null {
	if (!ALLOWED_DECISIONS[status].includes(decision)) return "DecisionNotAllowedForStatus";
	if (decision === "DifferentPerson" && sharesResidentId) return "DecisionNotAllowedForStatus";
	const needsReason = status === "PossibleMatch" && decision !== "Skip";
	if (needsReason && (reason === null || reason.trim() === "")) return "ReasonRequired";
	return null;
}

export interface DecidedRow {
	status: RosterRowStatus;
	decision: RosterRowDecision;
	parsed: RosterCsvRow | null;
	matchedResidentId: string | null;
	/** 匹配到的现有住户当前的法定姓名（用于判断是否改了身份字段）。 */
	matchedLegalName: string | null;
}

/** 本批是否改了身份字段（法定姓名）：需要第二人确认（Clinical Lead 或另一位 FM）。 */
export function requiresSecondConfirmation(rows: readonly DecidedRow[]): boolean {
	return rows.some(
		(candidate) =>
			candidate.status === "PossibleMatch" &&
			candidate.decision === "SamePerson" &&
			candidate.parsed !== null &&
			candidate.parsed.legalName !== candidate.matchedLegalName,
	);
}

/**
 * 批次状态：有 Conflict → BlockedByConflicts；还有需要人决定的行 → AwaitingDecisions；
 * 改了身份字段且没有第二人确认 → AwaitingSecondConfirmation；否则仍是 AwaitingDecisions 但可以生效（canApply）。
 */
export function summariseBatch(
	rows: readonly DecidedRow[],
	isSecondConfirmed: boolean,
): { status: RosterBatchStatus; canApply: boolean } {
	if (rows.some((candidate) => candidate.status === "Conflict")) return { status: "BlockedByConflicts", canApply: false };
	const isUndecided = rows.some((candidate) => candidate.status !== "Missing" && candidate.decision === "Undecided");
	if (isUndecided) return { status: "AwaitingDecisions", canApply: false };
	if (requiresSecondConfirmation(rows) && !isSecondConfirmed) {
		return { status: "AwaitingSecondConfirmation", canApply: false };
	}
	return { status: "AwaitingDecisions", canApply: true };
}

export type RosterOperation =
	| { kind: "CreateResident"; row: RosterCsvRow }
	| { kind: "UpdateResident"; residentId: string; row: RosterCsvRow; isIdentityChange: boolean };

/** 生效时要执行的操作。Skip、Missing、Conflict 不产生任何操作；Missing 永远不会变成离开。 */
export function planRosterOperations(rows: readonly DecidedRow[]): RosterOperation[] {
	return rows.flatMap((candidate): RosterOperation[] => {
		if (!candidate.parsed) return [];
		const shouldCreate =
			(candidate.decision === "Accept" && (candidate.status === "New" || candidate.matchedResidentId === null)) ||
			candidate.decision === "DifferentPerson";
		if (shouldCreate) return [{ kind: "CreateResident", row: candidate.parsed }];
		const shouldUpdate = candidate.decision === "Accept" || candidate.decision === "SamePerson";
		if (!shouldUpdate || candidate.matchedResidentId === null) return [];
		const isIdentityChange = candidate.parsed.legalName !== candidate.matchedLegalName;
		return [{ kind: "UpdateResident", residentId: candidate.matchedResidentId, row: candidate.parsed, isIdentityChange }];
	});
}
