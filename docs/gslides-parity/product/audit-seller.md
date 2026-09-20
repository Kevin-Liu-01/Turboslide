# The first hour as a seller: friction, friendliness and flow

Audit of production (https://turboslide.vercel.app, main at 6e15d60) on 2026-09-19, played as a seller at General Translation who has never opened Turboslide. The walk was driven by Playwright with headless Chromium at human speed (mouse moves in steps, 40 to 90 ms per key, the browser's own double clicks and drags), twice: once at 1440 by 900 (tag a) and once at 1280 by 800 (tag b), plus one discovery pass and one probe pass at 1440 by 900 for the menus, tooltips and panels. Every scratch deck was moved to the trash from File, deleted forever on /decks/trash, and answers 404 on /deck/<id> (deck ids untitled-20260920-ory1, -h255, -yu8b, -rwya and -ku63; the walk logs record each 404). The scripts live in the session scratchpad under product/seller (lib.mjs, discover.mjs, walk.mjs, probe2.mjs); they import nothing but playwright-core. Every number below was read from the DOM, from window.turboslide.studio.describe().state or from the downloaded files; the screenshots, logs and JSON tables are in audit-seller/ beside this file.

## 1. What a seller feels today

The first minute is good. /home to an editable title slide is one click and about half a second (editor ready in 435 to 502 ms), the title slide already carries the company mark, the first keystroke creates the deck and the title row moves from Not saved yet to Saving… to All changes saved within one to two seconds, and a reload the next day shows everything as left in 0.6 to 1.0 s. The menus, the right click menus and the toolbar are Google's, the filmstrip drag draws an insertion line and Cmd+Down moves a slide, Delete on a card shows Slide deleted with Undo, and Cmd+Z undoes a new slide, a bulleted list and a deletion with the text intact. Slideshow opens in about 0.4 s, the arrows, digits, B and Esc do what Google's do, S opens the presenter window, and Presenter view has a timer, the notes, the next slide and a Slideshow connected badge. The view link opens a clean read only shell with thumbnails, an outline, Slide, Grid and Book modes and the words Arrow keys move. Press ? for every shortcut.

The friction begins on the second slide. New slide gives a layout with two identical Click to add text boxes, and the one a seller reaches first is a 20 px head paragraph at the top right, so the agenda ended beside the title instead of under it. A picture lands small at the top left over that prompt, 1.4 to 3.0 s after the file is chosen, with a snackbar reading asset.add: product-shot, and a caption is a text box placed by hand. A table and a chart land unselected on the same 960 px box, the chart on top of the table, so the seller clicks and drags before anything is usable. Typed addresses do not become links, Shift+Home takes the whole block, and Cmd+K is a bare https:// field. Share is the hardest screen of the hour: a requests band, an email invite with no accounts behind it, three Copy link rows, a Restricted select that says only people with access can open it, a footer sentence saying anyone with the address can open it and change it, and the address itself never on screen. The download needs a dialog, Download and Done, promises about half a minute, takes 4 to 15 s, and saves untitled-20260920-h255-dark.pdf for a deck called GT pitch for Acme. Move to trash gives no confirmation and no Undo and the deck stays in the Recent row. Around all of it the seller is Copper 859 on a deployment that lists everyone's decks, the theme panel offers GT light and GT dark and nothing a brand could change, and the Font control is disabled.

## 2. The items, sorted by value then effort

| # | Kind | Item | Value | Effort | Evidence | Reference |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | defect | A new chart or table is not selected and lands on top of what is there | 5 | 2 | a1440-14-chart-landed.png; b1280-14-chart-landed.png; tasks-a-1440x900.json (Pricing: chartSelected, tableSelected, overlap) | Google Slides: Insert > Chart inserts the chart selected, centred, and the seller drags it at once; Insert > Table selects the table with its handles |
| 2 | defect | The default content layout carries two identical Click to add text prompts and the first one a seller reaches is a 20 px head paragraph | 5 | 2 | a1440-05-agenda-done.png; b1280-05-agenda-done.png; a1440-17-closing-done.png; p1440-05-layout-picker.png | Google Slides: Title and body is one title placeholder over one body placeholder; New slide after a Title slide gives Title and body |
| 3 | friction | The Share dialog is dense and contradicts itself, and the link is never shown | 5 | 3 | a1440-27-share-dialog.png; a1440-28-share-link-on.png; b1280-27-share-dialog.png; tasks-b-1280x800.json (Share) | Google Slides Share dialog: Add people, General access (Restricted or Anyone with the link plus a role), one Copy link, Done |
| 4 | missing feature | A colleague who opens the editor address gets View only, and the deck list shows everyone's decks under generated names | 5 | 4 | p1280-editor.png; a1440-34-decks-with-deck.png; p1440-12-template-gallery.png; a1440-01-decks-empty.png | Google Slides: the home lists your files and files shared with you; a person with the link edits when General access is Editor; collaborators appear by name |
| 5 | missing feature | The Font control is disabled and the only face is Inter | 5 | 4 | p1440-08-font-disabled.png; probe2.log (font-control) | Google Slides: the Font dropdown with recent fonts, the theme fonts and More fonts |
| 6 | brand need | There is no brand kit: the theme panel offers GT light and GT dark and nothing else | 5 | 5 | p1440-06-theme-panel.png; p1440-07-theme-light.png; b1280-03-title-mark-selected.png | Google Slides: Slide > Edit theme changes logos, colours and fonts for every layout; Pitch and Gamma: a brand kit with logo, colours and fonts applied to templates |
| 7 | defect | The download is named after the deck id and the appearance instead of the title | 4 | 1 | tasks-a-1440x900.json (Download the PDF, Download the PowerPoint: file); walk-b-1280x800.log | Google Slides: File > Download saves <presentation title>.pdf |
| 8 | friction | Download needs a dialog, a Download click and a Done click, and its estimate reads about half a minute | 4 | 2 | a1440-29-download-pdf-dialog.png; a1440-30-download-pdf-ready.png; b1280-30-download-pdf-ready.png | Google Slides: File > Download > PDF Document saves the file with no dialog in about 3 s |
| 9 | missing feature | Typed web addresses and email addresses are not linked | 4 | 2 | b1280-17-closing-done.png; tasks-b-1280x800.json (Closing: selected, bodyRun) | Google Slides: Link detection (Tools > Preferences) links a typed URL; a double click selects the whole address |
| 10 | friction | A picture from a file lands small at the top left over the head prompt, and a caption needs a separate text box | 4 | 2 | a1440-08-picture-landed.png; a1440-09-picture-format-options.png; a1440-10-picture-caption.png; b1280-10-picture-caption.png | Google Slides: an uploaded image is centred, fitted to the slide and selected; Format options for an image shows only image sections |
| 11 | defect | The PowerPoint the seller downloads has the table and the chart as a picture | 4 | 4 | a1440-31-download-pptx-dialog.png; walk-a-1440x900.log (Download the PowerPoint); the unzip listing recorded in audit-seller.md section 4 | Google Slides: File > Download > Microsoft PowerPoint writes native tables and charts |
| 12 | friction | The template gallery is a link that scrolls to two tiles | 4 | 4 | p1440-12-template-gallery.png; probe2.log (template-gallery) | Google Slides: the template gallery with about 25 templates in Personal and Work sections |
| 13 | ai assist | No way to start a deck from notes or ask for a slide | 4 | 5 | tasks-a-1440x900.json (clicks and keys per task); a1440-02-fresh-editor.png | Gamma: a deck from a prompt or an outline; Google Slides: Gemini's Help me create a presentation (paid plans) |
| 14 | defect | The snackbar after a picture upload reads asset.add: product-shot | 3 | 1 | a1440-08-picture-landed.png; tasks-b-1280x800.json (Product: snack) | Google Slides: no message after an image insert; research 07 rule 22 (no engineering noun in the default view) |
| 15 | defect | A trashed deck stays in the Opened on this device row | 3 | 1 | a1440-36-after-trash.png; b1280-36-after-trash.png | Google Slides home: a trashed file leaves Recent at once |
| 16 | friction | Move to trash from the editor gives no confirmation and no Undo | 3 | 1 | a1440-36-after-trash.png; tasks-a-1440x900.json (Delete: snack, ms) | Google Slides: File > Move to trash keeps the file open under a banner with Restore and Delete forever |
| 17 | friction | Insert > Image opens a submenu with one row | 3 | 1 | tasks-a-1440x900.json (Product: imageRows); d-04-menu-insert.png | Google Slides: Insert > Image lists five sources; Pitch: Image opens the picker at once |
| 18 | defect | Shift+Home selects to the start of the whole text, not the line | 3 | 2 | tasks-b-1280x800.json (Closing: shiftHomeSelected) | Google Slides and every text field: Shift+Home selects to the start of the current line |
| 19 | friction | Cmd+K opens a bare https:// field with no label, no Apply, no Remove and no slide targets | 3 | 2 | a1440-16-link-dialog.png; b1280-16-link-dialog.png; probe2.log (canvas-context-title) | Google Slides Insert > Link: Text, Link with search, Slides in this presentation, Apply; the link chip with Change and Remove |
| 20 | brand need | Every new deck starts dark | 3 | 2 | a1440-02-fresh-editor.png; p1440-07-theme-light.png | Google Slides: the default theme is light; Keynote asks for a theme when a deck is created |
| 21 | polish | Format options for a picture shows text sections | 3 | 2 | a1440-09-picture-format-options.png | Google Slides Format options for an image: Size & rotation, Position, Recolor, Adjustments, Drop shadow, Reflection |
| 22 | friction | A picture takes up to 3 s to appear after the file is chosen | 3 | 2 | tasks-a-1440x900.json; tasks-b-1280x800.json (Product: picMs) | Google Slides: an uploaded image appears within about a second with a loading placeholder |
| 23 | friction | The PowerPoint export takes 12 to 15 s and the PDF 4 to 8 s for six slides | 3 | 4 | tasks-a-1440x900.json; tasks-b-1280x800.json (Download: readyMs, progressWords) | Google Slides: a six slide PDF or PPTX download arrives in about 3 to 5 s |
| 24 | friction | The /home page speaks to engineers | 2 | 1 | d-01-home.png; discover.log (home hero) | Pitch and Gamma home pages: the first sentence names the deck a team makes, the first button starts from a template |
| 25 | polish | A white block appears at the bottom left of the show when the bar is up | 2 | 1 | a1440-23-show-bar.png; b1280-23-show-bar.png | Google Slides presenter bar: the bar alone at the bottom left |
| 26 | polish | The layout tiles' tooltips describe geometry | 2 | 1 | p1440-05-layout-picker.png | Google Slides: layout names alone; research 07 rule 22 |
| 27 | polish | The bottom bar is an empty 32 px strip with one chevron | 2 | 1 | a1440-02-fresh-editor.png; discover.log (bottombar) | Google Slides: the filmstrip and grid view toggle at the bottom left; no other bar |
| 28 | polish | New deck thumbnails stay blank in the Recent row | 2 | 2 | p1440-12-template-gallery.png; a1440-34-decks-with-deck.png | Google Slides home: a thumbnail within seconds of the first edit |
| 29 | friction | New slide takes about a second to show the new slide | 2 | 3 | walk-a-1440x900.log; walk-b-1280x800.log (time New slide) | Google Slides: the new slide appears in about 200 ms |
| 30 | polish | The Insert > Table tooltip covers the neighbouring rows | 1 | 1 | b1280-11-table-grid.png; a1440-11-table-grid.png | Google Slides: no tooltip on a menu row with an open submenu |
| 31 | polish | After Escape closes a menu the focus ring stays on the menubar button | 1 | 1 | d-05-toolbar-tip.png | Google Slides: focus returns to the canvas when a menu closes |
| 32 | polish | The presence icon has no tooltip and Not saved yet shows before anything is typed | 1 | 1 | a1440-02-fresh-editor.png; probe2.log (tooltips) | Google Slides: no save state until the first edit; every title row icon has a tooltip |
| 33 | polish | The Keyboard shortcuts dialog lists Redo twice and opens on Last edit | 1 | 1 | p1440-09-shortcuts.png | Google Slides Keyboard shortcuts dialog: Common actions first, no duplicates |

## 3. The tasks against Google Slides

Clicks and keys are the walk's own counts (a menu row is one click, a drag is counted apart); seconds are wall time of the task including human speed typing. Google's figures are estimates from the parity research (docs/gslides-parity/research/03, 07) and from the auditor's use of Google Slides.

| Task | Turboslide 1440 by 900 | Turboslide 1280 by 800 | Google Slides estimate | Notes |
| --- | --- | --- | --- | --- |
| Start a presentation from /home | 1 click, 2.3 s (editor ready 0.50 s) | 1 click, 2.3 s (0.49 s) | 1 click, about 2 s | Equal. The New Presentation tooltip reads Opens a fresh presentation; no account needed. |
| Title slide with the mark, a title and a subtitle | 3 clicks, 73 keys, 9.0 s | 3 clicks, 73 keys, 9.0 s | 2 clicks plus typing; a logo needs Insert > Image | Better than Google for a GT seller: the mark is on the layout. All changes saved within 0.1 to 1.9 s of Escape. |
| Agenda: New slide, title, four lines | 3 clicks, 103 keys, 10.2 s | 3 clicks, 103 keys, 10.2 s | 3 clicks plus typing | The lines landed in the head paragraph (item 2). New slide took 0.88 to 0.97 s. |
| Problem slide as a bulleted list | 4 clicks, 137 keys, 18.1 s | 4 clicks, 137 keys, 16.1 s | 4 clicks plus typing | Bulleted list on the tail worked with Cmd+A; undo and redo kept the text. |
| Product slide: picture from a file, moved, captioned | 10 clicks, 67 keys, 1 drag, 19.1 s (picture 2.96 s) | 10 clicks, 67 keys, 1 drag, 17.9 s (1.43 s) | 7 clicks, 1 drag; the picture lands centred | Items 10, 14, 17, 22. |
| Pricing slide: 3 by 3 table typed, column chart beside it | 9 clicks, 58 keys, 2 drags, 20.6 s | 9 clicks, 58 keys, 2 drags, 24.0 s | 7 clicks, 1 drag | Table typing by single click and Tab worked; the chart landed on the table (item 1). |
| Closing slide with contact details and a link | 6 clicks, 114 keys, 13.3 s | 6 clicks, 114 keys, 19.1 s | 3 clicks; a typed address links itself | Items 9, 18, 19. |
| Rename the deck | 1 click, 18 keys, 4.3 s | 1 click, 18 keys, 4.6 s | 1 click plus typing | Equal. The click selects the whole name, Enter keeps it, the tab title follows. |
| Reorder two slides (drag, then Cmd+Down) | 1 drag, 1 click, 1 key, 6.6 s | 1 drag, 1 click, 1 key, 6.8 s | 1 drag | Equal. The card tooltip is the slide title. |
| Present: the show, the keys, presenter view | 4 clicks, 10 keys, 15.2 s (show 0.43 s, presenter 2.6 s) | 4 clicks, 10 keys, 15.6 s (0.40 s, 2.7 s) | 1 click, then 2 clicks for Presenter view | Equal in clicks; the presenter window needs 2.6 to 2.7 s. |
| Share a view link and open it elsewhere | 5 clicks, 9.0 to 13.8 s (dialog 0.44 to 0.57 s, viewer 3.3 s) | 5 clicks, 12.1 s (0.56 s, 3.7 s) | 5 clicks | Equal in clicks, far harder to read (item 3). |
| Download the PDF | 4 clicks, 7.3 to 11.4 s (file 4.1 to 8.1 s) | 4 clicks, 7.3 s (4.1 s) | 3 clicks, about 3 s, no dialog | Items 7, 8, 23. 6 pages, the title in the metadata. |
| Download the PowerPoint | 4 clicks, 15.8 to 18.1 s (file 12.8 to 15.2 s) | 4 clicks, 15.9 s (12.6 s) | 3 clicks, about 5 s | 6 slides, a raster per slide with a text layer; the table and the chart are in the raster (item 11). |
| Come back the next day (reload, the /decks card, reopen) | reload 0.78 to 1.0 s, reopen 0.40 to 0.53 s | reload 0.62 s, reopen 0.53 s | about 2 s | Better than Google. Order, texts, objects and the name were as left; the card had the title and a thumbnail. |
| Delete the scratch deck (trash, Trash page, Delete forever) | 5 clicks, 9.1 to 11.4 s (trash 2.0 to 2.9 s) | 5 clicks, 8.1 s (2.1 s) | 2 clicks, plus 3 in Drive | The Delete forever dialog is clear (6 slides and every version of GT pitch for Acme are deleted); the trash step is silent (items 15, 16). |

## 4. The files the seller downloaded

Both PDFs have 6 pages and the title GT pitch for Acme (dark) in their metadata. Both PowerPoints have 6 slides; ppt/media holds one PNG per slide plus the mark; slide4.xml (the product slide) has one p:pic (the slide raster) and the caption's text as a:t runs, and slide5.xml (the pricing slide) has no a:tbl and no c:chart, so the table and the chart are pixels in the Perfect mode the dialog selects by default. Files were saved under the scratchpad (files-a, files-b) and not committed.

## 5. What felt good, to keep

- One click from /home to an editable slide, and the deck exists on the first keystroke with the address moving to /edit/<id> without a reload.
- The save state words and their tooltip (All changes saved, Saving, Offline, Not saved yet or Couldn't save, retrying).
- The mark on the title slide for a GT seller, and the footer with the glyph and the slide number.
- Google's menus, toolbar order, right click menus (the filmstrip card's, the empty canvas', a text block's and a picture's all matched the reference), the selection dependent tail, and Search the menus with paths.
- Undo covering New slide, Delete slide (with the Slide deleted, Undo snackbar), the bulleted list and every object move.
- The filmstrip drag with an insertion line, the card tooltip as the slide title, Cmd+Up and Cmd+Down.
- The New slide with layout picker: eleven Google layouts by name and thumbnail, then the GT layouts.
- The table grid with its 3 x 3 readout, single click cell typing and Tab between cells; the table's twelve handles and the live size readout on resize.
- The Slideshow split button, the show's keys, the S key to the presenter, Presenter view with timer, notes, next slide and Slideshow connected, and the presenter's arrow moving the show.
- The view link's shell: thumbnails with titles, Slide, Grid and Book, Theme, Present, and the hint Arrow keys move. Press ? for every shortcut.
- Speaker notes typed under the slide appear in Presenter view.
- The Delete forever dialog's words, and the Trash page's sentence.
- Reload and reopen under a second, with everything as left.

## 6. The ten items this round should do first

1. Select what was just inserted and land it in free space (item 1): the smallest change with the largest daily effect on tables, charts and pictures.
2. One title over one body as the default content layout, and different prompts for different boxes (item 2).
3. The Share dialog as one link with one Copy link and one sentence about access (item 3).
4. The Font dropdown with a curated list and the brand kit's faces (item 5): Kevin's stated ask.
5. Name downloads after the title (item 7): one line, and every attached file reads right.
6. Download without the dialog for the defaults, honest progress, no Done click (item 8).
7. Link detection for typed addresses and emails, and a whole word double click on an address (item 9).
8. Picture placement, instant preview, Add a caption, and a picture only Format options (items 10, 21, 22).
9. Trash with a visible Undo and a Recent row that drops the trashed deck (items 15, 16).
10. Plain words: the asset.add snackbar, the layout tooltips, the presence tooltip, the shortcuts duplicates (items 14, 26, 32, 33).

Behind these ten, the two structural needs of the round are the brand kit (item 6) and the identity and deck list model (item 4); they decide whether another brand can use the product at all, and they are the largest work.

## 7. What to leave

- Rename, reorder, present, the presenter view, notes, undo, the right click menus and the layout picker match or beat Google; leave them as they are.
- The PowerPoint Perfect mode stays the default for fidelity; change its sentence and the default when a table or chart is present before rebuilding the exporter (item 11).
- The show's bar, the shortcuts dialog and the bottom bar are polish; do them in the same pass as the words.
- Speed: New slide under a second and the presenter under three seconds are acceptable for this round; the exports are the slow steps worth engineering time (item 23).
- The 1280 by 800 viewport needed no changes: the toolbar did not fold, nothing scrolled horizontally, and every task took the same clicks.

## 8. The items in full

### 1. A new chart or table is not selected and lands on top of what is there

Kind: defect. Value 5, effort 2.

Today: Insert > Chart > Column placed the chart at 320,180 with the fixed 960 by 540 box (packages/schema/src/rules.ts 1423 to 1424) over the table the seller had just typed at 320,290 by 960 by 320: the two overlapped by 108,985 CSS px squared at 1280 and 152,686 at 1440, the chart's axis labels sat on the table's cells (a1440-14-chart-landed.png, b1280-14-chart-landed.png), and nothing was selected afterwards (chip null, no handles). The table too arrived unselected: the chip still read Title and there were 0 handles (tasks-a-1440x900.json, Pricing.tableSelected). The seller had to click the chart first, then drag it (2 extra actions), and a first click on the table's cell opened a cell session instead of selecting the table.

Proposal: After block.insert of any object from a menu or the toolbar, select it (ring, handles, chip, its tail) so a drag or Delete works at once, as Google does. Place a new table, chart or picture in the largest free rectangle of the body slot; when the slot is taken, cascade 40 by 40 sheet px from the last object like Google's paste. Size a chart to 640 by 360 when it shares the slot with another object. Files: apps/studio/src/editor/controller.tsx (the block.insert path), packages/schema/src/rules.ts 1423 to 1424, packages/viewer/src/Editor.tsx (the selection after a write).

Evidence: a1440-14-chart-landed.png; b1280-14-chart-landed.png; tasks-a-1440x900.json (Pricing: chartSelected, tableSelected, overlap)

Reference: Google Slides: Insert > Chart inserts the chart selected, centred, and the seller drags it at once; Insert > Table selects the table with its handles

### 2. The default content layout carries two identical Click to add text prompts and the first one a seller reaches is a 20 px head paragraph

Kind: defect. Value 5, effort 2.

Today: New slide after the title slide gives the split layout (packages/schema/src/layouts.ts 286 to 295: a heading at column 4, a paragraph p1 at column 8, a body p2 under them), and both p1 and p2 show Click to add text (promptFor, layouts.ts 77 to 95). The seller's four agenda lines went into p1 and rendered as a 20 px paragraph at the top right beside the title while the body stayed empty (a1440-05-agenda-done.png, b1280-05-agenda-done.png); the same happened on the closing slide (a1440-17-closing-done.png). The New slide arrow's Title and body thumbnail shows the two prompts too (p1440-05-layout-picker.png).

Proposal: Make the layout named Title and body one title over one body (the one-column-text layout, or split with head 'single'), and make it the layout New slide picks after a title slide. Keep the 4/8 split as 'Title, lead and body' with the head paragraph's prompt reading Click to add a lead, so the two boxes never read the same. Files: packages/schema/src/layouts.ts 213 to 226 and 286 to 295, promptFor 77 to 95, the New slide layout choice in apps/studio/src/editor/controller.tsx.

Evidence: a1440-05-agenda-done.png; b1280-05-agenda-done.png; a1440-17-closing-done.png; p1440-05-layout-picker.png

Reference: Google Slides: Title and body is one title placeholder over one body placeholder; New slide after a Title slide gives Title and body

### 3. The Share dialog is dense and contradicts itself, and the link is never shown

Kind: friction. Value 5, effort 3.

Today: Share opened in 0.44 to 0.57 s to: a No pending requests band, Add people by email with a Role select and Send (there are no accounts), the owner row as Copper 859 or Chromium 218, a Links list with View link, Present link and Edit link each with Copy link, then General access reading Restricted with the sentence Only people with access can open it, a gear icon with no label, Publish to the web, two footer sentences, and a footer Copy link whose target is not named (a1440-27-share-dialog.png). Picking Anyone with the link added a row reading Anyone with t… Viewer 9/19/2026 Rotate Revoke and a Stop sharing row (a1440-28-share-link-on.png). The address itself appeared nowhere; it reached the clipboard only through Copy link (Link copied). The last footer sentence reads: Sharing is not enforced on this deployment: the roles here are shown and logged, anyone with the address can open the presentation, and a change from any browser is accepted (packages/chrome/src/dialogs/Share.tsx 239 to 242). Five Copy link buttons are on one dialog.

Proposal: One link section: the General access select, the address in a read only field beside one Copy link button, and a checkbox Open as a slideshow that swaps the address for the present link. Move Add people, the requests band, the three link rows and the gear behind a More row until accounts exist. Label the gear Settings, label the date column Created, and show the full label of a link row. Replace the deployment sentence with one line under the select that states what the selected access does on this deployment. Files: packages/chrome/src/dialogs/Share.tsx 1005 to 1046 (the Links list), 1081 to 1135 (General access), 1137 to 1210 (the link rows), 1283 to 1296 (the footer).

Evidence: a1440-27-share-dialog.png; a1440-28-share-link-on.png; b1280-27-share-dialog.png; tasks-b-1280x800.json (Share)

Reference: Google Slides Share dialog: Add people, General access (Restricted or Anyone with the link plus a role), one Copy link, Done

### 4. A colleague who opens the editor address gets View only, and the deck list shows everyone's decks under generated names

Kind: missing feature. Value 5, effort 4.

Today: A second browser opening /edit/<id> got a View only toolbar with File, View, Tools and Help only (p1280-editor.png, toolbar.viewOnly), while the Share dialog's footer said a change from any browser is accepted. /decks lists every deck on the deployment under the sentence Every presentation on this Turboslide is listed here (packages/chrome/src/menus/strings.ts 858), including other teams' decks with blank or foreign thumbnails (a1440-34-decks-with-deck.png, p1440-12-template-gallery.png), and the seller's own identity reads as a metal and a number (Copper 859, Chromium 218, Iridium 424; packages/identity/src/labels.ts 107 to 111). There is no sign in and no way to tell which decks are the seller's beyond the Opened on this device row.

Proposal: Optional sign in (email link or Google) that names the person and owns their decks; until then, ask for a display name on the first save (Your name, shown to collaborators) and show the current person as You in Share and presence. Make /decks show this browser's and this person's decks first and put the deployment wide list under a tab Everyone's presentations. Give a deck created anonymously a default General access of Anyone with the link as Editor when the owner pastes the address bar URL, or make the Share footer Copy link copy the edit link, so a colleague can co-edit from the address the seller has. Files: apps/studio/src/routes/decks.index.tsx 700 to 800, packages/identity/src/labels.ts, packages/chrome/src/dialogs/Share.tsx, apps/studio/src/server/authorize.ts.

Evidence: p1280-editor.png; a1440-34-decks-with-deck.png; p1440-12-template-gallery.png; a1440-01-decks-empty.png

Reference: Google Slides: the home lists your files and files shared with you; a person with the link edits when General access is Editor; collaborators appear by name

### 5. The Font control is disabled and the only face is Inter

Kind: missing feature. Value 5, effort 4.

Today: In a text session the toolbar shows Font as a disabled button with the tooltip The GT theme sets Inter. (p1440-08-font-disabled.png, toolbar.font aria-disabled true); Format > Text lists Bold to Capitalization and Size but no Font row (probe2.log font-control). Kevin's directive asks for more font options.

Proposal: A Font dropdown with the brand kit's faces first, then a curated list of 10 to 12 open faces (Inter, Geist, IBM Plex Sans, Source Sans 3, Roboto, Open Sans, Lato, Merriweather, Playfair Display, JetBrains Mono, Space Grotesk, Work Sans) with a search field and a More fonts row, applied to the selection or as the deck default; embed the faces in the PPTX editable text export and the PDF. Files: packages/chrome/src/ToolbarTail.tsx 182 to 200 (toolbar.font), packages/chrome/src/menus/model.ts (Format > Text), packages/fonts.

Evidence: p1440-08-font-disabled.png; probe2.log (font-control)

Reference: Google Slides: the Font dropdown with recent fonts, the theme fonts and More fonts

### 6. There is no brand kit: the theme panel offers GT light and GT dark and nothing else

Kind: brand need. Value 5, effort 5.

Today: Theme opened a panel with four tiles that are the same two appearances twice (GT: Light, Dark; In this presentation: Light, Dark; p1440-06-theme-panel.png); switching to Light took 1.6 s. The title slide's mark is the GT glyph from the layout (selectable as Mark with ten handles, b1280-03-title-mark-selected.png), the footer carries the GT glyph and the slide number, and no control changes a logo, a colour, a font or the footer. Another brand's seller can only upload their logo as a picture on every slide.

Proposal: A Brand kit panel reached from Theme and from /decks: logo upload with light and dark twins that replaces the layout mark and the footer glyph, a primary and an accent colour mapped to the theme tokens, the default appearance, a font pair from the font catalog, the footer text, and a Reset to GT. Store it on the deck (and as a deployment default), and export it through the PPTX and PDF paths. Files: packages/chrome/src/ThemesPanel.tsx, packages/theme/src/brand.ts, packages/schema/src/layouts.ts (the mark and credit slots), docs/gslides-parity/SPEC-5.md section 4 (templates on ts-plate).

Evidence: p1440-06-theme-panel.png; p1440-07-theme-light.png; b1280-03-title-mark-selected.png

Reference: Google Slides: Slide > Edit theme changes logos, colours and fonts for every layout; Pitch and Gamma: a brand kit with logo, colours and fonts applied to templates

### 7. The download is named after the deck id and the appearance instead of the title

Kind: defect. Value 4, effort 1.

Today: File > Download > PDF saved untitled-20260920-h255-dark.pdf and the PowerPoint saved untitled-20260920-h255-dark.pptx for a deck named GT pitch for Acme (tasks-a-1440x900.json Download.file; files-b: untitled-20260920-yu8b-dark.pdf). The PDF's own metadata title reads GT pitch for Acme (dark). A seller attaching the file to an email has to rename it first.

Proposal: Name the file from the deck title with unsafe characters removed (GT pitch for Acme.pdf), and add the appearance only when both appearances are exported in one run. Files: apps/studio/src/server/export-sync.ts 381 to 383 (the content-disposition name) and the batch plan that builds the name in packages/export/src/batch/plan.ts.

Evidence: tasks-a-1440x900.json (Download the PDF, Download the PowerPoint: file); walk-b-1280x800.log

Reference: Google Slides: File > Download saves <presentation title>.pdf

### 8. Download needs a dialog, a Download click and a Done click, and its estimate reads about half a minute

Kind: friction. Value 4, effort 2.

Today: File > Download > PDF opened a dialog with the sentence One slide per page, 13.333 by 7.5 inches. The speaker notes are not in the PDF; File > Print preview prints them under each slide, an Include skipped slides checkbox, Cancel and Download (a1440-29-download-pdf-dialog.png). After Download the status read Preparing your PDF, about half a minute for 6 slides (packages/chrome/src/dialogs/Download.tsx 28 to 39) while the file arrived in 4.1 to 8.1 s; then Your file is ready. Details with Cancel and Done, so the seller clicks Done to leave (a1440-30-download-pdf-ready.png). Four clicks per download against Google's three, and the dialog stays after the file is saved.

Proposal: Start the PDF and the default PowerPoint at once from the menu row with a snackbar Preparing your PDF… that turns into Saved GT pitch for Acme.pdf with a Details action; keep the dialog for the PowerPoint modes and options behind a Download options… row. When the dialog stays, close it when the file is saved. Make the estimate honest: measured seconds per slide from the last export, and no estimate under 10 s. Files: packages/chrome/src/dialogs/Download.tsx 28 to 39 and 96 to 112, packages/chrome/src/menus/model.ts 900 to 940 (the Download rows).

Evidence: a1440-29-download-pdf-dialog.png; a1440-30-download-pdf-ready.png; b1280-30-download-pdf-ready.png

Reference: Google Slides: File > Download > PDF Document saves the file with no dialog in about 3 s

### 9. Typed web addresses and email addresses are not linked

Kind: missing feature. Value 4, effort 2.

Today: The seller typed kevin@generaltranslation.com and generaltranslation.com on the closing slide and both stayed plain text (b1280-17-closing-done.png). To link the site they had to select it and press Cmd+K; the double click on generaltranslation.com selected generaltranslation only, so the link wrapped that word and .com stayed outside (tasks-b-1280x800.json Closing.bodyRun: <a href=https://generaltranslation.com>generaltranslation</a>.com).

Proposal: Link detection on typing: after a space or Enter following a token that parses as a URL or an email, wrap it as a link (mailto: for emails), undoable with one Cmd+Z, with a preference under Tools to turn it off. Make double click select a dotted address as one word. Files: packages/viewer/src/InlineText.tsx (the burst path and the word selection), packages/viewer/src/marks.ts.

Evidence: b1280-17-closing-done.png; tasks-b-1280x800.json (Closing: selected, bodyRun)

Reference: Google Slides: Link detection (Tools > Preferences) links a typed URL; a double click selects the whole address

### 10. A picture from a file lands small at the top left over the head prompt, and a caption needs a separate text box

Kind: friction. Value 4, effort 2.

Today: Insert > Image > Upload from computer placed the picture at 136,128 by 480 by 335 sheet px, over the head paragraph's Click to add text, at z 3 (a1440-08-picture-landed.png), 1.4 to 3.0 s after the file was chosen (picMs 1427, 2800, 2958). The Format options panel for the picture offered Size & rotation, Position, then Text fitting, Text, Typography, Columns and Indentation, and no caption field (a1440-09-picture-format-options.png), so the caption was a text box placed by hand under the picture (a1440-10-picture-caption.png). Two Click to add text prompts stayed on the slide around the picture.

Proposal: Centre a new picture in the body slot at the largest size that fits with a 40 px margin and select it; show the picture at once from the local file while the upload lands. Add Add a caption to the picture's context menu and tail, writing the shot block's caption (packages/schema/src/blocks.ts 509 and 528) with the prompt Add a caption. Scope Format options to the selected kind: a picture shows Size & rotation, Position, Image options and nothing about text. Files: apps/studio/src/editor/EditorRoot.tsx 1193 to 1215 (uploadPicture), packages/chrome/src/FormatOptions.tsx, packages/chrome/src/menus/model.ts (format.image rows).

Evidence: a1440-08-picture-landed.png; a1440-09-picture-format-options.png; a1440-10-picture-caption.png; b1280-10-picture-caption.png

Reference: Google Slides: an uploaded image is centred, fitted to the slide and selected; Format options for an image shows only image sections

### 11. The PowerPoint the seller downloads has the table and the chart as a picture

Kind: defect. Value 4, effort 4.

Today: The default download mode Perfect wrote each slide as a full slide PNG with a text layer: slide5.xml has no a:tbl and no c:chart, one p:pic (files-a/untitled-20260920-h255-dark.pptx, unzip -l; files-b likewise). A customer who opens the PPTX cannot change a price in the table. The dialog names the other mode Editable text and says Text boxes you can edit in PowerPoint; layout within a few pixels, and says nothing about tables and charts (a1440-31-download-pptx-dialog.png).

Proposal: In Perfect mode write tables as native a:tbl and charts as native c:chart over their area of the raster (the text layer already sits over the raster), so a customer edits numbers; until then, make the mode sentence say Tables and charts are pictures in this mode and make Editable text the default when the deck holds a table or a chart. Files: packages/export/src/export-pptx.ts, packages/export/src/ooxml, packages/chrome/src/dialogs/Download.tsx 118 to 150.

Evidence: a1440-31-download-pptx-dialog.png; walk-a-1440x900.log (Download the PowerPoint); the unzip listing recorded in audit-seller.md section 4

Reference: Google Slides: File > Download > Microsoft PowerPoint writes native tables and charts

### 12. The template gallery is a link that scrolls to two tiles

Kind: friction. Value 4, effort 4.

Today: Template gallery on /decks is an anchor to #templates (apps/studio/src/routes/decks.index.tsx 666 to 674) that scrolls to the strip with Blank presentation and GT brand deck; File > New > From template gallery goes to /decks#templates and shows the same two tiles (p1440-12-template-gallery.png). A seller looking for a sales pitch, a QBR or a one pager finds nothing to start from.

Proposal: Ship the eight templates of docs/gslides-parity/SPEC-5.md section 4 (Sales pitch first) as decks on the plate theme, with a gallery band of thumbnails and one sentence each; until they exist, name the link Templates and remove From template gallery from File > New. Files: apps/studio/src/routes/decks.index.tsx 640 to 700, packages/chrome/src/menus/model.ts 862 to 866.

Evidence: p1440-12-template-gallery.png; probe2.log (template-gallery)

Reference: Google Slides: the template gallery with about 25 templates in Personal and Work sections

### 13. No way to start a deck from notes or ask for a slide

Kind: ai assist. Value 4, effort 5.

Today: /new opens one title slide; every one of the six slides was built by hand (New slide, Layout, typing, Insert), 40 clicks and 580 keys over about 100 s of the walk before present and share. The product exposes 169 actions to agents (the /home facts band) but a seller in the editor has no assistant.

Proposal: An Outline to deck start on /new and on the home strip: paste notes or a brief, choose the template, get the six slides with layouts picked per section, editable at once. In the editor, an Ask field in the toolbar tail that runs the same actions with the same undo: Turn these lines into a table, Add a caption, Rename the deck, Move the pricing slide after the product. Both run on the existing action table (packages/schema/src/actions.ts) through the window transport so every result is an undoable revision. Files: apps/studio/src/routes/new.tsx, packages/chrome/src/Palette.tsx (the query field as the entry), apps/studio/src/server/agent-actions.ts.

Evidence: tasks-a-1440x900.json (clicks and keys per task); a1440-02-fresh-editor.png

Reference: Gamma: a deck from a prompt or an outline; Google Slides: Gemini's Help me create a presentation (paid plans)

### 14. The snackbar after a picture upload reads asset.add: product-shot

Kind: defect. Value 3, effort 1.

Today: After Upload from computer the snackbar at the bottom left read asset.add: product-shot (a1440-08-picture-landed.png), the action id and the asset id, from apps/studio/src/editor/controller.tsx 2577 (say(`${id}: ${ids.join(', ')}`)).

Proposal: No snackbar on success (the picture is on the sheet and selected), or the sentence Picture added; keep the id sentence for the agent transports' log. File: apps/studio/src/editor/controller.tsx 2577.

Evidence: a1440-08-picture-landed.png; tasks-b-1280x800.json (Product: snack)

Reference: Google Slides: no message after an image insert; research 07 rule 22 (no engineering noun in the default view)

### 15. A trashed deck stays in the Opened on this device row

Kind: defect. Value 3, effort 1.

Today: After File > Move to trash the page returned to /decks and the deck still stood under Opened on this device as GT pitch for Acme, Opened just now (a1440-36-after-trash.png, b1280-36-after-trash.png). The row's hidden set holds only decks trashed from the /decks page itself (apps/studio/src/routes/decks.index.tsx 457 to 458 and 775 to 777); -recent.ts says trashed decks never appear (line 56) but the editor's trash does not update the record.

Proposal: Have the editor's deck.trash write a trashed flag into this browser's Recent record and have RecentRow drop entries the store listing reports as trashed or absent. Files: apps/studio/src/routes/-recent.ts, apps/studio/src/routes/decks.index.tsx 775 to 777, packages/chrome/src/EditorShell.tsx 645 to 657.

Evidence: a1440-36-after-trash.png; b1280-36-after-trash.png

Reference: Google Slides home: a trashed file leaves Recent at once

### 16. Move to trash from the editor gives no confirmation and no Undo

Kind: friction. Value 3, effort 1.

Today: File > Move to trash left the editor and landed on /decks after 2.0 to 2.9 s with no snackbar (tasks JSON Delete: confirm false, snack null). The code calls say(Moved to trash, Undo) and then navigate('/decks') (packages/chrome/src/EditorShell.tsx 645 to 657), so the snackbar unmounts with the editor. The seller only learns the deck is in the trash by opening Trash.

Proposal: Show Moved to trash with Undo on the /decks page after the navigation (the decks page already shows that snackbar for its own card action, decks.index.tsx 565), or keep the editor open under a banner This presentation is in the trash with Restore and Delete forever. Files: packages/chrome/src/EditorShell.tsx 645 to 657, apps/studio/src/routes/decks.index.tsx 560 to 570.

Evidence: a1440-36-after-trash.png; tasks-a-1440x900.json (Delete: snack, ms)

Reference: Google Slides: File > Move to trash keeps the file open under a banner with Restore and Delete forever

### 17. Insert > Image opens a submenu with one row

Kind: friction. Value 3, effort 1.

Today: Insert > Image and the toolbar Image button open a submenu whose only visible row is Upload from computer (a1440-08 shows the result; imageRows in tasks JSON lists one row). The other rows are omitted or behind Advanced tools (packages/chrome/src/menus/model.ts 1285 to 1310). A seller makes an extra hover and click for every picture.

Proposal: When a submenu would show one row, render the parent as a direct row: Insert > Image… opens the file picker; the toolbar Image button opens the picker on click and keeps the submenu on its arrow. Files: packages/chrome/src/menus/model.ts 1285 to 1310, packages/chrome/src/Menu.tsx.

Evidence: tasks-a-1440x900.json (Product: imageRows); d-04-menu-insert.png

Reference: Google Slides: Insert > Image lists five sources; Pitch: Image opens the picker at once

### 18. Shift+Home selects to the start of the whole text, not the line

Kind: defect. Value 3, effort 2.

Today: With the caret at the end of the third line of the closing slide's paragraph, Shift+Home selected all three lines: Kevin Liu, founder, kevin@generaltranslation.com, generaltranslation.com (tasks-a and tasks-b, Closing.shiftHomeSelected). The seller who wanted the last line got the whole block.

Proposal: Let Shift+Home and Shift+End extend to the visual line's ends inside a run, as the browser does in a plain contenteditable; check the canonical rewrite of the editable that rebuilds the DOM as one span per paragraph (the para spans) does not fold the lines. File: packages/viewer/src/InlineText.tsx (the key handler and editableHtml).

Evidence: tasks-b-1280x800.json (Closing: shiftHomeSelected)

Reference: Google Slides and every text field: Shift+Home selects to the start of the current line

### 19. Cmd+K opens a bare https:// field with no label, no Apply, no Remove and no slide targets

Kind: friction. Value 3, effort 2.

Today: Cmd+K on selected text showed a small floating field above the text with the placeholder https:// and nothing else (a1440-16-link-dialog.png, b1280-16-link-dialog.png; packages/viewer/src/InlineText.tsx 1987 to 2002). Enter applied it. The Link dialog with Slides in this presentation (packages/chrome/src/dialogs/Link.tsx) is not what the seller reaches from Cmd+K or from the toolbar link button.

Proposal: One link popover for the text case with a Link label, the selected text shown, a Slides in this presentation select, Apply and Remove buttons and Enter to apply; a click on a linked word shows a chip with the address, Change and Remove. Files: packages/viewer/src/InlineText.tsx 1930 to 2002, packages/chrome/src/dialogs/Link.tsx.

Evidence: a1440-16-link-dialog.png; b1280-16-link-dialog.png; probe2.log (canvas-context-title)

Reference: Google Slides Insert > Link: Text, Link with search, Slides in this presentation, Apply; the link chip with Change and Remove

### 20. Every new deck starts dark

Kind: brand need. Value 3, effort 2.

Today: /new opens on the dark appearance (a1440-02-fresh-editor.png); the /decks strip offers Blank presentation and GT brand deck with no appearance choice; Light is two clicks away in the Theme panel and took 1.6 s to apply (probe2.log theme-panel). A seller who sends decks to customers on white slides has to switch every deck.

Proposal: The brand kit sets the default appearance; the New presentation strip shows Blank (light) and Blank (dark) tiles or remembers the last appearance per browser. Files: apps/studio/src/routes/new.tsx, apps/studio/src/routes/decks.index.tsx 676 to 700, packages/chrome/src/ThemesPanel.tsx.

Evidence: a1440-02-fresh-editor.png; p1440-07-theme-light.png

Reference: Google Slides: the default theme is light; Keynote asks for a theme when a deck is created

### 21. Format options for a picture shows text sections

Kind: polish. Value 3, effort 2.

Today: With the picture selected, Format > Format options opened a panel with Size & rotation and Position, then Text fitting (Do not autofit, Shrink text on overflow, Resize shape to fit text), Text (Level h1 h2 big title, Margin top, Margin bottom), Typography (Size, Weight, Align, Tracking, Line spacing), Columns and Indentation (a1440-09-picture-format-options.png; foText in tasks-a).

Proposal: Scope the panel's sections to the selected block kind: a picture shows Size & rotation, Position and Image options; text sections appear for text blocks only. File: packages/chrome/src/FormatOptions.tsx 560 to 640.

Evidence: a1440-09-picture-format-options.png

Reference: Google Slides Format options for an image: Size & rotation, Position, Recolor, Adjustments, Drop shadow, Reflection

### 22. A picture takes up to 3 s to appear after the file is chosen

Kind: friction. Value 3, effort 2.

Today: From the file chooser to the picture on the sheet: 1,427 ms at 1280 and 2,800 and 2,958 ms at 1440 (picMs in the tasks JSON). The sheet showed nothing during the wait; the title row read Saving….

Proposal: Draw the picture at once from a local object URL at its final box while asset.add runs, then swap the source when the twins land; a thin progress bar on the picture during the upload. Files: apps/studio/src/editor/EditorRoot.tsx 1193 to 1215, apps/studio/src/editor/controller.tsx 2493 to 2582.

Evidence: tasks-a-1440x900.json; tasks-b-1280x800.json (Product: picMs)

Reference: Google Slides: an uploaded image appears within about a second with a loading placeholder

### 23. The PowerPoint export takes 12 to 15 s and the PDF 4 to 8 s for six slides

Kind: friction. Value 3, effort 4.

Today: From the Download click to the file: PDF 4,101 ms (1280), 5,339 and 8,115 ms (1440); PowerPoint 12,556 ms (1280), 13,060 and 15,154 ms (1440) (tasks JSON, readyMs). The progress line read Preparing your PowerPoint file, about half a minute for 6 slides with no per slide progress. Every step over 2 s in the walk was an export or the presenter window.

Proposal: Warm the render worker when the Download submenu opens, render slides in parallel, reuse the thumbnails' renders for unchanged slides, and show per slide progress (Slide 3 of 6). Files: apps/studio/src/server/export-jobs.ts, apps/render-worker, packages/export/src/batch.

Evidence: tasks-a-1440x900.json; tasks-b-1280x800.json (Download: readyMs, progressWords)

Reference: Google Slides: a six slide PDF or PPTX download arrives in about 3 to 5 s

### 24. The /home page speaks to engineers

Kind: friction. Value 2, effort 1.

Today: The hero sentence reads A slides editor with Google Slides' menus, toolbar and shortcuts, a canvas on every slide, and a PowerPoint export that matches the screen pixel for pixel; the facts band reads 169 actions in one table behind the click, the command line and the API, 21 layouts, 32 steps in the acceptance chain, 0.003 % worst page mismatch, 17 shader materials, MIT (d-01-home.png); the nav has For agents and GitHub. Nothing on the page names a sales deck, a template or a team.

Proposal: Keep the page but lead with the seller: a sentence such as Build the pitch, present it and send the link, one product; the first band shows the Sales pitch template and Start from a template; move the facts band and For agents below the fold. Files: apps/studio/src/components/home/copy.ts 140 to 180, apps/studio/src/components/home/HomeHero.tsx, HomeFacts.tsx.

Evidence: d-01-home.png; discover.log (home hero)

Reference: Pitch and Gamma home pages: the first sentence names the deck a team makes, the first button starts from a template

### 25. A white block appears at the bottom left of the show when the bar is up

Kind: polish. Value 2, effort 1.

Today: In the slideshow, moving the pointer to the bottom left revealed the bar with the counter 5 of 6 and its buttons, and a white rectangle sat above the bar under the Slides tooltip (a1440-23-show-bar.png, b1280-23-show-bar.png).

Proposal: Find the element painted white in that corner (the live region or the digits plate of the show) and hide it visually while the bar shows. Files: apps/studio/src/components/Slideshow.tsx, Slideshow.css.

Evidence: a1440-23-show-bar.png; b1280-23-show-bar.png

Reference: Google Slides presenter bar: the bar alone at the bottom left

### 26. The layout tiles' tooltips describe geometry

Kind: polish. Value 2, effort 1.

Today: Hovering the Title slide tile in New slide with layout showed The mark at 132 by 84, the h1 and a muted lead, left and vertically centered. (p1440-05-layout-picker.png); the tile names are good (Title slide, Section header, Title and body, Title and two columns, Title only, One column text, Main point, Section title and description, Caption, Big number, Blank, then GT layouts).

Proposal: One seller sentence per layout: Title slide: your mark, a title and a subtitle. Keep the geometry in the doc field for agents. File: packages/schema/src/layouts.ts (doc per layout), packages/chrome/src/LayoutGrid.tsx tipProps.

Evidence: p1440-05-layout-picker.png

Reference: Google Slides: layout names alone; research 07 rule 22

### 27. The bottom bar is an empty 32 px strip with one chevron

Kind: polish. Value 2, effort 1.

Today: The editor's bottom bar holds one control, Show side panel, at the far right (a1440-02-fresh-editor.png; bottombar controls in discover.log); the rest of the strip is empty at both viewports.

Proposal: Put the Filmstrip and Grid view toggle and the zoom there, as Google keeps the view toggle at the bottom left, or remove the bar and give the stage the 32 px. File: packages/chrome/src/BottomBar.tsx.

Evidence: a1440-02-fresh-editor.png; discover.log (bottombar)

Reference: Google Slides: the filmstrip and grid view toggle at the bottom left; no other bar

### 28. New deck thumbnails stay blank in the Recent row

Kind: polish. Value 2, effort 2.

Today: One minute after a deck was created its Recent card showed an empty dark box with the title Probe deck and Opened 1 minute ago (p1440-12-template-gallery.png); other decks on the page also showed blank thumbnails.

Proposal: Render the thumbnail from the first slide's HTML on the client when the server render is not ready (the viewer already renders slides client side), and refresh it when the render lands. Files: apps/studio/src/routes/decks.index.tsx 880 to 910 (the thumb), apps/studio/src/server/thumbs.ts.

Evidence: p1440-12-template-gallery.png; a1440-34-decks-with-deck.png

Reference: Google Slides home: a thumbnail within seconds of the first edit

### 29. New slide takes about a second to show the new slide

Kind: friction. Value 2, effort 3.

Today: Toolbar New slide showed the new slide with its runs after 882 to 973 ms in every run (walk logs, time New slide). Under the 2 s bar, but felt as a pause before typing in a flow a seller repeats for every slide.

Proposal: Insert the slide optimistically in the filmstrip and the stage from the layout template before the write's acknowledgement, and reconcile on the answer. Files: apps/studio/src/editor/controller.tsx (slide.new), packages/chrome/src/Filmstrip.tsx.

Evidence: walk-a-1440x900.log; walk-b-1280x800.log (time New slide)

Reference: Google Slides: the new slide appears in about 200 ms

### 30. The Insert > Table tooltip covers the neighbouring rows

Kind: polish. Value 1, effort 1.

Today: Hovering Table in the Insert menu showed the tooltip Table, Point at the size you want, up to 20 columns by 20 rows. over the Chart, Diagram and Word art rows while the grid was open (b1280-11-table-grid.png, a1440-11-table-grid.png).

Proposal: Suppress a row's tooltip while its submenu or grid is open, or place it to the right of the grid. Files: packages/chrome/src/Menu.tsx, packages/chrome/src/Tooltip.tsx.

Evidence: b1280-11-table-grid.png; a1440-11-table-grid.png

Reference: Google Slides: no tooltip on a menu row with an open submenu

### 31. After Escape closes a menu the focus ring stays on the menubar button

Kind: polish. Value 1, effort 1.

Today: Closing the Help menu with Escape left a white outline on the Help button while the pointer was elsewhere (d-05-toolbar-tip.png).

Proposal: Return focus to the stage on Escape and paint the ring only for :focus-visible from the keyboard. File: packages/chrome/src/MenuBar.tsx 90 to 110.

Evidence: d-05-toolbar-tip.png

Reference: Google Slides: focus returns to the canvas when a menu closes

### 32. The presence icon has no tooltip and Not saved yet shows before anything is typed

Kind: polish. Value 1, effort 1.

Today: The collaborators icon at the right of the title row gave no tooltip on hover (probe2.log tooltips: title.presence null) while every other control did. A fresh /new reads Not saved yet beside a cloud icon before the seller types (a1440-02-fresh-editor.png).

Proposal: Tooltip Collaborators: who is in this presentation now on the presence slot; hide the save state until the first edit, or read Saves automatically as you type. Files: packages/chrome/src/TitleRow.tsx 236 to 260, packages/chrome/src/presence.

Evidence: a1440-02-fresh-editor.png; probe2.log (tooltips)

Reference: Google Slides: no save state until the first edit; every title row icon has a tooltip

### 33. The Keyboard shortcuts dialog lists Redo twice and opens on Last edit

Kind: polish. Value 1, effort 1.

Today: Cmd+/ opened Keyboard shortcuts with a search field; Common actions began with Last edit Cmd Option Shift H, then Slideshow, and listed Redo as Cmd Y Cmd Shift Z and again as Cmd Y further down (p1440-09-shortcuts.png; 141 key chips).

Proposal: Dedupe rows by action id and order Common actions as Google does (New slide, Undo, Redo, Copy, Paste, Slideshow, Search the menus). File: packages/chrome/src/ShortcutsDialog.tsx.

Evidence: p1440-09-shortcuts.png

Reference: Google Slides Keyboard shortcuts dialog: Common actions first, no duplicates


## 9. Evidence index

Screenshots are named <run>-<step>-<name>.png: d-* the discovery pass, a1440-* the 1440 by 900 walk, b1280-* the 1280 by 800 walk, p1440-* and p1280-* the probe pass. tasks-a-1440x900.json and tasks-b-1280x800.json hold every task's clicks, keys, drags, seconds and the facts read; walk-*.log, discover.log and probe2.log are the event logs with elapsed milliseconds; probe2.json holds the probe log rows.
