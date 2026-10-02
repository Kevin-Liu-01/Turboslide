# Brand surfaces audit

The brand-surfaces auditor of the next program, written on 2026-10-01 (Pacific time). The audit compares every brand surface of Turboslide on production and in the tree at `next/program` (94e8a5c3) with the GT brand deck in Prototemplate at b20f065. Each divergence names the deck rule it breaks, the file and line that draws it, and the picture under `brand-surfaces/`. The list is ranked by how visible the divergence is to a seller who opens the product.

## How the evidence was taken

- Production is https://www.turboslide.com. Every production picture was taken between 2026-10-02T01:36Z and 01:57Z (2026-10-01 18:36 to 18:57 PDT) with Playwright 1.62.1 (Chromium 151) at 1440 by 900 and 390 by 844, light and dark, with `gt-theme` set before load. The scripts are in `brand-surfaces/raw/scripts/`, and their logs are `raw/static-log-*.json`, `raw/editor-log.jsonl` and `raw/extra-log.jsonl`.
- The machine was loaded. `uptime` read 44.65 at 18:35, 60.23 at 18:38, 33.00 at 18:42, 20.76 at 18:51, 57.29 at 18:59 and 189.73 at 19:03 PDT. No timing in this note is a performance claim.
- The deck. The first write on `/new` created the deck `untitled-20261002-77a7` at 01:45:09Z. It was trashed and removed by id at 01:52:43Z through `deck.info`, `deck.trash` and `deck.remove` with the agent bearer. `deck.info` then answered 404 "No deck untitled-20261002-77a7 in the Blob store" (`raw/deck-removal.txt`). The second pass ran on the `/new` draft and wrote nothing, because the address stayed `/new` in every context (`raw/extra-log.jsonl`).
- The Sign in dialog cannot be reached on production. The account menu there offers Change name, Change avatar and Forget this browser (`raw/editor-log.jsonl`). It was shot once on a local dev server on port 4491 (`TURBOSLIDE_STORE=tmp`, a SQLite accounts file in `.turboslide/brand-overlay`). The server was stopped and the overlay was removed before this note was written. These pictures are named `local-*`.
- The pages were fetched with curl at 2026-10-02T01:36:28Z: `/home`, `/manifest.webmanifest`, `/icon.svg`, `/favicon.ico`, `/apple-touch-icon.png` and `/og/turboslide.png` (all 200), and an unknown path (404). The HTML and assets are in `raw/`.

## The deck rules used

- `Prototemplate/deck/DECK-GRAMMAR.md` line 14 covers the rails and crosses, and lines 20 to 24 cover type. Line 22 puts Title Case on buttons only and line 23 sets the copy register. Lines 28 to 31 cover color: no accent on text, lines or fills, and monospace only on the `#101010` code panel. Line 39 says lists are ruled rows and line 40 says icons are Heroicons 20 solid, used in key cells only. Lines 50 to 53 cover the speed marks, and line 66 lists the defects, comma-tail headings among them.
- `deck/slides/39-avoid.html` line 12 says "Robot and sparkle iconography is not used to represent AI".
- `deck/slides/33-diagrams.html` line 26 says "Arrowheads are never drawn". Line 28 uses the doubled connector for links and a single 1 px line for flows. The labels are 20 px.
- `deck/slides/26-color.html` line 12 sets the accent: `#2f5ce0` on light and `#86a8ff` on dark.
- `Prototemplate/DESIGN.md` line 59 says the row owns every structural line. Line 177 gives the page one rail on each side, drawn once by the column (line 179). Lines 422 to 436 allow five chrome exceptions, and the only 8 px corner among them is Present, with its label first and the play glyph after it (line 430).
- `Prototemplate/.agents/skills/gt-docs-visual-tokens/SKILL.md` lines 32 to 37 set two tiers of icons and allow 6 to 8 px radii. Brand marks are their own class.

## Ranked divergences

| Rank | Surface | Divergence | Rule | Source | Picture |
| ---- | ------- | ---------- | ---- | ------ | ------- |
| 1 | `/decks` | A fresh anonymous visitor sees 147 cards (2026-10-02T01:54:49Z). They include 59 "Untitled presentation", 7 "Name prompt deck", 7 copies of "GT brand deck", 4 "Fixture deck", "Cost probe cost.redis.commands" and "Perf audit scratch". On a phone, the first card is a probe whose slide reads "dkgookgook". | Clutter. The caption "Every presentation on this Turboslide is listed here" has no final period (DECK-GRAMMAR 23). The cards are boxes (DECK-GRAMMAR 39). | `apps/studio/src/server/decks.ts` 264 to 273 (`listDecks` returns every deck the store holds), `apps/studio/src/routes/decks.index.tsx` 869, `packages/chrome/src/menus/strings.ts` 964 | `decks-1440-light.png`, `decks-1440-dark.png`, `decks-390-light.png`, `decks-*-full.png` |
| 2 | Every new presentation | The blank template draws the GT monogram above the title. Every slide's footer draws the GT wordmark. The Brand kit's "Use the default logo" is the GT mark. | The GT mark appears only where it has a function (slide 16). Turboslide's own rule is that the identity never draws on the customer's slide (`docs/brand.md` 254). | `decks/templates/blank/deck.json` 5 (`"theme": "gt-ink-paper"`), `decks/templates/blank/slides/title.json` (`"mark"`), `packages/render/src/stage.ts` 26 to 28 and 91 to 92 (`GT_BAND` for a deck without a record) | `editor-1440-light.png`, `panel-themes-1440-dark.png` |
| 3 | Editor title row, 390 px | The row is 491 px wide in a 390 px viewport. The deck name is 18 px wide and shows "U". Share ends at x 479 and Slideshow is cut (`raw/extra-log.jsonl`, overflow390). | Text must not leave the sheet (DECK-GRAMMAR 66, overflow). | `packages/chrome/src/TitleRow.css` 93 to 96 (`.ts-title-name` with `min-width: 0`) and 15 to 26 (`overflow: hidden`). No rule exists under 900 px apart from 286 to 300. | `editor-390-light.png`, `dialog-share-390-light.png` |
| 4 | Editor title row after the first edit, 1440 px | The floating name plate takes the middle of the row and the deck name collapses to "U". | Same as rank 3. | `packages/chrome/src/TitleRow.css` 491 to 530 (the plate), 93 to 96 (the name) | `name-prompt-collision-1440-light-zoom.png` |
| 5 | Slide appearance in dark chrome | The editor stage draws the slide white on a white workspace. The filmstrip, the presenter view and the `/deck` view draw the same slide on black. The Brand kit shows Light selected. | What the seller edits should be what the audience sees. Dark mode is a token remap (DECK-GRAMMAR 28). | `packages/chrome/src/tokens.css` 18 to 24 (the stage wrap takes the sheet's appearance). The cause on the other surfaces was not read (open item 2). | `editor-1440-dark.png`, `present-1440-dark.png`, `view-1440-dark.png`, `panel-themes-1440-dark.png` |
| 6 | Title row Assist, palette, tool finder | Sparkles mark the AI feature. | 39-avoid line 12 | `packages/chrome/src/TitleRow.tsx` 544, `Palette.tsx` 260 and 268, `palette-data.ts` 731 and 760, `ToolFinder.tsx` 145, `inspector/dither.tsx` 412 | `editor-title-right-1440-light-zoom.png` |
| 7 | Shared links (OG) | On `/home` and on a deck, `og:image` and `twitter:image` are `https://turboslide-gt.vercel.app/og/turboslide.png`. The `og:url` of `/home` is `https://turboslide-gt.vercel.app/home`. A deck's `og:title` is "Turboslide" with no `og:url`, so a shared deck unfurls as the product card without its name. | The brand domain is www.turboslide.com (`packages/theme/brand/site.ts` 91). | `apps/studio/src/routes/__root.tsx` 98, `apps/studio/src/routes/home.tsx` 43, `apps/studio/src/routes/deck.$deckId.tsx` 152 to 157 (title only). `docs/brand.md` 195 says the deck route sets `og:title` and `og:url`. | `raw/home.html`, `raw/deck-view.html` |
| 8 | The card | The address "www.turboslide.com" is set in monospace. | DECK-GRAMMAR 31 (monospace only on the code panel). 39-avoid says monospace is not the brand typeface. | `packages/theme/brand/og-template.html` 88 and 98 | `raw/og-turboslide.png` |
| 9 | `/home` structure | The page has no column rails and no registration crosses. Section rules run full bleed. | DESIGN.md 177 and 179, DECK-GRAMMAR 14 | `apps/studio/src/routes/home.css` 34 to 41 (the rail is padding only), 225 and 290 (section rules) | `home-1440-light-full.png` |
| 10 | `/home` headings | A 20 px icon stands before every section heading. | DECK-GRAMMAR 40 (an icon sits only in a key cell or at the start of a `.plain` row) | `apps/studio/src/components/home/HomeSection.tsx` 38, `SectionIcon.tsx` | `home-1440-light-full.png` |
| 11 | `/home` diagrams | The flows end in chevron arrowheads and the labels are 13 px. | 33-diagrams 26 (no arrowheads) and labels of 20 px. Single 1 px flow lines match the rule. | `apps/studio/src/components/home/diagrams/Agents.tsx` 34 and 50, `Export.tsx` 33 and 35, `Present.tsx` 61 and 67, `apps/studio/src/routes/home.css` 337 to 340 | `home-1440-light-full.png` |
| 12 | `/home` code | The CLI command sits on the light plate in ink monospace. | DECK-GRAMMAR 31 (white monospace on `#101010`) | `apps/studio/src/routes/home.css` 117 to 129 | `home-1440-light-full.png` |
| 13 | `/home` canvas picture | The capture shows the blue selection ring, a blue "Image" chip and a blue handle. | DECK-GRAMMAR 29 (no accent on lines or fills). `docs/brand.md` 292 says `/home` stays paper and ink. | `apps/studio/src/components/home/HomeCanvas.tsx` 13, `shots.json` (captured 2026-09-29T02:23:22Z from 14612488) | `home-1440-light-full.png` |
| 14 | `/home` at 390 px | The navigation loses its gutter, so the mark sits at x 0 and New Presentation ends at x 390. | Overflow into the margin (DECK-GRAMMAR 66) | `apps/studio/src/routes/home.css` 398 (`padding: 6px 0` overrides the rail's `padding: 0 20px` at 391; both are one class and the later rule wins) | `home-390-light.png`, `home-390-nav-gutter-zoom.png` |
| 15 | `/home` copy | The title "Turboslide, a slides editor in the browser" is a comma-tail. The page uses "licence" and "Licence" while the deck writes American English ("Color"). | DECK-GRAMMAR 66 (comma-tail headings) | `apps/studio/src/components/home/home-meta.ts` 13, `copy.ts` 209 and 231 | `raw/home.html` |
| 16 | Selection color | The one blue in the product is Google's `#1a73e8` (dark `#3d86f0`), and the brand accent is not used. | 26-color 12 (accent `#2f5ce0`, `#86a8ff`) | `packages/chrome/src/tokens.css` 103 and 174, `packages/theme/src/brand.ts` 321 to 323 | `home-1440-light-full.png` |
| 17 | `/deck` view route | The sidebar head draws the GT monogram beside the word Turboslide. | `docs/brand.md` 134 to 138 (the GT mark leaves the app chrome). Slide 16 (one mark). | `packages/chrome/src/Sidebar.tsx` 1038 and 1042. Also, from the tree only: `Toolbar.tsx` 530 and `Filmstrip.tsx` 1105 and 1109. | `view-1440-light.png` |
| 18 | Buttons across surfaces | Casing is mixed. `/home` uses Title Case ("New Presentation", "Open the Example Deck"). Not found and You need access use sentence case ("New presentation", "Your presentations", "About Turboslide"). The error page uses "Your Presentations". Dialogs use sentence case ("Copy link", "Name this version", "Use a passkey"). Corners are mixed as well: the `/home` solid button is square, while every `.pt-ib.is-solid` (Done, Continue, the access page) is 8 px and Share is 8 px. Slideshow puts the glyph before the label, and the view route's Present puts it after. | DECK-GRAMMAR 22 and 23 (Title Case on buttons). DESIGN.md 430 (8 px for Present only, label first). The docs skill allows 6 to 8 px. | `apps/studio/src/routes/__root.tsx` 178 to 220, `packages/chrome/src/YouNeedAccess.tsx` 44 and 45, `apps/studio/src/routes/-refused-page.tsx` 34, `packages/chrome/src/ToolButton.css` 32 to 37, `TitleRow.css` 217, 230 and 277 | `notfound-1440-light.png`, `access-1440-light.png`, `dialog-share-1440-light.png`, `editor-title-right-1440-light-zoom.png` |
| 19 | Presenter view, 390 px | "No slideshow window is open" is drawn over Pause and Reset in the head. | Text crossing text (DECK-GRAMMAR 66) | `packages/viewer/src/present/PresenterConsole.css` 354 to 372 (the narrow head keeps both groups on one row) | `present-390-light.png`, `present-390-dark.png` |
| 20 | You need access | The page tells the reader to sign in, and production has no sign in method. The sentence has no final period. There is no lockup. | DECK-GRAMMAR 23 (full sentences) | `apps/studio/src/routes/-access-page.tsx` 80 | `access-1440-light.png`, `access-390-dark.png` |
| 21 | Share dialog | The dialog opens with a name prompt the reader did not ask for. The prompt, the owner row and More each sit in a frame. "General access" is a label above the field. | DECK-GRAMMAR 39 (rows, not boxes) | `packages/chrome/src/dialogs/share.css` 100 to 105 and 434 to 436, `dialogs/Share.tsx` 548 | `dialog-share-1440-light.png`, `dialog-share-1440-dark.png` |
| 22 | Version history | The rule under "Only show named versions" stops at the button, so the seam is missing on the right. The time reads "Oct 1, 06:45 PM". | DESIGN.md 59 (the row owns the line) | `packages/chrome/src/VersionsPanel.css` 160 (the label draws the rule) and 222 to 228 (the row that holds the button) | `panel-versions-1440-light.png`, `panel-versions-seam-1440-light-zoom.png` |
| 23 | Sign in dialog (local) | A dead "Use a passkey" row reads "Passkeys arrive once the address is final". This is internal roadmap copy shown to readers. Continue is 8 px and grey. | Copy register (DECK-GRAMMAR 23) | `packages/chrome/src/menus/strings.ts` 233 and 234 | `local-dialog-signin-1440-light.png` |
| 24 | Sign in on the realtime branch | "Continue with Google" is drawn as a solid ink button with no Google G (`git -C Turboslide-realtime diff origin/main...HEAD -- packages/chrome/src/dialogs/accounts.css`, `.ts-sign-in-method.is-primary`). Google's branding page, fetched at 2026-10-02T02:03Z, says the button "must always include the standard color for the Google 'G'" and allows the fills `#FFFFFF`, `#131314` and `#F2F2F2`. | The brand-mark class of the docs skill (lines 36 and 37) allows the G. | `packages/chrome/src/dialogs/SignIn.tsx` and `accounts.css` on `realtime/round` | Not shot (the branch was read only) |
| 25 | Theme button | The toolbar button reads "Theme" and opens a panel titled "Brand kit". | One name per thing (copy register) | `packages/chrome/src/menus/model.ts` 3091, `menus/strings.ts` 814 | `panel-themes-1440-dark.png` |
| 26 | README head | Line 8 is a single paragraph of about 400 words. It names https://turboslide.vercel.app as the hosted studio and says the move "has not run yet". Lines 43 to 60 list several hundred row ids marked broken or flaky on the first screen of the GitHub page. The GitHub homepage field is https://turboslide.vercel.app and the description uses "behaviours" (`gh repo view`, 2026-10-02T01:57:49Z). | Copy register. The domain is www (site.ts 91). | `README.md` 8, 16 and 43 to 60 | Not shot (GitHub) |
| 27 | CLI banner | `turboslide --version` prints "Turboslide 0.0.0". The address and the mark are correct. | The mark works at banner size (25-compression) | `apps/cli/package.json` 3, `apps/cli/src/commands/banner.ts` 59 | Terminal output in this note |
| 28 | `docs/brand.md` | Several claims have drifted from the tree. Line 195 says the deck route sets `og:title` and `og:url`. Line 243 describes the dither twin hero, and `/home` now shows the editor capture. Line 292 says `/home` stays paper and ink. Line 315 gives the banner's address as turboslide.vercel.app. Line 374 says dark is the stored default, while `__root.tsx` 66 follows the OS and falls back to light. Lines 459 to 463 point at turboslide.vercel.app. | The record should match the product. | `docs/brand.md` lines as listed | none |
| 29 | Manifest | `background_color` and `theme_color` are `#070707`, while the first visit opens in the OS appearance. The installed app shows an ink splash and then a light page. | Dark mode is a token remap (DECK-GRAMMAR 28) | `packages/theme/brand/site.ts` 114 and 115, `__root.tsx` 66 | `raw/manifest.webmanifest` |
| 30 | Tokens | Light titanium is `#6f747d` against the deck's `#8a8f98`, and the plate is ink at 0.06 against the deck's 0.035. Both changes were made for WCAG and carry reasons in the file. | DECK-GRAMMAR 28 | `packages/chrome/src/tokens.css` 32 and 55 | none |

The CLI banner, read on 2026-10-01 from this worktree with `node apps/cli/bin/turboslide.mjs --version`:

```
████████  Turboslide 0.0.0
████████  https://www.turboslide.com
█    ███  193 actions, effects backend: wasm
█▄▄▄▄███  checkout /Users/kevinliu/repos/Turboslide-next
```

## Surfaces that hold to the deck

- The sheet draws the deck's rails, registration crosses, counter and wordmark band (`editor-1440-light.png`).
- The chrome is Inter only. The headings on `/home` use weight 500.
- The chrome icons are Heroicons 20 solid (`packages/chrome/src/icons.tsx` 1 to 30).
- The menus, the snackbar and the context menu are square plates on the hair role (`menu-file-1440-light.png`, `snackbar-1440-dark.png`, `menu-context-1440-light.png`).
- The mark, the tile, the touch icon and the favicon are one color on paper or ink. `icon.svg` swaps under `prefers-color-scheme` (`raw/icon.svg`, `raw/apple-touch-icon.png`).
- Production copy has no em dashes and no exclamation marks. A scan of `/home` and a deck page found 0 of each.
- The 404 keeps the dithered figure and the sentence register (`notfound-1440-light.png`).

## Proposals

Each proposal gives the change, where it goes and the expected gain.

1. `/decks` should list only the decks the viewer owns or holds a grant on, and change its caption to a full sentence ("Your presentations and the ones shared with you."). This goes in `apps/studio/src/server/decks.ts` `listDecks` and `decks.index.tsx` 869. The 147 strangers' and probe cards leave the seller's first page, and restricted titles stop showing to anonymous visitors.
2. The blank template should ship with no logo and a band with no wordmark, keeping `GT_BAND` for the GT template alone. This goes in `decks/templates/blank/deck.json` 5, `slides/title.json` and `packages/render/src/stage.ts` 91. A seller's new deck carries no third party mark.
3. Under 480 px, the deck name should keep a 96 px minimum. Assist, the roster and the inbox should move into an overflow menu. The name plate should float under the row instead of inside it. This goes in `packages/chrome/src/TitleRow.css` 93 and 491. The name, Slideshow and Share stay visible on a phone and after the first edit.
4. Every surface should render a slide in one appearance: the editor stage, the filmstrip, the presenter view and the `/deck` view. The audience then sees the slide the seller edited.
5. The sparkles should be replaced with a non-AI glyph or with the word alone, at the six sites of rank 6. This removes an avoid-list item from the most visible row.
6. Kevin should set `TURBOSLIDE_PUBLIC_ORIGIN=https://www.turboslide.com` on turboslide-gt, which is a setting outside this workflow. The deck route should add `og:title` (the deck's title), `og:url` and `og:description`. The card's address should be set in Inter. This goes in `apps/studio/src/routes/deck.$deckId.tsx` 152 and `packages/theme/brand/og-template.html` 88. Links then unfurl on the brand domain with the deck's name.
7. A grammar pass on `/home`:
   - Draw the column rails at the 1120 px rail with crosses where the section rules meet them.
   - Move the section icons out of the headings.
   - Draw the diagrams without arrowheads and with 11 px square markers.
   - Set the diagram labels at 18 to 20 px.
   - Put the command on the `#101010` panel in white monospace.
   - Fix the 390 px gutter at `home.css` 398.
   - Use a title without a comma tail and American spelling.

   The product page then reads as the deck does.
8. The selection color should become `#2f5ce0` in both appearances, or `#2f5ce0` on light and `#4a78f0` on dark. This goes in `tokens.css` 103 and 174 and `brand.ts` 321. The WCAG formula, computed today, gives `#2f5ce0` 5.63:1 on `#ffffff` and 3.58:1 on `#070707`, and `#4a78f0` 4.01:1 and 5.02:1. Both hold the 3:1 non-text floor that `docs/brand.md` section 10 requires, and GT and Turboslide then share one blue.
9. `GtMark` should become `TurboslideMark` in `Sidebar.tsx` 1038 and 1042 and in the `Toolbar.tsx` and `Filmstrip.tsx` uses. Each surface then carries one mark.
10. One button rule: Title Case on button labels, one corner decided once (0 px, or 8 px for everything solid), and the label before the glyph on Slideshow. This goes in `ToolButton.css` 32, `TitleRow.css` 230 and 277, `__root.tsx` 178, `YouNeedAccess.tsx` 44, `-refused-page.tsx` 34 and the dialog strings in `menus/strings.ts`. The buttons then read the same on every surface.
11. The narrow presenter head should wrap the status line onto its own row, in `PresenterConsole.css` 365. The text collision at 390 px goes away.
12. The access page should drop the sign in sentence while no method exists (the page already reads `authorize`), end its sentences with periods and carry the lockup. This goes in `-access-page.tsx` 80.
13. The Share dialog should draw ruled rows instead of framed boxes and leave the name prompt to the title row plate. This goes in `share.css` 100 and 434 and `Share.tsx` 548.
14. Version history should draw the tools row's rule from `.ts-versions-tools` and write "6:45 PM". This goes in `VersionsPanel.css` 160 and 222.
15. The passkey row should be removed until passkeys exist (`strings.ts` 233). On `realtime/round`, Continue with Google should be drawn in Google's light or dark theme with the standard G as an inline brand mark (thesvg). Auth then reads as finished and meets Google's guideline.
16. The button and the panel should use one word: Theme, or Brand kit in both places.
17. The README head should be the lockup, three sentences and the www link. The row ledger should move to `docs/`. Kevin's action: set the GitHub homepage to www. The GitHub page then reads as a product page.
18. The CLI version should be stamped from the release, so the banner stops reading 0.0.0.
19. `docs/brand.md` should be brought up to date at the lines of rank 28, with a section that maps the 2026-10-01 deck to Turboslide.
20. Kevin's call: whether Turboslide gets a mark in the race-type register of the speed set (`Prototemplate/scripts/build-speed-marks.mjs`, DECK-GRAMMAR 50 to 53). The current mark (`packages/theme/src/brand.ts` 55 onward) predates that set.

## Open

1. The source of the `turboslide-gt.vercel.app` origin in production's `og:image` and `og:url` was not settled. `/home` is prerendered at build, and `site.ts` 98 reads `TURBOSLIDE_PUBLIC_ORIGIN` before falling back to www. It may be a variable on turboslide-gt or a build behind main. The project's variables were not read.
2. The cause of the slide appearance split in rank 5 was not traced past `tokens.css` 18 to 24.
3. Two conventions were not reconciled: the deck's square corners (DECK-GRAMMAR 39, DESIGN.md 422 to 436) and the docs skill's 6 to 8 px radii. Kevin decides which one governs Turboslide's chrome.
4. Whether `/decks` listing every deck is intended. The caption says so on purpose, so this is a product decision.
5. Whether the speed marks apply to Turboslide (proposal 20).
6. Whether the titanium and plate token changes (rank 30) are accepted.

## Not read

- The Profile dialog needs a signed-in account, and there is none on production or in this run.
- The fullscreen slideshow layer. `/present/<id>` opened the presenter console, and moving the pointer did not bring up a toolbar (`present-bar-*.png` match `present-*.png`).
- Production banners (outside revision, offline). The only banner seen was the local tmp store banner in `local-dialog-signin-1440-light.png`, which production does not draw.
- The Vercel and Cloudflare settings and the Google console. All were outside this workflow.
- The Sign in dialog on production. No method is configured there.
