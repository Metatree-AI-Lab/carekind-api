// 名单 CSV 解析（RFC 4180 子集：逗号分隔、双引号包裹、"" 转义、CRLF / LF 换行、可选 UTF-8 BOM）。
// 为什么自己写而不引入依赖：careKind 模板只有 8 列、不需要流式解析，几十行代码就能覆盖并完整测试
// （rules/02 核心要求 11：最少依赖）。解析失败时给出行号，不回显单元格内容（单元格里有住户姓名）。

export interface ParsedCsv {
	header: string[];
	/** 每行一个对象，键是表头列名；rowNumber 从 2 开始（第 1 行是表头），与用户在表格软件里看到的一致。 */
	rows: { rowNumber: number; cells: Record<string, string> }[];
}

export class CsvFormatError extends Error {
	constructor(
		readonly code: "EmptyFile" | "UnterminatedQuote" | "TooManyRows" | "ColumnCountMismatch",
		readonly rowNumber: number | null,
	) {
		super(`CSV format error: ${code}${rowNumber === null ? "" : ` at row ${rowNumber}`}`);
		this.name = "CsvFormatError";
	}
}

/** 解析整份 CSV。空行忽略；列数与表头不一致时报错（通常是漏了引号）。 */
export function parseCsv(text: string, maxRows: number): ParsedCsv {
	const records = splitRecords(text.replace(/^﻿/, ""));
	const [headerRecord, ...dataRecords] = records.filter((record) => !isBlankRecord(record.fields));
	if (!headerRecord) throw new CsvFormatError("EmptyFile", null);
	if (dataRecords.length > maxRows) throw new CsvFormatError("TooManyRows", null);
	const header = headerRecord.fields.map((name) => name.trim());
	const rows = dataRecords.map((record) => {
		if (record.fields.length !== header.length) throw new CsvFormatError("ColumnCountMismatch", record.lineNumber);
		const cells: Record<string, string> = {};
		header.forEach((name, index) => {
			cells[name] = (record.fields[index] ?? "").trim();
		});
		return { rowNumber: record.lineNumber, cells };
	});
	return { header, rows };
}

interface RawRecord {
	lineNumber: number;
	fields: string[];
}

// 逐字符扫描的小状态机：引号内的逗号和换行属于字段内容。
function splitRecords(text: string): RawRecord[] {
	const records: RawRecord[] = [];
	let fields: string[] = [];
	let field = "";
	let isQuoted = false;
	let lineNumber = 1;
	let recordStartLine = 1;
	for (let i = 0; i < text.length; i++) {
		const character = text[i];
		if (isQuoted) {
			if (character === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (character === '"') {
				isQuoted = false;
			} else {
				if (character === "\n") lineNumber++;
				field += character;
			}
			continue;
		}
		if (character === '"' && field === "") {
			isQuoted = true;
		} else if (character === ",") {
			fields.push(field);
			field = "";
		} else if (character === "\n" || character === "\r") {
			if (character === "\r" && text[i + 1] === "\n") i++;
			fields.push(field);
			records.push({ lineNumber: recordStartLine, fields });
			fields = [];
			field = "";
			lineNumber++;
			recordStartLine = lineNumber;
		} else {
			field += character;
		}
	}
	if (isQuoted) throw new CsvFormatError("UnterminatedQuote", recordStartLine);
	if (field !== "" || fields.length > 0) records.push({ lineNumber: recordStartLine, fields: [...fields, field] });
	return records;
}

function isBlankRecord(fields: readonly string[]): boolean {
	return fields.every((value) => value.trim() === "");
}
