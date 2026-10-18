import { Controller, Get, SetMetadata } from "@nestjs/common";
import { HEALTH_METADATA } from "./auth.guard";

// 存活检查（不在 shared 契约里，不需要登录，不返回任何数据）。

@Controller()
export class HealthController {
	@Get("/health")
	@SetMetadata(HEALTH_METADATA, true)
	health(): { ok: true } {
		return { ok: true };
	}
}
