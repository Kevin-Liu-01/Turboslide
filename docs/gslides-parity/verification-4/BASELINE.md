# Round four day 0 baseline, 2026-09-14

The verifier's re-measurement of research-4/04 (R04) and PP 9.5 on the round three ship commit
`d5d7f07` before any round four builder started (SPEC-4 0.1 and 6.3; MILESTONES-4 "Verifier"
item 1). Every number below was taken today from Kevin's machine (Apple M5 Max, macOS 26.4, Node
24.13.0, playwright-core 1.62.1 driving Chrome for Testing 147.0.7727.15 from `chromium-1217` with
`--use-gl=angle --use-angle=metal --ignore-gpu-blocklist`, headless, 1440 by 900) over a connection
`networkQuality -s` rated 857.6 Mbps down, 808.2 Mbps up, 13.6 ms idle latency. The raw numbers are
in `baseline-2026-09-14.json` beside this file; the perf-budget runs are
`perf-budget-baseline-2026-09-14.json` (production) and `perf-budget-local-2026-09-14.json` (the
local preview), each with its printed table in the `.log` of the same name.

Definitions are R04 section 1.2 and the header of `design-4/perf-budget.mjs`: TTFB is
`responseStart` of the document request from Playwright's request timing; "ready" is
`window.turboslide.studio` plus `.pt-viewer[data-settled]` on the editor routes, the studio handle
plus `.ts-presenter` on the presenter, `data-settled` on `/deck`, `data-hydrated` on `/decks` and
`/decks/trash`; cold is a fresh context, warm the same context's second load; medians of three
with the range in parentheses. Round three changed one definition, recorded in section 5.

## 1. What was measured against

| Target        | Facts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production    | `https://turboslide.vercel.app`, deployment `dpl_C7gyjio633CawQxtdxDfYkGV9T55` (`turboslide-k38hov0ve-kl01s-projects.vercel.app`, target production, created 2026-09-14 07:14:40 PDT, five seconds after `d5d7f07` was committed). Every `x-vercel-id` read `sfo1::iad1::…`. The document shell of `/new` is 29,960 bytes and preloads `index-D6IA9RCO.js`, `render-DV1uNm6o.js`, `dither-key-3-G63s7k.js`, `Frame-B_4Pg7lW.js`; `/home` and `/favicon.ico` answer 404.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Local preview | `apps/studio/dist` (built 2026-09-14 05:23, its client chunks byte for byte the hashes production serves) served by `node_modules/.bin/vite preview --port 4346 --strictPort` from `apps/studio` with `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_MAIL=capture` and the placeholder session and download secrets `playwright.config.ts` uses. `vite preview` does serve the SSR routes of this build (an open fact in MILESTONES-4 "Verifier" item 3): without `TURBOSLIDE_SESSION_SECRET` every route answers 500 (`sessionSecret` in `secret-*.js`), with it `/new` answers 200 in 389 ms and `/decks` 200 in 113 ms, and the tmp store seeds itself from the checkout (`seed directory:…/decks: 0 document files written, 194 present`). No `.output` node-server build exists on the tree and none was built (the rules forbid a build outside `scripts/check.mjs`), so the `local` profile below is the vite preview, not step 31's node server. |
| PP 9.5 files  | `perf-budget-prod.json` sha256 `c510519472f1d870fa5a7bdd1371e7532702b0af80a1c7e8ac104a19fcc0adca` and `perf-budget-prod-2.json` `047fbf25fc714a3f843e2929d73a1bfa83f4fd6dbbab938c23d9300f2f4c6091`, both verified with `shasum -a 256` against SPEC-4 0.49.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Commands run, in order, one browser page at a time:

1. `node docs/gslides-parity/design-4/perf-budget.mjs --base https://turboslide.vercel.app --profile deployment --runs 3 --report --json docs/gslides-parity/verification-4/perf-budget-baseline-2026-09-14.json` (14:30:49 to 14:34:32 UTC; 58 of 121 budgets met; exit 0 under `--report`).
2. The verifier's harness (`scratchpad/verify4/harness.mjs`, R04's page recorder): `routes --runs 3`, `extras`, `editor`, `material`, `idle --seconds 60`, `cleanup` against production, then the same against `http://localhost:4346`.
3. `perf-budget.mjs --base http://localhost:4346 --profile local --runs 3 --report --write` (the first run died in the transitions check, section 6 item 7; the JSON is the re-run with `--only routes,filmstrip,idle,twins,write`).

## 2. Production routes

### 2.1 The perf-budget run (medians of three, cold then warm)

| Route               | TTFB                                                           | FCP           | LCP (element)                                       | ready                                                      | JS decoded, files, wire cold | largest chunk                   | longest frame | CLS    | DOM nodes     |
| ------------------- | -------------------------------------------------------------- | ------------- | --------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- | ------------------------------- | ------------- | ------ | ------------- |
| `/` (307 to `/new`) | 95 / 91                                                        | 300 / 280     | 924 / 896                                           | 908 / 877                                                  | 3,049 KB, 20, 854 KB         | `index-D6IA9RCO.js` 1,202,643 B | 67 / 59       | 0.0000 | 665           |
| `/home`             | 404                                                            |               |                                                     |                                                            |                              |                                 |               |        |               |
| `/new`              | 113 / 83                                                       | 208 / 148     | 844 / 764                                           | 823 / 750                                                  | 3,049 KB, 20, 854 KB         | the same                        | 67 / 60       | 0.0000 | 665           |
| `/decks`            | 5,335 / 6,300 (samples 5,887, 5,335, 832; 6,300, 7,126, 5,304) | 5,644 / 6,420 | 6,072 / 6,728 (`P.ts-recent-lead` cold, `IMG` warm) | 5,705 / 6,492                                              | 2,974 KB, 19, 827 KB         | the same                        | 152 / 85      | 0.0000 | 350           |
| `/decks/trash`      | 412 / 396                                                      | 524 / 480     | 560 / 488 (`IMG`)                                   | 640 / 536                                                  | 2,962 KB, 19, 823 KB         | the same                        | 85 / 59       | 0.0000 | 105           |
| `/deck/gt-brand`    | 248 / 209                                                      | 376 / 300     | 400 / 324 (`IMG`, the opener photograph)            | 560 / 452                                                  | 3,055 KB, 23, 858 KB         | the same                        | 99 / 61       | 0.0021 | 1,899 / 1,897 |
| `/edit/gt-brand`    | 141 / 120                                                      | 516 / 180     | 1,308 / 896 (`IMG`)                                 | 1,267 / 862 (samples 1,014, 1,303, 1,267; 1,047, 862, 812) | 3,187 KB, 21, 903 KB         | the same                        | 321 / 100     | 0.0000 | 1,513 / 1,480 |
| `/present/gt-brand` | 141 / 135                                                      | 996 / 852     | 1,020 / 888 (`IMG.opener-img`)                      | 974 / 834 (warm samples 781, 1,621, 834)                   | 3,059 KB, 21, 859 KB         | the same                        | 63 / 60       | 0.0000 | 412           |

Against R04 (2026-09-13, the round two build): JavaScript grew from 2,660 to 2,757 KB decoded to
3,049 to 3,187 KB and from 16 to 18 files to 19 to 23; the largest chunk grew from 1,122,594 to
1,202,643 bytes; DOM nodes fell from 6,472 to 1,899 on `/deck` and from 5,606 to 1,513 on `/edit`;
`/decks` is still bimodal at the server (section 2.2); `/new` ready moved from 908 / 389 to
823 / 750 (the warm figure rose because the round three shell now waits for the room, section 5).

### 2.2 The harness pass (the R04 columns: route DOM, studio handle, settled, requests)

| Route                    | TTFB               | FCP   | LCP                    | route DOM            | studio | settled or hydrated | ready (range)          | requests until ready (total at +1.2 s) | server fn calls | HTML wire / decoded | images                                           | heap    |
| ------------------------ | ------------------ | ----- | ---------------------- | -------------------- | ------ | ------------------- | ---------------------- | -------------------------------------- | --------------- | ------------------- | ------------------------------------------------ | ------- |
| `/` cold                 | 97 (95 to 116)     | 300   | 948 (924 to 1,028)     | `.ts-title-row` 280  | 920    | 926                 | 926 (903 to 998)       | 36 (45)                                | 9               | 8,524 / 29,960      | 0                                                | 16.1 MB |
| `/` warm                 | 90                 | 228   | 832                    | 195                  | 809    | 815                 | 815 (811 to 836)       | 36 (41)                                | 5               |                     | 0                                                |         |
| `/new` cold              | 112                | 224   | 860 (836 to 948)       | 208                  | 837    | 842                 | 842 (817 to 930)       | 35 (40)                                | 5               | 8,546 / 29,960      | 0                                                | 16.1 MB |
| `/new` warm              | 91                 | 148   | 768                    | 119                  | 742    | 748                 | 748 (732 to 765)       | 35 (53)                                | 18              |                     | 0                                                |         |
| `/decks` cold            | 451 (451 to 4,725) | 612   | 720 (660 to 4,948)     | `.ts-home-page` 595  |        | 687                 | 687 (635 to 4,919)     | 49 (50)                                | 0               | 12,191 / 54,538     | 16 thumbnails, 238 KB, all `x-vercel-cache: HIT` | 12.4 MB |
| `/decks` warm            | 398 (290 to 4,799) | 512   | 604 (468 to 5,004)     | 493                  |        | 574                 | 574 (444 to 4,979)     | 49 (50)                                | 0               |                     | 16, 0 KB                                         |         |
| `/decks/trash` cold      | 348 (323 to 671)   | 676   | 752 (508 to 804)       | `.ts-trash-page` 656 |        | 748                 | 748 (500 to 857)       | 34 (35)                                | 0               | 10,002 / 32,840     | 1, 6 KB                                          | 11.3 MB |
| `/decks/trash` warm      | 399                | 484   | 504                    | 470                  |        | 544                 | 544 (398 to 574)       | 34 (35)                                | 0               |                     |                                                  |         |
| `/deck/gt-brand` cold    | 324 (321 to 400)   | 524   | 524 (444 to 580)       | `.pt-viewer` 501     | 668    | 691                 | 691 (581 to 702)       | 38 (41)                                | 1               | 70,721 / 393,680    | 2, 730 KB                                        | 14.5 MB |
| `/deck/gt-brand` warm    | 269 (216 to 283)   | 324   | 376 (308 to 400)       | 293                  | 486    | 506                 | 506 (402 to 569)       | 37 (41)                                | 1               |                     | 2, 1 KB                                          |         |
| `/edit/gt-brand` cold    | 119 (103 to 120)   | 208   | 924 (900 to 2,756)     | `.ts-title-row` 190  | 860    | 871                 | 871 (862 to 2,714)     | 36 (55)                                | 8               | 8,560 / 30,046      | 8, 787 KB (6 render requests, 6 HITs)            | 19.9 MB |
| `/edit/gt-brand` warm    | 89 (82 to 124)     | 176   | 880 (852 to 980)       | 150                  | 830    | 842                 | 842 (819 to 944)       | 36 (55)                                | 8               |                     | 8, 1 KB                                          |         |
| `/present/gt-brand` cold | 150 (146 to 182)   | 1,132 | 1,168 (1,128 to 1,380) | `.ts-presenter` 280  | 1,103  |                     | 1,103 (1,069 to 1,311) | 37 (42)                                | 3               | 8,447 / 29,810      | 1, 503 KB                                        | 14.1 MB |
| `/present/gt-brand` warm | 92 (92 to 152)     | 992   | 1,008 (888 to 1,220)   | 142                  | 966    |                     | 966 (839 to 1,169)     | 37 (42)                                | 3               |                     | 1, 0 KB                                          |         |

Reading the two tables together:

- The round three skeleton puts the title row on screen at 120 to 280 ms on the `ssr: false`
  routes (R04 had nothing until the whole bundle ran), and FCP moved from 640 to 208 ms cold on
  `/new`; the studio handle and `data-settled` still land at 740 to 870 ms because the shell waits
  for the loader and the room. The first static thumbnail on `/edit/gt-brand` is at 859 to 896 ms.
- `/decks` is bimodal at the server, as R04 found: 0.29 to 0.45 s TTFB in one mode and 4.7 to
  7.1 s in the other, in both runs and in `curl` (4.70 s at 14:47 UTC). The list call syncs every
  deck on the store on every request (17 cards today).
- One Inter face (717 KB over the wire) loads on every cold route; CSS is 214 KB decoded.
- LCP on `/decks` cold is the text `P.ts-recent-lead` in the fast mode and the first card image
  otherwise; on `/present` FCP and LCP are the opener photograph at about 1.0 s in both states.

## 3. Production transitions, editor session, filmstrip, material, idle

### 3.1 Transitions

| Transition                                                                                  | perf-budget                       | harness                                                                                                                      | R04         |
| ------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `decks->edit` (hover, click, studio ready and settled, in page)                             | 598 (gt-brand)                    | 544 (the scratch deck)                                                                                                       | 723 / 399   |
| `back` (history to `/decks`)                                                                | 18                                | 12                                                                                                                           | 41 to 53    |
| `edit->decks` (the title row mark)                                                          | 1,114 wall, a document navigation | 6,358 wall, a document navigation (17 cards; the slow list mode)                                                             | 491 / 4,958 |
| `trash->decks`                                                                              | 4 in page                         |                                                                                                                              |             |
| `home->new`                                                                                 | absent (`/home` is 404)           |                                                                                                                              |             |
| `slideChange` (filmstrip card `thesis`, painted frame)                                      | 14                                |                                                                                                                              |             |
| `slideshow` (painted frame)                                                                 | 18                                | 9 (painted 21); Esc back to the editor 12                                                                                    | 13          |
| `layoutGrid` (the plate visible, painted frame)                                             | 11                                | 10, 7, 7 (painted 10, 7, 7)                                                                                                  | 10          |
| Format options (Format menu, then the item, panel painted)                                  |                                   | the menu open 7 (painted 31); the panel 8 (painted 14); earlier runs 11 (20) and 8 (14)                                      | 7           |
| Presenter view popup (`present.arrow`, `menu.title.slideshow.presenterView`, `window.open`) |                                   | the window 278 after the click, `.ts-presenter` in it 302, its studio handle 899; the popup's own LCP 892 (`IMG.opener-img`) | 624 / 632   |

### 3.2 Editor session on a scratch deck (`untitled-20260914-nc3e`, created from `/new`)

79.5 s from `/new` to the last action; 208 requests; 112 `/_serverFn/` calls (`pollFn` 83,
`listVersionsFn` 11, `runDeckActionFn` 6, `attachFn` 2, `connectFactsFn` 2,
`exportCapabilitiesFn` 2, `warmThumbnails` 2, `writeDeckFn` 1, `readDraftDeckFn` 1,
`readEditorDeckFn` 1, `detachFn` 1; names from the server manifest); 10 `POST /api/decks/<id>/ops`,
2 stream connections, 35 presence POSTs, 11 `/api/render` (10 answered 200 `MISS`, 1 answered
404). The deck's blocks on the Title slide are `heading` and `lead`.

| Action                                                                                                        | last keyup or drop to `describe().state.revision` moving                                                             | to saved (`serverRevision >= revision`, `pending 0`) | current card's clone carries the text after the revision moved | thumbnail after the save                             | R04                       |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- | ------------------------- |
| First text edit (creates the deck; `writeDeckFn`, then the stream, three `runDeckActionFn`, `listVersionsFn`) | 83                                                                                                                   | 1,497                                                | 0                                                              | 4,331 (`/api/render/title?…&r=454dfda1`, 200 `MISS`) | 388 / 1,440               |
| Text edit 2                                                                                                   | 649                                                                                                                  | 1,439                                                | 0                                                              | 130                                                  | 372 to 374 / 990 to 1,314 |
| Text edit 3                                                                                                   | 583                                                                                                                  | 2,001                                                | 0                                                              | 125                                                  |                           |
| Text edit 4                                                                                                   | 512                                                                                                                  | 1,608                                                | 0                                                              | 129                                                  |                           |
| Drag 1, the heading by `handle.heading.move`, 24 moves                                                        | 707 after `pointerup` (202 ms drag, 24 frames at 119 fps, longest 10 ms, dropped box painted 5 ms after `pointerup`) | 1,834                                                |                                                                |                                                      | 21 / 716                  |
| Drag 2                                                                                                        | 597 (202 ms, 119 fps, painted 5)                                                                                     | 597                                                  |                                                                |                                                      | 8 / 2,492                 |
| Drag 3                                                                                                        | 585 (204 ms, 118 fps, painted 4)                                                                                     | 585                                                  |                                                                |                                                      | 5 / 490                   |
| Drag 4                                                                                                        | 897 (202 ms, 119 fps, painted 5)                                                                                     | 1,630                                                |                                                                |                                                      | 4 / 450                   |
| Resize, the east handle, 16 moves                                                                             | 570 (135 ms, 119 fps, painted 6)                                                                                     | 570                                                  |                                                                |                                                      | 19 / 858                  |
| New slide (toolbar)                                                                                           | card appeared 5 ms after `pointerdown`, painted 6; revision 1,039                                                    | 1,039                                                |                                                                | 409 (`title-1`, `r=7280e072`)                        | 13 / 570                  |
| Duplicate slide (Slide menu)                                                                                  | card 5, painted 7; revision 568                                                                                      | 2,784                                                |                                                                | not within 45 s (one render answered 404)            | 9 / 442                   |
| Home card of the scratch deck on the next `/decks` visit                                                      |                                                                                                                      |                                                      |                                                                | 1,502 (5,970 B)                                      | 5,069                     |
| Move to trash (card menu)                                                                                     | 3 ms to the card hidden                                                                                              |                                                      |                                                                |                                                      | 22                        |
| Delete forever (`/decks/trash`, confirm)                                                                      | 1,293 ms to the card gone; `GET /deck/untitled-20260914-nc3e` 404 afterwards                                         |                                                      |                                                                |                                                      | 1,302 to 8,365            |

The "revision moved" column is not R04's local commit any more (section 5). What the person sees
is in the clone column and the painted frame: the filmstrip clone already carries the text when
the revision moves, and a dropped object is painted 4 to 6 ms after `pointerup`. What they wait on
is 0.6 to 2.0 s to the checkpoint per write and 4.3 s for the first thumbnail of a new deck.

### 3.3 Filmstrip scroll on `/edit/gt-brand` (perf-budget, three passes of 18 wheel steps)

| Pass   | Frames | fps   | Median | p95  | Longest | Over 33 ms |
| ------ | ------ | ----- | ------ | ---- | ------- | ---------- |
| 1 down | 241    | 118.5 | 8.3    | 10.1 | 16.9    | 0          |
| 2 up   | 250    | 119.5 | 8.3    | 10.1 | 17.6    | 0          |
| 3 down | 247    | 119.9 | 8.3    | 10.1 | 10.4    | 0          |

DOM nodes with 85 cards after the passes: 4,921 (R04 5,654; budget 1,500). Every filmstrip
budget except the node count is met today.

### 3.4 First paint of a material slide

| Case                                          | Today                                                                                                                   | R04                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `view.goto('opener-blog')` in the open editor | canvas attached 37 ms after the call (46 in the first run), at the 300 by 150 default; sized to 3,200 by 1,800 at 60 ms | 135                   |
| `/edit/gt-brand#s/opener-blog`, warm          | studio 783, `[data-recipe]` 783, settled 795, canvas 836, LCP 844 (first run 861, 872, 910, 1,016)                      | 1,167 / 1,225 / 1,309 |
| `/deck/gt-brand#s/opener-blog`                | settled 501 (451), no canvas (the frozen frame stands), LCP 332 (344)                                                   | 508, LCP 292          |

### 3.5 Idle network on `/edit/gt-brand`, 60 s after a 5 s settle

| Run                     | `/_serverFn/` per minute | of which `pollFn`               | stream connections in the window                                                                      | presence POSTs | ops | nodes, heap at start and end          |
| ----------------------- | ------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------- | --- | ------------------------------------- |
| perf-budget (14:33 UTC) | 465                      | (not broken down by the script) | 0 `/api/events/` (the pattern the script counts; round three's channel is `/api/decks/<id>/stream`)   |                |     |                                       |
| harness (14:41 UTC)     | 3                        | 3                               | 0 (the stream opened before the window and held through it; 2 connections in the 79 s editor session) | 12             | 0   | 1,535 to 1,384 nodes; 20.6 to 18.3 MB |

The session poll is bimodal, as R04 4.2 explains: when the polls reach the instance that holds
the session each one is held 20 s (3 per minute), when they do not each returns at once (465 per
minute here, 700 in R04). Both modes happened within eight minutes today.

### 3.6 Twins on the second visit of `/deck/gt-brand`

Two twin images loaded (`opener-brand-dark.jpg`, `mood-earth-dark.jpg`; R04 counted 16), both
re-fetched on the second visit with `transferSize` 300 bytes and `decodedBodySize` 0: a
revalidation, not a full download. The check counts it as 2 of 2 re-fetched against a ceiling of 0.

## 4. The local preview (`http://localhost:4346`, the same client bytes, a 2 ms shell)

### 4.1 Harness routes (cold / warm medians)

| Route               | TTFB    | FCP       | LCP       | route DOM | ready     | requests until ready | JS wire cold / warm |
| ------------------- | ------- | --------- | --------- | --------- | --------- | -------------------- | ------------------- |
| `/`                 | 2 / 2   | 68 / 60   | 696 / 676 | 31 / 26   | 672 / 654 | 36                   | 830 KB / 6 KB       |
| `/new`              | 2 / 2   | 60 / 56   | 688 / 672 | 26 / 26   | 674 / 653 | 35                   | 830 / 6             |
| `/decks`            | 19 / 19 | 120 / 112 | 220 / 212 | 56 / 81   | 182 / 184 | 45 / 66              | 804 / 6             |
| `/decks/trash`      | 10 / 10 | 76 / 72   | 84 / 120  | 37 / 34   | 135 / 120 | 36 / 35              | 800 / 6             |
| `/deck/gt-brand`    | 31 / 29 | 132 / 128 | 132 / 128 | 88 / 84   | 225 / 220 | 40 / 40              | 834 / 7             |
| `/edit/gt-brand`    | 2 / 2   | 64 / 60   | 788 / 728 | 29 / 24   | 725 / 703 | 36 / 36              | 876 / 6             |
| `/present/gt-brand` | 2 / 2   | 704 / 672 | 704 / 812 | 27 / 26   | 675 / 649 | 37 / 37              | 834 / 6             |

With the network taken out, the `ssr: false` routes still take 650 to 725 ms to ready: that is
the browser parsing and running 3.0 to 3.2 MB of JavaScript and the loader, and it is the floor
any deployment number sits on. Production adds 100 to 200 ms to it. `/deck/gt-brand` is ready in
225 ms locally against 560 on production (the SSR render of the 394 KB payload), `/decks` in 182
against 687 to 6,492.

### 4.2 perf-budget local profile

The re-run with `--only routes,filmstrip,idle,twins,write --write` (14:53:08 to 14:55:56 UTC; 73 of
121 budgets met; its scratch deck `untitled-20260914-8a73` trashed and deleted through the UI
afterwards, 5 ms and 21 ms, probe 404). Routes, cold / warm medians:

| Route               | TTFB    | FCP       | LCP (element)                | ready (samples)                          | JS decoded, files | longest frame | DOM nodes     |
| ------------------- | ------- | --------- | ---------------------------- | ---------------------------------------- | ----------------- | ------------- | ------------- |
| `/`                 | 2 / 2   | 60 / 60   | 692 / 672 (`SPAN`)           | 673 / 653 (670, 673, 674; 649, 653, 654) | 3,049 KB, 20      | 62 / 60       | 668           |
| `/new`              | 2 / 2   | 64 / 60   | 688 / 660 (`SPAN`)           | 672 / 648                                | 3,049 KB, 20      | 63 / 61       | 668           |
| `/decks`            | 18 / 18 | 120 / 116 | 212 / 208 (`IMG`)            | 179 / 177                                | 2,974 KB, 19      | 63 / 59       | 626           |
| `/decks/trash`      | 10 / 10 | 68 / 72   | 76 / 128 (`IMG`)             | 135 / 120                                | 2,962 KB, 19      | 64 / 62       | 122           |
| `/deck/gt-brand`    | 34 / 32 | 140 / 124 | 140 / 124 (`IMG`)            | 231 / 216                                | 3,055 KB, 23      | 64 / 60       | 1,897 / 1,896 |
| `/edit/gt-brand`    | 2 / 2   | 60 / 60   | 796 / 720 (`IMG`)            | 728 / 699                                | 3,187 KB, 21      | 90 / 93       | 1,444 / 1,442 |
| `/present/gt-brand` | 2 / 2   | 692 / 668 | 700 / 808 (`IMG.opener-img`) | 667 / 646                                | 3,059 KB, 21      | 59 / 60       | 412           |

The largest chunk is the same 1,202,643 bytes; CLS 0.0000 everywhere except `/deck` (0.0021).
Transitions, from the first local run before it died at the Layout grid (section 6 item 7):
`decks->edit` 1,712 in page (the first click after a fresh tmp store, the loader reading 85
slides and 31 versions from disk), `back` 20, `edit->decks` 157 wall, `trash->decks` 4,
`slideChange` 12, `slideshow` 17.

Filmstrip: passes of 243, 246 and 247 frames at 119.5 fps, median 8.3 ms, p95 10 ms, longest 16.6
to 17 ms, 0 over 33 ms; 1,218 DOM nodes with 85 cards (every filmstrip row met). Idle: 5
`/_serverFn/` calls per minute (`pollFn` 3, `readEditorDeckFn` 1, `runDeckActionFn` 1; ceiling 4),
0 stream connections in the window. Twins: 0 of 2 re-fetched (`opener-brand-dark.jpg` 515,192 B
and `mood-earth-dark.jpg` 232,175 B both served from the cache; production revalidates them,
section 3.6).

The write path (`--write`, scratch deck `untitled-20260914-8a73`): last keyup to the revision
moving 92 ms (ceiling 450); to saved 108 ms (600); the current card's clone carries the text 0 ms
after (50); new slide painted 9 ms after `pointerdown` (16) and saved 2,021 ms (250; section 6
item 8); capture of the edited slide after the save 1,470 ms (status 200, `x-turboslide-cached:
0`; 2,000); the home card on the next `/decks` visit 1,489 ms (1,500). The first write on a fresh
deck goes through `writeDeckFn` and lands in 108 ms on the tmp store; every later write waits for
the 2 s checkpoint.

### 4.3 Editor session, material, idle, extras on the local preview

Scratch deck `untitled-20260914-k2k0` on the tmp store (memory channel, 126 s, 140 requests, 35
`/_serverFn/`, 10 ops, 2 stream connections, 45 presence POSTs, 10 renders of which 2 answered
404):

| Action                                                                       | revision moved                                                                        | saved    | thumbnail after the save |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- | ------------------------ |
| First text edit (creates the deck)                                           | 85                                                                                    | 104      | 1,543                    |
| Text edits 2 to 4                                                            | 2,088 / 2,085 / 2,085                                                                 | the same | 130 / 130 / 127          |
| Drags 1 to 4 (24 moves, 119 to 120 fps, painted 5 to 6 ms after `pointerup`) | 2,034 / 2,063 / 2,069 / 2,063                                                         | the same |                          |
| Resize                                                                       | 2,036                                                                                 | the same |                          |
| New slide                                                                    | card 5, painted 6; 2,019                                                              | 2,019    | not within 45 s          |
| Duplicate                                                                    | card 6, painted 8; 2,027                                                              | 2,027    | not within 45 s          |
| `edit->decks`                                                                | 1,720 wall, a document navigation (40 cards on the tmp store; the home card 1,574 ms) |          |                          |
| `decks->edit` (the scratch card)                                             | 39 in page; back 20                                                                   |          |                          |
| Move to trash; Delete forever                                                | 5 ms; 22 ms; `GET /deck/<id>` 404                                                     |          |                          |

Every write after the first reaches "saved" at 2.02 to 2.09 s on the memory channel, a fixed
cadence rather than work (section 6 item 8).

Material: `view.goto('opener-blog')` canvas attached 45 ms, sized 62 ms; `/edit/gt-brand#s/opener-blog`
studio 697, settled 709, canvas 755, LCP 732; `/deck/gt-brand#s/opener-blog` settled 219, LCP 136,
no canvas.

Idle, 60 s: 5 `/_serverFn/` calls (`pollFn` 3, `readEditorDeckFn` 1, `runDeckActionFn` 1), 0 stream
connections in the window, 11 presence POSTs; nodes 1,444 to 1,295, heap 22.5 to 20.9 MB.

Extras (the tmp store's hosting banner hidden by a style tag for the pointer steps, section 6
item 7): Format options menu open 6 ms (painted 29), the panel 8 ms (painted 15); Layout grid
11, 7, 9 ms (painted 12, 8, 9); Slideshow 11 ms (painted 23), Esc back 23 ms; Presenter view popup:
the window opened 95 ms after the click, `.ts-presenter` in it at 117 ms, its studio handle at
726 ms, the popup's own LCP 848 ms (`IMG.opener-img`).

## 5. A definition that changed in round three

R04's "local commit" was `describe().state.revision` moving past its start, which on the round
two build happened in the reducer after the 400 ms burst timer (372 to 388 ms after the last
keyup). On round three the reported revision is `reportedRevision()` in `edit.$deckId.tsx`, the
largest of the room client's revision, `serverRevision` and the document's; the room client moves
its revision only when `POST /api/decks/<id>/ops` answers or a checkpoint or hello arrives
(`packages/realtime/client/room-client.ts` `setRevision`, the stream `hello` branch and the ops
response). The "revision moved" columns above therefore stamp the first server acknowledgement
(512 to 707 ms on production, 2.0 s on the memory channel), not the reducer. The reducer's own
work shows as the clone column (the filmstrip clone carries the text before the revision moves,
0 ms) and the painted frame after a drop (4 to 7 ms), which match R04's 4 to 21 ms. SPEC-4 4.6's
first row ("last keyup to the local commit", ceiling 450) needs a page-side stamp of the reducer
(the current card's clone, or `describe().state.sync.pending` rising) before the check can assert
it; as the probe stands it measures the network. Requested in `build-4/verifier.md`.

## 6. Findings for the round (owner in brackets)

1. `/decks` TTFB is bimodal on production: 0.29 to 0.45 s or 4.7 to 7.1 s, in three runs and in
   `curl`; the perf-budget medians landed in the slow mode (5,335 / 6,300) and the harness in the
   fast one (451 / 398). The deployment ceiling of 400 / 300 is met only in the fast mode.
   [integrator; SPEC-4 3.1 and 4.1 rows for `/decks`]
2. JavaScript decoded grew from 2,660 to 2,757 KB (R04) to 3,049 to 3,187 KB on every route, in 19
   to 23 files; the largest chunk `index-D6IA9RCO.js` is 1,202,643 bytes (R04 1,122,594; ceiling
   600,000). `freeform-*.js` no longer exists as a chunk; `dither-key-3-G63s7k.js` (737,517 bytes)
   is new in the preload set. [B5, SPEC-4 3.12]
3. DOM nodes fell to 1,899 on `/deck/gt-brand` and 1,445 to 1,513 on `/edit/gt-brand` (ceiling
   1,500; the warm editor meets it at 1,370 to 1,480); the filmstrip after three passes holds 4,921
   nodes on production and 1,218 on the local preview with the same 85 cards. [B4]
4. The session poll is still bimodal (3 or 465 `pollFn` calls per minute); the stream holds 2
   connections per editor session and 0 new ones in a 60 s window. The check's idle pattern
   `/api/events/` counts nothing on round three; SPEC-4 4.4 already renames it to
   `/api/decks/.*/stream`. [integrator, the moved script]
5. Twins: `/deck/gt-brand` now loads 2 twin images at the opener (R04 16) and both revalidate on
   the second visit (304, 300 bytes each), so the twins ceiling of 0 fails on a revalidation rather
   than a download; the check should count `transferSize` above the header size, or the asset route
   should send an immutable `Cache-Control`. [B5 or integrator, SPEC-4 4.5]
6. `/edit/gt-brand` stalled twice: the harness's extras runs at 14:50:55 and 14:56:03 UTC each
   waited 120 s for the studio handle and `data-settled` and neither arrived (the page had the
   title row and the skeleton), while a diagnostic load at 14:59 was ready in 2,433 ms with
   `readEditorDeckFn` answering in 1,421 ms and the extras run right after it was ready too. Two
   stalls in about twenty loads of the route today, both inside one eight minute window; every
   other load was ready in 0.8 to 2.7 s. [B3 to watch; SPEC-3 finding 51's window is the likely
   place]
7. On the tmp store the hosting banner (`edit.$deckId.tsx` `HostingBanner`, `position: fixed`
   under the bar, no dismiss control) covers the toolbar's Layout button, so a pointer click on
   `toolbar.layout` times out: `perf-budget.mjs --profile local` died there in its transitions
   check and wrote no JSON, and step 31 will meet the same wall with `TURBOSLIDE_STORE=tmp`. The
   local JSON here comes from a re-run with `--only routes,filmstrip,idle,twins,write`; its
   transitions come from the first run's table. [integrator, SPEC-4 4.8]
8. On the memory channel every write after the first reaches "saved" at 2.02 to 2.09 s, whatever
   the action, so SPEC-4 4.6's local ceilings (600 for a text burst, 250 for a new slide) cannot be
   met on `TURBOSLIDE_STORE=tmp` unless the check's "saved" is the acknowledgement rather than the
   checkpoint on that tier, or the checkpoint cadence changes. [integrator, SPEC-4 4.6 and 4.8]
9. The Layout grid plate closes on an outside pointer press only: `Escape` on the page and a
   dispatched click on the toggle both left it open, on production and locally, in two runs each.
   A dialog that Escape does not dismiss is an accessibility miss under AGENTS.md's rules. [B1 or
   the chrome owner]
10. The duplicated slide's static thumbnail did not arrive within 45 s on production or locally
    (one `/api/render` answered 404 in each session); the new slide's arrived in 409 ms on
    production. [B4, SPEC-4 3.2]
11. Two decks on production are not the verifier's and were left in place: `untitled-20260913-tii2`
    on `/decks` (17 cards) and `untitled-20260914-ah39` in `/decks/trash`. The verifier's own
    scratch deck `untitled-20260914-nc3e` was moved to the trash and deleted forever through the
    UI (`GET /deck/untitled-20260914-nc3e` 404). [Kevin or the integrator to confirm and remove]
12. The LCP element on `/decks` is `P.ts-recent-lead` in the fast mode and the first card image
    otherwise; on `/present/gt-brand` it is the opener photograph at about 1.0 s in both states,
    and the presenter's FCP equals its LCP (nothing paints before the picture). [B3, SPEC-4 3.7]
13. `vite preview` serves this build's SSR routes once `TURBOSLIDE_SESSION_SECRET` is set (MILESTONES-4
    "Verifier" item 3's open fact); the browser's own cost on the `ssr: false` routes is 650 to
    725 ms to ready with a 2 ms TTFB. [verifier, for VERIFICATION-4.md]

## 7. Budget rows the day 0 run already meets (SPEC-4 section 4: "a ceiling the day 0 run already meets stays a ceiling")

Production, deployment profile: every TTFB except `/decks` and `/decks/trash` (412 against 400
cold, 396 against 300 warm); `/new` FCP (208 / 148 against 400 / 250); `/decks/trash` LCP and
ready; `/deck/gt-brand` TTFB, LCP and ready; `/edit/gt-brand` warm TTFB and FCP; every CLS
(0.0000 to 0.0021 against 0.05); every longest animation frame except `/decks` cold (152) and
`/edit/gt-brand` cold (321); `/edit/gt-brand` warm DOM nodes (1,480 against 1,500); `back` (18
against 100), `trash->decks` (4 against 400), `slideChange`, `slideshow`, `layoutGrid` (11 to 18
against 50); the filmstrip's frame rows (first pass longest 17 against 100, steady p95 10 against
20, longest 18 against 50, fps 119 against a floor of 50); the idle stream row (0 against 2). 58
of 121 asserted rows in the perf-budget run.
