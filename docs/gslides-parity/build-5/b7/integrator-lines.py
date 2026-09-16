#!/usr/bin/env python3
"""B7's lines in the integrator's two files (gslides-parity SPEC-5-amendments A6: "the controller
stays the integrator's file; B7's lines in it are requests answered the same day"). The script
applies the edits to a checkout root given as its one argument and refuses when an anchor is
missing, so the integrator can run it on the shared checkout after reading b7.md section 9 and
see exactly what moves; B7 ran it on a private copy of the tree to drive the sync stress probe
and the two specs against the whole engine (b7.md section 10). No git command runs.

    python3 docs/gslides-parity/build-5/b7/integrator-lines.py /Users/kevinliu/repos/Turboslide

The edits, all in apps/studio/src/editor/controller.tsx unless named:

  C1  the transport moves to editor/sync/transport.ts (client=, retire=, the 409's since)
  C2  the tab's held client id, its op counter and the ids to retire come from client-ids.ts
  C3  createRoomClient takes clientId and opCounter; retire lists the earlier ids alone
  C4  participants() filters by the tab's principal id too (A3 item 5)
  C5  describe().state.sync carries offline and rebased
  C6  a returned op names the author who changed the same text (A3 item 8)
  E1  EditorRoot.tsx: the presence partition filters by the tab's principal id too
  F1  EditorRoot.tsx: the sheet's used faces link (FontFaces) beside ShellBridge (A5 item 3)
  F2  packages/chrome/src/ToolbarTail.tsx: the Font dropdown for `op: 'font'` (A5 item 4)
  F3  packages/chrome/package.json: the export rows of the four font modules
"""
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
controller = root / 'apps/studio/src/editor/controller.tsx'
editor_root = root / 'apps/studio/src/editor/EditorRoot.tsx'


def edit(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        if new in text:
            print(f'{label}: already applied')
            return
        raise SystemExit(f'{label}: anchor not found in {path}')
    path.write_text(text.replace(old, new, 1))
    print(f'{label}: applied')


text = controller.read_text()

# C1: the transport module
head = "/** The browser's transport of the room (SPEC-3 3.3): EventSource down, fetch up, same origin. */"
tail = '/** The pending queue mirror: IndexedDB in a browser, memory where it is missing (SPEC-3 0.7). */'
if head in text:
    start = text.index(head)
    end = text.index(tail)
    controller.write_text(text[:start] + text[end:])
    print('C1: the local sseTransport removed')
else:
    print('C1: the local sseTransport removed: already applied')
edit(
    controller,
    "import { partitionRoster, readClientIds, rememberClientId } from './client-ids';",
    "import {\n  heldClientId,\n  idsToRetire,\n  opCounterFor,\n  partitionRoster,\n  readClientIds,\n  rememberClientId,\n} from './client-ids';\nimport { sseTransport } from './sync/transport';",
    'C1: the imports',
)
# the RoomTransport type import may now be unused: keep it if other code reads it
text = controller.read_text()
if text.count('RoomTransport') == 1:
    for form in (
        "import type { RoomClient, RoomTransport } from '@turboslide/realtime/client/room-client';",
        "import type { RoomTransport } from '@turboslide/realtime/client/room-client';",
    ):
        if form in text:
            controller.write_text(
                text.replace(
                    form,
                    "import type { RoomClient } from '@turboslide/realtime/client/room-client';"
                    if 'RoomClient,' in form
                    else '',
                    1,
                )
            )
            print('C1: the RoomTransport type import dropped')
            break
# the imports the transport alone read leave with it (tsc's noUnusedLocals refuses them otherwise)
text = controller.read_text()
for old_import, new_import in (
    ("import { roomEventOf } from '@turboslide/realtime/protocol';\n", ''),
    ("import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';", "import type { PresencePost } from '@turboslide/realtime/protocol';"),
    ('  OpsResponse,\n', ''),
    ('  RoomTransport,\n', ''),
):
    if old_import in text and (text.count(old_import.strip().split(' ')[-1].rstrip(',;')) <= 2 or new_import == ''):
        text = text.replace(old_import, new_import, 1)
controller.write_text(text)
text = controller.read_text()
for name in ('roomEventOf', 'OpsPost', 'OpsResponse', 'RoomTransport'):
    if text.count(name) == 1:
        print(f'C1: note, `{name}` is still imported and no longer read; drop it from the import list')
    elif text.count(name) == 0:
        print(f'C1: `{name}` import dropped')

# C2 and C3: the held id, the counter, the retire list
edit(
    controller,
    "      // the tab's earlier ids leave the roster before hello lists it (hotfix 2 cause B1)\n      retire: latest().ownClientIds,\n      pendingStore,",
    "      // one client id per tab (SPEC-5-amendments A3 item 5): the id the stream last issued is\n      // asked for on every open and kept when it names this deck and this identity; the op\n      // counter lives beside it so a kept id never repeats a counter; the ids the tab held before\n      // and did not keep leave the roster before hello lists them (hotfix 2 cause B1)\n      ...(heldClientId(idStorage(), deckId) === null\n        ? {}\n        : { clientId: heldClientId(idStorage(), deckId) as string }),\n      opCounter: opCounterFor(idStorage(), deckId),\n      retire: idsToRetire(idStorage(), deckId, heldClientId(idStorage(), deckId)),\n      pendingStore,",
    'C2 and C3: clientId, opCounter, retire',
)

# C4: the principal filter
edit(
    controller,
    "    return partitionRoster(rows, new Set(latest().ownClientIds), room?.clientId() ?? null);",
    "    // and every row of this person (A3 item 5: the self filter by client id and by principal id)\n    return partitionRoster(\n      rows,\n      new Set(latest().ownClientIds),\n      room?.clientId() ?? null,\n      identity?.principalId ?? null,\n    );",
    'C4: participants() by principal',
)

# C5: offline and rebased on describe().state.sync
edit(
    controller,
    "        transport: snapshot.sync === null ? 'poll' : 'sse',\n        connected: snapshot.sync?.connected ?? false,\n      },\n      // the room as presence.list answers it",
    "        transport: snapshot.sync === null ? 'poll' : 'sse',\n        connected: snapshot.sync?.connected ?? false,\n        // round five (SPEC-5-amendments A3 items 3 and 7): the wire is down, and how many refused\n        // writes were rebased onto the entries a 409 carried and posted again\n        offline: snapshot.sync?.offline ?? false,\n        rebased: snapshot.sync?.rebased ?? 0,\n      },\n      // the room as presence.list answers it",
    'C5: sync.offline and sync.rebased',
)

# C6: the author on a returned op
edit(
    controller,
    "      onUnplaceable: (op) => {\n        publish({\n          rejects: [\n            ...latest().rejects,\n            rejectNoticeOf({\n              opId: op.opId,\n              reason: 'stale',\n              ...(op.mutations === undefined ? {} : { mutations: op.mutations }),\n            }),\n          ],\n        });\n      },",
    "      onUnplaceable: (op, against) => {\n        // the card names who changed the same text (SPEC-5-amendments A3 items 3 and 8): plain\n        // words, never the room's reason\n        const who = against === undefined ? null : authorLabel(against.author);\n        publish({\n          rejects: [\n            ...latest().rejects,\n            rejectNoticeOf({\n              opId: op.opId,\n              reason: 'stale',\n              message:\n                who === null\n                  ? 'Someone changed this text first; your words are kept here'\n                  : `${who} changed this text first; your words are kept here`,\n              ...(op.mutations === undefined ? {} : { mutations: op.mutations }),\n            }),\n          ],\n        });\n      },",
    'C6: the author on a returned op',
)

# E1: EditorRoot's partition by principal
edit(
    editor_root,
    "    () => partitionRoster(rosterRows, new Set(snap.ownClientIds), ownClientId),\n    [rosterRows, snap.ownClientIds, ownClientId],",
    "    () =>\n      partitionRoster(\n        rosterRows,\n        new Set(snap.ownClientIds),\n        ownClientId,\n        payload.identity?.principalId ?? null,\n      ),\n    [rosterRows, snap.ownClientIds, ownClientId, payload.identity?.principalId],",
    'E1: the presence partition by principal',
)
# F1: the sheet's faces on the editor page
edit(
    editor_root,
    "import { useEditorShell } from '@turboslide/chrome/editor-shell-context';\n",
    "import { useEditorShell } from '@turboslide/chrome/editor-shell-context';\nimport { FontFaces } from '@turboslide/chrome/FontFaces';\n",
    'F1: the FontFaces import',
)
edit(
    editor_root,
    "        <ShellBridge controller={controller} editing={canWrite} api={shellApi} />\n",
    "        <ShellBridge controller={controller} editing={canWrite} api={shellApi} />\n        {/* the catalog faces the document uses, one stylesheet link (SPEC-5-amendments A5 item 3; B7) */}\n        <FontFaces document={snap.document} />\n",
    'F1: the FontFaces mount',
)

# F2: the toolbar's Font dropdown
toolbar_tail = root / 'packages/chrome/src/ToolbarTail.tsx'
edit(
    toolbar_tail,
    "import { ToolbarButton, ToolbarDivider, controlTip } from './ToolbarHead';\n",
    "import { FontField } from './FontPicker';\nimport { ToolbarButton, ToolbarDivider, controlTip } from './ToolbarHead';\n",
    'F2: the FontField import',
)
edit(
    toolbar_tail,
    "          if (control.op === 'fontSize')\n            return <FontSizeField key={key} control={control} block={block} />;\n",
    "          if (control.op === 'fontSize')\n            return <FontSizeField key={key} control={control} block={block} />;\n          // the Font dropdown in Google's position (SPEC-5-amendments A5 item 4; B7's FontPicker.tsx)\n          if (control.op === 'font')\n            return <FontField key={key} control={control} block={block} />;\n",
    'F2: the Font row',
)

# F3: the chrome exports
chrome_pkg = root / 'packages/chrome/package.json'
edit(
    chrome_pkg,
    '    "./Filmstrip": "./src/Filmstrip.tsx",\n',
    '    "./Filmstrip": "./src/Filmstrip.tsx",\n    "./FontFaces": "./src/FontFaces.tsx",\n    "./FontPicker": "./src/FontPicker.tsx",\n    "./font-picker-model": "./src/font-picker-model.ts",\n    "./dialogs/MoreFonts": "./src/dialogs/MoreFonts.tsx",\n',
    'F3: the chrome exports',
)
print('done')
