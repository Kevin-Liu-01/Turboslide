# Performance

The record of round four's performance plan (`docs/gslides-parity/SPEC-4.md` sections 3 and 4, the
binding changes and the budgets; `docs/gslides-parity/design-4/performance-plan.md`, the plan, "PP"
below; `research-4/03-performance-techniques.md` and `04-performance-baseline.md`, the facts). It
holds the speed story with the tense each row may be written in, the budget tables with the
numbers the verifier measured before the round started, how to run the check, and what stays for
the next round. Written by the documents builder (B5) on 2026-09-14 against the working tree after
merge 1 (`main` at `d5d7f07`, the round three ship commit and its hotfix, plus the day 0 and day 1
files of `docs/gslides-parity/build-4/`). Every number names its run and date; a row marked
"after" describes a change the round is building and is untrue until that change lands, so no page
and no document writes it in the present tense before then (SPEC-4 0.26).

Kevin's directive for the round, verbatim: "make transitions between different websites and doing
stuff in the slides so much faster and more performant". The four words "instant", "realtime",
"edge" and "lightweight", and the three word claim that the studio is built on the crate's
language, appear on no product surface and in no document as a claim (SPEC-4 0.26; this sentence
names them to forbid them).

## 1. Definitions

The definitions are `research-4/04-performance-baseline.md` section 1.2 and the header of
`scripts/perf-budget.mjs`. TTFB is `responseStart` of the document request from Playwright's
request timing. FCP and LCP are the browser's paint and largest contentful paint entries. "Ready"
is the first moment the route's landmark holds, stamped in the page by a `MutationObserver` plus
a 4 ms poll: `window.turboslide.studio` plus `.pt-viewer[data-settled]` on the editor routes, the
studio handle plus `.ts-presenter` on the presenter, `data-settled` on `/deck`, `data-hydrated` on
`/decks` and `/decks/trash`, and `main` in the DOM on `/home`. A transition is `pointerdown` to the
landmark in the page for a same document navigation and wall clock for a document navigation.
"Cold" is a fresh browser context, "warm" the same context's second load; the check compares
medians of three runs. On the `redis` realtime tier "saved" is the checkpoint (`revAck`), which the
room client stamps in `describe().state.sync`; on the memory channel of a checkout every write
after the first reaches saved at the two second checkpoint cadence (section 6). Two profiles:
`deployment` is a Vercel preview or production reached from the check machine; `local` is the
node-server build served on this machine on port 4321 with `TURBOSLIDE_STORE=tmp`.

## 2. The speed story: today, after, never

PP section 4's table, re-read on the merge 1 tree. "Today" rows may be written in the present tense
on `/home` and in the README; "after" rows only once the named change has landed on the tree the
page ships from; "never" rows are sentences no surface writes. The owner is the round four
builder key of `MILESTONES-4.md`.

| Claim                                                                                  | State on 2026-09-14 | What makes it true, and what flips an "after" row                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One renderer, one pass: a slide is one string on every surface                         | today               | `packages/render/src/slide.ts` `renderSlide`; the editor's `snap.html` map re-renders only the touched slides (`renderMissing`, now in `apps/studio/src/editor/controller.tsx`)                                                                                                                                                                                                                         |
| The filmstrip shows an edit at the next frame                                          | after               | SPEC-4 0.30, 3.2 (B4): the card is the renderer's HTML (`Thumb` `capture: 'never'`) and no capture request leaves the editor for the filmstrip. The verifier's day 0 measurement already shows the clone carrying the text 0 ms after the revision moves; the row flips when the capture requests stop                                                                                                  |
| Static contracts, served from the bundle                                               | after               | SPEC-4 3.11 (B4): `apps/studio/src/server/contracts.ts` reads `repoRoot()`, the overlay when hosted, and production answers a 236 byte placeholder for `/openapi.json` (R05 8.4, 2026-09-13); the fix imports the generated files and serves them with `public, max-age=300, s-maxage=86400`                                                                                                            |
| Hashed assets immutable for a year on the CDN                                          | today               | `.vercel/output/config.json` route for `/assets/(.*)`; every chunk and font is content hashed                                                                                                                                                                                                                                                                                                           |
| Every route ships only its own code                                                    | after               | SPEC-4 0.44, 3.12: the editor split landed at merge 1 (B3, `b3.md` section 1) and moves the editor behind the route's component importer; the shape table as one string, the lazy dialogs, the material mount and CodeMirror on first use (B4) and the chunk ceiling in `check-client-bundle.mjs` (the integrator) are still to land. The measurement is check step 31; the split alone claimed no gain |
| The dither runs in Rust compiled to wasm in your browser                               | after               | SPEC-4 0.38, 3.9 item 2 (B4): `apps/studio/src/workers/dither.worker.ts` composes the TypeScript stages today; the wasm mount with the TypeScript fallback flips the row. `docs/native.md` "Costs": 23 ms against 52 ms per 1600 by 900 screen (2026-09-10, Apple M5 Max)                                                                                                                               |
| The image pipeline runs on the Rust addon in the function                              | after               | SPEC-4 0.38 (B4): `select.ts` picks `native` when the Linux addon is in the bundle; `hosted-smoke.mjs` must report `describeBackends().selected === 'native'` on the preview before any page says so. Until then: "The hosted studio runs the TypeScript stages today."                                                                                                                                 |
| Three implementations, identical cells                                                 | today               | `packages/effects/src/parity.test.ts`: 0 disagreements over 30 screens of 360,000 cells and the 1,440,000 cell golden (`docs/native.md` "Parity results", 2026-09-10)                                                                                                                                                                                                                                   |
| Perfect PPTX is a pixel identical raster per page from Chromium                        | today               | `packages/export/src/pptx`, `docs/pptx.md`: 170 pages, worst decoded mismatch 0.003 percent, about 15.5 MiB per theme                                                                                                                                                                                                                                                                                   |
| Long exports run as per slide batches, merged without a browser                        | today               | `apps/studio/src/server/export-batch.ts`, `packages/export/src/batch/plan.ts`: two batches of 60 and 25 for the GT deck                                                                                                                                                                                                                                                                                 |
| Fluid compute: instances are reused, work continues after the answer                   | after               | Vercel's instance reuse today; `waitUntil` from `@vercel/functions` (in the catalog since day 0) for the thumbnail refresh and the home card render after SPEC-4 3.2 (B4)                                                                                                                                                                                                                               |
| Immutable documents by content hash                                                    | today               | `packages/store/src/snapshots.ts`: every committed write stores the document under the md5 of its manifest bytes                                                                                                                                                                                                                                                                                        |
| Preloading: a hover starts the next route's data                                       | after               | `defaultPreload: 'intent'` today (`apps/studio/src/router.tsx`); the title row's mark as a `Link`, the home cards on `preload="viewport"`, the presenter preloaded on the split button and `defaultPreloadStaleTime` at 30 s are B3's (SPEC-4 0.39)                                                                                                                                                     |
| Fast saves                                                                             | after               | The local commit is under 25 ms today; the Blob write in four rounds after SPEC-4 0.33 (B4). On round three the reported revision moves at the server's acknowledgement, 512 to 707 ms after the last keyup on production (section 6)                                                                                                                                                                   |
| A fast home page                                                                       | after               | SPEC-4 3.1: the `blob` tier's list from manifests (B4) and the shell streamed before the list with the Recent row from `localStorage` (B3). `/decks` first byte is bimodal on production today, 0.29 to 0.45 s or 4.7 to 7.1 s                                                                                                                                                                          |
| The studio is built on the crate's language (the three word claim SPEC-4 0.26 forbids) | never               | The studio is TypeScript on React and TanStack Start; the sentence that is true is "with a Rust core for the image pipeline" once SPEC-4 3.9 lands, and "the crate exists so three implementations light the same cells" today                                                                                                                                                                          |
| "Instant", "realtime", "edge rendered", "global", "zero JavaScript"                    | never               | The function and the store are in `iad1`; a cold render is seconds; the viewer ships under 1 MB of JavaScript once the diet lands, and more than none                                                                                                                                                                                                                                                   |

The row "Routes load before the click" on `/home` and in the README states the range a rep meets
(SPEC-4 0.26): the verifier's day 0 run on production measured the hover, click and studio ready
transition from `/decks` at 544 ms for a one slide presentation and 598 ms for the 85 slide GT deck,
warm (`verification-4/BASELINE.md` section 3.1, 2026-09-14; R04 had 399 and 723 ms on
2026-09-13). The post round numbers replace them when the verifier's day 6 run exists.

## 3. The budgets

Ceilings a check asserts; no page advertises them as targets (PP section 8). "Today" is the
verifier's day 0 re-measurement of the round three ship commit on production
(`docs/gslides-parity/verification-4/BASELINE.md`, 2026-09-14, medians of three, cold then warm),
which replaces PP 9.5's single samples of 2026-09-13; a ceiling the day 0 run already meets stays a
ceiling (BASELINE.md section 7 lists them: 58 of 121 asserted rows). The deployment and local
ceilings are SPEC-4 section 4's; the local column is set for Kevin's machine and is report only in
CI until two runs agree.

### 3.1 Routes (cold / warm)

| Route               | Metric                                                                                                                                                                        | Today, production 2026-09-14                                                                                    | Deployment ceiling                                 | Local ceiling                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `/home`             | TTFB                                                                                                                                                                          | 404 (the route did not exist)                                                                                   | 150 / 100                                          | 60 / 40                                  |
|                     | LCP; ready (`main`)                                                                                                                                                           |                                                                                                                 | 800 / 400                                          | 400 / 200                                |
|                     | JS decoded                                                                                                                                                                    |                                                                                                                 | 600 KB                                             | 600 KB                                   |
|                     | images before ready; after a full scroll                                                                                                                                      |                                                                                                                 | 500 KB; 2,000 KB                                   | the same                                 |
|                     | LCP element                                                                                                                                                                   |                                                                                                                 | the plate's text or the twin                       | the same                                 |
| `/`                 | TTFB (the 307 hop included); LCP; ready                                                                                                                                       | 95 / 91; 924 / 896; 908 / 877                                                                                   | 200 / 150; 700 / 400; 700 / 400                    | 60 / 40; 450 / 250; 450 / 250            |
| `/new`              | TTFB; FCP (the skeleton); LCP; ready                                                                                                                                          | 113 / 83; 208 / 148; 844 / 764; 823 / 750                                                                       | 200 / 150; 400 / 250; 700 / 400; 700 / 400         | 60 / 40; 250 / 150; 450 / 250; 450 / 250 |
|                     | JS decoded                                                                                                                                                                    | 3,049 KB in 20 files                                                                                            | 2,000 KB                                           | 2,000 KB                                 |
|                     | cold first byte on a fresh instance                                                                                                                                           | 1,424 (one sample, R04)                                                                                         | 1,200 (reported this round, gated from round five) | none                                     |
| `/decks`            | TTFB; LCP; ready (`data-hydrated`)                                                                                                                                            | 5,335 / 6,300; 6,072 / 6,728; 5,705 / 6,492 in the slow mode (451 / 398; 720 / 604; 687 / 574 in the fast mode) | 400 / 300; 1,000 / 600; 1,000 / 600                | 150 / 100; 500 / 300; 500 / 300          |
|                     | JS decoded; images with 20 cards                                                                                                                                              | 2,974 KB in 19 files                                                                                            | 600 KB; 1,500 KB                                   | the same                                 |
| `/decks/trash`      | TTFB; LCP; ready                                                                                                                                                              | 412 / 396; 560 / 488; 640 / 536                                                                                 | 400 / 300; 1,000 / 600                             | 150 / 100; 500 / 300                     |
| `/deck/gt-brand`    | TTFB; LCP (the opener photograph); ready (`data-settled`)                                                                                                                     | 248 / 209; 400 / 324; 560 / 452                                                                                 | 500 / 400; 600 / 400; 800 / 600                    | 250 / 150; 500 / 300; 600 / 400          |
|                     | JS decoded; DOM nodes                                                                                                                                                         | 3,055 KB in 23 files; 1,899                                                                                     | 1,000 KB; 1,500                                    | the same                                 |
| `/edit/gt-brand`    | TTFB; FCP; LCP; ready                                                                                                                                                         | 141 / 120; 516 / 180; 1,308 / 896; 1,267 / 862                                                                  | 200 / 150; 400 / 250; 1,200 / 700; 1,200 / 700     | 60 / 40; 250 / 150; 700 / 450; 700 / 450 |
|                     | JS decoded; DOM nodes                                                                                                                                                         | 3,187 KB in 21 files; 1,513 / 1,480                                                                             | 2,000 KB; 1,500                                    | the same                                 |
| `/present/gt-brand` | TTFB; LCP; ready                                                                                                                                                              | 141 / 135; 1,020 / 888; 974 / 834                                                                               | 200 / 150; 800 / 500                               | 60 / 40; 500 / 300                       |
|                     | JS decoded                                                                                                                                                                    | 3,059 KB in 21 files                                                                                            | 1,200 KB                                           | 1,200 KB                                 |
| every route         | largest JS chunk; longest animation frame; CLS                                                                                                                                | `index-D6IA9RCO.js` 1,202,643 bytes; 59 to 321 ms; 0.0000 to 0.0021                                             | 600,000 bytes; 150 ms; 0.05                        | the same                                 |
| the icon set        | `x-vercel-cache` on the second request of `/favicon.ico`, `/icon.svg`, `/apple-touch-icon.png`, `/manifest.webmanifest`, `/icons/icon-512.png`, `/og/turboslide.png`, `/home` | every path a function 404 with `MISS` (the integrator's day 0 read, 2026-09-14 14:37 UTC)                       | `HIT`                                              | not measured locally                     |

Against R04 (2026-09-13, the round two build): JavaScript grew from 2,660 to 2,757 KB decoded to
3,049 to 3,187 KB in 19 to 23 files; the largest chunk from 1,122,594 to 1,202,643 bytes;
`dither-key-3-G63s7k.js` (737,517 bytes) joined every route's preload set (the verifier's finding
2, for this document). DOM nodes fell from 6,472 to 1,899 on `/deck` and from 5,606 to 1,513 on
`/edit`. The round three skeleton puts the title row on screen at 120 to 280 ms on the `ssr: false`
routes and FCP on `/new` moved from 640 to 208 ms cold, while the studio handle and `data-settled`
still land at 740 to 870 ms because the shell waits for the loader and the room. With the network
taken out (the local vite preview, a 2 ms shell) the `ssr: false` routes still take 650 to 725 ms to
ready: the browser parsing and running 3.0 to 3.2 MB of JavaScript, the floor every deployment
number sits on.

### 3.2 Transitions (one warm context; `Link` transitions in page from `pointerdown`, document navigations wall clock)

| Transition                                                      | Today, production 2026-09-14                           | Deployment ceiling | Local ceiling |
| --------------------------------------------------------------- | ------------------------------------------------------ | ------------------ | ------------- |
| `decks->edit`: hover a card, click, studio ready and settled    | 598 (gt-brand), 544 (a one slide scratch deck)         | 500                | 300           |
| `edit->decks`: the title row mark                               | 1,114 as a document load (6,358 in the slow list mode) | 400                | 300           |
| `trash->decks`                                                  | 4                                                      | 400                | 300           |
| `home->new`                                                     | absent (`/home` was 404)                               | 300                | 300           |
| `back` (history to `/decks`)                                    | 18                                                     | 100                | 100           |
| `slideChange`; `slideshow`; `layoutGrid` (to the painted frame) | 14; 18; 11                                             | 50                 | 50            |

### 3.3 Filmstrip scroll (`/edit/gt-brand`, three passes of 18 wheel steps)

| Metric                      | Today, production 2026-09-14       | Ceiling |
| --------------------------- | ---------------------------------- | ------- |
| First pass longest frame    | 16.9 ms                            | 100 ms  |
| Steady passes p95           | 10.1 ms                            | 20 ms   |
| Steady passes longest frame | 17.6 ms                            | 50 ms   |
| Frames per second, floor    | 118.5 to 119.9                     | 50      |
| DOM nodes with 85 cards     | 4,921 (1,218 on the local preview) | 1,500   |

Every filmstrip row except the node count is met today; the node count is B4's windowed filmstrip
(SPEC-4 0.41).

### 3.4 Idle network (`/edit/gt-brand`, 60 s after a 5 s settle)

`/_serverFn/` responses per minute: ceiling 4; today 3 or 465, because the session poll is bimodal
(a poll that reaches the instance holding the session is held 20 s, one that does not returns at
once; both modes happened within eight minutes on 2026-09-14). Stream connections
(`/api/decks/*/stream`) per minute: ceiling 2; today 0 new connections inside the window, the
stream having opened during the settle and held through it (2 connections in a 79 s editor
session). The check's pattern is `/api/decks/[^/?]+/stream` since day 0 (SPEC-4 4.4).

### 3.5 Twins (`/deck/gt-brand`, second visit in one context)

Ceiling 0 twins re-fetched with `transferSize` over 0; today 2 of 2 on production, both a 304
revalidation of 300 bytes with `decodedBodySize` 0 (R04 counted 16 twins; the round three viewer
loads 2 at the opener). The verifier asked that the check count a transfer above the header size
as a re-fetch, or that the assets route send an immutable `Cache-Control`; SPEC-4 1.6's
`routeRules` entry for `/decks/gt-brand/assets/**` (an hour in the browser, a day of `s-maxage`, a
week stale; B3) meets the row on the deployment profile for the right reason.

### 3.6 The write path (`--write`, against the tmp store or a preview Kevin owns; leaves a scratch deck)

| Metric                                                                 | Today (production 2026-09-14; R04 in brackets)                   | Deployment ceiling                  | Local ceiling |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- | ------------- |
| Text burst: last keyup to the local commit                             | see section 6 (372 to 388)                                       | 450                                 | 450           |
| Text burst: last keyup to the saved revision                           | 1,439 to 2,001 (990 to 1,440)                                    | 1,000                               | 600           |
| Text burst: the current card's clone carries the text after the commit | 0 (2,406 to 3,772, a capture)                                    | 50                                  | 50            |
| New slide: `pointerdown` to the painted card; to the saved revision    | 5 painted at 6; 1,039 (8; 442 to 570)                            | 16; 500                             | 16; 250       |
| Capture of the edited slide (`?w=320&r=`) after the save, warm         | 125 to 130 after the first, 4,331 for the first (1,175 to 4,702) | 2,500 (reported on a cold instance) | 2,000         |
| Home card of the scratch deck on the next `/decks` visit               | 1,502 (5,069)                                                    | 2,500                               | 1,500         |

### 3.7 The rows added this round

Image bytes per route (SPEC-4 0.28: `/home` under 500 KB before ready and 2,000 KB after a full
scroll; `/decks` under 1,500 KB with 20 cards; the other routes reported); the icon set's CDN hits
(the last row of 3.1); the cold first byte of `/new` and `/decks` on a fresh instance (reported);
the LCP element of `/home` (asserted: the LCP entry's URL under `/brand/` or its element one of
`H1`, `H2`, `P`, `SPAN`, `A`, `STRONG`, `EM`); each function directory's size against the 250 MB
cap and `peakMb` of the batched merge from `hosted-smoke.mjs --export-batch` (reported);
`/api/vitals` reserved for field INP with no ceiling. The per deck card row waits for round five
with its route.

## 4. Running the check

`scripts/perf-budget.mjs` is check step 31 (`node scripts/check.mjs --only 31`; `pnpm check`
runs 31 steps and `node scripts/check.mjs --list` prints them). The runner builds the node-server
output, starts it on 4321 with the tmp store, runs the script with `--write`, and stops the server
after the step; it fails when something already answers on 4321. Until merge 2 the step is a gated
stub: `TURBOSLIDE_CHECK_PERF=1 node scripts/check.mjs --only 31` runs it, and the integrator
removes the gate at merge 2. The same path by hand:

```
NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy
TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_RATE_LIMIT=off TURBOSLIDE_SESSION_SECRET=<fake, 32 characters or more> TURBOSLIDE_DOWNLOAD_SECRET=<fake, 16 bytes or more> PORT=4321 node apps/studio/.output/server/index.mjs
node scripts/perf-budget.mjs --base http://localhost:4321 --profile local --write --runs 3 --json .turboslide/perf-budget.json
```

Two facts about that server (the integrator's day 0, `build-4/integrator.md` 6.2; the verifier's
day 0, BASELINE.md section 1): the round three identity runtime refuses every request with a 500
when `TURBOSLIDE_SESSION_SECRET` is unset, because a tmp store has no state folder to mint the
secret from, and the tmp store's export tokens need `TURBOSLIDE_DOWNLOAD_SECRET` beside it, so
both are set to obviously fake values the way `playwright.config.ts` sets them for its own server
(`docs/hosting.md` section 11 allows a fake value on a checkout); and the build is the node-server
Nitro output, never `vite preview` and never the dev server, because the dev server measures
nothing (the verifier's day 0 local numbers came from `vite preview` of an existing `dist/` and are
labelled so).

The options: `--base <origin>` (required); `--profile local|deployment`; `--deck <id>` (gt-brand);
`--runs <n>` (3; cold and warm samples per route, medians compared); `--only <checks>` with
`routes`, `transitions`, `filmstrip`, `idle`, `twins`, `cdn`, `vitals` and `write`;
`--idle-seconds <n>` (60); `--write` (the write path on `/new`: a scratch deck is created and left
in place, so pass it only against a tmp store or a preview you own; the id is printed and the
integrator trashes and removes it afterwards through `/decks/trash`); `--json <file>` (the raw
numbers); `--report` (print the table and exit 0 whatever the result, for a baseline run);
`--chrome <path>` (else `TURBOSLIDE_CHROME`, else the `chromium-1217` build AGENTS.md names). The
browser takes the GPU flags AGENTS.md "Chromium" names per platform, ANGLE on Metal on macOS and
SwiftShader on Linux, so shader materials render as they do for a person. In CI
(`.github/workflows/check.yml`, `ubuntu-latest`) the runner adds `--report` until two runs agree;
the integrator then records the runner's scaling factor in the script's header, which reads "not
yet recorded" on 2026-09-14.

Against a preview deployment (the verifier's day 6 run, SPEC-4 6.3):

```
node scripts/perf-budget.mjs --base https://<preview>.vercel.app --profile deployment --runs 3 --json docs/gslides-parity/verification-4/perf-budget-<date>.json
```

A preview sits behind Vercel Authentication, so the script reads `VERCEL_OIDC_TOKEN` from the
environment (`vercel env pull`, never printed or committed) and sends it as the Trusted Sources
header on every request, the way `scripts/hosted-smoke.mjs` does. `--write` against a preview runs
once and the integrator removes the scratch deck; against production the script runs without
`--write`. The check does not measure field data or run Lighthouse (PP 9.4); Lighthouse's LCP
element is a recorded cross check in the verifier's artefacts.

Beside step 31: step 30 (`NITRO_PRESET=vercel pnpm --filter @turboslide/studio build:deploy &&
node scripts/check-vercel-output.mjs`) asserts what the Vercel build wrote: one route per
`routeRules` header rule of SPEC-4 1.6 and the `/` redirect with its `x-robots-tag` header in
`config.json`, every file of the icon set and the prerendered `/home` under `static/`, and each
function directory's size against the 250 MB cap (a report line this round; the 200 MB gate is
round five's). It runs on a machine linked to the Vercel project once `brand-manifest.json`
exists, or with `TURBOSLIDE_CHECK_VERCEL=1`; `TURBOSLIDE_CHECK_VERCEL=0` skips it on a linked
machine, and CI skips it. On the 2026-09-11 output, before the round, four function directories
measured 146.6 MB each.

## 5. The bundle diet

The client build of 2026-09-13 carried 2,883,002 bytes of JavaScript in 47 files, and every route
preloaded the editor: `routeTree.gen.ts` imports every route module, the router's automatic code
splitting moves a route's `component` into a lazy chunk, and everything else at a route file's
module level stays in the module the tree imports. `edit.$deckId.tsx` was 5,334 lines of
controller, `EditorRoot` and shell glue on `d5d7f07`, `new.tsx` imported that module as a
namespace, and `present.$deckId.tsx` imported `renderSlide` at module level (PP section 7). The
diet, with its state on 2026-09-14 (SPEC-4 0.44, 3.12):

| Step                                                                                                                                                                                          | Chunks touched                                       | Owner          | State                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EditorRoot`, the controller and the shell glue to `apps/studio/src/editor/`; `routes/-edit-search.ts` holds `validateEditSearch`; the two route files import `EditorRoot` inside `component` | `index`, `render`, `freeform`, `edit._deckId`, `new` | B3             | landed at merge 1: 82 units moved verbatim, the route file at 89 lines, the reference modules no longer import the editor (`b3.md` 1.2); no measurement claimed |
| The presenter page to `apps/studio/src/components/PresenterPage.tsx`, imported inside `component`                                                                                             | `present._deckId`                                    | B3             | day 3; the file appeared in the working tree on 2026-09-14 while this document was written, unrecorded in `b3.md` at that point                                 |
| `shapes/definitions.ts` as `JSON.parse` of one compact string written by `build-definitions.mjs`, `shapes/ids.ts` beside it                                                                   | `freeform`                                           | B4             | day 4; 528,840 bytes of pretty printed source become about 300 KB of one string                                                                                 |
| `MaterialMount.tsx` imports `@turboslide/materials/mount` with `import()` on the first `[data-recipe]` root; the previews the same                                                            | `index`, `render`; a `materials-mount` chunk         | B4             | day 4; Paper Shaders (about 250 to 300 KB decoded with 73 KB of GLSL) leave every route that shows no material                                                  |
| The dialogs, the pickers, `DiagramPanel`, `SpecialCharacters` and `SourceDrawer` (CodeMirror) behind one `lazyDialog()` helper, preloaded on menu hover                                       | `index`; chunks per dialog group                     | B4             | day 4                                                                                                                                                           |
| One `marked` importer                                                                                                                                                                         | `index`, `slide`                                     | B4             | day 4                                                                                                                                                           |
| `Sidebar.tsx`'s filmstrip to `Filmstrip.tsx`, imported by `EditorShell`                                                                                                                       | `render`, `Frame`                                    | B4             | day 2; `Filmstrip.tsx` and `Filmstrip.css` appeared in the working tree on 2026-09-14 while this document was written, before any `b4.md` note                  |
| `check-client-bundle.mjs`: the largest chunk under 600,000 bytes and the chunks a route's document preloads under the route's ceiling                                                         | none                                                 | the integrator | merge 2                                                                                                                                                         |

`import()` is allowed in the browser graph in the four places AGENTS.md names and nowhere else;
at merge 1 the client code carried none. Expected totals once every row lands (ceilings, not
promises): `/home` and `/decks` under 600 KB, `/deck` under 1,000 KB, `/present` under 1,200 KB,
`/edit` and `/new` under 2,000 KB, the largest chunk under 600,000 bytes; measured on the day 0
tree 2,974 to 3,187 KB and 1,202,643 bytes.

## 6. Two definitions that moved in round three

Recorded by the verifier (BASELINE.md section 5) and open on the check at merge 1
(`build-4/verifier.md`, requests 1 to 4 to the integrator):

- "Last keyup to the local commit" (3.6, row 1). R04 stamped `describe().state.revision` moving,
  which on the round two build happened in the reducer after the 400 ms burst timer. On round three
  the reported revision is `reportedRevision()` (`apps/studio/src/editor/controller.tsx`), the
  largest of the room client's revision, `serverRevision` and the document's, and the room client
  moves it when `POST /api/decks/<id>/ops` answers or a checkpoint or hello arrives; the stamp
  therefore measures the first server acknowledgement (512 to 707 ms on production, 2.0 s on the
  memory channel), and the row's 450 ms ceiling needs a page side stamp of the reducer (the
  current card's clone carrying the text, or `describe().state.sync.pending` rising) before it
  means what R04 meant. The reducer's own work shows in the clone column (0 ms) and the painted
  frame after a drop (4 to 7 ms).
- "Saved" on the memory channel. Every write after the first reaches `serverRevision >= revision`
  at 2.02 to 2.09 s on `TURBOSLIDE_STORE=tmp`, the checkpointer's cadence, so the local ceilings of
  600 ms for a text burst and 250 ms for a new slide fail by construction on that tier until the
  check reads the acknowledgement there, the row carries the cadence, or the cadence changes (the
  integrator's decision with B4).

Two more facts the check meets on the tmp tier: the hosting banner ("Edits are kept on this
server instance only", `position: fixed` under the bar, no dismiss control) covers the toolbar's
Layout button so a pointer click on `toolbar.layout` times out and the transitions check dies
without a JSON (the verifier hid it with a style tag for the pointer steps); and a twin's 304
revalidation counts as a re-fetch (3.5).

## 7. The measured baseline of 2026-09-14, in short

From `verification-4/BASELINE.md`, the numbers a reader of this round should hold beside every
gain a builder claims (every builder re-baselines the numbers it changes on the current tree
before claiming one; the orchestrator's ruling 4):

- Production serves 3,049 to 3,187 KB of decoded JavaScript in 19 to 23 files on every route, with
  `index-D6IA9RCO.js` at 1,202,643 bytes; one Inter face (717 KB over the wire) loads on every cold
  route; CSS is 214 KB decoded.
- `/new` is ready at 823 ms cold and 750 ms warm on production, 672 and 648 on the local preview;
  FCP is 208 ms cold on production because of the round three skeleton.
- `/decks` first byte is bimodal at the server: 0.29 to 0.45 s or 4.7 to 7.1 s, in three runs and in
  `curl`; the list call syncs every deck on the store on every request (17 cards).
- `/deck/gt-brand` is ready at 560 ms cold on production and 225 ms locally; the difference is the
  SSR render of the 394 KB payload.
- The filmstrip scrolls at 118 to 120 fps with a longest frame of 17.6 ms and holds 4,921 DOM nodes
  with 85 cards on production (1,218 on the local preview with the same build).
- A text edit reaches the saved revision 1.4 to 2.0 s after the last keyup on production; the
  clone carries the text 0 ms after the revision moves; a dropped object is painted 4 to 6 ms after
  `pointerup`; the first thumbnail of a new deck arrives 4.3 s after the save, later edits' in
  125 to 130 ms; a duplicated slide's thumbnail did not arrive within 45 s in either session.
- `edit->decks` through the title row's mark is a document load: 1,114 ms wall clock in the fast
  list mode and 6,358 in the slow one.
- Every icon path, `/og/turboslide.png` and `/home` answered a function 404 with `x-vercel-cache:
MISS`.
- Two stalls of `/edit/gt-brand` past 120 s inside one eight minute window (the title row and
  skeleton up, the studio handle never arriving); the next load was ready in 2.4 s.

## 8. What stays for round five

In the order of SPEC-4 section 7, recorded here without naming a round on any product surface:
the live monochrome hero after the shader split and a second measurement under the 600 KB
ceiling; the per deck card with `s-maxage` per revision and a budget row; the 320 px twin variant
for the filmstrip's clones (a 200 px clone decodes 1600 px twins today); the deck index
`decks/index.json` on the `blob` tier past about 50 decks; a long lived render worker on a host
over `TURBOSLIDE_WORKER_URL`, and Chromium out of the secret holding function; field INP through
`web-vitals/attribution` posted to `/api/vitals`, and Lighthouse CI; the gate on the cold first
byte and the function directory sizes (reported this round); the round three `ditherPicture`
patterns (`bayer4`, `blue64`, `random`, strength) in the crate so the wasm worker covers them;
splitting the base function's Chromium package (Nitro's `traceDeps` is one list per deployment);
React's `<ViewTransition>` once the router and React agree on who starts a transition; and
everything `docs/gslides-parity/SPEC-3.md` section 17 lists.

## 9. Sources

- `docs/gslides-parity/SPEC-4.md` sections 0.26 to 0.47, 3 and 4; `MILESTONES-4.md`; the
  orchestrator's rulings recorded in `build-4/integrator.md` section 7 item 8.
- `docs/gslides-parity/design-4/performance-plan.md` sections 4, 7, 8 and 9.
- `docs/gslides-parity/research-4/04-performance-baseline.md` (R04, 2026-09-13) through the
  verifier's re-measurement; `05-home-page-content.md` sections 6.6, 8 and 9.
- `docs/gslides-parity/verification-4/BASELINE.md`, `baseline-2026-09-14.json`,
  `perf-budget-baseline-2026-09-14.json` and `perf-budget-local-2026-09-14.json` (the verifier,
  2026-09-14); `build-4/verifier.md` (the requests).
- `docs/gslides-parity/build-4/integrator.md` sections 4, 6, 7 and 13 (the moved script, the
  day 0 mirror of step 31, the gates of steps 30 and 31); `b3.md` sections 1 and 2 (the split).
- `scripts/perf-budget.mjs`, `scripts/check-vercel-output.mjs`, `scripts/check.mjs --list` on the
  tree of 2026-09-14; `docs/native.md` "Costs" and "Parity results" (2026-09-10).
