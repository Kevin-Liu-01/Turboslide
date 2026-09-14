#!/bin/sh
# The ship step's check chain driver (MILESTONES-3 "Ship step" item 1), the verifier's
# verification-3/check/run-check-chain.sh with two changes: it starts at step 4 (step 1 is
# `pnpm install --frozen-lockfile`, which the ship step does not run, and step 3 fails as written
# on the uncommitted contracts until the commit below), and its logs are `.txt` beside this
# script so they travel with the commit (`*.log` is gitignored). When a step stops the chain it
# runs again from the next step, so every step from 4 to 28 runs on the fixed tree. Step 27 needs
# `vite preview --port 4344` over the production build of step 6; the driver starts it once step
# 6 has passed and stops it at the end. Nothing here builds outside step 6.
cd /Users/kevinliu/repos/Turboslide || exit 1
OUT=docs/gslides-parity/verification-3/ship
PREVIEW_PID=""
start_preview() {
  if [ -z "$PREVIEW_PID" ] && [ -d apps/studio/dist/client ]; then
    (cd apps/studio && nohup ../../node_modules/.bin/vite preview --port 4344 --strictPort > ../../$OUT/vite-preview-4344.txt 2>&1 &
     echo $! > ../../$OUT/vite-preview-4344.pid)
    PREVIEW_PID=$(cat $OUT/vite-preview-4344.pid)
    echo "driver: vite preview started on 4344 (pid $PREVIEW_PID)" >> $OUT/driver.txt
  fi
}
echo "driver: start $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" > $OUT/driver.txt
from=4
segment=0
while [ "$from" -le 28 ]; do
  segment=$((segment + 1))
  log=$OUT/check-from-$from.txt
  node scripts/check.mjs --from $from > $log 2>&1
  code=$?
  echo "driver: segment $segment from $from exit $code $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $OUT/driver.txt
  failed=$(grep -o "check [ 0-9]*/28: FAIL" $log | tail -1 | sed 's/check *\([0-9]*\)\/28: FAIL/\1/')
  if [ "$code" -eq 0 ]; then break; fi
  if [ -z "$failed" ]; then echo "driver: no FAIL line in $log; stopping" >> $OUT/driver.txt; break; fi
  if [ "$failed" -ge 6 ]; then start_preview; fi
  from=$((failed + 1))
done
start_preview
if [ -n "$PREVIEW_PID" ]; then kill $PREVIEW_PID 2>/dev/null; echo "driver: vite preview stopped" >> $OUT/driver.txt; fi
echo "driver: done $(date -u +%FT%TZ)" >> $OUT/driver.txt
echo done > $OUT/chain-done.flag
