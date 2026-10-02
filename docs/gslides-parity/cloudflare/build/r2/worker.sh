#!/bin/zsh
# R2's wrangler dev on 8792 (docs/CLOUDFLARE.md 5.4 item 1) over the lane's config copy and its own local
# state folder; the local D1 is migrated first. Usage: worker.sh start | stop | status | migrate
set -u
ROOT=/Users/kevinliu/repos/Turboslide-realtime
R2=$ROOT/.turboslide/r2-do
cd "$ROOT/apps/realtime-worker" || exit 1
case "${1:-}" in
  migrate)
    pnpm exec wrangler d1 migrations apply turboslide-accounts --local -c "$R2/worker/wrangler.jsonc" --persist-to "$R2/state"
    ;;
  start)
    if lsof -nP -iTCP:8792 -sTCP:LISTEN >/dev/null 2>&1; then echo "8792 busy"; exit 0; fi
    (pnpm exec wrangler dev --port 8792 --ip 127.0.0.1 -c "$R2/worker/wrangler.jsonc" --persist-to "$R2/state" --show-interactive-dev-session=false >> "$R2/logs/wrangler-8792.log" 2>&1) &
    echo $! > "$R2/wrangler.pid"
    echo "started wrangler dev 8792"
    ;;
  stop)
    pids=$(lsof -nP -t -iTCP:8792 -sTCP:LISTEN 2>/dev/null)
    if [ -n "$pids" ]; then echo "$pids" | xargs kill 2>/dev/null; echo "stopped 8792"; fi
    if [ -f "$R2/wrangler.pid" ]; then kill "$(cat "$R2/wrangler.pid")" 2>/dev/null; rm -f "$R2/wrangler.pid"; fi
    ;;
  status)
    if lsof -nP -iTCP:8792 -sTCP:LISTEN >/dev/null 2>&1; then echo "8792 up"; else echo "8792 down"; fi
    ;;
  *) echo "usage: worker.sh start | stop | status | migrate"; exit 2;;
esac
