#!/bin/zsh
# Waits for the shared e2e lock, takes it, runs the named specs against 4331 one after another, releases it.
cd /Users/kevinliu/repos/Turboslide
LOCK=.turboslide/e2e.lock
OUT=.turboslide/b2-fix
waited=0
while ! mkdir "$LOCK" 2>/dev/null; do
  sleep 5; waited=$((waited+5))
  if [ $waited -ge 1500 ]; then echo "gave up waiting for $LOCK after ${waited}s" > "$OUT/specs.status"; exit 1; fi
done
echo "lock taken after ${waited}s at $(date)" > "$OUT/specs.status"
for spec in "$@"; do
  name=$(basename "$spec" .spec.ts)
  echo "== $spec $(date)" >> "$OUT/specs.status"
  PLAYWRIGHT_BASE_URL=http://localhost:4331 node_modules/.bin/playwright test "$spec" --reporter=list > "$OUT/spec-$name.log" 2>&1
  echo "exit $? for $spec at $(date)" >> "$OUT/specs.status"
done
rmdir "$LOCK"
echo "done $(date)" >> "$OUT/specs.status"
