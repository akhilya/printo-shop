#!/bin/sh
set -e
BACKEND_URL="${BACKEND_URL:-${VITE_MEDUSA_BACKEND_URL:-https://api.printo.studio}}"
BACKEND_URL="${BACKEND_URL%/}"
export BACKEND_URL
envsubst '${BACKEND_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
