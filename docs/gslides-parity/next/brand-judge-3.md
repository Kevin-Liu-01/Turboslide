# Brand judge 3: the product as a business

Written by brand judge 3 of the next/program workflow on 2026-10-01 between 20:09 and 20:20 PDT. The tree is /Users/kevinliu/repos/Turboslide-next on `next/program` at 94e8a5c3 (`T:` below). The brand source is Prototemplate (`P:` below), read only through the two audits and the three direction notes. The realtime branch is /Users/kevinliu/repos/Turboslide-realtime at 27afa3b0 (`R:` below), read with `git log` and `git diff --stat` only. Machine load (uptime): 78.12 at 20:09, 55.30 at 20:12 and 48.98 at 20:14. No number in this note is a timing.

No source file was edited, no git write was run, no server was started and production was not opened.

## What was read and looked at

- The notes `audit-brand-source.md` (346 lines), `audit-brand-surfaces.md` (125 lines), `brand-a.md` (182 lines), `brand-b.md` (142 lines) and `brand-c.md` (245 lines), all in full.
- Every picture each direction lists, opened one by one: 22 for A, 25 for B and 23 for C, 70 in all.
- From the tree: `T:docs/brand.md` lines 60 to 75, `T:README.md` lines 1 to 20, `T:apps/cli/src/commands/banner.ts` lines 1 to 80, the naming lines of `T:docs/gslides-parity/research-4/01-brand-references.md` (grep for the name risks: lines 29, 91, 276, 303, 374), and `T:docs/gslides-parity/next/brand-surfaces/raw/og-turboslide.png` (today's card).
- Line counts by `wc -l` and `grep -c .` on 2026-10-01: `T:packages/theme/src/brand.ts` 324 lines, `T:packages/theme/src/brand.test.ts` 613 non-empty lines, `T:scripts/build-brand.ts` 2,616 lines, `T:packages/chrome/src/brand.css` 226 lines, `T:apps/studio/src/routes/home.css` 467 lines.
- `git -C Turboslide-realtime diff --stat origin/main...HEAD` over the brand surfaces: only `packages/chrome/src/dialogs/SignIn.tsx` (159 lines changed) and `accounts.css` (14 lines added) overlap with the three directions.
- One pixel count on two pictures with Python and PIL: the dark pixels (luminance under 100) right of x 1280 in rows 70 to 760. `brand-c/shots/home-1440-light.png` has 15,292. `brand-a/shots/home-1440-light.png` has 0 in rows 70 to 610.

## The lens

Turboslide is sold to a seller who builds, presents and sends a deck (`T:apps/studio/src/components/home/copy.ts` heading, shown in every /home mockup). Under this lens a direction scores well when:

- the name Turboslide reads on every surface where the product introduces itself;
- the identity keeps what the name promises, speed, and does not contradict it;
- the relation to General Translation is legible without making a stranger learn GT first;
- the identity survives the small surfaces: the 16 px tab, the CLI banner, the README head and the OG card;
- a build round can land it in two to three pipeline days on top of the realtime lane.

## Scores

| Direction | Fidelity | Product | Legibility | Restraint | Buildability | Total of 50 |
| --- | --- | --- | --- | --- | --- | --- |
| A, the GT bar monogram beside the word | 8 | 5 | 7 | 7 | 7 | 34 |
| B, a Turboslide wordmark in the speed register | 7 | 9 | 8 | 8 | 6 | 38 |
| C, the round four mark on the deck grammar | 8 | 6 | 8 | 6 | 7 | 35 |

## Direction A

Fidelity 8. The page grammar follows slide 49 lines 24 to 29: the 1104 px column, one rail on each side, 9 px crosses and the hatch strip all draw in `brand-a/shots/home-1440-light.png` and `decks-1440-light.png`. The mark is the deck's own `P:public/marks/bar-monogram.svg`, copied byte for byte with its sha256 (`brand-a.md` line 15), which is the strictest reading of DECK-GRAMMAR 53. Two points cost it. The 1 CSS px per cell rule under 1024 px changes the 2 px cell rule (`brand-a.md` line 91). The five line CLI glyph in `brand-a/marks/cli-banner.png` does not read as G and T in the render.

Product 5. The lockup reads "GT Turboslide" (`lockup-sheet.png`). In the editor the home link is the GT monogram alone, and the word Turboslide appears nowhere on the screen (`editor-1440-light.png`, `editor-390-light.png`). The tab shows a third form, round four's slide and plate square (`favicon-sheet.png`, first and third tab strips). A seller therefore meets three identities: GT on the page, a square in the tab and the word in the lockup. The GT letters beside the word Turbo can read as a racing product (A's own risk 8, `brand-a.md` line 139). The company's precedent is that a product carries its own mark under the same rules (slide 16 line 8, quoted in `brand-a.md` line 132). The proto-cuneiform tablet that fills half of /home's first screen and the Sign in dialog tells GT's story of writing. It does not show the product a seller would use. The numbers row (9 menus, 193 actions, 0.003%) is the strongest seller copy of the three directions.

Legibility 7. The lockup holds at 18 and 22 px in both themes (`lockup-sheet.png`). The monogram holds at 16 px tall. The phone pages have no sideways scroll, and the deck name keeps "Untitled present..." in `editor-390-light.png`. The CLI glyph and the GT letters at 16 px in the title row are the weak sizes.

Restraint 7. The chrome is clean and square, Assist is a word and the Sign in dialog has no Cancel button. The picture cell takes 280 px of a 720 px dialog (`signin-1440-light.png`) and half of /home's first screen (`home-1440-light.png`), which is material a seller does not need to sign in or to start a deck.

Buildability 7. The app icon files stay byte identical. The monogram is one vendored file and one constant. The lockup is live text beside an inline SVG. The new work is the tablet JPG pair, the hero split, the banner sampler and a two column Sign in on `SignIn.tsx` and `accounts.css`, which the realtime lane is changing now (159 and 14 lines on `R:`).

## Direction B

Fidelity 7. The mark follows the speed register of `P:src/lib/marks.ts` 73 to 104: a 12 degree slant, one 8 unit cut, three bars into the T, one path in `currentColor` with no mask and no id (`brand-b/pictures/marks-light.png`). The page grammar holds on /home and /decks: rails, crosses and ruled rows (`home-1440-light.png`, `decks-1440-light.png`). It is the only direction that carries the deck's main change since 2026-09-14, the speed register of slides 17 to 23 (`audit-brand-source.md` section 13), into the product's own mark. It loses points on four deck rules:

- The outlines are weight 800 against the 500 cap of DECK-GRAMMAR 20. B's argument is that the GT speed marks are outlines of 900 weight faces (`brand-b.md` line 65), and I accept it for a mark.
- Five of ten letters are narrower than tall against `marks.ts` line 77 (`brand-b.md` line 52).
- The 16 px drawing is written by hand as rows in the generator (`brand-b.md` line 66), against DECK-GRAMMAR 53.
- No surface carries the deck's dither or mood material, and no hatch strip shows in the first screens.

Product 9. The wordmark states the name and the speed the name promises in one form (`marks-light.png`). The same T with its bars is the tab icon, the touch icon, the title row mark and the CLI glyph, so a seller learns one identity (`marks-light.png`, the tab strips and the 180 px touch icon; `brand-b/marks/apple-touch-icon.png`). It joins GT the way the deck says a product should, with its own mark under the same rules (slide 16 line 8). /home leads with the name across the column and then shows the editor itself (`home-1440-light.png`), which sells the product. Two gaps: no page names General Translation, and the name risks of `T:docs/gslides-parity/research-4/01-brand-references.md` line 276 (other goods sold as Turboslide, Vercel's Turbo family) were not checked today by B or by me. B keeps the word whole, with no gradient and no chevron pair, which meets the Vercel constraints that line 276 states.

Legibility 8. The wordmark reads at 18 px tall in the /decks bar in both themes (`decks-1440-light.png`, `decks-1440-dark.png`). The 16 px favicon decodes to 3 colours and reads as a T with bars in both tab strips (`marks-light.png`, `marks-dark.png`; `brand-b/marks/favicon-16.png`, `favicon-16-dark.png`). The phone editor keeps the full deck name, Slideshow and Share (`editor-390-light.png`). The cost is the soft cut at 22 px on a 1x screen, where the cut is 1.4 px (`brand-b.md` line 117).

Restraint 8. There is no picture material. The Sign in dialog is one column with one method (`signin-1440-light.png`). The one loud element is the 110 px wordmark across /home's column, and it is the product's name. On a phone the wordmark and the heading stack as two titles (`home-390-light.png`). The dialog keeps a Cancel button where the close glyph and Escape would do.

Buildability 6. B changes the most files of the mark set:

- `T:packages/theme/src/brand.ts` lines 48 to 286 give way to the new geometry.
- `brand.test.ts` (613 non-empty lines) and `T:apps/studio/src/brand-files.test.ts` follow.
- `T:scripts/build-brand.ts` (2,616 lines) loses the outline step or gains fontkit, which the tree does not have and which cannot instance the variable WOFF2 (`brand-b.md` line 24).
- Every icon file and the card are regenerated.

The build round can cut that risk by committing the generated paths as data and keeping the generator as a documented script, which B's own `--check` plan allows (`brand-b.md` line 97). The surface work is the smallest of the three: no picture pipeline, and a Sign in dialog closest in shape to the realtime branch's single column. B overturns `T:docs/brand.md` lines 65 to 71, so Kevin's yes has to come before the build round starts.

## Direction C

Fidelity 8. C carries the most complete grammar:

- the site ladder of slide 29;
- key and value rows with icons in key cells (`brand-c/shots/home-1440-light.png`);
- ruled rows on /decks;
- square chrome with the named exceptions;
- monospace only on the panel, and no smooth scroll;
- the field pictures at 2 px cells.

It does not take up the speed register, which is the deck's main change since 2026-09-14. The /home field crosses the column: the pixel count finds 15,292 dark pixels right of x 1280 in rows 70 to 760, outside the rail at x 1271 (`home-1440-light.png`). On the phone the field runs from x 0 across the 16 px gutter (`home-390-light.png`). One rail drawn once by the column (`P:DESIGN.md` 177 to 184) then has a picture over it.

Product 6. The lockup reads "Turboslide" plainly in Inter 500 (`decks-1440-light.png`). The mark is a square with a lighter rectangle in its lower half, which says "slide" and says nothing about speed (`brand-c/marks/favicon-16.png`). The pictures are a medieval marginal gloss on /home and the 1897 OED entry for "Dictionary" in Sign in (`home-1440-light.png`, `signin-1440-light.png`). They tell GT's story of language to a seller of decks, and C names this as its own risk (`brand-c.md` line 196). The Sign in head draws the mark alone at about 16 px with no name, so the dialog does not say whose account it is (`signin-1440-light.png`). The three facts rows (Menus, Export, Agents) are good seller copy.

Legibility 8. Inter 500 reads at every size in both themes. The tile is byte identical to the shipped tab icon and has already been measured at 16, 32 and 48 px (`T:docs/brand.md` lines 75 to 90, cited by `brand-c.md`). The CLI banner is unchanged and reads (`marks-1440-light.png`, Terminal row). The weak points are the dictionary crop that cuts words at the dialog's edge ("dea", "or c" in `signin-1440-light.png`) and the information key over the field on the phone sheet (`signin-390-light.png`).

Restraint 6. The gloss field takes half of /home's first screen and passes the rail. Half of the Sign in dialog is a cropped picture. The account chip is a dither avatar placed before Assist (`editor-1440-light.png`). On the phone a new Menus key folds the menu bar (`editor-390-light.png`). That fold is new scope, which C names as not built or driven (`brand-c.md` line 198).

Buildability 7. No mark file changes, and the touch icon has 0 of 97,200 bytes different (`brand-c.md` line 12). The new work has five parts:

- a field step in `build-brand.ts` (resize, ramp, `ditherGray`, `encodePng1`, four PNG pairs);
- two mood JPGs copied with their credits;
- the ladder tokens;
- a 760 by 440 two column Sign in rewritten on the realtime lane's files;
- the phone editor's Menus layout.

The last two carry the risk.

## The small surfaces

| Surface | A | B | C |
| --- | --- | --- | --- |
| 16 px tab | Round four's square, byte identical; the page shows GT (`brand-a/marks/favicon-sheet.png`) | The T with bars as a 3 colour pixel drawing (`brand-b/marks/favicon-16.png`) | Round four's square, byte identical (`brand-c/marks/favicon-16.png`) |
| CLI banner | Five lines, 41 columns, the GT monogram beside "Turboslide"; the glyph does not read as G and T in `cli-banner.png` | Six lines from the 16 px drawing; reads as the T with bars (`marks-light.png`, The CLI banner) | Today's four lines, unchanged (`marks-1440-light.png`) |
| README head | The lockup pair; not rendered | The wordmark pair; not rendered | The stacked lockup again, as outlines; not rendered |
| OG card | Lockup and the tablet field; not rendered | The wordmark on the plate; not rendered | The address moves to Inter; not rendered |
| Product name on the editor screen | Absent (GT monogram only) | The T monogram; the name is in the tab | The square; the name is in the tab |

Today's banner is the four line square beside "Turboslide 0.0.0" (`audit-brand-surfaces.md` lines 59 to 64). Today's card is the round four lockup over the liquid metal dither field with the address in monospace (`brand-surfaces/raw/og-turboslide.png`). No direction rendered a README head or a card, so those two surfaces were scored on the notes alone.

## Winner

B wins under this lens, 38 of 50. It is the only direction where the name, its promise and the mark are the same thing on the page, the tab, the touch icon and the terminal. It ties Turboslide to GT through the register Kevin chose for GT on 2026-09-29, which follows the deck's own rule for products (slide 16 line 8). It also has the least surface work: no picture pipeline, and a Sign in dialog closest to the realtime branch's shape. Its cost sits in the mark files and the tests, and committing the generated paths as data contains it.

## Ideas to graft

1. From A: the vendored mark discipline. Commit B's wordmark and monogram paths with a sha256 in `brand.ts`, and have `build-brand.ts --check` compare them (`brand-a.md` line 115). The build then does not need fontkit or the widening code.
2. From A: one line that names the company. Put a footer sentence on /home and in the README, such as "Turboslide is made by General Translation.", with the GT mark set inline as DECK-GRAMMAR's rule for a standalone GT requires (head.html 70 to 74, `audit-brand-source.md` section 2 item 7). B has no page that names GT.
3. From A: the numbers row with the three figures from `T:packages/theme/brand/facts.json` under B's hero (`brand-a/shots/home-1440-light.png`).
4. From C: the key and value facts rows with Heroicons in key cells, the full slide 29 type ladder and the hatch strip of slide 49 on /home and /decks (`brand-c/shots/home-1440-light.png`).
5. From A: the Sign in dialog without Cancel (the close glyph and Escape close it), and Google's dark button on dark chrome with the G on a white disc (`brand-a.md` line 94; `brand-c.md` rule 12).
6. From A and C, shared: the selection ring `#2f5ce0` in both appearances with `#ffffff` chip text, the workspace following the chrome while the slide keeps its deck's appearance, the manifest colours `#ffffff`, and the card's address in Inter.
7. From C: the one status phrase rule for the title row (`brand-c.md` rule 7).
8. Keep out: the mood pictures on the seller's path (/home's first screen and Sign in). If Kevin wants the deck's material in the product, the card and the Not found page are the places, because there the picture carries no task.

## What the build round needs first

1. Kevin's yes on joining the speed register, which overturns `T:docs/brand.md` lines 65 to 71 and research-4/01 line 303 item 12 (a speed line).
2. Kevin's yes on outline weight 800 for a mark under DECK-GRAMMAR 20.
3. A name check of "Turboslide" against the goods named in research-4/01 line 276, fetched on the day. Neither B nor this note did it.
4. A hinted 24 px title row drawing, or a 24 px slot, so the cut does not go soft at 1x (`brand-b.md` line 117).
5. The Sign in dialog lands after the realtime lane's `SignIn.tsx` and `accounts.css` reach main, because all three directions edit those two files.

## Not read

- The Prototemplate files themselves. This judge read them only through the audits and the direction notes.
- Any README head or OG card under A, B or C, because none was rendered.
- The trademark and naming listings of research-4/01 sources NM1 to NM3 and V1, V10 and V11, which were not fetched today.
- Production, the Vercel and Cloudflare settings, and the Google console.
- `R:docs/REALTIME.md` and `R:docs/CLOUDFLARE.md`. Only the `--stat` of the overlapping files was read on the realtime branch.
