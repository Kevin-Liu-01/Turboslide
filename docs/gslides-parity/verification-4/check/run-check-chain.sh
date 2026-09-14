#!/bin/sh
# The verifier's check chain driver for round four (MILESTONES-4 "Verifier" item 2; the round
# three driver under verification-3/check/ with 31 steps): `node scripts/check.mjs` in full, and
# when a step stops the chain, again from the next step, so every one of the 31 steps runs on the
# merged tree; each segment's log lands beside this script. Step 27 needs `vite preview --port
# 4344` over the production build of step 6 with the runner's environment on the file store
# (integrator.md section 18), so the driver starts it once a segment has passed step 6 and stops
# it at the end. Nothing here builds outside steps 6, 30 and 31 of the chain itself.
cd /Users/kevinliu/repos/Turboslide || exit 1
OUT=docs/gslides-parity/verification-4/check
PREVIEW_PID=""
start_preview() {
  if [ -z "$PREVIEW_PID" ] && [ -d apps/studio/dist/client ]; then
    (cd apps/studio && TURBOSLIDE_REALTIME=memory TURBOSLIDE_AUTH_DB=.turboslide/auth-verifier4-preview.sqlite TURBOSLIDE_MAIL=capture TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_RATE_LIMIT=off TURBOSLIDE_SESSION_SECRET=verifier4-preview-session-secret-000000000000 TURBOSLIDE_DOWNLOAD_SECRET=verifier4-preview-download-secret-0000000000 nohup ../../node_modules/.bin/vite preview --port 4344 --strictPort > ../../$OUT/vite-preview-4344.log 2>&1 &
     echo $! > ../../$OUT/vite-preview-4344.pid)
    PREVIEW_PID=$(cat $OUT/vite-preview-4344.pid)
    echo "driver: vite preview started on 4344 (pid $PREVIEW_PID) $(date -u +%FT%TZ)" >> $OUT/driver.log
  fi
}
echo "driver: start $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" > $OUT/driver.log
from=1
segment=0
while [ "$from" -le 31 ]; do
  segment=$((segment + 1))
  if [ "$from" -ge 27 ]; then start_preview; fi
  if [ "$from" -eq 1 ]; then log=$OUT/check-full.log; node scripts/check.mjs > $log 2>&1; else log=$OUT/check-from-$from.log; node scripts/check.mjs --from $from > $log 2>&1; fi
  code=$?
  echo "driver: segment $segment from $from exit $code $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $OUT/driver.log
  failed=$(grep -o "check [ 0-9]*/31: FAIL" $log | tail -1 | sed 's/check *\([0-9]*\)\/31: FAIL/\1/')
  if [ "$code" -eq 0 ]; then break; fi
  if [ -z "$failed" ]; then echo "driver: no FAIL line in $log; stopping" >> $OUT/driver.log; break; fi
  if [ "$failed" -ge 6 ]; then start_preview; fi
  from=$((failed + 1))
done
if [ -n "$PREVIEW_PID" ]; then kill $PREVIEW_PID 2>/dev/null; echo "driver: vite preview stopped $(date -u +%FT%TZ)" >> $OUT/driver.log; fi
echo "driver: done $(date -u +%FT%TZ)" >> $OUT/driver.log
echo done > $OUT/chain-done.flag
