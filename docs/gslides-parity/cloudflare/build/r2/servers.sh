#!/bin/zsh
# R2's two process run of the do tier (docs/CLOUDFLARE.md 5.4 item 2): two vite dev servers on 4472 and
# 4482 over one tmp overlay, TURBOSLIDE_REALTIME=do against the lane's wrangler dev on 8792, the two test
# secrets equal to .dev.vars. Usage: servers.sh start | stop | status
set -u
ROOT=/Users/kevinliu/repos/Turboslide-realtime
R2=$ROOT/.turboslide/r2-do
OVERLAY=$R2/overlay
PORTS=(4472 4482)

start_one() {
  local port=$1
  mkdir -p "$OVERLAY" "$R2/logs"
  (
    cd "$ROOT/.turboslide/r2-do/shadow/apps/studio" || exit 1
    env \
      TURBOSLIDE_STORE=tmp \
      TURBOSLIDE_OVERLAY_DIR="$OVERLAY" \
      TURBOSLIDE_REALTIME=do \
      TURBOSLIDE_ROOM_HOST=127.0.0.1:8792 \
      TURBOSLIDE_ROOM_INSECURE=1 \
      TURBOSLIDE_ROOM_SECRET=<the test value of .turboslide/r2-do/worker/.dev.vars> \
      TURBOSLIDE_ROOM_BEARER=<the test value of .turboslide/r2-do/worker/.dev.vars> \
      TURBOSLIDE_LOCAL_OPEN=1 \
      TURBOSLIDE_AUTH_DB="$ROOT/.turboslide/auth-r2-$port.sqlite" \
      TURBOSLIDE_MAIL=capture \
      TURBOSLIDE_AUTH_RATE_LIMIT=off \
      TURBOSLIDE_SESSION_SECRET=r2-two-process-session-secret-0000000000000000 \
      TURBOSLIDE_DOWNLOAD_SECRET=r2-two-process-download-secret-000000000000000 \
      TURBOSLIDE_BUILD_COMMIT="$(git rev-parse HEAD)" \
      TURBOSLIDE_INSTANCE_NAME="port-$port" \
      "$ROOT/node_modules/.bin/vite" dev --host 127.0.0.1 --port "$port" --strictPort >> "$R2/logs/server-$port.log" 2>&1
  ) &
  echo $! > "$R2/server-$port.pid"
}

case "${1:-}" in
  start)
    for p in $PORTS; do
      if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then echo "$p busy"; continue; fi
      start_one $p
      echo "started $p (tier do, vite dev)"
    done
    ;;
  stop)
    for p in $PORTS; do
      pids=$(lsof -nP -t -iTCP:$p -sTCP:LISTEN 2>/dev/null)
      if [ -n "$pids" ]; then echo "$pids" | xargs kill 2>/dev/null; echo "stopped $p"; fi
      rm -f "$R2/server-$p.pid"
    done
    ;;
  status)
    for p in $PORTS 8792; do
      if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then echo "$p up"; else echo "$p down"; fi
    done
    ;;
  *)
    echo "usage: servers.sh start | stop | status"; exit 2;;
esac
