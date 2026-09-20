#!/bin/zsh
cd /private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/product/interface
for r in 1440-light 1440-dark 1280-light; do
  node editor.mjs --only $r > editor-$r.log 2>&1
  echo "exit $? for $r" >> editor-driver.log
done
node editor.mjs --only 1280-dark --destroy > editor-1280-dark.log 2>&1
echo "exit $? for 1280-dark" >> editor-driver.log
id=$(node -e "try{console.log(require('./editor-state.json').deckId||'')}catch(e){console.log('')}")
if [ -n "$id" ]; then node destroy.mjs "$id" > editor-destroy.log 2>&1; echo "destroy exit $? for $id" >> editor-driver.log; fi
echo done >> editor-driver.log
