# Surfaces, stacking, corners and scrollbars: research for the design round

The surfaces researcher's note of the design round (key `surfaces`, port 4651), written on
2026-10-05 from 15:36 to 16:45 PDT in the worktree `/Users/kevinliu/repos/Turboslide-design` on
`design/round` at `0d75ab90`. It answers Kevin's item 1 ("fix the layering. check our ui surfaces
and make stuff like tooltips and those dropdowns and other boxes have our correct rounding") and
item 5 ("also make and use custom scrollbars") for every overlay and box surface of the product.

Nothing was committed. Files written: this note and 32 pictures under
`docs/gslides-parity/design-round/surfaces/`, each a JPEG or PNG under 200,000 B, each looked at
before it is cited. The probe scripts stayed in the session's scratchpad. On production the only
records written were five scratch decks of this note's own (`untitled-20261005-hofw`, `-hbke`,
`-e6pe`, `-7k6g`, `-d28h`), each removed by its id with `deck.trash` then `deck.remove`; every one
answered `deck.info` 404 afterwards (16:31 PDT). The local server ran on port 4651 with the round's
environment and was stopped at 16:32 PDT.

Loads: the machine's one minute load read 107 to 457 during the session (232 at the production
captures, 107 to 228 at the local ones). No timing in this note is a verdict; the editor ready
times the probes printed (1.6 s to 5.2 s) are recorded only beside their loads in the scratchpad.

## 1. Summary

1. Kevin's screenshot 1 reproduces on production and on the local server, in both appearances.
   The popover in it is the presence slot's tooltip ("Collaborators. Who is in this presentation
   now. Nobody else has it open", `packages/chrome/src/presence/PresenceSlot.tsx` 87). It is not
   painted under the name prompt bar: the two boxes do not overlap. The tooltip ends 2 px left of
   the bar and both start on the same line, y 44, so the tooltip reads as running under the bar.
   Moved over the bar, the tooltip paints on top (section 2).
2. The editor has two stacking contexts for floating surfaces. `.pt-viewer` is `position: fixed`
   (`packages/chrome/src/ViewerShell.css` 36 to 38), so every z-index inside it counts only inside
   it: the name plate (20), toasts (21), plate menus (30), dialogs (34, 40) and pickers (60).
   Menus, the tooltip and the hover preview are portalled to `document.body` and stack in the root
   context (30 plus level, 40, 120). Every portalled menu therefore paints above every dialog and
   picker, which the comment at `packages/chrome/src/Menu.tsx` 804 to 817 says it does not.
3. One real inversion found: the snackbar that Copy link raises inside the Share dialog is drawn
   under the dialog's scrim (`Snackbar.css` 10 z 21, `Dialog.css` 13 z 40, same context), measured
   on production and local in both appearances.
4. 107 z-index declarations in CSS plus two inline ones in `Menu.tsx`, 26 distinct values from -1
   to 120, with collisions at 20, 21, 30, 32 and 40.
5. Corners: 144 `border-radius` declarations, 110 of them 0. Every tooltip, menu, popover, picker,
   dialog, toast, select in a dialog and title row button except Slideshow is square; Slideshow is
   8 px; the key chip is 6 px in a tooltip, 4 px in the search pill and 0 in the palette and the
   shortcuts dialog; selects are 0 in dialogs and 6 px on `/decks` and the print page.
6. Floating surfaces use two border weights (`--pt-edge` and `--pt-hair`) and two drop shadows
   remain against the deck's "Shadows are not used" (`Dialog.css` 33, `inspector/chart.css` 238).
7. "Our correct rounding" read from the sources: General Translation's ladder, 8, 6 and 4 px
   (gt-cloud `packages/ui/src/css/shared.css` 85 to 87 and 235), which is also the only three
   corners Prototemplate's chrome allows (Prototemplate `DESIGN.md` 430 to 432). Proposed per
   class: 0 for structure and slides, 4 for chips, 6 for controls and small floating plates, 8 for
   dialogs and windows (section 5).
8. Scrollbars: the shared custom scrollbar exists (`.pt-scroll`, `packages/chrome/src/tokens.css`
   199 to 288) and reaches 18 components. Menus, the font list, the layout plate, dialog bodies,
   textareas and the `/home` and `/decks` documents draw the platform's 15 px bar (measured with
   scrollbars shown). Proposal: one default rule for every scroller (section 7).

## 2. Kevin's screenshot 1, reproduced

### 2.1 Procedure

A fresh Chromium context at 1440 by 900, `colorScheme: 'dark'` and `gt-theme=dark`, opened
`https://www.turboslide.com/new`, typed into the title twice (the plate opens on an edit by a
principal whose name is still the generated label, `apps/studio/src/editor/controller.tsx` 2508
to 2521; the first write creates the deck, the second has the identity), then rested the pointer
on the presence slot's left end for 1.4 s. The same script ran against `http://localhost:4651`.

Pictures: `surfaces/repro-prod-dark-tip.png` (the state of Kevin's screenshot),
`surfaces/repro-prod-overlap-natural.jpg` and `surfaces/repro-local-overlap-natural.jpg` (the
same, cropped at the title row), `surfaces/repro-prod-overlap-forced.jpg` and
`surfaces/repro-local-overlap-forced.jpg` (the tooltip moved 120 px right, over the bar),
`surfaces/repro-prod-dark-account.png` (the own chip's account menu open over the bar).

### 2.2 Readings (production 16:04 PDT, local 16:02 PDT, identical)

| Box | Element | Rect (left, top, right, bottom) | z-index | Context it counts in |
| --- | --- | --- | --- | --- |
| Presence slot | `div.ts-presence` | 799, 6, 983, 38 | auto | |
| Tooltip | `div#pt-tip.pt-tip`, a child of `body` | 751, 44, 1031, 114.5 | 40 (`Tooltip.css` 12) | root |
| Name prompt bar | `form.ts-title-name-plate` inside `div.pt-viewer.is-editor` | 1033, 44, 1428, 72 | 20 (`TitleRow.css` 501) | `.pt-viewer` (fixed, z auto) |
| Account menu | `div#ts-menu-account.ts-plate-menu` inside `div.pt-viewer.is-editor` | 959, 36, 1199, 220 | 30 (`presence.css` 239) | `.pt-viewer` |

- The gap between the tooltip and the bar is 2.03 px; both tops are 44 (`sameTop: true`).
- Forced overlap, the tooltip's pointer events turned on for the hit test: `elementsFromPoint`
  at the bar's left end returns `span.pt-tip-head`, `div#pt-tip.pt-tip`,
  `input.ts-title-name-plate-field`, `form.ts-title-name-plate`, `nav.ts-menubar`. The tooltip is
  on top, on production and local.
- Account menu over the bar: `elementsFromPoint(1116, 58)` returns `span.ts-account-name` first
  and `form.ts-title-name-plate` fifth. The menu is on top.

### 2.3 Why it reads as "under"

1. Same top line. The tooltip's top is the slot's bottom (38) plus `TIP_OFFSET_PX` 6
   (`Tooltip.tsx` 58, placement at 314 to 337) = 44. The bar is fixed at
   `top: var(--pt-title-h, 44px)` (`TitleRow.css` 499). Both boxes start on the title row's bottom
   rule.
2. Abutting edges. The tooltip is centred under the 184 px slot: 891 + 140 = 1031. The bar is
   `right: 12px` and 395 px wide: 1440 - 12 - 395 = 1033. Both are measured from the window's right
   edge, so the 2 px gap holds at every width above 1180 px (below it the field narrows to 150 px,
   `TitleRow.css` 575 to 579).
3. No separation between plates. Both are paper with radius 0 and no ring. The tooltip draws
   `--pt-edge` (0.55 alpha in dark) and the bar draws `--pt-hair` (0.22 alpha), so the bar's faint
   left line reads as a seam lying over the tooltip.
4. Both plates cover the menu bar's 28 px band (44 to 72), so the band's content disappears at
   the junction and nothing marks which plate is in front.

The account menu crossing the bar (picture `repro-prod-dark-account.png`) shows the same: the menu
is on top, but its `--pt-hair` frame is nearly invisible over the bar in dark, so the two plates
merge.

### 2.4 The stacking contexts, as built

| Context | Created by | Members and their z-index |
| --- | --- | --- |
| root (`html`) | the document | `div.ts-editor` (holds `.pt-viewer`, z auto), `.ts-menu-root` children (30 + level, inline at `Menu.tsx` 579 and 891, portal at 843), `#pt-tip` (40, appended at `Tooltip.tsx` 269), `.pt-preview` (120, portal at `PreviewLayer.tsx` 310) |
| `.pt-viewer` | `position: fixed` (`ViewerShell.css` 36 to 38); a fixed box always forms a context | sidebar overlay 10 and scrim 9, palette 16, banner 19, name plate 20, conflict banner 20, help card 20, export report 20, toast and snackbar 21, plate menus 30, insert and export menus 30, sidebar row menu 30, layout plate 32, swatches 32, float dialog 34, dialog scrim 40, chart grid menu 40, pickers 60 |
| `.pt-stagewrap` | `view-transition-name` (named in `Menu.tsx` 804 to 806) | the overlay, chips, guides, remote cursors, comment markers and cards, the Following and queue plates |
| `.pt-slide` | `stage.css` 65 | slide objects |

Consequences:

- Every portalled menu (z 30 in root) paints above every dialog (40 in `.pt-viewer`) and every
  picker (60 in `.pt-viewer`). This is correct for a menu opened from a dialog and contradicts the
  stated intent at `Menu.tsx` 812 to 813 ("under the dialogs (34, 40), the tooltip (40) and the
  pickers (60)").
- Inside `.pt-viewer`, the toast and snackbar (21) sit under the dialog scrim (40). Measured: Share
  dialog, Copy link, `elementsFromPoint` at the snackbar's centre returns `div.ts-dialog-scrim`
  first, then `span.ts-snackbar-text`, on production and local in both appearances (pictures:
  the tile "toast-over-dialog" in `surfaces/prod-dark-c-dialogs.jpg`,
  `surfaces/prod-light-c-dialogs.jpg`, `surfaces/local-dark-c-dialogs.jpg`,
  `surfaces/local-light-c-dialogs.jpg`; in dark the snackbar reads grey through the scrim).
- `--pt-scrim` is `rgba(7, 7, 7, 0.28)` in both appearances (`tokens.css` 62, not remapped in the
  dark block that starts at 168), so over dark chrome the scrim changes almost nothing and over a white slide it reads
  as a grey sheet (the dark dialog tiles).

## 3. Every surface, measured

Computed values at 1440 by 900 on the local server (16:16 to 16:19 PDT) and production (16:20 to
16:23 PDT); production and local agree on every row. Border colours are the token names the
computed values resolve to. "Portalled" means rendered into `document.body`.

Pictures of every row, light and dark, production and local:

| Sheet | Production light | Production dark | Local light | Local dark |
| --- | --- | --- | --- | --- |
| Plates: title row, name plate and tooltip, tooltip, File menu, Insert submenu, canvas context menu, selection chip, filmstrip context menu, snackbar, account, roster | `prod-light-a-plates.jpg` (no name plate: it did not open in that run) | `prod-dark-a-plates.jpg` | `local-light-a-plates.jpg` | `local-dark-a-plates.jpg` |
| Pickers and panels: font picker, colour picker, layout plate, search the menus, Format options, Theme, Assist, Version history, speaker notes | `prod-light-b-pickers-panels.jpg` | `prod-dark-b-pickers-panels.jpg` | `local-light-b-pickers-panels.jpg` | `local-dark-b-pickers-panels.jpg` |
| Dialogs: Share, snackbar over Share, Sign in, Import slides, Find and replace, Image by URL, Background, Keyboard shortcuts | `prod-light-c-dialogs.jpg` | `prod-dark-c-dialogs.jpg` | `local-light-c-dialogs.jpg` | `local-dark-c-dialogs.jpg` |
| `/decks` | `prod-light-page-decks.jpg` | `prod-dark-page-decks.jpg` | `local-light-page-decks.jpg` | `local-dark-page-decks.jpg` |
| You need access (an unknown deck id) | `prod-light-page-not-found.jpg` | `prod-dark-page-not-found.jpg` | `local-light-page-not-found.jpg` | `local-dark-page-not-found.jpg` |
| `/home` first screen | `prod-light-page-home.jpg` | `prod-dark-page-home.jpg` | `local-light-page-home.jpg` | `local-dark-page-home.jpg` |

All files are under `docs/gslides-parity/design-round/surfaces/`.

### 3.1 Floating surfaces

| Surface | Source | z-index and context | Portalled | Radius | Border | Shadow | Ground |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tooltip | `Tooltip.css` 10 to 25; `Tooltip.tsx` 262 to 272 | 40, root | yes | 0; key chip 6 (`Tooltip.css` 60) | 1 px `--pt-edge` | none | `--pt-paper` |
| The nine menus and their submenus | `Menu.css` 17 to 33; `Menu.tsx` 579, 843, 891 | 30 + level inline, root | yes | 0 | 1 px `--pt-edge` | none | paper |
| Context menus (canvas object, filmstrip card, table head) | `ContextMenu.tsx` 254 through `Menu` | 30, root | yes | 0 | `--pt-edge` | none | paper |
| Account popover (identity) and roster | `presence/presence.css` 237 to 251; `PlateMenu.tsx` | 30, `.pt-viewer` | no | 0 | `--pt-hair` | none | paper |
| Comment card menus | `comments/CommentCard.tsx` 267, 294 through `PlateMenu` | 30, `.pt-viewer` | no | 0 | `--pt-hair` | none | paper |
| Name prompt bar | `TitleRow.css` 497 to 514; `TitleRow.tsx` 746 | 20, `.pt-viewer` | no | 0; Continue 0 | `--pt-hair` | none | paper |
| Font picker | `FontPicker.css` 34; `pickers/Pickers.css` 142 to 150 | 60, `.pt-viewer` | no | 0; search field 0 | `--pt-hair` | none | paper |
| Colour picker (text colour, highlight) | `pickers/Pickers.css` 142 to 150; `pickers/ColorPlate.tsx` 60 to 72 | 60, `.pt-viewer` | no | 0 | `--pt-hair` | none | paper |
| Toolbar swatch plate | `EditorToolbar.css` 202 to 214 | 32, `.pt-viewer` | no | 0 | `--pt-edge` | none | paper |
| Layout plate | `EditorShell.css` 153 to 165 | 32, `.pt-viewer` | no | 0 | `--pt-edge` | none | paper |
| Insert and export menus | `InsertMenu.css` 13 to 15; `ExportMenu.css` 15 to 17 | 30, `.pt-viewer` | no | 0 | `--pt-hair` | none | paper |
| Chart grid menu | `inspector/chart.css` 231 to 238 | 40, `.pt-viewer` | no | 0 | `--pt-hair` | `0 8px 24px rgb(0 0 0 / 0.12)` | paper |
| Sidebar row menu | `Sidebar.css` 630 to 632 | 30, `.pt-viewer` | no | 0 | `--pt-hair` | none | paper |
| Search the menus | `Palette.css` 18 to 38; field 66 to 77 | 16, `.pt-viewer` | no | card 0; field 6 | card `--pt-hair` | none | paper over `--pt-scrim` |
| Dialogs: Share, Sign in, Import slides, Find and replace, Image by URL, Background, Keyboard shortcuts | `Dialog.css` 10 to 47; `Dialog.tsx` 313 | scrim 40, `.pt-viewer` | no | 0 | `--pt-edge` | none | paper over `--pt-scrim` |
| Float dialog (the name prompt opened by Share) | `Dialog.css` 22 to 34 | 34, `.pt-viewer` | no | 0 | `--pt-edge` | `0 8px 24px rgba(0, 0, 0, 0.18)` | paper |
| Toast and snackbar | `Toast.css` 8 to 28; `Snackbar.css` 6 to 20 | 21, `.pt-viewer` | no | 0 | none | none | `--pt-ink` (inverse) |
| Hover preview | `PreviewLayer.css` 17 to 30, 63 | 120, root | yes | 6 (inner 5) | frame | none | paper |
| Help card | `HelpCard.css` 10 to 16 | 20, `.pt-viewer` | no | 0 | `--pt-edge` | none | paper over scrim |
| Export report card | `ExportReportCard.css` 7 to 19 | 20, `.pt-viewer` | no | 0 | 1 px `--pt-ink` | none | paper |
| Conflict banner, edit banner | `routes/edit.$deckId.css` 26, 109 | 20 and 19, `.pt-viewer` | no | 0 | ink, hair | none | paper |
| Comment card | `comments/comments.css` 28 to 30 | 6, stage | no | 0 | `--pt-edge` | none | paper |
| Following plate, queue plate | `presence.css` 374 to 390; `EditorShell.css` 225 to 240 | 5, stage | no | 0 | paper, ink | none | ink, paper |
| Selection chip | `Overlay.css` 34 | 1, stage | no | 0 | none | none | `--pt-select` |

### 3.2 Docked surfaces and controls

| Surface | Source | Radius | Border | Notes |
| --- | --- | --- | --- | --- |
| Panels: Format options, Theme, Assist, Version history | `EditorShell.css` 122 to 143; `Panel.css` 6 | 0 | left rule `--pt-hair` | a column of the grid; z 6 only at 900 px and under (`EditorShell.css` 201 to 209) |
| Speaker notes | `NotesPane.css` 5 | 0 | top rule `--pt-hair` | `position: relative` |
| Slideshow split button | `TitleRow.css` 211 to 221 | 8 | 1 px `--pt-ink` | ink ground; the halves 0 (`TitleRow.css` 224 to 229) |
| Share | `TitleRow.css` 273 to 279 | 0 | `--pt-hair` | 32 px, beside the 8 px Slideshow |
| Sign In, Assist, deck name | `.pt-ib.is-text`, `tokens.css` 288 to 312 | 0 | transparent | |
| Every shell button `.pt-ib` and the solid one | `tokens.css` 305; `ToolButton.css` 34 to 38 | 0 | transparent; solid ink | |
| Select in dialogs and `.pt-select` | `tokens.css` 374 to 381 | 0 | `--pt-field` | 32 px |
| Select in the inspector `.ts-ctl-select` | `inspector/select.css` 5 to 12 | 6 | `--pt-hair` | 22 px |
| Plain `select` in the Theme panel (logo placement) | measured | 0 | `--pt-hair` | a third select |
| Select on `/decks` and the print page | `routes/decks.css` 407 to 408; `routes/print.css` 72 to 76 | 6 | | |
| Segmented control | `tokens.css` 447 to 483 | 6 | `--pt-hair` | the inspector's Position pair draws two boxes (`inspector/seg.css` 5 to 20) |
| Fields in dialogs | `Dialog.css` 166 to 173 | 0 | `--pt-field` | |
| Key chips | `Tooltip.css` 60; `Toolbar.css` 152; `Palette.css` 187; the shortcuts dialog | 6; 4; 0; 0 | none; none; none; 1 px | four drawings of one thing |
| Presence chips | `presence/presence.css` | 0 | | 24 px squares |
| `/decks` search, view switch | `routes/decks.css` 125 to 126, 231 to 236 | 6 | `--pt-field` | |
| `/decks` Trash, card frames | `routes/decks.css` | 0 | | |
| You need access buttons | `routes/-access-page.css` 32 to 33 | 0 | ink solid; `--pt-edge` | |
| Landing nav (Documentation, Light, Dark, Pause Motion, Sign In, New Presentation) | `routes/home.css` 304 to 330 | 0 | Light or Dark pressed: 1 px ink; Pause Motion: `--pt-edge`; others transparent; New Presentation solid | heights 36, 32, 32, 32, 32, 36 |
| Landing CTAs (New Presentation, Open the Example Deck) | `routes/home.css` 152 (`.ts-buttons`) | 0 | solid ink; `--pt-edge` | 40 px |

### 3.3 Border weight and shadows on floating surfaces

- `--pt-edge` (0.62 light, 0.55 dark): tooltip, menus, context menus, dialogs, layout plate,
  swatch plate, help card, comment card.
- `--pt-hair` (0.18 light, 0.22 dark): name plate, account and roster plates, comment card menus,
  font and colour pickers, insert and export menus, sidebar row menu, chart grid menu, search card.
- Drop shadows: `Dialog.css` 33 and `inspector/chart.css` 238. The brand deck: "Depth comes from
  lines and texture. Shadows are not used." (Prototemplate `deck/slides/26-color.html` 5).

## 4. Scrollbars, measured

Headless Chromium hides scrollbars by default (`--hide-scrollbars`), so one run dropped that
switch. Pictures: `surfaces/local-light-scrollbars.jpg`, `surfaces/local-dark-scrollbars.jpg`.

| Scroll region | Source | Class | Bar, measured |
| --- | --- | --- | --- |
| Font list | `FontPicker.css` 61 | none | 15 px platform bar |
| Insert menu at 360 px tall (every menu) | `Menu.css` 24 to 25 | none | 15 px platform bar |
| `/home` document | root | none | 15 px platform bar |
| `/decks` document | root | none | platform bar |
| Format options body | `Panel.tsx` | `.pt-scroll` | 4 px gutter |
| Search the menus list, Share list, shortcuts list, plate menu rows, filmstrip | | `.pt-scroll` | 4 px gutter |

Inside the opened surfaces, 8 kinds of scroller lack the class (every menu and context menu,
`.ts-font-list`, `.ts-layout-plate`, `.ts-dialog-body`, `.ts-dialog-tiles`, the Format options
textarea, `.ts-brand-textarea`, `.ts-notes-field`) and 5 carry it. Across the tree, 43 CSS
declarations scroll (`overflow: auto` or `scroll`) and `.pt-scroll` appears in 18 components.
Local copies of a scrollbar rule: `inspector/chart.css` 81 to 95 (its own webkit rule),
`components/home/editing.css` 110 (`scrollbar-width: thin`), `routes/home.css` 2100 to 2105 and
`MenuBar.css` 58 to 61 (scrollbar hidden). The thumb's colour and width are the type researcher's
(`research-type.md` item 6: `--pt-thumb` reads 2.17:1 on light paper, under 3:1).

## 5. The brand's rule for corners, and what "our correct rounding" is

| Source | Line | Says |
| --- | --- | --- |
| Prototemplate `deck/DECK-GRAMMAR.md` | 40 | "No cards with shadows, no rounded corners, no gradients" (slides) |
| Prototemplate `deck/slides/13-inspirations.html` | 12 | "rectangular forms with no rounded corners" |
| Prototemplate `deck/slides/35-iso.html` | 6 | "The whole family uses square corners" (illustrations) |
| Prototemplate `DESIGN.md` | 171 to 174 | a corner can never disagree with the seam that meets it |
| Prototemplate `DESIGN.md` | 421, 437 | the shell's chrome is radius 0; every other toolbar button is square |
| Prototemplate `DESIGN.md` | 430 to 432 | the exceptions: search pill 6 px, key chip 4 px, Present 8 px |
| Prototemplate `src/components/viewer/tokens.css` | 54 | `--pt-radius: 6px` |
| gt-cloud `packages/ui/src/css/shared.css` | 85 to 87, 235 | `--radius: 0.5rem`, `--radius-md: calc(var(--radius) - 2px)`, `--radius-sm: calc(var(--radius) - 4px)`: 8, 6, 4 |
| Turboslide `docs/NEXT.md` | 187, 214, 987 | question 9's default: square, `--pt-radius` on the named controls, 8 px on Slideshow |
| Turboslide `packages/chrome/src/tokens.css` | 122 to 130 | "The one corner in chrome" (6 px) |

Reading. The deck's square rule is about slides and illustrations. The chrome rule in Prototemplate
is square with exactly three exceptions, and those three numbers are General Translation's own UI
ladder (8, 6, 4). Kevin's words list tooltips and dropdowns as the boxes that need "our correct
rounding"; both are square today, so the rounding he asks for is the ladder applied to them. The
landing researcher reads it the same way (`research-landing.md` F15 and question 2).

"Our correct rounding" as a number per surface class:

| Class | Radius | Members | Source line |
| --- | --- | --- | --- |
| Structure and content | 0 | the title row, menu bar, toolbar, filmstrip column, docked panels, notes pane, rows and rails, the slide sheet, thumbnails and picture frames, everything on a slide, the selection ring and its chip | `DECK-GRAMMAR.md` 40; `DESIGN.md` 171 to 174 |
| Chips | 4 | key chips, count chips, the checkbox | `DESIGN.md` 431; `shared.css` 87 |
| Controls and small floating plates | 6 | every button (Slideshow, Share, Sign In when boxed, toolbar hover and pressed grounds, the landing's nav and calls to action), fields, selects, segmented controls, tooltips, menus, context menus, popovers (identity, roster, comment), pickers, the name prompt bar, toasts and snackbars | `DESIGN.md` 430; `tokens.css` 130; `shared.css` 86 |
| Windows | 8 | dialogs, the search card, the help card, the export report, the hover preview | `DESIGN.md` 432; `shared.css` 85, 235 |
| Round marks | 50% | the laser pointer, the free rotation handle | `SlideshowLayer.css` 28; `Overlay.css` 295 |

A box inside a rounded box takes the outer radius less the inset (the segmented control already
does this, `tokens.css` 476 to 483). Menu rows stay square: the 4 px padding above and below keeps
them clear of the plate's corners.

## 6. Proposals

### P1. One stacking scale, in `packages/theme`

Named layers, one number each, as data in a new `packages/theme/src/layers.ts` (`LAYERS`) and as
`--ts-layer-<name>` custom properties in one CSS block that a parity test pins to the data (the
pattern of `tokens.ts` and `tokens.test.ts`, and of `brand.ts` and `brand.test.ts`).

| Layer | z-index | Members today |
| --- | --- | --- |
| `stage` | 0 | the stage and everything in its own context (overlay, chips, guides, cursors, comment markers and cards, Following and queue plates); their local order stays inside the stage |
| `docked` | 10 | the notes slot, the narrow right panel and drawer, the sidebar overlay and its scrim, the WordArt bar, the shell banners |
| `bar` | 20 | the name prompt bar, the conflict and edit banners |
| `dialog` | 30 | the scrim and its card (the card is the scrim's child, `Dialog.tsx` 313), the float dialog, the search card and its scrim, the help card, the export report |
| `popover` | 40 | menus, submenus, context menus, plate menus, pickers, the layout plate, the swatch plate, insert and export menus, the chart grid menu, the sidebar row menu |
| `toast` | 50 | toasts and snackbars |
| `tooltip` | 60 | the tooltip |
| `preview` | 70 | the hover preview |
| `present` | 80 | the slideshow window and its own controls (local order inside it) |
| `skip` | 90 | the keyboard skip link on `/home` |

Every floating surface renders through one shared `Layer` component in `packages/chrome/src`
(a portal into `document.body` with `data-layer` and the scale's z-index), so the numbers are
compared in one context: Menu, PlateMenu, the pickers, the layout and swatch plates, Dialog, Toast,
Snackbar, the name prompt bar, the help card, the export report and the hover preview. Submenus are
appended after their parent list, so they need no `+ level`.

What it changes: popovers opened from a dialog sit above it (as today, now by design); the
snackbar of Copy link sits above the Share dialog (finding 3); the tooltip sits above every plate.
A lint in report mode, then enforce: a `z-index` literal at 5 or above outside the layers block
fails. Matrix rows: `chrome.layers.toast-over-dialog` (the snackbar's centre hits the snackbar
with the Share dialog open) and `chrome.layers.tooltip-over-bar` (the forced overlap of section 2).

Cost: about 25 files and 250 to 350 changed lines; 0 B on `/home`'s live core (the tooltip and
menus there change only a number); about 0.5 KB gzip in the editor chunk for `Layer`. Risk: CSS
that reaches a dialog or plate through a `.pt-viewer` ancestor selector stops matching once the
surface is portalled; a search for `.pt-viewer` selectors over each moved surface is part of the
lane.

Relation to the type researcher's recommendation (`research-type.md` 4.3: the browser's top layer
through `popover` and `<dialog>.showModal()`): the top layer orders by opening, newest on top, so a
toast raised during a dialog still needs a hide and show to come forward, and `showModal()` makes
every node outside the dialog inert, which includes popovers and toasts portalled to `body`. A menu
or select list opened inside a modal dialog would then have to render inside the dialog element.
The scale above works with or without the top layer; if the round adopts the top layer, the
`dialog`, `popover`, `toast` and `tooltip` numbers become the order in which surfaces are re-shown.

### P2. One radius scale

`--pt-radius-sm: 4px`, `--pt-radius: 6px` (kept), `--pt-radius-lg: 8px` in `tokens.css` beside
`--pt-radius`, mirrored as data in `packages/theme` and pinned by the parity test; the classes of
section 5. Changes, by file: `Tooltip.css` 22 (0 to 6) and 60 (6 to 4); `Menu.css` 29 (0 to 6);
`presence.css` 247; `pickers/Pickers.css` 142 to 150 and the font search field; `EditorShell.css`
153 to 165; `EditorToolbar.css` 202 to 214; `InsertMenu.css`, `ExportMenu.css`, `Sidebar.css` 630
to 632, `inspector/chart.css` 231 to 238; `Dialog.css` 36 to 47 (0 to 8), 81 (the X), 166 to 173
(fields 0 to 6); `tokens.css` 305 (`.pt-ib` 0 to 6), 374 to 381 (selects 0 to 6); `ToolButton.css`
38; `Toast.css`, `Snackbar.css`; `TitleRow.css` 221 (Slideshow 8 to 6, question Q2), 277 (Share 0 to
6), 497 to 514 (the bar 0 to 6, Continue 0 to 4); `Palette.css` 38 (the card 0 to 8) and 187 (kbd 0
to 4); the shortcuts dialog's kbd (0 to 4); `routes/-access-page.css` 33; the landing's `.pt-ib`
nav and `.ts-buttons` through `.pt-ib`. The matrix row `chrome.buttons.one-rule` (`docs/NEXT.md`
268) and the brand lint's radius check (`docs/NEXT.md` 234) read the new classes.

Cost: about 25 CSS files, about 60 lines; 0 B of script; under 200 B gzip of CSS.

### P3. Separation without shadows

Every floating plate draws the frame weight (`--pt-edge`) and the sheet mat's ring: a 1 px paper
gap and a 1 px `--pt-hair-soft` outline, `box-shadow: 0 0 0 1px var(--pt-paper), 0 0 0 2px
var(--pt-hair-soft)`, the deck's own sheet rule (Prototemplate `deck/parts/head.html` 262;
`DESIGN.md` 85 to 89). The ring follows the radius and has no blur or offset. The two drop shadows
go (`Dialog.css` 33, `inspector/chart.css` 238). The `--pt-hair` plates of section 3.3 move to
`--pt-edge`. With the ring, two plates that touch (the tooltip and the bar) read as two plates, and
the one in front is the one whose ring is unbroken.

Cost: one shared declaration (a `--pt-float-ring` token used by the plates), about 12 files.

### P4. The name prompt bar

The bar takes the `bar` layer, the 6 px radius, the frame weight and the ring, and sits 4 px under
the title row (`top: calc(var(--pt-title-h) + 4px)`), so it never shares the row's bottom line with
a tooltip, which starts on that line. Tooltips from the title row then paint over it with their
ring. Cost: `TitleRow.css` 497 to 514, about 8 lines.

### P5. Toasts over dialogs

Falls out of P1 (`toast` 50 above `dialog` 30). Until P1 lands, a one line stopgap is
`Snackbar.css` 10 and `Toast.css` 28 at 41 inside `.pt-viewer`. Cost: 2 lines.

### P6. Custom scrollbars by default

The values stay in one place (`tokens.css` 199 to 288) and become the default for every scroller:
the webkit pseudo-elements under `:where(*)` in place of `.pt-scroll`, and the Firefox block
(`scrollbar-width: thin` with the thumb colour) on `:root` under `@supports not
selector(::-webkit-scrollbar)` only, because Chromium ignores the webkit rules on any box where
`scrollbar-width` or `scrollbar-color` is not `auto` (`tokens.css` 210 to 213). `.pt-scroll` and
`.pt-scroll-x` keep `scrollbar-gutter: stable` for regions whose width must not change. The local
copies go (`inspector/chart.css` 81 to 95, `editing.css` 110); the two hidden bars
(`home.css` 2100 to 2105, `MenuBar.css` 58 to 61) take `.pt-scroll-x`. The thumb's width and
colour are the type researcher's proposal (`research-type.md` item 6). A lint: a declaration of
`scrollbar-width`, `scrollbar-color` or `::-webkit-scrollbar` outside `tokens.css` fails.

Cost: about 30 lines of CSS in one file, 4 files cleaned; 0 B of script; the document and every
menu, picker, dialog body and textarea change from a 15 px bar to the brand's gutter.

## 7. Findings outside this note's surfaces

- A dark-system visitor on `/new` gets light chrome: the editor stores `gt-theme=light` about 3.5 s
  after load (read on the local server and production) because the default appearance "match"
  follows the deck's light appearance (`packages/chrome/src/EditorShell.tsx` 513 to 523), and the
  stored key then sets `/home` and `/decks` light on the next visit (question Q6).
- On production at load 232, Delete slide from the filmstrip's context menu on a slide added 1.5 s
  earlier raised the snackbar `No slide "split-1-1253"` (the dark run, `prod-dark-a-plates.jpg`,
  tile "snackbar"); the light run read "Slide deleted / Undo". One reading; not reproduced.

## 8. Questions only Kevin can answer

| # | Question | Default |
| --- | --- | --- |
| Q1 | The chrome takes General Translation's ladder: 0 for structure and slides, 4 px chips, 6 px controls, menus, tooltips, popovers and toasts, 8 px dialogs and windows. The deck's square rule stays on slides, thumbnails and rails. | Yes |
| Q2 | Slideshow at 6 px like Share (the pair in screenshot 1), or 8 px as the one primary action (`DESIGN.md` 432)? | 6 px |
| Q3 | Floating plates separate by the frame line and the sheet mat's ring, with no drop shadow anywhere (`26-color.html` 5). | Yes; the two drop shadows go |
| Q4 | The name prompt bar stays at the right end of the menu bar's band, 4 px under the title row, or anchors under the own chip as its popover? | Stays, 4 px under the row |
| Q5 | Toasts and snackbars show above an open dialog, so Copy link's confirmation reads over Share. | Yes |
| Q6 | The editor's chrome follows the system appearance until the person picks one, and nothing is stored before that pick. | Yes |
| Q7 | Toolbar icon buttons' hover and pressed grounds take 6 px, where Prototemplate keeps them square (`DESIGN.md` 437). | 6 px |
