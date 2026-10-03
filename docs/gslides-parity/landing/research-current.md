# The landing as it stands: /home on production and on landing/redesign

The current researcher's note for the landing workflow. Kevin wrote on 2026-10-02: "make the landing much better inspired off of lovefrom and openai brand and make the landing much more interactive and showing off features featuring the best of graphic and motion design". This note reads what `/home` says and shows today, on production and on this branch, measures its weight and timing on production, and lists what a redesign has to keep. The LoveFrom and OpenAI readings belong to the other researchers (`lovefrom/` and `openai/` beside this note). This note reads neither site.

Written 2026-10-02 from 15:26 PDT (22:26 UTC). The tree read is the worktree `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `2108dad4`, with no change outside this folder. Production is https://www.turboslide.com. Nothing in the product's source, on Vercel or on GitHub was changed. The probes and their raw output are in `current/probe/` and `current/raw/`, and the pictures are in `current/pictures/`. A previous attempt was cut at 15:17 PDT. It had fetched `current/raw/home-prod.html` and `home-headers.txt` and nothing else, so this note starts from those two files.

## 1. What was read and how

- Production `/home`, fetched with curl at 2026-10-02 22:16:26 UTC (`current/raw/home-prod.html`, 55,597 bytes; `x-vercel-cache: HIT`, `age: 11483`, `last-modified: Fri, 02 Oct 2026 19:05:03 GMT`; `current/raw/home-headers.txt`). Production serves `main`'s page. The newest change to `apps/studio/src/components/home` on `origin/main` is `cb425406` of 2026-09-29, and `3263728a` is not an ancestor of `origin/main`.
- Production asset sizes, curl at 22:29:24 UTC with and without `accept-encoding: br` (`current/raw/asset-sizes.txt`).
- Production routes the page links to, curl at 22:45:23 UTC: `/deck/gt-brand` 200, `/new` 200, `/decks` 200 (2.6 s), `/og/turboslide.png` 200, `/manifest.webmanifest` 200, `/robots.txt` 200, `/llms.txt` 200, `/sitemap.xml` 404, and `/` 307 to `/new`.
- Captures, full page and first screen, at 1440 by 900 and 390 by 844 in both appearances: production at 22:41 to 22:42 UTC (load average 57 to 61) and the branch's dev server on port 4542 at 22:42 to 22:43 UTC (load 65 to 69). Each is one batch of four page loads of about a minute, run above a load of 30 after a gated wait from 22:28 to 22:41 UTC saw the load rise from 40 to 58; pictures do not depend on load. Both ran through `current/probe/capture.mjs` (Chrome for Testing 1217 through the worktree's `playwright-core` 1.62.1, a person's user agent, the appearance set through `gt-theme` and `prefers-color-scheme`). The detail crops and the DOM readings of the branch come from `current/probe/details.mjs` at 22:44 UTC (`current/probe/details-branch.json`). The dev server ran with the tmp store, the memory channel and the overlay `.overlay-current`, and was stopped at 22:44 UTC.
- The weight and timing runs, `current/probe/perf.mjs`: five cold loads of production `/home` at 1440 by 900 (23:15 UTC), five at 390 by 844 (23:25 UTC) and five at 1440 by 900 with device scale 2 (23:31 UTC), each with its `uptime` line (section 6). The probe waited for a one minute load under 30 in five minute sleeps and ran at load 48 to 62 when the wait ran out (`current/probe/when-quiet.sh`, the `.log` files).
- The source: `apps/studio/src/routes/home.tsx`, `home.css`, `apps/studio/src/components/home/**` (the copy in `copy.ts`, the eleven components, the five diagrams, `sign-in.tsx`, `facts.ts`, `facts-data.ts`, `shots.json`), `scripts/build-home-assets.ts`, `apps/studio/public/home/`, `packages/theme/brand/` (`mark.svg`, `site.ts`, `facts.json`), `apps/studio/vite.deploy.config.ts` 174 to 221, `apps/studio/src/routes/index.tsx`, `apps/studio/e2e/home-page.spec.ts`, the `decks.home.*` rows of `docs/gslides-parity/focus/core-matrix.json`, `docs/brand.md` sections 8 and 9, `docs/POLISH.md` section 3, `docs/NEXT.md` 4.1.2 and 4.1.3, `docs/gslides-parity/next/audit-brand-surfaces.md` and `audit-performance.md`.
- The brand's source for the constraints: Prototemplate `deck/DECK-GRAMMAR.md`, `DESIGN.md` sections 9 to 11 and 14 (motion discipline, the seam, the engine lifecycle, the read lines), `motion/MOTION.md` (the GT films' brief).

## 2. The page today, section by section

Two pages exist. Production runs the polish round's page (`main`). This branch carries Round 1's page (`3263728a`, "B2a#15: /home draws the deck's page grammar"), which is what the redesign starts from. Both are the same eleven bands in the same order, both are static and prerendered, and neither animates anything: `document.getAnimations()` returns 0 on the branch, and `home.css` says "Nothing animates apart from the .pt-ib colour transitions".

| Band | What production says and shows | What the branch changes |
| ---- | ------------------------------ | ----------------------- |
| Navigation | 44 px bar under a full bleed rule: the old square block mark and "Turboslide", Documentation, GitHub, the Light and Dark pair, New Presentation solid. At 390 the bar loses its gutter: the mark sits at x 0 and New Presentation ends at x 390 (`prod-390-dark-first.jpg`). | 58 px bar inside the 1104 px column with the new speed monogram at 24 px, Documentation, Light and Dark, New Presentation. GitHub moves to the footer. Sign In sits in a 64 px slot and is drawn only after hydration when the deployment offers a method; the dev server offers none, so the captures show the empty slot. The 390 bar is two rows with the 16 px gutter kept (`branch-390-dark-first.jpg`). |
| Hero | The h1 "Build the pitch, present it and send the link" in two lines, the lead (the site description, three sentences), New Presentation and Open the Example Deck, then a 1120 px capture of the editor on the Blue Marble slide in a 1 px frame. The right half of the first screen is empty at 1440 (`prod-1440-light-first.jpg`). | The right half carries the facts rows: Menus, Present, Export, each a Heroicon in a ruled key cell and one sentence. The capture is 1024 px wide. The h1 is 59.2 px at 1440 and 40 px at 390, weight 500, tracking -0.038em. |
| Numbers row | Absent. | Three figures from `packages/theme/brand/facts.json`: "22 layouts", "193 actions", "0.003%" (the last links to `docs/pptx.md`), each with one sentence, in three cells parted by hairlines, then the hatch strip (`branch-1440-numbers.png`). Stacked to 361 px at 390. |
| Everything on a slide moves | An icon before the h2, the lead, and a capture of a picture mid rotation with the blue selection ring, the "Image" chip and the 12 degree readout. | No icon. The capture gives way to an SVG diagram: a slide frame, the first place as a hairline box, the moved picture turned by 8 degrees with eight ink handles, one drag line ending in an 11 unit square, labels Drag, Resize, Rotate. |
| The menus are Google's | Icon, h2, lead naming the nine menus in Google's order, and a 612 px crop of the title row and the menu bar with Insert open. | Same picture without the icon. |
| Present from the browser | Icon, h2, lead, and an SVG of the editor, the presenter window (Timer, Next slide, Notes) and a phone (Show) joined by the S key and a present link, with chevron arrowheads. | Square markers replace the arrowheads; labels at 20 units. |
| Export to PDF and PowerPoint | Icon, h2 (wraps to two lines), lead, a second sentence "The worst page mismatch on the 170 page example export is 0.003 percent" with the link, and an SVG of one slide to pitch.pdf and pitch.pptx. | The measured sentence moves to the numbers row, so the band is the h2, the lead and the diagram. |
| Agents run the same actions | Icon, h2, the lead with the 193 count, the command `pnpm exec turboslide slide new --layout split --deck decks/pitch --json` in ink monospace on the light plate, the link "Read the agent documentation", and an SVG of CLI, MCP, HTTP and The page into a "193 actions" table and out to a Deck. | The command sits on the `#101010` panel in white monospace, the one monospace on the page. |
| Free under the MIT licence | Icon, h2, "Run it from a checkout or deploy it to Vercel. The code is on GitHub.", a GitHub button. | "license" in the words; the ids keep `home.licence.*`. |
| Footer | The lockup, six links (New presentation, Your presentations, Documentation, GitHub, Licence, Third party notices), "Turboslide is General Translation's slides editor. Google Slides is a product of Google LLC." | "Turboslide is made by [GT mark] General Translation." and the Google line. |

Size of the page: production 4,898 px tall at 1440 and 4,263 at 390; the branch 4,919 and 5,162. Production holds 248 words outside the diagrams and 271 with their labels (`current/raw/home-prod.html`); the branch renders 344 words at both widths (`details-branch.json`), under the 350 of `decks.home.copy-rules`. Every band is a two column block (text 5 of 12, picture 7 of 12) or one column, separated by seams; the branch draws one rail on each side of the column and a 9 px cross where each seam meets a rail.

The card: production's `og:image` is the old card (the square block mark, the word, the sentence, `www.turboslide.com` in monospace, on a coarse dither field). The branch's card is the new mark and word on a plate beside the Blue Marble dither, with the credit (`card-prod-vs-branch.jpg`). Production's `og:title` is "Turboslide, a slides editor in the browser"; the branch's is "Turboslide is a slides editor in the browser".

## 3. What works

- The first screen states the product in one sentence and one action. "Turboslide is a slides editor in the browser. It has Google Slides' menus and shortcuts. No account is needed." is the one description `site.ts` shares with the head, the manifest, the card and the README, and New Presentation is one click to an editor with no account (`apps/studio/src/components/home/copy.ts` HERO; `packages/theme/brand/site.ts` 13 to 14).
- The branch's grammar is the brand deck's: the 1104 px column with one rail on each side, crossed seams, the hatch strip at the change of topic, the slide 29 ladder at weight 500, ruled key and value rows with Heroicons in the key cells, diagrams with square markers and no arrowheads, monospace only on the `#101010` panel (`grammar.css`, `home.css`; DECK-GRAMMAR "Layout classes", "Diagrams"). The redesign inherits a page that already obeys the deck's laws.
- The numbers row is honest. The three figures are functions of `facts.json`, which `scripts/build-brand.ts --facts` writes from the tree and `brand.test.ts` checks, and `facts-data.ts` copies ten values with the file's sha256 so the page carries no measured rows (`facts.ts` header; `facts-data.ts`). A literal count is a defect by rule (SPEC-4 0.25).
- Both appearances are first class. The boot script stamps `data-theme` before first paint, the pressed state of Light and Dark is right from the first frame, and every picture has a dark and a light twin of which only the shown one is requested (`HomeNav.tsx`, `Shot.tsx`).
- The page is fast and still. It is a prerendered static file at the edge, CLS is 0 at 1440 and 390 over a load and a full scroll (`home-page.spec.ts` 662 to 675), LCP is the hero picture (section 6), the speculation rules prerender `/new` on hover and prefetch `/decks` and `/deck/gt-brand`.
- The words follow the copy rules. Sentence case headings with no trailing period, Title Case buttons, no em dash, no exclamation mark, no metaphor, no "X, not Y" pair, and `copy.test.ts` lints every string (`copy.ts` header).
- The diagrams explain relationships the words do not: the presenter window and the phone joined by the S key and the link; one action table reached by four transports. They are inline SVG drawn from the tokens, so they cost no request and follow the appearance.

## 4. What is weak against Kevin's ask

Kevin asked for four things: LoveFrom's and OpenAI's craft, much more interaction, the features shown off, and the best of graphic and motion design. Against each:

1. Nothing moves and nothing can be touched. The page has no animation by rule (POLISH.md 3.2 "Nothing animates"; `home-page.spec.ts` 637 "no script the page loads carries the shader mount (the page animates nothing)"). The only things a visitor can operate are links, the theme pair and, on a deployment with a method, Sign In. A product whose sentence is "everything on a slide moves" shows a still diagram of a move.
2. The features shown are four, and they are the plumbing. Menus, present, export and agents are parity and transport. The features that sell a presentation editor to a seller, and that the program spent rounds on, are not on the page: the shader library with Glyphfield's controls, the dither treatment of pictures, logos from thesvg, the brand kit and its fonts, tables, charts, diagrams and word art, comments, version history, the share link, the template gallery and the 85 slide GT deck itself (`docs/FEATURES.md` lines 9 to 31; `docs/PRODUCT.md` section 4; the Insert menu in `menus-light-aa2b00e489.png` lists Shader, Diagram, Word art, Chart and Table).
3. The product picture is small, stale and off brand. The hero capture was taken 2026-09-29 at `14612488` (`shots.json` `capturedAt`, `commit`), before Round 1's chrome. It shows the old square block mark in the title row while the bar above it shows the new monogram, the Assist sparkle that B3b#12 removed from the chrome and that slide 39's avoid list forbids, and the guest label "Last edit 3 hours ago by Helium 503" (`branch-1440-mark-mismatch.png`). The menus crop shows the Insert > Logo row that B3a cut. At 390 the hero is the 1440 window drawn 324 px wide, a 0.23 scale at which the menu labels are about 3 CSS px tall (`branch-390-hero-picture.png`).
4. The graphic language is quiet to the point of absence. The dither field, the photographic mood pictures and the speed marks are the brand's materials (`motion/MOTION.md` "Color and material"; `docs/brand.md` section 9) and none is on the page outside the capture: question 5 keeps the mood pictures off the first screen (`docs/NEXT.md` section 7, question 5), and POLISH.md 3.3 item 3 says "no dither on the page". The mark appears at 24 px twice. The first screen at 1440 is type, two buttons, three ruled rows and the top of a screenshot.
5. The sections are one template repeated six times. Every band is h2, lead, picture or diagram on the right, 112 px padding, the same seam. There is no change of scale, no full bleed moment, no band that holds a picture at the column's width after the hero, and no sequence that builds from one band to the next. The rhythm reads as a specification sheet.
6. The two hero buttons send a visitor away from the page to see anything real. Open the Example Deck opens `/deck/gt-brand`, a separate 193 KB document (curl, 22:45 UTC), and New Presentation opens the editor. The page never lets a visitor try a slide in place.
7. The numbers row's third figure needs a sentence to be read. "0.003%" with "The worst page of the example PowerPoint export differs from the screen by this share" is a precise claim the visitor cannot see. The fidelity it measures is visual and could be shown as a comparison.
8. The landing is not the front door. `/` answers a 307 to `/new` (`vite.deploy.config.ts` ROUTE_RULES; curl 22:45 UTC), so a visitor who types the domain lands in an empty editor and reaches `/home` only through a link, the manifest's `start_url` or a search result. A redesign that wants to be seen has to be reached; that is a routing decision for Kevin, recorded here as a constraint (section 5.1) and not changed by this workflow.

## 5. The constraints a redesign keeps

### 5.1 Routes and links

- The landing lives at `/home`, prerendered at build (`vite.deploy.config.ts` 205 to 221, `pages: [{ path: '/home' }]`) and served as a static file with `x-vercel-cache: HIT`. It has no loader and reads no storage except `gt-theme`. A redesign keeps it prerenderable: per visitor data arrives after hydration, as Sign In does.
- `/` stays a 307 to `/new` with `x-robots-tag: noindex` unless Kevin decides otherwise (`apps/studio/src/routes/index.tsx`; `ROUTE_RULES['/']`).
- `/home/**` is served `public, max-age=31536000, immutable`, so every picture or film under it is content hashed (`vite.deploy.config.ts` 197; `scripts/build-home-assets.ts` header).
- The links the rows drive: `home.hero.new` and `home.nav.new` to `/new`; `home.hero.deck` to `/deck/gt-brand` with the text "Open the Example Deck"; `home.foot.decks` to `/decks` with the text "Your presentations"; `home.export.record` to `.../docs/pptx.md`; every same origin link answers 200 and every other link is `https://github.com/Kevin-Liu-01/Turboslide...` with `target="_blank"` (`home-page.spec.ts` 474 to 513; rows `decks.home.new-presentation`, `decks.home.your-presentations`, `decks.home.seller-lead`, `decks.home.links-and-card`).
- The footer lockup is an anchor to `#top`, the `main` element's id, and scrolls the page to the top with no smoothing (`HomeFooter.tsx`; `home-page.spec.ts` 544).
- The speculation rules script: `prerender` `/new` at `moderate` eagerness, `prefetch` `/decks` and `/deck/gt-brand`, one script, with the request's CSP nonce (`home.tsx` `SPECULATION_RULES`; `home-page.spec.ts` 624 to 635).
- The root is `main#top.ts-product[data-page="home"]` and stamps `data-hydrated` once its handlers attach; the specs and the shell driver wait for it (`home.tsx` 62 to 73).

### 5.2 The head, the card and the description

- Title "Turboslide is a slides editor in the browser" (`home-meta.ts`; row `decks.home.copy`); description, `og:description` and `twitter:description` the one `SITE.description`; `og:url` `${SITE.origin()}/home`; the root route carries the icon set, `og:image` `/og/turboslide.png` at 1200 by 630 with its alt text, and the theme colours `#ffffff` and `#070707` (`home.tsx` head; `__root.tsx` 96 to 125; `site.ts`).
- The card is generated by `scripts/build-brand.ts` from `packages/theme/brand/og-template.html` and must print `www.turboslide.com` (row `decks.home.links-and-card`). The branch's card carries the Blue Marble with its credit; a redesign that changes the hero's picture keeps the card's picture credited in `docs/brand.md` section 8.
- `home-meta.ts` stays a module of its own: the route's `head()` runs at module level, and importing the page's copy there would put every string of the page in every route's entry chunk (`home-meta.ts` header).

### 5.3 The sign in entry

- Sign In is text in the navigation for an anonymous visitor, drawn only when the deployment offers a method, never for a signed in visitor, in a slot drawn at its width from the first paint so its arrival shifts nothing (`sign-in.tsx`; `home.css` `.ts-product-nav-signin`; row `decks.home.layout-shift`).
- It asks `readSignInFacts` (a TanStack server function) once after hydration, because the page is prerendered. With one provider it goes to the provider at once; otherwise it opens the page dialog, which loads lazily on the first click. Note for the budget: this is the one function the static page wakes on every view.
- The Sign in plate restyle is Round 3 lane A2's. The landing keeps the entry and its words (`SIGN_IN_WORDS`), and does not draw its own sign in.

### 5.4 The Open the Example Deck path

- The second hero button reads "Open the Example Deck" (Title Case), is a router `Link` to `/deck/gt-brand`, and the deck is prefetched by the speculation rules. Row `decks.home.seller-lead` reads its text and its target.
- Production's stored `gt-brand` deck keeps its 85 slides after Round 1, because `seedOnce` skips a seed deck the store already holds (`docs/NEXT.md` 4.1.4). Anything the landing shows "from the example deck" has to match the deck a visitor then opens, or say which one it is.
- The deck viewer already speaks a frame protocol: `/embed/$deckId` posts `{ type: 'gt-deck-slide', n }` to its parent and applies `{ type: 'gt-theme', theme }` (`apps/studio/src/routes/embed.$deckId.tsx` header). A landing that wants the real deck in place has that route to use.

### 5.5 The numbers row

- Every count on the page is a function of `HomeFacts`, read from `facts.json` through `facts-data.ts` and its sha256; `scripts/build-home-assets.ts --check` fails when the file has moved on (`facts.ts`; SPEC-4 0.25; `copy.ts` header).
- The three figures today: 22 layouts, 193 actions, 0.003% (`facts-data.ts`). The facts also carry 169 MCP tools, 177 HTTP paths, 17 materials, 32 check steps and 3,369 parity rows. A redesign may show other facts from the same file; it never types a digit of the tree into the copy.
- The 0.003% figure links to the export record (`home.export.record`).

### 5.6 The brand rules

The framing's list, with where the tree enforces each: Inter only (`--pt-display` and `--pt-text`); paper and ink tokens with `#2f5ce0` as the one interface colour, and no accent on lines or fills of the landing (`docs/brand.md` section 11: the chrome, exports, deck content, menus, `/home`, the card and the README draw no blue; row `decks.home.capture-plain`); the one rail law (row `decks.home.grammar`; the brand lint's one rail check); ruled rows, no boxed cards, no shadows, no gradients, no rounded corners except `--pt-radius` and Slideshow's 8 px; Heroicons solid in key cells only; the dither field and the mood pictures as materials, each picture credited in `docs/brand.md` section 8; the avoid list (no smooth scrolling, no scroll hijacking or inertia libraries, no eyebrow labels, no monospace as a voice, no robot or sparkle AI iconography, no em dashes, no exclamation marks); plain technical English; `prefers-reduced-motion` honoured. `html:has(.ts-product) { scroll-behavior: auto }` is stated explicitly in `home.css`.

### 5.7 The rows and tests a motion landing has to rewrite on purpose

These encode the polish round's decision that the page is still and short. Kevin's ask reverses that decision, so the spec has to name each one and replace it, not trip over it:

| Rule today | Where | What a motion landing needs instead |
| ---------- | ----- | ----------------------------------- |
| "Nothing animates" | `docs/POLISH.md` 3.2; `home.css` header; `HomeHero.tsx` header | A motion rule set: what moves, when, for how long, and the still each motion shows under reduced motion |
| No script may carry `ShaderMount` or the liquid metal shader | `home-page.spec.ts` 637 to 660 | A budgeted, lazily mounted shader or dither engine, or the test kept by drawing the material without the product's shader code |
| Under 350 words; one heading, one lead, one picture or diagram per section; at most one action | `decks.home.copy-rules`; `home-page.spec.ts` 136; POLISH.md 3.2 | Kept for words; the section shape may change if the spec names the new shapes |
| Under 5,000 px at 1440 and 8,500 at 390 | `decks.home.pictures-three-widths` | Kept or raised with a reason; a pinned sequence counts its scroll length |
| CLS 0 over the load and a full scroll at 1440 and 390, both appearances | `decks.home.layout-shift`; `home-page.spec.ts` 662 | Kept: every moving element reserves its box from the first paint |
| No dither on the page; the mood pictures off the first screen | POLISH.md 3.3 item 3; NEXT.md question 5 | A proposal to Kevin, since question 5 is his |
| The capture shows no selection ring, chip or handle | `decks.home.capture-plain` | Kept for captures; an interactive slide that shows a live selection has to draw it in ink or ask for the blue as the product's interface colour |
| Product pictures are the product's own render, regenerated by `--capture` on the shipped tree | POLISH.md 3.3 item 1; `shots.test.ts` | Kept, and the captures retaken on Round 1's chrome before anything ships |

## 6. The budget

### 6.1 Production measured on 2026-10-02

`current/probe/perf.mjs`: five cold loads of https://www.turboslide.com/home, each in a fresh browser context with an empty cache, Chrome for Testing 1217 headless with a person's user agent (`HeadlessChrome` replaced by `Chrome`, as the performance audit's person runs did), the light appearance, bytes from the DevTools protocol's `Network` events (encoded is over the wire, decoded is after brotli), LCP and CLS from `PerformanceObserver`, script time from `Performance.getMetrics`. The machine was loaded by three pipelines in other worktrees. The probe waited six five minute sleeps for a one minute load under 30 (15:45 to 16:15 PDT, load 50 to 61) and then ran at the load printed with each run. Server and byte numbers do not move with load; paint and script numbers do, so they are an upper bound on this machine. Raw rows: `current/probe/perf-1440.jsonl`, `perf-390.jsonl`, `perf-1440-dpr2.jsonl`; medians: the `-summary.json` files.

1440 by 900, device scale 1, 23:15:0x UTC (16:15 PDT), one minute load 54.88, 53.20, 51.67, 51.37, 51.18:

| Metric | Median | Worst of five |
| ------ | ------ | ------------- |
| Final headers | 50 ms | 331 ms (run 1, the cold connection) |
| FCP | 136 ms | 496 ms |
| LCP | 196 ms | 520 ms |
| LCP element | the hero picture, `hero-light-fdb7c9b176.jpg` (153,286 bytes, the 1x candidate) | the same in all five |
| Load event | 183 ms | 456 ms |
| CLS | 0 | 0 |
| Main thread script | 79 ms | 89 ms |
| Requests | 17 | 18 (the speculation rules' `/decks` prefetch finished inside the window in two runs) |
| Bytes over the wire | 994,454 | 1,056,753 |
| Bytes decoded | 1,959,435 | 1,959,435 |
| JavaScript | 346,601 over the wire, 1,234,881 decoded, 3 files: `index-BhUVPN0m.js` 327,257 / 1,176,073, `home-Usd4t-7s.js` 18,306 / 56,780, `theme-DO8NCsMh.js` 1,038 / 2,028 | the same |
| Fonts | 352,636: `InterVariable-DiVDrmQJ.woff2`, one file | the same |
| Images | 261,961: the hero 1x JPEG 153,560, the menus crop 69,222, the canvas crop 39,187 | the same |
| CSS | 16,226 over the wire, 54,504 decoded, 7 files | the same |
| Document | 15,855 over the wire, 55,597 decoded | the same |

The same page at the two other readings:

| Reading | When (UTC) and load | Final headers | FCP | LCP | Bytes over the wire | Images | Script |
| ------- | ------------------- | ------------- | --- | --- | ------------------- | ------ | ------ |
| 1440 by 900, device scale 2 (a laptop's display) | 23:31:10 to 23:31:33, 53.06 to 47.88 | 124 (161) ms | 268 (292) | 340 (520), the 2x hero `hero-light-2x-d6106a0704.jpg` | 1,481,573 (1,481,683) | 686,855: the hero 392,926, the menus crop 187,493, the canvas crop 106,437 | 88 (96) ms |
| 390 by 844, device scale 1 | 23:25:32 to 23:25:55, 57.67 to 61.89 | 85 (119) ms | 252 (332) | 292 (392), the 1x hero | 994,437 (1,056,685) | 261,961: the same three 1x files as at 1440 | 84 (93) ms |

Medians, with the worst of five in brackets. At every reading all three pictures load before the first scroll: the menus and canvas crops sit within the browser's lazy loading distance of the first screen. At 390 the phone fetches the 1440 by 900 hero for a 350 px slot, because the smallest candidate in `shots.json` is 1440 px wide.

The audit's person rerun of 2026-10-02 02:21 to 02:24 UTC (load 19 to 29) read final headers 22 ms, FCP 164, LCP 236, 17 requests, 1,022 KB, JavaScript 347 KB over the wire and 1,235 KB decoded, CLS 0, script 140 ms (audit-performance 2.1). The bytes have not moved since: the entry chunk is still 1,176,073 bytes decoded, the font still 352 KB. The page's own code is 56,780 bytes decoded (`home-*.js`); 95 percent of the JavaScript `/home` decodes is the shared entry chunk.

### 6.2 The budgets that stand

- `docs/gslides-parity/next/audit-performance.md` section 5 (measured 2026-10-02 01:35 to 02:25 UTC), the `/home` budget for Round 2: final headers 50 ms cold and 30 warm, LCP 400 and 200 ms, JavaScript 600 KB decoded, fonts 120 KB. Its reading then: 22 ms, 236 ms, 1,235 KB, 353 KB; requests 17, bytes 1,022 KB, CLS 0, main thread script 140 ms, longest frame 97 ms.
- Row `decks.home.load-budget` (POLISH.md 3.5): first byte 150 ms, LCP 500 with the hero or the h1, ready 500, images before the first scroll 300 KB and after a full scroll 800 KB, the document under 60 KB, no long animation frame over 100 ms; JavaScript reported against 600 KB, not gating.
- The causes the audit named for `/home`: the 1,176,073 byte entry chunk (`index-*.js`, 326,805 bytes brotli on production at 22:29 UTC) that every route loads, `/home` included (audit-performance item 1, 126 to 129); the one InterVariable file at 352,240 bytes (item 10, 152 to 157); the renderer's CSS inline in every document, 29,235 bytes of the 55,597 byte HTML (item 13).

### 6.3 What the budget leaves for motion

Against those budgets, production `/home` today (section 6.1, `prod-1440-bytes-vs-budget.png`):

| Budget | Today | Room |
| ------ | ----- | ---- |
| Final headers 50 ms cold (audit) / first byte 150 ms (row) | 50 ms median at load 51 to 55; the audit read 22 ms at load 19 to 29 | Met. The page is a static file, so motion costs nothing here as long as it stays prerendered |
| LCP 400 ms cold (audit) / 500 ms (row), with the hero or the h1 | 196 ms at scale 1, 340 ms at scale 2 | About 60 to 200 ms. A live hero has to keep a picture or the h1 as the LCP element and mount after it |
| JavaScript 600 KB decoded | 1,234,881 | None. 635 KB over before a line of motion. The page's own chunk is 56,780; the rest is the shared entry chunk |
| Fonts 120 KB | 352,636 | None. 233 KB over |
| Images before the first scroll 300 KB | 261,961 at scale 1; 686,855 at scale 2 | 38 KB at scale 1; 387 KB over at scale 2 |
| Images after a full scroll 800 KB | the same three files: 262 KB or 687 KB | 113 KB at scale 2 |
| Document under 60 KB | 55,597 decoded (29,235 of it the renderer's inline CSS, audit item 13) | 4 KB |
| CLS 0 | 0 at every reading | Must stay 0 |
| No long animation frame over 100 ms | main thread script 79 to 88 ms in total at load 50 to 60 | A motion engine's per frame work must stay well under 16 ms and never block the first input |

What this means for the spec: on today's tree a motion landing has no JavaScript or font room at all, and on a laptop display it is already over the image budget before a film or a live slide is added. The room has to be made first: the entry chunk split (audit-performance item 1, expected `/home` at about 640 KB decoded), an Inter subset or a static instance for `/home` (item 10), and a picture plan whose first screen fits 300 KB at scale 2 (one hero, the crops below the lazy loading distance, or AVIF and WebP candidates with a 720 px rung). Then every moving part gets its own line: bytes over the wire and decoded, when it loads (after LCP, on intersection), its per frame cost, and its reduced motion still. A video loop counts against the image budget and needs a poster that is the LCP candidate.

## 7. Ideas: what the landing could take, in its own grammar

Each idea starts from a gap in section 4 and stays inside section 5. The LoveFrom and OpenAI researchers will name what those sites do; these are the places on this page where their findings can land.

1. The page follows its own h1. "Build the pitch, present it and send the link" already names three chapters. The bands can be grouped under them: Build (the canvas, the menus, the brand features), Present (Slideshow, presenter view, the present link), Send (the share link, PDF and PowerPoint), then Agents and the license. Each chapter opens on a seam with a change of scale, so the page reads as a sequence and stops repeating one band template six times.
2. The hero becomes a slide a visitor can move. The column holds the renderer drawing one slide of the GT deck, with one object a visitor can drag, resize and rotate in ink handles, and Undo as a Title Case button under it. The current capture stays as the first paint and the LCP element, so CLS stays 0 and the picture is the still under reduced motion. The live layer mounts after hydration and only on a pointer device. It reuses the viewer's code path (`/embed/$deckId` already speaks `gt-deck-slide` and `gt-theme`) and never loads the editor's 2.6 MB.
3. The canvas diagram plays its move once. The drag line draws from the first place to the new one, the box follows it, the handles land, and the rotation settles at 8 degrees. It plays when the copy's centre crosses the 55% read line (Prototemplate DESIGN.md section 14), pauses offscreen, and shows today's diagram as its end pose under reduced motion. CSS or the Web Animations API on inline SVG, with `pathLength` normalised to 1000 for the dash (DESIGN.md section 9); no library.
4. The features become a ruled index. The facts rows grammar (a Heroicon in the key cell and one sentence) extends to the features the page leaves out: Shader, Dither, Logo, Brand kit, Table, Chart, Diagram, Word art, Comments, Version history, Share. Focusing or hovering a row swaps the figure beside the index to that feature's own short render. Rows are links and buttons, the keyboard reaches every one, and nothing moves on scroll.
5. The dither field is the material of one full bleed band. A small canvas engine prints the Blue Marble or the GT deck's opener field through the 8 by 8 Bayer screen in paper and ink, the way Prototemplate's `motion/kit/dither.js` does. It mounts lazily, pauses offscreen and on hidden tabs, and draws one frame under reduced motion (DESIGN.md section 11). It carries none of the product's `ShaderMount` code, so the test at `home-page.spec.ts` 637 can stay, or the spec rewrites that test with a byte budget.
6. The deck's opener slide is the page's chapter opener. A full picture under the rails with the plate lower left (the chapter's name, one sentence, the credit), the grammar DECK-GRAMMAR gives `.s-opener`. Only credited pictures from `docs/brand.md` section 8, and never the first screen unless Kevin answers question 5 the other way.
7. The 0.003% becomes something a visitor can check. A seam handle (Prototemplate DESIGN.md section 10, the slide-to-reveal "dossier refit": both layers pinned, one CSS variable `--seam-cut`, zero re-renders on drag, keyboard operable) over the same slide drawn by the editor and by the exported PowerPoint file. The figure stays in the numbers row from `facts.json`; the seam shows what it measures.
8. Present is pressed, not described. The present band draws a key cap S in a ruled box; pressing S or the key cap plays three slides of the GT deck in place inside the column, with Escape and the arrow keys as in Slideshow. The diagram of the presenter window and the phone stays as the still.
9. The agents band replays a real transcript. On the `#101010` panel the command from `copy.ts` runs once and its JSON answer follows, recorded from the CLI on the shipped tree; beside it the slide the command made appears in a frame drawn by the renderer. Monospace stays on the panel and the replay is seekable and plays once.
10. The pictures are retaken on Round 1's chrome before anything else ships. The new monogram in the title row, Assist as the word alone, no Logo row in Insert, a named author in place of "Helium 503". At 390 the hero shows the phone editor of B3b#14 (one Menus key, the filmstrip under the sheet) at 1:1, in place of the 1440 window at 0.23.
11. The mark closes the page. The footer draws the 180 px monogram from its five rectangles in one short sequence (the GT films' sting, MOTION.md), with the still under reduced motion; the bar's 24 px mark never moves.
12. The budget pays for the motion. The entry chunk split of audit-performance item 1 (1,176 KB decoded on every route) and an Inter subset for `/home` (item 10, 352 KB to about 120 KB) free about 595 KB of decoded JavaScript (the audit's expected 1,235 to about 640 KB) and about 230 KB of font transfer, several times what ideas 3 to 9 need. The redesign spec should name both as prerequisites and give every moving part a byte and a frame budget.
13. The front door is a question for Kevin. `/` answers 307 to `/new`, so the landing is reached only by link. One option keeps the editor for returning visitors and sends a first visit to `/home`; it is Kevin's routing decision and this workflow changes nothing there.

## 8. Pictures

All under `current/pictures/`, JPEG or PNG under 400 KB. The full page captures are scaled to 1200 px wide at 1440 (the 390 captures are 1:1). The page has no motion, so there is no frame strip.

| File | What it shows |
| ---- | ------------- |
| `prod-1440-light-first.jpg`, `prod-1440-dark-first.jpg` | Production's first screen at 1440: the type and buttons on the left, the right half empty, the top of the capture |
| `prod-1440-light-full.jpg`, `prod-1440-dark-full.jpg` | Production's whole page at 1440 (4,898 px): icons before every h2, the blue ring in the canvas capture, the light command plate |
| `prod-390-light-first.jpg`, `prod-390-dark-first.jpg` | Production at 390: the mark at x 0 and New Presentation to x 390 (the gutter bug) |
| `prod-390-light-full.jpg`, `prod-390-dark-full.jpg` | Production's whole page at 390 (4,263 px) |
| `branch-1440-light-first.jpg`, `branch-1440-dark-first.jpg` | The branch's first screen at 1440: rails and crosses, the new mark, the facts rows, the capture |
| `branch-1440-light-full.jpg`, `branch-1440-dark-full.jpg` | The branch's whole page at 1440 (4,919 px): the numbers row and hatch, the diagrams with square markers, the dark command panel |
| `branch-390-light-first.jpg`, `branch-390-dark-first.jpg` | The branch at 390: the two row bar with its gutter, the stacked facts rows |
| `branch-390-light-full.jpg`, `branch-390-dark-full.jpg` | The branch's whole page at 390 (5,162 px) |
| `branch-1440-mark-mismatch.png` | The bar's new monogram above the capture's title row with the old block mark, the Assist sparkle and "Helium 503" |
| `branch-1440-hero-titlerow.png` | The capture's title row and menu bar at 2x |
| `branch-390-hero-picture.png` | The hero capture as a 390 visitor sees it: the 1440 window at 324 px |
| `branch-1440-numbers.png` | The numbers row at 2x: 22 layouts, 193 actions, 0.003% |
| `branch-1440-nav.png` | The branch's navigation bar at 2x (Sign In's slot empty on a deployment with no method) |
| `card-prod-vs-branch.jpg` | Production's card (old mark, monospace address, dither field) beside the branch's card (new mark on a plate beside the Blue Marble, with the credit) |
| `prod-1440-bytes-vs-budget.png` | Production's bytes by kind against the budgets of section 6.2 (JavaScript 1,235 KB against 600, images at scale 2 687 against 300, fonts 353 against 120, the document 56 against 60) |

## Sources

- Production: https://www.turboslide.com/home (HTML 22:16:26 UTC; captures 22:41 to 22:42 UTC; runs in section 6), https://www.turboslide.com/og/turboslide.png (22:45 UTC), the routes of section 1 (22:45:23 UTC), the asset sizes (22:29:24 UTC), all on 2026-10-02.
- The tree at `2108dad4`: the files listed in section 1, with `3263728a` (B2a#15) for the branch's page and `cb425406` for production's newest home change.
- `docs/gslides-parity/next/audit-performance.md` sections 2.1, 3 items 1, 10, 13, and 5; `docs/gslides-parity/next/audit-brand-surfaces.md` rows 7 and 9 to 16.
- Prototemplate (read only): `deck/DECK-GRAMMAR.md`, `DESIGN.md` sections 9 to 11 and 14, `motion/MOTION.md`.
