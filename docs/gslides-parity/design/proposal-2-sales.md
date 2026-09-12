# Proposal 2: sales first

Design proposal for the Google Slides parity round of Turboslide, written 2026-09-11 against commit `8c7056c`. This is the second of three proposals. Its angle is the salesperson: the design starts from the ten things a seller does with a deck, gives each the shortest path, and uses Google Slides' structure as the skeleton because the seller already knows it. Everything that a seller does not do in those ten tasks is either hidden behind a labelled secondary entry or left out with a reason.

## How to read this proposal

- Facts about Google Slides come from the eleven research reports in `docs/gslides-parity/research/`, cited as R01 to R11 with the section. Those reports read every public page on 2026-09-11; the URLs are repeated in the Sources section at the end so this document stands alone. No Google page was reopened for this proposal, and no account was signed in. Where a report marks a Google behaviour unverified, this proposal says so at the point of use and designs a behaviour that does not depend on it.
- Facts about Turboslide are lines of source at `8c7056c`, named by path, or facts from `docs/spec/SPEC.md`, `docs/EDITOR-DEPTH-STATUS.md`, `docs/freeform.md`, `docs/deck-transfer.md` and `docs/pptx.md`.
- Every menu item, toolbar button and shortcut is marked in one of three ways. Now means it ships in this round. Later means the control is present, disabled, with the tooltip "Not available in Turboslide yet" plus one clause saying what would make it available; it stays in Google's position so the menu is complete. Omit means the item is not in the menu, and the reason is given. The count of Later items is kept low on purpose (section 2.12), because a menu of grey items reads as broken.
- Labels follow Google's words in sentence case. Where Google's label is a trademark or names a Google service (Drive, Photos, Meet, Gemini, Keep, Sheets) the item is omitted or relabelled; the words "Google Slides" appear here only as the reference product. Icons are Heroicons 20 solid from the theme sprite; nothing of Google's artwork is copied.
- Rules of the text: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings.

## The decisions this proposal does not reopen

Kevin took these on 2026-09-11 and the proposal builds on them: the root address opens a fresh presentation in the editor titled Untitled presentation with one title slide from the GT template as its theme; New slide and Apply layout offer that theme's slide layouts; the GT brand deck stays available to open and present; the editor mirrors Google Slides' structure (title row, menu bar with File, Edit, View, Insert, Format, Slide, Arrange, Tools, Extensions, Help, the toolbar order, filmstrip left, canvas, speaker notes below, right panel for Themes and Format options, Slideshow and Share top right), its behaviours and its shortcuts; the audience is non-technical sales people; the visual language stays Prototemplate (Inter, paper and ink, hairlines, the `--pt-` tokens, Heroicons 20 solid); the block document, the grammar linter, the actions table and the Perfect PPTX export stay the foundation; agent-facing surfaces (lint, source drawer, twin, revision chips, leases, the command palette internals, data-control ids) leave the default view; a deck can be moved to trash from the UI.

## 0. The ten tasks, and the rule they impose

R07 (the sales user report) establishes who the user is: a seller who edits an existing deck far more often than building one, who changes a small set of slides per prospect (cover, logo wall, agenda, pricing, numbers), who presents over a call and sends a PDF or a link afterwards, who never draws, animates or opens a theme editor. The ten tasks below are that report's task table reduced to what a seller does weekly, in the order of frequency R07 reports.

| # | Task | Google's path (R07 table 1) | The path this proposal gives, in the editor as designed here |
| --- | --- | --- | --- |
| 1 | Open the right deck | Home page, Recent presentations, click | Home page (`/decks`), the recent list, one click; or Cmd+O inside the editor |
| 2 | Make a copy for a prospect and rename it | File > Make a copy > Entire presentation; click the title to rename | File > Make a copy > Entire presentation, a dialog with the name prefilled and "Remove speaker notes"; the copy opens in a new tab already named |
| 3 | Retype the customer name and a few numbers, on one slide and across the deck | Click into the text, type; Edit > Find and replace | Click into the text (the caret lands where the click was), type, Esc keeps it; Cmd+H opens Find and replace with Replace all |
| 4 | Swap a customer logo or screenshot | Right-click the image > Replace image; or drop a file on it | Drop a file on the image, or right-click > Replace image > Upload from computer; the frame is kept |
| 5 | Add, duplicate, delete and reorder slides | Ctrl+M, Ctrl+D, Delete, drag in the filmstrip | The same four, plus the filmstrip right-click menu with Google's items |
| 6 | Hide slides that do not apply to this prospect | Right-click > Skip slide | Right-click > Skip slide (multi-select works); skipped slides leave the slideshow, the view link and every download by default |
| 7 | Update the pricing table and the big number slide | Click a cell, Tab through cells; click the number and type | Insert > Table and a Table block with Tab between cells; the Big number layout |
| 8 | Write a talk track | Click to add speaker notes, below the canvas | The same pane, the same words |
| 9 | Present over a call | Slideshow, or its arrow for Presenter view | Slideshow at the top right; the arrow opens Presenter view in a second window with notes and a timer |
| 10 | Send a PDF or a link afterwards | File > Download > PDF Document (.pdf); Share > Copy link | File > Download > PDF Document (.pdf) or Microsoft PowerPoint (.pptx); Share > Copy link gives a view-only link with notes and skipped slides removed |

The rule these impose: every control a seller needs for these ten tasks is on the toolbar, in the menu bar, in a right-click menu and on Google's shortcut, in that order of discovery (R07, conventions to keep). Anything else is one labelled level deeper (a dropdown arrow, a menu item, a Tools submenu, a Format options section) or out of the default view.

## 1. Screen anatomy

The editor at `/edit/:deckId`, default state of a fresh presentation: nothing selected, the filmstrip in thumbnail density, the speaker notes pane at its one-line default, the Themes panel open on the right (Google's default for a new presentation is reported by two secondary sources and not confirmed by a Google page, R03 a.3; opening it here is a design choice, since the seller's first question on a blank deck is which look they are in). Sizes are in CSS pixels at a 1440 by 900 window; the proportions come from R02 section 11 (title, menu and toolbar rows together about 12 to 14 percent of the window; the filmstrip about a fifth of the width; the notes pane about a twentieth of the height) and the pixel values from the chrome package's existing tokens (`--pt-bar-h` 52, `--pt-sb-w` 208 or 256, `--pt-panel-w` 460, `--pt-radius` 6, `packages/chrome/src/tokens.css`, SPEC 2.2).

```
1440 x 900, panel open
+--------------------------------------------------------------------------------------------------+
| [GT] Untitled presentation          All changes saved   (clock)   [ Slideshow |v ] [ Share ]      |  title row 44
|  File  Edit  View  Insert  Format  Slide  Arrange  Tools  Extensions  Help                        |  menu bar 28
| [search] [+|v] [undo] [redo] [print] [paint] [Fit v] | [select] [T] [img v] [shape v] [line v]    |  toolbar 40
|  [comment] | Background  Layout v  Theme                                                    [^]   |  (one row; wraps to two under 1100)
+-----------+--------------------------------------------------------------------+-----------------+
| 1 [=====] |                                                                    | Themes       x  |
|   [thumb] |     +------------------------------------------------+             |                 |
|           |     |                                                |             | GT              |
|           |     |         sheet 1600 x 900, scaled to fit        |             | [light][dark]   |
|           |     |         (k = 0.53 here, 848 x 477)             |             |                 |
|           |     |                                                |             |                 |
|           |     +------------------------------------------------+             |                 |
|           |                                                                    |                 |
|           |  ...                                                               |                 |
|           |  Click to add speaker notes                                        | [Import theme]  |
+-----------+--------------------------------------------------------------------+-----------------+
| [filmstrip][grid]                                                     Slide 1 of 1     100%     |  status bar 32
+--------------------------------------------------------------------------------------------------+
  256          canvas area: 1440 - 256 - 320 = 864 wide, 900 - 112 - 64 - 32 = 692 tall     320
```

Region by region:

| Region | Size | Contents | What changed from `8c7056c` |
| --- | --- | --- | --- |
| Title row | 44 tall | Left: the GT mark as a link to the home page (`/decks`), the title field (click to rename, Enter commits, Esc restores; `deck.rename`), the save state as words ("All changes saved", "Saving…", "Not saved yet" on `/new`, "Couldn't save, retrying"), the Last edit clock icon that opens Version history. Right: Slideshow as a split button (the one solid button in the row), Share. No star, no folder, no avatar, no comments icon this round (section 2.0) | New. The deck name moves here from the toolbar's status slot; the status chip's revision, lease and lint parts leave the default view (`packages/chrome/src/StatusChip.tsx`, `DeckName.tsx`) |
| Menu bar | 28 tall | File, Edit, View, Insert, Format, Slide, Arrange, Tools, Extensions, Help, left aligned, 13 px Inter, 12 px gaps; the "Hide the menus" chevron at the right end (Ctrl+Shift+F) | New (`MenuBar.tsx`) |
| Toolbar | 40 tall | A fixed head and a contextual tail in Google's order (section 3); 32 px controls (`ToolButton`), thin vertical dividers in `--pt-hair` after Zoom, after Comment and before Background | Rebuilt from `Toolbar.tsx`; the Edit, View, Twin, Lint, Source, Presentation, Export, Book, Theme, Present, Fullscreen, Copy link and Help controls leave this row (their new homes are in section 2 and appendix A) |
| Filmstrip | 256 wide | One 16:9 card per slide (200 by 112) with its number in a 28 px gutter, the current card outlined in `--pt-ink`, skipped cards at 40 percent opacity with an eye-slash glyph; section labels as 20 px titanium rows when the deck has more than one section; drag to reorder; right-click menu; Shift and Cmd multi-select | `Sidebar.tsx` keeps the tree, drops the density Seg, the filter row, the count, the kind glyph, the lint badge and the lease dot from the default view |
| Canvas | fills | The sheet scaled to Fit (the default) or to a zoom value; 28 px padding; the selection ring and handles from `Overlay.tsx`; the hover outline | Unchanged geometry; the selection chip no longer prints `type · id` |
| Speaker notes | 64 tall by default, drag to 40 percent of the window, drag down to hide | A plain textarea bound to `slide.notes`, placeholder "Click to add speaker notes", a three-dot drag handle on the divider; View > Show speaker notes toggles it; Ctrl+Alt+Shift+S focuses it | New (`NotesPane.tsx`); the Notes textarea leaves the inspector's Slide section |
| Right panel | 320 wide, closed by default | One slot: Themes, Format options, Version history, Check slides (Tools). Opens from a toolbar button, a menu item or a right-click item; an X at the top closes it; only one panel at a time (R03 finding 5) | The Inspector (460 px, always open in edit mode) becomes Format options at 320 px, on demand; its thirteen sections are regrouped (section 3.8) |
| Status bar | 32 tall | Left: filmstrip view and grid view toggle buttons. Right: "Slide 3 of 12" and the zoom value | New (`StatusBar.tsx`); replaces the toolbar's Previous, count and Next controls and the 2 px progress line |
| Compact mode | | Ctrl+Shift+F, or the chevron, hides the menu bar and the toolbar; a down chevron at the top right restores them | New |

At or below 1100 px wide the toolbar tail wraps to a second 40 px row rather than hiding into a More menu (R02 section 4 says Google collapses into a More button; the wrap keeps every button visible with its label, which R07's unlabelled-icon finding argues for). At or below 900 px the filmstrip becomes the overlay it already is (`Sidebar.css`), the right panel becomes a sheet over the canvas, and the notes pane hides by default.

Themes and tokens: the chrome keeps `--pt-` and the line law (every rule 1 px, drawn once, in one of three roles, SPEC 2.2). New seams: the menu bar draws no rule (the toolbar's bottom edge is the one rule under the top area); the notes divider is `--pt-hair` with the drag handle on it; the status bar draws `--pt-hair` above itself; the right panel's left edge stays the panel's.

## 2. The menu bar

Every Google menu item from R01, in Google's reported order, mapped to a Turboslide action, panel or route. "Action" names an id in `packages/schema/src/actions.ts` (54 ids at `8c7056c`); a name marked new is an action this round adds to the table so the CLI, MCP and window API keep parity (SPEC 7.1). Shortcuts are Google's (R01, R04), Mac form first where they differ.

### 2.0 The title row controls that Google puts above the menu bar

| Google control | Turboslide | Round | Note |
| --- | --- | --- | --- |
| App icon | The GT mark, a link to `/decks` | Now | The Sidebar's "Every deck" link moves here |
| Title field, "Untitled presentation" | `deck.rename` on Enter or blur | Now | Exists as `DeckName.tsx` |
| Star | none | Omit | Starring needs a person to star for; there are no accounts (R10 B1). A later round with a display name can add a browser-local favourite |
| Move (folder) | none | Omit | No folders |
| Document status (cloud) | The save words in the title row | Now | Reads "All changes saved" after every acknowledged write, "Saving…" while the queue is non-empty, "Couldn't save, retrying" on a refused write (the six retries of `edit.$deckId.tsx`), "Not saved yet" on `/new` before the first edit (section 6.1) |
| Last edit (clock) | Opens Version history in the right panel | Now | Tooltip "Last edit 2 minutes ago"; the author label is shown only when it is not the default `studio` |
| Show all comments | none | Later | Comments are document data that can ship without accounts (R10 C1); they are not in the ten tasks, so the icon is a Later stub |
| Meet | none | Omit | A Google service |
| Record | none | Omit | A Google service |
| Slideshow with the down arrow | `view.present` and the presenter route | Now | Section 9 |
| Share | The Share dialog | Now | Section 6.6 |
| Account avatar | none | Omit | No accounts. A display name prompt stored in the browser is R10's first identity step and is a later round |
| Ask Gemini | none | Omit | Not on plans without Gemini either (R02 8.5); Turboslide's agents reach the deck through MCP and the API (Extensions > Agent access) |

### 2.1 File

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| New > Presentation | Opens `/new` in a new tab | Now | Section 6.1 |
| New > From template gallery | Opens `/decks#templates` in a new tab (the home page scrolled to the template strip) | Now | Section 6.2 |
| Open… (Cmd+O, Ctrl+O) | The Open dialog: a search field and the studio's presentations newest first, thumbnails, an Upload tab that takes a Turboslide bundle (.zip) | Now | Reuses `listDecks()` and the bundle upload route; the dialog is the home page's list in a modal |
| Import slides | The Import slides dialog: step 1 Presentations (this studio's decks) or Upload (a .zip bundle; a .pptx is refused with "PowerPoint import is not available in Turboslide yet"); step 2 slide thumbnails with All and None, Back, "Import slides" | Now | New action `slide.import` (source deck id, slide ids, after): copies the slides with fresh ids and `ensureAssets` for their pictures, inserted after the current slide. "Keep original theme" is omitted: one theme |
| Make a copy > Entire presentation | The Copy dialog: Name (prefilled "Copy of <title>"), "Remove speaker notes" checkbox, Make a copy; the copy opens in a new tab | Now | New action `deck.copy` (source, name, slideIds?, removeNotes): pack and unpack under a new id on the server (`packages/store/src/zip.ts`, `unpack.ts`), strip `notes` when asked |
| Make a copy > Selected slides | Same dialog with the filmstrip selection | Now | Same action with `slideIds`; disabled unless two or more slides are selected, or one slide that is not the only slide |
| Share > Share with others | The Share dialog | Now | Section 6.6 |
| Share > Publish to web | The Publish dialog: Link tab (the `/deck/:id?present=1` link), Embed tab (the `/embed/:id` iframe snippet with a size dropdown); "Auto-advance slides" and the two checkboxes are Later inside the dialog; "Stop publishing" is omitted with the sentence "Every Turboslide presentation is reachable by anyone who has its link" | Now | Section 6.6 |
| Email > Email this file, Email collaborators | none | Omit | No mail service; the Share dialog's Copy link is the path |
| Download > Microsoft PowerPoint (.pptx) | The Download dialog (section 6.7); Perfect by default | Now | `export.run` |
| Download > ODP Document (.odp) | none | Omit | No ODP writer and no sales demand in R07 |
| Download > PDF Document (.pdf) | The print route rendered to PDF by Chromium in the render worker (`page.pdf()`), one slide per page at 13.333 by 7.5 in | Now | New `export.run` format `pdf` (the type exists, no builder does, R11 B1); risk in section 12 |
| Download > Plain Text (.txt) | Every slide's texts in order, then its notes, one slide per paragraph block | Now | Trivial: `blockTexts` and `slideTexts` from `packages/lint/src/context.ts` |
| Download > JPEG image (.jpg, current slide) | `render.slide` at 2x, JPEG q92 | Now | Exists as the render route |
| Download > PNG image (.png, current slide) | `render.slide` at 2x, PNG | Now | Exists |
| Download > Scalable Vector Graphics (.svg, current slide) | none | Omit | The sheet has raster blocks (icons, marks, pictures, dithers); an SVG that embeds rasters would misrepresent the file type |
| (Turboslide) Download > Web page (.html) | `build.run`, the standalone file | Now | Not a Google format for Slides; a Turboslide strength kept in the list, last but one |
| (Turboslide) Download > Turboslide bundle (.zip) | `deck.pack` through the bundle route | Now | Last item; the file the Import slides Upload tab and Open's Upload tab read |
| Rename | Focuses the title field | Now | |
| Move | none | Omit | No folders |
| Add shortcut to Drive | none | Omit | A Google service |
| Move to trash | `deck.trash` (new), then a toast "Moved to trash · Undo" and navigation to `/decks` | Now | Section 6.4 |
| Version history > Name current version | A small dialog: Name, Save; `version.save` with the note | Now | Exists as the Versions section; the field moves into this dialog |
| Version history > See version history (Cmd+Option+Shift+H, Ctrl+Alt+Shift+H) | The Version history panel in the right slot: versions grouped by day, "Only show named versions" toggle, Restore this version, per-version menu with Name this version and Make a copy | Now | `version.list`, `version.restore`, `deck.copy` at a version. "Show changes" is Later (`diff.run` has no editor handler, R06 section 3) |
| Approvals | none | Omit | Workspace only |
| Make available offline | none | Omit | Present mode keeps working after load without the network (R07 rule 29); nothing to set up |
| Details | A small dialog: title, slides, sections, created, last edit | Now | `deck.info` |
| Language | none | Omit | One face and English copy rules; spelling follows the browser's language |
| Page setup | none | Omit | The GT theme is 16:9 at 1600 by 900 and the renderer has no other size (R03 finding 11). A tooltip on the omitted position is not possible, so Help > Keyboard shortcuts carries a line "Slides are 16:9" |
| Print settings and preview | The print preview at `/print/:deckId`: a toolbar with "1 slide without notes | 1 slide with notes", "Include skipped slides" off by default, "Download as PDF", "Print", "Close preview" | Now | Handout layouts (2, 3, 4, 6, 9 per page) are Later inside the layout dropdown |
| Print (Cmd+P, Ctrl+P) | Opens the print preview | Now | |

### 2.2 Edit

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| Undo (Cmd+Z) | The client history (inverse writes) | Now | Exists as keys only; gains the menu item and the toolbar button |
| Redo (Cmd+Y or Cmd+Shift+Z) | Same | Now | Cmd+Y added |
| Cut (Cmd+X) | Slides in the filmstrip, blocks on the canvas, text in a run | Now | New: an in-page clipboard of slide or block JSON plus the system clipboard as `text/plain` JSON with a `turboslide` marker, so paste works across tabs; a cut is copy plus `slide.remove` or `block.remove` |
| Copy (Cmd+C) | Same | Now | |
| Paste (Cmd+V) | Slides after the selected slide (`slide.insert` with fresh ids, assets ensured); blocks onto the current slide (`block.insert`, on a freeform slide offset 16 px from the source box); text at the caret | Now | Pasting slides from another deck asks nothing: one theme (R08 A25's prompt is moot) |
| Paste without formatting (Cmd+Shift+V) | Text at the caret, plain | Now | Text paste is already plain (`InlineText.tsx`); this is the same path with the label |
| Delete | The selected slide or block; text | Now | No confirmation; the toast reads "Slide deleted · Undo" |
| Duplicate (Cmd+D) | The selected slide or block | Now | Exists for slides in the row menu; the key and the block case are new (`block.insert` of a copy) |
| Select all (Cmd+A) | Every block on the slide when the canvas has focus; every slide when the filmstrip has focus; the run's text when editing | Now | |
| Select none | Clears the selection | Later | Google's chord (Ctrl+Alt then U then A) is rarely known; Esc does it |
| Find and replace (Cmd+Shift+H, Ctrl+H) | The dialog: Find, Replace with, Match case, Prev, Next, Replace, Replace all | Now | New action `text.replaceAll` (find, replace, matchCase, slideIds?) over every Text and notes through `blockTexts` and `slideTexts`; one write, one undo. Cmd+F opens the lighter Find bar (the sidebar filter's matcher over the deck, highlights in the filmstrip) |

### 2.3 View

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| Slideshow (Cmd+Enter, Ctrl+F5) | `view.present` from the current slide | Now | |
| Motion | none | Omit | No transitions or animations (section 5.6) |
| Theme builder | none | Omit | The GT theme is edited in the repository (`packages/theme`); Slide > Edit theme is the Later stub |
| Grid view | The existing Grid mode | Now | Checkmark item; the status bar toggle does the same |
| Zoom > Zoom in (Cmd and plus), Zoom out (Cmd and minus), Fit, 50%, 100%, 200% | A zoom state on the stage (`k` from the value instead of the container); Fit is the default; Cmd+0 is 100% | Now | New; the stage already scales by `k` |
| Show ruler | none | Later | Rulers matter for indents, which this round does not have |
| Guides > Show guides, Add vertical guide, Add horizontal guide, Edit guides, Clear guides | none | Later | Snap guides exist during a drag (`packages/schema/src/freeform.ts`); user guides need a deck-level field |
| Snap to > Guides | The rails, content edges and centres, seams and plate edges | Now | On by default, as Google's |
| Snap to > Grid | The 8 px grid | Now | On by default here (Google's is off, R05 C7); the grid is how freeform stays on the theme's rhythm, and the toggle exists |
| Comments > Hide, Minimize, Expand | none | Later | With comments |
| Live pointers | none | Omit | Needs presence (R10 C1); not in the ten tasks |
| Show speaker notes | Toggles the notes pane | Now | |
| Show filmstrip | Toggles the filmstrip | Now | Exists as `view.sidebar` |
| Mode > Editing, Viewing | Editing is the editor; Viewing hides handles, the Format options button and the notes pane's edit state, the way `?edit=0` does today | Now | The Edit and View Seg leaves the toolbar; Commenting is Later |
| Full screen (Ctrl+Shift+F) | Hides the menu bar and toolbar (compact mode); Esc restores | Now | Google's shortcut page names the same key for both (R01 View); one behaviour here |
| (Turboslide) Show sections | Toggles the section labels in the filmstrip | Now | On by default when the deck has more than one section |

### 2.4 Insert

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| Image > Upload from computer | The OS file picker; one step; the picture lands on the slide (`asset.add` then `block.insert` of a `shot`, or `slide.set /picture/asset` on a picture layout) | Now | Alt text defaults to the file name without its extension and is edited in Format options > Alt text; role defaults to `capture`; up to 25 MB (the action's cap) |
| Image > Stock & web, Drive & Photos, Camera | none | Omit | Google services and the licensing hazard R07 names (web images without attribution) |
| Image > By URL | A field with a preview; `asset.add` from the URL | Now | |
| Text box | `text` block; click on a freeform slide places a 480 by 64 box at the click, drag draws one; on a grammar slide the box lands in the selected slot | Now | Exists as `insert.block.text` |
| Audio | none | Omit | No media primitive; not in the ten tasks; the Perfect export cannot carry it |
| Video | none | Omit | Same |
| Shape > Shapes | Rectangle, rounded rectangle, ellipse (the `shape` block) | Now | Exists; the 140-preset gallery is Later |
| Shape > Arrows | Arrow | Now | Exists |
| Shape > Callouts, Equation | none | Omit | Not in the theme's grammar; not in the ten tasks |
| Table | A grid picker (hover to pick columns by rows, up to 20 by 20) that inserts a `table` block | Now | New block, section 7.5 |
| Chart > Bar, Column, Line, Pie | none | Later | A `chart` block edited as a small grid in Format options is the design (R11 C1, R07 rule 23); it is the largest new block and follows the table |
| Chart > From Sheets | none | Omit | A Google service |
| Diagram | none | Later | The `dia` block exists (declared grammar, SPEC 4.2) and needs a picker of the GT diagram shapes |
| Word art | none | Omit | The Big number layout and the ladder's 88 px size are the theme's answer (R11 A11) |
| Line > Line, Arrow | The `shape` block's line and arrow kinds, and the `rule` block | Now | Exists |
| Line > Elbow connector, Curved connector, Curve, Polyline, Scribble | none | Omit | Not in the theme's stroke grammar (1 px or 1.5 px straight strokes, SPEC 2.1) |
| Special characters | none | Omit | The operating system's character picker works inside the editable run |
| Animation | none | Omit | Section 5.6 |
| Link (Cmd+K) | The link popover on selected text: Text, Link (URL), "Slides in this presentation" (Next, Previous, First, Last, then each slide), Apply; Change and Remove on a linked run | Now | Text links exist (`[text](url)`); slide targets are new: a link of the form `#s/<slideId>` that the viewer and the standalone build resolve, and the PPTX writer maps to a slide hyperlink |
| Comment (Cmd+Option+M) | none | Later | With comments |
| New slide (Ctrl+M) | `slide.insert` of the current slide's layout with empty placeholders, after the current slide | Now | Section 5.3 |
| Slide numbers | A dialog: On, Off, "Skip title slides", Apply | Now | The theme frame draws the counter on every slide today (`renderStage`, SPEC 5.2); this becomes `deck.defaults.counter` (on by default, off, or on except title slides) through `deck.set` |
| Placeholder | none | Omit | Theme builder only |
| Templates | none | Later | A right panel of slide sets built from the layouts (a sales starter: Title, Section header, Title and body times three, Big number, Closing) |
| Building blocks | none | Omit | Table, list and Big number cover the agendas, lists and key statistics Google lists (R01 Insert) |
| Speaker spotlight | none | Omit | A Google Meet feature |
| (Turboslide) Icon | The Heroicons picker inserting an `icon` block | Now | Exists |

### 2.5 Format

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| Text > Bold (Cmd+B) | The weight 500 run (`*text*`) on a selection; `typography.weight` 500 on a selected block | Now | Exists as "Weight 500 run"; relabelled Bold |
| Text > Italic (Cmd+I) | none | Later | The theme has one style of Inter and the export set has no italic cut (R09 finding 7); the tooltip says so |
| Text > Underline (Cmd+U) | none | Later | Same grammar reason |
| Text > Strikethrough | `no` on a list item (the ruled list's strike) | Now | Run-level strike is Later |
| Text > Superscript, Subscript | none | Omit | Not in the grammar; not in the ten tasks |
| Text > Size > Increase font size (Cmd+Shift+>), Decrease (Cmd+Shift+<) | One step along the type ladder on `typography.size` | Now | Heading, paragraph, text and box blocks |
| Text > Capitalization | none | Omit | The copy rules want sentence case; a lowercase and sentence case pair could return later |
| Align & indent > Left, Center, Right (Cmd+Shift+L, E, R) | `typography.align` | Now | Text, box, heading and paragraph |
| Align & indent > Justified | none | Omit | `TYPE_ALIGNS` has no justify; the grammar sets ragged right |
| Align & indent > Increase indent, Decrease indent (Cmd+], Cmd+[) | none | Later | With list levels (section 7.7) |
| Align & indent > Indentation options | none | Omit | Unverified in Slides (R05 B2) and no indent model here |
| Line & paragraph spacing > Single, 1.15, 1.5, Double, Custom | `typography.leading` steps shown as their values (1.02, 1.1, 1.3, 1.5, 1.7) | Now | The theme's steps, not Google's four; the label is Google's |
| Bullets & numbering > Bulleted list (Cmd+Shift+8) | Turns the selected paragraph or text block into a ruled statement list (`plain`), one item per paragraph; on a list, adds the marker | Now | The GT theme has ruled rows instead of bullets (SPEC 2.1); the tooltip reads "Lists in the GT theme are ruled rows" |
| Bullets & numbering > Numbered list (Cmd+Shift+7) | The same `plain` block with `numbered: true`, a tabular numeral at each row start | Now | New field, section 7.7 |
| Bullets & numbering > List options | none | Omit | |
| Table > Insert row above, Insert row below, Insert column left, Insert column right, Delete row, Delete column, Delete table, Distribute rows, Distribute columns | The table block's commands, one `block.set` each | Now | With the table block; also on the cell right-click menu |
| Table > Merge cells, Unmerge cells | none | Later | Spans on the table block are a second step |
| Image > Crop image | The `shot` crop anchor (top or centre) as two buttons | Now | Free cropping (offsets) is Later; the tooltip says "Crop to the top or the centre" |
| Image > Mask image | none | Omit | Not in the grammar |
| Image > Replace image | The Replace image submenu: Upload from computer, By URL, From this presentation (the asset picker) | Now | `block.set /asset` or `slide.set /picture/asset`; a drop on the image does the same |
| Image > Reset image | none | Later | Needs crop offsets to reset |
| Image > Image options | Opens Format options at the picture sections | Now | |
| Borders & lines > Border color, Border weight | `stroke` and `strokeWidth` on box and shape; `border` on shot; `weight` on rule | Now | Exists as inspector controls; gains the toolbar buttons |
| Borders & lines > Border dash | none | Later | The stroke grammar is solid |
| Format options | The right panel (section 3.8) | Now | The Inspector, renamed, on demand |
| Clear formatting (Cmd+\) | Removes `typography`, `color`, `fill`, `stroke` overrides from the selected block | Now | One `block.set` per field, one write |

### 2.6 Slide

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| New slide (Ctrl+M) | As Insert > New slide | Now | |
| Duplicate slide (Cmd+D) | `slide.get` then `slide.insert` | Now | Exists |
| Delete slide | `slide.remove` | Now | |
| Skip slide | `slide.set /skip true`; the item reads "Unskip slide" on a skipped slide | Now | New slide field, section 7.9 |
| Move slide > Move slide up, down, to beginning, to end (Cmd+Up, Cmd+Down, Cmd+Shift+Up, Cmd+Shift+Down) | `slide.move` | Now | Exists; the four items and keys are new |
| Change background | On a Section header, Caption or Closing layout: the Replace image submenu for the picture. On other layouts: disabled with the tooltip "This layout has no background. Use Section header, Caption or Closing for a full picture" | Now | The grammar has no per-slide background (R08 C7) and the theme's paper is the background |
| Apply layout | The layout grid (section 5) | Now | New action `slide.applyLayout` |
| Transition | none | Omit | Section 5.6 |
| Edit theme | none | Later | Tooltip: "The GT theme is edited in the repository" |
| Change theme | The Themes panel | Now | Section 5.5 |

### 2.7 Arrange

On a freeform slide every item acts on the selection through the existing actions. On a grammar slide (cols, split, center, left-mid, stack) blocks line up by the layout, so Align, Distribute and Center on page are disabled with the tooltip "Blocks on this layout line up automatically. Choose the Blank layout to place them by hand", and Order moves the block within its slot.

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| Order > Bring to front (Cmd+Shift+Up), Bring forward (Cmd+Up), Send backward (Cmd+Down), Send to back (Cmd+Shift+Down) | `block.order` front, forward, backward, back on freeform; `block.move` one place within the slot on grammar slides | Now | front and back are unbound today (R06 row 87) |
| Align > Left, Center, Right, Top, Middle, Bottom | `block.align` | Now | Exists in the arrange bar |
| Distribute > Horizontally, Vertically | `block.distribute`; three or more blocks | Now | Exists |
| Center on page > Horizontally, Vertically | `block.align` to the content box centre | Now | |
| Rotate > Rotate clockwise 90°, counter-clockwise 90°, Flip horizontally, Flip vertically | none | Omit | `pos` has no angle and the theme sets no rotated element (docs/freeform.md section 1, "Rotation stays out"); the reason is stated in Help > Keyboard shortcuts |
| Group (Cmd+Option+G), Ungroup | none | Later | A `group` block on freeform is section 7.8 |

### 2.8 Tools

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| Spelling > Spell check | none | Later | The browser's own underline and right-click suggestions ship now (section 7.10); the Change and Ignore card is Later |
| Spelling > Underline errors | Toggles `spellcheck` on the editable run and the notes pane | Now | On by default; `InlineText.tsx` turns it off today |
| Spelling > Personal dictionary | none | Omit | The browser's dictionary applies |
| Explore | none | Omit | Retired by Google in 2024 (R02 8.6) |
| Linked objects | none | Omit | No linked sources |
| Dictionary, Q&A history, Dictate speaker notes | none | Omit | Google services |
| Preferences | none | Later | Autofit and autocorrect preferences arrive with autofit |
| Accessibility settings | none | Omit | The browser's screen reader works on the DOM; every control has a label (AGENTS.md) |
| Activity dashboard | none | Omit | Needs identity |
| (Turboslide) Check slides | The lint panel in the right slot, relabelled: "Suggestions for this slide", one row per finding in prose with Fix where a fix exists; a count in the panel header only | Now | `lint.run` and `fix.run`; nothing about it is on the toolbar |
| (Turboslide) Advanced > Show source | The source drawer | Now | No key (Cmd+/ becomes Keyboard shortcuts) |
| (Turboslide) Advanced > Light and dark side by side | The twin stage | Now | No key |
| (Turboslide) Advanced > Show suggestion marks on the slide | The lint overlay | Now | |
| (Turboslide) Advanced > Show slide and block ids | Restores the `type · id` chip and the id tooltips | Now | Off by default |
| (Turboslide) Advanced > Copy slide id, Render this slide | The former row-menu items | Now | |
| (Turboslide) Advanced > Change history | The History panel ("Undo to here") | Now | |
| (Turboslide) Advanced > Run an action… | The full command palette with the Actions group | Now | Section 3.1 |

### 2.9 Extensions

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| Add-ons > Get add-ons, Manage add-ons | none | Omit | No marketplace |
| Apps Script, AppSheet | none | Omit | Google services |
| (Turboslide) Agent access | A dialog with the MCP address (`/mcp?deck=<id>`), the API address, the `turboslide deck push` and `pull` commands with this deployment's URL, and the sentence that a token is required and is never shown | Now | The Connect card leaves `/decks` and lives here |
| (Turboslide) Embed in a site | The Publish dialog's Embed tab | Now | A second entry point for the Prototemplate iframe |

### 2.10 Help

| Google item | Turboslide | Round | Note |
| --- | --- | --- | --- |
| Search the menus (Option+/, Alt+/) | The command palette filtered to menu items: label, menu path, key; typing runs the item | Now | The palette's Slides, Insert, View and Versions groups stay; the Actions group moves to Tools > Advanced > Run an action… |
| Help | A dialog with the ten tasks as one-line how-tos and a link to `docs/` | Now | |
| Training, Updates | none | Omit | |
| Help Turboslide improve | A link to the repository's issues | Later | Kevin decides where feedback goes |
| Privacy Policy, Terms of Service | none | Omit | |
| Keyboard shortcuts (Cmd+/, Ctrl+/) | The shortcuts dialog with a search box and Google's groups (section 8) | Now | The HelpCard rebuilt |

### 2.11 Menu behaviour

From R01 and R08 Part B: click opens a menu; with one open, hover switches menus and Left and Right arrows do the same; Up and Down walk items; a submenu opens on hover after 120 ms or at once from Right or Enter; Esc closes one level and returns focus to the parent, a second Esc returns focus to the menu title; every item shows its icon on the left and its key on the right; disabled items stay visible and grey and are skipped by the arrows; access keys are Google's (Mac Ctrl+Option plus the letter, Windows Alt plus the letter in Chrome). Every context menu item (section 4.2, section 3.9) is also in the menu bar, and the menu bar carries nothing the palette does not find.

### 2.12 The count

Across the ten menus and the title row, counting the rows of the tables above (a row may carry several Google items, for example the four Move slide items or the two Email items): 98 rows ship now, 14 of them Turboslide additions Google does not have (Tools > Check slides and the Advanced submenu, Extensions > Agent access and Embed in a site, View > Show sections, Insert > Icon, the two extra Download formats); 20 rows are Later stubs; 48 rows are omitted with a reason. The Later stubs cluster where a seller can name them: text styles and image extras under Format (six rows: Italic, Underline, the indent pair, Border dash, Merge cells, Reset image), comments (three rows: the title row icon, View > Comments, Insert > Comment), rulers and guides (two), charts and diagrams (two), and one row each for Templates, Select none, Edit theme, Group, the spell check card, Preferences and Help Turboslide improve. No menu other than Format has more than four grey rows, and Format's six are one subject, the text styles the GT theme does not have.

## 3. The toolbar

### 3.1 The fixed head, nothing selected

Google's order from R02 section 4.1 (the head order is stated as a left to right walk by two sources; the order between Zoom and Background is corroborated by every screenshot the reports describe and not stated as a list by a Google page, R02 section 13). Icons are Heroicons 20 solid names from the theme sprite; the sprite gains the ones marked new.

| # | Button | Icon | Turboslide | Round | Note |
| --- | --- | --- | --- | --- | --- |
| 1 | Search the menus (Option+/) | magnifying-glass | The palette filtered to menu items | Now | Tooltip "Search the menus (Option+/)"; the ⌘K pill leaves |
| 2 | New slide, with the "New slide with layout" arrow (Ctrl+M) | plus, chevron-down | `slide.insert` of the current layout; the arrow opens the layout grid | Now | The one split button on the toolbar |
| 3 | Undo (Cmd+Z) | arrow-uturn-left | client history | Now | New button |
| 4 | Redo (Cmd+Y) | arrow-uturn-right | client history | Now | New button |
| 5 | Print (Cmd+P) | printer | the print preview | Now | |
| 6 | Paint format | paint-brush (new) | none | Later | Copies `typography`, `color`, `fill`, `stroke` between blocks; small but not in the ten tasks |
| 7 | Zoom, showing Fit | text button "Fit ▾" | the zoom state | Now | Fit, 50%, 100%, 200%, and a typed value 25 to 400 |
| | divider | | | | |
| 8 | Select | cursor-arrow-rays | the default pointer; pressed after a draw tool finishes | Now | |
| 9 | Text box | a T glyph (new) | `insert.block.text` | Now | |
| 10 | Insert image ▾ | photo | Upload from computer, By URL, From this presentation | Now | |
| 11 | Insert shape ▾ | square-2-stack | Rectangle, Rounded rectangle, Ellipse, Arrow | Now | |
| 12 | Insert line ▾ | minus | Line, Arrow, Rule | Now | |
| 13 | Insert comment (Cmd+Option+M) | chat-bubble-left | none | Later | |
| | divider | | | | |
| 14 | Background | text button | picture layouts only; disabled otherwise with the tooltip of section 2.6 | Now | |
| 15 | Layout ▾ | text button | the layout grid, applies to the selected slides | Now | |
| 16 | Theme | text button | the Themes panel | Now | |
| 17 | Transition | | none | Omit | Section 5.6; the tail ends at Theme |
| 18 | Hide the menus (Ctrl+Shift+F) | chevron-up, at the far right | compact mode | Now | |

The head never changes. The tail (14 to 16) is replaced by the contextual tails below when something is selected, exactly as R02 section 4 describes Google's behaviour.

### 3.2 Text box, heading or paragraph selected, or the caret in text

Order from R02 section 4.2. Fill and border first, then the text controls, then Format options.

| # | Button | Turboslide | Round | Note |
| --- | --- | --- | --- | --- |
| 9 | Fill color | `fill` on a box (palette swatches, None, custom hex) | Now | Disabled on heading, paragraph and text blocks, which have no fill |
| 10 | Border color | `stroke` on a box | Now | Same |
| 11 | Border weight | `strokeWidth` 0, 1, 1.5, 2 | Now | |
| 12 | Border dash | none | Later | |
| 13 | Font | "Inter", disabled, tooltip "The GT theme sets Inter" | Now | The control is present so the row reads as Google's |
| 14 | Font size, minus and plus | `typography.size` along the ladder; the field shows the size; typing snaps to the nearest step with a toast naming it | Now | |
| 15 | Bold (Cmd+B) | the weight 500 run, or `typography.weight` 500 on the block | Now | |
| 16 | Italic (Cmd+I) | none | Later | |
| 17 | Underline (Cmd+U) | none | Later | |
| 18 | Text color | `color` on text and box blocks (palette swatches); `tone` ink or muted on heading and paragraph | Now | The grammar keeps semantic hues off sentences (SPEC 2.1), so the swatch row for heading and paragraph shows Ink and Muted only |
| 19 | Highlight color | none | Omit | Not in the grammar |
| 20 | Insert link (Cmd+K) | the link popover | Now | |
| 21 | Insert comment | none | Later | |
| 22 | Align ▾ | Left, Center, Right (`typography.align`); Top, Middle, Bottom disabled on grammar slides, `valign` on a freeform text box | Now | Vertical alignment on a freeform box is a new `pos`-level field; Later if it slips |
| 23 | Line spacing ▾ | `typography.leading` steps | Now | |
| 24 | Bulleted list (Cmd+Shift+8) | ruled list | Now | Section 7.7 |
| 25 | Numbered list (Cmd+Shift+7) | numbered ruled list | Now | |
| 26 | Decrease indent, Increase indent | none | Later | |
| 27 | Clear formatting (Cmd+\) | remove overrides | Now | |
| 28 | Format options | opens the right panel | Now | |

### 3.3 Shape selected

Fill color, Border color, Border weight, Border dash (Later), then the text controls of 3.2 because a box holds text (a `shape` block does not; its text controls are disabled with the tooltip "Use a text box for text over a shape, or insert a box"), then Format options.

### 3.4 Image selected

| # | Button | Turboslide | Round |
| --- | --- | --- | --- |
| 9 | Border color | `border` on shot as on or off; colour is the hairline | Now |
| 10 | Border weight | none | Later |
| 11 | Border dash | none | Later |
| 12 | Crop image, with the Mask arrow | the crop anchor: Top, Centre | Now (anchor); Later (free crop); Mask omitted |
| 13 | Replace image ▾ | Upload from computer, By URL, From this presentation | Now |
| 14 | Image options | Format options at the picture sections | Now |
| 15 | Reset image | none | Later |
| 16 | Format options | | Now |

### 3.5 Line selected

Line color (`stroke`), Line weight (`width` 1 to 4), Line dash (Later), Line start and Line end (`arrowheads` none, end, both, as two dropdowns each offering None and Arrow), Format options.

### 3.6 Table cell selected

Border color, Border weight, Border dash (Later), Fill color (the column or cell fill), then the text controls, then Format options. Row and column commands live on the cell's right-click menu and under Format > Table.

### 3.7 Slide selected in the filmstrip, or nothing selected on the canvas

Background, Layout, Theme, as in 3.1.

### 3.8 Format options, the right panel

The Inspector (`packages/chrome/src/Inspector.tsx`, thirteen sections) becomes Format options: 320 px, opened on demand, one panel at a time, sections named in Google's words where a Google section exists (R05 B7 and Part F item 7), generated from the same Zod annotations. Sections in order, per selection:

| Section (label) | Shown for | Fields | Source of the fields today |
| --- | --- | --- | --- |
| Size & rotation | any block on a freeform slide | Width, Height, "Lock aspect ratio"; Rotate shown disabled with the tooltip "Rotation is not part of the GT theme" | the position composite |
| Position | any block on a freeform slide | X, Y from the top left | the position composite |
| Layout | a block on a grammar slide | The layout's own fields in plain words: Columns 5/7, 4/8, 1/1; Gap; Alignment | the Layout section |
| Text fitting | text, box | Later: "Do not autofit", "Shrink text on overflow", "Resize shape to fit text" (section 7.2) | none |
| Text | heading, paragraph, text, box | Size, Weight, Alignment, Letter spacing, Line height (the typography composite) and Level or Role as a Seg | the Text section |
| Colour | box, shape, rule, text, icon | Fill, Border, Text colour swatch rows | the Color section |
| Picture | shot, pair, tiles, details, picture layouts | Replace image, Crop (Top, Centre), Border, Caption, Caption size | the Asset section's picker and the shot fields |
| Table | table | Header row, Column widths, Column alignment, Fill per column | new |
| List | rows, plain | Items with Add and Remove, Key column width, Tight, Numbered | the array controls |
| Alt text | shot, pair, tiles, details, icon, picture layouts | Description | the asset's alt |
| Drop shadow, Reflection, Recolor, Adjustments | | Omit: not in the grammar; the section names do not appear | |

Sections that leave the panel: Slide (kind, id, tags, section, title override) goes to Tools > Advanced > Show slide and block ids and to the layout grid; Notes goes under the canvas; Material and Dither go to Tools > Advanced > Pictures and materials (a panel for the two-tone treatment and the shader recipe); Lint goes to Tools > Check slides; Versions goes to File > Version history; History goes to Tools > Advanced > Change history; Deck tokens is removed from the UI (the tokens are in the repository). Labels: no JSON pointers in tooltips, no `(/layout/ratio)`, no ids; the accessible label `<block id>: <property>` and `data-control` stay in the DOM for the window API (SPEC 7.4), invisible.

### 3.9 The canvas right-click menu

From R08 A5 to A11, in the Edit, Slide, Arrange, Format grouping the reports reconstruct (Google prints no order; R08 grades most object items unverified as menu entries, so the set here is the union of what is verified for any object plus the items the ten tasks need).

Empty canvas: Paste, New slide, Duplicate slide, Delete slide, Skip slide, rule, Change background, Apply layout ▸, Change theme, rule, Speaker notes (focuses the pane).

Text box, box or shape: Cut, Copy, Paste, Delete, Duplicate, rule, Order ▸, Align ▸, Distribute ▸, Center on page ▸, Group (Later), rule, Link (Cmd+K), Text fitting (Later), Format options, Alt text.

Image: Cut, Copy, Paste, Delete, Duplicate, rule, Order ▸, Align ▸, Center on page ▸, rule, Replace image ▸, Crop image, Reset image (Later), Format options, Alt text.

Table cell: Insert row above, Insert row below, Insert column left, Insert column right, Delete row, Delete column, Delete table, rule, Distribute rows, Distribute columns, Merge cells (Later), rule, Cut, Copy, Paste, Link, Format options.

Text selection inside a run: the browser's spelling suggestions when the word is misspelled, rule, Cut, Copy, Paste, Paste without formatting, rule, Link, rule, Format options.

Menus open at the pointer, 220 px wide (`Sidebar.css` plate), icons left, keys right, Esc returns focus to the element that was right-clicked (R08 C1 notes today's row menu does not return focus).

## 4. The filmstrip

### 4.1 Contents and behaviour

- One card per slide: a 200 by 112 thumbnail (the render worker capture at 320 px, the live clone as fallback, `Thumb.tsx`) in a `--pt-edge` frame, the number in a 28 px gutter to its left in tabular figures, the current card ringed in `--pt-ink` (2 px). No title under the card by default (Google shows none, R02 section 5); the title is the card's tooltip.
- A skipped card sits at 40 percent opacity with an eye-slash glyph at its top right and the tooltip "Skipped: not shown when presenting or in downloads".
- Section labels: when the deck has more than one section, a 20 px titanium row with the section name between groups; not collapsible by default (View > Show sections toggles them; Tools > Advanced restores the collapsible tree with counts). A fresh presentation has one section and shows no label.
- Selection: click selects one; Shift+click extends the range; Cmd+click (Ctrl on Windows) toggles; Shift+Up, Shift+Down, Shift+Home, Shift+End extend from the keyboard; Cmd+A selects all when the filmstrip has focus.
- Drag: one or several selected cards, a drop line between cards, one `slide.move` per moved slide in one write (the sidebar's HTML5 drag today, extended to a multi-selection). Dragging across a section label moves the slide into that section; an opener stays first in its section (the validator's rule, SPEC 4.4) and the drop line refuses the position before it with a 200 ms shake.
- Keys with the filmstrip focused: Up, Down, Page Up, Page Down, Home, End move; Cmd+Up, Cmd+Down move the slide; Cmd+Shift+Up, Cmd+Shift+Down move it to the beginning or the end; Delete or Backspace deletes with the toast "Slide deleted · Undo"; Enter focuses the canvas; Ctrl+M inserts. Ctrl+Alt+Shift+F focuses the filmstrip and Ctrl+Alt+Shift+C the canvas (R04 B3).
- The bottom-left toggle switches to Grid view (the existing `GridView.tsx`): larger tiles, drag to reorder, the same right-click menu on a tile, double-click a tile to return to the filmstrip. The Book view is removed from the default UI (Tools > Advanced keeps it as "Read as a book").
- The filter row, the count, the density Seg, the kind glyph, the lint badge and the lease dot leave the default filmstrip. Cmd+F's find bar replaces the filter for the one thing sellers used it for (finding a slide by a word).

### 4.2 The right-click menu on a card

In the order of R08 A1 (the 2017 list for rows 5 to 14, the corroborated items placed at the top), with Google's keys printed on the right:

1. Cut (Cmd+X)
2. Copy (Cmd+C)
3. Paste (Cmd+V)
4. New slide (Ctrl+M)
5. Duplicate slide (Cmd+D)
6. Delete
7. Skip slide, reading Unskip slide on a skipped card
8. rule
9. Change background (disabled unless a picture layout)
10. Apply layout ▸ (the layout grid as a submenu, the current layout checked)
11. Change theme
12. rule
13. Move slide ▸ Move slide to beginning, Move slide up, Move slide down, Move slide to end
14. rule
15. Comment (Later)
16. Speaker notes (a Turboslide addition: focuses the notes pane for this slide)

On several selected cards the same menu acts on the selection (Duplicate, Delete, Skip, Apply layout, Move). "Save to Keep notepad" is omitted (a Google service). "Render", "Lint this slide", "Copy id", "Move to section" and "Insert a template" leave this menu (the template list is the Apply layout submenu and the New slide arrow; Move to section is a drag).

### 4.3 Empty and edge states

- Deleting the last slide: the filmstrip shows one empty card frame with "Click + to add a slide"; the canvas shows nothing. Whether Google Slides allows deleting the last slide is unverified (no report states it); the design allows it because undo exists.
- A deck with one section shows no labels; a deck with several shows them and View > Show sections is checked.
- While thumbnails load, cards show the live clone; nothing else is drawn.

## 5. The layout system

### 5.1 What a layout is here

Google's words (R03 b.1): a theme is "a preset group of colors, fonts, background, and layouts"; a layout is "the way your text and images are arranged on a slide"; a template is "a pre-designed collection of slides". In Turboslide the GT theme is `gt-ink-paper`; its layouts are the fifteen slide templates in `packages/chrome/src/slide-templates.ts` plus the three blanks of `palette-data.ts`, which are the GT deck's archetypes cut into insertable slides (R06 section 4.1); a template in Google's sense is a deck (the GT brand deck, a sales starter). The seller sees one list, in one order, in four places: the New slide arrow, the Layout button, Slide > Apply layout and the filmstrip's Apply layout submenu (R03 finding 2).

### 5.2 The layout list

Google's names where the layout is the same idea (R03 b.2 for the eleven names, R05 E5 for the API names), the GT name where there is none. The grid shows 17 thumbnails at 128 by 72 in three columns with the name under each, rendered from the template with its prompts, in the deck's theme variant.

| # | Layout name in the UI | Template id | Kind and layout | Placeholders (prompt text) | Google's nearest layout |
| --- | --- | --- | --- | --- | --- |
| 1 | Title slide | title | title | Click to add title; Click to add a lead sentence | Title slide |
| 2 | Section header | opener | opener | Click to add section title; Click to add text; the credit | Section header |
| 3 | Title and body | split | content, split 4/8 | Click to add title; Click to add text; a ruled list of three items | Title and body |
| 4 | Title and two columns | cols | content, cols 5/7 | Click to add title; Click to add text (left); Click to add text (right, lead); a note | Title and two columns |
| 5 | Title and table | rows | content, cols 5/7 | Title, text, a key and value table of three rows | none (Title and body) |
| 6 | Title and list | plain | content, cols 5/7 | Title, text, a ruled statement list of four | One column text |
| 7 | Title and image | figure | content, cols 4/8 | Title, text, a picture with a caption | none (Caption) |
| 8 | Two figures | pair | content, split | Title; two pictures with captions | none |
| 9 | Image grid | tiles | content, split 4/8 | Title, text; four tiles | none |
| 10 | Detail grid | details | content, split 4/8 | Title, text; three details | none |
| 11 | Status board | board | content, split 4/8 | Title, text; three rows | none |
| 12 | Number grid | matrix | content, cols 5/7 | Title, text; a 4 by 4 grid with a caption | none |
| 13 | Main point | statement | statement | Click to add a statement | Main point |
| 14 | Big number | bignumber (new) | content, center | A heading at level big with the prompt "Click to add a number"; a paragraph role cap with "Click to add text" | Big number |
| 15 | Caption | mood | mood | Click to add title; Click to add text; the credit | Caption |
| 16 | Closing | closing | closing | Click to add title; Click to add text; the credit | Section title and description |
| 17 | Blank | blank (new) | content, freeform, no blocks | none | Blank |

"Title only" is not offered: the theme frame has no fixed title band, and Title and body with its list deleted is the same slide. Section header, Caption and Closing need a picture: the fresh presentation carries the GT theme's picture set (section 6.1), so all three work on a blank deck; when a deck has none of those assets the three tiles show "Add a picture first" and open the file picker on click.

### 5.3 What New slide inserts

- New slide (Ctrl+M, the plus button, Insert > New slide, Slide > New slide, the filmstrip's New slide): a slide of the current slide's layout, after the current slide, with empty placeholders; the new slide is selected and its first placeholder is focused with the caret (R05 A15: Google inserts after the selection with the same layout; R09 A1: a new text box opens in the caret state).
- The layout of a slide is recorded as `ext.layout: <templateId>` when a template inserts it (SPEC 4.1 allows `ext` on a slide). For the 85 imported GT slides the layout is derived once by kind, layout type and slot signature (`SLIDE_TEMPLATES[i].make` compared structurally), falling back to Title and body for a content slide and to the kind's own layout for the others.
- New slide with layout (the arrow): the grid; picking a tile inserts that layout after the current slide. The last picked layout is remembered for the plus button in this browser (R05 A15 reports Google remembers the last layout used; single source).
- Every new slide is one `slide.insert` write, so undo removes it.

### 5.4 Placeholders and prompt text

Google's placeholders show fixed prompt text that is not part of the content and does not present or export (R03 b.1, R09 A4). Today the templates insert real copy ("Placeholder heading, not final copy") that renders everywhere and fires the copy linter (R09 finding 5). This round changes it:

- A template inserts empty Texts. An empty Text is valid today (`textSchema` is a string with a line-break refinement only, `packages/schema/src/text.ts`).
- The renderer, when `live: true` (the editor stage only), draws the prompt for an empty heading, paragraph, text, box, list item, table cell, statement, title or lead: "Click to add title" for a heading at level h1, h2, title or big; "Click to add a statement" for a statement; "Click to add text" for everything else; "Click to add a number" on the Big number heading; "Add a caption" for an empty caption. The prompt is drawn in `--titanium` at the block's own size, is not selectable text and disappears on the first keystroke. Thumbnails, present mode, the view route, the standalone build and both PPTX modes draw nothing for an empty Text and the Editable text export skips the box.
- The linter gains `copy/empty-placeholder` at severity 1 ("Slide 4 has an empty title"), so Check slides still knows what is unfinished; `copy/contrast-pair` stops firing on fresh slides.
- Deleting a placeholder deletes that block on that slide only (R05 A1); Apply layout of the same layout brings it back.

### 5.5 What Apply layout does to an existing slide

Google moves placeholder content into the new layout's matching placeholders and leaves freestanding content where it is (R03 b.3, from two secondary sources). Turboslide's slide kinds are fixed today (R06 finding 5) and `slide.setLayout` converts between content layouts only. This round adds one action, `slide.applyLayout(slideId, layoutId)`, which emits one `slide.replace` (so undo is one step) built by these rules:

| Content in the old slide | Where it goes in the new layout |
| --- | --- |
| The first heading (or the title slide's heading, the opener's big heading, the statement's big text) | The new layout's title placeholder (heading, title heading, opener heading, statement text, or the Big number heading) |
| The second text line (the title slide's lead, the mood's paragraph, the first paragraph) | The new layout's first body placeholder |
| Further paragraphs | Appended to the body slot in order; on a two-column layout, the left column |
| A list (rows, plain, refs) | The new layout's list placeholder if it has one, else appended to the body slot |
| A table | The table placeholder (Title and table) else the body slot |
| Pictures (shot, pair, tiles, details, the picture of an opener, mood or closing) | The picture placeholder(s) in order; a picture layout takes the first picture as its background picture |
| The credit | The plate's credit on picture layouts; dropped otherwise |
| Notes, id, section, skip, tags, ext | Kept |
| Anything with no home (a shot moving to Main point, a second table) | Dropped, and the toast reads "Applied Main point. 1 picture did not fit this layout · Undo" |

Blocks on a freeform slide are freestanding in Google's sense and keep their `pos` when the target is Blank; when the target is any other layout they refile by geometry through the existing `convertLayout` (docs/freeform.md section 4) and then the table above applies. Applying the same layout to a slide resets its placeholders' positions and styles (`typography`, `color` overrides removed), which is R07 rule 30's "reset to layout" that Google lacks. Apply layout to several selected slides is one write with one `slide.replace` per slide.

### 5.6 The Themes panel, transitions and the theme editor

- Slide > Change theme, the Theme button and the filmstrip's Change theme open the Themes panel: the title "Themes", one theme "GT" with two large thumbnails, "Light" and "Dark", the current one ringed; clicking one sets `deck.defaults.theme` (a new manifest field, written with `deck.set`) and the editor's stage, the thumbnails, present mode, the view route and the Download dialog default follow it. The chrome follows the deck variant in the editor (the ◐ toggle that flipped chrome and sheet leaves the toolbar; View > Appearance > Light, Dark, Match the presentation is a Turboslide addition for the chrome alone). This ends "Theme means two things" (R06 section 7 item 24).
- "Import theme" sits at the bottom right, disabled, tooltip "Turboslide has one theme, GT".
- Transitions and animations are omitted everywhere (the Motion panel, Slide > Transition, the toolbar's Transition, Insert > Animation): the Perfect PPTX cannot carry them (SPEC 8.6 drops motion), sales decks presented over a call do not need them (R07, frustrations table, last row), and a stub in four places would be four grey items about one thing.
- Slide > Edit theme is a Later stub; the theme lives in `packages/theme` and the templates in code.

## 6. The root route, the home page, trash, rename, copy, import, download, share

### 6.1 The root route and the fresh presentation

`/` today redirects to the newest deck on the shared store, which on production is a drive's test deck (`apps/studio/src/routes/index.tsx`, R06 section 5, docs/EDITOR-DEPTH-STATUS.md section 12). This round:

- `/` redirects to `/new`. `/new` renders the editor (`ssr: false`, like `/edit`) on a presentation built in the browser from the blank template: title "Untitled presentation", one section "Deck", one Title slide with empty placeholders, the GT theme's picture set as assets, `defaults.theme` dark (the deck's default, SPEC 2.1). The title row reads "Not saved yet". The Themes panel is open.
- The presentation is created in the store on the first edit: the first write calls `deck.create` (through `createStoredDeck`, the page's path that uploads before it answers, docs/EDITOR-DEPTH-STATUS.md section 10) with an id `untitled-<yyyymmdd>-<4 chars>`, then the write, and the address becomes `/edit/<id>` through `history.replaceState`. A visit that only looks and leaves creates nothing, so the shared store does not gain a deck per visit. Google creates the file on the click (R03 a.3, the create URL), but Google has a per-user Drive; the shared store is the reason for the difference, and it is invisible to the seller.
- Renaming before the first edit is the first edit. Slideshow before the first edit presents the in-browser document without saving. Share before the first edit saves first (the link needs an id) and says so in the dialog.
- The "GT theme's picture set": the blank template gains an `assets` folder with four two-tone twins (two opener materials, two mood photographs with their credits) so Section header, Caption and Closing work in a fresh deck; two-tone twins are 1-bit PNGs (SPEC 5.4), so the set is small. The store's `ensureAssets` copies them on create.

### 6.2 The home page, `/decks`

Google's home has three bands (R03 a.1): the app bar, "Start a new presentation" with the Blank card and template cards and a "Template gallery" link, and the recent list with a grid and list toggle, a sort control and a per-item menu. R03 finding 13 lists exactly what parity needs. The page becomes:

- App bar: the GT mark and "Turboslide", a search field ("Search presentations") that filters the list by title.
- "Start a new presentation": the Blank card (a large plus, "Blank presentation", opens `/new`), "GT brand deck" (creates a copy of the GT template, 85 slides, and opens it), and a "Sales starter" card (Later: a deck of seven layouts). "Template gallery" opens the same strip expanded (the strip is the gallery; no separate page).
- "Recent presentations": a grid of cards (a 320 by 180 thumbnail of slide 1 in the deck's theme variant, the title, "Opened 2 hours ago" from this browser's history in `localStorage`, else "Edited <date>") with a list view toggle (title, last edit, slides), a sort control (Last opened by me, Last modified, Title), and a per-card menu: Open, Open in new tab, Rename, Make a copy, Download ▸, Move to trash. "Owned by" filters are omitted with the sentence under the heading "Every presentation on this Turboslide is listed here" (no identity, R10 B6).
- At the bottom: "Trash" (a link to `/decks/trash`) and nothing else. The Connect card, the hosting notice, the count, the ids, the revisions, the Upload deck bundle form and the footer leave the page (the bundle upload lives in File > Open's Upload tab and Extensions > Agent access).
- Trashed decks and unsaved `/new` documents never appear.

### 6.3 Rename

Click the title in the title row, type, Enter (`deck.rename`); File > Rename focuses the field; the home page's card menu offers Rename in place. A new presentation whose title is still "Untitled presentation" when the title slide's heading is first committed takes that heading as its title, once (R03 a.3 reports Google offers the title slide text as the file name; corroborated by two secondary sources; the design applies it automatically because the seller's first edit is the customer name on the cover).

### 6.4 Trash

- File > Move to trash, and the home card menu's Move to trash: new action `deck.trash` writes `trashedAt` into `deck.json` (soft delete; the deck's files stay). The editor shows the toast "Moved to trash · Undo" for 8 s and navigates to `/decks`; Undo is `deck.restore`.
- `/decks/trash`: the trashed decks with "Restore" and "Delete forever" per card, and "Empty trash". Delete forever asks "Delete <title> forever? This cannot be undone" and runs `deck.remove` (new; on the Blob store `del` per prefix, docs/EDITOR-DEPTH-STATUS.md section 10 names the mechanism). Trashed decks older than 30 days are removed by a sweep in `listDecks` (Google's Drive rule, R01 File notes "stays until the trash is emptied"; the 30 days is Drive's policy and is not on a page the reports read, so it is a Turboslide choice named as such).
- `/`, `/decks`, the Open dialog, the Import slides dialog and `listDecks()` skip trashed decks; `/edit/<id>` of a trashed deck shows a banner "This presentation is in the trash · Restore" over a read-only editor.
- The dozen test decks on production are trashed by Kevin from the home page in one visit, one click each; a "Select" mode on the home page is Later.

### 6.5 Make a copy and Import slides

Section 2.1 gives the dialogs. Both are server work over the existing bundle code: `deck.copy` packs the source and unpacks it under the new id, filters `slideIds` and their sections, strips `notes` when asked, and answers the new id; `slide.import` reads the source deck through the store, renames slide and block ids that collide, ensures the assets, and emits one `slide.insert` per slide in one write. PowerPoint import is Later and is the one place this proposal admits the file type a seller most often receives cannot yet be opened; the Upload tab says so in one sentence and points at Google's own import path for the interim.

### 6.6 Share and Publish

There are no roles and no access control (R10 B7: anyone who loads the host can read and write). The Share dialog says exactly what a link does, in Google's layout minus what cannot be honest:

- Title "Share <title>". A section "Links": "View link" with Copy link (the `/deck/<id>` route: read-only, no notes in the payload, skipped slides omitted, opens on slide 1); "Present link" with Copy link (`/deck/<id>?present=1`); "Edit link" with Copy link (`/edit/<id>`) and the sentence "Anyone with this link can edit". The people field, roles and General access are omitted; the dialog's one line of explanation reads "Turboslide has no accounts yet. Anyone who has a link can open it."
- R10 C3 item 1 is a precondition: the view and embed payloads stop carrying `notes` (`apps/studio/src/server/decks.ts` `getDeck`), and skipped slides are dropped from them.
- Publish to web (File > Share > Publish to web, Extensions > Embed in a site): Link tab with the present link; Embed tab with the `/embed/<id>` iframe snippet and a size dropdown (Small 480 by 270, Medium 960 by 540, Large 1440 by 810, Custom); "Auto-advance slides" and "Start slideshow as soon as the player loads" are Later; "Published content & settings" and "Stop publishing" are omitted with the sentence above.

### 6.7 Download

File > Download > Microsoft PowerPoint (.pptx) opens a small dialog rather than downloading at once, because the export takes 190 to 222 s for 85 slides (docs/EDITOR-DEPTH-STATUS.md section 10) and has options the seller must be able to reach:

- "Microsoft PowerPoint (.pptx)". A Seg "Perfect | Editable text" with one sentence under each ("Every slide looks exactly like the screen; the text is there but not editable" and "Text boxes you can edit in PowerPoint; layout within a few pixels"); Perfect selected. Checkboxes: "Include speaker notes" (off), "Include skipped slides" (off). A disclosure "More options" holding Light, Dark or Both (defaulting to the deck's theme variant), fonts Exact or Standard, Embed fonts, Headings as pictures. Button "Download". Progress as one line: "Preparing your PowerPoint file, about 3 minutes for 85 slides"; then "Your file is ready" with the download starting; the report card of `ExportReportCard.tsx` is reachable from a "Details" link and nowhere else. "Verify with LibreOffice" leaves the UI (it never runs hosted).
- The notes and skipped-slides defaults are a deliberate departure from Google, which includes notes in a PPTX and, by the reports, does not document whether skipped slides are included (R07 unverified item 10). R07 rules 24 and 25 give the reason: a talk track or a pricing slide must not reach a prospect by accident. The checkboxes make the departure visible and one click to undo.
- PDF Document (.pdf): the print route rendered by Chromium in the render worker; the same two checkboxes; one slide per page.
- JPEG and PNG of the current slide download at once at 2x. Plain Text downloads at once. Web page (.html) shows the same progress line (a few seconds). Turboslide bundle (.zip) downloads at once.

## 7. Object model changes for Google behaviours and their export paths

Every change below is a schema change with a validator and reducer path (SPEC 4.4), a renderer change, a lint change where named, and two export paths: Perfect (flatten, the 2x page raster over invisible text runs, SPEC 8.2) and Editable text (native, `NATIVE_BLOCK_TYPES`, docs/freeform.md section 7). Perfect carries everything the renderer draws by construction; the Editable text column says what the writer must add.

| # | Google object or behaviour | Turboslide today | Change this round | Perfect | Editable text | Round |
| --- | --- | --- | --- | --- | --- | --- |
| 7.1 | Text box | `text` block (freeform round) | Single click places the caret; Enter inserts a paragraph break (below); Esc commits | text runs in the invisible layer | a text box | Now |
| 7.2 | Paragraph break inside a text box (Enter) | `textSchema` refuses `\n` (SPEC 4.2); Enter commits | Allow `\n` as a paragraph break in the Text of `paragraph`, `text`, `box` and table cells; the renderer emits one `<span class="para">` per paragraph; `rows`, `plain`, headings and slide fields stay one line (Enter there adds an item or commits). SPEC 4.2 line 316 is amended to "No line breaks except a paragraph break in paragraph, text, box and table cell Texts, and \n in panel.code" | the scene already carries one hard break per browser line | one paragraph per `\n` with `paraSpaceAfter` from the block's leading | Now |
| 7.3 | Text fitting (Do not autofit, Shrink text on overflow, Resize shape to fit text) | none; overflow is a finding | `fit?: 'none' | 'shrink' | 'grow'` on a freeform block's `pos`; grow default for a new text box, shrink for template placeholders on freeform | drawn | `normAutofit` is never written (docs/export-verification checklist); the box is sized to the measured text | Later |
| 7.4 | Shapes | `shape` rectangle, rounded, ellipse, line, arrow; `box` | None this round; the gallery of ECMA presets (R05 E1) later | drawn | `rect`, `roundRect`, `ellipse`, lines with triangle heads (exists) | Now |
| 7.5 | Table | none (R11 summary 1) | New `table` block: `columns: { width?: number; align?: 'left' | 'center' | 'right'; fill?: Color }[]`, `rows: { cells: Text[]; header?: true }[]`, `border?: { weight: 1 | 1.5 | 2 }`, `valign?`, capped 20 by 20 by the validator; the renderer draws a CSS grid with hairlines in the theme's line law, the header row at display weight 500 with an ink rule under it, tabular numerals; Tab and Shift+Tab move between cells in `InlineText`, Tab in the last cell appends a row (Google's behaviour is unverified, R11 A2; PowerPoint's is what sellers know); the cell right-click menu carries the nine commands | drawn; every cell is a `data-run` so the invisible layer has the text | a native PPTX table (`addTable`) with column widths, per-cell fill and the border weight, so the seller edits a table in PowerPoint; SPEC 8.2's "never a PPTX table" stays true for `rows` | Now |
| 7.6 | Chart | `scales`, hand-drawn `dia` | `chart` block: `kind: 'bar' | 'column' | 'line' | 'pie'`, `categories: string[]`, `series: { name; values: number[]; color?: Color }[]`; drawn as inline SVG in the diagram grammar; edited as a grid in Format options | drawn | a PNG at 2x, as `dia` (R11 C1 accepts parity with Google's picture) | Later |
| 7.7 | Bulleted and numbered lists | `plain` (ruled), `rows`; no bullets by grammar | `numbered?: true` on `plain` (a tabular numeral at the row start where the icon sits); Enter at the end of an item appends an item; Backspace on an empty item removes it; `level?: 1 | 2` for Tab nesting is Later | drawn | text boxes with hair-soft rules (exists); the numeral as a run | Now (marker), Later (levels) |
| 7.8 | Groups | multi-selection only | `group` block on freeform: `children: Block[]`, one `pos`; double-click enters the group (selects a child) | drawn | `<p:grpSp>` (the writer already groups ruled rows, SPEC 8.2) | Later |
| 7.9 | Skip slide | no field (R10 B9) | `skip?: true` on `SlideBase`; present mode, the view route, the embed, the standalone build, print and both exports omit skipped slides unless asked; the filmstrip dims them; `slide.list` reports the flag | omitted | omitted | Now |
| 7.10 | Spelling | `spellcheck = false` on the run | The attribute stays on; the browser underlines and offers suggestions on right-click (R09 C1) | n/a | n/a | Now |
| 7.11 | Rotation | none | none; `pos` has no angle (docs/freeform.md section 1) | n/a | n/a | Omit |
| 7.12 | Z order | `pos.z`, `block.order` forward and backward bound | Bind front and back; the four Arrange items | drawn in paint order | shapes emitted in z order (exists) | Now |
| 7.13 | Guides | snap lines during a drag only | Deck-level `ext.guides: { x: number[]; y: number[] }` drawn as lines on the editor stage, draggable, in View > Guides and the canvas menu | not drawn | not drawn | Later |
| 7.14 | Speaker notes | `notes?: string`, edited in the inspector | The pane under the canvas binds the same string; paragraphs are plain line breaks (a `string`, not a `Text`); formatted notes are Later | `addNotes` (exists) | same | Now |
| 7.15 | Images | `shot` with `asset`, `crop` top or centre, `border`; assets need alt, role and provenance on intake | One-step insert (alt from the file name, role `capture`, source `file`); drop on the stage inserts, drop on an image replaces; free crop offsets (`leftOffset` and friends, as the Slides API models them, R05 A2) are Later | drawn | picture at 2x (exists) | Now |
| 7.16 | Slide links | none | `[text](#s/<slideId>)` and the relative forms `#next`, `#previous`, `#first`, `#last`; the viewer resolves them; the standalone build already keys slides by id | n/a (a link in the invisible run is written as a hyperlink; PowerPoint honours it on the invisible run, unverified) | `hyperlink: { slide: n }` in pptxgenjs | Now |
| 7.17 | Slide numbers | the frame counter always drawn | `deck.defaults.counter: 'on' | 'off' | 'skip-title'` | drawn or not | the counter text box or nothing (exists) | Now |
| 7.18 | Theme variant | a view toggle in `localStorage` | `deck.defaults.theme: 'light' | 'dark'` | the export's default theme | same | Now |
| 7.19 | Layout identity | none | `ext.layout: <templateId>` on a slide | n/a | n/a | Now |
| 7.20 | Trash | none | `trashedAt?: string` on the manifest; `deck.trash`, `deck.restore`, `deck.remove` | n/a | n/a | Now |
| 7.21 | Copy and import | bundle round trip by hand | `deck.copy`, `slide.import`, `text.replaceAll`, `slide.applyLayout` | n/a | n/a | Now |

New actions added to the table (SPEC 7.1 parity): `slide.applyLayout`, `slide.import`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `text.replaceAll`. New fields: `skip`, `ext.layout`, `defaults.theme`, `defaults.counter`, `trashedAt`, `numbered`, the `table` block, the paragraph break. New lint rules: `copy/empty-placeholder` (1), `table/max-size` (3, over 20 by 20 or a cell over two lines at the theme's floor). Amended SPEC lines: 1 and 6.4 (already recorded deviations for freeform), 4.2 line 316 (paragraph breaks), 8.2 (a PPTX table for the table block).

What is not changed, and why, in the seller's words on the stub tooltips: italic and underline ("The GT theme sets Inter in one style"), fonts ("The GT theme sets Inter"), text colour inside a sentence ("Colour in the GT theme marks icons, not words"), rotation ("Rotation is not part of the GT theme"), transitions (omitted), 4:3 pages ("Slides are 16:9").

## 8. Keyboard shortcuts

### 8.1 Adopted from Google verbatim

Every row of R04 Part B that maps to a shipped feature is bound exactly, Mac and Windows, and listed in Help > Keyboard shortcuts under Google's group names (Common actions, Film strip actions, Navigation, Menus, Text, Move and arrange objects, Presenting). The binding source is Google's shortcut page, read 2026-09-11 by R04 (G1).

| Group | Bound this round (Mac form; Windows uses Ctrl for Cmd and Alt for Option unless the row says otherwise) |
| --- | --- |
| Common actions | New slide Ctrl+M (Ctrl on Mac too, as Google prints it); Duplicate Cmd+D; Undo Cmd+Z; Redo Cmd+Y or Cmd+Shift+Z; Copy, Cut, Paste; Copy and paste formatting Cmd+Option+C and V (Later, with Paint format); Insert or edit link Cmd+K; Open link Option+Enter; Delete; Select all Cmd+A; Find Cmd+F; Find and replace Cmd+Shift+H (Windows Ctrl+H); Find again Cmd+G, Find previous Cmd+Shift+G; Open Cmd+O; Print Cmd+P; Save Cmd+S (a toast "All changes are saved automatically"); Show shortcuts Cmd+/; Search the menus Option+/ (Windows Alt+/ or Alt+Z); Compact mode Ctrl+Shift+F; Alt text Cmd+Option+Y |
| Film strip actions | Up, Down, Page Up, Page Down, Home, End (Fn+Left and Fn+Right on Mac); Move slide Cmd+Up and Cmd+Down; to beginning and end Cmd+Shift+Up and Down; extend selection Shift+Up, Shift+Down, Shift+Home, Shift+End |
| Navigation | Zoom in Cmd and plus, Zoom out Cmd and minus, Zoom 100% Cmd+0 (R02 section 13 notes two readings of the zoom keys on Google's page; Cmd and plus is what R04 read from the page and is adopted); Move to filmstrip Cmd+Option+Shift+F; Move to canvas Cmd+Option+Shift+C; Open speaker notes Cmd+Option+Shift+S; Version history Cmd+Option+Shift+H; Present Cmd+Enter (Windows Ctrl+F5); Present from beginning Cmd+Shift+Enter (Windows Ctrl+Shift+F5, which Google does not publish and R04 marks unverified; adopted because the Mac form exists); Exit the current mode Esc |
| Menus | Context menu Cmd+Shift+\ or Shift+F10; File Ctrl+Option+F, Edit E, View V, Insert I, Slide S, Format O, Arrange R, Tools T, Help H (Windows Alt plus the letter in Chrome, Alt+Shift elsewhere); the underlined letter inside an open menu |
| Text | Bold Cmd+B; Increase and decrease font size Cmd+Shift+> and <; Left, Center, Right align Cmd+Shift+L, E, R; Bulleted list Cmd+Shift+8; Numbered list Cmd+Shift+7; Clear formatting Cmd+\; Next and previous misspelling Cmd+' and Cmd+; (the browser's spellcheck marks; Later if the browser exposes no navigation) |
| Move and arrange objects | Duplicate Cmd+D; Send backward Cmd+Down, Bring forward Cmd+Up, Send to back Cmd+Shift+Down, Bring to front Cmd+Shift+Up; Select next and previous shape Tab and Shift+Tab; Nudge one pixel with the arrows, a larger increment (8 px, the grid) with Shift; Resize by keyboard Cmd+Ctrl+B, I, J, K, W (Windows Ctrl+Alt) one grid step each; Duplicate by drag Option+drag (Windows Ctrl+drag); Resize from centre Option+resize; Constrain to an axis Shift+drag; Constrain aspect Shift+resize; Suppress guides Cmd+drag (Windows Alt+drag) |
| Presenting | Section 9.3 |

Later or omitted rows, shown in the dialog greyed with the reason in the row: Italic, Underline, Strikethrough, Superscript, Subscript, Justify, indent keys, Group and Ungroup, the rotate keys (omitted: no rotation), Insert comment, the comment navigation chords, Select none, the paragraph move keys, the screen reader chords, the input tools keys, Open Explore (retired by Google).

### 8.2 Conflicts with Turboslide's keys and the resolution

From R06 section 2 (every key Turboslide binds at `8c7056c`) against R04.

| Turboslide key today | What it does | Google's meaning | Resolution |
| --- | --- | --- | --- |
| S, D, E, P, F, G, B, J, K, L, H, R, ? (bare letters, `useShellKeys.ts`, `keys.ts`) | sidebar, theme, edit mode, present, fullscreen, grid, book, paging, help | Google binds no bare letters in the editor (R09 finding 4); s, a, l, b, w act only while presenting | Retired in the editor and the viewer. Present mode keeps Google's letters (section 9.3). A seller who clicks the title and types gets the letters into the title |
| Space, Backspace | next and previous slide | Backspace deletes; Space types | Retired in the editor; kept in present mode (Google does not list Space for presenting, R04 unverified item 9; PowerPoint convention) |
| Digits then Enter | go to slide | presenting only | Present mode only |
| Cmd+K | the command palette | Insert or edit link | Cmd+K is the link popover; the palette is Option+/ and the Search button; `⌘K` chip removed |
| Cmd+/ | the source drawer | Keyboard shortcuts dialog | Cmd+/ opens the shortcuts dialog; the source drawer has no key (Tools > Advanced) |
| Cmd+L | the lint layer | none | No key; Tools > Advanced |
| Shift+D | the twin view | none | No key; Tools > Advanced |
| Cmd+S | focus "Name this version" | Save (autosaved) | Cmd+S shows "All changes are saved automatically" for 1.4 s; naming a version is File > Version history > Name current version |
| Cmd+] and Cmd+[ | z order on freeform | Increase and decrease indent | Reserved for indent (Later); z order is Cmd+Up and Cmd+Down |
| Alt+Up and Alt+Down | reorder a block or a slide row | Google: Alt+Shift+Up and Down move a paragraph | Dropped; Cmd+Up and Down do both jobs by focus (filmstrip moves the slide, canvas orders the block), as in Google |
| Enter on a selected block | start editing | same | Kept |
| Enter while editing | commit | paragraph break | Paragraph break in paragraph, text, box and table cells; new item in a list; commit on headings and slide fields (one line by grammar). Shift+Enter commits everywhere (Google's Shift+Enter is unverified, R09 unverified 1) |
| Esc while editing | discard the edit | keep the text, leave the box | Esc commits and selects the block; Cmd+Z undoes (R09 finding 2 names this the most dangerous mismatch) |
| Double-click on a run | start editing | select a word | Single click places the caret; double-click selects a word; triple-click selects the paragraph (browser convention; verified for Docs, R09 A1) |
| Cmd+Enter in an inspector textarea | commit | none | Kept in Format options fields |
| [ | sidebar | none | Retired |
| Escape ladder (`useShellKeys.ts` line 304) | help, panel, filter, mode, present, narrow sidebar | Esc exits the current mode | Kept, minus the retired surfaces |

The Turboslide-only keys that remain: none in the editor's default view. Every key a seller can press is on Google's list.

## 9. Speaker notes and present mode

### 9.1 Speaker notes

The pane under the canvas: full canvas width, 64 px tall by default, the placeholder "Click to add speaker notes" in titanium, a three-dot handle on the divider (drag to resize, double-click to toggle the default height, drag to the bottom to hide), Cmd+Option+Shift+S focuses it, View > Show speaker notes toggles it (R02 section 7; R09 A11). The textarea is bound to `slide.notes` with one `slide.set /notes` per 400 ms pause (the coalescing SPEC 6.7 planned for text), so undo removes a burst of typing. Plain text with line breaks this round; the text toolbar over the notes (font size, bold, lists) is Later because notes are a `string`, not a `Text`. Notes stay out of the view route, the embed, the present link and every download unless "Include speaker notes" is checked (section 6.7), and they show in Presenter view.

### 9.2 The Slideshow button

At the top right, a split button (R04 A1): the main part starts the slideshow from the current slide in this tab, full screen when the browser allows (`view.present` plus the Fullscreen API; Esc leaves both); the arrow lists:

1. Presenter view: opens `/present/<id>` in a second window (the SPEC 6.10 console) and puts this tab into the slideshow; the two sync over `BroadcastChannel('turboslide:<deckId>')` with `localStorage` as the fallback.
2. Start from beginning (Cmd+Shift+Enter).
3. Present on another screen: disabled, tooltip "Not available in Turboslide yet. Presenter view opens a second window you can drag to another screen".
4. Presentation display options: omitted (Chrome's multi-screen permission flow; Presenter view covers the two-window case).

The second Presentation button and the P key leave (R06 finding 1).

### 9.3 The slideshow surface and its toolbar

Full screen, the sheet alone; a click on the slide advances (R04 A2). A toolbar at the bottom left appears when the pointer moves there and fades 2 s after it leaves (R04 A3): Previous, the slide number as a button that opens a list of slides (thumbnails, skipped ones absent), Next, and an Options menu (⋯):

| Item | Turboslide | Round |
| --- | --- | --- |
| Open speaker notes | Opens Presenter view in a second window | Now |
| Auto-play ▸ (1, 2, 3, 5, 10, 15, 30 s, 1 min; Loop; Play or pause) | none | Later |
| Turn on the laser pointer (L) | A 12 px red dot that follows the pointer (`--red`, the one semantic hue in chrome, on the sheet only) | Now |
| Captions preferences | none | Omit (a browser speech service, English only) |
| Enter or exit full screen (Cmd+Shift+F, Windows F11) | the Fullscreen API | Now |
| Turn on the pen | none | Later |
| More ▸ Download as PDF, Download as PPTX, Print, Keyboard shortcuts | Print opens the print preview; the two downloads open the Download dialog after the show; Keyboard shortcuts shows the presenting group | Now (print, shortcuts), Later (downloads inside the show) |
| Exit (Esc) | leaves present mode | Now |

Keys while presenting, from Google's presenting table (R04 A10), every row bound: Esc stop; Right and Left; a number then Enter; Home and End; s opens speaker notes (Presenter view); a is inert with the toast "Audience tools are not available in Turboslide" (once per show); l laser pointer; Cmd+P print (Windows Ctrl+P); Cmd+Shift+C is inert (captions omitted); Cmd+Shift+F or F11 full screen; b or . a black slide, any key returns; w or , a white slide, any key returns. Space, Enter, Page Down and Page Up also advance (PowerPoint convention; Google's page does not list them, R04 unverified 9) and Backspace goes back. Skipped slides never appear; the counter shows "3 of 10" over the unskipped count. The slideshow keeps working after load with no network (the deck is in memory; R07 rule 29). Materials show their frames (SPEC 5.4).

### 9.4 Presenter view

A second window at `/present/<id>` (R04 A4's shape; the layout comes from third-party walkthroughs and is the shape to mimic, not pixels): a timer top left with Pause and Reset; the current slide with a slide list dropdown and Previous and Next buttons; the next slide preview at 0.3 scale; the notes body with plus and minus font size buttons, "No speaker notes for this slide" when empty; an Audience tools tab present but disabled ("Not available in Turboslide yet"). Arrow keys in either window move both. Closing the presenter window leaves the slideshow running. The view route's `?present=1` (the present link) is the audience form without the console and stays as the shareable link.

## 10. What the sales user sees on first open, and the ten tasks click by click

### 10.1 First open

The seller types the address and lands on `/new` (section 6.1). The title row reads "Untitled presentation" and "Not saved yet". The menu bar and the toolbar of section 3.1 sit above a canvas holding one Title slide: the GT mark, "Click to add title" in the h1 size, "Click to add a lead sentence" under it, both in titanium. The filmstrip holds slide 1. The notes pane reads "Click to add speaker notes". The Themes panel is open with GT Light and GT Dark, Dark ringed. The status bar reads "Slide 1 of 1" and "Fit". Nothing else: no toast, no badge, no count, no revision, no lease, no id. A click on the title prompt places the caret and the prompt vanishes; typing the customer name writes the first `slide.set`, the deck is created, the address becomes `/edit/untitled-20260911-k3f8`, the title row reads "Saving…" then "All changes saved", and, because the title was still Untitled presentation, the deck takes the heading as its title. Pressing Ctrl+M twice adds two Title slides; the seller opens the New slide arrow, sees the 17 layouts as pictures of GT slides, and picks Title and body.

### 10.2 The ten tasks

Counts are pointer presses and key presses beyond typing the new words (the convention of R11 C2). "Today" is `8c7056c` as R06, R09 and R11 trace it; "Google" is the reports' Google path; "Here" is this proposal.

| # | Task | Google | Today | Here |
| --- | --- | --- | --- | --- |
| 1 | Open the right deck | Home, click the card: 1 click | `/` opens someone else's deck; `/decks`, find the row among 14, Open: 2 clicks after reading a table with ids | Home, click the card (thumbnail and title, opened 2 hours ago): 1 click; or Cmd+O, click: 1 key, 1 click |
| 2 | Make a copy for a prospect and rename it | File > Make a copy > Entire presentation, OK, then click the title, type, Enter: 4 clicks, 1 key, typing | Export menu, Download deck bundle, go to `/decks`, Upload deck bundle, choose the file, Upload and open, then rename in the toolbar: 7 clicks, a file dialog, typing | File > Make a copy > Entire presentation (3 clicks); the name field is selected with "Copy of GT pitch": type the prospect's name over it, tick "Remove speaker notes" if wanted, Enter (1 key): the copy opens named. 3 clicks, 1 key, typing |
| 3 | Retype the customer name on the cover and across the deck | Click the title (caret), triple-click or Cmd+A, type, Esc; Cmd+H, type, Replace all: about 4 clicks, 3 keys | Click selects the block; a bare letter typed now hides the sidebar or flips the theme; double-click, Cmd+A, type, Enter (Esc would discard); no find and replace: per slide, 2 clicks, 2 keys, and a hazard | Click into the title (1 click, the caret lands), triple-click (2 more), type, Esc keeps it (1 key). Then Cmd+H, type the old and new name, Replace all (1 key, 1 click): every slide and the notes |
| 4 | Swap a logo | Drop the file on the image: 1 drop | Open the inspector's Asset section, fill Alt text, Role and six optional fields, Add asset, then pick it in the asset select: about 6 clicks and typing | Drop the file on the image: 1 drop; the frame, caption and crop anchor are kept. Or right-click, Replace image, Upload from computer: 3 clicks and the file dialog |
| 5 | Add, duplicate, delete, reorder | Ctrl+M; Cmd+D; Delete; drag: 1 each | Row menu, Insert after, pick a kind (3 clicks); row menu, Duplicate (2 clicks); row menu, Delete (2 clicks); drag (1) | Ctrl+M; Cmd+D; Delete; drag: 1 each, plus the same four in the right-click menu and the Slide menu |
| 6 | Hide slides that do not apply | Right-click, Skip slide: 2 clicks; multi-select first for several | Not possible; the slide is deleted for everyone | Shift+click the three pricing slides (3 clicks), right-click, Skip slide (2 clicks): the cards dim, the slideshow, the view link and the downloads leave them out |
| 7 | Update the pricing table and the big number | Click the first cell, type, Tab through 20 cells (about 1 click and 23 keys); click the number, Cmd+A, type (1 click, 1 key) | No table: 30 text blocks on a freeform slide, each a double-click, Cmd+A and Enter, 51 clicks and 46 keys (R11 C2) | Click the first cell (1 click), type, Tab (20 keys through the row and column order), the header row stays bold and the prices right aligned by the column; click the big number, Cmd+A, type (1 click, 1 key) |
| 8 | Write a talk track | Click the notes pane, type: 1 click | Open the inspector's Slide section, find Notes, click, type, Cmd+Enter: 3 clicks, 1 key | Click "Click to add speaker notes", type: 1 click; Cmd+Option+Shift+S from anywhere |
| 9 | Present over a call | Slideshow arrow, Presenter view: 2 clicks; share the audience window in the call | Present (same tab, no notes, chrome hidden) or Presentation (new tab); the P key; no notes anywhere while presenting: 1 click and a missing console | Slideshow arrow, Presenter view: 2 clicks; the audience window is the one shared in the call, the presenter window has the notes, the timer and the next slide; Right arrow in either moves both; b blanks the screen during a question |
| 10 | Send a PDF or a link | File > Download > PDF Document: 3 clicks; Share, Copy link: 2 clicks | Export, Build and download an HTML file (2 clicks) or the PPTX after 3 minutes; Copy link copies the editor's own address, which lets the prospect edit and read the notes | Share, Copy link under "View link": 2 clicks, a read-only link with notes and skipped slides removed; or File > Download > PDF Document (.pdf), Download: 4 clicks and a wait with a progress sentence |

The two tasks where this proposal departs from Google by design: task 6, where skipped slides leave shared and downloaded outputs by default (Google's help says collaborators still see them, R10 A15), and task 10, where downloads strip notes by default. Both are checkboxes away from Google's behaviour.

### 10.3 Progressive disclosure, defaults, empty states, wording and errors

- Defaults that remove a decision: autosave with no Save command; New slide inherits the layout; Perfect is the PPTX default; the deck's theme variant drives the stage, thumbnails, present mode and downloads; snapping on; Fit zoom; the Themes panel open on a new presentation and closed thereafter (remembered per browser); notes and skipped slides out of outputs.
- Empty states, each one sentence: a fresh slide's prompts (section 5.4); "No presentations yet. Start one above" on an empty home; "Trash is empty"; "No speaker notes for this slide" in Presenter view; "Select something on the slide to see its options" when Format options is opened with nothing selected (Google disables the button instead; the panel sentence is friendlier and keeps the panel's position); "Click + to add a slide" in an empty filmstrip; "Add a picture first" on a picture layout tile in a deck with no pictures.
- Errors and interruptions, each with the next step in the sentence: "Couldn't save, retrying" (the write queue's six retries); "Someone else changed this slide. Your change was reapplied" (a silent rebase, as a toast); "This slide changed while you were editing. Keep mine or Use theirs" (the conflict card, two buttons, no JSON); "Pictures up to 25 MB" on a refused upload; "PowerPoint import is not available in Turboslide yet. Import a Turboslide bundle (.zip), or open the file in Google Slides and paste the text" on a .pptx; "Slide deleted · Undo", "Moved to trash · Undo", "Applied Big number. 1 picture did not fit this layout · Undo" (toasts hold 5 s, carry one action, and can be dismissed with Esc, the snackbar convention R08 B11 records; today's 1.4 s toast cannot carry a click).
- Discoverability without onboarding: every icon has a tooltip with its name and key (the Tooltip primitive, audited by `scripts/tooltip-audit.mjs`); every toolbar and right-click action is in the menu bar; the menus print keys; Search the menus finds every item by name; Help > Keyboard shortcuts is Cmd+/; right-click works on a card, the canvas, an object, text, a table cell and the notes pane. The one first-visit toast ("Arrow keys move. Press ? for every shortcut.") is removed; nothing teaches, because nothing needs teaching.
- What is hidden by default and how an advanced user or an agent reaches it: appendix A.

## 11. Ownership for a build round

Six builders, an integrator and a verifier, as the editor depth round was organised (docs/EDITOR-DEPTH-STATUS.md). Each row names the packages and files the builder owns, the deliverable and the acceptance check the verifier runs. Builders touch only their files; the integrator owns `apps/studio/src/routes/edit.$deckId.tsx`, the `on(...)` table, `palette-data.ts`, `pnpm generate:contracts`, AGENTS.md and the docs, as before.

| Builder | Owns | Delivers | Acceptance |
| --- | --- | --- | --- |
| B1 Document and layouts | `packages/schema/src/{deck,blocks,text,actions,catalog,reduce,validate,export}.ts`, `packages/schema/src/rules.json`, `packages/render/src/**`, `packages/lint/src/**`, `packages/chrome/src/slide-templates.ts`, `packages/store/src/templates.ts`, `decks/templates/blank/**` | `skip`, `ext.layout`, `defaults.theme`, `defaults.counter`, `trashedAt`; the `table` block and `numbered`; the paragraph break in text, box, paragraph and cells; empty placeholders with live prompts; the Big number and Blank templates and the 17-entry list in one order; `slide.applyLayout`, `slide.import`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `text.replaceAll` in the action table with handlers in `packages/store` and the CLI; `copy/empty-placeholder`, `table/max-size`; the blank template's picture set; `docs/grammar.md` regenerated | `pnpm check` steps 3 to 15 green; new vitest files per feature; the GT deck renders within the 0.5 percent budget unchanged (step 12); `turboslide slide apply-layout` and `text replace-all` end to end in a temp deck |
| B2 Chrome shell | `packages/chrome/src/{ViewerShell,Toolbar,ToolButton,Seg,StatusChip,DeckName,ThemeButton,Palette,HelpCard,Inspector,InspectorControl,ExportMenu,ExportReportCard,InsertMenu,Tooltip,Toast}.tsx` and CSS, new `TitleRow.tsx`, `MenuBar.tsx`, `Menu.tsx` (one menu primitive for the bar, context menus and dropdowns), `ToolbarHead.tsx`, `ToolbarTail.tsx`, `StatusBar.tsx`, `ThemesPanel.tsx`, `FormatOptions.tsx` (the Inspector regrouped), `DownloadDialog.tsx`, `ShareDialog.tsx`, `tokens.css`, `useShellKeys.ts` | Sections 1, 2, 3, 6.6, 6.7, 8.2's retirements; Search the menus; Help > Keyboard shortcuts; Tools > Advanced hosting the retired surfaces; the Later stubs with their tooltips; the snackbar with one action | `pnpm lint --chrome` (step 18) 0 findings at 1440, 1280 and 390 in both themes; `scripts/tooltip-audit.mjs --strict` 0 missing; a vitest that every Google item in section 2 is either a menu entry, a stub or in the omitted list (`menu-parity.test.ts`); no bare-letter handler in the editor (`editor-keys.test.ts`) |
| B3 Filmstrip, canvas and text | `packages/chrome/src/{Sidebar,ListRow,Thumb,SidebarFilter,Overlay}.tsx`, `packages/viewer/src/{Editor,InlineText,Selection,Gestures,Freeform,keys,GridView}.tsx`, new `NotesPane.tsx`, `ContextMenu.tsx` (uses B2's Menu), `Clipboard.ts` | Section 4; the canvas and object right-click menus (3.9); clipboard for slides and blocks; single click caret, Esc commits, Enter breaks or appends, Tab through table cells, spellcheck on, double and triple click; the notes pane with 400 ms coalescing; Google's arrange and nudge keys; skipped card rendering | Playwright `text-editing.spec.ts` (caret on click, Esc keeps, Enter paragraph, list append, Tab in a table) and `filmstrip.spec.ts` (multi-select drag, skip, right-click items); `inline-text.test.ts` extended for `\n` |
| B4 Routes, home and files | `apps/studio/src/routes/{index,decks.index,edit.$deckId}.tsx` (routes only; the editor's tables stay the integrator's), new `new.tsx`, `decks.trash.tsx`, `print.$deckId.tsx`, `apps/studio/src/server/{decks,write,download,bundle,thumbs}.ts`, `apps/studio/src/components/DeckViewer.tsx` (payload stripping) | `/new` with deferred create; the home page of 6.2; trash and the sweep; Open, Import slides, Make a copy, Details dialogs' server side; the view and embed payloads without notes and skipped slides; the print route; Recent from `localStorage` | Playwright `home.spec.ts` (create from `/new`, first edit creates the deck and renames it, home lists it with a thumbnail, trash and restore, Open dialog); `curl` of `/deck/<id>` shows no `notes` key; `hosted-smoke.mjs` extended with `/new`, `/decks/trash`, `/print/<id>` |
| B5 Export and print | `packages/export/src/**`, `packages/headless/src/**`, `apps/render-worker/**`, `apps/studio/src/server/export-sync.ts` | The `table` block as a native PPTX table in Editable text and in the invisible layer in Perfect; empty Texts skipped; skipped slides and notes honoured by the two checkboxes; slide hyperlinks; PDF through Chromium `page.pdf()` on the print route; PNG and JPEG of one slide; TXT | `turboslide export check` valid on a deck with a table in both modes; the Perfect gate (0.1 percent per page) holds; `docs/export-verification.md` gains the table row; a PDF of the GT deck opens in Preview with 85 pages |
| B6 Present mode and presenter | `packages/viewer/src/{Stage,SlideView}.tsx`, new `PresentToolbar.tsx`, `PresenterConsole.tsx`, `apps/studio/src/routes/present.$deckId.tsx`, `apps/studio/src/components/useStudioSession.ts` (goto) | Section 9: the split button's menu, the hover toolbar, the slide list, the laser pointer, black and white slides, Google's presenting keys, Presenter view with BroadcastChannel sync, skipped slides omitted | Playwright `present.spec.ts` (keys, blank slides, skipped omitted, two windows in sync); the viewer spec (step 17) still 6 of 6 |
| Integrator | `edit.$deckId.tsx` (`on(...)` table, the queue, `/new`'s deferred create hand-off from B4), `palette-data.ts`, `pnpm generate:contracts`, AGENTS.md, README.md, `docs/gslides-parity/BUILD-STATUS.md` (new), SPEC amendments | One tree where every action has a handler on the window transport; the contracts regenerated; the deviations list updated | `pnpm check` 19 of 19; `generate:contracts` "current" |
| Verifier | `scripts/*.mjs`, `docs/gslides-parity/verification/**` (new) | The ten tasks driven end to end against a `vite preview` and a preview deployment (`ten-tasks.spec.ts`), counts recorded against section 10.2; the production smoke; the tooltip audit; the chrome lint; the shortcut conflict test | The counts in 10.2 met or explained; 0 bare letters; 0 tooltip misses; the Perfect export passes on the preview; a written status like `docs/EDITOR-DEPTH-STATUS.md` |

Order of work: B1's schema and actions land first (a day), because B2 to B6 all read them; B2 and B3 run in parallel on the chrome and the stage; B4 and B5 run in parallel on the server side; B6 starts after B4's routes exist. The integrator merges twice: after B1, and after the rest.

## 12. Risks

1. The deferred create on `/new` is the one piece of client state the editor has never had (a document with no store behind it). If it slips, the fallback is Google's own behaviour, create on visit, with a sweep that trashes untitled revision-0 decks after 24 hours; the shared store then gains a deck per curious visitor until the sweep runs.
2. No identity and no access control (R10 B7, B11). Anyone who loads the host can trash any deck, including the GT brand deck; "Delete forever" is behind a confirmation and the 30-day trash, and the GT template deck is recreated from the bundled template if it goes missing, but a shared store with a dozen sellers needs the display-name step R10 C3 item 2 names, and roles need accounts (SPEC open questions 2, 3, 7).
3. The table block is the largest new piece of document, renderer, editor and exporter work in the round, and the pricing slide depends on it. If the native PPTX table slips, the Editable text export falls back to the ruled-rows construction (hairlines plus grouped text boxes) and the Download dialog says so in the Details link.
4. The paragraph break amends SPEC 4.2 and touches every Text consumer (parser, canonical form, lint, scene measurement, PPTX writer). The change is scoped to four block types and cells; `rows`, `plain`, headings and slide fields keep the one-line rule, which limits the blast radius.
5. The Perfect export runs 190 to 222 s inside a 300 s function (docs/EDITOR-DEPTH-STATUS.md section 10). The Download dialog's progress sentence is honest, but a larger deck fails from the menu; the worker service the status document asks for is the fix and is outside this round.
6. PDF through Chromium's `page.pdf()` has not been run in this repository; page size, font loading and raster quality at print resolution are unmeasured. If it fails the gate, PDF becomes a Later item and the print preview's "Print" (the browser's own Save as PDF) stands in.
7. The Blob 403 and the missing version record of the last round (docs/EDITOR-DEPTH-STATUS.md section 10) are unresolved. A fresh `/new` deck writes twice within a minute of creation, the exact pattern that went dark; immutable per-revision snapshots are the named fix, outside this round.
8. Retiring the bare letters and P, D, S, G, B changes the muscle memory of the one person who uses the viewer daily (Kevin). They stay in present mode where Google has letters, and Tools > Advanced > Run an action… keeps the palette; nothing else compensates.
9. Twenty-two Later stubs. Each is Google's item in Google's position with a one-sentence tooltip; a seller who tries Italic learns the theme has one style. If the grey items read as broken in the first drive, the fallback is to move the five text-style stubs into the Format options panel as a note and out of the toolbar.
10. Bullets. The Bulleted list button makes a ruled list because the GT grammar says so (SPEC 2.1). A seller pasting a bulleted agenda from a mail expects bullets; the ruled list is the theme's answer and the tooltip says so, but this is the one place parity and the grammar disagree in the seller's hands. The `marker` field (R09 C1) is the escape if Kevin wants glyph bullets.
11. Placeholder prompts change the meaning of an empty Text for every consumer. Thumbnails of a fresh deck are blank frames (Google's are too, by the model), and Check slides carries the `copy/empty-placeholder` findings; an agent that reads `slide.get` sees empty strings where it saw placeholder copy, so the skills' references must say so (integrator).
12. Google facts this proposal builds on that the reports could not verify: the exact toolbar order between Zoom and Background (corroborated by screenshots), the filmstrip menu's current order, whether Google deletes the last slide, Shift+Enter, Space in present mode, the presenter window's layout, the Windows key for Start from beginning. Each is named at its point of use, and none changes the seller's path if Google turns out to differ.
13. Copy and paste of slides and blocks through the system clipboard depends on `navigator.clipboard.writeText` and a paste event; Safari's permission prompts and Firefox's read restrictions mean the in-page clipboard is the one that always works, and cross-tab paste is best effort.
14. The Themes panel promises one theme with two variants and stores the variant in the manifest; every existing deck has no `defaults.theme` and reads as dark (the deck's default). A seller who presents from a light-themed room finds the toggle in the Themes panel, not on the toolbar where it was.

## Appendix A: what is hidden by default and how to reach it

| Surface at `8c7056c` | Default view now | Where it lives | Who reaches it |
| --- | --- | --- | --- |
| Lint badge, lint layer, Lint section | Not shown | Tools > Check slides (the panel, in plain words); Tools > Advanced > Show suggestion marks on the slide | A seller who wants suggestions; an agent through `lint.run` |
| Source drawer (Cmd+/) | Not shown | Tools > Advanced > Show source; no key | Agents through `source.read` and `source.apply`; a developer |
| Twin stage (Shift+D) | Not shown | Tools > Advanced > Light and dark side by side | A designer |
| Status chip's `r412`, lease, lint count | The save words only | Tools > Advanced > Show slide and block ids adds the revision to the title row's tooltip | A developer |
| Selection chip `type · id`, id tooltips, JSON pointers | Not shown | Tools > Advanced > Show slide and block ids | Agents reading the DOM see `data-control` regardless |
| Command palette's Actions group | Not shown; Search the menus lists menu items | Tools > Advanced > Run an action… | Agents use MCP and the API instead |
| Row menu's Render, Lint this slide, Copy id | Not shown | Tools > Advanced | |
| Sections as a collapsible tree with counts, the filter | Thin labels, no filter | Tools > Advanced > Show sections as a tree; Cmd+F replaces the filter | |
| Book view (B) | Not shown | Tools > Advanced > Read as a book | |
| Export card's modes, themes, fonts, verify, report | Perfect with two checkboxes | The Download dialog's More options and Details | |
| Deck bundle download and upload, Connect card | Not shown on the home page | File > Download > Turboslide bundle (.zip); File > Open > Upload; Extensions > Agent access | Agents and the CLI |
| Material, Dither, Deck tokens sections | Not shown | Tools > Advanced > Pictures and materials; tokens removed from the UI | A designer |
| History panel | Not shown | Tools > Advanced > Change history | |
| Versions panel | File > Version history | The right panel | Everyone |
| Conflict card with two JSON panes | Two buttons with words | Tools > Advanced > Show slide and block ids reveals the JSON | A developer |
| External revision banner | A toast naming the change | The same toast | |
| Hosting banner, footer, ids and revisions on the home page | Removed | `docs/hosting.md`; `/api/agent` facts | Operators |
| The `?edit=0`, `?twin=1`, `?lint=1`, `?src=1` search params | Still honoured | The address bar | Agents and links |
| `window.turboslide.studio`, `data-control`, MCP, `/api/actions`, the CLI | Unchanged | Extensions > Agent access names them | Agents |

## Appendix B: wording

Every string the default view shows a seller, in one place, so the builders write one vocabulary (R07, Naming). Sentence case, verbs on buttons, no engineering nouns.

- Title row: "Untitled presentation"; "Not saved yet"; "Saving…"; "All changes saved"; "Couldn't save, retrying"; "Last edit 2 minutes ago"; "Slideshow"; "Share".
- Toolbar tooltips: "Search the menus (Option+/)", "New slide (Ctrl+M)", "New slide with layout", "Undo (Cmd+Z)", "Redo (Cmd+Y)", "Print (Cmd+P)", "Paint format · Not available in Turboslide yet", "Zoom", "Select", "Text box", "Insert image", "Insert shape", "Insert line", "Insert comment · Not available in Turboslide yet", "Background", "Layout", "Theme", "Hide the menus (Ctrl+Shift+F)".
- Stubs: "Not available in Turboslide yet" followed by the clause in the section 2 tables.
- Prompts: "Click to add title", "Click to add a lead sentence", "Click to add section title", "Click to add a statement", "Click to add a number", "Click to add text", "Add a caption", "Click to add speaker notes".
- Toasts: "Slide deleted · Undo", "Moved to trash · Undo", "Applied <layout>. <n> <things> did not fit this layout · Undo", "Link copied", "All changes are saved automatically", "Someone else changed this slide. Your change was reapplied", "Skipped 3 slides · Undo".
- Dialogs: "Make a copy" (Name, "Remove speaker notes", Make a copy, Cancel); "Import slides" (Presentations, Upload, All, None, Back, Import slides); "Download" (Perfect, Editable text, "Include speaker notes", "Include skipped slides", More options, Download); "Share <title>" (View link, Present link, Edit link, Copy link, "Anyone with this link can edit", "Turboslide has no accounts yet. Anyone who has a link can open it"); "Delete <title> forever? This cannot be undone" (Delete forever, Cancel); "Find and replace" (Find, Replace with, Match case, Prev, Next, Replace, Replace all); "Slide numbers" (On, Off, "Skip title slides", Apply); "Details" (Title, Slides, Sections, Created, Last edit).
- Panels: "Themes" (GT, Light, Dark, Import theme); "Format options" (Size & rotation, Position, Layout, Text, Colour, Picture, Table, List, Alt text); "Version history" (Only show named versions, Restore this version, Name this version, Make a copy); "Suggestions for this slide" (Fix).
- Filmstrip: "Skipped: not shown when presenting or in downloads"; "Click + to add a slide".
- Home: "Start a new presentation", "Blank presentation", "GT brand deck", "Template gallery", "Recent presentations", "Search presentations", "Opened 2 hours ago", "Every presentation on this Turboslide is listed here", "Trash", "No presentations yet. Start one above", "Trash is empty", "Restore", "Delete forever", "Empty trash".
- Present mode: "3 of 10", "Open speaker notes", "Turn on the laser pointer", "Exit"; Presenter view: "Pause", "Reset", "Speaker notes", "No speaker notes for this slide", "Audience tools · Not available in Turboslide yet".

## Sources

Research reports in this repository, all written 2026-09-11 from public pages read the same day; this proposal cites them as R01 to R11 and did not reopen the pages:

- R01 `docs/gslides-parity/research/01-menu-bar.md` (the ten menus, item by item, with Google's sources G01 to G52 and T01 to T36)
- R02 `docs/gslides-parity/research/02-editor-surface.md` (anatomy, toolbar order, filmstrip, notes pane, panels, sizes)
- R03 `docs/gslides-parity/research/03-home-themes-layouts-io.md` (home page, themes and layouts, File menu dialogs)
- R04 `docs/gslides-parity/research/04-present-and-shortcuts.md` (present mode and the complete shortcut list)
- R05 `docs/gslides-parity/research/05-objects-and-format-options.md` (Insert, Format and Arrange objects and options)
- R06 `docs/gslides-parity/research/06-turboslide-inventory.md` (every Turboslide control, key and action at `8c7056c`)
- R07 `docs/gslides-parity/research/07-sales-users.md` (the sales user, top tasks, conventions, frustrations, design rules)
- R08 `docs/gslides-parity/research/08-context-menus-and-menu-conventions.md` (right-click menus, menu and dialog conventions)
- R09 `docs/gslides-parity/research/09-canvas-text-editing-model.md` (text interaction and the text model delta)
- R10 `docs/gslides-parity/research/10-identity-sharing-and-presence.md` (roles, sharing, comments, presence; Turboslide's author model)
- R11 `docs/gslides-parity/research/11-tables-charts-and-numbers.md` (tables, charts, big numbers)

Google pages the design depends on directly (read 2026-09-11 by the reports named; URLs as the reports record them):

- Keyboard shortcuts for Google Slides, https://support.google.com/docs/answer/1696717 (R01 G01, R04 G1, R06, R09 G1): every binding in section 8 and section 9.3
- Add, delete & organize slides, https://support.google.com/docs/answer/1694830 (R01 G05, R08 G01): New slide, Duplicate, Skip slide, filmstrip and grid view, slide numbers
- Use a Template or change the theme, background, or layout, https://support.google.com/docs/answer/1705254 (R03 S1): the definitions of theme, layout, template, background; Apply layout; Change theme; Import theme
- Present slides, https://support.google.com/docs/answer/1696787 (R04 G2): the Slideshow button, the present toolbar, the presenting keys
- Create, view, or download a file, https://support.google.com/docs/answer/49114 (R03 S9): Download, Make a copy, Rename
- Delete a document, spreadsheet, presentation, or video, https://support.google.com/docs/answer/6023494 (R03 S13): Move to trash
- Find what's changed in a file, https://support.google.com/docs/answer/190843 (R01 G16, R10 G9): Version history, named versions, Last edit
- Share files from Google Drive, https://support.google.com/docs/answer/2494822 (R10 G3): the Share dialog and roles
- Make Google Docs, Sheets, Slides & Forms public, https://support.google.com/docs/answer/183965 (R03 S7): Publish to web
- Insert or delete images & videos, https://support.google.com/docs/answer/97447 (R05 S2): image sources, Replace image, drag to replace
- Add and edit tables, https://support.google.com/docs/answer/1696711 (R11 G1): the table commands and the 20 by 20 cap
- Change how text fits in placeholders & text boxes, https://support.google.com/docs/answer/10364036 (R09 G4): the three autofit modes
- Insert and arrange text, shapes, diagrams, and lines, https://support.google.com/docs/answer/1696521 (R05 S1): Arrange items, snapping, guides
- Use Google Slides with a screen reader, https://support.google.com/docs/answer/1634140 (R01 G02, R09 G3): Enter starts editing, Escape returns to the container, the top area's structure
- Apps Script PredefinedLayout, https://developers.google.com/apps-script/reference/slides/predefined-layout (R03 S20, R05 S29): the eleven layout names
- Slides API text structure, https://developers.google.com/workspace/slides/api/concepts/text and https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/text (R09 G8, G14): paragraphs end in a newline; the placeholder prompt is not content
- Workspace Updates, More options for copying presentations, https://workspaceupdates.googleblog.com/2020/01/copy-presentation-options-slides.html (R07, R10 W11): Selected slides and Remove speaker notes
- Workspace Updates, Menu and toolbar updates, https://workspaceupdates.googleblog.com/2018/03/menu-and-toolbar-updates-in-google-docs.html (R01 G50): the Text, Move and Align submenus
- Computerworld, Google Slides cheat sheet, https://www.computerworld.com/article/1658651/how-to-use-google-slides.html (R02, R07): menu order, toolbar groups, home page
- CustomGuide, Google Slides quick reference card, https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf (R02, R07, R09 T4): the screen diagram, Paste without formatting
- Alice Keeler, Right click on the filmstrip, https://alicekeeler.com/2017/11/08/google-slides-right-click-filmstrip/ (R08 T01): the filmstrip menu order
- How-To Geek, Speaker notes in Google Slides, https://www.howtogeek.com/748657/how-to-use-speaker-notes-in-google-slides/ (R02, R09 T8): the notes pane and its handle
- BrightCarbon, Google Slides: The ULTIMATE guide, https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ (R02, R05 S60, R07): the contextual toolbar, paint format, tables, charts
- Nielsen Norman Group, Progressive disclosure, https://www.nngroup.com/articles/progressive-disclosure/, and Contextual menus, https://www.nngroup.com/articles/contextual-menus/ (R07): the two-stage rule and the rule that every context menu item is also in the main menu
- Material Design writing guidance, https://m1.material.io/style/writing.html (R07): sentence case, plain words

Turboslide files read at `8c7056c` on 2026-09-11 for this proposal: `docs/spec/SPEC.md` (sections 1 to 13), `docs/EDITOR-DEPTH-STATUS.md`, `docs/freeform.md`, `docs/deck-transfer.md` (section 1), `docs/pptx.md` (the two modes), `AGENTS.md` (head), `packages/schema/src/actions.ts` (the 54 ids), `packages/schema/src/catalog.ts` (`SLIDE_KIND_CATALOG`, `LAYOUT_CATALOG`), `packages/chrome/src/slide-templates.ts`, `packages/store/src/templates.ts`, `packages/export/src/pptx/notes.ts`, `apps/studio/src/routes/index.tsx`, `apps/studio/src/routes/decks.index.tsx`, and the folder listings of `apps/studio/src/routes`, `apps/studio/src/server`, `packages/chrome/src`, `packages/viewer/src`, `packages/export/src`.
