#!/bin/sh
# The verifier's `deck follow` row against the preview (MILESTONES-3 "Verifier": a local checkout
# follows a hosted deck byte for byte): a one slide scratch copy through the bearer, `deck pull`
# into a scratch decks folder, `deck follow` polling while a bearer `slide.update` lands, then the
# local slide file against the hosted `slide.get`. The bearer and the OIDC token come from the
# environment and are never printed; the scratch deck is trashed and removed at the end.
cd /Users/kevinliu/repos/Turboslide || exit 1
D=.turboslide/v3p2/follow-decks; rm -rf $D; mkdir -p $D
CLI="node apps/cli/bin/turboslide.mjs"
act() { curl -s -X POST -H "authorization: Bearer $TURBOSLIDE_TOKEN" -H "x-vercel-trusted-oidc-idp-token: $VERCEL_OIDC_TOKEN" -H 'content-type: application/json' "$PREVIEW/api/actions/$1?deck=$2" -d "$3"; }
REV=$(act deck.info gt-brand '{}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).revision))")
FIRST=$(act slide.list gt-brand '{}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(Array.isArray(j)?j[0].id:j.slides[0].id)})")
ID=verifier-follow-$(date +%s | tail -c 6)
echo "scratch $ID from gt-brand slide $FIRST at revision $REV"
act deck.copy gt-brand "{\"id\":\"gt-brand\",\"name\":\"Verifier follow\",\"newId\":\"$ID\",\"slideIds\":[\"$FIRST\"],\"baseRevision\":$REV}" | cut -c1-120; echo
T0=$(date +%s%N)
$CLI deck pull $ID --from $PREVIEW --token "$TURBOSLIDE_TOKEN" --decks $D 2>&1 | sed "s#$TURBOSLIDE_TOKEN#<bearer>#g" | cut -c1-200
echo "pull took $(( ($(date +%s%N) - T0) / 1000000 )) ms"
$CLI deck follow $ID --from $PREVIEW --decks $D > .turboslide/v3p2/follow.out 2>&1 &
FPID=$!
sleep 8
R=$(act deck.info $ID '{}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).revision))")
T1=$(date +%s%N)
act slide.update $ID "{\"slideId\":\"$FIRST\",\"baseRevision\":$R,\"mutations\":[{\"op\":\"slide.set\",\"slideId\":\"$FIRST\",\"path\":\"/notes\",\"value\":\"followed from the preview\"}]}" | cut -c1-80; echo
echo "bearer slide.update at +8 s (revision $R -> $((R+1)))"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if grep -q "applied record" .turboslide/v3p2/follow.out; then echo "follow applied the record after $(( ($(date +%s%N) - T1) / 1000000 )) ms"; break; fi
  sleep 1
done
sleep 3; kill $FPID 2>/dev/null; wait $FPID 2>/dev/null
echo "--- follow output (masked)"; sed "s#$TURBOSLIDE_TOKEN#<bearer>#g" .turboslide/v3p2/follow.out | cut -c1-200
echo "token saved lines: $(grep -c 'saved to' .turboslide/v3p2/follow.out)"
echo "--- byte comparison"
act slide.get $ID "{\"slideId\":\"$FIRST\"}" > .turboslide/v3p2/follow-hosted-slide.json
node -e "
const fs=require('fs'); const path=require('path');
const hosted=JSON.parse(fs.readFileSync('.turboslide/v3p2/follow-hosted-slide.json','utf8'));
const dir='$D/$ID'; const files=[]; (function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f); if(fs.statSync(p).isDirectory()) walk(p); else if(f.endsWith('.json')) files.push(p);}})(dir);
const slideFile=files.find(f=>f.endsWith('/$FIRST.json')||f.endsWith('$FIRST.json'));
const local=slideFile?fs.readFileSync(slideFile,'utf8'):null;
const hostedSlide=hosted.slide??hosted;
const same=local!==null && JSON.stringify(JSON.parse(local))===JSON.stringify(hostedSlide);
console.log('local slide file', slideFile, local?local.length+' bytes':'missing');
console.log('hosted slide.get notes', JSON.stringify(hostedSlide.notes), '; local notes', local?JSON.stringify(JSON.parse(local).notes):null);
console.log('deep equal', same, '; byte equal to JSON.stringify(hosted, null, 2)+newline', local===JSON.stringify(hostedSlide,null,2)+'\n');
const deck=JSON.parse(fs.readFileSync(path.join(dir,'deck.json'),'utf8')); console.log('local deck.json revision', deck.revision);
"
R2=$(act deck.info $ID '{}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).revision))")
act deck.trash $ID "{\"id\":\"$ID\",\"baseRevision\":$R2}" | cut -c1-60; echo
R3=$(act deck.info $ID '{}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).revision))")
act deck.remove $ID "{\"id\":\"$ID\",\"confirm\":true,\"baseRevision\":$R3}" | cut -c1-60; echo
echo "hosts.json entries: $(node -e "console.log(Object.keys(require(process.env.HOME+'/.config/turboslide/hosts.json').hosts).join(' '))")"
