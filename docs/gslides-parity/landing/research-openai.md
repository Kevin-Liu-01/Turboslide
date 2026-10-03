# OpenAI's brand and launch pages, read for the Turboslide landing

Researcher: openai lane of the landing workflow. Read on 2026-10-02 between 15:20 and 16:00 PDT. Every claim about a page names its URL; every page was read on 2026-10-02. Pictures are in `docs/gslides-parity/landing/openai/` (listed in section 12). This note studies OpenAI's craft and translates it into Turboslide's grammar. Nothing of OpenAI's (logo, typeface, images, copy) belongs in a prototype.

## 0. How this was captured, and what differs from the brief

- **Playwright, then a stop.** Headless Chrome through `playwright-core` from the worktree read five pages (openai.com, /brand, /news, /index/introducing-gpt-6-1-sol/ and a dots attempt) and stored their text, links and computed type. On the sixth load Cloudflare answered every openai.com URL with a 403 challenge (`cdn-cgi/challenge-platform`). That is bot detection, so I did not try to get around it: no stealth flags, no switch to headed mode, no further user agent changes. My first five loads had set a desktop Chrome user agent string. I dropped that override once the challenge appeared.
- **Captures after the stop** came from the Claude Browser pane, which loaded the same pages without a challenge. I set its viewport to 1440 x 900 and to 390 x 844, so the layout is the real one at those widths. The pane returns screenshots scaled to 800 px wide (desktop) and 390 px wide (phone, at scale 0.5). The pictures here are therefore smaller than native.
- **Timings at 50 ms resolution** come from three sources and none of them is an eyeball estimate:
  1. The Web Animations API. A poller ran every 30 to 50 ms over `document.getAnimations()`, and stylesheet rules were read for durations, delays, easings and keyframes. For CSS animations I paused every animation and set `currentTime` to exact values, then took screenshots, so those strips sit on exact times.
  2. Element sampling. For JS-driven motion (the home composer) a script read position and opacity every 25 ms.
  3. CDN video. For the loops served from `cdn.openai.com` (DevDay takeover, Astra card, Codex floral), ffmpeg read the stream once and wrote frames on a 50 ms grid, which were then diffed frame to frame. The video files were not saved.
  
  For Vimeo-hosted films (the dots demo, the brand film) the Vimeo player's postMessage API paused the player and seeked it to exact times.
- **Real-time strips** (the Sol and Astra hero load, the composer change, carousel and viewer clicks) are labelled with times read from `performance.now()` at each capture. They are true to about 30 ms.
- **WebGL limit.** Late in the session the pane stopped drawing new WebGL contexts. The Sol sun was missing at 390 px and on a final desktop reload, and the Astra hero stayed black at 390 px. Earlier desktop captures show both heroes working. Section 9 discusses the Astra case, because the page's title waits for the canvas.

## 1. Sources

| Source | URL | Read | Used for |
| --- | --- | --- | --- |
| OpenAI home | https://openai.com/ | 2026-10-02 | Hero composer, DevDay takeover, type, news grid |
| Design Guidelines | https://openai.com/brand/ | 2026-10-02 | Brand film, wordmark, Blossom, OpenAI Sans, rules |
| News index | https://openai.com/news/ | 2026-10-02 | Picking the launches |
| Launch 1 (product): Introducing dots, Sep 29, 2026 | https://openai.com/index/introducing-dots/ | 2026-10-02 | Character hero, interface recording, scene carousel, CSS motion bundle |
| Launch 2 (model): Introducing GPT-6.1 Sol | https://openai.com/index/introducing-gpt-6-1-sol/ | 2026-10-02 | Split title, sun hero, static charts, type tokens |
| Launch 3 (model): GPT-6 Astra, Sep 3, 2026 | https://openai.com/index/gpt-6-astra/ | 2026-10-02 | Letter reveal, star field chapters, demo tabs, working deck viewers, long-page pacing |
| Product page (extra) | https://openai.com/codex/ | 2026-10-02 | Interface crops at reading size, floral ground |
| CDN loops | https://cdn.openai.com/ctf-cdn/b0d83bf9-a900-4bf3-a451-d22a5a225df8/devday-2026-homepage-takeover.mp4, https://cdn.openai.com/ctf-cdn/bf58ef4d-444d-4a07-9dd6-082405b9b696/Astra_Hero-1x1.mp4, https://cdn.openai.com/ctf-cdn/floral_a.mp4 | 2026-10-02 | Frame strips on a 50 ms grid |
| Wallpaper, Jonathan Bell, 2025-02-04 | https://www.wallpaper.com/tech/openai-has-undergone-its-first-ever-rebrand-giving-fresh-life-to-chatgpt-interactions | 2026-10-02 | The Point, OpenAI Sans, palette, Sora textures, intent |
| Creative Review | https://www.creativereview.co.uk/openai-brand-refresh/ | 2026-10-02 | Font consolidation, voice disc, photography plus Sora textures |
| Studio Dumbar case study | https://studiodumbar.com/work/openai | 2026-10-02 | Motion partner since spring 2024, Advanced Voice shader |
| D&AD archive, OpenAI brand film | https://www.dandad.org/work/d-ad-awards-archive/openai-brand-film | 2026-10-02 | Film credits, Wood Pencil 2025, the Point in motion |
| Stash Media, 2025-02-06 | https://www.stashmedia.tv/love-it-or-not-the-openai-refresh-looks-great-in-motion | 2026-10-02 | Film credits (Moeller, Jager, Dumbar, Dinamo) |
| Fast Company | https://www.fastcompany.com/91273217/open-ai-rebrand-chat-gpt-logo | 2026-10-02 | Returned 403. Not read, not cited for any claim |

## 2. The pages in one paragraph each

- **openai.com.** The first screen is a working ChatGPT composer with one heading above it, rather than a marketing hero. A large example prompt sits in the input and changes every 2.6 s, in several languages; five chips sit under it. On 2026-10-02 a closable DevDay takeover (a black panel with a 12.5 s character loop and a Watch live button) covers the composer until Close is pressed. Below it is a grid of image cards and news rows, and the page ends on one large heading with a download link. It is 6,524 px tall at 1440. (`stills-desktop-heroes.jpg`, `strip-home-composer-prompts.jpg`, `strip-home-devday-takeover.jpg`)
- **/brand.** The page has a 64 px title and a Contact button, then the 110 s brand film, which starts muted and has Pause, Unmute and Fullscreen controls. Long sections follow: wordmark with its construction, Blossom on its grid, a gallery carousel, the OpenAI Sans specimen as ruled rows, and do and don't lists. It is 13,755 px tall. (`pacing-brand-desktop.jpg`, `strip-brand-film.jpg`)
- **Introducing dots.** The hero is a grey ring above a 64 px title, a date and two tags, two buttons, a Listen to article row and a bold lead sentence. Clicking the ring shuffles to a 3D character. Further down: a 2:26 launch film, prose with a sticky contents rail, a 16.6 s interface recording in a colour field, a five-scene carousel of product interfaces with a caption under each, a phone loop, safeguards prose, and a get started block. 11,091 px. (`strip-dots-hero-character.jpg`, `strip-dots-product-demo.jpg`, `strip-dots-carousel.jpg`, `pacing-dots-desktop.jpg`)
- **Introducing GPT-6.1 Sol.** On a black page, "GPT-6.1" sits at the left edge of the column and "Sol" at the right, at 64 px. A sun ignites between them and an arc of particles streams in behind. A 48 px statement heading follows, then prose, cost and score charts in rounded panels (static, with monospace axis ticks), a tabbed bar chart, pricing prose and keep reading cards. 12,121 px. (`strip-sol-hero-load.jpg`, `demo-surfaces.jpg`)
- **GPT-6 Astra.** The title is split across the width like Sol's ("GPT" left, "Astra" right). Its letters slide in from the centre outward over a star field that gathers into a spiral. The field is a fixed layer behind the whole page: it reforms as a cursor before the computer use chapter and as the Blossom before the evaluation table. The page alternates prose, tabbed charts with a 6 s auto-advance countdown, tabbed task recordings with honest captions, two working slide viewers (reference file and model output), live embedded sites, quotes, and ends on a ruled evaluation table. 32,914 px. (`strip-astra-title-reveal.jpg`, `strip-astra-hero-load.jpg`, `strip-astra-chapter-cursor.jpg`, `strip-astra-deck-demo.jpg`, `pacing-astra-desktop.jpg`)
- **Codex (product page).** A 64 px title sits over a 6 s macro petal loop. Below are a logo row and a static replica of the Codex app window. Feature sections alternate text and crops of the real interface at reading size, set on soft gradient grounds. At 390 px the download button becomes "Visit on desktop to download", and the crops keep their scale and run off the right edge. (`strip-codex-floral-loop.jpg`, `stills-mobile.jpg`)

## 3. Type: how big type carries a page

Measured with `getComputedStyle` on openai.com, /brand and the Sol page, and read from the Sol page's `:root` tokens on 2026-10-02:

| Token | Size (375 px to 1440 px viewport, fluid `clamp`) | Line | Tracking | Weight |
| --- | --- | --- | --- | --- |
| `--type-xl` | 64 to 112 px | equal to size | -0.02em | 500 |
| `--type-h1` | 32 to 64 px | 36.5 to 64 px (1.0 at desktop) | -0.03em | 500 |
| `--type-h2` | 32 to 48 px | 36.5 to 55.7 px | -0.03em to -0.01em | 500 |
| `--type-h3` | 24 to 30 px | 31.7 to 39.6 px | -0.01em | 500 |
| `--type-h4` | 20 to 22 px | 24 to 27.7 px | -0.01em | 500 |
| `--type-p1` (body) | 17 px | 28 px (1.65) | -0.01em | 400 |
| `--type-p2`, caption, meta, CTA | 14 px | 14 to 23 px | 0 | 400 or 500 |

- **Every heading is weight 500.** Heavier weights appear only for 700 inline bold terms in prose and the 600 composer heading on home (28 px). The specimen on /brand shows five weights, but the site uses two.
- **Tracking tightens with size**: -0.01em for body, -0.03em at 48 to 64 px. Line height drops to 1.0 for the 64 px title.
- **Big type carries the page by being alone, not by being huge.** No page title is larger than 64 px at 1440. Each title has only the date, tags and one or two buttons around it, and the first screen keeps 60 to 70 percent empty ground. The 112 px `xl` token exists, but no page I read used it.
- **The split title.** Sol and Astra set the model name as two words pinned to the two edges of the 1,376 px column ("GPT-6.1" left, "Sol" right, 1,274 px apart at 1440). The middle is left to the image. At 390 px the words stack at the left (`@max-[600px]:flex-col`).
- **Prose column**: about 666 px wide at 17/28, roughly 75 characters a line. A sticky contents rail sits at the left of the article on launch pages. It becomes a sticky dropdown under the header on phones.
- **Numbers** in charts use a monospace face for tick labels. Headings and body never use mono.

## 4. How a product is demonstrated

From most to least direct:

1. **The product working in the first screen.** openai.com's hero is the real composer: you can type and send. The example prompt is the only motion. It changes every 2.6 s, mixes languages (English, Japanese, Spanish, German, Portuguese, French) and never types character by character. A visually hidden label ("Message ChatGPT", `clip-path: inset(50%)`) stays constant for screen readers. Source: https://openai.com/, element sampling.
2. **Working viewers of real output.** Astra's presentation demo is two working slide viewers side by side, "Reference file" (1 / 3) and "GPT-6 Astra output" (1 / 12). Each has previous and next, a counter, a thumbnails toggle and fullscreen. Next plays a 280 ms enter (opacity 0.7 to 1, 5% horizontal travel), and a grey placeholder shows while the slide image loads. Nearby, live sites built by the model run inside iframes. Source: https://openai.com/index/gpt-6-astra/, about y 10,800 and 12,800.
3. **Interface recordings as loops.** The dots page shows the real interface doing a task, recorded: a typed request in the chat, the agent's own browser opening an app, Play, the queue, the library, and a stream of chat replies reporting back. It is 16.6 s, muted, looping, with no controls, and starts when in view. It sits in a flat colour field with the character in a corner. Astra's task recordings sit behind a tab row (eight tasks). Each caption states the length and that playback is condensed: "This is a 15-second condensed playback of…". Sources: dots via the Vimeo API, Astra captions via the DOM.
4. **Crops of the real interface at reading size.** Codex shows the app sidebar, a task thread and a diff summary at roughly 1:1. They are not shrunk to fit a whole window. At 390 px they keep their scale and run off the right edge. Source: https://openai.com/codex/. The dots carousel does the opposite at 390 px: the whole window shrinks until it cannot be read (`stills-mobile.jpg`).
5. **Scenes with a changing caption.** The dots carousel pairs each product interface with a bold title and a short paragraph under it. Next scrolls the track (about 0.4 s) and swaps the caption. Neighbouring scenes peek in at both sides.
6. **Charts that hold still.** Sol's and Astra's cost and score charts, bar charts and tables have no draw-on or count-up animation. On Astra, tabs switch between charts and advance on their own every 6 s, with a countdown rule in the active tab.
7. **Staged typing in film.** The brand film types a short prompt with the Point as the caret (3.5 s, `strip-brand-film.jpg`). This is the one place where typing is staged character by character, and it happens in a film, not in page UI.

## 5. Pacing of a long page (Astra, 32,914 px; dots, 11,091 px)

- **One rhythm repeats**: a statement heading (30 to 48 px), two to four paragraphs, then one piece of evidence (a tabbed chart, a recording, a working viewer, a quote) in a wider frame. Evidence is never stacked twice without prose between.
- **Chapters are marked by the field**: Astra's fixed star field gathers into a shape between chapters. A cursor comes before the computer use chapter (y 4,500); the Blossom comes before the evaluation table (y 26,000). In between it thins to scattered stars behind the prose. The shape matches the chapter's subject.
- **The page ends in its densest form**: Astra closes on a ruled evaluation table, and dots on a plain get started block with tags and author. Neither ends with a hero-style CTA band.
- **Navigation through length**: a sticky contents rail on desktop, a sticky section dropdown on phones, and a Listen to article player (8:00) under the dots title.
- **No scroll choreography**: `scroll-behavior: auto` on html, no Lenis, Locomotive or GSAP global, no `data-aos` or scroll-reveal attributes. The animation poller saw no reveal on prose, headings, charts or images while scrolling Sol and dots. The only scroll-linked motion is Astra's fixed field and one CSS view-timeline component (the WindowAperture doors, section 6).

## 6. Imagery

- **The Point** is the brand's central figure: a black disc that stands for the cursor and the place an answer begins, and the geometry behind the letterforms, grid and spacing (Wallpaper, 2025-02-04). In product it becomes the voice disc (Creative Review). In the brand film it is the caret, a field of points, a bullet on the active row of a principles list (`strip-brand-film.jpg`, 1 s to 16 s), and a large disc (65 s). The dots hero turns it into a neutral grey ring that becomes a character on click.
- **Abstract fields as matter that assembles.** The Astra star field gathers into a spiral and disperses again. Its 15.2 s card loop seams on scattered stars (gather 3 to 6 s, hold 6 to 9 s, disperse 9 to 12 s, `strip-astra-card-loop.jpg`). Sol's sun ignites and pulls an arc of particles. They read as one material that changes shape, never as decoration laid over a page.
- **Macro textures** stand in for colour: the 6 s floral loop on Codex (2560 x 2560, slow drift only). The press describes this kind of texture as made with Sora (Wallpaper; Creative Review).
- **Photography and archive film**: the Astra page opens on an archival film of a person watching a point of light. The brand film sets a sentence word by word across a photograph of water (80 s).
- **Characters** belong to the product they launch (dots, DevDay). They are a launch-specific device rather than a brand rule.
- **Construction drawings**: the brand film and /brand show letters with outlines, circles and guide lines (24 s, 50 s, 95 s), and the wordmark sits on a column grid with circles at the corners. This is close to the GT deck's rails and registration crosses.
- **Restraint**: one image material per page (stars on Astra, the sun on Sol, characters on dots, petal on Codex). Type sits on it and never over a busy area. /brand states the Blossom rules (no colour added, never over a busy image, lots of open space).

## 7. Motion grammar, measured

| What | Duration | Easing | Delay or stagger | Source |
| --- | --- | --- | --- | --- |
| Hero word reveal (shared CSS module `AnimatedIntroHero`) | 720 ms | cubic-bezier(.16, 1, .3, 1) | per word via `--animated-intro-word-delay`; opacity snaps to 1 at 0.01%, then a 6 px rise | openai.com stylesheet, read on /index/introducing-dots/ |
| Subhead, buttons, media after it | 720, 720, 960 ms | cubic-bezier(.16, 1, .3, 1) | at 480, 620, 760 ms; rise 0, 18, 22 px | same |
| Caret colour flash on the first characters | 200 ms | step-end | after the reveal | same |
| Astra title letters | 1000 ms each | cubic-bezier(.22, 1, .36, 1) | 100 ms, centre letters first (T and A at 850 ms, then outward to a at 1,250 ms); 44 px slide toward the centre | https://openai.com/index/gpt-6-astra/, WAAPI read and seeked |
| Astra ambient backdrop | 5,500 ms | linear | to opacity 0.55 | same |
| Astra hero mount | at 1.14 s after navigation start | | stars visible at 3.85 s, spiral formed by about 7.2 s | real time |
| Sol hero | title present from first paint | | sun from about 1.9 s, bright by 5 s, arc complete by about 7 s | real time |
| Tab countdown (Astra charts) | 6,000 ms per tab | linear | first third holds at zero, then the rule fills over 4 s | WAAPI |
| Slide viewer Next | 280 ms | linear keyframes | opacity 0.7 to 1, translateX 5% to 0 | WAAPI |
| Home composer prompt change | about 450 ms every 2.6 s | ease-out (fast start, long tail) | old line up about 23 px and out; new line from 22 px below | sampled every 25 ms |
| Carousel track (dots) | about 400 ms | scripted scroll | caption swaps with it | real time |
| Buttons, links, nav icons | 200 to 250 ms | linear or cubic-bezier(.4, 0, .2, 1) | none | WAAPI on dots, Astra, Sol |
| Contents rail fade | 100 ms | cubic-bezier(.17, .17, .3, 1) | none | WAAPI on Sol |
| WindowAperture doors (scroll-linked) | scroll range | cubic-bezier(.333, 0, .667, 1) | two black bars from plus or minus 100% to 0; title halves from plus or minus 50% | stylesheet, CSS view-timeline |
| DevDay takeover loop | 12.5 s, 30 fps | | 0.8 s black, characters enter by 4 s, drift, gone by 11.45 s, black to the seam | CDN frames |

- **Common durations in the dots page stylesheet**: 0.2 s (26 rules), 0.3 s (14), 0.15 s (13), 0.7 s (6), 0.35 s and 0.5 s (5 each). Easings: `ease` (39), the Tailwind default curve (49), plus cubic-bezier(.22, 1, .36, 1), (.23, 1, .32, 1), (.33, 1, .68, 1) and (.4, 0, .2, 1). Arrivals use ease-out curves with a long settle. I found no bounce, overshoot or spring.
- **Staggers** are 100 ms per letter on Astra and per word on the intro module. Blocks hand off at 140 ms steps (480, 620, 760 ms).
- **What never moves**: body text, headings after their one arrival, charts and tables, the navigation, buttons (colour only), prose images, and the page itself (no smooth scroll, no parallax on content). On Sol the title is still from the first frame and only the image behind it moves.
- **Loops seam on rest**: every loop I measured meets itself on an empty or scattered state (black, scattered stars, a drifting petal), so the seam is invisible.

## 8. Interaction

- **Click to change the hero object**: the dots ring shuffles through characters on each click, settling in about 0.5 to 2 s (`strip-dots-hero-character.jpg`). The button is labelled "Choose your dot character".
- **Drag or arrow keys**: Astra's star field, cursor and Blossom are each a button labelled "Drag or use arrow keys to rotate the …", so the 3D field works from the keyboard. There is a separate "Replay spiral field animation" button.
- **Pause controls**: Sol has "Pause animation" (the `AnimationPlaybackControl` module). It appears on hover or focus with a pointer and is always visible on touch. It is hidden under reduced motion because nothing moves then. /brand has Pause video and Unmute video on the film.
- **Tabs that advance on their own** carry a visible countdown and stop when the reader takes over (Astra). Task recordings sit behind tab rows, so each one is a choice.
- **Working embeds**: slide viewers with next and previous and fullscreen, and live sites in iframes (Astra).
- **Close** on the home takeover returns the page to its normal hero.
- **Copy command**: a `$ npm i -g @openai/codex` button on Codex.

## 9. Accessibility

- **Reduced motion has its own blocks**: 56 to 77 `prefers-reduced-motion` blocks per page (home 57, /brand 57, Sol 77, dots 58, Astra and Codex 56; counted from the stylesheets). Reveals are wrapped in `no-preference`, so the default is static. Under `reduce`, Astra shows a static image of the shape (`shapeFallback`, `data-astra-static`), the letters render in place, the tab countdown is off, the playback control hides, and the scroll doors are removed.
- **Rotating text gets a constant label**: the composer's changing prompt is decorative; the field's accessible name stays the same.
- **Every moving thing can be stopped or redone**: pause, replay, mute, or a static fallback.
- **Keyboard parity for 3D**: arrow keys rotate what drag rotates (Astra).
- **Captions state what a recording is**: length, condensed or not, and what task it shows (Astra).
- **Risk seen**: at 390 px, when the canvas did not start (in this capture environment), the Astra hero stayed black for 11 s with both title labels at opacity 0. The title waits for the imagery, so a slow GPU means no title. Section 10 makes this a rule for Turboslide.
- **Not to copy**: the date and tags line above the dots title acts as an eyebrow, which Kevin's avoid list refuses. OpenAI's copy also uses em dashes, which the brand rules refuse.

## 10. The craft as rules (what I would hold Turboslide's landing to)

1. Show the working product in the first screen, with one real input or object, and let one thing in it move.
2. A title arrives once, in under 1.3 s, then never moves again. Type renders at first paint even if the imagery is late. Never make the title wait for a canvas.
3. All headings use one weight. Size steps are few (64, 48, 30, 22, 17). Tracking tightens as size grows (-0.03em at the top). Body is 17/28, about 75 characters a line.
4. Pin a two-part title to the two edges of the column and give the middle to the picture.
5. Arrivals use one ease-out curve with a long settle (cubic-bezier(.16, 1, .3, 1) or (.22, 1, .36, 1)). Staggers are short and ordered, and hand-offs between blocks are about 140 ms. No bounce or spring.
6. Prose, charts, tables, navigation and buttons do not animate on scroll. Scroll stays native.
7. Imagery is one material per page. It assembles into the shape of the chapter it introduces, then thins out behind the reading.
8. Product evidence goes in this order: a working viewer, a recording of the real interface, a crop at reading size, a static chart. A caption always says what the reader is looking at and for how long.
9. Recordings are short (15 to 17 s), muted, looping, start in view, and seam on a rest state. A tab row lets the reader choose among several.
10. Anything that advances on its own shows its countdown and stops when touched.
11. Every moving object has Pause, or Replay, or keyboard control, and a static state under reduced motion.
12. At phone width, interface crops keep their reading size and run off the edge. They do not shrink into thumbnails.
13. Long pages end on their densest evidence (a ruled table), not on a slogan.

## 11. What the Turboslide landing could take, in its own grammar

The landing's sections today are Hero, Numbers, Canvas, Menus, Present, Export, Agents, License (`apps/studio/src/routes/home.tsx`). Each idea below names the section it changes and stays inside the brand rules: Inter, paper and ink, the selection blue `#2f5ce0` as the one interface colour, one rail, ruled rows, Heroicons solid, the dither field and mood pictures, the avoid list, and reduced motion.

1. **Hero: a working slide in the first screen.** Replace the hero picture with a live, small Turboslide canvas holding the example deck's opener. Selecting the title box draws the blue selection frame and its eight handles, and the text can be edited in place. The only autonomous motion is a caret blink in the selected box. This is the composer lesson (rule 1), carried by the editor itself.
2. **Hero: the selection frame as Turboslide's Point.** OpenAI's Point is its cursor. Turboslide's equivalent is the blue selection frame. Let it be the one moving mark across the page: it settles on the hero box, then appears once per section on the object that section describes. It moves on a power3.out curve, between 600 and 900 ms, and only on arrival.
3. **Hero title on the rails.** Set the H1 as two parts pinned to the two rails of the 1,104 px column, with the dither field or the canvas in the middle (rule 4). The words arrive once, 720 ms each on cubic-bezier(.16, 1, .3, 1) with a 60 ms stagger in reading order (inside the GT 40 to 90 ms band), and are present at first paint without script (rule 2).
4. **Chapter breaks drawn by the dither field.** Give the page one fixed Bayer dither field. Between sections it gathers by tone mixing (never alpha) into the glyph of the next chapter: a slide rectangle before Canvas, a menu row before Menus, the presenter's frame before Present, a page before Export, and the five-rectangle Turboslide mark before License. Between gatherings it thins to a sparse field. The trigger is a CSS view-timeline or an IntersectionObserver, with native scroll and no inertia. This is Astra's star field translated into GT's 1-bit material.
5. **Canvas: a working viewer, two up.** Embed two real viewers from the `/embed/$deckId` route side by side: a PowerPoint file as imported, and the same deck after an edit in Turboslide. Each has previous and next, a tabular "2 / 12" counter and fullscreen, and Next uses a 280 ms enter. Under it goes a one-sentence caption saying what changed. (The page's forbidden phrases rule out comparison headlines, so this pair shows import fidelity, not a rival.)
6. **Menus: tabs of tasks with a countdown rule.** A ruled tab row of real tasks (insert a chart, change a theme, add speaker notes). Each tab plays a 15 to 17 s muted recording of the real editor, captured from the product, never mocked. Each caption states its length and that it is played at normal speed. The active tab carries a 2 px rule that fills linearly over 6 s and stops on hover, focus or click. It is removed under reduced motion (rule 10).
7. **Present: a crop at reading size.** Show the presenter view (speaker notes, timer, next slide) at about 1:1. At 390 px it keeps its scale and runs past the right rail with a hard edge (rule 12).
8. **Agents: one command, one change.** A code panel (the one place mono is allowed) shows a single agent call. On the same beat the slide beside it changes, and the blue frame lands on the changed object. The call holds 2.6 s, then the next example replaces it with OpenAI's measured transition: about 450 ms, the old line up 22 px, the new from below. The panel's accessible name stays constant and the examples are `aria-hidden`. Three or four real commands from the MCP surface, no sparkle iconography.
9. **Numbers: still on purpose.** Keep the numbers row and every chart or table static (rule 6). Figures in tabular Inter, ruled rows, no count-up. The page closes on the densest evidence: a ruled parity table from HOME_FACTS before the License section (rule 13).
10. **Mood pictures as the second material.** Use one photographic mood picture at most per screen, dithered, with a slow sampling drift of under 3 percent and no move on type. Its credit sits in the plate, as in the deck.
11. **Controls for every motion.** The hero field gets Replay and Pause, visible on hover or focus with a pointer and always on touch, and hidden under `prefers-reduced-motion: reduce`, where the field renders as a still. The 3D or field objects, if any, answer arrow keys as well as drag.
12. **Captions as facts.** Each figure gets one plain sentence saying what it shows ("A 16 second recording of the editor inserting a chart"). Headings state one checkable fact. Button labels in Title Case. No date eyebrow, no em dashes.
13. **Load order.** HTML type and buttons first, the dither field second, recordings last and only when in view. If WebGL or the canvas fails, the page is complete without them.

## 12. Pictures (all under `docs/gslides-parity/landing/openai/`)

| File | What it shows |
| --- | --- |
| `stills-desktop-heroes.jpg` | First screens at 1440 x 900: home with and without the takeover, /brand, dots, Sol, Astra, Codex |
| `stills-mobile.jpg` | 390 x 844: home, dots hero, dots scenes, Sol with its Pause control, Astra black at 11 s, /brand, Codex and its bleeding crop |
| `strip-home-composer-prompts.jpg` | The composer's prompt change, 0 to 168 ms in about 33 ms steps, plus a held line |
| `strip-home-devday-takeover.jpg` | DevDay takeover loop, frames from a 50 ms grid over 12.5 s |
| `strip-brand-film.jpg` | Brand film seeked to 1, 3.5, 10, 16, 24, 35, 50, 80, 95 and 106 s |
| `pacing-brand-desktop.jpg` | /brand by scroll position |
| `strip-dots-hero-character.jpg` | The ring and three clicks to characters |
| `strip-dots-product-demo.jpg` | The 16.6 s interface recording seeked to 0 to 15 s |
| `strip-dots-carousel.jpg` | Scene carousel: Next and the following 1.2 s |
| `pacing-dots-desktop.jpg` | dots by scroll position |
| `strip-sol-hero-load.jpg` | Sol hero from 0.57 to 7.0 s in real time |
| `strip-astra-title-reveal.jpg` | Astra letters seeked to 800 to 2,300 ms |
| `strip-astra-hero-load.jpg` | Astra hero from 1.0 to 9.2 s in real time |
| `strip-astra-chapter-cursor.jpg` | The field reforming as a cursor at the computer use chapter |
| `strip-astra-deck-demo.jpg` | The two slide viewers and a Next click |
| `strip-astra-card-loop.jpg` | Astra card loop, 50 ms grid, 15.2 s |
| `pacing-astra-desktop.jpg` | Astra by scroll position, 0 to 26,000 px |
| `strip-codex-floral-loop.jpg` | Codex floral ground, 50 ms grid, 6 s |
| `demo-surfaces.jpg` | Codex crops, Codex app window, Astra viewers, dots loop, a Sol chart, Astra chart tabs |

No WebM was made; the strips carry the timings.

## 13. Limits

- **Screenshot size.** Screenshots are 800 px wide at desktop (pane scaling), not 1440.
- **No Playwright after the challenge.** No Playwright capture after the Cloudflare challenge, and no attempt to pass it.
- **The intro module's page was not found.** The `AnimatedIntroHero`, `WindowAperture` and `FactoryOperatingLoop` modules are in openai.com's shared stylesheet. I did not find the page that renders them among the pages read, so their timings come from the CSS, not from a capture.
- **Missing WebGL after the stop.** Late WebGL captures failed in the pane (section 0). Desktop captures of Sol and Astra were taken before that and are complete.
- **Mixed press access.** Fast Company refused the fetch. The Wallpaper, Creative Review, Studio Dumbar, D&AD and Stash pages were read through a summarising fetch. Claims from them are paraphrased, not quoted.
