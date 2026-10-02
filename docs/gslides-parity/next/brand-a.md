# Brand direction A: Turboslide as a General Translation product

Written by brand designer A of the next/program workflow on 2026-10-01 between 19:31 and 20:05 PDT (2026-10-02T02:31Z to 03:05Z). The tree is /Users/kevinliu/repos/Turboslide-next on `next/program` at 94e8a5c3. The brand source is /Users/kevinliu/repos/Prototemplate on `speed-marks` at 58af25b (2026-10-01 19:16:10 -0700), read only. That commit moved past the b20f0656 the brand-source audit read, and `git log b20f0656..HEAD -- public/marks deck/DECK-GRAMMAR.md deck/parts/head.html DESIGN.md` lists nothing, so the marks and the grammar are the ones the audit cited. `public/marks/bar-monogram.svg` last changed in d5d00f7 and its sha256 is `5257b4d87d23b91b81cd8bda56d8f23250114fc1c624dd43ae94b6b53cc1f59f`. Machine load (`uptime`) was 50.18 at 19:31, 37.74 at 19:50, 26.49 at 19:54 and 46.12 at 19:55. No number in this note is a timing.

A path that starts with `P:` is in Prototemplate. A path that starts with `T:` is in the tree. Everything this lane made is under `T:docs/gslides-parity/next/brand-a/`, and `node docs/gslides-parity/next/brand-a/build.mjs all` rebuilds all of it from the repository root. The script reads the monogram from P:, the outlined word and the app icon geometry from T:, and renders with the playwright package of T:node_modules (1.62.1, Chromium 1234). Its readings are in `brand-a/render-log-all.json` and `brand-a/render-log-pages.json`.

## The direction

Turboslide wears the General Translation identity as a product of the company. The GT bar monogram from the speed set leads every surface where the product introduces itself, in a lockup with the word Turboslide set in Inter 500. The chrome, /home and /decks follow the deck grammar as written: paper and ink tokens, one hairline rail on each side of a 1104 px column, ruled rows, square buttons with Title Case labels, Heroicons 20 solid as the one icon family, and the deck's two-tone mood pictures as the one material. Round four's slide and plate mark stays only as the square app icon, because the speed set has no square member. The customer's slide carries no GT identity.

## The mark

### The choice: the bar monogram

The file is `P:public/marks/bar-monogram.svg`, copied unchanged to `brand-a/marks/gt-bar-monogram.svg` (702 bytes, the same sha256). The reasons, in order:

1. The film brief names it the hero mark: "The hero mark is the bar monogram" (`P:motion/MOTION.md` 145, an untracked file). The same file calls the doubled-line monogram "the product mark at small size" (line 146).
2. It holds at 16 px of height. "There is no font in the file; the letters are geometry, so the mark holds at 16px and reads in either polarity" (`P:src/lib/marks.ts` 138). The title row needs a mark at that size.
3. It is one path with no mask and no id (DECK-GRAMMAR 52; the file has 13 parallelograms in one `d`). `plate-inverted.svg`, `double-cut.svg` and `livery-stack.svg` each carry one `id="sm-..."` mask (grep, 2026-10-01), so two copies of them in one document collide on the id. The chrome draws the mark several times per page, so a mark without ids is the safe choice.
4. It is one colour in `currentColor` (marks.ts 94 to 104), so it takes the chrome's ink in both appearances with no second file.

The other files were read and set aside:

| File | Why it is not the lead mark | Source |
| --- | --- | --- |
| `bar-monogram-lockup.svg` | Its second line is GENERAL TRANSLATION in Michroma at an eighth of the lockup's height, so a product lockup beside it would hold two names | marks.ts 149 |
| `plate-inverted.svg` | It brings its own ground and its stripes read from about 48 px; it suits avatars and badges | marks.ts 161 |
| `double-cut.svg`, `livery-stack.svg` | Wordmarks of the company name for headers and large sizes; the livery stack closes below about 48 px | marks.ts 183 and the double cut entry |
| `bar-monogram-dithered.svg` | It needs 59 px of height, where one cell is one pixel | marks.ts 195 |
| `bar-monogram-ascii.svg` and `.txt` | 160 columns of monospace characters, wider than an 80 column terminal | marks.ts 207 |

### The lockup

`brand-a/marks/turboslide-lockup.svg` (5,351 bytes, one colour, `currentColor`) is the monogram beside the word. The word is the Inter outline this tree already generates (`T:packages/theme/brand/wordmark-outlines.svg`, from `InterVariable.woff2` at weight 500 and -0.025em with Inter's pair kerning, written by `T:packages/theme/scripts/outline-wordmark.py`). Nothing in the lockup is drawn by hand. The construction:

- The word's cap height equals the monogram's 120 unit cap. Inter's cap is 1490 of 2048 units (`T:docs/brand.md` 109), so the word is scaled by 120 / 1490 = 0.080537.
- The baselines meet at the monogram's bottom edge (y 160 in the monogram's own units).
- The gap from the T's crossbar (x 386.5) to the word is half the cap, 60 units.
- The file keeps the monogram's 4 unit clear space, so its viewBox is `-109.1 36 1272.2 128`.
- In live chrome the word is text and the monogram is an inline SVG at `height: 0.7765em`, which is the 128 unit box when the 120 unit cap equals Inter's 0.7275 em cap, with a 0.0243em drop for the clear space under the letters and a gap of 0.364em.

The precedent is in the deck itself. The deck viewer's own chrome sets its mark beside the deck's name in Inter 500 with a 10 px gap (`P:deck/parts/head.html` 232 to 234, `.bar-brand`), and its sidebar head does the same at 13.5 px (lines 207 to 209). `brand-a/marks/lockup-sheet.png` shows the outlined file and the live lockup at 66, 22 and 18 px, and the monogram alone at 16 and 24 px, on paper and on ink.

### The app icon: round four's form, kept for the square slots

The tab icon, the touch icon and the manifest icons need a square. The speed set has no square member. Fitted to the 16 px tile, the bar monogram is 12 px wide and 3.1 px tall, and it renders as a grey smudge (`brand-a/marks/rejected-bar-16.png`, and the third tab strip of `brand-a/marks/favicon-sheet.png`). Its letters need 16 px of height (marks.ts 138), which a 16 px square cannot give. DECK-GRAMMAR 53 forbids redrawing a mark by hand, so Turboslide cannot crop or restack it.

Round four's solid slide and plate form (`T:packages/theme/src/brand.ts` 123 to 132, `markPath`) is square by construction and is already measured at 16, 32 and 48 px (`T:docs/brand.md` 84 to 90). It stays as the app icon and appears nowhere inside a page. The files, rendered from their SVGs by build.mjs:

| File | What it is | Read back |
| --- | --- | --- |
| `marks/app-icon.svg` | The solid form, `currentColor`, 16 unit box (`brand.markSvg(8, 16)`) | 256 bytes |
| `marks/app-icon-tile-16.svg`, `-32.svg` | The paper tile with the 1 px edge frame and the `prefers-color-scheme` block (`TILE_SIZES`, `tileMarkPath`) | 561 and 563 bytes |
| `marks/app-icon-touch-180.svg` | The ink tile with the 128 px mark at 4 px cells (`markBits(32)`, 610 lit cells) | 9,940 bytes |
| `marks/favicon-16.png` | 16 by 16 | 3 colours: #ffffff, #656565, #070707 |
| `marks/favicon-32.png` | 32 by 32 | 3 colours, the same |
| `marks/apple-touch-icon-180.png` | 180 by 180 | 2 colours: #070707, #f2f2f0 |
| `marks/favicon-16-dark.png`, `favicon-32-dark.png` | The tiles under `prefers-color-scheme: dark` | for the sheet |

The 16 and 32 px files match the shipped tile's geometry and colours (`T:docs/brand.md` 75 to 90), so a build round leaves `T:apps/studio/public/favicon.ico`, `icon.svg`, `apple-touch-icon.png` and `icons/` byte identical. The decision is the reason that has to be recorded: the identity that changes is the page's, and the tab keeps the product's own square.

### The doubled-line GT monogram

It leaves the chrome. Today it draws in the view route's sidebar head (`T:packages/chrome/src/Sidebar.tsx` 1038, 1042), the view toolbar (`Toolbar.tsx` 530) and the filmstrip (`Filmstrip.tsx` 1105, 1109). Those places take the bar monogram. `GtMark.tsx` stays for the GT template's sheet content, as `T:docs/brand.md` 134 to 139 already rules.

### The CLI banner

`brand-a/marks/cli-banner.txt` holds four candidates sampled from the monogram's own 13 polygons into half block characters, with square half cells (a terminal cell is about 0.6 em wide and 1.2 em tall). The pick is the five line glyph at 41 columns, which reads as G and T with the three bars (`brand-a/marks/cli-banner.png`, drawn white on the #101010 code panel of DECK-GRAMMAR 31):

```
      ██████████████████  ▄██████████████  Turboslide 0.0.0
       ███                     ███         https://www.turboslide.com
▄████████      ▄▄▄▄▄▄▄         ██          193 actions, effects backend: wasm
      ███     ▄███████        ███          checkout /Users/kevinliu/repos/Turboslide-next
  ████████████████████        ██▀
```

The four line glyph at 33 columns loses the G's counter. The six and eight line glyphs are 50 and 66 columns wide. The text lines are the banner's facts as the surfaces audit printed them on 2026-10-01; the version stamp is a separate fix (surfaces audit proposal 18).

## Rules A adds or changes against the deck

Each rule names the deck rule it touches. None of them uses an item of the avoid list (slide 39 lines 9 to 17; DECK-GRAMMAR 39), and the copy follows DECK-GRAMMAR 22 to 23.

1. **The lockup.** The GT bar monogram beside "Turboslide" in Inter 500, built as in the lockup section. Tracking is -0.01em under 28 px and -0.025em from 28 px (`T:docs/brand.md` 102 to 104). The lockup appears on /home's navigation and footer, the /decks bar, the Sign in dialog's head, the Not found page, the README head and the card. This adds a product lockup the deck does not define, on the model of the deck viewer's mark and name (head.html 232 to 234).
2. **The monogram's floor.** The monogram is never under 16 px of height (marks.ts 67 `MARK_SIZES`, 138). Alone, it is the editor's home link at 16 px tall and 62.45 px wide, and the print bar's mark.
3. **Where each mark draws.** The lockup and the monogram are the page's marks. The app icon draws only where a platform asks for a square: the tab, the touch icon, the manifest and the installed app. The doubled-line GT monogram draws only as content of the GT template. Nothing of the identity draws on a customer's slide (`T:docs/brand.md` 254): the blank template loses the GT mark and the wordmark band (surfaces audit proposal 2).
4. **One icon family.** Every chrome glyph is Heroicons 20 solid at 16 px from `T:packages/chrome/src/icons.tsx`, the control glyphs (chevrons, close, ellipsis) included. The deck's shell has no Lucide (`P:src/components/viewer/icons.tsx` 2 to 11), so A adds none. The live GT sites allow Lucide for controls (`P:scripts/oxlint-plugins/gt-ui.ts` 1204 to 1216, icon-tiers); a second family would cost client bytes and the deck does not need it. A third party's mark, such as Google's G, is its own class. The sparkle glyph of Assist is replaced by the word alone (slide 39 line 12).
5. **Corners.** Every button is square, Slideshow included. The one rounded chrome element is the 6 px `--pt-radius` of the search pill, the segmented controls and the filter fields (`T:packages/chrome/src/tokens.css` 106 to 114). This drops the 8 px Present exception of `P:DESIGN.md` 430 and the 8 px of every `.pt-ib.is-solid` (`T:packages/chrome/src/ToolButton.css` 36), which follows DECK-GRAMMAR 39.
6. **Button labels.** Title Case on every button, sentence case everywhere else (DECK-GRAMMAR 22). On Slideshow the label comes before the play glyph (`P:DESIGN.md` 430). Google's button keeps Google's own label, "Continue with Google".
7. **The page grammar on /home and /decks.** The ruled column is 1104 px with one hairline rail on each side, the navigation bar is 58 px, a 9 px cross sits where a seam meets a rail, seams run the full width, a hatch strip of 45 degree hairlines every 8 px separates a change of topic, and under 1024 px the column is the viewport (slide 49 lines 24 to 29; `P:DESIGN.md` 75 to 78, 177 to 184). This replaces `--ts-rail: 1120px` (`T:packages/theme/src/brand.ts` 33) and the padding-only rail of `T:apps/studio/src/routes/home.css` 34 to 41.
8. **The material.** The deck's two-tone mood pictures are the one material on /home and in the Sign in dialog (slide 34; `P:deck/shots/OPENERS.md` "Mood slide"). /home's first screen and the dialog use the proto-cuneiform tablet with the deck's plate and credit (slide 14 lines 8 to 11 and 18). At 1024 px and wider a picture shows at 2 px cells, cropped and never scaled (`T:docs/brand.md` 217). Under 1024 px it shows at one CSS px per cell, which is the 800 by 450 grid of the file through nearest neighbour and the cell size of the GT sign-in plate's field (`P:src/components/plate/brand/moodPictures.ts` 60 to 61). That second size is a change to Turboslide's 2 px rule. Without it a phone shows a 390 px crop of the tablet's cells, which reads as noise (OPENERS.md 10 refuses a crop whose subject is the dither). The liquid metal twins leave /home (`T:docs/brand.md` 243).
9. **The selection colour.** `--pt-select` becomes the GT accent `#2f5ce0` in both appearances. It reads 5.63:1 on #ffffff and 3.58:1 on #070707 (`contrastRatio` of `T:packages/theme/src/brand.ts` 307, run on 2026-10-01), over the 3:1 of WCAG 2.2 SC 1.4.11. The selection chip's text becomes #ffffff in both appearances (5.63:1). `T:packages/chrome/src/Overlay.css` 45 sets it to `--pt-paper`, which is #070707 in the dark appearance and would read 3.58:1, under 4.5:1. The site allows its one accent on a small active element (`P:DESIGN.md` 24 to 26). DECK-GRAMMAR 29 refuses the accent inside the deck, and the selection ring is chrome, never deck content. The snap guides keep `--pt-guide`.
10. **The stage.** The workspace is `--pt-plate` in the chrome's appearance. The slide keeps its own deck's appearance in the editor, the filmstrip, the presenter view and the /deck view, so a light deck stays white in dark chrome (surfaces audit rank 5). This changes how `.ts-stagewrap` takes the sheet's appearance (`T:packages/chrome/src/tokens.css` 18 to 24).
11. **Sign in.** The dialog is the GT dashboard's plate in a box. It has a picture cell with its credit, a plate column with the lockup at its head, the heading "Sign in", two sentences, Google's button and a foot sentence (`P:src/components/plate/frame/PlateFrame.tsx` 20 to 33 for the plate). It has no passkey row until passkeys exist (surfaces audit proposal 15) and no Cancel button, because the close glyph and Escape close it. Its border is `--pt-edge`, because a box over a scrim keeps the frame weight (`P:DESIGN.md` 117 to 119). On a phone it is a sheet from the bottom edge. Google's button follows Google's guideline, read on 2026-10-01 at about 19:40 PDT (https://developers.google.com/identity/branding-guidelines): light theme fill #FFFFFF with a 1 px #747775 stroke inside and #1F1F1F text; dark theme fill #131314 with a 1 px #8E918F stroke and #E3E3E3 text; text 14/20; 12 px before the G and 10 px after it; and a G that "must be the standard color version (the standard color gradient super G logo) and appear on a white background". The dark mockup puts the G on a white disc for that last sentence.
12. **One noun per thing.** The toolbar button and the panel are both "Theme" (surfaces audit rank 25). The /decks caption "Every presentation on this Turboslide is listed here" goes once the list shows the person's own and shared presentations (clutter audit, words to change).
13. **The manifest.** `background_color` and `theme_color` become #ffffff, the paper the boot script falls back to on a first visit (`T:apps/studio/src/routes/__root.tsx` 66; `T:packages/theme/brand/site.ts` 114 to 115 carry #070707 today).

The avoid list, item by item: Inter is the only typeface of the chrome and no monospace is used outside the code panel and the banner; no eyebrow label; no smooth scrolling; no robot or sparkle for AI; no flag; no gradient except the sanctioned hatch strip; no glassmorphism and no shadow; no em dash and no exclamation mark in any mockup (grep of `brand-a/mockups/src` and the stylesheets, 2026-10-01). The one exception to Inter is Google's button, whose guideline names Google Sans Medium (risk 4).

## The four surfaces

All 16 pictures were rendered at device scale 1. The render log reads Inter 500 loaded on every page, `scrollWidth` equal to the viewport width on every page (no sideways scroll), no element outside the viewport outside a clipped frame, and no broken image (`brand-a/render-log-pages.json`, 2026-10-02T02:54Z). I looked at every picture and fixed four things before this note: a paper strip above the /home picture (the crop moved down 30 px), the phone crops that read as noise (rule 8), the phone credit plate that left a sliver of picture beside it, and the Select glyph, which first took the next entry's paths from icons.tsx.

- **/home, first screen** (`home.html`). The navigation holds the lockup at 22 px and, on the right, Documentation, the appearance glyph, Sign In and New Presentation; GitHub moves to the footer (clutter audit). The hero row splits the column in two. The left cell holds the product's own heading and lead (`T:apps/studio/src/components/home/copy.ts` 104 to 110; `T:packages/theme/brand/site.ts` 12 to 13) and the two buttons. The right cell holds the tablet at 2 px cells with the deck's plate lower right: title, one sentence and the credit. A numbers row follows with three figures and the product's own sentences. "9 menus" comes from copy.ts 140. "193 actions" comes from copy.ts 189 and `T:packages/theme/brand/facts.json` (`actions.count` 193, written 2026-09-29). "0.003%" comes from facts.json `export.worstPageMismatchPercent`. Then come a hatch strip and the next section's heading. On a phone the picture comes first at one px per cell, with its credit across its foot.
- **/decks** (`decks.html`). The bar holds the lockup, the search pill and the appearance glyph with the account chip. "Start a new presentation" shows Blank and the GT brand deck as framed tiles. A hatch strip follows, then "Your presentations" as ruled rows: a 64 by 36 thumbnail in the `--pt-edge` frame, the name, the owner, the time and a row menu. A thumbnail shows its deck's own appearance in both chrome appearances. The deck names are invented for the mockup.
- **The editor's default view** (`editor.html`). The title row holds the monogram as the home link and the deck name. On the right are Assist (the word), comments, the side panel, Slideshow with the label first, Share and the account chip at the far right. A draft shows no Last edit words. The menu bar has nine menus. The toolbar is the product's head (`T:packages/chrome/src/menus/model.ts` 2934 to 3100) without the pointer toggle (clutter audit). The filmstrip has one card. The workspace is `--pt-plate`, the slide is white with the blank template's placeholders and no GT content, and the notes pane sits below. On a phone the title row keeps the name, Slideshow as a glyph, Share, More and the chip. The menu bar scrolls inside its row, the toolbar keeps seven tools and More, and the filmstrip runs under the slide.
- **The Sign in dialog** (`signin.html`). It sits over the editor behind `--pt-scrim`: a 720 by 440 box with a 280 px picture cell and the plate. The sentences come from docs/REALTIME.md sections 4.1 and 4.2 on `realtime/round` in /Users/kevinliu/repos/Turboslide-realtime (read with `git show HEAD:docs/REALTIME.md`). Google's name replaces the label at render. Every record under the anonymous id renders as the account once the alias links. Nothing calls a Google API after the sign in. The dialog's states and methods are the realtime branch's (`packages/chrome/src/dialogs/SignIn.tsx` there): Google is the primary method when no mail sender exists, and GitHub joins as a second row of the same shape when its client is configured.

## Files a build round would change

| File | Change |
| --- | --- |
| `packages/theme/src/brand.ts` | Add the monogram as data: the 13 polygons, the viewBox, the source path, commit d5d00f7 and the sha256. Add the lockup geometry (cap 120, gap 60, the word scale) with `lockupSvg()`, and `bannerBlocks(10)` from the polygons for the banner. Keep `markBits`, `markPath`, `TILE_SIZES` and the tile functions for the app icon. `SELECTION_COLORS.light.select` and `.dark.select` (321 to 323) become #2f5ce0. `BRAND_TOKENS` (23 to 35): `--ts-rail` 1104px, `--ts-mark` 16px as the monogram's height, and new `--ts-nav-h` 58px and `--ts-cross` 9px. |
| `packages/theme/brand/` | Vendor `gt-bar-monogram.svg`. `wordmark.svg` and `lockup-stacked.svg` give way to `turboslide-lockup.svg`. `wordmark-outlines.svg` stays as the word's source. `og-template.html` sets the lockup on the plate, sets the address in Inter instead of `--pt-mono` (line 88), and takes the tablet field. `site.ts` 114 to 115 set the manifest colours to #ffffff, and `IMAGE_ALT` (line 16) describes the new card. |
| `scripts/build-brand.ts` | Write the lockup SVG, the README pair (ink on paper and paper on ink PNGs from the lockup) and the card from the new template. Under `--check`, compare the vendored monogram's sha256 with brand.ts. The tile, ICO, touch and manifest steps run unchanged and must rebuild byte identical. The `--capture` hero twins stop feeding /home. |
| `apps/studio/public/` | `og/turboslide.png` is re-rendered. `manifest.webmanifest` takes the colours. `brand/mood-tablet.jpg` and `brand/mood-tablet-light.jpg` are added from `P:deck/shots` (306,776 and 306,838 bytes; public domain, credit from slide 14 line 18). `brand/hero-*.png` is removed once nothing reads it. `favicon.ico`, `icon.svg`, `apple-touch-icon.png` and `icons/*` do not change. |
| `packages/chrome/src/tokens.css` | `--pt-select` at 103 and 174 becomes #2f5ce0. A `--pt-select-text: #ffffff` is added for the chip. The stage wrapper's appearance (18 to 24) follows rule 10. |
| `packages/chrome/src/brand.css` | The `.ts-brand-lockup` rules (89 to 137) become the monogram and word lockup with the `0.7765em` height, the drop and the half cap gap. `--ts-rail` (30) and `--ts-mark` (18) take the new values. Add the column, rail, cross and hatch classes of rule 7. |
| `packages/chrome/src/TitleRow.css` | `.ts-title-home .ts-mark` (44 to 57) draws the monogram at 16 px tall in its 32 px link box. The radii at 217, 230 and 277 become 0. The narrow rules of surfaces audit rank 3 follow the phone mockup. |
| `packages/chrome/src/ToolButton.css`, `Overlay.css` | ToolButton.css 36: the solid radius becomes 0. Overlay.css 45: the chip text reads `--pt-select-text`. |
| `packages/chrome/src/*.tsx` | A new `GtMonogram.tsx` and `Lockup.tsx`. `TitleRow.tsx` 485, `AppBarBrand.tsx` 75 and `EmptyFigure.tsx` 62 move from `TurboslideMark` to the monogram or the lockup. `Sidebar.tsx` 1038 and 1042, `Toolbar.tsx` 530 and `Filmstrip.tsx` 1105 and 1109 move from `GtMark` to the monogram. `TurboslideMark.tsx` stays for the app icon's in-page uses, of which A has none. The Assist sparkle at `TitleRow.tsx` 544 goes. |
| `apps/studio/src/routes/home.tsx`, `home.css`, `apps/studio/src/components/home/` | `home.css` takes the column and rails (34 to 41), the crosses and the hatch, the hero split with the picture cell, and the phone gutter (398). `HomeNav.tsx` 50 and `HomeFooter.tsx` 21 use the lockup. `HomeHero.tsx` takes the picture and plate in place of the capture. `copy.ts` drops GitHub from `NAV.links` (88) and adds Sign In. `home-meta.ts` 13 drops the comma-tail title. |
| `apps/studio/src/routes/decks.index.tsx`, `print.$deckId.tsx` | /decks lists ruled rows by default. The GT template card (848) shows the template's cover instead of `GtMark`, and the caption (869) goes. `print.$deckId.tsx` 247 uses the monogram. |
| `decks/templates/blank/` | `deck.json` 5 and `slides/title.json` drop the GT mark and the wordmark band (rule 3; surfaces audit rank 2). |
| `README.md` head | Lines 3 to 6 take the lockup pair inside the `<picture>`. Lines 8 to 16 become three sentences and the www link; line 16 names https://turboslide.vercel.app today. |
| `apps/cli/src/commands/banner.ts` | `bannerLines` (56 to 57) takes the five line monogram glyph from brand.ts in place of `markBlocks(8)`. |
| `docs/brand.md` | Sections 1 to 4, 8, 9, 10, 11 and 13 are rewritten for A, and line 67 records why the speed register now leads the page. |
| `packages/chrome/src/dialogs/SignIn.tsx`, `accounts.css` | Rule 11, applied on top of the realtime round's versions once that lane is on main. |

## Risks

1. **The company's own precedent.** Locadex, GT's other product, "has its own mark under the same rules" (`P:deck/slides/16-mark.html` line 8). Direction A puts the company's mark on a product instead, so it diverges from that precedent. Kevin decides.
2. **The GT mark is not final.** Slide 16 line 7 presents the speed set as "the September 2026 exploration" beside the current mark, and the brand-source audit (section 17 item 1) found no final pick. Only an untracked file names the bar monogram the hero mark (MOTION.md 145). If GT picks another member or keeps the doubled-line monogram, A's lockup changes with it. The vendored copy with its sha256 makes that one constant and one file.
3. **Two marks.** The tab shows the slide glyph and the page shows GT, so a reader has to learn both. The alternative failed in the picture (`rejected-bar-16.png`). A square member of the speed set would have to come from Prototemplate's generator (`P:scripts/build-speed-marks.mjs`), which is Kevin's call and not Turboslide's tree.
4. **Google's button.** The guideline names Google Sans Medium, which is not in this tree, so the mockup sets the label in Inter 500 as a stand-in. A build round either self-hosts Google Sans Medium subset to the one label or renders Google's own button through its script and iframe, which is a third-party script on the sign-in path. The guideline asks for "the standard color gradient super G logo". The mockup's flat four colour G path may be the older asset, so the build takes the G from Google's download. The white disc under the dark button's G was not checked against Google's dark asset.
5. **The selection on dark slides.** #2f5ce0 on #070707 reads 3.58:1, where today's dark #3d86f0 reads 5.63:1. A ring on a dark photograph in the dark appearance is fainter than it is today, though still over 3:1.
6. **The title row on a phone.** The monogram's home link is 62.45 px wide against today's 24 px mark, and the deck name keeps about 136 px in the 390 px mockup.
7. **Cells on fractional pixel ratios.** One CSS px per cell is crisp at device pixel ratios 1, 2 and 3. At ratios such as 2.625, nearest neighbour gives cells of two sizes.
8. **Speed and the product's name.** Round four kept speed glyphs off Turboslide's mark so the name would not recall the harmonica, the door and the playground slide sold under the same word (`T:docs/brand.md` 67 to 70). A puts GT's speed bars beside the word Turboslide. They are the company's register, but a reader may still read the pair as a racing product.
9. **The realtime lane.** `SignIn.tsx` and `accounts.css` change on `realtime/round` now. A build round on the dialog lands after that lane, or it conflicts.
10. **The mood pictures are GT's.** Turboslide then shares the company's picture set and credits with the deck and the dashboard plate. A licence or credit change in Prototemplate has to be copied into the tree.

## Pictures

Mockups, 1440 by 900 and 390 by 844 in both appearances:

- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/home-1440-light.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/home-1440-dark.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/home-390-light.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/home-390-dark.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/decks-1440-light.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/decks-1440-dark.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/decks-390-light.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/decks-390-dark.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/editor-1440-light.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/editor-1440-dark.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/editor-390-light.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/editor-390-dark.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/signin-1440-light.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/signin-1440-dark.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/signin-390-light.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/shots/signin-390-dark.png

Marks and sheets:

- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/marks/favicon-16.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/marks/favicon-32.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/marks/apple-touch-icon-180.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/marks/favicon-sheet.png (kept and rejected at 1x and 8x, and three tab strips)
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/marks/lockup-sheet.png
- /Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-a/marks/cli-banner.png

The SVG files are `marks/gt-bar-monogram.svg`, `marks/turboslide-lockup.svg`, `marks/app-icon.svg`, `marks/app-icon-tile-16.svg`, `marks/app-icon-tile-32.svg` and `marks/app-icon-touch-180.svg`. The mockup sources are `mockups/src/*.html`, `mockups/brand-a.css`, `mockups/editor.css` and the generated `mockups/icons.css`. The mockups link `T:packages/chrome/src/tokens.css` and `T:packages/fonts/assets/InterVariable.woff2` by relative path, so they show the product's tokens as the tree has them.

## Not read or not done

- Production was not opened. This lane made no deck and wrote nothing outside `brand-a/` and this note.
- The card, the README PNGs and the Not found page under A were not rendered. The table above lists them as changes only.
- The G was not compared with Google's downloadable button assets, and Google Sans was not loaded.
- The /home sections below the first screen, the menus, the panels and the presenter view were not drawn under A.
- The Prototemplate files the brand-source audit lists as not read were not read here either. `P:motion/MOTION.md` was read at lines 125 to 149 only.
- The realtime branch was read through `git log` and `git show HEAD:` only. Its dialog was not rendered.
