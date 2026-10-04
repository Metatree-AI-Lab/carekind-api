# careKind App

Owner: Lin (Tech Lead) · Last reviewed: 04/10/2026

careKind AI 后端和护士端 App 的代码仓库。作为 submodule 挂在 meta repo [Metatree-AI-Lab/carekind](https://github.com/Metatree-AI-Lab/carekind) 的 `06-app-development/app/`。**技术栈待 ADR 确定**（meta repo `06-app-development/engineering/adr/`），目前只有架构骨架和各功能模块的文档。

## 获取代码
```bash
# 推荐：连同 meta repo 一起 clone（能用到完整规则、PRD、skills、法律参考库）
git clone --recurse-submodules git@github.com:Metatree-AI-Lab/carekind.git
cd carekind/06-app-development/app

# 或者单独 clone
git clone git@github.com:Metatree-AI-Lab/carekind-app.git

# 在 meta repo 根目录运行（会初始化本 submodule 并启用两个仓库的 pre-commit）
scripts/setup.sh

# 如果是单独 clone 本仓库：每个 clone 执行一次
git config core.hooksPath .githooks
```
> 在 meta repo 里如果 `06-app-development/app/` 是空的，说明 submodule 还没安装：在 meta repo 根目录运行 `scripts/setup.sh` 或 `git submodule update --init --recursive`。

## 结构
```
src/
	domain/          业务规则，按功能模块分目录（每个模块都有 CLAUDE.md + README.md）
		shift-session/   segmentation/   attribution/   tiering/   drafting/
		fact-check/      review/         records/       handover/  consent/
	application/     用例编排
	adapters/        外部系统（语音转写、LLM、声纹、CMS、存储、认证）
	interfaces/      API 和 App 界面
scripts/           检查脚本（从 meta repo 同步，不要直接改）
```

## 开始之前
1. 读 meta repo 的 `docs/PRD.md`（产品逻辑 §6、护栏 §9）
2. 读 meta repo 的 `rules/02-code-rules.md`（Tab 缩进 4、16 条核心要求、单文件 ≤ 1000 行）
3. 编辑器开启 EditorConfig

## 在 meta repo 中更新本仓库
```bash
cd 06-app-development/app && git pull          # 拉取 App 仓库最新代码
cd ../.. && git add 06-app-development/app && git commit -m "chore: bump app submodule"
```
