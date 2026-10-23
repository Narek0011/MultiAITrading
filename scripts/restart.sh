#!/bin/sh
# Dev helper: rebuild and restart the app in the background, log to $1
cd "$(dirname "$0")/.."
pkill -f "node dist/main" 2>/dev/null
npm run build >/dev/null 2>&1 || { npm run build; exit 1; }
nohup node dist/main > "${1:-/tmp/multiaitrading.log}" 2>&1 &
sleep 4
tail -3 "${1:-/tmp/multiaitrading.log}"
