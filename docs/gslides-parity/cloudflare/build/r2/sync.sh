#!/bin/zsh
# Refreshes R2's scratch copies from the lanes' current files (docs/CLOUDFLARE.md 5.4; build/r2.md,
# the Cloudflare phase): the shadow studio with the R2-C1 seam applied, the Worker's src without the
# entry's PROTOCOL export (R2-C11). Run before every server start; nothing of the real tree changes.
set -eu
ROOT=/Users/kevinliu/repos/Turboslide-realtime
R2=$ROOT/.turboslide/r2-do
rsync -a --delete --exclude node_modules --exclude dist --exclude .output "$ROOT/apps/studio/" "$R2/shadow/apps/studio/"
[ -L "$R2/shadow/apps/studio/node_modules" ] || ln -s "$ROOT/apps/studio/node_modules" "$R2/shadow/apps/studio/node_modules"
python3 - "$R2/shadow/apps/studio/src/editor/controller.tsx" <<'PY'
import sys,re
p=sys.argv[1]
s=open(p).read()
if 'roomTransport' in s:
    print('seam already present'); sys.exit(0)
a=s.index("/**\n * The browser's transport of the room (SPEC-3 3.3): a streamed fetch down, fetch up, same origin.")
b=s.index("/** The pending queue mirror: IndexedDB in a browser, memory where it is missing (SPEC-3 0.7). */")
s=s[:a]+s[b:]
c=s.index("/**\n * How long one ops POST may take before the room client treats it as failed and resends (the")
d=s.index("const OPS_POST_TIMEOUT_MS = 30_000;\n")+len("const OPS_POST_TIMEOUT_MS = 30_000;\n")
s=s[:c]+s[d:]
old="      transport: sseTransport(deckId, tabToken(idStorage())),"
assert old in s
s=s.replace(old,"      transport: roomTransport(deckId, tabToken(idStorage()), init.payload.room),",1)
anchor="import { createRoomClient, splitSseBlocks } from '@turboslide/realtime/client/room-client';"
assert anchor in s
s=s.replace(anchor,"import { createRoomClient } from '@turboslide/realtime/client/room-client';",1)
m=list(re.finditer(r"^import .* from '\./[^']+';\n", s, re.M))
pos=m[-1].end()
s=s[:pos]+"import { roomTransport } from './transport';\n"+s[pos:]
open(p,'w').write(s)
print('seam applied')
PY
rm -rf "$R2/worker/src"
mkdir -p "$R2/worker/src"
cp "$ROOT"/apps/realtime-worker/src/*.ts "$R2/worker/src/"
ln -s "$ROOT/apps/realtime-worker/node_modules" "$R2/worker/src/node_modules"
sed -i '' 's/^export const PROTOCOL = ROOM_PROTOCOL;/const PROTOCOL = ROOM_PROTOCOL;/' "$R2/worker/src/index.ts"
echo "worker src copied $(ls "$R2/worker/src" | grep -c '\.ts$') files; entry exports: $(grep -c '^export' "$R2/worker/src/index.ts")"
