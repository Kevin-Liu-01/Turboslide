#!/bin/zsh
# Finding 1's rows on the scratch rebased tree (build-rebased.sh), served on 4510 by
# server-rebased.sh: the walk areas of the undo class and the other walk rows, then the spec rows.
# The gate runs from the export, so its drivers are the realtime round's. Load rule as rows.sh.
set -u
S=/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/r1fix-int
B=$S/rebased
cd $B
load() { uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/'; }
wait_load() {
  while :; do
    l=$(load)
    if (( l < 24 )); then return; fi
    echo "$(date -u +%FT%TZ) waiting, load $l" >> $S/ledger.tsv
    sleep 300
  done
}
run() {
  name=$1; shift
  wait_load
  echo "$(date -u +%FT%TZ)\t$name\tstart\tload $(load)" >> $S/ledger.tsv
  node scripts/probes/core-gate.mjs --base http://localhost:4510 --tier memory --lock $S/lock \
    --out $S/out-$name --matrix $S/$name.json "$@" > $S/$name.log 2>&1
  code=$?
  echo "$(date -u +%FT%TZ)\t$name\tend $code\tload $(load)" >> $S/ledger.tsv
}
for what in "$@"; do
  case $what in
    walk) run rebased-walk --only probe --areas arrange,images,versions,text,help ;;
    specs) run rebased-specs --only specs --rows images.insert.no-external-banner,export.refusal.sentence-and-retry,export.picture.progress-and-capture,shaders.export.missing-frame-row,sync.resend.idempotent,decks.recent.this-browser-sentence ;;
  esac
done
