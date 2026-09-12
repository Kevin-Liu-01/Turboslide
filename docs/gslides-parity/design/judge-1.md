# Judge 1: Google Slides fidelity and sales usability

Written 2026-09-11 against the three proposals in `docs/gslides-parity/design/` and the eleven research reports in `docs/gslides-parity/research/`. Judge 1 of 3 scores as a Google Slides power user and a UX researcher. The two questions this judge asks of every proposal are whether it reproduces Google Slides' structure, positions, labels, shortcuts and behaviours, and whether a salesperson who knows Google Slides would find every control where they expect it. Architecture fit, buildability in one round and aesthetic fit with Prototemplate are scored from the proposals' own text against the code at `8c7056c`.

## Method

- All three proposals were read in full: `proposal-1-faithful.md` (663 lines), `proposal-2-sales.md` (873 lines), `proposal-3-architecture.md` (670 lines).
- Where the proposals disagree on a Google fact, the research report was opened at the point of disagreement: R02 sections 4.1, 5, 7 and 9; R03 sections a.1, a.3, b.2 and b.3; R04 section A1; R05 section B7; R07 top tasks, design rules and frustrations; R08 section A1; R09 findings 2 and 3 and unverified item 1; R10 sections A15, B7 and C3.
- Code facts checked at `8c7056c`: `packages/schema/src/actions.ts` holds 54 action ids (every proposal says 54; the round brief's 62 counts non action ids); `packages/chrome/src/slide-templates.ts` holds 15 templates and the `PLACEHOLDER` strings; `apps/studio/src/routes/index.tsx` redirects `/` to the newest deck; `packages/schema/src/migrations.ts` is at version 1 with one stamping migration; no file under `decks/` carries a `box` block, and six code sites outside the schema reference `type: 'box'`; `docs/spec/SPEC.md` line 310 states the four text rules and line 316 the no line break rule; `docs/freeform.md` line 7 records that rotation stays out.
- No Google page was opened and no account was signed in. Every Google fact below comes from the reports, which read the public pages on 2026-09-11; the URLs are repeated in the Sources section with that date. Two facts come from this judge's product knowledge and are marked as such where used.
- Rules of the text: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings, full sentences in body text.

## Scores

Each criterion is 1 to 10. Total is the sum of the five.

| Proposal | Fidelity to Google Slides | Ease for sales users | Architecture fit | Buildability in one round | Aesthetic fit with Prototemplate | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Proposal 1, the faithful clone | 9 | 8 | 8 | 6 | 8 | 39 |
| Proposal 2, sales first | 7 | 9 | 7 | 8 | 7 | 38 |
| Proposal 3, document and export first | 7 | 7 | 9 | 4 | 6 | 33 |

## Where the proposals disagree, and what the research says

This table is the core of the fidelity score. Each row is a point where at least one proposal departs from the others, the report that settles it, and which proposals follow the report.

| Point | What the research says | Proposal 1 | Proposal 2 | Proposal 3 |
| --- | --- | --- | --- | --- |
| Print on the toolbar head | R02 section 4.1 row 5: Print sits between Redo and Paint format, attested by the West Oahu handout and the CustomGuide card | Present | Present | Dropped from the toolbar; a rep who knows Google looks at position 5 and finds Paint format |
| Contents of the bottom edge | R02 section 9: the bottom left holds the filmstrip and grid toggle, the bottom right the side panel chevron; "There is no status text, no zoom slider and no page counter in the editor's bottom edge" | Toggle and chevron only | Adds "Slide 3 of 12" and the zoom value | Adds "Slide n of m" |
| Layout names and order | R03 finding 2: Google ships eleven layouts per theme, named in the same order in the New slide arrow, the Layout button, Slide > Apply layout and the filmstrip; names from the PredefinedLayout reference | The eleven Google names in Google's order, then ten GT layouts after a rule | 17 entries in its own order with mixed names (Title and table, Title and list, Title and image, Two figures, Image grid, Number grid); Title only is dropped | GT names where Google has a name (Section opener for Section header, Head over body for Title and body, Two columns for Title and two columns, Ruled statement list for One column text, Statement for Main point, Mood for Caption); Section title and description is dropped; the order is its own |
| What Apply layout does with content that has no placeholder | R03 b.3 line 120: placeholder content is repositioned into the new layout's placeholders and freestanding content is left where it is; Google never drops and never refuses | Preserves: appends to the body slot or the plate, parks on Title slide and Main point with a visible notice and Undo | Drops with a toast that names the count and offers Undo | Refuses the layout change with a toast telling the rep to move or delete blocks first |
| Transition on the toolbar and in the Slide menu | R02 section 4.1 row 17: Transition is the last text button of the tail; R07 frustrations table: "Do not invest here; sales decks do not need animation" | Present and disabled, so the position holds and nothing is built | Omitted from the toolbar, the Slide menu, the filmstrip menu and View > Motion | Built: fade and push transitions, present mode animation, an OOXML post-process |
| Toolbar below about 1100 px | R02 section 4: the tail collapses into a More button | More button | Wraps to a second 40 px row | More button below 1180 px |
| Themes panel on a new presentation | R03 a.3 line 67: historically the Themes panel opens on a new presentation; the current default for a consumer account is unverified; R03 finding 1 asks for the panel to be available on the right | Opens | Opens | Closed |
| Title taken from the title slide | R03 a.3 line 63, from Google's own pages S4 and S9: "If the title slide already has text, Slides offers that text as the file name" | Not mentioned | An Untitled presentation takes the first committed title slide heading as its name, once | Not mentioned |
| Snap to grid default | R02 section 6 and R05 C7: guides on, grid off | Off | On | Off |
| Shift+Enter inside text | R09 unverified item 1: expected to insert a line break; no Google page states it | A break, like Enter | Commits the edit | A break, like Enter |
| The Bulleted list button | Google's button makes bullets; the GT grammar forbids them (SPEC 2.1) | Disabled stub until Kevin decides | Makes a ruled list, with a tooltip explaining the difference | Ships a `marker` field with bullet and number and a `level` for Tab |
| Rotation | Google has the rotation handle, Arrange > Rotate and Size & rotation in Format options (R05 B7, C5); R07 says reps rarely draw | Ships on freeform blocks, reopening the freeform.md decision | Omitted; Rotate shown disabled in Format options | Ships on freeform blocks with measurer changes |
| PDF download | R07 top tasks row "Export PPTX or PDF" and rule 17: File > Download > PDF Document (.pdf) in Google's words; R07 names the PDF as the handoff after a call | Later; File > Print opens a print route and the browser's own Save as PDF stands in | Now, through Chromium `page.pdf()` on the render worker, with a named fallback | Now, the same path, verified with `pdftoppm` |
| Notes in the PPTX download by default | Google's PPTX carries notes; Make a copy has a "Remove speaker notes" checkbox for the customer copy (R07 top tasks, R10 A15) | Included | Stripped by default, named as a departure, with a visible checkbox | Included |
| Last edit clock in the title row | R07 top tasks row "Never lose work": the "Last edit" button at the top opens version history | Only the cloud icon opens version history | Clock icon present | Clock icon present |
| Filmstrip right-click order | R08 A1: Cut, Copy, Paste, New slide, Duplicate slide, Delete, Skip slide, Change background, Apply layout, Change theme, Transition, Move slide items, Comment | Follows, with Transition disabled | Follows, with Transition omitted and a Turboslide item "Speaker notes" appended | Follows, with Transition live |
| Agent surfaces under Tools | R07 naming: plain sentence case words that describe the user's goal; nothing that needs explanation in the default view | A submenu named "Agent" | "Check slides" as one item and an "Advanced" submenu for the rest | Six items flat under Tools: Check deck, Show issues on the slide, Both appearances side by side, Slide source, Render this slide, Show advanced actions |
| Slideshow split button menu | R04 A1: Presenter view, Start from beginning, Present on another screen, Presentation display options | Matches; display options omitted | Matches; display options omitted | Matches; display options disabled |
| New slide after a Title slide | Not in the reports. This judge's product knowledge: Google inserts Title and body after a Title slide rather than a second Title slide. Unverified by a public page | Adopted and marked unverified | Not mentioned; a fresh presentation gets a second Title slide on Ctrl+M (section 10.1 says so) | Not mentioned |

Reading the table: proposal 1 follows the report in every row where a Google fact exists, and departs only where it names a bend (theme starter pictures, Apply layout resets positions, the shared store). Proposal 2 departs in eight rows, each with a stated reason. Proposal 3 departs in seven rows, and three of them (Print, the layout names, the refusal on Apply layout) are the kind a rep notices in the first hour.

## Proposal 1, the faithful clone

Fidelity 9. This is the proposal that reads like Google Slides. The screen anatomy has the right rows in the right order with the right contents, including the bottom edge with nothing but the view toggle and the side panel chevron. The toolbar is Google's twenty positions with Print and Paint format in place and the tail items present as stubs where the round cannot build them. The layout list uses Google's eleven names in Google's order, which is the single thing the directive's "template with repeated kind of slide templates" most depends on: a rep who types Ctrl+M and opens the arrow sees Title slide, Section header, Title and body, Title and two columns, Title only, One column text, Main point, Section title and description, Caption, Big number, Blank. Apply layout preserves content the way Google does. The shortcuts are Google's table verbatim with every conflict resolved in Google's favour, and the menu model is data with a completeness test, which is what keeps the fidelity from drifting in the build. The point lost: no Last edit clock beside the cloud, the word "Agent" in the Tools menu, the Extensions items relabelled with Google's own item names (Apps Script, AppSheet) for unrelated things, and the missing auto-title from the title slide that R03 documents from Google's pages.

Ease for sales 8. The ten task traces are concrete and the counts are credible (the pricing table at 2 clicks and 20 keys against 40 and 40 today). Single click places the caret, Escape commits, the bare letters retire, drop to replace keeps the frame, the Sales deck starter gives a rep a seven slide skeleton in the GT layouts. Two things hold the score at 8. The PDF is deferred, and R07 names the PDF as the handoff after a call; a rep who opens File > Download and finds PDF Document greyed will use the browser print route, which is not where Google puts it. The Tools > Agent label is an engineering noun in the default view, and the proposal's own default view words test does not grep for it.

Architecture fit 8. Nine new actions through the actions table with CLI and MCP generated, every new field optional so no migration is needed, the layouts moved into `packages/schema/src/layouts/` so the editor, the CLI and MCP read one table, the menu model as data. `ext.parked` for content hidden by a layout is the one uncomfortable construct: content a rep cannot see on the canvas, made tolerable only by the notice above the canvas and by Undo. Italic, bullets and rotation each contradict a written rule and the proposal says so and routes them to Kevin.

Buildability 6. The scope is large: tables and charts, thirteen shape presets, dash, rotation and flip, groups, guides, italic with a font build, word art, paint format, Publish to the web, Share with a per deck view token, trash with a purge, copy, import, presenter view, print route, PNG, JPEG and TXT downloads, plus the whole chrome. The proposal names a cut line (B6 and the rotation, group and chart rows leave, their menu items stay as stubs), which is the right shape for a cut, and the builder table assigns files and acceptance checks per builder. Six is the honest score for a round that would ship every menu item Google has.

Aesthetic fit 8. The line law is walked region by region, the tokens are named (`--pt-title-h`, `--pt-menu-h`, `--pt-tool-h`, `--pt-notes-h`, `--pt-status-h`), the red alignment guides are deliberately kept ink because the chrome has no red, the 460 to 320 px panel reflow is named as a risk with a verifier check at 320 px in both themes. The three stacked rules within 112 px at the top are checked against the chrome lint's doubling rule.

## Proposal 2, sales first

Fidelity 7. The skeleton is Google's and the menu mapping is complete, with a count (98 now, 20 later, 48 omitted) and a rule that keeps grey items few. The filmstrip menu order, the presenting keys, the Slideshow menu and the shortcut table are Google's. The departures are deliberate and each is argued, but there are eight of them and several are visible in the first hour: Transition is gone from the toolbar tail and the Slide menu, the bottom bar carries a slide counter and a zoom value that Google's editor never shows, the toolbar wraps to two rows where Google collapses to More, the Bulleted list button makes ruled rows, Shift+Enter commits instead of breaking a line, Rotate is absent from Arrange, and the layout list uses its own names and drops Title only. The one fidelity gain unique to this proposal is the auto-title from the title slide, which R03 documents from Google's own help pages.

Ease for sales 9. This proposal understands the rep best. It starts from ten weekly tasks and traces each against Google, against today and against the design with counts in one table. It ships the PDF now, gives the Download dialog one plain sentence per mode and visible checkboxes for notes and skipped slides, names every string a rep will read in Appendix B, names every empty state and every error sentence with the next step inside it, and hides every agent surface under Tools > Check slides and Tools > Advanced with an appendix that says how a developer or an agent reaches each one. "Not saved yet" on the draft root, the toast that holds 5 s with one Undo action, and the tooltip formula for stubs ("Not available in Turboslide yet" plus one clause) are the kind of detail the build will otherwise improvise. The point lost is the Bulleted list button: a control whose label says bullets and whose result is ruled rows breaks the one promise parity makes.

Architecture fit 7. Seven new actions, optional fields, `ext.layout` for layout identity, the paragraph break scoped to four block types and cells, the table as a native PPTX table, `defaults.theme` and `defaults.counter` on the manifest. Two gaps: the layout list stays in `packages/chrome/src/slide-templates.ts` while the acceptance names a CLI command `turboslide slide apply-layout`, which needs the list in a framework free package; and Rotate is omitted with the reason that `pos` has no angle, which is a reason to add the field, not a reason to omit the menu item.

Buildability 8. The most bounded scope of the three: tables now, charts later, rotation and groups out, the shape set as today, italic later, PDF now with a named fallback, twenty stubs. The builder order (B1 first, then two pairs in parallel, B6 last) and the two merges are practical. The risk list names the deferred create and the PDF path as the two unmeasured pieces.

Aesthetic fit 7. The tokens and the line law are kept. The status bar adds a chrome row Google lacks, the two row toolbar under 1100 px adds 40 px of chrome over the canvas, the laser pointer uses `--red`, and the Themes panel shows two cards with the variant stored per deck. Nothing here breaks Prototemplate, but two of the additions are chrome the language does not need.

## Proposal 3, document and export first

Fidelity 7. Where this proposal reaches into the object model it is more Google than the others: rotation, flip, groups, twenty four shape presets, bullets and numbering with levels, Cmd+] and Cmd+[ for indent, transitions, charts, alt text and links on every block. Where it reaches the chrome it departs in ways a rep notices. Print leaves the toolbar head, so position 5 is wrong. The layout list uses GT vocabulary (Section opener, Head over body, Statement, Mood) where Google has names the rep already knows, and the order is neither Google's nor alphabetical. Apply layout refuses when content would be lost, which Google never does. The Themes panel stays closed on a new presentation, the bottom bar carries a slide counter, and New > From Template Gallery is renamed. The shortcut table is Google's verbatim and the conflict list is the clearest of the three.

Ease for sales 7. The ten tasks are traced with the action behind each, Escape commits, the caret lands on click, the PDF ships, Find and replace ships. Against that, the round spends its effort on transitions, callouts, math shapes, groups and rotation, which R07 says reps do not use, and the Tools menu shows six agent facing items flat at the top level, three of them with words (source, render, appearances) the proposal's own tooltip audit would flag if it looked at menu labels. The refusal on Apply layout puts a chore in front of the most common layout change (a content slide to a Section header). The layout names force a rep to learn a second vocabulary for the one list they open most.

Architecture fit 9. This is the proposal's strength and it is real. Every Google object is placed in the schema first with a validator rule, a renderer rule, a lint rule, and both export paths named with the pptxgenjs option that carries it. The layouts move into the schema package so the CLI, MCP and the editor read one table; a `shapes.ts` table gives the renderer its SVG path and the exporter its `prstGeom` from one row; `text.replace` is implemented so undo removes a typing burst; a coverage test requires a test per action; a migration test asserts the GT deck changes only by the version stamp. The one architectural move this judge would not take is the fold of `box` into `shape`: no stored deck carries a box block, so the data risk is low, but it removes a primitive type that agents, the catalog, `NATIVE_BLOCK_TYPES` and the exporter's scene roles all know, for no gain a rep can see.

Buildability 4. The proposal's own risk 10 says this is "the largest round the repo has had", and the list bears it out: a schema version bump that rewrites every stored file on its next save, a migration with two content rewrites, twenty four shapes, rotation with a measurer that toggles transforms inside `page.evaluate`, groups with recursive `locateBlock`, tables, four chart kinds, transitions with present mode animation and an OOXML post-process, PDF with a `pdftoppm` verify loop, bullets with three levels, autofit as explicit writes, guides, backgrounds, links, a clipboard envelope, presenter view, trash, copy, import, the home page, and every piece of chrome the other two proposals also build. The cut line keeps B1, B2 and B4 (document, export, text), which means that if the round slips the salesperson sees no new chrome at all. Four is the score for a round whose fallback ships nothing the audience can see.

Aesthetic fit 6. The tokens are used and the 320 px panel is right. Callouts and math shapes sit oddly in a monochrome hairline language built on ruled rows; transitions animate a present mode that Prototemplate keeps still; a 12.5 px section label is off the type ladder; the 48 px title row is a new size where the other proposals reuse the 44 px rhythm.

## Winner

Proposal 1 wins, 39 to 38 to 33. The margin over proposal 2 is one point and the reason is the criterion this judge weighs first: the directive asks for Google Slides' structure, labels and positions to be mimicked, and proposal 1 is the only one of the three that a Google Slides user could sit in front of and find every control at the position and under the label they expect, with the layout list in Google's words and order. Proposal 2 knows the rep better and its wording, defaults and dialogs are the best in the set, but its eight departures are exactly the kind that make a rep pause (where is Transition, why does the bullet button make rules, why is there a slide counter at the bottom). Those strengths of proposal 2 are graftable onto proposal 1's skeleton without changing a single position; proposal 2's departures are not graftable onto anything without losing fidelity. Proposal 3's object model is the right long term shape and several pieces of it must survive, but its chrome is the least faithful and its round is not buildable in one pass.

## Grafts the synthesis must keep

From proposal 2:

1. PDF Document (.pdf) ships now through Chromium `page.pdf()` on the render worker with one slide per page, with proposal 2's fallback if it fails the gate (the print preview's own Print and the browser's Save as PDF). R07 names the PDF as the handoff after a call; a greyed PDF item is the wrong first impression.
2. The Download dialog: a Perfect | Editable text control with one plain sentence under each, "Include speaker notes" and "Include skipped slides" as visible checkboxes, a progress sentence with a time estimate, and the export report behind a Details link. The PPTX notes default is a decision for Kevin (see below); the checkbox must be visible either way.
3. The auto-title: a presentation still named Untitled presentation takes the first committed title slide heading as its name, once. This is Google's behaviour from Google's own pages (R03 a.3, S4 and S9).
4. The Tools menu naming: "Check slides" as the lint panel in plain words and an "Advanced" submenu for source, twin, ids, change history, render and Run an action. The word "Agent" does not appear in the default view, and the default view words test greps for it.
5. Appendix B, the wording table, as the shared vocabulary for every builder, and the stub tooltip formula "Not available in Turboslide yet" followed by one clause saying what would make it available.
6. Section 2.12's discipline: the count of now, later and omitted rows is stated, and no menu other than Format carries more than four grey rows.
7. Section 10.3's empty states and error sentences, each with the next step inside the sentence, and the 5 s toast with one Undo action replacing today's 1.4 s plate.
8. The "Not saved yet" state on the draft root and "Couldn't save, retrying" on a refused write.
9. The ten task table with Google, Today and Here columns as the fixture for the e2e spec; proposal 1's traces fill the Here column.
10. The Last edit clock icon in the title row beside the cloud, opening Version history (proposal 3 has it too).
11. The `copy/empty-placeholder` lint rule at severity 1 so Check slides knows which prompts are still empty (proposal 3 has it at severity 2; take 1, a fresh deck is not a finding).
12. The Share dialog's one honest sentence about accounts and the three labelled links (view, present, edit), used as the dialog copy on top of proposal 1's structure.

From proposal 3:

13. The layout list lives in the schema package as framework free `make` functions with a `slide.new` action that takes a layout id, so `turboslide slide new --layout <id>`, the MCP tool, the editor grid and `template.json` read one table. Proposal 1 already moves the data; proposal 3's action shape is the one to keep.
14. A `shapes.ts` table with, per shape kind, the SVG path generator on the half pixel grid and the ECMA `prstGeom` name, so the renderer and the Editable text writer read one row. Apply it to proposal 1's thirteen presets.
15. Implement the declared `text.replace` mutation in `InlineText` with a 400 ms coalescing pause so one Cmd+Z removes one typing burst (SPEC 6.7).
16. The coverage test that requires a test per new action and the `pnpm generate:contracts` empty diff as a named acceptance step.
17. The per kind Apply layout rules of section 5.3 (content to title, title to content, to and from picture kinds) as the conversion table, with proposal 1's preserve policy in place of the refusal.
18. `<meta name="robots" content="noindex">` on the root editor, since the root now renders an editor rather than a redirect.
19. The one time snackbar on the first press of a retired bare letter ("S now hides the filmstrip from the View menu"), for the transition period of the people and agents who use today's keys.
20. The migration test that asserts the committed GT deck and template change only by the version stamp, if any migration ships (see the placeholder rewrite below).

## Ideas that must not ship

1. Proposal 3's fold of the `box` block into `shape` at schema version 2. It removes a primitive type that agents, the catalog, the Insert menu, `NATIVE_BLOCK_TYPES` and the exporter's scene roles know, for no change a rep can see. A shape that carries text is an additive field on `shape`; the box stays.
2. Proposal 3's slide transitions (present mode animation and the OOXML post-process). R07's frustrations table says not to invest here, and the Perfect export's claim rests on stills. Transition stays as a disabled stub in Google's toolbar and menu positions (proposal 1).
3. Proposal 3's twenty four shape set with callouts and math shapes, and Insert > Shape > Equation. Ship proposal 1's thirteen presets at most; callouts and equations are later stubs.
4. Proposal 3's refusal on Apply layout. Google never refuses a layout; proposal 1's preserve and notice policy replaces it.
5. GT vocabulary for layouts where Google has a name (proposal 3's Section opener, Head over body, Two columns, Ruled statement list, Statement, Mood; proposal 2's Title and table, Title and list, Title and image, Two figures, Image grid, Number grid). The first eleven entries are Google's eleven names in Google's order; the GT layouts Google lacks follow after a rule under their GT names.
6. Dropping Print from the toolbar head (proposal 3). R02 section 4.1 row 5 attests it at position 5.
7. A slide counter or a zoom value in the bottom bar (proposals 2 and 3). R02 section 9: Google's bottom edge carries the view toggle and the side panel chevron and nothing else. The zoom value shows in the toolbar's Zoom box where Google shows it.
8. Omitting Transition from the toolbar, the Slide menu and the filmstrip menu (proposal 2). The positions hold as disabled stubs.
9. Wrapping the toolbar to a second row under 1100 px (proposal 2). Google collapses the tail into a More button; the wrap costs 40 px of canvas on a laptop.
10. The Bulleted list button producing a ruled list (proposal 2). A control must do what its label says. Either the `marker` field ships with bullet and number glyphs (proposal 3, pending Kevin's grammar decision) or the button is a disabled stub with the tooltip naming ruled rows as the GT list.
11. Shift+Enter committing the edit (proposal 2). Google's expected behaviour is a line break; make it the same break as Enter until a soft break token exists.
12. Snap to grid on by default (proposal 2). Google ships guides on and grid off; the toggle exists for the rep who wants it.
13. Proposal 1's view route refusing a request without a per deck token in this round. It breaks every existing `/deck/:id` link and the Prototemplate embed in a round already at capacity. Ship the Share dialog with honest labels now; the revocable token and Stop sharing are a named later item (R10 C3 item 6 remains the target).
14. Proposal 1's Extensions labels that reuse Google's item names for unrelated things (Apps Script as the CLI connect card, AppSheet as the MCP dialog). One item, "Agent access", with the CLI, MCP and API facts in one dialog (proposal 2), keeps the Extensions menu honest.
15. Proposal 3's six agent facing items flat under Tools. They go under Advanced (graft 4).

## Decisions for Kevin

These are the points where two proposals disagree and the research cannot settle it because the answer is a grammar or product decision.

1. Italic as a fifth markup rule with an Inter italic instance in the export set (proposal 1 ships pending approval; proposals 2 and 3 defer). SPEC 4.2 says four rules. Google's Cmd+I is one of the three keys R07 lists under "Edit text".
2. Bullets and numbering as a `marker` on plain lists (proposal 3 ships; proposal 1 defers; proposal 2 substitutes ruled rows). SPEC 2.1 says ruled rows instead of bullets. A rep pasting an agenda from mail expects bullets.
3. Rotation and flip on freeform blocks (proposals 1 and 3 ship; proposal 2 omits). `docs/freeform.md` says rotation stays out. Google has the handle; reps rarely use it.
4. The PPTX download's notes default. Google includes notes; proposal 2 strips them by default so a talk track never reaches a prospect by accident. The view link and the PDF strip notes in every proposal. This judge's recommendation is Google's default for the PPTX, because the PPTX is the editing handoff and the checkbox is visible; the safer default is defensible if Kevin prefers it.
5. Whether the Themes panel opens on a fresh presentation (proposals 1 and 2) or stays closed (proposal 3). R03 records the historic behaviour as open and the current consumer default as unverified. Open matches the memory of every rep who has used Slides for years.
6. Whether the placeholder string rewrite (the fifteen `PLACEHOLDER` strings to empty texts, proposal 3 section 7.1 step 3) ships as a schema version 2 migration with only the stamp and that rewrite, so decks made from today's templates show prompts instead of placeholder copy. It is the one part of proposal 3's migration worth taking; the box fold is not.

## Sources

Research reports in this repository, all written 2026-09-11 from public pages read the same day, opened for this judgment at the sections named in the Method section: `docs/gslides-parity/research/01-menu-bar.md` (R01), `02-editor-surface.md` (R02), `03-home-themes-layouts-io.md` (R03), `04-present-and-shortcuts.md` (R04), `05-objects-and-format-options.md` (R05), `06-turboslide-inventory.md` (R06), `07-sales-users.md` (R07), `08-context-menus-and-menu-conventions.md` (R08), `09-canvas-text-editing-model.md` (R09), `10-identity-sharing-and-presence.md` (R10), `11-tables-charts-and-numbers.md` (R11).

The three proposals: `docs/gslides-parity/design/proposal-1-faithful.md`, `proposal-2-sales.md`, `proposal-3-architecture.md`, read in full on 2026-09-11.

Google pages that settle the rows of the disagreement table, as the reports record them (read by the reports on 2026-09-11; not reopened for this judgment):

- Keyboard shortcuts for Google Slides. https://support.google.com/docs/answer/1696717 (R04 Part B; every shortcut row)
- Add, delete & organize slides. https://support.google.com/docs/answer/1694830 (R02 section 5 and 9; the view toggle, Skip slide, New slide, slide numbers)
- Use a template or change the theme, background, or layout in Google Slides. https://support.google.com/docs/answer/1705254 (R03 b; theme, layout, Apply layout, Change theme, Import theme)
- Create, view, or download a file. https://support.google.com/docs/answer/49114 (R03 a.3 S9; the title offered from the title slide, Rename, Download)
- Apps Script reference, Enum PredefinedLayout. https://developers.google.com/apps-script/reference/slides/predefined-layout (R03 b.2; the eleven layout names)
- Present slides. https://support.google.com/docs/answer/1696787 (R04 A1 to A3; the Slideshow split button and the present toolbar)
- Use Google Slides with a screen reader. https://support.google.com/docs/answer/1634140 (R09 findings 2 and 3; Escape returns focus and keeps the text)
- Tool finder for Docs, Sheets, Slides & Vids. https://support.google.com/docs/answer/13466905 (R02 section 4.1 row 1; Search the menus at the far left of the toolbar)
- Zoom or change your document view. https://support.google.com/docs/answer/99753 (R02 section 4.1 row 7 and section 3; Fit, Full screen)
- Insert and arrange text, shapes, diagrams, and lines. https://support.google.com/docs/answer/1696521 (R05 Parts A and C; Arrange items, snapping)
- CustomGuide, Google Slides Quick Reference Guide (PDF, 2024). https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf (R02 sections 4.1, 5, 9 and 11; the screen diagram, Print, the side panel chevron)
- Alice Keeler, Google Slides: Right Click on the Filmstrip, 2017-11-08. https://alicekeeler.com/2017/11/08/google-slides-right-click-filmstrip/ (R08 A1; the filmstrip menu order)
- Computerworld, Google Slides cheat sheet (updated 2025-09-04). https://www.computerworld.com/article/1658651/how-to-use-google-slides.html (R02 and R07; the menu order and toolbar groups)
- BrightCarbon, Google Slides: The ULTIMATE guide (2023-06-22). https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ (R02 section 4.1; the toolbar head order and Transition)

Repository files read at `8c7056c` on 2026-09-11 for the code checks: `packages/schema/src/actions.ts`, `packages/schema/src/blocks.ts` (lines 130, 413, 422, 1138), `packages/schema/src/catalog.ts` (lines 441 to 451), `packages/schema/src/migrations.ts`, `packages/chrome/src/slide-templates.ts` (head and labels), `apps/studio/src/routes/index.tsx`, `docs/spec/SPEC.md` (lines 310 and 316), `docs/freeform.md` (line 7), the file lists of `packages/chrome/src`, `packages/store/src` and `apps/studio/src/routes`, and a search of `decks/` for `"type": "box"` (no matches) and of `packages/render/src`, `packages/export/src`, `packages/chrome/src` and `packages/viewer/src` for `type: 'box'` (six matches).

Facts stated from this judge's product knowledge and not verified by a public page: Google inserts a Title and body slide after a Title slide on New slide; the Hide the menus chevron collapses the title and menu rows while View > Full screen also hides the toolbar.
