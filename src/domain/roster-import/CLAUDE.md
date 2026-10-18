# CLAUDE.md — roster-import

> 路径：`06-app-development/app/src/domain/roster-import/` · 上级上下文：[`../CLAUDE.md`](../CLAUDE.md) · 给人看的说明在 `README.md`

## 这里是什么
名单 CSV 解析、比对、逐行决定（PP PRD §4.5；姓名不作匹配键；端点第一阶段后续）。

## 本目录特有的规则
- domain 模块是纯逻辑：不依赖 Nest / Prisma / HTTP；shared/policy 已有的规则直接调用，不再写一份
- 测试和种子只用虚构的 Wattle Grove Care Group 数据；日志和审计不放姓名或健康信息
- 大函数（> 40 行或核心算法）在下面登记

## 关键文件
- csv-parser.ts
- name-similarity.ts
- roster-classifier.ts
- roster-decisions.ts
- roster-import.test.ts
- row-validation.ts

## 关键函数
- 见各文件顶部的"为什么"注释；核心算法：roster-import/csv-parser.ts `splitRecords`、roster-import/roster-classifier.ts `classifyRoster`、config-policy/shift-boundaries.ts `nextShiftStart`（如本目录有）

## 不要做
- 不要放宽注释里写明的不变量
