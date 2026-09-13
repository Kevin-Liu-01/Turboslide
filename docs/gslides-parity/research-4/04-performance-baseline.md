# 04. Performance baseline of Turboslide on production, 2026-09-13

The reader baseline for round four. Every number here was measured on 2026-09-13 against
`https://turboslide.vercel.app` (the deployment whose client chunk hashes match the local
`apps/studio/dist` built at 10:05 that day: `index-Bw0tvTCg.js`, `freeform-RWS0kKXS.js`,
`render-D5MrLHnB.js`) from Kevin's machine (Apple M5 Max, macOS 26.4, Node 24.13.0), over a
connection `networkQuality` rated at 839 Mbps down, 690 Mbps up, 12.6 ms idle latency. The
functions answered from `iad1` (every `x-vercel-id` read `sfo1::iad1::…`), so about 65 ms of every
server round trip is the coast to coast path. Kevin's directive for the round, verbatim: "make
transitions between different websites and doing stuff in the slides so much faster and more
performant".

Sections 4 to 8 hold the measurements. Section 9 ranks what a sales user waits on. Section 10 maps
the honest turbo-fast story onto what the code does today. Section 11 lists the sources.

## 1. Method

### 1.1 Browser and harness

- Playwright-core 1.62.1 from the repository's `node_modules` (through
  `createRequire('/Users/kevinliu/repos/Turboslide/package.json')`), driving Chrome for Testing
  147.0.7727.15 at `~/Library/Caches/ms-playwright/chromium-1217/…`, headless, viewport 1440 by
  900, launched with `--use-gl=angle --use-angle=metal --ignore-gpu-blocklist` (the flags
  AGENTS.md "Chromium" names for macOS) so shader materials run on the GPU as they do for a person.
- The harness is a set of scripts in the session scratchpad (`perf/lib.mjs`, `perf/loads.mjs`,
  `perf/editor.mjs`, `perf/drag.mjs`, `perf/drag2.mjs`, `perf/idle.mjs`, `perf/analyze-loads.mjs`);
  the raw JSON of every run sits beside them (`perf/out/`). Nothing was installed, built or
  committed; no dev server ran; one browser page ran at a time.
- An init script in every page records: the last `largest-contentful-paint` entry (buffered), the
  first appearance of the route's landmarks through a `MutationObserver` plus a 4 ms poll
  (`.ts-title-row`, `.ts-home-page`, `.pt-viewer`, `.ts-presenter`, `.ts-stagewrap canvas`,
  `[data-recipe]`), the first moment `window.turboslide.studio` exists, and the first moment
  `.pt-viewer[data-settled]` and `[data-hydrated]` appear.
- Every request is logged with Playwright's `request.timing()`; resource sizes come from the
  Resource Timing API (same origin, so `transferSize`, `encodedBodySize` and `decodedBodySize`
  are exposed). JS heap and DOM counts come from the CDP `Performance.getMetrics` domain.

### 1.2 Definitions

- Cold: a fresh browser context (empty HTTP cache, no storage). Warm: the same context loading the
  same address a second time (hashed assets from the cache; the function already warm from the
  cold request). Three rounds per route, so three cold and three warm samples; medians are quoted
  with the range.
- TTFB: `responseStart` of the document request from Playwright's request timing. The
  Navigation Timing entry's `responseStart` in this Chrome build reports 8 to 37 ms for every
  route, which curl and Playwright both contradict (105 to 140 ms for the same shell); it is
  recorded in the raw JSON as `nav.ttfb` and not used.
- LCP: the last LCP entry's `startTime` once the route is ready. FCP: the `first-contentful-paint`
  paint entry.
- Hydration proxy for the `ssr: false` routes (`/new`, `/edit/:id`, `/present/:id`): the first
  appearance of the route's own DOM (`.ts-title-row` in the editor, `.ts-presenter` in the
  presenter), since the server sends an empty shell and everything on screen is client rendered.
  For the SSR routes (`/decks`, `/decks/trash`) hydration is the `data-hydrated` attribute the
  page sets from its first client effect (`decks.index.tsx`).
- TTI proxy: `window.turboslide.studio` defined (the window API's owner registered, SPEC 7.4) and
  `.pt-viewer[data-settled]` (the shell's ready flag, `ViewerShell.tsx:548`). For the home page
  and the trash, `[data-hydrated]`.
- Editor action latency is measured inside the page with `performance.now()`: the `pointerdown`
  of the click (or the `keyup` of the last keystroke), the first `MutationObserver` callback in
  which the predicate holds, the next `requestAnimationFrame` after it ("painted frame"), the
  local commit (`describe().state.revision` past the start), and the saved write
  (`serverRevision >= revision` and `pending === 0`, the same condition the repository's own
  e2e specs use).
- Filmstrip scroll frame rate: `requestAnimationFrame` timestamps recorded while
  `mouse.wheel(0, ±320)` fires 18 times at 80 ms gaps over the `.ts-film` list; fps is frames
  over the span, with the median, p95 and longest frame and the count over 33.4 ms and 50 ms.
- Thresholds used to grade: LCP good at or under 2.5 s, poor above 4.0 s; interaction to next
  paint good at or under 200 ms, poor above 500 ms (web.dev, section 11).

### 1.3 Scratch deck

The editor session ran on a deck created from `/new` by typing into the empty title heading (the
first write creates the deck, `server/write.ts` `createStoredDeck`), then trashed from `/decks`
(card menu, Move to trash) and deleted forever from `/decks/trash` (Delete forever, confirm). Three
such decks were made and removed (`untitled-20260913-1st4`, `untitled-20260913-hhh5`,
`untitled-20260913-203u`); `GET /deck/<id>` answered 404 for each afterwards (section 8). Nothing
else on the store was written.

## 2. What ships to the browser

### 2.1 The shell and the chunk set

Every route's document carries the same `<head>`: 11 stylesheets, 15 to 16 `modulepreload`
links, the theme boot script, the renderer's block CSS inline, and `rel="icon" href="data:,"` (no
favicon file yet, `__root.tsx`). The `ssr: false` routes send a 24.6 KB HTML shell (24,563 bytes for
`/new`, 24,649 for `/edit/gt-brand`, 24,941 for `/present/gt-brand`) with no route markup at all;
`/decks` sends 50.7 KB and `/decks/trash` 27.5 KB of server rendered HTML; `/deck/gt-brand` sends
381 KB, of which 269 KB is one inline `<script>` (the dehydrated loader payload: the 85 rendered
slide bodies as strings), 20 KB inline CSS and about 111 KB of markup with one `.pt-slide`
rendered.

The client build (`apps/studio/dist/client/assets`, 47 files) is 2,883,002 bytes of JavaScript
(757 KB gzip, the Vercel CDN serves brotli) and 186,848 bytes of CSS (29 KB gzip), plus Inter as two
variable faces (352 KB roman, 381 KB italic, woff2). The document preloads 15 chunks; the
`/edit` shell preloads these (sizes raw, gzip -9, brotli -q 11):

| Chunk                          | Raw bytes | gzip    | brotli  | What is in it (string markers in the minified code)                                                                                                           |
| ------------------------------ | --------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index-Bw0tvTCg.js`            | 1,122,594 | 358,921 | 305,950 | React DOM, TanStack Router and Start client, `@paper-design/shaders` (20 GLSL literals, 73 KB of shader source, 635 `u_*` references), `marked`, the chrome  |
| `freeform-RWS0kKXS.js`         | 709,434   | 81,068  | 65,725  | `@turboslide/schema`: zod schemas plus `shapes/definitions.ts`, the ECMA-376 preset shape geometry table as pretty printed JSON (1,156 `lnTo` ops, 528,840 bytes of source) |
| `render-D5MrLHnB.js`           | 498,513   | 146,328 | 119,918 | `@turboslide/render` (`renderSlide`), the menu model and its strings, the viewer, a second copy of the Paper uniform tables (231 `u_*` references)              |
| `Frame-z3ekpyfa.js`            | 93,549    | 25,486  | 22,031  | the chrome frame                                                                                                                                              |
| `slide-eHr-1Nqg.js`            | 63,390    | 20,744  | 18,703  | slide helpers, `marked`                                                                                                                                       |
| `keys-BFakNpVP.js`             | 62,921    | 17,206  | 15,045  | the key table                                                                                                                                                 |
| `edit._deckId-Clwd3Ghd.js`     | 50,698    | 17,394  | 15,669  | the editor route (one of two chunks)                                                                                                                          |
| `edit._deckId-DH5TYv3U.js`     | 50,500    | 17,335  | 15,613  | the editor route (the other)                                                                                                                                  |
| `Tooltip-CPAaamUt.js`          | 48,448    | 14,501  | 12,125  | the Tooltip primitive and its dependencies                                                                                                                    |
| `preload-helper-B5STkB3_.js`   | 45,428    | 14,401  | 12,864  | Vite's preload helper and shared runtime                                                                                                                      |
| `link-CiB5xH6Z.js`             | 30,216    | 11,169  | 10,066  | router link                                                                                                                                                   |
| `useStudioSession-iVwiX2gp.js` | 23,053    | 8,816   | 7,737   | the studio session and the window API glue                                                                                                                    |
| `dither.worker-Cj3g7VXV.js`    | 9,737     | 3,814   | 3,408   | the dither preview worker: the TypeScript stages of `@turboslide/effects`, no wasm                                                                            |

Two facts about this set matter for the round:

1. The set is the same for every route. `/new`, `/decks`, `/decks/trash` and `/present` all load
   16 JS files, 2,660 to 2,675 KB decoded (724 to 729 KB over the wire cold, 0 KB warm because the
   `/assets/*` files are `public, max-age=31536000, immutable` and the CDN answers `HIT`). The home
   page downloads the shader library, the shape geometry table and the whole editor to draw a list
   of cards.
2. The `freeform` chunk is a 709 KB JavaScript module because `packages/schema/src/shapes/definitions.ts`
   inlines the preset shape geometry as indented JSON text (the file is 528,840 bytes of
   TypeScript, `PRESET_DEFINITIONS_SHA256` at its head); it compresses to 66 KB brotli, so its cost
   is parse and memory, not transfer. `packages/schema/src/shapes.ts` imports it, and every route
   imports `@turboslide/schema`.

The server output (`apps/studio/dist/server`, 7.1 MB) has its own copies: `edit._deckId-CqBqIaW2.js`
1,287,996 bytes, `paths-Cw19FOLG.js` 845,639, `Slideshow-CBLNRVAo.js` 779,700, `cli-Z61YtaM5.js`
676,344, `extract-C2aWYe_t.js` 558,241, `server-DRrY9gOM.js` 433,474, `report-0izdPdgy.js` 351,137.

### 2.2 The Vercel functions

The Nitro build under `apps/studio/.vercel/output` (from the hosting round's local build, 2026-09-11)
writes four function directories of 148 MB each: `__server.func` (every page and API route not
listed below, `maxDuration` 300, the project's default memory), `_serverFn/[...]` (every TanStack
server function: the editor's reads, writes, watch, thumbnails warm), `api/render/[...]` and
`api/export/[...]`; the last three carry `maxDuration` 800 and `memory` 3009 (`vite.deploy.config.ts`
`HEAVY`, `docs/hosting.md`). Of the 148 MB, `node_modules` is 92 MB (`@sparticuz/chromium` 65 MB,
the brotli packed `chrome-headless-shell`; `@img` 17 MB, sharp's libvips; `playwright-core` 6.4 MB),
`_virtual` is 50 MB (the Nitro server assets: `decks/templates` and `decks/gt-brand` with its 30 MB
of twins, and the 6.25 MB of theme, font and calibration files), `_ssr` is 4.5 MB (the server
chunks). Static output is 32 MB, 30 MB of it the GT deck's twins at `/decks/gt-brand/assets`.
The runtime is `nodejs24.x` with response streaming on.

## 3. Where the work runs today (the facts behind any turbo-fast claim)

Read before section 10. Each row names the code, not the intention.

| Capability                           | Where it runs in production today                                                                                                                                                                                                                                                                                       | Source                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The Rust crate (`turboslide-native`) | Nowhere on production. The napi addon is a git ignored `.node` file (`.gitignore` lines 22 to 25) built on 2026-09-10 for `darwin-arm64` only; the six other platform packages hold a `package.json` and nothing else; the wasm module under `packages/native/wasm/` is git ignored too, and CI (`.github/workflows/check.yml`) runs no `cargo`. The Vercel build clones `main`, so the function and the browser both take the third choice of `packages/effects/src/select.ts`: the TypeScript stages. | `docs/native.md` "Loading order", "What runs where"; `.gitignore`; `packages/native/npm/*`                          |
| The dither preview in the editor     | A browser `Worker` (`dither.worker-Cj3g7VXV.js`, 9.7 KB) composing the TypeScript stages of `@turboslide/effects`; no wasm import exists in any client chunk (zero `turboslide_native` or `wasm` markers).                                                                                                             | `apps/studio/src/workers/dither.worker.ts` header comment; the chunk scan in section 2.1                          |
| The one string renderer              | `@turboslide/render` `renderSlide` runs in the function for `/deck` (SSR, the 269 KB payload) and in the browser for the editor, the viewer, the presenter and the sidebar's live clones.                                                                                                                                | `render-D5MrLHnB.js` markers; `deck.$deckId.tsx`; `present.$deckId.tsx`                                            |
| Thumbnails                           | The render worker's 1x screenshot of the slide by `chrome-headless-shell` inside the function, downsampled to 320 px, cached on the instance's `/tmp` per revision and named by a per slide content stamp (`?r=<fnv1a>`), served `immutable` so the CDN answers `HIT` afterwards. A miss is a Chromium render in the function.       | `server/thumbs.ts`; `edit.$deckId.tsx:2261-2283`; `docs/hosting-chromium.md`                                       |
| Export                               | Chromium raster export inside the function, synchronous per POST, batched by `?start=1`, `?batch=<i>`, `?merge=<id>` for the 85 slide deck (two batches at 60); 800 s and 3009 MB functions.                                                                                                                              | `routes/api/export.$deckId.ts`; `docs/hosting-chromium.md`; `scripts/hosted-smoke.mjs`                             |
| Static contracts                     | `/openapi.json`, `/llms.txt`, `/llms-full.txt` and `GET /api/agent` serve committed generated files; the CLI, MCP, window API and skills are generated from the one action table.                                                                                                                                       | `packages/agent/generated/*`; `AGENTS.md` "The agent surface"                                                       |
| Prefetching                          | The router is created with `defaultPreload: 'intent'` and `defaultPreloadStaleTime: 0`, so a hover over a `<Link>` preloads the route's loader; the document preloads every chunk through `modulepreload`. The title row's home mark is a plain `<a href>`, not a `<Link>`, so leaving the editor is a full document load. | `apps/studio/src/router.tsx`; `packages/chrome/src/TitleRow.tsx:265-274`; section 5                                 |
| Fluid compute                        | Several routes of one deployment share one Node process; a render that lands while an export runs waits in the local queue (measured 183.6 s for a thumbnail behind a 187.9 s export in the hosting round).                                                                                                             | `docs/hosting-chromium.md` "Fluid compute runs several routes"                                                      |
| The deck list                        | `HostedDecks.list` on the Blob store syncs every deck (`sync(true)`: at least one `head` per deck, four in parallel, a pull when an etag moved) on every `/decks`, `/decks/trash`, Open dialog and `deck.list` call.                                                                                                     | `packages/store/src/blob-store.ts:1032-1041`; `apps/studio/src/server/decks.ts:201-215`                             |
| The watch channel                    | The editor holds a `watchDeck` server function open for up to 20 s (25 s cap) and loops; over the Blob mirror the function polls the store's revision every few seconds.                                                                                                                                                | `apps/studio/src/server/write.ts:436-530`                                                                           |

## 4. Route loads

Three cold and three warm samples per route (`/new` and `/decks` have four of each: the smoke
round is included). Medians with the range in parentheses, milliseconds from navigation start
unless marked. "Route DOM" is the hydration proxy of 1.2, "studio" the TTI proxy. JS bytes are the
Resource Timing sums for the document's `.js` files.

| Route               | Kind | TTFB              | FCP                 | LCP                 | Route DOM           | studio              | settled or hydrated | JS files | JS decoded KB | JS wire KB | Requests until ready              |
| ------------------- | ---- | ----------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | -------- | ------------- | ---------- | --------------------------------- |
| `/` (307 to `/new`) | cold | 99 (95–134)       | 780 (648–1,324)     | 812 (676–1,368)     | 752 (624–1,287)     | 752 (624–1,287)     | 756 (629–1,293)     | 16       | 2,660         | 724        | 37 (37–43)                        |
|                     | warm | 91 (81–100)       | 536 (520–572)       | 536 (520–572)       | 508 (497–543)       | 508 (497–543)       | 516 (504–554)       | 16       | 2,660         | 0          | 38 (37–55)                        |
| `/new`              | cold | 186 (142–1,424)   | 930 (488–2,896)     | 968 (496–3,044)     | 908 (447–2,867)     | 908 (447–2,867)     | 912 (451–2,872)     | 16       | 2,660         | 724        | 42 (35–54)                        |
|                     | warm | 84 (81–216)       | 412 (348–616)       | 412 (348–616)       | 389 (324–588)       | 389 (324–588)       | 396 (332–595)       | 16       | 2,660         | 0          | 46 (32–54)                        |
| `/decks`            | cold | 4,671 (516–8,525) | 2,768 (616–8,676)   | 2,772 (672–8,744)   | 2,745 (599–8,663)   | –                   | 2,850 (681–8,738)   | 16       | 2,675         | 729        | 37 (29–45)                        |
|                     | warm | 5,787 (848–6,972) | 3,410 (380–7,016)   | 3,454 (456–7,084)   | 3,380 (350–6,985)   | –                   | 3,473 (495–7,127)   | 16       | 2,675         | 0          | 41 (31–45)                        |
| `/edit/gt-brand`    | cold | 177 (135–183)     | 1,260 (1,000–1,492) | 1,276 (1,060–1,624) | 1,217 (954–1,440)   | 1,217 (954–1,440)   | 1,240 (979–1,462)   | 17       | 2,757         | 759        | 1,373 (1,358–1,541) in 120 s, see 4.2 |
|                     | warm | 118 (89–129)      | 876 (772–2,132)     | 896 (788–2,148)     | 805 (697–2,059)     | 805 (697–2,059)     | 861 (754–2,113)     | 17       | 2,757         | 0          | 1,258 (1,039–1,501) in 120 s      |
| `/deck/gt-brand`    | cold | 252 (221–344)     | 376 (316–592)       | 376 (316–592)       | 354 (292–563)       | 455 (392–792)       | 589 (531–924)       | 18       | 2,664         | 727        | 48 (48–57)                        |
|                     | warm | 210 (181–212)     | 276 (252–300)       | 300 (292–312)       | 229 (224–269)       | 365 (355–377)       | 495 (494–518)       | 18       | 2,664         | 0          | 48                                |
| `/present/gt-brand` | cold | 108 (97–134)      | 684 (480–2,124)     | 708 (516–2,164)     | 659 (459–2,090)     | 659 (459–2,090)     | –                   | 17       | 2,670         | 728        | 34                                |
|                     | warm | 79 (78–79)        | 552 (500–604)       | 568 (508–628)       | 524 (475–577)       | 524 (475–577)       | –                   | 17       | 2,670         | 0          | 34                                |
| `/decks/trash`      | cold | 331 (301–3,788)   | 412 (376–3,872)     | 412 (376–3,872)     | 397 (364–3,856)     | –                   | 476 (440–3,945)     | 16       | 2,664         | 725        | 29                                |
|                     | warm | 385 (275–5,144)   | 440 (308–5,188)     | 440 (308–5,188)     | 404 (292–5,167)     | –                   | 480 (361–5,262)     | 16       | 2,664         | 0          | 29                                |

Reading the table:

- The shell is empty on the `ssr: false` routes, so FCP, LCP, the route DOM and the studio handle
  all land within a few milliseconds of each other: nothing paints until 2.7 MB of JavaScript has
  arrived, parsed and run the loader. Cold, that is 0.9 s on `/new` and 1.3 s on `/edit/gt-brand`
  (the loader reads the 85 slide document, 31 revisions, then renders every slide's HTML in the
  browser for the live clones); warm it is 0.4 s and 0.9 s. Both sit inside the 2.5 s LCP
  threshold on this connection; the one cold `/new` sample at 3.0 s LCP had a 1,424 ms TTFB, a
  function cold start, and the `/present` and `/edit` warm outliers at 2.1 s are the same
  instance effect.
- `/deck/gt-brand` is the one server rendered document with content: FCP 376 ms cold with a 381 KB
  HTML body (69 KB over the wire, brotli), and the LCP element is the opener photograph
  (`opener-brand-dark.jpg`) in every sample.
- `/decks` is the slow route, and it is slow at the server: TTFB median 4.7 s cold and 5.8 s warm
  with a range from 0.5 s to 8.5 s, and the page paints nothing until the document arrives (LCP 2.8
  to 3.5 s median, 8.7 s worst). A curl series afterwards (six pairs, three seconds apart) read
  0.33 to 0.46 s for `/decks` every time and 0.29 to 4.89 s for `/decks/trash`: the cost is
  bimodal. Section 3's row explains it: the home loader runs `HostedDecks.list`, which syncs every
  deck in the Blob store on every call (17 cards were on the home page during the session, plus the
  trash), and a sync that finds a moved etag pulls the deck. The 3.8 s and 5.1 s `/decks/trash`
  samples are the same call with `includeTrashed`.
- JavaScript is the same 2.66 to 2.76 MB decoded on every route (724 to 759 KB over the wire cold,
  all from the CDN cache warm); the 11 stylesheets are 177 KB decoded; one Inter face (344 KB) loads
  on every route, the italic never did in these samples. Section 2.1 has the chunk list.

### 4.1 Time to first byte by route, curl

For the record, `curl` from the same machine (final response headers, no browser): `/` 307 in 139 ms;
`/new` 105 to 140 ms; `/edit/gt-brand` 105 ms; `/present/gt-brand` 107 ms; `/deck/gt-brand` 433 to
935 ms (the SSR render of the payload); `/decks` 6,399 ms then 402 ms then 0.33 to 0.46 s six times;
`/decks/trash` 5,100 ms then 0.29 to 4.89 s.

### 4.2 The request count on the editor

`/edit/gt-brand` made 1,039 to 1,541 requests in the 120 s each sample stayed open; 976 to 1,478 of
them were `POST /_serverFn/…` calls of one kind, `pollStudioSession({ id, timeoutMs: 20000 })`,
each answered in 77 ms median (range 75 to 90). `useStudioSession.ts` loops `while (alive)` on
that call with no delay because the server is meant to hold it for 20 s (`sessions.ts`
`POLL_DEFAULT_MS`); on production it returns at once, because `poll(id)` answers `[]` for an id
the instance does not know (`packages/agent/src/http/sessions.ts:197-199`) and the registry lives on
`globalThis` of one function instance (`apps/studio/src/server/sessions.ts:26-31`) while Vercel routes
each POST to whichever instance is free. The result is about 11 invocations of the 3,009 MB
`_serverFn` function per second for every open editor, viewer or presenter tab (the viewer and the
presenter attach too: 9 polls in one `/deck` sample; 763 of the editor session's 830 server function
calls in 143 s were this poll). The editor session's log shows the mechanism: its first two polls
held for 20,087 and 11,611 ms (the attach and those polls met the same instance), and every one of
the 761 that followed answered in 77 to 180 ms. Once the polls stop reaching the instance that holds
the session, that instance sweeps it after 45 s (`DEFAULT_STALE_MS`) and no instance knows the page
any more; the hook re-attaches only on the owner's ready event, so `deck_goto_slide` over `/mcp`
cannot reach that page either. The `watchDeck` long poll on the same page behaves as designed: five
calls of 20.3 to 20.5 s each in the 120 s. On the same page the other calls at load were: session
attach 77 to 367 ms, `leaseSlide` 145 to 1,465 ms, `warmThumbnails` 157 ms to 1.4 s when every
thumbnail is on the instance and 24.5 to 33.9 s when a fresh instance renders the 85 slides.

## 5. Transitions between pages

One warm context (the JS cache primed), wall clock from the click unless marked in page.

| Transition                                                 | How it moves                                                                                   | Time                                                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/edit/<scratch>` to `/decks` (the title row mark)         | a plain `<a href="/decks">`, a full document load                                              | 491 ms to `data-hydrated` (LCP 468 ms, 17 cards) on a fast list call; the same click from `/new` took 4,958 ms on a slow one                        |
| `/decks` to `/edit/<scratch>` (the card)                   | `<Link>` with the router, same document                                                        | 399 ms in page from `pointerdown` to studio ready and `data-settled` (419 ms wall)                                                                    |
| `/decks` to `/edit/gt-brand` (the card)                    | `<Link>`, same document, 85 slides                                                              | 723 ms in page to studio ready and settled; the harness then waited 10 s for a "Saved · r" chip that the editor no longer renders (`.ts-status` is absent on production), so the 10,749 ms wall figure is the harness, not the product |
| Back to `/decks` (history)                                 | router history                                                                                 | 41 ms and 53 ms to `data-hydrated` (the loader data is reused)                                                                                        |
| `/new` to `/decks`                                         | full document load                                                                             | 4,958 ms (the list call, section 4)                                                                                                                   |
| `/edit` to `/present/<id>` (Slideshow arrow, Presenter view) | `window.open` popup                                                                            | 624 ms to `.ts-presenter`, 632 ms to the popup's studio handle; the popup's own LCP 580 ms                                                             |
| `/edit` to `/present/gt-brand` (a direct load)             | `ssr: false` route                                                                             | section 4: 659 ms cold, 524 ms warm to the presenter DOM                                                                                              |
| The Slideshow button (in tab)                              | `view.present`                                                                                 | 4 ms to `.ts-slideshow` mounted and `.pt-viewer.is-present`, 13 ms to the painted frame; Esc back to the editor 5 ms                                  |
| The Layout grid (toolbar Layout)                           | `openLayoutGrid`                                                                               | 9 ms to the plate visible, 10 ms to the painted frame, 21 entries                                                                                     |
| Format options (Format menu, Format options)               | `openPanel('formatOptions')`                                                                   | 7 ms to the panel visible and painted (nothing selected: "Select something on the slide to see its options")                                          |

Every in-page surface is under 15 ms. Every change of address is a network round trip plus a
loader: 0.4 s to an editor whose deck the browser has not seen, 0.5 s to the home page when the
list call is fast and 5 s when it is slow, 0.6 s to the presenter window.

## 6. Editor action latency

On the scratch deck `untitled-20260913-1st4` (created from `/new`, blank template, one Title slide),
warm context, in page timings.

| Action                                              | To the local commit (`revision` moves)        | To the saved write (`serverRevision` caught up, `pending` 0) | Notes                                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First text edit on `/new` (creates the deck)        | 388 ms after the last `keyup`                 | 1,440 ms                                                     | The 400 ms burst timer (`InlineText.tsx` `TEXT_BURST_MS`), then `createStoredDeck` plus the write on Blob in one 1,022 ms server function; the address moved to `/edit/untitled-20260913-1st4` |
| Text edit, steady state (three samples)             | 374, 372, 374 ms                              | 990, 1,314, 1,241 ms                                         | The burst timer is the whole local cost; the Blob write is 600 to 940 ms of it                                                                          |
| Drag one object (heading of a `split` slide by its move handle, 24 moves, converts the slide to a canvas on drop) | 21 ms after `pointerup` (223 ms after `pointerdown`, the drag itself 202 ms) | 716 ms after `pointerup` (917 ms after `pointerdown`) | 24 frames for 24 moves at 120 fps, longest frame 10 ms; the dropped position painted 5 ms after `pointerup`; layout `split` became `freeform` in the same write |
| New slide (toolbar)                                  | 13 ms after `pointerdown`                     | 570 ms                                                       | The card appeared in 7 ms and painted in 8 ms                                                                                                           |
| Duplicate slide (Slide menu)                         | 9 ms                                          | 442 ms                                                       | The card appeared in 4 ms, painted in 5 ms                                                                                                              |
| Thumbnail refresh after a text edit (three samples)  | –                                             | 2,910, 3,772, 2,406 ms after the save                        | Each edit's new stamp asked `/api/render/title?…&r=<stamp>` once and got a 200 after a Chromium render in the function of 3,518, 4,702 and 3,268 ms; the deck's first two stamps (right after creation) had answered 404 in 217 and 301 ms, the instance not yet holding the deck |
| Thumbnail of the new slide                           | –                                             | 1,920 ms after the save                                      | A 404 in 218 ms, then the same stamp again, 200 after a 1,371 ms render                                                                                  |
| Thumbnail of the duplicated slide                    | –                                             | 757 ms after the save                                        | One request, 200 after a 1,175 ms render                                                                                                                 |
| The home page card of the scratch deck (`?r=6`)      | –                                             | 5,069 ms on the first `/decks` visit after the edits          | The card's thumbnail is a fresh 320 px render at the deck's revision; the CDN served it in 0 to 1 ms afterwards                                          |

### 6.1 Drags and a resize, more samples

On two further scratch decks (`untitled-20260913-hhh5`, `untitled-20260913-203u`): a new slide on
the `split` layout, its heading `h` selected, then dragged by the overlay's move handle
(`handle.h.move`) in 24 pointer moves; the first drag converts the slide to a canvas on drop, the
next three move the object on the canvas; then the south east resize handle in 16 moves. In page
timings.

| Sample                                        | Drag (down to up) | Frames during the drag | Drop to painted frame | Drop to local commit | Drop to saved write |
| --------------------------------------------- | ----------------- | ---------------------- | --------------------- | -------------------- | ------------------- |
| Drag 1, converts `split` to `freeform` (hhh5) | 202 ms            | 24 at 120 fps, longest 10 ms | 5 ms            | 21 ms                | 716 ms              |
| Drag 1, converts (203u)                       | 203 ms            | 24 at 119 fps, longest 10 ms | 3 ms            | 23 ms                | 1,197 ms            |
| Drag 2, on the canvas                         | 202 ms            | 24 at 119 fps, longest 10 ms | 6 ms            | 8 ms                 | 2,492 ms            |
| Drag 3, on the canvas                         | 202 ms            | 24 at 120 fps, longest 10 ms | 5 ms            | 5 ms                 | 490 ms              |
| Drag 4, on the canvas                         | 199 ms            | 24 at 121 fps, longest 10 ms | 8 ms            | 4 ms                 | 450 ms              |
| Resize, south east handle (418 by 49 to 490 by 94) | 134 ms       | 16 at 120 fps, longest 10 ms | 6 ms            | 19 ms                | 858 ms              |

One frame per pointer move, the dropped box painted within 8 ms, the reducer done within 23 ms
(the conversion measures the slide on a hidden sheet first, which is the 21 to 23 ms against 4 to 8
ms for a plain move), and then 0.45 to 2.5 s until the Blob write is acknowledged. The first
write from `/new` on these decks took 1,612 and 1,460 ms after the last keystroke.

The six `writeDeck` server function calls of the session took 1,022 ms (the first write, which
also creates the deck on Blob), then 610, 936 and 862 ms for the three text bursts, 527 ms for the
new slide and 402 ms for the duplicate; the rest of each "to saved" figure is the burst timer and
the round trip. `leaseSlide` ran 14 times at 132 to 785 ms; `watchDeck` held 20.3 to 20.5 s when
nothing changed and returned in 2.4 to 6.5 s when a write landed.

What the numbers say: the editor's own work is 4 to 21 ms for every action measured, including a
canvas conversion on drop. What the person waits on is the 400 ms burst timer before a text write
starts, then 0.4 to 1.0 s of Blob write per revision, then 2.4 to 3.8 s before the filmstrip shows
the edited slide, because every thumbnail is a Chromium screenshot taken inside the function.

### 6.2 Thumbnails across the session

130 `/api/render` requests in the 143 s editor session: 77 CDN hits (`x-vercel-cache: HIT`, median 2
ms, max 36 ms), 49 misses that answered 200 (median 165 ms when the instance had the PNG on disk,
p90 3,377 ms, max 5,069 ms when Chromium rendered), 4 misses that answered 404 (217 to 301 ms). On
the cold `/edit/gt-brand` sample the 16 visible thumbnails took 2,389 ms median each on a fresh
instance; on every later sample they were CDN hits at 0 to 18 ms. The GT deck's twins load lazily
per visible card: 16 static thumbnails after 20 s on the editor, 25 after the first filmstrip pass,
98 render requests after three passes.

## 7. The 85 slide deck: filmstrip, material, memory

### 7.1 Filmstrip scroll frame rate (`/edit/gt-brand`, warm)

| Pass                                             | Scrolled | Frames | fps | Median frame | p95 frame | Longest frame | Frames over 33 ms | Frames over 50 ms |
| ------------------------------------------------ | -------- | ------ | --- | ------------ | --------- | ------------- | ----------------- | ----------------- |
| First pass down, thumbnails still arriving       | 1,878 px | 226    | 102 | 8.3 ms       | 10.1 ms   | 200 ms        | 2                 | 2                 |
| Second pass up (5 s later)                       | 1,878 px | 227    | 120 | 8.3 ms       | 10.0 ms   | 10 ms         | 0                 | 0                 |
| Third pass down                                  | 1,880 px | 230    | 120 | 8.3 ms       | 10.1 ms   | 10 ms         | 0                 | 0                 |

The list holds 120 fps once its thumbnails have decoded; the two 200 ms frames on the first pass
coincide with the first batch of 320 px PNGs decoding and the live clones being replaced. The
DOM under the filmstrip is 2,539 nodes for 85 cards (the sibling measurement `03-perf-transition`
counted them), each card a scaled live clone of the slide's HTML until its capture arrives.

### 7.2 First paint of a material slide

The GT deck's material slides are the three openers whose picture asset is a Paper shader
(`opener-blog` and `opener-developer-experience` on `paper:gem-smoke`, `opener-prototemplate` on
`paper:liquid-metal`; `deck.json` assets). In the editor the frozen frame (`opener-blog-dark.jpg`)
paints with the slide and `MaterialMount` mounts the live shader over it.

| Case                                                                 | Time                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `view.goto('opener-blog')` inside the open editor                    | 135 ms from the call to a `<canvas>` (3200 by 1800 device pixels) attached in the stage, and the frame after it   |
| A load of `/edit/gt-brand#s/opener-blog` (warm cache)                | 1,167 ms to the studio handle and the `data-recipe` root, 1,225 ms to settled, 1,309 ms to the canvas             |
| `/deck/gt-brand#s/opener-blog` (the viewer)                          | 508 ms to settled; no canvas mounts in view mode, the frozen frame stands (`MaterialMount` `enabled` off), LCP 292 ms |

The shader costs about 140 ms after the editor is up, on Metal through ANGLE. The frozen frame
contract (SPEC 5.4) means a viewer never pays it.

### 7.3 Memory after ten minutes idle

`/edit/gt-brand` opened in a fresh context and left alone for ten minutes; CDP
`Performance.getMetrics` and `performance.memory` at three points.

| Sample           | JS heap used | JS heap total | DOM nodes | Event listeners | Requests so far |
| ---------------- | ------------ | ------------- | --------- | --------------- | --------------- |
| settled plus 8 s | 20.0 MB      | 30.1 MB       | 5,598     | 642             | 281             |
| idle 5 min       | 15.9 MB      | 18.9 MB       | 4,827     | 765             | 3,749           |
| idle 10 min      | 15.4 MB      | 17.4 MB       | 4,827     | 640             | 7,303           |

No leak: the heap shrinks after the load's garbage is collected and stays at 15 MB; the node count
drops once the live clones under the visible cards are replaced by their captures and holds. The
idle page's network is the finding: 7,022 requests in ten minutes, 6,993 of them the session poll
of 4.2 (11.7 per second, every one a `_serverFn` invocation answered 200) and 29 `watchDeck` long
polls of 20.2 to 22.0 s, which is the channel working as designed.

## 8. Trash and delete forever

| Step                                             | Time                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Move to trash (card menu on `/decks`)            | 22 ms to the card hidden (optimistic), all three decks                                                                                        |
| Delete forever (`/decks/trash`, confirm)         | 8,365 ms to the card gone for `untitled-20260913-1st4`; 1,302 ms for `untitled-20260913-hhh5`; 1,819 ms for `untitled-20260913-203u`. The `removeDeck` server function itself took 1,251 ms in the first case; the other 7 s was the page's `refresh()`, which is the same list sync as `/decks` (section 4) |
| Probe afterwards                                 | `GET /deck/<id>` 404 for all three scratch decks                                                                                              |

## 9. The slowest things a sales user meets, ranked

1. **Opening the home page.** `/decks` paints at 2.8 s median, 8.7 s worst, and one in two loads
   takes 5 to 7 s to first byte; leaving `/new` for the list took 5.0 s. Cause: `HostedDecks.list`
   syncs every deck in the Blob store per request (section 3). This is the front door of the sales
   flow and the only route over the LCP threshold.
2. **Seeing the edit in the filmstrip.** 2.4 to 3.8 s after a text edit saves, 1.9 s for a new
   slide: a Chromium screenshot inside the function per changed slide, preceded by 404s while the
   instance catches up. On a fresh instance the 85 GT thumbnails take 24 to 34 s to warm and the
   first visible sixteen 2.4 s each.
3. **Delete forever.** 1.3 to 8.4 s with a busy state and no progress.
4. **The save round trip.** 1.0 to 1.6 s from the last keystroke to a saved revision (400 ms burst
   timer, then 0.6 to 1.0 s of Blob write), 0.45 to 2.5 s from a drop to saved (0.7 to 1.2 s when
   the drop also converts the slide), 0.4 to 0.6 s for a new or duplicated slide. Not visible as a
   stall while the optimistic state stands, but it bounds how fast an agent can chain writes and
   how soon the filmstrip can refresh.
5. **The first editor paint.** 0.9 s cold on `/new`, 1.3 s cold on the 85 slide deck, and a blank
   page until then, because the editor routes are `ssr: false` and every route carries 2.7 MB of
   JavaScript (the shader library, the shape geometry table and the exporter's schemas ride along
   to the home page and the presenter). Warm it is 0.4 and 0.9 s.
6. **Function cold starts.** One `/new` load at 3.0 s LCP (TTFB 1.4 s), one `/present` at 2.1 s,
   one `/edit` warm sample at 2.1 s: a fresh instance of a 148 MB function bundle.
7. **The presenter window.** 0.6 s to open, acceptable, but a second full load of the same 2.7 MB.
8. **Invisible to the user, costly to the product.** The session poll storm of 4.2: about 11
   `_serverFn` invocations per second per open tab, on the same function that saves edits.

Everything in the chrome itself (menus, the Layout grid, Format options, the Slideshow, Esc, new
slide, duplicate, a drag with conversion) is 4 to 21 ms to the painted frame, under the 200 ms
interaction threshold by an order of magnitude; the filmstrip scrolls at 120 fps once its
thumbnails are in. The product's slowness is entirely in its server round trips and its
thumbnails, not in its rendering.

## 10. The turbo-fast story against the code

What can be claimed today, what cannot, and what the measurement supports. The rule is the
directive's: never claim what is not true.

| Claim                                                   | True today?                                   | Evidence                                                                                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Built on Rust"                                         | Not on production. Partly on a developer's machine. | The crate exists, is tested against Pillow byte for byte and is loaded by Node when the addon is built; no addon or wasm file is committed or built in CI, so production and the browser run the TypeScript stages (section 3). `docs/native.md` itself says the crate buys determinism, not throughput: "the dither is 5 to 9 ms in plain JavaScript". |
| "The dither runs in wasm in your browser"               | No.                                           | `dither.worker` is 9.7 KB of TypeScript stages; no client chunk references the wasm module.                                                                                                                                  |
| "One renderer, everywhere"                              | Yes.                                          | `renderSlide` is the string renderer the function, the browser, the CLI and the exporter share; the SSR `/deck` payload and the editor's live clones are its output.                                                         |
| "Pixel identical PPTX from Chromium, batched"           | Yes, and slow by nature.                      | Chromium raster inside the function, 85 slides in two batches; 187.9 s cold for the flatten export in the hosting round, 127 s native (`docs/hosting-chromium.md`).                                                          |
| "Static contracts"                                      | Yes.                                          | Committed generated OpenAPI, llms.txt, manifest; one action table generates the CLI, MCP, window API and skills.                                                                                                              |
| "Fluid compute"                                         | Yes, with a measured cost.                    | Several routes share one instance; a render behind an export waits (183.6 s measured); the session registry on `globalThis` does not survive the routing across instances (section 4.2).                                       |
| "Prefetching"                                           | Partly.                                       | `defaultPreload: 'intent'` and `modulepreload` for every chunk are on; the title row's home link is a plain anchor (a full reload), and no route's data is prefetched before hover.                                        |
| "Instant chrome"                                        | Yes.                                          | 4 to 21 ms to the painted frame for every measured control; 120 fps filmstrip.                                                                                                                                              |
| "Fast saves"                                            | Half.                                         | Local commits in under 25 ms; the server write is 0.4 to 1.0 s on Blob, the burst timer adds 400 ms to text.                                                                                                                 |
| "Fast home"                                             | No.                                           | 2.8 to 3.5 s median paint, 8.7 s worst.                                                                                                                                                                                       |

## 11. Sources

Repository files read (all at `/Users/kevinliu/repos/Turboslide`, tree at `28cb63b`, 2026-09-13):
`AGENTS.md`; `README.md`; `docs/spec/SPEC.md` sections 2 and 3; `docs/gslides-parity/SPEC.md`
section 1; `docs/gslides-parity/SPEC-2.md` section 1; `docs/hosting.md`; `docs/hosting-chromium.md`;
`docs/native.md`; `docs/HOSTED-STATUS.md`; `packages/theme/**`; `packages/chrome/src/tokens.css`;
`packages/effects/**`; `packages/materials/**`; `crates/turboslide-native/**`;
`packages/schema/src/shapes/definitions.ts`; `packages/store/src/blob-store.ts`;
`packages/agent/src/http/sessions.ts`; `apps/studio/vite.deploy.config.ts`;
`apps/studio/src/routes/__root.tsx`, `edit.$deckId.tsx`, `new.tsx`, `deck.$deckId.tsx`,
`present.$deckId.tsx`, `decks.index.tsx`, `decks.trash.tsx`, `api/render.$slideId.ts`;
`apps/studio/src/server/write.ts`, `sessions.ts`, `thumbs.ts`, `warm.ts`, `decks.ts`;
`apps/studio/src/components/useStudioSession.ts`, `presentActions.ts`; `apps/studio/src/router.tsx`;
`apps/studio/src/workers/dither.worker.ts`; `packages/viewer/src/InlineText.tsx`, `Editor.tsx`,
`MaterialMount.tsx`; `packages/chrome/src/ViewerShell.tsx`, `TitleRow.tsx`, `Thumb.tsx`,
`Sidebar.tsx`; `scripts/editor-depth-drive.mjs`; `scripts/hosted-smoke.mjs`; `apps/studio/e2e/*.spec.ts`;
`apps/studio/dist/client/assets/*` and `apps/studio/.vercel/output/**` (local builds of 2026-09-13
10:05 and 2026-09-11 14:55); `docs/gslides-parity/research-4/03-perf-transition-2026-09-13.json`
(the sibling measurement of this round, for the DOM node counts and the thumbnail cache headers).

Web, read 2026-09-13:

- web.dev, "Largest Contentful Paint (LCP)", https://web.dev/articles/lcp: good at or under 2.5 s,
  poor above 4.0 s, at the 75th percentile.
- web.dev, "Interaction to Next Paint (INP)", https://web.dev/articles/inp: good at or under 200
  ms, poor above 500 ms; input delay, processing and presentation delay to the next frame.

Raw data: `perf/out/loads-1789326463944.json`, `perf/out/loads-1789327378596.json`,
`perf/out/editor.json`, `perf/out/drag.json`, `perf/out/drag2.json`, `perf/out/idle.json` in the
session scratchpad, with the scripts that produced them (`perf/lib.mjs`, `loads.mjs`, `editor.mjs`,
`drag.mjs`, `drag2.mjs`, `idle.mjs`, `analyze-loads.mjs`).
