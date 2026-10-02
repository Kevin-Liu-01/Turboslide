# Brand judge 2: a seller opening Turboslide for the first time

Written by brand judge 2 of the next/program workflow on 2026-10-01 between 20:09 and 20:25 PDT. Machine load (`uptime`) was 78.12 at 20:09 and 102.05 at 20:17. No number in this note is a timing.

The lens is a seller who opens Turboslide for the first time on a laptop and on a phone. The questions are these. Can the seller read the mark at 16 px and in the title row? Is the editor's default view clear? Does the first screen of /home say what the product is? Is the Sign in dialog clear? Do both themes hold?

A path that starts with `P:` is in /Users/kevinliu/repos/Prototemplate at 58af25b (2026-10-01 19:16:10 -0700), read only. A path that starts with `T:` is in /Users/kevinliu/repos/Turboslide-next at 94e8a5c3. A picture name without a folder belongs to the direction under discussion.

## What was read

- `audit-brand-source.md` (346 lines) and `audit-brand-surfaces.md` (125 lines) in this folder, in full.
- `brand-a.md` (182 lines), `brand-b.md` (142 lines) and `brand-c.md` (245 lines), in full.
- `P:deck/DECK-GRAMMAR.md` lines 1 to 66, `P:DESIGN.md` lines 175 to 190 and 419 to 436, and `T:docs/brand.md` lines 60 to 72 and 250 to 256.
- Every picture each direction lists, opened with the Read tool: 22 for A, 25 for B and 23 for C. No listed picture was missing.

## Evidence this judge made

Both files are under `brand-judge-2/` and were made with Pillow 12.3.0 from the directions' own PNG files.

- `brand-judge-2/favicons-side-by-side.png` puts every 16 px and 32 px tab icon at 1x on a light and a dark tab ground, and at 8x or 4x by nearest neighbour.
- `brand-judge-2/title-rows-3x.png` crops the editor title row of each direction at 1440 px in both themes and at 390 px in light, enlarged 3x by nearest neighbour.

Measurements taken from the PNG files on 2026-10-01 at about 20:15 PDT:

- A's and C's `favicon-16.png` have the same sha256, `9e510439...93ca`. A's and C's `favicon-32.png` and `apple-touch-icon-180.png` are also byte identical to each other.
- A's `apple-touch-icon-180.png` decodes to the same pixels as `T:apps/studio/public/apple-touch-icon.png`. The two files differ in bytes.
- The rails of the 1440 px /home mockups sit at x 168 and x 1271 for A and C, a 1104 px column. B's sit at x 159 and x 1280, a 1122 px column.
- C's gloss field draws ink in 114 pixel columns from x 1276 to x 1389 between y 60 and y 770 of C's `home-1440-light.png`. That is past the right rail at x 1271. A and B draw no ink past x 1275.
- On the 390 by 844 phone /home, the solid New Presentation button in the hero sits at y 596 to 635 for A, y 414 to 453 for B and y 503 to 542 for C.

## Scores

| Direction | Fidelity | Product | Legibility | Restraint | Buildability | Total |
| --- | --- | --- | --- | --- | --- | --- |
| A, the GT bar monogram with the word | 8 | 5 | 6 | 6 | 7 | 32 |
| B, a Turboslide wordmark in the speed register | 6 | 8 | 8 | 7 | 4 | 33 |
| C, the round four mark on the deck grammar | 7 | 6 | 6 | 6 | 8 | 33 |

## Direction A

### Fidelity 8

- The /home column is 1104 px with one rail on each side, crosses at the seams and a hatch strip at the change of topic (`home-1440-light.png`). That follows `P:DESIGN.md` section 3 and slide 49 as the source audit cites it.
- The mood picture carries the deck's plate lower right with a title, one sentence and the credit (`home-1440-light.png`). That follows DECK-GRAMMAR 6.
- The GT bar monogram is copied byte for byte, so DECK-GRAMMAR 52 to 53 (a mark is never redrawn) holds.
- Every button is square and labelled in Title Case (`home-1440-light.png`, `editor-1440-light.png`). That follows DECK-GRAMMAR 22 and 39. It drops the 8 px Present exception of `P:DESIGN.md` 430, which is stricter than the source and allowed.
- /decks is ruled rows with framed thumbnails (`decks-1440-light.png`). That follows DECK-GRAMMAR 39.
- The point lost: GT's own mark on a product departs from slide 16 line 8, where Locadex has its own mark under the same rules. A names this as its risk 1.

### Product 5

- The editor's title row shows the GT monogram and the deck name, and the word Turboslide appears nowhere in the editor (`editor-1440-light.png`, `title-rows-3x.png`). A seller who arrives on a shared link reads the product as GT.
- The tab shows a different mark from the page: the slide glyph in the tab and GT on the page (`favicon-sheet.png`, tab strips). The seller has to learn two marks for one product.
- Half of the first screen of /home is a cuneiform tablet (`home-1440-light.png`). It tells a seller nothing about slides.
- A is the only direction that puts Sign In in the /home navigation (`home-1440-light.png`). That helps a seller who came to sign in.
- The numbers row (9 menus, 193 actions, 0.003%) states mechanisms with numbers, which the copy register asks for.

### Legibility 6

- The monogram holds at 16 px of height and reads as GT in both themes (`lockup-sheet.png`, `title-rows-3x.png`).
- The lockup reads at 22 px and 18 px in both themes (`lockup-sheet.png`).
- The 16 px tab icon is crisp in 3 colours, and at that size it reads as a generic window glyph (`favicons-side-by-side.png`).
- On a phone the picture comes first and the primary button starts at y 596 of 844 (`home-390-light.png`). B's starts at y 414.
- On a phone the editor cuts the deck name to "Untitled present..." and the menu bar to Arrange, with Tools and Help off screen (`editor-390-light.png`).
- The phone /home picture at 1 CSS px per cell reads as texture with a credit, and it does not read as a tablet (`home-390-light.png`, `home-390-dark.png`).

### Restraint 6

- The editor is the cleanest default view of the three: a plain white slide, no Last edit words, and Assist as a word (`editor-1440-light.png`, `editor-1440-dark.png`).
- The tablet dither covers about 550 by 560 px of the first screen and leads on a phone. It is decoration from the seller's point of view.
- The Sign in dialog gives 280 px of its 720 px to the tablet (`signin-1440-light.png`).

### Buildability 7

- The monogram is vendored as one file and the lockup is built from the outlines the tree already generates.
- The tab, touch and manifest icons stay byte identical, as measured above.
- The /home rebuild, the column classes and the dialog are ordinary work. The dialog lands after the realtime lane (A risk 9).

## Direction B

### Fidelity 6

- One rail with 9 px crosses, ruled rows on /decks, Title Case buttons and Slideshow at 8 px with the label first all hold (`home-1440-light.png`, `decks-1440-light.png`, `editor-1440-light.png`). The Slideshow corner follows `P:DESIGN.md` 430.
- The mark is one path in currentColor with no font, mask or id. That follows the speed set's file rule as the source audit cites it (P:src/lib/marks.ts 94 to 104).
- The column measures 1122 px. It keeps the tree's 1120 px rail where slide 49 sets 1104 px.
- The wordmark is weight 800. DECK-GRAMMAR 20 caps display text at 500. The GT speed marks are themselves outlines of weight 900 faces, so B's reading that a mark sits outside the cap has a precedent. B lists it as its open question 2.
- Five of ten letters are narrower than tall (B note, "How the letters measure"). The register says every letter is wider than tall (marks.ts 77, as B cites it).
- The 16 px pixel drawing is drawn by hand as rows in the generator. DECK-GRAMMAR 53 forbids redrawing a mark by hand.
- B uses none of the deck's mood pictures, the material the deck added on 2026-10-01.
- The blank slide keeps the sheet's rails, crosses and counter (`editor-1440-light.png`). `T:docs/brand.md` 254 says the identity never draws on the customer's slide.
- B overturns `T:docs/brand.md` 65 to 71, which rules out a speed glyph for this name. B states this and asks Kevin.

### Product 8

- The name is the largest element on the first screen of /home and is read before anything else (`home-1440-light.png`, `home-390-light.png`).
- The /decks bar carries the wordmark at 18 px tall and it reads "Turboslide" at 1x (`decks-1440-light.png`).
- The first screen shows the editor itself below the hero (`home-1440-light.png`), so a seller sees the product before reading about it.
- Sign In sits in the editor's title row and the /decks bar (`editor-1440-light.png`, `decks-1440-light.png`).
- The tab icon is the T of the name (`favicons-side-by-side.png`). The tab and the page carry the same letter.
- The points lost: the editor's title row and the Sign in dialog's head show the monogram alone. The speed register says racing, which round four ruled out on naming grounds. B did not check the Turborepo and Turbopack marks today (B risk 1).

### Legibility 8

- The 16 px drawing reads as a T with bars on a light and a dark tab strip (`marks-light.png` and `marks-dark.png` tab strips, `favicons-side-by-side.png`).
- The 180 px touch icon is the clearest app icon of the three (`marks/apple-touch-icon.png`).
- At 22 px in the title row the T and its bars read in both themes (`title-rows-3x.png`). The cut through the stem is 1.4 px at 1x and reads soft, as B risk 6 says.
- The 32 px tile is antialiased into 49 colours, and its slanted edges are soft at 1x (`favicons-side-by-side.png`).
- On a phone the editor keeps the whole deck name, an icon Slideshow, Share and More (`editor-390-light.png`).
- On a phone /home shows the name, the heading, the lead and both buttons above y 502 (`home-390-light.png`).
- The phone /home navigation drops Documentation and the appearance control (`home-390-light.png`).
- Both themes hold on every surface.

### Restraint 7

- The Sign in dialog is the plainest of the three: the monogram, the heading, one sentence, Google's button, one note and Cancel (`signin-1440-light.png`, `signin-390-light.png`).
- No picture material appears on any surface.
- The weight 800 wordmark on /home is about 1,020 px wide, and it states the name that the lead sentence states again.
- The customer's blank slide carries the sheet's rails and crosses (`editor-1440-light.png`).

### Buildability 4

- The generator needs fontkit, which the tree does not have, or a port of the widening, slant and cut to the fontTools venv the tree already uses (B risk 11).
- `T:packages/theme/src/brand.ts` lines 48 to 286 change, and `brand.test.ts` (662 lines) is rewritten (B, files a build round would change).
- Every tab, touch, manifest and ICO icon, the card, the README pictures and the CLI banner are regenerated.
- Two drawings, the vector monogram and the 16 px rows, have to change together (B risk 5).
- The surface work is the same size as A's and C's. Two to three pipeline days is tight.

## Direction C

### Fidelity 7

- The 1104 px column, crosses, hatch strip and site type ladder of slide 29 hold (`home-1440-light.png`).
- The /home facts are a key and value list with Heroicons in the key cells (`home-1440-light.png`). That is DECK-GRAMMAR 36 and 40 as written.
- /decks is ruled rows (`decks-1440-light.png`), and Slideshow keeps the 8 px of `P:DESIGN.md` 430 with the label first (`editor-1440-light.png`).
- The mood pictures carry title and credit plates (`home-1440-light.png`, `signin-1440-light.png`).
- The gloss field draws ink 114 px past the right rail, and stops 51 px short of the viewport edge. The field is neither inside the column nor a full-bleed band, which `P:DESIGN.md` section 3 requires.
- The Oxford English Dictionary crop cuts words at the dialog edge ("A book dea", `signin-1440-light.png`). DECK-GRAMMAR 66 names a picture cropped through content as a defect.
- The customer's slide carries the sheet's rails, crosses and counter (`editor-1440-light.png`), against `T:docs/brand.md` 254.
- The mark predates the speed set. The page moves to the new deck while the mark stays where round four left it.

### Product 6

- /home names the product in live text beside the glyph, and the facts rows explain menus, export and agents with numbers (`home-1440-light.png`).
- The Sign in copy says what moves to the Google account and that work continues without one (`signin-1440-light.png`).
- No mockup surface shows a way to open Sign in. A grep of `brand-c/mock` finds "Sign in" only in `signin.html`. The /home navigation and the editor title row have no Sign In.
- The Sign in dialog never names the product. Its head is a 16 px glyph alone (`signin-1440-light.png`, `signin-390-light.png`).
- The gloss picture is a medieval manuscript. It tells a seller nothing about slides.

### Legibility 6

- The 16 px tile is crisp in 3 colours and reads as a window glyph, with nothing that names the product (`favicons-side-by-side.png`, `marks-1440-light.png`).
- In the title row the 24 px square glyph sits beside the deck name and reads the same way (`title-rows-3x.png`).
- The account chip beside Assist is a 7 cell dithered pattern (`brand-c/mock/mock.js` 47 to 58, round three's identity chip). At 1x it reads as noise (`title-rows-3x.png`).
- The phone editor is the clearest of the three: one Menus key, the whole deck name, Share and Slideshow (`editor-390-light.png`, `editor-390-dark.png`).
- On a phone /home opens on a cropped band of handwriting above the heading (`home-390-light.png`).
- Both themes hold on every surface.

### Restraint 6

- The gloss field takes the right half of the first screen, and the dictionary takes the right half of the Sign in dialog.
- The title row carries Last edit words and the dithered chip (`editor-1440-light.png`).
- Assist has no sparkle, and the facts list replaces the section icons that stood before headings.

### Buildability 8

- The mark, the tab icons and the touch icon do not change (C note, and the hashes above).
- The field step reuses the tree's `ditherGray` and `encodePng1`, and the four PNG pairs total about 29 KB (C note, "Cost").
- The phone editor's Menus key is a new layout that C did not drive (C risk "The phone editor is a new layout").

## The winner under this lens: B

B and C tie at 33 of 50, and A has 32. B wins the tie under this lens because it leads on the two criteria the lens exists to judge: product (8 against 6) and legibility (8 against 6). B is the only direction where a seller reads the product's name on the first screen of /home at both widths and sees the same letter in the browser tab. B is the only direction where Sign In is in the editor's title row. B's weaknesses are the cost to build the mark and its distance from the deck's mood material and weight cap. Kevin's answer on the speed register (`T:docs/brand.md` 65 to 71, B open question 1) decides whether B can ship at all. If he keeps round four's rule against speed glyphs, C is the winner under this lens, with the grafts below applied to it.

## Ideas to graft into B

From A:

1. Draw the blank template's slide as plain white with no rails, crosses or counter (`brand-a/shots/editor-1440-light.png`). B and C both keep the sheet's grammar on the customer's slide, against `T:docs/brand.md` 254.
2. Put Sign In in the /home navigation (`brand-a/shots/home-1440-light.png`). B's /home has no way to sign in.
3. Put the name beside the mark in the Sign in dialog's head (`brand-a/shots/signin-1440-light.png`). For B this is the wordmark at 18 px, as on /decks.
4. Set the selection ring to #2f5ce0 with the chip's text at #ffffff in both appearances (A rule 9, C rule 10). B keeps `SELECTION_COLORS` unchanged (`brand-b.md`, the brand.ts row of the build table), so its ring stays today's #1a73e8 and #3d86f0.
5. Set the manifest colours to #ffffff (A rule 13), the paper a first visit falls back to.

From C:

1. Use the key and value facts rows on /home with Heroicons in the key cells (`brand-c/shots/home-1440-light.png`). They follow DECK-GRAMMAR 40, and they tell a seller what the product does in numbers.
2. Use one Menus key on the phone editor (`brand-c/shots/editor-390-light.png`) in place of five menus and a More key.
3. Use the 1104 px column, the hatch strip at a topic change and the slide 29 type ladder (C rules 3 and 4). B keeps the 1120 px rail and draws no hatch strip.
4. Keep the phone /home navigation's Documentation and appearance control, as C does in a 390 px bar (`brand-c/shots/home-390-light.png`).

Not grafted: the mood pictures of A and C. Under this lens they cost half of the first screen and half of the Sign in dialog and tell a seller nothing about slides. If Kevin wants the deck's material in the product, the 404 page and the empty /decks state are places where it costs no first screen. This judge did not mock those.

## Not read and not done

- Production was not opened. No deck was created. No server was started.
- The realtime branch, `docs/REALTIME.md` and `docs/CLOUDFLARE.md` were not read.
- Google's branding page was not fetched by this judge. Every claim about it is a direction's reading.
- The Prototemplate slides, `P:src/lib/marks.ts` and `P:motion/MOTION.md` were not opened. Claims about them come from the audits and the directions, with the lines they cite.
- The directions' SVG files and build scripts were not run or diffed.
- The Turborepo and Turbopack marks were not checked.
