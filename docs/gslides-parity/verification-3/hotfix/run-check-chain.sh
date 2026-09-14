#!/bin/sh
# The hotfix verifier's check chain driver (VERIFICATION-3 section 17). Two segments so step 27
# has its production preview: steps 1 to 6 first (step 6 builds), then `vite preview --port 4344`
# over that build, then steps 7 to 28 without 25 (Docker is excluded by the round's rule; the
# daemon was up on this machine, so the step is left out by number rather than skipped by the
# runner). When a step stops the chain it runs again from the next step, so every step runs on
# the tree once. Logs are `.txt` beside this script. The e2e lock is held for the whole run.
cd /Users/kevinliu/repos/Turboslide || exit 1
OUT=docs/gslides-parity/verification-3/hotfix
ONLY_B=7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,26,27,28
echo "driver: start $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" > $OUT/driver.txt
while ! mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; done
echo "driver: e2e lock taken $(date -u +%FT%TZ)" >> $OUT/driver.txt
node scripts/check.mjs --only 1,2,3,4,5,6 > $OUT/check-only-1-6.txt 2>&1
echo "driver: segment 1 (steps 1 to 6) exit $? $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $OUT/driver.txt
PREVIEW_PID=""
if [ -d apps/studio/dist/client ]; then
  (cd apps/studio && nohup ../../node_modules/.bin/vite preview --port 4344 --strictPort > ../../$OUT/vite-preview-4344.txt 2>&1 &
   echo $! > ../../$OUT/vite-preview-4344.pid)
  PREVIEW_PID=$(cat $OUT/vite-preview-4344.pid)
  echo "driver: vite preview started on 4344 (pid $PREVIEW_PID)" >> $OUT/driver.txt
  sleep 4
fi
from=7
segment=1
while [ "$from" -le 28 ]; do
  segment=$((segment + 1))
  log=$OUT/check-from-$from.txt
  node scripts/check.mjs --from $from --only $ONLY_B > $log 2>&1
  code=$?
  echo "driver: segment $segment from $from exit $code $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $OUT/driver.txt
  failed=$(grep -o "check [ 0-9]*/28: FAIL" $log | tail -1 | sed 's/check *\([0-9]*\)\/28: FAIL/\1/')
  if [ "$code" -eq 0 ]; then break; fi
  if [ -z "$failed" ]; then echo "driver: no FAIL line in $log; stopping" >> $OUT/driver.txt; break; fi
  from=$((failed + 1))
done
if [ -n "$PREVIEW_PID" ]; then kill $PREVIEW_PID 2>/dev/null; echo "driver: vite preview stopped" >> $OUT/driver.txt; fi
rmdir .turboslide/e2e.lock 2>/dev/null
echo "driver: done $(date -u +%FT%TZ)" >> $OUT/driver.txt
echo done > $OUT/chain-done.flag
