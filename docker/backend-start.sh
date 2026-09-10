#!/bin/sh
set -e

export POSTGRES_USER="${POSTGRES_USER:-medusa}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-medusa}"
export POSTGRES_DB="${POSTGRES_DB:-medusa}"

export DATABASE_URL="$(
  node -e "const u=process.env.POSTGRES_USER; const p=encodeURIComponent(process.env.POSTGRES_PASSWORD); const d=process.env.POSTGRES_DB; process.stdout.write('postgres://'+u+':'+p+'@postgres:5432/'+d)"
)"
export REDIS_URL="${REDIS_URL:-redis://redis:6379}"

echo "Connecting to postgres as ${POSTGRES_USER}..."
echo "Running database migrations..."
npx medusa db:migrate --execute-all-links
echo "Starting Medusa..."
exec npx medusa start
