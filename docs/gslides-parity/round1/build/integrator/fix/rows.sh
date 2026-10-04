#!/bin/zsh
# The integrator fixer's narrowed reruns on 4510 (Round 1 fix round): the whole present spec, so the
# laser row runs after the tests that write the title, then the trash and listing rows. Each run
# starts at a one minute load under 24 (five minute waits otherwise); the loads go to the ledger.
set -u
S=/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/r1fix-int
R=/Users/kevinliu/repos/Turboslide-next
cd $R
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
    present) run present --only specs --spec present ;;
    decks) run decks --only specs --spec decks ;;
    trash) run trash --only specs --rows decks.trash.listed-after-move,decks.trash.restore,decks.trash.lists-after-restore,decks.trash.delete-forever-cancel,decks.trash.delete-forever-button,decks.trash.delete-forever-enter,decks.trash.editor-undo-snackbar,decks.trash.button-heights,decks.trash.confirm-dialog-chrome,decks.list.own-and-shared,decks.list.action-scoped,decks.trash.leaves-at-once,decks.trash.enter-confirms,decks.trash.empty-not-primary ;;
  esac
done
