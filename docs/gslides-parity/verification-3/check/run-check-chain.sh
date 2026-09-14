#!/bin/sh
# The verifier's check chain driver (MILESTONES-3 "Verifier" item 2): `node scripts/check.mjs` in
# full, and when a step stops the chain, again from the next step, so every one of the 28 steps
# runs on the merged tree; each segment's log lands beside this script. Step 27 needs `vite
# preview --port 4344` over the production build of step 6, so the driver starts it once the
# first segment has passed step 6 and stops it at the end. Nothing here builds outside step 6.
cd /Users/kevinliu/repos/Turboslide || exit 1
OUT=docs/gslides-parity/verification-3/check
PREVIEW_PID=""
start_preview() {
  if [ -z "$PREVIEW_PID" ] && [ -d apps/studio/dist/client ]; then
    (cd apps/studio && nohup ../../node_modules/.bin/vite preview --port 4344 --strictPort > ../../$OUT/vite-preview-4344.log 2>&1 &
     echo $! > ../../$OUT/vite-preview-4344.pid)
    PREVIEW_PID=$(cat $OUT/vite-preview-4344.pid)
    echo "driver: vite preview started on 4344 (pid $PREVIEW_PID)" >> $OUT/driver.log
  fi
}
echo "driver: start $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" > $OUT/driver.log
from=1
segment=0
while [ "$from" -le 28 ]; do
  segment=$((segment + 1))
  if [ "$from" -eq 1 ]; then log=$OUT/check-full.log; node scripts/check.mjs > $log 2>&1; else log=$OUT/check-from-$from.log; node scripts/check.mjs --from $from > $log 2>&1; fi
  code=$?
  echo "driver: segment $segment from $from exit $code $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $OUT/driver.log
  # the step that failed, from the log's last FAIL line
  failed=$(grep -o "check [ 0-9]*/28: FAIL" $log | tail -1 | sed 's/check *\([0-9]*\)\/28: FAIL/\1/')
  if [ "$code" -eq 0 ]; then break; fi
  if [ -z "$failed" ]; then echo "driver: no FAIL line in $log; stopping" >> $OUT/driver.log; break; fi
  # the preview for step 27 once the build of step 6 exists
  if [ "$failed" -ge 6 ]; then start_preview; fi
  from=$((failed + 1))
done
# a segment that passed step 6 without failing also needs the preview before 27: handled above only
# on failure, so start it here too when the chain reached past 6 in one go (no-op when running)
start_preview
if [ -n "$PREVIEW_PID" ]; then kill $PREVIEW_PID 2>/dev/null; echo "driver: vite preview stopped" >> $OUT/driver.log; fi
echo "driver: done $(date -u +%FT%TZ)" >> $OUT/driver.log
echo done > $OUT/chain-done.flag
