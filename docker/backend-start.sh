#!/bin/sh
set -e

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "Set POSTGRES_PASSWORD in Dokploy Environment."
  echo "Do not set DATABASE_URL — the app builds it from POSTGRES_*."
  exit 1
fi

export POSTGRES_USER="${POSTGRES_USER:-medusa-js}"
export POSTGRES_DB="${POSTGRES_DB:-medusa}"
export POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
export REDIS_URL="${REDIS_URL:-redis://redis:6379}"

export DATABASE_URL="$(
  node -e 'const user = encodeURIComponent(process.env.POSTGRES_USER); const pass = encodeURIComponent(process.env.POSTGRES_PASSWORD); const db = encodeURIComponent(process.env.POSTGRES_DB); const host = process.env.POSTGRES_HOST || "postgres"; process.stdout.write("postgres://" + user + ":" + pass + "@" + host + ":5432/" + db)'
)"

echo "Connecting to postgres as ${POSTGRES_USER} db=${POSTGRES_DB} host=${POSTGRES_HOST}..."
echo "Running database migrations..."
npx medusa db:migrate --execute-all-links
echo "Starting Medusa..."
exec npx medusa start
