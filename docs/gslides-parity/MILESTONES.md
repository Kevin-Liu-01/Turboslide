# Google Slides parity build round

Companion to `docs/gslides-parity/SPEC.md` (the specification this round builds; section numbers below refer to it) in the shape of `docs/spec/MILESTONES.md`. One round, six builders with disjoint file ownership, an integrator, a verifier, a fixer round and a ship step. Every acceptance command runs from the repository root at `/Users/kevinliu/repos/Turboslide` on a machine with Node 24, pnpm 11 through corepack, the Chrome for Testing binary `playwright-core` installs, `pdftoppm` (poppler) for the PDF gate, and the Prototemplate checkout at `/Users/kevinliu/repos/Prototemplate` for `pnpm check` steps 7, 8 and 12. Estimates are judgments from the editor depth round (`docs/EDITOR-DEPTH-STATUS.md`); "agent-hours" counts builders and the integrator together.

Ownership rule: a builder edits only the files named in their row. A change needed outside those files is a request to the integrator, written in `docs/gslides-parity/BUILD-STATUS.md` under the builder's heading, and the integrator makes it or reassigns it. Nothing is claimed done until the builder's acceptance commands exit 0 on their branch with `main` merged in, and `pnpm check` step 12 (compare to shoot at 0.5 percent) is green on that branch.

Baseline: `main` at `8c7056c`. The tree is clean except an untracked `.github/` that stays untracked. Branch names: `gs/b1-document`, `gs/b2-render-export`, `gs/b3-chrome`, `gs/b4-canvas`, `gs/b5-routes`, `gs/b6-present`, `gs/integration`.

## The order

```
Day 1           Day 2                 Day 3                 Day 4            Day 5
B1 document ──► merge 1 ──► B2 render and export ─┐
B3 menu model   (B1 + B3     B4 canvas and text    ├──► merge 2 ──► verifier ──► fixer round ──► ship
   and Menu      primitives) B5 routes and home    │    (integrator)   (14.4, 14.6)   (each in own files)
   primitive                 B6 present            ┘
```

- Day 1: B1 lands the schema, the layouts table, the actions and the store changes; B3 lands `menus/model.ts` (data only), `Menu.tsx` and `Snackbar.tsx`. The integrator merges both (merge 1) so every other builder types against the new schema and imports the one menu primitive.
- Days 2 and 3: B2, B4, B5 and B6 build in parallel against merge 1. B3 continues on the shell. The integrator wires the `on(...)` table for the fourteen actions as they land and keeps `pnpm generate:contracts` current.
- Day 4: merge 2, `pnpm check` on the merged tree, the verifier's pass, the parity audit.
- Day 5: the fixer round in each builder's files, the second verifier pass, the ship step.

Estimate: about 210 agent-hours in total; about five days of wall time with six builders and the integrator.

## B1 Document, layouts, actions, lint and store

Estimate: 30 agent-hours. Lands on day 1 because every other builder reads it.

### Inputs

SPEC sections 5.1, 5.2, 5.5, 7.1 to 7.5, 7.7 (the field shapes only), 7.8; R03 b.2; R11 A8 (the 20 by 20 cap).

### Owns

`packages/schema/src/{deck,blocks,text,actions,catalog,reduce,validate,mutations,rules,export}.ts`, `packages/schema/src/rules.json`, `packages/schema/src/layouts.ts` (new; the fifteen templates moved from `packages/chrome/src/slide-templates.ts` with empty Texts, plus the six new entries), `packages/schema/src/blocks/table.ts` (new), `packages/schema/src/apply-layout.ts` (new; the rules of 5.5 as a pure function), `packages/schema/src/**/*.test.ts`, `packages/lint/src/**`, `packages/store/src/**`, `decks/templates/blank/**` (new: the blank template folder with `template.json`, `deck.json`, `slides/`, `assets/` holding the four starter twins), `decks/templates/gt-brand/template.json` (archetype ids), `decks/fixture/gslides/**` (new: the export fixture deck of 14.5), `apps/cli/src/commands/{slide,slides,deck,block,export}.ts` (the handlers for the fourteen actions), `packages/mcp/src/**` (generated tool wiring), `docs/grammar.md` (regenerated).

### Delivers

1. `SlideBase.skip`, `SlideBase.template`, `Deck.defaults.appearance`, `Deck.defaults.counter`, `Deck.trashedAt`, `PlainBlock.numbered`, `BlockBase.link`, `multilineTextSchema` on the four pointers, the `table` block in the catalog and `NATIVE_BLOCK_TYPES`, all optional at version 1 (7.2, 7.3, 7.4).
2. `packages/schema/src/layouts.ts` with the 21 entries of 5.2 in order, `LAYOUT_IDS`, `google: true` on the first eleven, a `make` per entry producing empty Texts, and `derivedLayout(slide)` for section 5.6.
3. The fourteen actions of 7.5 in `actions.ts` with inputs, outputs, CLI usages, MCP names and parsing examples; the reducer paths (`slide.set /skip`, `/template`, `deck.set /defaults/appearance`, `/defaults/counter`, `deck.set` refusing `/trashedAt`); `slide.applyLayout` built on `apply-layout.ts` and `convertLayout`; `text.replaceAll` over `blockTexts` and `slideTexts`; the parser accepting `#s/<id>`, `#next`, `#previous`, `#first`, `#last`.
4. Lint: `copy/empty-placeholder` (1), `table/size` (3), the copy rules skipping table cells and empty Texts, `rows/two-lines` on cells, the slide link target check (2).
5. Store: `deck.list` (`listDeckHeads` skipping `trashedAt`), `deck.copy` over pack and unpack with `slideIds` and `removeNotes`, `deck.trash`, `deck.restore`, `deck.remove` on the file, tmp and blob stores, `slide.import` server side with `ensureAssets`, the blank template with the starter assets and `Untitled presentation` as its default title, `DECK_TEMPLATES` unchanged (`gt-brand`, `blank`).
6. CLI commands for every new action; `pnpm generate:contracts` run and its outputs committed.

### Acceptance

```
pnpm --dir packages/schema test
pnpm --dir packages/lint test
pnpm --dir packages/store test
pnpm --dir apps/cli test
pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts'
pnpm --dir packages/agent test   # coverage.test.ts names the fourteen actions
pnpm exec turboslide validate decks/gt-brand && pnpm exec turboslide validate decks/fixture/gslides
pnpm exec turboslide lint all --json > .turboslide/lint.json   # the GT count is not higher than at 8c7056c
node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot /Users/kevinliu/repos/Prototemplate/deck --max-mismatch 0.005
```

Plus, in a temp deck created with `turboslide deck create --from blank`: `turboslide slide new --layout big-number`, `slide apply-layout <id> title`, `text replace Acme Globex`, `slide skip <id>`, `deck copy <id> --name Copy`, `deck trash <id>`, `deck list`, `deck restore <id>`, `deck remove <id> --confirm` each exit 0 and the deck validates after each. `migrations.test.ts` asserts the GT deck and both templates are unchanged by `migrate`.

## B2 Renderer and export

Estimate: 34 agent-hours. Starts after merge 1.

### Inputs

SPEC sections 5.4, 7.2 (the renderer, Perfect and Editable text columns), 7.3, 7.4, 7.6, 14.5; `docs/pptx.md`; `docs/export-verification.md`; the pptxgenjs API pages of section 16.

### Owns

`packages/render/src/**`, `packages/theme/src/gt-ink-paper/sheet.css` (the table grid, the prompt colour, the paragraph span, the numeral), `packages/export/src/**` (the table writer, the paragraph `breakLine`, hyperlinks on runs and shapes, the empty Text skip, `includeSkipped` and `includeNotes`, the report rows, `pdf/build.ts`, `text.ts` for `export.text`), `packages/headless/src/**`, `apps/render-worker/**` (the PDF job and the `pdftoppm` verify), `apps/studio/src/server/{download,export-sync,render}.ts` (the PDF, TXT and JPEG facades), `docs/export-verification.md`, `docs/pptx.md` (the table and PDF sections).

### Delivers

1. Renderer: prompts in `live` mode only with `data-prompt` and `aria-hidden`; `\n` as one `<span class="para">` per paragraph in the four multiline pointers; the table grid in the `.rows` idiom with `data-run` per cell; the numeral in the key position for `numbered`; the `<a>` wrapper for block links and slide links, active outside the editor; the counter obeying `defaults.counter`; `derivedSlideTitle` falling back to "Slide n"; `renderThumb` for the layout grid.
2. Perfect: skipped slides and notes behind the two flags; empty Texts produce no run; table cells as runs; an invisible hyperlink rectangle over a linked block; the report counting omitted slides.
3. Editable text: `addTable` with the options of 7.3 behind the per cell 3 px verify budget and the ruled rows construction as the fallback named in `residual`; `breakLine` per paragraph; `hyperlink` on runs, text boxes, shapes and pictures with `{ slide: n }` over exported slides; the numeral run.
4. PDF on the render worker per 7.6 with the `pdftoppm` gate and its report fields; TXT through `export.text`; JPEG through the render route.
5. Snapshot tests for every new render case in both themes.

### Acceptance

```
pnpm --dir packages/render test
pnpm --dir packages/export test
pnpm --dir apps/render-worker test
pnpm exec turboslide render all --theme light,dark --scale 1 --out .turboslide/render --json
node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot /Users/kevinliu/repos/Prototemplate/deck --max-mismatch 0.005
pnpm exec turboslide export decks/fixture/gslides --mode flatten --out .turboslide/gs-flatten && pnpm exec turboslide export check .turboslide/gs-flatten
pnpm exec turboslide export decks/fixture/gslides --mode native --out .turboslide/gs-native && pnpm exec turboslide export check .turboslide/gs-native
pnpm exec turboslide export decks/fixture/gslides --format pdf --verify --out .turboslide/gs-pdf
pnpm exec turboslide export txt decks/fixture/gslides > .turboslide/gs.txt
```

The native report shows the table as an `a:tbl` or names the fallback; the flatten report is `perfect: true`; the PDF report has one page per unskipped slide and every page under the gate of 7.6; the GT deck's PDF opens with 85 pages.

## B3 Chrome shell

Estimate: 44 agent-hours. The menu model, `Menu.tsx` and `Snackbar.tsx` land on day 1; the rest after merge 1.

### Inputs

SPEC sections 1, 2, 3, 5.7, 6.6, 6.7, 10.1, 12, 13; R01; R02 sections 2 to 4 and 8 to 11; R08 Part B.

### Owns

`packages/chrome/src/{ViewerShell,Toolbar,ToolButton,Seg,StatusChip,DeckName,ThemeButton,Palette,HelpCard,Inspector,InspectorControl,ExportMenu,ExportReportCard,InsertMenu,Tooltip,Toast,ConnectCard,IconPicker,AssetPicker,LintPanel,VersionsPanel,HistoryPanel,SourceDrawer,TwinStage}.tsx` and their CSS, `packages/chrome/src/inspector/**`, `packages/chrome/src/tokens.css`, `packages/chrome/src/useShellKeys.ts`, `packages/chrome/src/palette-data.ts` (the insert entries; the blanks move to layouts), new `packages/chrome/src/{TitleRow,MenuBar,Menu,ToolbarHead,ToolbarTail,BottomBar,ThemesPanel,LayoutGrid,FormatOptions,Snackbar,ShortcutsDialog,ToolFinder}.tsx`, new `packages/chrome/src/menus/{model,strings,keys}.ts` and `packages/chrome/src/menus/__fixtures__/{google-menus,google-shortcuts}.json`, new `packages/chrome/src/dialogs/{Open,ImportSlides,MakeCopy,Share,Publish,Download,SlideNumbers,Details,FindReplace,NameVersion,DeleteForever,AgentAccess,Help}.tsx`, `packages/chrome/src/__tests__/**` except the files B4 owns, `packages/chrome/src/slide-templates.ts` (deleted; its tests move to schema).

### Delivers

1. The title row, menu bar, toolbar head and tails, bottom bar, compact mode and the tokens of section 1; the More button under 1100 px.
2. The menu model as data with every row of section 2 and its `effect`; `Menu.tsx` as the one primitive for the bar, the context menus and the dropdowns (the ARIA pattern of 13.1); the stub tooltip formula; the access keys.
3. Format options (the Inspector regrouped at 320 px), the Themes panel, the layout grid (reading `LAYOUTS` and `renderThumb`), the Version history panel, Check slides, the dialogs listed above, the Snackbar (5 s, one action, Esc), the ToolFinder (the palette in menu mode), the ShortcutsDialog from the model and the R04 fixture.
4. `useShellKeys.ts` split: the editor map with no bare letters and Google's chords; the view route map unchanged; the one time snackbar on a retired letter.
5. Appendix A of proposal 2 realised: every retired surface reachable under Tools > Advanced or Extensions.

### Acceptance

```
pnpm --dir packages/chrome test   # menu-model, shortcuts, default-view-words, the existing suites
pnpm build && node scripts/check-client-bundle.mjs apps/studio/dist
[server] pnpm exec turboslide lint --chrome --url http://localhost:4321/new --widths 1440,1280,390 --themes light,dark
[server] pnpm exec turboslide lint --chrome --url http://localhost:4321/edit/gt-brand --widths 1440,1280,390 --themes light,dark
[server] pnpm exec turboslide lint --chrome --url http://localhost:4321/decks --widths 1440,1280,390 --themes light,dark
[server] node scripts/tooltip-audit.mjs --base http://localhost:4321 --strict
```

0 chrome lint findings, 0 tooltip misses, 0 tooltips containing an action id or a JSON pointer in the default view.

## B4 Filmstrip, canvas and text

Estimate: 36 agent-hours. Starts after merge 1; uses B3's `Menu.tsx` for the context menus.

### Inputs

SPEC sections 4, 5.3, 5.4 (the editor side), 7.3 (gestures), 7.4, 7.2.15, 8, 10.2; R08 Part A; R09 Parts A and C; R11 Part A.

### Owns

`packages/chrome/src/{Sidebar,ListRow,Thumb,ThumbShot,SidebarFilter,Overlay,PreviewLayer}.tsx` and their CSS, new `packages/chrome/src/{ContextMenu,NotesPane}.tsx`, `packages/viewer/src/{Editor,InlineText,Selection,Gestures,Freeform,Guides,GridView,BookView,Marquee,keys,snap,model}.ts*` and their CSS, new `packages/viewer/src/clipboard.ts`, `packages/viewer/src/__tests__/**`, `packages/chrome/src/__tests__/{thumb-component,overlay-component}.test.tsx`, `apps/studio/e2e/{text-editing,filmstrip}.spec.ts` (new).

### Delivers

1. The filmstrip of 4.1 (cards, skipped state, passive section labels, multi-select, drag with the section rule, the keys) and its right-click menu in the order of 4.2; grid view per 4.4; the empty states of 4.5.
2. The canvas menus of 4.3 through `ContextMenu.tsx`; Esc returning focus to the right-clicked element.
3. Text: single click places the caret at the click, the frame edge is the drag surface, double click selects a word, triple click a paragraph; Esc commits and selects the block; Enter breaks in the four multiline pointers, appends an item in a list, commits elsewhere; Shift+Enter the same as Enter; `BR` to `\n` at commit; Tab and Shift+Tab between table cells with the last cell adding a row and its snackbar; `text.replace` with the 400 ms coalescing pause; `spellcheck` on; no bare letters; the arrows inert on grammar slides and nudging on freeform with Shift for 8 px.
4. The notes pane of section 8 bound to `slide.set /notes` with the same coalescing.
5. The clipboard of 2.2 (the `turboslide:v1:` envelope; slides, blocks, text, images) and Paint format's arm and apply gesture (the composition B3's toolbar button calls).
6. The draw tools for Text box, Shape and Line (click places the default box, drag draws) and drop to insert or replace a picture with the one step `asset.add`.

### Acceptance

```
pnpm --dir packages/viewer test   # editor-keys, inline-text extended, clipboard, gestures
pnpm --dir packages/chrome test -- Sidebar Thumb Overlay ContextMenu NotesPane
[server] pnpm exec playwright test apps/studio/e2e/text-editing.spec.ts apps/studio/e2e/filmstrip.spec.ts
[server] pnpm exec playwright test apps/studio/e2e/undo.spec.ts   # one Cmd+Z removes one 400 ms burst
```

## B5 Routes, home and files

Estimate: 30 agent-hours. Starts after merge 1.

### Inputs

SPEC sections 6.1 to 6.5, 6.8, 7.2.1 (the payloads), 13.4; R03 Part a and c; R10 B8 and C3 item 1.

### Owns

`apps/studio/src/routes/{index,decks.index}.tsx`, new `apps/studio/src/routes/{new,decks.trash,print.$deckId}.tsx` and their CSS, `apps/studio/src/routes/__root.tsx` (the robots meta by route), `apps/studio/src/server/{decks,write,bundle,bundle-core,thumbs,root,health,warm}.ts`, `apps/studio/src/components/useMountEffect.ts`, `apps/studio/e2e/{landing,home,deck-transfer}.spec.ts`, `scripts/hosted-smoke.mjs`, `docs/hosting.md` (the new routes), `docs/deck-transfer.md` (copy and import).

### Delivers

1. `/` as a 307 to `/new` with `X-Robots-Tag: noindex`; `/new` rendering the draft editor with the deferred `deck.create` through `createStoredDeck` on the first write and `history.replaceState` to `/edit/<id>`; the `noindex` meta; Slideshow and Share before the first save per 6.1.
2. The home page of 6.2 over `deck.list`, with Recent from `localStorage`, search, sort, the grid and list toggle, the card menu, the Trash link; `/decks/trash` with Restore, Delete forever and Empty trash; the trashed banner on `/edit`.
3. The server side of Open, Import slides, Make a copy, Details and Rename; the auto-title of 6.3 as a second `deck.set` in the first heading's write.
4. `getDeck` for `/deck` and `/embed` without `notes` and without skipped slides; the 404 for a trashed deck on `/deck`.
5. `/print/:deckId` per 6.8.

### Acceptance

```
[server] pnpm exec playwright test apps/studio/e2e/landing.spec.ts apps/studio/e2e/home.spec.ts apps/studio/e2e/deck-transfer.spec.ts
curl -s http://localhost:4321/deck/gt-brand | grep -c '"notes"'   # 0
curl -sI http://localhost:4321/ | grep -i 'x-robots-tag: noindex'
node scripts/hosted-smoke.mjs --base <preview origin>   # /new, /decks/trash, /print/gt-brand, /present/gt-brand answer
```

## B6 Present mode and Presenter view

Estimate: 22 agent-hours. Starts after merge 1; needs B5's route file for `/present` created as an empty shell on day 1 by the integrator so both can work.

### Inputs

SPEC section 9, 7.2.1 (present mode omits skipped slides), 10.1 (the presenting group); R04 Part A; SPEC 6.10 of `docs/spec/SPEC.md`.

### Owns

`apps/studio/src/routes/present.$deckId.tsx` (new), `apps/studio/src/components/{DeckViewer,useStudioSession}.ts*`, new `packages/viewer/src/present/{PresentToolbar,PresenterConsole,SlideList,presentKeys}.ts*` and their CSS, `packages/viewer/src/{Stage,SlideView,Sheet}.tsx` (present mode branches only; B4 owns the editing branches and both coordinate through the integrator on shared lines), `apps/studio/e2e/{present,viewer}.spec.ts`.

### Delivers

1. The Slideshow split button's menu (the button itself is B3's; its handlers are B6's): present from here, Presenter view, Start from beginning, the disabled Present on another screen.
2. The slideshow surface and toolbar of 9.2 with every presenting key, the laser pointer, the black and white slides, the slide list, the counter over unskipped slides, no network after load.
3. `/present/:deckId` per 9.3 with the timer, the previews, the notes with font size buttons, the disabled Audience tools tab, `BroadcastChannel` sync with `localStorage` fallback, `view.goto` driving both windows.
4. The view route's `?present=1` as the audience form; the view route's reading keys unchanged.

### Acceptance

```
[server] pnpm exec playwright test apps/studio/e2e/present.spec.ts apps/studio/e2e/viewer.spec.ts   # viewer still 6 of 6
```

The present spec asserts the keys, the blank slides, skipped slides absent, and two windows in sync.

## Integrator

Estimate: 24 agent-hours across the five days.

### Owns

`apps/studio/src/routes/edit.$deckId.tsx` (the `on(...)` table for every new action, the write queue, the draft hand off from `/new`, the panels and menus mounted), `apps/studio/src/server/{actions,agent-actions,contracts,sessions,auth,tokens}.ts`, `scripts/check.mjs` (steps 20 and 21; step 18's new URLs), `apps/studio/e2e/ten-tasks.spec.ts` (new, from SPEC 11.2), `AGENTS.md`, `README.md`, `docs/README.md`, `docs/spec/SPEC.md` (the amendments of 7.9, recorded as deviations), `docs/gslides-parity/BUILD-STATUS.md` (new), `skills/*/SKILL.md` (the prose that names empty Texts, Esc commits, the fourteen actions), the conflict resolution on any shared line.

### Delivers

1. Merge 1 (B1 and B3's day 1 files) with `pnpm check` steps 1 to 6 green.
2. The `on(...)` handlers for `slide.new`, `slide.duplicate`, `slide.skip`, `slide.applyLayout`, `slide.import`, `block.duplicate`, `text.replaceAll`, `deck.list`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `export.text`, `view.zoom`, plus `block.order` front and back, `render.slide` jpg and `export.run` pdf; every menu `effect` of kind `action` resolves to one of them.
3. Merge 2 with every builder's branch, conflicts resolved in the parity chain order (schema, render and export, chrome, viewer, routes, present).
4. `ten-tasks.spec.ts` driving SPEC 11.2's Here column with counters.
5. `pnpm check` 21 of 21 on the merged tree; contracts current; AGENTS.md's deviations list updated; BUILD-STATUS.md with one heading per builder, what landed, what was cut, and the open requests.

### Acceptance

```
node scripts/check.mjs   # 21 of 21
pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts'
```

## Verifier

Estimate: 16 agent-hours, days 4 and 5.

### Owns

`scripts/gslides-parity-audit.mjs` (new), `docs/gslides-parity/VERIFICATION.md` (new), `docs/gslides-parity/verification/**` (new: `parity-audit.json`, the ten task counts, screenshots of first open and of each task on the preview, the export and PDF reports, the chrome lint and tooltip audit outputs).

### Delivers

1. The parity audit of SPEC 14.4 as a script, run against `vite preview` and against the preview deployment.
2. Every builder's acceptance rerun on the merged tree with the numbers recorded.
3. The ten tasks driven by hand on the preview with screenshots and counts against SPEC 11.2.
4. One Perfect and one Editable text export of the fixture deck opened in LibreOffice, one PDF opened in Preview, the results recorded.
5. VERIFICATION.md in the shape of `docs/EDITOR-DEPTH-STATUS.md`: the 21 steps, the audit totals per menu, the task counts, the blockers, and the list for Kevin (SPEC section 15).

### Acceptance

```
[server] node scripts/gslides-parity-audit.mjs --base http://localhost:4321 --out docs/gslides-parity/verification/parity-audit.json   # exit 0
node scripts/gslides-parity-audit.mjs --base <preview origin> --out docs/gslides-parity/verification/parity-audit-preview.json
```

## Fixer round

Estimate: 18 agent-hours, day 5.

The verifier's VERIFICATION.md lists every miss with the builder who owns the file. Each builder fixes only in their own files on their own branch; the integrator merges in the same order as merge 2; the verifier reruns the audit, the ten tasks spec and `pnpm check`. A miss that needs a design change (a Google fact the audit shows we read wrong, a count in 11.2 that cannot be met) is written into VERIFICATION.md as a deviation with the reason and left for Kevin, not patched around. The fixer round ends when the audit exits 0 and `pnpm check` is 21 of 21, or when the remaining misses are all recorded deviations.

## Ship step

Estimate: 6 agent-hours.

1. `pnpm check` 21 of 21 on `gs/integration` with `main` merged in; `git log` shows one commit per builder plus the integration commits; no conflict markers (`git grep -n '<<<<<<<'` empty).
2. A preview deployment of `gs/integration`; `node scripts/hosted-smoke.mjs --base <preview>` green; the parity audit against the preview exit 0; one Perfect export of the fixture deck from the preview's Download dialog answers `perfect: true`; one PDF downloads with one page per slide.
3. Kevin's manual checks on the preview (SPEC section 15 and VERIFICATION.md's list): first open on `/`, the ten tasks once, the grey items read as intended, the wording of section 12 on screen.
4. Merge to `main`, push, production deploy; the production `/` opens an untitled editor; `hosted-smoke.mjs` against production green.
5. Kevin moves the test decks to trash from the home page and deletes them forever from `/decks/trash` (SPEC decision 15.8).
6. The verifier appends the production table to VERIFICATION.md.

## What ships in this round

- The Google Slides shell: title row, menu bar with the 109 Now rows of SPEC 2.12, the toolbar in Google's order with contextual tails, the filmstrip with Google's right-click menu, the bottom bar, compact mode, the snackbar, the tooltip formula for the 24 stubs, Search the menus, the shortcuts dialog, Google's shortcuts with every conflict resolved in Google's favour.
- The layout system: 21 layouts in `packages/schema/src/layouts.ts` with Google's eleven first, empty placeholders with live prompts, New slide inheriting the layout, Apply layout that keeps content and never refuses, the Themes panel writing `defaults.appearance`, the theme starter pictures in every new deck.
- The root as a fresh presentation with deferred create, the home page, trash with Delete forever, rename and auto-title, Make a copy, Import slides (decks and bundles), the Share dialog with three honest links, Publish to web with the embed snippet, the Download dialog, PDF, TXT, JPEG, the print preview.
- The document: skip, template, appearance, counter, trashedAt, numbered, block and slide links, the paragraph break, the table block; fourteen new actions on every transport; the copy linter skipping cells; `copy/empty-placeholder`; `text.replace` coalescing; Esc commits; single click caret; the clipboard; paint format.
- Speaker notes under the canvas; present mode with Google's toolbar and keys; Presenter view in a second window.
- The acceptance: 21 check steps, the parity audit, the ten tasks spec, the menu model tests, the migration test, the export fixture deck, VERIFICATION.md.

## What is the next round

In the order R07 and R10 C3 rank them, each designed in SPEC 7.7 so it lands additive at version 1:

1. A display name step stored in the browser, sent as the author of every write (R10 C3 item 2); the Last edit label reads by name.
2. The revocable per deck view token with Stop sharing, and a private flag hiding a deck from `/decks` (SPEC 0.25).
3. Comments as document data with a panel (title row icon, View > Comments, Insert > Comment, the filmstrip's Comment row become Now).
4. The sales starter deck on the home page and Insert > Templates.
5. Charts as the `chart` block with the data grid in Format options; the Editable text export as a picture.
6. Autofit as explicit editor writes; Text fitting in Format options.
7. Guides as `Deck.guides` with View > Guides.
8. PPTX import on the Upload tab.
9. Bullet glyphs and levels, italic and underline, rotation and flip, shape presets, border dash, slide background, handouts in the print preview, merge cells, free crop and Reset image, each when Kevin approves the grammar or product decision it reopens (SPEC section 15).
10. The Blob store fixes the editor depth round named (immutable per revision snapshots; `deck.create` over `/api/actions` through `createStoredDeck`) and the worker service for exports over 300 s.
