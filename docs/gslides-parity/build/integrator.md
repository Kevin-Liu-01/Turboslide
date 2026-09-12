# Integrator notes, merge 1

The integrator of the Google Slides parity round (`docs/gslides-parity/MILESTONES.md`, section
"Integrator"), merge 1 on 2026-09-12 over `main` at `14da621` with B1's and B3's day one files in
the shared working tree. Nothing is committed: the ship step commits. Section numbers refer to
`docs/gslides-parity/SPEC.md`.

## 1. What merge 1 does

Merge 1 makes the shared checkout typecheck and test as one tree so stage 2 (B2, B4, B5, B6 and
B3's day two) can build against B1's schema, actions and store and import B3's menu primitive. It
also wires the fourteen actions of SPEC 7.5 into the editor's `on(...)` table and the studio's
server dispatcher, creates the empty `/present/:deckId` route shell for B6 and B5, regenerates the
contracts, and records the requests of the two reports.

## 2. Files changed, and why

Integrator's own files (MILESTONES "Owns"):

| File                                         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/studio/src/routes/edit.$deckId.tsx`    | `on(...)` handlers for the fourteen actions (section 3); `zoom` on `EditorSnapshot` (default `'fit'`), reported by every `view.*` result and by `describe().state`; `slide.list` rows carry `skip` and `template`; `deck.info` carries `counts.skipped`, `defaults` and `trashedAt`; the server side helper takes `{ announce }` so only the asset actions toast their ids                                                                                                                                                                                                      |
| `apps/studio/src/server/actions.ts`          | `registerHostedDeckActions` (deck.list, deck.copy, deck.trash, deck.restore, deck.remove over `HostedDecks`, `StaleRevisionError` mapped to `ConflictError`) registered after `registerDeckActions` so the folder handlers are replaced; `registerSlideImport` (the source deck through the collection, `ensureAssets` first, each asset file copied under this deck and, on the Blob backend, pushed under the deck's prefix with `exportBlobClient`, then `slideImport` from `@turboslide/cli/store-actions`); `export.text` comes from `registerStoreActions` as B1 wired it |
| `apps/studio/src/server/agent-actions.ts`    | `SERVER_SIDE_WINDOW_ACTIONS` gains deck.list, deck.copy, deck.trash, deck.restore, deck.remove and slide.import                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `apps/studio/src/routes/present.$deckId.tsx` | New: the empty route shell of MILESTONES B6 ("needs B5's route file for /present created as an empty shell on day 1 by the integrator"). Loads the deck through `getDeck` and shows `DeckViewer` in present mode with a `noindex` robots meta; B6 replaces the page. `apps/studio/src/routeTree.gen.ts` regenerated (check step 2)                                                                                                                                                                                                                                              |
| `apps/studio/e2e/gslides-actions.spec.ts`    | New: the fourteen actions through `window.turboslide.studio.invoke` on a scratch copy of `decks/fixture` (section 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/gslides-parity/BUILD-STATUS.md`        | New: one heading per builder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Contracts                                    | `pnpm generate:contracts` run twice (after B1's tree, then after the `DESTRUCTIVE` change below); `node packages/agent/src/generate/main.ts --check` reports every contract current. `packages/agent/generated/*`, `docs/grammar.md`, `packages/schema/src/rules.json`, `packages/lint/fixtures/index.json` and `skills/*/references/*.md` differ from `HEAD` until the ship step commits them                                                                                                                                                                                  |

Seams in files no builder owns this round (packages/agent, packages/import, apps/cli outside B1's
list):

| File                                              | Change                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/import/src/ids.ts`                      | `STEMS.table = 'table'` (the record is total over `BlockType`; B1 request 1)                                                                                                                                                                                              |
| `packages/agent/src/__tests__/coverage.test.ts`   | `landed` gains `GS1`, so every one of the fourteen must be named in a test (B1 request 4)                                                                                                                                                                                 |
| `packages/agent/src/generate/mcp.ts`              | `DESTRUCTIVE` gains deck.trash, slide.applyLayout, text.replaceAll, matching `packages/mcp/src/tools.ts` (B1 request 4); `mcp-tools.json` regenerated                                                                                                                     |
| `packages/agent/src/http/manifest.ts`             | `expectedByMilestone` knows `GS1` after `M6` (B1 request 4); no caller passes it yet                                                                                                                                                                                      |
| `packages/agent/src/http/readers.ts` and its test | The hosted `deck.info` carries `counts.skipped`, `defaults` and `trashedAt`; `slide.list` rows carry `skip` and `template`, only when set. Without this the HTTP and MCP reads would have lagged the CLI's (B1 changed the action outputs; nobody owned the host readers) |
| `apps/cli/src/deck-files.ts`                      | `slideRows` titles an empty-heading slide "Slide n" (`slideTitle(slide, n)`), SPEC 5.4 (B1 request 6)                                                                                                                                                                     |
| `apps/cli/src/commands/asset.test.ts`             | The `material capture` browser test takes a 60 s budget instead of vitest's 5 s. Measured: it fails at 5.0 s over the budget under root `pnpm test` (check step 5) on this tree and, per B1, at `14da621`; it passes in 3 s alone. The assertions are unchanged           |

Smallest edits in builders' files, each because `tsc -b` or a suite failed at the seam:

| File                                                       | Owner | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/render/src/blocks/render-block.ts`               | B2    | `case 'table'` (TS2366 without it)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/render/src/blocks/table.ts` (new)                | B2    | The minimum renderer: `<table class="table">`, a `<col>` per column, `<th>` cells on a header row, `data-run="<blockId>/rows/<r>/cells/<c>"` (the pointer `packages/lint/src/context.ts` uses), one `.para` span per paragraph, alignment, fill, valign, border weight and size inline. B2 replaces it with the grid of SPEC 7.3, the prompts, the sheet.css rules and the `cell` render records                                                                                           |
| `packages/render/src/__tests__/table.test.ts` (new)        | B2    | Six tests on the contract above; B2 keeps the pointers and the paragraph spans                                                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/export/src/report.test.ts`                       | B2    | The native type list gains `table` (SPEC 7.9 item 2 changes the behaviour the test encoded)                                                                                                                                                                                                                                                                                                                                                                                                |
| `packages/chrome/src/inspector/sections.ts`                | B3    | `BLOCK_ICONS.table = 'table'` (TS2741 without it; the sprite has `table`). This also fixes the eleven chrome failures B3 reported in `insert-menu.test.tsx` and `palette-component.test.tsx`                                                                                                                                                                                                                                                                                               |
| `packages/chrome/src/__tests__/inspector-generate.test.ts` | B3    | The annotated field list of a rows block gains `link` first (B1's `blockLinkField` on every block, SPEC 7.2.7)                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/chrome/package.json`                             | B3    | Exports `./Menu`, `./Snackbar`, `./menus/model`, `./menus/strings`, `./menus/keys` (B3 request 4; no dependency change)                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/lint/src/rendered/png.ts`, `bitmap.ts`           | B1    | Namespace imports of `node:zlib`, `node:fs` and `node:path` with call time access. The editor now imports `@turboslide/cli/store-actions`, which imports `@turboslide/lint/run`, which reaches these two modules; Vite's browser shim threw on the named import bindings at module evaluation and the editor page never booted (measured on the 4390 dev server before the change). The rendered rules never run in a page. The 62 lint tests and the PNG codec are unchanged in behaviour |
| `apps/cli/src/store-actions.ts` (`deckText`)               | B1    | `bytes` counted with `TextEncoder` instead of `Buffer.byteLength`: `export.text` now also runs in the editor page, where `Buffer` does not exist (the spec found it: `ReferenceError: Buffer is not defined`)                                                                                                                                                                                                                                                                              |

`pnpm install` ran once, as check step 1 (`pnpm install --frozen-lockfile`, 0.6 s, nothing to do):
the three `package.json` files B1 changed (`packages/schema`, `packages/lint`, `apps/cli`) and the
one I changed (`packages/chrome`) touch scripts and exports only; the lockfile is unchanged.

## 3. The fourteen actions in the editor

Every `menu` effect of kind `action` resolves through one of these on the client, and the same
ids resolve through `POST /api/actions/<id>` and the MCP tools on the host, because the studio's
deck dispatcher registers B1's `registerStoreActions` and `registerDeckActions` plus the hosted
handlers of section 2.

| Action                                                                                                  | Where it runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slide.new`, `slide.duplicate`, `slide.skip`, `slide.applyLayout`, `block.duplicate`, `text.replaceAll` | In the page, through B1's functions from `@turboslide/cli/store-actions` over `editorStore(label)`: a `DeckStore` whose `read` is the local document and whose `write` runs `checkBase` and the editor's `commit`, so the reducer applies the write now, the history takes the entry (undo), and the server confirms it in order. One implementation for the CLI, the host and the page (SPEC 7.1). The version, lease and watch methods of that store throw if reached; the six actions never reach them. `slide.new` and `slide.duplicate` select the new slide on the stage, as Google does |
| `export.text`                                                                                           | In the page, `deckText(snapshot.document, input)`, pure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `view.zoom`                                                                                             | In the page: `snapshot.zoom` (a factor or `'fit'`), a `TypeError` under 0.25 (the schema caps at 4); every `view.*` output and `describe().state` carry it. Drawing the factor is the Sheet's (B4; `Sheet.tsx` scales by `fit.scale` today)                                                                                                                                                                                                                                                                                                                                                    |
| `deck.list`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`                                   | On the server through `runDeckAction` (the same path as `asset.add`), over the hosted collection. No toast from the editor; the menu and home page handlers word theirs from SPEC 12                                                                                                                                                                                                                                                                                                                                                                                                           |
| `slide.import`                                                                                          | On the server; the editor then waits up to 5 s for the write's revision to arrive over the watch channel (else reloads) and selects the first imported slide, so a caller can address the copies at once                                                                                                                                                                                                                                                                                                                                                                                       |
| `block.order` front and back                                                                            | Already in the table: the handler passes `move` to `reorderZ`, whose `ORDER_MOVES` are front, back, forward, backward. Nothing to add; the keys that bind them are B3's and B4's                                                                                                                                                                                                                                                                                                                                                                                                               |

## 4. Decisions

1. The document actions run in the page over the editor's commit rather than on the server. A
   server write comes back as an external revision with no history entry, so Cmd+Z after New
   slide would not work and the slide would appear a round trip later; the store adapter keeps
   B1's planning code as the one implementation and the editor's optimism and undo.
2. The collection actions run on the server because the page cannot reach the backend and they
   address other decks; on Blob the collection pushes, stamps with `ifMatch` and deletes the
   prefix, which a folder handler over the mirror would not do.
3. `slide.import` copies asset files itself and pushes them on Blob: the Blob store's write pushes
   documents, never twins (`isMirroredDocument` excludes `assets/`), so without the push a
   hosted import would name twins that only this instance holds.
4. `view.zoom` is state and reporting only this merge; the factor reaches the Sheet with B4.
5. The `material capture` test budget: a timeout, not an assertion, was the only thing failing
   step 5; raising it for one browser test is not weakening the test.
6. The two lint modules and `deckText` were changed in B1's files because the editor cannot import
   the store actions otherwise; both are behaviour preserving on Node and are covered by the lint
   suite and the cli `gslides.test.ts`.

## 5. Acceptance and commands run

All from `/Users/kevinliu/repos/Turboslide` on 2026-09-12 (Node 24, pnpm 11).

| Command                                                                                                                               | Result                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node_modules/.bin/tsc -b` before any change                                                                                          | 3 errors: `packages/render/src/blocks/render-block.ts:24`, `packages/import/src/ids.ts:24`, `packages/chrome/src/inspector/sections.ts:210` (the reports' blockers)                                                                                                |
| `node_modules/.bin/tsc -b` after                                                                                                      | exit 0 (three runs, the last after every edit)                                                                                                                                                                                                                     |
| `pnpm generate:contracts`; `node packages/agent/src/generate/main.ts --check`                                                         | 1 of 14 rewritten the second time (`mcp-tools.json`); "every committed contract is current"                                                                                                                                                                        |
| vitest per package, sequential: schema, lint, store, agent, cli, chrome, render, export, import, mcp                                  | 182, 62, 93, 133, 64 (+1 skipped), 187, 177, 82, 21, 34 passed; 0 failed                                                                                                                                                                                           |
| `node scripts/check.mjs --only 1,2`                                                                                                   | ok (0.6 s, 1.3 s)                                                                                                                                                                                                                                                  |
| Step 3 by hand: `git ls-files --error-unmatch ...` and `pnpm generate:contracts` and `--check`, then `git diff --exit-code -- ...`    | ls-files ok, contracts current, `git diff --exit-code` exit 1: the regenerated files differ from `HEAD` until the ship step commits them. `check.mjs` stops at the first failure, so steps 4 to 6 were run with `--only 4,5,6`                                     |
| `node scripts/check.mjs --only 4,5,6`                                                                                                 | step 4 ok (4.2 s); step 5 first run: 1 failed (`material capture`, 5.0 s timeout) of 1300; after the 60 s budget: 130 files, 1297 passed, 3 skipped, ok in 41.3 s; step 6 ok in 7.2 s, `check-client-bundle`: marker in 0 of 26 client files, 1 of 60 server files |
| `node_modules/.bin/vite dev --port 4390` from `apps/studio`, then `playwright test --config <scratch config on 4390> gslides-actions` | 2 passed (2.2 s and 11.4 s) on the final run; the server was stopped afterwards and the scratch output removed. Earlier runs on the same server found the two defects fixed above (the lint imports, `Buffer`) and one load effect (section 6)                     |
| `node_modules/.bin/prettier --check` on every changed or new file                                                                     | clean                                                                                                                                                                                                                                                              |

Not run: `pnpm install` outside check step 1, `pnpm add`, `pnpm exec` outside `check.mjs`, any git
write command, Docker. Ports 4321 and 3005 were not touched.

## 6. Unproven, and what the verifier should look at

- The Blob path of `slide.import` (`copyAsset` pushing under the deck's prefix) is typed against
  `BlobClient` and unexercised; the file backend is what the spec drove.
- `view.zoom` changes nothing on screen until B4's Sheet reads `snapshot.zoom`.
- Undo of the six document actions is by construction (they go through `commit`, which pushes
  the history entry); no spec presses Cmd+Z after them yet. `ten-tasks.spec.ts` (merge 2) should.
- Write latency on the dev server under render worker load: with four new slides being rendered
  for the filmstrip, each `writeDeck` in the spec took about 10 s (the response arrived when a
  long poll returned), against 100 ms on an idle server. The production deployment renders on a
  separate worker, so this is a dev server observation, but B4 and the verifier should know it
  when timing the ten tasks locally.
- `block.duplicate` does not select the copy; B4 decides the selection behaviour with the stage.
- The `.para` spans of the table renderer have no CSS yet; B2's sheet.css rules give them
  `display: block`.

## 7. Requests recorded and where they went

See `docs/gslides-parity/BUILD-STATUS.md` for the per builder list. In short: B1's requests 1 to
6 are done here; request 7 (21 archetypes in `decks/templates/gt-brand/template.json`) waits for
B3 to delete `slide-templates.test.ts`; request 8 is B2's. B3's request 4 (exports) is done;
requests 1 to 3 (SPEC 2.12, 4.3 and 14.4 amendments) are recorded for Kevin as deviations
(SPEC 15.11) in BUILD-STATUS.md rather than edited into the binding SPEC; request 5 (the icon
sprite) is reassigned to B3 day two; request 6 (tokens) is B3's own; request 7 is done by the
`table` icon and the inspector test edit above.

## 8. Fix round, 2026-09-12

The integrator's fixer took the four findings of `docs/gslides-parity/VERIFICATION.md` that name
the integrator's files (8, 9, 14 and 16 in section 9 there; the fix brief numbers them 1 to 4)
and, because it blocks check step 21 in the integrator's own spec, finding 17. Nothing was
committed; no other builder's file was edited (finding 9's brief names `EditorShell.tsx`, and the
fix lives in the route alone because the shell's `EditorClipboard` contract already routes to
whatever handlers the route passes).

### 8.1 What changed, and why

- `apps/studio/src/routes/edit.$deckId.tsx`, finding 8: `replacementSlide(before, after, active)`
  (a pure helper next to `slideOrder`) and `setDocument`, which every document change runs
  through (a commit, an undo, a redo, a reload after an external write), now compare the slide
  order before and after and, when the current slide is gone, publish the slide at its index
  (clamped to the end) as `activeSlide`, clear the selection and select it on the shell through
  `selectSoon` (moved up from the `slide.new` handler so it is declared before its first use).
  `viewState()` reads the shell's active id and the snapshot's only while the deck has the slide,
  so `describe().state.slideId` and the `view.*` results never name a removed slide.
- The same file, finding 9: the Edit menu's clipboard handlers follow the region that last had
  focus (`region`, the `focusin` listener the route already kept): the canvas's while a block or
  a run is selected there, the slides' while the filmstrip last had focus or nothing is selected
  on the canvas. The slide handlers copy the selected slides' JSON through `clipboardStore`, cut
  with one `slide.remove` per slide (the incrementing `baseRevision` pattern of `Sidebar.tsx`,
  sound because the dispatcher reaches the handler in the same tick and the reducer applies
  before the next call) and the "Slide deleted" snackbar with one Undo per slide, and paste with
  `pastedSlideInserts` after the last selected card (or `slide.import` for another deck's
  slides), handing any other payload to the canvas's paste. `selectedSlideIds` is filtered to
  slides the deck still has before use.
- The same file, finding 17: `onConflict` no longer rebases and re-sends a write the store
  refused for a lease. The refusal comes back as `code: 'conflict'` with `holder` set and an
  empty `since` (nothing was written), which the rebase branch read as "someone else wrote,
  replay", so the pump re-sent the same write to the same refusal every 2 ms (measured with a
  Playwright probe: 60 write POSTs in 200 ms, for as long as the page lived). With `holder` set
  the conflict card appears with the holder and Force, `pending` drops to 0 and the waiting jobs
  are rejected, as the card path always did for an overlap.
- `apps/studio/e2e/ten-tasks.spec.ts`: two tests after the tasks, "the current slide follows a
  removal" (Slide > Delete slide from the menu bar, Undo, Ctrl+M then Undo, Slide > Duplicate
  slide then Undo; asserts `data-active`, `describe().state.slideId` and a `slide.get` on the
  current slide each time against the index rule) and "Edit > Copy, Paste and Cut from the menu
  bar act on the selected slide card" (Copy writes the envelope to the system clipboard, Paste is
  enabled and inserts `links-2` after `links`, Cut removes it with the snackbar and leaves it on
  the clipboard). `openEditor` opens the deck as the editor's default author for every task, the
  author task 1 gets from the home page's card (section 8.2 item 5); task 3 has a 120 s budget
  and prints the settle time of the rename's write.
- `packages/headless/src/shell.ts`, finding 16: `editorPanel` enters through Google's Version
  history chord (`Meta+Alt+Shift+H`, `file.versionHistory.see` in `menus/model.ts`) and leaves
  through Escape (the shell's Esc ladder closes the panel; the chord itself opens and does not
  toggle, measured at 1440 and 390). The toolbar's Theme button collapses into More at or below
  1100 px (SPEC 0.6, 1.3), so it cannot drive the 390 px audit; the bottom bar's Show side panel
  button (`panel.toggle`), tried first, sits under the dev server's TanStack devtools trigger at
  the bottom right and Playwright refuses the intercepted click (`<circle ... tsd-trigger-mark>
from <div> subtree intercepts pointer events`, 30 s timeout on `/edit/gt-brand` and `/new`).
  `data-rpanel` on the root is what the probe reads either way.
- `scripts/check.mjs`: the `EDITOR_STATES` comment names the bottom bar as the way in; the states
  and the URLs are unchanged.
- `docs/spec/SPEC.md`, finding 14: the six amendments of gslides-parity SPEC 7.9, each marked as
  amended by the parity round: 4.2 (line breaks as paragraph breaks in `multilineTextSchema`
  Texts and `\n` in `panel.code`), 8.2 (rows scoped to `rows` and `plain`; the `table` block is
  a PPTX table), 2.1 (unchanged; the Bulleted list control makes the ruled list, `plain.numbered`
  the numeral), 6.9 (the editor binds no bare letters; the view route keeps the shell keys), 3.4
  (the routes: `/` redirects to `/new`, `/decks`, `/decks/trash`, `/print/:deckId`,
  `/present/:deckId`, `/new`), 6.1 (the editor's frame is Google's; the diagram is the view
  route's shell and the editor before the round).
- `AGENTS.md`: the deviations list gains the six amendments and the builders' deviations (B2, B3,
  B4, B6) with the reason of each, and the fix round's two rules: the post-removal selection as
  an assumption about Google until the audit checks it, and a lease refusal shown as the conflict
  card.
- `skills/*/SKILL.md`: the fourteen actions in prose. `turboslide-api` gains "The Google Slides
  parity actions"; `turboslide-create` names empty Texts, paragraph breaks, Esc commits,
  `slide.new` (`--layout split` for Title and body), `slide.applyLayout`, `slide.duplicate`,
  `slide.import`, `block.duplicate`, `text.replaceAll`, `slide.skip`, the `table` block and
  `plain.numbered`; `turboslide-studio` names `view.zoom`, the actions that run in the page,
  `describe().state.slideId` (always a slide the deck has), `pending` and `serverRevision` as
  the settled state, `/new`, Esc and the Edit menu on the filmstrip's cards; `turboslide-verify`
  names the PDF, TXT and JPEG downloads, `includeSkipped` and `includeNotes`, `slide.list`'s
  `skip` and `template`, `deck.info`'s skipped count and `deck.list`. Every command and id named
  was checked against the tree (`turboslide export pdf ... --verify`, `slides --json` printing
  `template`, the layout id `split`, `numbered: true`, `includeTrashed`, `deck.set` in
  `ACTION_IDS`).
- `docs/gslides-parity/BUILD-STATUS.md`: the merge 2 section (written after the fact from the
  builders' notes and the verifier's numbers, which the text says), the fix round section,
  deviations 4 to 10.

### 8.2 Decisions

1. **The post-removal rule is the index rule.** After Delete, Google selects the slide that moves
   into the deleted slide's position and the previous one when the last slide was deleted. The
   same rule serves an undone New slide or Duplicate (the slide at the copy's index, which is the
   one after the original, or the original at the end) and an external removal. The research
   (R02 section 5, R07's task table) does not record Google's choice, so AGENTS.md records the
   rule as an assumption for the audit to check.
2. **The menu's clipboard follows the last focused region, and "nothing selected on the canvas"
   counts as the slides.** With nothing selected Google's Edit > Copy copies the current slide;
   with a block selected it copies the block. The region alone would leave the canvas region
   with nothing selected copying nothing, so the slide handlers also apply when `selection` is
   null. The notes textarea keeps the browser's own clipboard (the fallback sentence, as before).
3. **Cut from the menu shows the "Slide deleted" snackbar with Undo**, the same as the
   filmstrip's right-click Cut (`Sidebar.tsx` `removeSlides`), so the two paths to one action
   read the same; Google shows no snackbar. A later round can drop it from both.
4. **Select all from the menu with the filmstrip focused still answers the fallback sentence.**
   `SidebarEdit` has no input for the selection (it is internal state with `onSelectionChange`
   out), so the route cannot select every card; the filmstrip's own Cmd+A works when it has
   focus. Request to B4 below.
5. **Finding 17 was a lease refusal in a loop, and the spec now runs as one author.** The
   verifier's replay on a fresh copy settled in six seconds and the spec never settled, in both
   the verifier's runs and three of the fixer's, because task 1 opens the deck from the home
   page's card, whose link carries no `author`, so that page leases the cover as the default
   author `studio`; task 3 then edited the cover as `agent:e2e-tasks`, and an agent's write to a
   slide another author holds is refused (SPEC 6.7; a closed tab's lease lives ten minutes). The
   route re-sent the refused write forever (8.1); that is fixed. The spec's second author was an
   accident of convention (the other specs use an agent id): the sales user is one person, so
   every task now opens as the default author and no lease stands in the way. The Here column's
   counts are unchanged. The lease still outlives a closed tab; releasing it on `pagehide` needs
   a request that survives the page (the server function client cannot set `keepalive`, and the
   hosted `/api/actions` route wants the bearer token), so that stays as it is and the card is
   the recovery.

### 8.3 The shared server and live edits

The shared `playwright.config.ts` names 4321 and reuses a listening server, and the studio's Vite
dev server watches the whole tree. During the fixer's first full runs the server log recorded 48
hot updates and 7 SSR page reloads from other builders' fix rounds (`EditorShell.tsx`, the
dialogs, `ToolbarTail.tsx`, `menus/strings.ts`; several `Could not Fast Refresh`, which reloads
the page), and a reload in the middle of a task resets the page under test (the second full
run's task 5 failure, `data-active` staying on `breaks` after Ctrl+M, landed in that window and
is the verifier's finding 19). The acceptance runs below were made against a server started with
the studio's own config plus `server.hmr: false` and `server.watch: null` (a scratch `.mts`
config that spreads the app's config; no repository file changed), so the served code is the
tree as each module was first requested. The ship step's `pnpm check` runs on a quiet tree and
needs none of this.

### 8.4 Requests

1. **B4, `packages/chrome/src/Sidebar.tsx`:** a way for the route to set the filmstrip's
   selection (a `selected` input on `SidebarEdit`, or a `selectAll` on an imperative handle) so
   Edit > Select all from the menu bar selects every card when the filmstrip last had focus
   (SPEC 2.2). Until then the menu answers the fallback sentence for that one row.
2. **Verifier, `scripts/gslides-parity-audit.mjs`:** after `slide.deleteSlide` and after Undo of
   `slide.newSlide` and `slide.duplicateSlide`, assert that `describe().state.slideId` is the
   slide at the removed slide's index (clamped) and that `slide.get` answers for it; the audit's
   present check (the slide exists) is what the fix satisfies, the index rule is the stronger
   one.
3. **Verifier, VERIFICATION.md finding 17:** the cause is the lease refusal above, not the
   render queue; the note "the route should not hold a document write behind a thumbnail render"
   does not describe what happened (the write answered in 1.5 s and was refused).
4. **Ship step:** B3's requests 4 (the tooltip audit walking each menu's rows) and 6
   (`@turboslide/render` in `packages/chrome/package.json`) are not in the tree
   (BUILD-STATUS.md, merge 2); B2's request 7 (`tables` in `EXPORT_OPTIONS`) is open.

### 8.5 Commands run and their results

Run from `/Users/kevinliu/repos/Turboslide` on 2026-09-12 (Node 24). The dev server for the
browser steps was `node_modules/.bin/vite dev --port 4321 --strictPort` from `apps/studio`,
then the no-watch variant of section 8.3 on the same port; stopped at the end. No `pnpm
install`, `pnpm add`, `pnpm exec`, `pnpm build`, `pnpm generate:contracts`, git write command or
Docker. Ports 3005 and other builders' ports were not touched.

| Command                                                                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b`                                                                                                                                                       | Exit 2 at the start of the round on B1's half landed `deck.set` (4 errors, none in the fixer's files); exit 0 once B1's fixer added it to `ACTION_IDS`, and again after every edit here (`tsc -p apps/studio/tsconfig.json --noEmit` 0 errors; `tsc -p packages/headless/tsconfig.json --noEmit` 0 errors)                                                                                                                                                                         |
| `node_modules/.bin/playwright test apps/studio/e2e/ten-tasks.spec.ts -g "current slide follows\|Edit > Copy"` (dev server on 4321)                                               | 2 passed (9.9 s, 7.4 s) on the first run after the route fix                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `node_modules/.bin/playwright test apps/studio/e2e/ten-tasks.spec.ts`, three runs on the watching server                                                                         | 11 passed, task 3 failed in `settled()` at 60 s; then 10 passed, task 3 (157 s settle, then the find field not focused) and task 5 (`data-active` on `breaks`) failed under 48 hot updates and 7 page reloads from other fixers; then on the no-watch server 11 passed and task 3 timed out at 240 s: the lease refusal loop                                                                                                                                                       |
| `node diag-rename.mjs homeFirst` (a playwright-core probe in the scratchpad: the home page as the default author, then the rename as `agent:fixer`)                              | Before the fix: `writeDeckFn` answered 200 every 1 to 2 ms for the probe's two minutes, `pending` 1 throughout. After the fix: one write answered in 1.5 s, `pending` 0 at 7.8 s, revision 2 against server revision 1 (the card), no further writes                                                                                                                                                                                                                               |
| `node_modules/.bin/playwright test apps/studio/e2e/ten-tasks.spec.ts` on the no-watch server after both fixes                                                                    | 12 passed in 45.8 s (the ten tasks and the two new tests); task 3's rename settled in 3 ms                                                                                                                                                                                                                                                                                                                                                                                         |
| `node apps/cli/bin/turboslide.mjs lint --chrome --url http://localhost:4321/edit/gt-brand --widths 1440,1280,390 --themes light,dark --states editorGrid,editorMenu,editorPanel` | With `panel.toggle`: exit 2, `elementHandle.click: Timeout 30000ms exceeded`, the devtools trigger intercepting. With the chord: 24 audits over 3 widths and 2 themes, 0 with findings, 0 states unapplied, exit 0                                                                                                                                                                                                                                                                 |
| the same on `http://localhost:4321/new`                                                                                                                                          | 24 audits over 3 widths and 2 themes, 0 with findings, 0 states unapplied, exit 0                                                                                                                                                                                                                                                                                                                                                                                                  |
| `node_modules/.bin/vitest run` (the root, what `pnpm test` runs)                                                                                                                 | First run: 1 failed of 1486 (`agent/skills.test.ts`: `turboslide-api/SKILL.md` at 53 lines against the 50 line cap, from the new section). After the trim to 46 lines: 149 files, 1486 passed, 3 skipped, exit 0                                                                                                                                                                                                                                                                   |
| `node scripts/gslides-parity-audit.mjs --base http://localhost:4321 --out <scratch>/parity-audit.json` (the verifier's audit, on the no-watch server after every fix here)       | 988 pass, 14 fail, 170 skipped in 397 s (the verifier's pass 1: 974, 32, 170). The 14 are B3's rows (View > Full screen, Insert > Text box, Shape, Table, Line, Icon, Material, Format > Borders & lines > Border color and weight; VERIFICATION findings 4, 6 and 10); `insert.newSlide.activeSlide`, `slide.newSlide.activeSlide`, `slide.duplicateSlide.activeSlide`, `slide.deleteSlide.activeSlide`, `edit.cut`, `edit.copy` and `edit.paste` pass, and `tooltipAudit` passes |
| `node_modules/.bin/prettier --check` on every file changed here                                                                                                                  | Clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
