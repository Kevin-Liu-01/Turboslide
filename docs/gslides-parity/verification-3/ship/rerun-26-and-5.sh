#!/bin/sh
# The ship step's reruns after the chain: step 26 alone (the round three specs, with the share
# spec's owner context and viewer locator fixed after the chain's own step 26 ran) and step 5 alone
# (the whole tree's vitest run, with the per test budgets of finding 45), one after the other so
# neither loads the other. Logs beside this script as .txt.
cd /Users/kevinliu/repos/Turboslide || exit 1
OUT=docs/gslides-parity/verification-3/ship
echo "rerun: start $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" > $OUT/rerun.txt
node scripts/check.mjs --only 26 > $OUT/check-only-26.txt 2>&1
echo "rerun: only 26 exit $? $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $OUT/rerun.txt
node scripts/check.mjs --only 5 > $OUT/check-only-5.txt 2>&1
echo "rerun: only 5 exit $? $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $OUT/rerun.txt
echo done > $OUT/rerun-done.flag
