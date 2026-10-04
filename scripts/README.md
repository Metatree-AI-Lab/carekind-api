# scripts

Owner: Lin (Tech Lead) · Last reviewed: 04/10/2026

检查脚本，**从 meta repo 同步**（meta 的 `scripts/sync-app-tooling.sh`），不要直接在这里修改。

- `check-file-length.sh` — 代码文件 ≤ 1000 行（hook / pre-commit / CI）
- `check-context-docs.sh` — 每层目录都有 README.md + CLAUDE.md + AGENTS.md 软链接
