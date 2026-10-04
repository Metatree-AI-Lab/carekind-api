# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **独立仓库**：`Metatree-AI-Lab/carekind-app`，作为 submodule 挂在 meta repo [`Metatree-AI-Lab/carekind`](https://github.com/Metatree-AI-Lab/carekind) 的 `06-app-development/app/`。
> **推荐在 meta repo 根目录打开 Claude Code / Codex 工作**，这样能加载完整的公司规则（`AGENTS.md`、`rules/`）、skills、产品文档（`docs/PRD.md`）、法律参考库，以及 AI changelog hook。下面的路径如 `docs/PRD.md`、`rules/02-code-rules.md` 都是 meta repo 里的路径。
> 单独 clone 本仓库时，至少遵守下面的"单独 clone 时的最低规则"。

## 单独 clone 时的最低规则（完整版见 meta repo 的 `rules/02-code-rules.md`）
- **Tab 缩进，宽度 4**（`.editorconfig`）；YAML 用 2 个空格
- **单个代码文件 ≤ 1000 行**：`.claude/settings.json` 的 hook 和 `.githooks/pre-commit` 会检查，超限就按职责拆分（目标 ≤ 500 行）
- 16 条核心要求：单一职责、清晰命名、不硬编码密钥（用 `.env`，只提交 `.env.example`）、复杂逻辑先写"为什么"、关键逻辑测试驱动、禁止空 catch、只在边界校验、默认最严权限、不交付 TODO 或假数据、性能底线（API p95 > 2 秒不合格）、最少依赖、YAGNI、可读性优先、导出必须写类型、禁用 any（白名单除外）、单文件 ≤ 1000 行
- 产品护栏（meta repo `docs/PRD.md` §9）：AI 草稿必须人工确认；不生成员工没说过的内容；不做诊断、风险评分、治疗建议或数值报警；老人归属不确定时不猜；已确认记录只能更正不能删除；数据在澳洲境内
- 每个功能模块目录都要有 `CLAUDE.md` + `README.md`（`scripts/check-context-docs.sh` 检查）
- AI 修改记录写在 **meta repo** 的 `changelog/YYYY-MM.md`
- `scripts/check-file-length.sh`、`scripts/check-context-docs.sh`、`.editorconfig` 从 meta repo 同步（meta 的 `scripts/sync-app-tooling.sh`），**不要直接在这里改**

## 常用命令
```bash
git config core.hooksPath .githooks          # 每个 clone 执行一次
scripts/check-file-length.sh --all           # 检查全部代码文件行数
scripts/check-context-docs.sh                # 检查各层 CLAUDE.md / README.md
```
技术栈确定前没有 build、lint、test 命令；确定后补在这里。

## 仓库说明
> 层级：代码仓库 · 在 meta repo 中的路径：`06-app-development/app/` · 上级上下文（在 meta repo 中时）：[`../CLAUDE.md`](../CLAUDE.md)
> 本文件给 AI 看；给人看的说明在同目录的 `README.md`。

## 这里是什么
careKind App 的源代码（后端 + 护士端 App）。技术栈还没有确定，以 `../engineering/adr/` 为准；在 ADR 确定之前，本仓库只有架构骨架和各功能模块的文档，**没有可运行的代码**。

## 在这里通常要做的事
- 实现 docs/PRD.md 中的功能
- 新增功能模块（必须同时创建 CLAUDE.md + README.md）
- 写测试和评测

## 本目录特有的规则（在根目录规则之外）
- **先读** `docs/PRD.md` §6 产品逻辑、§9 护栏，再读对应功能模块的 CLAUDE.md
- 代码规范：`rules/02-code-rules.md` —— 16 条核心要求、**Tab 缩进宽度 4**、单文件 ≤ 1000 行（超过会被 hook 拦下）、导出必须写类型、禁用 any
- 分层：`src/domain`（纯业务逻辑）← `src/application`（用例编排）← `src/interfaces`（API / App 界面）；`src/adapters` 实现 domain 定义的接口。domain 里禁止出现 HTTP、数据库、供应商 SDK
- **每个功能模块目录都必须有 CLAUDE.md 和 README.md**（`scripts/check-context-docs.sh` 会检查）；模块里新增大函数（> 40 行或核心算法）时，在该模块 CLAUDE.md 的"关键函数"一节登记
- 测试只用合成数据；日志里不能有音频、转写文本、住户姓名或任何健康信息
- 所有数据和 LLM 推理在澳洲境内（ADR-0001）

## 关键文件
- src/domain/<feature>/ —— 10 个功能模块（见下表）
- src/application/
- src/adapters/
- src/interfaces/
- ../engineering/architecture.md
- ../engineering/any-whitelist.md

## 不要做
- 不要在 ADR 确定前擅自选定技术栈或初始化框架
- 不要实现 TGA 红灯功能
- 不要在 domain 层直接调用供应商 SDK

## 功能模块地图（对应 docs/PRD.md §6）
| 模块 | 职责 | PRD |
|---|---|---|
| `shift-session` | 班次会话状态机 | §6.3 |
| `segmentation` | 把片段切成"每次只关于一位老人"的事件 | §6.2、§4.3 |
| `attribution` | 事件 → 老人归属（最关键的算法） | §6.4 |
| `tiering` | 风险分级与确认权限 | §6.5 |
| `drafting` | 一个事件生成多份文书草稿 | §6.6、§14 |
| `fact-check` | 草稿与原话的事实一致性检查 | §6.6、护栏 G2/G3 |
| `review` | 草稿审核状态机（PCW / RN） | §6.3、§7.2 |
| `records` | 已确认记录、老人档案时间线、更正 | §4.4、护栏 G7 |
| `handover` | ISBAR 交接摘要 | §7.4 |
| `consent` | 老人退出、声纹同意 | §7.8 |

## 相关
- docs/PRD.md
- rules/02-code-rules.md
- 06-app-development/clinical-safety/
