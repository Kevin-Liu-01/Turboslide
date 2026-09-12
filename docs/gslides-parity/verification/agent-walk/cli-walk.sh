#!/bin/bash
# The local agent walk of the verifier: every new action through `turboslide <command> --json` on a
# temp deck created from the blank template; the deck validates after each write.
cd /Users/kevinliu/repos/Turboslide
export TURBOSLIDE_DECKS_DIR="$W/decks"
T="node apps/cli/bin/turboslide.mjs"
D="$W/decks/agent-walk"
run() { echo "\$ turboslide $*"; $T "$@" --json 2>&1 | head -c 1500; echo; echo "exit ${PIPESTATUS[0]}"; echo; }
val() { echo "\$ turboslide validate <deck>"; $T validate "$D" --json 2>&1 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(JSON.stringify({ok:j.ok,revision:j.revision,slides:j.slides?.length??j.counts?.slides,errors:j.errors?.length}))}catch{console.log(s.slice(0,300))}})"; echo; }
GT_SLIDE=$(node -e "const d=require('./decks/gt-brand/deck.json'); console.log(d.sections[0].slideIds[1])")
run deck create "Agent walk" --from blank
val
run slide new --layout big-number --after title --deck "$D"
val
run slides --deck "$D"
NEW=$(node -e "const d=require('$D/deck.json'); console.log(d.sections[0].slideIds[1])")
echo "new slide id: $NEW"
run block set "$NEW#h" /text "Acme grew 42 percent" --deck "$D"
run block set "$NEW#p1" /text "Acme is the customer." --deck "$D"
val
run slide duplicate "$NEW" --deck "$D"
val
run block duplicate "$NEW" --blocks p1 --deck "$D"
val
run text replace Acme Globex --deck "$D"
val
run slide apply-layout "$NEW" title --deck "$D"
val
run slide skip "$NEW" --deck "$D"
run slide skip "$NEW" --off --deck "$D"
run slide skip "$NEW" --deck "$D"
val
run slide import gt-brand "$GT_SLIDE" --after title --deck "$D"
val
run slides --deck "$D"
run export txt --include-skipped --deck "$D"
run export txt --deck "$D"
run deck copy agent-walk --name "Agent walk copy" --slides "title,$NEW" --remove-notes
run deck list
run deck trash agent-walk-copy
run deck list
run deck list --include-trashed
run deck restore agent-walk-copy
run deck remove agent-walk-copy --confirm
run deck list
run deck set /defaults/appearance light --deck "$D"
run deck set /defaults/counter off --deck "$D"
run deck set /defaults/counter --deck "$D" --unset
run deck set --unset /defaults/appearance --deck "$D"
run deck set /title "Agent walk renamed" --deck "$D"
val
echo "\$ node -e defaults of deck.json"; node -e "const d=require('$D/deck.json'); console.log(JSON.stringify({title:d.title, defaults:d.defaults, revision:d.revision}))"; echo
run info --deck "$D"
echo "--- view.zoom has no CLI transport (window, mcp); exercised through the window API by the parity audit and through MCP below ---"
