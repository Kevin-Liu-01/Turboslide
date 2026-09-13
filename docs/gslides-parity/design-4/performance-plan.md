# Performance plan for round four

Design report for directive (a) of round four, verbatim: "make transitions between different
websites and doing stuff in the slides so much faster and more performant". Written 2026-09-13 by
the performance architect against `main` at `61b16e4` and the working tree, after reading
`research-4/03-performance-techniques.md` and `research-4/04-performance-baseline.md` (the numbers
this plan quotes as "the baseline" are that report's, measured on production the same day) and the
code paths the baseline names. Section 10 lists every file read and every web page with the date.

The plan has three parts. Sections 2 to 4 take the baseline's ranked list of the slowest things a
sales user meets (its section 9) and give, for each, the change, the expected gain with the
baseline number, the risk, the file owner and the test. Section 5 maps every technique the round's
task names onto those changes so none is missing, section 6 decides SSR or prerender per route, and
section 7 names the biggest chunks and what happens to each. Section 8 is the budget table, and
section 9 the check that asserts it: `scripts/perf-budget.mjs`, whose design copy sits beside this
file as `design-4/perf-budget.mjs` and whose runs against production are recorded in 9.5.

## Contents

1. Summary
2. What the measurements say about where the time goes
3. The changes, in the baseline's ranked order
4. The turbo fast story after the round
5. Every technique the task names, mapped
6. SSR, data only or prerender, per route
7. The bundle diet, chunk by chunk
8. Budgets
9. The check: `scripts/perf-budget.mjs`
10. Sources

## 1. Summary

1. The product's slowness is in its network round trips and its thumbnails, not in its rendering.
   Every in-page surface paints in 4 to 21 ms and the filmstrip scrolls at 120 fps (baseline
   section 9). The round therefore spends nothing on the canvas and everything on four things: the
   home page's list call, the thumbnails, the JavaScript every route carries, and the write path.
2. The home page (`/decks`) paints at 2.8 s median and 8.7 s worst because `HostedDecks.list`
   pulls every deck's whole mirror on every call (`blob-store.ts:1105-1115`, four at a time). The
   change reads the 17 manifests in one parallel round of `get` calls and streams the shell before
   the list; the budget is a 400 ms first byte and a 1.0 s paint on a cold instance (section 3.1).
3. The filmstrip shows an edit 2.4 to 3.8 s after it saves because each thumbnail is a Chromium
   screenshot inside the function. The change makes the filmstrip clone first: the card is the
   renderer's own HTML at the next frame after the local commit, captures stay for the home page,
   the viewer's grid and the presenter, and those are cached on Blob and refreshed with
   `waitUntil` behind a stale while revalidate answer (section 3.2). The thumbnail budget drops
   from seconds to one frame for the open editor.
4. Every route downloads 2.66 MB of decoded JavaScript because the entry chunk imports the editor
   graph statically: `routeTree.gen.ts` imports every route module, `new.tsx` imports the whole
   `edit.$deckId.tsx` module, and the built `index` chunk imports `render`, `freeform` and `slide`
   (measured in `dist/client/assets`, section 7). Moving the editor and the presenter out of their
   route files, turning the shape geometry table into a `JSON.parse` string, loading Paper Shaders
   and CodeMirror on first use, and windowing the filmstrip's clones bring `/home` and `/decks`
   under 600 KB, the viewer under 1 MB and the editor under 2 MB (section 7).
5. The save round trip is six sequential Blob operations (`blob-store.ts:691-740`); running the
   independent ones in parallel makes it four, and the editor already paints before the server
   answers. The session poll storm (11 function invocations per second per open tab) ends with one
   server sent event stream per tab that carries revisions, leases and agent commands (section
   3.4, 3.8).
6. The honest speed story after the round names what the code does: one string renderer on every
   surface, static contracts served from the bundle, hashed assets immutable for a year, the Rust
   crate running in the browser worker as wasm and in the function as the Linux addon once both
   artifacts are committed (they are build outputs the Vercel builder cannot produce), Chromium
   raster export batched per slide, fluid compute instance reuse with `waitUntil`. "Built on Rust"
   stays untrue; "with a Rust core for the image pipeline" becomes true when section 3.9 lands.
7. `scripts/perf-budget.mjs` asserts the budgets of section 8 with one Chrome for Testing page at
   a time, against `vite preview` on 4321 in `pnpm check` and against a preview deployment from the
   command line. Its runs against production on 2026-09-13 met 44 of 95 budgets (the first draft,
   86 s) and 58 of 121 (the final script, 116 s; section 9.5); the failures are the items of
   section 3, in the order of their size.

## 2. What the measurements say about where the time goes

The baseline's numbers, the first run of the check (section 9.5, one cold and one warm sample per
route, so single samples where the baseline has medians; the second run's numbers are listed in
9.5) and the code they point at.

| Wait a sales user meets               | Baseline (04)                                     | Check run 2026-09-13 21:04 UTC                  | The code                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home page first byte                  | 4,671 ms cold, 5,787 warm, 516 to 8,525           | 4,050 cold, 286 warm; trash 4,826 and 709       | `HostedDecks.list` syncs every deck (`packages/store/src/blob-store.ts:1105-1115`) through `pull()` (lines 370 to 545: `list(prefix)`, records by number, the snapshot `get`)              |
| Home page paint                       | LCP 2,772 median, 8,744 worst                     | 4,308 cold, 408 warm                            | the loader awaits `listDecks` and `getServerHealth` before the shell (`decks.index.tsx:54-57`)                                                                                             |
| Edit visible in the filmstrip         | 2,406 to 3,772 ms after the save; new slide 1,920 | not measured (needs `--write`)                  | `Thumb.tsx` swaps the live clone for `/api/render/<id>?w=320&r=<stamp>`, a Chromium screenshot per changed slide (`server/thumbs.ts:229-244`); `warmThumbnails` renders all 85 on open     |
| Delete forever                        | 1,302 to 8,365 ms                                 | not measured                                    | `removeDeck` 1,251 ms, then the awaited `refresh()`, which is `router.invalidate()` (`decks.trash.tsx:54-56`, awaited at lines 63 and 88), runs the list call again under the busy state   |
| Save round trip, text                 | 990 to 1,440 ms after the last keyup              | not measured                                    | 400 ms burst (`InlineText.tsx:62`), then `writeDeck`: head, get leases, put snapshot, put deck.json, put slide, put record (`blob-store.ts:691-740`)                                       |
| Save round trip, drop or new slide    | 442 to 2,492 ms                                   | not measured                                    | the same six operations                                                                                                                                                                    |
| First editor paint                    | 908 ms cold on `/new`, 1,217 on `/edit/gt-brand`  | 624 and 2,922 cold; 401 and 1,131 warm          | `ssr: false` and no `pendingComponent`, so the shell is empty until 2.7 MB of JavaScript has run the loader                                                                                |
| JavaScript per route                  | 2,660 to 2,757 KB decoded on every route          | 2,660 to 2,757 KB                               | `index-Bw0tvTCg.js` imports `render`, `freeform`, `slide` statically; `new.tsx:13` imports the whole edit module; `present.$deckId.tsx:13` imports `renderSlide` at module level           |
| Function cold start                   | one `/new` at 1,424 ms first byte                 | none in this run                                | 148 MB per function directory with `@sparticuz/chromium` traced into all four                                                                                                              |
| Presenter window                      | 624 ms to the console                             | 982 cold, 965 warm to the console               | a second full load of the same graph, evaluated again                                                                                                                                      |
| Idle network per tab                  | 11.7 `_serverFn` calls per second                 | not measured in this run (`--only` left it out) | `pollStudioSession` answers `[]` at once for an id another instance holds (`packages/agent/src/http/sessions.ts:197-199`) and the client loops with no delay (`useStudioSession.ts:80-86`) |
| Leaving the editor for the home page  | 491 ms fast, 4,958 slow, as a document load       | 8,008 ms                                        | the title row's mark is `<a href>` (`TitleRow.tsx:265-274`), so the shell reloads and waits for the list call                                                                              |
| Twins on a repeat visit of the viewer | 16 revalidations                                  | 16 of 16 refetched                              | `.vercel/output/config.json` carries the immutable header for `/assets/(.*)` only; the `publicAssets.maxAge` never reached a route                                                         |
| DOM on the editor and the viewer      | 4,816 nodes, filmstrip 2,539                      | 5,606 and 6,470                                 | one `LiveClone` per card (`Sidebar.tsx:1283`, `Thumb.tsx:115`)                                                                                                                             |

Three facts decide the shape of the plan:

- The editor's own work is 4 to 23 ms per action (baseline 6.1), so no change below touches the
  reducer, the overlay or the drag path; the budgets keep them where they are (section 8, the
  in-page rows).
- The write is already optimistic (`edit.$deckId.tsx` `commitAs`: reducer, history entry, queued
  server write; the pump sends one write at a time). "Write to paint" is one frame today; the round
  cuts "write to saved" and "write to thumbnail".
- The thumbnail path and the session poll are the two places where the design, not the code
  quality, is the cost: a screenshot in a function cannot be made fast, and a registry on one
  instance cannot be reached from another. Both change shape below.

## 3. The changes, in the baseline's ranked order

Each subsection: today, the change, the expected gain against the baseline number (a measured
number is quoted as such; an estimate says so and gives the arithmetic), the risk, the file owner,
the test.

### 3.1 Opening the home page

Today: `/decks` first byte 4.7 s cold and 5.8 s warm median with a range from 0.5 to 8.5 s; LCP 2.8
s median, 8.7 s worst (baseline section 4); 4.05 s cold and 0.29 s warm in the check run. The
loader (`decks.index.tsx:54-57`) awaits `listDecks()`, which is `HostedDecks.list` on Blob
(`blob-store.ts:1105-1115`): `deckIds()` lists the folders under `decks/` (one `folders` call, a
paged listing), then `sync(true)` on every deck four at a time. A sync whose etag moved runs
`pull()` (lines 370 to 545): a `list(prefix)` of the deck (a second paged listing), the version
records by number, the snapshot `get`, and the mirror written to `/tmp`. On a fresh instance every
deck's etag has moved, so 17 decks cost 17 listings and 17 snapshot reads, four at a time, plus
the seed materialization (733 ms) and the sweep, which is the 5 to 8 s mode of the bimodal
distribution; on an instance whose mirrors are current the same call is 17 `head` calls in five
rounds, the 0.3 to 0.5 s mode.

The change, in three parts:

1. A list that reads manifests, not mirrors (`packages/store/src/blob-store.ts`, the collection's
   `list`; `packages/store/src/hosted.ts` `HostedDecks.list`; `apps/studio/src/server/decks.ts`
   `cardOf`). The card needs `id`, `title`, `revision`, `updatedAt`, `trashedAt`, the appearance
   and the first slide id, all of which are in `deck.json`. `list()` becomes: one `folders('decks/')`
   call, then one `get` of every `decks/<id>/deck.json` in parallel (17 at once; a `get` with the
   SDK's origin read, as `pull()` already uses, so the CDN's stale copy of an overwritten manifest
   is never read), parsed for the head fields, sorted. No mirror is written and no deck store is
   opened. Two round trips instead of five to fifty. The mirror sync stays where a document is
   read (`open`), unchanged.
2. A deck index as the follow up when the store passes about 50 decks: `decks/index.json`
   rewritten on every create, trash, restore, remove and rename with `ifMatch` (the collection
   already does conditional puts for the trash stamp, `stamp()` at line 1065), read in one `get`
   by `list()`, and reconciled against `folders()` when a `get` of a listed deck answers null. Not
   in this round; recorded so the first part is not mistaken for the end state.
3. The shell before the list (`decks.index.tsx`): the loader returns `{ recent, decks: promise }`
   where `recent` is this browser's own list from `localStorage` (`RECENT_KEY` holds ids and
   times today; the editor's `recordDeckOpened` gains the title, the appearance and the first slide
   id, so the Recent row renders whole without the store) and `decks` is the unawaited store
   listing rendered through `<Await>` under a Suspense boundary with the card grid's frame as the
   fallback (TanStack Router streams a deferred promise's result after the shell, S8). The page's
   `data-hydrated` stays the ready mark. `getServerHealth` stays in the loader (it is in process on
   the server and carries the server-only marker `check-client-bundle.mjs` looks for).

Expected gain: the first byte falls from 4.7 s cold to under 0.4 s (the seed materialization of
733 ms on a fresh instance stays ahead of it, so the cold instance case is about 1.1 s, the
`/deck` route's cold first byte today); the paint falls from 2.8 s median to the shell's arrival
plus the card grid: about 0.4 s cold and 0.3 s warm on this connection, which is the `/decks/trash`
warm number the baseline measured when its list was fast (0.44 s). Estimate, from the round trip
arithmetic above and the measured fast mode. `/decks/trash`, the Open dialog, the Import slides
dialog and `deck.list` over MCP take the same list and gain the same.

Risk: the card's `updatedAt` and title come from the manifest the store serves at that moment; a
write in flight on another instance shows on the next load, which is what `sync(true)` promised
too (the comment at line 1109 says "must show on the next home page load"), so nothing is lost.
The Recent row is per browser (a rep on a new machine sees only the streamed list). The deferred
promise must be awaited on the server before the stream closes; TanStack does that for `Await`
(S8).

File owner: `packages/store/src/blob-store.ts` and `hosted.ts` (store builder);
`apps/studio/src/server/decks.ts`, `apps/studio/src/routes/decks.index.tsx`, `decks.trash.tsx`
(studio builder).

Test: `packages/store/src/hosted.test.ts` gains a case that lists two decks from the fake with one
manifest moved and asserts no mirror directory is created by the list and the head fields match;
`apps/studio/e2e/home.spec.ts` asserts the Recent row is in the server's HTML when `localStorage`
holds it and the store list arrives after; `scripts/perf-budget.mjs` asserts `/decks` and
`/decks/trash` first byte and paint (section 8) and the `edit->decks` transition.

### 3.2 Seeing the edit in the filmstrip

Today: 2.4 to 3.8 s after a text edit saves, 1.9 s for a new slide, 5.1 s for the home card, 24 to
34 s for 85 thumbnails on a fresh instance, 2.4 s each for the first visible sixteen (baseline 6,
6.2). The card starts as a `LiveClone` of the slide's HTML (`Thumb.tsx:111-115`) and swaps to the
320 px PNG from `/api/render/<slide>?w=320&r=<fnv1a stamp>` once it decodes; each stamp is a
Chromium screenshot inside the function (`thumbs.ts` `getThumbnail`, `renderSlide` through the
worker's in-process CLI), 3 to 5 s on a warm instance, preceded by 404s while the instance's
mirror catches up. `warmThumbnails` renders every slide of the deck once per open
(`edit.$deckId.tsx:2210`), which on a fresh instance holds Chromium for 24 to 34 s and delays every
export and thumbnail that lands on that instance (`docs/hosting-chromium.md` 3b: fluid compute
runs several routes in one process; one Chromium at a time).

The change, in four parts:

1. The editor's filmstrip is clone first and capture never (`packages/chrome/src/Sidebar.tsx`
   `FilmCard`, `Thumb.tsx`; `edit.$deckId.tsx` `toViewerDeck`, which stops setting `shot` on the
   editor's slides). The card is the renderer's HTML for that slide from `snap.html`, which the
   reducer path already re-renders for the touched slides at the local commit (`renderMissing`,
   `setDocument`), so the card reflects an edit at the next frame, before the server answers, and
   never asks the function for a picture. The `Thumb` component keeps its capture path for the
   other callers (the grid tiles of the viewer, the home cards through `cardThumbUrl`, the
   presenter's previews); a new prop `capture: 'never' | 'when-available'` says which. The clone
   is what the baseline measured at 120 fps once decoded; the two 200 ms frames of the first pass
   were the capture swaps, which no longer happen.
2. The clones are windowed (section 3.5): only the cards within about two screens of the viewport
   hold a clone; the rest hold the frame and the number. This is what keeps the clone first
   filmstrip under the DOM budget for an 85 slide deck.
3. The capture path serves the surfaces that keep it, from a shared cache with stale while
   revalidate (`apps/studio/src/server/thumbs.ts`, `routes/api/render.$slideId.ts`,
   `packages/store/src/blob-store.ts`): the thumbnail cache moves from the instance's `/tmp` to
   the Blob prefix `decks/<id>/.thumbs/<stamp>/<theme>@<width>/<slide>.png` (the stamp is the
   slide's FNV-1a over canonical JSON, the one the URL carries today), put with
   `cacheControlMaxAge` of one year (the stamp names the pixels, so the body never changes under
   its name). `GET /api/render/<slide>?w=320&r=<stamp>` answers a 302 to the Blob URL when the
   object exists (one `head`), else renders, puts and answers the PNG; the Vercel CDN caches the
   302 with `public, s-maxage=31536000, immutable`, so every instance and every later reader sees
   one render per stamp instead of one per instance. Without `r` (the home cards use the deck
   revision as `r` today and keep doing so) the route answers the newest stored thumbnail of that
   slide with `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400` and, when the
   stamp behind it is stale, renders the current one inside `waitUntil()` from `@vercel/functions`
   after the response (Vercel: "Extends the lifetime of the request handler for the lifetime of
   the given Promise", read 2026-09-13), so the reader gets a picture at once and the next reader
   gets the current one.
4. The editor's warm changes purpose: `warmThumbnails` on open goes away for the filmstrip; the
   editor warms the first slide's home card capture after the first saved write (one render, in
   `waitUntil` inside `writeDeck`, so the home page's card is current when the rep goes back to
   it), and the viewer's grid warms the visible tiles' captures on first entry into grid mode, as
   `ShellBridge` does today when `mode === 'grid'`.

Expected gain: "seeing the edit in the filmstrip" goes from 2.4 to 3.8 s to one frame after the
local commit (the baseline measured the new slide's card painted in 8 ms and a drag's dropped box
in 5 to 8 ms; the clone re-render is the same path). The fresh instance's 24 to 34 s warm
disappears from the editor's open, which also frees Chromium for exports on that instance. The
home card falls from 5.1 s to a CDN hit for a deck whose first slide was rendered after its last
save, else the previous capture at once with the current one behind it (estimate: the answer is
the `waitUntil` render's cost moved off the critical path). The 16 first visible captures on a
cold `/edit` (2.4 s each) are gone; the viewer's grid keeps them and gains the Blob cache across
instances.

Risk: a clone at 200 px wide is text at k 0.125, crisp in Chromium at any pixel ratio because it is
DOM, and it loads the slide's picture twins at 1600 px for a 200 px card (`lazyPictures` keeps them
lazy; a 320 px twin variant is a later change). A material slide's clone shows the frozen frame,
never a shader (`MaterialMount` is not in the clone), which is the frame contract of SPEC 5.4. SPEC
5.5 says static thumbnails replace live clones from M3; this change keeps that for the viewer and
the home page and reverses it for the editor's filmstrip on the measured ground above; the
deviation is recorded for Kevin in section 4 of `BUILD-STATUS` when it ships. The Blob cache adds
one `put` per rendered thumbnail (an advanced operation) and one `head` per miss; the CDN cached
302 keeps the head count to one per stamp. `waitUntil` promises "have the same timeout as the
function itself" (Vercel), 800 s on the render function rule, so a render behind a response cannot
outlive it.

File owner: `packages/chrome/src/Thumb.tsx`, `Sidebar.tsx` (chrome builder);
`apps/studio/src/routes/edit.$deckId.tsx` `toViewerDeck` and `ShellBridge`,
`apps/studio/src/server/thumbs.ts`, `warm.ts`, `routes/api/render.$slideId.ts` (studio builder);
`packages/store/src/blob-store.ts` the `.thumbs` prefix helpers (store builder).

Test: `apps/studio/e2e/filmstrip.spec.ts` types into the heading and asserts the current card's
clone carries the text within 50 ms of `describe().state.revision` moving, and that no
`/api/render` request leaves the editor's page for the filmstrip; `apps/studio/e2e/viewer.spec.ts`
asserts the grid's tiles still load captures; a vitest on `thumbs.ts` asserts the header set per
URL shape (`r` present: immutable; absent: `s-maxage=60, stale-while-revalidate=86400`);
`scripts/hosted-smoke.mjs` gains a row that requests one `?w=320&r=` twice and asserts the second
answer is a CDN hit (`x-vercel-cache: HIT`) or a 302 to a Blob URL; `perf-budget.mjs --write`
asserts the clone budget and reports the capture time (section 8, the write rows).

### 3.3 Delete forever

Today: 1.3 to 8.4 s to the card gone, with a busy state and no progress (baseline section 8);
`removeDeck` itself 1,251 ms, the rest the page's `refresh()`, which is the list call of 3.1.

The change: `refresh()` is already `router.invalidate()` (`decks.trash.tsx:54-56`); the cost is
that the page awaits it under the busy state before the card leaves (line 88 for Delete forever,
line 63 for Restore), and the invalidation re-runs the loader, which is the list call of 3.1. The
trash page takes the optimistic path Move to trash on `/decks` already takes (22 ms measured): the
confirmed cards leave the rendered list at the click through local state over the loader's cards,
`router.invalidate()` runs without being awaited for that, and a card whose `removeStoredDeck`
refuses comes back with the error sentence in the snackbar. `removeDeck` on Blob deletes the prefix
(`del` of every blob under `decks/<id>/`, one call after one listing); it stays as it is.

Expected gain: the card leaves in one frame (the Move to trash measurement, 22 ms); the list
refresh behind it takes the 3.1 time (about 0.4 s). Estimate by construction.

Risk: a removal that fails after the card left must bring it back with the snackbar; the page
already has the snackbar and the restore path for Move to trash.

File owner: `apps/studio/src/routes/decks.trash.tsx` (studio builder).

Test: `apps/studio/e2e/home.spec.ts` (the trash part) asserts the card is gone within 100 ms of the
confirm click and stays gone after the loader resolves; the same spec plants a refused removal
through the fake and asserts the card returns with the sentence.

### 3.4 The save round trip

Today: 1.0 to 1.6 s from the last keystroke to a saved revision (400 ms burst, then 0.6 to 1.0 s of
`writeDeck`), 0.45 to 2.5 s from a drop, 0.4 to 0.6 s for a new or duplicated slide (baseline
6.1). The write on Blob (`blob-store.ts:691-740`; the operations at lines 694, 700, 715, 717, 723 and 731) is six sequential operations for a one slide
write: `head(deck.json)`, `get(leases.json)`, `put(snapshot)`, `put(deck.json, ifMatch)`, `put(slide)`,
`put(version record)`; the prune is already asynchronous. At 100 to 160 ms per operation from
`iad1` to the store in `iad1` that is the measured 610 to 940 ms.

The change, in three parts:

1. Four rounds instead of six (`packages/store/src/blob-store.ts` `write`): round one runs the
   manifest `head` and the leases `get` together; round two puts the snapshot and the changed slide
   bodies together (a slide body pushed before the manifest is harmless: a reader syncs only when
   `deck.json`'s etag moves, and the pull proves the document by the snapshot's name, `pull()`
   step 1b); round three is the commit, `put(deck.json, ifMatch)`, alone, as today; round four
   puts the version record. The record stays after the commit because records are put with
   overwrite and a loser's record must never overwrite the winner's; it stays synchronous because
   `adoptExternal` on another editor reads the records to apply the revision forward and reloads
   when one is missing (`edit.$deckId.tsx:1189-1237`). Two slides changed in one write add nothing
   (round two is parallel).
2. The editor coalesces the writes Google's history also coalesces (`edit.$deckId.tsx` `pump`):
   when the pump reaches the next job and the queue holds further jobs from the same author whose
   mutations are all `block.set /pos` or `slide.set /notes` on the same target (arrow nudges, the
   notes textarea's bursts), it merges them into one `Write` with the mutations in order and one
   version record, resolving every job with the same revision. Undo is unaffected: the history is
   local and keeps one entry per gesture. Everything else stays one write per gesture, as SPEC 6.7
   and the parity spec's "one gesture, one write, one undo" require.
3. The text burst stays at 400 ms (gslides-parity SPEC 7.2.15); a burst ends at once on Enter in a
   heading, on Escape and on blur, as `finish()` does today, so the 400 ms is the cost of typing
   and pausing, not of finishing.

Expected gain: the Blob write falls from 610 to 940 ms to about 400 to 640 ms (four rounds of the
measured 100 to 160 ms; estimate by arithmetic), so a text edit saves about 0.8 to 1.0 s after the
last keystroke instead of 1.0 to 1.6, and a new slide in about 0.3 to 0.4 s instead of 0.44 to
0.57. Nothing changes on screen, because the editor paints at the local commit; what changes is how
soon an agent may chain the next write against the new revision and how soon another editor sees
it.

Risk: a slide body pushed before a commit that then fails (a precondition failure) leaves a slide
blob the store's manifest does not name; the next write of that slide overwrites it and the
document is never wrong, because the manifest and the snapshot decide the document. The coalescing
rule must be narrow: only mutations on one target, only the same author, never across a
`slide.replace`, never when the queue's first job is a rebase. `hosted.test.ts` holds both races
with the fake's frozen clock and must keep passing with the new order.

File owner: `packages/store/src/blob-store.ts` (store builder); `apps/studio/src/routes/edit.$deckId.tsx`
`pump` (studio builder).

Test: `hosted.test.ts` gains an assertion on the fake client's call log (four rounds, the commit
alone in its round, the record after it) and keeps its two race cases; `apps/studio/e2e/undo.spec.ts`
asserts ten arrow nudges produce ten undo entries and fewer version records; `perf-budget.mjs
--write` asserts "last keyup to saved" and "new slide to saved" (section 8).

### 3.5 The first editor paint

Today: a blank page for 0.9 s cold on `/new` and 1.3 s cold on the 85 slide deck (2.9 s in the
check run, the loader's Blob pull on a cold mirror included), 0.4 and 0.9 s warm (baseline section
4). `/new`, `/edit/$deckId` and `/present/$deckId` are `ssr: false` with no `pendingComponent`, so
the server sends a 24.6 KB shell with no route markup and nothing paints until the entry chunk,
the editor graph and the loader's server function have all run. The route DOM, the studio handle
and `data-settled` land within a few milliseconds of each other because they all wait on the same
thing.

The change, in five parts:

1. `ssr: 'data-only'` on `/new`, `/edit/$deckId` and `/present/$deckId` (`apps/studio/src/routes/*`):
   TanStack Start runs `beforeLoad` and `loader` on the server and sends the loader data with the
   document, and renders the component on the client (S3, read 2026-09-13). The client no longer
   posts `readEditorDeck` or `readDraftDeck` after the JavaScript arrives; the payload rides the
   document as a dehydrated script. One server function round trip leaves the critical path (77 to
   367 ms measured for the editor's calls at load, baseline 4.2), and the loader's Blob read runs
   while the browser is still downloading the chunks rather than after.
2. A skeleton as the `pendingComponent` of those three routes, drawn from the tokens
   (`packages/chrome/src/EditorSkeleton.tsx`, `PresenterSkeleton.tsx`; the routes set
   `pendingComponent` and `pendingMinMs: 0`): the title row at `--pt-title-h`, the menu bar at
   `--pt-menu-h`, the toolbar at `--pt-tool-h`, the filmstrip rail at `--pt-sb-w` with empty card
   frames, the sheet mat centred at the fit scale of a 1440 by 900 window, the notes row and the
   bottom bar, every box the same size as the final one. For `ssr: false` and `'data-only'`
   routes "the server will render the route's `pendingComponent` as a fallback" (S3), so the
   skeleton is in the HTML and paints at first byte plus the stylesheets. `pendingMinMs` must be 0
   on these routes: the router's `defaultPendingMinMs` is 500 (S5) and would hold the skeleton for
   half a second after the editor is ready.
3. The editor payload's version log leaves the loader (`apps/studio/src/server/write.ts`
   `readEditorDeck`, `edit.$deckId.tsx` the History and Versions panels): `versions` becomes the
   newest 50 entries without their `mutations` plus the count; the Version history panel loads the
   rest through `listVersions` when opened, with the mutations for the one it restores. The GT deck
   in the checkout holds 7 records in 184 KB (26 KB each: a `slide.replace` carries the slide), so a
   deck edited for weeks would send megabytes of history on every open.
4. The font is preloaded (`apps/studio/src/routes/__root.tsx` head: `rel="preload" as="font"
type="font/woff2" crossorigin` for `InterVariable.woff2`, imported with `?url` so the hashed
   name is the one the stylesheet names), and `packages/fonts/src/inter.css` gains a metric
   matched fallback face (`size-adjust`, `ascent-override`, `descent-override`,
   `line-gap-override` over `local('Arial')`) named after Inter in the `--pt-text` stack, so the
   skeleton's text and the chrome do not shift when Inter arrives on a cold visit. Only the roman
   face is preloaded; the italic is discovered by the stylesheet as today. web.dev's caution that
   preload "bypasses some of the browser's built-in content negotiation strategies" (read
   2026-09-13) does not bite: there is one woff2 and every route uses it.
5. The bundle diet of section 7 is what moves the ready time: the editor's graph shrinks, the
   viewer's and the home page's graphs stop carrying it.

Expected gain: first paint on `/new` and `/edit` moves from 0.9 to 1.3 s cold to the shell's
arrival, about 0.2 to 0.3 s (the `/decks/trash` warm number, 0.44 s, is a shell with a little
markup; the skeleton is smaller); the studio handle arrives one server round trip earlier (77 to
367 ms measured) plus whatever the smaller graph saves in parse and compile (the `index` chunk
alone is 1.1 MB of source; V8's own guidance is that parse and compile scale with source size).
Estimate: ready 0.6 s cold and 0.35 s warm on `/new`, 1.0 and 0.6 on `/edit/gt-brand`, which are
the section 8 ceilings.

Risk: `'data-only'` puts the whole `EditorDeck` in the document; for `gt-brand` that is about 500
KB of JSON before compression (the 85 slides are 400 KB on disk, the manifest 96 KB) and about 50
KB over the wire, the same bytes the client fetched before, delivered earlier. The skeleton must
equal the final frame or it costs CLS; it is built from the same tokens and asserted by the CLS
budget. The dehydrated payload is parsed once by the router; the editor's controller takes the
object as it takes the server function's today. `/present` opens as a popup and keeps `ssr:
'data-only'` too; its loader is the editor's read.

File owner: `apps/studio/src/routes/new.tsx`, `edit.$deckId.tsx`, `present.$deckId.tsx`,
`__root.tsx`, `apps/studio/src/server/write.ts` (studio builder); `packages/chrome/src/EditorSkeleton.tsx`
(chrome builder); `packages/fonts/src/inter.css` (fonts builder).

Test: `apps/studio/e2e/editor.spec.ts` asserts the server's HTML for `/edit/gt-brand` contains the
skeleton's title row and no `.ts-stagewrap`, and that the studio handle appears without a
`readEditorDeck` request in the page's network log; `scripts/hosted-smoke.mjs` row for `/new`
asserts the skeleton markup; `perf-budget.mjs` asserts first paint, ready and CLS per route
(section 8).

### 3.6 Function cold starts

Today: one `/new` load at 3.0 s LCP with a 1.4 s first byte, one `/present` at 2.1 s, one warm
`/edit` at 2.1 s: a fresh instance of a 148 MB function directory (baseline section 9 item 6;
section 2.2: `node_modules` 92 MB of which `@sparticuz/chromium` 65 MB, `_virtual` 50 MB of seed
and package assets).

The change is bounded, because the bundle is the cost and the bundle carries what the function
must have:

1. The seed's 30 MB of GT twins leaves the server bundle (`apps/studio/vite.deploy.config.ts`
   `SEED_PATTERN`): the twins are static files of the deployment already (`publicAssets`), and the
   function reads a twin only for a render or export, which `ensureDeckAssets` can pull from the
   deployment's own static URL or from Blob (the seed is uploaded to Blob once, `seedOnce`). The
   `decks` server asset group keeps the documents (183 files) and drops `assets/**`. That is 30 MB
   of base64 chunks fewer to load per cold start, in all four function directories.
2. The base function (`__server.func`) is left as it is this round: it serves the pages and the
   list, never renders, and yet carries the Chromium package because Nitro's `traceDeps` is one
   list for every function directory. Splitting it needs a preset option Nitro does not offer per
   rule (the techniques report, 3.4 row 1); the plan records it and does not spend on it.
3. Bytecode caching applies on production for Node 20 and later (Vercel, read 2026-09-13: "stores
   the compiled bytecode of JavaScript files after their first execution"); nothing to do, and it
   is why the second cold start of a deployment is cheaper than the first.

Expected gain: the seed's 30 MB is about a fifth of the directory; the measured cold start of 1.6
to 3.9 s in the hosting round (`docs/hosting.md` section 7) had the seed materialization at 300
ms and the module load as the rest, so the estimate is a few hundred milliseconds off a cold
start, not the whole 1.4 s. The honest number comes from the check's cold sample on a preview.

Risk: a render on an instance whose overlay has no twins must fetch them before Chromium reads
`file://` paths (the hosting round measured a 300 s hang on missing images); `ensureDeckAssets`
already pulls a Blob deck's twins and must learn to pull the seed deck's from the static URL or
Blob.

File owner: `apps/studio/vite.deploy.config.ts`, `apps/studio/src/server/root.ts`
`ensureDeckAssets` (hosting store builder).

Test: the built `.vercel/output/functions/__server.func` size is printed by a new line in
`scripts/check.mjs` after the deploy build when `NITRO_PRESET=vercel` is set (a report line, not a
gate this round); `scripts/hosted-smoke.mjs` renders one thumbnail of the GT deck on a preview and
asserts 200.

### 3.7 The presenter window

Today: 0.6 s to the console (baseline section 5), 1.0 s in the check run, a second full load of the
same 2.7 MB graph evaluated again in the popup.

The change: the presenter route takes the section 7 split (its own chunk with `renderSlide` and the
console, no chrome shell, no shape table), the `'data-only'` loader and the skeleton of 3.5; the
editor preloads the presenter's chunks when the pointer enters the Slideshow split button's arrow
(`router.preloadRoute({ to: '/present/$deckId' })`, S1) so the popup's modules are in the cache
before `window.open`. Speculation Rules `prerender` cannot help a `window.open` popup (a prerender
activates on a navigation in the same tab), so the popup's cost is the module evaluation of its own
graph and the loader.

Expected gain: the presenter's graph falls from 2.7 MB to under 1.2 MB decoded (section 7), so the
evaluation halves; estimate 0.4 s to the console warm from 0.6 to 1.0.

Risk: none beyond the split.

File owner: `apps/studio/src/routes/present.$deckId.tsx`, `apps/studio/src/components/PresenterPage.tsx`
(new), `components/presentActions.ts` (studio builder).

Test: `apps/studio/e2e/present.spec.ts` asserts the popup's studio handle within the budget and
that its JavaScript total is under the `/present` ceiling; `perf-budget.mjs` route row `/present`.

### 3.8 The session poll storm and the external revision channel

Today: about 11 `_serverFn` invocations per second per open editor, viewer or presenter tab (6,993
in ten idle minutes, baseline 7.3), because `pollStudioSession` answers `[]` at once when the id is
unknown to the instance it landed on (`packages/agent/src/http/sessions.ts:197-199`) and the
client re-polls with no delay (`useStudioSession.ts:80-86`); the session entry on the instance
that holds it is swept after 45 s, so `deck_goto_slide` over `/mcp` cannot reach the page. Beside
it the `watchDeck` long poll holds 20 s per call as designed (`write.ts:465-518`), over the Blob
store's 3 s revision poll (`blob-store.ts:339`, `pollMs` default 3000; `watch()` at line 859).

The change, in two parts, the second a design decision for Kevin:

1. One server sent event stream per tab replaces both long polls (`apps/studio/src/routes/api/events.$deckId.ts`
   as a server route returning a `text/event-stream` `Response` whose body is a `ReadableStream`;
   `apps/studio/src/components/useDeckEvents.ts` replaces `useStudioSession` and the editor's
   `watchLoop`). The stream carries `revision` events (the `WatchDeckResult` shape, `id:` set to
   the revision so `Last-Event-ID` resumes where the tab left off), `leases`, `command` events for
   the attached session, and a `ping` comment every 15 s. On the server the stream's loop is the
   store's `watch` (the 3 s revision poll on Blob, `fs.watch` on a checkout) plus the session
   registry's queue; the function rule `/api/events/**` gets `maxDuration: 800` like the other
   heavy rules (a stream runs to the function's duration; Vercel functions stream responses on
   Node, read 2026-09-13), and the stream ends itself at 780 s so `EventSource` reconnects on its
   own (MDN: "if the connection between the client and server closes, the connection is
   restarted"). Production is h2, so the six connection limit of HTTP/1.1 does not apply (MDN,
   read 2026-09-13). Per idle tab this is zero `_serverFn` calls and one stream reconnecting every
   13 minutes, against 700 invocations per minute today, and the Blob head count stays what the
   watch poll costs today (one every 3 s).
2. The session registry leaves `globalThis` so a command reaches a page whichever instance holds
   its stream. The no new dependency design: a per deck mailbox on Blob,
   `decks/<id>/.sessions.json` (attached sessions with `lastSeenAt`) and
   `decks/<id>/.commands/<commandId>.json` (one small object per command, put with overwrite
   refused; the answer under `.answers/<commandId>.json`). The stream's 3 s tick heads
   `.sessions.json` and lists nothing; a command is one `put` by the instance that took the MCP
   request and one `get` by the page's stream on its next tick; the requester polls the answer
   every 500 ms up to `DEFAULT_COMMAND_TIMEOUT_MS`. Command latency is at most 3.5 s, which is what
   the watch channel promises for a write today. The alternative with a dependency is a
   Marketplace Redis (Upstash) with `BLPOP` as the server side long poll and sub millisecond
   delivery; it adds a service and a token to the project and is Kevin's call. Until either lands,
   the client sleeps 2 s after an empty answer and the server holds an unknown id for its
   `timeoutMs`, which cuts the storm to 3 calls per minute per tab (the techniques report, 3.7 row
   1. without making delivery work across instances.

Expected gain: measured 11.7 invocations per second per tab to 0 on the `_serverFn` function and 1
stream; the external revision reaches an open editor in the same 3 s window as today, one hop
sooner (no 20 s poll boundary to wait for). An agent's `deck_goto_slide` works on production, which
it does not today except when the MCP request and the page's poll meet on one instance.

Risk: `EventSource` cannot send headers, so the stream authenticates the page as the server
functions do today, by same origin under the CSRF middleware's rules for a GET, and carries no
bearer; the stream is read only from the page's side (commands are answered through a server
function POST as today). A tab that sleeps (a hidden tab's timers are throttled) reconnects on
wake with `Last-Event-ID`. The Blob mailbox costs one `head` per 3 s per attached tab (a simple
operation, the price the watch poll pays today) and one `put` per command.

File owner: `apps/studio/src/routes/api/events.$deckId.ts` (new), `apps/studio/src/components/useDeckEvents.ts`
(new), `apps/studio/src/server/sessions.ts`, `apps/studio/src/routes/edit.$deckId.tsx` `watchLoop`
(studio builder); `packages/agent/src/http/sessions.ts` the registry's storage interface (agent
builder); `packages/store/src/blob-store.ts` the `.sessions` and `.commands` helpers (store
builder); `apps/studio/vite.deploy.config.ts` the function rule (hosting store builder).

Test: `apps/studio/e2e/window-api.spec.ts` asserts one `/api/events/` request and zero
`/_serverFn/` requests over 60 s on an idle editor; `apps/cli/e2e/mcp-http.mjs` drives
`deck_goto_slide` against a server and asserts the page moved; `packages/agent/src/__tests__`
gains the registry over the fake mailbox with two registries standing in for two instances;
`perf-budget.mjs` idle check asserts `_serverFn` calls per minute (section 8).

### 3.9 The Rust crate in the browser and in the function

Not in the baseline's ranked list of waits, because nothing waits on it today; in the plan because
directive (b) asks for the reason the product is fast to be explained and the baseline's section 10
records that "Built on Rust" is untrue on production: the napi addon is a git ignored `.node` file
built for `darwin-arm64` alone, the wasm module is git ignored, CI runs no `cargo`, and the Vercel
build clones `main`, so the function and the browser both run the TypeScript stages
(`packages/effects/src/select.ts`, `docs/native.md` "What runs where").

The change, in three parts:

1. The two artifacts are committed as build outputs regenerated by a check step, the way
   `packages/agent/generated` is: `packages/native/wasm/turboslide_native.js`,
   `turboslide_native_bg.wasm` (274 KB) and the `.d.ts`, and
   `packages/native/npm/linux-x64-gnu/turboslide-native.linux-x64-gnu.node` (about 770 KB, the
   Vercel function's platform: `nodejs24.x` on Linux x64 glibc). A GitHub Actions job builds both
   on `ubuntu-latest` with `dtolnay/rust-toolchain`, `wasm32-unknown-unknown` and
   `wasm-bindgen-cli` 0.2.128 pinned, and `pnpm check` gains a step that rebuilds them when cargo
   is present and diffs, so the committed bytes are always the source's. The Vercel builder has no
   Rust toolchain, which is why the artifacts travel in git rather than being built there. The
   `.gitignore` lines 22 to 25 change accordingly.
2. The dither preview worker mounts the wasm module (`apps/studio/src/workers/dither.worker.ts`):
   `import init, * as glue from '@turboslide/native/wasm/turboslide_native.js'` with the wasm URL
   from `new URL('.../turboslide_native_bg.wasm', import.meta.url)`, `await init(url)` once per
   worker, then `backendFromNative(wrapWasmModule(glue))` from `@turboslide/effects/backend` and
   `@turboslide/native/wasm`, the path `docs/native.md` "Loading order" describes for a browser
   worker; the TypeScript stages stay as the fallback when the fetch or the instantiation fails.
   The worker chunk grows from 9.7 KB to about 35 KB of glue plus the 274 KB wasm fetched once and
   cached immutable under `/assets/`.
3. The server picks the addon by the existing loading order (`select.ts`: native, then wasm, then
   TypeScript) once the Linux addon is in the bundle; `asset.dither`, the export's pixelmatch gate
   and the two-tone regeneration in the function run on it with no code change. Nitro's tracer
   must copy the `.node` file: `traceDeps` gains `@turboslide/native-linux-x64-gnu` (the
   `@sparticuz/chromium*` entry shows the shape).

Expected gain, measured in `docs/native.md` on the M5 Max: a 1600 by 900 two-tone screen in 23 ms
on wasm against 52 ms in TypeScript, so the inspector's preview follows a slider drag at about 40
frames per second instead of 19; the pixelmatch gate 153 ms against 208 ms per page pair on the
addon, about 9 s off a 170 page export verify. The crate's reason stays determinism (0 cell
disagreements across the three implementations, `docs/native.md` "Parity results"); the speed is
its second effect and the story says so (section 4).

Risk: wasm-bindgen's `--target web` glue "can natively be included on a web page" (S47), and Vite
serves the `.wasm` as an asset; the worker must never call `initSync` on a module of this size on
a page's main thread (`packages/native/src/wasm.ts` says why), and the worker is where it runs. A
committed binary in a public repository is reviewed by its SHA-256 against the check step's
rebuild. The `linux-x64-gnu` addon is untested until the first preview runs it; `describeBackends`
reports the selection and `TURBOSLIDE_EFFECTS_BACKEND=typescript` pins the fallback if it fails.

File owner: `crates/turboslide-native`, `packages/native` (crate builder);
`apps/studio/src/workers/dither.worker.ts`, `apps/studio/vite.deploy.config.ts` (studio and hosting
store builders); `.github/workflows/check.yml`, `scripts/check.mjs` (integrator).

Test: `packages/effects/src/parity.test.ts` with `TURBOSLIDE_NATIVE_REQUIRED=1` in CI (it fails
instead of skipping when a build is missing); a vitest for the worker's `answer()` on the wasm
backend against the TypeScript backend on the two-tone fixture (identical cells); the check step's
rebuild and diff; `scripts/hosted-smoke.mjs` reads `describeBackends` through `/api/agent`'s
instance facts on a preview and asserts `native`.

## 4. The turbo fast story after the round

The baseline's section 10 table, carried forward: what the home page and the README may claim once
the section 3 changes ship, and the file that makes each true. A row marked "after" is untrue until
its change lands; the copy uses the present tense only for rows marked "today".

| Claim                                                                | State | What makes it true                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One renderer, one pass: a slide is one string on every surface       | today | `packages/render/src/slide.ts` `renderSlide`; the editor's `snap.html` map re-renders only the touched slides (`edit.$deckId.tsx` `renderMissing`)                                                                                                      |
| The filmstrip shows an edit at the next frame                        | after | section 3.2: the card is the renderer's HTML; no capture request leaves the editor                                                                                                                                                                      |
| Static contracts, served from the bundle                             | after | `apps/studio/src/server/contracts.ts` reads `repoRoot()`, the overlay when hosted, and answers placeholders on production today (report 05); the fix imports the generated files with `?raw` and serves them with `public, max-age=300, s-maxage=86400` |
| Hashed assets immutable for a year on the CDN                        | today | `.vercel/output/config.json` route for `/assets/(.*)`; every chunk and font is content hashed                                                                                                                                                           |
| Every route ships only its own code                                  | after | section 7: the entry no longer imports `render`, `freeform` and `slide`; `/home` under 600 KB decoded                                                                                                                                                   |
| The dither runs in Rust compiled to wasm in your browser             | after | section 3.9 item 2; `docs/native.md` costs table: 23 ms against 52 ms per screen                                                                                                                                                                        |
| The image pipeline runs on the Rust addon in the function            | after | section 3.9 items 1 and 3; `select.ts` picks `native` when the Linux addon is in the bundle                                                                                                                                                             |
| Three implementations, identical cells                               | today | `packages/effects/src/parity.test.ts`: 0 disagreements over 1.44 million cells                                                                                                                                                                          |
| Perfect PPTX is a pixel identical raster per page from Chromium      | today | `packages/export/src/pptx`, `docs/pptx.md`: 170 pages, worst 0.003 percent decoded mismatch                                                                                                                                                             |
| Long exports run as per slide batches, merged without a browser      | today | `apps/studio/src/server/export-batch.ts`; two batches of 60 and 25 for the GT deck                                                                                                                                                                      |
| Fluid compute: instances are reused, work continues after the answer | after | Vercel's instance reuse and bytecode caching today; `waitUntil` for the thumbnail refresh and the home card render after section 3.2                                                                                                                    |
| Immutable documents by content hash                                  | today | `packages/store/src/snapshots.ts`: every committed write stores the document under the md5 of its manifest bytes                                                                                                                                        |
| Preloading: a hover starts the next route's data                     | after | `defaultPreload: 'intent'` today; the title row's mark becomes a `Link`, the home cards preload in the viewport, the presenter preloads on the split button (section 5)                                                                                 |
| Fast saves                                                           | after | local commit under 25 ms today; the Blob write four rounds after section 3.4                                                                                                                                                                            |
| A fast home page                                                     | after | section 3.1                                                                                                                                                                                                                                             |
| "Built on Rust"                                                      | never | the studio is TypeScript on React and TanStack Start; say "with a Rust core for the image pipeline"                                                                                                                                                     |
| "Instant", "realtime", "edge rendered", "global", "zero JavaScript"  | never | the function and the store are in `iad1`; a cold render is seconds; the viewer ships under 1 MB of JavaScript, not none                                                                                                                                 |

## 5. Every technique the task names, mapped

The round's task lists the techniques the plan must place. Each row names the section that carries
it, the files and the budget row that proves it.

| Technique                                                                              | Where it lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Budget row (section 8)                                             |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Route preloading on intent and viewport                                                | `apps/studio/src/router.tsx`: `defaultPreloadStaleTime` from 0 to the router's default 30 s (S5), so a hover then a click reuses the preloaded loader instead of running it again; `decks.index.tsx` cards: `preload="viewport"` on the first screen's cards (the first twelve in deck order, the rest `intent`), so the editor's loader runs while the rep reads the list; `packages/chrome/src/TitleRow.tsx:265-274`: the home mark takes a `linkComponent` prop the studio fills with the router's `Link`, so the chrome stays router free and the transition is same document; `presentActions.ts`: `router.preloadRoute` for `/present/$deckId` on pointer enter of the Slideshow arrow                                                                                                                                                                                                                                                              | transitions `decks->edit`, `edit->decks`, `home->new`              |
| Per route code splitting and lazy dialogs                                              | section 7: `EditorRoot` and the controller leave `edit.$deckId.tsx` for `apps/studio/src/editor/`; `new.tsx` and the edit route import `validateEditSearch` from `routes/-edit-search.ts` (a `-` prefixed file is not a route) and `EditorRoot` inside `component`, which the router's automatic code splitting moves to the lazy chunk (S2: route components are "not required to match the route, and can be loaded on-demand"); the presenter the same; `EditorShell.tsx` imports the twenty dialogs, the pickers, `DiagramPanel` and `SpecialCharacters` (600 characters), and `edit.$deckId.tsx` imports `SourceDrawer` (CodeMirror, through `source/editor.ts`); both take one `lazyDialog()` helper that `import()`s on first open and preloads on menu hover, the one case AGENTS.md's dynamic import rule allows; `MaterialMount.tsx` `import()`s `@turboslide/materials/mount` (the Paper Shaders library) on the first `[data-recipe]` root    | routes `js decoded`, `largest js`                                  |
| The View Transitions API for route and slide changes                                   | `router.tsx`: `defaultViewTransition: { types: ({ pathChanged }) => pathChanged ? ['route'] : [] }` (S5, S6); `packages/chrome/src/tokens.css`: `::view-transition-old(root)` fades over `--pt-dur-leave` and `::view-transition-new(root)` over `--pt-dur-enter`, which the reduced motion block already sets to 0 ms, so a person with `prefers-reduced-motion: reduce` gets the cut, no snapshot animation (the browser skips a zero duration transition); slide changes keep `SlideView.tsx`'s keyed fade (120 ms out, 180 ms in, measured 13 ms to the painted frame) and gain `view-transition-name: ts-stage` on the sheet and `ts-card-current` on the current card for the grid to slide switch, one name per element as MDN requires; React's `<ViewTransition>` is not used this round because React "will interrupt" a `document.startViewTransition` started elsewhere (react.dev, read 2026-09-13) and the router owns the route transition | transitions `slideChange`, `slideshow`, `layoutGrid`               |
| Prerender or SSR decisions per route                                                   | section 6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | routes `ttfb`, `lcp`, `ready`                                      |
| Skeletons with reserved space                                                          | section 3.5 item 2; the home page's card grid frame as the `Await` fallback (3.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | routes `cls`, `fcp`                                                |
| Font preload                                                                           | section 3.5 item 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | routes `cls`, `fcp`                                                |
| Hashed asset caching headers                                                           | `/assets/*` is immutable today; `apps/studio/vite.deploy.config.ts` gains `routeRules`: `'/decks/gt-brand/assets/**': { headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } }` (Nitro compiles header and redirect rules into the Vercel `config.json`, read 2026-09-13; the twins are not content hashed, so a year would pin a regenerated twin), `'/': { redirect: { to: '/new', statusCode: 307 } }` with the `x-robots-tag` header rule so the redirect is a CDN route and not a function call; the assets route's 302 for Blob twins carries `?v=<etag>` on the `Location` and `public, s-maxage=60, stale-while-revalidate=86400`, so the browser caches the body under a versioned URL; the contracts routes serve the bundled files with `public, max-age=300, s-maxage=86400`                                                                                                                   | twins `refetched`, routes `/` `ttfb`                               |
| A virtualized filmstrip                                                                | `packages/chrome/src/Sidebar.tsx`: every card stays in the DOM (the frame, the number, the skip glyph, about five nodes) so drag and drop, `scrollIntoView`, the keyboard walk, multi select and the tooltip audit keep working; one `IntersectionObserver` on `.ts-film` with `rootMargin: '200% 0px'` decides which cards mount their `Thumb` (the clone) and which hold the plate; `FilmCard` is wrapped in `memo` with stable props (`item` objects come from the memoized `toViewerDeck`), so a write re-renders one card, not 85; TanStack Virtual (`@tanstack/react-virtual`, a new catalog entry) is the fallback design for decks past about 300 slides and is not added this round; `GridView.tsx` takes the same observer for its tiles; the viewer's sidebar in `/deck` (6,470 nodes) takes it too                                                                                                                                            | filmstrip `nodes`, `steadyP95`, `firstPassMax`; routes `dom nodes` |
| Thumbnails in a worker or from the render route with stale while revalidate            | section 3.2 items 3 and 4: the render route with `s-maxage=60, stale-while-revalidate=86400` and `waitUntil`; a long lived render worker (the Docker image over `TURBOSLIDE_WORKER_URL`) is the design the code already supports and needs a host (Fly, Railway), which is Kevin's call; the plan does not depend on it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | write `thumbAfterSaved`, home card time                            |
| Memoized `renderSlide` per block hash                                                  | `edit.$deckId.tsx` `renderMissing`: a module level `Map<string, string>` keyed by the slide's FNV-1a stamp (the one `thumbShotFor` computes) joined with a stamp of the deck level render inputs (`deck.defaults`, the assets the slide references, the theme), capped at 256 entries, so a deck level write that changes no slide's markup (`deck.set /title`, the auto title of the first heading, a guide, a rename) re-renders none of the 85 slides where `changedBy` says `'all'` today; a single slide write is unchanged (its stamp moved); the stamp is the same trusted one the thumbnail URL uses, so a collision is the same risk as today's wrong thumbnail                                                                                                                                                                                                                                                                                  | routes `/edit` `longest animation frame`; write `textKeyToCommit`  |
| A write path that paints before the server answers and coalesces                       | section 3.4; the paint is at the local commit today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | write `newSlidePaint`, `textKeyToSaved`, `newSlideSaved`           |
| SSE or a tighter long poll for external revisions                                      | section 3.8 item 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | idle `serverFnPerMinute`                                           |
| The Blob read path with immutable caching                                              | the snapshot path exists (`pull()` step 1b, one `head` and one `get` by content name); the viewer's `getDeck` becomes a `GET` server function whose response carries `Cache-Control: public, s-maxage=60, stale-while-revalidate=3600` keyed by deck and revision (`deck.$deckId.tsx` `loaderDeps` gains the revision the shell learned from a `head`, so the CDN key names the document), and the thumbnails move to Blob under their stamp (3.2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | routes `/deck` `ttfb`, twins                                       |
| wasm dithers in the browser, the Rust napi path on the server, the TypeScript fallback | section 3.9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | no route budget; the parity test and `describeBackends`            |
| Bundle diet with the biggest chunks named                                              | section 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | routes `js decoded`, `largest js`                                  |
| Prefetching the next document                                                          | Speculation Rules on `/home` only: `<script type="speculationrules">` with `prerender` for `/new` at `eagerness: 'moderate'` (Chrome and Edge; a prerendered `/new` activates in under 100 ms instead of loading; `/new` writes nothing until an edit), guarded in the editor by `document.prerendering` and `prerenderingchange` so the session attach and the event stream start at activation, not during the prerender (Chrome for Developers, read 2026-09-13: "A page can check `document.prerendering`"); `prefetch` for `/decks` and `/deck/gt-brand` from `/home`; nowhere else, because the other navigations are same document `Link`s after this round                                                                                                                                                                                                                                                                                        | transitions `home->new`                                            |

## 6. SSR, data only or prerender, per route

| Route                       | Today                    | Decision                                                                                                                                                                                                                                                                                                                                                                   | Why                                                                                                                                                                                 |
| --------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/home` (new)               | 404                      | Prerendered at build (TanStack Start `prerender.enabled` with the page in `pages`, S10), served as a static file by the CDN; no loader; the Recent row is client only from `localStorage`; the Speculation Rules script of section 5                                                                                                                                       | Marketing copy with no per request data; the first byte becomes the CDN's                                                                                                           |
| `/`                         | 307 in the function      | A Nitro `routeRules` redirect compiled into `config.json`, with the `x-robots-tag: noindex` header rule                                                                                                                                                                                                                                                                    | The redirect needs no function                                                                                                                                                      |
| `/new`                      | `ssr: false`, no pending | `ssr: 'data-only'`, `pendingComponent: EditorSkeleton`, `pendingMinMs: 0`                                                                                                                                                                                                                                                                                                  | Section 3.5; the draft's loader is the blank template, cheap on the server; the skeleton is in the HTML                                                                             |
| `/edit/$deckId`             | `ssr: false`, no pending | `ssr: 'data-only'`, `pendingComponent: EditorSkeleton`, `pendingMinMs: 0`; the versions leave the payload                                                                                                                                                                                                                                                                  | Section 3.5                                                                                                                                                                         |
| `/present/$deckId`          | `ssr: false`, no pending | `ssr: 'data-only'`, `pendingComponent: PresenterSkeleton`, `pendingMinMs: 0`                                                                                                                                                                                                                                                                                               | Section 3.7                                                                                                                                                                         |
| `/deck/$deckId`             | SSR, 381 KB document     | SSR stays for the current slide's HTML (the link a rep sends, what a crawler and a link preview read); the other slides' HTML becomes a deferred promise rendered with `<Await>` (S8), so the document carries one slide and the rest streams behind it; the loader's `getDeck` becomes `GET` with the CDN header of section 5; the sidebar windows its clones (section 5) | First paint 376 ms cold today with the opener photograph as LCP; the 269 KB payload and 6,470 nodes are the hydration cost, which the deferred payload and the windowed sidebar cut |
| `/embed/$deckId`            | SSR                      | As `/deck`                                                                                                                                                                                                                                                                                                                                                                 | Same component                                                                                                                                                                      |
| `/decks`                    | SSR, waits for the list  | SSR with the shell streamed at once and the store list deferred (section 3.1)                                                                                                                                                                                                                                                                                              | The shell and the Recent row paint at first byte                                                                                                                                    |
| `/decks/trash`              | SSR, waits for the list  | As `/decks`                                                                                                                                                                                                                                                                                                                                                                |                                                                                                                                                                                     |
| `/print/$deckId`            | SSR                      | Unchanged                                                                                                                                                                                                                                                                                                                                                                  | One page per slide is the point of the route                                                                                                                                        |
| `/api/*`, `/mcp`, contracts | functions                | Unchanged, except the contracts serve bundled files with CDN headers (section 4)                                                                                                                                                                                                                                                                                           |                                                                                                                                                                                     |

## 7. The bundle diet, chunk by chunk

The client build of 2026-09-13 (`apps/studio/dist/client/assets`, 47 files, 2,883,002 bytes of
JavaScript) and its static import graph, read from the chunks themselves:

- `index-Bw0tvTCg.js` 1,122,594 bytes: React DOM, TanStack Router and Start client, the chrome
  (the whole `EditorShell` graph: twenty dialogs, the pickers, the menu model), `@paper-design/shaders`
  (20 GLSL literals, 73 KB of shader source, 635 `u_*` references), CodeMirror (the source
  drawer), `marked`. It statically imports `render`, `freeform`, `slide`, `decks`, `Menu`,
  `Frame`, `Tooltip`, `strings`, `link`, `preload-helper`.
- `freeform-RWS0kKXS.js` 709,434 bytes: `@turboslide/schema` with `shapes/definitions.ts`, the
  ECMA-376 preset geometry as pretty printed JSON text (528,840 bytes of source, 1,156 `lnTo`).
  Imported by `index` and by `render`.
- `render-D5MrLHnB.js` 498,513 bytes: `renderSlide`, the viewer (`Stage`, `Editor`,
  `MaterialMount`), the menu model and its strings, `@turboslide/materials/mount`'s uniform tables
  (231 `u_*`). Imported by `index` and by `DeckViewer`.
- `Frame-z3ekpyfa.js` 93,549; `slide-eHr-1Nqg.js` 63,390 (slide helpers and a second `marked`);
  `keys-BFakNpVP.js` 62,921; the two `edit._deckId` chunks of 50,698 and 50,500; `Tooltip` 48,448;
  `preload-helper` 45,428; `link` 30,216; `useStudioSession` 23,053; `decks.index` 17,206;
  `present._deckId` 11,298; `dither.worker` 9,737.

Why every route carries the editor: `routeTree.gen.ts` imports every route module; the router's
automatic code splitting moves each route's `component` into a lazy chunk (the `edit._deckId`,
`decks.index` and `present._deckId` chunks exist) but a route file's other module level code and
imports stay in the module the tree imports, and `edit.$deckId.tsx` is 3,818 lines of controller,
`EditorRoot` and shell glue with 260 lines of imports at its head; `new.tsx:13` imports that module
as a namespace for `EditorRoot`; `present.$deckId.tsx:13` imports `renderSlide` at module level.
The bundler therefore hoists the editor's graph into the entry and its shared chunks, and the
document preloads them on every route (15 `modulepreload` links on `/decks` as on `/edit`).

The diet, with the expected size after each step (estimates from the marker counts and the
package sizes; the check's `js decoded` row is the measurement):

| Step                                                                                                                                                                                                                                                                                                         | Chunks touched                                       | Expected effect                                                                                                                                                                                                                                                                                                                                                     | Owner                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Move `EditorRoot`, the controller and the shell glue to `apps/studio/src/editor/{EditorRoot,controller,shell-bridge}.tsx`; `routes/-edit-search.ts` holds `validateEditSearch` and `EditSearch`; `edit.$deckId.tsx` and `new.tsx` import `EditorRoot` inside `component` only                                | `index`, `render`, `freeform`, `edit._deckId`, `new` | The entry stops importing the editor; `/home`, `/decks`, `/deck` drop `render` and `freeform` from their preload list. The editor's own bytes move to its lazy chunk and are downloaded by `/edit` and `/new` alone                                                                                                                                                 | studio builder                 |
| Move the presenter's page and `presenterSlides` to `apps/studio/src/components/PresenterPage.tsx`, imported inside `component`                                                                                                                                                                               | `present._deckId`                                    | `renderSlide` leaves the entry                                                                                                                                                                                                                                                                                                                                      | studio builder                 |
| `shapes/definitions.ts` becomes `export const PRESET_DEFINITIONS = JSON.parse('<compact JSON>')` written by `build-definitions.mjs`, and `shapes/ids.ts` holds `SHAPE_PRESET_IDS` alone for the schema's enums and `actions.ts`                                                                              | `freeform`                                           | 528,840 bytes of pretty printed source become about 300 KB of one string; V8 parses `JSON.parse` of a large literal about 1.7 times faster than the object literal and skips the lazy parse pass (v8.dev, read 2026-09-13); the schema's validators import `ids.ts` and stop pulling the table; `renderSlide`'s shape renderer and the ShapePicker import the table | schema builder                 |
| `MaterialMount.tsx` imports `@turboslide/materials/mount` with `import()` on the first `[data-recipe]` root; `InsertMaterial.tsx` and `inspector/material.tsx` keep the catalog (data) and import `mount` the same way for their previews                                                                    | `index`, `render`; a new `materials-mount` chunk     | Paper Shaders (about 250 to 300 KB decoded, the 73 KB of GLSL included) leaves every route that shows no material; the editor fetches it when a material slide is current, about 140 ms after the editor is up today for the mount itself (baseline 7.2)                                                                                                            | viewer builder, chrome builder |
| `EditorShell.tsx` (dialogs, pickers, `DiagramPanel`, `SpecialCharacters` with its 600 characters) and `edit.$deckId.tsx` (`SourceDrawer`, CodeMirror through `source/editor.ts`, six packages) behind `lazyDialog(() => import('./dialogs/Share'))`, preloaded on menu hover                                 | `index`; new chunks per dialog group                 | CodeMirror alone is on the order of 300 KB decoded; the dialog tables tens of KB each; the first open pays a chunk fetch of tens of milliseconds warm                                                                                                                                                                                                               | chrome builder                 |
| `marked` appears in `index` and `slide`: one importer through `@turboslide/render` only                                                                                                                                                                                                                      | `index`, `slide`                                     | one copy                                                                                                                                                                                                                                                                                                                                                            | render builder                 |
| The chrome's `ViewerShell` splits its edit only imports: `Sidebar.tsx`'s filmstrip (`FilmCard`, drag, the context menu, `applyLayout`, `slide-templates`, `palette-data`) moves to `Filmstrip.tsx`, imported by `EditorShell`; the viewer's `Sidebar` keeps the rows and the tree                            | `render`, `Frame`                                    | The viewer route stops carrying the schema's `apply-layout`, `layouts`, `canvas` and `freeform` modules                                                                                                                                                                                                                                                             | chrome builder                 |
| `scripts/check-client-bundle.mjs` gains the budget: the largest chunk under 600,000 bytes, and the chunks a route's document preloads under the route's `js decoded` ceiling, read from the built `dist/client` and the SSR'd `<head>` of `/decks`, `/deck/gt-brand`, `/edit/gt-brand` served by the preview | none                                                 | The regression gate; the check step fails when the editor rejoins the entry                                                                                                                                                                                                                                                                                         | integrator                     |

Expected totals (section 8 ceilings): `/home` and `/decks` under 600 KB decoded (React DOM, the
router and Start client, the tokens, the root, the page: about 400 to 500 KB), `/deck` under 1,000
KB (plus the chrome shell and the viewer), `/present` under 1,200 KB (plus `renderSlide` and the
schema), `/edit` and `/new` under 2,000 KB (from 2,757: the shape table's 400 KB of pretty
printing gone, Paper Shaders, CodeMirror and the dialogs lazy), the largest chunk under 600,000
bytes (from 1,122,594).

Rolldown's `codeSplitting.groups` (S44, S45) is available in Vite 8 for naming the vendor group
(React, the router) so it caches across deployments while the app's chunks change; the plan uses
it for that one group and not for splitting by package, because a group boundary between the
editor and the viewer is what the import graph fix above makes on its own.

## 8. Budgets

Ceilings a check asserts, not targets a page advertises. Two profiles: `deployment` is a Vercel
preview or production reached from the check machine over a fast connection (the numbers below
are medians of three runs; the check's first run of 9.5 had one run per route), `local` is the
built studio served on this machine on 4321 with `TURBOSLIDE_STORE=tmp`. A ceiling in the
`deployment` column is set from the baseline's fast mode where the change removes a server round
trip, and from the arithmetic of section 3 where the change is structural. "Today" is the check's
first production run of 2026-09-13 (single samples; the baseline's medians where the run has none;
the second run's numbers are in 9.5).

### 8.1 Routes (cold context, then warm context)

| Route               | Metric                      | Today (cold / warm)      | Deployment ceiling (cold / warm) | Local ceiling (cold / warm) |
| ------------------- | --------------------------- | ------------------------ | -------------------------------- | --------------------------- |
| `/home`             | TTFB                        | 404                      | 150 / 100                        | 60 / 40                     |
|                     | LCP                         |                          | 800 / 400                        | 400 / 200                   |
|                     | ready (`main` in the DOM)   |                          | 800 / 400                        | 400 / 200                   |
|                     | JS decoded                  |                          | 600 KB                           | 600 KB                      |
| `/`                 | TTFB (the 307 hop included) | 104 / 85                 | 200 / 150                        | 60 / 40                     |
|                     | LCP                         | 676 / 572                | 700 / 400                        | 450 / 250                   |
|                     | ready (studio and settled)  | 583 / 544                | 700 / 400                        | 450 / 250                   |
| `/new`              | TTFB                        | 104 / 82                 | 200 / 150                        | 60 / 40                     |
|                     | FCP (the skeleton)          | 640 / 420                | 400 / 250                        | 250 / 150                   |
|                     | LCP                         | 676 / 420                | 700 / 400                        | 450 / 250                   |
|                     | ready                       | 624 / 401                | 700 / 400                        | 450 / 250                   |
|                     | JS decoded                  | 2,660 KB                 | 2,000 KB                         | 2,000 KB                    |
| `/decks`            | TTFB                        | 4,050 / 286              | 400 / 300                        | 150 / 100                   |
|                     | LCP                         | 4,308 / 408              | 1,000 / 600                      | 500 / 300                   |
|                     | ready (`data-hydrated`)     | 4,308 / 483              | 1,000 / 600                      | 500 / 300                   |
|                     | JS decoded                  | 2,675 KB                 | 600 KB                           | 600 KB                      |
| `/decks/trash`      | TTFB                        | 4,826 / 709              | 400 / 300                        | 150 / 100                   |
|                     | LCP, ready                  | 4,900 / 756; 4,979 / 848 | 1,000 / 600                      | 500 / 300                   |
|                     | JS decoded                  | 2,664 KB                 | 600 KB                           | 600 KB                      |
| `/deck/gt-brand`    | TTFB                        | 456 / 205                | 500 / 400                        | 250 / 150                   |
|                     | LCP (the opener photograph) | 592 / 340                | 600 / 400                        | 500 / 300                   |
|                     | ready (`data-settled`)      | 1,019 / 680              | 800 / 600                        | 600 / 400                   |
|                     | JS decoded                  | 2,664 KB                 | 1,000 KB                         | 1,000 KB                    |
|                     | DOM nodes                   | 6,472                    | 1,500                            | 1,500                       |
| `/edit/gt-brand`    | TTFB                        | 144 / 83                 | 200 / 150                        | 60 / 40                     |
|                     | FCP (the skeleton)          | 2,948 / 1,152            | 400 / 250                        | 250 / 150                   |
|                     | LCP                         | 2,964 / 1,176            | 1,200 / 700                      | 700 / 450                   |
|                     | ready                       | 2,922 / 1,131            | 1,200 / 700                      | 700 / 450                   |
|                     | JS decoded                  | 2,757 KB                 | 2,000 KB                         | 2,000 KB                    |
|                     | DOM nodes                   | 5,606                    | 1,500                            | 1,500                       |
| `/present/gt-brand` | TTFB                        | 153 / 136                | 200 / 150                        | 60 / 40                     |
|                     | LCP, ready                  | 1,052 / 1,020; 982 / 965 | 800 / 500                        | 500 / 300                   |
|                     | JS decoded                  | 2,670 KB                 | 1,200 KB                         | 1,200 KB                    |
| every route         | largest JS chunk            | 1,122,594 bytes          | 600,000 bytes                    | 600,000 bytes               |
|                     | longest animation frame     | 58 to 448 ms             | 150 ms                           | 150 ms                      |
|                     | CLS                         | 0.0000 to 0.0025         | 0.05                             | 0.05                        |

### 8.2 Transitions (one warm context; `Link` transitions measured in page from `pointerdown`, document navigations wall clock)

| Transition                                                   | Today                                            | Deployment ceiling | Local ceiling |
| ------------------------------------------------------------ | ------------------------------------------------ | ------------------ | ------------- |
| `decks->edit`: hover a card, click, studio ready and settled | 729 (399 scratch, 723 gt-brand in the baseline)  | 500                | 300           |
| `edit->decks`: the title row mark                            | 8,008 as a document load (491 to 4,958 baseline) | 400                | 300           |
| `trash->decks`                                               | 2 (a `Link` already)                             | 400                | 300           |
| `home->new`                                                  | absent                                           | 300                | 300           |
| `back` (history to `/decks`)                                 | 95                                               | 100                | 100           |
| `slideChange`: click the third card, the stage painted       | 13 baseline (in page surfaces)                   | 50                 | 50            |
| `slideshow`: the Slideshow button to the show painted        | 18                                               | 50                 | 50            |
| `layoutGrid`: the Layout button to the plate painted         | 15                                               | 50                 | 50            |

### 8.3 Filmstrip scroll (`/edit/gt-brand`, three passes of 18 wheel steps)

| Metric                                     | Today             | Ceiling (both profiles) |
| ------------------------------------------ | ----------------- | ----------------------- |
| First pass longest frame                   | 33 (200 baseline) | 100                     |
| Steady passes p95 frame                    | 10                | 20                      |
| Steady passes longest frame                | 17                | 50                      |
| Steady passes fps (a floor, not a ceiling) | 119 to 120        | 50                      |
| DOM nodes with 85 cards                    | 5,662             | 1,500                   |

### 8.4 Idle network (`/edit/gt-brand`, 60 s after settle)

| Metric                                | Today (baseline)                                                  | Ceiling |
| ------------------------------------- | ----------------------------------------------------------------- | ------- |
| `/_serverFn/` responses per minute    | about 700 (baseline, ten minutes); 176 in the check's 30 s window | 4       |
| `/api/events/` connections per minute | 0 (no stream yet)                                                 | 2       |

### 8.5 Twins (`/deck/gt-brand`, second visit in one context)

| Metric                                  | Today    | Ceiling |
| --------------------------------------- | -------- | ------- |
| Twins re-fetched (transfer size over 0) | 16 of 16 | 0       |

### 8.6 The write path (`--write`, against a tmp store or a preview; leaves a scratch deck)

| Metric                                                                                         | Today (baseline)         | Deployment ceiling                                 | Local ceiling |
| ---------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------- | ------------- |
| Text burst: last keyup to the local commit                                                     | 372 to 388               | 450                                                | 450           |
| Text burst: last keyup to the saved revision                                                   | 990 to 1,440             | 1,000                                              | 600           |
| Text burst: the current card's clone carries the text after the commit                         | 2,406 to 3,772 (capture) | 50                                                 | 50            |
| New slide: `pointerdown` to the painted card                                                   | 8                        | 16                                                 | 16            |
| New slide: `pointerdown` to the saved revision                                                 | 442 to 570               | 500                                                | 250           |
| Capture of the edited slide (`?w=320&r=<revision>`, the home card's form) after the save, warm | 1,175 to 4,702           | 2,500 (reported, not asserted, on a cold instance) | 2,000         |
| Home card of the scratch deck on the next `/decks` visit                                       | 5,069                    | 2,500                                              | 1,500         |

The check step's exit code is the `deployment` or `local` table; a metric with no ceiling is
reported (the fps, the LCP element, the chunk names).

## 9. The check: `scripts/perf-budget.mjs`

The design copy is `docs/gslides-parity/design-4/perf-budget.mjs` (1,115 lines, Prettier clean); the integrator moves
it to `scripts/perf-budget.mjs` unchanged apart from the root lookup, which already tries both
depths. It follows the repository's rules: `playwright-core` from the repository's `node_modules`
through `createRequire`, the Chrome for Testing binary AGENTS.md names (`TURBOSLIDE_CHROME`, then
`chromium-1217`, then `playwright-core`'s), one page at a time, the GPU flags per platform (ANGLE
on Metal on macOS, SwiftShader on Linux, AGENTS.md "Chromium"), nothing installed, no dev server
of its own, read only unless `--write`.

### 9.1 What it measures and how

The definitions are the baseline's (04 section 1.2), so the numbers compare:

- Routes: for each of `/`, `/home`, `/new`, `/decks`, `/decks/trash`, `/deck/<deck>`,
  `/edit/<deck>`, `/present/<deck>`, N fresh contexts (default 3); in each, a cold load then a warm
  load of the same address. TTFB is `responseStart` of the document request from Playwright's
  request timing (the Navigation Timing entry misreports it in this Chrome build, as the baseline
  found). FCP and LCP are the paint and LCP entries from an init script's observers. "Ready" is
  the route's landmark stamped in the page by a `MutationObserver` plus a 4 ms poll: the studio
  handle and `.pt-viewer[data-settled]` for the editor routes, the handle and `.ts-presenter` for
  the presenter, `data-settled` for the viewer, `[data-hydrated]` for the home page and the
  trash, `main` for `/home`. JS decoded and the largest chunk come from the Resource Timing
  entries (same origin, so `decodedBodySize` is exposed); the longest animation frame from the
  `long-animation-frame` observer; CLS from the `layout-shift` observer; DOM nodes from the CDP
  `Performance.getMetrics` `Nodes` value. Medians per route and kind are compared with the
  profile's ceilings; a `/home` that answers 404 is reported absent and skipped, so the check runs
  before the page exists.
- Transitions: one warm context. `/decks` primed, hover the deck's card 150 ms, click; the
  predicate is the editor's landmark with the address moved; `back` is wall clock to
  `data-hydrated`; the card again, then the title row's mark (`[data-control="title.home"]`),
  measured in page when the document survives (a marker set on `window` before the click is still
  there afterwards) and wall clock with the note "document navigation" when it does not; the
  trash's link to `/decks`; `/home` to `/new` when the page exists; then on `/edit/<deck>` the
  third filmstrip card to the stage's `data-slide-id`, the Slideshow button to `.ts-slideshow`
  painted, and the Layout button to the plate painted, each to the next animation frame after the
  predicate holds.
- Filmstrip: `/edit/<deck>`, three passes of 18 `mouse.wheel(0, ±320)` at 80 ms gaps over
  `.ts-film`, `requestAnimationFrame` timestamps recorded, fps (a floor of 50, the one floor in the
  table), median, p95 and longest frame per pass, then `Nodes`.
- Idle: `/edit/<deck>`, 5 s after settle, count `/_serverFn/` responses and `/api/events/`
  requests over `--idle-seconds` (default 60), per minute.
- Twins: `/deck/<deck>` twice in one context; on the second visit every resource under
  `/decks/<deck>/assets/` with `transferSize` over 0 counts as re-fetched.
- Write (`--write` only): `/new`, click into the heading run, type. An in-page probe
  (`__tsWriteProbe`, a 4 ms interval like the landmark recorder) stamps the last `keyup`, the local
  commit (`describe().state.revision` past the start), the moment the current card's `.pt-slide`
  carries the typed text (the clone), and the save (`serverRevision >= revision` with
  `pending === 0`, the same condition the e2e specs use). Then New slide from the toolbar
  (`toolbar.newSlide`), the card's painted frame and its save; then the edited slide's thumbnail
  (`/api/render/<slide>?deck=&theme=&w=320&r=<revision>`) requested from the check process and
  timed, with `x-turboslide-cached` and `x-vercel-cache` reported; then `/decks`, where the scratch
  deck's card thumbnail is timed from its resource entry. The scratch deck's id is printed and the
  deck is left in place, so the flag is only passed against a `tmp` store or a preview Kevin owns.

Every run writes the raw numbers with `--json <file>`; `--report` prints the table and exits 0
whatever the result, for a baseline run; `--only routes,transitions,...` selects checks; `--runs`
sets N; `--profile local|deployment` picks the ceilings of section 8.

### 9.2 Against `vite preview` in `pnpm check`

`scripts/check.mjs` gains a step after step 6 (`pnpm build` and the client bundle check):

```
TURBOSLIDE_STORE=tmp pnpm --filter @turboslide/studio preview   (port 4321, strict)
node scripts/perf-budget.mjs --base http://localhost:4321 --profile local --write --runs 3 --json .turboslide/perf-budget.json
```

The runner already knows how to start a server on 4321, wait for `isUp`, cap its log and stop it
(`scripts/check.mjs`, the `needs: 'server'` steps); the preview step reuses that with the preview
command in place of `vite dev`. `TURBOSLIDE_STORE=tmp` seeds an overlay from the checkout so
`--write` leaves its scratch deck under `/tmp/turboslide/decks` and never in `decks/`. The
`--runs 3` medians take about six minutes on this machine (the production runs of 9.5 took 86 s and
116 s for one run of four and five checks); the step is placed after the format gate so a budget failure is the last
thing the chain reports, and `--only` lets a builder run one check. If `vite preview` does not
serve the SSR routes in this TanStack Start version (unverified in this design; the app's
`preview` script exists and the integrator confirms it on the first run), the step builds with
`NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` and starts
`PORT=4321 node apps/studio/.output/server/index.mjs`, the start command `docs/hosting.md` and the
TanStack hosting guide give for the Nitro build. Either way the check measures the production
build, never the dev server.

In CI (`.github/workflows/check.yml`) the runner is `ubuntu-latest` without a GPU, so the script
passes the SwiftShader flags and the local profile applies; the run's JSON joins the uploaded
`turboslide-check` artifact. The `local` ceilings are set for this machine; if the runner is
slower by a constant factor, the integrator scales the `local` column once from the first CI
run's JSON and records the factor in the script's header.

### 9.3 Against a preview deployment

```
node scripts/perf-budget.mjs --base https://<preview>.vercel.app --profile deployment --runs 3 --json docs/gslides-parity/verification-4/perf-budget-<date>.json
```

A preview sits behind Vercel Authentication; the script reads `VERCEL_OIDC_TOKEN` from the
environment the way `scripts/hosted-smoke.mjs` does and sends it as the Trusted Sources header on
every request through the context's `extraHTTPHeaders`, never printing it. `--write` against a
preview creates a scratch deck in the preview's store; the integrator trashes and removes it
afterwards through `/decks/trash`, as the baseline did. Against production the script runs without
`--write`. The verifier records the JSON under `docs/gslides-parity/verification-4/` with the
deployment's URL and the chunk hashes, as the baseline recorded its own.

### 9.4 What the check does not measure

Field data. INP at the 75th percentile from real sessions needs `web-vitals/attribution` posted to
a log endpoint (the techniques report, 3.8 row 2); it is a small client module and a POST server
function and is not in this plan's budget table because no ceiling can be asserted in a lab run.
Lighthouse CI is not added either: the script asserts the same metrics without Lighthouse's
throttling model, and `pnpm check` already runs eight minutes.

### 9.5 The runs against production, 2026-09-13

Two runs, both `--profile deployment --runs 1 --report --json`, Chrome for Testing 147
(`chromium-1217`), 1440 by 900, Kevin's machine, one page at a time.

The first draft of the script, 21:04:33 to 21:05:59 UTC (86 s), `--only
routes,transitions,filmstrip,twins`: 44 of 95 budgets met. Its route numbers are section 8.1's
"Today" column; the rest:

- Transitions: `decks->edit` 729 ms in page (the 85 slide deck; budget 500); `back` 95 ms;
  `edit->decks` 8,008 ms as a document navigation (the list call's slow mode; budget 400);
  `trash->decks` 2 ms (a `Link`); `slideshow` 18 ms and `layoutGrid` 15 ms to the painted frame;
  `/home` absent, so `home->new` skipped.
- Filmstrip: first pass longest frame 33 ms (the baseline's 200 ms swap did not recur in this
  run), steady passes p95 10 ms, longest 17 ms, 120 fps, 5,662 nodes with 85 cards (budget 1,500).
- Twins: 16 of 16 re-fetched on the second visit (budget 0).
- The LCP element: the `H1` prompt on `/new`, the home card's `IMG` on `/decks`, the opener
  photograph on `/deck`, `/edit` and `/present`.

The final script (this design copy, after the changes of 9.6), 21:34:03 to 21:35:59 UTC (116 s),
`--only routes,transitions,filmstrip,idle,twins --idle-seconds 30`: 58 of 121 budgets met. The
second run asserts what the first did not (the warm first byte, the skeleton's FCP on `/new` and
`/edit`, the DOM count on `/deck` and `/edit`, the fps floor, the event stream count), which is why
the totals differ. Cold then warm, single samples, milliseconds:

- `/` first byte 82 / 150, LCP 584 / 964, ready 540 / 944 (the warm sample met a slow instance).
- `/new` first byte 181 / 198, LCP 604 / 456, ready 559 / 440; FCP equals LCP because nothing
  paints before the editor (the skeleton budget of 400 / 250 fails by design until 3.5 lands).
- `/decks` first byte 4,171 / 752, LCP 4,384 / 964, ready 4,315 / 1,001: both samples in the list
  call's slow mode, and a 177 ms animation frame on the warm load.
- `/decks/trash` first byte 4,018 / 284, LCP 4,080 / 328, ready 4,159 / 373.
- `/deck/gt-brand` first byte 250 / 187, LCP 376 / 260 (the opener photograph), ready 651 / 468,
  6,472 / 6,488 nodes; every timing budget met, the bytes and the node budgets not.
- `/edit/gt-brand` first byte 99 / 93, FCP 832 / 768, LCP 840 / 776, ready 813 / 748, longest
  animation frame 191 / 217 ms (over the 150 ms budget), 5,602 / 5,559 nodes.
- `/present/gt-brand` first byte 112 / 126, LCP 1,580 / 608, ready 1,517 / 574.
- JavaScript 2,660 to 2,757 KB decoded on every route; the largest chunk `index-Bw0tvTCg.js`
  1,122,594 bytes; CLS 0.0000 to 0.0024 everywhere.
- Transitions: `decks->edit` 453 ms in page (under the 500 ms budget this time; 729 in the first
  run: the loader's Blob read varies with the instance), `back` 48 ms, `edit->decks` 4,481 ms as a
  document navigation, `trash->decks` 1 ms, `slideChange` 11 ms to the painted frame (the card
  `thesis`), `slideshow` 12 ms, `layoutGrid` 12 ms; `/home` absent.
- Filmstrip: longest frame 17 ms on every pass, p95 10 ms, 119 to 120 fps (floor 50), 5,654
  nodes with 85 cards.
- Idle: 88 `/_serverFn/` responses in the 30 s window, 176 per minute (budget 4; the baseline's
  ten minute figure was about 700 per minute, so the storm's rate depends on how often the poll
  lands on an instance that does not hold the session), 0 `/api/events/` requests.
- Twins: 16 of 16 re-fetched.

The write check was not run against production (it creates a deck). Its selectors were probed
read only on `/new` the same day, with no click and no keystroke: two `[data-run]` runs in the
editor's slide, the `toolbar.newSlide` control (inside its `.split` wrapper and ahead of its
`.arrow`, which is why the script clicks the control by its exact id), one `.ts-card.is-current
.pt-slide`, the stage's `data-slide-id` (`title`), and `describe().state` with `revision`,
`serverRevision`, `pending` and `slideId`. Its first real run is the integrator's, against the
production build with `TURBOSLIDE_STORE=tmp` (9.2).

The raw JSON of both runs is in the session scratchpad (`perf4/perf-budget-prod.json`,
`perf4/perf-budget-prod-2.json`); the verifier's copies go under `verification-4/` with the runs
that follow the changes.

The failures are, in order of size, the items of section 3: the home list (3.1), the JavaScript
per route (section 7), the editor's first paint (3.5), the session poll (3.8), the twins' headers
(section 5), the DOM count (section 5, the windowed clones), the presenter (3.7).

### 9.6 What changed in the design copy after the first run

Made in `design-4/perf-budget.mjs` before the second run of 9.5:

- The section 8 ceilings replace the first draft's, with the rows the first draft did not assert:
  the warm first byte, the skeleton's FCP on `/new` and `/edit`, the DOM count on `/deck` and
  `/edit`.
- The `slideChange` transition: the third filmstrip card to the stage's `data-slide-id` and the
  card's `is-current` class, to the painted frame.
- The fps floor (`steadyFpsMin`), the one floor in the table; `assert` takes `{ floor: true }` and
  prints "floor" instead of "budget".
- The `/api/events/` count in the idle check, beside the `/_serverFn/` count.
- The write check's in-page probe (`__tsWriteProbe`: the last `keyup`, the local commit, the
  current card's clone carrying the text, the saved revision, stamped at 4 ms in the page), the
  capture probe (the render route's thumbnail at the saved revision, timed from the check process
  with its cache headers) and the home card's resource timing on the next `/decks` visit, in place
  of the `data-thumb="static"` wait, which the clone first filmstrip of 3.2 retires; the New slide
  click lands on `toolbar.newSlide` itself, not its `.split` wrapper.
- The GPU flags by platform (AGENTS.md "Chromium": `--use-gl=angle --use-angle=metal
--ignore-gpu-blocklist` on macOS, `--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader` on Linux).
- The Trusted Sources header from `VERCEL_OIDC_TOKEN` through the context's `extraHTTPHeaders`,
  as `scripts/hosted-smoke.mjs` sends it; never printed.
- The header names this plan's sections 8 and 9. The integrator moves the file to
  `scripts/perf-budget.mjs` unchanged (the root lookup already tries both depths).

## 10. Sources

Repository files read on 2026-09-13 (`/Users/kevinliu/repos/Turboslide`, `main` at `61b16e4` and
the working tree): `AGENTS.md`; `README.md`; `docs/spec/SPEC.md` sections 2 and 3;
`docs/gslides-parity/SPEC.md` section 1; `docs/gslides-parity/SPEC-2.md` section 1;
`docs/hosting.md`; `docs/hosting-chromium.md` sections 3b to 5; `docs/native.md`;
`docs/gslides-parity/research-4/03-performance-techniques.md`, `04-performance-baseline.md`,
`05-home-page-content.md` (summary); `packages/theme/**` (tree), `packages/chrome/src/tokens.css`,
`packages/effects/**` (tree, `select.ts`, `backend.ts`), `packages/materials/**` (tree, the
imports of `catalog.ts`, `recipe.ts`, `mount.ts`, `paper.ts`), `crates/turboslide-native/**`
(tree), `packages/native/**` (tree, `src/wasm.ts`); `apps/studio/vite.config.ts`,
`vite.deploy.config.ts`, `vercel.json`, `package.json`, `.vercel/output/config.json`;
`apps/studio/src/router.tsx`, `routeTree.gen.ts` (imports), `routes/__root.tsx`, `index.tsx`,
`new.tsx`, `edit.$deckId.tsx` (lines 1 to 415, 680 to 1015, 1180 to 1262, 2195 to 2330, 2600 to
2660, 2735 to 2760, 3170 to 3290), `deck.$deckId.tsx`, `embed.$deckId.tsx`, `present.$deckId.tsx`
(lines 1 to 120), `decks.index.tsx` (lines 1 to 200, 855 to 875 and the grep of its links),
`decks.trash.tsx` (lines 48 to 95), `decks.$deckId.assets.$.ts`, `api/render.$slideId.ts`;
`apps/studio/src/server/write.ts`, `thumbs.ts`, `warm.ts`, `render.ts`, `sessions.ts`, `decks.ts`
(lines 1 to 80, 180 to 260), `root.ts` (grep), `contracts.ts` (head), `hosting-plugin.ts`;
`apps/studio/src/components/useStudioSession.ts` (lines 24 to 30, 80 to 86), `DeckViewer.tsx`, `presentActions.ts`,
`Slideshow.tsx` (head); `apps/studio/src/workers/dither.worker.ts`;
`packages/chrome/src/Thumb.tsx`, `ThumbShot.tsx`, `Sidebar.tsx` (lines 1 to 120, 1200 to 1300,
1900 to 2018 and grep), `Sidebar.css` (grep), `TitleRow.tsx` (lines 250 to 285),
`ViewerShell.tsx` (imports, lines 536 to 556), `EditorShell.tsx` (imports), `ToolbarHead.tsx` (lines 260 to 285), `SourceDrawer.tsx` (imports);
`packages/viewer/src/LiveClone.tsx`, `SlideView.tsx`, `Stage.tsx`, `MaterialMount.tsx`,
`InlineText.tsx` (the burst), `theme.ts` and `dither.ts` (imports), `model.ts` (`ViewerSlide`);
`packages/render/src/slide.ts` (lines 1 to 120), `thumb.ts`, `block-css.ts` (imports),
`blocks/material.ts` (imports); `packages/store/src/blob-store.ts` (lines 1 to 120, 260 to 520,
520 to 760, 790 to 1000, 1000 to 1130), `hosted.ts` (lines 1 to 120), `watch.ts`, `blob-vercel.ts`
(`put`); `packages/schema/src/shapes/definitions.ts` (head and size), the importers of
`./shapes.ts`, `apply-layout.ts` (imports), `mutations.ts` (`Version`);
`packages/agent/src/http/sessions.ts` (lines 150 to 272); `packages/fonts/src/inter.css`;
`scripts/check.mjs` (lines 1 to 200), `check-client-bundle.mjs`; `playwright.config.ts`;
`.github/workflows/check.yml`; `pnpm-workspace.yaml`; `package.json`; `turbo.json`;
`apps/studio/dist/client/assets/*` (sizes, marker counts and the `from"./…"` import lists of
`index`, `render`, `new`, `routes`, `decks.index`, `DeckViewer`); `apps/studio/e2e/` (listing);
`decks/gt-brand/` (sizes of `deck.json`, `slides/`, `versions/`).

Web pages read on 2026-09-13:

- TanStack Router, Code splitting guide (automatic splitting of the component, error, pending and
  not-found components; "The loader is already an asynchronous boundary, so you pay double"),
  https://tanstack.com/router/latest/docs/framework/react/guide/code-splitting
- TanStack Router, `ClientOnly` component, https://tanstack.com/router/latest/docs/framework/react/api/router/clientOnlyComponent
- TanStack Start, Selective SSR (`ssr: true | false | 'data-only'`; "the server will render the
  route's `pendingComponent` as a fallback"), https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
- TanStack Router, RouterOptions (`defaultPreloadStaleTime` 30,000, `defaultPendingMs` 1,000,
  `defaultPendingMinMs` 500, `defaultViewTransition`), https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType
- TanStack Router, Preloading (intent, viewport, render; `router.preloadRoute`), https://tanstack.com/router/latest/docs/framework/react/guide/preloading
- TanStack Start, Static prerendering (`prerender.enabled`, `pages`, `crawlLinks`), https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering
- TanStack Router, Deferred data loading (`Await`, streaming of unawaited promises), https://tanstack.com/router/latest/docs/framework/react/guide/deferred-data-loading
- TanStack Start, Server routes (handlers return a `Response`), https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
- TanStack Start, Hosting (`node .output/server/index.mjs`), https://tanstack.com/start/latest/docs/framework/react/guide/hosting
- TanStack Virtual, Virtualizer API (`overscan` default 1, `getTotalSize`, `scrollToIndex`), https://tanstack.com/virtual/latest/docs/api/virtualizer
- Vercel, `@vercel/functions` (`waitUntil`: "Extends the lifetime of the request handler for the
  lifetime of the given Promise"; "Promises passed to `waitUntil()` will have the same timeout as
  the function itself"), last updated 2026-09-03, https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
- Vercel, Fluid compute (instance reuse, `waitUntil` background processing, bytecode caching on
  Node 20 and later in production, 300 s default and 800 s maximum on Pro), last updated
  2026-08-24, https://vercel.com/docs/fluid-compute
- Vercel, Streaming functions (Node.js streaming responses; duration by `maxDuration`), last
  updated 2026-09-01, https://vercel.com/docs/functions/streaming-functions
- Vercel, Using the Blob SDK (`put` options `cacheControlMaxAge` default one month and at least
  one minute, `ifMatch`, `allowOverwrite`; "it may take up to one minute for them to be fully
  removed from the Vercel CDN cache"), https://vercel.com/docs/vercel-blob/using-blob-sdk
- Nitro, Routing (route rules: `headers`, `redirect`, `cache`, `swr`, `prerender`, `isr`;
  "matched from least specific to most specific"), https://nitro.build/docs/routing
- Nitro, Vercel provider (route rule headers and redirects compiled into the output
  configuration; `vercel.functionRules`; `vercel.immutableStaticFiles` under `/_vercel/immutable/`),
  https://nitro.build/deploy/providers/vercel
- Rolldown, `OutputOptions.codeSplitting` (`groups` with `name`, `test`, `priority`, `minSize`,
  `maxSize`, `minShareCount`), https://rolldown.rs/reference/OutputOptions.codeSplitting
- V8, The cost of JavaScript in 2019 ("`JSON.parse('…')` is much faster to parse, compile, and
  execute compared to an equivalent JavaScript literal", 1.7 times in V8, for objects of 10 kB and
  more), https://v8.dev/blog/cost-of-javascript-2019
- Chrome for Developers, Prerender pages (`document.prerendering`, `prerenderingchange`,
  eagerness values, two prerenders for moderate), https://developer.chrome.com/docs/web-platform/prerender-pages
- MDN, Using the View Transition API (`document.startViewTransition`, unique
  `view-transition-name`, `@view-transition { navigation: auto }`), https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using
- MDN, `Cache-Control` (`stale-while-revalidate`, `s-maxage`, `immutable`, `must-revalidate`),
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
- MDN, Using server-sent events (`text/event-stream`, `id`, `retry`, automatic reconnection, the
  six connection limit without HTTP/2), https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- React, `<ViewTransition>` ("React automatically calls `startViewTransition` itself behind the
  scenes so you should never do that yourself"; "if you have something else on the page running a
  ViewTransition React will interrupt it"), https://react.dev/reference/react/ViewTransition
- web.dev, Best practices for fonts (preload "bypasses some of the browser's built-in content
  negotiation strategies"; `size-adjust` for the fallback), https://web.dev/articles/font-best-practices
- The techniques report's sources S1 to S57 (`research-4/03-performance-techniques.md` section 6),
  read by that report on 2026-09-13; the rows above that name an S key quote them through it.
