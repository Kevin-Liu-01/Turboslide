# Performance and cost research (key perf)

Research for the hardening round, written 2026-10-08 against `0d3920a3` (the tree production serves). Nothing in this
report was committed, pushed or deployed, and no setting was changed. Production was read only and passively: a few page
loads and header reads with `curl`, each named below with its time. Every reproduction ran on a local server on port
4834, stopped before this report was written.

## 1. Summary

The client interactions are in good shape: while typing, dragging, switching slides and presenting, no input event took
more than 112 ms and no animation frame more than 82 ms at a machine load of 84, and the heap stayed flat at 22.9 MB over
a 30 round editing session. The cost per editor
hour is under one cent. The problems are in three places:

1. The store's history grows without a floor. A fresh function instance reads every version record a deck has ever
   written, two Blob calls each, before it can answer or commit (PERF-1), and every commit re-parses the whole local log
   and re-validates the whole deck several times (PERF-2). Both are linear in the deck's history, and the guard's
   deploy on every push starts fresh instances.
2. Each commit uploads 432 KB and spends 5 advanced Blob operations for a one paragraph edit (PERF-3); the editor's
   loader is a serial chain of 13 reads that takes 1.46 to 1.71 s on production (PERF-4); the deck list runs that
   loader for every visible card and downloads the whole editor (PERF-5).
3. Pages ship code and images they do not use: the public viewer loads 2.26 MB of JavaScript against its 977 KB
   budget (PERF-8), `/decks` and `/docs` are over their preload ceilings (PERF-9), one icon import pulls the 221 KB
   shape table into every page (PERF-10), and the filmstrip decodes 1600 px pictures into 193 px frames (PERF-12).

Cold start is about 0.7 s of CPU for module loading plus about 2.0 s of CPU writing 30 MB of fonts into `/tmp` on every
new instance (PERF-6), inside 158 MB function directories that all carry Chromium (PERF-7).

## 2. Method, settings and loads

- The build. The node-server build of `0d3920a3` from the polish two worktree (built 2026-10-08 08:27 UTC; the source
  under `apps`, `packages` and `crates` is identical between `471a1884` and `0d3920a3`, and its chunk names match the
  ones production serves, for example `vendor-f3UE8FZ1.js` and `index-DjeOUTgJ.js`), copied into the scratch folder and
  run from there. A second build of the same source with `TURBOSLIDE_CLIENT_SOURCEMAP=1` (hidden maps, identical
  chunk bytes and names) was made in a scratch copy of the tree to attribute chunk bytes to modules.
- The local server. `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_LOCAL_OPEN=1`,
  `TURBOSLIDE_AUTH_RATE_LIMIT=off`, `TURBOSLIDE_MAIL=capture`, fake Google client values, fake session and download
  secrets, the overlay and the auth database under the scratch folder, `TURBOSLIDE_ROOT` at this worktree, port 4834. No
  finding below depends on `TURBOSLIDE_LOCAL_OPEN` or the rate limit; PERF-14's cookie behaviour was read on production.
- The Blob store has no local stand in for the studio server, so Blob calls were counted in process: a scratch vitest
  file drove `openBlobStore` over the in-memory fake (`packages/store/src/blob-fake.ts`) with the real GT deck
  (`decks/gt-brand`, 85 slides) and a client wrapper that counts calls, bytes and serial rounds.
- The browser: Chrome for Testing 147 (`chromium-1217`) through `playwright-core` 1.62.1, one page at a time, ANGLE on
  Metal, a 1440 by 900 viewport. `scripts/perf-budget.mjs` and `scripts/check-client-bundle.mjs` ran unchanged
  against the local server.
- The machine load (one minute) was 65 to 370 during the session. Every timing below carries its load. No timing taken
  at a load over 24 is offered as a verdict; byte counts, call counts and CPU time are the evidence, and wall times are
  context. Production server timings come from the `server-timing` header, which measures inside the function and does
  not depend on this machine.

## 3. Findings

Severity follows the round's scale: 4 a person's data or account can be read, changed or lost by someone else or by a
common failure; 3 a serious weakness with a plausible path; 2 a real defect or a missing defence; 1 hygiene.

### PERF-1 (severity 3). A fresh instance reads a deck's whole version log, two Blob calls per record ever written

Evidence.

- `packages/store/src/blob-store.ts:1356-1397` (`walkRecords`): a mirror with no records walks from record 1 to the end
  of the log, each record a `head` and a `get` (`fetchRecord`, 1301-1316), up to `RECORD_WALK_BATCH` 8 at a time and
  `RECORD_WALK_MAX` 10,000 records (633-637). Nothing in the store removes records; only snapshots are pruned
  (`pruneSnapshots`, 1725).
- In process, GT deck, a fresh store instance's first `read()` after N commits (the fake answers after 20 ms per call):

  | Records in the log | Calls (head + get) | Serial rounds | Bytes read | Time at 20 ms a call |
  | -----------------: | -----------------: | ------------: | ---------: | -------------------: |
  |                308 |          314 + 308 |            47 |    680,687 |             2,258 ms |
  |                708 |          714 + 708 |            97 |    915,087 |             4,755 ms |

  That is about 2 calls and 6.7 ms per record at 20 ms a call (load 87 and 88; the counts do not depend on load). A
  warm instance's read costs one `head`.

- The commit path pays the same walk: the checkpoint route forces a sync before it commits
  (`apps/studio/src/routes/api/decks.$deckId.checkpoint.ts:80-81`), and the object's call to that route gives up after
  `CHECKPOINT_TIMEOUT_MS` 25,000 (`apps/realtime-worker/src/deck-room.ts:104`). At 20 ms a call the walk alone passes
  25 s at about 3,700 records, which one deck reaches after about 26 editor hours at the default cadence (one record per
  checkpoint, 144 checkpoints an editor hour). The editor's loader, the viewer, the thumbnail and the export routes on
  that instance wait on the same walk.
- Fresh instances are common: the guard deploys every push, and each deployment starts with no mirror on any instance.

Fix. Give the log a floor. The manifest (or a small `log.json` written with each commit) names the newest record number
and the snapshot of the current document. A fresh mirror reads the snapshot and the newest `EDITOR_VERSIONS_KEPT` (50,
`apps/studio/src/server/write.ts:275`) records in one parallel batch, takes `versionCount` from the record number, and
reads older records on demand (the history panel's paging, `documentAtVersion` for a restore). Keep the full walk as a
repair path behind a flag.

Gain. A fresh instance's first read of any deck becomes a constant of about 55 calls (one parallel round of 50 records
plus the manifest, the snapshot and the sidecar heads) instead of 2 per record: 1,422 to about 55 calls at 708 records
(96 percent), about 4.8 s to about 0.1 s at 20 ms a call, and the checkpoint timeout leaves the picture.

Test. A store test in `packages/store/src/hosted.test.ts`: after 1,000 commits a fresh `openBlobStore` mirror's first
`read()` makes at most 60 calls and its `listVersions()` names the newest 50 records with the right count. A matrix row
`cost.cold-open.calls` on the preview: the first editor load of a deck with 1,000 records on a fresh deployment under
60 store calls.

### PERF-2 (severity 2). Every commit re-parses the whole local log and re-validates the whole deck several times

Evidence.

- `readVersions` (`packages/store/src/versions.ts:139-159`) reads every record file and runs `versionRecordSchema`
  on each, every call. It runs inside every write (`packages/store/src/file-store.ts:314` and 354), in
  `listVersions` and `records()` (371, 375), in the pull's replay (`blob-store.ts:1501`) and in the snapshot prune
  (1726). Measured: 32.5 ms of CPU per call at 708 records, about 46 microseconds per record (load 82).
- `loadDeckDir` (`file-store.ts:117-140`) reads and validates the whole deck on every `read()` and every `revision()`
  (280-287). `validateDeck` on the GT deck costs 12.8 ms of CPU warm and 623 ms on the first call of a process (the
  schema builds lazily); reading and parsing the 86 files costs 2.9 ms (load 85 to 162).
- The checkpoint route calls `store.revision()` (route line 84), `store.read()` before (94), the write (which loads the
  deck again inside `write`), `store.read()` after (116) and `store.revision()` at the end (133): five full deck
  validations and at least two whole log reads per checkpoint.
- In process, CPU per write rose from 41.8 ms with 300 records to 54.5 ms with 700 (load 87 and 88), and the median
  wall time per write from 275 to 347 ms.

Fix. Cache per mirror: the parsed records in memory (records never change; append on commit, drop on `discard`), and
the validated document keyed by the manifest's etag, so `read()` and `revision()` on an unchanged mirror are lookups. The
checkpoint route then validates once per commit, in the write.

Gain. About 50 ms of CPU per checkpoint on the GT deck today (four of five validations), plus 46 microseconds per record
per log read, which is about 140 ms per read at 3,000 records. The editor loader's `document` and `versions` steps
become lookups on a warm instance.

Test. A unit test that counts `versionRecordSchema.safeParse` and `validateDeck` calls across ten writes on a 1,000
record mirror (at most one record parse per new record, one validation per write). A CPU row in the probe: a write on a
3,000 record log costs no more CPU than one on a 30 record log, within 20 percent.

### PERF-3 (severity 2). Each commit uploads 432 KB and spends 5 advanced operations for a one paragraph edit

Evidence. The pathnames one commit touches (in process, GT deck, one `block.set` of a paragraph's text):

| Call | Pathname                 |   Bytes |
| ---- | ------------------------ | ------: |
| head | `deck.json`              |         |
| head | `leases.json`            |         |
| put  | `snapshots/<md5>.json`   | 330,260 |
| put  | `versions/<n>.json`      | 536-706 |
| put  | `slides/agent-api.json`  |   4,664 |
| put  | `deck.json`              |  96,275 |
| put  | `.turboslide/pulse.json` |     102 |

431,934 bytes and 5 puts per commit, at 144 commits an editor hour about 62 MB uploaded and 720 advanced operations. The
pulse is read by the blob tier's channel alone (`apps/studio/src/server/room.ts:281-284`, `headPulse` in the
`blobChannel` options); on the `do` tier the object is the channel and no reader polls the pulse. Another instance that
learns of one commit downloads the whole snapshot: 4 heads, 2 gets, 330,870 bytes (in process).

Fix, in order of size and risk:

1. Skip the pulse put when the realtime tier is `do` (keep it on `blob`; the blob channel's first tick after a tier
   flip heads the manifest anyway).
2. Write the snapshot every tenth commit and at the last close; the pull's replay path (`blob-store.ts:1497-1519`)
   already rebuilds the document from the newest snapshot and the records above it.
3. Move the manifest's large, rarely changing parts (the asset catalog) out of `deck.json`, so a text edit writes a
   small manifest.

Gain. Item 1: 5 to 4 advanced operations per commit (20 percent). Items 1 and 2: about 3.1 advanced operations and
about 135 KB per commit on average (from 431,934 bytes, 69 percent less). A reader learning one commit reads the record
and the slide (about 6 KB) instead of the 330 KB snapshot on nine commits in ten.

Test. The commit probe as a store test: on the `do` tier a commit makes 4 puts and no pulse put; over 20 commits the
snapshot puts number 2. The row `cost.editor-editing.calls` on the preview reads the advanced count per minute.

### PERF-4 (severity 2). The editor and presenter loader is a serial chain of 13 reads: 1.46 to 1.71 s on production

Evidence. `readEditorDeck` (`apps/studio/src/server/write.ts:394-565`) awaits each step before the next. Production,
2026-10-08 17:55 UTC, anonymous visitor, `server-timing` of `/edit/gt-brand` and `/present/gt-brand` (four loads):

| Step                                  | Durations (ms)                                   |
| ------------------------------------- | ------------------------------------------------ |
| deck-head                             | 44.7, 28.8, 44.8, 27.7                           |
| identity                              | 255.3, 306.6, 477, 165.1                         |
| access                                | 50.4, 251.2, 25.8, 58.3                          |
| room                                  | 241.2, 158.2, 0, 174.5                           |
| live                                  | 405.9, 159.2, 170.8, 416.1                       |
| document, versions, leases (parallel) | 84.8, 77.5, 96.9, 182 (the longest of the three) |
| access-record                         | 24.1, 32.6, 31.8, 26.9                           |
| resolve                               | 59, 50.7, 221.5, 38.3                            |
| templates                             | 65.2, 35, 40.6, 77.6                             |
| comments                              | 34.2, 51.4, 23.9, 29.1                           |
| views                                 | 151.3, 134.7, 240.2, 115.3                       |
| total                                 | 1,709.2, 1,461.4, 1,456.1, 1,563.1               |

The time to first byte from this machine was 1.59 to 2.01 s. The `identity` step alone holds a principal `touch`, a
deck index read past the cache (`freshIndex`) and two link grant reads in sequence (`room.ts:608-640`). The presenter runs
the same loader with the versions, leases, comments and views it does not show.

Fix. Start the independent steps together: `deck-head`, `identity`, `room`, `access-record` and `templates` at once;
then `access`, `live` with the three store reads, and `comments`; then `resolve` and `views`. Inside `identity`, run the
index read and the link grant reads together. Give the presenter and the viewer a loader that reads the document, the
access decision and the identity alone.

Gain. From the production numbers, the longest path becomes about identity (165 to 477) plus live and the store reads
(about 250 to 600) plus views (115 to 240): about 0.6 to 1.0 s against 1.46 to 1.71 s, 0.5 to 0.8 s off every editor
load; the presenter loses the versions, leases, comments and views steps (about 250 to 500 ms) on top.

Test. A unit test of the loader with fake reads that each take 100 ms: the answer lands under 400 ms. A preview row: the
editor loader's `server-timing` total under 900 ms at the median of five loads.

### PERF-5 (severity 2). `/decks` runs the editor's loader for each visible card and downloads the whole editor

Evidence. `preloadOf` (`apps/studio/src/routes/decks.index.tsx:1555-1557`) gives the first `VIEWPORT_PRELOAD_CARDS`
cards `preload="viewport"`. Measured on the local server (load 80): one visitor made three decks through `/new`, then
loaded `/decks`. The page made 6 server function calls at 441 to 514 ms (two per card) and loaded about 70 script,
style and font files, among them `EditorRoot` (519,336 B), the chunk named `Slideshow` (491,743 B), `MaterialMount` (138,850 B),
`editor-shell`, `VersionsPanel`, `dispatch` and `diagrams`. With twelve cards in view that is 24 server function calls,
each the 13 step chain of PERF-4 (on a fresh instance each also pays PERF-1), and about 2.5 MB of decoded JavaScript on a
page whose own route needs about 600 KB.

Fix. On viewport, preload the edit route's code alone (or nothing); run the loader on intent (pointer enter, focus,
touch start), where the 30 s `defaultPreloadStaleTime` keeps the answer for the click.

Gain. 24 to 0 server function calls per `/decks` visit until the person points at a card, and about 2.5 MB less
JavaScript fetched and parsed on the list page. The cost is the first click without a hover: the loader starts at the
click (0.6 to 1.7 s on production per PERF-4).

Test. A perf budget row on the write profile: after `/decks` settles with 12 cards and no pointer movement, 0
`/_serverFn` requests from preloading and at most 700 KB of decoded JavaScript.

### PERF-6 (severity 2). Cold start: 0.7 s of CPU loading every server module, and 2.0 s writing 30 MB of fonts into `/tmp`

Evidence.

- The SSR router module (`.output/server/_ssr/router-D8rgnQbX.mjs`) imports nearly every server module statically,
  among them the logo index (`logos-CROcX5R7.mjs`, 4,244,336 B), the action table, the export batch and the PPTX
  extract module (`extract-CghW3cwt.mjs`, 641,145 B). Importing it in a fresh Node process: 701 to 758 ms of CPU, 315 MB RSS (three runs, load
  153 to 154). The logo module alone: 241 ms of CPU.
- `ensureDecks` (`apps/studio/src/server/root.ts:303-310`) runs `ensurePackages` (270-296) for every request that reads
  a deck (`listStoredDecks`, `hasStoredDeck`, `openDeckStore`). On a fresh instance that base64 decodes and writes 290
  files, 29,889,307 bytes (the export faces, Merriweather alone is 3.3 MB as an inlined `.mjs`), plus 197 seed
  documents. CPU to serve robots, `/decks`, `/api/agent`, `/deck/gt-brand`, `/edit/gt-brand` and `/new` on a fresh
  process: 3.79 s with an empty overlay and 1.77 s with the files already written (load 141 to 202), so about 2.0 s of
  CPU and 115 MB of RSS (543 MB against 428 MB) are the materialization. Only render, export and capture read those
  files.
- Production: two of four editor loads on 2026-10-08 landed on instances 24 s and 30 s old (`cold;dur=24470`, request 2;
  `cold;dur=30417`, request 3), so a person meets fresh instances in normal use.

Fix. Call `ensurePackages` from the render, export and capture paths alone. Ship the package files and the seed as
files in the function (a `traceInclude` or `publicAssets` entry) so nothing is decoded at run time. Import the logo
service, the export batch, the PPTX extract module and the assist modules inside their handlers.

Gain. About 2.0 s of CPU and 115 MB of RSS off every fresh instance's first deck request (measured locally), and an
estimated 0.3 to 0.5 s of module load once the logo index and the export path leave the router's static graph (241 ms of
CPU measured for the logo module alone).

Test. A unit test that `listStoredDecks` and `openDeckStore` resolve on a runtime whose packages seed throws. The perf
budget's cold first byte row of `/decks` on a fresh node-server process, recorded with its load.

### PERF-7 (severity 2). Every function directory is 158 MB and carries Chromium

Evidence. The newest Vercel build output on this machine (Turboslide-landing, `8d61e2c6`, 2026-10-04): ten function
directories, `__server.func`, `_serverFn/[...].func`, the assist, render, export and bundle functions, each 158 MB. The
`0d3920a3` node-server output is 161 MB, of which `@sparticuz/chromium` is 65 MB, the libvips package 17 MB (the darwin
one locally; the Linux one in a deployment), `playwright-core` 6.4 MB, `_virtual` 40 MB (the server asset groups as
base64 JavaScript) and `_ssr` 23 MB. The base function serves page loads, server functions, the checkpoint route and
the ticket route, none of which launch a browser. `docs/performance.md` section 8 already lists the split as open.

Fix. Build the render and export routes as their own deployment (or route them to the render worker through
`TURBOSLIDE_WORKER_URL`), so the studio's functions carry no Chromium, no `playwright-core` and no export faces; with
PERF-6's file shipping the fonts stop being JavaScript.

Gain. The base function from 158 MB to an estimated 30 to 40 MB (161 MB minus Chromium, `playwright-core`, the export
faces and the base64 overhead). Vercel's cold start grows with the function's size; the reduction is not measured here
and needs a preview reading (the `cold` entry of `server-timing` on a fresh instance before and after).

Test. `scripts/check-vercel-output.mjs` gates the base function directory at 60 MB (it reports the size today).

### PERF-8 (severity 2). The public viewer loads 2.26 MB of JavaScript against its 977 KB budget

Evidence. `scripts/perf-budget.mjs`, local server, `/deck/gt-brand` cold (load 65 to 72): 2,211 KB decoded in 45 files,
longest animation frame 498 ms, ready at 959 ms, 2,596 DOM nodes after GC. The largest files and what is in them (source
map attribution):

| Chunk                            |                  Bytes | Content                                                                                                                                                                                                   |
| -------------------------------- | ---------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendor-f3UE8FZ1.js`             |                515,678 | React DOM 203 KB, the router and Start about 110 KB, seroval 23 KB, 121 KB of app modules                                                                                                                 |
| `Slideshow-DgaGHj72.js`          |                491,743 | the editor's chrome: `EditorShell` 39.6 KB, `InlineText` 32.6 KB, `ToolbarTail` 24 KB, `ThemesPanel` 19.6 KB, the dither, shader and asset inspectors 39 KB, `FormatOptions` 11.7 KB, `Filmstrip` 16.9 KB |
| `shapes-Zu2KJkAM.js`             |                234,190 | `packages/schema/src/shapes/definitions.ts` 221 KB                                                                                                                                                        |
| `deck-DAqFC2Ky.js`               |                193,173 | zod 99 KB (with its JSON Schema export, about 21 KB) and the schema's validators 93 KB                                                                                                                    |
| `actions-AC0AoxQi.js`            |                184,339 | `packages/schema/src/actions.ts` 140.7 KB, the action catalog and rules 28 KB                                                                                                                             |
| `MaterialMount-Cp7n98FY.js`      |                138,850 | the shader gallery's preview stills inlined as data URLs (about 3 to 5 KB each)                                                                                                                           |
| `useStudioSession`               |                 94,400 | the renderer's block modules and the window API registry                                                                                                                                                  |
| `editor-shell`, `model`, `icons` | 66,836, 66,656, 51,170 | the shell context, the whole menu model, the whole icon table                                                                                                                                             |

`/present/gt-brand` loads 1,301 KB (budget 1,172) with the same `shapes`, `deck` and `actions` chunks.

Fix. Split the viewer's graph from the editor's: the stage, the filmstrip and the title row in the viewer chunk, the
inspectors, the themes panel, format options and the toolbar tail behind the editor's entry; the action table loaded by
the agent session alone when `?agent=1` is set (`useStudioSession` is already gated on it for the viewer); the viewer
trusts the server's validated document and does not ship zod (or ships the validators without zod's JSON Schema
export); the shape table loaded when the deck holds a shape (PERF-10 removes the icon path to it); the material previews
as image files fetched by the gallery.

Gain. The parts above that a reader does not use sum to about 1.0 MB (about 300 KB of the editor chrome, the action
table 184 KB, the shape table 234 KB on a deck without shapes, zod 99 KB, the inlined previews about 120 KB, the menu
model 67 KB, the icon table 51 KB): the viewer near 1.1 to 1.2 MB, and with PERF-9's vendor trim near 1.0 to 1.1 MB,
close to its 977 KB budget; the presenter near 0.8 MB. The 498 ms load frame shrinks with the parse.

Test. `scripts/check-client-bundle.mjs` grows a loaded-after-settle ceiling for `/deck/gt-brand` (977 KB) next to the
preload ceiling, and `scripts/entry-graph.test.mjs` pins that the viewer route's graph excludes
`packages/chrome/src/EditorShell.tsx`'s inspectors and `packages/schema/src/actions.ts`.

### PERF-9 (severity 2). `/decks` and `/docs` are over their preload ceilings because the shared chunk carries app modules

Evidence. `node scripts/check-client-bundle.mjs <shim> --client <public> --base http://localhost:4834` (load 89):

```
/decks preloads 11 chunk(s), 686860 B on disk (ceiling 600000)
/docs preloads 7 chunk(s), 615752 B on disk (ceiling 450000)
FAIL /decks preloads 686860 B of chunks, over the 600000 B ceiling (SPEC-4 3.12, 4.1)
FAIL /docs preloads 615752 B of chunks, over the 450000 B ceiling (SPEC-4 3.12, 4.1)
```

The `vendor` chunk alone (515,678 B) is over `/docs`'s 450,000. It holds 361 KB of libraries and 121 KB of app modules
that every route preloads, the largest `packages/chrome/src/menus/strings.ts` (25,063 B), the dither stack
(`effects/blue64.ts` 5,974, `render/dither-runtime.ts` 5,208, `effects/dither.ts` 4,588, `viewer/dither.ts` 3,204,
`resample`, `filters`, `tone`, `metrics`, `dither-key`, `sha256`: about 30 KB), `Tooltip.tsx` 4,683, the auth model and
words 6,124, and route modules such as `routes/dev.auth.tsx` 1,974 and `routes/decks.index.tsx` 3,617. `/decks` also
preloads `model-BrX_PuAo.js` (the whole menu model, 66,656 B) for one constant, `DEFAULT_MENU_CONTEXT`
(`decks.index.tsx` imports it from `@turboslide/chrome/menus/model`), and `icons-F2W4woc6.js` (51,170 B).

Fix. Narrow the vendor group's `test` so app modules never join it (a second group for the app's shared modules, which
the routes that need them preload), move the dither stack out of the root graph to the routes that draw a dither, move
`DEFAULT_MENU_CONTEXT` into a module without the model, and split the icon table by use.

Gain. `/decks` loses at least 66,656 B (the model) plus the part of the vendor's 121 KB it does not use: from
686,860 to about 500 to 560 KB. `/docs` reaches about 440 KB once the app modules leave vendor and the icons split
(vendor's libraries and runtime about 394 KB, `DocsShell` 41,902 B, the docs route 6,071 B), under the 450,000 ceiling
with little room; PERF-11 is the durable fix for the docs.

Test. The existing ceilings in `check-client-bundle.mjs` pass; `entry-graph.test.mjs` pins that the vendor chunk holds
no module under `packages/chrome/src/menus/` or `packages/effects/src/`.

### PERF-10 (severity 2). One icon import pulls the 221 KB shape table into every page

Evidence. `packages/chrome/src/icons.tsx:33` imports `shapePath` from `@turboslide/schema/shapes`, which imports
`shapes/definitions.ts` (221,147 B). Every page that draws an icon fetches `shapes-Zu2KJkAM.js` (234,190 B) after load:
measured on `/docs` (849 KB of JavaScript in total), `/docs/shortcuts` (889 KB), `/docs/reference/block` (1,069 KB),
`/decks`, `/present/gt-brand` and `/deck/gt-brand`. The icons that need it are the three named shape glyphs (the
comment at `icons.tsx:1019`).

Fix. Draw the three glyphs from constants (or from `shapes/geometry.ts` with their three definitions), so `icons.tsx`
never reaches the definitions table.

Gain. 234,190 B less JavaScript fetched and parsed on every page outside the editor.

Test. `entry-graph.test.mjs`: the graph of `packages/chrome/src/icons.tsx` excludes
`packages/schema/src/shapes/definitions.ts`.

### PERF-11 (severity 2). A docs page hydrates its article and ships it twice

Evidence. `/docs/reference/block` (prerendered, 115 KB of HTML) loads 1,069 KB of JavaScript, of which
`block.mdx_macro_id_src_2Fdocs_2Fsource-CfWDP5Ry.js` (242,024 B) is the same article compiled to JavaScript, and vendor,
`shapes`, `icons` and `DocsShell` the rest (local, load about 80).

Fix. Serve the article as static HTML with no hydration of its body; hydrate the search window, the theme button and the
sidebar toggle alone. With PERF-9 and PERF-10, a docs page needs React only for those controls.

Gain. About 0.8 MB per docs page (from 1,069 KB to React and the controls, about 250 KB), and the compiled MDX chunks
(46 to 242 KB each) leave the client output.

Test. A docs row in the perf budget: `/docs/reference/block` at most 450 KB of decoded JavaScript after settle.

### PERF-12 (severity 2). The filmstrip decodes 1600 px pictures into 193 px frames

Evidence. `/deck/gt-brand` first view, local (load about 80): 17 images, 1,939 KB decoded. The filmstrip clones are
193 by 109 px and load `opener-brand-dark.jpg` (503 KB, 1600 by 900), `mood-rosetta-dark.jpg` (453 KB) and
`mood-earth-dark.jpg` (227 KB); the reference photographs (720 px, 21 to 137 KB each) show at 25 by 14 px. `/edit` is the
same with 2,197 KB. `docs/performance.md` section 8 lists the 320 px twin as open.

Fix. A 320 px twin per picture asset, chosen by the clone (a `srcset` or the clone's own `src`), the 1600 px twin on the
stage and in the presenter.

Gain. About 1.3 to 1.5 MB per first view of the GT deck (the stage keeps one 503 KB picture; 16 frames at about 10 to
20 KB each), and about 5.8 MB of decoded bitmap per 1600 by 900 picture out of the filmstrip's memory.

Test. A perf budget row: `/deck/gt-brand` images before ready at most 700 KB, and no image in `.ts-filmstrip` with a
natural width over 400.

### PERF-13 (severity 2). A 0.5 to 0.7 s frame at load: the inline loader payload and the hydration

Evidence. Long animation frames at load (local, load 84): the editor 502 ms (scripts attributed to `index` and
`vendor`), the presenter 705 ms (no script attribution), the viewer 498 ms and `/decks` 551 ms (`perf-budget.mjs`,
load 65 to 72). In the first interaction run (load 355, context only) the editor's 455 ms load frame was attributed to
the document's own inline script (`gt-brand`, line 5). The
documents carry the loader payload inline: `/edit/gt-brand` 293 KB, `/present/gt-brand` 291 KB, `/deck/gt-brand`
179 KB of HTML locally (production compresses them to about 77 KB). The presenter's payload is the editor's: versions,
leases, identities, access record and capabilities beside the document.

Fix. The presenter and viewer payload as in PERF-4 (the document and the decision); the payload as a JSON script element
parsed once (`JSON.parse` of a string is faster than evaluating an object literal of the same size); with PERF-8 the
hydration has less code to run.

Gain. Not measured at a valid load. The presenter's payload shrinks by the parts it does not show; the frame should fall
with the payload and the parse. A verdict needs the perf budget at a load under 24.

Test. The perf budget's longest animation frame row for `/present` (150 ms) read at a load under 24.

### PERF-14 (severity 2). A cookieless request mints a cookie, which keeps the CDN from caching the response

Evidence. Production, 2026-10-08 18:24 UTC: `/api/render/opener-brand?deck=gt-brand&theme=dark&w=320`, `/llms.txt`
and `/openapi.json` each answered with `set-cookie: __Host-ts_id=…` and `x-vercel-cache: MISS` on every request
without a cookie (two requests each). Vercel does not cache a response that sets a cookie. With the cookie sent back,
the local server answers the same routes without `set-cookie`. `/llms.txt` and `/openapi.json` also answer
`cache-control: public, max-age=300` with no `s-maxage`, so the CDN would not cache them anyway, and each agent fetch is a
function invocation: `/openapi.json` is 2,430,266 B of JSON (116,140 B with Brotli), 196 to 228 ms to first byte from
this machine. The render route's thumbnail answers `s-maxage=60` (local), which the cookie defeats for first visits,
crawlers, link previews and agents.

Fix. Mint the identity cookie on document routes and server functions alone (where a person acts); never on
`/api/render`, `/llms.txt`, `/llms-full.txt`, `/openapi.json`, `/api/agent` and the asset routes. Prerender the three
contract files as static files (they are generated at build, `apps/studio/src/server/contracts.ts`), or answer them with
`s-maxage` and `stale-while-revalidate`.

Gain. Those routes become CDN hits: zero function invocations for repeat fetches, and first byte from about 200 to 280 ms
(the function in `iad1` from `sfo1`) to about 50 to 100 ms (a `sfo1` hit, as `/home` and the assets measured 49 to
80 ms).

Test. A headers test: no `set-cookie` on those routes for a request without a cookie. The perf budget's `cdn` check gains
`/llms.txt`, `/openapi.json` and the unstamped thumbnail, second request `HIT`.

### PERF-15 (severity 1). `/decks` fetches the GT cover through the render function, twice per visit

Evidence. `GT_BRAND_COVER` (`apps/studio/src/routes/decks.index.tsx:356`) is `/api/render/opener-brand?...&w=320`,
preloaded in the head of every `/decks` document for every visitor (production head read 2026-10-08) and requested a
second time after hydration: two GETs at 45 and 253 ms (local, three decks) and at 1,311 and 3,496 ms (local, no decks),
each a function call (968 and 1,048 ms of server time locally at load 125; 184 to 226 ms on production, served from
Blob, `MISS`).

Fix. Ship the cover as a static, content hashed file under `/brand` (it is the seeded deck's first slide), and drop the
second request (the preload and the `img` agree on URL and mode, or the preload goes).

Gain. Two function invocations and a Blob read per `/decks` visit to zero; the image becomes a CDN hit.

Test. A perf budget row: a `/decks` visit makes no `/api/render/opener-brand` request.

### PERF-16 (severity 1). 146 to 346 KB of CSS per route in 8 to 23 files

Evidence. Resource timing (local, load about 80): `/home` 8 files, 146 KB decoded; `/decks` 11, 159 KB; `/docs` 9,
158 KB; `/present/gt-brand` 11, 155 KB; `/deck/gt-brand` 22, 320 KB; `/edit/gt-brand` 23, 346 KB. The theme sheet
(`sheet.css`, `stage.css`) and the tokens load on every route, the docs and the landing included.

Fix. Measure the unused share with Chrome's coverage on each route; split the editor's component styles out of the
viewer and the theme sheet out of the routes that draw no slide.

Gain. Not measured; the 150 to 190 KB difference between `/deck` and `/present` is the editor chrome of PERF-8.

Test. A CSS decoded row per route in the perf budget, reported first.

### PERF-17 (severity 1). The default checkpoint cadence sets most of the per hour bill

Evidence. `TURBOSLIDE_CHECKPOINT_IDLE_MS` 2000 and `TURBOSLIDE_CHECKPOINT_MAX_MS` 10000
(`apps/realtime-worker/wrangler.jsonc`, both environments): at one edit per 5 s every edit checkpoints, 144 times an
editor hour (`docs/CLOUDFLARE.md` 1.3). Each checkpoint is one function invocation, the store calls of PERF-3 and the
validations of PERF-2, and 4 to 5 rows written in the object. The entries are durable in the object's SQLite before the
checkpoint, so the cadence sets how soon the Blob store has them, which matters to readers on other instances (the
viewer, the thumbnail, an export) and to a tier rollback.

Fix. The switch `docs/CLOUDFLARE.md` 1.3 and 3.6.2 already carry: 10 s idle and 30 s maximum, with an immediate
checkpoint on the last close, on an export, and when a reader on Vercel asks for a revision the store does not have
(`liveAtLeast` already names one).

Gain. About 144 to about 40 checkpoints an editor hour under the same load model (section 4): the Vercel line per editor
hour falls by about 70 percent, and the object's rows written by about the same share (the break day of the Free plan
from 139 to 174 editor hours a day to 347 to 379, `docs/CLOUDFLARE.md` 1.3).

Test. The rows `cost.do.rows-written` and `cost.editor-editing.calls` on the preview at the new cadence, and a realtime
row that a viewer opened 1 s after an edit shows the edit.

### PERF-18 (severity 2). The node-server build ignores SIGTERM: the listener closes and the process stays

Evidence. Three reproductions on the local build (2026-10-08 10:44 to 11:40 local): after `SIGTERM` the server stops
answering on 4834 and the process is still alive 30 s later (`exitedAfterMs: null`), with or without open client
connections; one stayed alive for more than 10 minutes until `SIGKILL`. `apps/studio/src/server` installs no signal
handler, and timers such as `DERIVED_SWEEP_INTERVAL_MS` (30 s, `root.ts:466`) and the memory channel's checkpointer keep
the event loop alive. Vercel does not run this build; self-hosting (`content/docs/self-hosting.mdx`) and the check
runner (port 4321) do, and a process manager then waits its whole kill timeout on every restart.

Fix. On `SIGTERM`, flush the checkpointers and the derived sweeps, close the listener, and exit within a bounded time
(for example 10 s). This belongs with the reliability key's work on flushes at shutdown.

Gain. Restarts of a self-hosted studio take seconds instead of the process manager's kill timeout, and pending
checkpoints land before exit.

Test. A script test that starts the node-server build, sends `SIGTERM` and asserts exit within 10 s with code 0.

## 4. What one editor hour costs

The load model is `docs/archive/rounds/SYNC.md` 4.3 as `docs/CLOUDFLARE.md` 1.3 uses it: one tab, 12 minutes of
editing at one edit per 5 s and 48 idle minutes, the GT deck, the `do` tier. Vercel prices are the Pro on-demand rates
`docs/gslides-parity/realtime/research-costs-actual.md` records (invocations $0.60 a million, active CPU $0.128 an hour,
provisioned memory $0.0106 a GB hour, Blob simple $0.40 a million, advanced $5.00 a million). Store calls are this
report's in-process counts; CPU is this machine's, so the CPU line is an estimate.

| Line (Vercel)                                                                          | Count per editor hour                           | Cost          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------- |
| Checkpoint route invocations                                                           | 144                                             | $0.00009      |
| Blob advanced operations (5 puts per commit)                                           | 720                                             | $0.00360      |
| Blob simple operations (2 heads per commit plus the forced sync head)                  | 432                                             | $0.00017      |
| Active CPU (about 0.1 s per checkpoint: the write's 42 to 55 ms plus four validations) | 14 s                                            | $0.00051      |
| Provisioned memory (about 0.7 s per checkpoint at 2 GB)                                | 0.056 GB hours                                  | $0.00059      |
| Card thumbnails (at most about 3 Chromium renders an hour, `card-thumb.ts`)            | about 24 GB seconds, 6 s of CPU                 | about $0.0003 |
| Editor loads, session polls, ticket refreshes                                          | 1 to 3 loads, about 12 polls, about 8 refreshes | under $0.0001 |
| Total                                                                                  |                                                 | about $0.0053 |

Blob advanced operations are about 68 percent of the Vercel line. On Cloudflare the object's counts per editor hour are
`docs/CLOUDFLARE.md` 2.2's (about 231 request units, about 13 GB seconds, 576 to 720 rows written, about 90 Worker
requests for a signed in tab); on the Free plan that is $0.00 until a daily cap, the first being rows written at 139 to
174 editor hours a day.

At 50 editor hours a day the Vercel line is about $0.27 a day, about $8 a month, which agrees with `design-a.md`'s $7.
With PERF-3 items 1 and 2 and PERF-17, a checkpoint costs about 3.1 advanced operations and there are about 40 of them
an hour: about $0.0013 per editor hour (75 percent less), and the Free plan's break day moves to 347 to 379 editor hours.

How the client side was measured for cost: an idle editor makes 2 server function calls a minute on the memory tier
(`perf-budget.mjs` idle check, 30 s window); on the `do` tier the session poll pauses 5 minutes while the socket is open
(`SOCKET_IDLE_PAUSE_MS`, `apps/studio/src/components/useStudioSession.ts`), the heartbeat is the object's auto response
(`ping`, billed nothing), and the object holds no standing timer (`deck-room.ts` uses `setTimeout` only for the abort of
its own fetches, line 302).

## 5. Where the bill goes

Production's own traffic is small: the instance that served my production reads at 17:47 UTC was 27 minutes old and on
its 14th request. `research-costs-actual.md` puts Turboslide's share of the General Translation team's September bill at
$3 to $5 a month and attributes the personal team's $85 to $100 to the pipeline's hosted gates. Since then the gates run
on the local tier and production runs on the `do` tier. What remains per push is the guard: a build (46 deployments in
seven days at a mean of 103 s in that note) and the production rows after the deploy, which open editor tabs on
production and so pay checkpoints, object requests and rows written like a person. Per person, section 4 applies; the
fixes above matter most at many editor hours a day, and PERF-1 and PERF-5 matter now because their cost grows with
history and with the number of decks a person has.

## 6. What measured fine

- Typing, dragging, slide switching and presenting (local, load 84, `interact.mjs`): event durations while typing at
  p50 24 ms, p95 24 ms, maximum 112 ms (926 events); dragging p95 32 ms, maximum 48 ms, no long frame; switching 24
  slides p95 40 ms; presenter keys p95 32 ms. Two long frames while typing (82 and 58 ms).
- Memory over a session: JavaScript heap after GC 14.4 MB after load, 20.5 MB after typing, drags and 24 slide switches,
  then 21.2 to 22.9 MB across 30 editing rounds, flat over the last 9 rounds; DOM nodes 3,378 to 3,680.
- The filmstrip scrolls at 120 fps with a 17 ms longest steady frame (`perf-budget.mjs`).
- Fonts: one Inter subset per route (`InterVariable-latin`, 113,752 B), plus the italic latin subset (126,000 B) on
  `/edit` alone; preloaded in the head.
- CDN on production (2026-10-08 18:00 UTC, two requests each): the hashed assets, the fonts, the icon set, the manifest,
  `/og/turboslide.png` and `/brand/*` answer `HIT` (the brand picture `MISS` then `HIT`) with the cache headers
  `vite.deploy.config.ts` sets; `/home`, `/docs` and the sitemap are CDN copies revalidated per visit.

## 7. Rust verdicts for the paths this report measured

| Path                                  | Measured cost                                                                           | Verdict and reason                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deck validation (`validateDeck`)      | 12.8 ms CPU per GT deck read, about 5 per checkpoint                                    | No Rust. Caching by etag (PERF-2) removes four of five calls; a Rust validator would be a second copy of the zod schemas that the client and the agent contracts also generate from, and the remaining call costs 12.8 ms. |
| Version log read (`readVersions`)     | 46 microseconds per record per call                                                     | No Rust. The records never change; an in-memory cache removes the cost.                                                                                                                                                    |
| Snapshot hashing and canonical JSON   | 0.8 ms md5 and 0.6 ms canonical JSON for 330 KB                                         | No Rust. Too small to matter.                                                                                                                                                                                              |
| Cold start module load                | 0.7 s CPU, 315 MB RSS                                                                   | No Rust. It is JavaScript parse and module evaluation; lazy imports and fewer bundled bytes fix it (PERF-6).                                                                                                               |
| The object's admission and transforms | not measured: the object's CPU per message is not exposed outside the dashboard         | Measure first. `cost.do.duration` and the object's counters exist; a wasm module adds its load to every wake of a hibernated object.                                                                                       |
| Card thumbnails, exports              | a Chromium render each (13.2 s for the edited slide's capture locally at load 65 to 72) | No Rust for the render itself; it needs a browser. The crate's image stages apply to the picture pipeline, which is not on these paths.                                                                                    |

## 8. Not measured, and why

- Production's Blob counters (`sync.status` `storeCalls`) and the Cloudflare dashboard need a bearer or a dashboard
  session; this research holds neither by rule, so Blob counts come from the in-process probe and Cloudflare counts from
  `docs/CLOUDFLARE.md` 2.2's model.
- Cold start on Vercel itself: a fresh instance cannot be forced passively. Two of four production editor loads landed
  on instances under 31 s old, which shows they occur; their cost on Vercel's CPU is not separated here.
- Any timing at a load under 24: the machine's load stayed between 65 and 370.
- The current Vercel function sizes: the newest `.vercel/output` on this machine is the 2026-10-04 build; a fresh Vercel
  build was not made to keep the machine's load down.
- The first local server run of this session (10:34 local) was killed with SIGTERM by its script and stayed alive without
  a listener; that is PERF-18, reproduced twice more.

## 9. Scratch evidence

Under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/harden/perf/`:
`logs/blob-probe-300.json` and `logs/blob-probe-700.json` (PERF-1 to PERF-3), `tree/packages/store/src/zz-perf-probe.test.ts`
and `zz-perf-paths.test.ts` (the probes), `logs/perf-budget-local.json` and `.txt` (the perf budget run),
`logs/interact-2.json` (interactions and heap), `attr.mjs` and `attr-sum.mjs` (chunk attribution from the source maps in
`tree/apps/studio/.output/public/assets`), `coldcpu.sh`, `sigterm.mjs`, `decks-preload.mjs`, `fonts.mjs`, `images.mjs`,
`docsjs.mjs`, and `prod/` (the production headers). These folders do not survive a reboot.

## 10. Questions, each with a default

1. May a fresh mirror start at the newest 50 records and read older ones on demand (PERF-1)? Default: yes, with the
   history panel paging older records and `version.restore` fetching the record it names; the full walk stays as a
   repair path behind a flag.
2. May the snapshot be written every tenth commit and at the last close (PERF-3 item 2)? Default: yes; the replay path
   already rebuilds the document from the newest snapshot and the records above it.
3. May the checkpoint cadence move to 10 s idle and 30 s maximum on production (PERF-17)? Default: yes, with the
   immediate checkpoint on the last close, on an export and on a Vercel reader's `atLeast`, once the realtime rows
   read green at that cadence on the local `do` rig.
4. May `/decks` preload the edit route's code on viewport and its loader on intent alone (PERF-5)? Default: yes; the
   first click without a hover waits on the loader.
5. Where should Chromium run (PERF-7)? Default: a second Vercel deployment for the render and export routes reached
   through `TURBOSLIDE_WORKER_URL`, since it keeps the current code path; Cloudflare's browser product is a later
   option and needs its own cost reading.
6. May the docs articles ship without hydration (PERF-11)? Default: yes, with the search window, the theme button and
   the sidebar toggle as the only hydrated controls.

## 11. Notes for other keys

- Security: the prerendered `/home` carries `nonce="aywZEdKcD++RvlO29BY8+g=="` on its tags in the static file the CDN
  serves to every visitor (production, 17:47 UTC), so the nonce is the same for everyone; whether the CSP header on that
  static response names a per request nonce was not read here.
- Security and cost: PERF-14's cookie on every cookieless response also means every crawler and agent request receives a
  fresh anonymous identity.
- Reliability: PERF-18 (no exit on SIGTERM) and PERF-1 (a deck with a long history can make the first checkpoint after a
  deploy pass the object's 25 s timeout).
- Cleanup: the `Slideshow` chunk's name does not match its content (the editor's chrome); `routes/dev.auth.tsx` ships in
  the shared vendor chunk of every route; `apps/cli/src/store-actions.ts` (36,654 B) is inside the editor's
  `EditorRoot` chunk.
