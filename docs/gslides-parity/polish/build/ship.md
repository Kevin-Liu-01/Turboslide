# The ship step's note

## Polish round, the ship step (2026-09-30)

The ship step of the polish round, read from 02:31Z to 02:45Z on 2026-09-30 in the worktree
`/Users/kevinliu/repos/Turboslide-live` (branch `polish/round` at `5d3d7748`, 30 commits over
the merge base `877eb690`, the lanes' uncommitted fix round hunks in the working tree as the
integrator's note lists them). Times are UTC. Every reading below is this step's own unless a
line names the verifier's pass.

### Verdict

**The ship is stopped by the rule of docs/POLISH.md 5.2.** The run of record on the enforce
preview reads 34 rows of unparkable features red with no green rerun, four of them earlier
rounds' `slides` rows that were green in the verifier's pass 1. Nothing was rebased, merged,
committed or pushed. `origin/main` stays at `bc01ccf4`; `polish/round` stays at `5d3d7748`;
production is unchanged. No ship json was written, so the parked list of record stays
`docs/gslides-parity/focus/ship-c1a7ff3.json`. The production gate, the new write probe, the
production pictures, the README rewrite, the release note and the production table did not run:
each follows a push that did not happen.

### The preconditions, each with this step's reading

| Precondition                                                   | Reading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b`                                     | exit 0 at 02:35Z on the working tree with the lanes' hunks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `node scripts/check.mjs --only 3,5`                            | step 3 ok in 1.1 s (`pnpm generate:contracts` leaves no diff, the generated files tracked). Step 5 `pnpm test` fails in 63 s on one test of 4615: `packages/import/src/__tests__/import.test.ts` "imports 85 slides in 8 sections", expected 92 to be 85. The test reads Kevin's checkout `/Users/kevinliu/repos/Prototemplate/deck`, which grew from 85 to 92 slides between 00:23Z and 01:15Z on 2026-09-30 (Prototemplate `d5d00f7`, "The speed marks"). 424 test files and 4608 tests pass. The verifier read the same suite green at 21:22Z on 2026-09-29, before the deck moved. Not the tree's; see "A new standing red" below         |
| Steps 1, 2, 4, 6 to 32 of the check                            | not rerun by this step: the tree is unchanged since the verifier's pass 2 ran steps 1 to 16 green (the newest source write is 21:16Z, pass 2 began 21:18Z; the only later writes are the verifier's own `VERIFICATION.md` section and the evidence files under `focus/verification/` and `polish/verify/`), and steps 7, 8 and 12 read the Prototemplate checkout that now has 92 slides                                                                                                                                                                                                                                                      |
| `git grep -n '<<<<<<<'` outside prose                          | empty; the five matches are pictures (binary)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The branch's contents                                          | `git diff --name-only 877eb690..polish/round` names no path under `.github/`, `decks/untitled-*`, `decks/e2e-*`, `scripts/__pycache__`, `.turboslide/` or `.vercel/`; `docs/gslides-parity/verification-3/{layout-shift.json,layout-shift.md,parity-audit.json}` are untouched against the base and clean in the working tree; no `.github/` folder exists                                                                                                                                                                                                                                                                                    |
| The last preview run with every row green apart from the parks | **fails.** The verifier's pass 2 run of record (`focus/verification/polish-verify2-preview-run1.json`, base `https://turboslide-pqodnqfj9-kl01s-projects.vercel.app` built from `5d3d7748` plus the uncommitted hunks, started 21:27Z, 15,321 s): 1019 rows, 897 passed, 82 failed, 40 not driven, `exitCode` 1. This step's own read of its `table`: 37 failed rows of unparkable features with no green in the once reruns (`polish-verify2-preview-rerun-specs.json`, `polish-verify2-preview-rerun-areas.json`); 34 after Kevin's two standing rows and `surface.domain.build-commit` (the bearer, not driven on a preview) are set aside |
| The memory tier's run of record                                | `polish-verify2-memory-run1.json` on 4449: 1019 rows, 915 passed, 80 failed, 24 not driven, `cost.editor-editing.calls` over its ceiling under the load; 36 unparkable rows red with no green rerun                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The bursts with three companions                               | the verifier's three runs clean on the fresh preview (pass 2 V.3); not rerun by this step, the tree unchanged since                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The rerun rule ("older than the last code change")             | the run of record is younger than the last code change, so no rerun was owed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### The unparkable rows red on the run of record, by feature and owner

Every row below reads `failed` in the run of record and `failed` or absent in the once reruns.
A row in parentheses is set aside by the rule's own exceptions.

- `slides` (the integrator with B1 and B5; the verifier's finding 1): `slides.numbers.apply`,
  `slides.layout.title-and-body-single`, `slides.layout.subtitle-prompt`,
  `slides.layout.new-slide-inherits`. Green in pass 1, red on both tiers now. The three sites
  are unchanged in the working tree at this step's read: `packages/chrome/src/editor-shell.ts`
  2592 (`slide.kind === 'title' ? 'split' : derivedLayout(slide)`),
  `packages/chrome/src/Filmstrip.tsx` 182 (`newSlideLayout`, `current.kind === 'title'`),
  `packages/render/src/deck.ts` 72 (`mode === 'skip-title' && slide.kind === 'title'`).
- `text` (B6's drivers per finding 2, B5 for the list on the title per finding 8):
  `text.autofit.title-wraps`, `text.bold.toolbar-marks-run`, `text.paragraph.toolbar-live`,
  `text.list.enter-tab-no-error`, `text.tail.heading-takes-list-indent`,
  `text.title.shrink-on-overflow`, `text.link.detection-setting`, `text.tail.size-reads-heading`.
- `share` (B5 for `collab.roster.go-to-slide`, finding 5; the integrator for R13 behind
  `collab.follow.anonymous-editor`; B5 for the rest): `share.dialog.open` (60 s timeout),
  `share.name-prompt.first-share` (180 s timeout), `share.name-prompt.never-mid-drag`,
  `collab.roster.go-to-slide`, `collab.follow.anonymous-editor` (`title.presence.follow` still
  `advanced: true` at `packages/chrome/src/menus/model.ts` 796 at this step's read).
- `decks` (B5; B6 for `trash.button-heights` and `polish.pages-sweep`): `decks.card.download`,
  `decks.file.open-upload-bundle`, `decks.file.import-slides-bundle`, `decks.trash.button-heights`,
  `decks.recent.keeps-new-deck`, `decks.card.rename-everywhere`, `decks.polish.pages-sweep`,
  `decks.thumbnail.never-502` (150 s under the load); (`decks.file.open-list-search`, Kevin's
  standing row).
- `sync` (the sync owner): `sync.structural.concurrent`, `sync.block.offline-replay-converges`
  (the admission class, B5's R15), `sync.reject.sentence-below-toolbar`;
  (`sync.title.concurrent-both-kept`, Kevin's standing row).
- `export` (B5; B6 for `zip.bundle` and `print.opens`): `export.zip.bundle`,
  `export.refusal.sentence-and-retry`, `export.print.opens`.
- `images` (B4): `images.options.reset` (Adjustments Reset writes nothing),
  `images.alt.focused-empty` (the focus lands on the body in the production build alone).
- `chrome` (B6): `chrome.chip.above-ring` (the driver's read, pass 1's finding 37).
- (`surface.domain.build-commit`: needs the bearer; the production run's row.)

The rows a rerun turned green, recorded as flaky by POLISH.md 5.2 and not counted above:
`decks.recent.drops-trashed`, `decks.home.load-budget`, `export.download.named-after-title`,
`export.picture.progress-and-capture`, `images.crop.dims-outside`, `brand.surfaces.viewer-and-show`,
`shaders.frame.reuse-and-prune`, `shaders.perf.editor-frame`.

The gate's mechanical `wouldPark` on the run of record names `tables`, `charts`, `diagrams`,
`wordart`, `inbox`, `brand`, `fonts`, `templates`, `assist`, `logos` and `shaders` (41 rows).
`tables`, `diagrams` and `wordart` read red through driver reads the verifier's pass 2 names as
B6's (R11, the label's one space, the letters' weight through the `b` elements) while the product
reads right by hand, so a ship on this tree would park controls that work. The list of record's
`notParked` exceptions for `brand`, `fonts` and `assist` hold on the same rows as before.

### The four things the ship waits on, in the verifier's order

1. Finding 1: a title that wraps converts the cover to a canvas, New slide after it makes a second
   title slide and Skip title slides stops skipping it. The three sites above read the slide's
   `kind` where the reducer's `deckTitleSource` and the fix's `retargetFieldRuns` read the grammar
   record's kind. Owner: the integrator with B1 and B5. `slides` is unparkable.
2. Finding 2: the driver requests nobody landed (B6's R11, R12, R22a, F5, the label's whitespace,
   the word art's `b` elements, the Check slides count; the integrator's R13) keep `text` and
   `share` rows red while the product reads right by hand. Either the drivers land or Kevin
   decides those rows are read by hand with the pictures named.
3. Finding 3: a title's Cmd+Z takes back part of the title in about one session of three (the
   typing group across the draft's first landing, `apps/studio/src/editor/controller.tsx` 1320,
   `undo-bursts.ts`; older than the round). Owner: B5 with the integrator.
4. Finding 4: `origin/main` moved eleven commits past the merge base while the round was built.
   This step's dry run (`git merge-tree --write-tree origin/main polish/round`, no ref touched)
   reads five files in conflict: `README.md`, `apps/studio/src/routes/decks.index.tsx`,
   `docs/FOCUS.md`, `docs/gslides-parity/focus/core-matrix.json`,
   `scripts/probes/core-matrix.test.mjs`; fourteen more auto-merge (`brand.spec.ts`,
   `docs/grammar.md`, `mcp-tools.json`, `openapi.json`, `Overlay.tsx`, `VersionsPanel.css`,
   `overlay-component.test.tsx`, `font-picker-model.ts`, `packages/render/src/slide.ts`,
   `catalog.test.ts`, `packages/schema/src/deck.ts`, `Gestures.tsx`, `gestures.test.ts`, the
   skill's `grammar.md`). The rebase also needs the working tree clean first: the lanes' fix
   round hunks (B5's whole fix round, B2's `place-insert.test.ts`, B1's lint sweep and
   `Tooltip.tsx`, B6's regenerated `README.md`, 36 files) are uncommitted and are the
   integrator's to commit by their owners' lists.

Beside those, the verifier's severity 2 findings in unparkable features stand: finding 5
(`collab.roster.go-to-slide`, B5), finding 8 (Bulleted list on the title refused, B5's R26),
finding 10 (alt text's focus on the blob tier, B4), finding 11 (`images.options.reset`, B4) and
finding 15 (the standing set of `decks`, `share`, `sync` and `export` rows above).

### A new standing red in the check chain, not the tree's

Kevin's Prototemplate deck has 92 slides since 2026-09-30 01:15Z (seven added under `deck/slides`,
the newest `70-skills-marks.html`). Three pins read 85: `packages/import/src/__tests__/import.test.ts`
lines 500 to 533 (check step 5), `scripts/check.mjs` step 8 (`r.slides!==85||r.sections!==8`) and
step 12's compare to the shoot. Until the pins move with a new shoot, or `TURBOSLIDE_PROTOTEMPLATE_DECK`
points at an 85 slide copy, `node scripts/check.mjs` stops at step 5 on this machine, and the ship
step's precondition "check green apart from the standing reds" needs this red recorded as the
environment's. Owner: the integrator (the pins) with Kevin (the deck).

### What production serves right now

- `https://www.turboslide.com` and `https://turboslide.vercel.app` both serve the client bundle
  `assets/index-BeRXIX63.js` (read from `/home` at 02:38Z). POLISH.md section 0's finding has
  moved on: the domain no longer serves an older build than Kevin's project.
- `/home` on both origins is B7's page from `origin/main` (`b67efa82`, `10c12e0b` and the home
  extract `bfa7e993`, `f0fff8e2`, `bc01ccf4`): the title "Turboslide, a slides editor in the
  browser", the hero lead "It has Google Slides' menus and shortcuts", the section head "Build
  the pitch, present it and send the link", the old hero fragment absent. Kevin's second ask is
  live on production from `main`; the verifier's severity 1 home items (the "Licence" heading,
  the two row navigation at 390, the hero's 395 KB at 2x) stand as pass 2 left them.
- `node scripts/hosted-smoke.mjs --base https://www.turboslide.com --token-env TURBOSLIDE_TOKEN`
  (through the round's token wrapper, nothing printed) at 02:36Z: 41 of 42 rows pass, 6 skipped
  by their flags. The one red is `build commit`: `/api/agent`'s `instance` names no commit on any
  of the three origins (`www.turboslide.com`, `turboslide-gt.vercel.app`, `turboslide.vercel.app`),
  which is expected: the stamp is B5's code of this round (`apps/studio/src/routes/api/agent.ts`
  `instanceFacts`) and has not shipped. `View > Play shaders` reads present, so the smoke's
  current-build row passes. The smoke wrote nothing (its template copy row is skipped without
  `--template-copy`).
- The cost rows of docs/SYNC.md 6.1 on production were not read by this step (no gate ran).

### The machine

Another round's integrator runs on this machine at the same time (a preview gate against
`https://turboslide-6nn6drhcy-kl01s-projects.vercel.app` and a local gate on port 4466 with
`--only accounts`, from a `people/integrator` scratch folder); the one minute load read 21 to 44
through this step. Those processes were left alone. This step started no dev server, took no lock,
created no deck on any deployment and ran no Playwright. The OIDC token in
`.turboslide/vercel-dev.env` was valid to 2026-09-30T02:47Z and was not used; the next preview
read refreshes it first (`vercel env pull .turboslide/vercel-dev.env --environment development --yes`).

### The recipe for the next attempt, once the four things land

1. The integrator commits the lanes' hunks by their owners' lists and formats the five source
   files the verifier's finding 23 names (`prettier --write`).
2. The pins for the Prototemplate deck move to its new count with a new shoot, or the check runs
   with `TURBOSLIDE_PROTOTEMPLATE_DECK` at an 85 slide copy; `node scripts/check.mjs` reads green
   apart from the recorded standing reds (19, 20, 21, 25, 26, 31 per pass 1).
3. `git fetch origin && git rebase origin/main polish/round`, the five conflicts resolved keeping
   both intents (the matrix and `core-matrix.test.mjs` count pins add up: the hotfixes' rows plus
   this round's), `node_modules/.bin/tsc -b` and the changed packages' suites after.
4. One enforce preview from the merged tree with the recorded command and the gate once, detached
   and polled every ten minutes; every driven core row of an unparkable feature green, the parks
   read from that run into `ship-<commit>.json` with `--emit-parked`.
5. Then the ship as the prompt names it: the fast forward onto `main`, the ship commit, the push,
   the production gate on `https://www.turboslide.com` (it serves `main`'s build now), the new
   write probe, the smoke with `--sha`, the pictures, the README and the release note, the table.

### POLISH.md section 7's questions, the defaults in the tree

1. The domain: the default (a redeploy of turboslide-gt from `main`) has happened outside this
   round; both origins serve one bundle. `TURBOSLIDE_PUBLIC_ORIGIN` is a project setting this
   step cannot read; the card's printed address comes from `site.ts` `productionOrigin`.
2. Tooltips on plain links and cards: the default is in the tree (`scripts/tooltip-audit.mjs`
   line 62 exempts `/home`; `HomeLink.tsx` spreads no `tipProps`).
3. The placeholder prompt under A1: the default, no change.
4. The Viewer link: the default, the editor's viewer floor at `/edit/<id>` (commit `6557d3d5`).
5. The double click on a shape's text: the default, the word under the pointer is selected
   (the verifier's pass 2 finding 12 reads it in the tree).
6. The root address: the default, `/` opens a fresh draft (`apps/studio/src/routes/index.tsx`
   redirects to `/new`).

### For Kevin

1. The ship is stopped on the verifier's four findings; the first is one mechanism at three
   sites (a converted cover read by `slide.kind`), and `slides` cannot park.
2. Your home page ask is already live on `www.turboslide.com` from `main`; the rest of the round
   (the table fixes, the text, the chrome, the pages) waits on the fixes above.
3. Your Prototemplate deck grew to 92 slides tonight; the import test and two check steps pin 85.
   Say whether the pins move to 92 with a new shoot.
4. The verifier's decisions for you stand (pass 2 V.10): the Follow row parked or unparked, the
   2 s join tick against the idle cost ceiling, the Cmd+Z grouping by time, the version pick's
   read only preview, the three semicolon sentences.
5. Nothing on Vercel needs your hand for the ship itself now; the production gate can run on the
   domain once the ship lands.
