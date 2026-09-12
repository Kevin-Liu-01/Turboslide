# Judge 3: the founder's reading

Judgment on the three design proposals for the Google Slides parity round of Turboslide, written 2026-09-11 against `main` at `8c7056c`. This is judge 3 of 3. The lens is Kevin's: a founder who writes plain technical English, wants the Prototemplate aesthetic kept, and needs a sales org to use this editor this quarter. The four questions asked of every proposal are whether it removes confusion, whether it avoids vanity features, whether it keeps the look, and whether it names what ships now and what ships later honestly.

## What was read

- The three proposals in full: `docs/gslides-parity/design/proposal-1-faithful.md` (663 lines), `proposal-2-sales.md` (873 lines), `proposal-3-architecture.md` (670 lines).
- The research reports where a proposal leaned on them: R02 sections 4.1, 11 and 13; R03 a.3, b.2, b.3, b.4 and the unverified list; R04 A1 and A3; R06 summary, 4.1, 5, 7 and 8; R07 top tasks, frustrations and rules 20 to 30; R08 A1; R09 findings, A4, A5, C2 and the unverified list; R10 A15, B6, B7, B8, B9 and C3; R11 A10, B4, C1 and C2.
- Repository files, to check the facts the proposals build on: `packages/schema/src/actions.ts`, `deck.ts`, `migrations.ts`, `export.ts`, `blocks.ts`; `packages/store/src/templates.ts`; `apps/studio/src/routes/index.tsx` and the routes listing; `packages/chrome/src/slide-templates.ts`; `docs/spec/SPEC.md` (sections 2.1, 2.2, 4.2, 6.7, 6.9, 6.10, 8.2, 8.6); `docs/EDITOR-DEPTH-STATUS.md` (sections 2 and 10); `docs/freeform.md`.

No Google page was opened for this judgment and no account was signed in. Every Google fact below is taken from the reports, which read the pages on 2026-09-11; the URLs are repeated in the Sources section with that date.

## Scores

Each criterion is scored 1 to 10; the total is the sum of the five.

| Proposal | Fidelity to Google Slides | Ease for sales users | Architecture fit | Buildability in one round | Aesthetic fit with Prototemplate | Total |
| --- | --- | --- | --- | --- | --- | --- |
| 1, the faithful clone | 9 | 7 | 7 | 5 | 9 | 37 |
| 2, sales first | 8 | 10 | 8 | 8 | 8 | 42 |
| 3, architecture first | 7 | 6 | 9 | 4 | 7 | 33 |

The winner is proposal 2. The reasoning per proposal follows, then the grafts the synthesis must take from proposals 1 and 3, then the ideas that must not ship.

## Proposal 1, the faithful clone

What it gets right. It is the most complete mimicry of the three. The eleven Google layout names come first in Google's order, the toolbar keeps Google's head including Print at position 5, the access keys and the shortcut table are Google's, the filmstrip menu follows R08 A1, the present toolbar and the presenter console follow R04 A3 and A4, and the home page gains a template gallery page. The menu model as data (`packages/chrome/src/menus/model.ts`) from which the tool finder, the shortcuts dialog and a completeness test are generated is the best single engineering idea in the three documents, because it turns "every Google item has a home" into a test instead of a promise. The `default-view-words.test.ts` that greps the default view for lint, source, lease, revision, grammar, freeform, kind and toolchain is the test that enforces Kevin's "clean up our interface" sentence. The theme starter pictures that make Section header, Caption and Closing work in a blank deck close a real gap (R06 4.1 records that picture templates are missing from the menu when a deck has no asset). The line law reasoning in section 1, the ink alignment lines instead of Google's red, and the token renames are the most careful Prototemplate work of the three, which earns the 9 on aesthetic.

Where it hurts the sales user. Twenty one layout tiles is too many for a rep who wants the five slides they change every week. Several of the Google-named entries are near duplicates in the GT grammar: Title only is Title and body with the list deleted, One column text is a stack of a heading and a paragraph, Section title and description is Two columns with a lead. Proposal 2's decision not to offer Title only, with the reason stated, is the better call. The toolbar carries two permanently grey buttons (Comment and Transition). Insert > Building blocks lists "Specimens (advanced)", which is exactly the engineering vocabulary the round is meant to remove. The download options live in a toast disclosure, but a Perfect export runs 190 to 222 s (`docs/EDITOR-DEPTH-STATUS.md` section 10), and a rep needs a dialog with a progress sentence and the notes and skipped slides checkboxes before the wait starts. Unmatched blocks parked in `ext.parked` on Title slide and Main point are invisible state that a rep cannot see and an agent will not expect.

Where it does not avoid vanity. The ship now list includes italic as a fifth markup rule, rotation and flip, groups as a `pos.group` tag, thirteen shape presets, dash styles, guides, word art, block links, charts (bar and column), a table block, paint format, Publish to the web pinned to named versions with token rotation, a 30 day trash purge, the presenter console, the print route and the clipboard. Italic and rotation each contradict a written rule (SPEC 4.2 "Four rules, nothing else"; `docs/freeform.md` and `docs/EDITOR-DEPTH-STATUS.md` section 2, "Rotation stays out"), which the proposal admits in risk 1 and then ships anyway pending approval. The cut line in section 11 (B1, B3, B4, B5 are the round) is honest and would produce a good product, but it is the fallback, not the plan, and the plan is what builders read.

Honesty. Every row carries a status and every unverified Google fact is marked at the point of use, which is the standard the other two also meet. The dishonesty is only in scale: the default plan cannot land in one round, so buildability scores 5.

## Proposal 2, sales first

What it gets right. It starts from R07's tasks (open the right deck, copy and rename, retype a name and numbers, swap a logo, add and reorder, skip, update the pricing table and the big number, write a talk track, present over a call, send a PDF or a link) and gives each its shortest path with Google's structure as the skeleton. It then does three things the other two do not do as well. First, it counts: 98 rows ship now, 20 are stubs, 48 are omitted with a reason, and it states the rule that a menu of grey items reads as broken, so the stubs are kept few and clustered where a seller can name them. Second, appendix A says where every hidden surface went and who reaches it, and appendix B lists every string the default view shows, so six builders write one vocabulary and the verifier has a list to check. Third, it names its departures from Google and gives each a reason and a way back: skipped slides and speaker notes leave every shared and downloaded output by default with two checkboxes to include them (R07 rules 24 and 25; R10 A15 records that Google leaks skipped slides to shared viewers), transitions are omitted everywhere rather than stubbed in four places, rotation is omitted because the recorded decision says so, and Snap to Grid is on because the 8 px grid is how a freeform slide stays on the theme's rhythm.

The scope discipline is what makes it buildable. The one large new block is the table, which is the block the pricing slide needs (R11 C2 traces today's pricing update at 51 clicks and 46 keys against Google's keyboard path of 9 clicks and 23 to 28 keys); charts, groups, guides, autofit and italic are deferred with tooltips, and each risk in section 12 carries a fallback (create on visit if the deferred create slips, hairlines plus text boxes if the native PPTX table slips, the browser's print dialog if Chromium PDF fails the gate). The Download dialog with a progress sentence is the right shape for a three minute export. The Themes panel writing `defaults.theme` into the manifest ends the "Theme means two things" confusion R06 section 7 item 24 records. Taking the title slide's heading as the deck title once, when the title is still Untitled presentation, is Google's behaviour (R03 a.3) applied to the seller's first edit, and it removes a whole task.

Where it is weaker. Fidelity is a point below proposal 1: no Transition button, Title only not offered, GT names on the GT-only layouts, Publish to web without Stop publishing, a two row toolbar under 1100 px where Google collapses into More. Each is reasoned, and a rep who knows Google will still find every control in its place, so the deviations cost little. The label "Title and table" for the ruled rows layout collides with the new Table block and must be renamed. PDF through Chromium `page.pdf()` is marked Now but unmeasured (risk 6 says so and gives the fallback). The 30 day sweep of trashed decks inside `listDecks` is a write inside a read on a shared store without identity, and it must not ship (see the rejections). The claim that the ten tasks follow R07's order of frequency overstates R07, whose task table is ordered by workflow and carries no per task frequency; the summary of R07 does name the cover, the logo wall, the agenda, the pricing slide and the number slides as the slides a tailored deck changes, so the choice of tasks is sound even if the ordering claim is not. Builder B1 owns schema, renderer, lint and the store templates at once, which is too wide for one person; the renderer and export belong with one builder as proposals 1 and 3 have it.

Honesty. This is the most honest of the three documents: counts, departures with reasons, fallbacks per risk, an unverified list that ends with the sentence that none of the unverified facts changes the seller's path if Google turns out to differ.

## Proposal 3, architecture first

What it gets right. The per object export table in section 7 is the most rigorous statement in the three documents of what the Perfect and the Editable text PPTX can carry, with the pptxgenjs option named for every field (`addTable` with `colW`, `rowH`, per cell `align`, `valign`, `fill`, `border`; `hyperlink { slide }`; `breakLine`; `bullet { type: 'number' }`; `rotate`, `flipH`, `flipV`; `dashType`). The layout list moving into `packages/schema` as framework free `make` functions so the CLI, MCP, the editor and `template.json` read one table is the correct home for the "repeated slide templates" of Kevin's directive. Implementing the declared `text.replace` mutation with a 400 ms coalescing pause in `InlineText` gives Cmd Z Google's typing granularity (R09 finding 9, SPEC 6.7). `deck.list` as an action, the PDF verify through `pdftoppm`, the `noindex` meta on `/`, the Recent list ordered by this browser's history first, and the refusal list of section 7.12 stated plainly are all worth keeping.

Where it hurts the sales user. Apply layout refuses when content would be lost and tells the rep to "Move or delete the other 3 blocks first"; Google's rule is to keep content (R03 b.3), and a refusal with a chore is the opposite of the one click layout change the directive asks for. Notes ride in the PPTX by default, which R07 rule 25 argues against for a sales org. Transitions ship with a live Motion panel, rotation and flip ship with a handle and keys, twenty four shapes ship in four flyouts, charts ship in four kinds, autofit ships as explicit writes, and a Page setup dialog ships read only. Each adds surface a seller does not use (R07 frustrations table: "Do not invest here; sales decks do not need animation"). Print leaves the toolbar head, which breaks the Google order Kevin asked to mimic for no user gain. Four layouts keep GT labels where Google has names (Section opener, Head over body, Ruled statement list, Mood), which is defensible but less faithful. Compact mode hides the title row, so the rep loses the title, the save word and the Slideshow button.

Where it does not fit the quarter. The schemaVersion 2 bump with a migration that folds `box` into `shape` and rewrites fifteen placeholder strings to empty texts is architecture motivated churn: every deck on the Blob store is rewritten on its next save, a client at version 1 refuses to write a version 2 file, and a content rewrite lives inside a migration where nobody will look for it again. Every new field in all three proposals is optional, so no bump is needed. Risk 10 admits the now list is the largest round the repository has had, and the named fallback (ship B1, B2 and B4 first) ships the document, the exporter and the text editor with no chrome, which is nothing the sales org can see. Rotation contradicts the recorded decision, and risk 2 describes the measurer problem it causes.

Honesty. The export paths and the refusals are stated with reasons, the unverified Google details carry the reports' grades, and the risks are real. The plan is simply too large for the quarter, which is why buildability scores 4.

## The winner

Proposal 2 wins with 42 against 37 and 33. It is the only one of the three whose default plan removes the confusion R06 section 7 lists, refuses the vanity features R07 warns against, keeps the Prototemplate chrome, and could land in one round with the fallbacks it names. Proposals 1 and 3 each contribute pieces the synthesis must keep; those are listed next.

## Grafts the synthesis must keep

From proposal 1:

1. The menu model as data (`packages/chrome/src/menus/model.ts`) from which the tool finder, the shortcuts dialog and the menu completeness test are generated, plus the `shortcuts.test.ts` fixture built from R04 Part B and the `default-view-words.test.ts` that fails when lint, source, lease, revision, grammar, freeform, kind or toolchain appears in the default view (proposal 1 section 2 and B3 acceptance).
2. Apply layout keeps unmatched content instead of dropping it: on a content layout, unmatched blocks are appended to the last text slot; on a picture layout, to the plate (proposal 1 section 5.4 steps 1 to 3). Where the target has no block list (Title slide, Main point) the synthesis uses proposal 2's drop with the toast "Applied Main point. 1 picture did not fit this layout · Undo" and one `slide.replace`, never `ext.parked`.
3. The layout grid draws a rule between the layouts that carry Google's names and the GT layouts Google lacks (proposal 1 section 5.2 and 5.5), so a rep who knows Google finds the familiar names first. Proposal 2's 17 entry list stays; only the grouping is grafted.
4. A revocable per deck view token in the view link, with "Stop sharing" in the Share dialog rotating it (proposal 1 section 6.7; R10 C3 item 6 names this as a store feature that removes the "every deck to every visitor" exposure). Proposal 2's three honest link rows stay; the token is added under the View link.
5. `slide.duplicate` and `block.duplicate` as actions in the table (proposal 1 section 7; proposal 3 section 7.9 has the same), so Cmd D is one action on every transport instead of a composition in the row menu.

From proposal 3:

6. The layout list moves from `packages/chrome/src/slide-templates.ts` to `packages/schema/src/layouts.ts` as framework free `make` functions, read by the editor, `turboslide slide new --layout <id>`, the MCP tool and `template.json` (proposal 3 section 5.1; proposal 1 B1 also moves it).
7. The per object export path table with the pptxgenjs option named, as the acceptance contract for the table block, the paragraph break, the numbered ruled list and slide links, and an export fixture deck holding one of every new object exported in both modes and checked with `turboslide export check` (proposal 3 sections 7.3, 7.4 and B2 acceptance).
8. `text.replace` implemented in the reducer and used by `InlineText` with a 400 ms coalescing pause, so one Cmd Z removes one burst of typing (proposal 3 section 7.3; SPEC 6.7; R09 finding 9).
9. `deck.list` as an action so the Open dialog, the home page, the CLI and MCP share one call (proposal 3 section 7.9).
10. The PDF gate: `pdftoppm` rasterises the PDF and the diff against the web render runs under the flatten budget before PDF is called Now (proposal 3 section 7.11). Proposal 2's fallback to the browser's print dialog stands if the gate fails.
11. `<meta name="robots" content="noindex">` on `/`, because the root is now an editor (proposal 3 section 6.1).
12. Builder ownership split as proposals 1 and 3 have it: one builder for the document and actions, one for the renderer and export, so proposal 2's B1 does not own schema, renderer, lint and templates at once.
13. A one time snackbar on the first press of a retired bare letter, for the two people who use the viewer daily (proposal 3 risk 6); sales users never see it because they never press those keys.

From proposal 2 itself, two corrections the synthesis must make:

14. Rename the layout "Title and table" (the ruled rows template) so it does not collide with the Table block; "Title and key values" or "Ruled rows" both say what it is.
15. Drop the 30 day sweep inside `listDecks` (see rejection 12).

## What must not ship

1. The schemaVersion 2 bump with the `box` to `shape` fold and the placeholder string rewrite in a migration (proposal 3 section 7.1). Every field the round adds is optional, so no bump is needed; the fold rewrites every deck on the Blob store on its next save and makes a version 1 client refuse to write; a content rewrite inside a migration is a trap for the next reader.
2. Rotation and flip on blocks (proposal 1 section 7, proposal 3 section 7.2). The recorded decision in `docs/EDITOR-DEPTH-STATUS.md` section 2 and `docs/freeform.md` is "Rotation stays out"; proposal 3 risk 2 describes how it breaks the scene measurer; it is not in R07's task list. Arrange > Rotate is a Later stub with the reason in its tooltip. Kevin can reopen it as its own decision.
3. Transitions and the Motion panel (proposal 3 sections 2.3, 2.6 and 7.6; proposal 1's Motion stub in the toolbar). SPEC 8.6 drops motion, R07's frustrations table says not to invest, and four grey items about one thing read as broken. Omit everywhere, as proposal 2 does.
4. Italic as a fifth markup rule shipped now pending approval (proposal 1 section 7). It is a grammar change, a new font instance and a `fonts.build` run inside a round that is already full. Later stub with the tooltip "The GT theme sets Inter in one style".
5. Groups shipped now (proposal 1's `pos.group` tag, proposal 3's group block). A tag with no renderer or reducer meaning is half a feature; a group block with recursive `locateBlock` is a round of its own. Later.
6. Charts shipped now (proposal 1 bar and column, proposal 3 all four kinds). The table block is the number slide that matters this quarter; the chart is the largest new block after it. Later, designed as proposal 3 section 7.5 has it.
7. Thirteen to twenty four new shape presets, Word art, Insert > Building blocks listing "Specimens (advanced)", Insert > Templates, deck level guides, the Page setup dialog, Format > Capitalization and Special characters (proposals 1 and 3). None is in R07's tasks; each adds a control a seller must read past.
8. Apply layout that refuses with a chore (proposal 3 section 5.3) and Apply layout that parks content in `ext.parked` (proposal 1 section 5.4 step 3). Google keeps content; the synthesis keeps what fits, drops the rest with a toast and one undo, and never tells the rep to clean up first or hides content in a field.
9. Print removed from the toolbar head (proposal 3 section 3.1). Kevin asked for Google's order; Print stays at position 5 (R02 section 4.1).
10. Speaker notes included in PPTX downloads by default (proposal 3 sections 2.1 and 9.1). R07 rule 25 and the frustrations table: internal talk tracks must not reach a prospect by accident. Off by default with the checkbox, as proposal 2 section 6.7 has it.
11. Download options inside a toast (proposal 1 section 2.1). A 190 to 222 s export needs a dialog with a progress sentence and the two checkboxes before the wait starts.
12. Automatic deletion of trashed decks, whether as a scheduled purge (proposal 1 section 6.3) or a sweep inside `listDecks` (proposal 2 section 6.4). The deployment has no scheduler, a sweep is a destructive write inside a read, and a store without identity should never delete anything nobody clicked. A trashed deck stays until someone clicks Delete forever.
13. A permanently grey Transition button on the toolbar (proposal 1 section 3.1). The grey Comment button in Google's position is acceptable because comments are coming and the tooltip says so; Transition is not coming.
14. The Themes panel opening automatically on a new presentation (proposals 1 and 2). Google's behaviour is unverified (R03 a.3, R02 section 13), and with one theme in two appearances the open panel shows two cards and takes 320 px from the canvas at the moment the rep needs the slide. The right panel starts closed, as proposal 3 has it; the New slide arrow and the Layout button are the path to the repeated slide templates.

## Decisions this judgment takes on the grammar questions

The proposals leave three grammar decisions to Kevin. Judging as Kevin, and open to being overturned by him:

- Bullets: the GT grammar keeps ruled lists this round (SPEC 2.1). The Bulleted list button makes a ruled statement list and the Numbered list button adds the tabular numeral (proposal 2 section 7.7); the tooltip says "Lists in the GT theme are ruled rows". The `marker` field is the escape if the drive shows sellers pasting bulleted agendas and rejecting the rules.
- Italic and underline: Later stubs. Inter in one style is the brand.
- Rotation: stays out, as recorded.
- Paragraph breaks inside `paragraph`, `text`, `box` and table cell Texts: approved, because it is the one document change that unblocks the most frequent edit (R09 finding 1). SPEC 4.2 line 316 is amended as proposal 2 section 7.2 words it.

## Facts checked for this judgment

| Claim in a proposal | Where it was checked | Result |
| --- | --- | --- |
| `actions.ts` holds 54 ids, not the brief's 62 | `packages/schema/src/actions.ts`, grep of the id literals | 54, confirmed |
| "Rotation stays out" is a recorded product decision | `docs/EDITOR-DEPTH-STATUS.md` section 2; `docs/freeform.md` line 7 | Confirmed in both |
| SPEC 4.2 says "Four rules, nothing else" and refuses line breaks outside `panel.code` | `docs/spec/SPEC.md` lines 310 and 316 | Confirmed |
| SPEC 2.1 wants ruled rows and lists instead of bullets | `docs/spec/SPEC.md` line 32 | Confirmed |
| SPEC 8.2 writes rows as hairlines plus text boxes, never a PPTX table | `docs/spec/SPEC.md` line 1239 | Confirmed |
| `ExportFormat` names `pdf` and no builder exists | `packages/schema/src/export.ts` lines 11 and 118 ("Book mode through Chromium print (M6)") | Confirmed |
| `SCHEMA_VERSION` is 1 and the only migration stamps version 0 files | `packages/schema/src/deck.ts` line 17; `packages/schema/src/migrations.ts` | Confirmed |
| `/` redirects to the newest deck or creates "GT brand deck"; no `/new` or `/present` route | `apps/studio/src/routes/index.tsx`; the routes listing | Confirmed |
| The Perfect export of 85 slides takes 190 to 222 s against a 300 s limit; `deck.remove` does not exist | `docs/EDITOR-DEPTH-STATUS.md` lines 349 and 355 | Confirmed |
| The fifteen slide templates insert placeholder copy and the picture ones need an asset | R06 section 4.1 | Confirmed |
| The pricing update costs 51 clicks and 46 keys today against Google's 9 clicks and 23 to 28 keys | R11 C2 | Confirmed; proposal 1's "40 and 40 today" quotes the replace step alone, not the total |
| Google shows skipped slides to shared viewers | R10 A15 | Confirmed; proposals 2 and 3 depart on purpose and say so |
| Whether the Themes panel opens on a new presentation | R03 a.3 and unverified list; R02 section 13 | Unverified, as all three proposals mark it |
| Tab between table cells in Google Slides | R11 A2 | Unverified; all three bind it as the office convention |
| The filmstrip menu order | R08 A1, one 2017 source | Single source, as all three mark it |
| R07's task table is ordered by frequency (proposal 2 section 0) | R07 "Top tasks and how Google Slides handles them" | Not supported; the table is ordered by workflow and gives no frequencies. The task choice is still sound: the R07 summary names the cover, logo wall, agenda, pricing and number slides |
| The pptxgenjs options proposal 3 names | Proposal 3 cites the public API pages read 2026-09-11 | Not reopened for this judgment |
| Proposal 2's 98, 20 and 48 counts; proposal 3's 31 and 38 | Not recounted | The ratios are what matters for the "grey menu" argument and are visible in the tables |

## Sources

Repository files read for this judgment on 2026-09-11 at `8c7056c`: the three proposals under `docs/gslides-parity/design/`; `docs/gslides-parity/research/01-menu-bar.md` through `11-tables-charts-and-numbers.md` (the sections named above); `docs/spec/SPEC.md`; `docs/EDITOR-DEPTH-STATUS.md`; `docs/freeform.md`; `packages/schema/src/{actions,deck,migrations,export,blocks}.ts`; `packages/store/src/templates.ts`; `packages/chrome/src/slide-templates.ts`; `apps/studio/src/routes/index.tsx`.

Google pages this judgment leans on through the reports, read by the research agents on 2026-09-11 and not reopened here:

- Keyboard shortcuts for Google Slides. https://support.google.com/docs/answer/1696717
- Add, delete & organize slides (skip slide, layouts, new slide). https://support.google.com/docs/answer/1694830
- Use a template or change the theme, background, or layout. https://support.google.com/docs/answer/1705254
- Present slides (the Slideshow button and the present toolbar). https://support.google.com/docs/answer/1696787
- Add and edit tables (the 20 by 20 cap). https://support.google.com/docs/answer/1696711
- Change how text fits in placeholders & text boxes. https://support.google.com/docs/answer/10364036
- Create, view, or download a file (Download and Make a copy). https://support.google.com/docs/answer/49114
- Apps Script reference, Enum PredefinedLayout (the eleven layout names). https://developers.google.com/apps-script/reference/slides/predefined-layout
- Slides API text concepts (paragraphs end in a newline). https://developers.google.com/workspace/slides/api/concepts/text
- More options for copying presentations in Google Slides, 2020-01-08. https://workspaceupdates.googleblog.com/2020/01/copy-presentation-options-slides.html
- Alice Keeler, Google Slides: Right Click on the Filmstrip, 2017-11-08. https://alicekeeler.com/2017/11/08/google-slides-right-click-filmstrip/
- CustomGuide, Google Slides Quick Reference Guide. https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf
- BrightCarbon, Google Slides: The ULTIMATE guide. https://www.brightcarbon.com/blog/google-slides-ultimate-guide/
