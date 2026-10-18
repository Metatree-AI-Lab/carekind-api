# careKind API（carekind-api）

Owner: Lin (Tech Lead) · Last reviewed: 18/10/2026

careKind 后端 API。作为 submodule 挂在 meta repo 的 `06-app-development/app/`（GitHub 上叫 `carekind-api`）。
**第一阶段只做管理端，而且先只完成 Super Admin**（Lightman 18/10/2026）。护士端 domain 模块文档原样保留，没有代码。

## 技术栈（ADR-0006，Proposed，待 Lin 复核）
NestJS 11 + Fastify · PostgreSQL 16 + Prisma 6 · Postgres RLS（`prisma/rls.sql`）· argon2id + JWT access token + 轮换 refresh token（httpOnly、SameSite=Strict cookie）· zod 校验与路由契约全部来自 `@carekind/shared` · Vitest。不做 MFA（ADR-0005）。

## 本地启动（本 AI 会话没有运行以下任何命令）
```bash
cp .env.example .env            # 填写：POSTGRES_PASSWORD、两个 JWT 密钥（各 ≥ 32 字符）、SEED_* 密码等
npm install
npm run db:up                   # docker compose 启动 Postgres 16（宿主端口 5433）
npm run db:migrate              # prisma migrate dev（用 DATABASE_MIGRATION_URL，owner 连接；同时生成 Prisma Client）
npm run db:rls                  # 应用 RLS / 审计只追加，并给 carekind_app 角色设置密码（CAREKIND_APP_DB_PASSWORD）
npm run db:seed                 # 虚构 Wattle Grove Care Group + 虚构 Super Admin 用户
npm run start:dev               # tsx watch，http://127.0.0.1:3100 ；存活检查 GET /health
```
- 运行时用 `tsx`（esbuild）直接执行 TypeScript：所有依赖注入都写了显式 `@Inject(...)`，不依赖装饰器元数据，也能直接加载 `@carekind/shared` 的 `.ts` 源码。
- 本地 http 开发把 `COOKIE_SECURE=false`；Super Admin 前端地址写进 `CORS_ALLOWED_ORIGINS`。
- 其他命令：`npm test`（单元测试）、`npm run test:integration`（需要数据库）、`npm run lint`、`npm run typecheck`、`npm run format:check`。

## 已实现的端点（Super Admin）
| method | path | 权限 |
|---|---|---|
| POST | /auth/super-admin/login · /refresh · /logout | public |
| GET | /auth/super-admin/me | 已登录 |
| GET / POST | /super-admin/providers | providers.read / providers.write |
| GET | /super-admin/providers/:providerId | providers.read |
| POST | /super-admin/providers/:providerId/lifecycle-requests | providers.lifecycle.request（暂停、恢复等，four-eyes） |
| GET / POST | /super-admin/approvals · /:approvalId/approve · /:approvalId/reject | approvals.decide（批准人 ≠ 发起人） |
| GET / POST | /super-admin/providers/:providerId/facilities | providers.read / facilities.write（受套餐 facility 限额；按州绑定规则包） |
| GET / POST | /super-admin/facilities/:facilityId/units | providers.read / facilities.write |
| POST | /super-admin/providers/:providerId/owner-invitations | providers.write（只生成邀请记录，不发邮件） |
| GET / PUT | /super-admin/feature-flags · /:flagKey/overrides | providers.read / flags.write（全局打开 four-eyes；风险开关需律师意见） |
| GET | /super-admin/audit-events | audit.read |

## 第一阶段后续（现在返回 501）
shared 契约里的其余端点：Portal 全部（登录、范围、员工、住户、转院、名单导入、流程配置、看板、审计、支持访问审批、Demo）、Super Admin 的 Region、Facility 修改与改州、合规状态、泄露登记、套餐、上线清单、规则包、模板、过渡期开关、平台下限、支持访问、运营指标、内部用户、Demo console。清单由 `src/interfaces/not-implemented.ts` 自动生成。对应的纯逻辑（名单导入、转院阻断、停用检查、支持访问、配置分层）已在 `src/domain/` 写好并有单元测试。

## 结构
```
prisma/        schema.prisma · rls.sql · apply-rls.sh · seed.ts · seed-data.ts
src/domain/    纯业务规则（管理端 10 个模块 + 护士端模块文档）
src/application/ 用例（Super Admin 认证、Provider、审批、功能开关、审计）+ ports
src/adapters/  Prisma（RLS 上下文）、argon2、JWT、配置、护士端待办占位
src/interfaces/ 契约驱动路由、全局 guard（默认拒绝）、错误过滤、501 路由
test/          集成测试（跨租户隔离，需要数据库）
```

## 依赖与理由
| 依赖 | 理由 |
|---|---|
| @nestjs/common、core、platform-fastify、fastify | ADR-0005 / 0006 选定的 API 框架 |
| @nestjs/jwt | 官方 JWT 封装，签发 / 校验 access token |
| @fastify/cookie | httpOnly cookie 读写 |
| @prisma/client、prisma | ADR-0006 选定 ORM 与迁移 |
| argon2 | argon2id 密码哈希（ADR-0006） |
| zod | 与 @carekind/shared 同版本，校验环境变量和数据库 JSON |
| reflect-metadata、rxjs | NestJS 运行时必需 |
| tsx | 本地运行 TypeScript 与种子脚本 |
| vitest、typescript、eslint、typescript-eslint、prettier | 测试与代码规范（rules/02） |

## 开始之前
读 meta repo 的 `rules/02-code-rules.md`、ADR-0006、`docs/prds/2026-10-18-super-admin-multi-facility-console.md`。
