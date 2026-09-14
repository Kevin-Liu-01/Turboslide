#!/bin/sh
# The hotfix ship step's check chain driver (VERIFICATION-3 section 17.4). Two segments so step 27
# has its production preview: steps 2 to 6 first (step 6 builds), then `vite preview --port 4344`
# over that build, then steps 7 to 28 without 25 (Docker is excluded by the round's rule). When a
# step stops the chain the driver resumes at the next step inside the same segment (finding 56:
# the verifier's driver left segment 1 at its first failure and step 6 never ran), so every step
# runs on the tree once. Logs are `.txt` under docs/gslides-parity/verification-3/hotfix-ship/.
# The e2e lock is taken by the caller and held for the whole run.
cd /Users/kevinliu/repos/Turboslide || exit 1
OUT=docs/gslides-parity/verification-3/hotfix-ship
mkdir -p $OUT
ONLY_A=2,3,4,5,6
ONLY_B=7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,26,27,28
echo "driver: start $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" > $OUT/driver.txt

run_segment() {
  # $1 the first step, $2 the last step, $3 the --only list
  from=$1
  last=$2
  only=$3
  while [ "$from" -le "$last" ]; do
    log=$OUT/check-from-$from.txt
    node scripts/check.mjs --from $from --only $only > $log 2>&1
    code=$?
    echo "driver: from $from exit $code $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $OUT/driver.txt
    if [ "$code" -eq 0 ]; then return 0; fi
    failed=$(grep -o "check [ 0-9]*/28: FAIL" $log | tail -1 | sed 's/check *\([0-9]*\)\/28: FAIL/\1/')
    if [ -z "$failed" ]; then echo "driver: no FAIL line in $log; stopping the segment" >> $OUT/driver.txt; return 1; fi
    from=$((failed + 1))
  done
  return 0
}

run_segment 2 6 $ONLY_A
PREVIEW_PID=""
if [ -d apps/studio/dist/client ]; then
  (cd apps/studio && nohup ../../node_modules/.bin/vite preview --port 4344 --strictPort > ../../$OUT/vite-preview-4344.txt 2>&1 &
   echo $! > ../../$OUT/vite-preview-4344.pid)
  PREVIEW_PID=$(cat $OUT/vite-preview-4344.pid)
  echo "driver: vite preview started on 4344 (pid $PREVIEW_PID)" >> $OUT/driver.txt
  sleep 4
fi
run_segment 7 28 $ONLY_B
if [ -n "$PREVIEW_PID" ]; then kill $PREVIEW_PID 2>/dev/null; echo "driver: vite preview stopped" >> $OUT/driver.txt; fi
echo "driver: done $(date -u +%FT%TZ)" >> $OUT/driver.txt
echo done > $OUT/chain-done.flag
