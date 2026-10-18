// 集成测试：需要本地 Postgres（docker-compose.yml），并已执行 db:migrate、db:rls、db:seed。
// 只直接使用 adapters（不启动 Nest），所以不需要装饰器元数据。
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.int.test.ts"],
		environment: "node",
		fileParallelism: false,
		testTimeout: 30_000,
	},
});
