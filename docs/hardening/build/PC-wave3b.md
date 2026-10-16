# PC, wave 3b: performance of the client bundles

Lane PC of the hardening round, wave 3b (`docs/hardening/HARDENING.md` 4.10), in
`/Users/kevinliu/repos/Turboslide-harden4` on `harden/wave3b`, made from `origin/main` `f7e97039`.
The node-server build was served on 4893 (4870 was held by wave 3a's server in
`Turboslide-harden3`) and the dev server on 4863. Every build was made with hidden source maps
(`TURBOSLIDE_CLIENT_SOURCEMAP=1`, the same chunk bytes) under `.turboslide/build.lock`, and its
client output was copied to the session's scratch folder (`pc/out-<label>`) before it was read. The
one minute load was 255 to 545 through the session: bytes and call counts are the verdicts, and
every timing below is a record. The builds held the other lanes' uncommitted work of the moment;
each reading names the files it judges.

## The pushes

| Push    | Commit                       | Closes                                          | Pin                                                                                               | Ships     |
| ------- | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| HR-PC#1 | `30db14a8a`                  | PERF-10                                         | `scripts/entry-graph.test.mjs`: the icon set's graph holds no schema module                       | now       |
| HR-PC#2 | `9acaa3487`                  | PERF-9 (the /decks ceiling), perf.md 11 in part | entry graph pins; `check-client-bundle.mjs`: /decks ceiling, the vendor chunk without app markers | now       |
| HR-PC#3 | `5d0295d29`                  | PERF-8, the inlined stills item                 | `check-client-bundle.mjs`: no webp data URL in a client chunk                                     | now       |
| HR-PC#4 | `193818cb7`, fix `63479cfdd` | PERF-5                                          | `perf-budget.mjs --write`, check `preload`: at most one server function call per card             | now       |
| HR-PC#5 | none                         | PERF-11                                         |                                                                                                   | not built |
| HR-PC#6 | none                         | PERF-12                                         |                                                                                                   | not built |

`63479cfdd` is prettier's padding of the row PC#4 rewrote in `docs/performance.md`; it ships with
PC#4.

### HR-PC#1: the shape glyphs from constants

The icon set imported `shapePath` for three glyphs, which put `shapes/definitions.ts` (221 KB) in
the graph of every page that draws an icon. The three paths are `shapePath(kind, 16, 12)`'s output
written out; `packages/chrome/src/__tests__/icons.test.ts` already held them equal.

| Reading (JavaScript loaded after settle) |          `f7e97039` |                                                                                        PC#1 |
| ---------------------------------------- | ------------------: | ------------------------------------------------------------------------------------------: |
| `/docs`                                  | 872,364 B, 11 files |                                                                         638,109 B, 10 files |
| `/docs/reference/block`                  |         1,097,400 B |                                                                                   863,145 B |
| `shapes-*.js` in the client output       |           234,190 B | gone; the table joins `deck-*.js`, which only the pages that load the document schema fetch |

The pin fails on `origin/main`'s `icons.tsx` and passes after.

### HR-PC#2: the root and the shared controls

| Reading                             |                             `f7e97039` |                                              PC#2 |
| ----------------------------------- | -------------------------------------: | ------------------------------------------------: |
| `/decks` preloads (ceiling 600,000) |                        698,800 B, fail |                                   564,388 B, pass |
| `/docs` preloads (ceiling 450,000)  |                        618,407 B, fail |                                   518,607 B, fail |
| `/signin` preloads                  |                              522,147 B |                                         465,415 B |
| `/deck/gt-brand` preloads           |                              533,092 B |                                         500,721 B |
| `/edit/gt-brand` preloads           |                            1,044,639 B |                                         990,145 B |
| `vendor` chunk                      | 518,333 B, 123,923 B of it app modules |                        341,275 B, libraries alone |
| the root's static closure           |                              518,362 B | 462,291 B in 4 chunks (`vendor`, `app` 120,274 B) |
| `/docs` JavaScript after settle     |                       638,109 B (PC#1) |                                         569,617 B |
| `/decks` (no decks) after settle    |                            1,343,157 B |                                       1,195,141 B |

What moved: the vendor group's test leaves out the start runtime's hydration path to the app's
router and an `app` group (the `$initial` tag) holds the app's root; the dither pipeline left the
root (`viewer/dither-factory.ts`); `DEFAULT_MENU_CONTEXT` and the context readers went to
`menus/context.ts` and the chord grammar to `menus/chords.ts`, so Menu loads neither the model
(66,656 B) nor the key tables; the page titles read `menus/page-words.ts`, so the root lost the strings file (25 KB); the decks page's card rows and the sign in gallery's
states are no longer exports of their route files; and `icons-base.tsx` holds `Icon`, a registry
and the 26 glyphs the pages outside the editor draw, which `icons.tsx` spreads and registers whole.

No empty icon frame and no page error on `/docs`, `/docs/shortcuts`, `/decks` with the card menu
open, `/deck/gt-brand`, `/edit/gt-brand`, and `/new` with Insert, Format, Slide and Edit open.

`/docs` stays over its ceiling. The root alone is 462,291 B, so no change to the docs' own chunks
can bring the page under 450,000 B: section "Not built" says what would.

### HR-PC#3: the gallery's stills as files

| Reading                                                  |                          PC#2 |                           PC#3 |
| -------------------------------------------------------- | ----------------------------: | -----------------------------: |
| `MaterialMount` chunk                                    | 138,944 B, 119 webp data URLs | 15,628 B, none; 122 webp files |
| `/deck/gt-brand` JavaScript after settle (budget 977 KB) |                   2,283,527 B |                    2,160,211 B |
| `/present/gt-brand` after settle (budget 1,172 KB)       |                   1,312,156 B |                    1,312,156 B |

The Animated pattern gallery on `/new` draws its 83 stills from the files (looked at in a picture
at 1440 by 900). The push carries one item of PERF-8; the rest is under "Not built".

### HR-PC#4: the decks list on intent

| Reading (dev server, 12 cards made by one visitor, no pointer movement) |                                     HEAD before |                             PC#4 |
| ----------------------------------------------------------------------- | ----------------------------------------------: | -------------------------------: |
| server function calls until the page settles                            | 22 (12 `readDeckCardFn`, 10 `readEditorDeckFn`) |            12 (`readDeckCardFn`) |
| the edit route's module                                                 |                         fetched with the loader | fetched once the list is in view |

A hover runs `readEditorDeckFn` once and the click opens the editor without running it again
(838 ms to a settled editor at load 300, a record). core-gate on the same server:
`decks.home.your-presentations`, `decks.list.read`, `decks.list.open-thumbnail`,
`decks.list.open-title`, `decks.list.open-recent`, `decks.card.menu-open-escape`,
`decks.card.present`, `decks.list.gt-brand-deck`, `decks.nav.back-forward`: 9 passed, retries zero.

## The lane's last gates

- `vitest run` of the whole repository on the tree after `63479cfdd` (with a 60 s test timeout,
  load 255 to 300): 588 files, 581 passed, 7 failed, none in this lane's packages. The seven: the
  CLI's browser driven `asset`, `canvas` and `dither` tests and `packages/materials` capture (time
  outs at the machine's load), `export-pptx` (a 180 s hook time out), the schema's 10,000 pair
  convergence property (a time out), `import.test.ts` (93 slides read against 95, the
  Prototemplate deck it reads from another checkout), and the CLI's `version diff groups the
mutations` (an assertion that failed in the run before PC#2 as well).
- chrome, viewer and studio: the chrome files that timed out at load 350 rerun with a 90 s
  timeout (22 files, 295 passed), the viewer project (58 files, 561 passed), the studio routes,
  docs and components (32 files, 279 passed).
- `tsc -b` on the tree at the PC#2 commit found the two errors fixed in it; its other errors were
  in other lanes' uncommitted tests. `tsc -p apps/studio` and `tsc -p packages/chrome` are clean
  at each commit.
- The brand lint in enforce mode: 0 open findings and one stale accepted entry
  (`packages/chrome/src/dialogs/ImportSlides.tsx`, untouched by this lane) at every push; the
  competitor guard, the core matrix tests and `what-works --check` passed.

## Not built, with the reason and the next step

- **PC#2, `apps/cli/src/store-actions.ts` out of the `EditorRoot` chunk.** It is the editor's own
  action code: `editor/controller.tsx` calls about 60 of its plan functions (36,661 B of the
  521,649 B chunk). A chunk group would move the bytes without changing what `/edit` loads and adds
  a chunk import cycle risk; the largest chunk stays under its 600,000 B ceiling.
- **PC#3, the viewer's 977 KB and the presenter's 1,172 KB budgets.** Measured on the PC#3 build:
  `/deck/gt-brand` loads `Slideshow` 492,874 B (the editor's shell: `ViewerShell` imports
  `EditorShell`, so the inspectors, the themes panel, Format options and the toolbar tail come
  with it), `deck` 428,360 B (the schema, zod and the shape table), `vendor` 341,275 B, `actions`
  184,329 B, `app` 120,274 B, `useStudioSession` 96,290 B (mostly the renderer), `editor-shell`
  66,840 B, `model` 61,059 B. The action table reaches both pages through the window automation:
  `packages/agent/src/dispatch.ts`, `window/registry.ts` and `generate/describe.ts` (through
  `window/invoke.ts`) import `@turboslide/schema/actions` at their top. zod 4.6's classic schemas
  import the JSON Schema processors for `.toJSONSchema()`, so that export cannot leave without
  zod/mini. Three pushes would close most of it: the themes panel and Format options behind
  `lib/lazyDialog.ts` and preloaded on the first menu open (about 100 KB from the viewer); the
  window automation's action ids as a constant and the dispatcher's table loaded on the first
  invoke (184 KB from both pages; `/present` then near 1,128 KB, under its budget); and a viewer
  shell that does not import `EditorShell`. The viewer's own budget needs the third.
- **PC#5, docs without hydration (PERF-11).** Not built. Its budget, `/docs/reference/block` at
  most 450 KB after settle, is under the root's own floor on the PC#2 build: `vendor` 341,275 B and
  `app` 120,274 B load on every page. Reading on the PC#2 build: `/docs/reference/block` 794,653 B
  after settle (1,097,400 B on `f7e97039`), the article's compiled chunk 242,023 B of it; `/docs`
  preloads 518,607 B. The `app` chunk's largest parts are the renderer's block CSS, which the root inlines in every head and which ships with its comments (a 29,132 B string in the `app` chunk; `withoutCssComments` strips them at run time), the tooltip with floating-ui (about 23 KB, through the root's
  not found page and the default error page), the auth model and words (7,931 B, through the
  sign in page's and the decks page's loaders), and the route files' exports. The next step is the
  root diet (the block CSS as a stylesheet, the tooltip out of the root), then the article as
  prerendered HTML with the search window, the theme button and the sidebar toggle hydrated.
- **PC#6, a 320 px twin for the filmstrip (PERF-12).** Not built. Reproduced on the PC#3 build:
  `/deck/gt-brand` draws 17 sidebar clones whose pictures decode at up to 1600 px for frames at
  most 193 px wide (15 over 400 px), and loads 1,985,695 B of images in 16 files; `/edit/gt-brand`
  2,250,063 B in 17. The clones are the renderer's HTML for each slide, so the 320 px twin needs
  four parts beyond the spec's two files: the twin written by the upload path and for the seed
  deck's 210 assets (a build step or committed files), a key the assets route serves under the
  access rules of K1#3 and SD#6, the asset record saying the twin exists, and the clone choosing it
  (a `srcset` with `sizes` set from the clone's frame, since a scaled clone's layout width is the
  slide's).
- **PC#7.** Not started.

## Requests

- To the orchestrator and lane C: the `--amend` of 03:18 is repaired (see the working notes);
  lane C's notes commit is `d7042dd61`.
- To lane C's request about this lane's two vite config type errors: both were fixed before the
  PC#2 commit (`tags: ['$initial' as const]`, the unused `resolveEffect` import); `tsc -p
apps/studio` and `tsc -p packages/chrome` are clean on `9acaa3487`.
- To the DD lane and any lane that edits `packages/chrome/src/Select.tsx`, `Menu.tsx`,
  `Dialog.tsx` or `Snackbar.tsx`: they import `Icon` from `./icons-base` since PC#2; a copy of the
  file from before PC#2 brings the whole icon table back into `/decks` (over its ceiling), and
  `scripts/entry-graph.test.mjs` fails on it.
- To the C lane (owner of `AGENTS.md`): no new `import()` site was added in this wave; the
  dispatcher push named above would add one in `packages/agent`, and AGENTS.md's list of the
  browser graph's `import()` sites would gain it.
- To the ship step: PC#2 changes the client chunk layout (`vendor` libraries alone, a new `app`
  chunk); the hosted smoke reads no chunk names, and `check-client-bundle.mjs` reads the heads.

## Working notes (kept as the lane goes, for a restart)

- 21:35 local: started. Load 281. Worktree clean at `f7e97039`. No `.turboslide` folder yet.
- 21:38 to 21:51 local: baseline node-server build of `f7e97039` (hidden maps, `TURBOSLIDE_CLIENT_SOURCEMAP=1`), 786 s at load 334 to 542; client output copied to the scratch folder `pc/out-base`.
- Baseline `check-client-bundle.mjs` (served on 4893, load 368): `/decks` preloads 12 chunks, 698,800 B (ceiling 600,000, FAIL); `/docs` 7 chunks, 618,407 B (ceiling 450,000, FAIL); `/deck/gt-brand` 533,092; `/edit/gt-brand` 1,044,639; `/signin` 522,147; largest chunk `EditorRoot` 519,505.
- Baseline browser probe (scratch `pc/probe.mjs`, Chrome for Testing 1217, 1440 by 900, settle = no new resource for 3 s; load about 400): `/docs` 872,364 B of JavaScript in 11 files (with `shapes-*.js` 234,190); `/docs/reference/block` 1,097,400 (the article chunk 242,024, shapes 234,190); `/deck/gt-brand` 2,280,443 in 48 files and 1,986,896 B of images in 17; `/present/gt-brand` 1,337,396 in 20; `/decks` (no decks) 1,343,157 in 21 (shapes, `deck-*.js` 194,019 and `actions-*.js` 184,352 among them).
- Vendor (the entry chunk; `index-*.js` is 29 B) is 518,333 B: 361,199 B of libraries and 123,923 B of app modules, the largest `menus/strings.ts` 25,113, the dither stack about 33 KB (through `router.tsx`'s `setDitherWorkerFactory`), `Tooltip` 4,683, the auth model and words 7,918, and the non split parts of the route files (`decks.index.tsx` keeps its exports in the root graph; `dev.auth.tsx` keeps `GALLERY_STATES` because it is exported).
- 22:03 local: build lock released.
- PC#1 code done: `icons.tsx` draws the three shape glyphs from constants; `scripts/entry-graph.test.mjs` gained a static runtime graph walker and the pin (fails on `origin/main`'s `icons.tsx`: "expected true to be false"; passes after).
- 01:40 local (Oct 12): HR-PC#1 committed as `30db14a8a`. PC#1 build (`pc/out-pc1`, 472 s at load 384 to 445): no `shapes-*.js`; `/docs` 638,109 B (from 872,364), `/docs/reference/block` 863,145 (from 1,097,400); `/deck/gt-brand`, `/present/gt-brand`, `/decks` unchanged (the shape table joined `deck-*.js`, 428,327 B, which they load for the schema). check-client-bundle: `/docs` 618,342, `/decks` 698,796 (still over). tsc -b: 4 errors, all in other lanes' uncommitted tests (select.test.tsx, link-popover.test.ts). Brand lint: 0 open, 1 stale accepted entry (ImportSlides.tsx, not this lane's).
- The machine slept or the session paused between 22:45 and 01:34 local: background servers were killed. Restart a server with `pc/serve.sh` (port 4893).
- PC#4 code done in the tree (not committed): `decks.index.tsx` links preload on intent; `useEditorCodeInView` loads the edit route's chunk once the cards or rows are in view; the `index` prop and `VIEWPORT_PRELOAD_CARDS` are gone.
- 01:49 local: my PC#1 build left `.turboslide/build.lock` held from 22:09 to 01:49 (build.sh keeps the lock for the readings; I released it late). Released at 01:49; the PC#2 build took it.
- 02:50 local: HR-PC#2 committed as `9acaa3487` (34 files). decks.index.tsx and vite.deploy.config.ts were staged from PC#2-only versions (HEAD plus this push's hunks; `git hash-object` and `update-index`), so PC#4's hunks in decks.index.tsx and lane O's plugin hunk in vite.deploy.config.ts stay unstaged. The DD lane's commit of Select.tsx had dropped my `icons-base` import once; re-applied before the commit.
- PC#2 readings (pc2b build, load 350 to 445): /decks preload 564,388 (passes 600,000); /docs 518,607 (over 450,000); vendor 341,275 with no app marker; root closure 462,291. After settle: /docs 569,617; /decks (no decks) 1,195,141 (still loads deck-_.js 428 KB and actions-_.js 184 KB through server/download.ts's top level `ACTIONS` import, kept as a side effect import; PC#3 or PC#4 to take on); /present 1,312,156; /deck 2,283,527.
- Not done in PC#2: store-actions.ts out of the EditorRoot chunk (the controller uses its plan functions; a group only moves bytes).
- 03:02 local: HR-PC#3 committed as `5d0295d29` (previews as files; MaterialMount 138,944 to 15,628 B; /deck after settle 2,283,527 to 2,160,211 B). Build lock released after its readings.
- 03:15 local: HR-PC#4 committed. Before (HEAD's decks page, dev server): 22 server function calls with 12 cards (10 readEditorDeckFn); after: 12, all readDeckCardFn. 9 decks rows passed.
- 03:18 local: an `--amend` meant to put prettier's padding of performance.md row 58 into my PC#4 commit landed on lane C's notes commit `d7042dd61`, which C committed between my HEAD check and the amend. Repaired under the git lock: HEAD set back to `d7042dd61` (`git update-ref` with the old value checked; C's file unchanged) and the padding committed as `HR-PC#4 (fix)` `63479cfdd`. Lane C's notes commit is `d7042dd61`; `a67713502` no longer exists on the branch.
