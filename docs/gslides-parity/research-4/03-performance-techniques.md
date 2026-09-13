# Research 4, report 03: performance techniques for a TanStack Start and React 19 app on Vercel

Written 2026-09-13 for round four, directive (a): "make transitions between different websites and
doing stuff in the slides so much faster and more performant". The report answers three questions:
what production does today, measured; which techniques apply to Turboslide and where; and which
parts of a "turbo fast" story the code supports. Every number below is either measured on
`https://turboslide.vercel.app` on 2026-09-13 from Kevin's machine (section 1) or quoted from a
source read that day (section 6). Where a gain is an estimate the row says so.

The raw measurements and the scripts that produced them sit beside this file:
`03-perf-measure.mjs` and `03-perf-measure-2026-09-13.json` (page loads),
`03-perf-transition.mjs` and `03-perf-transition-2026-09-13.json` (route transitions and the
filmstrip). Both run against production through `playwright-core` 1.62.1 and Chrome for Testing 147
(`chromium-1217`), headless, 1440 by 900, with a CDP session for `Performance.getMetrics`. They
visit pages only; `/new` writes nothing until the first edit (`apps/studio/src/routes/new.tsx`).

## Contents

1. The baseline, measured on production
2. What the code does today
3. The technique table
4. The honest turbo fast story
5. Measuring and budgets
6. Sources

## 1. The baseline, measured on production

Two runs per page, a fresh browser context each time, no throttling, the machine on a home
connection. `TTFB` is `responseStart`, `FCP` and `LCP` from the paint and LCP observers, `DCL` and
`load` the navigation timing events, `script` the CDP `ScriptDuration`, all in milliseconds from
navigation start. Every HTML document answered `x-vercel-cache: MISS` over `h2`.

| Page             | TTFB    | FCP         | LCP (element)                      | DCL         | Requests | Transfer (JS) | DOM nodes | Script    | Notes                                                                                                                       |
| ---------------- | ------- | ----------- | ---------------------------------- | ----------- | -------- | ------------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/new`           | 30, 32  | 612, 436    | 636, 468 (the H1 prompt)           | 199, 140    | 52       | 721 KB        | 485       | 91, 90    | `ssr: false`; the window API answered before FCP in both runs                                                               |
| `/decks`         | 116, 30 | 4492, 4364  | 4560, 4448 (a 320 px thumbnail)    | 4468, 4348  | 44       | 746 KB        | 351       | 70, 70    | SSR; the shell streams at once, the list waits about 4.3 s on the loader                                                    |
| `/deck/gt-brand` | 32, 28  | 956, 352    | 956, 380 (`opener-brand-dark.jpg`) | 1022, 395   | 52 to 68 | 725 KB        | 6131      | 93, 86    | SSR with 85 slides in the HTML (69 KB compressed, 381 KB decoded); 101 layouts, 1.7 s of task time, two long frames         |
| `/edit/gt-brand` | 29, 34  | 896, 1840   | 912, 1856 (`opener-brand-dark.jpg`) | 215, 160   | 75 to 80 | 757 KB        | 4816      | 148, 299  | `ssr: false`; the second run had a 407 ms frame (355 ms blocking) in `preload-helper` while the route chunks resolved       |
| `/home`          | 31, 32  | 184, 244    | 184, 244 (the not found paragraph) | 171, 228    | 27       | 720 KB        | 68        | 55, 55    | 404 today; it still downloads 2.66 MB of decoded JavaScript because the root graph carries the editor (section 2, bundle)   |

The same runs, read for what the numbers mean:

- Time to first byte is 30 ms on a warm function for every route. The function is not the
  bottleneck for the shell; the work after the shell is.
- `/decks` is the slow page. Its loader awaits `listDecks()` and `getServerHealth()`
  (`apps/studio/src/routes/decks.index.tsx` line 54), and `listDecks` is `listStoredDecks()` over
  the Blob collection (`apps/studio/src/server/decks.ts` line 201), which lists the prefix and
  reads each deck's manifest. Thirteen decks, several of them test decks, answered in about 4.3 s.
  The page's LCP is a thumbnail that cannot start until the list arrives.
- `/deck/gt-brand` ships 85 rendered slides as HTML and hydrates them: 6131 DOM nodes, 101 layout
  passes and 1.7 s of main thread task time on a fast laptop. Its second run painted at 352 ms
  because the twins were in the CDN, so the page is network bound first and layout bound second.
- The editor reaches its window API (`window.turboslide`) 841 and 915 ms after navigation start,
  the 85 filmstrip cards are in the DOM at 902 and 951 ms, and the first static thumbnail decodes
  at 910 and 1033 ms. After eight seconds 16 cards show a capture and 69 still show the live clone,
  because `THUMB_FETCH_LIMIT` is 3 (`packages/chrome/src/Thumb.tsx`) and only the rows the browser
  considers near the viewport start. The filmstrip is 2539 of the page's 2936 DOM nodes.
- Leaving the editor for the home page takes 6.2 s (6.0 s after a six second hover on the link).
  No server function ran during that transition, which fits a full document navigation: the title
  row's mark is a plain `<a href>` (`packages/chrome/src/TitleRow.tsx` line 267), so the router's
  intent preload never applies and the browser reloads the shell and the 2.66 MB graph, then waits
  for the `/decks` SSR loader. The other direction, a `Link` card on `/decks` to `/edit/<id>`,
  took 858 ms to a rendered sheet.
- Cache headers, observed: hashed assets under `/assets/` are `public, max-age=31536000,
  immutable` and `x-vercel-cache: HIT`, Brotli for scripts and styles. HTML and server function
  responses are `public, max-age=0, must-revalidate`, MISS. Thumbnails with a stamp
  (`/api/render/<slide>?…&r=<stamp>`) are `public, max-age=31536000, immutable`, HIT. The GT deck's
  twins at `/decks/gt-brand/assets/*.jpg` are `public, max-age=0, must-revalidate` (CDN HIT, but
  the browser revalidates each of the 16 pictures on every visit), although
  `apps/studio/vite.deploy.config.ts` asks Nitro for `maxAge: 3600` on that public asset group.
- One loop. The server function `pollStudioSession` ran 192 times in 60 s on the second `/new`
  run, 21 times on the second `/deck/gt-brand` run, and 5 to 15 times on the others. The registry
  is per process on `globalThis` (`apps/studio/src/server/sessions.ts` lines 25 to 30), `poll()`
  answers `[]` at once for an id the process has never seen (`packages/agent/src/http/sessions.ts`
  lines 197 to 199), and the client loop re-polls without a delay on an empty answer
  (`apps/studio/src/components/useStudioSession.ts` lines 80 to 86). On Fluid compute a request
  may land on another instance, so a 20 s hold collapses into a request every 300 ms for the life
  of the tab.

## 2. What the code does today

Facts the techniques have to map onto, with the file that holds each one.

Routing and rendering:

- `createRouter({ scrollRestoration: true, defaultPreload: 'intent', defaultPreloadStaleTime: 0 })`
  (`apps/studio/src/router.tsx`). No `defaultViewTransition`, no `defaultPendingMs`, no
  `pendingComponent` on any route.
- `/edit/$deckId`, `/new` and `/present/$deckId` are `ssr: false`; `/deck/$deckId`, `/decks`,
  `/decks/trash`, `/print/$deckId` and `/embed/$deckId` are server rendered; `/` throws a 307 to
  `/new` in `beforeLoad` (`apps/studio/src/routes/*.tsx`).
- Loaders call server functions: `getDeck`, `readEditorDeck`, `readDraftDeck`, `listDecks`. On the
  server a server function runs in process; on the client each is a `fetch` to `/_serverFn/<id>`
  (POST for the writes and polls, GET for `listDecks`, `listTrashedDecks`, `getHostingFacts`).
- The root route loads five stylesheets by `?url` and inlines `BLOCK_CSS` and the theme boot
  script (`apps/studio/src/routes/__root.tsx`). There is no favicon file (`href: 'data:,'`).
- One string renderer, `renderSlide` (`packages/render/src/slide.ts`), draws every slide on every
  surface. The editor keeps its output per slide in `snap.html: Map<string, string>` and
  re-renders only the slides a write touched (`renderMissing`, `edit.$deckId.tsx` lines 747 to 810);
  `toViewerDeck(snap)` is memoized on `snap.document`, `snap.html` and `snap.deckId` (line 2619).
  The viewer sets that HTML with `innerHTML` (`packages/viewer/src/SlideView.tsx`).
- The filmstrip is `Sidebar.tsx` with one `Thumb` per slide: a `LiveClone` of the slide's HTML
  (pictures rewritten to `loading="lazy" decoding="async"`) until the 320 px capture from
  `/api/render/<slide>?w=320&r=<stamp>` decodes, three captures in flight at a time. Rows carry
  `content-visibility: auto` with `contain-intrinsic-size` (`Sidebar.css` lines 294, 417, 718).
- The dither preview runs in a module worker (`apps/studio/src/workers/dither.worker.ts`) on the
  TypeScript stages with `ImageBitmap` transfer in and out; the wasm build of the Rust crate is
  wrapped for it (`packages/native/src/wasm.ts`, `@turboslide/effects/backend`) and not mounted
  (`docs/native.md`, "Open items"). Materials mount on the main thread through Paper's
  `ShaderMount` (`packages/materials/src/mount.ts`).
- External writes reach the editor through `watchDeck`, a server function that holds up to 20 s
  (25 s cap) and answers when the store's watch fires (`apps/studio/src/server/write.ts` lines 416
  to 522). On the Blob backend the store's watch is a 3 s revision poll (`blob-store.ts` line 283),
  so an agent's write appears within about 3 s plus the editor's own round trip.

Hosting and storage:

- Nitro, `NITRO_PRESET=vercel`, one base function at `maxDuration: 300` and three rule functions
  (`/api/export/**`, `/api/render/**`, `/_serverFn/**`) at 800 s and 3009 MB; each function
  directory is a copy of the server, about 150 MB uncompressed with the Chromium package traced
  (`docs/hosting.md` section 6). The region is `iad1`, the Blob store `turboslide-decks` is in
  `iad1` (section 5).
- The store is a `FileStore` over an overlay under `/tmp` with a sync before every call: one
  `head('deck.json')` per read, a pull when the etag moved; every committed write stores the whole
  document under `snapshots/<md5>.json`, which is the etag Vercel Blob answers for the manifest
  bytes, so `pull()` reads the current document by name (`docs/hosting.md` section 4;
  `packages/store/src/blob-store.ts`, `snapshots.ts`).
- Measured on the previews of 2026-09-11 (`docs/hosting.md` section 7, `docs/hosting-chromium.md`
  section 3b): `/` 568 ms warm and 1.6 to 3.9 s on a cold instance (seed 183 documents in about
  300 ms, 24 package files in about 310 ms, the Blob manifest read); a 320 px thumbnail 7.2 to
  9.0 s on a cold instance (the browser inflates in 2.4 to 2.7 s, launches in 50 to 67 ms, the shot
  is 194 ms, the rest is the seed and the module load), 239 to 385 ms from the thumbnail cache, 1.6
  to 2.2 s for another slide on a warm instance; one Chromium at a time per instance, so a
  thumbnail that lands on an instance running an export waits for it.
- Exports run inside the function on `chrome-headless-shell` 147 (a recorded deviation from
  SPEC 3.3 item 7), synchronously per request, with the batched Perfect export splitting a deck
  into per slide batches, each one function call, and a merge with no browser
  (`docs/hosting-chromium.md` section 4).

The bundle (`apps/studio/dist/client/assets`, built 2026-09-13 from the working tree): `index`
1,122,594 bytes, `freeform` 709,434, `render` 498,513, `Frame` 93,549, `slide` 63,390, `keys`
62,921, two `edit._deckId` chunks of 50,698 and 50,500, `Tooltip` 48,448, `preload-helper` 45,428;
`render` CSS 118,603, `index` CSS 35,109; `InterVariable.woff2` 352,240 and the italic 380,904. The
`index` chunk holds Paper's `ShaderMount` and CodeMirror references, and every route downloads
`index`, `freeform`, `render`, `slide`, `keys`, `write` and `useStudioSession` through
`modulepreload`: 721 KB compressed, 2.66 MB decoded, on the 404 page as much as in the editor. The
route components are split (the `edit._deckId` and `decks.index` chunks exist), so the weight is in
the shared graph the root and the route files import at module level; `new.tsx` line 13 imports
the whole edit route module (`import * as editRoute from './edit.$deckId'`) for `EditorRoot`, which
is one path by which the editor's module graph can join the critical bundle. This is a hypothesis
to confirm with a bundle visualizer before the split is designed.

## 3. The technique table

Each row names where the technique lands in this code base, the gain to expect (measured where the
baseline gives a number, otherwise an estimate with its reasoning), the risk, and the source. Rows
are grouped by the part of the product they touch. The source key is in section 6.

### 3.1 Route preloading and transitions

| Technique | Where it applies in Turboslide | Expected gain | Risk | Source |
| --- | --- | --- | --- | --- |
| Make every in-app link a router `Link` so `defaultPreload: 'intent'` applies (the title row's mark, the not found page's links already are, the bottom bar and menus that navigate) | `packages/chrome/src/TitleRow.tsx` line 267 renders `<a href>`; the chrome package cannot import the router, so the editor passes a link component or an `onNavigate` and the chrome renders it | Measured: the editor to `/decks` transition is 6.2 s as a document load; the `/decks` to editor `Link` is 858 ms. Turning the mark into a `Link` removes the shell reload and the 2.66 MB re-evaluation; with the list fix below the transition should sit under 1 s | The chrome package must stay framework free of the router; a render prop keeps it so | S1, S4, R1 |
| `preload: 'viewport'` on the deck cards of `/decks` and on the layout grid's tiles, `'intent'` elsewhere; `defaultPreloadDelay` stays 50 ms | `decks.index.tsx` cards (lines 530 to 948), the `/decks/trash` cards | Estimate: the editor's loader (`readEditorDeck`, a Blob `head` plus the document) runs while the rep reads the list, so the click pays only the chunk load; the measured 858 ms includes that loader, so roughly a third of it | Viewport preloading on a list of 50 decks fires 50 loaders; cap it to the first screen or keep intent | S1, S5 |
| Raise `defaultPreloadStaleTime` from 0 to the router's default of 30 s | `apps/studio/src/router.tsx` sets 0 ("let an external cache decide"); there is no external cache | Estimate: a hover then a click within 30 s reuses the preloaded loader data instead of running the loader again on navigation, saving one server function round trip (about 100 to 300 ms warm) per navigation | Stale deck data for up to 30 s on the viewer; the editor's watch channel corrects it within its poll | S1, S5, S7 |
| `defaultViewTransition: { types: (info) => [...] }` on the router, with `::view-transition-old(root)` and `-new(root)` in `tokens.css` reading `--pt-dur-leave` and `--pt-dur-enter`, off under `prefers-reduced-motion` | `router.tsx`; `packages/chrome/src/tokens.css` motion block; the two routes that change shell (`/decks` to `/edit`, `/edit` to `/deck`) | Perceived: the browser snapshots the old view and cross fades to the new one during the loader, so a 300 ms transition reads as continuous; no change to the numbers | The API is Chrome, Edge and Safari; Firefox ignores it (the router falls back). A view transition freezes rendering for its duration, so long loaders make a frozen frame: pair with the loader fixes | S4, S5, S6, S13 |
| `view-transition-name` on the current filmstrip card and the stage, so the slide the rep clicked animates into the stage on the grid to slide switch | `Sidebar.tsx` cards, `Stage.tsx`; the names must be unique per element (one card at a time) | Perceived only; the same work, drawn as one motion of 180 ms (`--pt-dur-slide`) | Naming many elements makes the snapshot expensive; name one card and one stage | S13, S19 |
| React `<ViewTransition>` (stable in 19.3, the catalog's React) for element level transitions inside the editor: the right panel opening, the layout grid, the snackbar; `addTransitionType('navigation-forward')` for direction | `packages/chrome` panels and dialogs; requires the state update to be inside `startTransition` or a Suspense reveal | Perceived; replaces the CSS `transform` and `opacity` transitions with browser snapshots, which stay smooth while the main thread renders the panel | React interrupts a page level `document.startViewTransition` when it runs its own; choose one owner (React inside a route, the router between routes) | S19, S20 |
| Speculation Rules `prerender` for the two document navigations that must stay documents: `/home` to `/new` and the viewer's `/present/<id>` window; `eagerness: 'moderate'`, `where: { href_matches: '/new' }` | `__root.tsx` head, a `<script type="speculationrules">`; only same origin, only pages whose visit has no side effect (`/new` writes nothing until an edit, `docs/hosting.md`) | Estimate: a prerendered `/new` activates in under 100 ms instead of the measured 436 to 612 ms FCP, in Chrome and Edge only | Prerendering runs the page's JavaScript: the `/new` editor would attach a studio session and start the watch poll while hidden. Gate those on `document.prerendering` and the `prerenderingchange` event. Chrome caps moderate prerenders at 2 | S14, S15, S16 |
| Speculation Rules `prefetch` (not prerender) for `/decks` and `/deck/<id>` from `/home` | Same script; `prefetch` downloads the document only, safe for pages with loaders | Estimate: saves the TTFB and the document transfer, about 30 to 120 ms warm, up to seconds on a cold function because the fetch starts on hover | Firefox has no support and Safari's is off by default; the technique is progressive | S14, S15 |

### 3.2 Code splitting and the shell

| Technique | Where it applies in Turboslide | Expected gain | Risk | Source |
| --- | --- | --- | --- | --- |
| Confirm automatic route code splitting is doing its job and stop the editor graph from joining the critical bundle: replace `new.tsx`'s namespace import of the edit route with an import of `EditorRoot` from a component module, and keep route files' module level imports to what `loader`, `validateSearch` and `head` need | `apps/studio/src/routes/new.tsx` line 13; `edit.$deckId.tsx` imports at lines 1 to 260; the root route's `@turboslide/render/block-css` import | Measured baseline: 2.66 MB decoded JavaScript on every route including the 404 page and `/decks`. A viewer or home page that loads React, the router, the chrome tokens and its own route should sit near 300 to 400 KB decoded, so `/decks` and `/home` would parse and compile about a sixth of today's script (script time on `/home` is 55 ms today; the network and compile of 721 KB is what falls away on a cold cache) | Loaders stay in the critical bundle by design ("you pay double" otherwise), so the split is of components and their imports only. Verify with `rolldown`'s bundle analysis before and after | S2, S44, R2 |
| Rolldown `codeSplitting.groups` for the three heavy libraries the editor alone needs: Paper Shaders (`@paper-design/shaders`), CodeMirror (the source drawer), the export and lint helpers the inspector reaches | `apps/studio/vite.config.ts` and `vite.deploy.config.ts` `build.rolldownOptions.output.codeSplitting` | Estimate: the `index` chunk (1.12 MB) loses the shader and editor code paths that the viewer never runs; those become chunks the editor `modulepreload`s and the viewer never requests | Over splitting makes many small requests; h2 multiplexes them, but each is a compile unit. Group by route, not by package | S44, S45, S43 |
| Lazy chunks behind user intent inside the editor: the Special characters dialog (600 characters), the Icon picker, the Shapes grid (135 presets), the Diagram panel, CodeMirror for the source drawer, the material catalog, each `import()` on first open | `packages/chrome/src/pickers`, `dialogs`, `SourceDrawer.tsx`, `DiagramPanel.tsx`; the repo rule is "never use dynamic imports unless necessary" and this is the case the rule allows | Estimate: the editor's own graph shrinks by the size of those tables and CodeMirror (six CodeMirror packages in the catalog); the first open pays a chunk fetch of tens of milliseconds warm | A dialog that opens 200 ms late on first use; preload the chunk on menu hover (`import()` on `pointerenter`) | S2, S42, R3 |
| Keep Vite's `modulepreload` for the route's own chunks and stop preloading the editor's chunks from routes that do not use them | Vite emits `<link rel="modulepreload">` per chunk dependency (`preload-helper` chunk); once the graph is split, the preload list follows | Measured baseline: 13 to 15 module requests on every route; the preload list is the symptom, the graph is the cause | `build.modulePreload.resolveDependencies` is experimental; prefer fixing the graph | S43, S46 |
| Chunk size budget in the check step: `build.chunkSizeWarningLimit` stays 500 KB and `scripts/check-client-bundle.mjs` fails on a chunk above it or on the editor's chunk reaching the viewer's route | `scripts/check-client-bundle.mjs` already reads `dist/client` | Prevents the regression rather than gaining time | None beyond a failing check | S43, R2 |

### 3.3 SSR, hydration and streaming

| Technique | Where it applies in Turboslide | Expected gain | Risk | Source |
| --- | --- | --- | --- | --- |
| Keep `ssr: false` on the editor and the presenter, and add `ssr: 'data-only'` where the loader is the slow part and the component needs the browser: the viewer's grid and book modes | `deck.$deckId.tsx` (SSR today with 85 slides inlined, 381 KB decoded HTML, 6131 nodes hydrated); `'data-only'` runs `loader` on the server and renders on the client | Estimate for the viewer: the HTML drops from 381 KB to the shell plus the loader payload; hydration of 6131 nodes (1.7 s of task time, 101 layouts) becomes one client render of the current slide with the rest lazy; the trade is that the first paint of the slide moves from the HTML to the client render, so LCP on a cold cache may rise while INP and task time fall. Measure both before choosing | `/deck` and `/embed` are the links a rep sends and the pages a crawler indexes; keep the current slide's HTML in the document (`ssr: true` for the slide route, `'data-only'` for grid and book) so the link preview and the crawler still see content | S3, R4 |
| Deferred loader data with `Await` for the viewer: return the current slide's HTML awaited and the other 84 slides' HTML as an unawaited promise that streams after the shell | `deck.$deckId.tsx` loader returns `payload`; split it into `current` and `rest` | Estimate: the shell and the current slide paint at the first flush (TTFB is 30 ms); the 69 KB of remaining slides stream behind, so FCP on a cold cache tracks the twin download and the current slide's HTML, about the 352 ms second run rather than the 956 ms first | The viewer's grid needs every slide; render placeholders until `rest` resolves | S8, S3 |
| Streaming the `/decks` list: awaited `decks` for the first screen (the recent decks this browser opened, from `localStorage`) and a deferred promise for the full store listing | `decks.index.tsx` loader; `RECENT_KEY` is already in `localStorage` | Measured baseline: FCP 4.4 s because the shell waits for the loader. The shell alone streams at TTFB 30 ms, so the Recent row appears within about 200 ms and the store list follows when the Blob listing answers | The Recent row is per browser; a rep on a new machine sees only the deferred list | S8, S7, R5 |
| A `pendingComponent` per route with `defaultPendingMs` around 150 ms and `defaultPendingMinMs` 300 ms, drawing the target shell's frame (title row, filmstrip rail, sheet mat) at the token sizes | `router.tsx`; the chrome's row heights are tokens (`--pt-title-h` 44, `--pt-menu-h` 28, `--pt-tool-h` 40, `--pt-sb-w` 256), so a skeleton is the same frame with empty rows | Perceived: the frame appears within 150 ms of a click while the loader runs; no metric moves except CLS, which stays near 0 because the frame is the final layout | A skeleton that differs from the final layout shifts content; draw it from the same tokens and the same components with `aria-busy` | S7, S5, S51 |
| GET server functions for the reads a CDN may cache: `getDeck` for the viewer keyed by deck and revision, with `Cache-Control: s-maxage` and `stale-while-revalidate` set in the handler | `apps/studio/src/server/decks.ts`; `getDeck` is POST today; `listDecks` is GET already | Estimate: a repeat view of a shared deck answers from the CDN in the viewer's region instead of the function in `iad1`, tens of milliseconds instead of hundreds for a viewer abroad | The cache key must carry the revision or the reader sees a stale deck for `s-maxage`; the Blob store answers the current etag in one `head`, so the loader can redirect to a revision keyed URL | S9, S32 |

### 3.4 Hosting: Fluid compute, Blob, HTTP caching

| Technique | Where it applies in Turboslide | Expected gain | Risk | Source |
| --- | --- | --- | --- | --- |
| Rely on Fluid compute's instance reuse and bytecode caching, and keep the function small enough that a cold start is the seed and not the module load | The four function directories are about 150 MB each because `@sparticuz/chromium` is traced into all of them (`docs/hosting.md` section 6); bytecode caching applies on Node 20 and later in production and cuts cold starts "by up to 60%" per Vercel's changelog | Measured baseline: 1.6 to 3.9 s on a cold instance for `/`, of which the seed is about 610 ms; the remainder is module load. Removing the Chromium package from the base function's trace (it never renders) is the direct lever; Vercel's guidance is that "startup time correlates with function size" | Nitro copies one server per rule; `traceDeps` is global, so the base function needs its own exclusion, which Nitro's Vercel preset may not offer per rule. Verify in the preset | S24, S27, S28, S25, R6 |
| Keep the function and the Blob store in one region (`iad1`) and colocate any future database there | Already so (`docs/hosting.md` section 5); Pro plans allow up to 5 function regions, Blob stores are single region | Nothing to gain by moving; multi region functions would add cross region Blob reads on every request | A second function region without a second store slows every read from it | S26, S29 |
| Warm the instance for the first render: on the editor's first paint, call a server function that ensures the seed and the packages are materialized and, when the store is `blob`, that the deck's twins are pulled, before the first thumbnail asks | `apps/studio/src/server/root.ts` `ensureDecks`, `ensureDeckAssets`; today the first thumbnail request pays them (7.2 to 9.0 s cold) | Estimate: moves about 600 ms of seed and 1.4 s of twin pull off the first render's critical path; the Chromium inflate (2.4 to 2.7 s) remains until the browser is launched ahead of demand | A warm request that lands on a different instance than the render (Fluid spreads requests); the gain is probabilistic | S24, R6 |
| Immutable documents by revision on Blob: read the snapshot by md5 and serve viewer payloads under a revision keyed URL with `Cache-Control: public, max-age=31536000, immutable` | Already stored (`snapshots/<md5>.json`, `docs/hosting.md` section 4 "Immutable per revision documents"); the viewer route does not yet address a deck by revision | Estimate: a shared link opened twice is a CDN hit the second time; the first open still costs one `head` (a "simple operation") plus the snapshot read | The link must resolve the current revision first (one `head`), then load the immutable body; two hops instead of one on a cold browser | S29, S30, S31, R7 |
| Public Blob URLs for twins with conditional requests: the CDN answers `304 Not Modified` to `If-None-Match`, and the default cache is one month | The assets route already 302s to the twin's Blob URL for decks made on another instance; the GT deck's twins are static files of the deployment served with `max-age=0, must-revalidate` (observed), which forces a revalidation per picture per visit | Measured baseline: 16 twin requests on `/deck/gt-brand`, 1.47 MB, each revalidated. With `immutable` on the deployment's static twins (their names could carry a content hash, or Nitro's `maxAge` could be made to reach the Vercel output) the repeat visit makes zero twin requests | Nitro's `publicAssets.maxAge: 3600` did not reach the response on Vercel; the cause is unread (the preset may write its own headers). Confirm in `.vercel/output/config.json` | S30, S32, S35, R8 |
| `Vercel-CDN-Cache-Control` on the thumbnail route without a stamp (`?w=320` alone) so the CDN, not the browser, holds it for a minute; the stamped URL keeps `immutable` | `apps/studio/src/server/thumbs.ts` `thumbResponse` (lines 251 to 267): `private, max-age=60` without a stamp, `immutable` with one | Estimate: the first viewer of a fresh revision after the editor's warm gets the capture from the CDN instead of a function render (1.6 to 2.2 s warm, 7 to 9 s cold) | `private` today keeps the CDN out; the thumbnail carries no secret (the `?w=` variant is open by decision, `docs/hosting.md` section 6), so `public, s-maxage=60` is consistent with that decision | S32, R9 |
| Nitro `vercel.immutableStaticFiles`: client chunks under `/_vercel/immutable/` shared across deployments | `vite.deploy.config.ts` nitro options | Estimate: a tab open across a deploy keeps resolving its chunks (no failed lazy import after a deploy), and unchanged chunks stay cached across deployments | Documented as unsupported with a non root `baseURL`; the studio is at the root | S34 |
| Answer the export as a Blob URL, never as a function body over 4.5 MB | Already so: the whole deck export answers 302 to the stored copy (`docs/hosting-chromium.md` section 4) | Nothing new to gain; the row records the limit the design already respects | None | S25, R6 |

### 3.5 Fonts, images, the shell's first paint

| Technique | Where it applies in Turboslide | Expected gain | Risk | Source |
| --- | --- | --- | --- | --- |
| `<link rel="preload" as="font" type="font/woff2" crossorigin>` for `InterVariable.woff2` in the root head, and leave the italic face to `font-display: swap` discovery | `__root.tsx` head; `packages/fonts/src/inter.css` declares both faces with `font-display: swap`, no preload today; the woff2 is 352 KB, `immutable`, HIT | Measured baseline: the font is discovered after the stylesheet parses; preloading starts it with the HTML. On a warm cache nothing changes; on a first visit the text paints in Inter about one stylesheet round trip earlier (30 to 100 ms) | A preloaded font that the page never uses is wasted bytes; every page uses Inter. web.dev cautions that preload bypasses content negotiation: keep the single woff2 | S36 |
| A metric matched fallback face for Inter with `size-adjust`, `ascent-override`, `descent-override`, `line-gap-override` over `local('Arial')`, named in the `--pt-text` stack | `packages/fonts/src/inter.css` and `packages/chrome/src/tokens.css`; the sheet's type ladder in `sheet.css` is measured against Inter, so the fallback matters for the chrome only (the sheet waits for `document.fonts.ready` before it measures) | Estimate: CLS from the swap drops to near zero on a first visit; measured CLS today is 0.0004 to 0.004 because the cache is warm, so the gain shows only on cold visits | The override percentages must be computed for Inter (the Chrome article gives the method); a wrong value widens the shift | S37, S38, S51 |
| Keep two-tone twins as PNG, and consider AVIF only for the photographic twins and captures, never for dithers | The GT deck's twins are JPEG at 1600 by 900 (515 KB for `opener-brand-dark.jpg`); the dithers are 1-bit or palette PNG by construction (`packages/effects/src/png1.ts`) | Estimate: AVIF or WebP for the photographic twins at the same visual quality is commonly 30 to 50 percent smaller than JPEG (MDN's "much better compression"); on `/deck/gt-brand` that is about 0.5 MB of the 1.47 MB of pictures. Dithers stay lossless because "blurring and colored fringes around text and sharp edges are very visible" | Every export path (Perfect PPTX, PDF, HTML) reads the twins through sharp and Chromium; sharp encodes AVIF and Chromium decodes it, but the PPTX viewers do not, so AVIF is a web delivery format and the exporters keep PNG and JPEG | S39, R10 |
| `width` and `height` (or `aspect-ratio: 16 / 9`) on every thumbnail and picture frame so the layout is final before the picture decodes | `Thumb.css`, `LiveClone.css`, `decks.css` cards; most frames already size from the 16:9 rule, which is why CLS measures near 0 | Keeps CLS at 0; no time gain | None | S51 |
| Reserve the filmstrip and the right panel widths from tokens on the server rendered shell so the first client render does not move the stage | `EditorShell.css`, `--pt-sb-w`, `--pt-panel-w`; the `ssr: false` editor renders on the client only, so the shell's first frame is the layout | Keeps CLS at 0 when the editor gains a server rendered shell (`'data-only'`) | None | S51, S3 |

### 3.6 Main thread work inside the editor

| Technique | Where it applies in Turboslide | Expected gain | Risk | Source |
| --- | --- | --- | --- | --- |
| `startTransition` around the state updates that re-render the whole editor after a write (the document snapshot, the findings, the thumbnails), keeping the gesture's own state (drag box, caret) synchronous | `edit.$deckId.tsx` `commit` and `adoptExternal`; the reducer applies the write and `renderMissing` re-renders the touched slides | Estimate: a drag frame stays at the gesture's cost while the filmstrip and panels re-render in the background; INP on a drop falls by the re-render's duration (the measured long frames after route load were 118 to 407 ms with 60 to 355 ms blocking) | "Transition updates can't be used to control text inputs": the notes textarea and inline text stay synchronous. A transition is interrupted by urgent updates, which is the intent | S17, S50 |
| `useDeferredValue` for the derived views that read the document: the Check slides findings list, the Version history, the layout grid's thumbnails, the search results of Search the menus | `edit.$deckId.tsx` lines 2620 to 2680 (`findings`, `sections`, `paletteEntries` are `useMemo` today) | Estimate: typing in Search the menus or the Find and replace field stays at input speed while the list lags one frame | "does not by itself prevent extra network requests"; a deferred value paired with `memo` on the list component is what skips the work | S18, S23 |
| `memo` on the per slide components (`Thumb`, the filmstrip card, the panel rows) with stable props from the `snap.html` map | `Sidebar.tsx`, `Thumb.tsx`, `ListRow.tsx`; the editor already memoizes `toViewerDeck` and the findings | Estimate: a write to one slide re-renders one card instead of 85; React's guidance names "a drawing editor" with granular interactions as the case where memoization pays | Object props (`shot`, `slide`) must be referentially stable per slide, which the `Map` of HTML strings gives; a fresh object per render defeats `memo` | S23 |
| Memoize the string renderer by content stamp: key `renderSlide` output on the FNV-1a stamp the thumbnail URL already computes, so a slide whose canonical JSON did not change is never re-rendered, on any surface | `edit.$deckId.tsx` lines 2264 to 2280 compute the stamp for `thumbShotFor`; `renderMissing` keys by slide id and re-renders every slide a write names | Estimate: multi slide writes (Apply layout on ten slides, Find and replace) re-render only the slides whose text changed; a single slide write is unchanged. `renderSlide` for one slide is single digit milliseconds on this machine, so the gain is in the 85 slide operations | A stamp collision is a wrong thumbnail; FNV-1a over canonical JSON is the stamp already trusted for the URL | S23, R11 |
| Virtualize the filmstrip and the grid view with TanStack Virtual: render the cards in view plus `overscan` 3, position the rest by `getTotalSize()`; keep `content-visibility: auto` as the fallback for the book view | `Sidebar.tsx` (85 cards, 2539 DOM nodes of 2936); `GridView.tsx`; the filmstrip's drag and drop, multi select, `scrollIntoView` (`Sidebar.tsx` line 182) and keyboard walk must address virtual indexes | Measured baseline: the filmstrip is 86 percent of the editor's DOM. With about 12 cards visible at 112 px plus overscan, the filmstrip renders about 18 cards, a sevenfold cut in nodes, and each write re-renders 18 clones instead of 85. web.dev's `content-visibility` case measured 232 ms to 30 ms for skipping off screen rendering; the filmstrip already has that, so virtualization's gain is in React render and reconciliation, not in paint | Drag reordering across a virtual list needs the list's own scroll math; the tooltip audit walks every card, so the audit must scroll. A 300 slide deck is where this stops being optional | S11, S12, S48 |
| Move the dither preview worker onto the wasm build of the Rust crate through `backendFromNative(wrapWasmModule(glue))`, loading the glue with `new URL(..., import.meta.url)` and `init(url)` | `apps/studio/src/workers/dither.worker.ts` composes the TypeScript stages; `docs/native.md` "Open items" names this as the studio builder's change; the parity test proves identical cells | Measured in `docs/native.md`: a 1600 by 900 screen is 52 ms in TypeScript, 23 ms in wasm, 20 ms in the napi addon; the worker's round trip drops by about 30 ms per preview frame while a rep drags the gamma slider. The copy into wasm memory (5.8 MB per frame) is included in the 23 ms | The wasm module (274 KB) is a build artifact that CI does not yet produce for every platform; the worker keeps the TypeScript stages as the fallback when the fetch fails. Vite serves the glue as an asset; the `--target web` output "can natively be included on a web page" | S42, S47, R12 |
| Keep the worker's transfer discipline: `ImageBitmap` in, two `ImageBitmap`s out, transferred rather than cloned; consider `OffscreenCanvas` for the thumbnail clone raster if the live clone is ever replaced by a canvas | `dither.worker.ts` already transfers bitmaps; `OffscreenCanvas` is "available across browsers since March 2023" | Nothing new for the dither; for thumbnails a canvas raster would remove the 30 DOM nodes per clone but lose text crispness at fractional scale | Paper's `ShaderMount` needs a DOM host, so materials stay on the main thread (SPEC 3.4) | S40, S41, R13 |
| Cap the material previews playing at once: one live shader on the stage, frozen captured frames in the filmstrip and grid | `packages/viewer/src/MaterialMount.tsx`; the capture pipeline already produces frozen frames with a recipe key | Estimate: each live `ShaderMount` renders every frame at `minPixelRatio` 2; a grid of six materials is six full screen WebGL passes per frame. One live mount keeps the GPU budget for the stage | A rep expects the grid to move; the frozen frame is the export's frame, which is the argument for showing it | R13 |

### 3.7 Writes, polls and the agent channel

| Technique | Where it applies in Turboslide | Expected gain | Risk | Source |
| --- | --- | --- | --- | --- |
| Fix the studio session poll so an unknown id on a Fluid instance does not answer at once: hold the poll for its `timeoutMs` when the id is unknown, or have the client sleep before re-polling on an empty answer, and re-attach when a poll answers "unknown" | `packages/agent/src/http/sessions.ts` lines 197 to 199 (`if (!entry) return Promise.resolve([])`), `useStudioSession.ts` lines 80 to 86 | Measured baseline: 192 server function calls in 60 s on one `/new` tab, 21 on one viewer tab. With the hold, 3 per minute per tab. On Fluid compute each call is a billed invocation and an occupied connection; on the shared dev server it is one of six connections | The registry is per process; an MCP `deck_goto_slide` that reaches another instance still finds no session. The durable fix is a registry in the store (a `sessions.json` beside `leases.json`) or one instance per deck, which is a design decision for round four | R14, S24 |
| Server-sent events for the watch channel and the session channel in place of the two long polls: one `text/event-stream` per tab carrying revision events and session commands, with `id:` for resume and `retry:` | `write.ts` `watchDeckFn` (20 s hold), `sessions.ts` `pollFn` (20 s hold); Vercel functions stream responses and the stream runs to `maxDuration` (300 s on the base function) | Estimate: two held connections per tab become one; a revision reaches the tab in one hop instead of at the next poll boundary. On the Blob backend the source is still the store's 3 s revision poll, so the visible latency stays about 3 s until the store has a push source | Over HTTP/1.1 the browser allows six connections per origin; production is h2 (measured), so the limit is the h2 stream count. A stream that outlives the function's duration must reconnect; `EventSource` reconnects on its own with `Last-Event-ID` | S56, S33, S25, R15 |
| `useOptimistic` for the writes whose result the editor already computes: the title rename, Move to trash on `/decks`, the appearance switch, lease taking | The editor applies every write through `applyWrite` in the browser before `writeDeck` answers (SPEC 7.1), so the document writes are optimistic already; the list and title row actions on `/decks` are not | Perceived: the deck card leaves the list at the click and returns only if the server refuses; the measured `writeDeck` round trip on the previews was hundreds of milliseconds warm | The optimistic setter must run inside an Action or `startTransition`; a refused write must show its snackbar with Undo, which the editor's conflict card already does | S22, S17, R16 |
| Batch the editor's thumbnail warm and the write into one connection budget: the warm runs after the first write settles, and `THUMB_FETCH_LIMIT` rises from 3 to 6 on h2 | `Thumb.tsx` `THUMB_FETCH_LIMIT = 3` was set for the dev server's six HTTP/1.1 connections; production is h2 | Measured baseline: after 8 s, 16 of 85 cards have captures. Doubling the limit halves the time to a full filmstrip once the captures are cached (239 to 385 ms each); it does not help the cold case, where one Chromium serializes renders on the instance | On the host the renders compete with the write for function instances (the comment in `Thumb.tsx`); the limit should read the protocol (`navigator.connection` does not expose it; `performance.getEntriesByType('navigation')[0].nextHopProtocol` does) | R9, S56 |

### 3.8 Measuring

| Technique | Where it applies in Turboslide | Expected gain | Risk | Source |
| --- | --- | --- | --- | --- |
| A Playwright measurement script over CDP in the check step: navigation timing, paint entries, LCP, `long-animation-frame` entries with `scripts[].sourceURL`, `Performance.getMetrics` (`ScriptDuration`, `LayoutDuration`, `RecalcStyleDuration`, `TaskDuration`, `JSHeapUsedSize`, `Nodes`, `LayoutCount`), resource bytes by initiator, cache headers | `03-perf-measure.mjs` beside this report is the working version; it ran against production with `createRequire` from the repo and the Chrome for Testing binary; a check step runs it against `vite preview` on 4321 | The numbers in section 1; the check step turns them into a gate | Lab numbers on one machine; the field numbers come from the `web-vitals` row | S52, S49, S57 |
| INP from the field with `web-vitals/attribution` (`onINP`, `onLCP`, `onCLS`, `onTTFB`), sent to the studio's own log endpoint, with `interactionTarget`, `inputDelay`, `processingDuration` and `presentationDelay` | A small client module in `apps/studio/src`, about 3 KB brotli; the endpoint is a POST server function that appends to the function log | The metric that stands for "doing stuff in the slides": the 75th percentile of the slowest interactions, target at or below 200 ms | The library counts clicks, taps and key presses only; a drag's frames are not INP and need LoAF | S55, S50, S49 |
| Lighthouse CI in `pnpm check` with a `lighthouserc.js`: `collect.url` for `/new`, `/decks`, `/deck/gt-brand`, `/edit/gt-brand`, `numberOfRuns: 3`, `assert` with `categories:performance` `minScore` and a `budget.json` (`resourceSizes` script, `timings` `largest-contentful-paint`) | `scripts/check.mjs` gains a step after the server starts; `lhci autorun` on the built client | A number per commit rather than a memory of one; the `/home` page of round four gets its first score before it ships | The `ssr: false` editor scores as a client rendered page; Lighthouse's lab throttling makes `/edit` look slower than the rep's laptop, which is the point of a budget | S53, S54 |

## 4. The honest turbo fast story

Kevin asked for the reason the product is fast, "like built on rust", to be explained. The code
supports these statements, with the file that makes each one true and the measured number where one
exists. The statements after them are not supported and must not appear on the home page.

Supported:

- One renderer, one pass. A slide is a block document rendered by one string function,
  `renderSlide` (`packages/render/src/slide.ts`), on the editor, the viewer, the CLI, the print
  page and inside the exporter; a render at revision N is the same markup on every surface. The
  editor keeps the string per slide and re-renders only the slides a write touched.
- The Rust crate runs where the pixels are decided. `crates/turboslide-native` is the two-tone
  pipeline (Lanczos3, tone LUT, filters, the 8 by 8 Bayer screen), the 1-bit PNG encoder and the
  diffs, compiled as a napi addon for Node (the CLI, the studio server, the render worker) and as a
  wasm module for the browser, with a TypeScript fallback and a parity test that proves the three
  light the same cells (0 disagreements over 1.44 million cells, `docs/native.md`). Measured on the
  M5 Max: a 1600 by 900 screen in 20 ms on the addon, 23 ms in wasm, 52 ms in TypeScript. The
  reason for the crate, in the repo's own words, is determinism, and speed is the second effect.
  Today the browser worker still runs the TypeScript stages; the wasm mount is an open item, so
  "Rust in the browser" is a round four change before it is a claim.
- Static contracts. The action table generates the CLI, MCP, the window API, the OpenAPI document,
  `llms.txt` and the skills at build time (`pnpm generate:contracts`), and the studio serves the
  committed files (`/openapi.json`, `/llms.txt`); an agent reads a contract without a function
  computing it.
- Chromium raster export. Perfect PPTX is a 2x screenshot per page over a searchable text layer,
  measured against the web render before the file is written, 170 pages of the GT deck within 0.003
  percent worst mismatch (README, `docs/pptx.md`).
- Batched export. A long export is split into per slide batches, each one function call, merged
  with no browser (`docs/hosting-chromium.md` section 4); the whole 85 slide deck exported in about
  190 s on a cold instance and the file lands on Blob.
- Fluid compute. Several requests share one warm Node process, so the render cache and the deck
  mirror under `/tmp` serve the next request; bytecode caching applies in production on Node 20 and
  later (`docs/hosting.md`, S24, S27).
- Prefetching. `defaultPreload: 'intent'` runs a route's loader on hover (`router.tsx`), and
  thumbnails at a revision are immutable for a year (`thumbs.ts`), so a repeat visit never renders
  a slide twice. Measured: 30 ms to first byte on every route, 858 ms from a hover on the deck list
  to a rendered editor sheet.
- Immutable documents. Every committed write stores the whole document under its content hash on
  Blob, so a reader proves the current document by name in one `head` (`docs/hosting.md`).

Not supported:

- "Built on Rust". The studio is TypeScript on React and TanStack Start; Rust is the effects and
  diff crate. Say "with a Rust core for the image pipeline" or "the dither and diff arithmetic run
  in Rust".
- "Instant" or "realtime". A cold function renders a thumbnail in 7 to 9 s; an agent's write
  reaches an open editor within about 3 s on the Blob backend; the home page waits 4.4 s on the
  deck list today.
- "Edge rendered" or "global". The function runs in `iad1` and the Blob store is in `iad1`; only
  the hashed assets and the cached thumbnails come from the CDN near the reader.
- "Zero JavaScript" or "lightweight". Every route ships 2.66 MB of decoded JavaScript today; the
  claim becomes true for the viewer and the home page only after the split in 3.2.

## 5. Measuring and budgets

What the measurement step should assert, with the numbers this report measured as the starting
point. A budget is a ceiling in the check step, not a target on the home page.

| Metric | Today (2026-09-13, warm function, fast machine) | Proposed ceiling | Where it is enforced |
| --- | --- | --- | --- |
| TTFB, every route | 28 to 34 ms (116 once) | 200 ms | Playwright script against `vite preview`; Lighthouse CI against the deploy |
| FCP `/new` | 436 to 612 ms | 800 ms | Same |
| FCP `/decks` | 4364 to 4492 ms | 1000 ms (after 3.3 streaming) | Same |
| FCP `/deck/gt-brand`, cold browser cache | 956 ms | 1200 ms | Same |
| Editor ready (`window.turboslide` defined) | 841 to 915 ms | 1200 ms | Playwright script |
| Route transition, hover then click, `/decks` to `/edit` | 858 ms | 500 ms (after 3.1 and 3.2) | Playwright script |
| Route transition, editor to `/decks` | 6.2 s (document navigation) | 800 ms (after 3.1 and 3.3) | Playwright script |
| Decoded JavaScript on `/home` and `/deck` | 2.66 MB | 600 KB | `scripts/check-client-bundle.mjs` on `dist/client` |
| Largest chunk | 1,122,594 bytes | 500,000 bytes | Same, plus `build.chunkSizeWarningLimit` |
| DOM nodes on `/edit/gt-brand` | 4816 (filmstrip 2539) | 1500 | Playwright script, `Performance.getMetrics` `Nodes` |
| Long animation frames during load, `/edit` | 1 to 2 (up to 407 ms, 355 blocking) | none over 150 ms | Playwright script, `long-animation-frame` observer |
| INP, field, p75 | not collected | 200 ms | `web-vitals/attribution` to the log |
| CLS | 0.0004 to 0.004 | 0.05 | Both |
| Server function calls per idle minute per tab | 3 to 192 | 4 | Playwright script counting `/_serverFn/` responses over 60 s |
| Twin requests on a repeat visit of `/deck/gt-brand` | 16 revalidations | 0 (after 3.4 cache headers) | Playwright script on a second navigation in one context |

How to run what exists: `node docs/gslides-parity/research-4/03-perf-measure.mjs` writes the page
table's JSON; `node docs/gslides-parity/research-4/03-perf-transition.mjs` writes the transition
and filmstrip JSON. Both take the production URL from a constant; a check step points them at
`http://localhost:4321` after `scripts/check.mjs` starts the preview server, and the assertions
above become the exit code. The Lighthouse step is `lhci autorun` with the config in 3.8; its
budget file carries the script and total resource sizes from the table.

## 6. Sources

Read on 2026-09-13 unless a row says otherwise. R rows are files in this repository at commit
`61b16e4` or the working tree.

| Key | Source |
| --- | --- |
| S1 | TanStack Router, Preloading guide, https://tanstack.com/router/latest/docs/framework/react/guide/preloading |
| S2 | TanStack Router, Code splitting guide, https://tanstack.com/router/latest/docs/framework/react/guide/code-splitting |
| S3 | TanStack Start, Selective SSR guide, https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr |
| S4 | TanStack Router, Navigation guide (`viewTransition`, `preload`, `preloadDelay`), https://tanstack.com/router/latest/docs/framework/react/guide/navigation |
| S5 | TanStack Router, RouterOptions reference (`defaultPreload` false, `defaultPreloadDelay` 50, `defaultPreloadStaleTime` 30 000, `defaultPendingMs` 1000, `defaultPendingMinMs` 500, `defaultViewTransition`), https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType |
| S6 | TanStack Router, ViewTransitionOptions type (`types` as array or function of `fromLocation`, `toLocation`, `pathChanged`, `hrefChanged`, `hashChanged`), https://tanstack.com/router/latest/docs/framework/react/api/router/ViewTransitionOptionsType |
| S7 | TanStack Router, Data loading guide (`staleTime` 0, `gcTime` 5 minutes, `pendingComponent`, `staleReloadMode`), https://tanstack.com/router/latest/docs/framework/react/guide/data-loading |
| S8 | TanStack Router, Deferred data loading guide (`Await`, streaming of unawaited promises), https://tanstack.com/router/latest/docs/framework/react/guide/deferred-data-loading |
| S9 | TanStack Start, Server functions guide (`method: 'GET'` or `'POST'`, RPC over fetch, direct call during SSR), https://tanstack.com/start/latest/docs/framework/react/guide/server-functions |
| S10 | TanStack Start, Static prerendering guide (`prerender.enabled`, `crawlLinks`, `autoStaticPathsDiscovery`), https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering |
| S11 | TanStack Virtual, Introduction, https://tanstack.com/virtual/latest/docs/introduction |
| S12 | TanStack Virtual, Virtualizer API (`count`, `getScrollElement`, `estimateSize`, `overscan` default 1, `lanes`, `scrollToIndex`), https://tanstack.com/virtual/latest/docs/api/virtualizer |
| S13 | MDN, View Transition API (`document.startViewTransition`, `@view-transition { navigation: auto }`, pseudo element tree), https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API |
| S14 | MDN, Speculation Rules API (prefetch and prerender, `where` rules, `Speculation-Rules` header, `Sec-Purpose`, unsafe conditions), https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API |
| S15 | Chrome for Developers, Prerender pages (eagerness `immediate`, `eager`, `moderate`, `conservative`; limits 10 prerenders for immediate and 2 for the others; Chrome and Edge 109 and later), https://developer.chrome.com/docs/web-platform/prerender-pages |
| S16 | Chrome for Developers, Implementing speculation rules for complex sites ("keep prerenders down to one or two pages at most"), https://developer.chrome.com/docs/web-platform/implementing-speculation-rules |
| S17 | React, `useTransition` reference, https://react.dev/reference/react/useTransition |
| S18 | React, `useDeferredValue` reference, https://react.dev/reference/react/useDeferredValue |
| S19 | React, `<ViewTransition>` reference (props `enter`, `exit`, `update`, `share`, `addTransitionType`; the page's examples still name a 19.3 canary), https://react.dev/reference/react/ViewTransition |
| S20 | React blog, React 19.3 (2026-09-09): "in 19.3 it's stable and ready to use" of `<ViewTransition>`; Fragment refs; `browser()`, https://react.dev/blog/2026/09/09/react-19-3 |
| S21 | React, `<Activity>` reference (hidden mode, pre-rendering, stable since 19.2), https://react.dev/reference/react/Activity |
| S22 | React, `useOptimistic` reference, https://react.dev/reference/react/useOptimistic |
| S23 | React, `memo` reference ("if your app is more like a drawing editor ... you might find memoization very helpful"), https://react.dev/reference/react/memo |
| S24 | Vercel docs, Fluid compute (instance reuse, bytecode caching on Node 20 and later in production, pre-warming, defaults by plan), last updated 2026-08-24, https://vercel.com/docs/fluid-compute |
| S25 | Vercel docs, Vercel Functions limits (250 MB bundle, 300 s default and 800 s maximum on Pro, 4.5 MB body, 1,024 file descriptors, `iad1` default), last updated 2026-08-24, https://vercel.com/docs/functions/limitations |
| S26 | Vercel docs, Configuring regions for Vercel Functions (`iad1` default, Pro 5 regions, colocate with the data source), last updated 2026-08-11, https://vercel.com/docs/functions/configuring-functions/region |
| S27 | Vercel changelog, Bytecode caching for Serverless Functions by default (2024-08-21, "reduces global cold start times by up to 60%"), https://vercel.com/changelog/bytecode-caching-for-serverless-functions-by-default |
| S28 | Vercel knowledge base, How can I improve function cold start performance on Vercel ("startup time correlates with function size"; archived after 2 weeks idle in production), https://vercel.com/kb/guide/improve-function-cold-start-performance-on-vercel |
| S29 | Vercel docs, Vercel Blob (CDN cache up to 1 month, `cacheControlMaxAge`, "treat blobs as immutable", conditional writes with `ifMatch`, conditional reads with `ifNoneMatch`, simple and advanced operations), last updated 2026-08-26, https://vercel.com/docs/vercel-blob |
| S30 | Vercel docs, Vercel Blob public storage (`cacheControlMaxAge` minimum 60 s, ETag and `304` from the CDN, 512 MB cache ceiling), last updated 2026-08-11, https://vercel.com/docs/vercel-blob/public-storage |
| S31 | Vercel docs, Vercel Blob SDK (`head()` fields, `get()` with `useCache` and `ifNoneMatch`, `put()` `cacheControlMaxAge`), https://vercel.com/docs/vercel-blob/using-blob-sdk |
| S32 | Vercel docs, CDN cache (`s-maxage`, `stale-while-revalidate`, `CDN-Cache-Control`, `Vercel-CDN-Cache-Control`, static files cached for the deployment, cacheable response criteria, 10 MB and 20 MB ceilings), last updated 2026-08-11, https://vercel.com/docs/caching/cdn-cache |
| S33 | Vercel docs, Streaming functions (streamed responses run to `maxDuration`), last updated 2026-09-01, https://vercel.com/docs/functions/streaming-functions |
| S34 | Nitro docs, Vercel provider (`vercel.functions`, `vercel.functionRules`, `vercel.immutableStaticFiles` under `/_vercel/immutable/`), https://nitro.build/deploy/providers/vercel |
| S35 | web.dev, Prevent unnecessary network requests with the HTTP Cache (`max-age=31536000` with `immutable` for versioned URLs, `no-cache` with ETag otherwise), https://web.dev/articles/http-cache |
| S36 | web.dev, Best practices for fonts (preload, `font-display`, self hosting, subsetting), https://web.dev/articles/font-best-practices |
| S37 | Chrome for Developers, Improved font fallbacks (`size-adjust`, `ascent-override`, `descent-override`, `line-gap-override` example), https://developer.chrome.com/blog/font-fallbacks |
| S38 | MDN, `size-adjust` descriptor (Baseline widely available since September 2023), https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/size-adjust |
| S39 | MDN, Image file type and format guide (AVIF and WebP compression; lossless for "screenshots, diagrams, logos, and line art"), https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types |
| S40 | MDN, OffscreenCanvas (workers, `transferControlToOffscreen`, `transferToImageBitmap`, available since March 2023), https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas |
| S41 | MDN, Transferable objects (`ArrayBuffer`, `ImageBitmap`, `OffscreenCanvas`, the transfer list), https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects |
| S42 | Vite docs, Features (`new Worker(new URL(..., import.meta.url), { type: 'module' })`, `?init` and `?url` for wasm), https://vite.dev/guide/features |
| S43 | Vite docs, Build options (`build.modulePreload` polyfill and `resolveDependencies`, `build.cssCodeSplit` true, `build.chunkSizeWarningLimit` 500 kB, `build.assetsInlineLimit` 4096, `build.rolldownOptions`), https://vite.dev/config/build-options |
| S44 | Vite docs, Building for production (`build.rolldownOptions.output.codeSplitting`), https://vite.dev/guide/build |
| S45 | Rolldown docs, `OutputOptions.codeSplitting` (`groups` with `name`, `test`, `priority`, `minSize`, `maxSize`, `minShareCount`), https://rolldown.rs/reference/OutputOptions.codeSplitting |
| S46 | MDN, `rel="modulepreload"` (fetch, parse, compile into the module map; dependencies must be listed to be sure), https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/modulepreload |
| S47 | wasm-bindgen guide, Deployment (`--target web` output "can natively be included on a web page"), https://rustwasm.github.io/docs/wasm-bindgen/reference/deployment.html |
| S48 | web.dev, `content-visibility` (232 ms to 30 ms rendering in the article's case; Baseline newly available across engines as of 2025-09-15), https://web.dev/articles/content-visibility |
| S49 | Chrome for Developers, Long Animation Frames API (`long-animation-frame`, `blockingDuration`, `scripts[].sourceURL` and `invoker`; Chrome and Edge 123 and later), https://developer.chrome.com/docs/web-platform/long-animation-frames |
| S50 | web.dev, Interaction to Next Paint (200 ms good, 500 ms poor, p75), https://web.dev/articles/inp |
| S51 | web.dev, Optimize Cumulative Layout Shift (reserve space, `aspect-ratio`, font fallbacks, `transform` animations, 0.1 threshold), https://web.dev/articles/optimize-cls |
| S52 | Playwright docs, `CDPSession` (`context.newCDPSession(page)`, `send`, `on`; Chromium only), https://playwright.dev/docs/api/class-cdpsession |
| S53 | Lighthouse CI, Getting started (`lhci autorun`, `lighthouserc.js` `collect`, `assert`, `upload`), https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/getting-started.md |
| S54 | web.dev, Performance budgets with Lighthouse (`budget.json` with `timings`, `resourceSizes`, `resourceCounts`; `--budget-path`), https://web.dev/articles/use-lighthouse-for-performance-budgets |
| S55 | GoogleChrome/web-vitals README (`onINP`, `onLCP`, `onCLS`, `onTTFB`; `web-vitals/attribution` fields; about 3 KB brotli), https://github.com/GoogleChrome/web-vitals |
| S56 | MDN, Using server-sent events (`EventSource`, `text/event-stream`, `id`, `retry`, the six connection limit per origin without HTTP/2), https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events |
| S57 | Chrome DevTools Protocol, Performance domain, https://chromedevtools.github.io/devtools-protocol/tot/Performance/ ; the page is script rendered and the fetch returned its redirect notice, so the metric names in this report are the ones the live `Performance.getMetrics` call answered on 2026-09-13 (`ScriptDuration`, `LayoutDuration`, `RecalcStyleDuration`, `TaskDuration`, `JSHeapUsedSize`, `Nodes`, `LayoutCount`) |
| R1 | `packages/chrome/src/TitleRow.tsx` line 267; `apps/studio/src/routes/edit.$deckId.tsx` line 3187 (`homeHref="/decks"`) |
| R2 | `apps/studio/dist/client/assets` listing of 2026-09-13; `apps/studio/src/routes/new.tsx` line 13; `apps/studio/src/routes/__root.tsx` |
| R3 | `pnpm-workspace.yaml` catalog (six `@codemirror/*` packages, `@paper-design/shaders` 0.0.78) |
| R4 | `apps/studio/src/routes/deck.$deckId.tsx`; `apps/studio/src/components/DeckViewer.tsx` |
| R5 | `apps/studio/src/routes/decks.index.tsx` lines 53 to 60; `apps/studio/src/server/decks.ts` line 201 |
| R6 | `docs/hosting.md` sections 2, 5, 6 and 7; `docs/hosting-chromium.md` sections 3b, 4 and 5; `apps/studio/vite.deploy.config.ts` |
| R7 | `packages/store/src/blob-store.ts`; `packages/store/src/snapshots.ts`; `packages/store/src/blob-vercel.ts` |
| R8 | `apps/studio/src/routes/decks.$deckId.assets.$.ts` (`max-age=60`); `apps/studio/vite.deploy.config.ts` `publicAssets` (`maxAge: 3600`); the observed header `public, max-age=0, must-revalidate` on `/decks/gt-brand/assets/*.jpg` |
| R9 | `apps/studio/src/server/thumbs.ts` lines 251 to 267; `packages/chrome/src/Thumb.tsx` (`THUMB_FETCH_LIMIT`) |
| R10 | `packages/effects/src/png1.ts`; `packages/effects/src/two-tone.ts`; `decks/gt-brand/assets` |
| R11 | `apps/studio/src/routes/edit.$deckId.tsx` lines 747 to 810 (`renderMissing`), 2264 to 2280 (the FNV-1a stamp), 2619 (`toViewerDeck`) |
| R12 | `docs/native.md` (costs table, loading order, open items); `apps/studio/src/workers/dither.worker.ts`; `packages/effects/src/backend.ts`; `packages/native/src/wasm.ts` |
| R13 | `packages/materials/src/mount.ts` (`MOUNT_DEFAULTS`); `docs/spec/SPEC.md` section 3.4 (materials on the main thread) |
| R14 | `packages/agent/src/http/sessions.ts` lines 197 to 199; `apps/studio/src/server/sessions.ts` lines 25 to 34; `apps/studio/src/components/useStudioSession.ts` lines 26, 27 and 80 to 86; the counts in `03-perf-measure-2026-09-13.json` |
| R15 | `apps/studio/src/server/write.ts` lines 416 to 522 (`watchDeckFn`); `packages/store/src/blob-store.ts` lines 283 and 815 to 828 |
| R16 | `docs/spec/SPEC.md` section 7.1; `apps/studio/src/routes/edit.$deckId.tsx` module comment ("applied through applyWrite in the browser for optimism") |
