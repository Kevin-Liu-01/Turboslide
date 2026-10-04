#!/bin/zsh
# A scratch tree that stands for the rebase the ship step makes (VERIFICATION.md "Round 1, pass 1"
# finding 1): this branch's tip with the realtime round's 32 commits after 52c701f3 (the rebased
# twin of e8b20fec, where this branch was cut) replayed by plumbing (chain.sh: merge-tree and
# commit-tree, no ref moves), then the two controller commits and the images driver commit that
# conflict applied by hand. The docs-only conflicts (the notes, VERIFICATION.md, FOCUS.md,
# .prettierignore, security.md) and the Share dialog and decks spec conflicts of 34c064ef,
# 4f4b412a and 2f1aaa84 are left out: none of finding 1's rows reads them on a vite dev server.
set -eu
S=/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/r1fix-int
R=/Users/kevinliu/repos/Turboslide-next
B=$S/rebased
base=${1:?base commit}
$S/chain.sh $base > $S/chain.log 2>&1
tip=$(sed -n 's/^TIP //p' $S/chain.log)
echo "tip $tip" 
rm -rf $B; mkdir -p $B
git -C $R archive $tip | tar -x -C $B
ln -s $R/node_modules $B/node_modules
for d in $(cat $S/nm-dirs.txt); do
  mkdir -p $B/$(dirname $d)
  rsync -a --exclude .vite --exclude .vite-temp --exclude .nitro $R/$d/ $B/$d/
done
cd $B
# fc6cfa11 and e67db5ef: the new files, then the controller as resolved (only the comment paths
# of B6c#21 differ from the realtime round's controller)
for f in apps/studio/src/editor/commit-answer.ts apps/studio/src/editor/commit-answer.test.ts; do git -C $R show fc6cfa11:$f > $f; done
for f in apps/studio/src/editor/undo-route.ts apps/studio/src/editor/undo-route.test.ts; do git -C $R show e67db5ef:$f > $f; done
git -C $R diff fc6cfa11^ fc6cfa11 -- apps/studio/src/editor/controller.tsx | patch -p1 || true
python3 - <<'PY'
p='apps/studio/src/editor/controller.tsx'
s=open(p).read()
old="""      withAutoTitle([...canvas.prefix, ...retargetFieldRuns(slide, canvas.slide, mutations)]),
      label,
      'edit',
    );
  };
  const commit = (rawMutations: Mutation[], label: string): Promise<Committed> => {
    /* the seller's edit"""
assert s.count(old)==1, 'the hand hunk'
s=s.replace(old,"""      withAutoTitle([...canvas.prefix, ...retargetFieldRuns(slide, canvas.slide, mutations)]),
      label,
      'edit',
      answer,
    );
  };
  const commit = (rawMutations: Mutation[], label: string): Promise<Committed> => {
    const answer = chromeAnswer.answer();
    /* the seller's edit""",1)
open(p,'w').write(s)
PY
rm -f apps/studio/src/editor/controller.tsx.rej apps/studio/src/editor/controller.tsx.orig
git -C $R diff e67db5ef^ e67db5ef -- apps/studio/src/editor/controller.tsx | patch -p1
git -C $R diff 85d5f782^ 85d5f782 -- apps/studio/e2e/core/images.spec.ts | patch -p1
# the controller equals the realtime round's but for B6c#21's comment paths
git -C $R show realtime/round:apps/studio/src/editor/controller.tsx | diff - apps/studio/src/editor/controller.tsx | grep '^[<>]' | grep -v 'docs/' | head -5 || true
echo built
