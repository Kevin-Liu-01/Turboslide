# Product research: what the Turboslide landing can show, live

Written 2026-10-02 from 15:24 PDT by the product researcher of the landing workflow, in the worktree `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `2108dad4` (cut from `next/round1`, which carries the new `/home` of `3263728a` and the mark of `bfc3888a`). A first attempt was cut at 15:17 PDT when the app quit; it had left no note and no pictures under this folder, so this note starts from the sources. No product source was edited, no git write command ran, nothing was pushed or deployed and no other worktree was opened.

Finished 2026-10-02 at 16:10 PDT. The pictures are under `product/frames/`, the drive's log is `product/frames/drive-log.txt`, and the two CLI readings are `product/cli-version.txt` and `product/cli-info-gt-brand.txt`.

## 0. Method and sources

- Read in the tree: `README.md` (Advanced tools, Why it is fast, The CLI in brief, Architecture, What works today), `docs/PRODUCT.md` sections 1, 4 and 6, `docs/NEXT.md` sections 1 and 4.4 (and the `/home` budget row at line 395), `docs/gslides-parity/next/audit-features.md` (sections 1 to 3), `docs/gslides-parity/next/audit-market.md` (sections 3 to 5), `docs/REALTIME.md` sections 1 to 3.4, `docs/FEATURES.md` (headings and section 1), `docs/brand.md` (head), `packages/theme/brand/facts.json` (written 2026-09-29), `packages/agent/generated/manifest.json` and `mcp-tools.json`, `packages/render/package.json`, `packages/materials/src/catalog.ts` and `mount.ts`, `packages/effects/package.json`, `apps/studio/src/routes/home.tsx`, `embed.$deckId.tsx`, `apps/studio/src/components/home/copy.ts` and `shots.json`, and the e2e helpers `apps/studio/e2e/core/lib.ts`, `realtime.spec.ts`, `brand.spec.ts`.
- Read in Prototemplate (read only): `motion/MOTION.md` (the HyperFrames brief, the kit list, the motion rules).
- Measured: the minified and gzipped size of each candidate client module with the tree's own esbuild 0.28.1 (`node_modules/.pnpm/esbuild@0.28.1`), bundled for the browser from `apps/studio` as the resolve root, output to the session scratchpad and never to the tree (section 2.2).
- Driven: the studio on a dev server on port 4541 with the tmp store, the overlay `docs/gslides-parity/landing/.overlay-product` (removed after the server stopped), the memory realtime tier and fake secrets, from 15:29 to 16:04 PDT (section 5).
- Run read only: `turboslide --version` and `turboslide info --json --deck decks/gt-brand` from the worktree's `node_modules/.bin` (outputs in `product/`).

## 1. What Turboslide is today, in facts the page may state

Every count below is read from `packages/theme/brand/facts.json` (written 2026-09-29 by `scripts/build-brand.ts --facts`) unless another source is named. The current `/home` already reads three of them through `HomeFacts` (`apps/studio/src/components/home/facts.ts`), and `copy.ts` rules that a literal count in the copy is a defect (SPEC-4 0.25). Any new section should read its numbers the same way.

| Fact | Value | Source |
| --- | --- | --- |
| Actions on one table, reached by the CLI, MCP, HTTP and the page | 193 | `facts.json` `actions`; `manifest.json` `actionCount` 193 |
| MCP tools | 169 | `facts.json` `mcpTools`; `mcp-tools.json` |
| HTTP paths in the OpenAPI document | 177 | `facts.json` `httpPaths` |
| Layouts | 22 | `facts.json` `layouts` |
| Shape presets drawn from their PowerPoint definitions | 135 | `facts.json` `shapePresets`; README Advanced tools |
| Shader materials | 17 (six featured: liquid metal, gem smoke, god rays, mesh gradient, smoke ring, grain gradient) | `facts.json` `materials`; `packages/materials/src/catalog.ts` 34 to 41 |
| Worst decoded page mismatch of the Perfect PowerPoint export, 85 slide GT deck | 0.003 percent (194 of 5,760,000 px) | `facts.json` `export` |
| Renders of the GT deck against the brand deck's screenshots | within 0.5 percent over 170 renders | README "Why it is fast" (check step 12) |
| `/home` on production, 2026-09-15 | LCP 164 ms cold and 84 ms warm, CLS 0 | `facts.json` `measured` rows `/home cold lcp`, `/home warm lcp`, `/home cold cls` |
| Filmstrip of 85 cards | 119 fps steady, p95 frame 10 ms | `facts.json` `measured` rows `filmstrip` |
| Slide change, Slideshow, layout grid, in page | 11 ms, 15 ms, 10 ms painted frame | `facts.json` `measured` rows `transitions` |
| Licence | MIT | `facts.json` `licence` |

What Turboslide already does beyond Google Slides, as the features audit of 2026-10-01 lists it (`audit-features.md` section 3, items 1 to 12): agents edit through the same actions a person uses; the Perfect PowerPoint; chart numbers edited in a panel on the slide; Tailor for a customer in one undo step; an assistant with no plan gate whose writes are cards a person accepts; a logo picker over the thesvg.org index with licence words; a shader library of 17 materials; a brand kit as a record on the deck; skipped slides leave the show; the show keeps paging offline after load with no extension; a one file web page and bundle transfer between deployments; a running cost of $3 to $5 a month on the General Translation team (`docs/REALTIME.md` 19).

Claims the page must not make on this branch:

- Live co-editing at keystroke speed on production. The realtime round (R1 to R3: the Worker, the Durable Object, the socket transport, Follow for every editor) is in this branch's history (`ef2371a5`, `34ddea70`, `6c4ef06b`), but the realtime rows of `docs/REALTIME.md` section 2 read broken on production when written (`realtime.keystroke.within-300ms` 1,948 ms mean, `realtime.caret.within-300ms` 3,447 ms or never), and the production flip to the `do` tier waits on Kevin's Google client (`docs/NEXT.md` 1.2 sentence 1). A presence demo on the landing is a staged demo until the production table reads green.
- Any of the seven "exceeds" features of `docs/NEXT.md` 4.4.1 that are not built: send this version, tracked share links, present to a link, tailor from a company's domain, translate this presentation, a first draft from a brief, a brand check with Fix. They are rounds F1 to F7.
- PowerPoint import (refused by file extension today, `audit-features.md` 1.2, `ImportSlides.tsx` 84 to 86), video, transitions and animations, spell check (Later stubs).
- Templates and the template gallery (parked whole at ship `4300058d`, `audit-features.md` 1.1).
- The words the page's own lint refuses: "instant", "realtime", "edge", "lightweight", "built on Rust", "Slides clone", "Google Slides alternative", and the report words "Advanced tools", "default view", "acceptance", "audit", "verification", "revision" (`apps/studio/src/components/home/copy.ts` `FORBIDDEN_WORDS`, `FORBIDDEN_PHRASES`, `REPORT_WORDS`). A section on people working together has to say it without "realtime".
- README's "What works today" as a source of truth: it is rendered from the 2026-09-15 `today` column of the matrix and lists features as held whose rows passed in the people round's run of record of 2026-09-30 (852 of 900 rows passed; `audit-features.md` 1.1, the paragraph after the table).

## 2. The page's budget and what each demo form costs

### 2.1 The budget

`docs/NEXT.md` 4.2.1 (line 395) sets `/home` at 600 KB of decoded script and 120 KB of fonts, against 1,235 KB and 353 KB measured on 2026-10-01; final headers 50/30 ms and LCP 400/200 ms. The production reading of 2026-09-15 had `/home` at 677,739 bytes of decoded script, already over a 600,000 byte ceiling (`facts.json` `/home cold js decoded`, ok false), with 40,468 bytes of images before ready and 486,017 bytes after a full scroll. The page is prerendered at build and reads no storage but `gt-theme` (`home.tsx` docblock). So the landing starts over its script budget, and every interactive section has to load after the first screen, on intent or on viewport entry, with a static first paint that is already the finished picture.

### 2.2 The cost of each candidate module, measured

Bundled for the browser with esbuild 0.28.1, minified, from `apps/studio` as the resolve root (`jsdom`, `node:*` and `playwright-core` external), 2026-10-02 15:27 PDT:

| Module | Minified | Gzip | What dominates |
| --- | ---: | ---: | --- |
| `@paper-design/shaders` `ShaderMount` and the grain gradient shader | 25,527 B | 7,562 B | the shader library alone |
| the same with the mesh gradient shader | 19,615 B | 5,997 B | |
| the same with the dithering shader | 24,224 B | 7,144 B | |
| `@turboslide/effects/two-tone` (the Bayer two tone pipeline in TypeScript) | 28,920 B | 14,234 B | |
| `@turboslide/effects/bayer` | 834 B | 534 B | |
| `@turboslide/theme/brand` (the mark's geometry) | 6,093 B | 2,980 B | |
| `@turboslide/render/slide` `renderSlide` | 854,601 B | 173,289 B | zod 450,511 B and `packages/schema` 322,070 B of the output (its shape definitions alone 221,148 B); `packages/render` itself 71,138 B |
| `@turboslide/render/standalone` | 898,188 B | 185,326 B | the same |
| `@turboslide/materials/mount` | 873,713 B | 180,863 B | zod 450,308 B, the schema's shape definitions 221,148 B and every Paper shader the catalog names 111,304 B |
| `packages/theme/src/gt-ink-paper/sheet.css` (file) | 28,789 B | 8,393 B | |
| `stage.css` (file) | 2,228 B | 957 B | |

What follows from the table:

- A real slide on the landing costs its HTML and `sheet.css` (8.4 KB gzip) when it is rendered at build by `renderSlide` and inlined. Shipping the renderer to the browser costs 173 KB gzip, almost all of it the schema and zod, so the page should never render slides in the browser.
- A live shader costs 6 to 8 KB gzip when the page imports `ShaderMount` and one fragment shader from `@paper-design/shaders` directly; importing it through `@turboslide/materials/mount` costs 181 KB because the mount pulls zod, the schema's shape definitions and the whole shader catalog. A landing helper that maps one recipe's uniforms by hand keeps the cost at the library's.
- A live dither of a picture costs 14 KB gzip with the product's own two tone pipeline, or 0.5 KB for the Bayer matrix alone with a page written threshold loop.
- The live editor in a frame (`/embed/<deck>` or `/edit/<deck>`) costs what those routes cost: 1,843,084 B of decoded script for `/deck/gt-brand` and 2,235,644 B for `/edit/gt-brand` on production (`facts.json`), plus the deck's pictures (516,149 B before ready on `/deck/gt-brand`). A frame belongs behind a click (a facade with the poster frame), never in the first load.
- A short film is a video file: at 1104 by 621 for 10 to 20 s, an H.264 or VP9 file of roughly 0.4 to 1.5 MB (an estimate, not measured here), loaded with `preload="none"` and a poster, and replaced by its poster under `prefers-reduced-motion`.

### 2.3 The demo forms, defined for this note

- Live in the page: the product's own code or its build output running on the landing with no server call: slides rendered at build by `renderSlide`, a shader through `ShaderMount`, a dither through `packages/effects`, the mark through `packages/theme/brand`. Costs as in 2.2.
- Live embed: the product's own viewer or editor in an `iframe`, on a fixture deck, with no account. `/embed/<deckId>` exists today with a frame protocol (`gt-deck-slide`, `gt-theme` messages; `apps/studio/src/routes/embed.$deckId.tsx` docblock) and attaches no studio session unless the address carries `?agent=1`. An editable embed needs a store a visitor's writes cannot reach: a per visitor draft on the tmp overlay, or a draft that never persists. It is the most convincing form and the most expensive.
- Staged demo: a scripted sequence over real rendered slides and real captured chrome: build time HTML of the slides, a recorded or written timeline of selection rings, cursors, words and panels, played by CSS or a small script, honouring reduced motion with its end state. It shows what the product does at the speed the product does it, with no server and a few KB of script.
- Short film: a HyperFrames composition (Prototemplate `motion/MOTION.md`: one paused GSAP timeline, Inter 400 and 500, the Bayer dither as the one texture, `expo.out` and `power3.out` arrivals, no blur or glow, the 120 px safe area) rendered to a video. Right for what cannot run in a page: an export opening in PowerPoint, a show on a second screen, an agent run over minutes.

## 3. What a live embed needs

- Read only: `/embed/<deckId>` already exists. It draws the deck route's viewer with the frame protocol on, puts the first slide's HTML in the document and fetches the rest after mount, and attaches a studio session only when the address carries `?agent=1` (`apps/studio/src/routes/embed.$deckId.tsx` docblock). A landing frame of a fixture deck in view mode needs no account and cannot write. It needs a deck made for the landing (a fixture under `decks/`, or a published deck with a `?p=` token) so the GT brand deck's 85 slides and 115 assets (`product/cli-info-gt-brand.txt`, from `turboslide info --json`) are not what a visitor downloads.
- Editable: no per visitor sandbox exists. The deployment wide `readOnly` flag refuses every write with "This presentation is read only right now" (`apps/studio/src/server/flags.ts` 99, 120), which is the wrong tool for a landing. The nearest mechanism is `/new`: "Nothing is written by a visit", the draft is built from the blank template under an id the store has not seen, and the first edit creates the deck (`apps/studio/src/routes/new.tsx` docblock). A landing sandbox needs one product change: a draft mode whose first write never calls `createStoredDeck` and stays in the tab, on a fixture deck, with the realtime channel and the agent session off. On a checkout or a preview the tmp store with an overlay directory gives the same isolation for a demo machine (the drive of section 5 ran that way).
- Weight: either frame loads the route's whole client (1.36 to 2.24 MB of decoded script on production, section 2.2). It belongs behind a click on a poster that is itself a build time render.

## 4. The candidate features

Each row: what a seller gets, the state on this branch, the demo form that is honest today, and its cost to the page. "Build time slides" means slides rendered by `renderSlide` at build and inlined with `sheet.css` (8.4 KB gzip), never the renderer in the browser.

| Feature | What a seller gets | State on this branch | Demo form | Cost to the page | Source |
| --- | --- | --- | --- | --- | --- |
| Tailor for a customer | The customer's name in every visible text and the notes, the old customer's pictures swapped, internal slides skipped, in one write and one undo step; the dialog counts the places first and can find the customer's logo | Tools > Tailor for a customer in the default view; `deck.tailor` on every transport; the Assist panel's first card | Live in the page over build time slides: a name field that replaces the name in four to six real slides of a filmstrip, the same replacement `deck.tailor` makes to text, with the place count; the page writes nothing. The product's own run is section 5.2 | Slides HTML and sheet.css; under 2 KB of script | `packages/schema/src/actions.ts` 294 and the `deck.tailor` entry; `packages/chrome/src/dialogs/Tailor.tsx` 330 to 430; `audit-features.md` 3 item 4 |
| Agents run the same actions | The seller's own Claude, ChatGPT or script edits the deck through the same 193 actions as the menus, over the CLI, MCP, HTTP and the page; every write names its author as a person or an agent; an outside write shows a snackbar with Undo | Built; the counts generated from one table | Staged demo: a terminal panel with real CLI commands and their real JSON (section 5.5 holds the captured `--version` banner and `info --json`), beside build time slides that change at each command; the author row of Version history drawn as a ruled list | Slides HTML; the terminal as text; about 2 KB of script | `facts.json`; `packages/agent/generated/manifest.json` `transports`; README "The CLI in brief"; `docs/PRODUCT.md` 6.1 outside writes |
| Everything on a slide moves | Drag, resize and rotate any object; the first drag turns a layout slide into a canvas and Undo puts the layout back; guides and Snap to | Built; the canvas rows passed in the run of record (arrange 98 passed, 1 not driven) | Live in the page: one object on a build time slide that a visitor drags, resizes and rotates with the editor's handle look (selection blue `#2f5ce0`, square handles, the chip), with a reset; the live editor behind a click for the rest | About 4 to 6 KB of script; the slide | `apps/studio/src/components/home/copy.ts` canvas lead; `apps/studio/e2e/canvas.spec.ts` 15 to 16; `audit-features.md` 1.2 Arrange |
| The brand kit | A marketer sets six colour roles, the faces, the logo and footer slots and the counter once; every slide and every collaborator re renders; Reset to the deployment's kit | Built (brand rows 20 passed, 2 not driven in the run of record) | Live in the page: six kit swatches that set the theme's CSS variables on build time slides, the way `themeCss` writes one override stylesheet; the filmstrip follows | Under 2 KB of script; the slides | `docs/PRODUCT.md` 4.1; `packages/render/src/theme-css.ts`; `packages/chrome/src/ThemesPanel.tsx` 457 to 510 |
| Present from the browser | Slideshow from the current slide; Presenter view in a second window with the timer, the notes and the next slide; skipped slides leave the show; the show keeps paging offline after load | Built (present 21 passed in the run of record); present to a link is F2 and not built | Staged demo: the presenter console and the audience screen side by side over build time slides, driven by the arrow keys and a click, the timer running; the real `/present/<deck>` behind a click | Slides HTML; about 3 KB of script | `apps/studio/src/routes/present.$deckId.tsx` 9 to 28 (BroadcastChannel); `audit-features.md` 3 items 9 and 10 |
| Export that matches the screen | PDF and PowerPoint downloads; the Perfect PowerPoint's worst decoded page mismatch is 0.003 percent over the 85 slide GT deck; Editable text mode for text that stays text | Built (export 37 of 37 in the run of record); large deck rows recorded broken | Live in the page: a divider the visitor drags across one slide drawn twice, the browser render and the exported page as captured by the verify loop, with the number from `facts.json`; a short film for the file opening in PowerPoint | Two pictures (an estimate of 60 to 150 KB at 1104 px, not measured); under 1 KB of script | `facts.json` `export`; README "Why it is fast" (the export is a screenshot); `docs/pptx.md` |
| Two people on one deck | Presence chips, the other person's outline, caret and name flag, Follow | In this branch (R1 to R3); not green on production when written | Staged demo: a scripted second person over a build time slide (chip, outline, flag, caret, words) at the bounds the realtime rows set (300 ms per keystroke), labelled by what it is; the product's own run is section 5.3 | About 3 KB of script | `docs/REALTIME.md` 2 and 3.4; `realtime.spec.ts` selectors |
| Shaders and the dither field | 17 shader materials on a slide with the kit's colours, a still for every export; the 8 by 8 Bayer two tone pipeline for pictures | Insert > Shader built, its Place row parked; Format > Dither behind the switch | Live in the page as the page's own materials: one `ShaderMount` per visible section, paused until in view and frozen on its frame under reduced motion; a mood picture dithered by `packages/effects` with a tone control | 6 to 8 KB gzip per shader; 0.5 to 14 KB for the dither | `facts.json` `materials`; `docs/FEATURES.md` 5.5 to 5.7; `packages/effects` |
| Google's menus and shortcuts | File to Help in Google's order, Google's shortcuts and right click menus | Built | Static: a ruled row of menus with the shortcut keys; the current page's capture | Text | `copy.ts` menus section |
| The assistant | Tailor, Make it shorter and Write speaker notes as cards the seller accepts or dismisses; nothing changes until Accept; one undo step | Built (assist 13 passed, 1 not driven) | Fold into the agents section as one card drawn over a build time slide | Text | `docs/PRODUCT.md` 6.1 and 6.4 |
| The logo picker | Insert > Logo over the thesvg.org index with licence words; Tailor finds the customer's logo | Built; two rows parked | Fold into Tailor | Pictures of two marks | `audit-features.md` 3 item 6; `logo.search` in `actions.ts` |
| Version history with authors | Versions named by person and by agent; Restore | Built; Show changes parked | Fold into the agents section | Text | `audit-market.md` 3.5 |
| Speed | Card to studio 168 ms for the 85 slide deck; filmstrip 119 fps; slide change 11 ms | Measured | Numbers row (as the current numbers row) | Text | README "Why it is fast"; `facts.json` `measured` |
| Cost and licence | MIT; General Translation's share of the bill was $3 to $5 a month when read on 2026-10-01 | Built | One ruled row in the licence band | Text | `facts.json` `licence`; `docs/REALTIME.md` 1.1 |

## 5. The drive on port 4541

### 5.0 The setup and what went wrong first

- The server: `TURBOSLIDE_STORE=tmp TURBOSLIDE_OVERLAY_DIR=<landing>/.overlay-product TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1` with 32 character fake secrets, `vite dev --port 4541 --strictPort` from `apps/studio`, ready in 2,886 ms (Vite 8.2.2), started 15:29 and stopped 16:04 PDT (`lsof -iTCP:4541` empty after). The overlay was removed after the stop.
- The driver: headless Chromium from `playwright-core` (createRequire from the worktree's `package.json`), 1440 by 900 at scale 1, the dev server's HMR socket answered by nobody as `apps/studio/e2e/core/lib.ts` `quietDevServer` does, the editor reached through `window.turboslide.studio` and the controls' `data-control` ids. Scripts in the session scratchpad, never in the tree.
- The first editor load failed: Vite optimized two new dependencies at 15:54:29 (`@upstash/ratelimit`, `@upstash/redis`) and asked for a reload, which the mocked socket never delivered, so the page ran two React copies and `RootDocument` threw "Cannot read properties of null (reading 'useContext')". A fresh load worked (editor ready 2,819 ms, then 843 to 2,506 ms for every later load). A landing that embeds a dev server for a demo has to warm it once first.
- The load: the one minute load average was 43 to 70 from 15:29 to 15:57 and 49.8 to 59.2 during the drive (three other pipelines were running). After 25 minutes of five minute waits it had not gone under 43, so each interaction ran as one short run of one or two pages, one at a time, each under 15 s. Every timing below was taken at that load and is slower than an idle machine.

### 5.1 Select, drag, resize and rotate a heading (`product/frames/canvas-strip.jpg`)

The GT deck's mood slide `mood-lighthouse` (the dithered photograph of the Louisbourg lighthouse with its plate), the heading `h`. Frames at 0.00, 0.48, 0.72, 0.96, 1.65, 1.97, 2.58, 3.09 and 8.24 s.

- One click selects the heading: a 1 px ring in the selection blue, square handles, a chip above the box that names the block's role ("Title") and a rotation handle.
- A press on the frame's edge drags the box; 16 pointer steps took 486 ms; while it moves, a guide line marks the centre it snaps to. The guide is the token `--pt-guide`, `#d6336c` on light and `#f0397a` on dark (`packages/chrome/src/tokens.css` 120 and 196), a second interface colour beside the selection blue.
- On release the slide is a canvas: `slide.get` read a `content` slide with a `freeform` layout carrying its `grammar` record (`template: "mood"`), the conversion `apps/studio/e2e/canvas.spec.ts` 15 to 16 describes.
- The east handle widened the box by 80 px; the rotation handle with Shift turned it in 15 degree steps.
- Cmd+Z, pressed 700 ms apart until `slide.get` read the `mood` slide again, brought the layout back after six presses. The read goes through the window API and may trail the screen, so the count is not a measurement of the history.
- An earlier run on `mood-rosetta` started the drag on the chip, and the chip's tooltip ("Move", with the snapping and nudge keys) opened over the drag 0.96 s in. A landing replica starts its drag on the frame, and the product may want the tooltip closed on pointer down.

What the landing takes from it: the selection grammar exactly (ring, square handles, the role chip, the rotation stem), the guide at the snap point, the conversion stated in one sentence ("The first drag turns the slide into a canvas. Undo puts the layout back", today's copy), and a dithered mood picture as the ground of the demo.

### 5.2 Tools > Tailor for a customer (`product/frames/tailor-strip.jpg`)

The GT deck on its title slide. Frames at 0.00, 1.22 (the dialog), 2.36 (the count), 5.08 (after Apply), 6.92 and 8.52 s (after one Cmd+Z), cropped to the filmstrip, the stage and the dialog.

- Replace "General Translation" With "Globex": the dialog counted "9 places on 8 slides" before Apply (`packages/chrome/src/panels/assist-strings.ts` 62 to 65 for the words).
- Apply closed the dialog and the revision moved by one in 2,311 to 2,325 ms (two runs) at that load; the snackbar read "Tailored for Globex: 9 places on 8 slides" with Undo.
- The title slide and its filmstrip card read Globex; one Cmd+Z put "General Translation" back on the slide.
- The dialog also offers Find the customer's logo when the logo index knows the name, Replace the pictures named after the old customer, and Slides to skip (`Tailor.tsx` 356 to 428). The drive did not use them.

What the landing takes from it: the count sentence and the result sentence in the product's own words, and the shape of the gesture: two fields, a count, one Apply, one Undo.

### 5.3 Two people on one deck (`product/frames/people-strip.jpg`, `product/frames/people-zoom-strip.jpg`)

Maya made a deck from `/new`, typed the title "Globex onboarding plan" and minted an editor link through `share.setGeneralAccess`; Sam, a second anonymous browser, opened the link and typed into the subtitle. Frames are Maya's view at 0.05, 1.41, 2.51, 3.68, 4.84, 6.32 and 8.18 s; the zoom strip is cropped to the title row and the text.

- Sam's chip was in Maya's title row 1,276 ms after Sam's page started loading (2,053 ms in the first run), before Sam's editor reported ready (1,311 ms).
- Sam's click on the subtitle drew his outline and his name flag ("Sam · guest", ink with white text) in Maya's view 212 ms later (274 ms in the first run).
- While Sam typed at 70 ms a key, Maya's view trailed by zero to two characters in the frames (Sam had "Prepared " when Maya's frame read "Prepare"); the caret and the flag moved with the words.
- Follow through `presence.follow` (the roster offers the same row): Sam's New slide moved Maya's stage to the new slide 244 ms later (288 ms in the first run), with the plate "Following Sam" and Stop at the top of the stage.
- This was the memory tier on one process (`sync.tier` "memory", transport "sse"). Production has not read these rows green (section 1), so the landing shows this as a staged demo and says nothing about speed.

What the landing takes from it: the flag (ink, white text, the name and "guest"), the outline in the person's hue, the chip in the title row, the Following plate with Stop, and the order the product draws them in: chip, outline and flag, caret and words.

### 5.4 The brand kit (`product/frames/brand-strip.jpg`, a fourth interaction)

The GT deck on `positioning`; Slide > Change theme opens the Brand kit panel. Frames at 0.00, 0.55, 1.34, 4.86, 5.70, 9.20 and 13.19 s.

- Typing `#0b1d3a` into Background previewed on the sheet before Enter (frame 1.34 s); Enter committed it in 2,242 ms at that load and the filmstrip followed.
- Text `#f4f1ea` committed in 2,235 ms; the GT deck is dark, so the change is small on screen.
- With the focus in the hex field, Cmd+Z belongs to the field. After a click on the workspace, Cmd+Z pressed 900 ms apart brought the kit back after three presses as `brand.get` read it.

What the landing takes from it: a swatch that previews while the visitor types and applies on Enter, across every slide at once.

### 5.5 The CLI, read only (`product/cli-version.txt`, `product/cli-info-gt-brand.txt`)

`turboslide --version` prints the mark as six rows of block characters beside "Turboslide 2026.1001.3", the production address and "193 actions, effects backend: wasm" (2.9 s wall at that load). `turboslide info --json --deck decks/gt-brand` prints the deck's facts (85 slides in 8 sections, 115 assets, kinds by count) and every slide with its number, title and kind; `slides --json` adds each slide's lint counts. These are the real outputs an agents section can print, inside its terminal panel, where monospace is allowed.

## 6. The eight features worth a landing section, ranked

Ranked by a seller's value first (research 07's seller: an existing deck, a customer's name, logo and numbers, a call, then a PDF or a link), then by how far past Google Slides the feature goes (`audit-features.md` section 3), then by how much the page can show for its weight. Every section's first paint is its finished end state, rendered at build; motion starts only when the section is in view and the tab is visible, and `prefers-reduced-motion: reduce` shows the end state with the controls still working (the brand deck's loop rule, `docs/FEATURES.md` 5.6).

1. Tailor for a customer. Live in the page. A name field over a filmstrip of four to six build time GT slides; typing a customer's name replaces "General Translation" in every slide's text as the visitor types, with the place count in the product's own words ("9 places on 8 slides" on the GT deck, section 5.2) and one Reset. The section's caption names the real action: Tools > Tailor for a customer writes it as one change with one undo. Cost: the slides and under 2 KB. Why first: it is the seller's weekly task in one gesture, and Google's route is Find and replace.
2. Agents run the same actions. Staged demo. A terminal panel (monospace allowed only inside it) plays three real commands with their real output (`turboslide --version` with its block mark banner, `slide new --layout split --json`, `text replace ... --author agent:<runId>`; the outputs captured from the CLI at build, as section 5.5 did for the first), and the slide beside it changes at each one; under it, a ruled Version history list with the person's rows and the agent's rows named apart, and the outside write sentence "Assistant changed slide 1" with Undo. The numbers (193 actions, 169 MCP tools, 177 HTTP paths) come from `HomeFacts`. Cost: under 3 KB. Why second: no other slide editor read on 2026-10-01 publishes its whole action table to agents (`audit-market.md` 3.1).
3. Everything on a slide moves. Live in the page. One object (a mood slide's heading over its dithered photograph, as in section 5.1) on a build time slide that the visitor drags, resizes and rotates with handles drawn in the editor's grammar, with the snap guide at the centre and a Reset that reads "Undo puts the layout back". Cost: 4 to 6 KB. The real editor sits behind an Open the Example Deck button, as today.
4. The brand kit. Live in the page. Six swatches in the marketer's words (Text, Background, Captions, Hints, Primary, Accent) set the CSS variables `themeCss` would write, on three build time slides at once; a Logo slot toggles the footer mark. Cost: under 2 KB. The point is that one setting changes every slide and every new deck.
5. Present from the browser. Staged demo. The presenter console (timer, notes, next slide) beside the audience screen, both build time slides; the arrow keys and a click advance both; a skipped slide is visibly left out of the show. Cost: about 3 KB. The live show behind a click (`/present/<fixture>`).
6. Export that matches the screen. Live in the page. One slide drawn twice, the browser render and the exported page, with a divider the visitor drags; the number 0.003 percent beside it from `facts.json`; File > Download's two rows as a ruled list. A short film (HyperFrames, 8 to 12 s) can carry the PowerPoint file opening on a desktop, which no page can run. Cost: two pictures.
7. Two people on one deck. Staged demo, until the production realtime table reads green. A second person's chip arrives in the title row, their outline and name flag land on a block, their caret types a line and a Following plate shows when one follows the other, in the order and at the gaps the memory tier drew them (section 5.3: about 1.3 s to the chip, 0.2 s to the outline, zero to two characters behind the keys); the word "realtime" never appears (the page's lint). Cost: about 3 KB. The section's evidence is section 5.3's run on the memory tier.
8. Shaders and the dither field. Live in the page, as the page's own materials and as a feature: the section ground is one `ShaderMount` (6 to 8 KB gzip) in the kit's colours, and a mood picture is dithered by `packages/effects` with a tone control, the cells at 2 px (`--ts-cell`). Paused until in view; the still frame under reduced motion.

Folded into the eight rather than given a section: Google's menus and shortcuts (a ruled row in the hero facts, as today), the assistant (a card in section 2), the logo picker (the Find the customer's logo row in section 1), Version history (section 2), speed (the numbers row), the licence and cost (the closing band).

A short film earns its weight in one place only: a 10 to 15 s HyperFrames film for the hero or the closing band that shows the whole loop a seller runs (open the deck, tailor it, present it, send the PDF), built from real captures under the motion rules of Prototemplate `motion/MOTION.md` (Inter 400 and 500, the Bayer dither as the one texture, `expo.out` arrivals, no blur, the 120 px safe area), with `preload="none"`, a build time poster and the poster alone under reduced motion. Everything the eight sections show is cheaper and more convincing as a page the visitor touches.

## 7. What the landing could take, in its own grammar

- Real slides as the page's pictures: render the GT deck's slides at build with `renderSlide` and inline them (1,133 to 2,230 bytes of HTML per slide measured in the editor on 2026-10-02, plus `sheet.css` at 8.4 KB gzip once), so every demo is the product's own pixels and the page ships no renderer.
- One interaction grammar shared with the editor: the selection ring and handles in `#2f5ce0`, the role chip, the name flag in ink, the Following plate, the snackbar with Undo, all drawn from `packages/chrome/src/tokens.css` so the landing and the editor cannot drift.
- Sentences from the product: the Tailor count and result sentences, the canvas lead, the outside write sentence, quoted from the string modules (`assist-strings.ts`, `copy.ts`) rather than written again.
- Numbers from `facts.json` through `HomeFacts` only, never typed into copy.
- Motion only where the product moves: a demo's timeline is the order and the gaps the drive measured, with arrivals on `expo.out` or `power3.out` from the motion brief, paused until the section is in view and replaced by its end state under reduced motion.
- The dither and the shader as materials the product owns: the mood pictures at 2 px cells and one `ShaderMount` per visible section, both the same code the editor runs.
- One honest boundary: every staged demo carries a caption that names the real command or menu row it shows (Tools > Tailor for a customer, Slide > Change theme, View > Live pointers), and the live editor is one click away on the example deck.

## 8. Open questions

- Whether the landing may ship a fixture deck made for it (a five slide "Globex" pitch on the GT theme) so the embed and the build time slides do not carry the 85 slide brand deck and its 115 assets.
- Whether the product should add a sandbox draft mode for an editable embed (section 3), or whether the landing stays with build time slides and a link to `/new`.
- Whether the snap guide keeps its magenta token on the landing or the landing draws guides in the selection blue under the one interface colour rule.
- The `/home` script budget: the page is already over its 600 KB decoded ceiling (section 2.1). The interactive sections fit only if they load after the first screen and the entry chunk work of `docs/NEXT.md` 4.2.2 lands.
