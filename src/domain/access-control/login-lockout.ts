// 登录失败锁定。第一阶段不做 MFA（ADR-0005），所以要靠锁定限制密码猜测。
// 数值是开发默认，⚠️ 需 Lin 确认（参考 OWASP Authentication Cheat Sheet 的常见做法）。

export const MAX_FAILED_LOGINS: number = 5;
export const LOCKOUT_MINUTES: number = 15;

export interface LoginAttemptState {
	failedLoginCount: number;
	lockedUntil: Date | null;
}

export function isLockedOut(state: LoginAttemptState, now: Date): boolean {
	return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** 一次失败之后的新状态：达到上限就锁定，并把计数清零（锁定结束后重新计数）。 */
export function afterFailedLogin(state: LoginAttemptState, now: Date): LoginAttemptState {
	const failedLoginCount = state.failedLoginCount + 1;
	if (failedLoginCount < MAX_FAILED_LOGINS) return { failedLoginCount, lockedUntil: state.lockedUntil };
	return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) };
}

export const AFTER_SUCCESSFUL_LOGIN: LoginAttemptState = { failedLoginCount: 0, lockedUntil: null };
