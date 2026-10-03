# Motion research for the Turboslide landing

Written 2026-10-02 by the motion researcher of the landing workflow (restarted at 15:26 PDT after the 15:17 cut; the cut attempt had left no motion note and no pictures). Every site below was read on 2026-10-02 between 15:45 and 16:10 PDT. Kevin's request: "make the landing much better inspired off of lovefrom and openai brand and make the landing much more interactive and showing off features featuring the best of graphic and motion design".

Contents: 1 method, 2 the rules this keeps, 3 what the sites do (measured), 4 the motion system for /home, 5 ideas for /home, 6 pictures and files, 7 sources.

## 1. Method

- Sites: Apple's MacBook Pro page, Linear, Vercel, Stripe, Arc, Figma Config, Raycast, Teenage Engineering, Rauno Freiberg, Emil Kowalski (his home page and Sonner), and the GT brand's own films and rules.
- Harness (`motion/harness/`): Chromium 151 in new headless mode with the Metal GPU (the WebGL renderer string read "ANGLE Metal Renderer: Apple M5 Max"), 1440 by 900, device pixel ratio 1, light scheme. For each site it records:
  - the CDP screencast frames with their swap timestamps (a frame strip shows the frame on screen at each time after a trigger);
  - every animation the page creates, sampled from `document.getAnimations()` every 40 ms, with its target, keyframes, duration, delay and easing (CSS transitions, CSS animations and Web Animations), plus the CDP Animation domain's start events;
  - main thread time per phase (CDP `Performance.getMetrics`: TaskDuration, ScriptDuration, LayoutDuration, RecalcStyleDuration), `requestAnimationFrame` calls, canvas contexts created, `<video>` attributes, bytes by resource type, LCP at the end of the load phase, CLS and long tasks;
  - a second run with `prefers-reduced-motion: reduce`.
- Phases: load (5 s), idle at the top (3 s, measures autoplay loops), then instant jumps to y = 1100, 2200 and 3400 px (3 s each; an instant jump is a native scroll, so in-view reveals fire as they would for a fast wheel).
- Slowed captures: for the strips of Linear, Raycast, Stripe and Sonner the page ran at a quarter speed (`Animation.setPlaybackRate(0.25)`, which slows CSS and Web Animations and leaves canvas loops alone); their strip times are animation time.
- Caveats: three other pipelines ran on the machine, the one minute load stayed at 42 to 68 for the whole capture window (the brief's wait rule was kept for 18 minutes, then each site ran alone, one browser at a time, about 20 s each, with no batch). Main thread numbers are therefore upper bounds and the screencast frame rate is lower than a display's; declared timings are exact. Bytes are one cold load from this network; lazy media a phase did not reach is not counted.

## 2. The rules this system keeps

| rule | source |
| --- | --- |
| Arrivals use `expo.out` or `power3.out`; a move from place to place uses `power2.inOut`; a process (scan, pulse, counter) is linear. No bounce, no elastic, no back overshoot. | Prototemplate `motion/MOTION.md`, "Motion" |
| A 0.5 s beat grid; staggers 40 to 90 ms in reading order; a sentence holds (words / 3) + 1 s after it arrives; camera drift (scale 1.00 to 1.04) only on a picture or a dither field, never on type. | `motion/MOTION.md` |
| A dithered field changes state only by a tone mix on one cell grid (cells switch in Bayer order on one smoothstep); alpha fades, wipes and moving masks are refused for dithered fields; a field enters by raising its tone from 0; life on a still field is a drift under 3 percent over a beat, never shimmer noise. | `motion/MOTION.md`, "Texture" |
| A line draws once, from one owner outward (a rail out of its cross), `expo.out` or `power3.out`. The brand's motion blur is a short dithered trail, never a blur filter. No shadows, glows or blur filters. | `motion/MOTION.md`, "Line", "The marks", "Color" |
| Entrance: content enters once with a 16 px rise over 620 ms, items 55 ms apart, and does not re-animate when scrolling back up. Every loop starts paused and plays only while its section and the tab are visible. Choreography runs on one timeline. Under reduced motion nothing animates and the markup is the final frame. The browser scrolls: no smooth scrolling, scroll hijacking or inertia. | Prototemplate `deck/slides/38-motion.html` |
| A canvas or GL engine mounts lazily (an IntersectionObserver arms it), pauses off screen and on hidden tabs, renders one still under reduced motion and frees what it owns in `destroy()`; quality follows measured frame cost. | Prototemplate `DESIGN.md` sections 9 and 11 |
| The product's chrome: 120, 140, 160, 180, 200 and 220 ms; `--pt-ease: cubic-bezier(0.2, 0, 0, 1)`; transform and opacity only; all durations 0 ms under reduced motion. | `packages/chrome/src/tokens.css` lines 137 to 149 and 524 to 535 |
| The Bayer engine renders one buffer pixel per cell and lets CSS upscale with `image-rendering: pixelated`; at 144k cells a gradient ramp costs 0.8 ms a frame, a glyph SDF 1.9 ms, the globe 4.8 ms, the radial burst 15.1 ms (Apple silicon, Chrome). | Prototemplate `src/lib/dither.ts` header |
| The current /home (3263728a) has no motion: `grammar.css` says "no radius, no motion"; product pictures are static `<img>` pairs with `width`, `height` and `srcset`, the hero picture has `fetchpriority="high"`. | `apps/studio/src/components/home/grammar.css`, `Shot.tsx` |

The GT films show these rules moving: `motion/strips/gt-film-open.jpg` (the Fuma Nama trailer's first 1.1 s: the heading's two lines rise through their own clip from 500 ms over 600 ms on `expo.out`, 60 ms apart; the rail draws out of its cross from 0 to 600 ms) and `motion/strips/gt-film-tonemix.jpg` (15.4 to 17.6 s: the glass moon turns into its Bayer print by a tone mix over 0.5 s, then three seams draw out of their crosses one per beat). Timings from `motion/films/blog-fuma-nama/STORYBOARD.md`, frames read from `motion/out/blog-fuma-nama.mp4`.

## 3. What the sites do (measured 2026-10-02)

### 3.1 The numbers

| site (URL) | LCP at load end | bytes on load and scroll | idle at the top: main thread, rAF calls | reduced motion |
| --- | --- | --- | --- | --- |
| Linear (https://linear.app/) | 2200 ms, a background image; the heading is at opacity 0 until about 1.44 s | 2983 KB (JS 1373, fonts 503) | 260 ms/s, 20/s | hero reveal dropped; demo loops and dot animations keep running |
| Stripe (https://stripe.com/) | 612 ms, a 33 KB WebP still of the wave | 2125 KB (JS 1110, images 674) | 135 ms/s, 255/s (16 canvas contexts: 7 WebGL, 9 2D) | animations 321 to 84; the canvas loops keep calling rAF (275/s) |
| Apple (https://www.apple.com/macbook-pro/) | 1908 ms under reduced motion, the hero end-frame JPEG (the normal run's LCP was not isolated) | 8480 KB (images 3959, video 2432, JS 913) | 14 ms/s, 1/s | no video fetched (0 KB against 2432 KB); end-frame stills shown |
| Vercel (https://vercel.com/) | 296 ms, the h1 | 2343 KB (JS 1235) | 18 ms/s, 0 | its three fades removed |
| Raycast (https://www.raycast.com/) | 1524 ms, the h1 (it fades in) | 3109 KB (JS 1302, images 1280) | 157 ms/s, 82/s | ignored: the hero fade, the card slide-ins and the WebGL hero still run |
| Arc (https://arc.net/, now "Meet Dia") | 1484 ms, a PNG background | 11209 KB (video 5408, images 4635) | 94 ms/s, 127/s | ignored: videos autoplay, the 77 s marquee runs |
| Figma Config (https://config.figma.com/) | 612 ms, a paragraph | 2864 KB (JS 1198, fonts 617, Rive wasm 719) | 3 ms/s, 0 | its one fade removed |
| Teenage Engineering (https://teenage.engineering/) | 540 ms, an SVG | 1835 KB (JS 851) | 1 ms/s, 0 | nothing animates either way |
| Rauno Freiberg (https://rauno.me/) | 468 ms, a span | 640 KB (JS 178) | 1 ms/s, 0 | ignored: the eased scroll track and the frame fades still run |
| Emil Kowalski (https://emilkowal.ski/) | 408 ms, a paragraph | 2403 KB (fonts 1059, JS 1141) | 1 ms/s, 0 | nothing animates either way |

Per-site logs: `motion/raw/<site>.json`, `<site>.digest.txt`, `<site>-reduced.json`, `reduced-compare.json`.

### 3.2 Site by site

**Apple, MacBook Pro** (https://www.apple.com/macbook-pro/, read 2026-10-02). Strip: `motion/strips/apple-highlights.jpg`.
- Motion is video, played once, on native scroll. Each media block is a `<picture>` start frame, a muted `playsinline` MP4 with `preload="none"` that a script starts when the block is in view, and a `<picture>` end frame. The start frame fades out over 200 ms `ease` when playback begins; the end frame fades in over 200 to 400 ms `ease-out` when it ends. Clips are 2.6 to 5.0 s at 1728 by 912 (product viewer) or 1260 by 680 (highlights); two of the thirteen `<video>` elements loop (one is a 7 s chip background).
- Every playing video gets a play and pause control: it fades in 740 to 940 ms after the jump (opacity 100 ms, `scale(0.5)` to 1 over 200 ms `ease-out`). The gallery's progress bar is a 6150 ms linear `width` animation.
- Under reduced motion no video is requested and the end-frame stills are shown (the LCP becomes the hero end-frame JPEG at 1908 ms).
- Idle cost at the top: 14 ms of main thread a second. The weight is images and video (6.4 MB over the run).
- Fits the avoid list: yes (native scroll; the sticky sections scrub nothing in the phases measured).

**Linear** (https://linear.app/, read 2026-10-02). Strip: `motion/strips/linear-hero.jpg`.
- Hero: each heading line, the description and the button animate opacity 0 to 1, `blur(10px)` to 0 and `translateY(20%)` to 0 over 1000 ms on `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)), with delays 400, 433, 466, 499 ms (mobile lines), 400 and 500 ms (desktop lines), 600 (description), 850 and 2000 ms, all created 1041 ms after navigation. The heading is therefore invisible for about 1.4 s; the LCP is a background image at 2.2 s.
- A scatter chart ("Cycle time by agent") reveals 437 dots, each `scale(0.4)` to 1 with opacity over 420 ms on cubic-bezier(0.25, 0.46, 0.45, 0.94), 2 ms apart: one 874 ms sweep.
- An LED-like dot grid runs 75 `steps(1)` opacity loops of 1600 to 3200 ms, plus border and label sweeps of 2000 ms linear. UI demo messages enter with a 300 ms spring written as `linear()` and a 2 px blur.
- Idle cost at the top: 260 ms of main thread a second (the highest measured). Reduced motion removes the hero reveal and keeps the loops.
- Fits: native scroll, yes; the blur entrances use a filter the brand refuses.

**Stripe** (https://stripe.com/, read 2026-10-02). Strips: `motion/strips/stripe-wave.jpg`, `motion/strips/stripe-agentic.jpg`.
- Hero wave: a WebGL2 canvas (1392 by 761) drawn every frame. Until it is ready a 33 KB WebP of the wave is the LCP (612 ms); at 2.17 s the still fades out over 250 ms linear. Between frames the wave moves slowly (the frame-to-frame pixel change stays under 0.1 percent).
- Product graphics are Web Animations triggered in view: the agentic commerce card raises its chat bubbles and products 20 px with opacity over 2260 ms `ease-out`; the payments graphic cycles on a 4000 ms delay with 1420 ms `ease-in-out` moves and `clip-path` reveals. Figures roll digit by digit: each digit is a `translateY(-100%)` move of 325 ms on cubic-bezier(0.33, 1, 0.68, 1), 50 ms apart.
- Transitions are on named curves: 300 ms cubic-bezier(0.25, 1, 0.5, 1) for colour and arrows, 800 ms cubic-bezier(0.165, 0.84, 0.44, 1) for card media, 1000 ms cubic-bezier(0.16, 1, 0.3, 1) for a border gradient. A CSS scroll timeline (`detect-scroll`) only tells the nav that the page has scrolled.
- Cost: 16 canvas contexts, 255 rAF calls a second at idle, 135 ms of main thread a second, 10 long tasks totalling 2.5 s over the run (on a loaded machine). Reduced motion cuts animations from 321 to 84; the canvas loops keep ticking.
- Fits: native scroll, yes. The 2260 ms entrance holds content half visible for over a second.

**Vercel** (https://vercel.com/, read 2026-10-02). Strip: `motion/strips/vercel-hero.jpg`.
- Almost still. The h1 paints at 296 ms and is the LCP. The black triangle is markup; a 2D canvas behind it (1080 by 720) fades in over 1200 ms linear from 1.33 s and adds its shading, and an overlay fades out over 700 ms linear at 2.5 s. One 200 ms fade further down.
- The page calls `requestAnimationFrame` 10 times in 17 s: the canvas is drawn once and left still.
- Idle cost 18 ms/s; reduced motion removes all three fades. Vercel's own design guidelines ask for the same restraint (section 7).
- Fits: yes. Decoration arrives after the LCP and never moves the heading.

**Raycast** (https://www.raycast.com/, read 2026-10-02). Strips: `motion/strips/raycast-hero.jpg`, `motion/strips/raycast-keys.jpg`.
- Hero: CSS `fade-in-up`, 1000 ms `ease`, `translateY(20px)` and opacity, the line under it 1000 ms later; a WebGL2 canvas (2160 by 1740 for 1200 by 967 css px) draws red speed bands that arrive after the text.
- A keyboard: each key goes from opacity 0.2 to 1 over 400 ms cubic-bezier(0.23, 1, 0.32, 1), keys 300 ms apart, as a sequence that reads as typing.
- Extension cards slide in with `translateY(50px) translate(10px) scale(0.98)` and opacity over 700 ms cubic-bezier(0.215, 0.61, 0.355, 1), 80 ms apart (17 cards, 1380 ms of stagger), started at load while off screen. A feature wall autoplays with a visible 5000 ms linear progress bar. 70 star twinkles are 250 ms opacity transitions on pseudo elements.
- Idle cost 157 ms/s, 82 rAF/s. Reduced motion is ignored.
- Fits: native scroll, yes; the reduced motion failure and the off-screen animations do not.

**Arc** (https://arc.net/, read 2026-10-02; the page now introduces Dia).
- Motion is video: a 6.7 s WebM with an MP4 fallback and a JPEG poster in the hero, and three 3.0 s product loops (`theme-picker.mp4`, `space-swiping.mp4`, `zero-chrome.mp4`) encoded at 3300 by 2200 for a 1440 css px slot, each about 1.1 to 1.6 MB with a PNG poster, `autoplay loop muted playsinline preload="metadata"`. A logo marquee loops over 77 s.
- 11.2 MB on load and scroll; 127 rAF/s and 94 ms/s at idle. Reduced motion is ignored.
- Fits: native scroll, yes; the loops are about 2.3 times wider than their slot and never pause off screen.

**Figma Config** (https://config.figma.com/, read 2026-10-02). Strip: `motion/strips/config-bitmaps.jpg`.
- The 2026 identity is 1-bit: stippled, halftone-like shapes in flat colour that change in place every frame. The page loads the Rive runtime (`rive.wasm`, 719 KB) and a 630 KB JS chunk. The `html` element carries `scroll-behavior: smooth`.
- The closest visual relative of the GT dither field among the sites; its cost is in bytes (wasm and JS), not main thread (3 ms/s).
- Fits: the 1-bit material, yes; `scroll-behavior: smooth` is on the avoid list.

**Teenage Engineering** (https://teenage.engineering/, read 2026-10-02).
- No animation at all on the home page (zero animations in both runs, 4 rAF calls). Product photography on black and dense small type carry the page; LCP 540 ms.
- Fits: yes. Proof that the craft can be all in the stills.

**Rauno Freiberg** (https://rauno.me/, read 2026-10-02). Strip: `motion/strips/rauno-scroll.jpg`.
- The home page maps vertical scroll onto a horizontal track and eases the track toward the scroll position for about 400 ms after each scroll (pixels change for 300 to 480 ms after a jump, about 100 rAF calls). Frames fade in over 350 ms `ease-in-out` after an 800 ms delay. Reduced motion is ignored.
- His published craft (https://rauno.me/craft, read 2026-10-02: staggered text, spatial tooltip, wheel interface, minimap) and his essay (https://rauno.me/craft/interaction-design) are the useful part: motion only where it explains a gesture, none for high-frequency actions, motion that starts from where its cause is.
- Fits: the eased horizontal track is the inertia the avoid list refuses.

**Emil Kowalski** (https://emilkowal.ski/ and https://sonner.emilkowal.ski/, read 2026-10-02). Strip: `motion/strips/sonner-toast.jpg`.
- His home page has no entrance animation (LCP 408 ms). Sonner: a new toast enters from `translateY(100%)` with opacity over 400 ms `ease`; the toast under it moves to `translateY(-14px) scale(0.95)` in the same 400 ms; a dismissed toast fades over 200 ms and drops over 500 ms. Sonner's stylesheet (https://raw.githubusercontent.com/emilkowalski/sonner/main/src/styles.css) has `transition: transform 400ms, opacity 400ms, height 400ms`; Vaul's drawer uses 0.5 s on cubic-bezier(0.32, 0.72, 0, 1) (https://raw.githubusercontent.com/emilkowalski/vaul/main/src/constants.ts).
- His rules (https://emilkowal.ski/ui/you-dont-need-animations and https://emilkowal.ski/ui/7-practical-animation-tips): UI animations under 300 ms; a 180 ms select feels more responsive than 400 ms; never animate keyboard-initiated or high-frequency actions; `ease-out` for entering and exiting; press feedback `scale(0.97)`; never animate from `scale(0)`; set `transform-origin` where the motion starts; skip the delay on a second tooltip.

### 3.3 What the measurements say

1. The fastest LCPs (Vercel 296 ms, Emil 408, Rauno 468, Teenage Engineering 540, Stripe 612) all paint the first viewport as still markup or a still image. The slow ones animate the heading in from opacity 0 (Linear: heading visible from about 1.4 s, LCP 2.2 s; Raycast: LCP 1.5 s on the fading h1). web.dev states that elements with opacity 0 are not LCP candidates (https://web.dev/articles/lcp, read 2026-10-02).
2. Decoration after the LCP is the common good pattern: Vercel's canvas fades in at 1.33 s; Stripe's 33 KB WebP stands in for the WebGL wave until 2.17 s.
3. The sites with the most motion cost the most idle main thread: Linear 260 ms/s, Raycast 157, Stripe 135, Arc 94, against 1 to 18 for the still sites. Most of it is loops nobody is looking at (off-screen card slide-ins, dot loops, rAF loops that keep running under reduced motion).
4. Only Apple, Vercel and Config honour reduced motion fully. Apple's is the model: no video bytes, the end frame as the still.
5. Every site measured scrolls natively except Rauno's eased track; Config sets `scroll-behavior: smooth`. None showed a Lenis or Locomotive marker.
6. The durations cluster by kind: chrome feedback 100 to 300 ms (Apple 200 to 240, Stripe 300, Sonner 400); entrances 620 to 1000 ms (Linear 1000, Raycast 700 to 1000, the GT deck 620); Stripe's 2260 ms is the outlier.
7. Product demos are either video (Apple, Arc) or live DOM driven by Web Animations (Stripe's payments and agentic cards, Raycast's keys, Linear's agent UI). The live DOM demos are sharp at every size and weigh nothing in media bytes.

## 4. The motion system for /home

### 4.1 Five rules

1. The first viewport is still. The hero heading, the hero picture and the nav are final markup; nothing in the first viewport animates before the LCP, and no element in it starts at opacity 0.
2. A band enters once, on the 0.5 s beat, when it comes into view; scrolling back up does not replay it.
3. Every move explains structure: a line draws from its cross, a field raises its tone, a selection appears where the pointer would be, an object moves to its new place.
4. Loops are product demos and the field's drift only; each is paused off screen and on a hidden tab, and one Pause Motion control stops them all.
5. Under `prefers-reduced-motion: reduce` the markup is the final frame, canvases draw one still and no video is requested.

### 4.2 Durations by distance and kind

| kind | travel | duration | curve | measured anchors |
| --- | --- | --- | --- | --- |
| press and hover feedback (ground, colour, border) | none | 120 ms (`--pt-dur-fast`) | `ease-out` | product 120; Apple 240; Stripe 300 |
| a small state inside a component (toast, menu, tooltip, selection outline) | up to one component height | 160 to 200 ms (product tokens) | arrive | Emil under 300, tooltip 125; Apple control 200 |
| a block entering (ruled row, paragraph, picture) | 16 px rise | 620 ms | arrive | deck slide 38: 620 ms; Raycast 700 to 1000 ms at 20 to 50 px; Linear 1000 ms |
| a heading line rising through its own clip | one line height | 600 ms | arrive | GT film 600 ms, lines 60 ms apart |
| a line drawn out of its cross (seam, rail, outline) | any length up to the 1104 px column | 600 ms | arrive | GT film rails and seams 600 ms |
| an object moving on a slide mock | d px | 300 + d / 2 ms, from 300 to 700 ms | move | Sonner 400 ms over one toast height; Vaul 500 ms |
| a dither field changing state (enter, picture to picture) | the whole field | 500 ms, one beat | smoothstep | GT film tone mix 0.5 s |
| a dither field's life while still | under 3 percent of tone per beat | continuous at 30 fps | linear | MOTION.md; Stripe's wave moves under 0.1 percent a frame |
| a process (progress, a counter, a typing caret) | | the process's own length | linear | Raycast progress 5000 ms linear; Apple 6150 ms linear |

The arrive curve covers 90 percent of its travel in the first 33 percent of its duration, so a 620 ms entrance reads as about 200 ms of movement and a long settle. CSS `ease-out` reaches 90 percent only at 74 percent of its duration, which is why it feels slow at the same length (computed in `motion/harness/ease.mjs`).

### 4.3 Curves

| token (proposed) | value | what it is | max error against the GSAP ease |
| --- | --- | --- | --- |
| `--ts-ease-arrive` | `cubic-bezier(0.16, 1, 0.3, 1)` | `expo.out`, arrivals and line draws | 1.20 percent of the travel |
| `--ts-ease-arrive-soft` | `cubic-bezier(0.25, 1, 0.5, 1)` | `power3.out`, larger blocks | 0.56 percent |
| `--ts-ease-move` | `cubic-bezier(0.65, 0, 0.35, 1)` | `power2.inOut`, place to place | 0.95 percent |
| `--ts-ease-tone` | `cubic-bezier(0.333, 0, 0.667, 1)` | smoothstep, tone mixes | exact (0.000 percent) |
| `--ts-ease-process` | `linear` | processes | exact |
| `--pt-ease` (exists) | `cubic-bezier(0.2, 0, 0, 1)` | the product's sidebar | |

Where exactness matters (a film-matched sequence), `expo.out` as CSS `linear()` is `linear(0, 0.2929, 0.5, 0.6464, 0.75, 0.8232, 0.875, 0.9116, 0.9375, 0.9558, 0.9688, 0.9779, 0.9844, 0.989, 0.9922, 0.9945, 0.9961, 0.9972, 0.998, 0.9986, 1)`. `linear()` is Baseline (MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear, read 2026-10-02).

Springs, for anything the pointer drives (dragging the seam handle, a slide object the visitor can move), so a motion can be interrupted mid-flight and keep its velocity. The brand refuses overshoot, so every spring is critically damped (damping ratio 1, mass 1):

| settles (to 99.9 percent) in | stiffness | damping |
| --- | --- | --- |
| 400 ms | 533 | 46.2 |
| 600 ms | 237 | 30.8 |
| 800 ms | 133 | 23.1 |

As CSS for a non-interactive use, the 1 s critically damped spring is `linear(0, 0.0575, 0.1803, 0.3208, 0.4551, 0.573, 0.6711, 0.7501, 0.8122, 0.8601, 0.8966, 0.924, 0.9445, 0.9596, 0.9708, 0.9789, 0.9848, 0.9891, 0.9922, 0.9944, 0.996, 0.9972, 0.998, 0.9986, 1)`, which settles in whatever duration it is given; no cubic-bezier fits it within 6 percent. Linear's UI demo already ships a 300 ms spring as a `linear()`.

### 4.4 Stagger

- Items in one group: 55 ms apart in reading order (the deck), never outside 40 to 90 ms (MOTION.md). Heading lines: 60 ms.
- A group staggers for at most 330 ms (seven items at 55 ms). Past seven items, the rest arrive with the seventh, or the group becomes a sweep.
- A sweep (many small things: dither cells, chart dots, a grid of slide thumbnails) is timed by position: each cell's delay is its Bayer threshold times one beat, so the cells switch in Bayer order across 500 ms. Linear's 437 dots at 2 ms each (874 ms) is the same idea in dots.
- Groups inside a band start on the beat: the seam and heading at 0, the rows at 500 ms, the picture's tone mix from 500 to 1000 ms, a demo's first step at 1500 ms.
- A demo sequence advances one step per beat or two (Raycast's keys are 300 ms apart and read as typing; on the GT grid that is a step per 500 ms), and holds each readable state (words / 3) + 1 s.

### 4.5 Triggers

- **First viewport:** no entrance. After the `load` event and one idle callback (capped at 1.5 s), the hero's dither field may raise its tone from 0; nothing else moves.
- **In view:** one shared IntersectionObserver for every band, `threshold: 0.35` (or `rootMargin: '0px 0px -15% 0px'` for very tall bands). The band plays once and is unobserved. A band that is already above the viewport when first observed (a visitor who jumped to an anchor) renders final at once. The hidden first pose is set by script when the observer arms, so a page without script, a crawler and a reduced motion visitor all get the final markup (`motion/demo/system.html` does this).
- **Hover:** only under `@media (hover: hover) and (pointer: fine)`; ground and colour change in 120 ms; no hover moves anything more than 4 px; nothing on hover starts a loop.
- **Press:** the ground changes in the same frame (`:active`, 0 ms in, 120 ms out). A `scale(0.97)` press (Emil) is optional for the Title Case buttons; the product chrome does not use it today.
- **Autoplay loops:** play when at least half the figure is visible and `document.visibilityState` is `visible`; pause below half and on `visibilitychange`; at most one loop playing in the viewport at once. Any motion that runs longer than 5 s next to other content needs a way to pause it (WCAG 2.2.2, level A, https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html, read 2026-10-02); Apple's pattern is a per-video control, the landing's can be one Pause Motion button in the nav's ruled row that also stores the choice for the session.
- **Pointer-driven:** dragging the seam handle or a slide object follows the pointer directly; on release a critically damped spring takes over from the pointer's velocity.

### 4.6 What may loop

- May loop: the dither field's drift (under 3 percent of tone per beat, 30 fps); a product demo sequence that shows one feature end to end, with holds; a typing caret (1100 ms `steps(1)`, as Raycast); a linear progress line that shows a demo's place.
- Never loops: type, headings, the Turboslide mark (the sanctioned specular band sweeps once), logo marquees, anything off screen, anything under reduced motion, anything in the first viewport before the LCP.

### 4.7 Reduced motion, per technique

| technique | under `prefers-reduced-motion: reduce` |
| --- | --- |
| CSS transitions and keyframes | durations to 0 ms through the tokens (the product's chrome already does this); entrance classes are never applied, so the markup is final |
| Web Animations | not created; listen for the media query's `change` event and finish any running animation |
| View Transitions | `document.startViewTransition` is not called (or `::view-transition-group(*) { animation: none }`) |
| canvas dither field | one still at the final tone, no rAF loop (DESIGN.md section 11) |
| video | the `<video>` is never given a `src`; the end frame (or poster) is shown as an `<img>` with `width` and `height` (Apple: 0 KB of video under reduce against 2432 KB) |
| springs and pointer motion | the object jumps to its end on release |

WCAG 2.3.3 (AAA) counts a change of position or size as motion animation and does not count a change of colour, blur or opacity that leaves size and position alone (https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html, read 2026-10-02). The brand's rule is stricter (nothing animates); it keeps the stricter one.

### 4.8 Techniques and their cost

Benchmarks are in `motion/raw/bench-dither.json` (`motion/harness/bench.html` and `bench-run.mjs`), run in the same Chromium at 1x CPU and at 4x CPU throttling (Lighthouse's mobile emulation slows the CPU by 4x, the usual stand-in for a mid phone), on the loaded machine.

| technique | use on /home | main thread | bytes | measured |
| --- | --- | --- | --- | --- |
| CSS transitions and keyframes on `transform` and `opacity` | entrances, hover, press, line draws (`scaleX` from the cross) | a style recalc at the start, then the compositor | under 2 KB of CSS | 60 ruled rows entering 55 ms apart: 9 ms of main thread in total at 1x, 33 ms at 4x |
| Web Animations API | the band timeline (one start time, every delay an offset on the beat), `linear()` springs, the demo sequences | the same as CSS; a few hundred bytes of script per band | no library (GSAP core alone is 72,927 bytes minified in the GT kit) | the demo band: 9 animations |
| View Transitions | an in-page demo that switches state (a slide layout or theme change); the cross-document move from /home's New Deck button into /new, which the speculation rules already prerender | a snapshot of old and new states per transition; keep `view-transition-name` on a few elements | 0 | same-document: Chrome 111, Safari 18, Firefox 144, 91.75 percent of users (https://caniuse.com/view-transitions, read 2026-10-02) |
| scroll-driven animations (`animation-timeline: view()`) | none for entrances (a scrubbed entrance replays on scrolling up, which the deck's rule forbids); a reading progress line at most | runs off the main thread | 0 | Chrome 115, Safari 26, Firefox 160, 87.22 percent (https://caniuse.com/mdn-css_properties_animation-timeline_view, read 2026-10-02) |
| canvas 2D Bayer field | the hero field and the band pictures, at the cell grid, `image-rendering: pixelated` | 1104 by 360 at 3 px cells (44k cells): 0.8 ms a frame at 1x, 3.3 ms at 4x; at 2 px cells (99k): 1.9 and 7.5 ms; a full 1440 by 900 hero at 3 px (144k): 2.6 and 10.8 ms; a phone field 390 by 300 at 2 px: 0.5 and 2.2 ms | the engine, about 3 to 5 KB gzipped (`kit/dither.js` is 9.5 KB raw) | the demo band drifting at 30 fps: 48 ms of main thread a second on the loaded machine, 5.5 ms/s once scrolled away (paused) |
| WebGL Bayer or gem smoke | only where the field needs a shader (gem smoke); otherwise canvas 2D is enough | under 0.2 ms a frame of CPU; context and program setup 6 to 78 ms once (78 ms for the first context) | the shader plus Paper Shaders' module for gem smoke | Stripe runs 7 WebGL contexts; keep one shared context on /home |
| video loops | real recordings of the product where a live DOM demo is not possible | near 0 (hardware decode) | see the video rules below | Apple 2.6 to 5 s clips, 112 to 252 KB per partial range; Arc 1.1 to 1.6 MB per 3 s loop |
| Lottie (lottie-web 305 KB in the GT kit) or Rive (719 KB wasm on Config) | none on /home | | too heavy for a landing | |

Video rules for /home:
- Prefer a live DOM demo (the product is a web app; its renderer is sharp at every width and costs no media bytes). Use video only for what the browser cannot show live (the presenter on a second screen, an export opening in PowerPoint).
- Codec: H.264 MP4 (`yuv420p`, `+faststart`) for every browser, with an AV1 WebM listed first for browsers that play it (Chrome 70+, Firefox 67+; Safari's support is partial from 17, https://caniuse.com/av1, read 2026-10-02).
- Size: at most the slot's css width at 1x (1104 px wide on desktop, a separate 720 px file for phones), 30 fps, 4 to 8 s. Budget 600 KB per loop on desktop and 300 KB on phones. A test encode of 4 s at 1104 by 624 and 30 fps (`motion/strips/dither-in-video.jpg`): the GT end card 33 to 39 KB, smooth gem smoke 47 to 68 KB, the glyph heap 147 to 239 KB, a Bayer print 221 to 308 KB (H.264 CRF 28, VP9 CRF 40, AV1 CRF 40). Dithered material costs 3 to 6 times the bytes of smooth material and the codecs smear its 1-bit cells, so the dither field is always drawn live and never shipped as video.
- Poster: the first frame as AVIF or WebP under 40 KB with `width` and `height` set; `preload="none"`; `muted playsinline loop`; the source is attached and played by the observer at 50 percent visibility (Apple's pattern); the end frame replaces the video when it stops.
- Vercel's guidelines say the same: video over GIF, and respect reduced motion (https://vercel.com/design/guidelines, read 2026-10-02); web.dev's own example shrinks a 3.7 MB GIF to a 551 KB MP4 and a 341 KB WebM (https://web.dev/articles/replace-gifs-with-videos, read 2026-10-02).

### 4.9 The performance budget

Targets: LCP under 1.2 s on a fast desktop and under 2.5 s on a mid phone (web.dev's good threshold is 2.5 s at the 75th percentile, https://web.dev/articles/lcp, read 2026-10-02); CLS 0.

| item | fast desktop | mid phone (4x CPU) |
| --- | --- | --- |
| the LCP element | the hero heading text or the hero picture (`fetchpriority="high"`, AVIF or WebP, at most 120 KB), painted as final markup | the same, the phone candidate at most 60 KB |
| motion code before the LCP | none | none |
| motion code after `load` (observer, band timelines, Bayer engine, video controller) | at most 15 KB gzipped, one deferred module | the same |
| main thread while a band enters | at most 10 ms in total per band | at most 35 ms per band (60 rows measured 33 ms) |
| main thread at idle with the field drifting | at most 2 ms a frame at 30 fps (60 ms a second) | at most 4 ms a frame at 30 fps; the field drops to 3 px cells or stops drifting if a frame costs more (the glyph-field governor in DESIGN.md section 11) |
| live loops at once | one field and one demo | one field or one demo |
| canvas contexts | at most two 2D, at most one WebGL | at most one of each |
| video | at most 600 KB per loop, 2 MB for the page, all lazy | at most 300 KB per loop, 1 MB for the page |
| long tasks from motion code | none over 50 ms | none over 50 ms |
| layout shift from motion | 0 (transform and opacity only; boxes reserved) | 0 |

For comparison, idle main thread at the top of the page (loaded machine): Linear 260 ms/s, Raycast 157, Stripe 135, Arc 94, Vercel 18, Apple 14.

### 4.10 The system on one band

`motion/demo/system.html` is a reference (not product code) of one /home band in the page grammar: the seam draws out of its left cross and the heading lines rise through their clip at 0 ms (600 ms, arrive, lines 60 ms apart); four ruled rows with solid icons rise 16 px from 500 ms (620 ms, 55 ms apart); the slide mock's Bayer field raises its tone from 500 to 1000 ms on smoothstep (cells switch in Bayer order); the selection outline in `#2f5ce0` appears at 1500 ms (120 ms); the text box moves 180 px at 2000 ms (500 ms, move). It plays once at 35 percent visibility, the field drifts at 30 fps and stops off screen, and under reduced motion it renders the final markup with one still field. Strip: `motion/strips/turboslide-system-demo.jpg`. Measured: 9 animations, CLS 0, 248 ms of main thread over the 2.5 s entrance and 48 ms a second while drifting (loaded machine), 5.5 ms a second when scrolled away.

## 5. Ideas for /home

Each idea names what to take, from whom, and how it reads in Turboslide's grammar.

1. **A still first screen (Vercel, Teenage Engineering).** The hero heading and the editor picture are final markup and the LCP; after `load` the hero's dither field raises its tone from 0 over one beat. The heading never fades in.
2. **Feature bands as live product demos (Stripe's payments card, Raycast's keys).** "Everything on a slide moves": the slide renderer in the band, a selection outline in `#2f5ce0` appears, the object moves on the move curve, the four ruled rows name each step as it happens. No video bytes, sharp at every width.
3. **Agents run the same actions (Linear's agent UI, Raycast's keys).** The action log as ruled rows: each action the agent takes appears as a row 55 ms after the last on the beat, the slide beside it changes as the row lands, and a linear progress line under the band shows the demo's place.
4. **The menus are Google's.** A real menu of the editor opens on the beat (160 ms, the product's own token), the pointer's item takes the selection blue, the submenu opens; the band's caption names the shortcut. Hover in the demo is the product's own 120 ms ground change.
5. **Present from the browser (Apple's start frame, video, end frame).** A still of the presenter view; when half visible it plays a 4 to 6 s recording of the presenter advancing slides (H.264 plus AV1, at most 600 KB, 1104 px), then rests on its end frame; a Pause control sits in the band's ruled row. Under reduced motion only the still.
6. **Numbers that land once (Stripe's digit roll).** `HomeNumbers` figures roll each digit into place once when the row enters (325 ms, arrive, digits 50 ms apart left to right, tabular figures); no counting loop.
7. **Seams that draw (the GT films).** Each band's `.ts-seam` draws its hairline out of the left cross when the band enters (600 ms, arrive), once. The page's two rails stay static (they are the page).
8. **Headings that rise through their clip (the GT films).** Every heading below the first viewport rises its lines through their own clip (600 ms, arrive, 60 ms apart).
9. **Pictures that enter by tone (Linear's dot sweep, Config's 1-bit identity).** A mood picture or a field enters by raising its tone from 0 with its cells switching in Bayer order over one beat; a picture changes to the next by a tone mix, never a crossfade or a wipe.
10. **A field with a still stand-in (Stripe's wave).** If the hero field uses gem smoke (WebGL), a 30 to 40 KB AVIF of its first frame is the paint until the shader is ready, then the canvas takes over on the same pixels with no fade.
11. **Interactive seam (the GT seam device, DESIGN.md section 10).** A draggable seam over one slide shows the same slide as the visitor sees it and as an agent reads it (its JSON or Markdown twin); the handle follows the pointer, a critically damped spring takes over on release, and the keyboard arrows move it in steps.
12. **New Deck into the editor (View Transitions).** The New Deck button's slide thumbnail becomes the editor's canvas in a cross-document view transition (300 ms, arrive) into the prerendered /new; skipped under reduced motion and in browsers without it.
13. **One Pause Motion control (Apple's per-video control, WCAG 2.2.2).** A Title Case button in the nav's ruled row stops every loop and the field's drift for the session.
14. **What not to take:** Linear's blur entrances (blur is refused), Raycast's and Arc's disregard of reduced motion, Raycast's off-screen card animations, Arc's 3300 px loops and marquee, Rauno's eased horizontal track, Config's `scroll-behavior: smooth`, Stripe's 2260 ms entrance and its seven WebGL contexts.

## 6. Pictures and files

Frame strips (JPEG, each under 400 KB; times under each frame, the frame's real offset in grey):

- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/turboslide-system-demo.jpg`: the proposed system on one band.
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/gt-film-open.jpg`: the GT film's heading rising through its clip and the rail.
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/gt-film-tonemix.jpg`: the tone mix and seams on the beat.
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/apple-highlights.jpg`: a once-played video and its control.
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/linear-hero.jpg`: the blur and rise hero (quarter speed).
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/stripe-wave.jpg`: the WebGL wave's slow drift.
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/stripe-agentic.jpg`: an in-view product graphic (quarter speed).
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/vercel-hero.jpg`: decoration after the LCP.
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/raycast-hero.jpg` and `raycast-keys.jpg`: the hero and the key sequence (quarter speed).
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/sonner-toast.jpg`: the toast stack (quarter speed).
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/rauno-scroll.jpg`: the eased horizontal track (refused).
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/config-bitmaps.jpg`: Config's 1-bit shapes.
- `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/strips/dither-in-video.jpg`: why the dither field is drawn live.

Files: `motion/demo/system.html` (the reference band), `motion/harness/` (capture, digest, strip, ease and benchmark scripts; capture writes its frames to the session scratchpad, so rerunning needs that path changed), `motion/raw/` (the logs).

## 7. Sources (all read 2026-10-02)

- Sites captured: https://www.apple.com/macbook-pro/, https://linear.app/, https://vercel.com/, https://stripe.com/, https://arc.net/, https://config.figma.com/, https://www.raycast.com/, https://teenage.engineering/, https://rauno.me/, https://emilkowal.ski/, https://sonner.emilkowal.ski/.
- Writing: https://vercel.com/design/guidelines; https://emilkowal.ski/ui/great-animations; https://emilkowal.ski/ui/you-dont-need-animations; https://emilkowal.ski/ui/7-practical-animation-tips; https://animations.dev/; https://rauno.me/craft; https://rauno.me/craft/interaction-design; https://developer.apple.com/design/human-interface-guidelines/motion (via its JSON at https://developer.apple.com/tutorials/data/design/human-interface-guidelines/motion.json: "Make motion optional", "Let people cancel motion", avoid motion on frequent interactions); https://stripe.com/blog/connect-front-end-experience (Benjamin De Cock, June 19, 2017: transform and opacity only, under 500 ms, an 800 ms Web Animation on cubic-bezier(.2, 1, .2, 1), IntersectionObserver triggers, reduced motion honoured); https://linear.app/now/how-we-redesigned-the-linear-ui (March 28, 2024; no motion content).
- Code: https://raw.githubusercontent.com/emilkowalski/sonner/main/src/styles.css; https://raw.githubusercontent.com/emilkowalski/vaul/main/src/constants.ts (copies in `motion/raw/`).
- Platform: https://web.dev/articles/lcp; https://web.dev/articles/animations-guide ("restrict animations to opacity and transform"; `will-change` only when needed); https://web.dev/articles/replace-gifs-with-videos; https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear; https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline/view; https://caniuse.com/view-transitions; https://caniuse.com/mdn-css_properties_animation-timeline_view; https://caniuse.com/av1; https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html; https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html.
- GT brand (local, read only): `/Users/kevinliu/repos/Prototemplate/motion/MOTION.md`, `deck/slides/38-motion.html`, `DESIGN.md` sections 9 to 11, `src/lib/dither.ts`, `motion/films/blog-fuma-nama/STORYBOARD.md`, `motion/out/blog-fuma-nama.mp4`.
