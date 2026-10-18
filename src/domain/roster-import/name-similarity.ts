// 近似名判断（Provider Portal PRD §4.5：Joan Walsh / June Walsh 两人都加 "Similar name" 标记）。
// 注意：近似名只用来**提醒人**，永远不用来自动合并或匹配住户——姓名不是匹配键（HAZ-P-PP-04）。

const TITLES: ReadonlySet<string> = new Set(["mr", "mrs", "ms", "miss", "mx", "dr"]);

/** 小写、去掉称谓和标点、合并空格。 */
export function normaliseName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z\s'-]/g, " ")
		.split(/\s+/)
		.filter((token) => token !== "" && !TITLES.has(token))
		.join(" ");
}

/**
 * 两个名字"近似但不相同"：
 * - 编辑距离 ≤ 2（拼写差一两个字母），或
 * - 姓相同且名的首字母相同（Joan / June Walsh 的编辑距离是 3，但在名单上同样容易混淆）。
 */
export function isSimilarName(first: string, second: string): boolean {
	const left = normaliseName(first);
	const right = normaliseName(second);
	if (left === right || left === "" || right === "") return false;
	if (levenshtein(left, right) <= 2) return true;
	return hasSameSurnameAndInitial(left, right);
}

/** 容易混淆：完全同名（不同的人）或近似名。用于 NearName 提醒和"可能是同一个人"的提示。 */
export function isConfusableName(first: string, second: string): boolean {
	const left = normaliseName(first);
	return (left !== "" && left === normaliseName(second)) || isSimilarName(first, second);
}

function hasSameSurnameAndInitial(left: string, right: string): boolean {
	const leftTokens = left.split(" ");
	const rightTokens = right.split(" ");
	if (leftTokens.length < 2 || rightTokens.length < 2) return false;
	const isSameSurname = leftTokens.at(-1) === rightTokens.at(-1);
	return isSameSurname && leftTokens[0]?.[0] === rightTokens[0]?.[0];
}

/** 经典动态规划编辑距离（插入、删除、替换各算 1）。名字很短，O(n·m) 足够。 */
export function levenshtein(left: string, right: string): number {
	let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let i = 1; i <= left.length; i++) {
		const currentRow = [i];
		for (let j = 1; j <= right.length; j++) {
			const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
			currentRow[j] = Math.min(
				(previousRow[j] ?? 0) + 1,
				(currentRow[j - 1] ?? 0) + 1,
				(previousRow[j - 1] ?? 0) + substitutionCost,
			);
		}
		previousRow = currentRow;
	}
	return previousRow[right.length] ?? 0;
}
