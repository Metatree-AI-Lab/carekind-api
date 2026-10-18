# CLAUDE.md — 迁移 20261018113343_init

> 层级：代码目录 · 上级上下文：[`../CLAUDE.md`](../CLAUDE.md)

## 这里是什么
第一阶段初始数据库结构（18/10/2026，由 `prisma migrate dev --name init` 从 `schema.prisma` 生成）：Provider、Facility、Unit、员工、住户、配置、审批、审计等全部管理端表。

## 规则
- 已应用，不要手改；结构变更请生成新迁移。
