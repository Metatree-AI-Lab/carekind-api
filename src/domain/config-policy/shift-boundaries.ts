import type { AustralianState } from "@carekind/shared/schemas";

// 流程配置默认"下一个班次开始时生效"（Provider Portal PRD §4.6.0，HAZ-P-PP-08：班中改流程会让同一班路由不一致）。
// 班次边界按 Facility 所在州的本地时间计算（含夏令时）；跨州 Provider 的公司层改动在每家院各自的下一班生效。
//
// ⚠️ 开发默认：班次开始时间 07:00 / 15:00 / 23:00（与 Demo 工作区 PRD 的 PM 班 15:00–23:00 一致）。
// 真实机构的班次时间不同，需要 Lightman / 临床顾问确认后做成 Facility 配置。

export const DEFAULT_SHIFT_START_TIMES: readonly string[] = ["07:00", "15:00", "23:00"];

export const STATE_TIME_ZONES: Readonly<Record<AustralianState, string>> = {
	NSW: "Australia/Sydney",
	VIC: "Australia/Melbourne",
	QLD: "Australia/Brisbane",
	WA: "Australia/Perth",
	SA: "Australia/Adelaide",
	TAS: "Australia/Hobart",
	ACT: "Australia/Sydney",
	NT: "Australia/Darwin",
};

/** after 之后（不含）的第一个班次开始时刻。 */
export function nextShiftStart(after: Date, timeZone: string, shiftStartTimes: readonly string[]): Date {
	const localToday = localDateParts(after, timeZone);
	const candidates: Date[] = [];
	for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
		for (const startTime of shiftStartTimes) {
			const [hour, minute] = startTime.split(":").map(Number);
			candidates.push(
				zonedWallTimeToUtc(localToday.year, localToday.month, localToday.day + dayOffset, hour ?? 0, minute ?? 0, timeZone),
			);
		}
	}
	const next = candidates.filter((candidate) => candidate > after).sort((first, second) => first.getTime() - second.getTime())[0];
	if (!next) throw new Error("No shift start found within two days; check the shift start times.");
	return next;
}

interface DateParts {
	year: number;
	month: number;
	day: number;
}

function localDateParts(instant: Date, timeZone: string): DateParts {
	const parts = new Intl.DateTimeFormat("en-AU", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
		.formatToParts(instant)
		.reduce<Record<string, number>>((collected, part) => ({ ...collected, [part.type]: Number(part.value) }), {});
	return { year: parts["year"] ?? 0, month: parts["month"] ?? 0, day: parts["day"] ?? 0 };
}

/** 某时区某一时刻相对 UTC 的偏移（毫秒）。 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-AU", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})
		.formatToParts(instant)
		.reduce<Record<string, number>>((collected, part) => ({ ...collected, [part.type]: Number(part.value) }), {});
	const asUtc = Date.UTC(
		parts["year"] ?? 0,
		(parts["month"] ?? 1) - 1,
		parts["day"] ?? 1,
		parts["hour"] ?? 0,
		parts["minute"] ?? 0,
		parts["second"] ?? 0,
	);
	return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// 本地墙上时间 → UTC：先按"偏移为 0"猜一次，再用该时刻的实际偏移校正；夏令时切换当天再校正一次。
// day 可以超出当月天数（例如 32 号），Date.UTC 会自动进位到下个月。
function zonedWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
	const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
	const firstGuess = wallClockAsUtc - timeZoneOffsetMs(new Date(wallClockAsUtc), timeZone);
	const corrected = wallClockAsUtc - timeZoneOffsetMs(new Date(firstGuess), timeZone);
	return new Date(corrected);
}
