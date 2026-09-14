# Later and Omit rows, Edit theme and the equation editor

Report 03 of the Turboslide round five research set, reader later. Written 2026-09-14 against `main` at d5d7f07. Every repository fact below was read from that commit with `git show` and names its file, because the working tree carries round four's uncommitted edits. Every external fact carries a source key that resolves to a URL and the date read in section 9. Web search was unavailable for this report after the session's search budget ran out, so external facts come from pages fetched by URL and from the round one research set (`research/01-menu-bar.md`, `research/03-home-themes-layouts-io.md`), whose source keys are repeated where used.

Kevin's directives, verbatim: "...it has all the features and exact behaviors of google slides...literally search up and research everything google slides offers...mimic it perfectly"; "keep going on all of these and dont stop until literally all google slides features are supported with full agent queryability and editability esp on locals"; "have shaders and all the fun effects we can make". Round five is the last parity round: everything Google Slides offers that a standalone product can offer and that earlier rounds deferred, plus the deferred items of SPEC-2 12, SPEC-3 17 and SPEC-4 7 that do not need Kevin's infrastructure decisions.

Rules followed: plain technical English, sentence case, no em dashes, no metaphors, headings without trailing periods, complete sentences. No Google icon or artwork is reproduced or proposed. No account was signed in to; every Google fact is from public documentation.

## How to read this report

- "Verified" means Google's own page states it. "Third party" means a page Google does not own. "Repository" means a file at d5d7f07, named by path. "Unverified" means expected from product knowledge and confirmed by no page read; every unverified claim is repeated in section 10.
- The classes of section 1: class 1 stays omitted (a Google service, a Workspace only feature, a row Google has retired, or a toggle with no behaviour to add in a DOM editor; the reason column says which). Class 2 is offerable by a standalone editor and belongs to round five; the scope letter names the part of the brief (A motion, B media, C templates, D import, E page and the remaining Later rows, F deferred engineering), and "proposed" marks a row the brief does not name that this report recommends adding because it needs no decision from Kevin. Class 3 is offerable but needs Kevin's infrastructure or a decision only he can make; those rows are listed for him in section 8, not designed away.
- The clause column quotes the model's `stubReason` (a Later row) or `omitReason` (an Omit row) exactly. A Later row's tooltip is "Not available in Turboslide yet" followed by the clause (`packages/chrome/src/menus/strings.ts` `stubClause`).
- Google's label is the model's `label`; where the model records Google's own spelling in `google`, it follows in brackets.

## 0. Decisions in one page

1. The model at d5d7f07 holds 61 rows that are not Now: 22 Later and 39 Omit, plus the toolbar's Transition stub (`toolbar.transition`, the same clause as `slide.transition`) and one omitted menu (Accessibility). Of the 61 rows, 19 are class 1 and stay omitted, 35 are class 2 for round five (31 inside the brief's letters A to F, 4 proposed additions), and 7 are class 3 for Kevin.
2. Every Later row but three is class 2. The three that are not (Email collaborators and its container, and the Viewers tab) wait on a mail sender and on a decision to record views.
3. Four Omit rows carry a reason that no longer holds and should flip to class 2: Camera (the browser's camera, not a Google service), Theme builder and Placeholder (Edit theme is in scope), Motion and Animation (motion is in scope), and Language (with Spelling and Preferences in scope, a document language has a meaning again). Three Omit rows keep their status for a reason other than a Google service: Explore (retired by Google in 2024), Turn on braille support (nothing to add in a DOM editor) and Approvals (Workspace only).
4. Google's theme builder is a mode of the same editor: one theme slide over the layouts list, Rename, Colors with twelve slots under the names Text and background 1 to 4, Accent 1 to 6 and Link, placeholders inserted from the Insert menu, right-click New, Duplicate, Rename and Delete on a layout, automatic save, changes to the theme slide reaching every slide and changes to a layout reaching the slides that use it. Fonts have no dialog of their own; they are set on the placeholders of the theme slide.
5. Turboslide's Edit theme should be an editor mode, not a route, over a new `themeEdits` record on the deck that overrides the base theme's tokens, fonts, frame geometry, corner mark, counter, chips and type ladder, plus `customLayouts` for layouts made in the builder. The renderer emits one override stylesheet per deck from the record, so the string renderer, the viewer, present mode, the thumbnails, the PDF, the HTML and the Perfect PPTX follow without a second code path; the Editable text PPTX writes the edited values into `clrScheme`, `fontScheme` and the masters.
6. The twelve Google colour slots map onto Turboslide's tokens in the order the export fixture already uses: dark 1 is ink, light 1 is paper, dark 2 is ink-2, light 2 is the plate composite, accents 1 to 4 are the four semantic hues, accent 5 is titanium, accent 6 is the raised panel, the link colour is info and the followed link is titanium. The Colors dropdown shows Google's twelve names; the tooltip names the token.
7. A second built in theme needs the theme id to become a list in `packages/schema/src/deck.ts` and `packages/theme/src/theme.ts`, tokens keyed by theme id before appearance, a second `sheet.css` and `stage.css`, a per theme stage (frame, corner mark, counter), per theme PPTX master names and a second group in the Themes panel. It should keep the GT grid (the 1326 by 642 content box at 137, 129) so the 21 layouts and every canvas position stay valid, and change only the frame drawing, the corner slot, the type features and the tokens.
8. The Turboslide mark on a customer's sheet is a decision for Kevin. SPEC-4 1.3 records "No Turboslide wordmark on any sheet (J2 decision 6)" and 1.9 "The identity never draws on the customer's slide"; SPEC-4 7 records the second theme as "recommended against". This report designs the second theme so that its identity is the construction of the mark (the plate cut lower left, the one cell rail, Inter 500 with `cv11` and `ss01`) and its corner slot is empty by default, with the mark as an opt in toggle under Edit theme. Kevin picks between the default and the toggle in section 8.
9. Google Slides has no Insert > Equation. The equation editor is a Google Docs feature ("Use equations in a document"); Slides offers Insert > Shape > Equation, six math shapes that Turboslide already has. Building the editor makes Turboslide exceed Slides here, which the brief asks for; the row should carry `turboslide: true` and sit after Special characters in the Insert menu.
10. The equation export path is settled: the ISO parent list of `m:oMath` has no DrawingML paragraph in it, so a PPTX carries math through `a14:m` (MS-ODRAWXML 2.3.3, `CT_TextMath`) inside `mc:AlternateContent` in the shape's `a:p`, with a picture fallback. pptxgenjs cannot write it, so it is a step of the OOXML post-process like the connectors, on the Editable text export only; the Perfect export rasterizes the MathML the renderer already drew.

## 1. The Later and Omit rows

Read from `packages/chrome/src/menus/model.ts` at d5d7f07 by loading the module under Node and walking `TITLE_ROW_ITEMS` and `MENUS`. Containers whose status derives from their children (`sub()`) are marked "container". Rows marked "context only" are reachable from a right-click menu and Search the menus, not the menu bar.

| Id | Google label and position | Status | Clause recorded | Class | Round five home |
| --- | --- | --- | --- | --- | --- |
| `title.star` | Star, title row | Omit | Starring is a per person list; the home page lists every presentation | 2, proposed | A starred flag per principal (per browser for an anonymous principal, on the account when signed in) and a Starred filter on the home page; needs no new storage beyond the principal record of round three |
| `title.move` | Move, title row | Omit | No folders | 1 | Drive's folder tree; a Google service |
| `title.presence.joinChat` | Collaborators > Join chat | Later | Leave a comment on the slide instead | 2, E | Chat inside the file over the operation stream with the comment logging and abuse limits (SPEC-3 17) |
| `title.meet` | Meet | Omit | A Google service | 1 | Google Meet |
| `title.record` | Record | Omit | A Google service | 1 | Records to Drive, Workspace only. A Turboslide recording of the presenter through the browser's media recorder is offerable but stores large video, which is class 3 (section 8) |
| `title.slideshow.presentOnAnotherScreen` | Slideshow > Present on another screen [Present using Chromecast] | Later | Presenter view opens a second window you can drag to another screen | 2, A | Cast is Google's; the standalone form is the browser's window management permission placing the show on a second screen and the Presentation API where the browser offers it (availability unverified, section 10) |
| `title.slideshow.displayOptions` | Slideshow > Presentation display options | Omit | Chrome's multi screen permission flow; Presenter view covers the two window case | 2, A | The same permission as the row above; flips with it |
| `title.gemini` | Ask Gemini | Omit | A Google service | 1 | Gemini |
| `file.email` | File > Email (container) | Later | The invitation carries your message | 3 | Needs the mail sender (Resend) on Kevin's list |
| `file.email.thisFile` | File > Email > Email this file | Omit | Share sends the link with your message | 3 | Sends the file as an attachment; needs the mail sender |
| `file.email.collaborators` | File > Email > Email collaborators | Later | The invitation carries your message | 3 | `share.emailCollaborators` (SPEC-3 17 R8); needs the mail sender |
| `file.download.odp` | File > Download > ODP Document (.odp) | Later | Only PowerPoint, PDF, text, pictures and the web page download | 2, E | The ODP download |
| `file.download.svg` | File > Download > Scalable Vector Graphics (.svg, current slide) | Later | Only PowerPoint, PDF, text, pictures and the web page download | 2, E | The SVG download of the current slide |
| `file.move` | File > Move | Omit | No folders | 1 | Drive |
| `file.addShortcut` | File > Add shortcut to Drive | Omit | No Drive | 1 | Drive |
| `file.versionHistory.deleteOlder` | File > Version history > Delete this and older versions (context only) | Later | Named versions are kept; older records thin out after 30 days | 2, E | `version.delete` with the re-authentication rule and a confirm (SPEC-3 17, 0.45); accounts are optional already |
| `file.versionHistory.deleteHistory` | File > Version history > Delete history (context only) | Later | Named versions are kept; older records thin out after 30 days | 2, E | The same action over the whole history |
| `file.approvals` | File > Approvals | Omit | Workspace only | 1 | Workspace Enterprise only (SPEC-3 17) |
| `file.offline` | File > Make available offline | Omit | Present mode keeps working after load without the network (R07 rule 29) | 2, proposed | A service worker pin of the deck and its assets, the "Available offline" pinning of SPEC-3 17; needs no server |
| `file.language` | File > Language | Omit | One face and English copy rules; spelling follows the browser | 2, E | A document language for the spell check card, the autocorrect rules and the `lang` attribute of the sheet; it joins Spelling and Preferences |
| `file.pageSetup` | File > Page setup | Later | The GT theme is 16:9 at 1600 by 900 | 2, E | Page setup with 16:9, 16:10, 4:3 and custom |
| `view.motion` | View > Motion | Omit | Section 0.5; the one Transition stub sits in Google's three Transition positions | 2, A | The Motion panel |
| `view.themeBuilder` | View > Theme builder | Omit | The GT theme is edited in the repository; Slide > Edit theme is the Later stub | 2, E | The second entry to Edit theme (section 4) |
| `view.guides.edit` | View > Guides > Edit guides | Later | Drag a guide to move it and right-click it to delete it | 2, E | The dialog over `Deck.guides`: Vertical and Horizontal tabs, a position and a colour per guide, Add new guide, Done (SPEC-2 12) |
| `insert.image.stockWeb` | Insert > Image > Stock & web | Omit | Google services and the licensing hazard R07 names | 1 | Google's image search and stock library. A licensed provider of Turboslide's own needs a provider key, which is Kevin's (section 8) |
| `insert.image.drivePhotos` | Insert > Image > Drive & Photos | Omit | A Google service | 1 | Drive and Photos |
| `insert.image.camera` | Insert > Image > Camera | Omit | A Google service | 2, B | The browser's camera through `getUserMedia`, a capture button and the picture stored as an asset; the recorded reason is wrong, Google's row uses the device camera |
| `insert.audio` | Insert > Audio | Later | Link to a recording instead | 2, B | The audio block |
| `insert.video` | Insert > Video | Later | Link to a recording instead | 2, B | The video block, upload and URL |
| `insert.chart.fromSheets` | Insert > Chart > From Sheets | Omit | A Google service | 1 | Sheets |
| `insert.animation` | Insert > Animation | Omit | Section 0.5 | 2, A | Opens the Motion panel with the selected object's list |
| `insert.placeholder` | Insert > Placeholder | Omit | Theme builder only | 2, E | The submenu inside Edit theme: Title, Subtitle, Body, Slide number, Image (the Slide number entry is unverified, section 10) |
| `insert.templates` | Insert > Templates | Later | Start from the GT brand deck on the home page | 2, C | The template picker over the gallery |
| `insert.buildingBlocks` | Insert > Building blocks | Later | Start from the GT brand deck on the home page | 2, C | Agendas, quotes, key statistics, the sidebar |
| `insert.speakerSpotlight` | Insert > Speaker spotlight | Omit | Meet only | 2, proposed | Google's shape shows the presenter's camera during a Meet presentation; the standalone form is a placeholder shape that shows the presenter's camera in present mode through `getUserMedia`, nothing stored. Outside the brief's letters |
| `format.alignIndent.indentationOptions` | Format > Align & indent > Indentation options | Later | Set the indent under Text fitting | 2, E | First line and hanging indents with the ruler's markers (SPEC-2 12) |
| `format.bulletsNumbering.listOptions.restart` | Format > Bullets & numbering > List options > Restart numbering | Later | Numbering starts at 1 | 2, E | `plain.start` |
| `format.bulletsNumbering.listOptions.prefixSuffix` | Format > Bullets & numbering > List options > Edit prefix and suffix | Later | Numbering starts at 1 | 2, E | `plain.prefix` and suffix |
| `slide.transition` | Slide > Transition (also `toolbar.transition` and the filmstrip menu) | Later | The GT theme presents still slides | 2, A | Transitions |
| `slide.editTheme` | Slide > Edit theme | Later | The footer mark, the slide counter and the rails belong to the GT theme | 2, E | Section 4 |
| `tools.spelling.spellCheck` | Tools > Spelling > Spell check | Later | Your browser underlines misspellings and offers suggestions on right-click | 2, E | The spell check card |
| `tools.spelling.personalDictionary` | Tools > Spelling > Personal dictionary | Omit | The browser's dictionary applies | 2, E | A word list per principal the card consults; the browser's own underline cannot read it, so the card owns it |
| `tools.explore` | Tools > Explore | Omit | Retired by Google in 2024 (R02 8.6) | 1 | Google removed the row; a row Google no longer has is not parity. The brief names Explore in E; this report recommends it stays omitted (section 8) |
| `tools.linkedObjects` | Tools > Linked objects | Omit | No linked sources | 1 | Lists charts, tables and slides linked to Sheets, Docs and Slides. A Turboslide to Turboslide link on `slide.import` would give the panel a meaning; that is a design choice under D, not parity |
| `tools.dictionary` | Tools > Dictionary | Omit | A Google service | 3 | Definitions need a dictionary provider or a shipped dictionary; the zero infrastructure form is a Look up row that opens a search in a new tab. Kevin picks (section 8) |
| `tools.qaHistory` | Tools > Q&A history | Omit | A Google service | 2, proposed | Audience Q&A over the operation stream and the anonymous principal, with the comment rate limits (SPEC-3 17 lists audience Q&A). Outside the brief's letters |
| `tools.dictateNotes` | Tools > Dictate speaker notes | Omit | A Google service | 2, E | Voice type over the browser's speech recognition where the browser offers it; the brief names it |
| `tools.preferences` | Tools > Preferences | Later | Text fitting is set per text box in Format options; the ruler reads inches | 2, E | Autocorrect, substitutions, link detection, capitalization, the ruler's unit, autofit defaults |
| `tools.accessibilitySettings.screenReader` | Tools > Accessibility settings > Turn on screen reader support | Omit | The browser's screen reader works on the DOM | 2, E | The toggle adds the Accessibility menu (speak selection, speak formatting, verbalize to screen reader) over `speechSynthesis` and live regions |
| `tools.accessibilitySettings.braille` | Tools > Accessibility settings > Turn on braille support | Omit | The browser's screen reader works on the DOM | 1 | A braille display follows the screen reader over the DOM; there is no behaviour to add |
| `tools.activityDashboard.viewers` | Tools > Activity dashboard > Viewers (context only) | Later | Turboslide keeps no record of who viewed a presentation | 3 | Recording views is a privacy decision for Kevin |
| `extensions.addOns` | Extensions > Add-ons (container) | Omit | No marketplace | 1 | Google Workspace Marketplace |
| `extensions.addOns.get` | Extensions > Add-ons > Get add-ons | Omit | No marketplace | 1 | Marketplace |
| `extensions.addOns.manage` | Extensions > Add-ons > Manage add-ons | Omit | No marketplace | 1 | Marketplace |
| `extensions.installedAddOns` | Extensions > Installed add-ons [Installed add-on entries] | Omit | No marketplace | 1 | Marketplace; Turboslide's extension surface is Extensions > Agent access (the CLI, MCP, the window API, skills) |
| `extensions.appsScript` | Extensions > Apps Script | Omit | A Google service; the name is not reused for unrelated things (section 0.26) | 1 | Apps Script |
| `extensions.appSheet` | Extensions > AppSheet | Omit | A Google service; the name is not reused for unrelated things (section 0.26) | 1 | AppSheet |
| `help.training` | Help > Training | Omit | No training site | 2, E | A Turboslide page |
| `help.updates` | Help > Updates | Omit | No release notes page | 2, E | A Turboslide page fed from the repository's release notes |
| `help.privacyPolicy` | Help > Privacy Policy | Omit | No policy page | 3 | The page is buildable; the text and the domain are Kevin's |
| `help.termsOfService` | Help > Terms of Service | Omit | No terms page | 3 | As above |

Two entries outside the row list:

| Entry | Where | Status | Clause or reason | Class | Round five home |
| --- | --- | --- | --- | --- | --- |
| `toolbar.transition` | Toolbar tail, position 17 | Later | The GT theme presents still slides | 2, A | Flips with `slide.transition` |
| Accessibility menu | `OMITTED_MENUS` | Omit | Appears in Google only with screen reader support on; the browser's screen reader reads the page as it is | 2, E | Drawn while the screen reader toggle is on |

Counts: class 1, 19 rows; class 2, 35 rows (31 in A to F, 4 proposed: Star, Make available offline, Speaker spotlight, Q&A history); class 3, 7 rows. Of the 22 Later rows, 19 are class 2 and 3 are class 3. Of the 39 Omit rows, 19 stay omitted, 16 flip to class 2 and 4 are class 3.

Two shared clauses need rewriting when their rows flip: `NO_MEDIA` ("Link to a recording instead") disappears with Audio and Video, `START_FROM_GT` with Templates and Building blocks, `STILL_SLIDES` with Transition, `DOWNLOAD_FORMATS` with ODP and SVG, `NUMBERING_STARTS`, `GUIDES_BY_HAND`, `CHAT_LATER`. `DELETE_VERSIONS_LATER` and `VIEWERS_TAB_LATER` stay if Kevin holds those rows. `GOOGLE_SERVICE` stays for class 1. The Camera row needs a new clause only if it is not built.

## 2. What Google's theme builder is

### 2.1 The names and the entry points

- Slide > Edit theme opens the theme builder; View > Theme builder opens the same view (G1, the round one inventory rows 124 and 260 of `research/01-menu-bar.md`). The view was called "Master" until 25 May 2021; Google's post says the rename was made "to help users quickly customize the font, color, and layout customization for their current theme, ensuring a consistent experience throughout the presentation" (G2, verified).
- The round one research recorded the builder's parts from third party walkthroughs (`research/03-home-themes-layouts-io.md` b.6, keys S42, S43, S64, S65): a dark canvas, a left column with one slide under "Theme" and the layouts under "Layouts", a Rename button above the canvas, an X at the top right, Background, Shape and Line buttons in the builder toolbar, nine text levels on the theme slide for body text, right-click on a layout for New layout (Ctrl+M inside the builder), Duplicate layout, Rename layout and delete, automatic save.
- The How-To Geek walkthrough of 2021-09-25 (T1, third party) confirms the layout operations ("Right-click the slide and pick 'Duplicate Layout'", "Click 'Rename' at the top, enter the name, and click 'OK'"), the placeholders ("title, subtitle, or body placeholder, or use all three. You can also insert an image placeholder") and the propagation ("if you edit your custom slide in Theme Builder, you'll see those changes apply to your existing slides immediately").

### 2.2 The object model

- The Slides API has five page types, SLIDE, MASTER, LAYOUT, NOTES and NOTES_MASTER; a slide's `layoutObjectId` and `masterObjectId` are read only; a layout's `masterObjectId`, `name` and `displayName` and a master's `displayName` are its properties; "The page will inherit properties from the parent page" (G3, verified). One master plus its layouts plus a colour scheme and fonts is what the editor calls a theme (round one b.1, S1).
- Theme colours are twelve slots, DARK1, LIGHT1, DARK2, LIGHT2, ACCENT1 to ACCENT6, HYPERLINK and FOLLOWED_HYPERLINK, with TEXT1, BACKGROUND1, TEXT2 and BACKGROUND2 as aliases of the first four (G4, verified). The editor's dropdown names them Text and background 1 to 4, Accent 1 to 6 and Link (round one S81, third party).
- Placeholder types in the API: BODY, CHART, CLIP_ART, CENTERED_TITLE, DIAGRAM, DATE_AND_TIME, FOOTER, HEADER, MEDIA, OBJECT, PICTURE, SLIDE_NUMBER, SUBTITLE, TABLE, TITLE, SLIDE_IMAGE (G4, verified). The editor exposes title, subtitle, body and image placeholders through Insert > Placeholder; round one lists a Slide number placeholder as unverified.
- Limits from round one: up to 5 themes per presentation and 100 layouts per theme (S33, Google).

### 2.3 The controls Google documents

- Colors: "At the top, click Slide, Edit theme, Colors", then "select the color you want to edit from the drop-down", pick a preset or "a multi-colored square" or a "hex value", and "change the transparency of each color" (G1, verified, quoted in part).
- Import theme: the Themes panel's bottom right button imports a theme "from: A Google Slide or PowerPoint presentation" or from your own image (G1, verified). The picker shows the file, then the themes the file holds, then the Import theme button (round one b.5, S17 Google and S60 third party).
- Fonts: Google documents no Fonts dialog for the builder. The fonts of a theme are the fonts of the placeholders on the theme slide, set with the toolbar's font control while the placeholder is selected (third party through S64 and S65; the absence of a dialog is unverified against a Google page, section 10).
- Rename: the Rename button renames the theme; a layout is renamed from its right-click menu (S42, S64, T1, third party).

## 3. What Turboslide has today

Repository facts at d5d7f07.

| Element | Where | What it is |
| --- | --- | --- |
| The theme id | `packages/schema/src/deck.ts` line 24 `THEMES = ['gt-ink-paper']`, line 77 `Deck.theme: ThemeId`; `packages/theme/src/theme.ts` `THEME_ID` | One theme; the comment says "a second theme is additive (SPEC 2.1, open question 6)" |
| The deck's theme fields | `deck.ts` lines 80 to 88 `defaults.appearance`, `defaults.counter`, `defaults.background`, `defaults.notes` | The Themes panel writes `/defaults/appearance`; `deck.set`'s pointer regex already admits `/theme` (`packages/schema/src/actions.ts` line 994) |
| The tokens | `packages/theme/src/tokens.ts` `TOKEN_NAMES` (paper, ink, ink-2, titanium, hair, hair-soft, plate, cross, edge, thumb), `TOKENS` per appearance, `SEMANTIC` (ok `#12a37a`, warn `#f0a020`, no `#e5484d`, info `#2f5ce0`), `PANEL`, `COMPOSITE` | `tokens.test.ts` parses `sheet.css` and asserts the constants and the CSS agree |
| The fonts | `sheet.css` lines 12 to 32: `--display` and `--text` are Inter stacks, `--mono` a system monospace stack, `--cjk`, `--arabic`, `--indic` script stacks | One face; the fonts package ships `InterVariable.woff2` |
| The frame | `sheet.css` lines 57 to 114: two rails at 56 px (`.frame::before`, `::after`), two rules at 56 px, four 11 px crosses at 51 px; `tokens.ts` `RAIL = 56`, `INSET = 57`, `CROSS = { size: 11, offset: 51 }` | `packages/render/src/stage.ts` `FRAME_HTML` emits it once per stage; no slide draws it |
| The wordmark | `sheet.css` lines 126 to 135 (`.wordmark` at left 72, bottom 18, 18 px, titanium); `stage.ts` `WORDMARK_HTML` (the `#gt-mark` symbol at 28 by 18); `tokens.ts` `WORDMARK` | The GT mark from the sprite (`packages/theme/assets/sprite.svg`) |
| The counter | `sheet.css` lines 116 to 125 (right 72, bottom 22, 13 px, `--display`, titanium, tabular); `stage.ts` `counterText`; `deck.defaults.counter` | On when absent |
| The chips | `tokens.ts` `CHIPS` (66, 858, 40, 30) and (1474, 856, 60, 28); `packages/render/src/slide.ts` lines 233 and 471 `.ts-chips` | Two paper chips under the wordmark and the counter on full-picture slides |
| The layouts | `deck.ts` `LAYOUT_IDS` (21 ids, Google's eleven names first), `packages/schema/src/layouts.ts`; `SlideBase.template` | Apply layout, the New slide arrow, the Layout button and the layout grid read one list |
| The mark block | `packages/schema/src/blocks.ts` line 609 `MarkBlock`; `packages/render/src/blocks/misc.ts` `renderMark`; `slide.ts` line 244 the closing plate's mark | Content of the GT theme (SPEC-4 1.3) |
| The Themes panel | `packages/chrome/src/ThemesPanel.tsx`; strings `PANELS.themes` (`title`, `gt`, `light`, `dark`, `inThisPresentation`, `importTheme`, `importStub` "Turboslide has one theme, GT") | One group "GT" with Light and Dark thumbnails of slide 1, "In this presentation" with the same two, Import theme disabled |
| The PPTX masters | `packages/export/src/pptx/masters.ts`: `LAYOUT_NAME = 'TS_SHEET_16x9'`, `DECK_PAPER_<THEME>` and `DECK_PICTURE_<THEME>` per appearance, the frame as 0.6 pt lines from the scene, the wordmark as a 2x PNG | Scene driven, so a frame edit reaches the export once the scene carries it |
| The theme part fixture | `packages/export/src/verify/fixture.ts` lines 152 to 169 | `clrScheme name="Turboslide"`: dk1 `070707`, lt1 `FFFFFF`, dk2 `3A3D44`, lt2 `F6F6F6`, accent1 `12A37A`, accent2 `F0A020`, accent3 `E5484D`, accent4 `2F5CE0`, accent5 `8A8F98`, accent6 `101010`, hlink `2F5CE0`, folHlink `8A8F98`; `fontScheme` major "GT Inter Display", minor "GT Inter Text 22"; `clrMap` bg1 lt1, tx1 dk1 |
| The round four identity | SPEC-4 1.1 to 1.9: `packages/theme/src/brand.ts` `markBits`, `markPath`, `cellRects`, `WINDOW = [1, 5, 4, 7]`, `FIELD_END = 0.25`; `packages/theme/brand/*.svg`; `BRAND_TOKENS` in `packages/chrome/src/brand.css`; the wordmark rule Inter 500 with `cv11` and `ss01` | Round four is in the working tree, so these are read from SPEC-4, not from `main` |
| The rules against the mark on a sheet | SPEC-4 1.3 "No Turboslide wordmark on any sheet (J2 decision 6)"; 1.9 "The identity never draws on the customer's slide"; SPEC-4 7 "A Turboslide branded second sheet theme and what a blank presentation's sheet corner shows (SPEC open question 6; recommended against)" | Section 8 |
| Export modes | `packages/schema/src/export.ts` `ExportMode = 'native' | 'flatten'`; `export-pptx.ts` `DEFAULT_MODE = 'flatten'` | Perfect PPTX is `flatten`; Editable text PPTX is `native` |
| The OOXML post-process | `packages/export/src/ooxml/*.ts` (clean, kern, shapes, titles, groups, geometry, validate, zip); `pptx/build.ts` line 253 "The post-process rewrites per slide index: connectors, adjust values, columns and the alt" | Where the equation wrapper of section 6 attaches |

## 4. Edit theme in Turboslide

### 4.1 The shape of the change

Google's builder is one mode of the editor over a document whose master and layouts are pages. Turboslide's master is code (the stage and `sheet.css`) and its layouts are code (`layouts.ts`). Edit theme therefore edits an override record on the deck rather than pages, and the renderer turns the record into CSS. The base theme stays the one the repository ships and the parity test keeps guarding; a deck carries only what it changed.

Proposed schema additions in `packages/schema/src/deck.ts` (names follow the existing `defaults` block):

```
themeEdits?: {
  name?: string;                                   // Rename; the Themes panel shows it under "In this presentation"
  colors?: { light?: Partial<Record<TokenName | SemanticName, string>>;
             dark?:  Partial<Record<TokenName | SemanticName, string>> };
  fonts?: { display?: string; text?: string; mono?: string };   // a family name from the fonts package's set
  frame?: { rails?: boolean; rules?: boolean; crosses?: boolean; inset?: number };  // inset 56 today
  mark?:  { kind: 'gt' | 'picture' | 'none'; assetId?: string; box?: [x, y, w, h] };   // the corner slot
  counter?: { show?: boolean; side?: 'left' | 'right'; format?: 'n' | 'n-of-total'; box?: [x, y, w, h] };
  chips?: { show?: boolean };
  type?: { levels?: Partial<Record<TypeLevel, { size?: number; weight?: number; tracking?: number }>> };
  background?: SlideBackground;                    // already defaults.background; Edit theme's Background button writes it
};
customLayouts?: Record<string, CustomLayout>;      // layouts made in the builder
```

A `CustomLayout` is a canvas slide (the same positioned blocks as any canvas slide) whose blocks may carry `placeholder: 'title' | 'subtitle' | 'body' | 'slideNumber' | 'picture'`, a `name` and `displayName`, and a `hidden` flag for a built in layout the builder "deleted" (a built in layout is code and cannot be removed, so Delete hides it from the four entry points). `SlideBase.template` widens from `LayoutId` to `LayoutId | customLayoutId`. Apply layout on a custom layout moves the slide's placeholder content into the layout's placeholder boxes and leaves free boxes where they are, the behaviour round one recorded (b.2, S42, S43).

### 4.2 The colour slots

The Colors panel lists Google's twelve names in Google's order; the tooltip names the token it writes. The mapping is the one `fixture.ts` already writes into `clrScheme`, so the Editable text export needs no second table.

| Google's name in the dropdown | API slot | Turboslide token | Light value today | Dark value today |
| --- | --- | --- | --- | --- |
| Text and background 1 | DARK1 (TEXT1) | `ink` | `#070707` | `#f2f2f0` |
| Text and background 2 | LIGHT1 (BACKGROUND1) | `paper` | `#ffffff` | `#070707` |
| Text and background 3 | DARK2 (TEXT2) | `ink-2` | `#3a3d44` | `#b9bcc3` |
| Text and background 4 | LIGHT2 (BACKGROUND2) | `plate` composited on paper | `#f6f6f6` | `#131313` |
| Accent 1 | ACCENT1 | `SEMANTIC.ok` | `#12a37a` | same |
| Accent 2 | ACCENT2 | `SEMANTIC.warn` | `#f0a020` | same |
| Accent 3 | ACCENT3 | `SEMANTIC.no` | `#e5484d` | same |
| Accent 4 | ACCENT4 | `SEMANTIC.info` | `#2f5ce0` | same |
| Accent 5 | ACCENT5 | `titanium` | `#8a8f98` | same |
| Accent 6 | ACCENT6 | `PANEL.background` (raised) | `#101010` | same |
| Link | HYPERLINK | `SEMANTIC.info` | `#2f5ce0` | same |
| (followed link, no dropdown row) | FOLLOWED_HYPERLINK | `titanium` | `#8a8f98` | same |

The derived tokens (`hair`, `hair-soft`, `cross`, `edge`, `thumb`) are alpha forms of ink and recompute from an edited ink; the Colors panel does not list them. Google offers transparency per colour; Turboslide's picker offers it for the four Text and background slots only, because an accent with alpha would break the exporter's composite rule (SPEC 5.1). The picker is the one round two built for shapes (preset swatches, a hex field, the theme swatches row).

### 4.3 Fonts

The Fonts control lists the faces the fonts package ships plus the system stacks the sheet already names (`--mono`, `--cjk`, `--arabic`, `--indic` are not editable; they follow the text face's script fallback). A chosen face writes `themeEdits.fonts.display` or `.text`. The Editable text export maps the face through `pptx/fonts-map.ts` as it does today and writes it as the `fontScheme` major and minor fonts; the residual names a face the set has no cut for, the rule text.ts already follows.

### 4.4 The frame, the mark, the counter and the chips as objects

Inside the mode the canvas shows the theme slide: the paper ground, the frame, the corner mark slot, the counter and the two chips as selectable objects with Format options, plus the type ladder as a stack of sample lines (title, lead, body, caption, the nine levels Google shows reduce to Turboslide's ladder). Dragging the mark slot or the counter writes their `box`; the frame's toggles are check rows in Format options (Rails, Rules, Registration crosses) and its inset is a field; the chips have one toggle. Nothing in the mode moves the content box (1326 by 642 at 137, 129), so every slide keeps its geometry; a frame inset change is drawn under the content and never reflows it.

The mark slot's three kinds: `gt` draws the GT mark as today; `picture` draws an uploaded asset fitted into the box (the "Add picture to theme" of SPEC-3 17); `none` leaves the corner empty. The Turboslide mark is not one of the kinds unless Kevin decides otherwise (section 8).

### 4.5 The view

Edit theme is an editor mode (`mode: 'theme'` beside editing, commenting and viewing in the shell), not a route, because Google's builder is a mode and because the filmstrip, the toolbar and the panels are the same components with different data. In the mode:

- The filmstrip shows one tile under the heading Theme (the theme slide) and the layouts under Layouts: the 21 built in layouts through the layout grid renderer, then the custom layouts; hidden layouts are absent. Right-click on a layout: New layout, Duplicate layout, Rename layout, Delete layout (Delete hides a built in one and removes a custom one after a confirm). Ctrl+M makes a new layout inside the mode, as Google does.
- The toolbar carries the theme controls in Google's order: Background, Colors, Fonts, Insert placeholder (Title, Subtitle, Body text, Slide number, Image), Rename, and the X. Insert > Placeholder is present only in the mode, which is what the recorded reason "Theme builder only" meant.
- The canvas ground is `--pt-panel-ink` (the dark surround present mode uses), so the mode reads as different from editing.
- Changes are commits like any other, so undo, version history and the operation stream carry them; a collaborator sees the theme change on the next operation, which is the propagation Google describes.
- The X and picking a slide in the filmstrip leave the mode.

### 4.6 The renderer and the exports

- `packages/render` gains `themeCss(deck)`: one stylesheet scoped to `.ts-sheet[data-deck="<id>"]` (or the stage root) that redefines the tokens, the frame variables, the mark and counter boxes and the type levels from `themeEdits`. The base `sheet.css` gains the variables it needs (`--rail`, `--inset`, the counter and mark positions) with today's values as defaults, so the parity test between `tokens.ts` and `sheet.css` still holds for the base theme. The string renderer, the viewer, present mode, the filmstrip thumbnails, the layout tiles and the Themes panel's thumbnails all draw through the same function, so nothing needs a second path.
- Perfect PPTX (`flatten`): the raster follows the renderer. Editable text (`native`): `masters.ts` reads the scene's frame, paper and wordmark already; the scene extractor emits the edited frame and the mark slot's picture; the theme part's `clrScheme` and `fontScheme` are written from the mapping of 4.2 and the fonts of 4.3 instead of the fixture's constants; the master names gain the deck's theme so two decks with different edits do not collide in a batch merge.
- PDF, HTML, SVG and JPEG follow the renderer. The HTML export inlines the override stylesheet after the theme's.

### 4.7 Import theme

Import theme takes a `.pptx` or a Turboslide deck. From a PPTX, D's OOXML reader opens `ppt/theme/theme1.xml`, reads the twelve `clrScheme` colours and the `fontScheme` major and minor latin faces, maps them through the table of 4.2 in reverse and writes `themeEdits.colors` and `.fonts`; the layouts of the PPTX are not imported as custom layouts in round five (the report says what dropped, as D's import does). From a Turboslide deck, `themeEdits` and `customLayouts` are copied. The "your own image" option of Google's dialog is not offered; what it does is unverified (section 10) and Change background covers a picture behind every slide.

### 4.8 Actions

Every control is an action with CLI, MCP and window handlers, on a checkout and hosted, as the actions table requires. Proposed ids: `theme.get`, `theme.set` (a JSON pointer into `themeEdits`, the write every control makes), `theme.rename`, `theme.reset` (removes `themeEdits` or one pointer), `theme.import` (a PPTX path or a deck id), `layout.create`, `layout.duplicate`, `layout.rename`, `layout.delete`, `layout.setPlaceholder`, `layout.list`. The Colors, Fonts and frame controls are `theme.set` with fixed pointers; the audit's completeness test lists the pointers as it lists `deck.set`'s. The CLI form: `turboslide theme set /colors/light/ink '#101010'`, `turboslide theme rename "Sales 2026"`, `turboslide layout create --from title --name "Quote"`.

### 4.9 Tests

- `tokens.test.ts` stays as the base theme's parity chain; a new `theme-css.test.ts` asserts that an empty `themeEdits` emits an empty override and that every pointer the panel writes appears in the emitted CSS.
- The export fixture gains a deck with edited colours and fonts and asserts the `clrScheme` values and the master's frame lines.
- The e2e: enter the mode, rename, change Text and background 1, toggle the crosses, add a layout with a title placeholder, apply it to a slide, leave the mode; the viewer and the PDF show the change.
- The chrome lint is unaffected: the override colours live inside the sheet, never in the chrome.

## 5. A second built in theme

### 5.1 What the packages need

| Package | Today | Change |
| --- | --- | --- |
| `packages/schema/src/deck.ts` | `THEMES = ['gt-ink-paper']` | Add the second id; `ThemeId` widens; `deck.set /theme` already allowed |
| `packages/theme/src/theme.ts` | `THEME_ID`, `SHEET_CSS_URL`, `STAGE_CSS_URL`, `sheetCss()`, `stageCss()`, `sheetRootAttributes(theme)` where `theme` is the appearance | `THEME_IDS`, `sheetCss(id)`, `stageCss(id)`, `themeCss(id)`; `sheetRootAttributes(id, appearance)` stamps `data-sheet` for the id beside `data-theme` for the appearance (the attribute name `data-theme` is taken by the appearance and cannot move without touching every stylesheet) |
| `packages/theme/src/tokens.ts` | `TOKENS[appearance]` | `TOKENS[id][appearance]`; the grid constants stay shared if the second theme keeps the grid (5.2); `WORDMARK`, `COUNTER`, `CHIPS` become per theme |
| `packages/theme/src/<id>/sheet.css`, `stage.css` | One folder `gt-ink-paper` | A second folder; `tokens.test.ts` runs per theme |
| `packages/theme/package.json` | Exports the two GT CSS files | Exports the second pair |
| `packages/render/src/stage.ts` | `FRAME_HTML`, `WORDMARK_HTML` constants | `stageHtml(id)`; the second theme's frame and corner slot |
| `packages/render/src/slide.ts` | `.ts-chips` on picture slides | Per theme; the second theme has no chips (5.2) |
| `packages/export/src/pptx/masters.ts` | `DECK_PAPER_<APPEARANCE>` | `DECK_<ID>_PAPER_<APPEARANCE>`; the frame from the scene as today |
| `packages/export/src/verify/fixture.ts` | One `clrScheme` and `fontScheme` | One per theme from `TOKENS[id]` |
| `packages/chrome/src/ThemesPanel.tsx` and `strings.ts` | One group "GT" | Two groups, "GT" and the second theme's name; a click writes `deck.set /theme` and `/defaults/appearance` in one commit; "In this presentation" lists the current theme's two appearances; the tile renders slide 1 through the second theme |
| `packages/chrome/src/menus/model.ts` | `slide.changeTheme` Now over the panel | Unchanged; `view.themeBuilder` flips with Edit theme |
| The home page and `/new` | The GT template card | A second blank card per theme; File > New > From template picks a theme |
| `decks/` | The GT brand deck | A second sample deck that shows the theme, used by the export fixture and the screenshots |

### 5.2 What the second theme is

The identity of round four is a construction, not a logo: "A slide and the plate cut from it" (SPEC-4 1.1), an 8 by 8 grid with `WINDOW = [1, 5, 4, 7]`, the window 50 percent of the width and 37.5 percent of the height at 12.5 percent from the left and the bottom, a one cell rail on the left and the bottom, a Bayer field that thins toward the far corner. The second theme carries that construction onto the sheet, in ink and paper, with no Turboslide word on it:

- Grid: the GT content box (1326 by 642 at 137, 129) and the 21 layouts unchanged, so Change theme never moves an object and a canvas slide keeps every position.
- Frame: no rails, no rules, no crosses. The frame is the mark's rail, one 1 px `--hair` rule at 56 px from the left edge and one at 56 px from the bottom edge, the two edges of the mark's body rail. The opener and closing plates sit lower left with the mark's proportions on the sheet: an 800 by 338 plate at (200, 450) is the window of the 8 by 8 grid scaled to 1600 by 900 (the GT opener's plate is 740 by 271 at 137, 500, `PLATE_BOXES.opener`). `plateClear` measures the new box the way it measures the GT one.
- Full picture slides: the two tone picture under the whole slide with the plate cut from it, which is the composition the mark was taken from; no chips, because the corner slot is empty and the counter sits on the plate's row.
- Corner slot: empty by default (J2 decision 6). Edit theme offers `mark.kind: 'picture'` for the customer's own mark, and `'turboslide'` only if Kevin decides for it (section 8).
- Counter: bottom right as today, 13 px tabular, in `--titanium`.
- Type: Inter, weight 500 for display with `font-feature-settings: 'cv11', 'ss01'` and the wordmark's tracking rule (-0.025em at 28 px and above, -0.01em from 16 to 27 px), which is the one typographic feature the identity adds (SPEC-4 1.2); the body ladder shared with GT.
- Tokens: the same ten values in both appearances; the theme differs in geometry and features, not in colour, which keeps the chrome lint and the composite table unchanged and keeps the identity "ink and paper" (research-4 01 decision 1). The default appearance stays dark when absent, as `deckAppearance` reads it.
- Dithers: only where the GT theme allows them, as content the user placed (SPEC-4 1.9's sheet row); the theme draws no dither of its own on a customer's slide.

Name: the theme id should say what it is without the product's name on the sheet, for example `ts-plate`; the panel label is Kevin's to pick and is listed in section 8 with the mark decision.

### 5.3 What a blank presentation's corner shows

SPEC-4 7 asks this with the second theme. With the default above, a blank presentation in the second theme shows an empty corner and the counter; in the GT theme it shows the GT mark and the counter as today. Edit theme's mark slot is where a user changes either.

## 6. The equation editor

### 6.1 Where Google has it

- Google Slides has no Insert > Equation. The round one inventory of the Insert menu (`research/01-menu-bar.md`, the Insert section, verified against Google's menu) lists Image, Text box, Audio, Video, Shape with its four categories, Table, Chart, Diagram, Word art, Line, Special characters, Animation, Link, Comment, New slide, Slide numbers, Placeholder, Templates, Building blocks and Speaker spotlight, and no Equation. Slides' Insert > Shape > Equation is six shapes (MATH_PLUS, MATH_MINUS, MATH_MULTIPLY, MATH_DIVIDE, MATH_EQUAL, MATH_NOT_EQUAL), Now since round two (`insert.shape.equation`).
- The equation editor is Google Docs' ("Use equations in a document", G5, verified): Insert > Symbols > Equation; a toolbar with five dropdowns named Greek letters, Miscellaneous operations, Relations, Math operators and Arrows; "You can type "\" followed by the name of a symbol and a space in an equation to insert that symbol"; "To type superscripts or subscripts, type "\", then press Shift + 6 or Shift + -"; View > Show equation toolbar. The brief's "Math operations" is Google's "Math operators".
- The symbols inside each dropdown are not on Google's page. The customary contents (Greek letters, the lower and upper case alphabet; Miscellaneous operations, fraction, superscript, subscript, root, integral, sum, product, limit, brackets, matrices; Relations, equal, not equal, less and greater with or without equal, approximately, equivalent, proportional, element of, subset, superset; Math operators, plus, minus, times, division, plus minus, dot, circle, union, intersection, logical and, or, not, for all, exists, empty set, infinity, partial, nabla; Arrows, the single and double arrows in eight directions and the maps to arrow) are product knowledge and unverified (section 10). The design does not depend on the exact lists; the table that holds them is data.

### 6.2 Turboslide's design

- The row: Insert > Equation with `turboslide: true`, after Special characters, labelled Equation; View > Show equation toolbar as a Turboslide toggle beside the other View toggles. The tooltip says the row is Turboslide's own, as every `turboslide` row does.
- The document: an `equation` block, a positioned object on the canvas like every block, with `source` (a string in the Docs grammar, the backslash names and the `^` and `_` scripts) and nothing else stored; the rendered form is derived. Inside a text block an equation is a run with `eq: source`, so a formula can sit in a sentence as in Docs; the block form is what Insert > Equation makes on a slide.
- The grammar and the symbol table: `packages/schema/src/equation.ts` holds the parser (fractions, scripts, roots, n-ary operators with limits, delimiters, functions, accents, matrices) and `EQUATION_SYMBOLS`, the five categories with a name, a code point and an OMML form per symbol; the toolbar, the renderer and the writer read one table.
- Rendering: the string renderer emits MathML (`<math>` with `mfrac`, `msup`, `msub`, `msqrt`, `mroot`, `munderover`, `mo`, `mi`, `mn`, `mrow`, `mtable`) in the sheet's display face; Chromium's MathML Core draws it in the editor, the viewer and present mode, and the headless Chromium of the exporters draws it into the Perfect PPTX, the PDF and the JPEG (support in the shipped Chromium build is to be confirmed by the builder, section 10). The HTML export carries the MathML. The TXT export writes the source.
- The toolbar: New equation, the five dropdowns of 6.1 in Google's order, a grid of glyphs per dropdown from the table; the backslash autocompletion in the source field; Shift+6 and Shift+- for the scripts.
- Actions: `equation.insert` (a slide id, a source, a box), `equation.set` (the source), `equation.symbols` (lists the table for an agent), each with CLI, MCP and window handlers.

### 6.3 The OMML export path

Verified facts:

- OMML is Part 1 of ECMA-376, "Fundamentals And Markup Language Reference", which is ISO/IEC 29500-1 (E1, verified). `m:oMath` is section 22.1.2.77 and `m:oMathPara` is 22.1.2.78 in the namespace `http://schemas.openxmlformats.org/officeDocument/2006/math`; "When used in a display math zone (a math paragraph, oMathPara), oMath is a container for an instance of mathematical text that starts on its own line" (M1, verified). Its child objects include `acc`, `bar`, `borderBox`, `box`, `d`, `eqArr`, `f`, `func`, `groupChr`, `limLow`, `limUpp`, `m`, `nary`, `phant`, `r`, `rad`, `sPre`, `sSub`, `sSubSup`, `sSup` (M1).
- The ISO parent list of `m:oMath` names WordprocessingML containers (`p`, `tc`, `body`, `hdr`, `ftr` and the rest) and no DrawingML paragraph (M1, verified). PresentationML text therefore cannot hold `m:oMath` directly.
- The DrawingML extension element `a14:m` ("TextMath", MS-ODRAWXML section 2.3.3, type `CT_TextMath`, namespace `http://schemas.microsoft.com/office/drawing/2010/main`) "specifies either math content in a text paragraph (when such an element is used inside of a text paragraph) or document-level math properties container"; "The math content in a text paragraph can be either an inline math zone or a math paragraph" (M2, verified).

The path, in `packages/export/src/ooxml/equations.ts` as a step of the post-process on the `native` mode only:

1. pptxgenjs writes the equation block as a text box whose one run holds the source, with the object name `ts:equation#<blockId>` (the naming `pptx/shapes.ts` `objectName` already uses, so the post-process finds the shape by name as the connector step does).
2. The step replaces the run's `a:r` inside the shape's `a:p` with `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="a14" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><a14:m><m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMath>…</m:oMath></m:oMathPara></a14:m></mc:Choice><mc:Fallback>…</mc:Fallback></mc:AlternateContent>`, the OMML built from the parsed source by a writer over the same AST the MathML renderer walks (`m:f` for a fraction with `m:num` and `m:den`, `m:sSup` and `m:sSub`, `m:rad`, `m:nary` with `m:chr`, `m:d` with `m:begChr` and `m:endChr`, `m:func`, `m:acc`, `m:r` runs with `m:t`).
3. The fallback carries the equation as a picture, the PNG the headless Chromium drew of the MathML at 2x, added as a `p:pic` beside the shape by the same step (the images writer of `pptx/images.ts` gives the part and the relationship), so a reader without `a14` shows the formula. Whether LibreOffice reads `a14:m` is unverified (section 10); the fallback is what it will draw if it does not.
4. `[Content_Types].xml` needs no change (no new part type); the `mc:Ignorable` list is not used because `mc:AlternateContent` carries its own `Requires`.
5. `ooxml/validate.ts` gains the `m` and `a14` namespaces in its allowed set, and `clean.ts`'s empty `extLst` strip is unaffected.
6. The Perfect PPTX ignores the step: its page is a raster of the sheet where the MathML was already drawn, and its invisible text layer carries the source as searchable text.
7. The report records per slide the count of equations, the count that fell back to the picture only (a construct the writer does not cover), and the source of each.

## 7. The Google labels the rows must keep

Every label in section 1 is Google's word in sentence case, as the model stores it. Two rows carry Google's own spelling in `google`: Present on another screen (Google prints "Present using Chromecast") and Installed add-ons ("Installed add-on entries"). The flipped rows keep their labels; new Turboslide rows (Equation, Show equation toolbar, the theme mode's toolbar controls) carry `turboslide: true` so the completeness test against `__fixtures__/google-menus.json` does not count them as Google's.

## 8. Decisions for Kevin

1. The Turboslide mark on a customer's sheet. J2 decision 6 and SPEC-4 1.9 say no; the brief asks for a Turboslide branded second theme. This report's default is a second theme built from the identity's construction with an empty corner slot, and a `mark.kind: 'turboslide'` toggle under Edit theme as the alternative. Kevin picks the default, the toggle, or both, and names the theme.
2. Recording views for the Activity dashboard's Viewers tab, a privacy decision (`tools.activityDashboard.viewers`).
3. The mail sender for Email this file, Email collaborators and the invitations that carry a message (Resend is on his list).
4. A definitions provider for Tools > Dictionary, or the Look up row that opens a search in a new tab, or nothing.
5. The text of Help > Privacy Policy and Help > Terms of Service, and the domain they name.
6. Explore, which Google retired in 2024 and the brief names: this report recommends it stays omitted because parity means matching the menu Google has today.
7. A stock picture provider for Insert > Image > Stock & web, which needs a provider key and a licence review.
8. A Turboslide recording of the presenter (the standalone form of Record), which stores large video.
9. The four proposed rows outside A to F (Star, Make available offline, Speaker spotlight, Q&A history): in or out of round five.

## 9. Sources

| Key | Source | URL | Read |
| --- | --- | --- | --- |
| G1 | Google Docs Editors Help, "Use a Template or change the theme, background, or layout in Google Slides" (the Edit theme, Colors and Import theme steps) | https://support.google.com/docs/answer/1705254 | 2026-09-14 |
| G2 | Google Workspace Updates, "Master" view in Google Slides renamed to "Theme Builder", 25 May 2021 | https://workspaceupdates.googleblog.com/2021/05/theme-builder-for-google-slides.html | 2026-09-14 |
| G3 | Google Slides API reference, presentations.pages (PageType, SlideProperties, LayoutProperties, MasterProperties, inheritance) | https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages | 2026-09-14 |
| G4 | Google Slides API reference, presentations.pages other types (ThemeColorType, Placeholder Type) | https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/other | 2026-09-14 |
| G5 | Google Docs Editors Help, "Use equations in a document" | https://support.google.com/docs/answer/160749 | 2026-09-14 |
| T1 | How-To Geek, How to Create Template Slides with Theme Builder in Google Slides, 2021-09-25 (third party) | https://www.howtogeek.com/747178/how-to-create-template-slides-with-theme-builder-in-google-slides/ | 2026-09-14 |
| M1 | Microsoft Learn, Open XML SDK, OfficeMath class (`m:oMath`, ISO/IEC 29500-1 22.1.2.77, parents and children) | https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.math.officemath | 2026-09-14 |
| M2 | Microsoft Learn, Open XML SDK, TextMath class (`a14:m`, MS-ODRAWXML 2.3.3, `CT_TextMath`) | https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.drawing.textmath | 2026-09-14 |
| M3 | Microsoft Learn, Open XML SDK, DocumentFormat.OpenXml.Office2010.Drawing namespace (the a14 classes) | https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.drawing | 2026-09-14 |
| M4 | Microsoft Learn, [MS-ODRAWXML] Office Drawing Extensions to Office Open XML Structure, revision 34.0 of 2026-02-17 (the landing page; the section text was read through M2) | https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/ | 2026-09-14 |
| E1 | Ecma International, ECMA-376 Office Open XML file formats (the four parts and ISO/IEC 29500) | https://ecma-international.org/publications-and-standards/standards/ecma-376/ | 2026-09-14 |
| R1 | Repository, `docs/gslides-parity/research/01-menu-bar.md` (the Insert menu inventory, rows 124, 192, 258 to 261, 354 and their keys G02, G06, T01, T09, T36) | d5d7f07 | 2026-09-14 |
| R2 | Repository, `docs/gslides-parity/research/03-home-themes-layouts-io.md` sections b.1, b.5, b.6 and their keys S1, S17, S20 to S24, S28, S33, S42, S43, S53, S60, S64, S65, S81 | d5d7f07 | 2026-09-14 |
| R3 | Repository, `packages/chrome/src/menus/model.ts`, `strings.ts`; `packages/schema/src/deck.ts`, `blocks.ts`, `actions.ts`, `export.ts`; `packages/theme/src/theme.ts`, `tokens.ts`, `gt-ink-paper/sheet.css`; `packages/render/src/stage.ts`, `slide.ts`; `packages/export/src/pptx/masters.ts`, `text.ts`, `build.ts`, `verify/fixture.ts`, `ooxml/clean.ts`; `packages/chrome/src/ThemesPanel.tsx`; `packages/identity/src/*.ts` | d5d7f07 | 2026-09-14 |
| R4 | Repository, `docs/gslides-parity/SPEC-2.md` section 12, `SPEC-3.md` section 17, `SPEC-4.md` sections 1 and 7, `research-4/01-brand-references.md` | working tree (documents, not code) | 2026-09-14 |

Pages that refused or returned nothing useful: a second Google help page for the theme builder (`support.google.com/a/users/answer/10164039`, which redirects to G1's content); DuckDuckGo's HTML results page returned a verification challenge, which was not completed; Bing's results page returned no relevant results.

## 10. Unverified claims

1. The symbols inside each of the five equation dropdowns (6.1). Google's page names the dropdowns only.
2. Whether the theme builder has a Fonts dialog of its own; the third party pages describe fonts set on the theme slide's placeholders (2.3).
3. Whether Insert > Placeholder lists a Slide number placeholder (2.2, carried from round one).
4. What Import theme's "your own image" option does (2.3).
5. The browser's window management permission and the Presentation API as the standalone form of Present on another screen (section 1).
6. MathML Core support in the Chromium build the exporters ship (6.2); the builder confirms it against `chromium-1217` or the current build.
7. Whether LibreOffice Impress reads `a14:m` or draws the fallback (6.3).
8. The exact section text of MS-ODRAWXML 2.3.3 beyond the two sentences quoted through M2 (the specification PDF was not read).
9. Google's Speaker spotlight behaviour beyond "shows the presenter's camera during a Meet presentation" (section 1, carried from round one's "Meet only").
