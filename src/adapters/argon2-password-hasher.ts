import { Injectable } from "@nestjs/common";
import argon2 from "argon2";
import { PasswordHasher } from "../application/ports";

// argon2id（ADR-0006）。参数取 OWASP Password Storage Cheat Sheet 的 argon2id 最低建议：
// m = 19 MiB、t = 2、p = 1。⚠️ Lin 可按服务器性能调高。

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
	private dummyHash: Promise<string> | null = null;

	hash(password: string): Promise<string> {
		return argon2.hash(password, ARGON2_OPTIONS);
	}

	verify(hash: string, password: string): Promise<boolean> {
		return argon2.verify(hash, password);
	}

	async verifyAgainstDummy(password: string): Promise<void> {
		// 懒生成一个与真实哈希同参数的假哈希，让"账号不存在"和"密码错误"耗时一致。
		this.dummyHash ??= argon2.hash("carekind-timing-equaliser", ARGON2_OPTIONS);
		await argon2.verify(await this.dummyHash, password);
	}
}
