# CLAUDE.md — scripts（App 仓库）

> 层级：子目录 · 上级上下文：[`../CLAUDE.md`](../CLAUDE.md)

## 这里是什么
从 meta repo 同步过来的检查脚本：`check-file-length.sh`（单文件 ≤ 1000 行）、`check-context-docs.sh`（分层文档检查）。`.claude/settings.json` 的 hook 和 `.githooks/pre-commit` 依赖它们。

## 本目录特有的规则
- **不要在这里修改脚本**：到 meta repo 的 `scripts/` 修改，再运行 meta 的 `scripts/sync-app-tooling.sh` 同步过来
- App 专用的新脚本可以放这里，但要遵守代码规范（Tab 缩进 4、`set -euo pipefail`、显式错误处理），并更新 README.md

## 不要做
- 不要删除或改名这两个脚本（hook 和 pre-commit 会失效）
