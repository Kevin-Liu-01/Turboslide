# Google Slides parity round, build status

Kept by the integrator (`docs/gslides-parity/MILESTONES.md`, "Integrator"). One heading per
builder: what landed, what was cut, and the open requests with where they went. Section numbers
refer to `docs/gslides-parity/SPEC.md`. Updated at merge 1, 2026-09-12, over `main` at `14da621`,
and again at the fix round the same day (the merge 2 and fix round sections at the end). Full
notes: `docs/gslides-parity/build/b1.md` to `b6.md`, `b3a.md`, `integrator.md`.

## B1 Document, layouts, actions, lint and store

Landed (day 1, merged at merge 1): the schema fields of 7.2 to 7.4 (skip, template, appearance,
counter, trashedAt, numbered, link, multiline Texts, the table block); `layouts.ts` with the 21
layouts and `apply-layout.ts` (5.2, 5.5, 5.6); the fourteen actions of 7.5 in `actions.ts` with
CLI handlers over a local decks folder and MCP registration; `copy/empty-placeholder` and
`table/size`; the store's list, copy, trash, restore and remove on the file, tmp and Blob
backends; `decks/templates/blank`; `decks/fixture/gslides`. Suites: schema 182, lint 62, store 93,
cli 64, agent 133, mcp 34, all passing on the merged tree.

Cut or unproven (B1's own list): the Blob copy, trash, restore and remove are proven against the
in-memory fake only; `--include-notes` on `export pptx` is parsed, the writer does not carry notes
(B2); nothing draws a prompt, a table or a numeral yet (B2, B4).

Requests and where they went:

1. `packages/import/src/ids.ts` `table` stem: done (integrator).
2. `packages/chrome/src/inspector/sections.ts` `table` icon: done (integrator, smallest edit in
   B3's file).
3. `packages/render/src/blocks/render-block.ts` `case 'table'`: done with a minimum
   `blocks/table.ts` and its test (integrator, smallest edit in B2's files); B2 replaces the
   markup.
4. `packages/agent` coverage `GS1`, `DESTRUCTIVE`, `expectedByMilestone`: done (integrator).
5. Hosted deck.list, deck.copy, deck.trash, deck.restore, deck.remove, slide.import, export.text
   and view.zoom in the studio: done (integrator; `apps/studio/src/server/actions.ts`,
   `agent-actions.ts`, `routes/edit.$deckId.tsx`).
6. `apps/cli/src/deck-files.ts` `slideTitle(slide, n)`: done (integrator).
7. `decks/templates/gt-brand/template.json` to 21 archetypes: open, waits for B3 to delete
   `packages/chrome/src/__tests__/slide-templates.test.ts` (B3 day two); then the integrator or
   B1 extends the list.
8. B2: `exportPptx` and the standalone build take `includeSkipped` and `includeNotes`; render
   record entries `<blockId>/<r>/<c>` of type `cell` with `lines`; prompts via `promptFor` in
   live mode; the dashed plate for `EMPTY_ASSET_REF`. Open, B2's day two inputs.
9. Commit the regenerated contracts with the round: open, the ship step commits.

Two edits the integrator made in B1's files at merge 1, to be kept: `packages/lint/src/rendered/
{png,bitmap}.ts` import node built-ins as namespaces (the editor page reaches them through
`@turboslide/lint/run`), and `deckText` counts bytes with `TextEncoder` (it runs in the page).

## B3 Chrome shell

Landed (day 1, merged at merge 1): `menus/model.ts` (every row of 2.0 to 2.10, the toolbar order,
the right-click menus, the fourteen action ids, the predicates), `menus/strings.ts` (SPEC 12),
`menus/keys.ts` (the chord grammar and the key table), the two Google fixtures, `Menu.tsx` (the
ARIA menu primitive), `Snackbar.tsx`, and the model, shortcut, default-view-words, component and
snackbar tests: 63 tests. The whole chrome suite is 187 passing on the merged tree (the eleven
failures B3 reported were B1's `table` type and `link` field reaching B3's files; fixed at merge
1).

Not proven yet (B3's own list): `Menu.tsx` has run under jsdom only; the menu bar's hover switching
is day two; the dynamic Apply layout submenu takes B1's `LAYOUTS` and B2's thumbnails; the
Snackbar reads `--pt-status-h` with a fallback until `tokens.css` gains it.

Requests and where they went:

1. SPEC 2.12 tally (printed 109 Now, 24 Later, 45 Omit; the tables give 106, 24, 38, Arrange +1
   Omit for Regroup; "the nine Advanced rows" are ten): recorded here as a deviation for Kevin
   (SPEC 15.11); the model and `menu-model.test.ts` hold the row counts.
2. SPEC 4.3, "Every item here is also in the menu bar" with two exceptions (Text fitting and Alt
   text are Format options sections, modelled as context-only items under Format): recorded here
   as a deviation for Kevin.
3. SPEC 14.4 item 2, the stub tooltip check should read `.pt-tip-doc` (or `tooltipDoc`,
   `isStubTooltip`), not the plate's whole text: recorded here for the verifier's
   `scripts/gslides-parity-audit.mjs`.
4. `packages/chrome/package.json` exports for `Menu`, `Snackbar`, `menus/*`: done (integrator).
5. The Heroicons the menu rows need in `packages/chrome/src/icons.tsx` and the theme sprite
   (about 45 names listed in `b3a.md` section 4 item 5): reassigned to B3 day two; the sprite
   regeneration is in `packages/theme`, which no builder owns, so B3 edits it and the integrator
   resolves any shared line.
6. `--pt-menu-w` and `--pt-status-h` in `tokens.css`: B3's own file, day two.
7. The `table` icon in `sections.ts` and `palette-data.ts` and the `link` field in
   `inspector-generate.test.ts`: done (integrator, smallest edits); `palette-data.ts` needed
   nothing once `BLOCK_ICONS` had the entry.

## Integrator, merge 1

Landed: the tree typechecks (`tsc -b` exit 0) and tests as one (`pnpm test`: 130 files, 1297
passed, 3 skipped); `pnpm build` and `check-client-bundle` pass; contracts regenerated and current;
the fourteen actions wired in the editor's `on(...)` table and on the host, proven by
`apps/studio/e2e/gslides-actions.spec.ts` (2 of 2 against a dev server on 4390); the empty
`/present/:deckId` shell; `deck.info` and `slide.list` complete on every transport; the notes in
`docs/gslides-parity/build/integrator.md`.

Check steps 1 to 6: 1, 2, 4, 5, 6 exit 0. Step 3 exits 1 on `git diff --exit-code` alone: the
regenerated contracts differ from `HEAD` until the ship step commits them; `--check` says they are
current and `git ls-files` finds them tracked.

Open for the integrator at merge 2: `ten-tasks.spec.ts` (SPEC 11.2), check steps 20 and 21 and
step 18's URLs, `AGENTS.md`'s deviations list (SPEC 7.9), the skills' prose, and the 21
archetypes once B3 deletes the slide templates test.

## B2 Renderer and export

Not started; starts after merge 1. Inputs ready: the table block and `EMPTY_ASSET_REF` in the
schema, `PROMPTS` and `promptFor` in `@turboslide/schema/layouts`, the `cell` render record
convention (`<blockId>/<r>/<c>` with `lines`) the linter already reads, `includeSkipped` and
`includeNotes` on `export.run` and `build.run`. The integrator's minimum table renderer
(`packages/render/src/blocks/table.ts`, `__tests__/table.test.ts`) is B2's to replace; keep the
`data-run` pointers `rows/<r>/cells/<c>` and one `.para` span per paragraph, which the linter,
`text.replace` and the inline editor read. `packages/export/src/report.test.ts` already lists
`table` among the native types.

## B4 Filmstrip, canvas and text

Not started; starts after merge 1. Inputs ready from the integrator: `EditorSnapshot.zoom`
(a factor or `'fit'`, set by `view.zoom`) for the Sheet to draw; `slide.new` and
`slide.duplicate` select the new slide through `shell.select`; `block.duplicate` selects nothing
yet (B4 decides); `Menu.tsx` and `menus/model.ts` are exported for `ContextMenu.tsx`. One
observation: on the dev server, filmstrip thumbnail renders for several new slides held every
write for about 10 s (100 ms on an idle server); B4 should keep this in view when the filmstrip
warms thumbnails after New slide.

## B5 Routes, home and files

Not started; starts after merge 1. Inputs ready: `deck.list`, `deck.copy`, `deck.trash`,
`deck.restore` and `deck.remove` run on the host over the hosted collection (`/api/actions`, the
MCP tools, and `runDeckAction` from the editor); `slide.import` copies assets and pushes them on
Blob; `/present/:deckId` exists as a shell so the route table is complete for `/new`,
`/decks/trash` and `/print/:deckId`. The editor does not navigate after `deck.trash` of the open
deck; the home and menu handlers decide that and word the snackbars from SPEC 12.

## B6 Present mode and Presenter view

Not started; starts after merge 1. `apps/studio/src/routes/present.$deckId.tsx` exists as the
empty shell MILESTONES asks the integrator for: it loads the deck through `getDeck` and shows
`DeckViewer` in present mode with a `noindex` meta; B6 replaces the page. The present scope key
bindings are in `menus/keys.ts` as data.

## Integrator, merge 2

Written at the fix round from the builders' notes (`build/b2.md` to `b6.md`) and the verifier's
numbers (`VERIFICATION.md`, pass 1), because merge 2 itself left no report: the six builders'
files were merged into the shared working tree in the parity chain order and the verifier took
the tree as it stood at 05:04 PDT. What each builder landed, what was cut, and where the requests
went:

- B2 (`build/b2.md`): prompts, empty pictures, paragraph breaks, the table renderer, the numbered
  list, block links, the counter, the print document and the thumbnails with prompts in
  `packages/render`; the scene, the PPTX table, links, notes under `includeNotes`, the PDF export
  and its gate, TXT and JPEG in `packages/export` and `packages/headless`; the render worker's PDF
  job. Cut or unproven: the table's per cell budget under LibreOffice (none on this machine), the
  hosted PDF job, PowerPoint's honouring of a slide jump on an invisible run. Requests 1 to 6
  (the CLI's `export.ts`, `args.ts`, `render.ts` `--format jpg`, the facade route, the export
  test, the usage text) are in the tree; request 7 (`tables` in `EXPORT_OPTIONS`) is open.
- B3 (`build/b3.md`, `b3a.md`): the editor shell (`EditorShell`, the title row, the menu bar,
  the toolbar head and tail with More under 1100 px, the bottom bar, the snackbar, the dialogs,
  the layout grid, the Themes and Format options panels, Search the menus, the shortcuts dialog,
  `useEditorKeys`, the 65 icons). Not proven at the verifier's pass: six defects in the plan and
  the title row (VERIFICATION findings 3 to 7 and 10), fixed in B3's fix round. Requests 1 to 3
  are in the tree (the route's `editor` input, `deck.set`, the headless editor states); 4 (the
  tooltip audit walking each menu's rows) and 6 (`@turboslide/render` in the chrome package) are
  not (`scripts/tooltip-audit.mjs` names no menu bar control; `packages/chrome/package.json`
  lists no render dependency) and stay open for the ship step; 5 (the sprite) B3 did; 7 and 8
  went to B4 and B5; 9 (Hide the menus on the toolbar row) is deviation 4 below.
- B4 (`build/b4.md`): the filmstrip of cards with Google's right-click menu, multi-select, drag,
  the keys and the snackbars; the canvas selection, the freeform edges, the clipboard, paint
  format, the tool insert; single click caret, Esc commits, paragraphs, table cells, the notes
  pane. Cut or unproven: the spelling menu inside a run (deviation 5), several moves as one
  `section.set` (deviation 6). Requests 1 to 7 are in the route and the specs; 8 and 9 went to
  B3.
- B5 (`build/b5.md`): `/new` with the deferred create and the auto-title, the home page with
  Recent and the card menu, `/decks/trash` with Delete forever, Make a copy, Import slides, the
  Share and Publish dialogs, the Download dialog, `/print/:deckId`. Cut or unproven: the Blob
  copy and trash against the live store (the fake proves them). Requests 1 to 3 and 7 are in the
  route, the server and `check.mjs`; 4 to 6 went to B6 and B3.
- B6 (`build/b6.md`): the slideshow surface with Google's toolbar and keys, Presenter view in a
  second window over a channel, the Slideshow button's handlers, `?present=1` on the view route.
  Cut or unproven: auto-play, the pen and the two downloads inside the show are Later stubs
  (deviation 7). Request 1 is in the route; 2 to 4 went to B3, 5 and 6 to B5, 7 needed no run, 8
  went to the verifier.
- Integrator at merge 2: `ten-tasks.spec.ts` (SPEC 11.2), check steps 20 and 21 and step 18's
  editor URLs and states, the fourteen actions on every transport (`gslides-actions.spec.ts`),
  the contracts regenerated. The verifier's pass found the tree not shipping as it stood
  (`tsc -b` on the half landed `deck.set`, seven test failures, check stopping at steps 3, 4, 5,
  18 and 19, nine shell defects); the fix round below takes the integrator's share.

## Fix round, integrator

The verifier's findings that name the integrator's files (`VERIFICATION.md` section 9), and what
was done (`build/integrator.md` section 8 has the commands and the numbers):

- Finding 8 (severity 2), the removed slide stayed current after Delete slide and after Undo of
  New slide or Duplicate slide: fixed in `apps/studio/src/routes/edit.$deckId.tsx`. The
  controller's `setDocument` compares the slide order before and after every document change
  (a write, an undo, a redo, a reload after an external write) and, when the current slide is
  gone, selects the slide now at its index, clamped to the end (`replacementSlide`), on the
  snapshot and on the shell; `viewState()` (the `view.*` results and `describe().state`) never
  names a slide the deck does not have. Covered by the new test "the current slide follows a
  removal" in `ten-tasks.spec.ts`.
- Finding 9 (severity 2), Edit > Cut and Copy did nothing with a filmstrip card selected and Paste
  stayed disabled: fixed in the route. The Edit menu's clipboard handlers follow the region that
  last had focus: the canvas's while a block or a run is selected there, the slides' while the
  filmstrip last had focus or nothing is selected on the canvas (Copy writes the selected slides'
  JSON to the clipboard, Cut adds one `slide.remove` per slide with the "Slide deleted" snackbar
  and Undo, Paste inserts slides after the last selected card with fresh ids, or `slide.import`
  when they come from another deck, and hands any other payload to the canvas). Covered by the
  new test "Edit > Copy, Paste and Cut from the menu bar" in `ten-tasks.spec.ts`. Select all from
  the menu with the filmstrip focused still answers the fallback sentence: the filmstrip's
  selection has no input prop (request to B4 in `build/integrator.md`).
- Finding 14 (severity 2), the merge 2 deliverables: this section, the deviations below, the six
  amendments of SPEC 7.9 edited into `docs/spec/SPEC.md` and recorded in `AGENTS.md`, and the
  fourteen actions named in the four skills' prose (`skills/*/SKILL.md`).
- Finding 16 (severity 2), check step 18 clicked the toolbar's Theme button, which collapses into
  More at 390 px: the `editorPanel` state of `packages/headless/src/shell.ts` now opens the right
  panel through Google's Version history chord (Cmd+Option+Shift+H) and closes it with Escape,
  which works at every audited width; the bottom bar's Show side panel button was tried first
  and sits under the dev server's devtools trigger, so Playwright refuses that click.
  `scripts/check.mjs` keeps its three editor states.
- Finding 17 (severity 1), task 3 never settling after the cover rename: two causes, both fixed.
  Task 1 opens the deck from the home page's card, whose link carries no `author`, so that page
  leased the cover as the default author; task 3 then edited the cover as `agent:e2e-tasks`, and
  the store refused the agent's write for the lease (SPEC 6.7; a closed tab's lease lives ten
  minutes). The route's `onConflict` read that refusal (`code: 'conflict'`, `holder` set, an
  empty `since`) as "someone else wrote, rebase" and re-sent the same write every 2 ms for as
  long as the page lived, so `pending` never dropped; a lease refusal now shows the conflict
  card with the holder and stops. The spec runs every task as the editor's default author, the
  one person the ten tasks describe, so no lease stands between them; task 3 prints its settle
  time. The render queue the verifier suspected was not the cause: the refused write answered in
  1.5 s.

Findings 1, 2, 4 to 7, 10 to 13, 15 and 18 to 20 belong to B1, B3, B4, B5 and the verifier and
are handled in their fix rounds; the integrator's rerun of `tsc -b` after B1's `deck.set` fix
exits 0. After the fixes here the parity audit reads 988 pass, 14 fail, 170 skipped (pass 1:
974, 32, 170); the 14 are the Insert, Full screen and Border rows of findings 4, 6 and 10, B3's.
The ten tasks spec passes 12 of 12, check step 18's editor audits pass 24 of 24 each with 0
findings, and `pnpm test`'s suite passes 1486 of 1486 (`build/integrator.md` section 8.5).

## Deviations recorded for Kevin (SPEC 15.11)

1. SPEC 2.12: the printed tally does not follow from the tables; the model counts rows (106 Now,
   24 Later, 38 Omit; Arrange +1 Omit for Regroup) and "the nine Advanced rows" are ten. Amend the
   table or state the counting unit.
2. SPEC 4.3: Text fitting and Alt text are Format options sections in Google and are modelled as
   context-only items under Format; the sentence "Every item here is also in the menu bar" gains
   the two exceptions.
3. SPEC 14.4 item 2: the stub tooltip test reads the tooltip's sentence span, not the plate's
   whole text, because the Tooltip primitive prints the name first.
4. SPEC 1.1 and 3.1 row 18 disagree on where Hide the menus sits; it is on the toolbar row (B3).
5. SPEC 4.3's text selection menu: a right-click inside an editing run opens the browser's own
   menu, because only that menu carries the spelling suggestions the sales user's typo fix needs;
   Link is Cmd+K and Format options is on the toolbar tail (B4).
6. SPEC 4.1 "one `slide.move` per moved slide in one write": several dragged cards write one
   `section.set`, the one write that carries a whole order; one card stays one `slide.move`.
   Deleting several cards is several `slide.remove` writes with one Undo each (B4).
7. SPEC 9.2: the slideshow surround is `--pt-panel-ink` (black in both themes), not `--pt-ink`;
   the present toolbar draws eight controls where Google's compact bar has four; auto-play, the
   pen and the downloads inside the show are Later stubs; no new action for the blank slide, the
   laser pointer or full screen, which `describe().state` reports (B6).
8. SPEC 7.6: the PDF gate rasterizes at 3200 by 1800, not `pdftoppm -r 144`, so the page lands
   on the 2x render's grid; picture regions are compared and reported but never gated; notes
   travel in a PPTX only under `includeNotes` (B2, decision 15.2).
9. SPEC 7.9's six amendments to `docs/spec/SPEC.md`, edited in and listed in `AGENTS.md`
   (integrator).
10. After a removal the editor selects the slide now at the removed slide's index, clamped to the
    end. The research does not record which slide Google selects after a delete; the rule follows
    Google's observed behaviour and stands until the audit checks it (integrator, fix round).
