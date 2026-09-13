#!/bin/zsh
# Per package vitest, one package at a time (MILESTONES-2 acceptance rows), logged.
cd /Users/kevinliu/repos/Turboslide
OUT=docs/gslides-parity/verification-2/check/unit-sweep.log
: > $OUT
for p in packages/schema packages/lint packages/store packages/agent apps/cli packages/mcp packages/fonts apps/render-worker packages/headless packages/viewer packages/chrome packages/render packages/export; do
  echo "=== $p ===" >> $OUT
  start=$(date +%s)
  (cd $p && ../../node_modules/.bin/vitest run 2>&1 | tail -25) >> $OUT 2>&1
  echo "--- exit ${pipestatus[1]} in $(( $(date +%s) - start )) s" >> $OUT
done
echo "SWEEP DONE" >> $OUT
