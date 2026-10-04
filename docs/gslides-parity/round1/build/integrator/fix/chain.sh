#!/bin/zsh
# Plumbing only: the realtime round's commits after 52c701f3 (the rebased twin of e8b20fec, this
# branch's cut) replayed onto a base commit with merge-tree and commit-tree. No ref, index or
# working tree moves; the result is a dangling commit id the export reads.
set -u
cd /Users/kevinliu/repos/Turboslide-next
prev=$(git rev-parse ${1:-HEAD})
for c in $(git rev-list --reverse 52c701f3..realtime/round); do
  subj=$(git log -1 --format=%s $c)
  out=$(git merge-tree --write-tree --merge-base $c^ $prev $c 2>&1)
  code=$?
  tree=$(echo "$out" | head -1)
  if [[ $code -ne 0 ]]; then
    echo "CONFLICT $c $subj"
    echo "$out" | sed -n '2,$p' | grep -E "^CONFLICT|^[0-9]+ [0-9a-f]+ [0-9] " | head -20
    continue
  fi
  prev=$(git commit-tree $tree -p $prev -m "replay $c $subj")
  echo "ok $c -> $prev $subj"
done
echo "TIP $prev"
