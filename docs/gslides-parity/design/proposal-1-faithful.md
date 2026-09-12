# Proposal 1: the faithful clone

Design proposal for the Google Slides parity round of Turboslide, written 2026-09-11 against commit `8c7056c` (main, after the editor depth round). This is designer 1 of 3, the faithful angle: start from Google Slides and reproduce its structure, labels, positions, menus, shortcuts and behaviours as exactly as the Prototemplate language allows. Every Google item gets a home in our chrome; our extras (materials, dither, the agent surfaces) fold into Google's menus instead of adding chrome of their own. Where the block document cannot carry a Google behaviour, the section says so and names the bend.

Kevin's directive, verbatim: "so i think when we land here we should be on a new slide, but its a template with repeated kind of slide templates you can use. but otherwise it has all the features and exact behaviors of google slides...literally search up and research everything google slidees offers and positioning of tabs to import stuff and do stuff and mimic it perfectly.then clean up our interface and make it so much easier to use, remember this is actually going to be used by majority sales in our org".

Decisions already taken by Kevin and honoured here without reopening: the root address opens a fresh presentation titled Untitled presentation with one title slide from the GT template as its theme; New slide and Apply layout offer that theme's slide layouts; the GT brand deck stays a deck to open and present; the editor mirrors Google Slides' structure (title row, the ten menus, the toolbar order, filmstrip left, canvas, speaker notes below, right panel for Themes and Format options, Slideshow and Share top right) and its behaviours and shortcuts; the audience is non-technical sales people; the visual language stays Prototemplate (Inter, monochrome paper and ink, hairlines, the `--pt-` tokens, Heroicons 20 solid); the block document, the grammar linter, the actions table and the perfect PPTX export stay the foundation; agent-facing surfaces leave the default view; a deck can be moved to trash from the UI.

## How to read this proposal

- Every Google fact comes from the eleven research reports in `docs/gslides-parity/research/` (cited as R01 to R11 with a section), which were built on 2026-09-11 from public Google help pages, Workspace Updates posts, the Slides API references and third party walkthroughs without signing in. The Sources section at the end reproduces the Google URLs this proposal leans on with that read date. Where a report marks a fact unverified, this proposal says so at the point of use and takes the reports' best reconstruction.
- Every Turboslide fact comes from the code at `8c7056c` (R06 is the inventory) or from `docs/spec/SPEC.md`, `docs/EDITOR-DEPTH-STATUS.md` and `docs/freeform.md`, read for this proposal. `packages/schema/src/actions.ts` holds 54 action ids (the round brief says 62; the file is the authority).
- Status words: "ship now" means this round; "ship later" means the item is present in the menu, disabled, with a tooltip that says it is not available yet; "omit" means the item does not appear, with the reason. Google's labels are used exactly, in sentence case, and Google's icons and artwork are never copied.
- Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings.

## 1. Screen anatomy

The editor at 1440 by 900, light chrome, nothing selected, a new presentation open. Sizes are chrome pixels. Google publishes no pixel sizes; R02 section 11 estimates the three top rows at roughly 40, 24 and 40 px from the CustomGuide screenshot, and the filmstrip at a fifth of the width. The values below are those estimates rounded to the chrome's 4 px rhythm and to Prototemplate's 32 px control height.

```
1440 x 900
+--------------------------------------------------------------------------------------------------------+
| [GT] Untitled presentation  [star]                          [cloud Saved] [Slideshow v] [ Share ]      |  title row 44
| File  Edit  View  Insert  Format  Slide  Arrange  Tools  Extensions  Help                        [^]  |  menu bar 28
| [search] [+ v] [undo] [redo] [print] [paint] [Fit v] | [select] [T] [image v] [shape v] [line v]       |  toolbar 40
|          [comment] | [Background] [Layout v] [Theme] [Transition]                                       |  (one row at 1440;
+---------------+--------------------------------------------------------------+-----------------------+   two rows under 1100)
|  1 [========] |                                                              | Themes             x  |
|    [thumb   ] |        +------------------------------------------+          |                       |
|               |        |                                          |          | In this presentation  |
|               |        |     sheet 1600 x 900 scaled to fit       |          |  [GT ink and paper]   |
|  filmstrip    |        |     k = (stage width - 56) / 1600        |          |  [light] [dark]       |
|  256          |        |                                          |          |                       |
|  gutter 32    |        +------------------------------------------+          | right panel 320       |
|  card 200x113 |                                                              | (Themes, Format       |
|  row 128      +--------------------------------------------------------------+  options, Version     |
|               |  . . .                                                       |  history, Building    |
|               |  Click to add speaker notes                        notes 56  |  blocks; one at a     |
|               |                                                              |  time, closed by      |
+---------------+--------------------------------------------------------------+  default)             |
| [filmstrip] [grid]                                  bottom bar 32                        [panel >]    |
+--------------------------------------------------------------------------------------------------------+
```

Regions and their owners in the chrome package:

| Region | Size | Contents | Today at 8c7056c |
| --- | --- | --- | --- |
| Title row | 44 px | Left: the GT mark as the home link to `/decks`, the presentation title as an inline field (click to rename, Enter commits, Escape restores), a star (ship later, disabled: no per person starring without identity). Right: a cloud icon with the save word (Saved, Saving, Offline; hover shows "All changes saved"; click opens Version history), the Slideshow split button, the Share button. Collaborator chips appear left of Share when the lease list holds another label (R10 section C3). | Absent. The deck name sits in the toolbar's status slot (`DeckName.tsx`), the status chip prints `Saved · r412` (`StatusChip.tsx`). |
| Menu bar | 28 px | File, Edit, View, Insert, Format, Slide, Arrange, Tools, Extensions, Help, left aligned, 13 px Inter, 12 px horizontal padding per title; a "Hide the menus" chevron at the far right (Ctrl+Shift+F). Menus open on click, switch on hover while one is open, walk with Left and Right, items carry a Heroicon on the left and the shortcut on the right, disabled items stay visible and greyed (R01 "How menus behave", R08 Part B). | Absent. |
| Toolbar | 40 px | Google's order, section 3. Controls are 32 px `ToolButton`s on a 40 px row with 4 px vertical padding; dividers are 1 px `--pt-hair` 20 px tall. The tail collapses into a "More" button under 1100 px; under 900 px the bar wraps to two rows and the filmstrip becomes the overlay it is today. | One 52 px row with Edit and View, Twin, Lint, Source, Search, Present, Presentation, Export (`Toolbar.tsx`). |
| Filmstrip | 256 px wide | A flat list of 16:9 cards, 128 px per row: a 32 px number gutter in tabular figures, a 200 by 113 thumbnail in a `--pt-edge` frame, the current slide framed in `--pt-ink` 2 px; a skipped slide at 45 percent opacity with an eye-slash icon in its gutter; section boundaries in the GT brand deck read as a 16 px gap with the section name in 11 px titanium above the opener and are not interactive. Multi-select with Shift and Cmd; drag to reorder; right-click for the menu of section 4. | `Sidebar.tsx` with a 52 px head (mark, Turboslide, density Seg), a 40 px filter row, sticky section headers, kind glyphs, lint badges, lease dots and a row menu. |
| Canvas | the rest | The stage with the sheet scaled to fit (`Fit` default), rulers off, guides off, the selection frame with eight square handles and one rotation handle above the top middle, red alignment lines while dragging (Google's colour; ours stays `--pt-ink` at 1 px because the chrome has no red), the marquee on empty sheet. | `Stage.tsx`, `Editor.tsx`, `Overlay.tsx`; no rotation handle; guides are titanium. |
| Speaker notes | 56 px default, drag to 0 or up to 40 percent of the canvas | Full canvas width, placeholder "Click to add speaker notes", a three dot drag handle on the divider, double click on the handle toggles between 56 px and the last dragged height, View > Show speaker notes toggles it, Cmd+Option+Shift+S focuses it. Plain text this round (section 9). | Absent. Notes are a textarea in the inspector's Slide section (R06 row 99). |
| Right panel | 320 px | One slot, closed by default. Themes (from the Theme button, Slide > Change theme, or automatically on a new presentation), Format options (from the toolbar, Format menu or right click), Version history (from the cloud icon or File), Building blocks and Templates (from Insert), Motion (ship later), Comments (ship later). An X at the top closes it and the control that opened it releases. | The inspector at 460 px docked while editing (`Inspector.tsx`), History, Versions and Lint panels, the source drawer over the stage. |
| Bottom bar | 32 px | Left: the filmstrip view and grid view toggle (two `ToolButton`s). Right: the "Show side panel" chevron that reopens the last right panel. Nothing else. | The 2 px progress line under the stage; the mode Seg Slide, Grid, Book in the toolbar. |
| Compact mode | Ctrl+Shift+F | Hides the menu bar and toolbar; the title row stays with a "Show the menus" chevron at its right. | Absent. |

Lines follow the chrome line law (SPEC 2.2): the title row draws its bottom edge in `--pt-hair`; the menu bar draws none (the toolbar's bottom edge is the second rule); the filmstrip draws its right edge; the right panel its left edge; the notes pane its top edge in `--pt-hair-soft`; the bottom bar its top edge in `--pt-hair`. Three horizontal rules stack at the top (title, toolbar, and the stage mat), which `turboslide lint --chrome` allows because none is doubled within 4 px.

Sizes the round changes in `tokens.css`: `--pt-bar-h` 52 becomes three tokens `--pt-title-h: 44px`, `--pt-menu-h: 28px`, `--pt-tool-h: 40px`; `--pt-panel-w` 460 becomes 320, and the inspector's typography composite reflows to two rows at that width; `--pt-sb-w` stays 256 with the number gutter inside it; `--pt-notes-h: 56px` and `--pt-status-h: 32px` are new.

## 2. The menu bar

Every Google item from R01, mapped. Shortcuts are Mac first, Windows in brackets, from Google's shortcut page (R04 Part B). The action column names the id in `packages/schema/src/actions.ts` or a new id this round adds (marked new). The menu model is data (`packages/chrome/src/menus/model.ts`), and the tool finder, the shortcuts dialog and a test that every row below is present are generated from it.

### 2.1 File

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| New > Presentation | Opens `/edit/new` in a new tab (section 6) | ship now | Google's New submenu lists the other editors' file types; we list Presentation and From template gallery only. |
| New > From template gallery | Opens `/decks#templates` | ship now | The gallery is the template strip on the home page. |
| Open... (Cmd+O, Ctrl+O) | "Open a presentation" dialog: a list of decks in this studio with a search field, tabs Recent and All, an Upload tab for a deck bundle, and Open | ship now | Backed by `listDecks` and the bundle route. |
| Import slides | Two step dialog: step 1 Presentations tab (decks here) and Upload tab (bundle zip; .pptx ship later); step 2 thumbnails with All, None, Back, a count, and Import slides | ship now for decks and bundles; PPTX later | New action `slide.import` (copies slides and their assets from a source deck). "Keep original theme" is omitted: there is one theme. |
| Make a copy > Entire presentation | Dialog: Name (defaults to "Copy of <title>"), "Remove speaker notes", Make a copy; opens the copy in a new tab | ship now | New action `deck.copy`. "Share it with the same people" and "Copy comments" are omitted (no sharing model, no comments yet). |
| Make a copy > Selected slides | Same dialog over the filmstrip selection | ship now | `deck.copy` with `slideIds`. |
| Share > Share with others | The Share dialog (section 6) | ship now | Same as the Share button. |
| Share > Publish to the web | Dialog with Link and Embed tabs over `/embed/:id`: Auto-advance slides (1, 2, 3, 5, 10, 15, 30, 60 seconds), "Start slideshow as soon as the player loads", "Restart the slideshow after the last slide", Slide size (Small, Medium, Large, Custom) on Embed, Publish, and "Published content & settings" with Stop publishing | ship now | Publishing pins the embed to a named version; Stop publishing rotates the view token (R10 section C3 item 6). |
| Email > Email this file, Email collaborators | none | omit | No mail service and no identity. |
| Download > Microsoft PowerPoint (.pptx) | Runs `export.run` Perfect and downloads; a small "Options" disclosure in the download toast opens the old export card (Perfect or Editable text, Light or Dark, fonts) | ship now | Perfect is the default per Kevin's foundation decision; the card is the advanced view. |
| Download > ODP Document (.odp) | none | omit | No ODP writer and no sales demand. |
| Download > PDF Document (.pdf) | Chromium print of the print route on the render worker | ship later | `ExportFormat` names `pdf` and no builder exists (R11 B4). |
| Download > Plain Text (.txt) | Slide texts and notes in reading order | ship now | New format in `download.ts` built from `blockTexts` and `slideTexts`. |
| Download > JPEG image (.jpg, current slide) | `render.slide` at 2x as JPEG | ship now | The render route already answers PNG; JPEG is a sharp encode. |
| Download > PNG image (.png, current slide) | `render.slide` at 2x | ship now | |
| Download > Scalable Vector Graphics (.svg, current slide) | none | omit | Slides are HTML, and an SVG export would be a raster in a wrapper. |
| Download > Web page (.html) | `build.run` (the standalone file) | ship now | Our extra, under Google's Download submenu, labelled the way Docs labels its HTML download. |
| Rename | Focuses the title field | ship now | `deck.rename`. |
| Move | none | omit | No folders. |
| Add shortcut to Drive | none | omit | No Drive. |
| Move to trash | Moves the deck to trash at once and shows the trashed notice with Restore and "Go to home" | ship now | New actions `deck.trash`, `deck.restore`, `deck.remove` (section 6). |
| Version history > Name current version | Small dialog: Name, Save | ship now | `version.save`. |
| Version history > See version history (Cmd+Option+Shift+H) | Right panel: versions grouped by day with the author label, "Only show named versions", "Show changes" (a per record diff coloured by author label), Restore this version, per version More (Name this version, Make a copy) | ship now | `version.list`, `version.restore`, `diff.run` for Show changes; the HistoryPanel's "Undo to here" moves to Tools > Agent. |
| Approvals | none | omit | Workspace only. |
| Make available offline | none | omit | The standalone Web page download is the offline copy; the tooltip on Download says so. |
| Details | Dialog: title, slides, sections, created, updated, revision, id | ship now | `deck.info`; this is where the revision number now lives. |
| Language | none | omit | English only; spell check follows the browser. |
| Page setup | Dialog with the drop-down showing Widescreen (16:9) selected and the other three options disabled with the note "The GT theme is 16:9" | ship later | The sheet is 1600 by 900; 4:3 and 16:10 need a renderer resize path that does not exist (R03 finding 11). |
| Print settings and preview | none | ship later | Arrives with the PDF builder. |
| Print (Cmd+P, Ctrl+P) | Opens `/print/:id` (one slide per page, skipped slides excluded) and calls `window.print()` | ship now | A basic browser print; the preview toolbar is later. |

### 2.2 Edit

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| Undo (Cmd+Z) | The client history's inverse write | ship now | Exists on the key; gains the menu item and the toolbar button. |
| Redo (Cmd+Y, Cmd+Shift+Z) | Same | ship now | |
| Cut, Copy, Paste (Cmd+X, C, V) | A clipboard for slides and blocks: JSON on the system clipboard as `text/plain` with a Turboslide prefix plus an in memory copy; Paste inserts slides after the selected thumbnail or blocks onto the current slide at the same coordinates (offset 16 px when the source is the same slide); an image or plain text on the clipboard becomes a picture or a text box | ship now | Composed from `slide.get`, `slide.insert`, `slide.remove`, `block.insert`, `block.remove`; pasting between decks copies the assets through `slide.import`. |
| Paste without formatting (Cmd+Shift+V) | Plain text into the caret | ship now | Today's paste behaviour. |
| Delete | Removes the selected slide or blocks with no confirmation | ship now | `slide.remove`, `block.remove`. |
| Duplicate (Cmd+D) | Duplicates the selected slides or blocks | ship now | New actions `slide.duplicate` and `block.duplicate` (today Duplicate is a composition in the row menu, R08 C7). |
| Select all (Cmd+A) | Every block on the slide, or every slide when the filmstrip has focus, or the text when the caret is in text | ship now | |
| Select none | Clears the selection | ship now | Google's chord (Ctrl+Cmd, then u, then a) is bound too. |
| Find and replace (Cmd+Shift+H, Ctrl+H) | Dialog: Find, Replace with, Match case, Prev, Next, Replace, Replace all, over every Text and the notes | ship now | New action `text.replaceAll`; Cmd+F opens the light Find bar over the same index (the sidebar filter retires). |

### 2.3 View

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| Slideshow (Cmd+Enter, Ctrl+F5) | Present from the current slide | ship now | `view.present`. |
| Motion (Cmd+Option+Shift+B) | Right panel stub: "Transitions and animations are not available in this theme" | ship later | The Perfect export has no transitions; R07 advises against investing. |
| Theme builder | none in the default view | ship later | The GT layouts are code (`layouts.ts`); the item is disabled with "The GT theme is maintained by the brand team". |
| Grid view | Replaces the canvas with the slide grid; double click a tile returns | ship now | `view.mode` grid; the bottom bar toggle does the same; Book view retires. |
| Zoom > Zoom in, Zoom out, Fit, 50%, 100%, 200% (Cmd+plus, Cmd+minus, Cmd+0 for 100%) | The stage scale `k`; typed values 25 to 1600 in the toolbar box | ship now | New view state `zoom` in the URL search params. |
| Show ruler | none | ship later | Disabled with "Rulers are not available yet". |
| Guides > Show guides, Add vertical guide, Add horizontal guide, Edit guides, Clear guides | Deck level guides drawn on every slide, draggable, right click a guide for Delete guide and Edit guides | ship now | New manifest field `guides` (section 7). |
| Snap to > Guides, Snap to > Grid | Two checkmark toggles; Guides on, Grid off by default, as Google | ship now | `freeform.ts` already has both sets; Google's Alt while dragging suppresses guides (Cmd on Mac). |
| Comments > Hide, Minimize, Expand | none | ship later | With comments. |
| Live pointers | none | omit | No presence channel this round (R10 C1). |
| Show speaker notes | Toggles the notes pane | ship now | |
| Show filmstrip | Toggles the filmstrip | ship now | `view.sidebar`. |
| Mode > Editing, Commenting, Viewing | Editing and Viewing; Commenting later | ship now | The Edit and View Seg leaves the toolbar; `?edit=0` stays as the URL form. |
| Full screen (Ctrl+Shift+F) | Compact mode: hides the menu bar and toolbar | ship now | Google names the same key for both labels (R01 View). |

### 2.4 Insert

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| Image > Upload from computer | OS file picker; one step; alt text defaults to the file name and is editable in Format options > Alt text | ship now | `asset.add` with role `other`; the intake form's other fields move to the Advanced disclosure of the Asset section. |
| Image > Stock & web | none | omit | No image search; R07 notes the attribution problem. |
| Image > Drive & Photos | "From this presentation" (the deck's pictures) and "From the GT brand deck" | ship now | The asset picker, renamed. |
| Image > Camera | none | omit | |
| Image > By URL | URL field with a preview | ship now | `asset.add` from a URL. |
| Text box | The cursor changes; click places a 480 by 64 box at the click, drag draws one; the caret is active at once | ship now | On a grammar slide a click inserts into the slot under the pointer; on freeform it places `pos`. |
| Audio | none | omit | No media primitive and no present mode audio; a menu item that never works confuses more than its absence. |
| Video | none | ship later | Disabled with "Video arrives with the presenter round"; the export would carry a poster frame only. |
| Shape > Shapes | Gallery: rectangle, rounded rectangle, ellipse, triangle, right triangle, diamond, parallelogram, trapezoid, pentagon, hexagon, plus | ship now | The `shape` block gains these kinds (section 7); each is an ECMA-376 preset so Editable text exports it natively. |
| Shape > Arrows | Gallery: right, left, up, down block arrows and chevron | ship now | Same block. |
| Shape > Callouts | Gallery of the four callouts | ship later | Needs the pointer handle. |
| Shape > Equation | none | omit | |
| Table | Grid picker up to 20 by 20 | ship now | New `table` block (section 7). |
| Chart > Bar, Column | Inserts a chart with placeholder data; numbers edited in Format options > Chart data | ship now | New `chart` block (section 7). |
| Chart > Line, Pie | Same block, two more kinds | ship later | |
| Chart > From Sheets | none | omit | No Sheets. |
| Diagram | Right panel with the declared diagram templates (Process 3 to 5 steps, Hierarchy 2 to 3 levels, Timeline, Cycle) inserted as `dia` data | ship later | The `dia` grammar exists; the template set is content work. |
| Word art | A bar at the top of the canvas; Enter inserts a `text` block at size 88, weight 500 on the freeform layer | ship now | Resizing the box steps `typography.size` along the ladder (section 7). |
| Line > Line, Arrow | Drawing cursor; click and drag | ship now | `shape` kinds line and arrow. |
| Line > Elbow connector, Curved connector, Curve, Polyline, Scribble | none | ship later | Connectors need anchor points on shapes. |
| Special characters | none | omit | The OS character viewer does this. |
| Animation | none | ship later | With Motion. |
| Link (Cmd+K) | Popover: Text, Link (URL or a search of slide titles), "Slides in this presentation" (Next slide, Previous slide, First slide, Last slide, then each slide), Apply; later Change and Remove on the chip | ship now | Text links exist; block links are new (section 7). |
| Comment (Cmd+Option+M) | none | ship later | Comments need a sidecar and a panel (R10 C3 item 4); disabled with "Comments arrive in the next round". |
| New slide (Ctrl+M) | A slide after the selection with the current slide's layout | ship now | `slide.insert` from the layout's template. |
| Slide numbers | Dialog: On, Off, "Skip title slides", Apply, Apply to selected | ship now | The frame's counter becomes a manifest setting (section 7). |
| Placeholder | none | omit | Theme builder only. |
| Templates | Right panel listing the GT brand deck's slides (and the Sales deck template's) with "Insert all slides" | ship now | `slide.import` from the template decks. |
| Building blocks | Right panel with the GT grammar blocks grouped: Lists (Ruled rows, Ruled statement list), Figures (Figure, Pair of figures, Tile grid, Detail grid), Data (Table, Chart, Status board, Matrix, Scales), Specimens (advanced) | ship now | This is the current Insert menu's Blocks group, as Google's Building blocks panel. |
| Speaker spotlight | none | omit | Meet only. |
| Material (ours) | Insert > Material opens the material picker and inserts a `material` block | ship now | Kevin's placement. |
| Icon (ours) | Insert > Icon opens the Heroicons picker | ship now | The sprite is the theme's icon set. |

### 2.5 Format

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| Text > Bold (Cmd+B) | The weight 500 run, labelled Bold | ship now | |
| Text > Italic (Cmd+I) | A fifth markup rule `_text_` and `Run.i` | ship now, pending Kevin's grammar approval (section 7) | The export font set gains an Inter italic instance. |
| Text > Underline (Cmd+U) | none | ship later | The grammar reserves decoration for links. |
| Text > Strikethrough (Cmd+Shift+X) | On a plain list item: the `no` flag | ship now for list items; later inside a run | |
| Text > Superscript, Subscript | none | omit | No baseline offset in the type model. |
| Text > Size > Increase, Decrease font size (Cmd+Shift+>, <) | Steps `typography.size` along the ladder | ship now | |
| Text > Capitalization > lowercase, UPPERCASE, Title Case | Rewrites the selected text | ship now | The sentence case lint still marks Title Case headings at severity 2. |
| Align & indent > Left, Center, Right (Cmd+Shift+L, E, R) | `typography.align` | ship now | |
| Align & indent > Justified (Cmd+Shift+J) | none | omit | Not in `TYPE_ALIGNS`; the grammar has no justified text. |
| Align & indent > Increase, Decrease indent (Cmd+], Cmd+[) | List level 1 or 2 | ship later | With list markers. |
| Line & paragraph spacing > Single, 1.15, 1.5, Double, Custom spacing | `typography.leading` steps; Custom opens a stepper | ship now | |
| Bullets & numbering > Bulleted list, Numbered list, List options | `marker` on the plain list block | ship later | Section 7 names the schema; the grammar forbids bullets today. |
| Table > Insert row above, below, column left, right, Delete row, column, table, Distribute rows, columns, Merge cells, Unmerge cells | With the table block; Merge and Unmerge later | ship now | |
| Image > Crop image | The crop anchor today (top or center); free crop later | ship now, partial | |
| Image > Mask image | none | omit | No masking in the renderer or the exporter. |
| Image > Replace image | Submenu with the same sources as Insert > Image | ship now | `block.set /asset` after `asset.add`. |
| Image > Reset image | Clears crop and border | ship now | |
| Image > Image options | Format options at the image sections | ship now | |
| Borders & lines > Border color, Border weight, Border dash, Line start, Line end | `stroke`, `strokeWidth`, `dash`, `arrowheads` | ship now | Dash is new (section 7). |
| Format options | The right panel (the inspector renamed) with Google's section names: Size & rotation, Position, Text fitting, Adjustments (images), Alt text, plus our Color, Typography and Chart data | ship now | Drop shadow, Reflection and Recolor are omitted: the grammar has none. |
| Clear formatting (Cmd+\) | Removes `typography`, `color`, `fill`, `stroke` overrides so the grammar default returns | ship now | |

### 2.6 Slide

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| New slide (Ctrl+M) | As Insert > New slide | ship now | |
| Duplicate slide (Cmd+D) | `slide.duplicate` | ship now | |
| Delete slide | `slide.remove` | ship now | |
| Skip slide | Toggles `skip` on the slide; the item reads "Unskip slide" while skipped | ship now | New field (section 7); honoured by present mode, the view route, the embed, print and export. |
| Move slide > up, down, to beginning, to end (Cmd+Up, Cmd+Down, Cmd+Shift+Up, Cmd+Shift+Down) | `slide.move` | ship now | Crossing a section boundary in the GT deck moves the slide into the neighbouring section. |
| Change background | Dialog: Color (Paper, Plate, Ink, Ink 2, the four hues, custom hex), Image (Choose from the deck's pictures or upload), Reset to theme, Done | ship now for colour; image on content slides later | New `background` field on content slides (section 7); "Add to theme" is omitted (the theme is code). |
| Apply layout | Submenu of the theme's layouts with thumbnails, the current one marked | ship now | New action `slide.applyLayout` (section 5). |
| Transition | Motion panel stub | ship later | |
| Edit theme | none | ship later | Disabled, as View > Theme builder. |
| Change theme | Opens the Themes panel | ship now | |

### 2.7 Arrange

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| Order > Bring to front, Bring forward, Send backward, Send to back (Cmd+Shift+Up, Cmd+Up, Cmd+Down, Cmd+Shift+Down) | `block.order` front, forward, backward, back | ship now | Front and back exist unbound (R06 row 87); the moves with no effect are disabled. |
| Align > Left, Center, Right, Top, Middle, Bottom | `block.align` | ship now | With one block selected the item aligns to the slide, which is Google's Center on page behaviour; Google's rule for one object is unverified (R05 C2). |
| Distribute > Horizontally, Vertically | `block.distribute` | ship now | Disabled under three blocks. |
| Center on page > Horizontally, Vertically | `block.align` to the content box center | ship now | |
| Rotate > Rotate clockwise 90°, Rotate counter-clockwise 90°, Flip horizontally, Flip vertically | `pos.r`, `pos.flipH`, `pos.flipV` on freeform blocks | ship now | Section 7; disabled on grammar slides with "Switch the slide to the Blank layout to rotate". |
| Group (Cmd+Option+G), Ungroup (Cmd+Option+Shift+G) | `pos.group` tag | ship now | Section 7. |

### 2.8 Tools

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| Spelling > Spell check | none | ship later | Disabled with "Use your browser's spelling suggestions"; the browser underlines misspellings once `spellcheck` is on. |
| Spelling > Underline errors | Toggles the editable run's `spellcheck` attribute | ship now | Stored per browser. |
| Spelling > Personal dictionary | none | omit | The browser owns it. |
| Explore | none | omit | Retired by Google in 2024 (R02 8.6). |
| Linked objects | none | omit | No linking. |
| Dictionary | none | omit | |
| Q&A history | none | omit | |
| Dictate speaker notes | none | omit | |
| Preferences | Dialog, General tab: "New text boxes resize to fit text", "Show shortcut hints in tooltips", "Underline misspellings"; Substitutions tab omitted | ship now | Stored per browser. |
| Accessibility settings | none | ship later | The chrome already carries labels and `data-control` ids; the dialog waits for a screen reader pass. |
| Activity dashboard | none | omit | No identity. |
| Agent (ours, submenu) | Lint this slide (right panel of findings with Fix), Show lint marks (the overlay), Source (the drawer, Cmd+Option+Shift+U), Show both themes (the twin stage), History (the mutation log with Undo to here), Leases, Run an action (the old palette's Actions group), Rebuild thumbnails (`render.slide`) | ship now | Every agent surface in one submenu, per Kevin's decision; nothing here appears in the toolbar. |

### 2.9 Extensions

Google's Extensions menu holds add-ons, Apps Script and AppSheet, which are its programmatic surfaces (R01 Extensions). Ours are the CLI, MCP and the window API, so they take this menu.

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| Add-ons > Get add-ons, Manage add-ons | none | omit | No marketplace. |
| Apps Script | Connect a command line (the Connect card as a dialog: the push and pull commands with this deployment's URL and a Copy button each) | ship now | The card leaves `/decks`. |
| AppSheet | MCP server (a dialog with the `/mcp` address and the bearer token note), API reference (opens `/openapi.json` and `/llms.txt`), Agent skills (opens the skills folder on GitHub) | ship now | |

### 2.10 Help

| Google item | Turboslide | Status | Note |
| --- | --- | --- | --- |
| Search the menus (Option+/, Alt+/) | The tool finder: the palette renamed, listing menu items and slides only | ship now | The `#`, `+` and `>` prefixes and the Actions group leave; Cmd+K becomes Insert link. |
| Help | Opens `docs/README.md` rendered, or the repository's docs site | ship now | |
| Training | "Get started" card: a five step tour of the ten tasks of section 10 | ship later | |
| Updates | none | omit | |
| Help Slides improve | Report a problem (a GitHub issue link with the deck id and revision prefilled) | ship now | |
| Privacy Policy, Terms of Service | none | omit | |
| Keyboard shortcuts (Cmd+/) | Dialog with a search field and Google's group headings (section 8) | ship now | The HelpCard rebuilt from the menu model. |

Access keys: Ctrl+Option plus F, E, V, I, S, O, R, T, H open the menus on Mac (Google lists Slide and Arrange on Mac only, R04 B4); Alt plus the letter in Chrome on Windows; Extensions gets Ctrl+Option+X by our choice since Google publishes none. Inside an open menu the underlined letter of an item runs it.

## 3. The toolbar

### 3.1 Nothing selected

Google's order from R02 section 4.1, one row at 1440. Each control is a `ToolButton` with a tooltip that reads the label and the shortcut, and nothing else (the one sentence descriptions and the action ids leave the tooltips).

| # | Control | Heroicon | Turboslide | Status |
| --- | --- | --- | --- | --- |
| 1 | Search the menus | magnifying-glass | The tool finder | ship now |
| 2 | New slide, with the arrow "New slide with layout" | plus, chevron-down | `slide.insert` with the current layout; the arrow opens the layout grid | ship now |
| 3 | Undo | arrow-uturn-left | history inverse | ship now |
| 4 | Redo | arrow-uturn-right | history redo | ship now |
| 5 | Print | printer | `/print/:id` | ship now |
| 6 | Paint format | paint-brush | Copies `typography`, `color`, `fill`, `stroke`, `dash` from the selection and applies them to the next click; double click keeps it on; Cmd+Option+C and V | ship now |
| 7 | Zoom | text button reading Fit | The zoom menu | ship now |
| | divider | | | |
| 8 | Select | cursor-arrow-rays | The pointer tool (default; a draw tool returns to it) | ship now |
| 9 | Text box | a T glyph from the sprite | Insert > Text box | ship now |
| 10 | Insert image, with arrow | photo, chevron-down | The Image submenu | ship now |
| 11 | Insert shape, with arrow | square-2-stack | The Shape gallery | ship now |
| 12 | Insert line, with arrow | minus (rotated) | The Line gallery | ship now |
| 13 | Insert comment | chat-bubble-left | disabled | ship later |
| | divider | | | |
| 14 | Background | text button | The Background dialog | ship now |
| 15 | Layout, with arrow | text button, chevron-down | The layout grid, applied to the selected slides | ship now |
| 16 | Theme | text button | The Themes panel | ship now |
| 17 | Transition | text button | disabled | ship later |
| 18 | Hide the menus | chevron-up, far right | Compact mode | ship now |

Removed from the toolbar: Edit and View (View > Mode), Twin, Lint, Source (Tools > Agent), the status chip (the title row's cloud), the Search pill (position 1 is the finder), Presentation and Present (the Slideshow split button), Export (File > Download), the mode Seg (View > Grid view and the bottom bar), Theme light or dark (the Themes panel), Fullscreen (View > Full screen), Copy link (Share), Help (the Help menu), Previous, Next and the count (the filmstrip and present mode).

### 3.2 Text box, heading or paragraph selected, or the caret in text

Positions 1 to 7 stay. The tail, in Google's order (R02 section 4.2):

| Control | Turboslide | Status |
| --- | --- | --- |
| Fill color | `fill` on box; disabled on heading and paragraph | ship now |
| Border color, Border weight, Border dash | `stroke`, `strokeWidth`, `dash` on box | ship now |
| Font | A drop-down reading Inter with one entry | ship now (single entry, so the control is informative) |
| Font size with minus and plus | `typography.size`, stepping the ladder; typed values snap to the nearest step and the off ladder mark shows | ship now |
| Bold | Cmd+B, the weight 500 run, or `typography.weight` 500 when the box is selected | ship now |
| Italic | `_text_` | ship now, pending approval |
| Underline | disabled | ship later |
| Text color | `color` (palette swatches plus custom hex) | ship now |
| Highlight color | none | omit |
| Insert link | Cmd+K | ship now |
| Insert comment | disabled | ship later |
| Align, with arrow (Left, Center, Right; Top, Middle, Bottom) | `typography.align`; vertical alignment is `valign` on box and text (section 7) | ship now |
| Line & paragraph spacing | `typography.leading` presets | ship now |
| Bulleted list, Numbered list | disabled | ship later |
| Decrease indent, Increase indent | disabled | ship later |
| Clear formatting | removes overrides | ship now |
| Format options | opens the panel | ship now |

### 3.3 Shape selected

Fill color, Border color, Border weight, Border dash, then the text controls of 3.2 (a shape holds text through `box.text`; a bare shape gains `text` this round), then Format options.

### 3.4 Image selected

Border color, Border weight, Border dash, Crop image (with the Mask arrow omitted), Replace image (with arrow), Image options, Reset image, Format options.

### 3.5 Line selected

Line color, Line weight, Line dash, Line start, Line end, Format options.

### 3.6 Table cell selected

Border color, Border weight, Border dash, Fill color, then the text controls, the Align control with vertical alignment, Format options. The row and column commands are on the right click menu and under Format > Table.

### 3.7 Chart selected

Format options (which opens on Chart data). Google's chart toolbar shows image controls; ours shows the panel button only.

### 3.8 Slide selected in the filmstrip, nothing on the canvas

The default tail (Background, Layout, Theme, Transition) applies to every selected slide.

Under 1100 px the tail from position 8 collapses into a More button with the same items as a menu; the head stays. Under 900 px the bar wraps to two rows and the filmstrip is the overlay list it is today.

## 4. The filmstrip

- Cards as section 1 describes; the current slide framed in ink; a click selects; Shift click extends a range; Cmd click toggles one; Up, Down, Home, End move; Shift with them extends (R04 B2); Enter or Space opens the slide on the canvas and gives the canvas focus; Delete and Backspace remove the selection with no confirmation and a toast "Deleted 2 slides. Cmd Z undoes" (the toast holds 5 s and carries an Undo action, replacing today's 1400 ms plate, R08 C4).
- Drag to reorder, with multi-select dragging together; the drop line shows the half of the row; one `slide.move` per moved slide in one write. Cmd+Up and Cmd+Down move one place, Cmd+Shift+Up and Cmd+Shift+Down to the ends.
- Right click menu, in the order R08 A1 reconstructs, with the shortcut printed beside Paste, Duplicate slide and Comment as the 2017 source recorded: Cut, Copy, Paste, a rule, New slide, Duplicate slide, Delete, Skip slide (Unskip slide when skipped), a rule, Change background, Apply layout (submenu), Change theme, Transition (disabled), a rule, Move slide (submenu of the four moves, nested as the Slide menu nests them since 2018; whether Google's context menu nests them is unverified), a rule, Comment (disabled). Save to Keep notepad is omitted. The menu opens at the pointer, the first item takes focus, Escape returns focus to the row (R08 C1 notes today's menu does not).
- Skip: the card dims to 45 percent and an eye-slash icon sits in the number gutter; the number stays; skipped slides remain in the filmstrip and the grid and leave every output (section 7).
- Grid view: the bottom bar toggle, View > Grid view or a double click on the current card's frame; tiles at 300 px minimum, drag to reorder, the same right click menu, a minus and plus for tile size at the bottom, double click a tile to return.
- Removed: the density Seg (thumbnails only), the filter row (Cmd+F is Find), the count, the kind glyphs, the lint badges, the lease dots, the sticky section headers with counts, the row menu items Render, Lint this slide, Copy id and Move to section (Move slide covers it). Section names remain as the passive labels of section 1 for the GT brand deck; a deck made from the blank template has one section and shows no label.
- The hover preview card retires; Google shows none.

## 5. The layout system

### 5.1 One theme, its layouts

Google's model (R03 b.1): a theme is a preset group of colours, fonts, background and layouts; a layout is the way text and images are arranged on a slide; every layout carries placeholders with fixed prompt text; the Layout drop-down, the New slide arrow, Slide > Apply layout and the right click Apply layout show the same list in the same order. Turboslide's theme is `gt-ink-paper`, and its layouts are the fifteen slide templates of `slide-templates.ts` plus the three blanks (R06 section 4.1). This round renames that file `layouts.ts` and gives every layout a Google style name, an order, a thumbnail and placeholder roles.

The Themes panel shows the one theme in its two twins as two cards, "GT ink and paper, light" and "GT ink and paper, dark"; clicking one sets the deck's default theme (the `gt-theme` key today, which becomes a manifest field `theme.variant` so the choice travels with the deck and the export defaults to it). "In this presentation" lists the same two. Import theme is omitted (one theme). The panel opens automatically when a new presentation is created and closes with its X.

### 5.2 The layout list

The first eleven take Google's default theme names and order (R03 b.2, from the Apps Script PredefinedLayout reference); the GT specific layouts follow after a rule. Placeholder roles are the new `placeholder` field of section 7.

| # | Layout name | Google counterpart | Built from | Placeholders (prompt text) |
| --- | --- | --- | --- | --- |
| 1 | Title slide | Title slide | `title` kind | title ("Click to add title"), subtitle ("Click to add subtitle") |
| 2 | Section header | Section header | `opener` kind with a theme starter picture | title, body ("Click to add text"), credit |
| 3 | Title and body | Title and body | `split`, head single, body one paragraph | title, body |
| 4 | Title and two columns | Title and two columns | `cols` 1/1, left: title and body, right: body | title, body, body |
| 5 | Title only | Title only | `split`, head single, body empty | title |
| 6 | One column text | One column text | `stack`: heading and a 56 measure paragraph | title, body |
| 7 | Main point | Main point | `statement` kind | title |
| 8 | Section title and description | Section title and description | `cols` 5/7, left: title and cap, right: lead paragraph | title, subtitle, body |
| 9 | Caption | Caption | `mood` kind with a theme starter picture | title (44 px), body, credit |
| 10 | Big number | Big number | `center`: heading level big and a cap paragraph | number ("Click to add a number"), body |
| 11 | Blank | Blank | `freeform`, no blocks | none |
| 12 | Ruled rows | none | the Ruled rows template | title, body, rows (three key and value items) |
| 13 | Ruled statement list | none | the Ruled statement list template | title, body, list (four items) |
| 14 | Title and table | none | `split`, head single, body a 3 by 4 table | title, table |
| 15 | Figure | none | the Figure template | title, body, picture ("Click to add a picture") |
| 16 | Pair of figures | none | the Pair template | title, two pictures with captions |
| 17 | Tile grid | none | the Tile grid template | title, body, four pictures |
| 18 | Detail grid | none | the Detail grid template | title, body, three pictures |
| 19 | Status board | none | the Status board template | title, body, board |
| 20 | Matrix | none | the Matrix template | title, body, matrix |
| 21 | Closing | none | `closing` kind with a theme starter picture | title, body, credit |

The four picture layouts (2, 9, 15 to 18, 21) need assets. Today a blank deck has none, so those templates are missing from the menu (R06 4.1). The fix is theme starter assets: two opener pictures, one mood picture and one closing picture from the GT brand deck, dithered, copied into every new deck as `theme-opener-1`, `theme-opener-2`, `theme-mood-1`, `theme-closing-1` (eight small PNG twins). Layouts 15 to 18 use an image placeholder that draws a dashed plate with "Click to add a picture" until an asset is chosen, so they need no starter asset.

Google's title slide bend, adopted from product knowledge and unverified in the reports: New slide after a Title slide inserts Title and body, because a second title slide is never wanted; every other layout repeats itself.

### 5.3 What New slide inserts

`slide.insert` with the layout's template, every text placeholder empty with its prompt, every picture placeholder empty, `notes` empty, the new slide selected and the first placeholder focused with the caret (Google's new slide selects the slide; the focused caret is our small addition so a rep can type at once, and Escape leaves it as Google's Escape does). The placeholder copy "Placeholder heading, not final copy" retires with its lint finding.

### 5.4 What Apply layout does

Google moves placeholder content into the new layout's matching placeholders and leaves freestanding content where it is (R03 b.3). The new action `slide.applyLayout(slideId, layoutId)`:

1. Reads the source slide's blocks and slide fields and labels each by role: `placeholder` when set, else derived (the first heading is the title; a lead paragraph is the subtitle; paragraphs and lists are body; shot, pair, tiles and details are pictures; credit is credit; a statement's `big` is the title; a title slide's `heading` and `lead` are title and subtitle).
2. Builds the target layout's template and fills its placeholders from the source by role in document order; a target placeholder with no source stays a prompt.
3. Every unmatched source block is preserved: appended to the target's last text slot on a content layout, to the plate on a picture layout, and to `ext.parked` on Title slide and Main point (which have no block list), with a one line notice above the canvas: "2 items are hidden by this layout. Undo, or choose a layout with a body" and a button that opens the layout grid. Applying a layout with a body restores parked items first.
4. Commits one `slide.replace`, so undo is one step and versions record one change.

Where fidelity bends: Google's placeholders stay where the user dragged them until the layout is reapplied, and Google has no reset; ours resets positions to the layout on every apply, which R07 rule 30 asks for. Kind changes (content to opener, statement to content) are a `slide.replace` with a new kind; the inspector's "The kind is fixed" sentence retires.

### 5.5 Where the layouts appear

The New slide arrow, the toolbar Layout button, Slide > Apply layout, the filmstrip's Apply layout and the theme's card in the Themes panel show the same grid: 21 tiles at 128 by 72, names under them, the current layout marked, the first eleven then a rule then the GT ten. The grid renders each layout's template through `renderThumb` with prompts drawn, cached per theme variant.

## 6. Routes, the home page, trash, copies, import and download

### 6.1 The root address

`/` redirects to `/edit/new`. The editor at `/edit/new` holds a draft in memory: title "Untitled presentation", one Title slide with prompts, the theme starter assets, the Themes panel open, the caret in the title placeholder. The first write (a keystroke committed, a rename, a layout change) calls `deck.create` from the `gt-blank` template with the pending write, and the URL becomes `/edit/<id>` through `history.replaceState`. Reloading `/edit/new` before any write shows the same fresh draft again.

Where fidelity bends: Google creates the file in Drive at once; we create on the first edit so that every visit to the root does not add an empty deck to the shared Blob store (R10 B6 records fourteen test decks there today and every visitor sees every deck). The rep sees no difference: the title reads Untitled presentation, the cloud icon appears after the first edit and reads Saved.

`deck.create` gains `from: 'gt-blank' | 'gt-brand' | 'sales-deck'`; the store's `blankDeckDocument` becomes the `gt-blank` template with the starter assets and the Title slide built from layout 1.

### 6.2 The home page

`/decks` becomes Google's home (R03 a.1). The GT mark in the title row links here.

```
+--------------------------------------------------------------------------------------------+
| [GT] Turboslide                                   [Search presentations              ]     |
+--------------------------------------------------------------------------------------------+
| Start a new presentation                                              Template gallery  ^  |
| [ + ]           [GT brand deck]     [Sales deck]                                           |
| Blank           85 slides           7 slides                                               |
| presentation                                                                               |
+--------------------------------------------------------------------------------------------+
| Recent presentations                        [Last opened by me v]  [grid|list] [folder]    |
|  [thumb]  Untitled presentation      Opened 2 min ago                                 ...  |
|  [thumb]  Acme pitch                 Opened yesterday                                 ...  |
+--------------------------------------------------------------------------------------------+
```

- The template strip: Blank presentation (a plus tile; opens `/edit/new`), GT brand deck (a copy of the 85 slide deck, `deck.create from gt-brand`), Sales deck (a seven slide starter built from the GT layouts with prompts: Title slide, One column text as the agenda, Title and body for the problem and the solution, Title and table for pricing, Figure for a case study, Closing). "Template gallery" opens `/decks/templates`, a page with the same three plus every GT layout as a single slide template. The up chevron collapses the strip, remembered per browser.
- Recent presentations: cards or rows with a thumbnail of slide 1, the title, the opened time; sort by Last opened by me (from the browser's own history in local storage, since there is no identity), Last modified, Title; a grid and list toggle; the folder icon opens the Open dialog. The "Owned by" filter is omitted until identity exists. Every deck on the store is listed under Last modified because there is no owner; the Share dialog says so.
- Per item menu (the three dots): Open in new tab, Rename, Make a copy, Move to trash. Open and Present buttons per row retire (a click opens; Present is inside).
- Removed from `/decks`: the New deck form (the strip replaces it), Upload deck bundle (File > Open > Upload, and File > Import slides), the deck count, ids and revisions, Export and Download bundle per row (File > Download), the Connect card (Extensions > Connect a command line), the hosting notice and the footer.

### 6.3 Trash

`deck.trash` sets `trashed: <ISO time>` in the manifest; `/decks` hides trashed decks; `/decks/trash` lists them with Restore and Delete forever; `deck.restore` clears the field; `deck.remove` deletes the prefix (the `vercel blob del` of `docs/EDITOR-DEPTH-STATUS.md` section 10 as an action); a trashed deck's editor shows Google's trashed notice with Restore and "Go to home" and refuses writes; a scheduled purge removes decks trashed more than 30 days ago, as Drive does. The twelve test decks are moved to trash from the UI by Kevin on the first day of the new build.

### 6.4 Rename and Make a copy

Rename is the title field, File > Rename and the home page menu, all `deck.rename`. Make a copy is `deck.copy` on the server: the bundle path copies `deck.json`, `slides/`, `assets/` under a new id and a fresh revision 0 with one version record "Copied from <title> r<n>", strips `notes` when asked, keeps the selected slides when given, and never copies leases or the trash flag. The copy opens in a new tab as Google's does.

### 6.5 Import

File > Import slides and File > Open > Upload accept a deck bundle zip (the existing route) and, later, a `.pptx`. The PPTX importer is feasible in a bounded form: `packages/import` gains `importPptx` over jszip and an XML parser that reads each slide's title and body placeholders into a Title and body or Title and two columns layout, pictures into assets on Figure or Blank layouts, tables into the table block, notes into `notes`, and writes an import report naming every shape it dropped. It ships later because it competes with the editor for the same builders, and the Upload tab says ".pptx import arrives in the next round".

### 6.6 Download

Section 2.1 lists the formats. The Perfect PPTX runs synchronously through the existing `syncExport` server function with the progress toast; the 190 to 222 s run for 85 slides against the 300 s limit (`docs/EDITOR-DEPTH-STATUS.md` section 10) stays a risk for the GT deck and is not a risk for a rep's twenty slide deck. PNG and JPEG use the render route at 2x. Plain text is a new server function. Web page is `build.run`. PDF waits for Chromium print on the render worker.

### 6.7 Share

The Share button opens the Share dialog: "Get link" with two rows, "Anyone with the link can view" (copies `/deck/<id>?v=<token>`) and "Anyone with the link can edit" (copies `/edit/<id>`), a Copy link button per row, a gear with "Include speaker notes in the view link" (off; the view payload strips notes, R10 C3) and "Show skipped slides in the view link" (off), and Done. People, roles, General access Restricted and expiry wait for identity and are absent, with one sentence in the dialog: "Sharing with named people arrives with sign in". The view token is per deck, rotated by "Stop sharing" in the same dialog, and the view route refuses a missing or stale token.

## 7. Object model changes and their export path

Every change is a schema field with a validator rule, a reducer path, a renderer path and an export path, in the order AGENTS.md's parity chain names. "Perfect" is the flatten PPTX (one 2x raster per page over an invisible text layer); "Editable text" is the native mode.

| Google behaviour | Schema change | Renderer | Perfect | Editable text | Status |
| --- | --- | --- | --- | --- | --- |
| Placeholders with prompt text | `placeholder?: 'title' \| 'subtitle' \| 'body' \| 'number' \| 'picture' \| 'caption' \| 'credit'` on `BlockBase`, plus `heading`, `lead` and `big` slide fields may be empty when the slide carries `placeholders: true` | An empty placeholder draws its prompt in titanium in the editor and in thumbnails when `opts.live`; `renderSlide` for present, embed and export draws nothing; copy lint rules skip empty texts | nothing drawn, nothing in the text layer | nothing | ship now |
| Skip slide | `skip?: true` on `SlideBase` | The filmstrip dims; present mode, `/deck`, `/embed`, print and `export.run` skip it by default; `export.run` gains `includeSkipped` | skipped pages absent | same | ship now |
| Slide background | `background?: { color?: Color; asset?: AssetId }` on content slides | A paint behind `.in` | in the raster | a `p:bg` fill or a picture behind | colour now, asset later |
| Slide numbers | `counter?: { on: boolean; skipTitle?: true; slideIds?: SlideId[] }` on the manifest | The frame's counter obeys it | in the raster | the master's counter text box obeys it | ship now |
| Guides | `guides?: { v: number[]; h: number[] }` on the manifest | Editor overlay only | none | none | ship now |
| Paragraph break in text | `\n` allowed in `paragraph`, `text` and `box` texts (SPEC 4.2 amendment); Enter inserts it, Shift+Enter too (Google's soft break is unverified, R09) | one `<span class="para">` per break | the scene already carries one hard break per browser line; a paragraph adds `spaceBelow` 0 | `<a:p>` per paragraph | ship now |
| Italic | `_text_` as a fifth rule, `Run.i` (SPEC 4.2 says four rules; this is a grammar decision for Kevin) | `<i>` | text layer run with `i` | Inter italic instance `GT Inter Text Italic` in `fonts.json` and the embed set | ship now pending approval |
| Lists with bullets | `marker?: 'rule' \| 'bullet' \| 'number'` and `level?: 1 \| 2` on plain items (SPEC 2.1 forbids bullets; a grammar decision) | glyph or number per row | in the raster; text in the layer | `buChar` or `buAutoNum` | ship later |
| Vertical alignment in a box | `valign?: 'top' \| 'middle' \| 'bottom'` on `box` and `text` | flex alignment | in the raster | `anchor` t, ctr, b | ship now |
| Text fitting | `fit?: 'none' \| 'shrink' \| 'grow'` on `pos`; grow is the default for new text boxes and shrink for placeholders (R09 A5) | grow: the box height follows the text; shrink: the size steps down the ladder until it fits | in the raster | `normAutofit` is never written (SPEC 8.5); the measured size travels | ship now |
| Shapes | `shape.shape` gains triangle, rightTriangle, diamond, parallelogram, trapezoid, pentagon, hexagon, plus, rightArrow, leftArrow, upArrow, downArrow, chevron; `shape.text?: Text` and `typography` | inline SVG polygons on the half pixel grid; text centred | in the raster; text in the layer | `prstGeom` presets of the same names (all are ECMA-376 presets, R05 E1) | ship now |
| Line dash | `dash?: 'solid' \| 'dot' \| 'dash'` on shape, rule, box stroke and table borders | `stroke-dasharray` | in the raster | `dashStyle` | ship now |
| Line start and end | `arrowheads` already exists on the arrow kind; a `line` kind gains it | filled 8 px triangles | in the raster | `beginArrowType`, `endArrowType` | ship now |
| Rotation and flip | `pos.r?: number` (degrees), `pos.flipH?: true`, `pos.flipV?: true` on freeform blocks; `docs/freeform.md` said rotation stays out, and Kevin's directive reopens it | `transform: rotate() scale()` on the `.free` wrapper; the off sheet lint uses the rotated bounds | in the raster; the invisible text layer stays unrotated over the box, so the text stays searchable and its boxes do not follow the rotation | `rot` and `flipH`, `flipV` on `a:xfrm` through pptxgenjs `rotate` and `flipH` | ship now |
| Groups | `pos.group?: string` tag on freeform blocks | none | none | one `<p:grpSp>` per tag through the existing `ooxml/groups.ts` | ship now |
| Z order | exists (`block.order`) | | | | bind front and back |
| Links on objects | `link?: string \| { slide: SlideId \| 'next' \| 'previous' \| 'first' \| 'last' }` on `BlockBase`; text links keep the markup rule | an `<a>` wrapper in present and view modes; inert on the stage | an invisible rectangle with the hyperlink over the block's box | `hyperlink` on the shape | ship now |
| Images | `shot.crop` becomes `{ top, right, bottom, left }` fractions with the two anchors as presets; `shot.border` becomes `{ color: Color; width: 1 \| 1.5 \| 2 }`; one step `asset.add` (alt from the file name, role `other`) | `object-fit` with `object-position` from the crop | in the raster | `sizing: 'crop'` | crop presets now, free crop later |
| Tables | `table` block: `columns: { width?: number; align?: 'left' \| 'center' \| 'right' }[]`, `rows: { cells: Text[]; header?: true }[]`, `fill?: Color` per column, `border?: { color: Color; width: 1 \| 1.5 \| 2; dash? }`, `valign`, capped at 20 by 20 (R11 C1) | a grid with per cell `data-run`; header in display weight 500 with an ink rule | in the raster; every cell in the text layer | `addTable` with per cell text, borders and fills | ship now, merge and unmerge later |
| Charts | `chart` block: `kind: 'bar' \| 'column' \| 'line' \| 'pie'`, `categories: string[]`, `series: { name: string; values: number[]; color?: Color }[]`, `labels?: true`, `legend?: true` | inline SVG through the diagram grammar (1 px strokes, ink and plate fills, 18 and 20 px labels) | in the raster; category and value labels in the text layer | a 2x PNG, as Google's chart is a picture (R11 A10) | bar and column now, line and pie later |
| Word art | none; Insert > Word art inserts a `text` block at size 88 weight 500 with `fit: 'grow'` and a resize gesture that steps `typography.size` | | | | ship now |
| Speaker notes | `notes` stays a string; stripped from the `/deck` and `/embed` payloads | the notes pane | `addNotes` | same | ship now |
| Comments | `ext.comments` on the slide later | | | | ship later |
| Clipboard | none (client side) | | | | ship now |

Actions this round adds to `actions.ts`, with CLI commands and MCP tools generated: `slide.duplicate`, `slide.applyLayout`, `slide.import`, `block.duplicate`, `text.replaceAll`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`. Skip, background, counter, guides and the new block fields ride on `slide.set`, `block.set` and `deck.set`. The migration keeps every existing deck valid (every field is optional).

## 8. Keyboard shortcuts

Adopted verbatim from Google's list (R04 Part B), Mac first, Windows in brackets. The shortcuts dialog (Cmd+/) prints them under Google's headings: Common actions, Film strip actions, Navigation, Menus, Text, Move and arrange objects, Presenting.

| Group | Adopted |
| --- | --- |
| Common actions | New slide Ctrl+M (Ctrl+M on every platform); Duplicate Cmd+D; Undo Cmd+Z; Redo Cmd+Y or Cmd+Shift+Z; Copy, Cut, Paste; Copy formatting Cmd+Option+C, Paste formatting Cmd+Option+V; Insert or edit link Cmd+K; Open link Option+Enter; Delete; Select all Cmd+A; Select none Ctrl+Cmd then u then a; Find Cmd+F; Find and replace Cmd+Shift+H (Ctrl+H); Find again Cmd+G, Find previous Cmd+Shift+G; Open Cmd+O; Print Cmd+P; Save Cmd+S (shows "All changes saved"); Show shortcuts Cmd+/; Tool finder Option+/ (Alt+/ or Alt+Z); Compact mode Ctrl+Shift+F; Alt text Cmd+Option+Y |
| Film strip actions | Up and Down (Page Up and Page Down on Windows); Home and End (Fn+Left, Fn+Right on Mac); Move slide Cmd+Up, Cmd+Down; to beginning Cmd+Shift+Up, to end Cmd+Shift+Down; extend the selection Shift+Up, Shift+Down, Shift+Home, Shift+End |
| Navigation | Zoom in Cmd+plus, out Cmd+minus, 100 percent Cmd+0; Move to filmstrip Cmd+Option+Shift+F, to canvas Cmd+Option+Shift+C; Open speaker notes Cmd+Option+Shift+S; Open animations panel Cmd+Option+Shift+B (the stub); Revision history Cmd+Option+Shift+H; Present Cmd+Enter (Ctrl+F5); Present from beginning Cmd+Shift+Enter (Ctrl+Shift+F5, which Google does not publish); Exit Esc |
| Menus | Context menu Cmd+Shift+\ or Shift+F10 (Ctrl+Shift+\, Ctrl+Shift+X); File Ctrl+Option+F, Edit E, View V, Insert I, Slide S, Format O, Arrange R, Tools T, Help H (Alt plus the letter in Chrome on Windows) |
| Text | Bold Cmd+B; Italic Cmd+I; Increase and decrease font size Cmd+Shift+> and <; Left, Center, Right align Cmd+Shift+L, E, R; Clear formatting Cmd+\ (Ctrl+\ or Ctrl+Space); Move paragraph Option+Shift+Up and Down; Next and previous misspelling Cmd+' and Cmd+; (the browser's spelling) |
| Move and arrange objects | Group Cmd+Option+G, Ungroup Cmd+Option+Shift+G; Send backward Cmd+Down, Bring forward Cmd+Up, Send to back Cmd+Shift+Down, Bring to front Cmd+Shift+Up; Select next shape Tab, previous Shift+Tab; Nudge one pixel with the arrows, larger with Shift (8 px, our grid); Rotate 1 degree Option+Shift+Left and Right, 15 degrees Option+Left and Right; Resize Cmd+Ctrl+B, I, J, K, W (Ctrl+Alt+B, I, J, K, W, 9); Exit crop Enter; Suppress guides Cmd while dragging (Alt); Duplicate by drag Option+drag (Ctrl+drag); Resize from center Option+resize; Constrain to an axis Shift+drag; Keep the aspect Shift+resize; 15 degree steps Shift+rotate |
| Presenting | Esc stop; Right and Left; number then Enter; Home, End; s speaker notes; l laser pointer; b or period black slide; w or comma white slide; any key returns; Cmd+P print; Cmd+Shift+F full screen (F11) |

Bound as disabled this round with the item they belong to: Underline Cmd+U, Strikethrough Cmd+Shift+X in a run, Bulleted list Cmd+Shift+8, Numbered list Cmd+Shift+7, Increase and decrease indent Cmd+] and Cmd+[, Justify Cmd+Shift+J, Insert comment Cmd+Option+M, Captions Cmd+Shift+C, Audience tools a. Superscript and subscript are omitted with their items.

Conflicts with today's bindings (R06 section 2), each resolved in Google's favour:

| Today | Google | Resolution |
| --- | --- | --- |
| S or [ hides the slide list | s opens speaker notes while presenting | View > Show filmstrip has no key in the editor; s works in present mode |
| D flips the theme | Cmd+D duplicates | The Themes panel picks the twin; D is inert |
| E toggles Edit and View | none | View > Mode |
| P presents | Cmd+Enter presents | P is inert |
| F fullscreen | Cmd+Shift+F while presenting; Ctrl+Shift+F compact | F is inert |
| G grid, B book | b is a black slide while presenting | View > Grid view has no key; Book view retires |
| J, L next, K, H previous, Space next, Backspace previous | Down and Up in the filmstrip; Right and Left while presenting; Backspace deletes | Every bare letter retires in the editor so typing into a selected box never changes the view (R09 finding 4) |
| ? opens the help card | Cmd+/ | ? types a question mark |
| Cmd+K opens the palette | Cmd+K inserts a link | The tool finder is Option+/ |
| Cmd+/ toggles the source drawer | Cmd+/ shows shortcuts | The drawer is Tools > Agent > Source, Cmd+Option+Shift+U |
| Cmd+L toggles lint marks | none | Tools > Agent > Show lint marks, no key |
| Shift+D twin | none | Tools > Agent > Show both themes, no key |
| Cmd+] and Cmd+[ change z order | Cmd+] and Cmd+[ indent | Z order is Cmd+Up and Cmd+Down |
| Alt+Up and Alt+Down reorder | Cmd+Up and Cmd+Down | Same |
| Cmd+S focuses the version note | Cmd+S saves (autosave already did) | Cmd+S shows the saved toast; naming a version is File > Version history > Name current version |
| Enter commits text, Escape discards | Enter is a paragraph break, Escape leaves editing and keeps the text | Escape commits and selects the box; a second Escape deselects (R09 finding 2) |
| Double click starts editing | A single click places the caret; double click selects a word | Single click into text places the caret at the click point; the border is the drag surface; a click on a block with no text selects it |
| Arrow keys cycle blocks on grammar slides | Arrows nudge | On a grammar slide the arrows are inert with a block selected (reorder is drag or Cmd+Up and Down within the slot) |
| Digits then Enter go to a slide in the editor | Digits then Enter only while presenting | Digits type |
| The Escape ladder (help, panel, filter, mode, present, list) | Esc exits the current mode | Esc closes a menu or dialog, then leaves text editing, then deselects, then leaves present mode |

## 9. Speaker notes and present mode

### 9.1 Speaker notes

The pane of section 1. Plain text this round: a textarea styled in 15 px Inter on the paper ground, line breaks kept, the same `slide.notes` field, one `slide.set` per 400 ms pause while typing (the coalesced write SPEC 6.7 planned). Google's notes take the text toolbar (R09 A11); ours show a disabled toolbar tail with "Formatting in notes arrives later", so the structure matches. Notes never reach the view route, the embed or a presentation; they reach the PPTX notes and the presenter window.

### 9.2 The Slideshow button

The split button at the top right (R04 A1): the main part presents from the current slide in the same tab and requests fullscreen; the arrow lists Presenter view, Start from beginning (Cmd+Shift+Enter), Present on another screen (disabled: "Casting is not available"), Presentation display options (omitted). The keys are Cmd+Enter (Ctrl+F5) and Cmd+Shift+Enter.

### 9.3 Present mode

The sheet alone, skipped slides omitted, materials as frames. A click on the slide or Right advances; Left returns; number then Enter jumps; Home and End; Esc leaves. The bottom left toolbar appears when the pointer enters the lower left region and fades after 3 s: Previous, the slide number box (a click lists every slide with titles), Next, and the three dot Options menu with: Open speaker notes (opens the presenter window), Auto-play (submenu: every 1, 2, 3, 5, 10, 15, 30 seconds, every minute, Loop, Play), Turn on the laser pointer (a 12 px ink dot with a paper ring; l toggles), Captions (disabled), Enter or Exit full screen, Enable pen tool (ship later, disabled), More (Download as PPTX, Download as PDF disabled, Print, Keyboard shortcuts), Exit. The black and white slides on b and w are the sheet painted `--ink` or `--paper`; any key returns. Present mode keeps working without the network after load because the deck is in memory and the frames are inlined.

### 9.4 Presenter view

`/present/:id` (SPEC 6.10, not yet built) opens in a second window when Presenter view is chosen and the audience window stays where it was; the two sync through `BroadcastChannel('turboslide:<deckId>')` with `localStorage` as fallback. Layout, from R04 A4: top left a timer with Pause and Reset; under it the current slide preview with a drop-down bar that lists every slide for a jump; Previous and Next beside it; the next slide at 0.3 scale; the right side a Speaker notes tab with plus and minus font size buttons (14 to 28 px); an Audience tools tab with the sentence "Audience questions are not available" (the tab exists so the shape matches). The console shows stored frames; live shaders do not run there. Presenting from a call: the rep shares the audience window in the call and keeps the console on the laptop; nothing in Turboslide touches the call's audio (R07 rule 29).

## 10. The sales user's first open and the ten most frequent tasks

### 10.1 First open

The rep opens `turboslide.vercel.app`. The editor appears with "Untitled presentation" at the top left, a filmstrip with one card, a Title slide on the canvas reading "Click to add title" and "Click to add subtitle" in titanium, the notes pane reading "Click to add speaker notes", the Themes panel open on the right with the light and dark cards, the toolbar with New slide, Undo, Redo, Print, Paint format, Fit, Select, Text box, Image, Shape, Line, Comment (greyed), Background, Layout, Theme, Transition (greyed), and Slideshow and Share at the top right. No status word shows until the first edit; then the cloud reads Saved. Nothing on the screen says lint, source, lease, revision, grammar, kind or freeform.

### 10.2 The ten tasks, click by click

Clicks count pointer presses; keys count key presses or chords; typing is not counted. The tasks are the ones R07 names as the rep's week.

1. Start a new deck and name it. Open the root (0 clicks). Click the title placeholder, type the customer name (1 click). Click "Untitled presentation" at the top left, type the deck name, Enter (1 click, 1 key). The cloud reads Saved. Total 2 clicks, 1 key.
2. Add a slide with a layout. Click the arrow next to New slide (1), click Title and body (1). Or Ctrl+M for the same layout as the current slide (1 key). Type into the title and body prompts. Total 2 clicks or 1 key.
3. Retype a customer name on the cover. Click into the title text where the name is (1), the caret lands at the click; double click the word to select it (2), type, press Escape (1 key): the text stays and the box is selected. Total 3 clicks, 1 key. Escape no longer discards (R09 finding 2).
4. Duplicate a slide and delete another. Click the card (1), Cmd+D (1 key). Click the unwanted card (1), Delete (1 key); the toast offers Undo for 5 s. Total 2 clicks, 2 keys.
5. Skip the pricing slide for this audience. Right click the card (1), click Skip slide (1). The card dims. The slideshow, the view link, print and the PPTX leave it out. Total 2 clicks.
6. Reorder three slides. Click the first card (1), Shift click the third (1), drag to the new place (1 drag). Or Cmd+Up and Cmd+Down per step. Total 3 pointer actions.
7. Swap a customer logo. Drag the logo file from the desktop onto the existing image (1 drag): the frame stays, the picture changes, the alt text is the file name. Or right click the image (1), Replace image (1), Upload from computer (1), pick the file (2 in the OS dialog). Total 1 drag, or 5 clicks. Today this takes the twelve field intake form (R06 row 117).
8. Update a pricing table. Click the pricing slide (1), click into the first price cell (1), type, Tab to the next cell (1 key each), through 20 cells (20 keys). Total 2 clicks, 20 keys, against 40 clicks and 40 keys today (R11 C2).
9. Present with notes over a call. Click the arrow next to Slideshow (1), click Presenter view (1); the console opens in a second window with the timer and notes; share the audience window in the call. Right advances. Total 2 clicks.
10. Send the deck. Click Share (1), click Copy link on "Anyone with the link can view" (1), paste it into the email. Or File (1), Download (1), Microsoft PowerPoint (.pptx) (1); the Perfect file downloads with a progress toast. Total 2 or 3 clicks.

Every task above is one route through the toolbar or a right click, and every one is also in the menu bar and the tool finder, which is Google's three route rule (R07 conventions).

## 11. Ownership for the build round

Six builders, an integrator and a verifier. Every builder owns files and a test; nobody edits another's files without a note in the integration log. The order follows AGENTS.md's parity chain: schema first, then renderer and export, then the editor, then routes.

| Builder | Owns | Ships | Acceptance |
| --- | --- | --- | --- |
| B1 Document and actions | `packages/schema/src/{deck,blocks,text,actions,reduce,validate,migrations,catalog,position}.ts`, `rules.json`, `packages/schema/src/layouts/` (the 21 layouts as data with placeholder roles, moved from `packages/chrome/src/slide-templates.ts`), `packages/lint/src/static/*`, `packages/store/src/templates.ts` (gt-blank, sales-deck, starter assets), `packages/store/src/{hosted,blob-store,file-store}.ts` (trash, copy, remove) | Every field of section 7 with validator and reducer paths; the nine new actions with CLI and MCP through `pnpm generate:contracts`; the paragraph break and italic rules; skip, background, counter, guides; the table and chart schemas; the layout data | `pnpm test` in schema, lint and store; the contracts step reports the generated files current; every existing deck in `decks/` validates unchanged; the GT deck's lint count does not rise |
| B2 Renderer and export | `packages/render/src/**`, `packages/theme/src/gt-ink-paper/sheet.css`, `packages/export/src/**`, `packages/fonts/**`, `scripts/build-fonts.py`, `apps/studio/src/server/{download,export-sync}.ts`, `apps/studio/src/routes/print.$deckId.tsx` | Prompts, backgrounds, shapes, dash, rotation and flip, groups, tables, charts, italic, paragraphs, links in the renderer; the native writer for every new block and field; the Perfect text layer for table cells and links; PNG, JPEG and TXT downloads; the print route | Snapshot tests per new block in both themes; `compare-to-shoot` stays under 0.5 percent on the GT deck; `turboslide export check` valid on a new deck holding every new block in both modes; a Perfect export of the seven slide Sales deck answers `perfect: true` |
| B3 Editor chrome | `packages/chrome/src/**` except the stage overlay: new `TitleRow.tsx`, `MenuBar.tsx`, `menus/model.ts`, `Toolbar.tsx` (head and contextual tails), `ContextMenu.tsx`, `FormatOptions.tsx` (the inspector renamed, 320 px, Google's section names), `ThemesPanel.tsx`, `LayoutGrid.tsx`, `NotesPane.tsx`, `BottomBar.tsx`, `dialogs/*.tsx`, `ToolFinder.tsx` (the palette renamed), `ShortcutsDialog.tsx`, `Sidebar.tsx` (flat, cards, context menu, skip), `useShellKeys.ts` (Google's table), `tokens.css` | Sections 1 to 4 and 8 in the chrome | `menu-model.test.ts` asserts every Google item of section 2 is present with its status; `shortcuts.test.ts` asserts the bindings against a fixture of Google's list from R04; `default-view-words.test.ts` greps the default view's strings for lint, source, lease, revision, grammar, freeform, kind, toolchain and finds none outside Tools > Agent; the tooltip audit reports 0 missing; `turboslide lint --chrome` reports 0 findings at 1440, 1280 and 390 in both themes |
| B4 Stage and text | `packages/viewer/src/{Editor,InlineText,Gestures,Freeform,Selection,keys}.tsx`, `packages/chrome/src/Overlay.tsx`, `packages/viewer/src/Presenter.tsx` (new), `SlideshowToolbar.tsx` (new) | Single click caret, Escape commits, bare letters retired, Enter paragraph, Tab between cells, draw to place text boxes and shapes, drop and paste of pictures with drop to replace, the rotation handle, group selection and moves, guide dragging, the block clipboard, paint format, the present mode toolbar and keys, the presenter console | `inline-text.test.ts` extended for Enter, Escape, Tab and italic; `editor-keys.test.ts` against Google's table; a Playwright spec that types into a selected box and asserts the view did not change; the presenting keys spec |
| B5 Routes, home and sharing | `apps/studio/src/routes/{index,edit.$deckId,decks.index,decks.trash,decks.templates,present.$deckId,deck.$deckId,embed.$deckId}.tsx`, `apps/studio/src/server/{decks,write,sessions,auth}.ts`, `apps/cli/src/commands/deck.ts` | The `/edit/new` draft and the first write creation; the home page with the strip, recents and the per item menu; trash; Make a copy; Import slides for decks and bundles; the Share dialog and view tokens; Publish to the web over the embed; notes stripped from the view payloads; skip honoured by every route | `landing.spec.ts` rewritten: the root shows Untitled presentation with prompts and stores nothing until the first edit; `deck-transfer.spec.ts` extended for copy, trash and import; the view route refuses a stale token and carries no `notes` |
| B6 Tables and charts | `packages/schema/src/blocks/table.ts`, `chart.ts`; `packages/render/src/blocks/{table,chart}.ts`; `packages/export/src/pptx/table.ts`; `packages/chrome/src/inspector/{table,chart-data}.tsx`; the grid picker in `InsertMenu` | The two blocks end to end with B1's schema review and B2's export review, the cell range selection, the nine row and column commands, the chart data grid | The pricing table trace of section 10 task 8 as a Playwright spec at 2 clicks and 20 keys; `export check` on a table slide shows a native `a:tbl` in Editable text; a chart slide's Perfect text layer holds every label |
| Integrator | `AGENTS.md`, `docs/README.md`, `docs/grammar.md` (regenerated), `docs/gslides-parity/BUILD-STATUS.md`, `apps/studio/e2e/**`, `scripts/check.mjs` | Merges in the parity chain order, runs `pnpm check` after each merge, writes the ten task spec `gslides-tasks.spec.ts` from section 10, keeps the menu model and the layout data as the two shared contracts | `pnpm check` 19 steps green on the merged tree; contracts current; the e2e set green against `vite preview` |
| Verifier | `docs/gslides-parity/VERIFICATION.md` and the evidence folder | Runs every acceptance row above on the final tree, the tooltip audit, the chrome lint, one Perfect export of a new deck on production, the ten tasks by hand on production with screenshots, and records what Kevin must decide | A report with numbers, the same shape as `docs/EDITOR-DEPTH-STATUS.md` |

The cut line if the round runs short: B1, B3, B4 and B5 are the round; B6 and the rotation, group and chart rows of B2 move to the next round and their menu items stay as ship later stubs. Nothing in the default view may name an internal noun at the cut line either.

## 12. Risks

1. Grammar decisions sit with Kevin. Italic, bullets and rotation each contradict a written rule (SPEC 4.2 "four rules, nothing else", SPEC 2.1 "ruled rows and lists instead of bullets", `docs/freeform.md` "rotation stays out"). The proposal ships italic and rotation and holds bullets; if Kevin declines, the menu items become ship later stubs and the export set stays at two weights.
2. Schema growth. Section 7 adds eleven optional fields and two blocks. Every one is optional and migrates cleanly, but the validator, the reducer, the renderer, the linter, both exporters, the CLI and the MCP tools all grow, and the contracts step must stay current on every merge.
3. The Perfect export time. 190 to 222 s for 85 slides against the 300 s function limit (`docs/EDITOR-DEPTH-STATUS.md` section 10). New blocks add nothing per page, but the GT brand deck export from File > Download can still time out; the worker service stays the fix, and the download toast says how long a large deck takes.
4. Placeholder rendering in thumbnails. Whether Google's filmstrip shows prompt text is unverified (R09 item 6); the proposal shows it in the editor and thumbnails and hides it everywhere else. If Kevin prefers blank thumbnails, it is one renderer flag.
5. The draft root. Creating the deck on the first write keeps the store clean, but a rep who opens the root twice gets two drafts, and a rename before any content creates a deck with one empty slide. Both match Google's behaviour closely enough; the recents list makes the second draft visible.
6. Shared store without identity. Every deck is visible to every visitor and anyone can trash a deck (R10 B6). Trash is reversible for 30 days and every trash action is a version record, which is the honest bound until identity exists.
7. Unverified Google facts. The filmstrip context menu order, the Move submenu nesting, the toolbar dividers, and the default panel on a new presentation are reconstructions (R01, R02 section 13, R08). The proposal follows the reports; a signed in check by Kevin on his own account settles each in a minute and the menu model makes the fix one line.
8. The 460 to 320 px panel. The generated inspector's widest controls (the typography composite, the asset card) reflow; the tooltip audit and the chrome lint must pass at 320 px in both themes.
9. Three chrome rows plus a menu bar on Prototemplate's line law. The title row, toolbar and stage mat stack three rules within 112 px; the chrome lint's 4 px doubling rule passes on paper, and the verifier runs it at three widths.
10. Text model changes touch the export scene. Paragraph breaks ride on the existing per line hard breaks, but italic needs a new font instance and a fonts.build run, and rotated text leaves an unrotated invisible text layer in Perfect mode, searchable but not following the rotation, which the export report must name in `residual`.
11. Table cells and the copy linter. Twenty prices in a table are twenty Texts; the copy rules (heading period, sentence case) must skip table cells or they flood the Tools > Agent lint panel.
12. Blob store instability. The lost record and the 403 window recorded in `docs/EDITOR-DEPTH-STATUS.md` section 9 remain; a first write from the draft root that fails leaves the rep with a draft and a toast "Could not save. Retrying", and the retry logic already exists.
13. PPTX import is out of this round. Sales users who receive decks as PPTX will look for File > Import slides > Upload and find bundles only; the tab says when PPTX arrives.
14. Hidden agent surfaces. Moving lint, source, twin and the palette's Actions group under Tools > Agent changes nothing for agents (they use the CLI, MCP and the window API), but the chrome tests that reference the old toolbar ids must move with them.

## Sources

The eleven research reports, read in full on 2026-09-11: `docs/gslides-parity/research/01-menu-bar.md` (R01), `02-editor-surface.md` (R02), `03-home-themes-layouts-io.md` (R03), `04-present-and-shortcuts.md` (R04), `05-objects-and-format-options.md` (R05), `06-turboslide-inventory.md` (R06), `07-sales-users.md` (R07), `08-context-menus-and-menu-conventions.md` (R08), `09-canvas-text-editing-model.md` (R09), `10-identity-sharing-and-presence.md` (R10), `11-tables-charts-and-numbers.md` (R11).

Repository files read for this proposal at `8c7056c`: `docs/spec/SPEC.md` (sections 1 to 8, 11, 12), `docs/EDITOR-DEPTH-STATUS.md`, `docs/freeform.md`, `packages/schema/src/actions.ts` (the 54 ids), `packages/schema/src/deck.ts` (the slide types), `packages/schema/src/catalog.ts` (`LAYOUT_CATALOG`), `packages/chrome/src/slide-templates.ts` (the 15 templates), `packages/store/src/templates.ts` (the blank deck), `apps/studio/src/routes/index.tsx` (the root redirect), the chrome test list and the e2e spec list.

Google pages the proposal leans on, all read by the research agents on 2026-09-11 and reproduced here with that date; this proposal did not open them again:

- Keyboard shortcuts for Google Slides. https://support.google.com/docs/answer/1696717
- Use Google Slides with a screen reader. https://support.google.com/docs/answer/1634140
- Add, delete & organize slides. https://support.google.com/docs/answer/1694830
- Use a template or change the theme, background, or layout in Google Slides. https://support.google.com/docs/answer/1705254
- Insert and arrange text, shapes, diagrams, and lines. https://support.google.com/docs/answer/1696521
- Insert or delete images & videos. https://support.google.com/docs/answer/97447
- Add and edit tables. https://support.google.com/docs/answer/1696711
- Link a chart, table, or slides to Google Docs or Slides. https://support.google.com/docs/answer/7009814
- Change how text fits in placeholders & text boxes. https://support.google.com/docs/answer/10364036
- Present slides. https://support.google.com/docs/answer/1696787
- Find what's changed in a file. https://support.google.com/docs/answer/190843
- Create, view, or download a file. https://support.google.com/docs/answer/49114
- Make Google Docs, Sheets, Slides & Forms public. https://support.google.com/docs/answer/183965
- Share files from Google Drive. https://support.google.com/docs/answer/2494822
- Delete a document, spreadsheet, presentation, or video. https://support.google.com/docs/answer/6023494
- Tool finder for Docs, Sheets, Slides & Vids. https://support.google.com/docs/answer/13466905
- Zoom or change your document view. https://support.google.com/docs/answer/99753
- Work with links & bookmarks. https://support.google.com/docs/answer/45893
- Crop & adjust images. https://support.google.com/docs/answer/4600160
- Check your spelling in Google Slides. https://support.google.com/docs/answer/9764808
- Use add-ons, Apps Script, AppSheet & Data Studio. https://support.google.com/docs/answer/2942256
- Apps Script reference, Enum PredefinedLayout. https://developers.google.com/apps-script/reference/slides/predefined-layout
- Apps Script reference, Enum ShapeType. https://developers.google.com/apps-script/reference/slides/shape-type
- Slides API, presentations.pages tables. https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/tables
- Slides API, presentations.pages text. https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/text
- Menu and toolbar updates in Google Docs editors, 2018-03-07. https://workspaceupdates.googleblog.com/2018/03/menu-and-toolbar-updates-in-google-docs.html
- Enhanced menus in Google Slides and Drawings, 2022-10-17. https://workspaceupdates.googleblog.com/2022/10/enhanced-menus-google-slides-drawings%20.html
- Refreshed interface for Drive, Docs, Sheets and Slides, 2023-03-06. http://workspaceupdates.googleblog.com/2023/03/refreshed-ui-google-drive-docs-sheets-slides.html
- New sidebar with design elements in Google Slides, 2025-03-31. https://workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html
- More options for copying presentations in Google Slides, 2020-01-08. https://workspaceupdates.googleblog.com/2020/01/copy-presentation-options-slides.html
- Arrow keys now move an object by a pixel distance in Google Slides, 2025-08-19. http://workspaceupdates.googleblog.com/2025/08/move-object-one-pixel-google-slides.html
- Alice Keeler, Google Slides: Right Click on the Filmstrip, 2017-11-08. https://alicekeeler.com/2017/11/08/google-slides-right-click-filmstrip/
- CustomGuide, Google Slides Quick Reference Guide (PDF, 2024). https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf
- Computerworld, Google Slides cheat sheet (updated 2025-09-04). https://www.computerworld.com/article/1658651/how-to-use-google-slides.html
- BrightCarbon, Google Slides: The ULTIMATE guide (2023-06-22). https://www.brightcarbon.com/blog/google-slides-ultimate-guide/
- Nielsen Norman Group, Progressive disclosure. https://www.nngroup.com/articles/progressive-disclosure/

Facts this proposal states from product knowledge and marks unverified where used: New slide after a Title slide inserting Title and body; the Themes panel opening on a new consumer presentation; whether the filmstrip shows prompt text; the nesting of the Move items in the filmstrip context menu.
