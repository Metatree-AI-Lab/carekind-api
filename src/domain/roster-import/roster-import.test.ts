import { describe, expect, it } from "vitest";
import { CsvFormatError, parseCsv } from "./csv-parser";
import { isSimilarName } from "./name-similarity";
import { classifyRoster, type ExistingResident, type InputRow } from "./roster-classifier";
import { checkRowDecision, planRosterOperations, requiresSecondConfirmation, summariseBatch } from "./roster-decisions";
import { findMissingRequiredColumns, validateRosterRow } from "./row-validation";

// 全部是虚构住户（Demo 工作区 PRD §4.4、Provider Portal PRD §12 场景 3）。
const today = new Date("2026-10-18T00:00:00Z");
const header = "facilityResidentId,cmsId,legalName,preferredName,dateOfBirth,unitName,room,startDay";

const edna: ExistingResident = {
	id: "8a000000-0000-4000-8000-000000000001",
	facilityResidentId: "WG-0412",
	cmsId: null,
	legalName: "Edna Hall",
	dateOfBirth: "1938-03-14",
	room: "12",
	status: "Admitted",
};
const joan: ExistingResident = {
	id: "8a000000-0000-4000-8000-000000000003",
	facilityResidentId: "WG-0331",
	cmsId: null,
	legalName: "Joan Walsh",
	dateOfBirth: "1941-07-02",
	room: "15",
	status: "Admitted",
};
const george: ExistingResident = {
	id: "8a000000-0000-4000-8000-000000000008",
	facilityResidentId: "WG-0198",
	cmsId: "CMS-7781",
	legalName: "George Papadopoulos",
	dateOfBirth: "1944-11-30",
	room: "21",
	status: "Admitted",
};

function classify(csvBody: string, existing: ExistingResident[], otherFacilityIds: string[] = []) {
	const parsed = parseCsv(`${header}\n${csvBody}`, 500);
	const rows: InputRow[] = parsed.rows.map((csvRow) => ({
		rowNumber: csvRow.rowNumber,
		validation: validateRosterRow(csvRow.cells, today),
	}));
	return classifyRoster(rows, { existing, facilityResidentIdsInOtherFacilities: new Set(otherFacilityIds) });
}

describe("parseCsv", () => {
	it("handles quoted commas, escaped quotes, CRLF and a BOM", () => {
		const parsed = parseCsv('﻿a,b\r\n"Hall, Edna","said ""hi"""\r\n', 10);
		expect(parsed.header).toEqual(["a", "b"]);
		expect(parsed.rows).toEqual([{ rowNumber: 2, cells: { a: "Hall, Edna", b: 'said "hi"' } }]);
	});

	it("reports the row number when the column count is wrong", () => {
		expect(() => parseCsv("a,b\n1,2\n3", 10)).toThrowError(new CsvFormatError("ColumnCountMismatch", 3));
	});

	it("rejects unterminated quotes and empty files", () => {
		expect(() => parseCsv('a\n"open', 10)).toThrowError(CsvFormatError);
		expect(() => parseCsv("\n\n", 10)).toThrowError(new CsvFormatError("EmptyFile", null));
	});

	it("enforces the row limit", () => {
		expect(() => parseCsv("a\n1\n2\n3", 2)).toThrowError(new CsvFormatError("TooManyRows", null));
	});
});

describe("row validation", () => {
	it("lists required columns missing from the header", () => {
		expect(findMissingRequiredColumns(["legalName", "room"])).toEqual(["facilityResidentId", "dateOfBirth"]);
	});

	it("flags impossible dates of birth and bad room formats", () => {
		const future = validateRosterRow({ facilityResidentId: "X-1", legalName: "A B", dateOfBirth: "2030-01-01" }, today);
		expect(future).toEqual({ isValid: false, issues: ["DateOfBirthOutOfRange"] });
		const badDate = validateRosterRow({ facilityResidentId: "X-1", legalName: "A B", dateOfBirth: "14/03/1938" }, today);
		expect(badDate).toEqual({ isValid: false, issues: ["InvalidDate"] });
	});
});

describe("name similarity", () => {
	it("treats Joan and June Walsh as similar but Edna and Karen Hall as different", () => {
		expect(isSimilarName("Mrs Joan Walsh", "June Walsh")).toBe(true);
		expect(isSimilarName("Edna Hall", "Edna Hal")).toBe(true);
		expect(isSimilarName("Edna Hall", "Karen Hall")).toBe(false);
		expect(isSimilarName("Edna Hall", "edna  hall")).toBe(false);
	});
});

describe("classifyRoster", () => {
	it("updates a resident whose match key is unchanged and keeps them out of Missing", () => {
		const rows = classify("WG-0412,,Edna Hall,Edna,1938-03-14,Wattle wing,14,", [edna]);
		expect(rows).toEqual([
			expect.objectContaining({ rowNumber: 2, status: "Update", matchedResidentId: edna.id, issues: [] }),
		]);
	});

	it("treats the same resident ID with a different date of birth as a conflict", () => {
		const rows = classify("WG-0412,,Edna Hall,,1938-04-13,,12,", [edna]);
		expect(rows[0]).toEqual(expect.objectContaining({ status: "Conflict", issues: ["DateOfBirthMismatch"] }));
	});

	it("never matches on name alone: a new ID with the same name and birth date is only a possible match", () => {
		const rows = classify("WG-9999,,Edna Hall,,1938-03-14,,12,", [edna]);
		expect(rows[0]).toEqual(expect.objectContaining({ status: "PossibleMatch", matchedResidentId: edna.id }));
	});

	it("never merges a different person who shares a name but not a birth date", () => {
		const rows = classify("WG-0500,,Edna Hall,,1950-01-01,,30,", [edna]);
		expect(rows[0]).toEqual(expect.objectContaining({ status: "NearName", matchedResidentId: null }));
	});

	it("needs a person to decide when the legal name changed under the same ID", () => {
		const rows = classify("WG-0412,,Edna Hal,,1938-03-14,,12,", [edna]);
		expect(rows[0]).toEqual(expect.objectContaining({ status: "PossibleMatch", issues: ["SimilarName"] }));
	});

	it("flags near names in the same facility (Joan and June Walsh)", () => {
		const rows = classify("WG-0332,,June Walsh,,1939-05-20,,16,", [joan]);
		expect(rows[0]).toEqual(expect.objectContaining({ status: "NearName", issues: ["SimilarName"] }));
	});

	it("marks every duplicated row in the file as a conflict", () => {
		const rows = classify("WG-0600,,Arjun Mehta,,1945-02-02,,3,\nWG-0600,,Arjun Mehta,,1945-02-02,,3,", []);
		expect(rows.map((candidate) => [candidate.status, candidate.issues])).toEqual([
			["Conflict", ["DuplicateRowInFile"]],
			["Conflict", ["DuplicateRowInFile"]],
		]);
	});

	it("treats a repeated CMS ID with different resident IDs as a duplicate", () => {
		const rows = classify("WG-0601,CMS-1,Mei Chen,,1940-02-02,,4,\nWG-0602,CMS-1,Mei Chen,,1940-02-02,,5,", []);
		expect(rows.every((candidate) => candidate.status === "Conflict")).toBe(true);
	});

	it("blocks two residents in the same room, including someone already living there", () => {
		const rows = classify("WG-0700,,Arjun Mehta,,1945-02-02,,12,", [edna]);
		expect(rows[0]).toEqual(expect.objectContaining({ status: "Conflict", issues: ["BedOccupiedByAnotherResident"] }));
	});

	it("lists residents who are not in the file as Missing without discharging them", () => {
		const rows = classify("WG-0412,,Edna Hall,,1938-03-14,,12,", [edna, george]);
		expect(rows.at(-1)).toEqual({
			rowNumber: null,
			status: "Missing",
			parsed: null,
			matchedResidentId: george.id,
			issues: ["NotInFile"],
		});
	});

	it("does not list departed residents as Missing", () => {
		const rows = classify("WG-0412,,Edna Hall,,1938-03-14,,12,", [edna, { ...george, status: "Departed" }]);
		expect(rows).toHaveLength(1);
	});

	it("matches by CMS ID plus date of birth only as a possible match", () => {
		const rows = classify("WG-0800,CMS-7781,George Papadopoulos,,1944-11-30,,21,", [george]);
		expect(rows[0]).toEqual(expect.objectContaining({ status: "PossibleMatch", matchedResidentId: george.id }));
	});

	it("does not let an import take over a resident ID used at another facility", () => {
		const rows = classify("BP-0101,,Dorothy Fraser,,1947-08-09,,2,", [], ["BP-0101"]);
		expect(rows[0]?.status).toBe("Conflict");
	});
});

describe("roster decisions", () => {
	it("requires a reason for possible-match decisions", () => {
		expect(checkRowDecision("PossibleMatch", "SamePerson", null, false)).toBe("ReasonRequired");
		expect(checkRowDecision("PossibleMatch", "SamePerson", "Checked photo and room with the RN", false)).toBeNull();
		expect(checkRowDecision("PossibleMatch", "Accept", "x", false)).toBe("DecisionNotAllowedForStatus");
	});

	it("does not allow 'different person' when the row reuses the matched resident's ID", () => {
		expect(checkRowDecision("PossibleMatch", "DifferentPerson", "Different person", true)).toBe(
			"DecisionNotAllowedForStatus",
		);
	});

	it("does not allow any decision on conflicts or missing residents", () => {
		expect(checkRowDecision("Conflict", "Accept", null, false)).toBe("DecisionNotAllowedForStatus");
		expect(checkRowDecision("Missing", "Accept", null, false)).toBe("DecisionNotAllowedForStatus");
	});

	const parsedEdna = {
		facilityResidentId: "WG-0412",
		legalName: "Edna Hal",
		dateOfBirth: "1938-03-14",
	};

	it("requires a second person when a legal name is changed", () => {
		const rows = [
			{
				status: "PossibleMatch" as const,
				decision: "SamePerson" as const,
				parsed: parsedEdna,
				matchedResidentId: edna.id,
				matchedLegalName: "Edna Hall",
			},
		];
		expect(requiresSecondConfirmation(rows)).toBe(true);
		expect(summariseBatch(rows, false)).toEqual({ status: "AwaitingSecondConfirmation", canApply: false });
		expect(summariseBatch(rows, true)).toEqual({ status: "AwaitingDecisions", canApply: true });
	});

	it("is blocked while any conflict remains, and waits while rows are undecided", () => {
		const conflictRow = { status: "Conflict" as const, decision: "Undecided" as const, parsed: null, matchedResidentId: null, matchedLegalName: null };
		expect(summariseBatch([conflictRow], true).status).toBe("BlockedByConflicts");
		const undecided = { ...conflictRow, status: "NearName" as const };
		expect(summariseBatch([undecided], true)).toEqual({ status: "AwaitingDecisions", canApply: false });
	});

	it("never turns Missing rows into departures and creates a new resident for 'different person'", () => {
		const operations = planRosterOperations([
			{ status: "Missing", decision: "Undecided", parsed: null, matchedResidentId: george.id, matchedLegalName: null },
			{
				status: "PossibleMatch",
				decision: "DifferentPerson",
				parsed: { ...parsedEdna, facilityResidentId: "WG-9999", legalName: "Edna Hall" },
				matchedResidentId: edna.id,
				matchedLegalName: "Edna Hall",
			},
		]);
		expect(operations).toEqual([
			{ kind: "CreateResident", row: { ...parsedEdna, facilityResidentId: "WG-9999", legalName: "Edna Hall" } },
		]);
	});
});
