# Brand references for the Turboslide identity

Report 01 of the Turboslide round four research set, reader brand. Written 2026-09-13 against `main` at 61b16e4. Every repository fact below was read from the checkout on that date and names its file; every external fact carries a source key that resolves to a URL and the date read in section 9. Where a page refused the fetch, the fact is marked as read through a search listing or a third party page and repeated in section 10.

Kevin's directive for this round, verbatim: (a) "make transitions between different websites and doing stuff in the slides so much faster and more performant"; (b) "also make a custom turboslide icon and favicon and everything and custom ui aesthetic and branding that uses awesome bayer dithers and shaders and unique beautiful ui like a modern clean but also technical and agent-supporting vercel and opinionated and better and turbo-fast (and explain why its turbofast, like built on rust?) vercel-ified version of google slides almost. and give it a /home page too". This report serves (b) and the part of (a) that the identity can carry (motion, prefetching and the honesty of the speed claims); the round's performance reader owns the measurements behind (a).

Rules followed: plain technical English, sentence case, no em dashes, no metaphors, headings without trailing periods, complete sentences. No Google or Vercel artwork is reproduced or proposed; Google Slides is the behaviour reference and Vercel is the reference for tone, density and finish. Kevin's standing directives of 2026-08-11 for the company brand (a single face, hard corners, Swiss grids, no monospace as the brand voice, no eyebrow text, no em dashes, no AI gradient or glass looks, no robot or sparkle iconography, hand crafted over generated) are applied as constraints; nothing else from that document is repeated here because this repository is public.

## How to read this report

- "Verified" means the product's own page or its HTML states it. "Third party" means a page the product does not own. "Search listing" means the text was seen in a search result and the page itself refused the fetch. "Repository" means a file in this checkout, named by path. "Unverified" means expected from product knowledge and confirmed by no page read; every unverified claim is repeated in section 10.
- The favicon table in section 2.17 comes from the `<head>` of each homepage fetched with curl on 2026-09-13 with a Chrome user agent; the SVG favicons of Linear, Cursor and Figma were downloaded and searched for `prefers-color-scheme`.
- A quoted phrase is the exact text of a source. Behaviour and rationale are paraphrased.
- Section 6 is the brief for the design-4 reader: what the identity must do, stated as requirements and tests, with the candidates it should draw named and the rejected ones explained.

## 0. Decisions in one page

1. Turboslide is ink and paper. The identity adds no colour to the chrome. The nine sheet tokens, `--pt-panel-ink` and the four semantic hues stay where the specification puts them (SPEC 2.1, 2.2), and the only spectral accent a Turboslide surface may show is one the deck theme provides inside the sheet. Every reference that reads as technical and fast in this set is monochrome first (Vercel, Resend, PlanetScale, Linear's brand assets, Zed's black and white variants) and adds at most one accent.
2. One face. The wordmark, the chrome and the /home page are Inter, weight 500 at most for display, with the features and tracking the theme already fixes (`packages/theme/src/tokens.ts` `DISPLAY`). Monospace is an instrument for identifiers, revisions, commands and code, never the voice.
3. The mark is a 1-bit form. It must be constructible in ink and paper alone, survive at 16 px on a light and a dark tab strip, carry no gradient and no second colour, and it must not read as a triangle, a cube, a Z, a yellow rectangle or Turborepo's gradient. Section 6.3 names two candidates to draw and one to reject.
4. The GT mark leaves the chrome and stays in the theme. The title row, the app bar, the favicon, the README, the CLI banner and the /home page carry Turboslide; the sheet's wordmark, the `mark` block, the closing plate, the icon picker's symbol and the GT templates keep the GT mark because they are content of the `gt-ink-paper` theme.
5. Every `--pt-` token keeps its name and value. The chrome stays diffable against its Prototemplate source and `turboslide lint --chrome` keeps naming the tokens (SPEC 2.2). The identity adds tokens only for the head of the document (theme colour, icon set) and for the /home page's type ladder.
6. Dithers are tonal, twin per theme, and only where a picture would be. Marks at 32 px and above, the /home hero, empty states, loading textures, anonymous avatars and the 404 may carry Bayer 8 by 8 cells in ink and paper. Menus, the toolbar, panels, dialogs, controls, text, icons, filmstrip thumbnails and the workspace around the sheet may not.
7. Shaders are captured first and live second. A shader appears in the identity as a two-tone frame captured through `material.capture` at 3200 by 1800 with a recipe key; a live mount is allowed on the /home hero on the main thread with a still frame under reduced motion and the captured frame as the first paint.
8. Cells never shimmer. A dither in motion keeps its threshold map fixed to the surface and moves the tone under it, which is the lesson of Return of the Obra Dinn's stabilised dither and of the Prototemplate rule that coverage tiers nest by construction.
9. The speed story states mechanisms and measured numbers. The Rust crate is the determinism story and a 52 ms to 20 ms measurement, never "built on Rust so it is fast"; the renderer, the static contracts, the Chromium raster export, the batched export, Fluid compute and intent prefetching each get one sentence tied to a file and a number (section 5).
10. The favicon is a set, and the tab icon follows the operating system while the page follows its stored theme. The set of `favicon.ico`, `icon.svg` with an embedded `prefers-color-scheme` block, `apple-touch-icon.png` at 180, `icon-192.png`, `icon-512.png` (maskable) and `manifest.webmanifest`, plus a `theme-color` pair, replaces the `data:,` placeholder in `apps/studio/src/routes/__root.tsx`.
11. Motion is the six durations and transform or opacity. No splash, no logo animation on load, no route transition beyond the shell's own; the perceived speed of a transition comes from `defaultPreload: 'intent'` and from drawing less.
12. Names are fixed. The product is "Turboslide", one word, capital T, in prose; the command is `turboslide`; "Google Slides" is used as an adjective for the behaviour reference; "Turbo" alone is Vercel's product family and is never used for the mark or as a short name.
13. The agent surface is shown in the human surface. The honest signal of an agent supporting product in this set is a machine readable copy of every human page (Stripe's `.md` suffix, `llms.txt`, `AGENTS.md`, MCP, typed OpenAPI descriptions) and a monochrome terminal presentation. Turboslide already ships these; the identity makes them visible on /home and in Extensions > Agent access, in monospace as an instrument.
14. Every claim in section 5 that the code does not yet do is marked. The wasm module is built and wrapped but the editor's dither preview worker still runs the TypeScript stages (`docs/native.md`, open items), so no page may say the browser preview runs on wasm until the worker is mounted on it.

## 1. What Turboslide has today

### 1.1 The mark and where it appears

| Surface                         | What it shows                                                                                           | Source                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Title row, `/edit` and `/new`   | The GT mark at 31 by 20 as a link to `/decks`                                                           | `packages/chrome/src/TitleRow.tsx` line 273                               |
| App bar, `/decks`               | The GT mark at its 25 by 16 default beside "Turboslide" in Inter 500 at 20 px, tracking -0.01em          | `apps/studio/src/routes/decks.index.tsx`, `decks.css` `.ts-appbar-brand`   |
| The sheet, every slide          | The GT mark at 28 by 18 in titanium, bottom left, theme level and never selectable                       | `packages/render/src/stage.ts` line 13; gslides-parity SPEC-2 1.6          |
| The theme sprite                | `gt-mark`, viewBox `-8 214 1213 771`, aspect 1213 to 771, beside 67 Heroicons 20 solid                   | `packages/theme/assets/sprite-ids.json`, `tokens.ts` `MARK`                |
| The `mark` block, closing plate | The GT mark as content of the GT deck (the closing's mark at 138 by 88)                                  | gslides-parity SPEC-2 1.2                                                 |
| Insert > Icon                   | The picker's grid of every sprite symbol, the GT mark included                                           | `packages/chrome/src/IconPicker.tsx` line 16                              |
| Browser tab                     | No icon: `{ rel: 'icon', href: 'data:,' }` with the comment "no favicon file yet"; the title "Turboslide" | `apps/studio/src/routes/__root.tsx` line 43; production HTML of `/new`     |

The production document at `https://turboslide.vercel.app/new` on 2026-09-13 carried the title "Untitled presentation, Turboslide", the `data:,` icon link, no `apple-touch-icon`, no manifest, no `theme-color` and no Open Graph image. The GT mark is drawn as an inlined path in `packages/chrome/src/GtMark.tsx` (a G whose right stroke is the stem of a T under a shared crossbar, filled with `currentColor`) and through `<use href="#gt-mark">` on the sheet.

### 1.2 The tokens the chrome draws from

`packages/chrome/src/tokens.css` is the Prototemplate viewer's token file ported verbatim minus the site colours (SPEC 2.2): `--pt-paper` `#ffffff`, `--pt-ink` `#070707`, `--pt-ink-2` `#3a3d44`, `--pt-titanium` `#8a8f98`, `--pt-hair` at 18 percent ink, `--pt-hair-soft` 9 percent, `--pt-plate` 3.5 percent, `--pt-cross` 38 percent, `--pt-edge` 62 percent, `--pt-thumb` 32 percent, `--pt-scrim` 28 percent, `--pt-panel-ink` `#101010` and `--pt-panel-text`; the row heights 44, 28, 40, 64 and 32 px; `--pt-sb-w` 208 (256 in the editor), `--pt-panel-w` 320, `--pt-menu-w` 220; `--pt-radius: 6px` as "The one corner in chrome (Kevin's directive)", shared by the Search pill, the segmented controls and the filter fields, every other box square; six durations (120, 140, 160, 180, 200, 220 ms) that the reduced motion block sets to 0 ms; `--pt-display`, `--pt-text` and `--pt-mono` stacks; dark as a remap under `:root[data-theme='dark']` only. The line law (SPEC 2.2, `Prototemplate/DESIGN.md` "Line law for chrome") gives every rule in chrome one of three roles at 1 px: structural `--pt-hair`, row `--pt-hair-soft`, frame `--pt-edge`; `--pt-ink` appears on a border only as a state. `turboslide lint --chrome` checks it at 1440, 1280 and 390 in both themes.

The theme is stamped before first paint by `THEME_BOOT_SCRIPT` (`packages/viewer/src/theme.ts` line 176): `gt-theme`, then `gt-deck-theme`, default dark, and the script never consults `prefers-color-scheme`. This matters for the favicon: the operating system's scheme decides the tab strip's colour and any `prefers-color-scheme` media query, while the page's own scheme is the stored one, so the two can disagree by design (section 6.4).

### 1.3 Type and copy

Inter is the only face, embedded as InterVariable with `opsz` 14 to 32 and `wght` 100 to 900 (SPEC 2.1). Display is weight 500, tracking -0.025em, `text-wrap: balance`, features `cv11` and `ss01` (`tokens.ts` `DISPLAY`); the weight cap is 500 and text under 15 px on the sheet is a defect (`WEIGHT_CAP`, `FLOOR`). Chrome type is Inter at 13 px. Inter's `cv11` is the single storey a and `ss01` the open digits (TY1); neither changes a letter of the word Turboslide, which has no a and no digit, so the wordmark's feature settings are kept for consistency with the chrome rather than for their effect.

The copy rules are lints (`packages/theme/src/copy.ts`; `DECK-GRAMMAR.md` lines 21 to 24): no trailing period on headings, sentence case with proper nouns, product tokens never first in a heading, headings are names and never URLs, no metaphors (the `METAPHOR_WORDS` list), no "X, not Y" pairs, no em dashes, no exclamation marks, no eyebrows, full sentences in captions, Title Case only on buttons. `PROPER_NOUNS` lists General Translation, Prototemplate, Glyphfield, Locadex, Inter and Heroicons; Turboslide is not in the list yet and should be added when the identity lands (section 8).

### 1.4 The dither pipeline and the materials

The two-tone pipeline (`packages/effects/src/two-tone.ts`, SPEC 5.4) crops, converts to gray or one channel, inverts, applies a minimum filter and a Gaussian blur, cover fits to 800 by 450 with Pillow's Lanczos3, applies an unsharp band, autocontrast at 0.5 percent, black and white points and gamma through a tone LUT, thresholds against the 8 by 8 Bayer screen at `int((m + 0.5) / 64 * 255)` (`bayer.ts`; the deck's own permutation of 0 to 63 from `Prototemplate/deck/parts/tail.html`), applies polarity, scales 2x nearest to 1600 by 900, and writes both twins as 1-bit PNGs with plate metrics (lit fraction, plate clearance, the uniform and blank warnings). The screen is cut by whichever backend `select.ts` picks: the napi addon, the wasm module or the TypeScript stages (`backend.ts`); polarity, the upscale, the PNG encoder and the metrics stay in TypeScript because they are integer operations that cannot disagree.

The Rust crate `crates/turboslide-native` (Cargo.toml: edition 2024, `napi` and `wasm` features, `libm` pinned so `sin`, `exp` and `pow` come from the same fdlibm lineage as V8) mirrors the TypeScript stages operation for operation; `docs/native.md` records 0 disagreeing cells over 30 screens of 360,000 cells and over the 1,440,000 cell golden, and the measured costs on the M5 Max: two-tone screen 52 ms in TypeScript, 20 ms on the addon, 23 ms on wasm; pixelmatch 208, 153 and 233 ms; DSSIM 1,849, 1,275 and 2,019 ms. The same document states the reason for the crate: "Rust buys no throughput for this work (SPEC 10: PNG decode dominates, the dither is 5 to 9 ms in plain JavaScript). The argument is determinism", and its open items say the editor's dither preview worker still composes the TypeScript stages and the wasm module "is built and wrapped for it but not mounted".

`packages/materials/src/catalog.ts` binds 17 Paper Shaders (`@paper-design/shaders` 0.0.78, Apache-2.0 with NOTICE): liquid metal, gem smoke, smoke ring, god rays, mesh gradient, simplex noise, swirl, spiral, grain gradient, dithering, static radial gradient, neuro noise, metaballs, waves, dot grid, perlin noise and static mesh gradient. `paper:dithering` is "Paper's ordered dither over a shape, at 2 by 2, 4 by 4 or 8 by 8, in two colors; the deck's own screen is the two-tone treatment, this is the shader". Every entry carries three GT presets from `presets.ts`: `ink-paper`, `paper-ink` and `brand-blue` (`#2f5ce0` with `#86a8ff`), plus the recorded deck recipes for liquid metal and gem smoke. The five Prototemplate direction engines are listed as `proto:*` and unavailable (open question 9). A material is captured as frozen frames at 3200 by 1800 with a recipe key (`material.capture`), and the earlier report `docs/gslides-parity/research-3/06-backgrounds-and-dithers.md` fixes the object level `dither` field, the variant first rule and the Format options vocabulary; this report does not repeat that specification.

### 1.5 The performance facts the identity may state

- One string renderer (`packages/render`) draws the editor, the viewer, the embed, the CLI's screenshots and the exports; `scripts/compare-to-shoot.mjs` holds every GT render within 0.5 percent of the brand deck's own screenshots on the same Chrome build, and `scripts/canvas-fidelity.mjs` holds the canvas conversion at a worst of 0.262 percent over 342 pairs (README, Quality gates).
- The action table (`packages/schema/src/actions.ts`, 105 actions) generates the CLI parsers, the MCP tool list (89 tools), the window API's action list, the OpenAPI 3.1 document, the manifest, `llms.txt`, `llms-full.txt` and four skills; a stale committed copy fails `pnpm check` (README, Agent native).
- Perfect PPTX places the 2x Chromium raster of each page over invisible text runs; on the 85 slide GT deck, 170 pages decode with a worst mismatch of 0.003 percent at about 15.5 MiB per theme (README, Exports). Export runs synchronously inside the Vercel function on `chrome-headless-shell` 147.0.7727.0; a deck over 60 slides exports in batches with a progress sentence and a merge, and the GT deck exports from production in about four minutes at a peak of about 670 MiB against the 3009 MB function (README, Hosting; `docs/hosting.md` section 6: `maxDuration: 800`, `memory: 3009` on the export, render and server function routes).
- The studio is TanStack Start 1.168 on Vite 8 with Nitro's Vercel preset; the router sets `defaultPreload: 'intent'` and `defaultPreloadStaleTime: 0` (`apps/studio/src/router.tsx`), so a link's route code and loader data load after 50 ms of hover or at once on touch (PF1), and every preload refetches.
- Fluid compute runs several requests of one deployment in one Node process; the repository notes that one instance runs one Chromium job at a time and that Fluid sends several requests to it (`docs/hosting.md` line 558, `docs/hosting-chromium.md` line 187). Vercel's documentation describes Fluid compute as "handling multiple invocations within a single function instance", default for new projects since 2025-04-23, with a Pro maximum duration of 800 s (V6).

### 1.6 Kevin's standing directives that bind the identity

From the plain technical English directives recorded on 2026-09-08: complete declarative sentences, plain noun headings without trailing periods, no fragments for rhythm, no comparison constructions, a single typeface in documents. From the company brand directives of 2026-08-11: a single face (Inter is named), hard corners and Swiss grids, no monospace as the brand voice ("mono as diagram/UI instrument tolerated"), no eyebrow text, no smooth scrolling libraries, no robot or sparkle AI iconography, no AI gradient or glass look, marks that compress to a favicon, a CLI banner, a README and an npm page, marks that survive translation, hand crafted over generated. The `--pt-radius: 6px` corner stands because it is Kevin's own directive for the shell; the mark itself takes no rounded corner.

## 2. The reference set

Each entry states what the product does with its mark, wordmark, favicon, light and dark, motion and generated art, then what Turboslide takes and what it avoids. Colours with a hex value are verified on the product's page unless the entry says otherwise.

### 2.1 Vercel

The mark is a triangle; the brand page allows the Unicode character "▲ U+25B2" where space is short and defines the safety area "by the height of our symbol"; logos ship in light and dark versions; the marks may be used "truthfully describe the products, services, and technologies that we offer" and may not be used "in your business name or confusingly similar designs" or "more prominently than your own branding" (V1). Geist is "Vercel's design system for building consistent web experiences" with "a high contrast, accessible color system" and grids "central to Vercel's aesthetic" (V2); Geist Sans and Geist Mono were "specifically designed for developers and designers" on principles of "simplicity, minimalism, and speed" from Swiss design, under the OFL (V3). The colour system has ten steps per scale, 100 to 1000, with roles by band: backgrounds 100 to 300, borders 400 to 600, high contrast 700 to 800, text and icons 900 to 1000, in P3 where supported (V5). Empty states carry a Title Case title, a sentence case description, an icon or illustration and at most one primary and one secondary action (V9).

Geist Pixel, published 2026-02-06, is "a bitmap-inspired typeface" in five variants (Square, Grid, Circle, Triangle, Line) whose glyphs were "manually refined to avoid visual noise, uneven weight distribution, and awkward diagonals", intended for "banners, dashboards, experimental layouts, product moments" (V4). Ship's event art moved from magnetic particles (2024, built by basement.studio in Regl with an SVG first paint swapped for the canvas once loaded, V8) to a ferrofluid direction that the team dropped after it "triggering symptoms of trypophobia" for "a near-metallic liquid system. Reflective and grounded" (V7, 2025-06-11). The homepage ships `favicon.ico`, nine `apple-touch-icon` sizes, a manifest, `<meta name="color-scheme" content="dark light">` and a `theme-color` pair `#FAFAFA` and `#000` by `prefers-color-scheme` (V13).

Take: black and white as the whole palette, the density of a documentation page, the theme colour pair, the empty state structure, and the discipline of a house pixel face that ships in the product rather than in posters. Avoid: the triangle and anything the eye reads as one; the "Turbo" product family (Turborepo, "the build system for coding agents", V10; Turbopack, "written in Rust", V11), whose gradient marks and name Turboslide must stay clear of; and the Turbopack precedent of a speed claim that a competitor's benchmark took apart (section 5).

### 2.2 Linear

The brand page prefers the wordmark ("the Linear wordmark has stronger brand recognition"), keeps monochrome as the standard, names Mercury White `#F4F5F8` and Nordic Gray `#222326`, asks for "room to breathe", and calls the brand "dynamic and ever-evolving" (L1). The 2024 redesign post (2024-03-28, Karri Saarinen and others) states the method: "reduce visual noise, maintain visual alignment, and increase the hierarchy and density of navigation elements", themes generated in LCH because it is "perpetually uniform", text and neutral icons made darker in light mode and lighter in dark mode, and "Inter Display to add more expression to our headings while maintaining their readability" (L2). The site ships `favicon.ico`, a `favicon.svg` of 697 bytes with two fills (`#000` and `#FFF`) and no media query, a 180 px Apple icon, a PWA manifest and `theme-color #08090a` (L3, L4). The brand indigo `#5E6AD2` appears only in third party listings (L5).

Take: the wordmark as the primary asset, density as a design value, a two colour SVG favicon that reads on both tab strips without a media query, and Inter Display as the heading cut that the deck already uses through `opsz`. Avoid: the indigo, and the soft gradients of Linear's marketing that its own brand page does not use.

### 2.3 Raycast

The homepage is dark with a red or coral accent, glass backdrops and gradients; its lines are "Your shortcut to everything", "Think in milliseconds", "Keyboard First" and, for its AI, "Meet your new virtual assistant" (R1). The head carries one PNG favicon, `favicon-production.png`, with no dark variant, no manifest and no theme colour (R2). The brand colours `#FF6363`, `#151515` and Inter come from third party listings (R3); the page found under "brand guidelines" on raycast.com is an extension template for storing a team's own assets, not Raycast's guidelines (R4).

Take: "milliseconds" as a unit a product can promise, and keyboard first as a product value that Turboslide already has through Google's chords. Avoid: the glass and gradient surface (on Kevin's avoid list), the assistant framing, and a single PNG favicon.

### 2.4 Warp

The 2024-10-17 refresh kept the glyph, "a broken terminal window that cracked under extreme speed", and changed the wordmark; the visual system "reinterprets, processes, and manipulates publicly available artwork as a method of world building" and sets "the cool, direct nature of the product against the warm and tactile nature of our visual system" (W1). The 2021 engineering post is the honest form of a speed claim: "a new high-performance terminal built entirely in Rust", rendering "directly on the GPU using Metal", with a measurement, "over the past week the average time to redraw the screen in Warp was only 1.9 ms" (W2). The homepage now reads "The Open Platform for Automating Development" and "modern terminal for agentic coding" (W3); the head ships PNG favicons at 16 to 196 px, Apple icons and a manifest, no SVG and no dark variant (W4).

Take: the form of the speed claim (language, mechanism, one measured number) and a glyph that keeps its meaning through a refresh. Avoid: processed found artwork as the visual system; Turboslide's pictures are its own captures and dithers with recorded sources and licenses (`Asset.source`, the license lints).

### 2.5 Zed

The brand page allows three colours, Brand Blue `#1348DC`, `#000` and `#FFF`, a gradient variant on the logomark's lower right, capitalised "Zed" and "Zed Industries", and forbids merchandise and implied endorsement (Z1). The homepage is dark with a blue call to action and states the mechanism: "Written from scratch in Rust to efficiently leverage multiple CPU cores and your GPU" (Z2). The head ships PNG favicons in black and white pairs at 16, 32 and 64 px selected by `media="(prefers-color-scheme: light)"` and `dark` on the `<link>` tags, and a `theme-color` bound to a CSS variable (Z3).

Take: the paired favicon by media attribute, a claim that names cores and GPU rather than an adjective, and three colours as the whole allowance. Avoid: the gradient variant, and the blue.

### 2.6 Cursor

The brand page offers 14 logo variations (2D, 2.5D and 3D cube, horizontal lockup preferred, vertical lockup, wordmark, app icons in light and dark) and the naming rule "Refer to us as Cursor. Not Cursor AI or Cursor Code." (C1). The 2025 refresh (reported 2025-11-27) refined the cube for screens with "subtle rounding", set the brand in Cursor Gothic, a typeface by Kimera derived from Waldenburg "merging the rational structure of Akzidenz Grotesk and the analog sensibility of Univers", drew the product and website icons from the same typeface, and embedded the logo in the font so lockups compose from type alone (C2). The head ships SVG favicons in a light and a dark file selected by media attribute (fills `#26251e` on `#f7f7f4` and `#edecec` on `#14120b`, no media query inside the SVG), a `theme-color` pair `#f7f7f4` and `#14120b`, a manifest and an Apple icon (C3).

Take: the refine rather than reinvent brief, one type system that also yields the icons, the light and dark SVG pair, and the naming rule. Avoid: 2.5D and 3D renderings of the mark, which need shading a 1-bit form cannot carry.

### 2.7 Arc

The homepage keeps a calm light layout and now states that Arc "receives Chromium updates only" and points to Dia for security updates (A1); the brand colours `#3139FB` and `#FF5060` and the sunset and acquisition history come from third party pages and search listings (A2, A3). Take: the lesson that an identity built on a gradient and a mascot colour retired with the product. Avoid: colour as the identity.

### 2.8 Framer

The brand page provides an icon, a wordmark and an app icon, the colours Black `#000000`, White `#FFFFFF`, Framer Blue `#0099FF` and Deep Blue `#0055FF`, and the rules "Never outline the logo", "Never rotate or skew the logo", "Never use colored logos" and "Pair wordmarks with wordmarks and icons with icons" (F1). The head ships PNG favicons in a light and a dark pair by media attribute and an Apple icon; Pitch, built on Framer, ships the same pattern (F2, PI2).

Take: the lockup pairing rule and the flat, single colour mark rule. Avoid: the blue.

### 2.9 tldraw

tldraw positions itself as "The infinite canvas SDK" and a "High-performance web canvas" with "Enterprise-grade multiplayer sync", lists 50.3K GitHub stars on the page, and sells to developers through starter kits and code first examples (T1). The head ships `favicon.ico`, PNG favicons at 16 and 32, an Apple icon and `theme-color #000000` (T2).

Take: infrastructure register for a canvas product, and a black and white mark. Avoid: nothing specific; the hand drawn shape language belongs to a whiteboard.

### 2.10 Figma

The brand usage page requires that "your branding must be larger and more prominent than the Figma marks", that Figma is used as an adjective, and forbids "Imitating Figma's visual identity or look and feel" (G1). The 2024-09-16 refresh set the wordmark in Figma Sans by Grilli Type, "an opinionated grotesque", added Figma Condensed, Mono and Hand, introduced primitives ("The primitives are intentionally varied, like the hands that made them") and widened the palette because "only a third of Figma's users identify as a designer" (G2); the 2019 refresh had used Whyte Inktrap and four guidepost words (G3). The head ships a 864 byte SVG favicon in five brand colours, PNG sizes, an `.ico`, a manifest and `theme-color #ffffff` (G4).

Take: the rule that the host brand outranks a referenced brand, applied to Google Slides in Turboslide's own copy. Avoid: a multi colour mark; the primitives system is the opposite of a 1-bit language.

### 2.11 Notion

The brand and press pages at `notion.com/brand` and `notion.com/press` redirect to `app.notion.com` and answered 401 and 404, so no rule could be verified (N2). The homepage head ships `favicon.ico` and an iOS logo PNG (N1). Notion's black N on white and its line illustrations are product knowledge and are recorded as unverified. Take: nothing verified. Avoid: hand drawn illustration as the identity's art.

### 2.12 Resend

The brand page fixes the name ("Resend" with a capital R, one word), offers a wordmark and an icon in white and black as SVG and PNG, monochrome throughout, states "Use the Resend wordmark for stronger brand recognition" and provides a standardised product screenshot (RS1). The site is dark by declaration (`<meta name="color-scheme" content="dark">`, `theme-color #000000`) and ships an `.ico` plus Apple icons (RS2).

Take: the whole approach, monochrome wordmark first with an icon for tight spaces, and the standard screenshot as a brand asset (Turboslide's equivalent is a render at a named revision). Avoid: a dark only site; Turboslide holds both themes.

### 2.13 Supabase

The brand assets page offers SVG logos in light and dark themes, states "Do not use any other color for the wordmark", forbids modification, and carries the line "Build in a weekend, scale to millions" (SB1). The head ships `.ico`, PNG favicons at 16, 32 and 48 and precomposed Apple icons (SB2). Take: the single colour wordmark rule. Avoid: the green accent as an identity; the hex is not on the page read and is recorded as unverified.

### 2.14 PlanetScale

The brand page provides a full lockup and a simplified mark for "when space is constrained or the full lockup is already established nearby", the colours Black `#1a1a1a`, White `#fafafa` and Orange `#f35815` ("Use black and white most of the time, with orange as an accent"), Inter in Regular, Medium and SemiBold ("Avoid Bold weights in brand materials") and Roboto Mono for code (P1). The March 2024 homepage post describes a hero built "as light and composable as possible so we can progressively enhance it": a lazy loaded canvas pixel grid that fades in after the initial load, reduced motion respected, CSS scroll snap instead of a carousel library (P2). A third party analysis reads the current site as set entirely in the `ui-monospace` stack at 16 px with hierarchy by weight on a `#fafafa` canvas (P3). The head ships `.ico`, a PNG icon, an Apple icon, a manifest and `theme-color #111111` (P4).

Take: the weight cap as a brand rule, the accent that appears almost never, the hero that paints its static form first, and the simplified mark rule. Avoid: monospace as the voice of the whole page, which Kevin's directive rules out; PlanetScale is the clearest example of the thing to leave alone.

### 2.15 Railway

`railway.com/brand` answered 403 (RW4). The docs describe Railway as "an all-in-one intelligent cloud provider" with the line "Your stack, your way" and ship light and dark image variants (RW1); the head carries `theme-color #13111C`, `.ico` and PNG favicons, an Apple icon and a manifest (RW2). The purple `#6C3FE7` is a third party listing (RW3). Take: nothing verified beyond the favicon set. Avoid: a tinted dark ground; Turboslide's dark paper is `#070707`.

### 2.16 The slides category, briefly

Pitch calls itself "The AI presentation workspace", sells "on-brand slides" from "Pitch Agent", and quotes a customer who finds it "really hard to imagine going back to Keynote or Google Slides" (PI1); its Framer site ships light and dark PNG favicons by media attribute (PI2). Gamma answered 403. Google's trademark guidance forbids copying "the look and feel of Google web design properties or Google brand packaging, distinctive color combinations, typography, graphic designs, product icons, or imagery associated with Google" and requires trademarks "only as an adjective" (GO1). Turboslide's copy therefore says "the Google Slides editor" or "Google Slides' behaviours", never "a Slides clone", and its mark and colours owe nothing to the yellow presentation icon.

### 2.17 The favicon and head practices, verified from the HTML

| Site            | Icon files                                                             | Dark variant                                          | Manifest | theme-color                          |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- | -------- | ------------------------------------ |
| vercel.com      | `.ico`, nine `apple-touch-icon` PNGs                                    | none for the icon; `color-scheme: dark light`          | yes      | `#FAFAFA` light, `#000` dark          |
| linear.app      | `favicon.ico`, `favicon.svg` (697 B, `#000` and `#FFF`), Apple 180       | one SVG that reads on both strips                      | yes      | `#08090a`                             |
| raycast.com     | one PNG                                                                 | none                                                   | no       | none                                  |
| warp.dev        | PNG 16 to 196, Apple set                                                | none                                                   | yes      | none                                  |
| zed.dev         | PNG 16, 32, 64 in black and white                                       | `media` attribute per `<link>`                         | no       | `var(--nav-bg-color)`                 |
| cursor.com      | `.ico`, PNG 192, `favicon-light.svg`, `favicon.svg`, Apple                | `media` attribute per `<link>`; no query inside the SVG | yes      | `#f7f7f4` light, `#14120b` dark        |
| framer.com      | PNG pair, Apple                                                          | `media` attribute per `<link>`                         | no       | none                                  |
| tldraw.dev      | `.ico`, PNG 16 and 32, Apple                                             | none                                                   | no       | `#000000`                             |
| figma.com       | `.svg` in five colours, PNG 128 to 256, `.ico`, Apple set                | none (the coloured mark works on both)                 | yes      | `#ffffff`                             |
| notion.com      | `.ico`, iOS PNG                                                          | none                                                   | no       | none                                  |
| resend.com      | `.ico`, Apple set                                                        | none; `color-scheme: dark`                             | no       | `#000000`                             |
| supabase.com    | `.ico`, PNG 16 to 48, precomposed Apple set                              | none                                                   | no       | none                                  |
| planetscale.com | `.ico`, PNG 32, Apple                                                    | none                                                   | yes      | `#111111`                             |
| railway.com     | `.ico`, PNG 16 to 96, Apple 180                                          | none                                                   | yes      | `#13111C`                             |
| pitch.com       | PNG pair, Apple                                                          | `media` attribute per `<link>`                         | no       | none                                  |
| turboslide      | `data:,`                                                                 | none                                                   | no       | none                                  |

Two facts follow. First, none of the SVG favicons downloaded carries a `prefers-color-scheme` block inside the file; the sites that adapt do it with a `media` attribute on separate `<link>` tags (Zed, Cursor, Framer, Pitch) or with a mark that reads on both strips (Linear, Figma). Second, only Vercel and Cursor pair `theme-color` with the scheme. The 2026 favicon guide recommends `favicon.ico` at 32, `icon.svg` with an embedded dark mode block, `apple-touch-icon.png` at 180, `icon-192.png`, `icon-512.png` (maskable, 409 px safe zone) and `manifest.webmanifest` (FV1); Chrome honours a media query inside an SVG favicon and Safari renders SVG favicons in one colour it is told, "so there is no opportunity there for a dark mode situation" (FV2). Section 6.4 combines the two techniques.

## 3. The dithered and pixel aesthetic

### 3.1 Where the current wave comes from

- Return of the Obra Dinn (released 2018-10-18) renders 3D space in 1-bit, inspired by "1-bit graphics used in many early Macintosh games"; at full resolution the dither caused motion sickness and Lucas Pope rewrote the rendering "to create the equivalent of motion blur for this dithering approach" (D1). Surma's Ditherpunk article (2021-01-04 per the search listing, D2) records that the game uses blue noise for the environment and Bayer for people and objects so the two read apart, and that Pope's work went into keeping the dither stable under camera movement.
- Playdate has a "very special black and white screen" at 400 by 240, 1-bit, "not backlit, but super reflective", a crank, and a body designed with Teenage Engineering (D3). Teenage engineering's own site sets a lowercase wordmark on a monochrome ground with product colours as the only accents and calls itself a studio for "superior, functional design" (D4).
- Nothing's Phone (3) (launched 2025-07-01) replaced its light strips with the Glyph Matrix, "a dense field of programmable micro-LEDs" in Adam Bates's words, on a software skin "that leans into a retro-futuristic Dot Matrix style" (D5); the 489 LED count is a search listing (D6).
- Vercel's Geist Pixel (2026-02-06) brings the pixel grid into a corporate type system with the claim that "Geist Pixel is meant to ship" in "real UI contexts" (V4).
- Paper's Dithering shader offers seven pattern sources (simplex, warp, dots, wave, ripple, swirl, sphere), four dither types (random and Bayer 2 by 2, 4 by 4, 8 by 8), two colours and a pixel size from 1 to 20 (D7); Turboslide binds it as `paper:dithering` (`catalog.ts` line 352).
- Codrops' guide to Bayer dithered WebGL backgrounds (2025-07-30) measures the effect at "under 0.2 ms even at 4K" in "~3 KB", finds that "beyond 8×8, the perceptual gain becomes minimal", and names a JetBrains Junie campaign as a contemporary use (D8); the Junie page read on 2026-09-13 shows product screenshots and no dither, so that campaign is recorded as unverified (D11).
- Trend summaries for 2026 and 2027 list dithering beside ASCII, pixel grids, scanlines and printer marks as "imitations of old technologies" and warn that "one effect on its own is no longer enough to surprise anyone" (D9, search listing); others describe "dithered color gradients that hark back to 80s/90s PCs" and pixel fonts paired with contemporary layouts (D10, search listings).
- The Prototemplate house rule (`DESIGN.md` section 7): density ramps render as ordered dither instead of alpha veils; the 4 by 4 matrix and the 8 by 8 permutation of 0 to 63 ("65 tonally linear levels") are the house screens; coverage tiers nest by construction so adjacent regions compose exact ramps; cells are square screen pixels drawn with `crispEdges` and upscaled with `image-rendering: pixelated`.

### 3.2 Principles

1. A dither is a tone instrument. It carries a picture's or a field's density in two colours; it is chosen because the deck's pictures are two-tone twins and the theme is one ink on one paper, and it is the treatment of a continuous source, never a texture pasted over a flat surface.
2. The screen is Bayer 8 by 8 with the deck's permutation, cells of 2 sheet pixels, thresholds `(m + 0.5) / 64`. Codrops' finding that 8 by 8 is the perceptual ceiling agrees with the house rule; blue noise and error diffusion (Floyd Steinberg, Atkinson) are excluded from the identity because their organic grain fights the 1 px line law and because the pipeline's parity across three implementations is proven for the ordered screen only (`docs/native.md`).
3. Cells are integers. Every dithered asset is produced at its 1x cell grid and scaled by nearest neighbour (`twoToneAtScale`); CSS scales with `image-rendering: pixelated`; nothing bilinear touches a dither, and a 2x export gets 4 by 4 device pixel cells.
4. Twins, always. Every dithered identity asset exists as a dark twin and a light twin, the light twin the inverse of the dark, and the surface chooses by the stored theme, as the deck's openers do.
5. Cells do not shimmer. Motion moves the tone field under a fixed threshold map (the material's animation, a progress value, a hover state); the threshold map itself is never animated or re-seeded per frame. Under `prefers-reduced-motion` the still twin is the whole animation (`DESIGN.md` section 9).
6. Dithers respect the plate. A dither under text or a plate is measured with `plateClear` and its 30 px band, and the identity's use of a dither behind a heading (the /home hero) runs the same measurement the openers run.
7. A dither is a picture's place. It appears where a photograph, a shader frame or an illustration would appear: heroes, empty state figures, avatars, loading textures, the 404. It does not appear where the line law governs.

### 3.3 Anti patterns

- Dither over or inside text, on icons, or in a control's ground: a 2 px cell at a 13 px glyph destroys the letter and the 16 px Heroicon.
- Dither as a substitute for the AI gradient (a coloured noise wash behind a heading). Kevin's avoid list rules out the gradient; a coloured dither of it is the same surface.
- Colour dithers in chrome: the pipeline is two colours by construction; three tone or original colour dithers (research-3/06's vocabulary) are object level features of a slide, never identity assets.
- Random or per frame dithers: shimmer is the effect Obra Dinn's engine was rewritten to remove.
- A dithered favicon at 16 px: eight cells across cannot carry a form; the 16 px mark is solid (section 6.3).
- The retro register: pixel typefaces, scanlines, CRT curvature, printer artefacts. Turboslide's cells come from its own export pipeline; the deck's two-tone pictures are the argument, and a pixel typeface would say the opposite of Inter's optical sizes.
- Dither as decoration on the sheet's frame, rails, wordmark or counter: those are theme level (gslides-parity SPEC-2 1.6) and belong to the deck theme.

## 4. What an agent supporting identity signals

### 4.1 The signals in the field

- A machine readable twin of every human page. Stripe's agent page opens with "Read this page in your terminal" through `stripe docs`, serves Markdown for any docs URL with a `.md` suffix, publishes a skills index at `/.well-known/skills/index.json`, an MCP server at `mcp.stripe.com` and an `agent setup` command (AG4). Vercel's and Next.js's documentation pages embed "For AI agents" link sections, `.graph.md` cross link maps and `llms.txt` indexes (V6, V11).
- Published contracts. `llms.txt` (Jeremy Howard, first published 2024-09-03, version 2 on 2026-08-10) is an H1, a blockquote summary and H2 sections of Markdown links, because "every wasted token costs time and money" (AG1). `AGENTS.md` is "a simple, open format for guiding coding agents", used by over 60,000 projects and stewarded by the Agentic AI Foundation under the Linux Foundation (AG2). MCP is "an open-source standard for connecting AI applications to external systems" with tools, resources and prompts (AG3).
- Descriptions as routing. "The description is the signal the agent uses to route"; errors carry `documentation_url`, `is_retriable` and retry metadata; auth is non interactive; rate limit state travels in headers; skills, MCP servers and CLIs layer (AG5, 2026-02-23).
- Monochrome first in the terminal. "design monochrome-first. Color is a bonus but will not always work"; "One of your users isn't human"; output must be self sufficient in a static printout, and reliability outranks polish (AG6, 2026-08-31).
- The register of the products that sell to developers and agents in this set is infrastructure: Turborepo "the build system for coding agents" (V10), tldraw "The infinite canvas SDK" (T1), Warp "The Open Platform for Automating Development" (W3). The products that sell an assistant use the opposite register (Raycast's "Meet your new virtual assistant", R1; Pitch's "Pitch Agent", PI1).

### 4.2 What Turboslide already has

`packages/agent/generated/llms.txt` opens with the H1 "Turboslide", a blockquote ("A block document with a validator and a grammar linter; every operation is a named action in one table"), a Discovery section (`/api/agent`, `/openapi.json`, `/mcp`, `/llms-full.txt`, the four skills, `docs/grammar.md`) and a Rules section (`baseRevision`, normalised results, `unknown_field` with a JSON pointer, leases, "A claim about a deck names the revision"). `AGENTS.md` at the repository root is the format AG2 describes. Every mutating action returns one error body with name, status, code, pointer, current revision and lease holder (AGENTS.md, The agent surface). Extensions > Agent access shows the MCP address, the API address and the push and pull commands with Copy buttons (README). The default view words test fails on any engineering word in a label, tooltip or finding, so the human surface stays in sales English while the machine surface stays exact.

### 4.3 Principles for the identity

1. Show the contract, in monospace, as an instrument. The /home page and Extensions > Agent access print `turboslide deck push <id> --to https://turboslide.vercel.app`, the `/mcp?deck=<id>` address, `/llms.txt` and `/openapi.json` in `--pt-mono` at 13 px inside hairline boxes (`DESIGN.md` section 4: "Hairline-boxed code blocks"). Body copy around them stays in Inter.
2. Numbers are tabular. Revisions, slide counts, percentages and durations set `font-variant-numeric: tabular-nums` as the counter does (`sheet.css` `.ts-sheet .counter`).
3. The terminal is a first class surface of the brand. The CLI banner is the mark rendered as block characters from its own bitmap (a 1-bit form converts to `▀`, `▄` and `█` without a second drawing), the wordmark in plain text, and one line naming the deck and the revision; no colour is required for it to read (AG6).
4. The human page and the machine page say the same thing. A statement on /home about export fidelity names the same number as `export-report.json` (`perfect`, the worst decoded mismatch); a statement about actions names the count the generated manifest carries.
5. No assistant iconography. No sparkles, robots, chat bubbles as the primary surface, or "AI" as a label; the agent is a caller of the same actions a person clicks (SPEC 1, "A designer's click and an agent's call take the same path").

### 4.4 Anti patterns

- Monospace as the voice of the page (PlanetScale's homepage is the reference for the effect and Kevin's directive rules it out).
- "Agentic" or "AI native" as adjectives without a contract the reader can fetch.
- A chat box as the hero. Turboslide's hero is the editor and the deck.
- Fake terminals: a styled block that shows a command the product does not accept. Every command printed on /home is one the CLI parses, because the CLI parsers are generated from the action table.
- Gradient glows and glass around the agent surface (Kevin's avoid list).

## 5. The honest turbo-fast story

The claims below are the sentences the /home page and the README may carry, each tied to the file that makes it true and the measurement that bounds it. A claim without a number is a description, and it is marked so.

| Claim the identity may state                                                                                                                        | What the code does                                                                                                                                                                                                                         | Evidence                                                                                                                       | What must not be said                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One renderer draws every surface, so a render at a revision is the same pixels in the editor, the viewer, the CLI and the export.                   | `packages/render` builds the HTML and CSS as strings for the browser, the standalone build, the headless page and the exporters (SPEC 1, 5).                                                                                               | `compare-to-shoot.mjs` within 0.5 percent of the brand deck's own shots; canvas fidelity worst 0.262 percent over 342 pairs.    | "Instant" or "zero latency" rendering; the renders are measured for identity, not for time.                                                                                              |
| Every capability is one action, and the CLI, MCP tools, HTTP contract, window API, OpenAPI document, `llms.txt` and skills are generated from the table. | `packages/schema/src/actions.ts` (105 actions) and `pnpm generate:contracts`; `git diff --exit-code` on the generated files is check step 3.                                                                                                | 105 actions, 89 MCP tools, four skills (README).                                                                                | "Every action on every transport": `deck.pack`, `deck.unpack`, `deck.push` and `deck.pull` are CLI only; renders and exports run through the worker.                                    |
| The dither pipeline runs the same arithmetic in Rust on the server, in wasm in the browser and in TypeScript as the fallback, and they light the same cells. | `crates/turboslide-native` behind `@turboslide/native`; `select.ts` picks addon, wasm, TypeScript; `parity.test.ts`.                                                                                                                       | 0 disagreeing cells over 30 screens and over the 1,440,000 cell golden; screen 52 ms TypeScript, 20 ms addon, 23 ms wasm.        | "Built on Rust so it is fast": `docs/native.md` states "Rust buys no throughput for this work" and that the argument is determinism. The browser preview worker still runs TypeScript until the wasm mount lands. |
| Perfect PPTX is pixel identical to the web render, page by page, and the file says so.                                                              | The 2x Chromium raster over invisible runs; the page raster policy decodes each page and diffs it against the shot before the file is written; `perfect` is the flag.                                                                     | 170 pages of the GT deck, worst decoded mismatch 0.003 percent, about 15.5 MiB per theme.                                       | "Lossless" for the Editable text mode, which is measured within 3 px horizontally and 1 px vertically on the gated blocks.                                                              |
| A long deck exports in batches with progress, from the hosted studio, with no worker to run.                                                        | Synchronous `POST /api/export` inside the function on `chrome-headless-shell`; batches over 60 slides; the merge.                                                                                                                          | The 85 slide GT deck in about four minutes from production, peak about 670 MiB against 3009 MB.                                 | A time under a minute for a long deck; the number is four minutes.                                                                                                                       |
| The studio runs on Vercel's Fluid compute, which serves several requests from one warm instance.                                                     | Nitro's Vercel preset; `maxDuration: 800` and `memory: 3009` on the heavy routes; one Chromium job at a time per instance.                                                                                                                 | `docs/hosting.md` section 6 and line 558; Vercel's documentation on in function concurrency and the 800 s Pro maximum (V6).      | That Fluid makes exports concurrent on one instance; the repository serialises Chromium per instance.                                                                                    |
| Pages load their code and data on hover, before the click.                                                                                          | `defaultPreload: 'intent'` in `apps/studio/src/router.tsx`; TanStack preloads route dependencies after 50 ms of hover, at once on touch (PF1).                                                                                              | The router configuration; `defaultPreloadStaleTime: 0` means every preload refetches.                                             | "Instant navigation" as a measured claim until the performance reader measures it; the claim is the mechanism.                                                                           |
| The document is small and static: JSON per slide, 1-bit PNG twins, one CSS file per theme.                                                          | `deck.json` plus `slides/*.json` plus 1-bit twins (`png1.ts`, 12 ms for 3200 by 1800 on this machine per the module header).                                                                                                                | The GT deck's twins total about 30 MB in the function's seed (`docs/hosting.md` section 2).                                       | A size for a deck the user has not made.                                                                                                                                                 |

Two precedents fix the register. Vercel's November 2022 claim that Turbopack was "10x faster than Vite" was measured by Vite's author, who found the gap under 2x once both sides used SWC and client components, and who called the methodology "flawed" for measuring module evaluation instead of what the user perceives; Vercel published a clarification and benchmark code (V12). Warp's 2021 claim gives the language, the mechanism and one measured number ("the average time to redraw the screen in Warp was only 1.9 ms", W2), and Zed's homepage names the mechanism ("Written from scratch in Rust to efficiently leverage multiple CPU cores and your GPU", Z2). Turboslide follows the second form: language, mechanism, number, file.

The name carries one more obligation. "Turbo" is the name of Vercel's Turborepo and Turbopack (V10, V11), and Vercel's guidelines forbid marks "in your business name or confusingly similar designs" (V1). Turboslide is a different word and a different product, and the mark, the colours and the typographic treatment must make that plain: no gradient, no chevron pair, no "Turbo" set apart from "slide". "Turboslide" and "Turbo Slide" are also used by a harmonica line, a commercial door and playground slides (NM1, NM2, NM3, search listings); none is a software product, and the identity should not borrow a sliding or speed glyph that could recall them.

## 6. What the Turboslide identity must do

This section is the brief for the design-4 reader. Requirements are numbered; each names its test.

### 6.1 The name

1. The product is written "Turboslide": one word, initial capital, the rest lowercase, in every human surface, the README and the npm page. "TurboSlide", "Turbo Slide", "turboslide" in prose and "TS" as an abbreviation are wrong. Test: a grep over `apps/studio`, `packages/chrome/src/menus/strings.ts`, `README.md`, `docs/` and `skills/` finds only the canonical spelling in prose and the lowercase `turboslide` only as the command, the package scope and URLs.
2. The command is `turboslide` and the package scope is `@turboslide/*`, as today.
3. "Google Slides" is an adjective in Turboslide's copy ("the Google Slides shell", "Google Slides' behaviours") and never a noun for Turboslide itself (GO1). Test: the existing default view words test gains the strings "Slides clone" and "Google Slides alternative" as failures.
4. `PROPER_NOUNS` in `packages/theme/src/copy.ts` gains "Turboslide" so the sentence case lint keeps its capital in a heading.

### 6.2 The letterforms and the wordmark

5. The wordmark is the word set in Inter, weight 500, with `font-feature-settings: 'cv11', 'ss01'` and `letter-spacing: -0.025em` at 28 px and above, `-0.01em` from 16 to 27 px (the app bar's setting today), and `0` under 16 px. It is never drawn as outlines in the code base; it is live text, so it survives translation of the page around it and renders in the theme's ink. Test: the wordmark on /home, /decks and the README screenshot is selectable text.
6. The word has one capital and three ascenders (T, b, l, d), no descender, and eight x-height letters. The T is the only glyph whose width and crossbar can be adjusted without breaking the face, and the mark should be derived from it or from the slide rectangle (6.3) so the lockup shares one geometry. The wordmark takes no ligature, no alternate and no manual kerning beyond Inter's own.
7. Weight is capped at 500 everywhere the wordmark appears, including social images and the README. Test: no `font-weight` above 500 in any stylesheet that names the wordmark class; `type/weight-cap` stays the sheet's lint.
8. The lockups are two: horizontal (mark, a gap equal to the mark's stem width, the wordmark, baselines aligned so the mark's crossbar meets the T's crossbar) and stacked (mark above the wordmark, centred) for the README hero and the 512 px icon. The clear space around a lockup is the mark's height (V1's rule applied to Turboslide's own mark). No vertical rule sits between the mark and the wordmark.

### 6.3 The mark

Constraints, each a test:

9. One colour. The mark is drawn in `currentColor` and reads on paper and on ink with no outline and no second colour. Test: the mark rendered through the two-tone pipeline (`asset dither`) at 800 by 450 is identical to its vector at every cell, which is only possible for a form made of ink and paper.
10. Square bounding box, 1:1, drawn on an 8 by 8 grid so it renders at 16, 32, 64, 180 and 512 px with cell edges on device pixels. Test: at 16 px in a light and a dark tab strip, the form is identifiable beside Vercel's, Linear's and Cursor's icons in one screenshot.
11. Solid at 16 px, cellular from 32 px. At 32 px and above the mark may show its Bayer construction (a ramp along one stroke in nested tiers); at 16 px it is the solid form. Test: the 16 px PNG contains only two colours and no isolated cell.
12. No confusion. The mark must not read as a triangle (V1), a cube (C1), a Z (Z1), a yellow rectangle with a white rectangle (Google Slides' product icon, GO1), Turborepo's gradient roundel (V10), a chevron pair or a speed line. Test: a side by side sheet at 32 px with those marks drawn as grey boxes of their silhouettes, reviewed by the judge loop's visual consistency lens.
13. Translation survival. The mark reads as a form (a slide and a stem) before it reads as a Latin letter, so a page in Japanese or Arabic carries it without a Latin word beside it. Test: the stacked lockup with the wordmark replaced by a CJK string still shows a mark that stands alone.
14. No 2.5D, no gradient, no shadow, no rounded corner beyond the cell grid. The corner notch of the Prototemplate cards ("the ground showing through", `DESIGN.md` Corners) is allowed as construction.

Candidates to draw:

- Candidate A, the slide T. A 16:9 rectangle stands for the slide; its top edge is the crossbar of a T and the stem drops from the crossbar's centre to the rectangle's bottom edge, dividing the slide into two equal panels. The form is a slide and a letter at once, has no diagonal, and is constructible at 16 px (a 16 by 9 outline at 1 px with a 2 px stem) and at 32 px (a 32 by 18 frame at 2 px with a 4 px stem). At 64 px and above the two panels may carry the ramp of 6.3 item 11: the left panel lit, the right panel in nested tiers, which shows the dark and light twin in one mark. Risk: the 16:9 box inside a square icon leaves 7 of 16 rows empty; the design-4 reader tests a stacked variant (the box at the top, the stem running below it to the square's bottom edge).
- Candidate B, the cell T. The letter T set on the 8 by 8 grid: crossbar 8 cells by 2, stem 2 cells by 6, hand refined at each size as Geist Pixel's glyphs were (V4). The mark is a bitmap the effects package can generate and the CLI can print as block characters. Risk: it reads as a pixel font glyph, which is the retro register section 3.3 excludes; the mitigation is the ramp (the stem fades through the 8 by 8 tiers so the mark is a dither, not a sprite) and Inter's proportions for the crossbar's overhang.
- Rejected, the frame. The sheet's two rails, two rules and four registration crosses reduced to a mark. Rejected because that geometry is the `gt-ink-paper` theme's (`tokens.ts` `RAIL`, `CROSS`) and a second theme (SPEC open question 6) would leave the product mark carrying the first theme's frame.
- Rejected, a wordmark only identity (Linear's and Resend's preference). Rejected because Turboslide needs a 16 px tab icon, a 32 px title row mark and a terminal banner today, and the wordmark does not compress to those.

### 6.4 The favicon and the icon set

15. The set replaces `{ rel: 'icon', href: 'data:,' }` in `apps/studio/src/routes/__root.tsx`: `favicon.ico` (32 and 16), `icon.svg`, `apple-touch-icon.png` at 180, `icon-192.png`, `icon-512.png` (maskable, the form inside the 409 px safe zone), `manifest.webmanifest` with `name`, `short_name`, `icons`, `theme_color` and `background_color` (FV1). Test: `node scripts/hosted-smoke.mjs` gains a row that fetches each file and checks its content type and, for the PNGs, that they contain two colours.
16. Two techniques together. `icon.svg` carries the `@media (prefers-color-scheme: dark)` block for Chrome and Firefox, and the head also lists `icon-light.svg` and `icon-dark.svg` with `media` attributes as Zed, Cursor, Framer and Pitch do; `favicon.ico` is the version that reads on both strips (the ink mark on a paper tile with a 1 px hairline, or the mark in titanium), because Safari takes one colour (FV2). Test: screenshots of the tab in Chrome, Firefox and Safari with the OS in light and in dark.
17. The tab follows the OS; the page follows the stored theme. This is accepted; the page's `theme-color` follows the stored theme instead: the boot script that stamps `data-theme` also writes `<meta name="theme-color">` with `#ffffff` or `#070707` (the `--pt-paper` of the stamped theme), and the server renders the pair with `media` attributes as Vercel and Cursor do for the first paint (V13, C3).
18. The Open Graph image for `/deck/:id` and `/embed/:id` (the links a rep sends; both stay indexable per `__root.tsx`) is a 1200 by 630 two-tone render of the deck's first slide in the deck's appearance with the mark and the wordmark on a plate, produced by the render worker and cached per revision. Test: a fetch of `/deck/gt-brand` carries `og:image` and the image decodes to two colours plus the plate.
19. The terminal banner (`turboslide --version`, `turboslide info`) prints the mark as block characters from the same bitmap that produces `icon-192.png`, then the wordmark in plain text and the version. Test: the banner renders identically with `NO_COLOR` set.

### 6.5 The relation to the GT mark

20. Chrome carries Turboslide; the sheet carries the deck theme. The title row's link to `/decks`, the app bar on `/decks` and `/decks/trash`, the favicon, the README, the CLI banner, the /home page, the Not found page and the presenter window's title carry the Turboslide mark. The sheet's wordmark (`stage.ts` `WORDMARK`), the counter, the `mark` block, the closing plate's mark, the icon picker's `gt-mark` symbol, the GT templates' thumbnails and the Themes panel's GT cards keep the GT mark, because they are content of `gt-ink-paper` and travel into every export (SPEC 2.1; gslides-parity SPEC-2 1.6).
21. `GtMark.tsx` stays and gains a sibling `TurboslideMark.tsx` in `packages/chrome/src`; `TitleRow.tsx` line 273 and `decks.index.tsx` switch to it; `PORTED_FROM.json` records the new file as Turboslide's own. Test: the parity audit's title row row names the new mark's tooltip ("Turboslide", "Your presentations.").
22. The blank template's sheet keeps the GT wordmark today because there is one theme (`THEME_ID = 'gt-ink-paper'`). Whether a second, Turboslide branded theme should exist, and what a blank presentation's sheet should show in its corner, is Kevin's decision (SPEC open question 6); this report recommends against a Turboslide wordmark on any sheet, because the sheet is the customer's deck and the identity belongs to the tool around it.
23. The sprite is unchanged. The Turboslide mark is not added to `sprite.svg`, because Insert > Icon offers the sprite's symbols as slide content and the tool's mark is not slide content.

### 6.6 The Prototemplate tokens it keeps

24. Every `--pt-` token keeps its name and value; `PORTED_FROM.json` and `turboslide lint --chrome` stay valid. The identity adds tokens only in `apps/studio/src/styles.css` for the /home page's type ladder (scaled from `LADDER`: h1 at 56 px, h2 at 32 px, lead at 20 px, body at 15 px, all within the 500 cap) and for the head (the `theme-color` pair).
25. No colour joins the chrome. The four semantic hues stay inside the sheet on icons (SPEC 2.2); GT blue appears in the identity only through the `brand-blue` material preset inside a captured frame on a slide, never on /home's chrome. Test: `lint --chrome` gains the rule that no computed border or background colour in chrome resolves outside the `--pt-` set.
26. The line law is the identity. The /home page draws its seams by the same three roles (structural, row, frame) and passes `turboslide lint --chrome` at 1440, 1280 and 390 in both themes.
27. `--pt-radius: 6px` stays the one corner and is used only where it is used today; the mark, the cards and the plates are square.
28. Inter at 13 px stays the chrome size; /home is the one page allowed the ladder of item 24, and it uses no second face and no monospace outside the command blocks.

### 6.7 Where dithers and shaders belong

| Surface                                          | Dither                                                                                  | Shader                                                                                    | Rule                                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The mark at 32 px and above                      | Yes, as nested tiers along one stroke                                                    | No                                                                                        | Solid at 16 px; two colours; no shimmer                                                                                    |
| /home hero                                       | Yes: a captured material frame or a photograph through the two-tone pipeline, twins      | Yes, live on the main thread after the captured twin has painted; still under reduced motion | `plateClear` against the heading's box; the live mount is the same `ShaderMount` the stage uses; `brand-blue` preset allowed inside the frame only |
| Empty states (no presentations, empty trash, no search results) | Yes, a small two-tone figure at 320 by 180 in a `--pt-edge` frame                        | No                                                                                        | Geist's structure: title, one sentence, at most one primary action (V9), in sentence case per the copy rules              |
| Loading and progress                             | Yes, the deck's dither ramp as the progress texture, tiers filling in order              | No                                                                                        | The threshold map is fixed; the value moves; the progress track stays a 1 px `--pt-hair-soft` line                          |
| Anonymous avatars and presence chips             | Yes, an ink square of Bayer tiers keyed by a hash of the author id                       | No                                                                                        | Two colours; 24 px; no faces; the human surface names the author in words beside it (research-3/03)                        |
| Not found, the trash's empty page, the presenter's blank | Yes, a two-tone plate figure                                                             | No                                                                                        | Same as empty states                                                                                                       |
| Present mode surround                            | No                                                                                      | No                                                                                        | `--pt-panel-ink` flat (gslides-parity build deviation B6)                                                                  |
| Menus, toolbar, panels, dialogs, snackbars, tooltips | No                                                                                      | No                                                                                        | The line law and 13 px text                                                                                                |
| The canvas workspace around the sheet            | No                                                                                      | No                                                                                        | Flat `--pt-plate`; a texture there competes with the sheet                                                                 |
| Filmstrip thumbnails, layout grid tiles          | No (they are renders of the slides)                                                     | No                                                                                        | A thumbnail shows the slide's own pixels                                                                                   |
| Text of any kind, icons, form controls           | No                                                                                      | No                                                                                        | Legibility; Heroicons stay solid                                                                                           |
| The sheet                                        | Only as content the user placed (`dither` blocks, two-tone pictures, `picture.dither`)  | Only as content (`material` blocks)                                                       | Identity never draws on the customer's slide; the theme's frame and wordmark stay flat                                     |
| README and social images                         | Yes, the hero twin in the README's theme; the OG image of 6.4 item 18                   | Captured only                                                                             | A static PNG under 16 MB, two colours plus the plate                                                                       |

### 6.8 Motion

29. The six durations are the whole motion vocabulary, and every transition moves transform or opacity (tokens.css, directive 7.4). Route changes in the studio show no page transition of their own; the shell's regions persist and the changed region enters over `--pt-dur-enter`. No splash screen, no logo animation on load, no hero that blocks paint. Test: the first paint of /home and /decks contains the wordmark and the first sentence with no animation attached; Lighthouse's largest contentful paint element is text or the captured twin.
30. Prefetch is the transition. Links to `/edit`, `/deck`, `/decks` and `/home` keep `preload: 'intent'`; the performance reader decides `defaultPreloadStaleTime` and viewport preloading for the cards.
31. Under `prefers-reduced-motion` the six durations are 0 ms already; the hero's shader shows its captured twin and the progress texture its final tier.

### 6.9 Light and dark

32. Both themes are first class. Every identity asset exists in both (twins for pictures, `currentColor` for the mark, the `theme-color` pair for the head); dark is the stored default and is a token remap, never a redesign (tokens.css). Test: the round's Playwright drive shoots /home at 1440, 1280 and 390 in both themes and the judge loop's visual consistency lens reads the pairs.
33. The tab icon adapts to the OS scheme while the page keeps its stored theme (6.4 item 17); the README's images use the dark twins because GitHub's default is light and the contrast of an ink hero on GitHub's white ground is the one that reads in a repository list.

### 6.10 What the identity requires of the /home page

Report 05 of this round (`research-4/05-home-page-content.md`) owns the page's content. At the identity level the page must: open with the wordmark and one declarative sentence of what Turboslide is; state the speed claims of section 5 with their numbers and no others; show the agent surface as commands and addresses in monospace inside hairline boxes; carry the captured hero twin with the live shader behind it; use the type ladder of 6.6 item 24 and nothing else; obey the copy lints (sentence case, headings without periods, no eyebrows, no em dashes, complete sentences, no metaphors from `METAPHOR_WORDS`); pass `lint --chrome`; keep `/decks` as the files page and `/home` as the product page, with `/` still redirecting to `/new`; and stay indexable (the `NOINDEX_ROUTES` set in `__root.tsx` names `/new`, `/decks/trash` and `/print/$deckId` and must not gain `/home`).

## 7. Anti patterns, collected

1. A gradient mark, a 2.5D mark, a mark with a second colour.
2. Anything that reads as Vercel's triangle, Cursor's cube, Zed's Z, Turborepo's roundel or Google's yellow presentation icon.
3. "Turbo" set apart from "slide" typographically, or used alone.
4. "Built on Rust, so it is fast." The measured story is determinism plus 52 ms to 20 ms on one stage.
5. A speed adjective without a mechanism and a number (the Turbopack precedent, V12).
6. Monospace as the voice; pixel typefaces; scanlines; CRT effects; processed found artwork.
7. Dither on text, icons, controls, menus, the workspace, thumbnails or the sheet's frame.
8. Animated or re-seeded threshold maps (shimmer); random dithers; colour dithers in chrome.
9. Sparkle, robot or chat iconography for the agent surface; a chat box as the hero; commands the CLI does not parse.
10. A single PNG favicon; an SVG favicon whose only dark handling is a media query inside the file; no `theme-color`.
11. Eyebrow labels, em dashes, exclamation marks, "X, not Y" constructions, headings with trailing periods, headings that are claims.
12. Illustrations with faces or hands; mascots.
13. A Turboslide wordmark on the customer's sheet.
14. Rounded corners on the mark, cards or plates beyond the shell's one 6 px corner.
15. A splash screen, a logo animation on load, a page transition library, smooth scrolling.

## 8. Acceptance for the identity

The design-4 reader's proposal is accepted when, on a preview deploy of its tree:

1. `node scripts/hosted-smoke.mjs <url>` passes with the new icon set row (6.4 item 15).
2. `turboslide lint --chrome` passes at 1440, 1280 and 390 in both themes with `/home` added to its page list.
3. `node scripts/tooltip-audit.mjs --base <origin>` exits 0 with the new mark's tooltip present.
4. The default view words test and the copy lints pass on every string of /home and the new strings in `menus/strings.ts`.
5. The mark's 16 px PNGs contain exactly two colours; the 32 px and 192 px PNGs dither through `asset dither` to themselves at every cell.
6. The favicon reads in Chrome, Firefox and Safari on light and dark tab strips (six screenshots in `docs/gslides-parity/verification-4/`).
7. `/deck/gt-brand` serves an `og:image` that decodes to two colours plus the plate.
8. The README's hero, the npm page's text and the CLI banner carry the same mark and wordmark, and the banner renders with `NO_COLOR`.
9. No `--pt-` token changed name or value (`git diff` on `packages/chrome/src/tokens.css` is empty apart from additions).
10. Every sentence on /home that states a number names the file or report the number comes from, and none states a number section 5 does not carry.

## 9. Sources

Every URL was read on 2026-09-13. "Head" means the homepage HTML fetched with curl and a Chrome 147 user agent on that date.

Vercel

- V1 https://vercel.com/geist/brands, Vercel brand assets and guidelines.
- V2 https://vercel.com/geist/introduction, Geist design system introduction.
- V3 https://vercel.com/font, Geist font page.
- V4 https://vercel.com/blog/introducing-geist-pixel, "Introducing Geist Pixel", 2026-02-06.
- V5 https://vercel.com/geist/colors, Geist colours.
- V6 https://vercel.com/docs/fluid-compute, Fluid compute documentation (last updated 2026-08-24).
- V7 https://vercel.com/blog/designing-and-building-the-vercel-ship-conference-platform, 2025-06-11.
- V8 https://basement.studio/post/shipping-ship-behind-the-particle-shader-effect-for-vercels-conf, 2024-04-29.
- V9 https://vercel.com/geist/empty-state, Geist empty state guidance.
- V10 https://turborepo.dev/, Turborepo (redirect target of turbo.build).
- V11 https://nextjs.org/docs/app/api-reference/turbopack, Turbopack reference (version 16.3.5, last updated 2026-08-03).
- V12 https://github.com/yyx990803/vite-vs-next-turbo-hmr/discussions/8, Evan You on the Turbopack claim, November 2022.
- V13 https://vercel.com head.
- V15 https://vercel.com/changelog/fluid-compute-is-now-the-default-for-new-projects, search listing.

Linear

- L1 https://linear.app/brand, brand guidelines.
- L2 https://linear.app/blog/how-we-redesigned-the-linear-ui, 2024-03-28.
- L3 https://linear.app head.
- L4 https://linear.app/static/favicon.svg?v=2, the SVG favicon.
- L5 Third party colour listings from the search results (brandfetch.com/linear.app, loftlyy.com/en/linear), search listing.

Raycast

- R1 https://www.raycast.com/, homepage.
- R2 https://www.raycast.com head.
- R3 https://logotyp.us/logo/raycast/ and https://www.loftlyy.com/en/raycast, search listings.
- R4 https://www.raycast.com/templates/brand-guidelines, an extension template, not the guidelines.

Warp

- W1 https://www.warp.dev/blog/world-of-warp, 2024-10-17.
- W2 https://www.warp.dev/blog/how-warp-works, 2021-07-12.
- W3 https://www.warp.dev/, homepage.
- W4 https://www.warp.dev head.

Zed

- Z1 https://zed.dev/brand, brand page.
- Z2 https://zed.dev/, homepage.
- Z3 https://zed.dev head.

Cursor

- C1 https://cursor.com/brand, brand page.
- C2 https://designcompass.org/en/2025/11/27/typographically-focused-branding-of-ai-tool-cursors/, 2025-11-27.
- C3 https://cursor.com head, https://cursor.com/marketing-static/favicon-light.svg and favicon.svg.
- C4 https://the-brandidentity.com/project/how-kimera-built-cursors-identity-around-a-custom-typeface-system, 403, search listing.

Arc

- A1 https://arc.net/, homepage.
- A2 https://www.loftlyy.com/en/arc-browser, search listing.
- A3 Search listing on the Dia transition and the Atlassian acquisition (medium.com/design-bootcamp article and others), unverified.

Framer, tldraw, Figma, Notion, Resend, Supabase, PlanetScale, Railway, Pitch

- F1 https://www.framer.com/brand/, brand page. F2 https://www.framer.com head.
- T1 https://tldraw.dev/, homepage. T2 https://tldraw.dev head.
- G1 https://www.figma.com/using-the-figma-brand/, brand usage. G2 https://www.figma.com/blog/figma-on-figma-evolving-our-visual-language/, 2024-09-16. G3 https://www.figma.com/blog/bringing-new-life-to-figmas-brand/, 2019-10-15. G4 https://www.figma.com head and https://static.figma.com/app/icon/2/favicon.svg.
- N1 https://www.notion.com head. N2 https://www.notion.com/brand (redirect to app.notion.com/brand, 401) and https://www.notion.com/press (redirect to app.notion.com/press, 404).
- RS1 https://resend.com/brand, brand page. RS2 https://resend.com head.
- SB1 https://supabase.com/brand-assets, brand assets. SB2 https://supabase.com head.
- P1 https://planetscale.com/brand, brand assets. P2 https://www.edgarlr.com/posts/building-planetscale-homepage, March 2024. P3 https://www.shadcn.io/design/planetscale, third party analysis, search listing. P4 https://planetscale.com head.
- RW1 https://docs.railway.com/, documentation. RW2 https://railway.com head. RW3 https://www.loftlyy.com/en/railway and brandfetch.com/railway.com, search listings. RW4 https://railway.com/brand, 403.
- PI1 https://pitch.com/, homepage. PI2 https://pitch.com head. Gamma (https://gamma.app/) answered 403.

Dither and pixel aesthetics

- D1 https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn.
- D2 https://surma.dev/things/ditherpunk/, "Ditherpunk", read once on 2026-09-13; a second fetch answered 403; the 2021-01-04 date is a search listing.
- D3 https://play.date/.
- D4 https://teenage.engineering/.
- D5 https://design-milk.com/the-nothing-phone-3s-glyph-matrix-turns-notifications-into-pixel-art/.
- D6 https://www.androidauthority.com/nothing-os-3-hands-on-3488739/ and https://mypitshop.com/nothing-phone-3-glyph-matrix/, search listings (the 489 LED count).
- D7 https://shaders.paper.design/dithering.
- D8 https://tympanus.net/codrops/2025/07/30/interactive-webgl-backgrounds-a-quick-guide-to-bayer-dithering/, 2025-07-30.
- D9 https://icons8.com/blog/articles/design-trends-for-2027/, 403, search listing.
- D10 https://www.wix.com/blog/web-design-trends and https://tilda.education/en/web-design-trends-2026, search listings.
- D11 https://junie.jetbrains.com/, the current Junie page.
- D12 https://forums.tigsource.com/index.php?topic=40832.msg1363742, Lucas Pope's devlog, 403.

Agent surface

- AG1 https://llmstxt.org/.
- AG2 https://agents.md/.
- AG3 https://modelcontextprotocol.io/.
- AG4 https://docs.stripe.com/agents.
- AG5 https://www.apideck.com/blog/api-design-principles-agentic-era, 2026-02-23 (updated 2026-06-18).
- AG6 https://www.comet.com/site/blog/agent-first-terminal-ux/, 2026-08-31.

Favicons, type, trademarks, prefetch, name

- FV1 https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs, dated 2026-01-21 on the page.
- FV2 https://blog.tomayac.com/2019/09/21/prefers-color-scheme-in-svg-favicons-for-dark-mode-icons/.
- TY1 https://rsms.me/inter/.
- GO1 https://partnermarketinghub.withgoogle.com/brands/google/trademarks-and-terms/trademark-guidelines-for-proper-usage/ (redirect target of about.google/brand-resource-center/rules/).
- PF1 https://tanstack.com/router/v1/docs/framework/react/guide/preloading.
- NM1 https://turboharp.com/collections/the-turboslide-series, NM2 https://www.rytecdoors.com/wp-content/uploads/2023/07/Rytec_Turbo-Slide.pdf, NM3 https://superiorplay.com/product/accessories/playground-accessories/slides/turbo-slide/, search listings.

Repository files read

`AGENTS.md`; `README.md`; `docs/spec/SPEC.md` sections 1 to 3; `docs/gslides-parity/SPEC.md` section 1; `docs/gslides-parity/SPEC-2.md` section 1; `docs/hosting.md` sections 6 and 7; `docs/hosting-chromium.md` line 187; `docs/native.md`; `docs/gslides-parity/research-3/06-backgrounds-and-dithers.md` (headings and section 0); `packages/theme/src/tokens.ts`, `theme.ts`, `copy.ts`, `gt-ink-paper/sheet.css`, `assets/sprite-ids.json`, `assets/sprite.svg`; `packages/chrome/src/tokens.css`, `GtMark.tsx`, `TitleRow.tsx`, `IconPicker.tsx`, `menus/strings.ts`; `packages/effects/src/bayer.ts`, `two-tone.ts`, `backend.ts`; `packages/materials/src/catalog.ts`, `presets.ts`, `paper.ts`, `proto.ts`, `NOTICE`; `crates/turboslide-native/Cargo.toml`, `src/lib.rs`, `src/bayer.rs`, `src/bind_napi.rs`, `src/bind_wasm.rs`, `build.rs`; `packages/render/src/stage.ts`; `packages/viewer/src/theme.ts`; `packages/agent/generated/llms.txt`; `apps/studio/vite.deploy.config.ts`, `vercel.json`, `src/routes/__root.tsx`, `src/router.tsx`, `src/routes/decks.index.tsx`, `src/routes/decks.css`, `src/styles.css`; `/Users/kevinliu/repos/Prototemplate/DESIGN.md` sections 1, 2 (line law for chrome, corners), 4, 7 and 9; the production HTML of `https://turboslide.vercel.app/new`.

## 10. Unverified and open

- Linear's indigo `#5E6AD2`, Raycast's `#FF6363` and Inter, Arc's `#3139FB` and `#FF5060`, Railway's `#6C3FE7`, Supabase's green and Nothing's 489 micro-LEDs are third party or search listing values; none was read on a page the product owns.
- Notion's brand rules could not be read (401 and 404 behind redirects); the black N mark and the line illustrations are product knowledge.
- Cursor's brand ZIP (colours, typography rules) was not downloaded; the typeface facts come from a third party article (C2), and the-brandidentity case study answered 403.
- Surma's Ditherpunk publication date (2021-01-04) is a search listing; the article was read once and a second fetch answered 403.
- Lucas Pope's own devlog (D12) answered 403; the stabilisation facts come from Wikipedia (D1) and Surma (D2).
- The JetBrains Junie dither campaign named by Codrops (D8) is not visible on the Junie page read (D11).
- The icons8 and Wix and Tilda trend pages are search listings.
- Gamma and railway.com/brand answered 403; Turborepo's visual mark was not described by the page fetched (V10), so the roundel and gradient are product knowledge.
- Whether Safari honours a `media` attribute on `<link rel="icon">` was not tested; FV2 covers the SVG case only. Section 6.4 item 16 asks for the three browser screenshots.
- Arc's acquisition by Atlassian and the May 2025 sunset announcement are search listings.
- The exact production commit behind `https://turboslide.vercel.app` was not read; the head facts (title, `data:,` icon, no manifest) were read from the served HTML and agree with `__root.tsx` on `main`.
- Open for Kevin: a second, Turboslide branded sheet theme (SPEC open question 6) and what a blank presentation's sheet corner shows (6.5 item 22); whether the 2 px cell at 32 px (four cells across a 8 cell mark) reads well enough for candidate B, which only a drawn test settles; whether `/home` replaces the marketing role of the README or duplicates it.
