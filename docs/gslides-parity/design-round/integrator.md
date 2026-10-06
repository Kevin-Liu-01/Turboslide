# The design round: the integrator

Written by the design round's integrator from 03:15 to 04:45 PDT on 2026-10-06 in `/Users/kevinliu/repos/Turboslide-design` on `design/round`, which stood at `59724eb2` (DR-D4#7, part) with 17 commits over `0d75ab90` when it began. Read first: `docs/DESIGN.md` (every section), the lane notes `d1.md`, `d2.md`, `d4.md` and `d5.md`, D3's note on its staging branch (`41bd5748:docs/gslides-parity/design-round/d3.md`) and `requests.md`. Port 4670 served the node-server output with the round's environment (a tmp store, the memory tier, secrets made per start and never printed); 4680 was not used. A scratch worktree in the session's scratchpad (`integrator/wt`, detached) held the reorders and the group typechecks. Nothing was pushed or deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not read or written. Times are PDT and loads are one minute load averages; a timing read at a load over 24 is not a verdict.

## 1. The state at the start

- The lanes' pushes sat in the order they landed: DR-spec, DR-D1#1 to #3 and D1's notes, then DR-D4#1, DR-D5#3, DR-D2#1, DR-D2#2, DR-D4#2, DR-D5#2a, DR-D4#3, DR-D2#3, DR-D5#1a, DR-D4#4, D5's notes and DR-D4#7 (part). No lane process was running. The working tree held one stale copy of `core-matrix.json` written at 02:56 (the same 1,194 rows in another order, read row by row against HEAD); it was put back to HEAD's text.
- There is no "DR-seam: merge origin/main" commit. `git ls-remote` read origin/main at `bfba1963` (R1F-D integrator), 29 commits past `0d75ab90` and touching 278 files, 17 of which this round also changes. `followup/round` stands 7 commits further at `95808c36` (R1F-E's landing fixes and the R1F integrator's FOCUS.md). DESIGN.md 10.0 gives the seam to the orchestrator, once; the integrator did not make it.
- D3's four pushes are not on `design/round`: they are `a640deb0`, `868ae672`, `3f86484b` and `2d95465d` on the local branch `d3/stage`, over a local merge of `followup/round` at `4e127c13`, with patches in `scratchpad/d3/ports/`.

## 2. The requests and their answers

| Request | From, to | Answer | Commit |
| --- | --- | --- | --- |
| `place.ts`: `size` before `shift` when `fit` is set | D2 1, D1 or the integrator | Done. A new test puts a 600 px plate under an anchor at 40 in a 360 px window at top 70 with max-height 282; the old order read top 8, over the anchor | `78780874` |
| `ExportMenu.tsx`: `usePlate` and `.pt-float` if the menu is mounted again | D2 2, D1 or the integrator | No change: D2 read the menu mounted nowhere, and its sheet already reads the scale. Whoever mounts it takes `usePlate(card, { layer: 'popover', anchor: button })` | none |
| The link popover over a slide on `.pt-float` | D2 3, the integrator | Done for the popover and for the link chip in a session (`InlineText.tsx`) and on the overlay (`Overlay.tsx`): 6 px, the `--pt-edge` frame, the ring, the stage's local order; the field and select on the field boundary; field, select and buttons at the 4 px chip corner | `78780874` |
| The toolbar's `view.copyLink` reads "Copy Link" | D3 3, D2 | Done in `Toolbar.tsx`; its accepted `gt-ui/cta-title-case` finding leaves the lint config in the same commit. The Share dialog's own "Copy link" is `strings.ts` and changes with DR-D3#4 | `78780874` |
| `Slideshow.tsx`: `layer={useLayer}` on the shortcuts card and the show's slide list, `useLayer(root, { layer: 'show' })` | D5 1, the integrator | Done, with two findings of the integrator's own: a full screen element enters the top layer above every surface already in it, so `Layer.ts` shows the open surfaces again in the scale's order on `fullscreenchange` (read in Chromium: `elementFromPoint` over a manual popover's bar answered the page after `document.documentElement.requestFullscreen()` until the popover was shown again); and in the top layer the show's `inset: 0` resolved against the window, which put the phone's toolbar about 500 px under the slide, so the show is fixed on its stage's box before it enters the layer and follows it | `14e6748c`, `f14dea7d` |
| `NUMERALS_OWNERS` with the standalone deck's copy | D5 2, D1 | Done in `config.ts`, `css.ts`, `source.ts`, with a test | `14e6748c` |
| `"./dialogs/SignIn"` in the chrome's exports | D5 3, D1 or the integrator | Done; the one Sign in dialog itself is DR-D5#2b, after the seam | `14e6748c` |
| The shortcuts card's headings in sentence case with their acceptance | D5 4, the integrator (optional) | Done: 12 px titanium as the editor's Keyboard shortcuts dialog draws its group headings; the accepted `css/no-eyebrow` finding leaves in the same commit. The picker titles (`Pickers.css`), the other accepted eyebrow, went the same way in D2's push | `14e6748c`, `78780874` |
| The lockup word's alternates | D5 5, D2 | Answered in DR-D2#3. `packages/theme/src/brand.test.ts` still expected the alternates and failed in the whole suite; it now reads no feature list | `5f94be30` |
| The profile's session list on `.pt-scroll` | D5 6, D2 | Answered in DR-D2#3; `accounts.css` drops its two lines in DR-D5#2b | none |
| Title Case on the trash's buttons, the title row's Sign In and "Use a Passkey" | D5 7, D3 | Waits: `menus/strings.ts` is on the seam list, and D3's staged DR-D3#4 does not carry these words. For D3's port | none |
| `ThemeButton` without the editor's icon table | D4, D2 | Done: the button draws ToolButton's markup itself and imports no icon. The home route's chunk now imports `ThemeButton`, `useMountEffect` and `theme` only; the 51,136 B icon table no longer loads on `/home` | `8486df4f` |
| A `resolveDependencies` filter for the landing's live chunks | D4, the integrator | Not done. With the icon table gone, the live core's preload list names 12 small files the route has already loaded (about 400 B decoded in the core); the core reads 19,739 B gzip, 741 B under its line. A Vite option for every route is more risk than those bytes | none |
| The inline z-index lines of `live/paint.ts` and `live/theme.ts` | D4, D1 | Accepted as local order inside a slide's stacking context, with `MaterialMount.tsx`'s copy of a material block's z-index, owner "the integrator" (the run test allows a lane key of Round 1 or the integrator). They report until DR-D1#5 and are accepted after it | `8486df4f`, `3e3654b8` |
| `home-page.spec.ts`: the theme button and the round's words | D4 (two requests), the integrator | Done: the h1 lines, the lead, the menus and close h2s from `design-copy.ts`, and the navigation's `view.theme` button in place of the Light and Dark pair. 12 of 12 passed on 4670 | `8486df4f` |
| `decks.home.seller-lead` reads the new h1 | D4, D5 | Done in `decks.spec.ts` (two locked lines) and restated in the matrix; passed on 4670 | `8486df4f` |
| The renderer's CSS in every page's head without comments | D4, the integrator | Done through `packages/render/src/block-css-page.ts` (`block-css.ts` is on the seam list): 18,656 B where the head inlined 29,311 B; `/home`'s document reads 88,581 B, where DR-D4#7 read 99,304 B | `8486df4f` |
| View > Live pointers' glyph | D4, D2 | Waits: `menus/model.ts` is on the seam list | none |
| The page's own script line | D4, Kevin | Section 8 | none |
| `live/paint.ts` on the one contrast function | D1, D4 | Waits for DR-D3#1: the landing's copy is pinned equal to `theme-css.ts`'s, which DR-D3#1 moves onto `@turboslide/theme/contrast` | none |
| The build printed the local agent token | D1, the integrator | The file was deleted before the integrator's build, which minted a new one. The build prints a new token once by design (SPEC-3 7.7); it went to the build log in the scratchpad and was never shown | none |
| Prototemplate's Firefox scrollbar gate | D1, the integrator | For the ship note: Prototemplate `DESIGN.md` 165 to 169 and `deck/parts/head.html` 188 to 198 gate on `not selector(::-webkit-scrollbar)`, which no engine answers; they are Prototemplate's to change | none |
| The GT word draws the GT mark in every theme | D3 1, the integrator or D2 | Waits for DR-D3#1 (`themeFactsOf`) and the seam (`slide.ts` and `Editor.tsx` are on its list) | none |
| Import Theme | D3 2, the integrator | Waits for D3's port | none |
| The theme literal of `Sidebar.tsx` and `source/apply.ts` | D3 3, D2 | Waits for DR-D3#1 | none |
| The page deck's id | D3 4, D4 | Waits for DR-D3#2 | none |
| `deck.create` without `from` on the studio's window path | D3 5, the integrator | Waits for DR-D3#2 | none |

Found by the integrator's gates and fixed in the push they belong to:

- `apps/studio/src/routes/-home-css.test.ts` failed on the lanes' head (`59724eb2`): 14 selectors of the landing's sheets named classes other pages draw (`.ts-fo` and its parts, the editor's Format options; `.ts-present-keys`, the show's shortcuts table; `.ts-glyph`, the editor's icon picker). After `/home` a client navigation keeps the landing's sheets, so the editor's panel and the show's table took the landing's grid and inline-flex. Each now names the landing's root `.ts-product` (`8486df4f`).
- `apps/studio/src/styles.css` (no lane's file) carried three alternates and four literal `tabular-nums`; it now reads Inter's defaults and `var(--pt-numerals)` (`14e6748c`).
- `home.scroll.regions` failed on the build with every bar right: the build's minifier writes `rgba(255, 255, 255, 0.44)` as `#ffffff70`, and the driver compared the token's text. It now compares the two as colours (`3e3654b8`).

## 3. The pushes

One push per lane in the order D1, D2, D5, D3, D4, each with the integrator's answers to the requests on its files. The reorder ran `git rebase -i 0d75ab90` in the scratch worktree, the todo written by a `GIT_SEQUENCE_EDITOR` script from the list of commits in the new order. The steps that stopped were resolved by script: `core-matrix.json` by moving the picked commit's own rows (added, changed and removed by id, each row's text kept byte for byte, since the file is prettier-ignored and carries the lanes' layout), `README.md` regenerated by `docs/readme/what-works.mjs`, and `requests.md` by lane section. The new head's tree equalled the old head's (`git rev-parse <head>^{tree}`) before `git update-ref` moved `design/round` under the git lock; the order before is kept as the local branch `design/round-prereorder` (`d9dc1f0e`). A second reorder, the same way, placed the three fixes the gates found after the first one in their pushes (tree `dcfd9abe` equal before and after). Each commit's diff of the matrix and README is its own rows and its README line.

| Push | Commits | Head | Typecheck of the head (`tsc -b` in the scratch worktree, routes generated) | Rows entered (restated) |
| --- | --- | --- | --- | --- |
| D1 | `53c6c9f2` DR-spec, `6fc14f09` DR-D1#1, `ccbe70f0` DR-D1#2, `af1139c5` DR-D1#3, `a2e4ede6` D1 notes | `a2e4ede6` | exit 0, 57 s and 60 s, load 156 and 66 | `chrome.colors.pairs-at-floor`, `chrome.font.one-subset`, `chrome.font.on-demand` (`fonts.inter.italic-release`) |
| D2 | `7b67283e` DR-D2#1, `4ba6688c` DR-D2#2, `1b664daa` DR-D2#3, `78780874` and `5f94be30` the integrator | `5f94be30` | exit 0, 118 s at load 74 at `78780874`; 4 s at `5f94be30` (one test file more) | the five `chrome.layers.*`, the four `chrome.radius.*`, `chrome.plates.separation`, `versions.field.corner` (retires `versions.field.square`), `chrome.scroll.default-everywhere`, `chrome.scroll.stage-track`, `chrome.numerals.tabular`, `chrome.type.default-glyphs`, `chrome.appearance.system-until-picked` (`chrome.buttons.one-rule`) |
| D5 | `c03a2649` DR-D5#3, `55649d34` DR-D5#2a, `edc6199b` DR-D5#1a, `af6d8c9e` D5 notes, `14e6748c` and `f14dea7d` the integrator | `f14dea7d` | exit 0, 26 s, load 46 to 61 | `present.presenter.surfaces`, `view.deck.surfaces`, `decks.pages.access-plates` |
| D3 | none on `design/round` | | | |
| D4 | `0854dfb3` DR-D4#1, `3f2619e7` DR-D4#2, `db5f890f` DR-D4#3, `bfd1f20c` DR-D4#4, `96360a07` DR-D4#7 (part), `8486df4f` and `3e3654b8` the integrator | `3e3654b8` | exit 0, 43 s, load 61 to 70 | `home.nav.icons`, `home.type.default-glyphs`, `home.radius.ladder`, `home.scroll.regions`, `home.pictures.all-load`, `home.hero.frame-chrome`, `home.hero.terminal-never-empty`, `home.hero.steps`, `home.menus.icons`, `home.canvas.panel`, `home.tailor.dialog`, `home.diagrams.flows` (`home.motion.pause`, `home.hero.type`, `home.hero.stage`, `home.budget.bytes-first`, `decks.home.seller-lead`, `home.numbers.row`, `home.features.table`, `home.menus.bar`, `home.canvas.log`, `home.tailor.filmstrip`, `home.kits.restyle`) |
| The integrator's note | this file and the pictures under `integrator/` | the commit after `3e3654b8` | docs only | |

D3's commits wait on `d3/stage` for the seam (section 6). D3's own trial took its four patches onto `d4ae7431` with origin/main merged and no rejected hunk. Of D3's 140 files, the commits after that trial change three: `README.md` and `core-matrix.json`, which D3's port regenerates and enters by id, and `apps/studio/src/components/home/copy.test.ts`, whose D3 hunks still apply to the head (`git apply --check` of the four patches on that file).

Dependencies between the pushes, read from the lanes' notes and the integrator's runs:

- Every push lands on main only through the seam: `design/round` forks at `0d75ab90`, and origin/main moved 29 commits since.
- `decks.pages.access-plates` (D5) reads the refused page's and Not found's buttons at 6 px through `page-frame.css`, which DR-D4#1 changed. At D5's head, before D4's push, it reads the old corner. The two pushes go in one deploy, or the row is read after D4's.
- `home.radius.ladder` (D4) reads the shared tooltip at 6 px, which D2's push draws; D2 goes first, as ordered.
- DESIGN.md 7.9 and question 31: the tree through DR-D3#1 ships before the tree that holds DR-D3#2, and DR-D4#5 needs DR-D3#1.

## 4. The gates on the head

| Gate | Reading | Load |
| --- | --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 on the head in the design worktree (04:20) and on each group head (section 3). The first pass at the D2 head printed one TS6053 for a file the previous checkout lacked and exited 0; the rerun read no message | 40 to 160 |
| `pnpm test` (`vitest run` at the root), 04:22 to 04:25 | 514 files: 5,386 passed, 2 failed, 6 skipped, 2 todo. `apps/studio/src/server/agent-actions.test.ts` timed out at 5 s; alone with a 120 s bound, 7 of 7 passed. `packages/import` `import.test.ts` reads 93 slides from the read only Prototemplate checkout where it expects 95, as D1 read on 2026-10-05; not this round's. The first run at 03:50 also read `brand.test.ts` and `run.test.ts` red, fixed in `5f94be30` and `3e3654b8` | 49 to 68 |
| `core-matrix.test.mjs`, `what-works.test.mjs`, `evidence-policy.test.mjs` | 53 passed, the last with this note's 16 pictures staged (each under 200,000 B, 1,732,373 B in all) | 40 |
| `node docs/readme/what-works.mjs --check` | README.md is current | |
| The brand lint (`main.ts`, enforce) | 0 open, 19 accepted, 0 stale (22 accepted before: three acceptances left with their fixes). Reported by the six rules of the round, never failing until DR-D1#5: 20 findings in 6 files, where the head read 27 in 7: `decks.css` 6 and `BookView.css` 9 (DR-D5#1b, #3b), `accounts.css` 1 (DR-D5#2b), and the three z-index lines accepted for DR-D1#5 | 150 |
| `build-colors.ts --check`, `build-home-assets.ts --check` | current; 38 outputs match, 18 files the page names, each in `assets.json` and on disk | 148 |
| The node-server build | 40 s at 03:41 (load 340); 25 s at 04:28 after the show's stage box (load 48) | |
| `check-client-bundle.mjs --base` on 4670 | exit 1 on the tree's standing readings: `/decks` 1,331,477 B (ceiling 600,000), `/deck/gt-brand` 1,223,437 B (1,000,000), `/edit/gt-brand` 1,728,293 B under 2,000,000; the shared entry chunk 1,208,204 B, reported. DR-D1#1 read 1,310,277, 1,202,101 and 1,186,868 before any of the round's script: the entry grew 21,336 B through the round | 270 |

## 5. Rows on the node-server build (port 4670)

| Run | Rows | Result | Load |
| --- | --- | --- | --- |
| 1, 03:42 to 03:55 | the 47 spec rows the round entered or restated, the seven `home.budget.*` rows and `home.page.bands-after-load` | 49 passed, 1 failed, 3 not driven, retries zero. Failed: `home.scroll.regions`, the driver's text compare of the thumb token (section 2). Not driven: `home.motion.pause` (its functional checks passed: C1 at its end 23.4 ms after the press, 0 frame callbacks paused at the top, middle and bottom; the timing not read at load 58), `home.budget.frame` and `home.budget.main-thread` (not read at load 58) | 244 to 61 |
| 2, 03:55 to 04:05 | the whole `core/chrome.spec.ts` and `core/present.spec.ts` | 73 of 73 passed, retries zero; `chrome.layers.follows-anchor`: the Theme panel's font picker at 333 under its anchor at 331.4, 213 under 211.4 after a 120 px scroll, in the `popover` layer | 68 to 65 |
| 3, 04:05 to 04:14 | the walk areas `share`, `chrome` and `polish-text` | 58 of 61 passed, retries zero. Failed: `chrome.split.one-box` and `chrome.cluster.gaps-heights` (the walk's drivers expect the 8 px Slideshow and a square Share; read: "box 133x32 radius 6px", "corners share 6px, split 6px"; DR-D2#2b restates both after the seam, section 6), and `versions.show-changes-marks` (`today` not driven, a row of an earlier round; "marks with Show changes on 0", the reading D2 had on 4662) | 65 to 161 |
| `home-page.spec.ts`, 04:14 | the whole file | 12 of 12 passed | 161 |
| 4, 04:21 to 04:23 | `home.scroll.regions`, `home.radius.ladder`, `home.canvas.panel`, `home.type.default-glyphs` after the driver fix | 4 of 4 passed, retries zero | 50 to 69 |
| 5, 04:29 to 04:31, the rebuild | the whole `core/present.spec.ts` | 35 of 35 passed, retries zero; `present.presenter.surfaces`: the show's slide list in the `popover` layer and the shortcuts card in the `dialog` layer, each first at its centre, in both appearances (D5 read "layer none" before the hook was handed in) | 46 to 42 |

The landing's budgets (DESIGN.md 8.16), read in run 1 on the build:

| Measure | Reading | Line |
| --- | --- | --- |
| Document | 88,581 B decoded, 15,179 B brotli | 100,000 B; 20 KB brotli |
| Page CSS | 17,139 B brotli | 20 KB brotli (question 32) |
| Route chunk | 61,848 B decoded, 15,471 B brotli | 70 KB, 22 KB |
| Live core with its imports | 55,381 B decoded, 19,739 B gzip | 64 KB, 20,480 B gzip |
| Largest band chunk | menus, 47,762 B decoded, 15,943 B gzip | 56 KB, 16 KB gzip |
| Page's own script after a full scroll | 357,645 B decoded, 119,899 B gzip | 360,000 B, 120,000 B gzip |
| Pictures after a full scroll | 57,133 B at x1 and at x2, 0 before load | 200 KB |
| Font | one request, `InterVariable-latin` 113,752 B | reported against 120 KB |
| Shared script | entry 1,208,204 B; all shared 1,369,377 B | reported |
| CLS, LCP | CLS 0 at 1440 and 390; the h1, 188 to 228 ms cold (not read, load 62 to 64) | 0; 400 ms |

## 6. What waits for the seam

The merge of origin/main into `design/round` (DESIGN.md 10.0) is the orchestrator's, and every push lands on main through it. Each part below touches a file of the seam list or needs DR-D3#1, and each lane prepared its part:

- D1: DR-D1#4, the PowerPoint family names (`packages/export/src/pptx/*`); DR-D1#5, the six rules to enforce, after every other lane's last push.
- D2: DR-D2#2b, the restatement of `chrome.split.one-box` and `chrome.cluster.gaps-heights` in `scripts/probes/core-walk/areas/chrome.mjs` and `toolkit.mjs`. Both read red on the walk today (section 5), and both are rows of the unparkable `chrome` feature, so D2's push holds the ship until they are restated. Also the Tailor row's `pencil` and View > Live pointers' glyph (`menus/model.ts`), and the theme literal of `Sidebar.tsx` and `source/apply.ts` after DR-D3#1.
- D3: the port of DR-D3#1 to #4 from `d3/stage`, with D3's requests 1, 2, 4 and 5 and D5's request 7.
- D4: DR-D4#1b (the navigation's motion words and the footer's sentence that names another company's slides app, both in `copy.ts`); DR-D4#5 (themes and kits, after DR-D3#1); DR-D4#6 (agents and two people, after the people band: origin/main reverted the band in `14bd67d1`); the rest of DR-D4#7 (the captured presenter view, the Download dialog, the pattern stills: the document now has 11,419 B of room, the page's own script 101 B, section 8); `live/paint.ts` on the one contrast function after DR-D3#1.
- D5: DR-D5#1b (`decks.css`, the five page rows, each template's theme name), DR-D5#2b (the one Sign in dialog; the chrome's export line is in), DR-D5#3b (`BookView.css`).

## 7. Pictures

Under `docs/gslides-parity/design-round/integrator/`, each a contact sheet of whole viewports at 1440 by 900 or 390 by 844 in Chromium with its scrollbars shown, taken on 4670 and opened and looked at:

- `editor-{1440,390}-{light,dark}.jpg`: the name prompt bar 4 px under the title row with the presence tooltip beside it, each plate with its own corner, frame and ring (Kevin's first screenshot; at 390 the bar sits under the toolbar row); Slideshow and Share at one 6 px corner; the link popover (Cmd K) as a 6 px plate with 4 px controls; the slide's context menu; Share with "Link copied" over the dialog's scrim. At 390 the link popover is wider than the window (its `min-width` is 420 px, from before the round), a finding for the editor's next round.
- `show-{1440,390}-{light,dark}.jpg`: the show with its slide list over the toolbar, the Keyboard shortcuts card (8 px window, "Presenting" in sentence case), and the presenter view. At 390 the toolbar and the list sit under the slide in the stage's box (taken after `f14dea7d`).
- `pages-{1440,390}-{light,dark}.jpg`: `/decks`, the templates gallery, the trash, `/deck/gt-brand`, the refused page, You need access and Not found. The trash's buttons and the gallery's Blank sentence keep main's words until DR-D5#1b, D5's request 7 and DR-D3#3.
- `home-{1440,390}-{light,dark}.jpg`: the first screen and the menus, canvas, Tailor, agents, Present, export and features bands; the canvas band's Format options readout keeps its grid with its selectors under `.ts-product`.

## 8. For Kevin

1. The landing's own script reads 119,899 B gzip against its 120,000 B line. DESIGN.md 8.10 to 8.12's remaining parts (the captured presenter view, the Download dialog, the 17 pattern stills) need about 2,000 B gzip more (D4's estimate). Either the line rises to 124,000 B or a band's chunk is cut first.

## 9. Notes

- The server on 4670 was stopped and `.turboslide/build.lock` released at 04:47. The scratch worktree was removed after the last typecheck; `design/round-prereorder` (`d9dc1f0e`) keeps the order before the first reorder.
- The `.turboslide/token` of this checkout is a new one (section 2).
- The pictures' driver is `scratchpad/integrator/shoot.mjs`; the gate runs are under `.turboslide/integrator-gate-1` to `-5` of the worktree (ignored by git).
