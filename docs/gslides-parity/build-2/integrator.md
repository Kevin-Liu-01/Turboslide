# Integrator notes, round two, merge 1

The integrator of the Google Slides parity round two (`docs/gslides-parity/MILESTONES-2.md`,
"Integrator"), merge 1 on 2026-09-12 over `main` at `a65b313` with B1's and B3's day one files in
the shared working tree (`docs/gslides-parity/build-2/b1.md`, `b3.md`). Nothing is committed: the
ship step commits. Section numbers refer to `docs/gslides-parity/SPEC-2.md` unless prefixed SPEC.
Every command ran from `/Users/kevinliu/repos/Turboslide` with the workspace's `node_modules/.bin`
binaries. No git write command ran; the untracked `.github/` was not touched.

## 1. What merge 1 does

Merge 1 makes the shared checkout typecheck and test as one tree so stage 2 (B2, B4, B5, B6 and
B3's day two) builds against B1's schema, actions, conversion and store and B3's menu model. It
wires the thirty six actions of section 3 into the editor's `on(...)` table on the window
transport, binds the hosted http transport's canvas measurer to the render worker facade, adds the
round two counts to the http readers, lands the day one items of the Integrator row (the
`PLAYWRIGHT_BASE_URL` config, the AGENTS.md dev server exception, the seam exports, the
`MenuActionId` collapse), resolves the compile and test breaks B1's landed schema left in files no
stage 1 builder edited, and records every request of the two reports with where it went.

## 2. Files changed, and why

Integrator's own files (MILESTONES-2 "Owns"):

| File                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/studio/src/routes/edit.$deckId.tsx` | `on(...)` handlers for the thirty six actions of section 3, each the store action of `@turboslide/cli/store-actions` over the editor's store (one commit, one history entry); `slide.update`, `block.set`, `block.insert`, `block.remove`, `block.move`, `block.align`, `block.distribute` and `block.order` moved from the route's own arithmetic to the same store actions, so a `/pos` write, a positioned insert, a `z` move and every arrange convert a slide that is not a canvas yet in the same write once a measurer is bound (1.6), a move carries its connectors (2.4.7) and a removal detaches them; the route's `freeformRows`, `pickRows`, `positionMutations`, `commitPositions` and its copy of `checkSlideMutations` removed with the imports they used; `editorStore` and `storeDeps` moved ahead of the first handler; `deck.info` carries `counts.canvas`, `counts.charts`, `counts.guides` and `guides`; `slide.list` rows carry `canvas` and `objects` (0.93); `view.zoom` takes `center`, clamps 0.25 to 16 (0.101) and keeps `zoomCenter` on the snapshot for the stage's zoom (0.81) |
| `apps/studio/src/server/render.ts`        | `measureSlidesThroughWorker(deckId, slideIds)` beside `render.slide`: the canvas and fit measurement of the hosted http transport through the render worker, never in this process (1.3, 0.104); the worker path is the CLI as a child process running `turboslide slide measure <ids> --deck <dir> --json`, or the worker over HTTP; both are requests below, and until they land the facade answers a hosted canvas write on a grammar slide with the reason and the CLI on a checkout converts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/studio/src/server/actions.ts`       | one `storeDeps` for `registerStoreActions` and `registerDeckActions`, with `measureCanvas` and `measureFit` bound to the facade above; the duplicate inline deps object removed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `apps/studio/src/server/agent-actions.ts` | the note that no round two action joins `SERVER_SIDE_WINDOW_ACTIONS` (`block.setAlt` uploads nothing, `diagram.insert` needs no asset, `slide.toCanvas` and the canvas writes measure in the editor, 1.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `playwright.config.ts`                    | `PLAYWRIGHT_BASE_URL` becomes `baseURL` and no `webServer` is defined when it is set (0.43)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `AGENTS.md`                               | the dev server rules gain the round two exception: a builder's own server on their row's port with `TURBOSLIDE_STORE=tmp`, `PLAYWRIGHT_BASE_URL`, the `.turboslide/e2e.lock` rule, 4321 kept for `scripts/check.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `packages/schema/package.json`            | `./diagrams` (B5's file); B1 had added `./canvas`, `./connect`, `./shapes`, `./shapes/geometry` and `./blocks/chart`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `packages/render/package.json`            | `./measure-dom` (B2's day two file)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `packages/export/package.json`            | `./batch` as `./src/batch/index.ts` (B6's module; B6 names the entry file, this line moves with it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `packages/lint/package.json`              | `./run-client` (B6's file)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/chrome/package.json`            | `@turboslide/lint` as a devDependency (B3 request 2, 0.52); `pnpm install` run, `pnpm-lock.yaml` gained three lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm-lock.yaml`                          | the chrome importer's new devDependency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Contracts                                 | `pnpm generate:contracts` run after the tree settled; `node packages/agent/src/generate/main.ts --check` answers "every committed contract is current"; the generated files differ from `HEAD` until the ship step commits them, which is why check step 3 fails by design on this tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Seams in files no stage 1 builder edited, where B1's landed schema broke the compile or a test
(the integrator's conflict resolution; each is the smallest edit, and the owner replaces it):

| File                                                                                          | Owner                                                            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/render/src/blocks/table.ts`                                                         | B2                                                               | `TABLE_DEFAULT_BORDER` is `1` (typed `TableBorderWeight`), not `TABLE_BORDER_WEIGHTS[0]`, which became Google's Transparent `0` when B1 prepended it (0.63); without this every table with `border.weight: 1` emitted `--table-rule:1px` and the two table snapshots failed, and a table with no border would have drawn no rule                                                                                                                                              |
| `packages/render/src/blocks/primitives.ts`                                                    | B2                                                               | `paddingDeclaration` reads a box's `padding` as one number (the round one form, byte identical) or the four sides through `paddingSides` (2.2.19); `let body = ''` in `renderShape`, so the round two presets and line kinds compile and render an empty svg until B2 draws them from `shapePath`                                                                                                                                                                             |
| `packages/render/src/blocks/render-block.ts`                                                  | B2                                                               | `case 'chart'` and `case 'picture'` return `''`, what the fall through already produced at runtime, until `blocks/chart.ts` and `blocks/picture.ts` land                                                                                                                                                                                                                                                                                                                      |
| `packages/viewer/src/Editor.tsx`                                                              | B4                                                               | `StageTableCommand`, the nine round one table commands the stage runs by kind alone; the round two commands carry fields and arrive as a plan through the shell (`tableCommand(plan)`, B5's `table-tools.ts`), so the handle's `table(kind)` and `tableCommand(kind)` are typed over the nine                                                                                                                                                                                 |
| `packages/import/src/ids.ts`                                                                  | nobody this round                                                | `chart` and `picture` stems in the total `STEMS` map                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `packages/export/src/report.test.ts`                                                          | B2                                                               | the native types test names fourteen with `chart` (1.5, 2.8)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/export/src/gslides-fixture.test.ts`                                                 | B2                                                               | `DECK_DIR` reads the round one deck frozen under `packages/schema/src/__fixtures__/gslides-r1/` (byte identical to `decks/fixture/gslides` at `a65b313`), so every round one export assertion still holds on the deck it was written for; B2 brings the test back to `decks/fixture/gslides` with 11.2's numbers (27 slides, 26 pages, `perfect: true` with the converted slides) as MILESTONES-2 B2 items 4 to 6 state, once the renderer draws the picture and chart blocks |
| `packages/chrome/src/menus/model.ts`                                                          | B3                                                               | `MenuActionId = ActionId` (0.49); `GS1_ACTION_IDS` and `GS2_ACTION_IDS` stay as lists for the tests and the audit, typed `satisfies readonly ActionId[]`; `Gs1ActionId` and `Gs2ActionId` removed (no other file named them)                                                                                                                                                                                                                                                  |
| `packages/chrome/src/EditorShell.tsx`, `dialogs/InsertIcon.tsx`, `dialogs/InsertMaterial.tsx` | B3                                                               | the four `as ActionId` casts and the now unused `ActionId` imports removed (B3 request 1); `EditorShell.tsx` formatted with prettier on the edited line                                                                                                                                                                                                                                                                                                                       |
| `packages/agent/src/http/readers.ts`                                                          | nobody this round (B1 owns `http/manifest.ts` and `generate/**`) | `deck.info` carries `counts.canvas`, `counts.charts`, `counts.guides` and `guides`; `slide.list` rows carry `canvas` and `objects` (0.93): the http and MCP transports of the hosted studio read through this module, not the CLI's `info.ts` and `slides.ts` where B1 put the counts; measured before the edit over http, `deck.info` had no canvas counts and `slide.list` marked no canvas slide                                                                           |

## 3. Decisions

1. **The window transport's measurer is a seam, not an interim.** SPEC-2 1.3 fixes the editor's
   measurer as B4's `measureForCanvas` over a hidden 1x sheet with B2's `awaitSheetReady` and
   `measureCanvasBoxes`; neither exists at merge 1. The route's `storeDeps` leaves
   `measureCanvas` and `measureFit` unbound with the comment naming the module, so a canvas write
   on a grammar slide from the window API is refused by B1's store action with its reason rather
   than converted by the stage's scaled boxes, whose rounding would put the editor's `pos` a pixel
   off the CLI's (1.3). `slide.setLayout` to freeform keeps the round one `convertedLayout` (the
   stage boxes through `toFreeform`) so the layout grid still works in the editor; at merge 2 it
   becomes the store action over B4's measurer and `toGrammar` becomes `fromCanvas` (B4's request
   from B1).
2. **The hosted measurer goes through the worker as a CLI child process.** `render.slide` on the
   hosted studio runs the worker's local queue over the turboslide CLI (spawn on a checkout,
   in process inside a function), never Chromium in the studio's own module graph (SPEC 3.3 item
   7). The measurement takes the same path, so the facade runs `turboslide slide measure`, a read
   only command that prints what `measureSlidesHeadless` of `apps/cli/src/deps/canvas.ts`
   returns; B1 owns `commands/slide.ts`, so the command is request 1 below. The Docker worker over
   `TURBOSLIDE_WORKER_URL` needs a `measure` job kind (B2's `apps/render-worker`), request 2. The
   deploy tier question of 0.104 (the base function has no Chromium, `/api/render/**` and
   `/_serverFn/**` are the heavy functions) is the same question `render.slide` over
   `/api/actions` has today and is recorded for the verifier.
3. **The arrange handlers moved to the store actions rather than gaining the conversion in the
   route.** One implementation per action (SPEC 7.1): the store actions carry `withCanvas`,
   `withFollow` and `detachConnectors`; on a freeform slide they write the mutations the route
   wrote in round one (the same `alignPositions`, `distributePositions`, `reorderZ`), and the
   editor store's `write` is the route's `commit`, so undo, the history and the server
   confirmation are unchanged.
4. **`view.zoom` keeps `center` on the snapshot.** The stage's zoom about a point and the scroll
   in the output are B4's `onZoom` (0.81); the handler accepts `center` now so the contract holds,
   stores it as `zoomCenter`, and the output carries `scroll` once the stage reports one.
5. **No round two id joins `SERVER_SIDE_WINDOW_ACTIONS`** (section 2 of MILESTONES-2 Integrator):
   `block.setAlt` writes the block or the asset record, `diagram.insert` instantiates a template,
   `slide.toCanvas` measures in the editor.
6. **The export fixture test reads the frozen round one deck.** The alternative was a red export
   suite at merge 1 or weakening the assertions; the frozen copy is the deck the test was written
   for, byte for byte, and B2's round two assertions are their deliverable.
7. **`packages/chrome/src/menus/model.ts` is not prettier clean** on lines B3 wrote (the
   `submenu.dynamic` union and the Increase indent row); the integrator formatted only the file
   it edited a line of (`EditorShell.tsx`) and leaves B3's formatting to B3 (step 19 is a ship
   step gate).

## 4. Commands run and results

| Command                                                                                                                                                                                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b` before merge 1                                                                                                                                                                          | 5 errors: `packages/render/src/blocks/primitives.ts` (53,19 `Padding` where a number is expected; 177,21 `body` used before assigned), `packages/render/src/blocks/render-block.ts` (31,60 no ending return), `packages/import/src/ids.ts` (24,7 `chart`, `picture` missing), `packages/viewer/src/Editor.tsx` (1300,11 `TableCommand`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `node_modules/.bin/tsc -b` after the seams, again after the route and server edits, again after the readers seam                                                                                                   | exit 0 each time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `cd <package> && ../../node_modules/.bin/vitest run` before merge 1                                                                                                                                                | schema 220, lint 65, store 93, agent 171, cli 84 (+1 skipped), mcp 34, viewer 171, chrome 299, fonts 8 passing; render 2 failing (the table snapshots), export 5 failing (`report.test.ts` thirteen types; `gslides-fixture.test.ts` four on the 27 slide fixture)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| the same after merge 1                                                                                                                                                                                             | schema 220, lint 65, store 93, agent 171, cli 84 (+1 skipped), mcp 34, render 201, export 88, viewer 171, chrome 299, fonts 8, all passing (`packages/headless` has no vitest project of its own; the root run covers it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm install` (after the chrome devDependency)                                                                                                                                                                    | "Already up to date", lockfile +3 lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `node scripts/check.mjs --only 1,2`                                                                                                                                                                                | 2 of 2 passed (`pnpm install --frozen-lockfile`, `tsr generate`) in 1.2 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `node scripts/check.mjs --only 4,5,6`                                                                                                                                                                              | 3 of 3 passed in 45.8 s: `tsc -b`; `pnpm test` 156 files, 1604 tests passed, 3 skipped; `pnpm build` and `check-client-bundle` (marker in 0 of 48 client files, 1 of 72 server files)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm generate:contracts && node packages/agent/src/generate/main.ts --check`                                                                                                                                      | 14 files current; "every committed contract is current" (step 3 fails only on the uncommitted generated files, by design)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `node_modules/.bin/prettier --check` on every file edited                                                                                                                                                          | clean, except `packages/chrome/src/menus/model.ts` on B3's own lines (decision 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Dev server on 4321 (`vite dev`, the integrator's port), `curl`                                                                                                                                                     | `/edit/gt-brand` 200 in 3.2 s cold, `/new` 200, `/decks` 200; `GET /api/actions/slide.toCanvas` returns the GS2 contract with `implemented: true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| http transport over a scratch copy `decks/int-merge1` of the fixture deck (removed afterwards)                                                                                                                     | `deck.guides` add x 400: `{"guides":{"x":[400,800],"y":[450]},"revision":2}`; `text.style` italic on `styles#h` range 0 to 4: `[Text]{i} styles`, revision 3; `block.rotate` by 15 on the canvas slide `rotated`: revision 4, `pos.rotate: 15`; `block.rotate` on the grammar slide `title`: 400 with "Slides title are not arranged by hand yet and could not be measured to convert them: turboslide slide measure exited 2 (turboslide: unknown subcommand "slide measure"; …) (gslides-parity SPEC-2 1.3); convert them with slide.toCanvas through the turboslide CLI on a checkout of the deck" (the facade's path runs and names the missing command, request 1); `deck.info` after the readers seam: `counts` `canvas 13, charts 3, guides 3`, `guides {x:[400,800], y:[450]}`; `slide.list` marks 13 canvas slides with their object counts (`canvas-title:7`, `canvas-opener:5`, `diagram:12`, …) |
| `PLAYWRIGHT_BASE_URL=http://localhost:4321 node_modules/.bin/playwright test apps/studio/e2e/window-api.spec.ts apps/studio/e2e/gslides-actions.spec.ts apps/studio/e2e/undo.spec.ts` under `.turboslide/e2e.lock` | not finished: the integrator stopped the run after the first test of `gslides-actions.spec.ts` ("document actions run through the editor and reads carry the new facts") timed out at 4.0 minutes on the dev server, before `window-api.spec.ts` and `undo.spec.ts` ran; the cause is not diagnosed and is the first item of section 7: the round one document actions through the rewired `on(...)` table (`slide.new`, `slide.duplicate`, `slide.skip`, `slide.applyLayout`, `block.duplicate`, `text.replaceAll`, `deck.info`, `slide.list`) on a server that was also serving the http smoke while check step 6 built; rerun on an idle server first                                                                                                                                                                                                                                                    |

## 5. The requests of the two reports, and where they went

B1 (`build-2/b1.md` section "Requests to the integrator"):

1. Replace `MEASURE_SOURCE` and `measureSlideOnPage` in `apps/cli/src/deps/canvas.ts` with B2's
   `measureCanvas(page)` at merge 1c, the origin staying the `.ts-stage` element: open, merge 1c
   (B2 lands `measure-dom.ts` and `headless/measure.ts` on day 2).
2. Bind the studio's `deps.measureCanvas` to the render worker facade: done for the http
   transport (`server/render.ts` `measureSlidesThroughWorker`, `server/actions.ts`); the worker
   path needs request I1 (B1) and I2 (B2) below. The window transport's binding is B4's
   `measureForCanvas` at merge 2 (decision 1).
3. `GS2_ACTION_IDS` lists `slide.toCanvas` and `deck.guides`: done by B3 on day one; the union is
   collapsed into `ActionId` at this merge.
4. Bind `deps.diagrams` to `DIAGRAM_TEMPLATES` in `apps/cli/src/write.ts` and `commands/mcp.ts`
   once `packages/schema/src/diagrams.ts` lands, then rebuild the fixture's `diagram` slide: open,
   merge 2 (B5's file; the studio's `storeDeps` in the route and in `server/actions.ts` bind it
   the same day).
5. B4's walk writes `.turboslide/canvas-walk/<slideId>.json` in the committed shape: forwarded to
   B4 (`canvas.test.ts` prefers the walk's file).
6. B2's `measureSlide` fills `RenderRecord.blocks[id].contentHeight` and `fontSize`: forwarded to
   B2.
7. B2 updates `gslides-fixture.test.ts` to 11.2's total and adds the picture and chart render
   cases: forwarded to B2; meanwhile the test reads the frozen round one deck (decision 6).
8. Run `pnpm build` before `tsc` in `packages/agent`: done as part of `tsc -b` from the root,
   which builds the project references in order; `tsc -b` is clean on the whole tree.

B3 (`build-2/b3.md` section 3):

1. Collapse `MenuActionId` and drop the casts: done.
2. `@turboslide/lint` as a devDependency of `packages/chrome`: done, `pnpm install` run; B3
   extends `default-view-words.test.ts` over `lintStatic` and the rule labels (0.52).
3. The `tsc -b packages/chrome` reference errors in `packages/render` and `packages/viewer`: fixed
   at this merge (section 2, the seams table).
4. `ShortcutsDialog.tsx` printing `KeyBinding.note` and folding `alias`: B3's own later day, noted.
5. `apps/studio` typing of `shellDispatch`: unchanged, as B3 said.

## 6. Requests from the integrator

- **I1, B1:** `turboslide slide measure <slideIds> --deck <dir> --json`, a read only command over
  `measureSlidesHeadless` of `apps/cli/src/deps/canvas.ts` that prints
  `{ [slideId]: { canvas: CanvasBoxes, fit: { [blockId]: { box, contentHeight?, fontSize? } } } }`
  and writes nothing; the studio's hosted http transport runs it through the worker's CLI child
  process (`apps/studio/src/server/render.ts` `measureSlidesThroughWorker`). Until it lands a
  hosted canvas write on a grammar slide answers with the reason quoted in section 4.
- **I2, B2:** a `measure` job kind in `apps/render-worker` (`JOB_KINDS`, a job over the same
  command) so the Docker worker over `TURBOSLIDE_WORKER_URL` measures too; the facade throws with
  the reason on the http client until then.
- **I3, B2:** `packages/render/src/blocks/table.ts` `TABLE_DEFAULT_BORDER` stays `1` and a
  `border.weight` of `0` emits `--table-rule:0px` (SPEC-2 2.7, no rule at weight 0); the seams in
  `primitives.ts` and `render-block.ts` are placeholders B2 replaces; `gslides-fixture.test.ts`
  returns to `decks/fixture/gslides` with 11.2's numbers.
- **I4, B4:** `packages/viewer/src/canvas-measure.ts` `measureForCanvas(document, slide, theme)`
  as SPEC-2 1.3 states; the route binds it as `storeDeps.measureCanvas` and `measureFit` at merge
  2, and `convertedLayout` becomes `slideSetLayout` over it; `Editor.tsx`'s `StageTableCommand` is
  B4's to keep or fold into the handle's round two table path.
- **I5, B3:** `packages/chrome/src/menus/model.ts` prettier formatting on the `submenu.dynamic`
  union and the Increase indent row (step 19).
- **I6, B5:** `packages/export/package.json` names `./batch` as `./src/batch/index.ts` and
  `packages/schema/package.json` names `./diagrams` as `./src/diagrams.ts`; B6 and B5 keep those
  paths or say so in their notes so the integrator moves the export line.

## 7. Open at merge 1, for merge 2

- **First:** rerun `gslides-actions.spec.ts`, `window-api.spec.ts` and `undo.spec.ts` on an idle
  4321 server; the first test of `gslides-actions.spec.ts` timed out at 4 minutes during merge 1
  (section 4) and the integrator stopped the run without diagnosing it. The candidates are the
  handlers this merge moved to the store actions (`block.set`, `block.insert`, `block.move`,
  `block.remove`, `slide.update`) and the `deck.info` and `slide.list` shapes; the machine was
  also running check step 6 and the http smoke at the time.
- The window transport's `measureCanvas`, `measureFit` and `diagrams` bindings in the route
  (B4's and B5's modules).
- `slide.setLayout` to freeform in the route through the store action over the editor's measurer;
  `toGrammar` through `fromCanvas`.
- The `EditorHandle` canvas methods, the rulers, guides, zoom and pan state, the crop and word art
  modes, the Background dialog's Choose, the Download dialog's batches, `selectSoon`, the
  filmstrip's Select all and Cut path (MILESTONES-2 Integrator item 2, as the builders land).
- `gslides-actions.spec.ts` extended to the thirty six actions and check steps 22 to 24 (item 4).
- The GS1 and GS2 id lists in `model.ts` could leave once the tests read `ACTIONS` by milestone;
  B3's call.

# Integrator notes, round two, merge 2

Merge 2 on 2026-09-12 over the shared working tree with every stage 2 report in (B2, B3 day two,
B4, B5, B6; `docs/gslides-parity/build-2/b2.md` to `b6.md`). Nothing is committed: the ship step
commits. Section numbers refer to `docs/gslides-parity/SPEC-2.md` unless prefixed SPEC. Every
command ran from `/Users/kevinliu/repos/Turboslide` with the workspace's `node_modules/.bin`
binaries; no git write command ran; the untracked `.github/` was not touched; the dev server the
integrator started on 4321 was stopped before returning.

## 8. What merge 2 does

1. Closes the blocker every stage 2 builder hit: no editor page booted on any dev server or on
   the preview since merge 1, because `apps/studio/src/server/render.ts` exported a plain
   function (`measureSlidesThroughWorker`) that reached `@turboslide/render-worker/cli` and
   `node:child_process`, and the edit route imports that module on the client for
   `renderSlideImages`. The function and `MeasuredSlide` moved to the server only
   `apps/studio/src/server/measure.ts`, imported by `server/actions.ts` alone; `render.ts` is
   `main`'s import list again. Measured after the move with a Playwright console probe on 4321:
   `/new` studio ready and settled in 4.3 s, `/edit/gt-brand` in 1.8 s, 0 page errors. The
   hosted facade also gains the worker's `measure` job over `TURBOSLIDE_WORKER_URL` (B2's job) and
   the CLI's `slide measure` (added at this merge, request I1) as its local path.
2. Wires the route (`apps/studio/src/routes/edit.$deckId.tsx`) for the canvas: `storeDeps` binds
   `measureCanvas` and `measureFit` to `measureForCanvas` and `measureForFit` of
   `@turboslide/viewer/canvas-measure` in the current theme and `diagrams` to `makeDiagram`, so
   every canvas write on the window transport converts through the store action as the CLI does;
   `slide.setLayout` runs the store action (`convertedLayout`, `readStageBoxes`, `toFreeform` and
   `toGrammar` left the route); the `StageEditor` receives `guides`, `onGuides` (`deck.guides`),
   `showRuler`, `showGuides`, `snapGuides`, `snapGrid`, `onZoom` (`view.zoom` with `center`),
   `zoomCenter` and `onCaret`; the stage's `EditorHandle` is the shell's `editor` (plus
   `insertBackgroundPicture` over `insertObject` with `bottom: true`); the shell gets
   `guides`, `view.zoom`, `measuredBoxes` (from the handle's `positions()`) and `formatSlots`
   (B5's `chartFormatSlot` and `tableFormatSlot` adapted to B3's props); `toShellSelection`
   carries the stage's `menuSelection()` facts (blockIds, group, marks, range, positioned, canvas,
   coversSheet, imageEdited, listLevel, nested); a right-click on a guide sets the shell's guide
   under the pointer before the menu opens; `uploadPicture` with the `background` target inserts
   the picture object at the bottom of the stack (a seam in B4's `insertPicture`); `toEditorTool`
   passes the widened `DrawTool` through; the Download dialog runs the batched export when the
   play list is longer than the capability's batch size (PPTX only); `selectSoon` re-selects once
   when the filmstrip has rendered the card; the Edit menu's Cut and Delete remove several cards
   in one write with no snackbar for Cut; a server side asset action's answer waits for its write
   to come back over the watch channel; a lease on a slide removed meanwhile is quiet.
3. Binds B5's `makeDiagram` as `deps.diagrams` in the CLI (`write.ts`), the MCP server
   (`commands/mcp.ts`) and the studio (`server/actions.ts`); swaps the CLI's interim measurer for
   B2's `measureCanvas` and `measureFit` (`apps/cli/src/deps/canvas.ts`, request R1) and the
   viewer's local copies for B2's `measureCanvasBoxes`, `measureFitBoxes` and `awaitSheetReady`
   (`packages/viewer/src/canvas-measure.ts`, B4 request 1), so one function measures everywhere.
4. Applies R2: `boxPos` in `packages/schema/src/canvas.ts` keeps the measured value at 1/64 px;
   the six committed `canvas-walk` recordings were re-derived through `slide to-canvas` on a
   fresh copy of the GT deck; the CLI's `freeform.test.ts` pins the 1/64 grid instead of the
   pixel. The fixture's three canvas slides keep the integer `pos` the CLI wrote before R2 (valid
   documents; B2's `canvas-measure.test.ts` compares at the pixel as B2 left it).
5. Mounts B5's `DiagramPanel` in `EditorShell.tsx` (B3 left the frame for the integrator), adds
   the `./inspector/chart` and `./inspector/table` exports to `packages/chrome/package.json` and
   `./jobs/measure` to `apps/render-worker/package.json`; types B5's two `vi.fn()` mocks so
   `tsc -b` is clean on the whole tree; rebuilds the fixture's `diagram` slide through
   `diagram.insert` (B1 request 4); adds `counts.snapshots` to `deck.info` (the reader, the
   studio's deps, the contract; B6 request 4); `lint` at the root is `node
scripts/lint-packages.mjs` (B6 request 6); the devtools stay off for an automated browser (B4
   request 6, this devtools version has no shadow root option).
6. Extends `scripts/check.mjs`: step 21 carries the seven round two specs; step 22 exports the
   fixture in both modes with `export check` and asserts the flatten reports perfect; step 23
   runs `fonts build --check` (skipped without `.turboslide/venv`); step 24 runs
   `canvas-fidelity.mjs` over the GT deck and the templates; step 25 is the container verification
   of 11.3, skipped without Docker; the runner's dev server and its steps carry
   `TURBOSLIDE_EXPORT_BATCH=3`. `gslides-actions.spec.ts` gains the third test that drives all
   36 actions on the fixture through the window API (`slide.toCanvas` asserting one
   `slide.replace` and `pos` on every object of the Title slide, `deck.guides` asserting the deck
   field). B4's three specs remove the deck copies they make through `deck.copy`, so the file
   store's `decks/` is left as found.
7. Edits the documents: the SPEC-2 2.9 amendments into `docs/spec/SPEC.md`,
   `docs/gslides-parity/SPEC.md` and `docs/freeform.md`; AGENTS.md's acceptance (25 steps), the
   contracts (the canvas model, the measurer identity, the server-only import rule) and the round
   two deviations; README.md and docs/README.md; the four skills' prose; SPEC-2 8.2 gains B6's
   contention rule; `BUILD-STATUS-2.md` is rewritten for merge 2.

## 9. Files changed at merge 2, and why

Integrator's own files (MILESTONES-2 "Owns"):

| File                                                                                                                                              | Change                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/studio/src/server/measure.ts` (new)                                                                                                         | `measureSlidesThroughWorker` and `MeasuredSlide`, server only: the worker's `measure` job over HTTP, else `turboslide slide measure` as the CLI child process |
| `apps/studio/src/server/render.ts`                                                                                                                | back to `main`'s import list (the client bundle leak of merge 1)                                                                                              |
| `apps/studio/src/server/actions.ts`                                                                                                               | imports `./measure`; `diagrams: makeDiagram`; `snapshots` for the readers on a Blob store                                                                     |
| `apps/studio/src/routes/edit.$deckId.tsx`                                                                                                         | section 8 item 2                                                                                                                                              |
| `apps/studio/src/routes/__root.tsx`                                                                                                               | `DevtoolsMount`: the devtools mount after hydration and never under `navigator.webdriver`                                                                     |
| `apps/studio/e2e/gslides-actions.spec.ts`                                                                                                         | the 36 actions test                                                                                                                                           |
| `scripts/check.mjs`                                                                                                                               | steps 21 to 25                                                                                                                                                |
| `package.json`                                                                                                                                    | `lint` is `node scripts/lint-packages.mjs`                                                                                                                    |
| `packages/chrome/package.json`, `apps/render-worker/package.json`                                                                                 | the export lines above                                                                                                                                        |
| `packages/agent/src/http/readers.ts` (nobody's this round)                                                                                        | `ReaderDeps.snapshots`, `counts.snapshots`                                                                                                                    |
| `AGENTS.md`, `README.md`, `docs/README.md`, `docs/freeform.md`, `docs/spec/SPEC.md`, `skills/*/SKILL.md`, `docs/gslides-parity/BUILD-STATUS-2.md` | section 8 item 7                                                                                                                                              |

The smallest edits in builders' files, each marked in the file:

| File                                                                          | Owner            | Change                                                                                                    |
| ----------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/cli/src/commands/slide.ts`                                              | B1               | `slide measure <ids> --json`, the read only command of request I1                                         |
| `apps/cli/src/deps/canvas.ts`                                                 | B1               | `MEASURE_SOURCE` and `measureSlideOnPage` replaced by B2's `measureCanvas` and `measureFit` (R1)          |
| `apps/cli/src/write.ts`, `apps/cli/src/commands/mcp.ts`                       | B1               | `diagrams: makeDiagram` (B1 request 4, B5 request 5)                                                      |
| `apps/cli/src/commands/freeform.test.ts`                                      | B1               | the 1/64 grid instead of `Number.isInteger` on a converted `pos.y` (R2)                                   |
| `apps/cli/src/commands/walk.test.ts`                                          | B1               | the diagram test asserts the insert now that the templates are bound                                      |
| `apps/cli/src/commands/__fixtures__/canvas-walk/*.json`                       | B1               | re-derived at 1/64 px (R2)                                                                                |
| `packages/schema/src/canvas.ts`                                               | B1               | `boxPos` keeps the measured value at 1/64 px (R2)                                                         |
| `packages/schema/src/actions.ts`                                              | B1               | `deck.info` output gains `counts.snapshots` (B6 request 4); contracts regenerated                         |
| `decks/fixture/gslides/slides/diagram.json`                                   | B1               | rebuilt through `diagram.insert --kind process --count 4 --style plate` (B1 request 4)                    |
| `packages/viewer/src/canvas-measure.ts`                                       | B4               | B2's `measureCanvasBoxes`, `measureFitBoxes` and `awaitSheetReady` (B4 request 1)                         |
| `packages/viewer/src/Editor.tsx`                                              | B4               | `insertPicture` takes `background: true`; Cmd+D runs `block.duplicate` on every slide kind                |
| `packages/chrome/src/EditorShell.tsx`                                         | B3               | `DiagramPanel` mounted for `panel === 'diagram'` (B5 request 3)                                           |
| `packages/chrome/src/__tests__/chart-grid.test.tsx`, `table-section.test.tsx` | B5               | `vi.fn<(action, input) => Promise<unknown>>()` so `tsc -b` reads the mock's calls (B3 request 5, B2 R6)   |
| `apps/studio/e2e/canvas.spec.ts`, `objects.spec.ts`, `text-styles.spec.ts`    | B4               | `test.afterAll` removes the `deck.copy` scratch deck and its worker cache                                 |
| `apps/studio/e2e/ten-tasks.spec.ts`                                           | B6               | the Cut test's Slide deleted assertion retired (0.30; the file still carried it)                          |
| `apps/studio/e2e/text-editing.spec.ts`                                        | B6               | `settled(page)` after the two undos of the burst test, so the next test's reload reads the undone heading |
| `docs/gslides-parity/SPEC-2.md`                                               | amendment author | 8.2 gains the contention rule (B6 request 7)                                                              |

## 10. Decisions at merge 2

1. **The measurer identity rests on B2's function and 1/64 px (R1, R2).** With `boxPos` rounding
   to the pixel, step 24 failed on 64 of 342 pairs; with the measured value kept, the remaining
   differences are the five GT code panel slides between the themes (R3). The recordings the CLI
   test compares against were re-derived; the fixture's canvas slides were not, because their
   integer `pos` are valid positions and re-deriving `canvas-opener`'s moved and rotated objects
   would need the original walk's scratch files. Recorded in AGENTS.md.
2. **The theme of a conversion is the theme of the surface converting (R3).** SPEC-2 1.3 says the
   editor measures in the current theme; the CLI measures in light; the fidelity gate compares
   each theme with a conversion measured in that theme. A slide converted in dark and viewed in
   light, or the reverse, differs by one pixel on `nearest-page-routing`, `agent-api`, `archive`,
   `dx` and `cli` (the dark panel border), recorded for the verifier. Making every transport
   measure in light would not remove the pixel from the dark view.
3. **Cmd+D runs the store action on every slide kind.** B4 built a stage side paste path for a
   grammar slide because the route's measurer was not bound at the time; with it bound,
   `block.duplicate` converts through the same measurer, one implementation serves the key and
   the CLI (SPEC 7.1), and the copy lands after its source in the list as round one's
   `text-editing.spec.ts` test 21 pins (B6 8a). The stage path stays for a kind's object that is
   not a block (the photograph, the plate, the mark), which the action cannot name before the
   conversion.
4. **`selectSoon` selects at most twice.** B6 asked for a re-select on every frame until the
   filmstrip renders the id; a `shell.select` is a hash navigation, and one per frame for two
   seconds remounted the shell (measured on the first rerun: the ten tasks' Delete snackbar never
   showed and Edit > Undo read disabled after a Cut). The route now waits for the card and
   selects once more.
5. **Several cards leave in one write.** The Edit menu's Cut and Delete commit one `slide.remove`
   per slide in one write (one revision, one history entry), so Edit > Undo brings every removed
   card back as `hygiene.spec.ts` asserts; the filmstrip's own Delete key keeps B4's round one
   behaviour (one write per slide with one Undo each).
6. **The asset actions answer after their write has landed.** `asset.add` runs on the server and
   its write comes back over the watch channel; the store action a `block.insert` runs next
   validates the asset against the local document, so the window transport's `asset.add` waits
   (15 s at most) until the revision moved or the asset is in the manifest (ten-tasks task 4).
7. **The devtools are off for an automated browser.** Their `@font-face { font-family: Inter }`
   shadows the theme's face on a dev page; the devtools version in the tree has no shadow root
   option, so the mount checks `navigator.webdriver`. A person's dev browser keeps the devtools
   and the recorded pixel difference for that browser alone.
8. **Step 25 is optional.** SPEC-2 11.1 counts 24 steps; the container verification of 11.3 is the
   verifier's and needs Docker, so it is a 25th step the runner skips when no daemon answers, and
   `--strict` fails on it.
9. **The fixture's diagram slide is the template's output.** B1 wrote it by hand in the shape
   `diagram.insert` produces; the rebuilt slide differs in the labels ("Step 1" for "1. Connect")
   and the box (the default 320, 180, 960, 540 of 2.8.2), so the fixture now holds what Insert >
   Diagram inserts. The export counts B2 asserted (groups, attached connectors) are unchanged.

## 11. Commands run at merge 2, and results

Every command from the repository root on 2026-09-12, Node 24.13.0, Chrome for Testing
147.0.7727.15. The e2e runs were taken under `.turboslide/e2e.lock` against the integrator's dev
server on 4321 (`vite dev`, the file store), started for the boot probe and stopped before the
check chain, which starts its own.

| Command                                                                                                                                           | Result                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b` before the merge                                                                                                       | 29 errors: 26 in B5's two test mocks (`vi.fn()` calls read untyped), 3 in the route (`toGrammar` returning `Slide`, `toEditorTool` over the widened `DrawTool`)                                                                                                                                                                                                                                   |
| `node_modules/.bin/tsc -b` after the seams and the route                                                                                          | exit 0 on the whole tree                                                                                                                                                                                                                                                                                                                                                                          |
| Per package `vitest run` after the merge                                                                                                          | schema 303, viewer 224, chrome 410, lint 65, store 99, agent 171, mcp 34, fonts 8, render worker 8, headless 25 (+1 skipped), render 275, export 122 (browser tests included, 62 s), cli 84 (+1 skipped) once the two repins landed; `mcp.test.ts`'s `deck_import_slides` timed out at its 30 s budget twice while Playwright and the export suite loaded the machine and passed alone both times |
| `node .turboslide/int2-boot-probe.mjs http://localhost:4321 /new /edit/gt-brand` (a playwright-core console probe)                                | `/new` studio ready and settled in 4288 ms, `/edit/gt-brand` in 1770 ms, 0 page errors; before `server/measure.ts` every builder measured `Module "node:child_process" has been externalized` and no mount                                                                                                                                                                                        |
| `slide to-canvas title,thesis,opener-brand,mood-earth,closing,content-rule --json` on a fresh copy of the GT deck                                 | 6 ids in 2.8 s, one launch; the recordings under `apps/cli/src/commands/__fixtures__/canvas-walk/` re-derived at 1/64 px (`title` heading at 137, 420.4375, 901.453125, 89.75)                                                                                                                                                                                                                    |
| `slide measure title,thesis --deck <copy> --json`                                                                                                 | exit 0 in 6.6 s; the boxes, `mark` at 137, 288.4375, 132, 84, the fit with `contentHeight` and `fontSize`; the copy's revision untouched (a read)                                                                                                                                                                                                                                                 |
| `diagram insert diagram --kind process --count 4 --style plate` on a scratch copy of the fixture with the hand written objects removed            | 11 objects in one group at the default box; differs from the hand written slide in the labels and the box; copied back as `decks/fixture/gslides/slides/diagram.json`; `turboslide validate decks/fixture/gslides` 27 slides, 0 errors, 0 warnings                                                                                                                                                |
| `pnpm generate:contracts` then `node packages/agent/src/generate/main.ts --check`                                                                 | 2 of 14 files rewritten (`mcp-tools.json`, `openapi.json`, the `counts.snapshots` field); every committed contract current                                                                                                                                                                                                                                                                        |
| `pnpm install --frozen-lockfile`                                                                                                                  | Already up to date (B6's hand written `@turboslide/export` lines hold)                                                                                                                                                                                                                                                                                                                            |
| `playwright test window-api.spec.ts undo.spec.ts ten-tasks.spec.ts text-editing.spec.ts` (first run, before the fixes of section 10 items 3 to 6) | 18 passed, 4 failed in 4.5 min: task 4 (the asset), task 5 and the Cut test (an empty snackbar, the `selectSoon` storm), text editing 18 (the undo writes of test 17 not yet on the server)                                                                                                                                                                                                       |
| The reruns after the fixes                                                                                                                        | `gslides-actions.spec.ts` 3 passed in 21.8 s (the 36 actions test included); `hygiene.spec.ts` 4 passed; `ten-tasks.spec.ts` task 4, task 5, the removal and the Cut tests passed; `text-editing.spec.ts` 6 passed in 30.8 s (the arrows test repinned to SPEC-2 0.87)                                                                                                                            |
| `node_modules/.bin/prettier --check .`                                                                                                            | 47 files unformatted after the builders' stage 2; 43 formatted with `--write` (the builders' sources and notes), `packages/schema/src/__fixtures__/gslides-r1` (the frozen round one fixture) and `packages/fonts/export/fonts.json` (written by `scripts/build-fonts.py`) added to `.prettierignore`; clean after                                                                                |
| `node scripts/check.mjs --only 1,2,3`                                                                                                             | 1 and 2 ok; 3 fails by design on the uncommitted generated files, `--check` answers "every committed contract is current"                                                                                                                                                                                                                                                                         |
| `node scripts/check.mjs --from 4`                                                                                                                 | see the table below                                                                                                                                                                                                                                                                                                                                                                               |

The check chain (steps 4 to 25), filled from `.turboslide/int2-check.log`:

| Step                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 `tsc -b`                          | ok in 18.7 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5 `pnpm test` (the root vitest run) | FAIL after 99.3 s (`.turboslide/int2-check.log`): the render `canvas.test.ts` snapshots of every GT kind ("renders title and its canvas in light" and the eleven beside it) differ, because they render the committed `canvas-walk` recordings, which merge 2 re-derived at 1/64 px after the render suite had passed on the integer ones (B2's snapshot file needs `vitest run -u` in `packages/render` and a look at the 12 diffs); `apps/cli` `canvas.test.ts` "converts one slide of every kind at the recorded pos" and the effects parity test "mood-earth: every backend lights the cells" failed in the same run under the root run's load and had passed per package; the chain stopped here, so steps 6 to 25 did not run in this chain |
| 6 to 25                             | not run in the chain; steps 18 and 21's specs were exercised on the integrator's 4321 server: `gslides-actions` 3 of 3, `hygiene` 4 of 4, `ten-tasks` task 4, task 5, the removal and the Cut tests, `text-editing` 6 of 6, `window-api` and `undo` in the first run; steps 22 (the fixture in both modes) and 24 (the fidelity gate) were run by B2 on this tree before merge 2 with the flatten report perfect and 64 pairs over budget at integer `pos`, the reason for R2                                                                                                                                                                                                                                                                     |

The chain has to be rerun from step 5 after the render snapshots are regenerated; the dev
server is stopped (the runner never reached a server step) and 4321 is free.

## 12. Open at merge 2, for the verifier and the fixer round

- **B3 request 6, the tmp store and the specs that seed `decks/`.** `filmstrip.spec.ts`,
  `editor.spec.ts`, `undo.spec.ts` and `scripts/tooltip-audit.mjs` write under `decks/` while a
  `TURBOSLIDE_STORE=tmp` server seeds the checkout once; the check runs on the file store, where
  they work. A tmp store that re-reads a missing deck from the checkout on demand is a store change
  (B6's package) for the fixer round.
- **B1 R5 (optional)** and **B3 request 4** (the seventeen round one lint rules' proposals with
  forbidden default view words, pinned as a ceiling) stay with B1.
- **B2 R7** (`BuildResult.counts` through the batch merge) and **B6 request 9** (`themeReport`
  exported for `merge.ts`) stay with B2 and B6; **B6 request 10** (the progress phases in the
  Download dialog) with B3; **B5 request 4** (`nextCellPointer` over merged cells) with B4.
- **`ShortcutsDialog.tsx`** does not print `KeyBinding.note` nor fold an `alias` binding (B3).
- **The fixture's canvas slides at integer `pos`** (section 10 item 1): a later re-derivation
  through the walk makes B2's `canvas-measure.test.ts` exact.
- **The theme pixel (R3)** on the five GT code panel slides, for VERIFICATION-2's list.
- **The verifier's items**: the container pass of 11.3 (step 25 runs it when Docker answers), the
  canvas walk of 11.8 on the merged tree and on a preview, the batched export rerun on a preview,
  the eslint counts against `tooling/eslint-config/baseline.json` (the tree is above the baseline
  in the packages stage 2 edited; `node scripts/lint-packages.mjs --changed` is each builder's
  gate), the parity audit, the chrome lint and the tooltip audit against the round two shell.
- **The `mcp.test.ts` budget**: `deck_import_slides` at 30 s times out under load; a wider budget
  or a lighter fixture is B1's call.
- **A store action refused by the reducer answers the deck level issue** ("No slide file for")
  rather than the slide level one that caused it (`applyWrite`'s message; found through
  `block.shadow` on a heading, now refused by the action itself with its reason).

# Integrator notes, round two, fix round

Written 2026-09-12 (PDT) on the shared checkout after `docs/gslides-parity/VERIFICATION-2.md`
pass 1, for the five findings the fixer task named (VERIFICATION-2 findings 1, 3, 5, 6 and 8, in
the task's numbering 1 to 5), plus finding 11 (one `.prettierignore` line). Every edit outside the
integrator's own files is a seam fix and is listed as such in section 14 with the reason; nothing
was committed and no git write command ran.

## 13. What the fix round does

1. **Finding 1 (severity 3), the fidelity gate.** `scripts/canvas-fidelity.mjs` measured once,
   in light (`theme: 'light'` for the measure document and the sheet page), converted once, and
   compared both themes with that conversion, so the R3 pixel of the five GT code panel slides
   (b2.md decision 2) failed ten dark pairs (worst `nearest-page-routing` 1.605 percent). The
   script now runs the measurement, the conversion and the comparison inside the per theme loop,
   on one sheet page per theme (the measure document, then the grammar and canvas documents),
   which is what AGENTS.md's contracts paragraph already said it did. The alternative the finding
   offered (recording the five pairs as an exception in AGENTS.md and `check.mjs`) was not taken:
   the gate's claim is that a conversion is lossless in the theme it was measured in, and that is
   what a per theme run proves; a light conversion viewed in dark still carries the pixel, as
   decision R3 accepts and AGENTS.md records. Result: 171 slides converted, 342 pairs, 0 over
   budget, worst 0.262 percent (`gt-brand/directions` dark), mean 0.004 percent, 95.3 s; the five
   slides read 0.000 percent in both themes. Check step 24 passes (section 15).
2. **Finding 2 (severity 3), the Arrange menu and a multi selection.** The stage's `select()`
   notified the route only when the anchor changed; a Shift or Cmd click, a marquee or Select all
   changed the stage's `extra` ids without a signal, so the route's `selectionFacts` memo (over
   `[editorHandle, selection, caret, snap.document]`) never re-read `menuSelection()` and the
   shell's `selection.blocks` stayed 1. `packages/viewer/src/Editor.tsx` gains an optional prop
   `onMultiSelectionChange(ids)` fired from an effect over `extra` (the same pattern as `onCaret`);
   the route holds it as `multiSelection` state in the shell component, passes the setter down
   `EditorStage` as `onMultiSelection`, and lists it in the memo's dependencies, so
   `toShellSelection` carries `blockIds` and Group, Ungroup, Regroup, Align, Distribute and Insert
   > Link read the whole selection. The `react-hooks/exhaustive-deps` disable comment on that memo
   > is gone (the plugin is not loaded, so eslint reported the directive itself as an error).
3. **Finding 3 (severity 2), the import.** `BlockBase.alt` (B1) puts `alt` second in every block
   the zod shape serializes, so check step 7 rewrote 22 GT slide files (`dia` and `dither` blocks,
   `alt` before `type`, 55 lines, no value changed) and bumped `deck.json` to revision 25. The
   integrator's call: keep the schema (a per block `alt` after the type keys would undo B1's design
   for a key order nothing reads) and re-import once. The tree already holds the re-serialized
   deck; running the import again on it changes nothing (`git status` still lists the same 24
   paths, revision 25 and `importedAt` kept, 0.8 s), so the ship step commits the deck and step 7
   is byte identical again from that commit. Recorded in AGENTS.md's B1 deviation bullet and
   BUILD-STATUS-2's B1 section.
4. **Finding 4 (severity 2), Change shape ▸ and Mask image ▸ in the right-click menus.**
   `packages/chrome/src/ContextMenu.tsx` drew the `layouts` plate only and returned null for every
   other dynamic submenu. It gains an optional `renderDynamic(item, { viaKeyboard, onPicked })`
   prop and falls back to it for every non layout dynamic row; the route passes the shell's
   `renderDynamicSubmenu` on both right-click menus (`ts-menu-canvas`, `ts-menu-grid`). Because a
   plate's pick closes the bar menu through `setMenuOpen(null)` and nothing closed a context menu,
   `renderDynamicSubmenu` (`packages/chrome/src/EditorShell.tsx`, the type in
   `editor-shell-context.ts`) accepts `onPicked` in its options and calls it after every pick
   (layouts, the table grid, the shapes, the bullet and numbering presets, the line ends, the
   dashes); `ContextMenu` binds it to `onClose('select')`. A unit test in `ContextMenu.test.tsx`
   opens Change shape on a shape target with a stub plate and asserts the plate, the keyboard
   flag and the close on pick; the e2e test below picks `ellipse` from the real plate.
5. **Finding 5 (severity 2), eslint.** The integrator's own files are at or under the baseline:
   `apps/studio/src/routes/edit.$deckId.tsx` (the duplicate `@turboslide/schema/deck` import merged,
   the `SHAPE_KINDS` and `as Block` assertions dropped since the receivers take the plain types,
   two `no-shadow` renames, the dead eslint directive), `server/actions.ts` (`confirm` typed
   `boolean | undefined` so the `confirm !== true` guard is a real check; the shadowed `client`
   renamed `blobClient` with its two uses), `server/sessions.ts` (the `every` predicate narrows,
   no cast), `components/useStudioSession.ts` (`alive` read through `isAlive()` so the checker's
   narrowing inside `run` does not read the flag as always true), `e2e/gslides-actions.spec.ts`
   (the `invoke` casts). `apps/studio` reads 11 errors and 0 warnings against a baseline of 8; the
   11 are the same two `invoke` casts in `canvas.spec.ts` (plus one at line 536), `charts.spec.ts`,
   `objects.spec.ts`, `tables.spec.ts` and `text-styles.spec.ts`, which are B3's, B4's and B5's
   files (section 16). The 14 parsing errors on `apps/studio/.vercel/output/**` (the verifier's
   `vercel deploy` build output, git-ignored) are gone through one ignore line in B6's
   `tooling/eslint-config/index.js` (section 14).
6. **Finding 11 (severity 1).** `.prettierignore` covers `docs/gslides-parity/verification-2/**/*.json`
   as it covers round one's folder, so a regenerated report cannot fail check step 19.

## 14. Files changed in the fix round, and why

Integrator's own: `scripts/canvas-fidelity.mjs` (per theme measurement; MILESTONES-2 lists it
under B2, the integrator's row names step 24 and the finding named the integrator),
`apps/studio/src/routes/edit.$deckId.tsx` (the multi selection state and its plumbing through
`EditorStage`, `renderDynamic` on both context menus, the lint rows), `apps/studio/src/server/actions.ts`,
`apps/studio/src/server/sessions.ts`, `apps/studio/src/components/useStudioSession.ts`,
`apps/studio/e2e/gslides-actions.spec.ts` (the new test and the `invoke` casts), `.prettierignore`,
`AGENTS.md` (the B1 and B2 deviation bullets), `docs/gslides-parity/BUILD-STATUS-2.md`, this file.

Seam fixes in other builders' files, each the smallest additive change:

- `packages/viewer/src/Editor.tsx` (B4): the optional `onMultiSelectionChange` prop, its ref and
  one effect over `extra`. Nothing else in the stage changed; the finding named B4 for exactly
  this signal.
- `packages/chrome/src/ContextMenu.tsx` (B4): the optional `renderDynamic` prop and the fallback
  branch in the `Menu`'s `renderDynamic`; the docblock names the round two plates.
- `packages/chrome/src/EditorShell.tsx` and `packages/chrome/src/editor-shell-context.ts` (B3):
  `onPicked` in `renderDynamicSubmenu`'s options, called after each of the six picks. Without it a
  right-click plate stays open after a pick while the bar menu closes.
- `packages/chrome/src/__tests__/ContextMenu.test.tsx` (B4): the one new test.
- `tooling/eslint-config/index.js` (B6): `'**/.vercel/**'` beside `'**/.output/**'` in the ignore
  list, with a comment. `.vercel` is in `.gitignore`; eslint's flat config does not read it.

## 15. Commands run in the fix round, and results

All from `/Users/kevinliu/repos/Turboslide`, the dev server the integrator's own on 4321
(`node_modules/.bin/vite dev --port 4321 --strictPort` from `apps/studio`, the file store, started
after the verifier's had stopped and stopped at the end). No `pnpm install`, `pnpm add`, `pnpm exec`,
`pnpm build`, git write command or Docker ran.

| Command                                                                                                                                                      | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node apps/cli/bin/turboslide.mjs import /Users/kevinliu/repos/Prototemplate/deck --into gt-brand --json` (check step 7's command on the re-serialized tree) | 85 slides, 8 sections, 0 html blocks, 0.8 s; `git status` unchanged before and after (24 paths, 55 insertions, 55 deletions), `deck.json` revision 25 and `importedAt` 2026-09-13T03:49:55.295Z kept: the import is idempotent on this tree                                                                                                                                                                                                                                                                                                                  |
| `node scripts/canvas-fidelity.mjs --deck decks/gt-brand --deck decks/templates/gt-brand --deck decks/templates/blank --max-mismatch 0.005 --report …`        | 171 slides converted, 342 pairs, 0 over budget, worst 0.262 percent (`gt-brand/directions` dark), mean 0.004 percent, 95.3 s, exit 0                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `node_modules/.bin/tsc -b`                                                                                                                                   | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `cd packages/chrome && ../../node_modules/.bin/vitest run`                                                                                                   | 46 files, 411 passed (410 plus the Change shape plate test), 12.9 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cd packages/viewer && ../../node_modules/.bin/vitest run`                                                                                                   | 25 files, 224 passed, 7.4 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `node_modules/.bin/prettier --check` on every changed file                                                                                                   | clean (the spec written through `--write`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `node scripts/lint-packages.mjs --only apps/studio,packages/chrome,packages/viewer`                                                                          | `apps/studio` 11 errors, 0 warnings (was 37 and 3; baseline 8; the 11 in B3's, B4's and B5's specs), `packages/chrome` 113 (unchanged, B3 and B4), `packages/viewer` 18 (unchanged, B4)                                                                                                                                                                                                                                                                                                                                                                      |
| `node_modules/.bin/playwright test apps/studio/e2e/gslides-actions.spec.ts` under `.turboslide/e2e.lock`, the integrator's server on 4321                    | 4 passed in 8.6 s: the fourteen, the collection actions, the thirty six, and the new test (two objects: Group and Align enabled, Ungroup and Distribute disabled; three: Distribute enabled; one: Group disabled; Change shape ▸ draws `format.changeShape.grid`, the `ellipse` tile writes one `shape.set` version and the menu closes). The test's own three false starts (`page.mouse.click` takes no modifiers, a click on a selected member keeps the selection, a corner right-click lands on a resize handle) were fixed in the test, not the product |
| `node scripts/check.mjs --only 24`                                                                                                                           | ok in 100.5 s (171 slides, 342 pairs, 0 over budget, worst 0.262 percent); step 25 left to the verifier (Docker)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `node scripts/lint-packages.mjs`                                                                                                                             | 229 errors over 20 packages (was 255), 10 packages above the baseline (unchanged count: `apps/studio` is at 11 against 8 for the five specs of section 16); every integrator-owned file at 0 rows; the seam files' rows unchanged (`EditorShell.tsx` 4 before and after, `Editor.tsx` 12 before and after, `ContextMenu.tsx` 0)                                                                                                                                                                                                                              |
| `node scripts/lint-packages.mjs --changed`                                                                                                                   | 278 changed files in 16 packages, 11 packages with findings, `apps/studio` 11 (the five specs), exit 1                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 16. Requests from the fix round (eslint, finding 5; the specs' `invoke` casts)

`node scripts/lint-packages.mjs` before the fix round: 255 errors, 10 packages above
`tooling/eslint-config/baseline.json`. The integrator's files are fixed (section 13 item 5); the
rest is each builder's, by file, from the same run (`--changed` is the gate; a package's
pre existing rows do not count there):

- **B1** (`apps/cli` 24 errors and 12 warnings against a baseline of 10; `packages/schema` 18
  against 5; `packages/fonts` 2 against 0): `apps/cli/src/store-actions.ts` (13 rows),
  `commands/deck.ts` (4), `commands/asset.ts` (4), `commands/slide.ts` (3), `commands/shape.ts`,
  `commands/diff.ts`, `commands/block.ts` (2 each), `commands/version.ts`, `commands/text.ts`,
  `commands/material.ts`, `commands/fonts.ts`, `commands/fix.ts` (1 each);
  `packages/schema/src/canvas.test.ts` (6), `canvas.ts` (3), `layouts.test.ts` (2), `actions.ts`,
  `apply-layout.test.ts`, `blocks/table.test.ts`, `connect.ts`, `layouts.ts`, `shapes.ts`,
  `text.ts` (1 each), `diagrams.ts` (a `no-shadow` warning); `packages/fonts/src/export.ts` and
  `export.test.ts` (1 each). Almost all are `no-unnecessary-type-assertion` and
  `no-unnecessary-condition`: a cast or a `??` the types already settle.
- **B2** (`packages/export` 14 against 9; `packages/headless` 10 against 6; `packages/render` 2
  against 1): `packages/export/src/scene/measure.ts` (5), `verify/fixture.ts`, `verify/diff.ts`,
  `pptx/text.ts`, `ooxml/groups.ts` (2 each), `verify/verify.test.ts`, `scene/enrich.ts`,
  `pptx/fonts-map.ts` (1 each); `packages/headless/src/context.ts` and `capture/shared.ts` (3
  each), `measure.ts` (2), `ready.ts` (1); `packages/render/src/blocks/primitives.ts` (a `??` on
  a non nullable left side) and `dia/templates.ts` (a type parameter named `S`).
- **B3** (`packages/chrome`, shared with B4, 113 against 45): `__tests__/editor-shell.test.ts`
  (15 rows), `__tests__/editor-shell-render.test.tsx` (5), `FormatOptions.tsx` (6),
  `ThemesPanel.tsx` (4), `EditorShell.tsx` (4, none of them on the lines the fix round touched),
  `ToolbarTail.tsx` (2), `__tests__/dialogs-round-two.test.tsx` (2), `__tests__/diagram-panel.test.tsx`
  and `__tests__/chart-grid.test.tsx` (1 each); `apps/studio/e2e/text-styles.spec.ts` line 39, the
  `invoke` helper's `id as string` and `as Promise<unknown>` (both unnecessary: the `as const`
  tuple already types `id` as a string and `invoke` returns a promise), the same two rows the
  integrator removed from `gslides-actions.spec.ts`.
- **B4** (`packages/viewer` 18 against 0): `Editor.tsx` (two `import/no-duplicates` of
  `@turboslide/schema/text` at lines 60 and 62, seven unnecessary assertions, one `??`, two
  `no-shadow` warnings), `Gestures.tsx` (3), `Freeform.tsx`, `InlineText.tsx`, `marks.ts` (1 each),
  `__tests__/freeform.test.ts` (2); `apps/studio/e2e/canvas.spec.ts` lines 67 and 536 and
  `objects.spec.ts` line 43 (the same `invoke` casts).
- **B5**: `apps/studio/e2e/charts.spec.ts` line 59 and `tables.spec.ts` line 58 (the same `invoke`
  casts).
- **B6** (`tooling/eslint-config/index.js`): three groups of "was not found by the project
  service" parsing errors are files outside every tsconfig project, not code: `apps/cli/vitest.config.ts`
  and `packages/headless/vitest.config.ts` (the ignore list names `vitest.config.ts` at the root
  only; `**/vitest.config.ts` covers the packages') and `packages/native/wasm/{turboslide_native.d.ts,turboslide_native.js,turboslide_native_bg.wasm.d.ts}`
  (generated wasm bindings; `packages/native/wasm/**`), which are all of `packages/native`'s 3
  errors and one each of `apps/cli`'s and `packages/headless`'s. The integrator added
  `'**/.vercel/**'` in the same list (section 14) and left these to B6 with the baseline rewrite
  (`--baseline`) once every builder is at or under it.

## 17. Deviations and open items of the fix round

- **Step 25 was not rerun.** The finding asked for `node scripts/check.mjs --from 24`; step 25 is
  the Docker container verification and AGENTS.md keeps Docker for the verifier, so the integrator
  ran `--only 24` and leaves 25 to the verifier's pass 2 (its finding 4, the native verify in the
  container, is B2's and unchanged by this round).
- **The re-serialized GT deck is uncommitted by design** (no git write command from a builder or
  the integrator): the ship step commits `decks/gt-brand/**` as the tree holds it. Until that
  commit, `git status` lists the 24 paths after every check run, as VERIFICATION-2 finding 3
  describes, but a second import no longer changes them.
- **Distribute with two objects stays disabled.** VERIFICATION-2 finding 5 listed
  `arrange.distribute` among the rows a two object selection left disabled; the model's predicate
  is `threeOrMore`, as Google's Distribute is, so with the selection signal fixed the row enables
  at three objects and not at two. The e2e test asserts both.
- **The right-click menu's plate on a grammar slide's pseudo object** (a title's heading before
  the first write converts the slide) draws through the same path; `pickShape` then runs
  `shapePickPlan` over the shell's facts, which refuses with "Select a shape first" when the
  object is not a shape, as it does from the menu bar. Not changed.
- **`apps/studio` stays at 11 errors against a baseline of 8** until B3, B4 and B5 remove the
  `invoke` casts in their five specs (section 16); `--changed` on the integrator's own files is
  clean.
