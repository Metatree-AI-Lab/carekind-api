// ESLint flat config — rules/02-code-rules.md §5：禁用 any、导出必须写类型、禁止空 catch。
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["dist/**", "coverage/**", "node_modules/**"] },
	eslint.configs.recommended,
	...tseslint.configs.strict,
	{
		files: ["**/*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
			"@typescript-eslint/no-extraneous-class": "off",
			"no-empty": ["error", { allowEmptyCatch: false }],
			"no-console": "error",
		},
	},
	{
		// prisma/seed.ts 是开发者手动运行的命令行脚本，允许向终端输出进度。
		files: ["prisma/seed.ts"],
		rules: { "no-console": "off" },
	},
);
