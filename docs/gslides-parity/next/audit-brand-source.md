# Brand source audit

Written by the brand-source auditor of the next/program workflow on 2026-10-01, between 18:30 and 19:15 -0700. Machine load at 18:39 -0700 (uptime): load averages 50.54, 49.61 and 39.57. No number in this note is a timing.

The source of truth is the Prototemplate repository at /Users/kevinliu/repos/Prototemplate, read only. Its checkout is on the branch speed-marks at b20f0656 (2026-10-01 18:34:54 -0700, "Plate port: the gloss grid with only the ink lit"). Its working tree has a modified .gitignore and an untracked motion/ folder (git status). A path that starts with `P:` is in Prototemplate. A path that starts with `T:` is in /Users/kevinliu/repos/Turboslide-next at 94e8a5c3. "Slide NN" means P:deck/slides/NN-slug.html in today's 95 slide numbering, and "head.html" means P:deck/parts/head.html.

## What was read

- P:deck/DECK-GRAMMAR.md (66 lines), head.html (465 lines; the icon sprite lines read to 240 characters), P:deck/ROUND-5.md (40 lines), P:DESIGN.md (470 lines), P:BRAND.md lines 104 to 196, P:scripts/build-speed-marks.mjs (443 lines), P:src/lib/marks.ts lines 1 to 231, P:src/app/globals.css (98 lines), P:src/components/viewer/tokens.css (372 lines), the header of P:src/components/viewer/icons.tsx, P:.oxlintrc.json lines 1 to 80, the rule messages in P:scripts/oxlint-plugins/gt-ui.ts, P:deck/shots/OPENERS.md lines 1 to 56, 121 to 162 and 258 to 262, the headers of P:src/components/plate (plate.css, frame/PlateFrame.tsx, brand/FieldMoodPlate.tsx, brand/moodPictures.ts), and the untracked P:motion/MOTION.md lines 1 to 22 and 97 to 149.
- Slides, every line except inline SVG path data: 09, 11, 12, 14, 16 to 31, 33 to 39, 43, 47 to 50, 54, 60, 62 to 64 (credits only for 54 and 64), 74 to 76, 86 to 88.
- Pictures: P:deck/preview/contact-speed.jpg (the seven speed slides in both themes, written 2026-09-29 17:27) and P:deck/preview/s14-dark.jpg (the tablet mood slide, written 2026-10-01 10:54).
- No slide was rendered. The preview folder already holds every listed slide, and it is ignored by git (P:.gitignore line 10). The folder mixes numberings: s16-light.jpg is dated 2026-09-29 17:23 and predates the renumbering, while s17-light.jpg is dated 2026-10-01 11:56 (ls -T).

Not read: P:deck/parts/tail.html (the viewer script), P:src/app/craft, P:src/app/marks/MarksViewer.tsx and marks.css, P:deck/shots/OPENERS.md lines 57 to 120, 163 to 257 and 262 to 307, P:BRAND.md lines 1 to 103 and 197 to 241, the rest of P:motion/MOTION.md, and the slides not listed above.

## 1. Tokens

The deck names the tokens without a prefix (`--paper`). The Prototemplate shell prefixes them (`--pt-paper`). Turboslide already ports the shell names (T:packages/chrome/src/tokens.css lines 1 to 16).

| Token | Light | Dark | Source |
| --- | --- | --- | --- |
| paper | #ffffff | #070707 | head.html 13, 30; P:src/components/viewer/tokens.css 14, 91 |
| ink | #070707 | #f2f2f0 | head.html 14, 30; tokens.css 15, 92 |
| ink-2 | #3a3d44 | #b9bcc3 | head.html 15, 30; tokens.css 16, 93 |
| titanium | #8a8f98 | #8a8f98 | head.html 16, 30; tokens.css 17, 94 |
| hair, the structural line | rgba(7, 7, 7, 0.18) | rgba(242, 242, 240, 0.22) | head.html 17, 31; tokens.css 18, 95 |
| hair-soft, the row line | rgba(7, 7, 7, 0.09) | rgba(242, 242, 240, 0.1) | head.html 18, 31; tokens.css 19, 96 |
| plate, the second surface | rgba(7, 7, 7, 0.035) | rgba(242, 242, 240, 0.05) | head.html 19, 31; tokens.css 20, 97 |
| cross | rgba(7, 7, 7, 0.38) | rgba(255, 255, 255, 0.34) | head.html 20, 31; tokens.css 21, 98 |
| edge, the frame of a picture | rgba(7, 7, 7, 0.62) | rgba(242, 242, 240, 0.55) | head.html 178, 179; tokens.css 22, 99 |
| thumb, the scrollbar | rgba(7, 7, 7, 0.32) | rgba(242, 242, 240, 0.32) | head.html 178, 179; tokens.css 23, 100 |
| scrim | rgba(7, 7, 7, 0.28) | unchanged | tokens.css 24, 88 to 89 |
| panel ink, the code ground | #101010 | unchanged | head.html 171; tokens.css 25 |
| panel text | rgba(255, 255, 255, 0.87) | unchanged | head.html 171; tokens.css 26 |
| accent | #2f5ce0 | #86a8ff | P:DESIGN.md 24 to 26; P:BRAND.md 145 to 146; slide 26 line 12 |

The four absolutes are ink #070707, raised ink #101010, titanium #8a8f98 and paper #ffffff (P:DESIGN.md 14 to 19; P:src/app/globals.css 12 to 15).

Rules:

1. Draw with the tokens only. A raw color appears only inside the swatch and code panel rules that already exist (P:deck/DECK-GRAMMAR.md 28). On the live site the gt-ui rule no-hex-colors enforces this (P:scripts/oxlint-plugins/gt-ui.ts 1547 to 1556; P:.oxlintrc.json 50).
2. Every structural color is ink or paper at an alpha. Every hairline is the text color at a lower opacity (P:DESIGN.md 21 to 23; slide 26 line 5).
3. The color slide draws an ink ladder of 100, 63, 45, 27, 11 and 6 percent, named ink, body text, labels, quiet text, hairline and soft hairline (slide 26 lines 15 to 27). The deck's own hairline tokens use 18 and 9 percent (head.html 17 to 18).
4. A page carries one accent. The accent marks a small element such as an active state or a diagram highlight. It never fills a large area (P:DESIGN.md 24 to 26; slide 26 line 5).
5. The deck draws no accent on text, lines or fills. It shows the accent only as an outlined, labeled swatch (P:deck/DECK-GRAMMAR.md 29).
6. Shadows are not used. Depth comes from lines and texture (slide 26 line 5; P:BRAND.md 147 to 148).
7. The shell adds one corner token, `--pt-radius: 6px`, shared by the search pill, the segmented controls, the filter fields and the hover preview frame (P:src/components/viewer/tokens.css 46 to 54).

Contrast, computed today with the WCAG 2.2 relative luminance formula by a node script in the session scratchpad (2026-10-01 18:39 -0700):

| Pair | Ratio |
| --- | --- |
| titanium #8a8f98 on paper #ffffff | 3.25:1 |
| titanium on dark paper #070707 | 6.20:1 |
| ink-2 #3a3d44 on paper | 10.88:1 |
| dark ink-2 #b9bcc3 on dark paper | 10.59:1 |
| hair composite #d2d2d2 on paper | 1.51:1 |
| dark hair composite #3b3b3a on dark paper | 1.80:1 |
| hair-soft composite #e9e9e9 on paper | 1.21:1 |
| edge composite #656565 on paper | 5.83:1 |
| dark edge composite #888887 on dark paper | 5.68:1 |
| accent #2f5ce0 on paper | 5.63:1 |
| accent #2f5ce0 on dark paper | 3.58:1 |
| accent lift #86a8ff on dark paper | 8.69:1 |
| Turboslide light titanium #6f747d on paper | 4.70:1 |

Titanium on paper is under the 4.5:1 that WCAG 2.2 SC 1.4.3 asks of text. The deck sets every caption (`.cap`, 15px) in titanium (head.html 65; DECK-GRAMMAR 21). Turboslide already darkens its light titanium to #6f747d for this reason (T:packages/chrome/src/tokens.css 28 to 32).

## 2. Type

1. Inter is the only typeface for display, interface and text (P:deck/DECK-GRAMMAR.md 20, 24; P:BRAND.md 151 to 156; slide 27 line 6). The live site lints this with gt-ui inter-only (gt-ui.ts 1269 to 1281).
2. Display text is weight 500 at most. Bold text inside rows and scales is weight 500 (DECK-GRAMMAR 20; head.html 57 to 58, 99).
3. Long-form text is weight 400 (slide 27 line 6; P:BRAND.md 157 to 158). A live surface uses no weight under 400 (gt-ui no-thin-font, gt-ui.ts 1165 to 1172). Slide 27 lines 10 to 15 show 300 and 600 to 800 only as a specimen.
4. Headings, `.big` and h1 take `font-feature-settings: 'cv11', 'ss01'` and `text-wrap: balance` (head.html 58).
5. Monospace sets code on the #101010 panel in white and nothing else in the deck (DECK-GRAMMAR 31; head.html 170 to 172). It is never the brand voice (slide 39 line 9; P:BRAND.md 168 to 172; gt-ui mono-is-not-voice, gt-ui.ts 1576 to 1584).
6. Counters, swatch values and table numbers are tabular (head.html 51, 150, 215).
7. Every standalone "GT" in rendered copy is the GT mark at 0.74em high and 1.164em wide, with the letters kept as hidden text (head.html 70 to 74).
8. Other scripts fall back to system faces (head.html 24 to 26). CJK uses Hiragino Sans, Noto Sans CJK, PingFang SC and Apple SD Gothic Neo. Arabic uses Noto Naskh Arabic and Geeza Pro. Devanagari uses Noto Sans Devanagari and Kohinoor Devanagari.
9. Headlines, interface text and marks have to hold in CJK, RTL and Indic scripts as well as Latin (slide 28 line 10; P:BRAND.md 159 to 163).
10. Emphasis is a doubled underline in the text color. The accent is never applied to a heading (slide 29 line 13).

Tracking:

| Element | Letter spacing | Source |
| --- | --- | --- |
| h1, h2, .big | -0.025em | head.html 58 |
| the site hero | -0.038em | slide 29 line 17 |
| type ladder rows | -0.015em | head.html 143 |
| type specimen | -0.02em | head.html 133 |
| row keys, .plain rows, .lab diagram labels | -0.01em | head.html 99, 102, 159 |
| chrome titles (sidebar head, panel head, surface names) | -0.01em | head.html 209, 299, 317 |
| text, captions, small labels | 0 | head.html 134, 144 |
| the slide counter | 0.02em | head.html 51 |
| credit lines on picture plates | 0.01em | slide 14 line 11 |

The sheet ladder (1600 by 900):

| Role | Size and line height | Source |
| --- | --- | --- |
| h1 | 88px, 1.02 | head.html 59 |
| .big | 72px, 1.06 | head.html 61 |
| h2 | 44px, 1.1, 18px below | head.html 60 |
| .lead | 26px, 1.45 | head.html 64 |
| p | 22px, 1.5 | head.html 62 |
| .rows | 20px, 1.45 | head.html 98 |
| SVG labels | 20px in ink-2, .lab 26px in ink, never under 18px | DECK-GRAMMAR 21; head.html 157 to 160 |
| .cap | 15px, 1.45, titanium | head.html 65 |
| floor | text under 15px on the sheet is a defect | DECK-GRAMMAR 21 |

The site ladder:

| Role | Size and line height | Source |
| --- | --- | --- |
| hero | 3.7rem on desktop, 2.5rem under 720px | slide 29 lines 13, 17 |
| heading | 2.25rem, 1.18 | slide 29 line 18; P:DESIGN.md 334 |
| subheading | 1.375rem, 1.3 | slide 29 line 19; P:DESIGN.md 335 |
| title | 1.125rem, 1.35 | slide 29 line 20; P:DESIGN.md 336 |
| lead | 17px, 1.55 | slide 29 line 21; P:DESIGN.md 337 |
| body | 16px, 1.6 | slide 29 line 22; P:DESIGN.md 338 |
| small | 14px, 1.55 | slide 29 line 23; P:DESIGN.md 339 |
| label | 13px | slide 29 line 24; P:DESIGN.md 340 |

The viewer chrome: toolbar text and buttons at 13px, buttons 32px tall, the sidebar head at 13.5px, thumbnail titles and section labels at 12px, panel notes at 12.5px (head.html 209 to 236, 298 to 320; P:src/components/viewer/tokens.css 205 to 258).

## 3. The rail law and the sheet

1. The deck sheet is 1600 by 900. Two vertical rails sit 56px in from the left and right edges. Two rules sit 56px in from the top and bottom. All four are 1px in `--hair` (head.html 39 to 43; DECK-GRAMMAR 14).
2. An 11px registration cross with 1px arms in `--cross` sits where a rail meets a rule (head.html 44 to 49).
3. The slide is inset 57px and padded 72px top and bottom and 80px left and right, about 1326 by 642 usable (head.html 257; DECK-GRAMMAR 15). Text never touches a rail or a rule (DECK-GRAMMAR 15).
4. The wordmark sits bottom left in titanium, 18px high. The counter sits bottom right at 13px (head.html 51 to 52, 463 to 464; DECK-GRAMMAR 16).
5. A page has one rail on each side. The column wrapper draws the pair once with its own border-inline. A band inside the wrapper draws no side rails. A full-bleed band outside the wrapper draws its own pair once, at the column edges (P:DESIGN.md 177 to 184).
6. The outer pair at plus and minus 10px is retired everywhere. A second stroke beside a rail is a doubled-line defect (P:DESIGN.md 56 to 58, 185 to 188; gt-ui single-rail, gt-ui.ts 1612 to 1620).
7. The doubled line is a connector inside a diagram and is never a page rail (P:DESIGN.md 190 to 191).
8. Site measurements (slide 49 lines 24 to 29): the ruled column is 1104px wide with one hairline rail at each edge; the navigation bar is 58px tall; a 9px cross with 1px arms sits wherever a seam meets a rail; the layout has one breakpoint at 1023px; hero type has its own threshold at 720px; a hatch strip of 45 degree hairlines every 8px separates rows where the topic changes.
9. The hatch strip is one hairline under a repeating -45 degree gradient (P:DESIGN.md 75 to 78).
10. The shell's own rail token is 1170px (P:src/components/viewer/tokens.css 45). The 1104px column and the 1170px rail belong to different surfaces.

## 4. Rules and rows

1. Every line is drawn exactly once. The four defect classes are doubled lines within 4px, missing seams, self-stacks and invisible seams (P:DESIGN.md 42 to 52; slide 30 line 6).
2. The row owns every structural line. A cell never draws a border parallel to a row seam. A framed cell shows the ground through a 1px padding reveal (P:DESIGN.md 59 to 64).
3. Lists are ruled rows and never bullets. Cards with shadows, rounded corners, gradients and icon fonts are not used (DECK-GRAMMAR 39).
4. `.rows` is a key and value grid: a 240px key column (180px narrow), a 32px gap, 16px vertical padding (14px tight), 20px text, and a `--hair` rule above the first row and under each row (head.html 97 to 101; DECK-GRAMMAR 36). A value takes two lines at most (DECK-GRAMMAR 36).
5. `.plain` is a ruled statement list at 24px and weight 500, with `--hair-soft` between rows and `--hair` under the last (head.html 102 to 104). A struck statement is ink-2 with a 1.5px titanium line-through (head.html 105).
6. Chrome lines have three roles (P:DESIGN.md 102 to 108; slide 76 lines 32 to 34). Structural lines are `--hair` at 18 percent and divide the shell's large surfaces. Row lines are `--hair-soft` at 9 percent and separate list rows, results, table rows and the progress track. Frame lines are `--edge` at 62 percent and frame pictures only.
7. Ink appears on a border only as a state: a pressed button, the active frame, the count while it is edited, the solid call to action and a focused field (P:DESIGN.md 121 to 128; slide 76 line 35).
8. Where two components touch, one owns the seam. The owner table is P:DESIGN.md 130 to 146.
9. The sanctioned multi-stroke devices are the hatch spacer, the border cross, the doubled line and the sheet mat (P:DESIGN.md 73 to 90).
10. Chrome is radius 0 except five named elements: the search pill at 6px, its key chip at 4px, the Present button at 8px, the Prototemplate mark's color core and the sidebar nameplate (P:DESIGN.md 419 to 436).
11. A scroll region has a 4px gutter, no track rule, a 2px thumb in `--thumb` that widens to 4px under the pointer, no buttons and radius 0 (P:DESIGN.md 164 to 168; tokens.css 110 to 194; head.html 184 to 194).
12. A link in content stays in ink with a 1px `--hair` underline at a 5px offset that turns ink on hover (head.html 197 to 198).

Diagrams (slide 33 lines 21 to 28; DECK-GRAMMAR 42 to 48):

- Strokes are 1px or 1.5px in ink, ink-2 or hairline, with square caps and no rounded joins.
- Labels are 20px in ink-2 or 26px in ink, horizontal, and 12px clear of any line.
- A marker is an 11px filled square in ink. Arrowheads are never drawn.
- Objects use one isometric projection at 30 degrees with the light from the upper left and faces shaded 4, 9 and 15 percent (slide 35 lines 6 to 7; P:DESIGN.md 226 to 232).
- Links between objects use the doubled connector: one path stroked twice, a 1.5px gauge and a 3px gap, non-scaling, drawn as all outer strokes, then the pulses, then all inner strokes (slide 31 lines 11 to 12; P:DESIGN.md 200 to 217).
- A diagram is drawn only when it shows a relationship the text alone does not (DECK-GRAMMAR 48).

## 5. Icons and semantic colors

1. Icons are Heroicons 20 solid from one sprite (DECK-GRAMMAR 40; head.html 399 to 462).
2. The shell draws the same set at 16px as its only family, with no Lucide, no Unicode glyph icons and no icon fonts (P:src/components/viewer/icons.tsx 2 to 11).
3. The live GT surfaces use two tiers (gt-ui icon-tiers, gt-ui.ts 1204 to 1216). A glyph that carries meaning is Heroicons solid at 24 or 16. Lucide is allowed only for control glyphs: arrows, chevrons, close, copy, search, loaders and toggles. The sign-in plate follows this with an information circle from Heroicons 16 solid and a close glyph from Lucide (P:src/components/plate/brand/FieldMoodPlate.tsx 4, 6).
4. An icon sits in a key cell or at the start of a `.plain` row and never inside a sentence. It is 20px on 20px rows and 24px on 24px lists, with one gap before the label, and a wrapping key keeps its second line under the label (DECK-GRAMMAR 40; head.html 112 to 120).
5. Semantic color appears only on icons (DECK-GRAMMAR 30; head.html 113 to 116). Green #12a37a means done or passing. Amber #f0a020 means open or in review. Red #e5484d means excluded or rejected. GT blue #2f5ce0 marks GT itself. Text and lines stay monochrome.
6. The deck keeps the four hues the same in both themes (DECK-GRAMMAR 30). The shell changes them per theme: amber becomes #c47d00 on paper, and the blue, violet and green gain light on ink (P:src/components/viewer/tokens.css 28 to 40, 101 to 107).
7. Today's computation of the deck's hues: on paper, green 3.21:1, amber 2.15:1, red 3.91:1 and blue 5.63:1; on dark paper, green 6.28:1, amber 9.36:1, red 5.15:1 and blue 3.58:1. Amber on paper is under the 3:1 of SC 1.4.11. The shell's #c47d00 reaches 3.34:1.
8. The external link glyph is a 16px titanium glyph after a link in a table (head.html 121).
9. Robot and sparkle icons are never used to represent AI (slide 39 line 12). Flags appear only as SVG chips next to locale codes (slide 39 line 13; P:BRAND.md 186 to 188).

## 6. Material: dither fields and photographic mood

1. Ordered dither is the brand's only texture. Tonal ramps use dither instead of opacity (slide 34 line 6; P:DESIGN.md 251; P:BRAND.md 189 to 190).
2. The screens are the 4 by 4 Bayer matrix [0, 8, 2, 10 / 12, 4, 14, 6 / 3, 11, 1, 9 / 15, 7, 13, 5] and its 8 by 8 recursion, which gives 65 linear tone levels (P:DESIGN.md 253 to 255; slide 34 line 6).
3. A cell is lit when the tone exceeds (m + 0.5) / 64 for the matrix value m (P:deck/shots/OPENERS.md 37; P:scripts/build-speed-marks.mjs 210).
4. Coverage tiers nest, so adjacent regions at different tiers compose exact ramps (P:DESIGN.md 256 to 259).
5. Cells are square device pixels and stay 1-bit at any zoom: crispEdges in SVG, `image-rendering: pixelated` in CSS, and any transform that would foreshorten a cell goes inside the alpha mask (P:DESIGN.md 260 to 262; head.html 162).
6. A full-picture image is two-tone at 800 by 450 cells, scaled 2x by nearest neighbour to 1600 by 900, so each cell is a 2 by 2 pixel square. Each picture has a light twin made by inverting the one-bit image (P:deck/shots/OPENERS.md 33 to 39; P:deck/ROUND-5.md 11).
7. Polarity: the file whose ground matches the dark theme is the dark file. A picture whose dominant field is paper (a page, a sky) has its positive rendering as the light file (OPENERS.md 155).
8. A two-tone opener shows one large hard-edged form on a quiet ground, with the plate area solid ink or paper. A crop whose subject is the dither itself reads as a checker and is refused (OPENERS.md 10).
9. At most two openers stay in color, and only where the gem smoke material is the point (P:deck/ROUND-5.md 11; OPENERS.md 22 to 23). Gem smoke is one GPU material driven by two color uniforms, a dark base and a brand color (slide 60 line 9). The material library seeds every material with the brand colors and opens a new composition on gem smoke (slide 87 line 12).
10. Mood pictures are photographs and scans of writing and language (OPENERS.md 127 to 138): the Blue Marble, the Rosetta Stone, Karahisari's calligraphy, a proto-cuneiform tablet, Johnson's Dictionary of 1755, the 1897 Oxford English Dictionary, a marginal gloss of about 1500, a Devanagari manuscript, a cable chart, Hokusai's wave and a compass rose.
11. Sources are public domain or Creative Commons. No mood picture shows a recognizable public figure or another designer's poster (OPENERS.md 140).
12. A full-picture slide paints its image at object-fit cover behind the rails. Its text sits on one solid `--paper` plate with no blur and no shadow (DECK-GRAMMAR 6; OPENERS.md 43, 156 to 161).
13. An opener's plate is lower left and holds the section name at 72px, one sentence and the credit. A mood slide's plate is lower right and holds the title at 44px, one or two sentences on why the picture is there and the credit at 15px in titanium (slide 14 lines 8 to 11; OPENERS.md 156 to 161).
14. Every picture carries a credit. A share-alike picture carries the adaptation condition (OPENERS.md 45, 260).
15. A mood slide follows a dense content slide, and at least one content slide separates it from the next opener (OPENERS.md 142).
16. The same scans serve the GT dashboard's sign-in plate, cut there as continuous-tone grids (OPENERS.md 123). The plate's set is earth, rosetta, calligraphy, tablet, dictionary, johnson and gloss (P:src/components/plate/brand/moodPictures.ts 3 to 24).
17. An illustration animates one effect only, a Bayer-dithered highlight sweep by pure horizontal translate (slide 35 line 6; P:DESIGN.md 244 to 247).

## 7. Motion

1. Content enters once with a 16px rise over 620ms and a 55ms stagger. It does not animate again on scroll back (slide 38 lines 6 to 38, 42).
2. Every loop is created paused and plays only while its section and tab are visible (slide 38 line 43; P:DESIGN.md 285 to 287).
3. Choreography with several steps runs on one timeline (slide 38 line 44; P:DESIGN.md 287).
4. Under prefers-reduced-motion nothing animates, and the markup is the final frame (slide 38 line 45; P:DESIGN.md 288 to 289).
5. The browser scrolls. Smooth scrolling, scroll hijacking and inertia are not used (slide 38 line 46; slide 39 line 11; gt-ui no-smooth-scroll, gt-ui.ts 1671 to 1683).
6. Shell durations are 120ms fast, 140ms leave, 160ms toast, 180ms slide, 200ms enter and 220ms sidebar, eased out, with cubic-bezier(0.2, 0, 0, 1) for the sidebar column (P:src/components/viewer/tokens.css 59 to 71).
7. Every shell transition moves transform or opacity only, and all six durations become 0ms under reduced motion (tokens.css 59 to 63, 355 to 367).
8. The deck changes slides with a 140ms opacity cut (head.html 174 to 175).
9. Text is the primary animated element. The morphing unit is one shaped text node with lang and dir. Only the container width animates. The host page drives one clock (slide 36 lines 11, 35 to 37; P:DESIGN.md 269 to 278).
10. A canvas or GL engine mounts lazily, pauses offscreen and on hidden tabs, renders one still under reduced motion and re-reads its ink on a theme change (P:DESIGN.md 315 to 323).
11. The untracked film brief adds easing rules: expo.out or power3.out for arrivals, power2.inOut for moves and none for processes, with no bounce or elastic (P:motion/MOTION.md 142); staggers of 40 to 90ms in reading order (line 145); and a dithered trail behind a moving speed bar as the brand's only motion blur (line 138). The folder is local only since 8c8d6fb untracked it.

## 8. The copy register

1. Copy is straight technical English with no metaphors, no "X, not Y" pairs, no fragment rhythm, no comma-tail headings, no em dashes, no exclamation marks and no eyebrow labels. Captions are full sentences (DECK-GRAMMAR 23).
2. Headings are sentence case with no trailing period. Product tokens keep their exact form and never start a heading. A heading is a name and never a URL. Title Case appears only on buttons (DECK-GRAMMAR 22).
3. Sentences are short and declarative and carry one claim each. A number or a mechanism stands where an adjective would. Nothing is hedged (slide 12 lines 15 to 19).
4. Every line states a number or a mechanism. A line that could appear unchanged in a competitor's video is cut (slide 62 line 6).
5. Site copy is declarative and sentence case. Founder posts are lowercase, terse and first person. Neither makes a claim without a number, a mechanism or an artifact (slide 63 lines 9 to 12).
6. The deck's pair of examples: "Translations are generated at build time and deploy with the app." is acceptable, and "Supercharge your global growth with cutting-edge AI." is not (slide 12 lines 23 to 24).

## 9. The avoid list

Slide 39 lines 9 to 17 name nine refusals: monospace as the brand typeface, eyebrow labels, smooth scrolling and scroll hijacking, robot and sparkle icons for AI, flags outside SVG chips next to locale codes, iridescent gradients outside the horizon ring, glassmorphism, em dashes in rendered text and exclamation marks. DECK-GRAMMAR 39 adds bullets, cards with shadows, rounded corners, gradients and icon fonts. gt-ui no-gif-mark refuses a GIF as a mark or a demo frame (gt-ui.ts 1772 to 1780). DECK-GRAMMAR 66 lists the defects of a sheet.

## 10. Dark mode as a token remap

1. Dark mode changes token values and nothing else. Paper becomes #070707, ink becomes #f2f2f0, and the hairline alphas rise so a 1px seam survives between two ink surfaces (P:DESIGN.md 31 to 34; slide 43 line 9; head.html 28 to 32; P:src/components/viewer/tokens.css 88 to 108).
2. The theme is an attribute on the root, stamped before first paint. The deck defaults to dark when no choice is stored (head.html 4 to 8). The shell has no prefers-color-scheme block (tokens.css 3 to 6).
3. `color-scheme` follows the theme, so native controls, the caret and the scrollbars match it (tokens.css 74 to 86; head.html 12, 29).
4. A screenshot carries a data-dark twin when one exists. Otherwise it keeps a 1px `--hair` border, so a light capture reads as a plate on the dark ground (DECK-GRAMMAR 61).
5. Canvas dithers redraw per theme (DECK-GRAMMAR 62). Two-tone pictures swap to their inverted twin (ROUND-5 line 11).
6. The code panel is #101010 in both themes and gains a 1px `--hair` border on dark (head.html 171 to 172).
7. Titanium, the scrim, panel ink and panel text keep their values (tokens.css 88 to 89, 94).

## 11. The marks

The doubled-line GT monogram:

1. It is a hand-drawn even-odd path in a symbol with viewBox "-8 214 1213 771" (head.html 398). Turboslide's sprite carries the same viewBox (T:packages/theme/src/sprite.ts 12 to 14).
2. It renders in one color, ink on paper or paper on ink, with no gradients or shadows, inverts on dark and ships only as vector geometry (slide 16 line 7; P:BRAND.md 126 to 131).
3. It has to hold as a 16px favicon, a 32px CLI banner, a 64px README header, a 128px npm page mark and a 256px website mark (slide 25 lines 13 to 17; P:BRAND.md 138 to 140).
4. Locadex has its own mark under the same rules (slide 16 line 8).
5. The marks page keeps the doubled-line monogram only as REFERENCE_MARK and states that it is never a candidate (P:src/lib/marks.ts 17 to 18).

The speed set, chosen by Kevin on 2026-09-29 (commit d5d00f7):

1. The register is wide letters, a forward slant, one horizontal cut through the letters at mid cap height and three speed bars into the first letter (P:src/lib/marks.ts 73 to 92).
2. Every file is one color in currentColor and works on paper and on ink without a redraw (P:src/lib/marks.ts 94 to 104).
3. The seven files under P:public/marks are bar-monogram, bar-monogram-lockup, plate-inverted, double-cut, livery-stack, bar-monogram-dithered and bar-monogram-ascii (.svg and .txt) (DECK-GRAMMAR 50 to 53).
4. Two marks of the 2026-09-09 round stay for comparison: two-way and globe-g (P:src/lib/marks.ts 210 to 231; git log of public/marks).
5. A mark is never redrawn by hand. `pnpm build:marks` regenerates the files, and a slide pastes the new markup over the old (DECK-GRAMMAR 52 to 53).

How P:scripts/build-speed-marks.mjs generates them:

- The bar monogram is ten rectangles on a 120 unit cap, sheared by tan(12 degrees). The G's stem is 30 units, and the speed bars run 20, 80 and 50 units past it. The cut from y 96 to y 104 is applied to the geometry, so the file is plain polygons with no mask and no id (lines 94 to 142). The cut splits three rectangles, which gives thirteen parallelograms.
- The lockup sets GENERAL TRANSLATION in Michroma at 24 units, one fifth of the monogram's cap, 46 units under it, letter-spaced to the monogram's width (lines 146 to 163; slide 18 line 20).
- The dithered monogram samples the geometry at 4 by 4 points per cell into 240 by 59 cells. A cell prints when its coverage is over 0.5 and the density beats the 8 by 8 Bayer threshold. The density is 1 across the left third and falls to 0.18 at the right edge, and 5,154 cells print (lines 167 to 238; slide 22 line 13).
- The ASCII monogram is the same raster at a 0.6 character aspect, 160 columns by 23 lines, with one @ per printed cell, 1,427 in all. The SVG fixes each line to the grid width with textLength (lines 240 to 271; slide 23 line 13).
- The plate sets GT in Orbitron 900 at 90 units, cut out of a 320 by 120 plate with a 12 unit corner radius under a 14 degree skew. A hazard band of 9 unit bars on an 18 unit period at 35 degrees is clipped to the right end. One mask and one even-odd path carry it (lines 275 to 382).
- Double cut sets the name in Anybody at width 150 and weight 900, upright, with two cuts at 40 and 60 percent of the cap height, each 7 percent of the cap thick, in one mask (lines 386 to 401).
- Livery stack sets GENERAL in Anybody 150 900 italic over TRANSLATION in Anybody 150 500 italic sized to the same width, with one cut per line and one 22 degree slash across both, in one mask (lines 405 to 443).
- The faces are static instances stored under P:public/fonts/google by scripts/fetch-google-faces.py under the SIL Open Font License. fontkit converts the strings to outlines, so neither the site nor the deck loads the faces (lines 29 to 32, 36, 56 to 62; slide 18 line 21).

No GT mark is generated from Inter outlines. The speed marks come from rectangles and from Michroma, Orbitron and Anybody outlines. Inter outlines are used only by Turboslide's own wordmark file, wordmark-outlines.svg, written by T:packages/theme/scripts/outline-wordmark.py (T:docs/brand.md 112 to 115).

Use by size (P:src/lib/marks.ts 137 to 209):

- The bar monogram holds at 16px, and its bars read as bars from 32px.
- The lockup is for sign-in plates and openers. A 96px lockup sets the name at 12px.
- The plate suits avatars, badges and the CLI banner. Its stripes read from about 48px.
- Double cut is for headers, footers, sleeves and the top of a document.
- The livery stack is for sizes from about 48px.
- The dithered monogram needs 59px of height, where a cell is one pixel.
- The ASCII file needs a monospace face and suits a code block, a README or the CLI banner.

Which GT mark leads is written only in the untracked film brief: the bar monogram is the hero mark, and the doubled-line monogram is the product mark at small size (P:motion/MOTION.md 135 to 137). The deck's own chrome still draws the doubled-line monogram (head.html 362, 369, 463). Slide 16 line 7 presents the speed set as the September 2026 exploration shown beside the current mark.

## 12. The viewer shell, templates, materials and the agent API

- Every route renders in one frame of sidebar, toolbar, stage and progress line. The shell owns the state and the route supplies the content (slide 74 line 6).
- Cmd K searches every page. R opens a 460px index panel. The modes are slide, grid and book. Hovering a row opens a 320 by 180 capture after 200ms. The keys are the arrows, digits then Enter, D, P and ? (slide 74 lines 40 to 45).
- Glyphfield's slide templates build a 16:9 system from fourteen layouts on a direct-manipulation canvas and render each layout as SVG through the API. Its brand book tool writes 51 pages in eight chapters and exports a PDF (slide 86 lines 17, 21).
- Glyphfield's 134 materials form one quality-sorted catalog (slide 87 lines 11 to 17).
- The agent API is llms.txt (194 lines) and llms-full.txt, an /api/agent manifest, /openapi.json with eleven paths, POST /api/generate, a window.glyphfield.studio object (describe, controls, activate, set, readSource, applySource, invoke, download) and four task skills (slide 88 lines 10, 51 to 57). Turboslide already serves llms.txt, llms-full.txt, openapi.json and an agent route (the listing of T:apps/studio/src/routes).

## 13. What changed since 2026-09-14

`git -C /Users/kevinliu/repos/Prototemplate log --since=2026-09-14 --full-history --stat -- deck DESIGN.md public/marks` lists the commits below. No deck commit falls between 2026-09-14 and 2026-09-27.

| Commit | Date and time (-0700) | Change | Files on these paths |
| --- | --- | --- | --- |
| 8c989de | 2026-09-28 12:59 | One rail. DESIGN.md section 3 is rewritten to one rail on each side, the outer pair at plus and minus 10px is retired, and the ownership rule names the inner pair only. The shell-numbers slide loses the second rail, its label and its row text. The site gains the gt-ui oxlint plugin with 13 rules. | DESIGN.md (19 lines added, 11 removed with the slide), deck/slides/40-shell-numbers.html |
| d5d00f7 | 2026-09-29 18:15 | The speed marks. Seven slides follow The mark. DECK-GRAMMAR gains the speed marks section. The mark slide gains one sentence. The skills and marks slide shows the new marks page. The seven files and their generator land. | DECK-GRAMMAR.md (5 lines added), head.html, tail.html, 15-mark.html, 16 to 22 (new), 70-skills-marks.html, public/marks |
| 900573d, a9dd777 | 2026-09-30 | Merges into speed-marks | none of their own |
| 3976776 | 2026-10-01 11:07 | Renumbering from slide 14 on, renames only | 79 renames |
| 3759853 | 2026-10-01 11:07 | Three mood slides of writing: the tablet at 14, Johnson at 37, the gloss at 64. The dictionary mood slide becomes the 1897 OED entry, public domain. The deck has 95 slides, and the speed marks are 17 to 23. | DECK-GRAMMAR.md, head.html (bar-total 95), tail.html, OPENERS.md, slides 14, 37, 54, 64 |

Outside those paths since 2026-09-14: 368b1f1 (2026-09-30) makes three source comments say one rail; 21c8452 (2026-09-24) self-hosts the Google fonts; 946b1c9 (2026-10-01) adds the page check; b56e64c (2026-10-01) ports the GT dashboard's sign-in and onboarding plate into the site; b20f065 (2026-10-01 18:34) recuts the gloss picture.

For a product application the changes are four: one rail, the GT speed register with its generator, the mood pictures of writing, and the deck at 95 slides.

## 14. Turboslide against the source

Tree facts from T: at 94e8a5c3.

1. The reference deck is behind. T:decks/gt-brand/slides holds 85 files and last changed on 2026-09-13 (13d0361d). T:decks/templates/gt-brand/slides also holds 85 files. The source has 95 slides. The seven speed mark slides and the tablet, Johnson and gloss mood slides are missing.
2. Both copies of the deck still describe the retired second rail: "Second rail 10px outside the column" at line 37 and "second pair of rails 10px outside it" at line 52 of T:decks/gt-brand/slides/shell-numbers.json and of T:decks/templates/gt-brand/slides/shell-numbers.json.
3. T:decks/gt-brand/slides/mood-dictionary.json line 17 still names the Compact Oxford English Dictionary.
4. T:packages/viewer/src/BookView.css line 16 sets `scroll-behavior: smooth`, with an `auto` override under reduced motion at line 247. Slide 38 line 46 and slide 39 line 11 refuse smooth scrolling.
5. Turboslide's token deviations are deliberate and documented: light titanium #6f747d (T:packages/chrome/src/tokens.css 28 to 32), light plate 0.06 (lines 52 to 55), dark plate 0.08 (line 168), and the added `--pt-field`, `--pt-disabled` and on-ink tokens (lines 33 to 51).
6. The sheet theme T:packages/theme/src/gt-ink-paper/sheet.css mirrors head.html's tokens at lines 14 to 29 and 50 to 62. Its icon hues at lines 524 to 533 keep the deck's rule of one value for both themes.
7. Fifteen `border-radius` declarations under T:packages/chrome/src read a value other than 0, 50 percent or `--pt-radius` (grep, 2026-10-01). Two are sanctioned by P:DESIGN.md 428 to 430: the key chip (Toolbar.css 152) and the solid button (ToolButton.css 36). The other thirteen are TitleRow.css 217, 277, 500, 530 and 556, Palette.css 186, DiagramPanel.css 38, inspector/table.css 75 and 106, pickers/DiagramPicker.css 57, and inspector/chart.css 35, 181 and 204. I did not read each selector.
8. Round four's Turboslide mark is a slide with a plate cut from it through the Bayer screen (T:docs/brand.md 14 to 15). The same document states that the mark is not a speed line (T:docs/brand.md 67). The GT register chosen on 2026-09-29 is built on speed bars and a forward slant (P:src/lib/marks.ts 73 to 92).
9. Turboslide's chrome draws no accent (T:docs/brand.md 14 to 17), which matches DECK-GRAMMAR 29. Its selection blue is recorded as an editor affordance outside the brand (T:docs/brand.md section 10).
10. Turboslide has no source lint for the copy and CSS laws of its own chrome. T:packages/lint/src/static/copy.ts lines 214 to 330 lint slide copy (no-em-dash, no-exclamation, heading-period, no-eyebrow and others). T:packages/lint/src/chrome.ts lines 1 to 20 audit chrome lines from computed CSS. A grep of T:packages/lint/src for "smooth" and "scroll-behavior" finds nothing.

## 15. Contradictions inside the source

1. Semantic hues: the deck keeps one value for both themes (DECK-GRAMMAR 30), and the shell sets one per theme for contrast (P:src/components/viewer/tokens.css 28 to 40, 101 to 107). The deck's amber is 2.15:1 on paper.
2. Captions: the deck sets 15px captions in titanium (head.html 65; DECK-GRAMMAR 21), which is 3.25:1 on paper.
3. Smooth scroll: the shell sets `scroll-behavior: smooth` in P:src/components/viewer/BookView.css line 11 and Sheet.css line 44, against slide 38 line 46 and slide 39 line 11. The gt-ui rule runs over js, jsx, ts and tsx files only (P:.oxlintrc.json 32 to 35), so it cannot see CSS.
4. Typefaces: P:DESIGN.md 195 to 198 names three voices, a serif, a grotesk for 11px labels at 0.06em and a mono. The deck (DECK-GRAMMAR 24), P:BRAND.md (151 to 156) and gt-ui inter-only name Inter alone, and P:BRAND.md 173 to 174 calls the serif and grotesk pairing the lab's stationery. DESIGN.md section 4 is stale for a product.
5. Monospace scope: the deck allows it only on the code panel (DECK-GRAMMAR 31). Slide 27 line 6 allows it for code, tokens and technical labels. P:BRAND.md 168 to 172 allows small labels in technical diagrams and product UI.
6. The accent: the site allows it on small elements (slide 26 line 5), and the deck draws none (DECK-GRAMMAR 29). The GT site ships three blues, #2f5ce0, #3b82f6 and #2563eb, and slide 26 line 29 says one should be chosen.
7. The current GT mark: the deck's chrome draws the doubled-line monogram (head.html 362, 369, 463), the marks page calls it a reference and never a candidate (P:src/lib/marks.ts 17 to 18), and only the untracked film brief assigns roles (P:motion/MOTION.md 135 to 137). No final pick among the seven speed files is written down.
8. P:deck/shots/OPENERS.md is stale after 3759853. Its mood table and Documentation entry still name the Compact OED (lines 131, 208 to 209). Its licensing note still counts the dictionary as share-alike and says "four" and then "these three" (line 260). Line 140 says every photographic source is a Wikimedia Commons file, while the credits of slides 14, 37 and 54 name the Met, the Wellcome Collection and the Internet Archive (line 18 of each).
9. The gloss credit on slide 64 line 18 names the University of Glasgow Library and states no license.

## 16. Proposals

1. Re-import the 95 slide deck from P:deck/slides into T:decks/gt-brand and T:decks/templates/gt-brand. The expected gain is a GT template that matches the brand source, and the second rail and the Compact OED leave the product.
2. Remove `scroll-behavior: smooth` from T:packages/viewer/src/BookView.css line 16. The expected gain is a book view that follows slide 38 line 46, and the override at line 247 becomes unnecessary.
3. Add a source lint for Turboslide's chrome: port the gt-ui plugin with the thirteen rules of P:.oxlintrc.json 38 to 50 over T:packages/chrome, T:packages/viewer and T:apps/studio/src, plus a CSS check for `scroll-behavior` and for radii outside `--pt-radius` and the named exceptions. The expected gain is that the brand laws fail in CI, which would have caught item 14.4.
4. Ask Kevin whether Turboslide joins the race-type register. If he says yes, write a Turboslide generator modeled on P:scripts/build-speed-marks.mjs in T:packages/theme (rectangles under a skew, the cut applied to the geometry, one color, the dithered and ASCII variants from the same analytic raster) and take the CLI banner from the ASCII file. The expected gain is one mark family across GT products with no font loaded. If he says no, record the reason in T:docs/brand.md next to line 67.
5. Draw chrome status icons with the shell's per-theme hues (amber #c47d00 on paper, the lifted hues on ink from P:src/components/viewer/tokens.css 101 to 107) and leave the sheet theme faithful to the deck. The expected gain is status icons at 3:1 or more in both appearances.
6. Read the thirteen radii of item 14.7 against P:DESIGN.md 419 to 436 and set each to 0 or `--pt-radius` unless Kevin named it. The expected gain is chrome inside the radius rule of DECK-GRAMMAR 39.
7. Build Turboslide's sign-in on the plate grammar of the GT dashboard (P:src/components/plate): the mood field behind a plate column at most 560px wide, the mark at its head and a foot row (frame/PlateFrame.tsx 20 to 33), with the pictures of writing and their credits. The realtime round puts Google sign in into a dialog (Turboslide-realtime commit 394e543f). The expected gain is one sign-in surface across GT products and the deck's new material in the product.
8. Check one rail on /home, /decks and the not found page with T:packages/lint/src/chrome.ts, which already reads `.tc-rail` at line 985. The expected gain is that the retired outer pair cannot return.

## 17. Open

1. No final GT mark is named among the seven speed files. The role of the doubled-line monogram is written only in an untracked file.
2. Whether Turboslide joins the race-type register conflicts with T:docs/brand.md 67 and needs Kevin.
3. One of three site blues is still to be chosen (slide 26 line 29).
4. The deck and the shell disagree on the semantic hues per theme.
5. The source's titanium captions are 3.25:1 on paper.
6. P:DESIGN.md section 4 is stale on typefaces.
7. The shell sets smooth scroll in two stylesheets.
8. P:deck/shots/OPENERS.md is stale on the dictionary, the licensing count and the picture sources, and slide 64's credit states no license.
9. The files listed under "Not read" were not read.
