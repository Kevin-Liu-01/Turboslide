# Proposal 3, architecture: document and export first

Designer 3 of 3 for the Google Slides parity round, written 2026-09-11 against Turboslide `main` at `8c7056c`. The angle is the document and its exports: every Google Slides behaviour Kevin asked for is first placed in the block document, then in the renderer, the linter, the actions table, the CLI, MCP and the two PPTX modes, so that the studio, the viewer, the exporter and an agent keep reading one truth. Google's chrome is then laid over that model in sections 1 to 6 and 8 to 10.

Inputs read in full: the eleven research reports in `docs/gslides-parity/research/` (cited below as R01 to R11 with their sections), `docs/spec/SPEC.md`, `docs/EDITOR-DEPTH-STATUS.md`, `docs/freeform.md`, `docs/pptx.md` and `docs/deck-transfer.md` (heads), `AGENTS.md`, and the code the decisions depend on: `packages/schema/src/{actions,deck,blocks,mutations,position,export,migrations,catalog,text,freeform,validate}.ts`, `packages/render/src/slide.ts`, `packages/export/src/scene/{types,measure}.ts`, `packages/export/src/pptx/{build,text,lines,notes,images}.ts`, `packages/store/src/templates.ts`, `apps/studio/src/routes/index.tsx`, `decks/templates/gt-brand/template.json`, `packages/chrome/src/slide-templates.ts`. Facts about Google Slides come from the research reports and the public pages they cite; the report and section are named at each use, and the pages are listed in section 13 with the date they were read. Facts about pptxgenjs come from its public API pages, read on 2026-09-11 and listed in section 13. Nothing was measured in a browser for this proposal, and no Google account was opened.

Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings, full sentences in body text. Google Slides is named as the reference product; no Google icon, logo, artwork or asset is proposed. Turboslide keeps Heroicons 20 solid, Inter and the `--pt-` tokens.

Decisions taken before this proposal and not reopened here: the root address opens a fresh presentation in the editor titled Untitled presentation with one title slide on the GT theme; New slide and Apply layout offer that theme's slide layouts; the GT brand deck stays available to open and present; the editor mirrors Google Slides' structure, behaviours and shortcuts; the audience is non-technical sales people; the visual language stays Prototemplate; the block document, the grammar linter, the actions table and the perfect PPTX export stay the foundation; agent-facing surfaces leave the default view; a deck can be moved to trash from the UI.

## 0. The thesis in five sentences

Google Slides is a shape document: every object has a box, a rotation, a z order and a set of styles, and every menu item writes one of those. Turboslide is a grammar document with one freeform layout, and after the freeform round the freeform layout already carries a box, a z order and the primitive objects, so the gap to Google's object model is a short list of fields (rotation, flip, group, table, chart, list markers, paragraph breaks, slide background, skip, transition, links, guides) and a short list of actions. Everything in that list is placed in the schema first, with a migration, so that the CLI, MCP, the renderer, the linter and both PPTX modes gain it at the same time as the menu item does. The Perfect PPTX carries any of it for free, because the page raster carries whatever the renderer draws; the Editable text PPTX carries what pptxgenjs and the OOXML post-process can express natively (rotation, flip, tables, bullets, dashes, links, backgrounds, groups) and rasterises the rest, with the report saying which. The chrome then becomes a relabelling and reordering of surfaces that already exist, plus a title row, a menu bar, contextual toolbar tails, a notes pane, a Format options panel and a present toolbar.

## 1. Screen anatomy

The window below is 1440 by 900, the width the chrome lint already runs at. Every size is in CSS px. Sizes that come from the Prototemplate tokens are named; sizes that are new are stated as the proposal.

```
x: 0        256                                                        1120                     1440
   +--------+-----------------------------------------------------------+-------------------------+ y: 0
   | [GT]  Untitled presentation   [cloud: Saved]        [clock: Last edit] [Slideshow v] [Share]  |     title row 48
   | File  Edit  View  Insert  Format  Slide  Arrange  Tools  Extensions  Help                    |     menu bar 28   (y 48..76)
   | [Search] | [+ v] [Undo] [Redo] [Paint] [Fit v] | [Select] [T] [Image v] [Shape v] [Line v]    |     toolbar 40    (y 76..116)
   |          | Background  Layout v  Theme  Transition                                        [^] |
   +--------+-----------------------------------------------------------+-------------------------+ y: 116
   |  1     |                                                           | Format options      [x] |
   | [====] |     +-----------------------------------------------+     |                         |
   |        |     |                                               |     |  Size & rotation        |
   |  2     |     |          sheet 1600 x 900 at k                |     |  Position               |
   | [====] |     |          k = (stage width - 56) / 1600        |     |  Text fitting           |
   |        |     |                                               |     |  Alt text               |
   |        |     +-----------------------------------------------+     |                         |
   |        |                                                           |                         |
   |        |  ......  (drag handle, 8 px)                              |                         |
   |        |  Click to add speaker notes                      72 px    |                         |
   +--------+-----------------------------------------------------------+-------------------------+ y: 872
   | [filmstrip] [grid]                                       Slide 1 of 1                    [>] |     status bar 28
   +------------------------------------------------------------------------------------------------+ y: 900
```

| Region | Size | Source of the size | Notes |
| --- | --- | --- | --- |
| Title row | 48 high, full width | new | Left: the GT mark as the home link (`/decks`), the title field (`deck.rename` on Enter or blur, `DeckName.tsx` today), the save word as a cloud glyph with the text Saved, Saving or Offline (the revision number leaves; `StatusChip.tsx` keeps it behind Tools). Right: Last edit (opens Version history), Slideshow as a split button, Share. Google's star, move, Meet, Record, avatar and Gemini are omitted (R02 section 2). |
| Menu bar | 28 high | new | Ten menus in Google's order (R01 "Menu bar placement"). The chevron at the right end hides menu bar and toolbar together (compact mode, Cmd Shift F). |
| Toolbar | 40 high, one row, labels collapse into a More button below 1180 px | `--pt-bar-h` 52 today; 40 matches Google's proportions (R02 section 11) | The head is fixed (section 3.1); the tail changes with the selection (sections 3.2 to 3.6). |
| Filmstrip | 256 wide in thumbnail density (`--pt-sb-w` 256), collapsible to 0 | existing | Numbered 16:9 cards; drag to reorder; multi-select; right-click menu (section 4). The outline density, the filter row, the kind glyphs, the lint badges, the lease dots and the section folding leave the default view. |
| Canvas | the remaining width, 28 px padding, sheet scaled by k | existing `Stage.tsx` | Zoom Fit by default; Cmd plus, Cmd minus, Cmd 0 (section 8). |
| Speaker notes pane | 72 high by default (one line plus padding), drag handle 8 px, range 0 to 320, remembered per browser | new; Google's default is about one text line (R02 section 7) | Placeholder Click to add speaker notes; edits write `slide.set /notes` on blur or after a 400 ms pause. |
| Right panel | 320 wide, closed by default, one panel at a time | `--pt-panel-w` is 460 today; 320 matches Google's Format options width (R02 section 11) | Hosts Format options, Themes, Motion, Version history. The generated inspector becomes Format options with Google's section names (section 7.7). |
| Status bar | 28 high | new | Left: filmstrip view and grid view toggle (R02 section 9). Centre: Slide n of m. Right: a chevron that opens the right panel. No revision, no store, no Node version. |
| Present toolbar | bottom left, 40 high, appears on hover | new (R04 section A3) | Previous, slide number (opens the slide list), Next, Options. |

Sheet scale at 1440 wide with the filmstrip open and the panel closed: stage width 1440 - 256 = 1184, minus 56 padding = 1128, k = 0.705. With the panel open: 808 wide, k = 0.505. At or below 900 px the filmstrip becomes an overlay and the panel a sheet, as `ViewerShell.tsx` does today.

Two structural changes from today's shell: editing is no longer a mode (the Edit | View segmented control and the E key leave; the view route `/deck/:id` is the read-only surface), and the two present buttons become one Slideshow split button (R06 finding 1 and 3).

## 2. The menu bar

Columns: Google's item as R01 prints it; what Turboslide does; the round. Round values: **now** ships in this round; **later** ships as a menu item that is present and disabled with the tooltip "Not yet in Turboslide" so the position is learned; **omit** does not appear, with the reason. Shortcuts are Google's (R01, R04 Part B), Mac first, Windows in brackets; the full map and the conflicts are in section 8.

### 2.1 File

| Google item | Turboslide | Round |
| --- | --- | --- |
| New > Presentation | Opens `/` in a new tab: a fresh Untitled presentation on the GT theme (section 6.1) | now |
| New > From Template Gallery | Renamed "From the GT brand deck": `deck.create` with `from: 'gt-brand'`, named Untitled presentation, opens in a new tab | now |
| Open (Cmd O, Ctrl O) | Dialog listing the decks on this studio (`deck.list`, section 7.9) with a search field, title, slide count and last edit; Open replaces the current deck in this tab | now |
| Import slides | Dialog: step 1 picks a deck on this studio (tab Presentations) or a bundle zip (tab Upload); step 2 shows its slide thumbnails with All and None and an Import slides button; `slide.import` copies the slides and the assets they reference after the current slide. Google's Keep original theme checkbox is omitted because one theme exists. A .pptx on the Upload tab is refused with the reason until the PPTX importer exists (section 7.10) | now; PPTX import later |
| Make a copy > Entire presentation | Dialog: Name (default "Copy of <title>"), Remove speaker notes checkbox, Make a copy; `deck.copy`; opens the copy in a new tab. Share with the same people and Copy comments are omitted (no identity, no comments yet) | now |
| Make a copy > Selected slides | Same dialog over the filmstrip selection (`deck.copy` with `slideIds`) | now |
| Share > Share with others | The Share dialog (section 6.5): Copy link (the view route), Copy edit link, Embed code, notes and skipped slides excluded. Roles, people and General access wait for identity (R10 Part C4) | now, without roles |
| Share > Publish to web | Publish dialog with Link and Embed tabs, auto-advance, loop, Stop publishing; pins the published route to a named version (R10 C3 item 6) | later |
| Email > Email this file, Email collaborators | No mail service in Turboslide | omit |
| Download > Microsoft PowerPoint (.pptx) | `export.run` format pptx, mode flatten (Perfect) by default; an Options disclosure in the dialog holds Editable text, Light, Dark or Both, Include skipped slides (off), Include speaker notes (on, as Google's PPTX carries notes) | now |
| Download > ODP Document (.odp) | No writer; a LibreOffice conversion on the render worker is possible later | later |
| Download > PDF Document (.pdf) | `export.run` format pdf: the render worker prints the standalone HTML one slide per page at 13.333 by 7.5 in (section 7.11); skipped slides excluded by default; notes excluded | now |
| Download > Plain Text (.txt) | `export.text`: every slide's texts and notes in order | now |
| Download > JPEG image (.jpg, current slide) | `render.slide` at 2x, format jpg | now |
| Download > PNG image (.png, current slide) | `render.slide` at 2x, format png | now |
| Download > Scalable Vector Graphics (.svg, current slide) | The renderer is HTML and CSS; no SVG writer | omit |
| Download > Web page (.html) | Not in Google Slides; kept as the last item because the standalone build exists (`build.run`) | now |
| Rename | Focuses the title field | now |
| Move, Add shortcut to Drive | No folders in the store | omit |
| Move to trash | `deck.trash`; returns to the home page with the snackbar "Moved to trash" and Undo (`deck.restore`) | now |
| Version history > Name current version | Small dialog with a Name field and Save; `version.save` | now |
| Version history > See version history (Cmd Option Shift H) | Right panel: versions grouped by day, Only show named versions toggle, Show changes (a `diff.run` of the record, coloured by author label), Restore this version (`version.restore`), Make a copy (`deck.copy` at that revision) | now |
| Approvals | Workspace feature; no identity | omit |
| Make available offline | Present mode keeps working after load; nothing to configure | omit |
| Details | Dialog: title, id, slides, sections, created, last edit, revision, store kind | now |
| Language | Inter and English only; the browser's spell check follows the browser language | omit |
| Page setup | Dialog showing Widescreen (16:9), 1600 by 900 sheet px, selected and read only; Standard, 16:10 and Custom shown disabled with the reason (the renderer, the grammar and the exports are fixed to one sheet) | now, read only |
| Print settings and preview | Layout (1 slide without notes, 1 slide with notes, handouts), orientation, Include skipped slides, Hide background, Download as PDF, Print | later |
| Print (Cmd P, Ctrl P) | Builds the PDF and opens it in a new tab for the browser's print dialog | now |

### 2.2 Edit

| Google item | Turboslide | Round |
| --- | --- | --- |
| Undo (Cmd Z), Redo (Cmd Y or Cmd Shift Z) | Toolbar buttons plus keys; the history of `packages/agent/src/window/history.ts` unchanged | now |
| Cut, Copy, Paste (Cmd X, C, V) | Slides in the filmstrip and blocks on the canvas travel as a JSON envelope on the clipboard (section 7.8); text inside a run is the browser's | now |
| Paste without formatting (Cmd Shift V) | Plain text into the caret; onto the canvas as a `text` block | now |
| Delete | Removes the selected slides or blocks with the snackbar "Deleted. Undo" | now |
| Duplicate (Cmd D) | `slide.duplicate` in the filmstrip, `block.duplicate` on the canvas (8 px offset on freeform) | now |
| Select all (Cmd A) | Every block on the slide, or every slide when the filmstrip has focus, or the run's text inside a caret | now |
| Select none | Clears the selection (no chord bound; Escape does the same) | now |
| Find and replace (Cmd Shift H, Ctrl H); Find (Cmd F) | Dialog: Find, Replace with, Match case, Prev, Next, Replace, Replace all over every Text and note; Cmd F opens the lighter Find bar; Replace all is `text.replaceAll` | now |

### 2.3 View

| Google item | Turboslide | Round |
| --- | --- | --- |
| Slideshow (Cmd Enter, Ctrl F5) | Present mode from the current slide | now |
| Motion (Cmd Option Shift B) | Right panel with Slide transition (type, speed, Apply to all slides, Play) and Object animations shown disabled with the tooltip | now for transitions; animations later |
| Theme builder | The theme and its layouts are code; a builder view needs a layout editor | later |
| Grid view | The existing grid over the canvas; also the status bar toggle | now |
| Zoom > Zoom in (Cmd plus), Zoom out (Cmd minus), Fit, 50%, 100%, 200%; Zoom 100% (Cmd 0) | `view.zoom` (section 7.9); the toolbar Fit box accepts 25 to 1600 | now |
| Show ruler | Sheet px rulers along the canvas top and left | later |
| Guides > Show guides, Add vertical guide, Add horizontal guide, Edit guides, Clear guides | `deck.guides` in the manifest (section 7.6); drawn on every slide, never presented or exported | now |
| Snap to > Guides, Grid | Two editor preferences read by the existing `snapPosition`; Guides on, Grid off by default as Google (R02 section 6) | now |
| Comments > Hide, Minimize, Expand | Waits for comments | later |
| Live pointers | No presence channel | omit |
| Show speaker notes (Cmd Option Shift S focuses the pane) | Toggles the notes pane | now |
| Show filmstrip | Toggles the filmstrip | now |
| Mode > Editing, Viewing | Viewing hides the editing overlays (today's View mode) without the E key; Commenting waits for comments | now; Commenting later |
| Full screen (Cmd Shift F, Ctrl Shift F) | Compact mode: hides title row, menu bar and toolbar; Escape restores; the chevron does the same | now |
| Appearance > Light, Dark | Turboslide's own item: the light and dark twin of the sheet and chrome (the former theme button and D key) | now |

### 2.4 Insert

| Google item | Turboslide | Round |
| --- | --- | --- |
| Image > Upload from computer | File picker; `asset.add` with the file as a data URL (alt from the file name, role other) then `block.insert` of a `shot`; on a freeform slide at the click point, else into the selected slot | now |
| Image > By URL | URL field with preview; `asset.add` with `url` | now |
| Image > From this deck's pictures | The asset picker; replaces Drive & Photos | now |
| Image > Stock & web, Camera | No licensed image source; no camera flow | omit |
| Text box | Draws a `text` block by click or drag on a freeform slide; inserts into the slot on a grammar slide | now |
| Audio, Video | No media playback in present mode and no media in PPTX or PDF | omit |
| Shape > Shapes, Arrows, Callouts, Equation | Four flyout grids over the shape table of section 7.2 (24 kinds now) | now; the rest of the ECMA set later |
| Table | Grid picker up to 20 by 20; inserts a `table` block (section 7.4) | now |
| Chart > Bar, Column, Line, Pie | Inserts a `chart` block with sample data; the numbers are edited in Format options (section 7.5) | now |
| Chart > From Sheets | No spreadsheet service | omit |
| Diagram | A panel of six generated diagram presets (Grid, Hierarchy, Timeline, Process, Relationship, Cycle) built from shapes, arrows and text blocks on a freeform slide | later |
| Word art | A `text` block at ladder size 88, weight 500, on a freeform slide, entered through a text bar over the canvas | now |
| Line > Line, Arrow | The `shape` kinds line and arrow, drawn by drag between two points | now |
| Line > Elbow connector, Curved connector | Connectors that attach to shapes | later |
| Line > Curve, Polyline, Scribble | Free paths have no grammar and no clean export | omit |
| Special characters | Picker inserting a character at the caret | later |
| Animation | Object animations | later |
| Link (Cmd K) | Popover: Text, Link (URL) or Slides in this presentation (Next, Previous, First, Last, or a slide); on a run it writes the four-rule link, on a block `block.set /link` (section 7.6) | now |
| Comment (Cmd Option M) | Comments as document data with a label, a time, an anchor and a resolved flag (R10 C3 item 4) | later |
| New slide (Ctrl M on every platform) | `slide.new` with the current slide's layout; the arrow on the toolbar picks another layout (section 5) | now |
| Slide numbers | Dialog: On, Off, Skip title slides, Apply; writes `deck.numbers` | now |
| Placeholder | Theme builder only | omit |
| Templates | Right panel listing the GT brand deck's 85 slides by section with Insert and Insert all slides (`slide.import` from the gt-brand deck) | now |
| Building blocks, Speaker spotlight | Not applicable | omit |

### 2.5 Format

| Google item | Turboslide | Round |
| --- | --- | --- |
| Text > Bold (Cmd B) | The weight 500 run on a selection, `typography.weight` 500 on a selected block | now |
| Text > Italic (Cmd I), Underline (Cmd U), Strikethrough | The grammar has no italic or underline run and the export font set has no italic cut (R09 finding 7) | later |
| Text > Superscript, Subscript | No grammar | omit |
| Text > Size > Increase (Cmd Shift period), Decrease (Cmd Shift comma) | One step along the type ladder | now |
| Text > Capitalization > lowercase, UPPERCASE, Title Case | A text transform on the selection or the block's Text | now |
| Align & indent > Left, Center, Right (Cmd Shift L, E, R) | `typography.align` | now |
| Align & indent > Justified (Cmd Shift J) | Not in `TYPE_ALIGNS`; the grammar sets measures, not justification | omit |
| Align & indent > Increase indent (Cmd ]), Decrease indent (Cmd [) | The list item `level` of section 7.3 | now |
| Align & indent > Indentation options | No hanging indents in the grammar | omit |
| Line & paragraph spacing > Single, 1.15, 1.5, Double, Custom spacing | The leading steps of `TYPE_LEADING`, labelled by value; Custom takes any step | now |
| Bullets & numbering > Bulleted list (Cmd Shift 8), Numbered list (Cmd Shift 7) | `plain.marker` bullet or number (section 7.3) | now |
| Bullets & numbering > List options | Restart numbering, More bullets | later |
| Table > Insert row above, Insert row below, Insert column left, Insert column right, Delete row, Delete column, Delete table, Distribute rows, Distribute columns | `block.set` on the `table` block's rows and columns | now |
| Table > Merge cells, Unmerge cells | Cell spans | later |
| Image > Crop image | The `trim` box of section 7.2, dragged with the crop handles, Enter to finish | now |
| Image > Mask image | Shape masks | later |
| Image > Replace image | `block.set /asset`, or a new file dropped on the image | now |
| Image > Reset image | Deletes `trim` | now |
| Image > Image options | Opens Format options on the image | now |
| Borders & lines > Border color, Border weight, Border dash | `stroke`, `width` and the new `dash` on shape, rule and table | now |
| Borders & lines > Line start, Line end | `arrowheads`; triangle heads only | now |
| Format options | The right panel (section 7.7) | now |
| Clear formatting (Cmd backslash) | Deletes `typography`, `color`, `fill`, `stroke`, `dash` overrides on the selection | now |

### 2.6 Slide

| Google item | Turboslide | Round |
| --- | --- | --- |
| New slide (Ctrl M) | `slide.new` | now |
| Duplicate slide (Cmd D) | `slide.duplicate` | now |
| Delete slide | `slide.remove` with the Undo snackbar | now |
| Skip slide | `slide.skip` toggle; the item reads Unskip slide on a skipped slide | now |
| Move slide > up (Cmd Up), down (Cmd Down), to beginning (Cmd Shift Up), to end (Cmd Shift Down) | `slide.move` | now |
| Change background | Dialog: Color (the palette), Image (Choose), Reset to theme, Done; writes `slide.background` (section 7.6). Add to theme is omitted (the theme is code) | now |
| Apply layout | Submenu of the theme's layouts with the current one marked; `slide.applyLayout` (section 5.3) | now |
| Transition | The Motion panel at the Slide transition section | now |
| Edit theme | Theme builder | later |
| Change theme | Right panel Themes: one card, General Translation, with Light and Dark appearance and an Import theme button shown disabled | now |

### 2.7 Arrange

| Google item | Turboslide | Round |
| --- | --- | --- |
| Order > Bring to front (Cmd Shift Up), Bring forward (Cmd Up), Send backward (Cmd Down), Send to back (Cmd Shift Down) | `block.order` with all four moves; the ones with no effect are disabled | now |
| Align > Left, Center, Right, Top, Middle, Bottom | `block.align` | now |
| Distribute > Horizontally, Vertically | `block.distribute` (three or more blocks) | now |
| Center on page > Horizontally, Vertically | `block.align` with `to: 'content'` on one block, center or middle | now |
| Rotate > Rotate clockwise 90°, Rotate counter-clockwise 90°, Flip horizontally, Flip vertically | `block.set /pos/rotate` and `/pos/flip` (section 7.2); flip is disabled on text-carrying blocks | now |
| Group (Cmd Option G), Ungroup (Cmd Option Shift G) | `block.group`, `block.ungroup` (section 7.2) | now |
| Regroup | Unverified in Google (R01) | omit |

Arrange items act on freeform slides. On a grammar slide the Arrange menu is disabled with the tooltip "Switch the slide to the Blank layout to arrange objects freely", and the column seam, key column and plate handles keep working as today.

### 2.8 Tools

| Google item | Turboslide | Round |
| --- | --- | --- |
| Spelling > Underline errors | Turns the browser's spell check on the editable run on or off (default on) | now |
| Spelling > Spell check, Personal dictionary | A card walking misspellings | later |
| Explore, Linked objects, Dictionary, Q&A history, Dictate speaker notes, Accessibility settings, Activity dashboard | No service behind them | omit |
| Preferences | Autofit default for new text boxes, Snap to defaults | later |
| Turboslide items: Check deck (the lint panel), Show issues on the slide (the lint layer), Both appearances side by side (the twin), Slide source (Cmd Option Shift P, the source drawer; Google's key for HTML view), Render this slide, Show advanced actions (adds the Actions group to Search the menus and the revision to the save word) | The agent-facing surfaces, moved here from the toolbar | now |

### 2.9 Extensions

| Google item | Turboslide | Round |
| --- | --- | --- |
| Add-ons, Apps Script, AppSheet | Not applicable | omit |
| Turboslide items: Connect an agent (the Connect card: MCP endpoint, CLI push and pull commands), API reference (`/openapi.json`, `/llms.txt`) | The agent connection surface | now |

### 2.10 Help

| Google item | Turboslide | Round |
| --- | --- | --- |
| Search the menus (Option slash, Alt slash) | The command palette relabelled; it lists menu items, slides and layouts; the Actions group appears only under Tools > Show advanced actions | now |
| Help | The docs folder rendered (`docs/README.md`) | now |
| Training, Updates, Help Slides improve, Privacy Policy, Terms of Service | Not applicable | omit |
| Keyboard shortcuts (Cmd slash, Ctrl slash) | The help card rebuilt from the section 8 table with a search box | now |

## 3. The toolbar

Google's order comes from R02 section 4; every button carries the Tooltip primitive with the label and the key and nothing else (no action id, no pointer).

### 3.1 The head, always shown, and the tail with nothing selected

Search the menus | New slide with the New slide with layout arrow (Ctrl M) | Undo (Cmd Z) | Redo (Cmd Y) | Paint format (Cmd Option C to copy, Cmd Option V to paste) | Zoom (Fit) | separator | Select | Text box | Image with the arrow (Upload from computer, By URL, From this deck's pictures) | Shape with the arrow (Shapes, Arrows, Callouts, Equation) | Line with the arrow (Line, Arrow; connectors later, disabled) | separator | Background | Layout with the arrow | Theme | Transition | the compact mode chevron at the far right.

Print is dropped from the toolbar head (it lives under File; the toolbar has one row and the print path is the PDF). Comment is added to the tail as a disabled button until comments ship.

Mapping: Search the menus opens the palette in menu mode; New slide is `slide.new` with the current layout; Undo and Redo are the history; Paint format copies `typography`, `color`, `fill`, `stroke`, `dash` from the selection and applies them to the next clicked block with one `slide.update`; Zoom is `view.zoom`; Select clears any draw tool; Text box, Shape and Line arm a draw tool that writes one `block.insert` with `pos` from the drag (or a default 480 by 64, 240 by 160, 320 by 8 box at the click point) on a freeform slide, and inserts into the slot under the pointer on a grammar slide; Image opens the source menu; Background opens the Background dialog; Layout opens the layout grid (section 5); Theme opens the Themes panel; Transition opens Motion.

### 3.2 A text block selected (heading, paragraph, text, box, credit, a list item or a table cell)

Head, then: Fill color | Border color | Border weight | Border dash (fill and border act on `shape` and `table` cells; on a grammar text block they are disabled) | Font (Inter, disabled, tooltip "The GT theme uses Inter") | Font size with minus and plus (the ladder; the field shows the current size) | Bold | Italic (disabled) | Underline (disabled) | Text color (the palette on `color`) | Link (Cmd K) | Comment (disabled) | Align (Left, Center, Right; Top, Middle, Bottom for shape and table cell text) | Line & paragraph spacing | Bulleted list | Numbered list | Decrease indent | Increase indent | Clear formatting | Format options.

Highlight color is omitted (no grammar). The same tail shows for the caret state and the box state, as R09 A10 records for Google.

### 3.3 A shape selected

Head, then Fill color | Border color | Border weight | Border dash | the text controls of 3.2 (a shape holds text, section 7.2) | Format options.

### 3.4 A line or arrow selected

Head, then Line color | Line weight | Line dash | Line start | Line end | Format options.

### 3.5 An image selected (shot, or the picture of an opener, mood or closing slide)

Head, then Border color | Border weight | Border dash (the `shot.border` flag becomes the border fields) | Crop image with the Mask arrow (Mask disabled) | Replace image | Image options | Reset image | Format options.

### 3.6 A table selected

Head, then Border color | Border weight | Border dash | Fill color | the text controls of 3.2 with the Align control's vertical row enabled | Format options. A right-click on a cell carries the nine row and column commands (section 4.3).

### 3.7 A chart, an icon, a group or a figure block selected

Head, then Format options only; the chart's data grid, the icon's name and colour, the group's members and the figure's asset live in the panel.

## 4. The filmstrip

### 4.1 Rows

One numbered 16:9 card per slide, the current one outlined in `--pt-ink`, a skipped slide at 40 percent opacity with a crossed eye glyph at its corner (R02 section 5). Sections show as a 12.5 px titanium label between groups when the deck has more than one section, without a chevron and without folding by default (the GT deck keeps its eight labels; a new deck has one section named Deck and shows no label). The kind glyph, the lint badge, the lease dot, the count, the filter row and the density toggle leave the default view; Tools > Show advanced actions brings the lint badge and the lease dot back.

### 4.2 Gestures and keys

Click selects; Shift click selects a range; Cmd click adds; Up, Down, Page Up, Page Down, Home, End move; Shift with those extends; drag reorders one or several slides with a drop line (`slide.move`, one write per drop, within or across sections); Cmd Up and Cmd Down move a slide one place; Cmd Shift Up and Cmd Shift Down move to the beginning or end; Delete or Backspace removes the selection with the snackbar Undo; Enter opens the slide on the canvas; Cmd Option Shift F focuses the filmstrip, Cmd Option Shift C the canvas. Alt Up and Down (today's move keys) are retired.

### 4.3 Right-click menu

On one or several rows, in R08 A1 order with Google's labels: Cut, Copy, Paste | New slide, Duplicate slide, Delete, Skip slide (Unskip slide when skipped) | Change background, Apply layout > (the layout list), Transition | Move slide > (Move slide to beginning, Move slide up, Move slide down, Move slide to end) | Comment (disabled). The menu opens at the pointer, prints the key beside Paste, Duplicate slide and Comment, disables Move items at the ends, returns focus to the row on Escape, and never shows Render, Lint this slide, Copy id or Move to section (those live under Tools > Show advanced actions).

The canvas object menu, for the record here because the filmstrip and the canvas share the menu component: Cut, Copy, Paste, Delete, Duplicate | Order >, Rotate >, Center on page >, Align >, Distribute >, Group or Ungroup | Text fitting (text blocks), Replace image, Crop image, Reset image (images), the nine table commands (a table cell) | Link, Alt text, Format options | Comment (disabled).

### 4.4 Grid view

The existing grid replaces the canvas from View > Grid view or the status bar toggle; tiles drag to reorder, carry the same right-click menu, a double click returns to the filmstrip view, and the minus and plus at the bottom left change the tile size between 200, 300 and 400 px (R02 section 5). Book view is removed from the product (R06 row 152).

### 4.5 Skip

`slide.skip` writes `skip: true` on the slide (section 7.6). A skipped slide stays in the filmstrip dimmed, is omitted by present mode, by the view route's slideshow, by `/embed`, by PDF and PPTX unless Include skipped slides is ticked, and by the slide count in the status bar's "of m". This is stricter than Google, which shows skipped slides to anyone the file is shared with (R10 A15); the Share dialog states it.

## 5. The layout system

### 5.1 One list, four surfaces

Google ships eleven layouts per theme and shows the same ordered list in the New slide arrow, the Layout button, Slide > Apply layout and the filmstrip right-click (R03 finding 2). Turboslide's equivalent is the GT theme's slide templates. The list moves from `packages/chrome/src/slide-templates.ts` to `packages/schema/src/layouts.ts` (framework free, the same pure `make` functions) so that the CLI (`turboslide slide new --layout <id>`), MCP (`deck_new_slide`), the editor and `template.json` read one table. The order is Google's order where a layout has a Google counterpart, then the GT layouts Google lacks:

| # | Layout label | Id | Kind and grammar layout | Google's nearest layout (R03 b.2) | Needs a picture |
| --- | --- | --- | --- | --- | --- |
| 1 | Title slide | `title` | title (mark, heading, lead) | Title slide | no |
| 2 | Section opener | `opener` | opener (picture, plate lower left 740) | Section header | yes |
| 3 | Head over body | `split` | content, split 4/8 | Title and body | no |
| 4 | Two columns | `cols` | content, cols 5/7 | Title and two columns, Section title and description | no |
| 5 | Title only | `title-only` | content, split single head, empty body | Title only | no |
| 6 | Ruled statement list | `plain` | content, cols 5/7 with a plain list | One column text | no |
| 7 | Statement | `statement` | statement (72 px line) | Main point | no |
| 8 | Big number | `big-number` | content, center: an h1 at 88 px and a cap paragraph | Big number | no |
| 9 | Mood | `mood` | mood (picture, plate lower right 560) | Caption | yes |
| 10 | Blank | `blank` | content, freeform, no blocks | Blank | no |
| 11 | Ruled rows | `rows` | content, cols 5/7 with a rows block | none | no |
| 12 | Tile grid | `tiles` | content, split 4/8 with tiles | none | yes |
| 13 | Detail grid | `details` | content, split 4/8 with details | none | yes |
| 14 | Pair of figures | `pair` | content, split with a pair | none | yes |
| 15 | Figure | `figure` | content, cols 4/8 with a shot | none | yes |
| 16 | Status board | `board` | content, split with a board | none | no |
| 17 | Matrix | `matrix` | content, cols 5/7 with a matrix | none | no |
| 18 | Closing | `closing` | closing (picture, plate upper left 720, mark) | none | yes |

Two entries are new (`title-only`, `big-number`, `blank` is the freeform layout with no blocks); fifteen exist. Each entry gains a 160 by 90 thumbnail rendered from its own `make` with empty texts through `renderThumb`, so the grid is drawn by the renderer and never by an illustration. Layouts that need a picture take the deck's first asset of the named roles and are shown disabled with the tooltip "Add a picture to this deck first" when the deck has none.

### 5.2 New slide

`slide.new` (section 7.9) inserts after the current slide, in the current slide's section, a slide built by the layout's `make` with the current slide's layout id by default (Ctrl M, the toolbar plus, right-click New slide); the toolbar arrow, Slide > Apply layout on a fresh slide and the palette pick another. Texts are empty and the renderer draws the prompt Click to add title, Click to add subtitle, Click to add text in the editor only (section 7.3), so the copy linter's placeholder finding disappears and thumbnails, present mode and exports show nothing for an empty text. The slide id is `<layout>-<n>` with the first free n.

### 5.3 Apply layout

`slide.applyLayout` (slideId, layout id) converts an existing slide and keeps its content where the target has a place for it, following Google's rule that placeholder content moves into the new layout's placeholders (R03 b.3):

- Between content layouts: the existing `convertLayout` and `slide.setLayout` rules (docs/freeform.md section 4), then the target template's grammar layout options are applied. To Blank: the measured boxes become `pos` (today's `toFreeform`). From Blank: boxes fall into slots by geometry (today's `toGrammar` or `convertLayout`).
- Content to title or statement: the first heading becomes the heading field, the first paragraph the lead (title) or nothing (statement); every other block is refused with the toast "Title slide holds a heading and a lead. Move or delete the other 3 blocks first" and no write happens. A refusal is a `RangeError` on every transport.
- Title or statement to content: the fields become blocks (an h1 heading with the mark block, or a big heading) in the target's first slot.
- To a picture kind: the deck's first asset of the roles is taken; the first heading becomes the plate's big heading, the first paragraph its paragraph, a credit is added with the asset's credit; other blocks are refused as above.
- From a picture kind: the plate's blocks fall into the target's slots; the picture is dropped (it stays in the deck's assets).

The Format options panel shows the layout name with a Change button instead of the read-only Kind line; the kind is no longer presented as fixed.

### 5.4 Themes panel

One card, General Translation, ink on paper, with a Light and Dark appearance segmented control that writes `deck.defaults.appearance` (section 7.6), the twin present mode and export use by default. A second theme is additive in `THEMES`; until one exists Import theme is disabled with the tooltip. Theme builder and Edit theme are later (section 2.3 and 2.6).

## 6. Root route, home page, trash, copy, import, download

### 6.1 The root route

`/` opens the editor on a fresh Untitled presentation: one title slide from the GT theme's `title` layout with empty texts, notes empty, in a section named Deck. The deck is not written to the store until the first write: the editor holds a local document at revision 0 with a reserved id `untitled-<base32 stamp>`, the save word reads Not saved yet, and the first mutation, rename or asset upload runs `deck.create` (`from: 'blank'`, name Untitled presentation) and then the write against revision 0. This keeps the shared store free of empty decks made by every visit and by crawlers (today production `/` opens a drive's test deck, R06 section 5; EDITOR-DEPTH-STATUS section 10), and it gives Google's experience of an editable slide on arrival (R03 finding 1). The `blank` template of `packages/store/src/templates.ts` changes its lead from the placeholder sentence to an empty Text and its default title to Untitled presentation. `/` carries `<meta name="robots" content="noindex">`.

### 6.2 The home page at /decks

Google's home in Google's order (R03 a.1): the app bar with the GT mark and the name Turboslide and a search field over titles; the heading Start a new presentation over a strip of cards: Blank (opens `/`), GT brand deck (`deck.create` from `gt-brand`, opens the editor), and the GT theme's 18 layouts are not shown here (they are slide layouts, not decks); then Recent presentations as a grid of 16:9 thumbnails (the render worker's capture of slide 1) with title and last edit, newest first, a grid and list toggle, and a per card menu with Open, Rename, Make a copy, Present, Move to trash, and, under Tools > Show advanced actions only, Download bundle and Export. Trashed decks are hidden. A Trash link at the bottom opens `/decks/trash`. The Connect card, the id and revision columns, the count and the footer leave to Extensions > Connect an agent.

Recent is ordered by this browser's own history first (a `localStorage` list of deck ids opened here, R10 C3 item 6), then by the store's `updatedAt`, so a rep sees their decks before other people's on a shared store without identity.

### 6.3 Trash

`deck.trash` sets `trashedAt` on the manifest (section 7.6) through the hosted collection; `/decks` and `/` skip trashed decks; `/decks/trash` lists them with Restore (`deck.restore`) and Delete forever (`deck.remove`, a confirmation dialog, then the store deletes the prefix or folder). Opening `/edit/<trashed>` shows the trashed banner with Restore, as Google's editor shows a trashed file notice (R01 File). The dozen test decks on production are moved to trash from the page and deleted forever from there.

### 6.4 Rename and make a copy

Rename is the title field and File > Rename (`deck.rename`). Make a copy is `deck.copy` (section 7.9): the store copies the manifest, the slides, the assets and, optionally, the versions under a new id, sets the title, drops notes when Remove speaker notes is ticked, keeps only the selected slides when `slideIds` is given (the sections keep those ids, empty sections dropped, an opener whose section vanishes becomes a mood slide is refused; the copy simply keeps whatever sections still hold a slide), and opens the copy in a new tab.

### 6.5 Share

The Share dialog holds Copy link (the view route `/deck/:id`, which now strips notes and skipped slides from its payload), Copy edit link (`/edit/:id`), Embed (the `/embed/:id` iframe snippet), and one sentence: "Anyone with a link can open it; this studio has no accounts yet." People, roles, General access and expiry wait for identity (R10 C4; SPEC open questions 1, 2, 3 and 7).

### 6.6 Import

File > Import slides (section 2.1) covers a deck on this studio and a bundle zip. A `.pptx` upload is refused with a message until the PPTX importer of section 7.10 exists; the bundle upload of `/decks` moves into this dialog's Upload tab and stays reachable from Extensions.

### 6.7 Download

File > Download in Google's order and labels (section 2.1). The download dialog is one card: the format list, an Options disclosure closed by default (Editable text instead of Perfect, Light or Dark or Both, Include skipped slides, Include speaker notes, Embed fonts), a progress line, and on completion the browser download plus the snackbar "Downloaded <file>". The export report card, Verify with LibreOffice, the fonts set, headings as raster and the raster scales leave to Tools > Show advanced actions.

## 7. Object model changes and their export paths

This is the section the rest of the proposal rests on. Every change is a field on the block document at `schemaVersion` 2, a mutation that already exists (`slide.set`, `block.set`, `block.insert`, `block.remove`, `deck.set`) or a new action, a renderer rule, a lint rule where the grammar wants one, and an export path in Perfect (flatten) and Editable text (native). Perfect never needs a new writer for a visual change: the page raster is whatever the renderer draws, and the invisible text layer is built from `data-run` elements, so a new object needs only to render its text through `data-run` to stay searchable. Editable text needs a writer rule per object, named below with the pptxgenjs option it uses (API pages read 2026-09-11, section 13).

### 7.1 Schema version 2 and the migration

`SCHEMA_VERSION` becomes 2 and `MIGRATIONS` gains one step, from 1 to 2, on both `deck` and `slide`:

1. Stamp `schemaVersion: 2`.
2. Rewrite every `box` block as a `shape` block of kind `rectangle` carrying the box's `text`, `typography`, `color`, `padding`, `radius`, `fill`, `stroke` and `strokeWidth` as `width` (0 joins `SHAPE_STROKE_WIDTHS`). The `box` type leaves the catalog, the Insert menu, `NATIVE_BLOCK_TYPES` and the renderer; the exporter's `SceneRect` role `box` is folded into `shape`. Two ways to write a rectangle with text become one.
3. Replace every Text equal to one of the fifteen `PLACEHOLDER` strings of `slide-templates.ts` with the empty string, so decks made from templates before this round show prompts instead of placeholder copy. The `isPlaceholderText` set moves into the migration file and stays frozen there.
4. Nothing else changes: every other field below is optional, so a version 1 deck migrates by the stamp alone, and the GT deck (no box blocks, no placeholder strings) renders byte for byte as before. `pnpm check` step 12 (compare to shoot, 0.5 percent) is the proof, and a new test asserts that `migrate` on the committed GT deck and template changes only `schemaVersion`.

The validator keeps its rules and gains: `pos.rotate` and `pos.flip` allowed only where `pos` is allowed (freeform), `group` allowed only on freeform, `table` at most 20 by 20 (issue `table_size`, severity 3), `plain.marker` any layout, `background` only on content slides (picture kinds have their picture), `skip` any slide, `guides` and `numbers` on the manifest.

### 7.2 Objects on the canvas

| Google object or property | Field or action | Renderer | Lint | Perfect PPTX | Editable text PPTX | Refused |
| --- | --- | --- | --- | --- | --- | --- |
| Text box | `text` block (exists) | `renderText` | existing | raster plus invisible runs | text box (exists) | |
| Shape with text | `shape` gains `text?`, `typography?`, `color?`, `padding?`; `box` folds into it (7.1) | the svg plus a text layer centred by default, `valign` top, middle, bottom | `type/*`, `color/off-palette` | raster plus runs | `addText` with the `shape` option (rect, roundRect, ellipse, or the preset below) and the text inside; `rectRadius` for rounded; fill and `line` | |
| More shapes | `SHAPE_KINDS` grows to 24: rectangle, rounded, ellipse, triangle, right-triangle, diamond, parallelogram, trapezoid, pentagon, hexagon, chevron, plus, right-arrow, left-arrow, up-arrow, down-arrow, left-right-arrow, wedge-rect-callout, wedge-round-callout, wedge-ellipse-callout, math-plus, math-minus, math-multiply, math-equal (Google's four categories, a subset each, R05 A5 and E1). A new `packages/schema/src/shapes.ts` holds, per kind, the SVG path generator on the half-pixel grid and the ECMA preset name (`prstGeom`) | inline svg from the table | `dia/stroke-grammar` extended to shapes | raster | `addText` or `addShape` with `pptx.ShapeType.<preset>`; a kind with no preset falls back to a raster and the report says so | the flowchart, star, banner and remaining shape families (later, additive rows in the same table); curve, polyline, scribble (no grammar) |
| Line, Arrow | `shape` line and arrow (exist); `dash?: 'solid' \| 'dash' \| 'dot'` added on shape and rule; `arrowheads` exists | `stroke-dasharray` | none | raster | native line with `dashType` (`solid`, `dash`, `sysDot`), `beginArrowType`, `endArrowType` `triangle` (exists) | ten Google arrow styles beyond triangle; connectors (later) |
| Border on any object | `stroke`, `width`, `dash` on shape, rule, table; `shot.border` becomes `stroke?` and `width?` | css border | `lines/law` unchanged | raster | `line: { color, width, dashType }` | border on grammar text blocks (headings and paragraphs keep the grammar) |
| Fill | `fill: Color` (exists on shape) | css | `color/off-palette` | raster | `fill: { color, transparency }` | gradients |
| Image | `shot` (exists); Upload from computer composes `asset.add` then `block.insert`; drop and paste on the stage do the same | exists | `asset/*` | raster | picture (exists) | Stock & web, Camera, adjustments, recolor |
| Crop | `shot.trim?: [left, top, right, bottom]` as fractions 0 to 1 of the source; `crop` anchor stays for decks that have it; Reset image deletes `trim` | `object-position` and a clip on the wrapper | `asset/stretched` unchanged | raster | `sizing: { type: 'crop', x, y, w, h }` computed from `trim` | mask image (later), negative offsets |
| Rotation | `pos.rotate?: number` in degrees, 0 to 359, freeform only; the Arrange items write 90 steps, the handle any degree, Option Left and Right 15, Option Shift Left and Right 1 | `transform: rotate()` on the `.free` wrapper, origin center | `freeform/rotated` severity 1 (the grammar has no rotation, like `layout/freeform`) | raster carries it; the invisible text box gets `rotate` so extraction keeps the box | `rotate` on text boxes, shapes and pictures (pptxgenjs, -360 to 360); the scene measurer reads the unrotated layout box from the wrapper's offset geometry and measures the text lines with the wrapper's transform switched off for the measurement (a class toggled inside `page.evaluate`), then records `rotate` per scene item | rotation on grammar layouts |
| Flip | `pos.flip?: 'h' \| 'v' \| 'hv'` on shape, icon, shot; the menu items are disabled on text-carrying blocks | `scaleX(-1)` and `scaleY(-1)` | none | raster | `flipH`, `flipV` on shapes and pictures | flipping text |
| Z order | exists | exists | none | raster | draw order | |
| Group | `group` block: `{ type: 'group'; children: Block[]; pos }` on freeform; children carry `pos` relative to the group box and any `rotate`; `block.group` (blockIds) builds it in one write and `block.ungroup` dissolves it; `locateBlock` in the reducer and `blockById` in the viewer recurse into groups so `block.set` reaches a child by its id; a double click enters the group | a `.free` wrapper holding the children at their relative boxes | `freeform/off-sheet` on the group box; `freeform/overlap` on children | raster plus runs | every child written as itself with one `group` key, and the existing `groupShapes` post-process wraps them in one `<p:grpSp>` (SPEC 8.2 does this for ruled rows already) | nested groups deeper than one level in this round (the validator refuses a group inside a group) |
| Duplicate object | `block.duplicate` (blockIds) copies with fresh ids and, on freeform, an 8 px offset | | | | | |
| Alt text | `alt?: string` on BlockBase for shape, icon, shot, chart, group (the asset keeps its own alt as today) | `aria-label` | `asset/*` | none | `altText` on pictures and shapes | |
| Link on an object | `link?: string \| { slide: SlideId \| 'next' \| 'previous' \| 'first' \| 'last' }` on BlockBase; a run link to a slide is `[text](#s/<slideId>)` in the four-rule markup | `<a>` wrapper active in present mode, inert in the editor | `copy/heading-is-name` unchanged | invisible run keeps `hyperlink` | `hyperlink: { url }` or `{ slide: n }` | |
| Word art | Insert > Word art writes a `text` block at ladder 88, weight 500, on a freeform slide | exists | `type/*` | raster plus runs | text box | glyph outlines, letter fill and border |
| Icon | exists | exists | `icon/*` | raster | raster (unchanged) | |

### 7.3 Text

| Google behaviour | Field or rule | Renderer | Lint | Perfect | Editable text | Refused |
| --- | --- | --- | --- | --- | --- | --- |
| Enter inserts a paragraph | `Text` allows `\n` as a paragraph separator on `paragraph`, `text`, `shape`, `credit` and the title slide's `lead`; `textSchema` drops the line break refinement for those pointers and keeps it for headings, keys, captions and labels (the catalog marks each Text pointer `multiline: true` or not); SPEC 4.2 is amended | `\n` becomes `<br>`; no paragraph spacing (the grammar has none) | none | raster plus runs, one hard break per browser line as today | one `softBreakBefore` per browser line as today; a paragraph break is a `breakLine` | paragraph spacing before and after |
| Shift Enter line break | The same `\n` (a paragraph and a line break render the same without paragraph spacing) | | | | | a distinct soft break token |
| Enter at the end of a list item adds an item; Enter twice leaves the list; Backspace on an empty item removes it | Editor gestures writing `block.set /items` on `plain`, `rows`, `refs` | exists | existing | | | |
| Bulleted and numbered lists | `plain.marker?: 'rule' \| 'bullet' \| 'number'` (default rule keeps every deck); `PlainItem.level?: 1 \| 2 \| 3` for Tab and Shift Tab | a glyph or a number in the key position, 24 px indent per level | `list/bullets` severity 1 (the grammar prefers ruled lists) | raster; the invisible run carries `bullet` so extraction shows it | `bullet: true` or `{ type: 'number' }`, `indentLevel` (pptxgenjs 1 to 32) | nine levels, custom glyphs, restart numbering (later) |
| Bold | exists (`*text*`, weight 500) | | `type/weight-cap` | | | |
| Italic, underline, strikethrough per run | none in this round | | | | | the grammar has no italic or underline and the export set has no italic cut (R09 finding 7); revisit with a font build |
| Text color, highlight | block level `color` only | | `color/semantic-icons-only` | | run color from the block | per run colour, highlight |
| Font | Inter | | | | | any other face |
| Font size | `typography.size` on the ladder; keys step it | | `type/ladder` | | | off ladder sizes without a finding |
| Alignment | `typography.align` left, center, right; `valign` on shape and table cells | | | | `align`, `valign` | justify |
| Line spacing | `typography.leading` steps | | | | `lineSpacing` in points (exists) | |
| Autofit: Do not autofit, Shrink text on overflow, Resize shape to fit text | `autofit?: 'none' \| 'shrink' \| 'grow'` on `text` and `shape` blocks under freeform; the editor applies it by writing explicit values after each commit: grow writes `pos.h` from the measured height (the default for a new text box, as Google since January 2021, R09 A5), shrink walks `typography.size` down the ladder until the measured text fits, none writes nothing and `freeform/overflow` (new, severity 2) reports the overflow | none (the document is always explicit) | `freeform/overflow` | | | a render-time autofit (the string renderer cannot measure) |
| Placeholder prompt text | An empty Text renders a prompt in the editor only (`live: true`): Click to add title for a heading or the title field, Click to add subtitle for a lead, Click to add text for anything else; thumbnails, present, embed and exports draw nothing; `derivedSlideTitle` falls back to Slide n | prompt in `--pt-titanium` with `data-prompt` | `copy/empty-placeholder` severity 2 (a shipped deck should not carry an empty heading) | nothing | nothing | a stored prompt string |
| Spelling | the browser's spell check stays on in the run; Tools > Spelling > Underline errors toggles it | | | | | grammar suggestions |
| Undo granularity | the `text.replace` mutation (declared, unimplemented) is implemented in `InlineText` with a 400 ms coalescing pause, so Cmd Z removes a burst of typing (SPEC 6.7) | | | | | |
| Escape | commits and keeps the text, then selects the block (R09 finding 2); a single click places the caret where it landed; a click on the selection frame's edge selects the block; double click selects a word | | | | | |
| Find and replace | `text.replaceAll` over every Text and note; Find is client side | | | | | regular expressions |
| Paint format, Clear formatting | editor compositions of `block.set` | | | | | |
| Speaker notes | `notes: string` stays plain; the pane under the canvas edits it | | | `addNotes` (exists) | `addNotes` | formatted notes |

### 7.4 Tables

A new `table` block (R11 C1):

```ts
type TableBlock = BlockBase & {
  type: 'table';
  columns: { width?: number; align?: 'left' | 'center' | 'right'; fill?: Color }[];
  rows: { cells: Text[]; header?: true; height?: number }[];
  valign?: 'top' | 'middle' | 'bottom';
  border?: { color?: Color; width?: 1 | 1.5 | 2; dash?: 'solid' | 'dash' | 'dot'; edges?: 'all' | 'rows' | 'outer' | 'none' };
  size?: 20 | 18 | 17 | 16 | 15;
};
```

Validator: at most 20 columns and 20 rows; every row has one cell per column. Renderer: a CSS grid in the `.rows` idiom (top hairline, a rule under every row, the header row in display weight 500 with an ink rule under it, `data-run` per cell, `text-align` per column, a plate fill per column). Insert: the grid picker writes the counts. Gestures: Tab and Shift Tab move between cells inside `InlineText` and commit on the way; Enter stays commit inside a cell (a Text in a cell is single line); the nine row and column commands on the right-click menu and under Format > Table each write one `block.set` of `/rows` or `/columns`; a column boundary handle writes `columns[i].width` with the same snaps as the key column; pasting tab separated text onto the stage creates an unlinked table. Lint: `table/size` severity 3 over the cap; `rows/two-lines` applies to cells. Perfect: raster plus the cells as invisible runs. Editable text: `addTable` with `colW` and `rowH` from the measured grid, per cell `align`, `valign`, `bold` for the header, `fill` per column, `border` `{ type, pt, color }` per the block's border, `fontFace` and `fontSize` from the export font map; the report lists the block as native. `rows` and `plain` keep their hairline plus text box export (SPEC 8.2); the new block is the one that becomes a PPTX table.

### 7.5 Charts

A new `chart` block (R11 C1, R07 rule 23):

```ts
type ChartBlock = BlockBase & {
  type: 'chart';
  kind: 'bar' | 'column' | 'line' | 'pie';
  categories: string[];
  series: { name: string; values: number[]; color?: Color }[];
  legend?: boolean;
  labels?: boolean;
  alt?: string;
};
```

Renderer: inline SVG through the diagram grammar (1 px strokes in ink or hair, fills ink and plate and the semantic hues when `color` names one, labels at 18 and 20 px, markers 11 px) in a `data-raster="chart"` root; the values are drawn as text with `data-run` so the numbers are searchable. Format options shows the data as a small grid (categories down, series across) with Add and Remove per row and column, the kind, legend and labels toggles and a colour per series; every edit is one `block.set`. Lint: `numbers/contradiction` reads the values; `chart/series-count` severity 2 over six series. Perfect: raster plus runs. Editable text: a raster PNG at 2x with `altText` carrying the series as JSON (the Slides API models Google's own chart as an image, R11 A10; a native `addChart` is a later option behind `--charts native`, where PowerPoint would draw the chart and the 3 px layout claim would not hold).

### 7.6 Slide and deck level fields

| Google behaviour | Field | Renderer and viewer | Lint | Perfect | Editable text |
| --- | --- | --- | --- | --- | --- |
| Skip slide | `Slide.skip?: true`; `slide.skip` action | filmstrip dimmed; present, view route, embed, thumbnails strip skip them from the play list | none | omitted unless `includeSkipped` | same |
| Change background | `ContentSlide.background?: { color: Color } \| { asset: AssetId; fit: 'cover'; position? }` | a layer under `.in` inside the frame; rails and crosses above it | `slide/background-off-theme` severity 1 when the colour is not paper or plate | raster | `slide.background = { color }` or `{ path }`; the frame stays on the master above it |
| Transition | `Slide.transition?: { type: 'none' \| 'fade' \| 'slide-right' \| 'slide-left'; speed?: 'slow' \| 'medium' \| 'fast' }`; Apply to all slides writes every slide in one `slide.update` list | present mode animates the change (140, 400, 700 ms), reduced motion off | none | the OOXML post-process writes `<p:transition>` with `<p:fade/>` or `<p:push dir="l"/>` and `spd` (pptxgenjs has no transition API on its pages) | same |
| Slide numbers | `Deck.numbers?: { on: boolean; skipTitle?: boolean }` (default on) | the frame's counter honours it | none | counter text box present or absent | same |
| Guides | `Deck.guides?: { x: number[]; y: number[] }` in sheet px | drawn in the editor only; `snapPosition` gains them | none | not exported | not exported |
| Appearance | `Deck.defaults.appearance?: 'light' \| 'dark'` | present mode and thumbnails default to it | none | the default theme of an export | same |
| Trash | `Deck.trashedAt?: isoDate` | hidden from the home page and `/` | none | | |
| Links to slides | see 7.2 | | | | |

### 7.7 Format options

The generated inspector becomes Format options with Google's section names and order (R05 B7): Size & rotation (W, H, Lock aspect ratio, Rotate), Position (X, Y from top left), Text fitting (Autofit, Padding), Borders & lines, Fill, Alt text, then the block's own properties under a heading with the block's plain name (Ruled rows, Chart data, Table). The Slide section shrinks to Layout with a Change button, Background, Transition and Skip; Notes leave for the pane; Id, Tags, Section, the JSON pointers in tooltips, the id rename field, the block list, Material, Dither, Lint, Versions, History and Deck tokens leave the default panel (Material and Dither stay for a material block or a two-tone asset, opened from Tools > Show advanced actions). The panel is 320 wide, opens on Format options, closes with its X, and one panel is open at a time.

### 7.8 Clipboard

Cut, Copy and Paste of blocks and slides use the system clipboard with a `text/plain` envelope `turboslide:v1:` followed by JSON `{ kind: 'blocks' | 'slides', deckId, items, assets }` where `assets` lists the referenced asset ids and their URLs on the source studio. Paste parses the envelope; blocks land on the current slide with fresh ids (`block.insert`, on freeform at the source `pos` or offset 8 px when the same slide), slides after the current one (`slide.insert` with fresh ids); assets missing in the target deck are added through `asset.add` from their URL before the insert. Plain text without the envelope pastes into the caret, or onto the canvas as a `text` block. Copying a slide between decks copies plainly; linked slides are omitted (R08 A25).

### 7.9 New actions

All in `packages/schema/src/actions.ts` with the usual fields; `A` is every transport unless stated. Every mutating action takes `baseRevision`.

| Action | Group | Input | What it writes | CLI | MCP |
| --- | --- | --- | --- | --- | --- |
| `slide.new` | slide | sectionId?, after?, layout (a layout id of 5.1), id? | one `slide.insert` built by the layout's `make` with empty texts | `turboslide slide new --layout <layout> --after <after>` | `deck_new_slide` |
| `slide.duplicate` | slide | slideIds[] | `slide.get` and `slide.insert` per id, fresh ids | `turboslide slide duplicate <slideIds>` | `deck_duplicate_slide` |
| `slide.skip` | slide | slideIds[], skip: boolean | `slide.set /skip` per id | `turboslide slide skip <slideIds> --off` | `deck_skip_slide` |
| `slide.applyLayout` | slide | slideId, layout | `slide.replace` with the converted slide (5.3); refuses when content would be lost | `turboslide slide apply-layout <slideId> <layout>` | `deck_apply_layout` |
| `slide.import` | slide | sourceDeckId, slideIds[], sectionId?, after? | `asset.set` for missing assets, then `slide.insert` per slide; server side (reads another deck) | `turboslide slide import <sourceDeckId> <slideIds> --after <after>` | `deck_import_slides` |
| `block.duplicate` | block | slideId, blockIds[] | `block.insert` copies with fresh ids | `turboslide block duplicate <slideId>#<blockIds>` | `deck_duplicate_block` |
| `block.group`, `block.ungroup` | block | slideId, blockIds[] or blockId | one `slide.update` list: removes the members and inserts the group, or the reverse | `turboslide block group <slideId> --blocks <ids>` | `deck_group_blocks` |
| `text.replaceAll` | slide | find, replace, matchCase?, slideIds? | `block.set` and `slide.set` per changed Text and note, one write | `turboslide text replace <find> <replace> --match-case` | `deck_replace_text` |
| `deck.list` | deck | includeTrashed? | none | `turboslide deck list` | `deck_list` |
| `deck.copy` | deck | id, name, slideIds?, removeNotes?, versions? | a new deck under a new id (store level) | `turboslide deck copy <id> --name <name>` | `deck_copy` |
| `deck.trash`, `deck.restore` | deck | id | `deck.set /trashedAt` | `turboslide deck trash <id>` | `deck_trash` |
| `deck.remove` | deck | id, confirm: true | deletes the folder or the prefix; http and cli with the bearer, window from the Trash view | `turboslide deck remove <id> --confirm` | none |
| `export.text` | export | slideIds?, notes? | none; returns the plain text | `turboslide export txt` | `deck_export_text` |
| `view.zoom` | view | zoom: number or 'fit' | none | none | `deck_set_view` |

Actions that exist and gain exposure: `block.order` (front and back), `diff.run` and `render.sheet` (editor handlers so the palette rows stop failing, R06 section 8), `export.run` (format pdf implemented, `includeSkipped`, `includeNotes`), `render.slide` (format jpg from the Download menu). The declared mutation `text.replace` is implemented in the reducer and used by `InlineText`. `pnpm generate:contracts` regenerates the CLI, MCP, OpenAPI, manifest and skill tables; the coverage test requires a test per action.

### 7.10 Import of PPTX

Later, designed now: `import.pptx` (cli, http with the bearer, the Upload tab) reads a `.pptx` with a small OOXML reader (jszip is already a dependency) and writes one freeform content slide per `p:sld`: every `p:sp` with `txBody` becomes a `text` or `shape` block (preset geometry mapped back through `shapes.ts`, else a rectangle with a `freeform/imported-geometry` finding), every `p:pic` a `shot` with its media added as an asset, every `a:tbl` a `table`, every `p:grpSp` a `group`, `a:xfrm` rotation and flips into `pos`, notes into `notes`, fonts other than Inter into a report line. The Perfect export of such a deck reproduces our rendering of it, which is the honest promise; nothing promises a round trip of the original file's pixels.

### 7.11 PDF

`packages/export/src/pdf/build.ts`: the render worker loads `renderStandalone` output of the deck (skipped slides removed unless asked, one appearance), adds a print stylesheet with `@page { size: 13.333in 7.5in; margin: 0 }` and one sheet per page, and calls `page.pdf()`; the report carries pages and bytes, and `--verify` rasterises the PDF with `pdftoppm` and diffs against the web render under the flatten budget. This is the "Book mode through Chromium print" the format's doc string names (`export.ts`), moved from M6 to this round because a PDF is the sales handoff after a call (R07 top tasks).

### 7.12 What is refused, with the reason

Audio and video (no media in the document, in present mode, in PPTX or PDF); object animations (no grammar, no export); curve, polyline and scribble lines (free paths have no grammar and no clean export); mask image, image adjustments, recolor, drop shadow and reflection (the deck's image treatment is the two-tone pipeline; Editable text cannot carry shadows within 3 px); italic, underline, strikethrough, superscript and subscript inside a run (grammar and export font set); per run colour and highlight (the grammar keeps semantic colour on icons); fonts other than Inter; justified text; page sizes other than 16:9 at 1600 by 900; ODP and SVG downloads; Stock & web and Camera image sources; roles, people, expiry and Request edit access in Share (no identity); comments' notifications and For you (no identity); live pointers, chat, Follow (no presence channel); Meet, Gemini, Explore, add-ons, Apps Script, Keep, Drive folders, email; Regroup; the Select none chord. Each refusal is a menu item that is absent (omit) or present and disabled with the tooltip (later), per the tables of section 2.

## 8. Keyboard shortcuts

Adopted from Google's shortcut page as R04 Part B prints it (Mac, then Windows and Chrome OS in brackets). "Ours today" names the binding that leaves.

| Google action | Key adopted | Ours today, and the conflict |
| --- | --- | --- |
| New slide | Ctrl M on every platform | none |
| Duplicate | Cmd D (Ctrl D) | none; SPEC 6.9 planned it |
| Undo, Redo | Cmd Z; Cmd Y or Cmd Shift Z (Ctrl Z; Ctrl Y or Ctrl Shift Z) | same |
| Cut, Copy, Paste, Paste without formatting | Cmd X, C, V, Shift V | none |
| Copy and paste formatting | Cmd Option C, Cmd Option V (Ctrl Alt C, V) | none |
| Insert or edit link; Open link | Cmd K; Option Enter (Ctrl K; Alt Enter) | Cmd K is the palette today; the palette moves to Option slash and Cmd K becomes Link |
| Delete | Delete or Backspace | Backspace pages backwards today; retired in the editor |
| Select all; Select none | Cmd A; menu only | none |
| Find; Find and replace; Find again; Find previous | Cmd F; Cmd Shift H (Ctrl H); Cmd G; Cmd Shift G | none |
| Open; Print; Save | Cmd O; Cmd P; Cmd S shows the snackbar "All changes saved" | Cmd S focuses the version note field today; Name current version moves to the File menu |
| Show shortcuts | Cmd slash (Ctrl slash) | Cmd slash toggles the source drawer today; the drawer moves to Cmd Option Shift P (Google's HTML view key) |
| Tool finder | Option slash (Alt slash or Alt Z) | Cmd K today |
| Compact mode (hide menus) | Cmd Shift F (Ctrl Shift F) | F toggles browser fullscreen today; retired in the editor |
| Alt text | Cmd Option Y (Ctrl Alt Y) | none |
| Filmstrip: previous, next, first, last | Up or Page Up, Down or Page Down, Home, End (Fn Left and Fn Right on Mac) | Right, Left, Space, J, K, L, H page today; they stay in present mode only |
| Filmstrip: move slide up, down, to beginning, to end | Cmd Up, Cmd Down, Cmd Shift Up, Cmd Shift Down | Alt Up and Alt Down today; retired |
| Filmstrip: extend selection | Shift Up, Shift Down, Shift Home, Shift End | none |
| Zoom in, out, 100 percent | Cmd plus, Cmd minus, Cmd 0 | none |
| Move to filmstrip, to canvas, open speaker notes | Cmd Option Shift F, C, S | none |
| Open animations panel | Cmd Option Shift B | Shift D toggles the twin today; retired to Tools |
| Revision history | Cmd Option Shift H | none |
| Present; from beginning; exit | Cmd Enter (Ctrl F5); Cmd Shift Enter; Escape | P today; retired |
| Objects: group, ungroup | Cmd Option G, Cmd Option Shift G | none |
| Objects: send backward, bring forward, to back, to front | Cmd Down, Cmd Up, Cmd Shift Down, Cmd Shift Up | Alt Up and Down, Cmd ] and Cmd [ today; Cmd ] and [ become indent |
| Objects: next, previous | Tab, Shift Tab | same |
| Objects: nudge, nudge larger | arrows, Shift arrows | same on freeform (1 px, 8 px); on a grammar slide the arrows no longer cycle blocks |
| Objects: rotate 1 degree, 15 degrees | Option Shift Left or Right; Option Left or Right | none |
| Objects: resize by keyboard | Cmd Ctrl B, I, J, K, W (Ctrl Alt B, I, J, K, W, 9) | none |
| Exit crop mode | Enter | none |
| Suppress guides; duplicate by drag; resize from center; constrain move; constrain aspect; constrain rotation | Cmd move; Option move; Option resize; Shift move; Shift resize; Shift rotate (Alt, Ctrl, Ctrl, Shift, Shift, Shift) | Shift resize exists |
| Text: bold, italic, underline, strikethrough | Cmd B; Cmd I; Cmd U; Cmd Shift X (Alt Shift 5) | Cmd B exists; the other three show the "Not yet" snackbar |
| Text: size up, down | Cmd Shift period, Cmd Shift comma | none |
| Text: align left, right, center, justify | Cmd Shift L, R, E, J | none; J shows the "Not in the GT theme" snackbar |
| Text: indent, outdent | Cmd ], Cmd [ | order today; rebound |
| Text: bulleted, numbered list | Cmd Shift 8, Cmd Shift 7 | none |
| Text: clear formatting | Cmd backslash (Ctrl backslash or Ctrl Space) | none |
| Text: move paragraph up, down | Option Shift Up, Down | none |
| Text: next, previous misspelling | Cmd apostrophe, Cmd semicolon | none |
| Context menu | Cmd Shift backslash or Shift F10 | none |
| Menus | Ctrl Option F, E, V, I, S, O, R, T, H (Alt F, E, V, I, O, T, H in Chrome) | none |
| Presenting: next, previous, go to n, first, last, notes, audience tools, laser, print, captions, full screen, black, white, stop | Right, Left, digits then Enter, Home, End, s, a (disabled), l, Cmd P, Cmd Shift C (disabled), Cmd Shift F (F11), b or period, w or comma, Escape | the bare letters live here only |

Bindings that leave the editor entirely: S and [ (filmstrip), D (appearance), E (edit mode), P (present), F (fullscreen), G (grid), B (book), J, K, L, H (paging), R, question mark, Cmd L (lint), Shift D (twin), Cmd slash (source), the digits then Enter buffer. The viewer route `/deck/:id` keeps its paging keys because it is a reading surface; the editor binds no bare letter, as Google (R06 finding 11). Escape inside a run commits (section 7.3).

## 9. Speaker notes and present mode

### 9.1 Notes

The pane sits under the canvas at the canvas width, 72 px by default, with the placeholder Click to add speaker notes, a drag handle (drag to resize, double click to toggle, drag to zero to hide), View > Show speaker notes and Cmd Option Shift S. Text is plain; Enter adds a line; edits write `slide.set /notes` after a 400 ms pause or on blur; the pane shows the deck default note in titanium when the slide has none. Notes leave the `/deck` and `/embed` payloads and the PDF, ride in PPTX by default (as Google's), and can be removed in Make a copy and Download.

### 9.2 Slideshow

The title row's Slideshow split button starts present mode from the current slide (Cmd Enter); its arrow lists Presenter view, Start from beginning (Cmd Shift Enter), Present on another screen (disabled, tooltip) and Presentation display options (disabled). Present mode is the sheet alone, black surround, click or Right to advance, Left back, digits then Enter, Home, End, Escape to stop; skipped slides are omitted; the appearance is the deck default with l toggling the laser dot, b and w blanking the screen, s opening the presenter window.

### 9.3 The present toolbar

Bottom left, shown when the pointer moves there, fading after 2 s (R04 A3): Previous, the slide number (a click opens the slide list with thumbnails), Next, Options. Options: Open speaker notes (opens the presenter window), Auto-play (submenu: every 1, 2, 3, 5, 10, 15, 30 seconds, 1 minute, Loop, Play or Pause), Turn on the laser pointer, Captions preferences (disabled), Enter or Exit full screen, Enable pen tool (later, disabled), More (Download as PDF, Download as PPTX, Print, Keyboard shortcuts), Stop presenting.

### 9.4 Presenter view

`/present/:deckId` as SPEC 6.10 designed it: a second window with a timer (Pause, Reset) top left, the current slide with a slide list dropdown, Previous and Next with the adjacent slides as thumbnails, the notes with plus and minus text size, and an Audience tools tab shown disabled with the tooltip. The two windows sync over `BroadcastChannel('turboslide:<deckId>')` with `localStorage` as the fallback; `view.goto` drives both, so `deck_goto_slide` from MCP moves the audience window. Presenting never touches the call: the presenter window is a plain browser window a rep shares in Meet or Zoom (R07 frustration "Presenting from the editor mutes the rep").

## 10. What the sales user sees, and ten tasks traced

### 10.1 First open

A rep opens `https://turboslide.vercel.app/`. The editor opens at once: title row with Untitled presentation, the menu bar, the toolbar, the filmstrip with one card, the canvas with the GT title slide showing the mark and two prompts, Click to add title and Click to add subtitle, the notes pane with Click to add speaker notes, and the right panel closed. The save word reads Not saved yet until the first keystroke, then Saving, then Saved. Nothing on the screen names a revision, a lease, a lint, a source or an agent.

### 10.2 The ten most frequent tasks (R07 top tasks), click by click

Counts are pointer presses (a double click is two) and key chords, typing excluded.

1. **Start a deck and name it.** Open `/` (0). Click the title Untitled presentation (1), type the name, Enter (1). Two interactions. Behind it: `deck.create` on the first keystroke, then `deck.rename`.
2. **Add a slide with a layout.** Click the New slide arrow (1), click Two columns in the grid (1). Or Ctrl M (1) for the same layout as the current slide. Behind it: `slide.new`.
3. **Retype the title.** Click inside the title text (1); the caret lands where the click was; Cmd A (1), type, Escape (1) keeps it and selects the box. Behind it: `slide.set /heading` or `block.set /text`, coalesced through `text.replace`.
4. **Add a bullet to the agenda.** Click at the end of the last item (1), Enter (1), type; Tab (1) nests it; Enter twice (2) leaves the list. Behind it: `block.set /items`.
5. **Swap the customer logo.** Drag the logo file from the desktop onto the existing image (1 drop). Behind it: `asset.add` then `block.set /asset`; the frame stays.
6. **Duplicate and reorder a slide.** Right-click the card (1), Duplicate slide (1), drag the copy up (1 drag). Behind it: `slide.duplicate`, `slide.move`.
7. **Hide the pricing slide for this prospect.** Right-click (1), Skip slide (1). The card dims; the slideshow, the PDF and the shared link omit it. Behind it: `slide.skip`.
8. **Rename the customer across the deck.** Cmd Shift H (1), type the old and new names, Replace all (1). Behind it: `text.replaceAll`.
9. **Present on a call with notes.** Click the Slideshow arrow (1), Presenter view (1); share the audience window in the call; the presenter window shows the notes, the timer and the next slide. Behind it: `view.present` and the BroadcastChannel.
10. **Send the deck.** File (1), Download (1), PDF Document (1); the file downloads and the snackbar confirms. Or Share (1), Copy link (1) for a view link without notes or skipped slides. Behind it: `export.run` format pdf; the view route.

Nothing in the ten passes through the right panel, the palette, a JSON view or a mode switch.

## 11. Ownership for the build round

Six builders, one integrator, one verifier. Every builder owns the files named and no others; a builder who needs a change outside their files asks the integrator. Acceptance is `pnpm check` green at the end of every builder's branch plus the checks named per builder. The order below is the dependency order: B1 lands first because every other builder types against schema version 2.

| Builder | Owns | Delivers | Acceptance |
| --- | --- | --- | --- |
| B1 Document | `packages/schema/src/**` (schema v2, `migrations.ts`, `shapes.ts`, `layouts.ts` moved from chrome, `reduce.ts` for groups and `text.replace`, `validate.ts`, `actions.ts`, `rules.json`), `packages/lint/src/**` (new rules), `apps/cli/src/commands/**` handlers, `packages/agent/generated/**` through `pnpm generate:contracts`, `packages/mcp` | The fields of section 7, the migration, the actions of 7.9, the lint rules `list/bullets`, `freeform/rotated`, `freeform/overflow`, `copy/empty-placeholder`, `table/size`, `slide/background-off-theme`, `chart/series-count` | `pnpm test` in schema, lint, cli; the migration test on the GT deck changes only `schemaVersion`; the coverage test names every new action; `pnpm generate:contracts` diff empty; the GT deck lints with no new severity 3 |
| B2 Renderer and export | `packages/render/src/**`, `packages/export/src/**` (scene measurer for rotation, tables, groups; pptx writers for shapes, tables, dashes, rotation, flip, links, background, bullets; the OOXML transition post-process; `pdf/build.ts`; `export.text`), `packages/theme/src/gt-ink-paper/sheet.css` additions, `apps/render-worker` for PDF | Rendering of every section 7 object with `data-run` text, prompts in live mode, both PPTX paths, PDF and TXT | render snapshots per new block in both themes; `pnpm check` step 12 (compare to shoot) at or under 0.5 percent worst; an export fixture deck with one of every new object exported in both modes, `turboslide export check` valid, `--verify` inside the 3 px native budget for text boxes, tables and shapes and the 0.1 percent flatten budget; the PDF verified by `pdftoppm` diff |
| B3 Chrome shell | `packages/chrome/src/**` except Sidebar, Palette data and the inspector generator's kinds: title row, `MenuBar.tsx`, `Toolbar.tsx` with the contextual tails, `FormatOptions.tsx` (the inspector regrouped), `ThemesPanel.tsx`, `MotionPanel.tsx`, `VersionHistoryPanel.tsx`, dialogs (Open, Import slides, Make a copy, Share, Download, Background, Slide numbers, Page setup, Details, Find and replace, Name version), `Snackbar.tsx` (5 s, Undo), `HelpCard.tsx` from the section 8 table, `useShellKeys.ts` editor map, `ContextMenu.tsx` shared by filmstrip and canvas | Sections 1, 2, 3, 8 | chrome lint (`pnpm check` step 18) 0 findings at 1440, 1280 and 390 in both themes; the tooltip audit 0 missing and 0 tooltips containing an action id or a JSON pointer in the default view; a menu test asserting every Google item of section 2 is present, disabled or documented as omitted; keyboard tests for the section 8 map |
| B4 Stage and text | `packages/viewer/src/**`: `Editor.tsx` (single click caret, border selection, draw tools, rotation handle, group entry, clipboard, paint format), `InlineText.tsx` (Escape commits, paragraph breaks, Tab between cells, list keys, `text.replace` coalescing, spell check), `Gestures.tsx`, `Freeform.tsx` (autofit writes), `Guides.tsx` (user guides), a `NotesPane.tsx` | Sections 7.2, 7.3, 7.4 gestures, 9.1 | `inline-text.test.ts` extended for breaks, Escape, Tab; `editor.spec.ts` drives the ten tasks of 10.2 and asserts the write count per task; an undo spec asserting one Cmd Z removes one typing burst |
| B5 Filmstrip, home and store | `packages/chrome/src/Sidebar.tsx` and its menu, `GridView.tsx`, `apps/studio/src/routes/{index,decks.index,decks.trash}.tsx`, `apps/studio/src/server/{decks,write}.ts` (`deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `deck.list`, `slide.import`, lazy create on `/`), `packages/store/src/**` (`trashedAt`, copy, remove) | Sections 4, 6 | `deck-transfer.spec.ts` and a new `home.spec.ts`: `/` opens an untitled editor without writing to the store, the first keystroke creates the deck, trash hides and restores, copy with selected slides and removed notes, import slides copies assets; store tests on file, tmp and blob backends |
| B6 Present | `apps/studio/src/routes/present.$deckId.tsx`, `apps/studio/src/components/DeckViewer.tsx` (present toolbar, skip, appearance default), `apps/studio/src/server/decks.ts` `getDeck` (strip notes and skipped slides from view and embed payloads), the Slideshow split button's actions | Section 9, the skip and notes exclusions | `viewer.spec.ts` extended: skipped slides absent from `/deck?present=1` and `/embed`, notes absent from both payloads, the toolbar appears on hover, the presenter window syncs a `view.goto` |
| Integrator | `apps/studio/src/routes/edit.$deckId.tsx` (the `on(...)` table for every new action, the panels, the menus), `apps/studio/src/server/actions.ts`, `AGENTS.md`, `docs/README.md`, `docs/spec/SPEC.md` amendments (4.2 text breaks, 6.4, 6.9, 8.2), this folder's status document | One editor that wires B1 to B6 | the four e2e suites green against `vite preview`; the parity chain of AGENTS.md walked for every new action; skills regenerated |
| Verifier | reads everything, writes `docs/gslides-parity/GSLIDES-PARITY-STATUS.md` | The record | `pnpm check` 19 steps on the final tree with numbers; the tooltip audit; a preview deploy driven through the ten tasks of 10.2 with screenshots; one Perfect and one Editable text export of a fixture deck with every new object, checked with `turboslide export check` and opened in LibreOffice; the GT deck's compare-to-shoot unchanged; the production `/` opening an untitled editor after the push and the test decks in trash |

Sequence: B1 first (two days of the round), then B2 and B4 in parallel against the new schema, B3, B5 and B6 in parallel against B1's actions with the editor handlers stubbed, the integrator wiring as branches land, the verifier last. The GT deck's compare-to-shoot gate runs on every branch, because it is the one measurement that says the migration and the renderer changes touched nothing they should not have.

## 12. Risks

1. **The schema bump touches every file.** `schemaVersion` is a literal in every slide and manifest; the migration is a stamp for the GT deck but every deck on the Blob store is rewritten on its next save, and a client at version 1 reading a version 2 file sees the `ahead` issue and refuses to write. Mitigation: deploy the schema before the chrome, keep the migration purely additive apart from the two rewrites of 7.1, and test the migration on every deck in the store from the CLI before the push.
2. **Rotation breaks the measurer's assumptions.** The scene measurer reads `getBoundingClientRect` and `Range.getClientRects`, which return rotated quads for rotated elements. The design switches the transform off during measurement; if a viewer draws a rotated text box differently from Chromium (PowerPoint's own rotation origin and text inset), the 3 px native claim will not hold for rotated text, and the verify loop must report it per block rather than fail the file.
3. **Tables and charts are the biggest new writers.** `addTable` has its own row height rules, and LibreOffice and PowerPoint size table rows by content, so measured row heights will drift; the budget for tables should be stated per cell text box and verified before the claim is made. Charts are rasters by design, which sales users will accept (Google's are images too) but a reviewer opening the PPTX cannot edit the numbers.
4. **Freeform becomes the default for drawing.** Every Google drawing gesture lands on a freeform slide, and reps who draw on a grammar slide will see the slot behaviour instead. The toast and the Blank layout name the way out, and the grammar layouts keep their guarantee, but the round should measure how often the toast fires in the drive.
5. **Lazy creation on `/` and the shared store.** An editor holding an unsaved document must survive a reload (a `localStorage` draft) and must create the deck exactly once when two tabs race. Without identity the store still shows every rep every deck; the browser-local Recent list softens it but does not fix it. Identity remains SPEC open questions 1, 2, 3 and 7.
6. **Keyboard retirement surprises today's users.** Kevin and the agents use S, D, E, P, F, G and Cmd K daily; they move to menus and to the viewer route. The help card and a one-time snackbar on the first press of a retired key ("S now hides the filmstrip from the View menu") reduce the cost.
7. **The export function limit.** A Perfect export of 85 slides takes 190 to 222 s inside a 300 s function (EDITOR-DEPTH-STATUS section 10); adding a PDF path and tables does not change that, but a rep exporting a large deck from the menu can still hit the limit, and the worker service of `docs/hosting.md` section 8 stays the fix. The download dialog must show progress and never a silent failure.
8. **Escape commits.** Reversing today's Escape from discard to commit changes muscle memory for the agents' drives and one e2e spec; it is the right change for reps (R09 finding 2) and must be stated in AGENTS.md.
9. **Skipped slides excluded from shared links.** This is stricter than Google; a manager expecting Google's behaviour (skipped slides visible to collaborators in the editor) still sees them in `/edit`, and only the view route hides them. The Share dialog says so.
10. **Scope.** Section 2 marks 31 items later and 38 omit; the now list is still the largest round the repo has had. The dependency order of section 11 and the per-builder acceptance are the controls; if the round slips, the integrator ships B1, B2 and B4 (document, export, text) first, because they carry the truth every other builder reads.

## 13. Sources

Repository files at commit `8c7056c`, read 2026-09-11: `docs/gslides-parity/research/01-menu-bar.md` (R01), `02-editor-surface.md` (R02), `03-home-themes-layouts-io.md` (R03), `04-present-and-shortcuts.md` (R04), `05-objects-and-format-options.md` (R05), `06-turboslide-inventory.md` (R06), `07-sales-users.md` (R07), `08-context-menus-and-menu-conventions.md` (R08), `09-canvas-text-editing-model.md` (R09), `10-identity-sharing-and-presence.md` (R10), `11-tables-charts-and-numbers.md` (R11); `docs/spec/SPEC.md`; `docs/EDITOR-DEPTH-STATUS.md`; `docs/freeform.md`; `docs/pptx.md` (sections The two modes, The raster policy, Slide names and titles, The OOXML post-process); `docs/deck-transfer.md` (sections 1 to 3); `docs/hosting.md` section 8; `AGENTS.md`; `packages/schema/src/actions.ts`, `deck.ts`, `blocks.ts` (lines 1 to 240), `mutations.ts`, `position.ts`, `export.ts`, `migrations.ts`, `catalog.ts` (lines 536 to 703), `text.ts` (head), `freeform.ts` (head), `validate.ts` (grep), `ext.ts`, `assets.ts` (head), `rules.json`; `packages/render/src/slide.ts` (lines 355 to 400); `packages/export/src/scene/types.ts`, `scene/measure.ts` (head and greps), `pptx/build.ts` (head), `pptx/text.ts` (head and greps), `pptx/lines.ts` (head), `pptx/notes.ts`, `pptx/images.ts` (grep); `packages/store/src/templates.ts`; `apps/studio/src/routes/index.tsx`; `decks/templates/gt-brand/template.json`; `packages/chrome/src/slide-templates.ts` (lines 1 to 120); directory listings and line counts of `packages/chrome/src`, `packages/viewer/src`, `packages/lint/src`, `apps/studio/e2e`, `apps/cli/src/commands`, `apps/cli/e2e`.

Public pages read for this proposal on 2026-09-11:

- pptxgenjs, Shapes API (rotate -360 to 360, flipH, flipV, rectRadius, line, fill, hyperlink, shadow): https://gitbrent.github.io/PptxGenJS/docs/api-shapes.html
- pptxgenjs, Images API (rotate 0 to 359, flipH, flipV, sizing crop, contain, cover, transparency, hyperlink, altText): https://gitbrent.github.io/PptxGenJS/docs/api-images.html
- pptxgenjs, Tables API (addTable with colW, rowH, border, fill, align, valign, margin, autoPage; per cell colspan, rowspan, fill, border, align, valign, bold, color, fontFace, fontSize): https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
- pptxgenjs, Text API (bullet true or type number or code, indentLevel 1 to 32, breakLine, softBreakBefore, paraSpaceBefore and After, lineSpacing, lineSpacingMultiple, italic, underline, strike, rotate 0 to 360, fit none, shrink, resize, hyperlink): https://gitbrent.github.io/PptxGenJS/docs/api-text.html

Google Slides facts are taken from the research reports named at each use; the pages those reports read on 2026-09-11 and that this proposal leans on most, listed here for the reader and not re-fetched for this document: Keyboard shortcuts for Google Slides, https://support.google.com/docs/answer/1696717 (R04 Part B, section 8 here); Add, delete and organize slides, https://support.google.com/docs/answer/1694830 (R02 section 5, R08 A1; sections 4 and 5.2 here); Use a template or change the theme, background, or layout, https://support.google.com/docs/answer/1705254 (R03 b; section 5 here); Present slides, https://support.google.com/docs/answer/1696787 (R04 Part A; section 9 here); Insert and arrange text, shapes, diagrams, and lines, https://support.google.com/docs/answer/1696521 (R05 Part A and C; section 7 here); Add and edit tables, https://support.google.com/docs/answer/1696711 (R11 Part A; section 7.4 here); Change how text fits in placeholders and text boxes, https://support.google.com/docs/answer/10364036 (R09 A5; autofit in 7.3 here); Apps Script PredefinedLayout, https://developers.google.com/apps-script/reference/slides/predefined-layout (R03 b.2; the eleven layout names in 5.1 here); Apps Script ShapeType, https://developers.google.com/apps-script/reference/slides/shape-type (R05 E1; the shape kinds in 7.2 here); Slides API text concepts, https://developers.google.com/workspace/slides/api/concepts/text (R09 A15; paragraph breaks in 7.3 here); Menu and toolbar updates in Google Docs editors, 2018-03-07, https://workspaceupdates.googleblog.com/2018/03/menu-and-toolbar-updates-in-google-docs.html (R01; the menu groupings in section 2 here); Computerworld, Google Slides cheat sheet, https://www.computerworld.com/article/1658651/how-to-use-google-slides.html and BrightCarbon, Google Slides: the ultimate guide, https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ (R01, R02, R07; the menu bar order and toolbar order in sections 1 to 3 here).

Claims in this proposal that rest on an unverified Google detail carry the report's own grading: the exact filmstrip right-click order (R08 A1, one 2017 source), whether the Themes panel opens on a new presentation (R02 section 13; this proposal keeps the panel closed), Tab between table cells (R11 A2; this proposal binds it because every office table does), Shift Enter as a soft break (R09 unverified item 1; this proposal renders it as the same break), and the present-mode auto-play interval list (R04 unverified item 3).
