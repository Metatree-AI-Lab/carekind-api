import "reflect-metadata";
import fastifyCookie from "@fastify/cookie";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { APP_CONFIG, type AppConfig } from "./adapters/app-config";
import { AppModule } from "./app.module";
import { registerNotImplementedRoutes } from "./interfaces/not-implemented";

// 入口：NestJS 11 + Fastify（ADR-0006）。
// 日志：Fastify 默认不记录请求体；这里再把 cookie 和 authorization 头脱敏，日志里永远不出现 token。

async function bootstrap(): Promise<void> {
	const adapter = new FastifyAdapter({
		logger: { level: "info", redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'] },
		bodyLimit: 2_500_000,
	});
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
	const config = app.get<AppConfig>(APP_CONFIG);
	await app.register(fastifyCookie);
	// CORS 默认关闭；只有在 CORS_ALLOWED_ORIGINS 里列出的前端地址才允许带 cookie 跨域（rules/02 §7）。
	if (config.corsAllowedOrigins.length > 0) app.enableCors({ origin: config.corsAllowedOrigins, credentials: true });
	registerNotImplementedRoutes(app.getHttpAdapter().getInstance());
	app.enableShutdownHooks();
	await app.listen({ port: config.port, host: "127.0.0.1" });
}

void bootstrap();
