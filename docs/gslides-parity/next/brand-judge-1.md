# Brand judge 1: fidelity and restraint

Written by brand judge 1 of the next/program workflow on 2026-10-01 between 20:08 and 20:25 PDT. The tree is /Users/kevinliu/repos/Turboslide-next at 94e8a5c3 (`T:` below). The brand source is /Users/kevinliu/repos/Prototemplate at 58af25b on `speed-marks` (`P:` below), read only. Machine load (`uptime`) was 82.31 at 20:09 and 85.42 at 20:18. No number in this note is a timing.

My lens is fidelity to the brand deck as Kevin set it and restraint. Fidelity covers every rule of `P:deck/DECK-GRAMMAR.md`, the avoid list of `P:deck/slides/39-avoid.html` lines 9 to 17, the speed marks as the newest direction Kevin chose, and the GT dashboard and Prototemplate as the sister products he reviews. Restraint means no clutter and nothing decorative.

## What I read and looked at

- `audit-brand-source.md` and `audit-brand-surfaces.md` in this folder, in full.
- `brand-a.md`, `brand-b.md` and `brand-c.md` in this folder, in full.
- `P:deck/DECK-GRAMMAR.md` (66 lines), `P:deck/slides/39-avoid.html` lines 9 to 17, `P:deck/slides/16-mark.html` lines 1 to 12, `P:deck/slides/49-shell-numbers.html` lines 24 to 29, `P:src/lib/marks.ts` lines 70 to 110, `P:motion/MOTION.md` lines 130 to 149, and `T:docs/brand.md` lines 60 to 72.
- Two reference pictures from the source: `P:deck/preview/contact-speed.jpg` (the seven speed slides in both themes) and `P:.pagecheck/shots/production-signin-1440x900-light.png` (the GT dashboard's sign in plate, written 2026-10-01 10:37).
- Three mockup sources, to check what the pictures show: `brand-b/render-mockups.mjs` lines 264 and 338, `brand-c/mock/home.html` lines 20 to 38, `brand-c/mock/mock.js` lines 47 to 58, `brand-c/mock/editor.js` line 25 and `brand-c/mock/decks.html` line 74.
- Kevin's recorded verdicts in the session memory: `pr-screenshots-and-gallery.md` line 3 (every auth-adjacent page sits on the auth plate), `dashboard-deck-grammar.md` lines 3 and 11 (too busy, boxed tiles, use the dither material), and `speed-marks-set.md` lines 3 and 8 (the race-type GT set chosen on 2026-09-29 to "flex").

I opened every picture each direction lists with the Read tool: 22 for A, 25 for B and 23 for C. I also cropped the B wordmark from `brand-b/pictures/marks-light.png` with `sips` into the session scratchpad to read its cut. Every direction is scored on its pictures and its note. None is scored on its note alone.

## Scores

Each criterion is out of 10 and the total is out of 50.

| Direction | Fidelity | Product | Legibility | Restraint | Buildability | Total |
| --- | --- | --- | --- | --- | --- | --- |
| A: GT bar monogram lockup | 8 | 6 | 7 | 7 | 8 | 36 |
| B: Turboslide speed wordmark | 6 | 8 | 8 | 7 | 5 | 34 |
| C: round four mark on the deck grammar | 7 | 7 | 8 | 7 | 8 | 37 |

The winner is C by one point. A leads on fidelity because it carries the speed mark Kevin chose. C leads on legibility and product, and its surfaces follow more of the deck's rules and the sister plate. The mark decision stays open for Kevin, and the first graft below answers it.

## Direction A

### Fidelity 8

What follows the deck:

- The mark is `P:public/marks/bar-monogram.svg` vendored byte for byte, so it is never redrawn (DECK-GRAMMAR 52 to 53). Kevin chose this set on 2026-09-29 (`speed-marks-set.md` line 8). The film brief names it the hero mark (`P:motion/MOTION.md` 145).
- The page grammar matches slide 49 lines 24 to 29. In `brand-a/shots/home-1440-light.png` the column runs from x 168 to x 1272, which is 1104 px. The page has a 58 px bar, 9 px crosses at the seams and a hatch strip at y 785 to 809. `decks-1440-light.png` repeats the hatch between its two sections.
- `decks-1440-light.png` draws ruled rows with framed thumbnails (DECK-GRAMMAR 39). Every button is square, which is stricter than the 8 px Present exception of `P:DESIGN.md` 430.
- The tablet carries the mood slide's plate at the lower right with its title, one sentence and the credit (`home-1440-light.png`; slide 14 lines 8 to 11). This uses the deck's newest material from commit 3759853.
- The Sign in dialog is a plate with a picture cell and a credit (`signin-1440-light.png`). This follows Kevin's rule that auth sits on the plate (`pr-screenshots-and-gallery.md` line 3).
- The selection becomes `#2f5ce0`, which fixes rank 16 of the surfaces audit. The slide keeps its own appearance in dark chrome (`editor-1440-dark.png`).

What breaks it:

- Slide 16 line 8 gives a GT product its own mark: "Locadex has its own mark under the same rules." A puts the company's mark where the product's mark belongs.
- Slide 16 line 7 still calls the speed set "the September 2026 exploration" beside the current mark. The dashboard plate still heads with the doubled-line GT mark (`production-signin-1440x900-light.png`).
- A ships two marks. The tab shows the slide and plate square, and the page shows GT (`brand-a/marks/favicon-sheet.png`, the first and third rows). Slide 16 line 8 says a mark "appears only where it has a function", and a reader has to learn two.
- The tablet crop at 2 px cells comes close to the crop that `P:deck/shots/OPENERS.md` line 10 refuses, where the dither itself is the subject. At 390 px it reads as texture (`home-390-light.png`, `signin-390-dark.png`).

### Product 6

- The nav reads "GT Turboslide" (`home-1440-light.png`, `brand-a/marks/lockup-sheet.png`), so the product name has no mark of its own.
- The tab icon and the page mark are unrelated shapes (`favicon-sheet.png`, the tab strips).
- The numbers row sells with mechanisms: 9 menus, 193 actions and 0.003 percent (`home-1440-light.png`). That follows slide 62 line 6.

### Legibility 7

- The monogram holds at 16 px tall (`lockup-sheet.png`).
- The 62.45 px home link leaves the deck name "Untitled present..." at 390 px (`editor-390-light.png`; A's risk 6).
- On the phone the picture comes before the heading (`home-390-light.png`).
- Both themes read. The dark Google G sits on a white disc (`signin-1440-dark.png`).

### Restraint 7

- /decks and the editor are the quietest of any direction (`decks-1440-light.png`, `editor-1440-light.png`).
- The tablet field is the densest texture in the 70 pictures I opened, on /home and again in Sign in.
- The lockup puts two names in the nav.

### Buildability 8

- The app icon files rebuild byte identical.
- The mark is one vendored SVG with its sha256 checked.
- The CSS grammar and the picture copy are small files.
- The dialog waits on the realtime lane (A's risk 9).

## Direction B

### Fidelity 6

What follows the deck:

- B is the only direction that gives Turboslide a member of the register Kevin chose. The register is a 12 degree slant, an 8 unit cut, three bars into the first letter and one color in currentColor (`P:src/lib/marks.ts` 73 to 104). A product member keeps slide 16 line 8.
- Every file is one path with no font, mask or id (`brand-b/marks/`).
- The editor, /decks and Sign in draw ruled rows, Heroicons and Title Case buttons (`editor-1440-light.png`, `decks-1440-light.png`).

What breaks it:

- B builds width by cutting Inter's counters and inserting runs. No GT speed mark is generated from Inter outlines (`audit-brand-source.md` section 11). The GT set takes its width from rectangles or from wide faces at width 150.
- The result fails two rules of the register. "Every letter is wider than it is tall" (`marks.ts` line 77) holds for 5 of 10 letters (B's risk 3). The cut sits 3.81 units under mid cap height (`marks.ts` line 87).
- The b and d bowls show a notch at the inserted run (`marks-light.png`, the wordmark at the top). At 18 px the cut does not show (`decks-1440-light.png`).
- The 16 px tab icon is pixel rows written by hand in the generator (`FAV16`). DECK-GRAMMAR 53 says a mark is never redrawn by hand.
- The column is 1120 px (`brand-b/render-mockups.mjs` lines 264 and 338). Slide 49 line 24 sets 1104 px. The mockups have no hatch strip (0 matches for "hatch" in render-mockups.mjs) against slide 49 line 29.
- B uses none of the deck's mood pictures, which are the newest material (commit 3759853). Kevin asked for the dither material when he reviewed the dashboard (`dashboard-deck-grammar.md` line 11).
- The Sign in dialog is a plain box with Cancel (`signin-1440-light.png`). It does not use the plate Kevin requires for auth pages (`pr-screenshots-and-gallery.md` line 3).
- The note leaves the selection color unaddressed, so the Google blue of surfaces audit rank 16 stays.
- In dark mode /decks draws the blank template as an ink tile (`decks-1440-dark.png`, x 184 to 376), while the editor draws the same blank slide white (`editor-1440-dark.png`). This is the appearance split of surfaces audit rank 5.

### Product 8

- B carries the strongest name. One family covers the tab, the touch icon, the title row and the CLI (`marks-light.png`; `brand-b/marks/apple-touch-icon.png`).
- The /home first screen leads with the name (`home-1440-light.png`).
- The naming risk that round four wrote down still applies (`T:docs/brand.md` lines 65 to 71). B did not check it today.
- The first screen has no proof row.

### Legibility 8

- The 16 px T with bars reads in both tab strips (`marks-light.png`, "Tab strips").
- The deck name stays whole at 390 px (`editor-390-light.png`).
- Both themes hold.
- The cut at 1x (B's risk 6) and the dense 18 px wordmark in the /decks bar cost a point.

### Restraint 7

- Sign in, /decks and the editor carry nothing extra (`signin-1440-light.png`, `decks-1440-light.png`).
- On /home the weight 800 wordmark spans the column at about 1020 px (`home-1440-light.png`). The headline under it repeats the name's job, so the first screen has two heroes.

### Buildability 5

- fontkit is not a dependency of the tree.
- The fontTools instancing step is new.
- `brand.test.ts` (662 lines) has to be rewritten.
- Every icon, the ICO and the card are regenerated.
- `T:docs/brand.md` lines 65 to 71 have to be overturned with Kevin's yes first.
- The /home and plate work is still to do on top of the mark.

## Direction C

### Fidelity 7

What follows the deck:

- The surfaces follow more of the deck's rules than A or B:
  - the 1104 px column, 58 px bar, crosses and hatch (`home-1440-light.png`)
  - the slide 29 ladder (C rule 4)
  - facts rows with Heroicons in key cells (DECK-GRAMMAR 40; `home-1440-light.png`, Menus, Export and Agents)
  - the /home command moved to the `#101010` panel (DECK-GRAMMAR 31)
  - `scroll-behavior: smooth` removed from BookView (avoid list, line 11)
  - square chrome apart from the named radii of `P:DESIGN.md` 430
- Sign in follows the sister plate most closely. The plate column sits on the left and the field on the right, as in `production-signin-1440x900-light.png`. Under 800 px it becomes a full sheet (`signin-390-light.png`).
- The gloss and OED fields read as writing with a credit plate (`home-1440-light.png`, `signin-1440-light.png`).
- The mark keeps slide 16 line 8, because the product keeps its own mark.

What breaks it:

- C declines the speed register Kevin chose on 2026-09-29 (DECK-GRAMMAR 50 to 53; `speed-marks-set.md` line 8). The deck's newest identity work does not reach the product.
- The /home field is set at `left: 50%; right: 0` (`brand-c/mock/home.html` line 20). It runs past the right rail into the margin, from x 1271 to about x 1390 in `home-1440-light.png`. Slide 49 line 24 says the column has "nothing outside it".
- /decks has no hatch strip between its sections (`decks-1440-light.png`, y 302). C's rule 3 calls for one there.
- The mockups set the Google button label in Arial (C's risk 1).

### Product 7

- The pages sell. The facts rows and the Sign in copy say what moves where ("The presentations you made in this browser move to your Google account.").
- The phone editor keeps the deck name and Share (`editor-390-light.png`).
- The mark is a square with a window, which reads as a generic app glyph (`brand-c/marks/favicon-16.png`, `marks-1440-light.png`). It does not carry the name.

### Legibility 8

- The phone editor is the clearest of the three. One Menus key replaces the menu bar (`editor-390-light.png`).
- The bands crop to legible writing on the phone (`home-390-light.png`, `signin-390-dark.png`).
- The 16 px tile is today's tile.
- The Sign in head shows the mark alone at 16 px with no name (`signin-1440-light.png`, x 389).

### Restraint 7

- The title row and the /decks bar keep round three's generated pixel identity chip (`brand-c/mock/mock.js` 47 to 58; `editor-1440-light.png` x 1029; `decks-1440-light.png` x 1216). It reads as pattern noise.
- The dither fade leaves stray cells left of the gloss (`home-1440-light.png`, x 730 to 900).
- Otherwise the pages hold to rows and seams.

### Buildability 8

- The mark files rebuild byte identical.
- The fields use the tree's own `ditherGray` and `encodePng1`. They are about 29 KB of PNGs in all.
- The phone editor's Menus key is new layout work that needs the clutter lane and a driven run (C's risk 7).

## Grafts into C

1. **The mark.** If Kevin says Turboslide joins the speed register, C takes B's square monogram as the product mark. That is the T with three bars under its left arm, clear of the stem, at a 12 degree skew, with the 8 unit cut splitting the middle bar (`brand-b/pictures/marks-light.png`, "The monogram by size"; `brand-b/marks/apple-touch-icon.png`).
   - Generate it from rectangles, the way `P:scripts/build-speed-marks.mjs` lines 94 to 142 build the GT T. Do not widen Inter outlines.
   - Set the word beside it as live Inter 500. Do not use B's outlined weight 800 wordmark.
   - This gives one product mark from the tab to the title row, in Kevin's newest register. It keeps slide 16 line 8.
   - If he says no, C's mark stands and `T:docs/brand.md` line 67 records why.
2. **The lockup.** From A, take the lockup geometry: the word's cap equals the mark's cap, the baselines meet, and the gap is half the cap (`brand-a.md`, "The lockup"; `brand-a/marks/lockup-sheet.png`). Put the lockup at the head of the Sign in plate, so the plate names the product.
3. **The picture cell.** From A, keep the /home picture inside the 1104 px column (`brand-a/shots/home-1440-light.png`, x 720 to 1271). This fixes C's field past the right rail (slide 49 line 24).
4. **The anonymous title row.** From B, show "Sign In" as text in the title row and the /decks bar for an anonymous visitor (`brand-b/pictures/editor-1440-light.png`). It replaces the generated pixel chip.
5. **The /decks hatch.** From A, draw the hatch strip between "Start a new presentation" and the list (`brand-a/shots/decks-1440-light.png`, y 278 to 303).
6. **The manifest.** From A, set the manifest `background_color` and `theme_color` to `#ffffff` (A rule 13; `T:packages/theme/brand/site.ts` 114 to 115).
7. **The scope sentence.** From A and B, add one foot sentence on the plate that names what Google gives. B's reads "Turboslide uses the name and the address of your Google account. It reads nothing else from Google after you sign in." (`brand-b/pictures/signin-1440-light.png`). It matches the default scopes B read in `@better-auth/core` 1.7.4.

Ideas I would leave out:

- A's square Slideshow. `P:DESIGN.md` 430 names the 8 px Present corner, and B and C keep it.
- A's one CSS px per cell on phones. C's 2 px bands read as writing at 390 px.
- B's wordmark across the /home hero.

## Where the three agree

These rules can go into the build round whatever mark Kevin picks. Each appears in all three notes and pictures:

- The doubled-line GT mark leaves the app chrome (`T:packages/chrome/src/Sidebar.tsx` 1038 and 1042).
- The blank template loses the GT mark and the wordmark band (surfaces audit rank 2).
- Assist is the word alone with no sparkle (avoid list, line 12).
- Title Case appears on buttons only (DECK-GRAMMAR 22).
- /decks shows ruled rows of the viewer's own and shared presentations (DECK-GRAMMAR 39).
- Each page has one rail on each side.
- Continue with Google uses Google's own button with the standard G.
- The passkey row is removed until passkeys exist.

## Open for Kevin

1. Does Turboslide join the speed register? A uses GT's mark, B makes a product member and C stays out. Graft 1 covers the yes.
2. Should the selection ring be `#2f5ce0` in both appearances? A and C say yes. B is silent.
3. Should Google's label be set in self-hosted Google Sans or in Google's rendered button? A sets Inter and C sets Arial in the mockups. All three notes quote Google's page as naming Google Sans Medium.

## Not read

- I fetched no URL today. Every quote from Google's branding page in this note comes from the direction notes, which fetched https://developers.google.com/identity/branding-guidelines on 2026-10-01.
- I did not read the realtime branch, `docs/REALTIME.md` or `docs/CLOUDFLARE.md`. I did not open production. I started no server and rendered nothing.
- I did not read the mark SVG files' path data, `brand-a/build.mjs`, `brand-b/marks-lib.mjs` or `brand-c/tools/`.
- Not drawn by any direction, so not judged: the OG card, the README head, the Not found page and the presenter view.
