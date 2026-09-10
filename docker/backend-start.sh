#!/bin/sh
set -e
echo "Running database migrations..."
npx medusa db:migrate --execute-all-links
echo "Starting Medusa..."
exec npx medusa start
