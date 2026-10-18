# CLAUDE.md — prisma/migrations（数据库迁移）

> 层级：代码目录 · 路径：`06-app-development/app/prisma/migrations/` · 上级上下文：[`../../CLAUDE.md`](../../CLAUDE.md)

## 这里是什么
`prisma migrate dev` 根据 `../schema.prisma` 生成的 SQL 迁移，每个子目录一次迁移（`<时间戳>_<名称>/migration.sql`）。`migration_lock.toml` 锁定数据库类型。

## 规则
- 迁移由 Prisma 生成，**不要手改已经应用过的迁移**；要改结构就改 `schema.prisma` 再生成新迁移。
- RLS 策略和 carekind_app 角色不在迁移里，在 `../rls.sql`，迁移之后用 `npm run db:rls` 应用。
- 每个新迁移子目录也要放 README.md + CLAUDE.md + AGENTS.md 软链接（meta repo 的 check-context-docs 会检查）。

## 关键文件
- `20261018113343_init/migration.sql`：第一阶段（Super Admin）初始结构

## 不要做
- 不要在迁移里写种子数据或任何真实数据
