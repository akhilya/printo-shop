#!/bin/sh
set -e

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "Set POSTGRES_PASSWORD in Dokploy Environment."
  echo "Do not set DATABASE_URL, POSTGRES_USER or POSTGRES_DB."
  exit 1
fi

export POSTGRES_USER=medusa
export POSTGRES_DB=medusa
export POSTGRES_HOST="${POSTGRES_HOST:-printo-pg}"
export REDIS_URL="${REDIS_URL:-redis://redis:6379}"
unset DATABASE_URL

export DATABASE_URL="$(
  node -e 'const user = encodeURIComponent(process.env.POSTGRES_USER); const pass = encodeURIComponent(process.env.POSTGRES_PASSWORD); const db = encodeURIComponent(process.env.POSTGRES_DB); const host = process.env.POSTGRES_HOST || "printo-pg"; process.stdout.write("postgres://" + user + ":" + pass + "@" + host + ":5432/" + db)'
)"

echo "Connecting to postgres as ${POSTGRES_USER} db=${POSTGRES_DB} host=${POSTGRES_HOST} pass_len=${#POSTGRES_PASSWORD}..."

node -e 'const {Client}=require("pg"); const u=new URL(process.env.DATABASE_URL); console.log("Preflight", u.username+"@"+u.hostname+u.pathname, "pass_len="+decodeURIComponent(u.password||"").length); const c=new Client({connectionString:process.env.DATABASE_URL,ssl:false}); c.connect().then(()=>{console.log("Preflight auth ok"); return c.end();}).catch((e)=>{console.error("Preflight auth failed:", e.message); process.exit(1);});'

echo "Running database migrations..."
npx medusa db:migrate --execute-all-links
echo "Starting Medusa..."
exec npx medusa start
