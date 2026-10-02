# Performance audit: Turboslide online on 2026-10-01

The performance auditor's note for the next program (`docs/NEXT.md` is the synthesis). It measures how fast production answers a seller today, reads why in the tree, ranks the ten largest costs by the time a seller waits, and sets a budget per route beside Google Slides measured the same way. Measured from 2026-10-02 01:35 to 02:25 UTC (2026-10-01 18:35 to 19:25 Pacific) on `https://www.turboslide.com`. The tree read is the worktree `Turboslide-next` at `94e8a5c3`. Production answered `GET /api/agent` with `instance.commit` `aa70bc7fea353976c77cbe03271d4cf1b0eed801` at 01:36:31 UTC (`x-vercel-id sfo1::iad1::l9zcf-1790904991244`). That commit is the parent of `94e8a5c3`, which changes `.vercelignore` alone, so every line number below is the code production runs. Nothing in the tree, on Vercel, on Cloudflare, on GitHub or on Google was changed.

## 1. How it was measured

- The probe is `perf/perf-audit.mjs` beside this note. It drives Chrome for Testing build 1217 headless through `playwright-core` 1.62.1 from the worktree's `node_modules`, with the GPU flags of `scripts/perf-budget.mjs` 120 to 123, a 1440 by 900 viewport and one page at a time. The PDF export ran through `perf/exportprobe.mjs`, the deck list's cards through the probe's `deckscards` phase, the entry chunk's contents through `perf/chunk-probe.mjs`. The samples are `perf/state/*.jsonl`; each sample carries its UTC time and the machine's `uptime` line. `perf/summarize.mjs` prints the medians and worst values. The owner cookies the probe used are not copied.
- The machine: Apple Silicon, macOS, wired (`en0`, no Wi-Fi association). `curl` to the production edge at 01:57:55 UTC: TCP connect 17 to 35 ms, TLS done at 36 to 53 ms, the 326,809 byte brotli entry chunk in 77 to 185 ms (1.8 to 4.2 MB/s). To `docs.google.com`: connect 64 to 66 ms.
- The machine was shared and loaded. The one minute load average was 14 to 45 in the bot run (01:45 to 01:57 UTC), 36 to 69 in the first person run (01:58 to 02:01), 63 to 279 during the presenter, export and second Google runs (02:01 to 02:14), and 19 to 29 in the person rerun (02:21 to 02:24). Main thread numbers (script time, long frames, paint after the document) move with that load; server numbers (final headers, the export's server wait) do not. Each table names its run.
- Two user agents. The headless agent sends `HeadlessChrome`, which `isbot` 5.2.2 classes as a bot, and TanStack's stream renderer then waits for every suspense boundary before it answers (`@tanstack/react-router` 1.170.41 `dist/esm/ssr/renderRouterToStream.js` 13 and 34). The person runs replace `HeadlessChrome` with `Chrome` in the same agent string, which `isbot` classes as a person. The route table uses the person rerun. The bot run is kept for what it shows about crawlers and about the project's own gate (item 11).
- Cold is a fresh browser context with an empty cache and the scratch decks' owner cookies (a fresh anonymous principal cannot open them). Warm is the second load in the same context. Five runs each; the tables give the median and, in brackets, the worst.
- First byte. Chromium stamps `responseStart` at the `103 Early Hints` answer, which the edge sends for every route in 9 to 26 ms. The server's own answer is `finalResponseHeadersStart`, written "final headers" below. "Ready" is the probe's landmark: `main` on `/home`, `.ts-home-page[data-hydrated]` on `/decks`, the studio handle and `.pt-viewer[data-settled]` on the editor (`docs/performance.md` section 1), and the presenter console's current frame with its pictures decoded on `/present`.
- Two scratch decks, removed by id at the end (section 9): deck A `untitled-20261002-f89y`, made from `/new` by typing a title (one slide), and deck B `general-translation-brand-deck-muqat38fw5e5`, made from the template gallery's General Translation brand deck card (85 slides; the click to a ready editor took 9,153 ms at 01:42:42 UTC).

## 2. The numbers

### 2.1 Routes (person rerun, 02:21 to 02:24 UTC, load average 19 to 29)

| Route | Metric | Cold median (worst) | Warm median (worst) |
| ----- | ------ | ------------------- | ------------------- |
| `/home` | final headers; FCP; LCP; ready | 22 (51); 164 (212); 236 (292); 253 (312) ms | 15 (31); 84 (96); 156 (164); 199 (326) ms |
| `/home` | JavaScript; CSS; fonts | 347 KB over the wire, 1,235 KB decoded, 3 files; 55 KB decoded; 353 KB | from cache |
| `/home` | requests; bytes; CLS; main thread script; longest frame | 17 (18); 1,022 KB (1,058); 0.0000; 140 (149) ms; 97 (153) ms | 16; 0 KB; 0.0000; 136 ms; 76 ms |
| `/decks` | final headers; FCP; hydrated | 144 (178); 296 (308); 434 (492) ms | 105 (162); 180 (236); 309 (350) ms |
| `/decks` | the first card drawn with its picture (ten cold loads, 02:13 and 02:23 UTC) | 2,372 to 2,636 ms in five loads; 14,086 to 14,913 ms in five | |
| `/decks` | JavaScript; CSS; fonts | 865 KB over the wire, 2,669 KB decoded, 25 files; 256 KB decoded; 353 KB | from cache |
| `/decks` | main thread script; CLS; cards listed | 164 (224) ms; 0.0000 (0.0380); 147 | 156 ms; 0.0000 (0.0380) |
| `/edit/<deck A>` | final headers; FCP; LCP; ready | 457 (720); 572 (828); 880 (1,036); 863 (1,018) ms | 422 (1,287); 532 (1,336); 792 (1,512); 775 (1,498) ms |
| `/edit/<deck A>` | first editable caret from navigation; double click to caret | 1,027 (1,062); 30 (52) ms | 832 (1,550); 32 (44) ms |
| `/edit/<deck A>` | first keystroke to the next frame | 9 (11) ms | 8 (10) ms |
| `/edit/<deck A>` | JavaScript; CSS; fonts | 872 KB over the wire, 2,682 KB decoded, 26 files; 258 KB decoded; 741 KB | from cache |
| `/edit/<deck A>` | requests; bytes; CLS; main thread script; longest frame | 57; 1,689 KB; 0.0000; 314 (412) ms; 126 (130) ms | 57; 33 KB; 0.0000; 344 (469) ms; 78 (126) ms |
| `/present/<deck B>` | final headers; FCP; ready; JavaScript decoded; main thread script | 687 (696); 800 (992); 1,243 (1,343) ms; 1,354 KB; 132 (180) ms | not measured |

The other runs, for their worst values and their load:

- First person run (01:58 to 02:01 UTC, load 36 to 69): `/edit/<deck A>` cold final headers 663 (4,837) ms, ready 1,104 (5,216), caret 1,395 (5,300), first keystroke to frame 11 (486) ms; `/decks` LCP 2,324 (3,056) ms with the cards in; `/present/<deck B>` final headers 730 (1,055) ms at load 63 to 240, its paint numbers not usable.
- Bot run (01:45 to 01:50 UTC, load 14 to 45): `/edit/<deck A>` cold final headers 419 (517) ms, FCP 524 (664), LCP 548 (700), ready 669 (778), caret 747 (814), first keystroke to frame 5 (8) ms, main thread script 198 (762) ms; one cold load of five answered HTTP 500 (item 8). `/decks` held its whole answer for the listing: final headers 2,636 (13,290) ms cold and 2,459 (13,676) warm.

### 2.2 In page work (bot run, one warm context, load average 13 to 21)

| Measure | Median (worst) | Source |
| ------- | -------------- | ------ |
| `/decks` card click to the editor ready, in page, after a 200 ms hover | 34 (117) ms; painted 40 (122) ms | `transitions.jsonl`, five runs, deck A |
| Editor title row mark back to `/decks` hydrated, in page | 25 (28) ms; painted 43 (52) ms | same |
| Slideshow button to the first slide shown with its pictures, deck B | 7 (28) ms; painted 8 (61) ms | `present.jsonl` |
| The same, deck A | 5 (18) ms; painted 8 (45) ms | same |
| Deck B (85 slides) cold: final headers; ready; LCP | 621 (2,732); 1,087 (3,166); 1,228 (3,536) ms | `filmstrip.jsonl`, load 18 to 21 |
| Deck B: the visible filmstrip cards (7) hold their clones with every picture decoded | 1,226 (3,523) ms from navigation | same |
| Deck B: a jump to the middle of the filmstrip, visible cards filled again | 35 (35) ms | same |
| Deck B: bytes to open; images | 4,526 KB; 2,770 KB in 36 image requests | same |

### 2.3 The PDF export

| Measure | Median (worst) | Source |
| ------- | -------------- | ------ |
| PDF of deck A (one slide, light theme) through `export.run`, the File > Download > PDF path, from the action to the downloaded file | 4,509 (5,092) ms; 34,826 bytes | `export.jsonl`, five runs, 02:02 to 02:04 UTC |
| The same: the `syncExportFn` request's server wait | 1,505 (4,614) ms: 4,614 on the first export, 1,223 to 1,814 on the next four | same |
| The same: the action to the start of that request | 45 ms in two runs; 2,256 to 2,780 ms in three | same |
| PDF of deck B (85 slides, light theme), two runs at 02:08 to 02:09 UTC | 10,262 and 13,976 ms; 19,051,996 bytes; server wait 9,328 and 12,960 ms; the request began 193 and 285 ms after the action | same |

### 2.4 Google Slides measured the same way

The public presentation of the Slides API quickstart (`PRESENTATION_ID = "1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc"`, read on https://developers.google.com/workspace/slides/api/quickstart/python on 2026-10-02 UTC), five slides titled "Baby album", opened at `/edit` without signing in. Google serves it in a read only editor with a sign in link. "Ready" is the filmstrip's thumbnails present beside the canvas. Google's scripts come from another origin without `Timing-Allow-Origin`, so their bytes are read from the protocol (`request.sizes()`); Resource Timing reports them as zero. Bot run, 01:57 to 01:58 UTC, load average 41 to 55.

| Measure | Cold median (worst) | Warm median (worst) |
| ------- | ------------------- | ------------------- |
| `/edit`: first byte; FCP; LCP; ready | 308 (581); 768 (1,076); 1,420 (2,576); 2,486 (2,899) ms | 125 (155); 304 (452); 552 (720); 1,620 (3,524) ms |
| `/edit`: script bytes; all bytes; requests | 5.5 MB in 23 files; 13.3 MB; 278 (283) | 0; 106 KB; 279 |
| `/edit`: main thread script; longest frame; CLS | 1,719 (1,959) ms; 667 (705) ms; 0.0989 (0.1005) | 1,685 (3,427) ms; 715 (1,215) ms; 0.0978 |
| `/present`: first byte; FCP; LCP; ready | 334 (655); 964 (1,288); 1,056 (1,320); 1,064 (1,328) ms | not measured |
| The caret, a keystroke, a PDF export, a deck list | not read: the anonymous view cannot edit, and the deck list needs an account | |

The person agent run of the same page (02:11 to 02:12 UTC, load 122 to 158) read the same first byte (333 ms median) and bytes (13.4 MB, 5.5 MB of script), with FCP 808, LCP 1,568 and ready 2,851 ms; its main thread numbers carry that load.

On this machine Turboslide's editor reaches ready before Google's read only editor at the median (863 ms in the person rerun and 669 ms in the bot run, against 2,486 ms), with a sixth of the script bytes over the wire (872 KB against 5.5 MB) and a fifth of the main thread script time (314 ms against 1,719 ms, at different loads). Google answers its editor's first byte sooner (308 ms against 419 to 457 ms) and draws a filmstrip of five slides; Turboslide's deck B of 85 slides reaches ready at 1,087 ms.

## 3. The server

- Region. Every function answer carried `x-vercel-id` `sfo1::iad1::...`: the edge in San Francisco, the function in Washington, D.C. `/home` is a static file at the edge (`x-vercel-cache: HIT`, `age: 20114` at 01:35:43 UTC), prerendered at build (`apps/studio/vite.deploy.config.ts` 205 to 221).
- Cache headers, read with `curl` at 01:35 to 01:48 UTC. Documents answer `cache-control: public, max-age=0, must-revalidate`; `/decks`, `/new` and `/edit/<id>` answer `x-vercel-cache: MISS`. Hashed chunks answer `public, max-age=31536000, immutable` with `HIT`. A thumbnail (`/api/render/title?deck=...&w=320&r=1`) answers a `302` to the public Blob object with `public, max-age=31536000, immutable` and `HIT`. Every other `/api` answer is `no-store` (`apps/studio/src/server/headers.ts` 280).
- No `server-timing` header on any answer, and none in the tree (`grep -rn -i server-timing apps/studio/src packages` finds nothing). The function's own phases cannot be read from outside.
- Two functions per editor boot. `functionRules` (`vite.deploy.config.ts` 300 to 310) give `/_serverFn/**`, `/api/export/**`, `/api/render/**` and the others their own Vercel function directories (`nitro` 3.0.260903-beta `dist/_presets.mjs` 1437 to 1441, one `createFunctionDirWithCustomConfig` per pattern). The editor's document is rendered by the base function and its server function calls run on the `/_serverFn` function, so the two cold start apart and share no instance cache (the listing's `listed` map, the identity index, the template index).
- Cold against warm. No answer carries an instance id or a boot time, and production's traffic decides which instance answers, so the document function's cold start was not isolated (section 7). The export function shows one: the first PDF of the session waited 4,614 ms at the server and the next four 1,223 to 1,814 ms. `docs/performance.md` 96 records 1,424 ms for a cold first byte of `/new` on 2026-09-13.
- The share of the editor's boot spent on the server. Per cold sample, the document's server wait (`finalResponseHeadersStart` minus `requestStart`) was 50 to 71 percent of the time to ready in the person rerun (342 to 719 ms of 663 to 1,018 ms) and 63 to 72 percent in the bot run; the warm samples read 32 to 88 percent. The three server functions the editor calls at hydration (`exportCapabilitiesFn`, `connectFactsFn`, the session `attachFn`) start 6 to 18 ms before ready and overlap it by 6 to 57 ms, so they do not hold the seller. The client's own part, from the document's end to ready, is 183 to 389 ms on a cold load. The names come from hashing `<file>--<name>_createServerFn_handler` with SHA-256, which reproduces every id seen: `8f65781f` `exportCapabilitiesFn` (`apps/studio/src/server/download.ts` 219), `3a277a5c` `connectFactsFn` (`server/bundle.ts` 105), `2d9a6ce6` `attachFn` and `bf5e8df0` `pollFn` (`server/sessions.ts` 205, 252), `4b2ac650` `runDeckActionFn` (`server/agent-actions.ts` 280), `376e57a1` `readEditorDeckFn` (`server/write.ts` 401), `82de7230` `syncExportFn` (`server/download.ts` 324) and `d7a2e7f8` `pollExportFn` (`server/download.ts`), `5f3e5dc3` `warmThumbnails` (`server/warm.ts`).

## 4. The ten largest costs, ranked by the time a seller waits

### 1. The deck list's cards wait for a head of every deck in the store

- Measured: `/decks` paints its shell at 296 ms and hydrates at 434 ms (person rerun, cold), and its first card arrived at 2,372 to 2,636 ms in five cold loads and at 14,086 to 14,913 ms in the other five (02:13 and 02:23 UTC). In the bot run the same listing held the whole answer for 2.0 to 13.7 s. Two `fetch` reads with a person's agent at 01:52:38 to 01:52:43 UTC streamed a 45,370 byte shell at 225 to 482 ms and the cards at 2,124 to 2,469 ms. The listing names 148 decks, 120 of them `untitled-*` scratch decks.
- Why: the loader returns `listDecks()` unawaited (`apps/studio/src/routes/decks.index.tsx` 117 to 127), so the shell streams. The blob collection's `list` (`packages/store/src/blob-store.ts` 2696 to 2733) lists every folder under `decks/` (`deckIds`, 2507 to 2530) and heads each deck's `deck.json` four at a time (2723), with a body read when the etag moved (`cardOf`, 2602 to 2628). At about 150 decks that is about 38 rounds of Blob round trips from `iad1`, and it grows with every deck anyone leaves on the deployment. Each head runs under a 4,000 ms deadline (`BLOB_LISTING_READ_TIMEOUT_MS`, 671), so three rounds that meet a slow or busy store reach 12 s. That this is the 14 s mode is likely and not confirmed: the function's log lines for it (`cardOf` logs one per refused read, 2622 to 2626) were not read. `docs/performance.md` 333 to 334 already names the fix for "past about 50 decks".
- Fix: one index object per deployment (`decks/index.json`: id, title, owner, updated, trashed, appearance, first slide), written by create, rename, copy, trash, restore and remove under an etag condition and read in one GET by the listing; the heads run only for the first screen's twelve cards to prove them fresh. List the caller's own decks and the decks shared with them first, and page the rest.
- Expected: cards at about 400 to 600 ms (the 144 ms shell plus one Blob read of 50 to 100 ms plus the render), 1.8 to 2.2 s sooner in the fast mode and about 14 s sooner in the slow one, and about 150 fewer Blob simple operations per view.

### 2. The editor's document waits on a serial chain of store reads

- Measured: the editor's final headers came at 457 (720) ms cold in the person rerun, 419 (517) ms in the bot run and 663 (4,837) ms in the first person run. Ten document reads with the owner's cookie at 01:52:59 to 01:53:04 UTC ended at 356 to 764 ms (median 532 ms). That wait is 50 to 72 percent of the time to ready on a cold load (section 3).
- Why: `readEditorDeckFn` (`apps/studio/src/server/write.ts` 401 to 543) awaits one store read after another: the deck's head (`hasStoredDeck`, 421), the identity with a fresh index read (429), the access decision (431), the room (440), the live head (452), then the document, the version log and the leases together (453 to 457), the access record (472), the resolved identity (476), the template index pulled from the store (`defaultKitOfCollection`, 492 and 623 to 627), the comment threads (513 to 524) and the identity views (526). About eight of these are separate round trips to the Blob store in sequence.
- Fix: start the reads that do not depend on each other in one `Promise.all` (identity, access record, template index, comments, the deck's read); drop the separate `hasStoredDeck` head, since a read of a missing deck already maps to `null` through `isGoneDeck` (395 to 399); keep the template index and the identity index in a per instance cache with a short time to live, as the listing keeps its `listed` map. On the `do` tier of the realtime round, read the document at the head from the deck's object (`docs/CLOUDFLARE.md` 17 in the realtime worktree).
- Expected: 150 to 300 ms off the editor's first byte (three to five serial round trips of 50 to 70 ms), so ready near 600 ms cold at the median of the person rerun and near 450 ms at the bot run's load.

### 3. A PDF export waits before it starts, cold starts, and makes a 19 MB file

- Measured: a one slide PDF took 1,859 to 5,092 ms from the action to the file (median 4,509 ms). The request to `syncExportFn` began 45 ms after the action in two runs and 2,256 to 2,780 ms after it in three; its server wait was 4,614 ms on the first export and 1,223 to 1,814 ms after. An 85 slide PDF took 10,262 and 13,976 ms, of which the server waited 9,328 and 12,960 ms, and the file is 19,051,996 bytes.
- Why: the server side is the export function's Chromium (`syncExportFn`, `apps/studio/src/server/download.ts` 324 to 345; the hosted path is synchronous). Before it renders, the server waits up to ten seconds for shader frames (`download.ts` 63 to 73). The client waits in `export.run` before it posts (`apps/studio/src/editor/controller.tsx` 3530 to 3575: `exportMode.read()` at 3534, then `runSyncExport` at 3574); which await takes the 2.3 to 2.8 s was not identified (section 7). The file's size is the default flatten mode, a 2x page raster under an invisible text layer per page (`packages/schema/src/actions.ts` 2712 to 2719).
- Fix: find the client wait with a `performance.mark` per await of `export.run`; start the export function when the Download menu opens (a warm call, as `warmThumbnails` does for thumbnails) so the first export of a session does not pay Chromium's start; skip the shader wait when the deck carries no shader; store the page rasters as JPEG or offer the native mode for PDF (the size of either file was not measured here).
- Expected: about 2.5 s off three exports in five, about 3 s off the first export of a session, and a smaller file.

### 4. An 85 slide deck downloads 2.8 MB of pictures to open

- Measured: deck B's visible filmstrip cards were filled 1,226 ms after navigation at the median and 3,523 ms at the worst, with 2,770 KB of images in 36 requests and 4,526 KB in all. LCP was the same moment (1,228 ms).
- Why: the filmstrip's clones are the renderer's HTML and draw each picture's full twin; `docs/performance.md` 333 records "a 200 px clone decodes 1600 px twins today" and names the 320 px variant as work that has not landed.
- Fix: a 320 px variant of every twin, chosen by the clones and the deck cards with `srcset`, and `loading="lazy"` with `decoding="async"` on clones out of view (the live clones already add both, `packages/viewer/src/LiveClone.tsx` 36).
- Expected: about 2 MB less on an 85 slide deck and the visible cards filled within about 100 ms of ready.

### 5. The editor's first byte has a slow mode of seconds

- Measured: one cold editor load in five of the first person run waited 4,837 ms for its final headers (01:58:40 UTC, `x-vercel-id sfo1::iad1::lzxbl-1790906317469-a7f90d9bb9d1`); the rerun's worst was 1,287 ms. `docs/performance.md` 325 to 326 recorded two editor stalls past 120 s on 2026-09-14.
- Why: not read. The function's logs were not read (no access in this workflow), and no answer carries `server-timing`. Item 2's chain meeting a busy store and a cold pair of the base and `/_serverFn` functions are the two candidates.
- Fix: a `server-timing` header on documents and server functions, with one entry per store read and a `cold` entry with the instance's age; then item 2.
- Expected: the slow mode named the next time it happens; with item 2, its worst case bounded by one read.

### 6. Every route parses a 1.18 MB entry chunk

- Measured: `index-BFThf855.js` is 1,176,073 bytes decoded (326,809 bytes brotli) on every route, `/home` included. `/edit` loads 2,682 KB decoded in 26 files and `/decks` 2,669 KB in 25. The main thread spent 140 ms on script for `/home` and 314 ms for `/edit` cold in the person rerun. The same entry measured 583,982 bytes on 2026-09-18 (`docs/gslides-parity/focus/build/integrator.md` 635).
- Why: the entry holds the action table (`@turboslide/schema/actions`, 298 zod `.describe(` calls between bytes 1,007,577 and 1,146,412 of the decoded chunk), the shape table (a 221,128 byte JSON string at byte 622,714, `packages/schema/src/shapes/definitions.ts` through `packages/schema/src/shapes.ts` 15), zod's JSON Schema converter (the `openapi-3.0` target at byte 445,961), the block field help table and `react-dom` 19.3.0 (`perf/chunk-probe.out.jsonl`). On 2026-09-18 the schema sat in the `Frame` chunk (`integrator.md` 636); today `Frame-gfe57f6a.js` is 22,900 bytes. No workspace package declares `sideEffects` (`packages/*/package.json`), so any client module that imports a schema file keeps the whole table. Which import brought it back was not read (section 7). The gate does not catch it: `scripts/check-client-bundle.mjs` 195 to 208 fails the 600,000 byte ceiling only when a `vendor-*.js` chunk exists, and the `vendor` group of `vite.deploy.config.ts` 228 to 244 has never produced one (none is in production's chunk list).
- Fix: build once with `TURBOSLIDE_CLIENT_SOURCEMAP=1` and run `scripts/chunk-attribution.mjs` on the entry; move the importer behind the route's component; add `"sideEffects": ["*.css"]` to the workspace packages; make the 600,000 byte ceiling assert on the entry chunk whether or not a vendor chunk exists.
- Expected: the entry back near 584 KB, `/home` from 1,235 to about 640 KB decoded, about 50 to 150 ms less main thread script on every cold load on this machine, and several times that on a mid range laptop.

### 7. The list page loads the editor and up to fourteen editor loaders

- Measured: `/decks` decodes 2,669 KB of script, of which `EditorRoot-uqwe7lvt.js` 482,561, `Slideshow-gZjcclX8.js` 726,393 and `SlideList-BenQPH8w.js` 100,486 bytes are the editor's. It calls `readEditorDeckFn` twice at hydration (the Recent row) and twelve more times once the cards stream in (answers of 13.6 to 66 KB, the last ending 1.0 to 3.9 s after navigation in the first person run). Its main thread script was 164 ms against 140 ms on `/home` in the rerun.
- Why: the first twelve cards preload the editor's route and loader on viewport entry (`decks.index.tsx` 152 to 153, 1418 to 1421) and every link preloads on intent (`apps/studio/src/router.tsx` 81, 88). Each preload is one `/_serverFn` invocation running item 2's chain.
- Fix: preload the route's chunks once at idle, and the loader on intent only (a pointer resting 100 ms, or `touchstart`), for every card; keep the viewport loader preload for the Recent row's first three at most.
- Expected: the list's main thread close to `/home`'s, and twelve fewer function invocations with their store reads per view. The transition it buys stays: the measured click came after a 200 ms hover, which starts the same preload.

### 8. The editor answered 500 while listings ran

- Measured: one cold editor load in the bot run answered HTTP 500 at 01:46:36 UTC (`x-vercel-id sfo1::iad1::j65gc-1790905596823-0885601a2534`) and drew the refusal page; ready never came in 120 s. Three `/decks` listings were in flight at that moment (two `fetch` reads at 01:46:23 and 01:46:32 UTC and the probe's warm `/decks` at 01:46:24). The other 46 editor document loads whose status this audit recorded answered 200.
- Why: likely the store's rate limit. Vercel Blob on Pro allows 7,200 simple operations a minute (120 a second) per store (https://vercel.com/docs/vercel-blob/usage-and-pricing, "Operation rate limits", last updated 2026-09-23, read 2026-10-02 UTC), and three listings of about 150 heads each inside ten seconds, plus the preloads, approach it. Not confirmed: the function's log for that request was not read. `has` already serves the instance's mirror when the store is busy (`blob-store.ts` 2738 to 2748); the editor loader's other reads do not.
- Fix: item 1 removes most heads; the loader serves the mirror on a busy store (`isStoreBusy`) for every read of its chain, as `has` does, and answers the refusal page only when the mirror is missing.
- Expected: the reload and its 1 to 2 s gone for the seller who meets it.

### 9. A keystroke right after the editor boots can wait half a second

- Measured: in the first person run one cold editor load painted the first keystroke 486 ms after `keydown` (the Event Timing entry for `keydown` read 520 ms with 3 to 8 ms of handler time), inside an 892 ms long animation frame between about 1.5 and 2.4 s after navigation, at load 47. The other 28 first keystrokes of the three runs painted in 4 to 13 ms.
- Why: not attributed (this probe kept no script entries of the long frame). The window holds the answers of three `runDeckActionFn` calls (`comment.list`, `notification.list`, `notification.settings`, `apps/studio/src/editor/controller.tsx` 1806 and 1861 to 1865), the last at 1,861 ms, and the session poll.
- Fix: gather the three calls into one, apply their answers in an idle callback, and record the long frame's script attribution in the gate (`scripts/perf-budget.mjs` 378 keeps two script entries per frame).
- Expected: the stall named, and its 0.5 s gone from the boots that meet it.

### 10. Fonts: 741 KB on the editor and 353 KB on the home page

- Measured: `InterVariable-DiVDrmQJ.woff2` is 352,540 bytes over the wire on every route and `InterVariable-Italic-FCBEiFp6.woff2` 388,276 bytes is fetched on the editor: 741 KB of the editor's 1,689 KB and 353 KB of `/home`'s 1,022 KB.
- Why: one file per style with every script Inter covers and no `unicode-range` (`packages/fonts/src/inter.css` 8 to 20); the upright is preloaded on every route and the italic prefetched on the editor (`apps/studio/src/routes/__root.tsx` 140 to 157).
- Fix: split each face by `unicode-range`, Latin first and the other scripts in files that load only when a page draws them. A Latin subset made here with `fontTools.subset` 4.63.0 (Google Fonts' Latin range, every layout feature, both axes) measured 105,176 bytes for the upright and 115,668 for the italic. Keep the export faces whole (`packages/fonts/export`).
- Expected: 247 KB less on `/home` cold and 520 KB less on `/edit` cold; at 10 Mbit/s about 0.2 s and 0.4 s, and little on this wired link.

### Costs that hold no seller but cost money or mislead the gate

11. The gate measures the bot path. `scripts/perf-budget.mjs` 619 to 626 opens contexts with the headless agent, which `isbot` classes as a bot, so its `/decks` rows read the whole listing as the first byte (the bot run's 2.6 to 13.7 s) and its FCP rows a page that a person never sees. Fix: set a person's agent string in `newContext`. Expected: the gate's `/decks` numbers match what a seller meets.
12. Seven server function calls at every editor open. `exportCapabilities()` and `connectFacts()` (`apps/studio/src/editor/EditorRoot.tsx` 631 to 639) return deployment facts; with the session `attachFn`, three `runDeckActionFn` and the first `pollFn` that is seven `/_serverFn` invocations in the first second, on a function directory that cold starts apart from the document's. Fix: carry the two deployment facts in `readEditorDeckFn`'s payload and gather the comment and notification reads into one call. Expected: four fewer invocations per editor open and fewer cold starts; no change in the seller's wait.
13. The renderer's CSS inline in every document (`__root.tsx` 278 to 282, `BLOCK_CSS`): 29,235 bytes (6,995 brotli) of `/home`'s 55,615 byte document, read at 02:12 UTC, repeated in every HTML answer. Fix: serve it as a hashed stylesheet the browser caches. Expected: about 7 KB brotli less per document after the first.
14. Exports outlive their deck. `deck.remove` deletes the `decks/<id>/` prefix (`blob-store.ts` 2869 to 2900) and leaves `exports/<id>/<job>/` (`apps/studio/src/server/export-sync.ts` 118). This audit's seven PDFs, about 38.3 MB, stay in the store after the decks' removal (section 9). Fix: remove the deck's export prefix with the deck, and expire export copies after a day. Expected: storage that stops growing with every export (`audit-cost.md` cut 13 prices the store's growth).

## 5. The budget each route should meet

Measured from a wired link like this machine's at a load average under 20, with a person's agent, five cold and five warm loads; the median meets the first number (cold) and the second (warm), and the worst of five stays under twice the median. "Today" is the person rerun of section 2.1, with the bot run in brackets where it reads the editor at a lower load. Google is section 2.4.

| Route or action | Metric | Today | Google Slides | Budget |
| --------------- | ------ | ----- | ------------- | ------ |
| `/home` | final headers; LCP; JS decoded; fonts | 22 ms; 236 ms; 1,235 KB; 353 KB | not comparable | 50 / 30 ms; 400 / 200 ms; 600 KB; 120 KB |
| `/decks` | final headers; FCP; first card | 144 ms; 296 ms; 2.4 to 2.6 s or 14.1 to 14.9 s | not read: the list needs an account | 200 / 150 ms; 400 / 250 ms; 800 / 500 ms |
| `/decks` | JS decoded; server functions before the first click | 2,669 KB; up to 14 | not read | 700 KB; 3 |
| `/edit/<one slide>` | final headers; FCP; ready | 457 (419) ms; 572 (524) ms; 863 (669) ms | first byte 308 ms; FCP 768 ms; ready 2,486 ms | 300 / 200 ms; 450 / 300 ms; 650 / 450 ms |
| `/edit/<one slide>` | caret from navigation; keystroke to frame | 1,027 (747) ms; 9 ms, 486 ms worst of 29 | not read (view only) | 750 / 550 ms; 16 ms, worst 50 ms |
| `/edit/<one slide>` | JS decoded; fonts | 2,682 KB; 741 KB | 5.5 MB of script over the wire | 1,800 KB; 240 KB |
| `/edit/<85 slides>` | ready; visible filmstrip filled; images before the fill | 1,087 ms; 1,226 ms; 2,770 KB | not read | 900 ms; ready plus 150 ms; 800 KB |
| `/decks` to editor, in page | pointerdown to ready | 34 ms (117 worst) | not read | 150 ms |
| editor to `/decks`, in page | pointerdown to hydrated | 25 ms (28 worst) | not read | 100 ms |
| Slideshow | click to the first slide painted | 8 ms (61 worst) | not read; the `/present` document is ready at 1,064 ms | 50 ms |
| `/present/<deck>` | final headers; ready | 687 ms; 1,243 ms | 334 ms; 1,064 ms | 400 ms; 900 ms |
| PDF, one slide | action to file | 4,509 ms (1,859 best) | not read | 2,500 ms; 4,000 ms for the first of a session |
| PDF, 85 slides | action to file; file size | 10,262 and 13,976 ms; 19.1 MB | not read | 10 s; 8 MB |
| every route | CLS; longest frame after ready | 0.038 worst on `/decks`, 0 elsewhere; 892 ms worst on `/edit` | 0.0989 on `/edit`; 667 ms | 0.01; 100 ms |

These budgets keep `docs/performance.md` section 3's ceilings where those are already met or tighter, and replace its `/decks` first byte rows, which read the bot path, with the shell and the first card.

## 6. What the realtime round changes

Read on the branch `realtime/round` at `8fdb0c4f` (27 commits past `origin/main`) and in `docs/CLOUDFLARE.md` there; nothing of it is on production yet.

- The room moves to one Durable Object per deck over hibernating WebSockets (`docs/CLOUDFLARE.md` 17). The session poll, the SSE stream and the presence POSTs leave the Vercel functions, so items 9 and 12 lose part of their calls. The boot gains a WebSocket upgrade to `turboslide-realtime` on Cloudflare, which no one has measured from a browser yet (`docs/CLOUDFLARE.md` 34).
- The loader is to read the document at the head from the object (`docs/CLOUDFLARE.md` 17), which removes the live head and the version log reads of item 2's chain if the object answers the Vercel function sooner than the Blob reads it replaces; the hop from `iad1` to Cloudflare is unmeasured.
- The accounts move to D1 behind the Worker's bearer routes (commit `b9e9d671`, "the accounts on D1 through the Worker's bearer routes, the proxy dialect, the principal store and the session facts cache"). Every identity read in item 2's chain then crosses from `iad1` to Cloudflare. The session facts cache in that commit is what keeps the editor's first byte from growing, and its hit rate should be a gate row.
- Nothing in the branch touches items 1, 3, 4, 6, 7, 10 or 14.

## 7. Open

- The importer that put the schema back into the entry chunk (item 6). Reading it needs a client build with `TURBOSLIDE_CLIENT_SOURCEMAP=1`, which this workflow does not run.
- Why the `vendor` chunk group never applies under Vite 8.2.2 and Rolldown 1.2.8 (Rolldown's `codeSplitting` output option exists in 1.2.8's type definitions). Not read.
- The client wait of 2.3 to 2.8 s before `syncExportFn` in three PDF exports of five (item 3).
- The 14 s listing mode, the 4.8 s editor first byte and the 500 (items 1, 5 and 8): the function logs of `turboslide-gt` were not read.
- The document function's cold start against warm (section 3): no header names an instance.
- The 892 ms long frame after boot (item 9): no script attribution was recorded.
- Google's caret, keystroke, PDF export and deck list: not read without an account.
- The seven export copies of section 9 were not removed: this workflow has no store token and the app has no action that removes them.

## 8. Sources

- Production, read 2026-10-02 01:35 to 02:25 UTC: `/home`, `/decks`, `/new`, `/edit/<deck A>`, `/edit/<deck B>`, `/present/<deck B>`, `/decks/templates`, `/api/agent` and `/api/actions/deck.info`, `deck.trash` and `deck.remove` (with the bearer, printed nowhere), `/api/render/title?deck=<deck A>&theme=light&w=320&r=1`, and the chunks `index-BFThf855.js`, `Slideshow-gZjcclX8.js`, `EditorRoot-uqwe7lvt.js`, `SlideList-BenQPH8w.js`, `Frame-gfe57f6a.js`.
- Google: https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit and `/present`, read 2026-10-02 01:57 to 02:12 UTC; https://developers.google.com/workspace/slides/api/quickstart/python for the id.
- Vercel: https://vercel.com/docs/vercel-blob/usage-and-pricing (last updated 2026-09-23, read 2026-10-02 UTC): simple operations count "when a blob is accessed by its URL and it's a cache MISS or when using the `head()` method"; Pro allows 7,200 simple and 4,500 advanced operations a minute.
- The tree: the files and lines cited in sections 3 and 4; `docs/performance.md`; `docs/gslides-parity/focus/build/integrator.md` 627 to 660; `docs/gslides-parity/next/audit-cost.md` for the money of the same costs.
- The evidence: `docs/gslides-parity/next/perf/` (the probes, `summarize.mjs`, `chunk-probe.out.jsonl`, the samples under `state/` with the first person run under `state/first-person-run/`, the run logs under `logs/`).

## 9. The scratch decks

Removed by id through `POST /api/actions/<action>?deck=<id>` with the bearer of `~/.config/turboslide/hosts.json` for `https://www.turboslide.com`, read into the child's environment by the wrapper and printed nowhere (`perf/state/cleanup.log`):

- `untitled-20261002-f89y`: `deck.info` 200 at revision 61 (02:24:43 UTC); `deck.trash {id, baseRevision: 61}` 200; `deck.remove {id, confirm: true, baseRevision: 61}` 200 `removed: true`; `deck.info` 404 `unknown_deck` at 02:24:45 UTC.
- `general-translation-brand-deck-muqat38fw5e5`: `deck.info` 200 at revision 0 (02:24:46 UTC); `deck.trash` 200; `deck.remove` 200 `removed: true`; `deck.info` 404 `unknown_deck` at 02:24:48 UTC.
- Left in the store: the seven PDF copies this audit exported under `exports/untitled-20261002-f89y/` (five files of 34,826 bytes) and `exports/general-translation-brand-deck-muqat38fw5e5/` (two files of 19,051,996 bytes), about 38.3 MB (item 14).
- No other deck was read for removal, swept or touched; `gt-brand` was never opened in the editor.
