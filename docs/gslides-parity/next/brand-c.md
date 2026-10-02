# Brand direction C: the round four mark on the deck grammar

Written by brand designer C of the next/program workflow on 2026-10-01 between 19:31 and 20:10 PDT.

- Tree: `/Users/kevinliu/repos/Turboslide-next` on `next/program` at 94e8a5c3. A path that starts with `T:` is in this tree.
- Brand source: `/Users/kevinliu/repos/Prototemplate` on `speed-marks` at 58af25b (2026-10-01 19:16:10 -0700). A path that starts with `P:` is there. This is one commit after the b20f065 that the two brand audits read. 58af25b recut the gloss picture. The field twins below read the recut grid (`P:public/brand/mood/mood-gloss.jpg`, written 19:12).
- Realtime branch: `/Users/kevinliu/repos/Turboslide-realtime` on `realtime/round` at 8fdb0c4f, read with `git show` only. A path that starts with `R:` is on that branch.
- Machine load (uptime): 48.00, 44.82 and 65.17 at 19:31. It was 34.15, 39.46 and 42.77 at 19:56, and 111.15, 104.53 and 73.48 at 20:02. No number in this note is a timing.

## The direction

Direction C makes the fewest changes. The product mark stays the round four mark: a slide with a plate cut from it, drawn through the 8 by 8 Bayer screen. Its geometry in `T:packages/theme/src/brand.ts` lines 55 to 285 does not change. The rebuilt files match the tree's: the solid path equals `T:packages/theme/brand/mark-small.svg`, the 16 px tile path equals `T:packages/theme/brand/icon-tile.svg`, and the 180 px touch icon decodes with 0 of 97,200 bytes different from `T:apps/studio/public/apple-touch-icon.png`. Everything around the mark moves onto the deck grammar of 2026-10-01:

- the column with one rail on each side and crosses at its seams
- the site type ladder and its tracking
- ruled rows in place of the cards on /decks
- Heroicons only in key cells, and no sparkle for Assist
- Title Case on buttons and sentence case everywhere else
- dark mode as a token remap that leaves the customer's slide in its own appearance
- the gloss and dictionary pictures of the GT sign in plate, screened as dither fields on /home and in Sign in
- a Sign in dialog drawn as that plate, with Google's own button

Under C, Turboslide does not join the GT speed register, and `T:docs/brand.md` line 67 stands. The one blue in the product becomes the GT accent `#2f5ce0`.

## What was read

- `docs/gslides-parity/next/audit-brand-source.md` (346 lines), `audit-brand-surfaces.md` (125 lines) and `audit-clutter.md` (156 lines), all in full.
- `T:docs/brand.md` (540 lines) in full. `T:packages/theme/src/brand.ts` lines 1 to 324 in full.
- `T:packages/chrome/src/tokens.css` lines 1 to 230 and `T:packages/chrome/src/brand.css` lines 1 to 200.
- Extracted from the tree: the icon table of `T:packages/chrome/src/icons.tsx` (lines 216 to 1122), the GT mark of `T:packages/theme/src/sprite.ts` (line 12) and the word outline of `T:packages/theme/brand/wordmark-outlines.svg`.
- `T:apps/studio/src/components/home/copy.ts` (lines 1 to 260) and `T:packages/theme/brand/site.ts` (lines 1 to 40, plus the lines grepped below). Also `T:packages/theme/brand/facts.json` lines 1 to 60, the `T:packages/chrome/src/menus/strings.ts` HOME and ACCOUNT blocks, the toolbar entries of `T:packages/chrome/src/menus/model.ts` (lines 2925 to 3115) and the lines of `TitleRow.css`, `home.css`, `ToolButton.css` and `BookView.css` cited below.
- `R:packages/chrome/src/dialogs/SignIn.tsx` (lines 1 to 260), `R:packages/chrome/src/dialogs/accounts.css` (lines 1 to 200) and `R:docs/REALTIME.md` section 4.
- `P:deck/DECK-GRAMMAR.md` (66 lines) and `P:deck/parts/head.html` lines 1 to 260. Slides 14, 29, 39 and 49 in full, apart from inline path data.
- From `P:DESIGN.md`: lines 20 to 30, 174 to 190, 248 to 262 and 419 to 436.
- `P:src/components/plate/frame/PlateFrame.tsx`, `brand/FieldMoodPlate.tsx` and `brand/moodPictures.ts` in full. `plate.css` lines 1 to 140 and its `--plate-*` and `--field-*` lines. `frame/PlateRoot.tsx` and the head of `brand/FieldStack.tsx` (lines 1 to 80).
- The GT dashboard's sign in plate as rendered in `P:.pagecheck/shots/production-signin-1440x900-light.png` and `production-signin-430x932-dark.png`.
- The production pictures under `docs/gslides-parity/next/brand-surfaces/`: editor, home, decks, local Sign in and editor at 390.
- Google's sign in branding page, https://developers.google.com/identity/branding-guidelines, fetched twice on 2026-10-01 at about 19:36 PDT.

## What was made

Everything below is under `docs/gslides-parity/next/brand-c/`.

- `marks/` holds the mark set as one-colour SVG in `currentColor`: `turboslide-mark.svg` (the solid form), `turboslide-mark-cells-32.svg` (610 lit cells) and `turboslide-mark-cells-64.svg` (2,400 lit cells). It also holds `turboslide-lockup.svg` and `turboslide-lockup-stacked.svg`, both with the word as Inter outlines, and `turboslide-mark-blocks.txt`.
- `marks/` also holds the tiles `favicon-16.svg`, `favicon-32.svg` and `apple-touch-icon-180.svg`, with PNGs rendered from those SVGs by Playwright. `favicon-16.png` decodes to three colours: `#ffffff` 76 px, `#070707` 120 px and the frame `#656565` 60 px. `favicon-32.png` decodes to three colours. `apple-touch-icon-180.png` decodes to two colours, `#070707` and `#f2f2f0`.
- `tools/build-marks.mjs` writes `marks/` from `T:packages/theme/src/brand.ts`. `tools/build-fields.mjs` writes the field twins. `tools/extract-icons.mjs` and `tools/build-mock-data.mjs` copy the tree's glyphs and marks into `mock/data.js`.
- `mock/` holds five static pages: `home.html`, `decks.html`, `editor.html`, `signin.html` and `marks.html`. Each page loads the tree's `tokens.css` and `brand.css` through relative paths. `c-tokens.css` lays the token changes of C over them. Type is the tree's `T:packages/fonts/assets/InterVariable.woff2`. Open any page with `?theme=dark` for the dark appearance.
- `mock/assets/field-*.png` holds the field twins. Each is two colours at 2 px cells, in both appearances: `home-wide` is 720 by 720 px (8,132 bytes), `home-band` is 1024 by 184 px (3,008 bytes), `signin-wide` is 360 by 480 px (2,435 bytes) and `signin-band` is 800 by 176 px (900 bytes).
- `shoot.mjs` renders every page at 1440 by 900 and 390 by 844 in both themes. It uses device scale factor 1, `playwright-core` 1.62.1 from the worktree and file:// pages with no server. The last run reported no horizontal overflow and no page error.

## Rules C adds or changes against the deck

None of these rules adds an item from the avoid list of `P:deck/slides/39-avoid.html` lines 9 to 17 or breaks the copy register of `P:deck/DECK-GRAMMAR.md` lines 22 and 23. Three of them are narrower than the deck and are named as risks below: rule 10 (the selection blue), rule 12 (Google's typeface inside Google's button) and rule 11's plate titles.

1. **One product mark.** Turboslide's own surfaces carry the Turboslide mark and nothing else. The GT mark stays content of the `gt-ink-paper` theme and of the GT template card (`T:docs/brand.md` 134 to 139). It leaves three more places: the `/deck` sidebar head (`T:packages/chrome/src/Sidebar.tsx` 1038 and 1042), the blank template (`T:decks/templates/blank/deck.json` 5 and `slides/title.json`), and the wordmark band of a deck without a record (`T:packages/render/src/stage.ts` 91 to 92). The editor mockup's slide therefore has rails, crosses and the counter, but no mark and no wordmark. Deck basis: slide 16 shows one mark wherever it has a function (audit-brand-source 11.2).
2. **The mark files follow the speed set's file rule.** Each file is one colour in `currentColor`, plain geometry with no mask and no id, generated from one module and never drawn by hand (`P:src/lib/marks.ts` 94 to 104; `P:deck/DECK-GRAMMAR.md` 52 to 53). The only change from the tree is that the stacked lockup sets the word as Inter outlines. The tree's `T:packages/theme/brand/lockup-stacked.svg` sets it as live text, which fails where Inter is not loaded. The speed lockup already outlines its name (audit-brand-source line 258).
3. **One rail.** /home, /decks, Not found and the trash draw their column at 1104 px, with one hairline rail at each edge drawn once by the column. Horizontal seams run full bleed. A 9 px cross with 1 px arms sits where a seam meets a rail. A hatch strip of 45 degree hairlines every 8 px separates rows where the topic changes. The navigation bar is 58 px tall. The layout has one breakpoint, at 1023 px. Sources: `P:deck/slides/49-shell-numbers.html` 24 to 29 and `P:DESIGN.md` 177 to 188. These are changes in the tree: `--ts-rail` is 1120px today (`T:packages/chrome/src/brand.css` 30), and /home draws the rail as padding only (`T:apps/studio/src/routes/home.css` 34 to 41).
4. **The site ladder.** The hero is 3.7rem at -0.038em, and 2.5rem under 720 px. Heading is 2.25rem/1.18, subheading 1.375rem/1.3, title 1.125rem/1.35, lead 17px/1.55, body 16px/1.6, small 14px/1.55 and label 13px (`P:deck/slides/29-ladder.html` 17 to 24). Display text uses weight 500 with `cv11` and `ss01` and `text-wrap: balance` (`P:deck/parts/head.html` 58). The editor chrome keeps 13 px (head.html 209 to 236). This changes `T:packages/chrome/src/brand.css` 20 to 28, which sets 56, 32, 20, 20, 15 and 13 px today, and its narrow block at 760 px (36 to 43).
5. **Ruled rows.** Recent presentations on /decks opens as a list. Each row holds a thumbnail in a `--pt-edge` frame, the name, the owner, the last opened date and a More key, and each row owns its line in `--pt-hair-soft`. The /home facts are a key and value list. Sources: DECK-GRAMMAR 36, 39 and 40; `P:DESIGN.md` 59. A picture takes a frame and a list row does not (head.html 217).
6. **Icons.** The chrome uses Heroicons 20 solid at 16 px from `T:packages/chrome/src/icons.tsx`. On a page, an icon sits in a key cell and never before a heading (DECK-GRAMMAR 40). Assist is the word alone (slide 39 line 12). This changes `T:apps/studio/src/components/home/HomeSection.tsx` 38 and the sparkle sites of audit-brand-surfaces rank 6, among them `T:packages/chrome/src/TitleRow.tsx` 544.
7. **Copy.** Title Case is for buttons only, on every surface: New Presentation, Open the Example Deck, Share, Slideshow and Continue with Google (DECK-GRAMMAR 22). Menu rows, links, tooltips, headings and captions stay in sentence case. C adds one rule for the chrome: the title row shows one status phrase, for example "Last edit 2 minutes ago", and the save state shows only while it differs from saved. This follows audit-clutter, "Wrong or misleading state". Spelling is American ("license", "color"), as the deck writes it.
8. **Corners.** Chrome is square apart from named exceptions:
   - `--pt-radius` (6 px) on the search field, the segmented control and the sort field (`T:packages/chrome/src/tokens.css` 106 to 114)
   - 8 px on Slideshow alone, with the label first and the glyph after (`P:DESIGN.md` 430)
   - Google's rectangular shape on Google's button

   Share (`T:packages/chrome/src/TitleRow.css` 273 to 277), `.pt-ib.is-solid` (`T:packages/chrome/src/ToolButton.css` 32 to 37) and the name plate (TitleRow.css 491 to 500) move to 0. This settles open item 3 of audit-brand-surfaces for C: the deck's square corners govern. The GT plate's own 6 px fields stay in the plate.
9. **Dark mode as a token remap.** Dark mode remaps the chrome's tokens. The customer's slide keeps the appearance its deck sets, on every surface. The workspace around the sheet reads the chrome's `--pt-plate`. Today `T:packages/chrome/src/tokens.css` 22 to 24 and 152 to 154 apply the sheet's appearance to `.ts-stagewrap`, which turns the workspace white in dark chrome (audit-brand-surfaces rank 5). C keeps that scope on `.ts-overlay` only. The field twins use the same bits in each appearance's paper and ink (DECK-GRAMMAR 28 and 62; `P:deck/ROUND-5.md` 11). The editor pictures show a light slide on the dark workspace.
10. **One blue.** `--pt-select` becomes `#2f5ce0` in both appearances, and the selection chip's text becomes `#ffffff` in both. `#2f5ce0` is the GT accent, used on a small active element (`P:DESIGN.md` 23 to 25). Ratios were computed today with `contrastRatio` from `T:packages/theme/src/brand.ts`:
    - `#2f5ce0` is 5.63:1 on `#ffffff` and 3.58:1 on `#070707`. Both pass the 3:1 of WCAG 2.2 SC 1.4.11 that `T:docs/brand.md` 296 to 299 asks of the ring.
    - White on `#2f5ce0` is 5.63:1.
    - The dark lift `#86a8ff` is 2.32:1 on `#ffffff`, so a ring on a white slide would fail in dark chrome. C does not use it.

    The guide colours stay (`#d6336c`, `#f0397a`). Today's values are `#1a73e8` and `#3d86f0` (`T:packages/chrome/src/tokens.css` 103 and 174; `T:packages/theme/src/brand.ts` 321 to 324). The ring is drawn only in the editor's overlay and never in a deck, an export, a capture or a card. The mockups show no selection.
11. **The dither field and the mood pictures on /home and in Sign in.**
    - Source: the tone grids of the GT sign in plate (`P:public/brand/mood`, 8 bit grey, 1600 by 900, cut by the dashboard's `mood-tone.mjs` per `P:src/components/plate/brand/moodPictures.ts` 57 to 60).
    - Screen: 2 px cells (`--ts-cell`) through the tree's `ditherGray` (`T:packages/effects/src/bayer.ts` 46 to 58). The ramp is multiplied into the tone over 0.42 of the field (`P:src/components/plate/plate.css` 566), because density ramps render as ordered dither (`P:DESIGN.md` 248 to 251). Files are written by the tree's `encodePng1` (`T:packages/effects/src/png1.ts` 47).
    - Pictures: /home carries the marginal gloss, which is 15.1 percent lit in the wide twin. Sign in carries the 1897 OED entry, which is 11.0 percent lit.
    - Credit: each field carries its picture's plate with the title and the credit, on solid paper with no rule and no shadow (DECK-GRAMMAR 6; slide 14 line 8; `P:deck/shots/OPENERS.md` 45). Under 1023 px the plate folds into a square 32 px information key. This is the `FieldMoodPlate` pattern of `P:src/components/plate/brand/FieldMoodPlate.tsx` 42 to 77, drawn square.
    - Motion: the fields are still images, and nothing animates (`T:docs/brand.md` 256 to 258).
    - Plate titles are in sentence case ("A marginal gloss") per DECK-GRAMMAR 22. `P:src/components/plate/brand/moodPictures.ts` 78 to 79 uses Title Case on the GT plate at Kevin's word. That difference is listed under risks.
12. **Sign in on the auth plate.**
    - Layout: the dialog is the GT dashboard's plate. It has a column with the mark at its head, the heading, the sentences, the methods, a reserved error row and a foot row (`P:src/components/plate/frame/PlateFrame.tsx` 19 to 76), set beside the field. It is 760 by 440 px over `--pt-scrim`. Under 800 px it becomes a full-viewport sheet with the field as a band.
    - Methods: production runs with `TURBOSLIDE_MAIL=off`, so Google is the only method (`R:docs/REALTIME.md` 4.5 step 5 and 4.6). The column therefore holds one button.
    - Copy: the column says "The presentations you made in this browser move to your Google account. Sign in on another device to open them there." That is the linking rule of `R:docs/REALTIME.md` 4.2: the anonymous records, the deck index and the inbox merge into the account, and a second browser with the same Google account is one person. The foot says "You can keep working without an account." The passkey row and "Passkeys arrive once the address is final" leave (`T:packages/chrome/src/menus/strings.ts` 233 to 234).
    - Google's button follows Google's page as read today. The light theme is a white fill with a 1 px `#747775` stroke and `#1F1F1F` text. The dark theme is a `#131314` fill with a `#8E918F` stroke and `#E3E3E3` text. Text is 14/20, the shape is rectangular or pill, and the label is "Continue with Google". The page says "The button font is Google Sans Medium." The page also requires the standard colour G on a white ground, so on the dark button the G sits on a 26 px white disc.
    - C draws the light button on light chrome and the dark button on dark chrome. These are Google's constants, so the token remap leaves them alone. The GT plate keeps its own `--mark-*` brand constants the same way (`P:src/components/plate/plate.css` 85 to 100).
13. **Monospace only on the `#101010` panel.** This covers the /home command (`T:apps/studio/src/routes/home.css` 117 to 129 sets it on the light plate today) and terminal samples. The card's address moves to Inter (`T:packages/theme/brand/og-template.html` 88). Deck basis: DECK-GRAMMAR 31; slide 39 line 9.
14. **No smooth scroll.** `scroll-behavior: smooth` leaves `T:packages/viewer/src/BookView.css` 16 (slide 39 line 11).

## Kept deviations from the deck

- Light titanium stays `#6f747d`, which is 4.70:1 on `#ffffff`. The deck's `#8a8f98` is 3.25:1 (`T:packages/chrome/src/tokens.css` 28 to 32; DECK-GRAMMAR 28).
- The light plate stays at ink 0.06 (`T:packages/chrome/src/tokens.css` 52 to 55).
- The tab tile keeps three colours at 16 px (`T:docs/brand.md` 75 to 82).

## The files a build round would change

**`packages/theme/src/brand.ts`**

- `BRAND_TOKENS` (23 to 35) takes these values:
  - `--ts-rail` 1104px
  - `--ts-h1` 3.7rem
  - `--ts-h2` 2.25rem
  - `--ts-h3` 1.375rem
  - `--ts-lead` 17px
  - `--ts-body` 16px
  - `--ts-small` 14px
- `BRAND_TOKENS` gains `--ts-nav-h` 58px, `--ts-cross` 9px, `--ts-title` 1.125rem, `--ts-label` 13px and `--ts-gutter` 40px.
- `BRAND_NARROW_MAX_PX` (38) goes from 760 to 720. `BRAND_TOKENS_NARROW` (41 to 46) keeps only `--ts-h1` 2.5rem and `--ts-gutter` 16px. A new constant `BRAND_LAYOUT_MAX_PX = 1023` is added.
- `SELECTION_COLORS` (321 to 324) changes `select` to `#2f5ce0` in both appearances and adds `selectText: '#ffffff'`.
- A new `FIELD_PICTURES` record holds, for gloss and dictionary: the grid file, the focus, the ramp share, the title and the credit.
- No change: `WINDOW`, `FIELD_END`, `markBits`, `markPath`, `cellRects`, `markBlocks`, `TILE_COLORS` and `TILE_SIZES`.
- `brand.test.ts` follows the token mirror and the contrast pins.

**`scripts/build-brand.ts`**

- `lockupStackedSvg` (556) writes the word from `committedOutline` (528), as `wordmarkOutlinesSvg` (509) already does.
- A new field step follows the recipe of `brand-c/tools/build-fields.mjs` for each `FIELD_PICTURES` entry: resize, multiply in the ramp, run `ditherGray`, then `encodePng1` with the `TILE_COLORS` palettes. The step records each output in `brand-manifest.json` and compares bytes under `--check`.
- The build cannot read Prototemplate, so the two tone grids are copied into `packages/theme/brand/mood/` with their credits. They are `mood-gloss.jpg` (237,266 bytes, written 2026-10-01 19:12) and `mood-dictionary.jpg` (65,873 bytes).
- `ogTemplateHtml` (584) sets the address in `--pt-text`.
- `--readme` renders the lockup PNGs again from the outlined stacked lockup.

**`apps/studio/public/`**

- New: `brand/field-home-wide-{light,dark}.png`, cut by the build at 1600 by 900 px rather than the mockup's 720 by 720. The other three new pairs are `field-home-band-*` at 1024 by 184, `field-signin-wide-*` at 360 by 480 and `field-signin-band-*` at 800 by 176. The mockup sizes total 28,950 bytes.
- `og/turboslide.png` is rendered again and `brand-manifest.json` is rewritten.
- Unchanged: `favicon.ico`, `icon.svg`, `apple-touch-icon.png` (0 bytes differ from the C render), `icons/*` and `manifest.webmanifest`.

**`packages/chrome/src/**/*.css`**

- `tokens.css`:
  - 103 to 104 and 174 to 175 take the new selection values, and `--pt-select-text` is added.
  - 22 to 24 and 152 to 154 drop `.ts-stagewrap` from the sheet appearance selectors, per rule 9.
- `brand.css`:
  - 13 to 43 take the `c-tokens.css` block.
  - New shared classes from `mock/c.css`: `.ts-rails`, `.ts-seam`, `.ts-cross`, `.ts-hatch`, `.ts-field` (the twin at its size, pixelated), `.ts-credit` and `.ts-credit-key`. /home, Sign in and Not found share them.
- `TitleRow.css`:
  - 93 to 96: the name keeps `min-width: 96px`.
  - 273 to 277 and 491 to 500: the corners go to 0.
  - 286 to 302: the narrow block keeps Share's word and folds Assist, comments and the side panel into one More key under 720 px.
  - The status words' CSS follows rule 7.
- `ToolButton.css` 32 to 37: the corner goes to 0, and Slideshow's 8 px moves to `TitleRow.css` 211 to 217, where it already stands.
- `dialogs/accounts.css` on `realtime/round` (68 to 126):
  - The Sign in box becomes the 760 by 440 plate with two columns.
  - The `.ts-sign-in-method.is-primary` ink fill (113 to 121) gives way to Google's button classes.
  - `.is-later` and `.ts-sign-in-note` leave with the passkey row.
- `dialogs/share.css` (100 to 105 and 434 to 436) draws ruled rows. `VersionsPanel.css` (160 and 222 to 228) moves the tools rule to the row. Both are audit-brand-surfaces ranks 21 and 22.
- The toolbar sheet gains the phone row with the Menus key, per `mock/editor.css`.

**`apps/studio/src/routes/home*`**

- `home.tsx`: the hero becomes the plate column with the gloss field and its credit plate. The editor capture moves to the first section below the fold.
- `home.css`:
  - 34 to 41: the rail moves to the column's `border-inline`.
  - 223 to 227 and 288 to 292: the section rules become seams with crosses.
  - 117 to 129: the command moves to the panel.
  - 388 to 402: the 760 px block becomes 1023 px for layout and 720 px for hero type, and that fixes the 390 px gutter at 398.
- `T:apps/studio/src/components/home/copy.ts` (84 to 96): the navigation becomes Your presentations, Documentation, one appearance glyph and New Presentation. GitHub moves to the footer.
- A three-row facts list is added, built from `HomeFacts`.
- "licence" becomes "license" (`LICENCE` and `FOOTER`).
- `home-meta.ts` 13 changes from "Turboslide, a slides editor in the browser" to the plain statement "Turboslide is a slides editor in the browser".

**`README.md` head**

- Line 3 to 6: the picture stays, with the lockup PNGs rendered again.
- Line 8 becomes three sentences: the `SITE.description` and "Agents run the same 193 actions over the CLI, MCP and HTTP." (`T:packages/theme/brand/facts.json` 5).
- Line 12's screenshot is taken again without the GT mark.
- Line 16 links to https://www.turboslide.com.
- Lines 43 to 60 (the row ledger) move to `docs/`.

**The CLI banner**

- `T:apps/cli/src/commands/banner.ts` 56 to 66 keeps `markBlocks(8)` and the www origin.
- The version comes from the release instead of `T:apps/cli/package.json` 3 (`"0.0.0"`).

**Outside the listed set, the same build touches:**

- `T:apps/studio/src/routes/decks.index.tsx` and `decks.css` (the list view)
- `T:apps/studio/src/server/decks.ts` 262 to 273 (the viewer's own decks)
- `T:packages/chrome/src/TitleRow.tsx` 544 and the other sparkle sites
- `R:packages/chrome/src/dialogs/SignIn.tsx` 115 to 260
- `T:packages/chrome/src/menus/strings.ts` 233 to 234 and 964
- `T:packages/viewer/src/BookView.css` 16
- `T:decks/templates/blank/`
- `T:packages/render/src/stage.ts` 91 to 92
- `T:packages/chrome/src/Sidebar.tsx` 1038 and 1042
- `T:docs/brand.md`

## Risks

- **Google Sans.** Google's page names Google Sans Medium for the button. Google Sans is not on this machine (`~/Library/Fonts` and `/Library/Fonts` hold no Google face), so the mockups set the label in the Arial fallback. Its license for self-hosting was not read. The alternative is Google Identity Services' rendered button, which adds a script and an iframe from accounts.google.com. Either way, it is the one piece of text in the product outside Inter. C treats it as a brand mark, the class `P:src/components/plate/plate.css` 85 to 100 already keeps for the AI tool marks. Kevin decides.
- **The dark button's G.** The white disc under the G is my reading of the page's sentence about a white ground. Google's downloadable button assets were not read.
- **The selection blue against DECK-GRAMMAR 29.** The deck draws no accent on lines. C applies the site rule of `P:DESIGN.md` 23 to 25, so the ring is GT's blue, and keeps it out of every deck, export and card. Kevin may keep Google's `#1a73e8` instead. That change is one token pair.
- **Plate titles.** The GT plate uses Title Case per Kevin ("Proto-Cuneiform Tablet", `P:src/components/plate/brand/moodPictures.ts` 78 to 79). The deck uses sentence case. C follows the deck, so the two plates differ until one of them moves.
- **GT's pictures on a slides editor.** The gloss and the OED are GT's pictures of writing. On /home and in Sign in they tie Turboslide to GT's story. Both carry their credit and are public domain per today's `moodPictures.ts` 84 to 151. The gloss source changed today in 58af25b to an Alexandreis at the Boston Public Library, and audit-brand-source 15.9 found the deck's slide 64 credit with no license. Check both credits again before shipping.
- **Twin widths.** The mockup's wide /home twin is 720 px wide, so on viewports wider than 1440 px the field outgrows it. A build cuts 1600 by 900 px and crops, as the deck's twins are cut.
- **The phone editor is a new layout.** Under 720 px the menus fold into one Menus key, the filmstrip runs under the sheet, and Assist, comments and the side panel move into More. It needs the clutter lane's agreement and a driven run, and was not built or driven here.
- **/decks listing own decks.** This depends on the `listDecks` change, which audit-brand-surfaces open item 4 leaves to Kevin.
- **Cost.** The change adds four PNG pairs of about 29 KB in all to the static set, served from the CDN. It adds no runtime script and no live shader.
- **The terminal sample.** In the mark sheet it renders with faint seams inside the block glyphs in headless Chromium at 13 px (Menlo). A real terminal draws its own blocks. The banner text itself is unchanged.

## Pictures

All at device scale factor 1. The final files were written on 2026-10-01 between 19:56:33 and 19:58:26 PDT, after earlier runs from 19:48. Every picture was looked at, and the defects found were fixed before the final run:

- the band crops on the phone
- the credit plate over the band
- the sort field wrapping at 390 px
- the stray `viewBox` in the cell marks
- the doubled frame on the tile images
- the closing tag of the field in Sign in

Mockups:

- `/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-c/shots/home-1440-light.png`, `home-1440-dark.png`, `home-390-light.png`, `home-390-dark.png`: /home's first screen with the rail and crosses, the hero plate, the facts rows, the gloss field with its credit, the hatch strip and the next section's heading.
- `/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-c/shots/decks-1440-light.png`, `decks-1440-dark.png`, `decks-390-light.png`, `decks-390-dark.png`: /decks with the two templates and the ruled list of the viewer's own presentations.
- `/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-c/shots/editor-1440-light.png`, `editor-1440-dark.png`, `editor-390-light.png`, `editor-390-dark.png`: the editor's default view, with the title row, menu bar, toolbar, filmstrip, one slide on the canvas and the notes.
- `/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-c/shots/signin-1440-light.png`, `signin-1440-dark.png`, `signin-390-light.png`, `signin-390-dark.png`: the Sign in dialog on the plate, and the sheet on the phone.
- `/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-c/shots/marks-1440-light.png`, `marks-1440-dark.png`, `marks-390-light.png`, `marks-390-dark.png`: the mark set sheet.

Rendered marks:

- `/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-c/marks/favicon-16.png`, `favicon-32.png`, `apple-touch-icon-180.png`

## Not read, not done

- No dev server was started. No production page was opened, and no deck was created, so none needed removing.
- Not read:
  - Google Sans' license, the Google Identity Services button and Google's downloadable button assets
  - `P:deck/parts/tail.html`, `P:src/components/plate/plate.css` beyond lines 1 to 140 and the grepped lines, and `FieldStack.tsx` beyond line 80
- Not mocked:
  - Not found, the trash, the presenter, the Share dialog, version history and the OG card
- Not rendered:
  - the card
  - the README lockup PNGs
  - the ICO entries (the PNG tiles share their geometry)

## Questions for Kevin

1. Should Turboslide stay outside the GT speed register? C says it should, and `T:docs/brand.md` 67 stands.
2. Should the selection ring use `#2f5ce0` in both appearances, or keep `#1a73e8` and `#3d86f0`?
3. Should Google's button use self-hosted Google Sans, or Google's rendered button?
4. Should plate titles use sentence case, following the deck, or Title Case, following the GT plate?
5. Should the phone editor use the Menus key layout?
