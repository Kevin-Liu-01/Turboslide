# Clutter audit of the default view

Auditor: the clutter lane of the next program workflow, 2026-10-01 (PDT), 2026-10-02 (UTC). Tree: `/Users/kevinliu/repos/Turboslide-next`, branch `next/program` at `94e8a5c3`. Every file and line below is in that tree unless a path says otherwise.

## Method

- Model counts: `clutter/count.mjs` loads `packages/chrome/src/menus/model.ts` and `packages/chrome/src/menus/toolbar-tails.ts` under Node 24.13.0 and evaluates every row with `DEFAULT_MENU_CONTEXT` (`model.ts` 3494), once with Tools > Advanced tools off and once with it on. Output: `clutter/model-count.json`.
- Rendered counts: `clutter/inventory.mjs` drives Chrome for Testing 1217 (headless, SwiftShader) at 1440 by 900 px in both themes. It reads every visible `data-control`, every visible interactive element, the visible chrome text, the `data-tip` tooltips, the live regions and the level 0 rows of every menu.
- Local run: dev server on port 4492 (`TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_REALTIME=memory`), 2026-10-02 01:40:27Z to 01:41:23Z, load average 47 to 49. The local run also inserted a shape, a picture and a table through `window.turboslide.studio` and read the toolbar per selection. Output: `clutter/inventory-local.json`, `clutter/firstwrite.json`.
- Production run: https://www.turboslide.com, 2026-10-02 01:42:06Z to 01:43:37Z, load average 43 to 48, no write. Output: `clutter/inventory-prod.json`.
- Production cleanup check: `POST /api/actions/deck.info?deck=untitled-20261002-tebn` (the /new draft id of the production run) answered 404 `unknown_deck` at 01:44:00Z. The /new route writes nothing on a visit (`apps/studio/src/routes/new.tsx` header comment), so no production deck was created and none needed deletion. The dark theme visit to /new ended on the address /new as well (`inventory-prod.json` `new-dark.pathEnd`), which the route moves to /edit/<id> on the first write.
- Google Slides: the help center pages listed under "Google sources" were fetched 2026-10-01 between 18:37 and 18:40 PDT. They document the layout and the controls by name and give no row counts. The row counts for Google come from the repository's transcription of Google's public pages, `packages/chrome/src/menus/__fixtures__/google-menus.json` (read date 2026-09-11) and `docs/gslides-parity/research/02-editor-surface.md` section 4.1 (written 2026-09-11).
- Screenshots: `clutter/editor-default-{light,dark}-{local,prod}.png`, `clutter/decks-{light,dark}-{local,prod}.png`, `clutter/home-{light,dark}-{local,prod}.png`, and the local selection states `clutter/editor-text-editing-light-local.png`, `clutter/editor-after-first-write-light-local.png`, `clutter/editor-image-selected-light-local.png`, `clutter/editor-table-cell-light-local.png`.
- The local and production default views drew the same 65 `data-control` ids on /new; the comparison of the two lists in `inventory-local.json` and `inventory-prod.json` found no id on one side alone.

## Counts per surface

| Surface | Turboslide default view | Turboslide with Advanced tools on | Google Slides | Source |
| --- | --- | --- | --- | --- |
| Title row, interactive controls on /new | 10: home, name, Last edit, account chip, Assist, Show all comments, Show side panel, Slideshow, Slideshow arrow, Share | 11 (adds Notifications) | 14 items, 13 without the avatar row: app icon, title, Star, Move, document status, Last edit, Show all comments, Meet, Record, Slideshow, Share, account, Ask Gemini | prod DOM 01:42Z; `model.ts` 762 to 925; fixture "Title row" |
| Menu bar menus | 9 (Extensions is absent) | 10 | 10, plus Accessibility with screen reader support on | prod DOM; support.google.com/docs/answer/1634140 |
| Menu rows, top level | 87 | 106 | 113 | prod DOM `menus` read; `model-count.json`; fixture |
| Menu rows, every level | 250 | 303 | 282 (ten menus) | `model-count.json`; fixture |
| Menu rows Google does not have, default view | 25 | 25 plus the parked ones | 0 | `model-count.json` rows with `turboslide: true` |
| Leaf rows disabled with nothing selected | 107 (Format 77, Arrange 21) | 107 or more | not counted | `model-count.json` |
| Toolbar, nothing selected, interactive | 23 | 23 (Transition stays a Later stub, hidden) | 20 positions plus the live pointer toggle; a sidebar of 6 panes since 2025-03-31 | prod DOM; research 02 table 4.1; support.google.com/docs/answer/13853477; workspaceupdates post of 2025-03-31 |
| Toolbar while typing in a title | 32 interactive targets, 17 tail controls | 36 (the four fill and border controls) | Google's cheat sheet names the same groups (font, size, marks, color, link, comment, align, lists, indents) | local DOM `firstwrite.json`; `toolbar-tails.ts` 420 |
| Shape tail | 22 controls; the overflow More button draws at 1440 px | 22 | not counted | local DOM `inventory-local.json` `tails.shape` |
| Image tail | 8 controls | 9 (Dither) | not counted | local DOM `tails.image`; `toolbar-tails.ts` 475 |
| Table cell tail | 21 controls; More draws at 1440 px | 21 | not counted | local DOM `tails.table` |
| Line, chart, group tails | 6, 5, 5 | same | not counted | `model-count.json` |
| Right click menus (model) | card 12, empty slide 10, text 17, picture 17, shape 18, line 18, table 16, cell 17 | one more each | not counted | `model-count.json` `contextMenus` |
| Filmstrip | one card per slide, no other control | not counted | not counted | prod DOM |
| Speaker notes | 2 (resize handle, text) | 2 | notes pane | prod DOM |
| Status line after the first write | 2 phrases in the title row: "Last edit just now by Vellum 194" and "All changes saved" | same | a "Last edit" button at the top right | local DOM `firstwrite.json`; support.google.com/docs/answer/190843 |
| Banners on /new | production: 0; local tmp store: 1 | same | 0 | prod and local DOM live regions |
| Snackbars on open and after the first write | 0 | 0 | 0 | local DOM `firstwrite.json` |
| /decks | 11 fixed controls plus 3 per card; production lists 143 presentations | same | app bar, a template strip, 4 list header controls, 2 per item; the list holds the person's own and shared files | prod DOM; `deck.list` 200 at 01:46:35Z; research 03 section a.1 |
| /home | 8 interactive controls | same | signed out, Google redirects to its product page | prod DOM; research 03 section a.1 |

The default view already draws fewer menu rows than Google's (87 top rows against 113). The toolbar with nothing selected matches Google's count within one control. The clutter a seller meets comes from duplicate entry points, rows Google does not have, developer words, a control whose feature is off on production, wrong status text, and the /decks list.

## Duplicate entry points

| Control | File and line | Duplicates | Note |
| --- | --- | --- | --- |
| `insert.logo` (Insert > Logo) | `model.ts` 1451 | `insert.image.logo` (Insert > Image > Logo, 1423) and `format.image.replaceImage.logo` | Same label, same doc, same Logo dialog. The Insert menu draws "Logo" twice, once at the top level and once in Image. |
| `tools.assist` (Tools > Assist) | `model.ts` 2508 | `title.assist` (title row Assist, 825, Cmd+J) | Same panel, same doc. |
| `tools.tailor` (Tools > Tailor for a customer) | `model.ts` 2501 | the Assist doc at 825 and 2508 says "Tailor the deck for a customer" | Two ways to tailor with two different surfaces (a dialog and a panel). |
| `slide.editTheme` and `slide.changeTheme` | `model.ts` 2231, 2237 | `toolbar.theme` (`model.ts` 3090) | All three open one panel titled "Brand kit". Google's two rows open two surfaces (theme builder and the Themes panel). |
| `format.textFitting` (Format > Text fitting) | `model.ts` 2099 | `format.formatOptions` (2072) and the Format options button of every tail | The row opens Format options; Google keeps text fitting inside Format options alone. |
| `format.altText`, `format.image.imageOptions`, `format.editData` | `model.ts` 2087 and the Image and chart rows | Format options | Five default rows open the same Format options panel. Alt text and Image options are Google rows and stay. |
| `title.sidePanel` (Show side panel) | `model.ts` 839 | every panel's own entry | Reopens the last panel. Google has no such title row control. It replaced the bottom bar (`TitleRow.tsx` 40 to 44). |

## Developer concepts shown to a seller

| What the seller reads | Where | File and line |
| --- | --- | --- |
| "Shows the tools that are not yet tested end to end, in every menu, on the toolbar and in the right click menus" (the Advanced tools tooltip) | Tools > Advanced tools | `model.ts` 2521 to 2524 |
| "Play shaders" with On, In the show only, Off | View menu | `model.ts` 1359 to 1371 |
| "Shader" | Insert menu | `model.ts` 1662 |
| "Turboslide bundle (.zip)" and "Download options" | File > Download | `model.ts` 1048, 1055 |
| "Every presentation on this Turboslide is listed here" | /decks subtitle | `packages/chrome/src/menus/strings.ts` 964 |
| "Every presentation on this Turboslide" | title row home tooltip | `model.ts` 765 |
| Help Turboslide improve opens `github.com/Kevin-Liu-01/Turboslide/issues/new` | Help menu | `model.ts` 2643 |
| "GitHub" and "Documentation" in the top navigation | /home | `apps/studio/src/components/home/copy.ts` 84, 88 |
| Generated principal labels ("Felt 280 (you)", "Vellum 194", "Brass 411") in the account tooltip and in the Last edit words | title row | `packages/identity/src/labels.ts` 107; prod DOM tip `title.account` "Felt 280 (you)" at 01:42Z |
| "Edits are kept on this server instance only and do not persist until a Blob store is connected; connect one to the Vercel project to keep them" | editor banner on a tmp store (local dev and any deployment without Blob); production drew no banner | `packages/store/src/select.ts` 30 to 31; `apps/studio/src/editor/EditorRoot.tsx` 1891 to 1892 |

The forbidden words test list (`strings.ts` 1089 to 1128) found no hit in the 250 default rows' labels and tooltips (`model-count.json` `forbiddenHits` is empty). The words above are outside that list.

## Parked but still visible

- `toolbar.pointer` (Show my pointer) draws at the right end of the toolbar on production (prod DOM 01:42Z, tip "Show my pointer"). Its menu rows `view.livePointers.*` are parked (`model.ts` 1315 to 1328, `parked-controls.ts` 41 to 42). The toolbar reads `presentControls` (`ToolbarTail.tsx` 1295), which checks `advanced` and `status` and never reads `PARKED_CONTROLS`. On the blob tier the pointer is stripped from presence (`packages/store/src/presence-store.ts` 92, `PRESENCE_OMITTED_FIELDS = ['pointer']`), and production forces the blob tier, so the button changes nothing anyone else sees.
- No parked menu row drew in the default view: the level 0 rows read from production (`inventory-prod.json` `menus`) hold none of the 53 rows the switch adds.
- Three entries of the parked set name no control drawn under that id in the tree by a literal search: `bar.table` (`parked-controls.ts` 29; `Overlay.tsx` 779 draws `bar.chart.editData` alone), `panel.brand.logo.find` (38) and `toolbar.group.text` (40; `GROUP_TAIL` at `toolbar-tails.ts` 671 has no text control). They hide nothing.

## Wrong or misleading state

- A fresh /new draft that nobody edited shows "Last edit just now" (prod DOM 01:42Z, `deck.lastEdit.words`). `TitleRow.tsx` 289 falls back to the draft deck's `updatedAt`, which the draft gets when /new builds it.
- After the first write the title row shows two status phrases side by side, "Last edit just now by Vellum 194" and "All changes saved" (`firstwrite.json`; `TitleRow.tsx` 296 to 320 draws the words from 1280 px up).
- The name prompt plate ("Your name", Continue) opens in the title row after the first write and the deck name shrinks to one letter, "U", at 1440 px (`clutter/editor-table-cell-light-local.png`; `EditorShell.tsx` 490 to 495). It opened in one of the two local runs; the run of `firstwrite.json` did not show it within 5 s of the edit.
- The collapse rule for a submenu with one visible row (`model.ts` 3864 to 3904, asked for by `Menu.tsx` 316) draws three rows under the child's own label: File's first row reads "Presentation" (`file.new` 937 with the template gallery parked), and Tools opens on "Link detection" and "Turn on collaborator announcements" with their group names Preferences (2459) and Accessibility settings (2467) gone.

## /decks and /home

- Production /decks lists every presentation in the shared Blob store. `POST /api/actions/deck.list` answered 200 at 01:46:35Z with 143 presentations: 55 titled "Untitled presentation", 8 whose titles match a probe or test pattern, 35 updated since 2026-10-01. The first screen at 1440 by 900 shows 12 cards, among them "Cost probe cost.two-tabs-idle.calls" and seven "Untitled presentation" cards edited between 6:39 and 6:42 PM (`clutter/decks-light-prod.png`). The cards come from other pipelines' runs; this audit deleted none.
- The list is the store list (`apps/studio/src/routes/decks.index.tsx` 121, `listDecks()`). The browser's own Recent record already exists (`apps/studio/src/routes/-recent.ts`, `RECENT_MAX` 12) and draws a row "Opened on this device" when it has entries.
- Google's home lists the presentations a person owns or that were shared with them (research 03 section a.1, source S40).
- /home uses Title Case on its two buttons, "New Presentation" and "Open the Example Deck" (`copy.ts` 95, 109, 110), where the editor and /decks use sentence case ("Blank presentation", "New slide").

## Cuts proposed

| Control id | File and line | Change | Stays reachable at | Gain |
| --- | --- | --- | --- | --- |
| `insert.logo` | `model.ts` 1451 | Remove the top level row | Insert > Image > Logo (1423), Format > Image > Replace image > Logo, Search the menus ("logo") | Insert 14 to 13 top rows; one "Logo" row |
| `tools.assist` | `model.ts` 2508 | Remove | title row Assist (825), Cmd+J, Search the menus | Tools loses one row |
| `tools.tailor` | `model.ts` 2501 | Keep the row; make the Assist panel's tailoring starter open the same Tailor dialog and drop "Tailor the deck for a customer" from the Assist doc | Tools > Tailor for a customer | One way to tailor |
| `slide.editTheme` | `model.ts` 2231 | Remove, or make it open the Brand kit panel at its editing section | Slide > Change theme (2237), toolbar Theme (3090) | Slide 9 to 8 rows, or two rows with two different targets |
| `format.textFitting` | `model.ts` 2099 | Remove from the Format menu | Format options (2072), the Format options button of every text tail, Search the menus | Format 11 to 10 top rows |
| `view.playShaders` and `view.appearance` | `model.ts` 1359, 1391 | Move into a Tools > Preferences submenu with Link detection and collaborator announcements | Tools > Preferences, Search the menus | View 12 to 10 top rows; Tools opens on a named group |
| `tools.preferences`, `tools.accessibilitySettings` | `model.ts` 2459, 2467 | Merge into one Preferences submenu so the collapse rule no longer applies | Tools > Preferences | The Tools menu reads Preferences, Tailor, Check slides, Advanced tools |
| `file.download.zip`, `file.download.html` | `model.ts` 1048, 1044 | Move both formats into the Download options dialog (1055) and rename its row "More formats" | File > Download > More formats, `deck.pack` and `build.run` for agents | File > Download 7 to 5 rows, the four Google formats first |
| `toolbar.pointer` | `toolbar-tails.ts` 731; `ToolbarTail.tsx` 1295 | Park it with `view.livePointers.mine` until the realtime round's tier is production, or make `presentControls` read `isParked(control.item)` | returns with the realtime round (its branch drops the parked View rows) | No control without an effect on production |
| `bar.table`, `panel.brand.logo.find`, `toolbar.group.text` | `parked-controls.ts` 29, 38, 40 | Drop from the parked set at the next `--emit-parked`, or name the control ids they meant | not applicable | The parked set names only drawn controls |
| `title.sidePanel` | `model.ts` 839 | Keep | not applicable | It is the bottom bar's replacement; listed here as the one title row control Google lacks |

## Words to change

| Where | Today | Proposed |
| --- | --- | --- |
| Tools > Advanced tools tooltip (`model.ts` 2523) | "Shows the tools that are not yet tested end to end, in every menu, on the toolbar and in the right click menus" | "Shows more tools in every menu, on the toolbar and in the right click menus. Some of them may not work yet" |
| File menu first row (collapse of `file.new`, `model.ts` 938) | "Presentation" | "New presentation" |
| View > Play shaders, Insert > Shader (`model.ts` 1359, 1662) | "Play shaders", "Shader" | a seller's word for a moving picture, for example "Play animations" and "Animated pattern"; Kevin picks the noun |
| File > Download (`model.ts` 1048) | "Turboslide bundle (.zip)" | "Turboslide file (.zip)" inside More formats |
| /decks subtitle (`strings.ts` 964) | "Every presentation on this Turboslide is listed here" | remove the subtitle once the list shows the person's own presentations |
| Title row home tooltip (`model.ts` 765) | "Every presentation on this Turboslide" | "Your presentations" |
| Last edit words (`TitleRow.tsx` 296 to 320) | "Last edit just now by Vellum 194" | "Last edit just now", with the author in the tooltip; no words on a draft nobody edited |
| Generated principal labels (`labels.ts` 107) | "Felt 280 (you)" | "You" on the own chip; a generated label reads as an anonymous name with a prefix, for example "Guest Felt"; Google sign in replaces both |
| Panel title for the theme rows (`model.ts` 2231, 2237) | menu "Edit theme", "Change theme", toolbar "Theme", panel "Brand kit" | one noun in all four places |
| /home buttons (`copy.ts` 95, 109, 110) | "New Presentation", "Open the Example Deck" | "New presentation", "Open the example deck" |
| /home top navigation (`copy.ts` 88) | "GitHub" | remove from the top navigation; the footer link stays (`copy.ts` 230) |
| Help > Help Turboslide improve target (`model.ts` 2643) | a GitHub new issue page | a feedback form or mail address that needs no GitHub account |
| Local tmp store banner (`packages/store/src/select.ts` 31) | "Edits are kept on this server instance only and do not persist until a Blob store is connected" | "Edits on this copy of Turboslide are lost when it restarts" for the seller; the setup sentence goes to the server log |

## The realtime round's effect on these counts

Read from `git -C /Users/kevinliu/repos/Turboslide-realtime diff origin/main...HEAD -- packages/chrome/src/menus/model.ts packages/chrome/src/parked-controls.ts`:

- View > Live pointers returns to the default view with Show my pointer and Show collaborator pointers (`view.livePointers.others`), so View gains one top row and two submenu rows. With the move of Appearance and Play shaders into Preferences, View stays at 11 top rows.
- Follow (`title.presence.follow`) loses `advanced` and joins the roster menu for every editor and owner.
- The toolbar pointer toggle gains an effect once production runs the realtime tier, so the park proposed above lasts until that flip.
- Google sign in in the Sign in dialog (`packages/chrome/src/dialogs/SignIn.tsx` on that branch) gives the name prompt and the generated labels a signed in alternative.

## Google sources

All fetched 2026-10-01 between 18:37 and 18:40 PDT.

- support.google.com/docs/answer/1634140 (Use Google Slides with a screen reader): four main areas, Canvas, Filmstrip, Speaker notes and Top area; the top area is the file name, the menu bar and the toolbar; the menus listed are Edit, View, Insert, Format, Slide, Arrange, Tools, Extensions, Help and Accessibility.
- support.google.com/docs/answer/13466905 (Tool finder): in the toolbar, click Search, or Help > Search the menus; Option and / on a Mac.
- support.google.com/docs/answer/1696717 (Keyboard shortcuts for Google Slides): Ctrl+Shift+F hides and shows the menus; Alt+/ searches the menus.
- support.google.com/docs/answer/13853477 (live pointers): View > Live pointers > Show my pointer, and a pointer icon on the right side of the toolbar.
- support.google.com/docs/answer/190843 (Find what's changed in a file): the "Last edit" button at the top right opens version history.
- support.google.com/a/users/answer/9300133 (Google Slides cheat sheet): the toolbar callouts select an item, add a text box, image, shape or line, change fill, change border color, weight or style, add links or comments, add numbers or bullets.
- workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html (2025-03-31): a sidebar on the right of the canvas with Building blocks, Stock images, Templates, image generation, Speaker spotlight and Slides recordings.
- support.google.com/docs/answer/2763168 (How to use Google Slides) names no editor controls beyond New and Share; it adds nothing to the counts.

## Not read

- The side panels (Format options, Brand kit, Comments, Version history, Assist, Check slides, Diagram) were not opened; their controls are not counted.
- The right click menus were counted from the model alone; none was opened in a browser.
- Submenus were counted from the model; the browser read the level 0 rows of each menu alone.
- The text tail state in the inventory run read `textSelected: null` (the click on the Title and body slide's text block selected nothing); the text tail was read in the separate first write run instead.
- Google Slides was not opened; no account was signed in. Google's per selection toolbars, its right click menus and its home page were not counted from today's pages.
- Whether the three parked set entries without a literal reader are composed at run time by a template string was not settled; a literal search found none.
- The dark theme screenshots show the stage surround staying light while the chrome is dark (`clutter/editor-default-dark-prod.png`); this note does not judge it and leaves it to the brand lane.
