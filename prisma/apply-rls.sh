#!/usr/bin/env bash
# 在 prisma migrate 之后执行：用表的 owner 连接应用 prisma/rls.sql，并给 carekind_app 角色设置登录密码。
# 密码从 .env 的 CAREKIND_APP_DB_PASSWORD 读取，不写在仓库里（rules/02 核心要求 03）。
# 用法：npm run db:rls
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
	echo "❌ 缺少 .env：先复制 .env.example 并填写。" >&2
	exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${DATABASE_MIGRATION_URL:?在 .env 里设置 DATABASE_MIGRATION_URL}"
: "${CAREKIND_APP_DB_PASSWORD:?在 .env 里设置 CAREKIND_APP_DB_PASSWORD}"
if [[ "$CAREKIND_APP_DB_PASSWORD" == *"'"* ]]; then
	echo "❌ CAREKIND_APP_DB_PASSWORD 不能包含单引号。" >&2
	exit 1
fi

npx prisma db execute --file prisma/rls.sql --url "$DATABASE_MIGRATION_URL"
echo "ALTER ROLE carekind_app WITH LOGIN PASSWORD '${CAREKIND_APP_DB_PASSWORD}';" |
	npx prisma db execute --stdin --url "$DATABASE_MIGRATION_URL"
echo "✅ RLS 策略已应用，carekind_app 角色可以登录。"
