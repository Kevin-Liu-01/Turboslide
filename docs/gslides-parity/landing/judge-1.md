# Landing judge 1: graphic and motion craft

Judge 1 of three for the `/home` redesign. Kevin wrote on 2026-10-02: "make the landing much better inspired off of lovefrom and openai brand and make the landing much more interactive and showing off features featuring the best of graphic and motion design". My lens is the craft he named: typography, spacing, imagery, the timing and easing of every motion, and what each direction leaves out. The bar is the one the LoveFrom and OpenAI researchers measured.

Written 2026-10-02 from 18:09 to 18:40 PDT in the worktree `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `2108dad4`. This note and the pictures under `judge-1/` are the only files written. No product source was edited and no git write command ran. Nothing was pushed or deployed, no dev server was started and no other worktree was opened. Nothing was fetched from the network. Every claim about lovefrom.com, openai.com or another site is a researcher's reading of 2026-10-02 and names the URL they read.

## 1. Verdict

| Direction | Craft | Inspiration | Features | Brand | Buildable | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A, quiet object | 7 | 9 | 7 | 8 | 9 | 40 |
| B, demonstration | 7 | 8 | 8 | 6 | 6 | 35 |
| C, the playground | 6 | 7 | 9 | 6 | 5 | 33 |

The winner is A, with grafts from B and C (section 7). A's frame is right for the product: the page is one deck, and each band holds one of its slides for the visitor to work on. Its motion is the most exact of the three. It plays three sequences once, loops nothing and makes 0 frame callbacks at rest. It is also the cheapest to build.

A is weak exactly where the other two are strong:

- Its first screen is graphically thin: a white sheet, hairlines and type.
- Its h1 is too small on a phone.
- Two of its bands show empty frames until they are touched.

B has the best typography in the round and the best demonstrations of a mechanism. C has the strongest first screen picture and the brand kit. Section 7 lists what to take from each.

## 2. How I judged

- I read the five research notes and the three direction notes in full.
- I looked at every picture each direction listed (A 20, B 26, C 23). I also cropped the full pages at 1:1. The crops I cite are in `judge-1/`.
- I opened each prototype from `file://` with the worktree's `playwright-core` (Chrome for Testing 1217, headless, 1440 by 900 unless named). Three scripts ran from the session scratchpad (`lj1/`), one short browser run per direction:
  - `audit.mjs` reads the computed type of the h1, the first h2 and the first paragraph. It lists every font size and weight in visible text. It looks for monospace outside the `#101010` panels, em dashes, exclamation marks, rounded corners, shadows, filters, the selection blue at rest and eyebrow labels. It counts `requestAnimationFrame` calls and running animations at the top, middle and bottom of the page after a native wheel scroll.
  - `interact-<k>.mjs` drives each direction's interactions by pointer and keyboard and takes screenshots at set times. It logs every animation the page creates, with duration, delay and easing, by polling `document.getAnimations()` every 40 ms.
  - `type.mjs` takes device scale 2 crops of each h1 and the first h2.
- Load: the one minute load never fell under 30 in this session. Each batch waited at least one five minute sleep, then ran at a load of 49 to 58, one browser at a time. Times are therefore upper bounds. Counts, sizes and easings do not change with load.

The bar, condensed from the research notes:

- **LoveFrom** (`research-lovefrom.md`; https://www.lovefrom.com/ and https://book.stevejobsarchive.com/, read 2026-10-02):
  - One subject per screen.
  - Build it once in front of the reader, then stop on a still.
  - Time it like a person.
  - A photograph develops over seconds.
  - Sign the work.
  - Leave out what does not carry the subject.
- **OpenAI** (`research-openai.md`; https://openai.com/, https://openai.com/index/gpt-6-astra/ and https://openai.com/index/introducing-gpt-6-1-sol/, read 2026-10-02):
  - The working product in the first screen.
  - A title present at first paint.
  - One weight for headings, with tracking that tightens as size grows.
  - One image material per page.
  - Honest captions, and a countdown on anything that advances.
  - No reveal on prose.
- **The GT motion brief** (Prototemplate `motion/MOTION.md`, through `research-motion.md` sections 2 and 4):
  - `expo.out` arrivals, `power2.inOut` moves and smoothstep tone mixes.
  - No overshoot.
  - A dither field changes only by tone.
  - Transform and opacity only.
  - Loops pause off screen.
- **Kevin's standing taste.** His verdicts on the GT dashboard and onboarding rounds of 2026-09-25 to 09-29 apply here:
  - "too busy", "kerning", "no ugly border lines", "use shaders that have our dither applied".
  - "i dont think we need the animations of it fading in moving in from bottom".
  - Of the glyph rain: "dont make them dithered".
  - Of the deck pictures in onboarding: "only keep the rosetta stone and blue marble, the others have to actually apply to the theme better".

  Several choices below run against these.

## 3. Direction A, quiet object

### What reaches the bar

- **The develop.** In `mood-develop-light.png` and `mood-develop-dark.png` the lighthouse comes up through the 8 by 8 Bayer screen at 2 px cells. It takes 2,400 ms on smoothstep, and the cells switch in Bayer order. The plate and its words are on screen before the picture. This is the book's Polaroid (LoveFrom rule 13) carried into the brand's tone mix (MOTION.md "Texture"). It is the best single motion in the round, at 0.8 ms a frame.
- **Rare, exact motion.** My animation log matches A's section 4 table:
  - the four hero lines: 600 ms on `cubic-bezier(0.16, 1, 0.3, 1)` at 0, 60, 120 and 180 ms;
  - the caret: 1,000 ms `steps(1)`;
  - the agent's answer: 120 ms a line from 200 ms, 55 ms apart;
  - the show: 300 ms to ink, then 500 ms on `cubic-bezier(0.65, 0, 0.35, 1)` to the stage;
  - the mark: 600 ms a bar, 70 ms apart.

  After everything had played, the audit counted 0 `requestAnimationFrame` calls and 0 running animations at the top, middle and bottom of the page. No other direction is still at rest.
- **The working model of itself.** In `canvas-edit.png` the Layout row reads Mood, then Canvas after a drag, then Mood again after the last Undo. The product's sentence "The first drag turns the slide into a canvas. Undo puts the layout back" happens on screen. That is the Moncler lesson (LoveFrom rule 15) in one row.
- **The page presents itself.** `present-show.png` and my drive (`present-850`) show the band turning to ink and the slide moving to the stage. The arrow keys then cut between the page's own slides, which carry the visitor's moved title, the customer's name and the agent's slide. No other direction connects its bands this way. It is the strongest idea in the round.
- **The parts table.** "Turboslide today" is seven ruled rows, each with a Heroicon in the key cell and a right aligned figure from `facts.json`. The page ends on its densest evidence (OpenAI rule 13), and the table holds up at 390 (`page-390-light.jpg`).
- **Version history.** After the three runs (`judge-1/a-agents-done.png`), the ruled history names Agent and You with the command line and user Heroicons. Each change is described in words, with the clock time.
- **The signed close.** In `close-mark.png` the mark's seven bars arrive once and hold over "Made in Turboslide. Set in Inter." (LoveFrom rule 17).

### What falls short

- **The first screen is the thinnest of the three** (`first-1440-light.png`, `judge-1/first-screens-1440.png`). It is a white sheet with type in its left half. Three vertical lines run on each side: the page rail at x 168, the slide's edge at 208 and the slide's rail at 245. Nothing else carries the screen, so the hairlines become the graphic, which is Kevin's "ugly border lines". The first screen has no material. That is deliberate (it keeps NEXT.md question 5), but it leaves the screen bare.
- **The build builds the small thing.** In `hero-intro.png` the rails draw and the 15 px subtitle is typed, but the h1 is already in place. On lovefrom.com the word itself is built. Here the visible build is four hairlines and a small caret, so the hero does not read as a made object. The h1 should stay final at first paint (OpenAI rule 2). What the hero should build is its material: see graft C1.
- **Empty states at rest.** A visitor who scrolls without pressing anything sees the agents band as a black panel with the version banner, an empty frame reading "The first command adds slide 6." and an empty Version history (`judge-1/a-mid.png`). The Tailor band's three slides are text only at about 270 px wide. The motion research's rule is that the markup is the final frame (`research-motion.md` 4.1 rule 5). The band should paint the run's end state and let Run play it from the start.
- **The phone inverts the hierarchy** (`first-390-light.png`, `judge-1/phones-top.jpg`). The h1 is about 27 px inside a 358 px slide, with a 12.5 px subtitle, and the next band's h2 is larger. A names this as its risk 2. The line under the slide also reads "Click the title" on a touch screen (`phone-hero-touch.png`), where C switches to "Tap".
- **The lighthouse.** The mood slide's plate says "The site is held to the same standard", which is GT's sentence (A's risk 10). Kevin removed the lighthouse from the onboarding pool on 2026-09-29. Of the round's three pictures, it argues least for a slides editor.
- **Type scale.**
  - Hero h1: 56.2 px at -0.025 em.
  - Page h2: 36 px at -0.025 em.

  On a page this quiet, the headings carry less than the open ground around them asks for. OpenAI's pages hold 64 px titles and 48 px statements (`research-openai.md` 3), and B's 95 and 54 px ladder shows the column can hold more.
- **Small mechanics.**
  - Undo animates `left` and `top` (374 ms on the move curve in my drive) where a transform would do. The motion research allows transform and opacity only.
  - The agent panel crops its last JSON line at the bottom edge (`judge-1/a-agents-done.png`).
  - Buttons and the Tailor field take the product's 6 px `--pt-radius`, but the branch's `grammar.css` header says "no radius" for `/home`.
  - The page waits for Inter for up to 800 ms before it paints. That is LoveFrom's method, and it is risky on a network. C's metric matched fallback face reaches CLS 0 without hiding anything.

### Scores

- **Craft 7.** The motion is the round's best: exact, played once, and at rest when done. The develop and the Mood to Canvas row are top quality. The graphic first screen, the empty bands and the phone h1 hold the score down.
- **Inspiration 9.** LoveFrom's method runs through the whole page: one made object per band, the blink timing, the develop, the subtitle that changes per visit, the print still and the signature. From OpenAI it takes the working product in the first screen and a working viewer. Nothing is copied.
- **Features 7.** These are real and worth touching:
  - select, move, resize, rotate and type;
  - Undo, with the layout row;
  - Tailor;
  - reordering the filmstrip;
  - the agent run with its authors;
  - Present with the visitor's changes.

  Export is a row with no demonstration. The brand kit and the menus are absent.
- **Brand 8.**
  - Inter only.
  - Blue only during live work (the audit found none at rest).
  - No monospace outside the panel, no em dash, no exclamation mark, no eyebrow, and native scroll.
  - At 345 words of page copy, the only direction under the 350 row.
  - NEXT.md question 5 kept.

  The radius, the GT sentence on the lighthouse and the triple line hero cost two points.
- **Buildable 9.**
  - About 7 lane days, about 3 days of wall time.
  - 87 KB brotli in total, and 15.3 KB gzip of script, inside the motion research's 15 KB budget apart from the tone map.
  - No long task, no loop, CLS 0.
  - Only the shared prerequisites are needed: the entry chunk split and the Inter subset.

## 4. Direction B, demonstration

### What reaches the bar

- **Typography** (`b-1440-light-first.png`, `judge-1/type-b-h1.png`).
  - The h1 is 95.04 px at weight 500, -0.042 em and a 0.98 line height, set by hand in three lines: "Build the pitch, / present it and / send the link".
  - Every band's h2 is 54 px at -0.034 em.

  B is the only direction where big type carries the page by standing alone (OpenAI rule 3), and it is the best type in the round. At device scale 2 the tracking is tight. "present it and" sits close, but Inter's display cut holds at 95 px. B rightly loosens the tracking for the h2.
- **Rhythm as meaning.** The agent types at a constant 24 ms a key, while the people type at uneven gaps of 70 to 240 ms. LoveFrom's "time it like a person" becomes how a visitor tells a person from an agent. It is the cleverest use of the research in the round.
- **A gesture prints its command.** In `b-strip-canvas-gestures.png` and my drive, each drag, resize or turn prints the `turboslide slide to-canvas`, `block set ... /pos` or `block rotate` line that an agent would send for the same change. The canvas band and the agents band then show one fact: a person and an agent write the same actions.
- **The loupe.** In `b-strip-export-compare.png` a 10x loupe counts the pixels that differ under the pointer. It is the only demonstration in the round that lets a visitor check the 0.003% figure (`research-current.md` 4 item 7). In the prototype both rasters are one render, so it reads "0 of 196 pixels differ". Built from the verify loop's two rasters, it would be the most honest band on any of the pages.
- **Honest captions and a countdown.** The page states "A staged sequence of 17 seconds". The step tabs carry a 2 px countdown rule and stop for good when touched. Pause Motion took frame callbacks from 121 a second to 0 in my drive. This uses Astra's captions and tabs and Sol's pause well (`research-openai.md` 4 and 8).
- **The close.** In `b-strip-mark.png` the mark, at 300 px, draws its seven bars once in reading order. Above it, the features table gives each feature's menu path.

### What falls short

- **The chapter fields** (`b-strip-field-glyphs.png`, `judge-1/b-field-people.png` at 1:1). Six strips between the bands draw a sparse, regular dot grid. Each grid gathers into a coarse pixel pictogram: a selection frame, two flags, a play triangle, two pages, a sphere, ruled rows. Each strip loops a 12 s cycle of gather, hold and thin while in view.
  - The Astra field they translate is one continuous layer that changes shape. Six separate strips turn it into a repeated divider.
  - At this cell size the glyphs read as 8-bit icons.
  - They add a second icon vocabulary next to the Heroicons.
  - They are dithered glyphs, which Kevin turned down on 2026-09-28.

  They are the weakest graphic element in the round, and they appear six times.
- **The page is never still.** Six things run on their own:
  - the hero loops for 17 s;
  - the people band loops for 14 s;
  - the gesture band loops for 7.6 s;
  - the show advances every 4 s;
  - six fields cycle every 12 s;
  - the pattern runs at 24 fps.

  Only one demonstration plays at a time, and every loop pauses off screen (the audit counted 0 frame callbacks at the bottom). Even so, with nothing touched the audit counted 120 frame callbacks a second at the top and in the middle of the page. B's own measure is 68 ms of main thread a second with the hero running, over the motion research's 60 ms ceiling. LoveFrom's lesson that motion is rare and ends on a still is mostly lost, and "too busy" is what Kevin said of the GT dashboard.
- **Terminal setting.** The hero panel breaks words in the middle: "Acme=Globe / x", "revis / ion", "Globex=Ini / tech", "t / itle" (`judge-1/b-hero-typed2.png`). A command also breaks after "--" in `b-1440-light-first.png`. The gesture log splits a JSON object across lines. A 336 px panel is printing lines of about 55 characters.
- **Fidelity slips in the drive.**
  - I typed `turboslide slide new --layout title`, and it added slide 7 with the split layout, so the typed layout was ignored.
  - A title dragged across the gesture slide passes under the Blue Marble while still selected, which leaves only "One rel" visible (`judge-1/b-canvas-dragged.png`).
  - The fourth number cell's sentence runs about 12 px past the column's gutter.
- **The first screen shows an empty state.** From 2.3 s to 6.4 s of every 17 s cycle, the hero's slide is the "Click to add title" placeholder (`b-strip-hero-agent.png`, my `hero-stage-5s`).
- **Small, coarse pictures.** The Blue Marble in the gesture band is a disc about 150 px across, drawn with coarse cells (`b-strip-canvas-develop.png`). The export band compares a slide of text rows ("Who does what"), where any difference would be invisible.
- **Claims.**
  - The export lead says "The PowerPoint file matches the screen pixel for pixel". `facts.json` records 194 of 5,760,000 pixels differing on the worst page.
  - The two people band stages presence that `research-product.md` section 1 says the page must not claim until production's realtime rows read green. B captions it as staged, but at rest the band shows two near empty slides.
- **Length and words.** 7,769 px at 1440 (audit), and 516 words of page copy against the 350 row.

### Scores

- **Craft 7.** The type and the mechanism demonstrations are top quality. The six field strips, the constant loops, the broken terminal lines and the placeholder hero cost three points.
- **Inspiration 8.** It follows OpenAI's launch pages closely and well:
  - the working product first;
  - big type;
  - staged recordings with honest captions;
  - countdown tabs;
  - two part labels on the rails;
  - a field per chapter;
  - a table at the end.

  It takes LoveFrom's rhythm and develop. The field strips stay too close to Astra's device.
- **Features 8.** The widest set in the round:
  - an agent stage that takes typed commands;
  - gestures that print their actions;
  - two people;
  - presenter and audience screens with a skipped slide;
  - the export loupe;
  - animated patterns;
  - the features table with menu paths.

  One band shows presence that production does not offer yet.
- **Brand 6.** Inter, paper and ink, blue as the selection, monospace on panels only, no em dash and no eyebrow are all in place. Against that:
  - the pictogram fields sit outside the Heroicons;
  - motion never stops;
  - the "pixel for pixel" overclaim;
  - the staged presence;
  - 516 words and 7,769 px.
- **Buildable 6.**
  - 13 lane days over five lanes, three to four pipeline days by B's own count.
  - It needs staged chrome with a parity check, recorded transcripts, export rasters, a field engine with a governor, and six loops held inside budget.
  - The idle ceiling is already exceeded, and one of B's own loads had a 470 ms long task during the scroll.

## 5. Direction C, the playground

### What reaches the bar

- **The first screen picture** (`page-1440-light-first.jpg`, `judge-1/first-screens-1440.png`). The Blue Marble, through the 8 by 8 Bayer screen, fills the left half of the sheet. The h1 is the slide's title on the right. The picture develops over 1,500 ms after load (`strip-hero-develop.jpg`). This is Sol's and Astra's composition, one material and one title, in the deck's grammar. The h1 remains the LCP at 56 ms. It is the most striking first screen of the three, and the Blue Marble is a picture Kevin kept.
- **The most real features.** All of these work, and all of them act on one deck:
  - the hero editor, with three brand kits and a typed background;
  - about 60 menu rows that change the deck;
  - Present, with full screen and a skipped slide;
  - an export seam;
  - an agent console with the real CLI forms, MCP tool names and HTTP paths;
  - Version history with a slider, Play, Restore and Undo.
- **Print This Deck.** `print-deck.jpg`: the print stylesheet prints the visitor's own deck, one 16 by 9 page per slide. LoveFrom's defined still for print becomes a working feature.
- **The ring travels.** In `strip-agents.jpg` and my drive, the agent's ring moves to whatever a command changed. It took 449 ms and 418 ms on the move curve. OpenAI's Point becomes Turboslide's selection, as the OpenAI researcher proposed (idea 2).
- **At rest.** The audit counted 0 frame callbacks at the top, middle and bottom. Nothing loops.

### What falls short

- **The tool row in the first screen.** Undo, Redo, Reset, "Brand kit" with three swatches, and a hex field sit above the hero slide. The first screen reads as an application before it reads as a page, which breaks LoveFrom's first rule.
- **One picture, again and again.** The Blue Marble slide appears in the hero, the present band and the agents band, and again in the menus filmstrip and Version history (`page-1440-light-full.png`). The bands look alike, and the page's strongest picture is shown five times.
- **The kit change passes through low contrast.** Ground, words and field ink change together on one 500 ms smoothstep (`--k-paper`, `--k-ink` and four more registered properties in my log). At 230 ms the title is grey on grey and close to unreadable (`judge-1/c-kit-230.png`, `strip-hero-kit.jpg`). Mixing the field's tone alone and cutting the words at the midpoint would keep the title legible.
- **Reveals on prose.** In `strip-band-enter.jpg` and my log, every band hides its heading, lead and instrument until it is 20 percent in view. The seam then draws, the heading rises through its clip, and the lead and instrument rise 16 px over 620 ms from 500 ms, so the instrument is missing until about 700 ms. OpenAI's pages do not reveal prose (`research-openai.md` 5 and 7), and Kevin removed exactly this from the GT onboarding on 2026-09-28.
- **The phone hero loses the picture** (`page-390-light-first.jpg`, `judge-1/phones-top.jpg`). The 560 px slide opens on its plate inside a 358 px column. The Blue Marble shows as a few stray cells at the left edge, and the slide's right rail is cut. On a phone the hero's best quality is gone.
- **The agents band** (`judge-1/c-low.png`). A 1,024 px `#101010` panel holds about 200 px of empty log above seven command rows. At 390 the commands break inside their flags, for example "--" / "to 8" (`judge-1/phones-mid.jpg`).
- **The export seam** (`judge-1/c-export-dragged.png`). Both sides show the same lighthouse. The difference is drawn as blue outlines and blue chips ("Text box", "Picture"), which uses the interface colour as annotation. The "Picture" chip cannot be read over the dark dither, and the seam clips the "One picture, 1600 by 900" label.
- **Grammar slips.**
  - The agent's ring and its chip are drawn in selection blue. In the product a visitor's own selection is blue and another author's outline is ink, as A's and B's agent flags are.
  - The ring animates `left`, `top`, `width` and `height` where a transform would do.
  - A third weight, 450, is used in 14 places beside 400 and 500.
  - The author chips in the version list are boxed.
- **My drive.** The scripted path to Tools > Tailor timed out after a previous Escape. For that row I rely on C's `strip-menus.jpg`, which shows it working. Everything else I drove worked, with no console error.

### Scores

- **Craft 6.** It has the best first screen picture and a clean rest state. The tool row, the repeated picture, the low contrast kit mix, the prose reveals and the phone hero cost four points.
- **Inspiration 7.** It brings the working model, the signature, print as a feature, and the Point as the selection ring. LoveFrom's restraint is missing: the page shows everything it can do at once.
- **Features 9.** The most working features in the round, nearly all worth touching. A third of the menu rows answer with a sentence instead of a change (C's risk 9).
- **Brand 6.** Inter, paper and ink, no radius, monospace on panels only, no em dash, no eyebrow, and nothing loops. Against that:
  - the Blue Marble in the first screen reverses Kevin's open question 5 (C asks for the ruling);
  - customer kit colours land on `/home`;
  - blue is used for labels;
  - a third weight;
  - the prose reveals Kevin removed elsewhere;
  - 410 words.
- **Buildable 5.**
  - About 5 pipeline days by C's own count, over the three to four the workflow allows.
  - A second slide renderer with a parity test against `renderSlide`.
  - A store with versions.
  - 24 KB brotli of page script against the 15 KB gzip motion budget.
  - A 69 ms startup task at 4x CPU.

## 6. Side by side

| Measure (my audit and drive, 1440 by 900, light) | A | B | C |
| --- | --- | --- | --- |
| h1 | 56.2 px, 500, -0.025 em, inside the slide | 95.0 px, 500, -0.042 em, line height 0.98, on the page | 56.3 px, 500, -0.025 em, inside the slide |
| First h2 | 36 px, -0.025 em | 54 px, -0.034 em | 36 px, -0.025 em |
| Weights in visible text | 400, 500 | 400, 500 (700 only in the example slides' `<b>`) | 400, 450, 500 |
| Rounded corners | 6 px on buttons and the field | person chips only (50%) | none |
| Shadows, blur or filters at rest | none | none | none |
| Monospace outside `#101010` | none | none | none |
| Selection blue at rest | none | the staged ring, chip and caret in the hero | the current filmstrip card |
| Frame callbacks a second at rest: top, middle, bottom | 0, 0, 0 | 120, 120, 0 | 0, 0, 0 |
| Layout properties animated | `left`, `top` (Undo) | none seen (transform) | `left`, `top`, `width`, `height` (agent ring) |
| Prose that waits for a reveal | none | none | every band below the hero |
| Page height | 5,719 px | 7,769 px | 6,255 px |
| Page copy, by each note's own count | 345 words | 516 words | 410 words |
| Console or page errors over my drive | none | none | none |

The first screens side by side (`judge-1/first-screens-1440.png`):

- A is a quiet white sheet.
- B is type above a working stage.
- C is a picture with a title.

On a phone (`judge-1/phones-top.jpg`, `phones-mid.jpg`):

- B holds best: the h1 leads, the stage follows, and the dither still reads.
- A's h1 drops under its own h2.
- C's hero becomes a cropped plate.

## 7. The winner and the grafts

A is the frame. The grafts below are in order of value. Each names its source and the rule it serves.

From B:

1. **The hero's type.** Set the hero slide's title on B's display ladder: about 150 units on the 1,600 unit sheet, so roughly 95 px at the 1,024 px column, hand set in three lines at weight 500. Under 720 px, move the h1 out of the slide and set it above the sheet at B's phone size, so the page's largest heading is its h1 at every width. The h2s go to B's 54 px at -0.034 em. This serves OpenAI rule 3 and fixes A's phone inversion.
2. **The gesture prints its command.** Add B's action panel beside or under A's lighthouse slide. Each gesture prints the `block set` or `block rotate` line, with the panel's lines set without breaking a word. Band 2 then sets up band 4.
3. **The export loupe and seam.** Give A an export band with B's seam and 10x loupe, drawn from the verify loop's two real rasters. Use a slide that has both a picture and type, so a difference could show. Report the count from `facts.json`, and drop "pixel for pixel".
4. **Staged captions.** Wherever A stages a sequence (the agent run), say so in B's words: "A staged sequence of N seconds".
5. **The menu path column.** Add B's "where to find it" column to A's parts table.
6. **The mark at scale.** Close with the 300 px mark drawn bar by bar, beside or after A's signed slide.
7. **After production's realtime rows read green:** B's person and agent typing rhythms for a two people band.

From C:

1. **The hero's material.** Put the Blue Marble in A's hero slide in C's composition, so the hero builds its picture once (the develop over about 1.5 s after load) while the h1 stays final. This needs Kevin's answer to NEXT.md question 5. If the answer is no, the Blue Marble replaces the lighthouse in band 2 instead, which also removes GT's sentence from the plate.
2. **The brand kit on the page's deck.** Add three kits that restyle all six of A's slides, so that Present then shows the visitor's kit. Mix the field's tone and cut the words at the midpoint, so the title never passes through grey on grey.
3. **Print This Deck.** A's print still becomes the visitor's deck, one 16 by 9 page per slide.
4. **The agent's ring and transports.** In A's agents band:
   - the ring travels to the change, by transform, in ink for an agent;
   - CLI, MCP and HTTP tabs show the real tool names and paths.
5. **The metric matched Inter fallback face,** in place of hiding the page while the font loads.
6. **The touch sentence:** "Tap the title to select it."

Fixes A needs on its own:

- Paint the agents band's end state at rest, with slide 6 written and the history filled. Run then plays it from the start.
- Show the Tailor slides at a size where their words read.
- Drop one of the three vertical lines around the hero slide. Its edge can sit on the column's gutter with no separate border.
- Animate Undo by transform.
- Square the buttons and the field, as the branch's grammar says.
- Keep the agent panel from cropping a line at its bottom edge.

Do not take:

- B's six field strips and its constant loops.
- B's two people band before production supports it.
- C's tool row in the first screen.
- C's prose reveals.
- C's second renderer.
- C's 60 row menus instrument.
- Any picture used more than once.

The grafted A stays inside the budget. The kit, the print stylesheet and the ring are each under 2 KB of script. The loupe's two rasters load lazily (B estimates 60 to 150 KB). The hero tone map is about 20 KB. I estimate the grafts add about one pipeline day to A's three, which keeps the build inside the three to four days.

## 8. Questions for Kevin

1. NEXT.md question 5: may the dithered Blue Marble develop in the first screen? A's hero needs a material, and C shows it is the strongest one.
2. POLISH.md 3.2 "Nothing animates" and 3.3 item 3 "no dither on the page". Every direction reverses both, and A reverses them least.
3. `docs/brand.md` section 11 says `/home` draws no blue. A uses the blue only while something is being worked on: selection, caret, guide and focus.
4. Should the page height row of 5,000 px at 1440 rise to about 6,000? A is 5,719 px before the grafts.

## 9. Evidence

- Pictures in `judge-1/`, PNG or JPEG, each under 400 KB:
  - `first-screens-1440.png`: the three first screens side by side.
  - `phones-top.jpg`, `phones-mid.jpg`: the three phone pages side by side, the first 6,000 px.
  - `a-mid.png`: A's Tailor, agents and present bands at rest.
  - `a-agents-done.png`: A's agents band after three runs.
  - `type-a-h1.png`, `type-b-h1.png`, `type-c-h1.png`: the h1s at device scale 2.
  - `b-hero-typed2.png`: B's terminal breaking words.
  - `b-canvas-dragged.png`: B's selected title under the picture, with the printed action.
  - `b-field-people.png`: one of B's chapter fields at 1:1.
  - `c-kit-230.png`: C's kit change at 230 ms.
  - `c-export-dragged.png`: C's export seam and its chips.
  - `c-low.png`: C's agents band and Version history at rest.
- Scripts and raw results: the session scratchpad's `lj1/` (`audit.mjs`, `interact-a.mjs`, `interact-b.mjs`, `interact-c.mjs`, `type.mjs`, `collect.mjs`, and `out/audit-*.json`, `out/interact-*.json`), with the load at every run in `gate-audit.log` and `gate-interact.log`.
