# The ship step's note, second attempt

## Polish round, the ship step's second attempt (2026-09-30)

The ship step of the polish round's finish, read from 06:14Z to 12:15Z on 2026-09-30 in the worktree
`/Users/kevinliu/repos/Turboslide-live` (branch `polish/round` at `abebef47`, the merge of
`origin/main` `bc01ccf4` into the round; 55 commits over the merge base `877eb690`). Times are UTC.
Every reading below is this step's own unless a line names the verifier's pass 3 or the integrator's
check chain. The step's one job beyond the preconditions was the run of record the verifier's pass 3
could not start, and it ran: the whole matrix on the enforce preview of the merged tree, then the
once reruns of docs/POLISH.md 5.2 narrowed to the red rows.

### Verdict

**The ship is stopped by the rule of docs/POLISH.md 5.2 and by two of the prompt's preconditions.**
The run of record on the enforce preview built from the merged tree reads 27 rows of unparkable
features red; 21 of them read red again on the once rerun with no code change between, three read
green on it (flaky by 5.2, their class recorded below), one was read once, and two are set aside by
the rule's own exceptions (Kevin's standing row, the bearer row). The tables below name them. Beside the rule: check step 18 is a new red of the tree (B5's Version history window
list draws a second hairline beside the panel's edge), check step 28 is a new red of the environment
(two `brace-expansion` advisories the audit allowlist does not carry), and the verifier's pass 3
findings 2 and 3 (Bulleted list on the title drops the title's size; a shader ground carries two
blank white boxes) stand under 5.3 with nobody's fix in the tree. Nothing was merged, committed or
pushed. `origin/main` stays at `bc01ccf4` (fetched at 06:16Z and again at 12:10Z, unchanged);
`polish/round` stays at `abebef47`; production is unchanged. No ship json was written, so the parked
list of record stays `docs/gslides-parity/focus/ship-c1a7ff3.json`. The production gate, the new
write probe, the production pictures, the README rewrite, the release note and the production table
did not run: each follows a push that did not happen.

### The preconditions, each with this step's reading

| Precondition                                                   | Reading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b`                                     | exit 0 in 5.3 s at 06:17Z (incremental; the integrator's `--force` read on the same tree exit 0 at 02:57Z), a one minute load of 17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The contracts current                                          | `node src/generate/main.ts` from `packages/agent` at 06:20Z: "generate:contracts: 14 files current", `git status` unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `git grep -n '<<<<<<<'` outside prose                          | empty; the matches are the milestone documents, ship notes and pictures that name the command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| The branch's contents                                          | `git diff --name-only 877eb690..HEAD` names no path under `.github/`, `decks/untitled-*`, `decks/e2e-*`, `scripts/__pycache__`, `.turboslide/` or `.vercel/`; `docs/gslides-parity/verification-3/{layout-shift.json,layout-shift.md,parity-audit.json}` restored from HEAD after the chain (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `node scripts/check.mjs` green apart from the recorded reds    | **fails on two new reds.** The integrator's finish driver (`drive-check.mjs`, 05:37Z to 06:31Z, `TURBOSLIDE_PROTOTEMPLATE_DECK` at the 85 slide copy) read 1 to 17 ok; **18 FAIL, new, the tree's** (52.5 s: `turboslide lint --chrome` on `/edit/gt-brand` reads `editorPanel: 1 finding` at 1440, 1280 and 390 in both appearances, "double v@1120 gap 1: ts-panel.ts-chrome \| ts-versions-list.is-window (99px)"); 19 FAIL (prettier, standing); 20 FAIL (the parity audit, standing, 1,128 s); 21 FAIL (the round two specs, standing, 836 s at a load of 28: 20 reds, `present.spec.ts:449` among them); 22 ok (40.4 s); 23 skip (the fonts venv); 24 ok (72.3 s); 25 FAIL (the container verification, standing); 26 FAIL (the round three specs, standing, 396 s, 7 reds); 27 skip (no preview on 4344); **28 FAIL, new, the environment's** (0.5 s: `pnpm audit --prod --audit-level=high` reads two high advisories on `brace-expansion`, GHSA-qhr7-859c-m2p7 and GHSA-6j4f-fj2g-mc7p, 0 accepted in `scripts/audit-allow.json`; pass 1 read 28 ok on 2026-09-28, so the advisories are the registry's since); 29 ok (2.7 s); 30 ok (11.8 s); 31 FAIL (the perf budget, standing: 113 of 151 budgets met); 32 not run by the driver (the finish's own gate stands for it). Step 5's Prototemplate pin was met by the 85 slide archive the driver names |
| The run of record on the enforce preview, every core row green | **fails.** Below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `origin/main` past `bc01ccf4`                                  | no: `git fetch origin` at 06:16Z and 12:10Z, `bc01ccf4` both times, an ancestor of HEAD; no second merge was owed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

The chain's leftovers, restored before this note: `docs/gslides-parity/verification-3/parity-audit.json`
(rewritten by step 20) and `decks/gt-brand/import-report.json` (the driver's `from` path) with
`git checkout --`; the chain's `decks/e2e-tasks/` was gone by 06:16Z. One scratch deck of the chain's
own is still under `decks/`: `decks/untitled-20260930-x21v/` (step 26's, on the runner's local store;
untracked, never committed; the next localhost gate passes `--allow-scratch` or the integrator removes
it as pass 1 removed `du21`). Step 31's `untitled-20260930-ucbz` lived on the tmp store and is gone.

### The run of record on the enforce preview

The preview is the verifier's pass 3 deployment `https://turboslide-lav4xmwv1-kl01s-projects.vercel.app`,
built from `abebef47` at 05:46Z with the recorded command (the six `-e` variables, the two secrets minted
inside, never `--prod`). The gate waited on the people round's gate processes as the prompt asks
(`pgrep` every five minutes from 06:18Z; three to seven `core-gate.mjs` processes at every read, the
people round queuing reruns behind its full runs) and started at the hour's bound, 07:13:32Z, beside
them, at a one minute load of 32.8. The token wrapper is the round's `<scratchpad>/polish/with-tokens.mjs`
(the OIDC token of `.turboslide/vercel-dev.env`, valid to 14:50Z; nothing printed). The command:
`node scripts/probes/core-gate.mjs --base <preview> --out <scratch>/gate-preview --parked
docs/gslides-parity/focus/ship-c1a7ff3.json --matrix docs/gslides-parity/focus/verification/polish-finish-preview-run1.json --allow-scratch`
(the flag for the chain's folder under `decks/`; the gate read nothing under `decks/` for a deployment
base). Detached, its log polled every ten minutes.

| Run                                           | Time, load                                                                                                                                                                                        | Result and ledgers                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The run of record (the whole matrix)          | 07:13:32Z to 11:01:48Z, 13,696 s; load 32.8 at the start, 3 to 27 through the walk, **63 at 09:08Z** during the specs (the people round's `vite build` and its own specs beside), 14.6 at the end | **1020 rows: 922 passed, 60 failed, 38 not driven (1 manual), 0 no step; verdict failed; retries zero; cost rows over their ceiling 0; exit 1.** The walk: 796 steps, 770 ok, 12 failed, 14 not driven, 4,840 s, 296 console errors (158 resource 404s, 69 CORS refusals of the public store host and their 69 `ERR_FAILED`, the preview's store class). `focus/verification/polish-finish-preview-run1.json`, `-core-gate.json`, `-core-matrix.md`, `-core-walk.md`, `-cost-probe.json` |
| The once rerun of the failed spec rows (5.2)  | `--only specs --rows <46 ids>`, 11:03:12Z to 11:55:18Z, 3,127 s; load 17 at the start, 2 to 17 through                                                                                            | 46 rows: 6 passed, 39 failed, 1 not driven (`decks.polish.pages-sweep`, skipped by its own guard in a narrowed run); exit 1. `polish-finish-preview-rerun-specs.json`, `-core-gate.json`, `-core-matrix.md`                                                                                                                                                                                                                                                                              |
| The once rerun of the failed walk rows' areas | `--only probe --areas share,inbox,brand,fonts,logos,shaders,polish-text,polish-objects`, 11:55:18Z to 12:09:21Z, 842 s; load 2.9 to 5.9                                                           | 95 rows: 79 passed, 10 failed, 6 not driven; exit 1. `polish-finish-preview-rerun-areas.json`, `-core-gate.json`, `-core-walk.md`                                                                                                                                                                                                                                                                                                                                                        |

The five cost rows read not driven on the preview (no bearer for `sync.status` on a preview, the
same as pass 2); `cost.editor-hidden.calls` is the headless visibility class. The bearer rows
(`brand.agent.set-get`, `fonts.agent.font-list`, `surface.domain.build-commit`, the `logos.index.*`,
`assist.*.agent-*` and `shaders.agent.*` rows) read red or not driven for the same reason as in every
preview run: the bearer lives on production alone.

#### The unparkable rows red on the run of record, by feature and owner

Every row below reads `failed` in the run of record and `failed` again on the once rerun (the
narrowed specs at a load of 2 to 17, the narrowed areas at 3 to 6), so the load class of the run of
record does not explain them. A row in parentheses is set aside by the rule's own exceptions.

- `decks` (B5; B6 for `trash.button-heights` and `polish.pages-sweep`): `decks.trash.restore`
  (90 s timeout twice), `decks.trash.delete-forever-button` (`locator.waitFor` 30 s twice),
  `decks.card.download` ("the card menu mints the bundle ticket and starts the download"),
  `decks.file.open-upload-bundle` ("the bundle opens as a new deck at /edit/<id>"),
  `decks.file.import-slides-bundle` (the run of record: "status 400: Not a deck bundle: no
  manifest.json at the root of the archive"; the rerun: `waitForFunction` 90 s),
  `decks.trash.button-heights` ("Empty trash is the page's one solid button"),
  `decks.recent.keeps-new-deck` ("File > Open lists it"), `decks.polish.pages-sweep` (a deep equality
  on the run of record; skipped by its guard on the narrowed rerun, so read once),
  `decks.thumbnail.never-502` (150 s timeout; the rerun's `beforeAll` 60 s). (`decks.file.open-list-search`,
  Kevin's standing row, never chased: green on the run of record's walk, red on the areas rerun.)
- `share` (B5; the integrator for R13 behind `collab.follow.anonymous-editor`): `share.dialog.open`
  (60 s timeout twice), `share.dialog.more-row` (`waitForFunction` 90 s twice),
  `share.name-prompt.first-share` ("the name shows on the presence chip in the second browser within
  35 s"), `share.name-prompt.never-mid-drag` ("never over the sheet"), `collab.follow.anonymous-editor`
  ("the roster lists Follow for an anonymous editor": `title.presence.follow` still `advanced: true`,
  Kevin's decision).
- `sync` (the sync owner): `sync.structural.concurrent` ("the loser's reject card is shown"),
  `sync.block.offline-replay-converges` ("A's resend carries the offset shifted past B's words", the
  admission class of B5's R15), `sync.reject.sentence-below-toolbar` ("one snackbar sentence").
  (`sync.title.concurrent-both-kept`, Kevin's standing row.)
- `export` (B5; B6 for `zip.bundle` and `print.opens`; B4 for `shaders.export.pdf-frame`):
  `export.zip.bundle` ("the snackbar names the bundle"), `export.refusal.sentence-and-retry` ("after
  two 429s no file"), `export.print.opens` ("the checked box shows the chrome's tick"),
  `shaders.export.pdf-frame` ("the image's aspect is the box's"; the row's feature is `export`).
- `text` (B1 with B5): `text.tail.heading-takes-list-indent`: Bulleted list written, Increase indent
  written, **Paint format armed false** on the title placeholder (the row's third half; B5's R19 to
  B1, `packages/viewer/src/Editor.tsx` `armPaint` and `clipboard.ts` `paintFormatOf` read no field of
  a fixed kind's pseudo block). Twice.
- (`surface.domain.build-commit`: the bearer, the production run's row.)

Six rows read red in the run of record and green on the rerun with no code change; POLISH.md 5.2
calls them flaky and 5.4 asks for their class: `decks.list.open-title` (60 s timeout at a load of 63,
green at 17: the throttled tab class of docs/OBJECTS.md 6.3), `collab.presence.join-within-2s`
(B's chip past 2 s at the load, green after), `share.copy-view-link` (the clipboard read a `/deck/<id>`
link at the load), `brand.colors.collab-rerender` (the second browser's re-render past 5 s at the load),
`shaders.frame.reuse-and-prune` (the 1.2 frame at the load), `templates.save.same-name-replaces`
(a parked feature). On the walk's side `brand.background.enter-keeps-open` (a 30 s `boundingBox`
timeout at 07:45Z), `shaders.panel.slider-live-undo` and `inbox.settings-persist` read green on the
areas rerun. Each is one reading in a recorded class; a second reading fails the row.

#### The parkable rows red twice, and what a ship on this tree would park

The gate's mechanical `wouldPark` on the run of record names `charts`, `diagrams`, `inbox`, `brand`,
`fonts`, `templates`, `assist`, `logos` and `shaders` (pass 2 named `tables` and `wordart` too; their
rows read green now that B6's drivers landed). By 5.2 a red row with `parks` parks those ids and a red
row without parks the feature whole, so a ship on this tree would park:

- `charts` whole through `charts.export.pdf` ("North is in the PDF text", twice; no parks);
- `diagrams` whole through `diagrams.label.double-click-selects-word` (a double click on "Step 2"
  selects "2" and typing gives "Step plus"; the text box keeps the caret; question 5's default in
  the tree, the row's expectation the other way; twice; no parks);
- `fonts` whole through `fonts.field.own-face` (the title takes Fraunces and Cmd+Z takes it back,
  but the reading ran past the statement slide and the exports; twice; no parks) beside the bearer
  row `fonts.agent.font-list`; the list of record's `notParked` exception for `fonts` names other rows;
- `assist` whole through `assist.viewer.disabled`, `assist.panel.words-and-layout` and
  `assist.polish.agent-sweep` (twice each; no parks); the list of record's exception for `assist`
  ("every other assist row is green") no longer holds;
- `brand` whole through the bearer row `brand.agent.set-get` (the walk's HTTP half needs the bearer;
  the window API half passed) unless the list's exception carries;
- `logos`: `dialog.logo.group.recent` (`logos.picker.recents`), `dialog.logo.group.brand`
  (`logos.picker.your-brand`), and the feature whole through `logos.dialog.results-in-view` and
  `logos.dialog.sentence-case-whole-names` (no parks; twice);
- `shaders`: `dialog.background.shader` (`shaders.background.place-answers`, 23.6 s and 24.0 s on the
  hosted render, already parked), and the feature whole through `shaders.frame.large-png-lands`,
  `shaders.gallery.words-and-head` and `shaders.insert.free-rectangle` (no parks; twice);
- `present` whole through `present.bar.no-dead-control` (no parks; twice);
- `svg`: the four `intake.svg.*` ids through `svg.render.vector-at-zoom` (the list's exception) and
  `svg.render.picture-gestures` (every gesture wrote, drew and undid up to the mask read; twice), and
  `picture.svg.copy` (`svg.copy.markup`, already parked);
- the rows already parked or in parked features, unchanged: `view.live-pointers.second-browser`,
  `versions.show-changes-marks`, the three `inbox` rows, the four `templates` rows.

Most of these are the polish round's own rows (`logos.dialog.*`, `shaders.gallery.words-and-head`,
`shaders.insert.free-rectangle`, `present.bar.no-dead-control`, `svg.render.picture-gestures`,
`diagrams.label.double-click-selects-word`, `decks.trash.button-heights`, `decks.recent.keeps-new-deck`,
`share.name-prompt.*`, `export.refusal.sentence-and-retry`, `export.print.opens`,
`sync.reject.sentence-below-toolbar`) and read red in pass 2's run of record too, where the verifier
attributed several to driver reads while the product read right by hand. Nobody landed those drivers
or changed those expectations in fix round 2, so the readings repeat. A ship on this tree would park
controls the verifier read as working by hand, which the ship note of 02:40Z already named.

`brand.objects.kit-colours-first` read "not on this build" in the run of record and `failed` on the
narrowed areas rerun ("no table from the tables area to read"): the narrowed run's own artefact, the
tables area not in its `--areas`; the run of record's reading stands.

### The hand findings of pass 3, unchanged in the tree

Nothing landed in the tree between the verifier's pass 3 and this step (`git status` at 06:14Z: the
chain's two files and the verifier's own section and pictures). So POLISH.md 5.3 holds the ship on:

1. **Finding 2 (severity 2, B5)**: Bulleted list on the title placeholder turns the 88 px heading into
   a 20 px List block whose prompt reads "Click to add text". `apps/cli/src/store-actions.ts`
   `listBlockFrom` (line 2897) builds `{ type: 'plain', items }` from a heading with no typography;
   the fix carries the level's size and weight into the list block. `text` is unparkable; the row
   `text.tail.heading-takes-list-indent` reads "written" and does not see it.
2. **Finding 3 (severity 2, B4 with the integrator)**: a shader placed as the background carries two
   blank white rectangles at the mark's and the counter's corners, pixels of the hosted frame. The
   studio's `slide.setBackgroundMaterial` runs `apps/cli/src/record-actions.ts` `setBackgroundMaterial`
   (line 473), which captures through `deps.captureMaterial` (`apps/studio/src/server/actions.ts` 831,
   `boundedHostedCapture` into `material.capture` with `role: 'frame'`) and never reads the `frame` the
   dialog now sends (B5's R9, the delegation to `packages/materials/src/actions.ts`
   `placeClientBackgroundFrame`, line 844, is not wired on the studio); the capture's plates are B4's
   in `packages/materials/src/capture.ts`. The row is parked by `dialog.background.shader`, so the
   defect is behind Advanced tools.
3. **Finding 1 (check step 18, B5)**: `packages/chrome/src/VersionsPanel.css` `.ts-versions-list.is-window`
   (line 344) draws `border-left: 1px solid var(--pt-hair-soft)` 1 px inside `Panel.css` `.ts-panel`'s
   `border-left` (line 15); the window list sits at the panel's edge since the round's window grouping.
   The border moves to the rows' 16 px inset or goes.

### The rows and the owners, in one list

| Owner          | What stops the ship                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B5             | check step 18 (the hairline); finding 2 (the list's typography); the `decks` rows `trash.restore`, `trash.delete-forever-button`, `card.download`, `file.open-upload-bundle`, `file.import-slides-bundle`, `recent.keeps-new-deck`, `thumbnail.never-502`; the `share` rows `dialog.open`, `dialog.more-row`, `name-prompt.first-share`, `name-prompt.never-mid-drag`; the `export` rows `refusal.sentence-and-retry`; R19 with B1 |
| B6             | `decks.trash.button-heights`, `decks.polish.pages-sweep`, `export.zip.bundle`, `export.print.opens`; the driver reads behind the parkable reds of this round (`logos.dialog.*`, `shaders.gallery.words-and-head`, `shaders.insert.free-rectangle`, `present.bar.no-dead-control`, `svg.render.picture-gestures`) or Kevin's word that they are read by hand                                                                        |
| B4             | finding 3 (the capture's plates) with the integrator (R9's delegation); `shaders.export.pdf-frame`, `shaders.frame.large-png-lands`                                                                                                                                                                                                                                                                                                |
| B1             | R19 (Paint format arms on a fixed kind's field; `text.tail.heading-takes-list-indent`); `diagrams.label.double-click-selects-word` with Kevin's answer to question 5                                                                                                                                                                                                                                                               |
| The sync owner | `sync.structural.concurrent`, `sync.block.offline-replay-converges`, `sync.reject.sentence-below-toolbar`                                                                                                                                                                                                                                                                                                                          |
| The integrator | R13 with Kevin's word (`collab.follow.anonymous-editor`); check step 28 (an entry in `scripts/audit-allow.json` for the two `brace-expansion` advisories with an expiry, or the dependency bumped, which needs `pnpm install`, outside a lane's rules); the `assist` exception of the list of record, which no longer holds; the chain's `decks/untitled-20260930-x21v/`                                                           |
| Kevin          | the Follow row's park; question 5 (the double click on a diagram's label); whether the polish round's rows the verifier read right by hand ship with the pictures named while their drivers stay red; the Prototemplate pin (85 against 92)                                                                                                                                                                                        |

### The store sweep

Every scratch deck this step could name on the preview answers 404 at `/edit/<id>` through the
wrapper (`<scratch>/polish/ship2/deck-status.mjs`, the OIDC header, ids and statuses alone): the run
of record's walk deck `untitled-20260930-hhbu` and the twelve ids its log and `specs.json` name
(`run1-deck-ids.txt`, `run1-log-deck-ids.txt`: 8 and 12 read 404), the specs rerun's five
(`rerun-specs-deck-ids.txt`), the areas rerun's walk deck `untitled-20260930-r9al` and its five
(`rerun-all-deck-ids.txt`, 6 read 404). The gate's cleanup rows and the specs' own teardowns did the
trashing; a spec's context that names no id in its ledger is its teardown's. No template was written
(`templates.default.use-for-new` not driven by its own rule). No deck was made on production.

### The machine

The people round's pipeline ran its verifier's gates through this step (a local gate on 4467, two
full preview gates on `turboslide-emiobcraf` and `turboslide-46wkqjmuw`, narrowed reruns queued
behind them, a `vite build` of `Turboslide-people` at 09:07Z); the one minute load read 2 to 63
(the peak at 09:08Z, 108 Chromium processes). Those processes were left alone. This step started no
dev server, took no lock (every drive ran on the deployment), ran no Playwright of its own, deployed
nothing, and wrote nothing on Vercel or GitHub. The memory tier's gate on 4448 did not run: the run of
record is the preview's, and a second gate beside the people round's would have doubled the load that
already poisoned the specs.

### The recipe for the next attempt

1. B5 lands the hairline (step 18), the list's typography (finding 2) and its `decks`, `share` and
   `export` rows; B4 the capture's plates with the integrator's R9 delegation; B1 R19; the sync owner
   its three rows; B6 its four rows and the drivers of this round's parkable rows, or Kevin says they
   are read by hand with the pictures named.
2. The integrator adds the two advisories to `scripts/audit-allow.json` with an expiry (or Kevin bumps
   the dependency), so step 28 reads ok; the Prototemplate pin moves or the chain keeps the 85 slide
   archive; `node scripts/check.mjs` reads green apart from 19, 20, 21, 23, 25, 26, 27 and 31.
3. `git fetch origin`; if `origin/main` moved, `git merge origin/main` with both intents, the contracts
   regenerated, `tsc -b` and the suites.
4. One enforce preview from the tree with the recorded command; after the `pgrep` wait, the gate once
   (`--matrix …/polish-finish-preview-run2.json`), detached and polled every ten minutes, at a load
   under 20 if the machine allows it (the specs of this run read six timing reds at 63); the once
   reruns narrowed; every unparkable row green; the parks read from that run into `ship-<commit>.json`
   with `--emit-parked`, the `notParked` exceptions rewritten for `brand`, `fonts`, `assist` and `svg`
   against that run's rows.
5. Then the ship as the prompt names it: the fast forward onto `main`, the ship commit, the push, the
   watcher's deploy, the production gate on `https://www.turboslide.com`, the new write probe, the
   smoke with `--sha`, the pictures, the README and the release note, the table.

### POLISH.md section 7's questions, the defaults in the tree

Unchanged since the ship note of 02:40Z: 1 the domain serves `main`'s build on both origins (the
default happened outside the round); 2 no tooltip plates on `/home`'s links, the cards or a focused
field (in the tree); 3 the placeholder prompt unchanged under A1; 4 the Viewer link lands on the
editor's viewer floor; 5 the double click on a shape's text selects the word under the pointer (the
row `diagrams.label.double-click-selects-word` reads the other expectation and is red twice); 6 `/`
opens a fresh draft.

### For Kevin

1. The ship is stopped a second time. The run of record on the merged tree reads 21 rows of the
   unparkable features red twice: the `decks`, `share`, `sync` and `export` set the verifier's pass 2
   finding 15 named and nobody chased, plus Paint format on the title placeholder. Every one of them
   has an owner above.
2. Your home page is live on `www.turboslide.com` from `main` already. The rest of the round (the
   table fixes, the text, the chrome, the pages) waits on the rows above and on three defects a
   seller meets: the doubled hairline in Version history, the title that shrinks under Bulleted list,
   and the two white boxes on a shader ground behind Advanced tools.
3. A ship on this tree would park charts, diagrams, fonts, assist, present and most of logos and
   shaders because the polish round's own rows for them read red while the product reads right by
   hand. Say whether those rows ship as hand read with their pictures, or wait for their drivers.
4. Your decisions from pass 2 stand: the Follow row parked or unparked, question 5's double click,
   the 2 s join tick against the idle cost ceiling, the version pick's read only preview.
5. Two things outside the tree: the audit's two `brace-expansion` advisories (an allowlist entry or a
   dependency bump), and your Prototemplate deck's 92 slides against the 85 pins.
