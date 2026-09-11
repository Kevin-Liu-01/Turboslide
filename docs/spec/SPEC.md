# Turboslide specification

Written 2026-09-10 for Kevin Liu and General Translation. This is the specification that the three candidate designs, the judge verdicts and the three experiments converge on. The spine is design A, "the document first" (`design-document-first.md` in this directory), which the agent-nativeness judge picked; it takes the grafts that judge named from design B (`design-editor-first.md`) and design C (`design-export-first.md`), and the chrome and export corrections the look-and-export judge named. Where the three designs contradict each other the resolution is stated in place and marked "Resolution".

Evidence. Research reports 00 to 06 under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/slides-editor/research/` (cited below as "report NN section X") and the three experiment reports under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/turboslide/experiments/{tanstack,pptx,slides-and-render}/REPORT.md` (cited as "tanstack report", "pptx report", "slides report"). Repo facts come from `/Users/kevinliu/repos/Prototemplate` (the deck under `deck/`, the viewer shell under `src/components/viewer/`, `DESIGN.md`) and `/Users/kevinliu/repos/glyphfield`, both read only. "Measured" means measured in one of the experiments on this machine on 2026-09-10; every other external claim carries a URL.

Fixed inputs from Kevin: the product is Turboslide; it lives in the standalone repo `/Users/kevinliu/repos/Turboslide` (cloned from `https://github.com/Kevin-Liu-01/Turboslide.git`, `main` has no commits); it is TypeScript on TanStack Start; a systems-level path is reserved for heavy work, and of the languages he named Rust and Go are installed (cargo 1.98.1, Go 1.26.5) and Zig is not. The brief from his boss: a full slides editor whose slides look like the GT brand deck, with shaders and effects, exported to Google Slides or PPTX looking identical, feature rich, agent native, with the features of Glyphfield's design lab as the model.

Conventions: paths inside the Turboslide repo are relative to its root; `head:N` means `Prototemplate/deck/parts/head.html` line N, `tail:N` the same for `tail.html`; px means sheet pixels on the 1600 by 900 sheet; rule ids use a slash (`sheet/overflow`).

## 1. What Turboslide is

Turboslide is a block document with a validator and a grammar linter, and everything else is a client of that one library. A deck is a manifest plus one JSON file per slide plus assets with light and dark twins. A slide is a kind, a layout and typed blocks whose types are the GT deck grammar's classes made explicit, with stable slug ids and no x or y coordinates. One framework-free renderer function turns the document into the same HTML and CSS the deck uses today, so the browser editor, the static viewer and the Prototemplate `/deck` iframe, the CLI's screenshots and the exporters draw from one source, and a render at revision N is the same pixels everywhere.

Every operation is a named action in one action table, from which the CLI subcommands, the MCP tool list, the in-page window API, the OpenAPI document, the palette entries and the skills' reference tables are generated. A designer's click and an agent's call take the same path through the same validator with the same `baseRevision`. Export is a client of the renderer: it measures the rendered slide in headless Chromium and emits PPTX and Google Slides natively where those formats can carry the deck and as 2x rasters where they cannot, then renders the exported file back and diffs it against the web render at the same revision, so "identical" is a measured claim per revision.

The order of delivery follows the thesis. The CLI ships first because it is the file transport and needs no browser page (report 05 section 9 item 3). The first useful release is the imported 85-slide GT deck rendering in the viewer with `turboslide render`, `sheet`, `lint` and `validate` working, one day of agent work on top of the scaffold. Flatten PPTX export with a verified report follows in the second milestone, before the editor, so an agent can create, edit, verify and export a deck with no browser tab open before a designer has a canvas.

Seven properties define agent native here (report 05 section 2): discoverable, declarative and diffable, parity by named actions, deterministic and visible, lintable, verified by artifact, shared history. Each section below says which property it serves.

What Turboslide is not: it is not a free-form canvas. There are no free coordinates, no z-order, no rotation and no resize handles on text. Anything the grammar cannot express goes into an `html` escape block that the linter flags and the exporter rasterizes; the count of such blocks in a deck is the honest scope of the grammar (report 05 section 9 item 1).

## 2. The look

### 2.1 The deck grammar as the theme

The slides are the GT brand deck, unchanged. The theme is `gt-ink-paper`, the one member of a string enum so a second theme is additive (open question 6). Its facts come from `Prototemplate/deck/DECK-GRAMMAR.md` and `parts/head.html`, catalogued in report 03:

- The sheet is 1600 by 900. Two vertical rails at 56 px from the left and right edges, two horizontal rules at 56 px from the top and bottom, an 11 by 11 registration cross at each junction, all drawn by the engine and never by a slide. The slide box is inset 57 px with 72 by 80 padding, so the content box is 1326 by 642 at (137, 129). The wordmark sits bottom left and the counter bottom right, inside the bottom margin (report 03 section 1).
- Nine tokens with a pure dark remap: `--paper` `#ffffff` / `#070707`, `--ink` `#070707` / `#f2f2f0`, `--ink-2` `#3a3d44` / `#b9bcc3`, `--titanium` `#8a8f98` unchanged, `--hair` at 18 percent ink (22 percent in dark), `--hair-soft` 9 percent (10), `--plate` 3.5 percent (5), `--cross` 38 percent (34), `--edge` 62 percent (55), `--thumb` 32 percent (head:11-32, 178-179). Fixed colors that do not remap: the four semantic icon hues `#12a37a` ok, `#f0a020` warn, `#e5484d` no, `#2f5ce0` info; the `#101010` code panel; the swatch plates; the fixed-white logo plate on slide 14 (report 03 section 2).
- Inter is the only face, embedded as one InterVariable 4.001 woff2 with `opsz` 14 to 32 and `wght` 100 to 900 (pptx report section 4.10). Display weight is capped at 500 and text under 15 px on the sheet is a defect. The ladder: h1 88 px at 1.02, h2 44 px at 1.1, `.big` 72 px at 1.06, all at weight 500 with -0.025em tracking, `text-wrap: balance` and features `cv11` and `ss01`; p 22 px at 1.5; `.lead` 26 px; `.cap` 15 px titanium; `.rows` 20 px; `.plain` 24 px; diagram text 20 px in `--ink-2`, `.lab` 26 px, `.sm` 18 px; `.panel` 17 px monospace at 1.7 (report 03 section 3).
- Ruled rows and lists instead of bullets: `.rows` with a key column (240 default, `.narrow` 180, set per slide to 90, 120, 150, 190, 200, 220, 250 or 300), values at most two lines; `.plain` at 24 px with `.no` strike; semantic color only on Heroicons 20 solid icons in key cells (20 px) and at list row starts (24 px), never inside a sentence (report 03 sections 4.2, 4.4).
- Inline SVG diagrams with 1 px or 1.5 px strokes in `ink`, `mid` or `hair`, fills only ink, paper or plate, 11 px square markers, no arrowheads, labels 12 px clear of lines, coordinates on the half pixel (report 03 sections 4.7, 5.11).
- Plates over full-bleed pictures: the section opener's plate lower left with `max-width` 740, the mood plate lower right at 560 with a 44 px title, the closing plate upper left at 720 with the mark; the picture at `inset: -57px` under the rails; two paper chips under the wordmark and counter on the stage only (report 03 section 5.1).
- Two-tone Bayer dither at 2 px cells on openers and mood slides, produced by the `OPENERS.md` pipeline (crop, cover to 800 by 450, tone, 8 by 8 Bayer at thresholds `(m + 0.5) / 64`, 2x nearest, inverted light twin); one live dither ramp canvas on slide 26 (report 03 sections 8.3, 8.8).
- Shader materials as pictures: Paper Shaders and the Prototemplate direction engines rendered at 3200 by 1800, captured once as frames with a recipe, then dithered or kept in color (report 03 section 8.5).
- Copy rules that are lints: no trailing period on headings, sentence case with proper nouns, product tokens never first, headings are names and never URLs, no metaphors, no "X, not Y" pairs, no em dashes, no exclamation marks, no eyebrows, full sentences in captions, Title Case only on buttons (`DECK-GRAMMAR.md` lines 21-24).
- Twelve archetypes from about twenty blocks: section opener (8 slides), closing (1), mood (9), statement (2), text plus ruled table (18), text plus diagram (5), text plus screenshot (12), head over pair, detail grid, tile grid, specimen or full-width diagram (about 25), status board (1), ruled statement lists (5), sliders (1), plus code panels on 7 slides and the one live canvas (report 03 section 5, Appendix A).
- The viewer: slide, grid and book modes, present and fullscreen, the dual-key theme (`gt-theme` then `gt-deck-theme`, default dark, never `prefers-color-scheme`), hash deep links mirrored to the host page over `postMessage`, digits then Enter, click halves and swipe, help and toast, reduced motion, the 208 px sidebar (report 03 section 7).

Everything the deck sets by hand today becomes a property, a derived value or a lint: the twenty items in report 03 section 11 (duplicated plate style blocks, stale scoped class names, hand-derived viewBox widths, per-slide column templates, figure sizes, key widths, head-as-columns, split gaps, caption sizes, inline margins, hand-placed diagram coordinates, sprite patches, the fixed-white plate, repeated counts, prose dither parameters, plate clearance by cell counts, per-slide capture scripts, alt and captions, verification by looking, hard-coded toolchain paths).

### 2.2 The Prototemplate aesthetic as the chrome

The editor chrome is the Prototemplate viewer shell ported as source, with its rules kept. Resolution of a contradiction: design A renamed the chrome tokens to `--ts-`; designs B and C and the look judge keep `--pt-`. The spec keeps `--pt-`, because the port must stay diffable against its source and `scripts/lint-lines.mjs` names those tokens. The sheet's own unprefixed tokens are rescoped from `:root` to the `.ts-sheet` root class (section 5.1), so the two vocabularies never collide and a light sheet can sit inside dark chrome.

`packages/chrome/src/tokens.css` is `Prototemplate/src/components/viewer/tokens.css` verbatim minus the four site colors: `--pt-paper`, `--pt-ink`, `--pt-ink-2`, `--pt-titanium`, `--pt-hair`, `--pt-hair-soft`, `--pt-plate`, `--pt-cross`, `--pt-edge`, `--pt-thumb`, `--pt-scrim`, `--pt-panel-ink` `#101010`, `--pt-panel-text`; `--pt-bar-h: 52px`; `--pt-sb-w: 208px` (256 px in thumbnail density); `--pt-panel-w: 460px`; `--pt-radius: 6px`, the one corner in chrome, shared by the Search pill, the segmented controls, the filter fields and the hover preview frame, every other box square; the six motion durations (120, 140, 160, 180, 200, 220 ms) that the reduced motion block sets to 0; `.pt-scroll` (a 4 px gutter with no track, a 2 px thumb in `--pt-thumb` widening to 4 px on hover, no buttons, radius 0); the dark remap under `:root[data-theme='dark']` only. Chrome type is Inter at 13 px.

Components ported file by file with a `PORTED_FROM.json` map recording the Prototemplate commit hash per file: `ToolButton` (the 32 px `.pt-ib` with a 1 px hover border and `is-on` ink border), `Seg` (role `group`, one shared indicator span moved with `translateX` and `scaleX`, the active option's text in paper, clicking the active non-first option returns to the first), `Toolbar` with its four measured label-collapse tiers and one 52 px row at or below 900 px, `Sidebar` with `ListRow`, `SidebarFilter`, `ThumbShot` and the density toggle, `Search` (grown into the palette), `PreviewLayer` (one delegated layer at the shell root, a 320 by 180 capture after 80 ms of hover or at once on focus, a 120 ms grace before hiding, one eased 160 ms move between rows, a 48-entry decoded image cache), `HelpCard`, `Toast`, `Progress`, `ThemeButton`, `useShellKeys` and the `ShellState` contract from `shell-context.ts`. `ShellMode` is the shell's own type, `'slide' | 'grid' | 'book'` (`src/lib/shell-data.ts:62`), plus a present flag.

The line law for chrome (`Prototemplate/DESIGN.md`, "Line law for chrome") is a rule of the chrome package. Every rule in chrome is 1 px, drawn once, in one of three roles: structural `--pt-hair` (the sheet ring, the search card, the panel's left edge, the toolbar bottom, the sidebar right edge, the segmented control, fields at rest), row `--pt-hair-soft` (list rows, search results, panel rows, the sheet mat's outer ring, the progress track), frame `--pt-edge` (thumbnails, page frames, grid tiles, the hover preview's frame, the help card). `--pt-ink` appears on a border only as a state: pressed, active, the count while edited, the solid call to action, focus. Where two components touch, exactly one draws the seam. The regions Turboslide adds take their seams from this table, which extends `DESIGN.md`'s:

| Junction                              | Owner                                                                                                                      | The other side                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Stage and inspector                   | the inspector's left edge, `--pt-hair`                                                                                     | the stage draws no right edge                                                                                             |
| Toolbar and inspector                 | the toolbar's bottom edge runs under the inspector                                                                         | the inspector draws no top edge                                                                                           |
| Stage and source drawer               | the drawer's top edge, `--pt-hair`                                                                                         | the stage draws no bottom edge; the drawer covers the progress track while open, as the index panel does                  |
| Inspector section header and its rows | the header draws `--pt-hair` under itself                                                                                  | rows draw `--pt-hair-soft` under themselves; the last row draws none                                                      |
| Selection ring and the sheet          | the overlay layer draws `--pt-ink` as a state                                                                              | the block draws nothing                                                                                                   |
| Lint box and the sheet                | the overlay layer draws `--pt-ink` for severity 3 and `--pt-titanium` for 1 and 2, 1 px, with a 13 px chip naming the rule | the block draws nothing; semantic hues never appear in chrome (they are allowed inside the rendered sheet only, on icons) |

`scripts/lint-lines.mjs` is ported as `turboslide lint --chrome` and runs in CI from M1 against the studio at 1440, 1280 and 390 in both themes, with the deck's allow list (`sheet`, `thumb-frame`, `page-frame`, `pt-tile`, `pt-preview`) plus `ts-select` for the selection ring. Resolution: design A had this in M2; the look judge asked for it in M1, and the spec follows the judge.

The inspector is 460 px (`--pt-panel-w`), taking the index panel's slot and its left-edge line, with 32 px rows ruled in `--pt-hair-soft` and headers in `--pt-hair`. Resolution: design A's 292 px inspector borrowed Glyphfield's `LabInspectorSection` heading grammar; the look judge preferred Prototemplate's ruled rows at the panel width, and the spec follows.

What comes from Glyphfield is contracts, not components (report 01 section 3): the automation registry and accessible-label contract, the source drawer round trip through one validator, the versioned document envelope conventions, the export artifact rule that a resolved Promise is never completion, shader frame capture with recipe keys, the 15-control material model and the Bayer converter, the manifest, OpenAPI and skills shape, and the verification style of seeding through the public API and asserting on decoded pixels. What must not come across: the 9,115-line `ShaderLabStudio.tsx`, the 35,605-line `globals.css`, scattered draft state with a derived document, string-built SVG with heuristic metrics, browser-only persistence, labels as the only automation address (report 01 section 4).

## 3. Monorepo layout and stack

### 3.1 Tree

```
Turboslide/
  package.json                  private; scripts: dev, build, typecheck, lint, test, check, generate:contracts, render
  pnpm-workspace.yaml           packages: apps/*, packages/*, packages/native/npm/*, tooling/*; default catalog with exact versions;
                                allowBuilds: { esbuild: true, lightningcss: true, unrs-resolver: true, sharp: true }
  turbo.json                    build depends on ^build; typecheck depends on generate-routes and generate:contracts
  tsconfig.base.json            strict, moduleResolution bundler, composite, verbatimModuleSyntax, no baseUrl
  tsconfig.json                 references: every package and app (tsc -b)
  AGENTS.md                     parity chain, render and lint commands, completion rules, ownership rule, the dev-server rules
  LICENSE                       (open question 14)
  THIRD_PARTY_NOTICES.md        Paper Shaders Apache-2.0 LICENSE and NOTICE text, Inter OFL, Heroicons MIT, Glyphfield MIT (studioAutomation port)
  apps/
    studio/                     TanStack Start: viewer, editor, presenter, agent HTTP, MCP over streamable HTTP
    cli/                        the `turboslide` binary (tsdown bundle), no React
    render-worker/              Node worker in Docker: Chrome for Testing, LibreOffice 26.8, poppler, the export fonts; job queue
  packages/
    schema/                     @turboslide/schema      types, Zod schemas, validateDeck, applyMutations, diffDecks, migrations,
                                                        block catalog, rule ids, the action table
    theme/                      @turboslide/theme       gt-ink-paper: sheet.css ported from head.html, tokens.ts (parity tested), sprite.ts, copy.ts
    fonts/                      @turboslide/fonts       InterVariable woff2 CSS; export/ static instances and fonts.json (built by scripts/build-fonts.py)
    render/                     @turboslide/render      renderSlide, renderDeck, renderStandalone, renderThumb; slot geometry; RasterRef list
    effects/                    @turboslide/effects     bayer8, dither ramp, twoTone pipeline, tone LUT, 1-bit PNG encoder, plate metrics, diff
    materials/                  @turboslide/materials   material catalog (paper:*, proto:*), uniform schemas, palette presets, mount, frame capture
    lint/                       @turboslide/lint        static and rendered rules to findings; fixers
    headless/                   @turboslide/headless    Playwright driver: launch flags, readiness wait, overflow scan, screenshots, scene measurement
    import/                     @turboslide/import      Prototemplate deck HTML to document, import-ids.json sidecar, import-report.json
    export/                     @turboslide/export      scene/, pptx/, ooxml/, gslides/, verify/, calibration/, report
    agent/                      @turboslide/agent       action dispatcher, HTTP handlers, OpenAPI, manifest, llms.txt, skill tables (generators)
    mcp/                        @turboslide/mcp         MCP server over the action table (stdio and streamable HTTP)
    store/                      @turboslide/store       DeckStore interface; FileStore (revision, baseRevision, leases, versions, watch)
    viewer/                     @turboslide/viewer      React: Stage, Sheet, SlideView, GridView, BookView, Presenter, theme boot, keys, hash sync;
                                                        standalone/ (the framework-free tail.html port for the single-file build)
    chrome/                     @turboslide/chrome      React: tokens.css (--pt-), ToolButton, Seg, Toolbar, Sidebar tree, Palette, PreviewLayer,
                                                        Inspector, SourceDrawer, Toast, HelpCard, Progress; PORTED_FROM.json
    native/                     @turboslide/native      loader for crates/turboslide-native (napi addon or wasm) with TypeScript fallback (M5)
  crates/
    turboslide-native/          Rust: resample (Lanczos3), tone, bayer8, png1, diff (exact, pixelmatch-compatible, dssim); napi and wasm features
  skills/
    turboslide-create/  turboslide-api/  turboslide-studio/  turboslide-verify/     SKILL.md plus references/ (generated tables)
  decks/
    gt-brand/                   the imported GT deck: deck.json, slides/*.json, assets/, import-ids.json, import-report.json, known-findings.json
  docs/
    judge-loop.md  export-verification.md  grammar.md (generated)
  tooling/
    tsconfig/  eslint-config/  prettier-config/
  scripts/
    build-fonts.py              fontTools varLib.instancer plus pyftfeatfreeze; writes packages/fonts/export/
    check-client-bundle.mjs     greps dist/client for the server-only marker; asserts no Solid chunk in the server output
    compare-to-shoot.mjs        pixelmatch of turboslide renders against Prototemplate shoot-slide.mjs renders
```

### 3.2 Stack, with exact versions

Resolved by the TanStack experiment on 2026-09-10 (tanstack report section 3) and the two export experiments; pinned exactly in the default pnpm catalog (catalogs need pnpm 10.12.1 or later, https://pnpm.io/catalogs). The scaffold pins `latest` for `@tanstack/*`; Turboslide never does, and `pnpm update` of that group goes through a PR that runs the full acceptance suite.

| Package                                   | Version                              | Note                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-start`                   | 1.168.50                             | the only importer is `apps/studio`                                                                                                                                                                                                                                     |
| `@tanstack/react-router`                  | 1.170.33                             |                                                                                                                                                                                                                                                                        |
| `@tanstack/router-cli`                    | 1.167.34                             | `tsr generate` before `tsc -b`                                                                                                                                                                                                                                         |
| `@tanstack/router-plugin`                 | 19.3.0                               | transitive, separate major line                                                                                                                                                                                                                                        |
| `@tanstack/react-devtools`                | 0.10.12                              | Solid based; the `devtools()` plugin stays in every Vite config and the component mounts only under `import.meta.env.DEV`                                                                                                                                              |
| `@tanstack/devtools-vite`                 | 0.8.5                                | console piping off                                                                                                                                                                                                                                                     |
| `vite`                                    | 8.2.2                                | Rolldown 1.2.8; Node 20.19+ or 22.12+ (https://vite.dev/blog/announcing-vite8)                                                                                                                                                                                         |
| `react`, `react-dom`                      | 19.3.0                               |                                                                                                                                                                                                                                                                        |
| `typescript`                              | 6.0.3                                | the last JavaScript-based line; `moduleResolution: bundler`, no `baseUrl` (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html); the standalone repo does not follow gt-cloud's native v7 until `@tanstack/*` types are verified against it |
| `nitro`                                   | 3.0.260903-beta                      | deployment builds; `NITRO_PRESET` node-server (default), vercel (built, not deployed), bun (bundle only)                                                                                                                                                               |
| `zod`                                     | 4.x                                  | `z.toJSONSchema` for MCP and OpenAPI (https://zod.dev/json-schema)                                                                                                                                                                                                     |
| `@modelcontextprotocol/sdk`               | current                              | https://github.com/modelcontextprotocol/typescript-sdk                                                                                                                                                                                                                 |
| `playwright-core`                         | 1.62.1                               | with the full Chrome for Testing 147.0.7727.15 (`chromium-1217`) binary, never the headless shell                                                                                                                                                                      |
| `pptxgenjs`                               | 4.0.1                                |                                                                                                                                                                                                                                                                        |
| `jszip`                                   | 3.10.2                               | OOXML post-process                                                                                                                                                                                                                                                     |
| `pixelmatch`                              | 7.2.0                                |                                                                                                                                                                                                                                                                        |
| `pngjs`                                   | 7.0.0                                |                                                                                                                                                                                                                                                                        |
| `sharp`                                   | 0.35.0                               | libvips 8.18.3 prebuilt; RGBA PNG and JPEG encode, Lanczos3 resize                                                                                                                                                                                                     |
| `googleapis`                              | 178.1.1                              | Slides export (M6)                                                                                                                                                                                                                                                     |
| `@paper-design/shaders`                   | 0.0.78                               | Apache-2.0 with NOTICE (pptx report section 4.11)                                                                                                                                                                                                                      |
| `parse5`                                  | current                              | the importer                                                                                                                                                                                                                                                           |
| `tsdown`                                  | current                              | bundles `apps/cli`                                                                                                                                                                                                                                                     |
| `vitest`                                  | 3.x                                  |                                                                                                                                                                                                                                                                        |
| Python 3.14 with fontTools 4.65.0, brotli | pinned in `scripts/requirements.txt` | font build only, run once and committed                                                                                                                                                                                                                                |

Toolchain on the machine: Node 24.13.0, pnpm 11.15.1 through corepack, cargo 1.98.1, Go 1.26.5, no Bun, no Zig, no LibreOffice, no PowerPoint (pptx report section 3).

### 3.3 Package rules

1. Every package under `packages/` except `viewer`, `chrome` and `native` is framework-free TypeScript with no React, no Vite and no `createServerFn`. The CLI, the render worker and the exporters import them without a bundler in dev, which Vite allows because linked workspace packages resolving outside `node_modules` are treated as source (https://vite.dev/guide/dep-pre-bundling.html).
2. Packages export TypeScript source through explicit subpath `exports` (`"./validate": "./src/validate.ts"`), no index barrels. `tsc -b` checks through project references (https://www.typescriptlang.org/docs/handbook/project-references.html).
3. The dependency direction is one way: `schema` depends on nothing internal; `theme` and `fonts` on `schema`; `render` on `schema`, `theme`, `fonts`; `effects` and `materials` on `schema`; `lint` on `schema`, `render`; `headless` on `render`, `effects`, `materials`; `export` on `headless`, `fonts`, `effects`; `import` on `schema`, `theme`; `store` on `schema`; `agent` on `schema`, `store`, `render`, `lint`, `headless`, `export`; `mcp` on `agent`; `viewer` on `render`, `effects`, `materials`; `chrome` on `viewer`; `apps/*` on anything.
4. `createServerFn` appears only under `apps/studio/src/server/` because the Start plugin compiles it (measured: a function importing `node:os` reached 0 client files and 1 server file after `vite build`, tanstack report section 5.2). Shared code that branches by environment uses `createIsomorphicFn` (https://tanstack.com/start/latest/docs/framework/react/guide/environment-functions).
5. `apps/studio` hygiene, all from measured hazards (tanstack report sections 5.5, 6.3, 2): the `devtools()` plugin stays in every Vite config (dropping it left Solid code in the server bundle and every request returned 500); `server: { forwardConsole: false }` (a console-forwarding loop wrote a 10.7 GB log in eleven minutes); `vite dev --port 4321` with the port passed explicitly and its output never redirected to an unbounded file; `pnpm-workspace.yaml` commits `allowBuilds` because pnpm 11 ignores `pnpm.onlyBuiltDependencies` (https://pnpm.io/settings/build); `tsr generate` runs before `tsc -b` because `routeTree.gen.ts` must exist; `scripts/check-client-bundle.mjs` runs on every build.
6. No Tailwind. The scaffold's `tailwindcss()` plugin is removed; chrome is one `tokens.css` and one small CSS file per component.
7. Headless Chromium and LibreOffice never run inside the web app's function. They live in `apps/render-worker` (a Node process, Docker image), and `apps/studio` exposes a thin facade that enqueues jobs and streams results (tanstack report section 8).

### 3.4 apps/studio

```
apps/studio/
  vite.config.ts                plugins: devtools(), tanstackStart(), viteReact(); server: { forwardConsole: false }
  vite.deploy.config.ts         same plus nitro() from 'nitro/vite'
  tsr.config.json               { target: 'react' }
  src/router.tsx  src/routeTree.gen.ts (generated)
  src/routes/__root.tsx         shellComponent: theme boot script (gt-theme then gt-deck-theme, default dark), tokens.css
  src/routes/index.tsx          deck list (SSR)
  src/routes/deck.$deckId.tsx   viewer: slide, grid, book, present (SSR shell, client hydration); ?mode, ?theme, #s/<slideId> and #NN
  src/routes/edit.$deckId.tsx   editor, ssr: false (measured: a 2.3 KB shell with no canvas)
  src/routes/present.$deckId.tsx presenter console and ?screen=1 audience window, ssr: false
  src/routes/embed.$deckId.tsx  the framed viewer for Prototemplate's /deck iframe; gt-theme and gt-deck-slide postMessage protocol
  src/routes/api/actions.$action.ts   POST one action id, dispatched through @turboslide/agent
  src/routes/api/agent.ts       GET manifest
  src/routes/openapi.json.ts  src/routes/llms.txt.ts  src/routes/llms-full.txt.ts
  src/routes/api/render.$slideId.ts   GET facade over the render worker; streams the PNG and RenderRecord
  src/routes/api/export.$deckId.ts    POST enqueues an export job, GET polls the ExportReport
  src/routes/mcp.ts             streamable HTTP MCP endpoint over @turboslide/mcp
  src/server/                   createServerFn wrappers used by the editor (write, lint, render request)
  src/workers/dither.worker.ts  the two-tone pipeline off the main thread for the inspector's live preview
```

Materials mount on the main thread inside the stage, because `ShaderMount` requires an `HTMLElement` parent, a `webgl2` context, `ResizeObserver` and `requestAnimationFrame` (measured, pptx report section 4.11). Resolution: design B mounted materials in a WebGL2 worker on an `OffscreenCanvas`; the worker path was verified with raw WebGL2 only (tanstack report section 7), so the spec uses the worker for the dither preview and the main thread for materials.

## 4. Document model

Serves: declarative and diffable, shared history.

### 4.1 Files on disk

```
decks/gt-brand/
  deck.json                     manifest: schemaVersion, id, title, theme, sections, assets, revision, timestamps
  slides/<slideId>.json         one slide per file; the file name is the slide id; each file carries schemaVersion
  assets/<assetId>-light.png    twins by asset id; -dark.png; or one file when the asset is theme neutral
  assets/<assetId>.recipe.json  optional: the material or capture recipe that produced the twins
  versions/<n>.json             named versions (author, note, revision, mutation log)
  import-ids.json               the importer's sidecar: source file and block path to stable id
  import-report.json            written by turboslide import
  known-findings.json           the severity 3 baseline that turboslide lint gates against
```

JSON is written canonically: two-space indent, keys in schema order, arrays one element per line, trailing newline, so `git diff` reads at the line level and two writers produce identical bytes for identical documents. Shader frames and two-tone twins are committed under `assets/`, never under a git-ignored cache. Resolution: design B referenced frames under `.turboslide/frames/`, which it declared derived and ignored, so a fresh clone would lack its opener pictures; the spec commits them, and `.turboslide/` holds only renders, thumbnails, records and lint reports.

Unknown fields survive read and write under `ext` on exactly three levels: `Slide.ext`, `Block.ext` and `Asset.ext`; `validate` reports them once at severity 1. Unknown fields anywhere else are rejected with `unknown_field` and a JSON pointer, following Glyphfield's `AGENT_GENERATION_CONTRACT` (`glyphfield/src/lib/agentApi.ts:192`).

### 4.2 Types

The shape of `packages/schema/src/`. Zod schemas produce the TypeScript types, the JSON Schema for MCP and OpenAPI, and the inspector's control metadata (`label`, `control`, `snap`, `group` annotations per property).

```ts
// packages/schema/src/deck.ts
export type Deck = {
  schemaVersion: 1;
  id: string; // slug, stable: 'gt-brand'
  title: string;
  theme: 'gt-ink-paper'; // one-member enum; a second theme is additive
  sections: Section[]; // the only place order lives; numbers, counts, SECTIONS and titles are derived
  assets: Record<AssetId, Asset>;
  defaults?: { notes?: string };
  revision: number; // increments on every committed write
  createdAt: string;
  updatedAt: string;
};

export type Section = { id: string; name: string; slideIds: SlideId[] }; // an opener, if present, is first and has kind 'opener'

export type SlideId = string; // slug, never a number: 'why-the-redesign'
export type BlockId = string; // unique within the slide: 'h', 'p1', 'list', 'fig'
export type AssetId = string;

type SlideBase = {
  schemaVersion: 1; // on every slide file so one slide can be read, validated and migrated alone
  id: SlideId;
  title?: string; // overrides the derived title (first heading, big or plate title)
  notes?: string; // speaker notes; the only place notes live
  tags?: string[];
  ext?: Record<string, unknown>;
};

export type Slide =
  ContentSlide | OpenerSlide | MoodSlide | ClosingSlide | TitleSlide | StatementSlide;

export type ContentSlide = SlideBase & {
  kind: 'content';
  layout: Layout;
  slots: Record<SlotName, Block[]>;
};
export type SlotName = 'main' | 'head' | 'headLeft' | 'headRight' | 'body' | 'left' | 'right';

export type Layout =
  | {
      type: 'cols';
      ratio: '5/7' | '4/8' | '1/1' | { left: number } | { right: number };
      gap?: 72 | 56 | 48;
      align?: 'start' | 'center';
    }
  //   slots: left, right
  | {
      type: 'split';
      gap?: 56 | 44 | 40 | 36 | 32 | 26;
      head?: 'single' | { cols: '5/7' | '4/8' };
      body?: { align: 'start' | 'center' | 'end' };
    }
  //   slots: head (or headLeft, headRight), body
  | { type: 'center' } // slot: main
  | { type: 'left-mid' } // slot: main
  | { type: 'stack'; gap?: number }; // slot: main

export type Picture = { asset: AssetId; fit: 'cover'; position?: 'center' | 'top' | 'bottom' };
export type Plate = {
  side: 'lower-left' | 'lower-right' | 'upper-left';
  maxWidth: 740 | 560 | 720;
  blocks: Block[];
};
export type OpenerSlide = SlideBase & {
  kind: 'opener';
  sectionId: string;
  picture: Picture;
  plate: Plate;
}; // side lower-left, 740
export type MoodSlide = SlideBase & { kind: 'mood'; picture: Picture; plate: Plate }; // side lower-right, 560
export type ClosingSlide = SlideBase & {
  kind: 'closing';
  picture: Picture;
  plate: Plate;
  mark?: { w: number; h: number };
}; // upper-left, 720
export type TitleSlide = SlideBase & {
  kind: 'title';
  mark: { w: number; h: number };
  heading: Text;
  lead: Text;
};
export type StatementSlide = SlideBase & { kind: 'statement'; big: Text; measure?: number }; // measure in ch
```

Text is a string in a four-rule inline markup. Resolution: design A used `string | Run[]`; design B used a markup string; the agent-nativeness judge asked for the string so that `git diff` stays at the word level and an agent can type it. The parsed form is the run model.

```ts
// packages/schema/src/text.ts
export type Text = string;
// Four rules, nothing else:
//   *text*            the display run: weight 500, the deck's <b>
//   [text](https://…) a link; inside rows.links an external glyph follows it
//   GT                a standalone GT word becomes the mark at render, with the exclusion list from gt-mark-in-text.js
//                     (code, URLs, package names, attributes, panel text); the document keeps the letters
//   \*  \[  \GT       escapes
// No line breaks inside a string except in panel.code, where \n is honored. A non-breaking space (U+00A0) is the nowrap device.
export type Run = { t: string; b?: true; gt?: true; link?: string }; // parseText(text): Run[]; serializeRuns(runs): Text
```

Blocks are the grammar's classes as typed nodes.

```ts
// packages/schema/src/blocks.ts
type BlockBase = { id: BlockId; ext?: Record<string, unknown> };
export type Block = BlockBase &
  (
    | {
        type: 'heading';
        level: 'h1' | 'h2' | 'big' | 'title';
        text: Text;
        marginTop?: number;
        marginBottom?: 0 | 18;
      }
    | {
        type: 'paragraph';
        text: Text;
        role?: 'body' | 'lead' | 'cap';
        tone?: 'ink' | 'muted';
        measure?: 32 | 56 | number;
        marginTop?: number;
      }
    | { type: 'credit'; text: Text } // 15 px titanium, plate only
    | {
        type: 'rows';
        key: 90 | 120 | 150 | 180 | 190 | 200 | 220 | 240 | 250 | 300;
        tight?: boolean;
        links?: boolean;
        minRowHeight?: number;
        items: RowItem[];
      }
    | { type: 'plain'; size?: 24 | 22 | 20; items: PlainItem[] }
    | { type: 'refs'; items: Text[] }
    | { type: 'say'; items: { quote: Text; note?: Text; no?: true }[] }
    | { type: 'scales'; centerTick?: boolean; items: { left: Text; right: Text; value: number }[] } // the marker is derived from value
    | {
        type: 'spec';
        weights: (300 | 400 | 500 | 600 | 700 | 800)[];
        sample: string;
        textRow?: Text;
      }
    | {
        type: 'lang';
        items: {
          script: 'latin' | 'ja' | 'zh' | 'ko' | 'ar' | 'hi' | string;
          text: string;
          label: string;
        }[];
      }
    | { type: 'ladder'; rows: { size: number; label: string }[]; valueWidth?: 200 | 320 }
    | {
        type: 'swatches';
        items: {
          name: string;
          value: string;
          plate: 'ink' | 'raised' | 'ti' | 'paper' | 'outline';
        }[];
      }
    | {
        type: 'shot';
        asset: AssetId;
        fit?: 'width' | 'fit';
        aspect?: string;
        crop?: 'top' | 'center';
        caption?: Text;
        captionSize?: 16 | 15;
        width?: number;
        border?: boolean;
      }
    | {
        type: 'pair';
        ratio?: '1/1' | { left: number; right: number };
        gap?: 28 | 40;
        captionSize?: 16 | 15;
        figures: { assets: AssetId[]; caption?: Text }[];
      }
    | {
        type: 'tiles';
        columns: 4 | 5 | 6;
        aspect: '16/9' | '16/10' | '1/1';
        labelSize?: 15 | 20;
        items: { asset?: AssetId; label?: Text; sub?: Text; marker?: true }[];
        more?: Text;
      }
    | {
        type: 'details';
        columns: 3;
        rowHeights?: number[];
        items: { asset: AssetId; caption?: Text }[];
      }
    | {
        type: 'board';
        columns: [128, 250, 200, 'fr'];
        rows: { asset?: AssetId; name: Text; address?: string; state: Icon; note: Text }[];
      }
    | {
        type: 'composite';
        tracks: string;
        gap?: number;
        cells: { blocks: Block[]; span?: number }[];
      } // M5: the declared figure grid that retires the last escapes
    | { type: 'panel'; code: string; size?: 17 | 15; pre?: boolean; term?: boolean; marks?: true }
    | {
        type: 'dia';
        fit: 'slot' | { viewBox: [number, number, number, number] };
        data?: Diagram;
        svg?: string;
        alt: string;
      }
    | { type: 'dither'; height: 220; ramp: 'linear-x'; border?: true; alt: string }
    | { type: 'mark'; w: number; h: number } // the standalone GT mark
    | { type: 'markSizes'; sizes: number[] } // the compression specimen
    | { type: 'matrix'; cells: number[][]; caption?: Text } // the 4 by 4 Bayer table
    | { type: 'logoPlates'; items: { asset: AssetId; name: Text }[] } // fixed-white plates for external logos (slide 14)
    | { type: 'html'; css: string; html: string; note: string } // the escape hatch: flagged by lint, raster on export
  );

export type Icon = { name: IconName; color?: 'ok' | 'warn' | 'no' | 'info' }; // IconName is the sprite's 63 symbols plus gt-mark
export type RowItem = { key: Text; icon?: Icon; value: Text; ext?: true }; // ext: the external link glyph after a link
export type PlainItem = { text: Text; icon?: Icon; no?: true };

export type Diagram = {
  // the declared, lintable form of svg.dia; with fit 'slot' the renderer sets w to the slot width
  w: number;
  h: number;
  lines: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke: 'ink' | 'mid' | 'hair';
    width?: 1 | 1.5;
  }[];
  rects: {
    x: number;
    y: number;
    w: number;
    h: number;
    fill: 'ink' | 'paper' | 'plate' | 'none';
    stroke?: 'ink' | 'mid' | 'hair';
    opacity?: number;
  }[];
  markers: { x: number; y: number }[]; // 11 px squares
  texts: {
    x: number;
    y: number;
    text: string;
    size: 20 | 26 | 18;
    anchor?: 'start' | 'middle' | 'end';
  }[];
  icons: { name: IconName; x: number; y: number; size: 24 | 20; color?: Icon['color'] }[];
  marks: { x: number; y: number; w: number; h: number; iso?: true }[];
};
```

Assets carry role, twins, provenance, treatment and metrics.

```ts
// packages/schema/src/assets.ts
export type Asset = {
  id: AssetId;
  role:
    | 'opener'
    | 'mood'
    | 'capture'
    | 'detail'
    | 'thumb'
    | 'render'
    | 'icon'
    | 'logo'
    | 'frame'
    | 'other';
  alt: string;
  twins: { light: string; dark: string } | { neutral: string }; // relative paths under assets/
  size: [number, number]; // pixels of the stored file
  scale: 1 | 2 | 3; // device pixels per sheet px the file was produced at
  source:
    | {
        kind: 'material';
        materialId: string;
        uniforms: Record<string, number | number[] | string>;
        size: [3200, 1800];
        timeMs: number;
        backend: 'angle-metal' | 'swiftshader';
        renderer: string;
        recipeKey: string;
      }
    | {
        kind: 'capture';
        url: string;
        viewport: [1440, 900];
        scale: 2;
        theme: 'light' | 'dark' | 'both';
        region?: [number, number, number, number];
        recipe: string;
      }
    | {
        kind: 'photo';
        origin: string;
        artist?: string;
        license: 'CC0' | 'CC BY' | 'CC BY-SA' | 'public domain' | string;
        shareAlike: boolean;
      }
    | { kind: 'file' };
  treatment?:
    | {
        kind: 'two-tone';
        crop: [number, number, number, number];
        channel?: 'gray' | 'r' | 'g' | 'b';
        invert?: boolean;
        blur?: number;
        autocontrast: 0.5;
        black?: number;
        white?: number;
        gamma?: number;
        minFilter?: number;
        unsharp?: { rows: [number, number]; amount: number };
        polarity: 'dark-ground' | 'light-ground';
        cell: 2;
        bayer: 8;
        resampler: 'lanczos3';
      }
    | { kind: 'continuous'; quality: 88 | 92 | 95 };
  credit?: string; // must appear on the plate for share-alike sources
  inline: 'native' | 'resample-1280' | 'two-color' | 'pass-through'; // the build rule, from build-deck.mjs:72-76
  metrics?: {
    litFraction: number;
    plateClear?: {
      plate: [number, number, number, number];
      nearestLitPx: number;
      litUnder: number;
      litInBand: number;
    };
  };
  ext?: Record<string, unknown>;
};
```

Mutations, writes, versions, leases, findings, render records and export reports complete the core.

```ts
// packages/schema/src/mutations.ts
export type Mutation =
  | { op: 'slide.insert'; sectionId: string; after?: SlideId; slide: Slide }
  | { op: 'slide.remove'; slideId: SlideId }
  | { op: 'slide.move'; slideId: SlideId; sectionId: string; after?: SlideId }
  | { op: 'slide.set'; slideId: SlideId; path: string; value: unknown } // JSON pointer into the slide
  | { op: 'slide.replace'; slideId: SlideId; slide: Slide } // what the source drawer's Apply emits
  | {
      op: 'block.insert';
      slideId: SlideId;
      slot: SlotName | 'plate';
      after?: BlockId;
      block: Block;
    }
  | { op: 'block.remove'; slideId: SlideId; blockId: BlockId }
  | {
      op: 'block.move';
      slideId: SlideId;
      blockId: BlockId;
      slot: SlotName | 'plate';
      after?: BlockId;
    }
  | { op: 'block.set'; slideId: SlideId; blockId: BlockId; path: string; value: unknown }
  | {
      op: 'text.replace';
      slideId: SlideId;
      blockId: BlockId;
      path: string;
      range: [number, number];
      text: Text;
    } // typing, coalesced
  | { op: 'section.set'; sections: Section[] }
  | { op: 'asset.set'; asset: Asset }
  | { op: 'asset.remove'; assetId: AssetId }
  | { op: 'deck.set'; path: string; value: unknown }
  | { op: 'version.restore'; n: number }; // restore is a mutation, so it is undoable and visible

export type Author = { kind: 'human' | 'agent'; name: string; runId?: string }; // CLI and MCP: --author agent:<runId>
export type Write = { baseRevision: number; author: Author; note?: string; mutations: Mutation[] };
export type Version = {
  n: number;
  revision: number;
  author: Author;
  note: string;
  createdAt: string;
  mutations: Mutation[];
};
export type Lease = { slideId: SlideId; holder: Author; until: string }; // advisory in M3, enforced for agent writes in M4

// packages/schema/src/findings.ts
export type Severity = 1 | 2 | 3; // 3 must fix (the gate), 2 should fix, 1 polish
export type Finding = {
  id: string;
  rule: RuleId;
  severity: Severity;
  kind: 'defect' | 'diagram' | 'polish' | 'copy' | 'accuracy';
  slideId: SlideId;
  blockId?: BlockId;
  path?: string;
  theme?: 'light' | 'dark';
  evidence: {
    text?: string;
    box?: [number, number, number, number];
    measured?: Record<string, number>;
    image?: string;
  };
  proposal: string; // prose a fixer acts on without judgment
  fix?: Mutation[]; // present when the fix is mechanical; turboslide fix and the inspector's Fix button apply it
  source: 'lint' | `judge:${string}` | 'skeptic';
};

// packages/schema/src/render.ts
export type Box = [number, number, number, number];
export type RenderRecord = {
  deckId: string;
  slideId: SlideId;
  revision: number;
  theme: 'light' | 'dark';
  scale: 1 | 2;
  image: string;
  renderer: string; // 'Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max' or the SwiftShader string
  pageErrors: string[];
  consoleErrors: string[];
  overflow: { blockId?: BlockId; selector: string; box: Box }[];
  blocks: Record<
    BlockId,
    {
      type: string;
      box: Box;
      lines?: number;
      fontSize?: number;
      fontWeight?: number;
      color?: string;
    }
  >;
  fonts: { status: 'loaded' | 'partial'; faces: string[] };
  anchors: { assetId: AssetId; recipeKey: string; timeMs: number }[];
  rasters: {
    blockId: BlockId;
    kind: 'dia' | 'dither' | 'icon' | 'mark' | 'shot' | 'html' | 'material';
    file: string;
    box: Box;
    alpha: boolean;
  }[];
  timing: { readyMs: number; screenshotMs: number };
};

// packages/schema/src/export.ts
export type ExportReport = {
  deckId: string;
  revision: number;
  format: 'pptx' | 'gslides' | 'pdf';
  mode: 'native' | 'flatten';
  theme: 'light' | 'dark';
  fontSet: 'exact' | 'standard';
  fontSetVersion: string;
  files: { path: string; bytes: number; sha256: string }[];
  presentationId?: string;
  url?: string;
  fonts: { embedded: string[]; requiredOnViewer: string[]; substitutedIn: string[] };
  slides: {
    slideId: SlideId;
    native: BlockId[];
    raster: BlockId[];
    verify?: {
      mismatch: number;
      fraction: number;
      blocks: { blockId: BlockId; dx: number; dy: number; dw: number; ok: boolean }[];
      ref: string;
      got: string;
      diff: string;
    };
  }[];
  geometryInBounds: boolean; // the overflow assertion re-run on the exported EMU geometry
  passed: boolean;
  residual: string[];
};
```

### 4.3 The three worked slides

The manifest fragment for the sections these slides live in:

```json
{
  "schemaVersion": 1,
  "id": "gt-brand",
  "title": "GT brand deck",
  "theme": "gt-ink-paper",
  "sections": [
    {
      "id": "brand",
      "name": "Brand",
      "slideIds": ["opener-brand", "title", "thesis", "content-rule"]
    },
    { "id": "website", "name": "Website", "slideIds": ["opener-website", "the-production-site"] },
    {
      "id": "prototemplate-and-glyphfield",
      "name": "Prototemplate and Glyphfield",
      "slideIds": ["opener-prototemplate"]
    }
  ],
  "assets": { "...": "see below" },
  "revision": 412,
  "createdAt": "2026-09-10T18:00:00Z",
  "updatedAt": "2026-09-10T19:42:11Z"
}
```

Slide one, `slides/opener-prototemplate.json`: a section opener whose picture is a shader material frame run through the two-tone pipeline, plate lower left. This is slide 60 of the current deck (`deck/slides/60-opener-prototemplate.html`).

```json
{
  "schemaVersion": 1,
  "id": "opener-prototemplate",
  "kind": "opener",
  "sectionId": "prototemplate-and-glyphfield",
  "picture": { "asset": "liquid-metal-diamond", "fit": "cover" },
  "plate": {
    "side": "lower-left",
    "maxWidth": 740,
    "blocks": [
      { "id": "big", "type": "heading", "level": "big", "text": "Prototemplate and Glyphfield" },
      {
        "id": "p",
        "type": "paragraph",
        "measure": 56,
        "marginTop": 14,
        "text": "This section covers prototemplate.com, the design lab and knowledge base, and glyphfield.com, the tooling behind it."
      },
      {
        "id": "credit",
        "type": "credit",
        "text": "Material: liquid metal, Paper Shaders, rendered in Glyphfield"
      }
    ]
  },
  "notes": "Two products, one grammar. Say what each is for before the detail slides."
}
```

Its asset in `deck.json`, which records the material recipe, the capture anchor and the dither parameters that `OPENERS.md` holds in prose today:

```json
"liquid-metal-diamond": {
  "id": "liquid-metal-diamond",
  "role": "opener",
  "alt": "A liquid metal diamond with two contour bands, rendered in Glyphfield, dithered",
  "twins": { "light": "assets/liquid-metal-diamond-light.png", "dark": "assets/liquid-metal-diamond-dark.png" },
  "size": [1600, 900],
  "scale": 1,
  "source": {
    "kind": "material",
    "materialId": "paper:liquid-metal",
    "uniforms": { "u_colorBack": "#070707", "u_colorTint": "#f2f2f0", "u_softness": 0.2, "u_shiftRed": 0, "u_shiftBlue": 0,
                  "u_contour": 0.6, "u_repetition": 2, "u_distortion": 0.1, "u_offsetX": 0, "u_offsetY": 0, "u_scale": 1.0, "u_shape": 3 },
    "size": [3200, 1800],
    "timeMs": 5500,
    "backend": "angle-metal",
    "renderer": "Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max",
    "recipeKey": "sha256:5b1e…"
  },
  "treatment": { "kind": "two-tone", "crop": [400, 200, 2400, 1350], "channel": "gray", "autocontrast": 0.5, "black": 24, "gamma": 1.0,
                 "polarity": "dark-ground", "cell": 2, "bayer": 8, "resampler": "lanczos3" },
  "credit": "Material: liquid metal, Paper Shaders, rendered in Glyphfield",
  "inline": "two-color",
  "metrics": { "litFraction": 0.207, "plateClear": { "plate": [137, 538, 740, 232], "nearestLitPx": 34, "litUnder": 0, "litInBand": 0 } }
}
```

Slide two, `slides/content-rule.json`: a ruled statement list with semantic icons beside a text column. This is slide 53 (`53-content-rule.html`), a `cols even` layout with a `.plain` list of `ok` and `no` rows. The bare `GT` in the fourth item becomes the mark at render.

```json
{
  "schemaVersion": 1,
  "id": "content-rule",
  "kind": "content",
  "layout": { "type": "cols", "ratio": "1/1" },
  "slots": {
    "left": [
      { "id": "h", "type": "heading", "level": "h2", "text": "The content rule" },
      {
        "id": "p1",
        "type": "paragraph",
        "measure": 56,
        "text": "Every post states what was built, what it cost, and what changed. The list names what passes and what is excluded."
      }
    ],
    "right": [
      {
        "id": "list",
        "type": "plain",
        "items": [
          {
            "icon": { "name": "check-circle", "color": "ok" },
            "text": "A measured result with the method"
          },
          {
            "icon": { "name": "check-circle", "color": "ok" },
            "text": "A decision and the constraint behind it"
          },
          {
            "icon": { "name": "check-circle", "color": "ok" },
            "text": "A tool that a reader can run"
          },
          { "icon": { "name": "check-circle", "color": "ok" }, "text": "How GT ships a locale" },
          {
            "icon": { "name": "x-circle", "color": "no" },
            "no": true,
            "text": "Announcements without a result"
          },
          {
            "icon": { "name": "x-circle", "color": "no" },
            "no": true,
            "text": "Opinions about the industry"
          }
        ]
      }
    ]
  }
}
```

Slide three, `slides/the-production-site.json`: two columns, a 2x page capture with a caption. This is slide 33 (`33-site.html`), whose scoped `<style>` today only sets the figure grid and a 16 px caption; both are block properties here.

```json
{
  "schemaVersion": 1,
  "id": "the-production-site",
  "kind": "content",
  "layout": { "type": "cols", "ratio": "4/8" },
  "slots": {
    "left": [
      { "id": "h", "type": "heading", "level": "h2", "text": "The production site" },
      {
        "id": "p1",
        "type": "paragraph",
        "measure": 56,
        "text": "The site shown is the production build in September 2026. generaltranslation.com was rebuilt page by page on one layout system: a single ruled column, hairline seams between sections, registration crosses at junctions, and one display face at one weight."
      }
    ],
    "right": [
      {
        "id": "shot",
        "type": "shot",
        "asset": "site-home",
        "fit": "width",
        "captionSize": 16,
        "caption": "The home page at 1440 by 900 shows the navigation bar closed by one hairline, the hero inside the rails, the product demo, and the customer logo row in ruled cells."
      }
    ]
  }
}
```

With its asset:

```json
"site-home": {
  "id": "site-home", "role": "capture",
  "alt": "The home page at 1440 by 900",
  "twins": { "light": "assets/site-home-light.jpg", "dark": "assets/site-home-dark.jpg" },
  "size": [2880, 1800], "scale": 2,
  "source": { "kind": "capture", "url": "https://generaltranslation.com/", "viewport": [1440, 900], "scale": 2, "theme": "both", "recipe": "gt-site" },
  "inline": "resample-1280"
}
```

Addressing. A block is `slideId#blockId` (`content-rule#list`); a run inside a text is a JSON pointer plus a character range (`/slots/right/0/items/3/text`, `[4, 6]`). Slots and ids are the only coordinates.

### 4.4 What the validator and reducer do

`validateDeck(input: unknown): { deck: Deck; issues: Issue[] }` parses with Zod, applies migrations by `schemaVersion`, normalizes (layout defaults filled, slot names checked against the layout, block ids unique per slide, asset references resolved, section slide ids unique across the deck, an `opener` slide's `sectionId` equals its section and it is first, `scales` markers derived, `Text` parsed and re-serialized so escapes are canonical), keeps `ext` on the three levels, rejects unknown fields elsewhere with `unknown_field`, and returns issues with JSON pointers. `applyWrite(deck, slides, write)` is a pure reducer that rejects a stale `baseRevision` with the current document, applies the mutation list atomically, bumps `revision`, appends to the log and returns the normalized result plus the inverse mutations. `diffDecks(a, b): Mutation[]` produces a mutation list from two documents so `turboslide diff`, the version list and the judge loop speak one language.

## 5. Renderer

Serves: deterministic and visible. Everything downstream (editor, viewer, CLI, exporter) shows the output of one function.

### 5.1 The theme is head.html, ported once

`packages/theme/src/gt-ink-paper/sheet.css` is `head:11-176` (the sheet block, which ends at the `viewer chrome` divider at head:177) rewritten under the `.ts-sheet` root class instead of `:root`, plus the stage rules `.sheet`, `.stage`, `.slide` and `.backdrop` from head:249-258 in `stage.css`. Element selectors keep their names (`h1` becomes `.ts-sheet h1`) so imported escape blocks render unchanged.

```css
.ts-sheet {
  color-scheme: light;
  --paper: #ffffff;
  --ink: #070707;
  --ink-2: #3a3d44;
  --titanium: #8a8f98;
  --hair: rgba(7, 7, 7, 0.18);
  --hair-soft: rgba(7, 7, 7, 0.09);
  --plate: rgba(7, 7, 7, 0.035);
  --cross: rgba(7, 7, 7, 0.38);
  --edge: rgba(7, 7, 7, 0.62);
  --thumb: rgba(7, 7, 7, 0.32);
  --display: 'Inter', 'Helvetica Neue', Arial, sans-serif; /* … */
}
.ts-sheet[data-theme='dark'] {
  color-scheme: dark;
  --paper: #070707;
  --ink: #f2f2f0;
  --ink-2: #b9bcc3;
  --hair: rgba(242, 242, 240, 0.22);
  --hair-soft: rgba(242, 242, 240, 0.1);
  --plate: rgba(242, 242, 240, 0.05);
  --cross: rgba(255, 255, 255, 0.34);
  --edge: rgba(242, 242, 240, 0.55);
}
.ts-sheet h1,
.ts-sheet h2,
.ts-sheet .big {
  font-family: var(--display);
  font-weight: 500;
  letter-spacing: -0.025em;
  text-wrap: balance;
  font-feature-settings: 'cv11', 'ss01';
}
/* every rule from head:57-176 follows, prefixed; the 140 ms cut stays behind prefers-reduced-motion */
```

The same values exist as data in `tokens.ts` (the nine tokens per theme, the four semantic hues, the composite hairline colors on paper computed once: light `#d2d2d2` hair, `#e9e9e9` hair-soft, `#f6f6f6` plate, `#a1a1a1` cross; dark `#3b3b3a`, `#1f1f1e`, `#131313`, `#5b5b5b`; the grid constants `SHEET`, `RAIL 56`, `INSET 57`, `PAD [72, 80]`, `CONTENT [1326, 642]`, `COLUMNS`; the type ladder with sizes, line heights and tracking; `WEIGHT_CAP 500`; `FLOOR 15`), and a vitest parses `sheet.css` and asserts the two agree so CSS and constants cannot drift (from design C). The sprite (63 Heroicons 20 solid symbols plus `gt-mark` at `viewBox="-8 214 1213 771"`, head:398-462) is `sprite.ts`, one entry per symbol and an `IconName` union, with a script that fetches a missing Heroicon from `heroicons/optimized/20/solid` (https://github.com/tailwindlabs/heroicons) and appends it. The proper-noun list (General Translation, Prototemplate, Glyphfield, Locadex, Inter, Heroicons) and the product token list (gt-next, gt, npx, CLI, API) are `copy.ts`.

### 5.2 One function

```ts
// packages/render/src/slide.ts
export function renderSlide(deck: Deck, slideId: SlideId, opts: RenderOptions): RenderedSlide;
type RenderOptions = {
  theme: 'light' | 'dark';
  chrome: boolean;
  counter?: string;
  assetBase: string;
  blockAttrs: boolean;
  gtWord: boolean;
  live?: boolean;
};
type RenderedSlide = {
  html: string;
  slots: Record<string, Box>;
  rasters: RasterRef[];
  warnings: string[];
};
type RasterRef = {
  blockId: BlockId;
  kind: 'dia' | 'dither' | 'icon' | 'mark' | 'shot' | 'html' | 'material';
  selector: string;
  alpha: boolean;
};
```

The output is the markup the deck writes by hand: `<section class="slide" data-slide="content-rule"><div class="in"><div class="cols even"><div class="stack" data-slot="left">…`. Every block root carries `data-block="<id>"` and `data-type="<type>"` when `blockAttrs` is on, every text run `data-run="<blockId>/<path>"`, and anything the exporter must screenshot `data-raster="<kind>"`. Rendering is a string builder with HTML escaping, never React, so the CLI, the exporter and the studio share it without a framework; its output is snapshot-tested per block type in both themes. Resolution: design B proposed an `HNode` tree with `toHtml` and `toReact` serializers; the look judge called that a fidelity seam (the exporter would measure the string DOM while the designer looks at the React DOM), so the studio sets `innerHTML` to the string, as designs A and C do.

What the renderer owns that slides used to copy:

- The frame, crosses, wordmark and counter are emitted by `renderStage()` around the slide, never by a slide.
- Full-picture kinds emit `<img class="opener-img">` at `inset: -57px` with `src` and `data-dark` from the asset twins, the plate on the requested side with the kind's max width, and the two paper chips at 66,858 (40 by 30) and 1474,856 (60 by 28) only when `opts.chrome` is true, which is what the deck scopes with `#stage >` today (report 03 section 5.1). Thumbnails and book pages get no chips.
- Slot geometry. The content box is 1326 by 642 at (137, 129). For `cols`, the renderer computes the two pixel widths (5/7 gives 522.5 and 731.5; 4/8 gives 418 and 836; 1/1 gives 627 and 627; `{ left: 390 }` gives 390 and 864) and hands them to blocks. A `dia` block with `fit: 'slot'` sets its `viewBox` width to the slot width so one unit is one sheet pixel and a 20 px label renders at 20 px, which removes the hand-derived 522, 731, 418, 627 and 1326 literals and the compensated 22 px text on slides 23 and 27 (report 03 section 11 item 3).
- The GT word transform. A standalone `GT` run becomes `<span class="gt-word"><svg aria-hidden="true"><use href="#gt-mark"/></svg><span class="sr">GT</span></span>` (head:70-74) unless the block is a `panel`, the run is a link, or the deck sets `gtWord: false`; the exclusion list is `gt-mark-in-text.js`'s.
- Rows and plain items emit `<b><svg class="ic ok" aria-hidden="true"><use href="#i-check-circle"/></svg>Key</b><span>value</span>`, icon size 20 or 24 by block type; `*x*` runs emit `<b>`, links emit `<a>` plus `.ic.ext` in link tables.
- Declared `dia` data is emitted as `<svg class="dia">` with half-pixel snapping on every coordinate (`x + 0.5` for odd stroke widths), square caps and no joins; raw `svg` strings pass through unchanged with a lint flag.
- `dither` emits `<canvas class="dither" data-dither='{"ramp":"linear-x"}'>` and the viewer runtime draws it from `@turboslide/effects` (the deck's `drawDither`, tail:104-114: one cell per canvas pixel at half CSS size, `bayer8(y, x) / 64 < 1 - x / W`, upscaled with `image-rendering: pixelated`).
- `html` escape blocks are emitted with their CSS scoped under a generated class `.ts-x-<slideId>-<blockId>`, never unscoped, and with `<script>` and event attributes stripped.

`renderDeck(deck, opts)` renders every slide with the frame; `renderStandalone(deck, build)` is `build-deck.mjs` as a function (fonts inlined at `<!--FONTS-->`, every asset a data URI by its `inline` rule with two-color PNG detection at 98 percent extremes, native JPEG q88, resample to 1280 at q78, pass-through, the theme boot script, the size budget assertion); `renderThumb(deck, slideId, theme)` is the slide without chrome and chips.

### 5.3 Three surfaces, one HTML

| Surface                                            | What runs                                                                                                                                                                                                                         | Notes                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser editor and viewer (`apps/studio`)          | `renderSlide` output set as `innerHTML` of the `.ts-stage` inside the React `Sheet`; React owns chrome, overlays and view state only                                                                                              | A slide re-renders when its JSON changes; then `drawDither()` runs on every `canvas.dither` and materials mount on `[data-type="material"][data-live]`                                                                                                                                                      |
| Static viewer and the Prototemplate `/deck` iframe | `renderStandalone` writes one HTML file with `packages/viewer/standalone` (tail.html ported, framework free, feature frozen)                                                                                                      | The `gt-theme` and `gt-deck-slide` `postMessage` protocol and the `#NN` hash contract are preserved; the studio also writes `#s/<slideId>` as the stable form                                                                                                                                               |
| Rasters (`@turboslide/headless`)                   | Playwright loads `renderDeck` output from a temp file at 1600 by 900, `deviceScaleFactor` 1 or 2, `reducedMotion: 'reduce'`, theme seeded in `localStorage` and stamped on the root, present mode so the sheet fills the viewport | Readiness replaces the 220 ms settle: `document.fonts.load()` for every face the slide uses, `img.decode()` on every visible image, dither canvases drawn, material anchors present, two animation frames. Measured: the settle is two thirds of the 321 ms p50 per slide today (slides report section 2.2) |

Determinism rules: fixed viewport and scale; reduced motion; seeded theme; inlined fonts; the full Chrome for Testing binary with `--use-gl=angle --use-angle=metal --ignore-gpu-blocklist` on macOS and `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` on Linux CI (https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md; Chrome 137 removed the automatic fallback, https://developer.chrome.com/blog/supercharge-web-ai-testing); shader materials drawn from stored frames only; dither canvases drawn from the block's parameters so both themes share cells; the `renderer` string recorded in every `RenderRecord`.

### 5.4 Dither and shader nodes

The `dither` block and the `two-tone` treatment share one implementation in `@turboslide/effects`: `bayer8(r, c)` as the deck's permutation of 0 to 63 (tail:100-103), `ditherRamp(w, h, theme)` for the canvas, and `twoTone(rgba, params)` for pictures: cover fit to 800 by 450 with a pinned Lanczos3 kernel, grayscale with the integer 299/587/114 luma or one channel, invert, autocontrast at 0.5 percent, black and white points, gamma, blur, minimum filter, unsharp band, threshold `(m + 0.5) / 64`, 2x nearest to 1600 by 900, polarity, and the inverted light twin (`OPENERS.md:31-39, 141-149`). It returns both twins as 1-bit PNGs through the pure Node encoder (measured 12 ms for 3200 by 1800, slides report section 3.2) and the metrics the rounds computed by hand: lit fraction, lit cells under the plate and in the 30 px band, nearest lit cell, a uniform-screen warning (over 92 or under 8 percent lit) and a blank-twin warning. For 2x exports the pipeline scales the 800 by 450 one-bit image 4x nearest instead of screenshotting the 1x asset, because a 2x screenshot of a 1x JPEG is bilinear and soft (measured on slide 1, slides report section 2.5).

Materials are assets with a recipe, following Glyphfield's frame contract: a saved frame is a lossless PNG of the ready renderer plus its editable recipe plus a time anchor, and a timestamp alone is not an image (`glyphfield/docs/shader-frame-contract.md`). The catalog in `@turboslide/materials` lists `paper:*` (Paper Shaders) and `proto:*` (the Prototemplate direction engines: event horizon, chroma flow, glyph rain, lens gate, singularity ring, liquid metal, gem smoke; ported only if open question 9 says so) with uniform schemas and brand palette presets. In the editor a material mounts on the main thread inside the stage with `setUniforms`, `setMinPixelRatio(2)` and `setMaxPixelCount(3200 * 1800 + 1)`. Capture is a headless job: mount at 1600 by 900 with `deviceScaleFactor` 2, wait `settleMs`, take frames at the requested anchors, store the chosen frame as `assets/<id>@2x.png` with `recipeKey = sha256(materialId, uniforms, size, timeMs, backend)`. Metal and SwiftShader produce different pixels for the same shader (measured 4.8 versus 8.5 percent lit, slides report section 2.3), so the backend and renderer string are recorded and a frame is never regenerated silently. Live shaders in the viewer are M6, presenter only, behind GPU detection with the frame as fallback; everywhere else the frame is the picture.

### 5.5 Sheet scaling and viewer modes

The stage is the deck's: `.ts-sheet` 1600 by 900 with the `--edge` ring and the two spread shadows (head:255), `.ts-stage` scaled by `transform: scale(k)` with `transform-origin: 0 0`, k from the container with 28 px padding (12 px when narrow). Thumbnails and book pages scale by `--k = (frameWidth - 2) / 1600` and every block must render from 0.14x to 0.6x (report 03 section 1). Grid tiles are 300 px minimum with sections as row-spanning labels; book mode builds lazily on first entry with a 128 px number column and 16:9 page frames and tracks the visible page with an `IntersectionObserver` at `-42%` root margin (tail:159-206). Full-picture slides paint the `.backdrop` across the stage in slide mode only (head:249-254). Static thumbnails from the render worker (480 by 270 PNGs per theme at the current revision) replace live clones in M3, with the live clone as the fallback while a render is pending.

## 6. Editor

Serves: parity by named actions. The editor is the first client of the action table after the CLI; nothing in it reaches the document except through a `Write`.

### 6.1 Layout of `/edit/:deckId`

```
+--------------------+---------------------------------------------------------------+--------------------+
| sidebar 208/256    | toolbar 52: [list] [prev] 12 / 85 [next] | Slide Grid Book |     | inspector 460      |
|  head: mark, title |   [Search ⌘K] [Edit|View] [Twin] [Lint n] [Source] Theme Present | sections:          |
|  filter field      +---------------------------------------------------------------+   Slide            |
|  tree:             | stage (plate ground)                                          |   Layout           |
|   Brand            |   +-----------------------------------------------------+     |   Block <type · id>|
|    01 Brand        |   |  sheet 1600x900 scaled; selection ring on a block   |     |   Asset            |
|    02 Title        |   +-----------------------------------------------------+     |   Lint (n)         |
|   Design system    |                                                               |   Versions         |
|    ...             +---------------------------------------------------------------+   History          |
|                    | progress 2px                                                  |                    |
+--------------------+---------------------------------------------------------------+--------------------+
                     | source drawer (slides up over the stage): JSON, Apply, Reset, Copy as command, Close      |
```

Search params carry view state so links reproduce a view: `?mode=slide|grid|book`, `?edit=1`, `?theme=light|dark`, `?twin=1`, `?lint=1`, `?src=1`; the slide is the hash (`#12` for existing links, `#s/<slideId>` as the stable form the studio writes). A status chip left of Search reads `Saved · r412`, `Unsaved` or `Conflict` and opens the versions list.

### 6.2 The sidebar tree

Prototemplate's sidebar (directive 8.5 in its `Sidebar.css`): a 52 px head with the mark, the deck title and the density Seg (Outline, Thumbnails), a 40 px filter row, then a scroll region of collapsible groups. Groups are sections; each header is a 24 px sticky row with a chevron, the name and a count from `data-count`; rows are slides at 28 px in outline density (derived number in tabular figures, title trimmed to 72 characters, a kind glyph from the sprite, a lint badge at severity 2 or 3, a lease dot when another author holds the slide) or 44 px in thumbnail density with a 64 by 36 capture in a `--pt-edge` frame. Headers and rows draw no rule; the tree reads by indentation and the 16 px gap above a header. The current row draws the 2 px ink bar at the column's edge. Rows carry `data-preview="<slideId>"` for the hover preview layer. Drag a row to reorder within or across sections: `slide.move`. A row's menu offers Insert after (a kind picker), Duplicate, Move to section, Delete, Render, Lint this slide, Copy id. The filter matches title, section and block text.

### 6.3 The toolbar, the Seg and the palette

The toolbar is `Toolbar.css`: two groups with 8 px gaps, the left group gives way, labels collapse in four measured tiers. Left: list toggle, brand while the sidebar is closed, previous, the count as a button (digits then Enter), next. Right: the Search pill (`⌘K` chip, `Ctrl K` off Apple); the studio's own slot (an `Edit | View` two-option Seg, Twin, Lint with a count badge, Source); the mode Seg `Slide | Grid | Book`; Theme (◐ light, ◑ dark); Present (the one solid button, Title Case); Fullscreen; Copy link; Help. Editing is a property of the stage rather than a mode, so viewer and editor share one toolbar and preview equals product.

`Palette.tsx` is `Search.tsx` grown into a command palette: a 34 px field with a count, ruled result rows grouped under 12.5 px titanium labels, arrows, Enter, Escape, every slide row carrying `data-preview`. Groups: Go to slide (fuzzy over titles and ids, showing the section), Insert (the six kinds and every block allowed in the current selection, with the block's constraint as a hint: "Plain list, 24 px rows, icon at row start"), Actions (every action-table entry with a `label`, with its key), View (modes, theme, twin, lint layer, present), Versions (the last ten with author and note). Typing `>` restricts to actions, `#` to slides, `+` to blocks. Because the palette lists every labeled action, anything an agent can invoke a human can find by name.

### 6.4 The stage in edit mode

An overlay positioned over the stage draws, from block boxes measured with `getBoundingClientRect` divided by `k`: a `--pt-hair` outline under the pointer, the `--pt-ink` selection ring with a 13 px chip naming `type · id` outside the ring, and lint boxes for the selected slide when the lint layer is on (severity 3 in `--pt-ink`, 1 and 2 in `--pt-titanium`, all 1 px, the rule id in the chip). Selection is by click on the innermost `[data-block]`; Tab and Shift Tab walk blocks in document order; Escape steps back from text edit to block to nothing.

Direct manipulation exists only where the grammar has a property to move:

| Gesture                                                                  | Mutation                            | Limit                                                                                                                              |
| ------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Drag a slide row or a grid tile                                          | `slide.move`                        | within and across sections                                                                                                         |
| Drag a block up or down inside a slot, or across the two slots of `cols` | `block.move`                        | never out of a plate                                                                                                               |
| Drag the column seam of `cols`                                           | `slide.set /layout/ratio`           | snaps to 5/7, 4/8, 1/1, then 10 px steps                                                                                           |
| Drag the key column edge of `rows`                                       | `block.set /key`                    | snaps to the key set                                                                                                               |
| Drag the plate's right edge on a full-picture slide                      | `slide.set /plate/maxWidth`         | 20 px steps up to the kind's cap                                                                                                   |
| Drag a plate to the other side                                           | `slide.set /plate/side`             | the sides its kind allows                                                                                                          |
| Drag a `scales` marker                                                   | `block.set /items/i/value`          | integer 0 to 100; the marker is derived, so the two cannot disagree                                                                |
| Resize a `shot`                                                          | `block.set /width`                  | snaps to the column width, 425 and the slot height                                                                                 |
| Alt-drag a label or marker in a declared `dia` (M5)                      | `block.set /data/…`                 | half-pixel grid, 12 px clearance shown live                                                                                        |
| Double-click text                                                        | `text.replace`, coalesced at 400 ms | `contenteditable` on the run element; the run toolbar has weight 500 and link; a typed standalone `GT` renders as the mark at once |

There are no free x and y, no resize handles on text, no z-order, no rotation. The `html` block shows a titanium hatch and its severity 2 lint.

### 6.5 The inspector

460 px, generated from the Zod schema of the selected object; there is no hand-written form per block. A `z.enum` with four or fewer options becomes a Seg, more becomes a select; a number with a `snap` annotation becomes a stepper through the set (key widths 90, 120, 150, 180, 190, 200, 220, 240, 250, 300); a boolean becomes a check row; `Text` becomes a textarea in the inline markup with a live copy lint; `Icon` becomes the sprite picker with a tone Seg `none | ok | warn | no | info` and a note stating where icons are allowed; `AssetId` becomes the asset picker showing both twins, credit and license. Sections: Slide (kind, section, notes, title override), Layout (type, ratio or gap, head variant, body alignment), Block (the selected block's properties), Asset (twins, alt, credit, license, treatment parameters with the live two-tone preview from `dither.worker.ts` and its metrics, Recapture), Lint (this slide's findings from the same linter the CLI runs, click to select the block, Fix where `fix` exists), Versions (author, note, revision, Restore), History (the mutation log with Undo to here). Every control has an accessible label of the form `<block id>: <property label>` (`list: Size`) and a locale-independent `data-control="block.list.size"`; the window API matches either.

### 6.6 The source drawer

The selected slide's JSON (or the manifest) in CodeMirror 6 with JSON Schema completion from `@turboslide/schema`, beside the live sheet, with Apply, Reset, Copy, Copy as turboslide command, Close. Apply runs the validator, shows issues inline at their pointers, and commits one `slide.replace` with the current `baseRevision`; the drawer registers itself as a delegating automation owner so `applySource` from an agent and Apply from a designer are one code path (`glyphfield/src/components/SourceCodeDrawer.tsx:292-302`). An external write to the same slide appears as an external revision banner with the author and a Reload action; the designer's unsaved text is never overwritten silently.

### 6.7 Undo, versions, leases, conflicts

Every gesture becomes a `Write`; typing coalesces into one `text.replace` per 400 ms pause per block. Writes go through the reducer in the browser for optimism and then the server function `writeDeck`, which is the authority. Undo and redo walk the client's log; each undo is itself a forward write carrying the inverse mutations, so the server log stays linear and an agent's later write never silently undoes a designer's redo (from design B). `⌘S` saves a named version through `version.save`; `version.restore` is a mutation, so it is undoable and visible in History. External changes arrive over the store's watch channel as a new revision; the editor rebases pending local mutations when they touch other slides and shows a conflict card with both versions when they touch the same block.

Per-slide leases replace the rounds' prompt rule "edit only the files your task names": `slide.lease` takes ten minutes on a slide for an author; a write to a leased slide by another author is rejected with 409 carrying the holder's name and the current document unless `force` is set; the sidebar shows the lease dot; leases expire and can be released. Whole-deck writes (`section.set`) take no lease and are ordered by `baseRevision`. Leases are advisory in M3 and enforced for agent writes in M4.

### 6.8 Theming and the twin view

`D` flips chrome and sheet together through the `gt-theme` key, as the deck does. Twin (`⇧D`, or the toolbar button) splits the stage into two sheets at half scale, light left and dark right, each its own `.ts-sheet[data-theme]`, both driven by the same document, with selection and lint boxes on both, so the grammar's rule "look at both themes after every edit" is a permanent view instead of a toggle. Theme boots from `gt-theme` then `gt-deck-theme`, defaults to dark, never consults `prefers-color-scheme`, propagates through `storage` events and the `{ type: 'gt-theme', theme }` message, and `applyTheme()` swaps every `img[data-dark]` and redraws dither canvases (tail:220-230). The inspector shows the deck's nine tokens read only, labeled "deck tokens", and never the site's opacity ladder from slide 18 (report 03 section 2).

### 6.9 Keys

The shell keys come from `useShellKeys` unchanged: Right, Space, PageDown, J, L next; Left, PageUp, Backspace, K, H previous; Down and Up in book mode; Home and End; digits then Enter with the 1500 ms toast; G grid, B book, P present, F fullscreen, `[` or S sidebar, D theme, `?` help, `⌘K` search. Edit mode adds: E toggles edit; Tab and Shift Tab select blocks; Enter starts text editing; `⌘B` run; `⌘K` link while text is selected; `⌘Z` and `⇧⌘Z`; `⌘S` version; `⌘/` source drawer; `⌘L` lint layer; `⇧D` twin; `⌘D` duplicate slide; Delete removes the selected block after a toast with Undo. Keys are inert inside inputs except Escape.

### 6.10 The presenter

`/present/:deckId` is a two-window tool: the console shows the current slide, the next slide at 0.3 scale, `notes`, an elapsed timer with reset, the clock and the progress; `?screen=1` shows the sheet alone in present mode. The two sync through `BroadcastChannel('turboslide:<deckId>')` with `localStorage` as fallback, and `view.goto` (and the MCP tool `deck_goto_slide`) drives both. Materials run live on the audience screen when the GPU allows and open question 11 says yes; the console always shows frames.

## 7. Agent surface

Serves: discoverable, parity by named actions, lintable, verified by artifact.

### 7.1 One action table

`packages/schema/src/actions.ts` is one typed constant. Each entry has an id, a Zod input and output, a `label` for the palette, a `mutates` flag, the `transports` it is offered on (`cli`, `mcp`, `http`, `window`), and one sentence of documentation. `pnpm generate:contracts` writes the CLI option parsers, the MCP tool list, `describe().actions`, the OpenAPI 3.1 document, the skills' reference tables and `docs/grammar.md` into committed files, and a stale-file test fails CI when any committed output differs from a fresh generation, from M1 (from design B). A coverage test asserts every action has a test and a doc row (from design C).

| Action id                                                                                              | Input (abridged)                                                                     | Output                                                             | Mutates      | Transports                   | CLI                                                                          | MCP tool                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------ | ---------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `deck.info`                                                                                            | `{}`                                                                                 | title, theme, sections with slide ids and titles, counts, revision | no           | all                          | `turboslide info`                                                            | `deck_get_info`                        |
| `slide.list`                                                                                           | `{ sectionId? }`                                                                     | `[{ id, n, section, title, kind, lint: { s3, s2 } }]`              | no           | all                          | `turboslide slides`                                                          | `deck_list_slides`                     |
| `slide.get`                                                                                            | `{ slideId }`                                                                        | the normalized slide, its assets, its last render record           | no           | all                          | `turboslide slide get <id>`                                                  | `deck_get_slide`                       |
| `slide.insert`                                                                                         | `{ sectionId, after?, slide, baseRevision }`                                         | `{ slide, revision, outline }`                                     | yes          | all                          | `turboslide slide insert --section <s> --after <id> < slide.json`            | `deck_insert_slide`                    |
| `slide.remove`                                                                                         | `{ slideId, baseRevision }`                                                          | `{ revision, outline }`                                            | yes          | all                          | `turboslide slide remove <id>`                                               | `deck_remove_slide`                    |
| `slide.move`                                                                                           | `{ slideId, sectionId, after?, baseRevision }`                                       | `{ sections, revision }`                                           | yes          | all                          | `turboslide slide move <id> --to <s> --after <id>`                           | `deck_move_slide`                      |
| `slide.update`                                                                                         | `{ slideId, baseRevision, mutations }`                                               | `{ slide, revision, findings }`                                    | yes          | all                          | `turboslide slide patch <id> --set /layout/ratio=4/8`                        | `deck_update_slide`                    |
| `slide.replace`                                                                                        | `{ slideId, baseRevision, slide }`                                                   | `{ slide, revision, findings }`                                    | yes          | all                          | `turboslide slide put <id> < slide.json`                                     | `deck_replace_slide`                   |
| `block.set`, `block.insert`, `block.remove`, `block.move`                                              | as the mutations plus `baseRevision`                                                 | `{ slide, revision, findings }`                                    | yes          | all                          | `turboslide block set <slide>#<block> /key 180`                              | `deck_update_block` and `deck_*_block` |
| `section.set`                                                                                          | `{ sections, baseRevision }`                                                         | `{ sections, revision }`                                           | yes          | all                          | `turboslide sections set < sections.json`                                    | `deck_set_sections`                    |
| `slide.lease`                                                                                          | `{ slideId, minutes?, force? }`                                                      | `{ until, holder }`                                                | yes          | all                          | `turboslide lease <id> [--force]`                                            | `deck_lease_slide`                     |
| `asset.add`                                                                                            | `{ file or url, role, alt, source, treatment?, credit? }`                            | the asset with twins and metrics                                   | yes          | all                          | `turboslide asset add photo.jpg --role mood --two-tone --black 24`           | `deck_asset_add`                       |
| `asset.dither`                                                                                         | `{ assetId, treatment, plate? }`                                                     | twins, metrics                                                     | yes          | all                          | `turboslide asset dither <id> --gamma 1.1 --plate lower-left`                | `deck_asset_dither`                    |
| `asset.capture`                                                                                        | `{ url, viewport, scale, theme, region?, recipe }`                                   | the asset                                                          | yes          | cli, mcp, http               | `turboslide asset capture https://… --theme both --region 0,0,2880,400`      | `deck_asset_capture`                   |
| `material.capture`                                                                                     | `{ materialId, uniforms, size, anchors }`                                            | frames as assets with recipe keys                                  | yes          | all                          | `turboslide material capture paper:liquid-metal --anchor 4000,5500,7000`     | `deck_material_capture`                |
| `render.slide`                                                                                         | `{ slideIds or 'all', themes, scale, format }`                                       | `RenderRecord[]` plus image paths (MCP returns image content)      | no           | all                          | `turboslide render [ids] --theme light,dark --out preview/ --json`           | `deck_render`                          |
| `render.sheet`                                                                                         | `{ slideIds, themes, cols, thumb, numbered, overlay?: 'lint' or 'plate' }`           | sheet images plus a JSON cell map (cell boxes to slide ids)        | no           | all                          | `turboslide sheet all --cols 4 --thumb 480 --overlay lint`                   | `deck_sheet`                           |
| `lint.run`                                                                                             | `{ slideIds or 'all', layers: 'static' or 'rendered' or 'both' }`                    | `Finding[]`                                                        | no           | all                          | `turboslide lint [ids] --json` (exit 1 on severity 3 beyond the baseline)    | `deck_lint`                            |
| `fix.run`                                                                                              | `{ slideIds, rule?, dryRun }`                                                        | writes applied, findings remaining                                 | yes          | all                          | `turboslide fix [ids] --rule <id> --dry-run`                                 | `deck_fix`                             |
| `diff.run`                                                                                             | `{ from, to?, render? }`                                                             | `Mutation[]` in prose plus optional before and after crops         | no           | all                          | `turboslide diff 400 412 --render`                                           | `deck_diff`                            |
| `version.save`, `version.list`, `version.restore`                                                      | `{ note }`, `{}`, `{ n, baseRevision }`                                              | `Version`, `Version[]`, `{ revision }`                             | yes, no, yes | all                          | `turboslide version save -m "…"`                                             | `deck_version_*`                       |
| `judge.bundle`                                                                                         | `{ slideIds, out }`                                                                  | a directory with renders, sheets, records and findings             | no           | cli, mcp                     | `turboslide judge bundle --out .turboslide/judge/`                           | `deck_judge_bundle`                    |
| `view.goto`, `view.mode`, `view.theme`, `view.present`                                                 | `{ slideId }`, `{ mode }`, `{ theme }`, `{ on }`                                     | the view state                                                     | no           | window; `view.goto` also mcp | none                                                                         | `deck_goto_slide`, `deck_set_view`     |
| `export.run`                                                                                           | `{ format, mode, theme, fonts: 'exact' or 'standard', headings?: 'raster', verify }` | `ExportReport`                                                     | no           | all                          | `turboslide export pptx --mode flatten --theme light --verify`               | `deck_export`                          |
| `build.run`                                                                                            | `{ out, budgetMB, quality? }`                                                        | path, size, assertions                                             | no           | all                          | `turboslide build --out public/brand-deck.html --budget 16`                  | `deck_build`                           |
| `import.run`                                                                                           | `{ from, into }`                                                                     | the import report                                                  | yes          | cli                          | `turboslide import /Users/kevinliu/repos/Prototemplate/deck --into gt-brand` | none                                   |
| `validate.run`                                                                                         | `{ path }`                                                                           | issues and the normalized document                                 | no           | all                          | `turboslide validate decks/gt-brand`                                         | `deck_validate`                        |
| `source.read`, `source.apply`, `controls.list`, `control.activate`, `control.set`, `artifact.download` | Glyphfield's six standard actions                                                    |                                                                    |              | window                       | none                                                                         | none                                   |

Every mutating action requires `baseRevision` and rejects a stale one with 409 and the current document; every write returns the normalized result so the agent's re-read is free. Errors follow Glyphfield's classes: `TypeError` for malformed input with the Zod path, `RangeError` for an unknown action, label or id, `ConflictError` (HTTP 409) for a stale `baseRevision` or a held lease with the holder attached, plain `Error` for renderer and codec failures.

### 7.2 The CLI

`apps/cli` is the file transport and works with no browser page open, which is why it ships first. Global flags: `--deck <dir>` (default: the nearest `deck.json` upward), `--json` (machine output on stdout, human output on stderr), `--author <name>` (defaults to `$USER`; agents pass `--author agent:<runId>`; `TURBOSLIDE_AUTHOR` is honored). Exit codes: 0, 1 (findings at the gate or a verify failure), 2 (usage or validation error). Derived files land under `.turboslide/`.

- `turboslide render all --theme light,dark --out preview/` writes `preview/<nn>-<slideId>-<theme>.png` and `preview/render.json` (`RenderRecord[]`). Exit 1 on any page error. The overflow list prints as `slideId#blockId x,y wxh`.
- `turboslide sheet all --cols 4 --thumb 480 --numbered` writes `preview/sheet-light.png` and `preview/sheet-dark.png` with section labels between groups, and `preview/sheet-<theme>.json` mapping cell boxes to slide ids so a judge reading a sheet addresses slides by id; `--overlay lint` draws finding boxes; `--overlay plate --kind opener` draws the plate rectangle on candidate pictures.
- `turboslide lint all --json` prints `Finding[]` and exits 1 when any severity 3 finding is not in `known-findings.json`; `--rule <id>` filters; `--baseline` rewrites the known list after review.
- `turboslide fix [ids] --rule <id> --dry-run` applies the `fix` mutations of findings that carry one and reports what remains.
- `turboslide slide get|put|patch|insert|remove|move`, `turboslide block set`, `turboslide sections set`, `turboslide version save|list|restore`, `turboslide lease` are the typed write path over files with `--base-revision` (defaults to the current revision when omitted, which is the convenience mode for a human at a shell; agents should pass it).
- `turboslide diff 400 412 --render` prints the mutation log in prose ("slide `state`: row `dashboard` value text changed") with before and after crops of each touched block; `--staged` diffs against the last version.
- `turboslide judge bundle --out .turboslide/judge/` packages renders, sheets with cell maps, render records and findings for a harness run.
- `turboslide build --out … --budget 16` prints size and the inlining decisions per asset class and fails over budget.
- `turboslide export pptx --mode flatten|native --theme light --fonts exact --verify` writes the files and `export-report.json` and exits 1 when `passed` is false.
- `turboslide import`, `turboslide validate`, `turboslide info`, `turboslide slides`, `turboslide asset add|dither|capture`, `turboslide material list|capture`, `turboslide fonts build`, `turboslide serve --port 4321`, `turboslide mcp`.

### 7.3 The MCP server

`packages/mcp` wraps the action table with `@modelcontextprotocol/sdk`: tools named `deck_<action>` with JSON Schema from Zod, resources `deck://manifest`, `deck://grammar` (the rule table as JSON plus the prose grammar), `deck://catalog/blocks`, `deck://catalog/icons`, `deck://catalog/materials`, `deck://theme`, `deck://slides/<id>`, `deck://lint`, `deck://render/<id>/<theme>` (image content), and one prompt `deck_review` that returns the judge lens instructions. Transports: stdio (`turboslide mcp`, ships in M2 over the file store, for Claude Code and IDEs) and streamable HTTP at `/mcp` in the studio (M4) for hosted clients. Render tools return image content alongside the JSON record; `deck_sheet` returns the image plus the cell map. Resolution: design A had MCP in M3 and design B in M4; the spec ships the stdio server in M2 because it is a generated wrapper over the action table and needs no browser, and adds the HTTP transport and the view tools with the studio in M4. This is Slidev's grain (https://sli.dev/features/mcp) plus render, sheet, lint, fix, diff, versions, leases, assets and export. An MCP App preview (https://tldraw.dev/blog/tldraw-mcp-app) is a later option.

### 7.4 The window API

`window.turboslide.studio` is `glyphfield/src/lib/studioAutomation.ts` copied with the names changed and attributed in `THIRD_PARTY_NOTICES.md`: `version`, `describe()`, `controls()`, `activate(label)`, `set(label, value)`, `readSource()`, `applySource(doc)`, `invoke(action, input)`, `download(artifact)`, and a `turboslide:studio-api-ready` event carrying `describe()`. The ownership model is Glyphfield's exactly: adapters are registered by the component that owns state with an `owner` element; the `studio` getter resolves the last registration whose owner is connected and not under `[inert]`, `[hidden]`, `[aria-hidden="true"]` or `[data-active="false"]`; a `MutationObserver` on those attributes only dispatches the ready event when the active adapter changes; controls are found by normalized accessible label from `aria-label`, `title`, `name`, `aria-labelledby` or the wrapping `<label>`, and additionally by `data-control` id; a missing label throws `RangeError` naming it; `set` writes native values and dispatches `input` and `change`; `applySource` runs the validator then waits two animation frames; `invoke` handles the six standard actions and delegates the rest to the adapter (`studioAutomation.ts:17-330`). Owners: the editor when a deck is open (every action whose transports include `window`), the viewer in each mode (`view.*`, `render.slide`, `render.sheet`), the source drawer as a delegating owner, the presenter (`view.goto`, `view.present`). A vitest pins adapter lifetime across re-renders as `ToolShellAutomation.test.tsx:45-70` does; a Playwright spec seeds a deck only through the public API.

### 7.5 Skills

Four skills in Glyphfield's shape, each under 50 lines with one reference file (generated by `pnpm generate:contracts`) and a completion section, asserted by a test that they exist and that their tables match the action table:

- `skills/turboslide-create/SKILL.md`: write or revise slides in the grammar. Reference `references/grammar.md`: block rules with enumerations and archetype anatomy (opener plate lower left, 740 max, the sentence lists the section's slide families in order; mood plate lower right, 560 max, 44 px title; credit 15 px; mood placement rule).
- `skills/turboslide-api/SKILL.md`: discovery (`turboslide info`, `deck://grammar`, `/api/agent`), the write protocol (read, smallest change, write with `baseRevision` and `--author agent:<runId>`, re-read), leases, the mutation list, the error classes. Reference `references/actions.md`.
- `skills/turboslide-studio/SKILL.md`: the window API, labels and `data-control` ids, the source drawer, presenting. Reference `references/browser-api.md`.
- `skills/turboslide-verify/SKILL.md`: render both themes, read the sheet by its cell map, run lint, the judge lenses and the `Finding` schema, the export verification loop, the completion rules: an overflow finding is a failure; a severity 3 finding blocks the ship step; a resolved export call is not a verified export, read `export-report.json`; a frame timestamp is not an image; a resolved apply is only a React commit, wait for the render.

A root `AGENTS.md` carries the parity chain for a UI capability change: schema and migration, mutation, inspector control with label and `data-control`, action table entry, `pnpm generate:contracts`, skill reference, docs, tests, in that order; plus the dev-server rules (port explicit, no unbounded logs, never two dev servers on one checkout).

### 7.6 The judge loop

The rounds' pipeline becomes a documented procedure (`docs/judge-loop.md`) whose evidence the CLI produces and whose orchestration stays in Kevin's workflow harness, because agents are the judges:

1. `turboslide render all` and `turboslide sheet all --overlay lint` produce the evidence at revision N; `turboslide judge bundle` packages it.
2. `turboslide lint all --json` produces the mechanical findings; severity 3 beyond the baseline blocks the ship step with no agent involved.
3. Judges, one lens each with stable names (layout, visual consistency and dark mode, copy and case, accuracy, completeness, art direction), read the sheets by cell map first and then the renders, and receive the structured evidence alongside images: the render records' boxes, line counts, font sizes and weights, the lint findings, the numerals extracted per slide with their nouns. They return `Finding[]` with `slideId` and `blockId`, severity 2 and 3 only, evidence and a concrete proposal. Structured metrics beat model vision in the one rigorous measurement in the field (https://www.taivo.ai/building-a-google-slides-renderer-with-coding-agents/).
4. A skeptic per slide keeps or drops each finding and sharpens the proposal into `fix` mutations where it can; an accuracy refuter checks sources.
5. Fixers get one slide each under a lease, apply through `slide.update` or `turboslide fix`, re-render and re-lint, and report `verifiedBothThemes` and `residual`.
6. The ship gate: lint clean at severity 3, render with no page errors, build under budget, export verified when requested; the gate reads the revision so a claim is about revision N.

### 7.7 The grammar linter

Two layers in `packages/lint`: static rules on the document without a browser (`lintStatic(deck)`), rendered rules on `RenderRecord`s (`lintRendered(deck, records)`). Every finding names the slide, the block and a pixel box where one exists; mechanical rules carry `fix`. Rule ids are constants in the schema package so the docs table and the CLI's `--rule` filter are generated.

| Rule id                                  | Layer                                 | Severity | Check                                                                                                       | Fix | Source                                        |
| ---------------------------------------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------- |
| `sheet/overflow`                         | rendered                              | 3        | any `data-block` box outside 0..1600 by 0..900                                                              | no  | `DECK-GRAMMAR.md:15`, `shoot-slide.mjs:47-56` |
| `sheet/rail-touch`                       | rendered                              | 2        | a text box within 8 px of a rail or rule                                                                    | no  | `DECK-GRAMMAR.md:15`                          |
| `sheet/thumb-legible`                    | rendered                              | 1        | text under 2 px when the block renders at 0.14x                                                             | no  | report 03 section 1                           |
| `type/floor-15`                          | rendered                              | 3        | computed font size under 15 px on any text node                                                             | no  | `DECK-GRAMMAR.md:21`                          |
| `type/svg-label-min`                     | static (declared) and rendered (raw)  | 3        | diagram text under 18 px, or 18 px without `sm`                                                             | no  | head:157-160                                  |
| `type/weight-cap`                        | static and rendered                   | 3        | display weight above 500 outside `spec`                                                                     | yes | `DECK-GRAMMAR.md:20`                          |
| `type/face`                              | rendered                              | 3        | a font status of `fallback` for Inter                                                                       | no  | pptx report section 4.4                       |
| `type/sizes-ladder`                      | static                                | 2        | a heading or paragraph size outside the ladder                                                              | yes | head:59-65                                    |
| `color/tokens-only`                      | static                                | 3        | a color literal in `html` CSS or raw svg outside the sanctioned exceptions (swatch, panel, logoPlates)      | no  | `DECK-GRAMMAR.md:28`                          |
| `color/semantic-icons-only`              | static                                | 3        | a semantic hue on anything but an `Icon`                                                                    | no  | `DECK-GRAMMAR.md:30`                          |
| `icon/placement`                         | static                                | 3        | an icon outside a rows key, a plain row start, a board state or a dia; size not 20 or 24                    | no  | `DECK-GRAMMAR.md:40`                          |
| `icon/known`                             | static                                | 3        | an `IconName` not in the sprite                                                                             | no  | report 03 section 11 item 12                  |
| `rows/two-lines`                         | rendered                              | 2        | a row value taller than two line heights                                                                    | no  | `DECK-GRAMMAR.md:36`                          |
| `rows/key-snap`                          | static                                | 1        | a key width outside the snap set                                                                            | yes | report 03 section 11 item 6                   |
| `dia/label-clearance`                    | static for declared, rendered for raw | 2        | a label box within 12 px of a stroke                                                                        | no  | `DECK-GRAMMAR.md:45`                          |
| `dia/stroke-grammar`                     | static                                | 2        | stroke not 1 or 1.5, round caps or joins, filled arrowheads over 8 px, fill outside ink, paper, plate       | no  | `DECK-GRAMMAR.md:44`                          |
| `dia/fit-slot`                           | static                                | 1        | a `viewBox` width that does not equal its slot width                                                        | yes | report 03 section 1                           |
| `dia/half-pixel`                         | static                                | 1        | an odd-width stroke on an integer coordinate                                                                | yes | report 03 section 5.11                        |
| `asset/twin-or-border`                   | static                                | 3        | a `shot` or `pair` image with a `neutral` twin and no border                                                | yes | `DECK-GRAMMAR.md:56`                          |
| `asset/credit-on-plate`                  | static                                | 3        | a share-alike source whose credit is missing from the plate                                                 | no  | `OPENERS.md:255`                              |
| `asset/license-missing`                  | static                                | 2        | a photograph with no license record                                                                         | no  | report 06 section 4 item 9                    |
| `asset/stretched`                        | rendered                              | 2        | an image drawn at an aspect other than its file's, outside `crop`                                           | no  | `DECK-GRAMMAR.md:61`                          |
| `picture/plate-clear`                    | static (from metrics)                 | 2        | lit cells inside the plate rectangle or within 30 px of it                                                  | no  | `OPENERS.md:105, 176`                         |
| `picture/blank-twin`                     | static                                | 3        | a two-tone twin with lit fraction under 0.02 or over 0.98                                                   | no  | `OPENERS.md:251`                              |
| `picture/mood-placement`                 | static                                | 2        | a mood slide directly before an opener, or two mood slides adjacent                                         | no  | `OPENERS.md:137`                              |
| `opener/sentence-lists-section`          | static                                | 1        | the opener sentence does not mention each family in the section                                             | no  | `OPENERS.md:44`                               |
| `lines/law`                              | rendered                              | 2        | doubled hairlines within 4 px, junctions drawn twice, a border color outside the three roles                | no  | `lint-lines.mjs:1-28`                         |
| `copy/heading-period`                    | static                                | 3        | a heading, plate title or key ending in `.`                                                                 | yes | `DECK-GRAMMAR.md:22`                          |
| `copy/sentence-case`                     | static                                | 2        | a heading with Title Case outside the proper-noun and token lists (mode from `deck.json`, open question 13) | yes | `DECK-GRAMMAR.md:22`                          |
| `copy/token-first`                       | static                                | 2        | a heading starting with a product token                                                                     | no  | `DECK-GRAMMAR.md:22`                          |
| `copy/heading-is-name`                   | static                                | 2        | a heading containing a domain                                                                               | no  | `DECK-GRAMMAR.md:22`                          |
| `copy/no-em-dash`, `copy/no-exclamation` | static                                | 3        | the characters present                                                                                      | yes | `DECK-GRAMMAR.md:23`                          |
| `copy/no-eyebrow`                        | static                                | 2        | a short cap or all-caps line as the first block above a heading                                             | no  | `DECK-GRAMMAR.md:23`                          |
| `copy/full-sentence-caption`             | static                                | 1        | a caption without a terminal period                                                                         | yes | `DECK-GRAMMAR.md:23`                          |
| `copy/contrast-pair`                     | static                                | 1        | `not` followed by a comma clause, for the copy judge                                                        | no  | `DECK-GRAMMAR.md:23`                          |
| `copy/metaphor-candidate`                | static                                | 1        | a word list hit (journey, unlock, supercharge)                                                              | no  | `DECK-GRAMMAR.md:23`                          |
| `contrast/both-themes`                   | rendered                              | 2        | sampled text against ground under 4.5:1 (3:1 at 26 px and up) in either theme                               | no  | `DECK-GRAMMAR.md:61`                          |
| `layout/empty-half`                      | rendered                              | 2        | ink coverage under 2 percent in one column of a `cols` slide while the other exceeds 10                     | no  | `DECK-GRAMMAR.md:61`                          |
| `layout/pair-gaps`                       | rendered                              | 2        | unequal gaps in a `pair` or `details` grid beyond 2 px                                                      | no  | `DECK-GRAMMAR.md:61`                          |
| `layout/columns-aligned`                 | rendered                              | 2        | tops of side-by-side `rows` blocks differing by more than 1 px                                              | no  | report 03 section 11 item 4                   |
| `scales/marker-equals-value`             | static                                | 3        | a marker authored rather than derived; only possible in imported `html`                                     | no  | `DECK-GRAMMAR.md:61`                          |
| `escape/html-block`                      | static                                | 2        | an `html` block exists; export is raster for it                                                             | no  | report 05 section 6.1                         |
| `export/non-native`                      | static                                | 1        | a block that exports as raster in the requested mode, listed per export                                     | no  | design C section 6.7                          |
| `numbers/contradiction`                  | static, assisted                      | 1        | the same noun with different numerals across slides, for the accuracy judge                                 | no  | `DECK-GRAMMAR.md:61`                          |
| `count/hard-coded`                       | static                                | 3        | a numeral equal to the slide count inside copy that should derive from the deck                             | no  | report 06 section 4 item 2                    |

Metaphors, fragment rhythm and comma-tail headings stay with the copy judge; the linter flags candidates at severity 1 only.

## 8. Export

Serves: verified by artifact.

### 8.1 Scene extraction is a client of the renderer

`packages/export/src/scene/measure.ts` runs inside the rendered page through `page.evaluate` and walks `[data-block]` in document order, producing a `Scene` per slide per theme in sheet pixels: for every text element the computed style (family, weight, size, letter spacing, line height, color), the box, and the browser's line boxes from `Range.getClientRects()` grouped by top with the string split at rect boundaries by a per-character caret walk (the measured trap: a `.rows` key's inline `<svg>` returns an empty line group and must be skipped, pptx report section 6 item 1); for every hairline (borders of `.rows > div`, `.plain > span`, `.scale .bar`, the frame) its y and color; for plates and chips their boxes; for images the theme's twin and the `object-fit` crop; for every `RasterRef` an element screenshot at `deviceScaleFactor: 2` with `omitBackground` where `alpha` is true. `document.fonts.load('500 44px Inter')` is awaited before measuring (pptx report section 6 item 4). Units: 1 px is 0.6 pt and 7,620 EMU on the 13.333333 by 7.5 in PPTX page (`defineLayout` at 13.333333; 13.3333 is 30 EMU short, measured), and 0.45 pt and 5,715 EMU on the Slides default 10 by 5.625 in page.

### 8.2 PPTX

`packages/export/src/pptx/` emits through pptxgenjs 4.0.1, then post-processes the package with jszip.

Native mode. Slide masters `DECK_PAPER` per theme carry rails, rules and crosses as 0.6 pt lines in the composite colors, the wordmark as a 2x PNG and the counter as a text box (`sz="780" spc="16"`); `DECK_PICTURE` carries no chrome, and full-picture slides emit their chrome as alpha lines over the picture (`<a:alpha val="18000"/>` and `38000`, measured). Text boxes at `getBoundingClientRect / 120` inches with 0.02 in of width slack, `margin: 0`, `valign: 'top'`, no `fit`, `fontSize` in points (22 px is 13.2 pt, `sz="1320"`), `charSpacing` from the measured tracking (44 px at -0.025em is -0.66 pt, `spc="-66"`; negative values verified), `lineSpacing` in points (`<a:spcPts val="1980"/>` for 33 px), `paraSpaceBefore` and `After` from margins, one `softBreakBefore` per browser line so no renderer rewraps. Weight 500 travels as a family name because DrawingML has only a bold flag. Rows are five hairlines plus key and value boxes, never a PPTX table. Plates are `addShape('rect')` with `line: { type: 'none' }` (`width: 0` means 1 pt, measured). Pictures use `sizing: 'crop'` for `object-fit: cover`. Rasters are RGBA PNG at 2x or 3x (alpha survives byte for byte and composites in QuickLook, measured); `altText` carries the block id and, for frames, the recipe key. Notes through `addNotes`. Two files per export, light and dark, from one scene graph; a diff of light against dark checks that only colors and images changed.

Post-process (`ooxml/`): strip `kern="0"` from every tracked run (pptxgenjs emits it with each `spc`; kerning off costs -0.93 to +9.09 percent on Inter lines, measured; https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.runproperties); inject `ppt/fonts/*.fntdata` parts as EOT-wrapped static TTFs with the `application/x-fontdata` content type default, the relationships and `<p:embeddedFontLst>` after `<p:notesSz>`, one `<p:embeddedFont>` per family (PowerPoint requires each listed typeface unique and used, https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/e3870782-1f40-4ef1-a3a8-01ee13661283; the experiment's `embed-font.py` procedure; PowerPoint acceptance unverified); wrap each ruled row's line and two boxes in `<p:grpSp>` so a row moves as one object (pptxgenjs has no grouping, https://github.com/gitbrent/PptxGenJS/issues/307); store media parts without deflate (PNG and JPEG do not compress, measured).

Flatten mode. One 2x PNG of the whole sheet per slide as the slide background (with two-tone twins regenerated at 2x from the one-bit image) plus the native text layer emitted with `transparency: 100` (`<a:alpha val="0"/>`, measured), so the file is searchable and the text recoverable. Flatten is the only pixel-identical mode and is what Marp and Slidev ship (https://github.com/orgs/marp-team/discussions/82, https://sli.dev/guide/exporting).

### 8.3 Google Slides

`packages/export/src/gslides/` uses `googleapis` with the `drive.file` scope alone, which is non-sensitive and covers `create`, `batchUpdate` and `getThumbnail` (https://developers.google.com/workspace/slides/api/scopes). `presentations.create({ title })` (every other field is ignored, so the page stays 10 by 5.625 in, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create; the first live run reads `pageSize` back to confirm), then as few `batchUpdate` calls as the payload allows, each slide as `createSlide` BLANK with `objectId` from the slide id, `updatePageProperties` `solidFill` or `stretchedPictureFill`, `createLine` plus `updateLineProperties` at 0.45 pt with `lineFill.solidFill.alpha`, `createShape` TEXT_BOX plus `insertText` plus `updateTextStyle` (`weightedFontFamily { Inter, 400 | 500 }`, `fontSize` in PT, `foregroundColor` as floats) plus `updateParagraphStyle` (`lineSpacing` as a percentage of normal, 124 for 1.5 and 90.9 for 1.1 at Inter's 1.21 normal until calibrated), `createImage` from a signed Cloud Storage URL under 2 KB with a 15 minute TTL for every raster (https://developers.google.com/workspace/slides/api/guides/add-image), `groupObjects` for the rail set, and `writeControl.requiredRevisionId`. Notes need a second call (`pages.get` for `speakerNotesObjectId`, then `insertText`). The full request JSON for one slide is in the slides report section 1.2. Flatten mode is `stretchedPictureFill` per slide plus text boxes with `foregroundColor` alpha 0 (unverified; if Slides rejects transparent text the layer goes behind the picture). Quotas: 60 writes and 60 thumbnails per minute per user, 429 on excess, overage billing planned for later in 2026 (https://developers.google.com/workspace/slides/api/limits); the exporter paces with backoff and a full 85-slide two-theme verification takes about three minutes. Native mode losses no request fixes: letter spacing, exact pitch, text inset, image crop and transparency, SVG, custom geometry, OpenType features, optical size; headings run about 2.5 percent wider, so hard breaks and 2 px of slack keep the wraps, and `--headings raster` rasterizes headings for slides where the letterforms matter.

### 8.4 Fonts

The deck embeds InterVariable 4.001 with `opsz` 14 to 32 and `font-optical-sizing: auto`, so 15 to 31 px text uses an optical size no static Inter file has (pptx report section 4.10); `fsType` is 0, installable embedding. `scripts/build-fonts.py` cuts the export set once with fontTools `varLib.instancer` and `pyftfeatfreeze` (https://github.com/twardoch/fonttools-opentype-feature-freezer) into `packages/fonts/export/` with `fonts.json` mapping `(sizePx, weight, display)` to a family name. Resolution: design A defaulted to a three-family `standard` set and the look judge counted that a weakness; design C defaulted to per-size instances. The spec makes `--fonts exact` the default and keeps `--fonts standard` as the fallback for people who do not want twelve family names in a file.

| Family name emitted                           | Instance                                    | Used for                               | Set                |
| --------------------------------------------- | ------------------------------------------- | -------------------------------------- | ------------------ |
| `GT Inter Display`                            | opsz 32, wght 500, `cv11` and `ss01` frozen | h1 88, `.big` 72, h2 44, mood title 44 | exact and standard |
| `GT Inter Text 26`, `GT Inter Text 26 Medium` | opsz 26, wght 400 and 500                   | `.lead`, `.lab`                        | exact              |
| `GT Inter Text 24 Medium`                     | opsz 24, wght 500                           | `.plain`                               | exact              |
| `GT Inter Text 22`                            | opsz 22, wght 400                           | p                                      | exact              |
| `GT Inter Text 20`, `GT Inter Text 20 Medium` | opsz 20, wght 400 and 500                   | rows, dia text                         | exact              |
| `GT Inter Text 18`, `GT Inter Text 18 Medium` | opsz 18                                     | `.sm`, scale labels                    | exact              |
| `GT Inter Text 15`                            | opsz 15, wght 400                           | `.cap`, credit                         | exact              |
| `GT Inter Text 14`                            | opsz 14, wght 400                           | counter, specimen small                | exact              |
| `Inter`, `Inter Medium`                       | opsz 14, wght 400 and 500                   | everything under 44 px                 | standard           |

The prefix `GT Inter` is provisional until Inter's OFL is read for a Reserved Font Name (https://github.com/rsms/inter/blob/master/LICENSE.txt; open question 5). The set is installed on the render worker so LibreOffice renders with it and embedded into every PPTX; without it every renderer substitutes (measured: QuickLook drew a Times-class serif, widths differ by 2 to 13 percent, pptx report section 4.4). Google Slides always uses Google Fonts' Inter; which build it serves and whether `opsz` applies is undocumented (https://github.com/google/fonts/issues/3429). Keynote reportedly ignores embedded fonts and PowerPoint for the web is not listed among the versions honoring them (https://support.microsoft.com/en-us/office/benefits-of-embedding-custom-fonts-cb3982aa-ea76-4323-b008-86670f222dbc); `ExportReport.fonts.substitutedIn` names them.

### 8.5 The verification loop

`turboslide export … --verify` renders the exported file, not the exporter's intent, and writes `export-report.json` as an `ExportReport`:

1. PPTX: `soffice --headless --convert-to pdf --outdir out deck.pptx` (https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html) then `pdftoppm -r 120 -png` so the page is 1600 px wide; LibreOffice 26.8 in `apps/render-worker`'s Docker image (the first release with variable font support, https://blog.documentfoundation.org/blog/2026/08/26/libreoffice-26-8/, so the static set is the safe path). LibreOffice is not on Kevin's Mac, so the loop runs in Docker locally and on CI.
2. Slides: `presentations.pages.getThumbnail` at `LARGE` (1600 px wide, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail), one per slide per theme.
3. Diff against the Playwright reference at the same revision with pixelmatch at threshold 0.1 (https://github.com/mapbox/pixelmatch) and per-region budgets: flatten under 0.1 percent mismatched pixels; native per block, text ink boxes within 3 px horizontally and 1 px vertically (the QuickLook measurement), hairlines within 1 px, two-tone pictures cell exact where the target renders 1:1. Per-block offsets, not only a global score, land in `verify.blocks`.
4. Geometry re-check: read the PPTX XML back and assert no shape leaves 12,192,000 by 6,858,000 EMU; read the Slides presentation back against 9,144,000 by 5,143,500; `geometryInBounds` records it.
5. Calibration: a calibration deck (one text box per style, one line, one image) is exported and measured once per target and font set; the first-baseline offset, Google's normal pitch factor and default inset live in `packages/export/src/calibration/calibration.json` with the renderer versions that produced them, re-measured when the font set or renderer changes.
6. PowerPoint cannot run headless on Linux, so a PowerPoint for Mac and Windows pass is a scheduled manual step with a checklist in `docs/export-verification.md`: EOT acceptance, the first-baseline constant, `custGeom` counters on the GT mark, `normAutofit` never present.

Measured baseline on this machine (QuickLook, no Inter installed, first slide only): the text plus ruled table slide mismatched 2.13 percent of pixels light and 2.58 percent dark, hairlines and first baseline within 1 px (pptx report section 4.3), so geometry is right and the residual is the font.

### 8.6 The honest fidelity table

Verified means read back from the XML or measured in a render on this machine. Risk: low is antialiasing only; medium is a measurable difference calibration or a font set removes; high is a visible difference or a missing feature.

| Deck element                                     | PPTX                                                                                              | Google Slides                                                                   | Verified here                                                                             | Risk                                                            | Mode                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------- |
| Body, lead, caption, row text                    | text box, `sz` centipoints, `spcPts` pitch, margin 0, `<a:br/>` per browser line, per-size family | TEXT_BOX, `weightedFontFamily`, percent `lineSpacing`, hard breaks              | XML exact; baseline within 1 px in QuickLook                                              | low with fonts; medium in Slides (pitch percent, inset)         | native                       |
| Headings h1, h2, `.big`                          | same plus `spc -66` and `-108`, `GT Inter Display` with frozen `cv11`, `ss01`                     | no tracking, no features, about 2.5 percent wider; `--headings raster` optional | XML exact                                                                                 | medium in PPTX; high in Slides                                  | native, or raster in Slides  |
| Rails, rules, crosses                            | master lines `w="7620"` in composite colors; alpha lines over pictures                            | STRAIGHT lines at 0.45 pt, grouped; alpha over pictures                         | XML exact; within 1 px                                                                    | low; Slides' minimum honored weight unverified                  | native                       |
| Counter, wordmark                                | text box `sz="780" spc="16"`; mark as 2x PNG                                                      | text box; PNG                                                                   | XML exact                                                                                 | low                                                             | native text, raster mark     |
| Plates and paper chips over a picture            | rectangles at DOM boxes with `type: 'none'`; picture as `p:bg` blip                               | RECTANGLE; `stretchedPictureFill`                                               | XML exact; geometry read back                                                             | low                                                             | native plate, raster picture |
| Two-tone dithers                                 | 1-bit or palette PNG at 2x or 3x                                                                  | PNG from signed URL                                                             | byte identical; 71.99 percent cell exact and 17.96 percent grey at a 0.22 percent stretch | medium and unavoidable at any non-1:1 zoom                      | raster                       |
| Ruled tables `.rows`                             | five hairlines plus key and value boxes, grouped                                                  | lines plus boxes, grouped                                                       | XML exact; lines within 1 px                                                              | low                                                             | native                       |
| Ruled lists `.plain`                             | boxes plus hair-soft lines; `strike="sngStrike"`                                                  | same; `strikethrough`                                                           | XML                                                                                       | medium: strike color and thickness not controllable             | native                       |
| Semantic icons                                   | RGBA PNG at 3x                                                                                    | PNG                                                                             | byte identical; alpha honored                                                             | low                                                             | raster                       |
| GT mark, inline diagrams, iso plate              | `custGeom` possible (136 points) but no fill rule; PNG by default                                 | PNG only                                                                        | FREEFORM read back                                                                        | medium native; low raster                                       | raster                       |
| Shader materials                                 | frozen frame PNG with recipe key in alt text                                                      | PNG                                                                             | 43 ms to first frame, Metal and SwiftShader                                               | low                                                             | raster                       |
| Live dither canvas                               | 2x PNG                                                                                            | PNG                                                                             | crisp at 2x                                                                               | medium (greys under zoom)                                       | raster                       |
| Code panel                                       | text box on `#101010`, system mono                                                                | same with a Google mono font                                                    | not measured                                                                              | medium: face differs per machine unless a mono font is embedded | native                       |
| Speaker notes                                    | `addNotes`                                                                                        | `insertText` into `speakerNotesObjectId`                                        | three notes parts                                                                         | low                                                             | native                       |
| Invisible text layer (flatten)                   | `transparency: 100` gives `<a:alpha val="0"/>`                                                    | `foregroundColor` alpha 0                                                       | XML; Slides unverified                                                                    | low                                                             | native over raster           |
| Font embedding                                   | OOXML `.fntdata` post-process                                                                     | none (Google Fonts)                                                             | package valid, python-pptx reopens; QuickLook ignores                                     | high until PowerPoint confirms                                  | n/a                          |
| Weight 500                                       | a family name                                                                                     | `weightedFontFamily.weight` 500                                                 | n/a                                                                                       | medium in PPTX                                                  | n/a                          |
| 140 ms cut, live theme switch, shaders in motion | none                                                                                              | none                                                                            | n/a                                                                                       | dropped; one theme per file                                     | drop                         |

What is honestly not identical: native mode never matches glyph antialiasing, so the gate is a tolerance; `cv11` and `ss01` reach PowerPoint through the frozen family and never reach Slides; intermediate optical sizes exist only in PPTX exact mode; Slides has no letter spacing, exact pitch, inset, page size, image crop, SVG or custom geometry; weight 500 in PPTX depends on the embed or the install; two-tone dithers grey at any non-1:1 zoom in every office application; shaders, canvases and live theme do not exist in office formats; the GT mark stays a PNG until PowerPoint confirms `custGeom` fill of self-overlapping subpaths; PowerPoint's first-baseline constant, EOT acceptance, Keynote's handling of embedded fonts and the Drive import page size remain unverified until those applications are run.

## 9. Import of the GT deck

`turboslide import /Users/kevinliu/repos/Prototemplate/deck --into gt-brand` parses `parts/head.html` (to confirm the theme matches), every `slides/NN-*.html` with parse5, `SECTIONS` from tail:83 for the eight sections, and `shots/OPENERS.md` and `shots/DETAILS.md` for asset provenance, treatment parameters, credits, licenses and captions. It writes `decks/gt-brand/` and `import-report.json` with a per-slide row: id, kind, layout, blocks, scoped style rules consumed, rules left over, and whether an `html` block was needed and why. Slide ids are slugs from the file names (`05-why.html` becomes `why`); block ids follow document order (`h`, `p1`, `p2`, `list`, `fig`, `dia1`); `import-ids.json` maps source file and block path to id so a re-import keeps ids stable and findings, leases and MCP addresses survive (from design B). The count disappears; the 46 stale scoped class names vanish because the importer consumes the rules they scope.

| head.html class or pattern                                                                                                  | Block or property                                                                                                                                   | Slides                                     |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `section.slide.opener.s-opener` with the copied style block, `img.opener-img`, `.opener-plate`                              | `kind: 'opener'`, `picture`, `plate` lower-left; the style block is recognized as the known text and dropped                                        | 01, 16, 31, 42, 47, 56, 60, 79             |
| `.mood` with `.mood-plate`                                                                                                  | `kind: 'mood'`, plate lower-right                                                                                                                   | 06, 10, 24, 37, 45, 50, 58, 70, 81         |
| `.s-closing` with the plate at the top                                                                                      | `kind: 'closing'`, `mark`                                                                                                                           | 85                                         |
| `.left-mid` with mark, h1, lead                                                                                             | `kind: 'title'`                                                                                                                                     | 02                                         |
| `.center > .big`                                                                                                            | `kind: 'statement'`, `measure` from the inline `max-width`                                                                                          | 03                                         |
| `.cols`, `.cols.even`, `.cols.wide-right`; scoped `grid-template-columns` overrides                                         | `layout: cols` with ratio `5/7`, `1/1`, `4/8`, or `{ left: 390 }`, `{ left: 380 }`, `{ right: 568 }`                                                | 40 slides                                  |
| `.split`; scoped `gap` overrides; `.lay` flex columns                                                                       | `layout: split` with `gap` 56, 44, 40, 36, 32, 26                                                                                                   | 21 plus 4 `.lay`                           |
| `.split > .head` turned into a grid by scoped CSS                                                                           | `head: { cols: '5/7' or '4/8' }`                                                                                                                    | 21, 34, 38, 51, 55, 61, 62, 65, 72, 80, 84 |
| `h1`, `h2`, `.big`, `p`, `.lead`, `.cap`, `.muted`, `.max`, `.max-p`; inline margins                                        | `heading`, `paragraph` with `role`, `tone`, `measure`, `marginTop`; `<b>` to `*x*`, `<a>` to `[x](url)`, `.gt-word` to `GT`                         | everywhere                                 |
| `.rows` with `--key` inline or scoped, `.tight`, `.narrow`, `.links`, `.ic` in `b`                                          | `rows` with `key`, `tight`, `links`, items with `icon` and `ext`                                                                                    | 23                                         |
| `.plain` with `.ic` and `.no`; scoped size                                                                                  | `plain` with `size`                                                                                                                                 | 30, 53, 73, 83, 84                         |
| `.refs`, `.s09 .ex` (the re-implemented `.say`)                                                                             | `refs`, `say`                                                                                                                                       | 71, 12                                     |
| `.scales` with inline marker `left: NN%` and the center tick rule                                                           | `scales` with `value` and `centerTick`                                                                                                              | 11                                         |
| `.spec`, `.lang`, `.ladder`, `.swatches`                                                                                    | the specimen blocks                                                                                                                                 | 19, 20, 21, 18                             |
| `.shot`, `.shot.fit`, `.shot-wrap`, `figure` with `figcaption`; scoped caption size, `.crop`, `aspect-ratio`, fixed `width` | `shot` with `fit`, `captionSize`, `aspect`, `crop`, `width`                                                                                         | 12 slides                                  |
| `.pair`, inline `grid-template-columns` ratios, two images per figure                                                       | `pair` with `ratio`, `gap`, `figures[].assets`                                                                                                      | 34, 35, 36, 51, 55, 63, 76                 |
| `.refgrid`, `.dirs`, `.eng`, `.mats`, `.sizes`                                                                              | `tiles`; `markSizes`                                                                                                                                | 13, 69, 72, 77, 17                         |
| `.dgrid`, `.strips`                                                                                                         | `details` with `rowHeights`                                                                                                                         | 38, 65, 39                                 |
| `.board`                                                                                                                    | `board`                                                                                                                                             | 80                                         |
| `.panel`, `.panel.term`, `white-space: pre`                                                                                 | `panel` with `size`, `pre`, `term`, `marks`                                                                                                         | 44, 57, 59, 71, 78, 83, 84                 |
| `svg.dia`                                                                                                                   | `dia` with `svg` (raw) and `fit` inferred from the viewBox (522, 731, 418, 627, 639, 1326, 300 match `slot`); declared `data` is a later conversion | 23 diagrams on 20 slides                   |
| `canvas.dither`; the inline 4 by 4 table                                                                                    | `dither`; `matrix`                                                                                                                                  | 26                                         |
| standalone `<svg><use href="#gt-mark">`                                                                                     | `mark`                                                                                                                                              | 02, 15, 17, 85                             |
| `.lineage` with `#ffffff` plates                                                                                            | `logoPlates`                                                                                                                                        | 14                                         |
| `img src` and `data-dark`                                                                                                   | assets with twins; `OPENERS.md` and `DETAILS.md` supply source, license, credit, crop and caption                                                   | 117 references, 90 twins, 246 files        |
| anything left after the above                                                                                               | `html` with the residual scoped CSS and the section markup, `note` naming the rules                                                                 | see below                                  |

Escape count. With the twenty grammar blocks plus `tiles`, `details`, `board`, `matrix`, `logoPlates` and `markSizes` in the M1 catalog and the layout variants above, report 03 Appendix A leaves four escape candidates: 67 (the composite `.tools` and `.rig` figure grids), 83 (the `.two` grid with a `.fixed` plate beside a list), 84 (the `.proof` bench: a diagram, a terminal panel and a docs crop in one grid), and 25 (two three-row tables with forced 79 px row heights beside four example diagrams). Resolution: designs B and C estimated eight or nine because their M1 catalogs were smaller; the spec takes A's larger M1 catalog, so the M1 target is at most four `html` blocks out of 85, verified by `import-report.json`, and the `composite` block in M5 brings the deck to zero. The number is measured, not estimated, and it is the honest scope of the grammar.

Acceptance of the import is pixel based: every non-escape slide renders through Turboslide within 0.5 percent pixelmatch mismatch (threshold 0.1) of the Prototemplate `shoot-slide.mjs` render of the same slide at 1x in both themes on the same Chromium build (the expected differences are the `data-block` attributes, which do not paint, the chip and frame emission moving from slides to the engine, and the reference's JPEG quality 82).

## 10. Systems-level path

Measured first (slides report section 3): Rust and Go buy no throughput for the image work in scope. PNG decode of a 3200 by 1800 screenshot is 40 to 65 ms in every runtime and dominates; the Bayer dither is 5 to 9 ms in plain JavaScript and 5 to 7 ms in Go and Rust; the 1-bit PNG encode is 12 ms in a 60-line pure Node encoder against 15 ms in Rust and 40 ms in Go; sharp is the fastest RGBA PNG encoder at 52 ms against 172 ms for Rust's `png` crate and 225 ms for Go; the exact diff is 6 to 12 ms everywhere; the whole 85-slide, two-theme, 2x dither and encode pass is about 4 s of Node CPU against about 110 s of Chromium rendering.

The one measured argument for a native module is determinism: Pillow and Rust agreed to the bit on the dither at full resolution, but three Lanczos implementations disagreed on about 120 of 1.44 million cells and sharp's grayscale differs from the 299/587/114 luma in two pixels (slides report section 3.4). A designer approving a dither in the browser and an exporter producing it on a server must run the same arithmetic.

So the first module is `crates/turboslide-native`:

```
crates/turboslide-native/
  Cargo.toml            features: napi (napi-rs), wasm (wasm-bindgen); no default features
  src/resample.rs       Lanczos3 with the pinned kernel and edge rule, cover fit to 800 by 450
  src/tone.rs           integer 299/587/114 luma, channel pick, invert, autocontrast 0.5 percent, black and white points, gamma LUT, blur, min filter, unsharp band
  src/bayer.rs          bayer8 permutation, threshold (m + 0.5) / 64, 2x and 4x nearest
  src/png1.rs           1-bit PNG encoder (miniz_oxide)
  src/diff.rs           exact diff, pixelmatch-compatible perceptual diff, dssim (https://github.com/kornelski/dssim)
  src/lib.rs            two_tone(rgba, w, h, params) -> { dark, light, metrics }; diff(a, b, opts) -> report
```

Integration: napi-rs builds `packages/native/npm/<platform>/` prebuilt addons selected by `optionalDependencies` with `os`, `cpu` and `libc` (https://napi.rs/docs/introduction/getting-started); wasm-bindgen builds `packages/native/wasm/` for the editor's dither preview worker (https://rustwasm.github.io/wasm-bindgen/). `@turboslide/effects` exports `twoTone()` and `diff()` that use the addon or the wasm module when present and the TypeScript implementation otherwise; the CLI installs without a Rust toolchain; CI builds the native matrix only on tagged releases. The parity test runs the deck's twelve two-tone openers and moods from their recorded parameters through TypeScript, napi and wasm and asserts zero mismatched cells. It lands in M5 beside export verification, where dssim replaces pixelmatch's binary count as the text gate and the 170-pair verification runs in about 4 s across cores (extrapolated from the 329 ms worst case). Resolution: design B adopted the crate only if the TypeScript identity test failed on CI, design C adopted it in M6; the spec adopts it in M5 as the systems-level commitment Kevin asked for, with the TypeScript fallback kept so the CLI never depends on a native build.

Second candidate, on evidence only: resvg (https://github.com/linebender/resvg) for rasterizing declared `dia` blocks, the 63 icons in four tones and the GT mark without a Chromium page, estimated under 1 ms per icon against about 30 ms per element screenshot (not measured). Glyph rendering inside diagrams stays in Chromium until resvg's text output is compared against it.

Not planned: wgpu for headless shader frames, because Metal and SwiftShader already disagree and the stored frame is the truth. Go only as a standalone LibreOffice and PPTX geometry verification sidecar if a Node-free CI image is ever wanted; its PNG encoder measured slowest and it has no SVG or GPU story. Zig is not installed and not planned.

The real optimization target is the Chromium stage and it stays in TypeScript: the readiness signal instead of the 220 ms settle, one page per theme in parallel, the full Chrome for Testing binary with the ANGLE flags, each screenshot decoded once and the raw buffer shared by dither, diff and encode, and shader frames stored as content-addressed PNGs.

## 11. Security, licensing and hosting

Security.

- The agent HTTP surface (`/api/actions/:action`, `/api/agent`, `/mcp`, `/api/export`) is unauthenticated only on `localhost` in dev; every deployed instance requires a bearer token per deployment set through the environment, and server functions use `createCsrfMiddleware()` from `@tanstack/react-start/server` (https://tanstack.com/start/latest/docs/framework/react/guide/server-functions). Identity beyond a token is open question 3.
- Inputs are validated by the same Zod schemas on every transport; unknown fields are rejected with `unknown_field`; request bodies are capped (1 MB for writes, 25 MB for asset uploads); a stale `baseRevision` returns 409 and never overwrites.
- `asset.capture` and `createImage` URL handling are the two places Turboslide fetches or hands out URLs. Capture targets are restricted to an allowlist in `deck.json` (`captureHosts`) to prevent server-side request forgery; signed Cloud Storage URLs for Slides rasters carry a 15 minute TTL and are never logged.
- `html` escape blocks are rendered with `<script>`, `<iframe>`, `<object>` and event attributes stripped and their CSS scoped under a generated class; the renderer never emits unscoped author CSS. The standalone build inlines only assets from the deck directory.
- The render worker runs Chromium and LibreOffice inside its container with no credentials, reads only the job's temp directory, and is reached only through the studio facade. Chromium never runs in a Vercel Function or a Cloudflare Worker (Browser Run's limits are 3 concurrent browsers free and 60 s timeouts with no GPU statement, https://developers.cloudflare.com/browser-run/limits/).
- Secrets (the Google OAuth client, the storage bucket credentials, the bearer token) live in the environment and never in `deck.json`, versions or reports. `deck.json` may name a `captureHosts` list and nothing else that is deployment specific.
- Dev-server rules from the incident: ports explicit, `forwardConsole` off, no unbounded logs, one dev server per checkout, written into `AGENTS.md` for agents that run servers unattended.

Licensing.

- Paper Shaders: `@paper-design/shaders` 0.0.78 is Apache-2.0 with a NOTICE ("Paper Shaders, Copyright 2026 Paper"), measured from the package's own LICENSE and NOTICE files (pptx report section 4.11; https://github.com/paper-design/shaders). Turboslide may ship, modify and sell renders and must carry the LICENSE and NOTICE text in `THIRD_PARTY_NOTICES.md` and in the CLI and studio distributions. Glyphfield's `docs/library-routing.md` record (PolyForm Shield) is stale and is not relied on. Turboslide imports the package directly rather than extracting Glyphfield's 2,772-line `LiveMaterialCanvas`.
- Inter: SIL Open Font License; `fsType` 0 permits installable embedding; derived and renamed instances are permitted unless a Reserved Font Name is declared, which must be read from https://github.com/rsms/inter/blob/master/LICENSE.txt before the `GT Inter` families ship (open question 5).
- Heroicons: MIT (https://github.com/tailwindlabs/heroicons). Glyphfield: MIT; the `studioAutomation.ts` port is attributed.
- Photographs: the deck's mood images include CC BY-SA sources whose credit must appear on the plate (`OPENERS.md:255`). `asset/credit-on-plate` is severity 3; `Asset.source.photo` records origin, artist, license and `shareAlike`; `ExportReport` lists credits per file; an `--exclude-share-alike` export flag replaces such pictures with a paper plate carrying the credit when open question 12 says share-alike images may not leave the web viewer.
- The Prototemplate direction engines are Kevin's own code; porting them as `proto:*` materials is open question 9.
- The Turboslide repo's own license and visibility are open question 14; if the repo is public, the GT deck and its licensed photographs move to a private `decks/` overlay.

Hosting.

- `apps/studio` deploys with the Nitro `node-server` preset in a container (built and run, tanstack report section 6.2); the Vercel Build Output API preset is built and verified as an option (`nodejs24.x`, `functionRules` for `maxDuration`, https://nitro.build/deploy/providers/vercel, https://vercel.com/docs/frameworks/full-stack/tanstack-start); Bun is a bundle only (not installed); Cloudflare and Netlify are documented, not built.
- `apps/render-worker` is a Docker image (`docker/render-worker.Dockerfile`: Node 24, Chrome for Testing 147 with the SwiftShader flags, LibreOffice 26.8, poppler, the export fonts installed) on any Node host; renders are content addressed by revision, theme and scale so repeated requests are cache hits.
- Storage is `FileStore` (the `decks/` tree, git as history, PRs as review) behind the `DeckStore` interface from M1; a `SqliteStore` then Postgres with the same interface, leases and identity follows when open question 1 says shared decks are wanted.
- Google: a Google Cloud project with the Slides API enabled, an Internal consent screen for the GT workspace, a Desktop or Web OAuth client, and a Cloud Storage bucket for signed raster URLs; none exist on this machine (slides report section 1.5); open question 3.

## 12. Open questions for Kevin

1. Storage and history. Files in the Turboslide repo with git (M1 default), a database with the version model (`SqliteStore` then Postgres behind `DeckStore`), or both with the repo as the export. This decides whether `decks/gt-brand/` is the source of truth or a checkout, and whether leases and identity land in M4 or later.
2. Users beyond agents and Kevin. The studio, presenters, people who need PPTX and Slides copies. Shared decks require identity for `Author` and hosted storage.
3. Google Cloud project and account for the Slides export: who owns the OAuth client and the storage bucket, whether exports land in the user's Drive or a GT shared drive, and who holds the bearer token for the hosted agent surface.
4. The definition of identical for export: native (layout identical, editable text, glyph residual, the Slides losses) as the default with flatten (pixel identical, hidden text) on request, or the reverse. The CLI default and the export dialog default follow the answer.
5. Fonts: may Turboslide cut and rename Inter instances (`GT Inter Display`, `GT Inter Text 22`) pending the Reserved Font Name check, and will viewing machines have the set installed, embedded, or both. Is a raster fallback acceptable for shader, dither and diagram slides in a client deliverable.
6. One theme or many: is `gt-ink-paper` the only theme, or must tokens, the proper-noun list, the sprite and the copy rules be per-theme data from the start. Related: Glyphfield's GT preset (ink `#181818`, Geist Mono) disagrees with the deck (`#070707`, Inter only); the spec follows the deck.
7. Agent identity: `--author agent:<runId>` and `TURBOSLIDE_AUTHOR` as proposed, a token, or a signed-in user, so the version list distinguishes Kevin, a designer and an agent run.
8. Primary agent transport for the workflow harness: CLI over files (M1) or MCP (stdio in M2, HTTP in M4). Both ship; the order of polish follows the answer.
9. Materials source: import `@paper-design/shaders` directly (designed) and port the Prototemplate direction engines as `proto:*` materials, or proxy Glyphfield's `/api/materials` and `/shader-preview` during M5.
10. Escape block permanence: is `html` allowed in shipped decks (flagged, raster export) or migration only, with M5's zero-escape target as a hard gate for every deck.
11. Presenter scope in M6: notes, timer and next slide are in; are live shaders on the audience screen wanted, given the frame fallback everywhere else.
12. Licensing of photographs in exports: may share-alike images leave the web viewer in PPTX and Slides files with the credit on the plate, or should the exporter exclude them.
13. Heading case: sentence case per the grammar, or Title Case as round ten noted was a one-switch change. `copy/sentence-case` reads its mode from `deck.json`.
14. Repo license and visibility for `Kevin-Liu-01/Turboslide` (private, MIT like Glyphfield, or another), which decides whether the GT deck and its licensed photographs live in the repo or in a private overlay.
15. The Prototemplate `/deck` iframe: keep it pointed at `turboslide build` output (designed, protocol preserved) or move it onto the studio's `embed.$deckId` route.
16. The Rust slot: adopt `turboslide-native` in M5 regardless (designed) or only when the TypeScript identity test fails on CI.
17. The CLI binary name: `turboslide` as written, or a shorter alias.

## 13. Sources

Local, read only: the research reports `00-research-brief.md` through `06-feature-requirements.md` and the three experiment reports named in the header; the three candidate designs in this directory; `/Users/kevinliu/repos/Prototemplate/deck/parts/head.html` (lines 11-176, 177-179, 249-258, 398-462), `parts/tail.html` (83, 100-130, 159-238), `deck/DECK-GRAMMAR.md`, `deck/shots/OPENERS.md`, `deck/shots/DETAILS.md`, `deck/shoot-slide.mjs`, `scripts/build-deck.mjs`, `scripts/lint-lines.mjs`, `DESIGN.md` ("Line law for chrome"), `src/components/viewer/{tokens.css,Seg.tsx,Toolbar.css,Sidebar.css,PreviewLayer.tsx,Search.tsx,shell-context.ts,useShellKeys.ts}`, `src/lib/shell-data.ts`; `/Users/kevinliu/repos/glyphfield/src/lib/{studioAutomation.ts,agentApi.ts,canvasDocument.ts}`, `src/components/SourceCodeDrawer.tsx`, `docs/shader-frame-contract.md`, `skills/*/SKILL.md`.

Web: TanStack Start https://tanstack.com/start/latest/docs/framework/react/quick-start, https://tanstack.com/start/latest/docs/framework/react/guide/server-functions, https://tanstack.com/start/latest/docs/framework/react/guide/server-routes, https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr, https://tanstack.com/start/latest/docs/framework/react/guide/environment-functions, https://tanstack.com/start/latest/docs/framework/react/guide/hosting, https://tanstack.com/devtools/latest/docs/vite-plugin; Vite and tooling https://vite.dev/guide/dep-pre-bundling.html, https://vite.dev/guide/features.html#web-workers, https://vite.dev/blog/announcing-vite8, https://github.com/vitejs/vite/commit/2540ed06d0b6f93829d2d764b6a02f7dbfd14923, https://pnpm.io/catalogs, https://pnpm.io/settings/build, https://www.typescriptlang.org/docs/handbook/project-references.html, https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html, https://nitro.build/deploy/providers/vercel, https://vercel.com/docs/frameworks/full-stack/tanstack-start, https://developers.cloudflare.com/browser-run/limits/, https://zod.dev/json-schema; MCP https://github.com/modelcontextprotocol/typescript-sdk, https://sli.dev/features/mcp, https://tldraw.dev/blog/tldraw-mcp-app; rendering https://developer.chrome.com/docs/chromium/new-headless, https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md, https://developer.chrome.com/blog/supercharge-web-ai-testing, https://playwright.dev/docs/api/class-page#page-screenshot, https://playwright.dev/docs/browsers, https://sharp.pixelplumbing.com/api-operation, https://github.com/mapbox/pixelmatch; export https://gitbrent.github.io/PptxGenJS/docs/api-text.html, https://github.com/gitbrent/PptxGenJS/issues/176, https://github.com/gitbrent/PptxGenJS/issues/307, https://github.com/gitbrent/PptxGenJS/issues/401, https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.runproperties, https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/e3870782-1f40-4ef1-a3a8-01ee13661283, https://www.w3.org/submissions/EOT/, https://support.microsoft.com/en-us/office/benefits-of-embedding-custom-fonts-cb3982aa-ea76-4323-b008-86670f222dbc, https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html, https://blog.documentfoundation.org/blog/2026/08/26/libreoffice-26-8/, https://formulae.brew.sh/cask/libreoffice, https://github.com/orgs/marp-team/discussions/82, https://sli.dev/guide/exporting; Google Slides https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/batchUpdate, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/text, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail, https://developers.google.com/workspace/slides/api/guides/add-image, https://developers.google.com/workspace/slides/api/limits, https://developers.google.com/workspace/slides/api/scopes, https://developers.google.com/workspace/slides/api/quickstart/nodejs; fonts and icons https://rsms.me/inter/, https://github.com/rsms/inter/blob/master/LICENSE.txt, https://github.com/google/fonts/issues/3429, https://github.com/twardoch/fonttools-opentype-feature-freezer, https://github.com/tailwindlabs/heroicons; systems path https://napi.rs/docs/introduction/getting-started, https://rustwasm.github.io/wasm-bindgen/, https://github.com/kornelski/dssim, https://github.com/linebender/resvg, https://github.com/paper-design/shaders; field https://www.taivo.ai/building-a-google-slides-renderer-with-coding-agents/.
