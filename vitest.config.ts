// 单元测试：只跑纯逻辑（domain）和不需要数据库的测试。集成测试见 vitest.integration.config.ts。
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		exclude: ["**/*.int.test.ts", "node_modules/**", "dist/**"],
		environment: "node",
	},
});
