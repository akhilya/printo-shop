#!/bin/sh
set -e

if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ]; then
  echo "Set POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB in Dokploy Environment."
  echo "Do not set DATABASE_URL — the app builds it itself."
  exit 1
fi

export DATABASE_URL="$(
  node -e "const u=process.env.POSTGRES_USER; const p=encodeURIComponent(process.env.POSTGRES_PASSWORD); const d=process.env.POSTGRES_DB; process.stdout.write('postgres://'+u+':'+p+'@postgres:5432/'+d)"
)"
export REDIS_URL="${REDIS_URL:-redis://redis:6379}"

echo "Connecting to postgres as ${POSTGRES_USER}..."
echo "Running database migrations..."
npx medusa db:migrate --execute-all-links
echo "Starting Medusa..."
exec npx medusa start
