# Turboslide round four build plan

Companion to `docs/gslides-parity/SPEC-4.md` (section numbers below refer to it unless prefixed SPEC, SPEC-2 or SPEC-3) in the shape of `MILESTONES-2.md` and `MILESTONES-3.md`. One round, five builders with disjoint file ownership, an integrator, a verifier, a fixer round and a ship step. Written 2026-09-13.

Rules (AGENTS.md is the contract; the round one to three rules stand):

- The round starts on `main` after the round three ship step (SPEC-4 0.1). Nobody branches from `gs3/integration`. The integrator re-reads every line citation of SPEC-4 on the ship commit before merge 1 and records the moved lines in `build-4/integrator.md`; a file round three renamed or split is reassigned by the integrator on day 0 without changing which builder owns the behaviour.
- Shared checkout, disjoint ownership per the "Owns" lists below. A builder edits only the files named in their row. A change needed elsewhere is a request in `docs/gslides-parity/build-4/<key>.md` and the integrator makes it or reassigns it. Never edit another builder's files, never revert another builder's work, never run git write commands (read only git is fine).
- Never run `pnpm install`, `pnpm add` or `pnpm exec`; call binaries as `node_modules/.bin/<tool>` or `node <script>`. Never run `pnpm build` or `vite build` (the integrator builds); typecheck with `node_modules/.bin/tsc -b` and run vitest per package. A dev server is `TURBOSLIDE_STORE=tmp node_modules/.bin/vite dev --port <port>` from `apps/studio` on the port the builder's row names (4341 to 4346), always with the tmp store, stopped before returning, never 4321 or another builder's port; Playwright runs with `PLAYWRIGHT_BASE_URL` and `.turboslide/e2e.lock`, never overlapping. The dev server measures nothing: every number comes from the node-server build (`scripts/check.mjs` step 31) or a preview.
- Copy rules (Kevin): plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings, full sentences in body text; buttons Title Case; the product is written "Turboslide"; the five words of SPEC-4 0.26 never appear; a number on a page carries its source line.
- The identity never copies Google's or Vercel's artwork; icons are Heroicons 20 solid from the theme sprite; the mark is drawn by `markBits` and `markPath` from `packages/theme/src/brand.ts` and nowhere else.
- Every new behaviour has a unit test or an e2e spec; never weaken an existing test to pass; the Perfect export of the GT deck stays pixel identical (compare-to-shoot at 0.5 percent); `packages/chrome/src/tokens.css` is byte identical to the ship commit; the layout shift audit (SPEC-3 step 27) stays at zero.
- Report honestly with the commands run and their results in `docs/gslides-parity/build-4/<key>.md`; anything the build needs lives in the repository, never only in the session scratchpad, which is wiped at the date change.

Baseline: the round three ship commit on `main` (to be named by the integrator on day 0 as `BASE` in `build-4/integrator.md`). Facts SPEC-4 states about the tree are at `28cb63b`; the integrator's day 0 note maps each cited line to the baseline.

## The order

```
Day 0                    Day 1                       Day 2                          Days 3 to 5                 Day 6            Day 7           Day 8
verifier: baseline    ─► B1 brand.ts, brand.css,  ─► merge 1 ─► B2 home route over B1's components   ─► merge 2 ─► verifier ─► fixer round ─► ship
  runs on production      TurboslideMark, tile,      (B1 + B3      B3 routes: data-only, Await,         (integrator) (6.2 to 6.5) (own files)
  and the copy of         EmptyFigure, AppBarBrand,   day 1)        redirect, prerender, preloads
  PP 9.5's JSON           build-brand.ts, icon set                  B4 store, filmstrip, thumbs, bundle diet,
integrator: BASE,         B3 the editor split                       native outputs, contracts routes
  catalog entry,          (EditorRoot, controller,                B5 docs after B1's merge; README after
  check.mjs steps,        -edit-search), router.tsx                  the README workflow finishes
  perf-budget.mjs moved   B5 docs/brand.md skeleton
```

- Day 0: the verifier records the baseline (6.3) beside the PP 9.5 JSON files already under `verification-4/`; the integrator names `BASE`, adds `@vercel/functions` to the catalog and `apps/studio/package.json`, adds the theme package's `./brand` exports, moves `design-4/perf-budget.mjs` to `scripts/perf-budget.mjs`, adds check steps 29 to 31 as skipped stubs, and runs `pnpm install` once.
- Day 1: B1 lands the geometry module, the token sheet, `TurboslideMark`, `EmptyFigure`, `AppBarBrand`, the `linkComponent` slot on the shell contract and the icon set; B3 lands the mechanical split of the editor route (the files move, no behaviour changes) so B4 can own `controller.tsx` from merge 1. Merge 1 the same evening with steps 1 to 6 green and the `/new` boot probe.
- Days 2 to 5: B2 builds the page against merge 1; B3 the route changes; B4 the store, the filmstrip, the thumbnails, the bundle diet and the native outputs; B5 the documents. B4's `vite.deploy.config.ts` and `.gitignore` lines arrive as requests to B3 and the integrator.
- Day 6: merge 2 in the order B1, B4, B3, B2, B5; `pnpm check` 31 of 31 on the merged tree; the preview deployment; the verifier's pass.
- Day 7: the fixer round in each builder's files; the second verifier pass.
- Day 8: the ship step.

## The seams every builder types against

Fixed by SPEC-4 so the parallel builders need no negotiation; B1 and B3 land them on day 1.

- `@turboslide/theme/brand` (B1): `BRAND_TOKENS: Record<string, string>`, `WINDOW`, `FIELD_END`, `isBody`, `windowDistance`, `field`, `markBits(N): BitImage`, `markPath(unit = 2): string`, `cellRects(image): string`, `markSvg(N, size): string`, `markBlocks(N): string`, `CELL_THRESHOLD_PX = 64`; `@turboslide/theme/brand/site`: `SITE` with `description`, `imageAlt`, `origin()`, `manifest`; `packages/theme/brand/facts.json` with `actions`, `mcpTools`, `httpPaths`, `layouts`, `shapePresets`, `materials`, `checkSteps`, `parityRows`, `measured: { source, date, rows }`.
- The chrome components (B1): `TurboslideMark({ size, tile?, ...aria })`, `AppBarBrand({ linkComponent, homeTo, aboutTo })`, `EmptyFigure({ title, sentence, action?, figure: 'figure' | 'notfound' })`, `Progress` with the ramp edge behind `--ts-cell`; `editor-shell.ts` gains `linkComponent?: ComponentType<{ to: string; preload?: 'intent'; className?: string; children: ReactNode }>` on the shell contract, filled by the editor with the router's `Link`; `Thumb` gains `capture?: 'never' | 'when-available'` (B4 lands the prop on day 2, the type on day 1 through B1's request so `Sidebar` compiles).
- The routes (B3, day 1): `apps/studio/src/editor/{EditorRoot,controller,shell-bridge}.tsx` and `apps/studio/src/routes/-edit-search.ts` exist with today's behaviour; `edit.$deckId.tsx` and `new.tsx` import `EditorRoot` inside `component`. From merge 1 `controller.tsx` is B4's and `EditorRoot.tsx`, `shell-bridge.tsx` and the route files are B3's.
- The store (B4): `HostedDecks.list()` returns `DeckHead[]` from manifests on the `blob` tier without opening a deck store; `BlobStore.write` runs the four rounds of 0.33; `thumbsPrefix(deckId)` and `pruneThumbs(deckId, slideId, theme, keep)` beside the `.thumbs/` skip in `pull()`.
- The assets (B2): `apps/studio/public/home/<name>-<hash>.jpg` with `shots.json`; `apps/studio/public/brand/{hero,figure,notfound}-{dark,light}.png` and `og-screen-{dark,light}.png` are B1's and B2 reads them by the paths `site.ts` exports.
- The check (integrator): `scripts/perf-budget.mjs` with the rows of 4.7; `scripts/check-vercel-output.mjs`; `scripts/check.mjs` steps 29 to 31; `check-client-bundle.mjs` ceilings.

## B1 Brand assets, tokens, chrome mark, favicon and card pipeline

Estimate: 40 agent hours. The geometry module, the token sheet and the components land on day 1 because B2, B3 and B4 render them.

### Inputs

SPEC-4 sections 0 (0.2 to 0.23, 0.50, 0.51), 1 (every subsection), 3.5 (the `NOINDEX_ROUTES` line and the curtain), 3.10 (the view transition rules), 6.4, 6.5; R01 sections 6 and 8; R02 sections 3, 4, 5, 6, 8; P1 sections 1 to 6 with `design-4/dither/mark.mjs`, `build-assets.mjs`, `og.html`, `chrome.html`, `assets/hero.recipe.json`; P2 sections 2 and 3.2 (`brand-manifest.json`, `mark-geometry.json`, `tools/outline-wordmark.py`); P3 sections 1.3 and 6 (the tile, the contrast table).

### Owns

New `packages/theme/src/brand.ts` and `brand.test.ts`, new `packages/theme/brand/**` (`mark.svg`, `mark-small.svg`, `icon-tile.svg`, `wordmark.svg`, `wordmark-outlines.svg`, `lockup-stacked.svg`, `og-template.html`, `hero.recipe.json`, `mark-geometry.json`, `facts.json`, `site.ts`, `previews/**` with `variants/`), new `packages/theme/scripts/outline-wordmark.py`, `packages/theme/src/copy.ts` (`PROPER_NOUNS`), new `packages/chrome/src/brand.css`, new `packages/chrome/src/{TurboslideMark,AppBarBrand,EmptyFigure}.tsx` and `EmptyFigure.css`, `packages/chrome/src/TitleRow.tsx` and `TitleRow.css`, `packages/chrome/src/editor-shell.ts` (the `linkComponent` slot only), `packages/chrome/src/Progress.tsx` and `Progress.css`, `packages/chrome/src/EditorSkeleton.tsx` and `PresenterSkeleton.tsx` (the curtain picture only; the boxes are round three's), `packages/chrome/PORTED_FROM.json`, new `scripts/build-brand.ts`, `apps/studio/public/**` (the set of 0.13, `brand/*.png`, `robots.txt`, `brand-manifest.json`), `apps/studio/src/routes/__root.tsx` (the head tags, the `brand.css` import, `NotFound`, the `theme-color` statement in the boot script's host, `NOINDEX_ROUTES` gaining `/edit/$deckId` on B3's behalf), `apps/studio/src/routes/print.$deckId.tsx` and `print.css` (the mark), `packages/viewer/src/theme.ts` (`applyTheme` writes `theme-color`), `apps/cli/src/cli.ts` (the `--version` flag), new `apps/cli/src/commands/banner.ts` and `banner.test.ts`, `apps/cli/src/commands/info.ts` (the header), `packages/mcp/src/server.ts` (the instructions sentence), new `apps/studio/src/brand-files.test.ts`, `docs/gslides-parity/build-4/b1.md`. Dev server port 4341 (for the tile and chrome checks only).

### Delivers

1. Day 1: `brand.ts` with the geometry of 1.1 moved from `mark.mjs` and `brand.test.ts` (the 16 px bitmap, the 64 cell count, the fixed path, the token parity against `brand.css`); `brand.css` with the eleven tokens, the 760 px block, the view transition rules of 0.40 and the `.ts-mark` and `.ts-tile` classes; `TurboslideMark`, `AppBarBrand`, `EmptyFigure`, the `linkComponent` slot, the `Progress` ramp edge; `PROPER_NOUNS` gaining Turboslide; `PORTED_FROM.json` rows.
2. Day 1: `scripts/build-brand.ts` with the steps of 1.5 and the icon set under `apps/studio/public` (`favicon.ico` three entries, the tile SVG, the touch icon, the seven manifest icons, the manifest with `start_url: /home`, `robots.txt`, `brand-manifest.json`, `mark-geometry.json`); `--check` reading every PNG and the ICO back; the head tags of 1.6 in `__root.tsx` with `NotFound` rebuilt.
3. Day 2: the twins: `turboslide material capture` with P1's recipe, the anchor scan of 0.7 over 0 to 10 s in 500 ms steps recorded in `hero.recipe.json`, frames one to three cut through the pipeline at black 160, white 250, gamma 1.5, encoded with the theme palette, the ink fraction sum check, `hero-{dark,light}.png`, `figure-*`, `notfound-*`, `og-screen-*` under `apps/studio/public/brand/`; the card rendered from `og-template.html` to `og/turboslide.png` under 1 MB.
4. Day 3: the wordmarks (`wordmark.svg`, `lockup-stacked.svg`, `wordmark-outlines.svg` through `outline-wordmark.py` under the fonts venv, `[python]`), the README lockup PNGs (`build-brand.ts --readme` writing to `docs/readme/brand/` for B5), the previews (the size sheet, the 8x nearest upscales at 16 and 32, the tab strips at 1x and 2x with the three cases, the confusion sheet, `variants/` with P1's candidate sheets and P3's two rejected drawings re-rendered from the repository with a measured reason each).
5. Day 3: the CLI banner (`--version`, the `info` header, the `NO_COLOR` test), the MCP sentence, the print bar mark, `applyTheme`'s `theme-color`, `brand-files.test.ts`, `facts.json` through `--facts` (0.25), and the accessibility record's contrast table for `docs/brand.md` (B5 writes the document; B1 supplies the numbers in `b1.md`).
6. The 20 px and 24 px rasters at 1x and 2x checked for soft edges (0.50), recorded in `b1.md`.

### Acceptance

```
cd packages/theme && ../../node_modules/.bin/vitest run
cd packages/chrome && ../../node_modules/.bin/vitest run
cd apps/cli && ../../node_modules/.bin/vitest run commands/banner
cd apps/studio && ../../node_modules/.bin/vitest run brand-files
node scripts/build-brand.ts --check
NO_COLOR=1 node apps/cli/bin/turboslide.mjs --version > /tmp/b1-a.txt && node apps/cli/bin/turboslide.mjs --version > /tmp/b1-b.txt && cmp /tmp/b1-a.txt /tmp/b1-b.txt
git diff --exit-code packages/chrome/src/tokens.css
python3 -c "from PIL import Image; im=Image.open('apps/studio/public/favicon.ico'); print(sorted(im.ico.sizes()))"   # [(16, 16), (32, 32), (48, 48)]
```

Plus: every PNG of 0.13 decodes to the colour count of 1.1's table (Pillow); the two twins of each frame sum to an ink fraction of 1.0; the tile reads on the three strips of the tab strip preview; `TitleRow` renders the `linkComponent` when given and a plain anchor when not (a chrome test); no `--ts-` token in `apps/studio/src/styles.css`.

## B2 The /home route and its hero

Estimate: 36 agent hours, from merge 1.

### Inputs

SPEC-4 sections 0 (0.6, 0.7, 0.19 to 0.28, 0.42, 0.43), 2 (every subsection), 4.1 (the `/home` rows), 6.6; R05 (every section; the copy of section 6 and the screenshot table of 7); R03 section 4; R04 sections 5, 9, 10; PP sections 4, 5 (the speculation rules row), 6; P1 section 4 with `design-4/dither/home.html` and its previews; P2 section 4 (the source lines, the pipeline band, the specimens); P3 section 4 (the appearance group, `scroll-behavior`, the `<picture>` pair).

### Owns

New `apps/studio/src/routes/home.tsx` and `home.css`, new `apps/studio/src/components/home/**` (`HomeHero.tsx`, `HomeNav.tsx`, `HomeFacts.tsx`, `HomeCards.tsx`, `HomePipeline.tsx`, `HomeSpeed.tsx`, `HomeAgents.tsx`, `HomeCompare.tsx`, `HomeFooter.tsx`, `copy.ts`, `copy.test.ts`, `shots.json`, one `.css` per component or none), new `scripts/build-home-assets.ts`, `apps/studio/public/home/**`, new `apps/studio/e2e/home-page.spec.ts`, `docs/gslides-parity/build-4/b2.md`. Dev server port 4342. Requests: the `prerender` option and `/home`'s `routeRules` (B3), the hosted smoke and tooltip audit rows (integrator), the strings the default view words test must learn (integrator, if the test is extended beyond `copy.test.ts`).

### Delivers

1. Day 2: the route with the nine bands as components over B1's tokens and components, the hero of 2.3 (still, the plate, the lockup as the `h1`, the sentence, the three buttons, the fact line, the credit line under the band), the navigation with the appearance group, `scroll-behavior: auto`, the prerender request to B3.
2. Day 3: `build-home-assets.ts` with the fifteen shots, the 720 px variants and `shots.json`; every `<img>` with `width`, `height`, `srcset`, `sizes`, `loading="lazy"` below the fold; the `01` and `13` `<picture>` pair following `data-theme`.
3. Day 3: `copy.ts` with every string of 2.2 rewritten from the ship tree (the Account, Editing together, Import, Export rows; the two cards round three changed; the fact line), the source lines under every number from `facts.json` and the verifier's baseline JSON (the date in the line), and `copy.test.ts` running the copy lints, the default view words list, the five forbidden words and the literal count grep.
4. Day 4: the pipeline band's three cells and the three specimens (the empty figure, the curtain with the ramp, round three's presence chip rendered from `packages/identity`), the speed rows with the tense rule applied to the ship tree, the closing sentence with the baseline's numbers, the agents band, the comparison table, the footer.
5. Day 4: the speculation rules script (0.42) and `home-page.spec.ts`: the page answers 200 with the hero sentence; the fifteen shots present with `width` and `height`; the `<picture>` pair swaps with `gt-theme`; the appearance group writes `gt-theme` and holds `aria-pressed`; the three hero links resolve; no element wider than the viewport at 390; every number has a sibling source line; the speculation rules script names `/new` with `moderate` eagerness; `main` is in the server's HTML (the prerender); no `ShaderMount` marker in any script the page loads.
6. Day 5: `lint --chrome` and the tooltip audit green on 4342; the three widths in both themes shot into `b2.md` for the verifier's comparison with `dither/previews/home*.png`.

### Acceptance

```
cd apps/studio && ../../node_modules/.bin/vitest run components/home
node scripts/build-home-assets.ts --check
PLAYWRIGHT_BASE_URL=http://localhost:4342 node_modules/.bin/playwright test apps/studio/e2e/home-page.spec.ts
node apps/cli/bin/turboslide.mjs lint --chrome --url http://localhost:4342/home --widths 1440,1280,390 --themes light,dark
node scripts/tooltip-audit.mjs --base http://localhost:4342 --only /home
grep -nP '\x{2014}|!' apps/studio/src/components/home/copy.ts   # empty
```

Plus: the page's decoded JavaScript on the node-server build (the integrator's run of step 31 with `--only routes`) under 600 KB once B3's and B4's steps have merged, recorded in `b2.md` with the chunk names; the images before ready under 500 KB and after a full scroll under 2,000 KB.

## B3 Route and transition performance

Estimate: 56 agent hours. The mechanical editor split lands on day 1 (merge 1) so B4 owns the controller from day 2; the rest from merge 1.

### Inputs

SPEC-4 sections 0 (0.16, 0.29, 0.32, 0.34, 0.36, 0.39 to 0.45), 3.1 (the route half), 3.3, 3.5, 3.6 (the config), 3.7, 3.10, 3.11, 3.12 (the editor and presenter moves, the vendor group), 3.13, 4.1, 4.2; PP sections 3.1, 3.3, 3.5, 3.6, 3.7, 5, 6, 7 (rows 1 and 2); R03 sections 3.1 to 3.3; R04 sections 4, 5; SPEC-3 6.7, 9.2 (the skeletons round three lands).

### Owns

`apps/studio/src/router.tsx`, `apps/studio/src/routes/{index,new,edit.$deckId,present.$deckId,deck.$deckId,embed.$deckId,decks.index,decks.trash}.tsx`, `edit.$deckId.css`, `decks.css`, new `apps/studio/src/routes/-edit-search.ts`, new `apps/studio/src/editor/EditorRoot.tsx` and `shell-bridge.tsx` (the day 1 move; `controller.tsx` is B4's from merge 1), new `apps/studio/src/components/PresenterPage.tsx`, `apps/studio/src/components/{DeckViewer,presentActions}.ts|tsx`, `apps/studio/src/server/{decks,write}.ts` (the card fields, the Recent row's shape, `readEditorDeck`'s trimmed `versions` and `notes` by role), `apps/studio/vite.config.ts` and `vite.deploy.config.ts` (`routeRules`, the `/` redirect, the prerender option, `SEED_PATTERN`, `codeSplitting.groups`, and B4's `SERVER_ONLY` and `traceDeps` lines applied on request), `apps/studio/e2e/{home,editor,present,landing,viewer}.spec.ts` (the rows this round adds), `docs/gslides-parity/build-4/b3.md`. Dev server port 4343.

### Delivers

1. Day 1 (merge 1): `EditorRoot`, the controller and the shell glue moved to `apps/studio/src/editor/` with no behaviour change; `-edit-search.ts`; `edit.$deckId.tsx` and `new.tsx` importing `EditorRoot` inside `component` (the namespace import at `new.tsx:13` gone); `router.tsx` with `defaultPreloadStaleTime` 30,000 and `defaultViewTransition`; the `/new` boot probe on 4343 recorded in `b3.md`.
2. Day 2: `ssr: 'data-only'`, `pendingComponent`, `pendingMinMs: 0` and `pendingMs: 0` on `/new`, `/edit/$deckId` and `/present/$deckId` over round three's skeletons; `readEditorDeck` with the newest 50 `versions` without `mutations` plus the count, `notes` by role; the History and Versions panels' props fed by `listVersions` on open (a request to B4 for the controller's call site).
3. Day 3: `/decks` and `/decks/trash` with the loader returning `{ recent, decks: promise }`, the Recent row from `localStorage` rendered whole, the store list under `<Await>` with the card grid's frame as the fallback, the first twelve cards `preload="viewport"`, the app bar as B1's `AppBarBrand` with the router's `Link`, the empty states as B1's `EmptyFigure`; the trash's optimistic Restore and Delete forever (0.32); round three's four views kept.
4. Day 3: `TitleRow`'s `linkComponent` filled with the router's `Link` from `EditorRoot`; `/present` as `PresenterPage.tsx` imported inside `component` with `renderSlide` off the module level; `router.preloadRoute` for the presenter on pointer enter of the Slideshow arrow.
5. Day 4: `/deck/$deckId` and `/embed/$deckId` with the current slide's HTML in the document and the rest under `<Await>`, `getDeck` as a `GET` server function with the CDN header keyed by deck and revision, the sidebar windowed through B4's `Filmstrip` observer; `/` as a `routeRules` redirect with the `x-robots-tag` header and `index.tsx`'s `beforeLoad` kept for the client; `/home` prerendered (`prerender.enabled`, `pages: ['/home']`) with B2's route; `routeRules` of SPEC-4 1.6 and the `SEED_PATTERN` change of 0.35; the vendor `codeSplitting.groups` entry.
6. Day 5: the e2e rows: `home.spec.ts` (the Recent row in the server's HTML, the list after; the card gone within 100 ms of the confirm click and back on a refused removal), `editor.spec.ts` (the skeleton in the server's HTML, no `.ts-stagewrap`, `robots` `noindex`, no `readEditorDeck` request), `present.spec.ts` (the popup's handle within the budget, the JavaScript total), `landing.spec.ts` (the config level redirect carries the header), `viewer.spec.ts` (the deferred slides arrive; the twins are not re-fetched on a second visit).

### Acceptance

```
cd apps/studio && ../../node_modules/.bin/tsc -b
PLAYWRIGHT_BASE_URL=http://localhost:4343 node_modules/.bin/playwright test apps/studio/e2e/home.spec.ts apps/studio/e2e/editor.spec.ts apps/studio/e2e/present.spec.ts apps/studio/e2e/landing.spec.ts apps/studio/e2e/viewer.spec.ts
node scripts/perf-budget.mjs --base http://localhost:4343 --profile local --only routes,transitions --runs 1 --report   # a smoke on the dev server; the measurement is step 31
```

Plus: the `/new` boot probe on 4343 after every route change (AGENTS.md's merge rule); the integrator's step 31 on the node-server build with `--only routes,transitions,twins` after merge 2 meets the `edit->decks`, `back`, `trash->decks` and twins rows and reports `/decks` first byte on the tmp store; `b3.md` records the `defaultPreloadStaleTime` behaviour note beside the change.

## B4 Editor action and render performance

Estimate: 72 agent hours, from merge 1 (the controller) and day 0 (the store and the native outputs, which touch no route).

### Inputs

SPEC-4 sections 0 (0.29 to 0.31, 0.33, 0.35, 0.37, 0.38, 0.41, 0.44), 3.1 (the store half), 3.2, 3.4, 3.6 (`ensureDeckAssets`, the template copy), 3.8, 3.9, 3.11 (the contracts routes), 3.12 (rows 3 to 7), 4.3 to 4.6; PP sections 3.2, 3.4, 3.6, 3.8, 3.9, 5 (the filmstrip, the memoized render, the Blob read path), 7; R04 sections 3, 6, 7; `docs/native.md`; `docs/hosting.md` sections 4 and 5; SPEC-3 3.3, 3.6, 8.13, 0.51.

### Owns

`packages/store/src/{blob-store,hosted,hosted.test}.ts`, `packages/chrome/src/{Thumb,ThumbShot,Sidebar}.tsx`, `Thumb.css`, `Sidebar.css`, new `packages/chrome/src/Filmstrip.tsx` and `Filmstrip.css`, `packages/chrome/src/EditorShell.tsx` (the lazy dialogs) and new `packages/chrome/src/lib/lazyDialog.ts`, `packages/chrome/src/SourceDrawer.tsx` (the CodeMirror `import()`), `packages/viewer/src/{MaterialMount,GridView,SlideView}.tsx`, `apps/studio/src/editor/controller.tsx` (from merge 1: `toViewerDeck`, `renderMissing`'s memo, the warm changes, `recordDeckOpened`'s fields, the `listVersions` call), `apps/studio/src/server/{thumbs,warm,root,contracts}.ts`, `apps/studio/src/routes/api/render.$slideId.ts`, `apps/studio/src/routes/{llms[.]txt,llms-full[.]txt,openapi[.]json}.ts` (the bundled files), `apps/studio/src/components/useStudioSession.ts`, `packages/agent/src/http/sessions.ts` (only if the poll loop survives the baseline), `packages/schema/src/shapes/{definitions,ids}.ts`, new `packages/schema/scripts/build-definitions.mjs`, `packages/render/src/**` (the `marked` importer only), `apps/studio/src/workers/dither.worker.ts` and a new `dither.worker.test.ts`, `packages/native/**` (the committed outputs, `BUILD-RECORD.json`, `README.md`), `crates/turboslide-native/**`, new `.github/workflows/native.yml`, `packages/effects/src/parity.test.ts` (the `TURBOSLIDE_NATIVE_REQUIRED` row), `apps/studio/e2e/{filmstrip,window-api,undo}.spec.ts` (the rows this round adds), `docs/gslides-parity/build-4/b4.md`. Dev server port 4344. Requests: `.gitignore` lines 22 to 25 (integrator), the `SERVER_ONLY` and `traceDeps` lines (B3), `@vercel/functions` (integrator, day 0), the check step's rebuild and diff (integrator).

### Delivers

1. Day 1: `BlobStore.write` in four rounds with the deletions after the commit (0.33) and `hosted.test.ts`'s call log assertion; `HostedDecks.list` from manifests on the `blob` tier with the fake's two deck case; the `.thumbs/` prefix helpers and the mirror skip.
2. Day 2: `Thumb`'s `capture` prop, the clone first `FilmCard` in `Filmstrip.tsx` with the observer and `memo`, `GridView` and the viewer's sidebar on the same observer; `controller.tsx`'s `toViewerDeck` without `shot` for the editor, `renderMissing` keyed by the slide stamp and the deck level inputs (256 entries), `warmThumbnails` off the open, the first slide's home card warmed in `waitUntil` after the first saved write, the grid's tiles warmed on first entry.
3. Day 3: `thumbs.ts` and the render route: the Blob cache under `.thumbs/`, the 302 or the streamed body by store access, `s-maxage=60, stale-while-revalidate=86400` without `r`, the `waitUntil` refresh, the retention of three stamps per slide and theme; the signed URL of SPEC-3 8.13 kept; `ensureDeckAssets` pulling the seed deck's twins from the static URL or Blob; the GT template copy's twin source; the contracts routes serving the bundled generated files with the CDN header.
4. Day 3: the interim of 0.37 if the baseline's idle run shows the poll loop; `SlideView.tsx`'s `view-transition-name`s.
5. Day 4: the bundle diet rows 3 to 7: `definitions.ts` as one `JSON.parse` string with `ids.ts` and `build-definitions.mjs` (run once, its output committed, its `--check` in step 29 through the integrator); `MaterialMount`'s `import()` of `@turboslide/materials/mount` and the previews' the same; `lazyDialog()` over the twenty dialogs, the pickers, `DiagramPanel`, `SpecialCharacters` and `SourceDrawer`, preloaded on menu hover; one `marked` importer.
6. Day 5: the native outputs: `native.yml` building the wasm module and the Linux addon against the glibc 2.28 floor, `BUILD-RECORD.json` with the run id and the sha256 per file, the two outputs committed, `.gitignore` request, `packages/native/README.md`; the worker's wasm mount with the TypeScript fallback and `dither.worker.test.ts` (identical cells on the two tone fixture); `parity.test.ts` with `TURBOSLIDE_NATIVE_REQUIRED=1` in CI; the `hosted-smoke.mjs` rows (the backend assertion, the glibc record) as a request to the integrator.
7. The e2e rows: `filmstrip.spec.ts` (the clone carries the text within 50 ms of the revision moving; no `/api/render` request from the filmstrip), `window-api.spec.ts` (one stream, zero polls over 60 s), `undo.spec.ts` (unchanged assertions after the memo).

### Acceptance

```
cd packages/store && ../../node_modules/.bin/vitest run
cd packages/chrome && ../../node_modules/.bin/vitest run
cd packages/viewer && ../../node_modules/.bin/vitest run
cd packages/schema && ../../node_modules/.bin/vitest run
cd packages/render && ../../node_modules/.bin/vitest run
cd packages/effects && TURBOSLIDE_NATIVE_REQUIRED=1 ../../node_modules/.bin/vitest run src/parity.test.ts
cd apps/studio && ../../node_modules/.bin/tsc -b && ../../node_modules/.bin/vitest run workers
PLAYWRIGHT_BASE_URL=http://localhost:4344 node_modules/.bin/playwright test apps/studio/e2e/filmstrip.spec.ts apps/studio/e2e/viewer.spec.ts apps/studio/e2e/window-api.spec.ts apps/studio/e2e/undo.spec.ts
node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot /Users/kevinliu/repos/Prototemplate/deck --max-mismatch 0.005
```

Plus: the integrator's step 31 with `--write` on the node-server build meets the clone row (50 ms), "last keyup to saved" and "new slide to saved" against the tmp store; the DOM rows (1,500 nodes on `/edit` and `/deck`) and the filmstrip rows hold; `b4.md` records the chunk sizes before and after each diet row, the native outputs' sha256 and the run id, and the preview's `describeBackends` answer.

## B5 README, repository metadata and documents

Estimate: 24 agent hours, from B1's merge; `README.md` and `docs/readme/` only after the README workflow of this date has finished (SPEC-4 0.52).

### Inputs

SPEC-4 sections 0 (0.25, 0.26, 0.52), 1 (for `docs/brand.md`), 2.2 (the copy rows shared with the README), 4 (for `docs/performance.md`), 5; R01 sections 5 and 6.9; R05 sections 6.6 and 8; PP section 4; `docs/native.md`; `docs/hosting.md`.

### Owns

`README.md`, `docs/README.md`, new `docs/brand.md`, new `docs/performance.md`, `docs/hosting.md`, `docs/native.md`, `packages/native/README.md` (the prose; B4 writes the build record), `skills/turboslide-api/SKILL.md`, `skills/turboslide-create/SKILL.md`, `skills/turboslide-studio/SKILL.md`, `skills/turboslide-verify/SKILL.md` (the prose only; the `references/` tables are generated), `docs/readme/brand/**` (the lockup PNGs B1 writes through `build-brand.ts --readme`; B5 places them), `docs/gslides-parity/build-4/b5.md`. No dev server.

### Delivers

1. Day 2: `docs/brand.md` from SPEC-4 section 1 and B1's numbers (the construction, the sizes, the tile, the tokens, the where table, the accessibility record with the WCAG URLs and the dates B5 reads them, the build script and its records, the repository description and topics strings, the social preview file), and the `docs/README.md` rows.
2. Day 3: `docs/performance.md` (the today, after, never table as it stands on the ship tree, the budget tables of section 4 with the baseline's numbers, how to run the check, the rows for round five); `docs/hosting.md` and `docs/native.md` amendments from B3's and B4's notes; the skills' prose.
3. Day 5 (after the README workflow): `README.md` per section 5, with every count read from `facts.json` and every speed sentence in the tense PP section 4 allows on the ship tree; the two lockup PNGs placed; the documentation index.

### Acceptance

```
node_modules/.bin/prettier --check README.md docs/README.md docs/brand.md docs/performance.md docs/hosting.md docs/native.md
grep -nP '\x{2014}|!|Built on Rust' README.md docs/brand.md docs/performance.md docs/hosting.md docs/native.md   # empty (the `!` outside code spans)
node -e "for (const f of ['README.md','docs/brand.md','docs/performance.md']) { const t=require('fs').readFileSync(f,'utf8'); for (const m of t.matchAll(/\]\((?!https?:)([^)#]+)/g)) if(!require('fs').existsSync(m[1])) { console.error(f, m[1]); process.exitCode=1 } }"
```

Plus: every number in `README.md`'s speed section names its source; the README's first sentence equals `SITE.description`'s source; the `<picture>` renders on GitHub's light and dark grounds (the verifier's screenshot).

## Integrator

Estimate: 40 agent hours.

### Owns

`AGENTS.md` (the round four sections: the brand module, the `import()` allowance of 0.44 by place, the dev server ports 4341 to 4346, the `--version` flag, the check steps), `pnpm-workspace.yaml` (`@vercel/functions` in the catalog), `pnpm-lock.yaml`, every `package.json` (`@turboslide/theme`'s `./brand` and `./brand/site` exports, `apps/studio`'s dependency, the root `build:brand` script), `.gitignore` (B4's lines), `scripts/check.mjs` (steps 29 to 31, step 18's URL list, step 26's `home-page.spec.ts`), new `scripts/check-vercel-output.mjs`, `scripts/perf-budget.mjs` (moved from `design-4/`, with the rows of 4.7), `scripts/check-client-bundle.mjs` (the ceilings), `scripts/hosted-smoke.mjs` (the rows: `/home`, the icon paths with the CDN hit, `/og/turboslide.png`, the thumbnail 302 or body, the backend assertion and the glibc record, one render and one template copy), `scripts/tooltip-audit.mjs` (`/home` in the page list), `.github/workflows/check.yml` (the CI flag for step 31), `docs/gslides-parity/{SPEC-4,MILESTONES-4,BUILD-STATUS-4}.md`, `docs/gslides-parity/build-4/integrator.md`, the merges, the preview deployments, the scratch deck cleanup after `--write` on a preview.

### Delivers

1. Day 0: `BASE` named; the line citation map; the catalog entry and `pnpm install` once; the exports; `perf-budget.mjs` in place with the new rows and the `/api/decks/.*/stream` pattern; steps 29 to 31 as stubs; `check-vercel-output.mjs`.
2. Day 1: merge 1 (B1's and B3's day 1 files) with steps 1 to 6 green and the `/new` boot probe on a dev server; AGENTS.md's round four sections.
3. Days 2 to 5: the requests in `build-4/<key>.md`; the hosted smoke and tooltip audit rows; `check-client-bundle.mjs`'s ceilings once B3's and B4's diet rows land.
4. Day 6: merge 2 in the order B1, B4, B3, B2, B5; `pnpm check` 31 of 31 with `--list` at 31; the preview deployment (`vercel deploy --yes --archive=tgz` from the linked root); `node scripts/hosted-smoke.mjs --base <preview>` with the new rows; the perf run of 6.3 against the preview with `--write` once and the scratch deck removed.
5. Day 8: the ship step; `BUILD-STATUS-4.md` with one heading per builder, what landed, what was cut, the open requests, the deviations recorded.

### Acceptance

`pnpm check` 31 of 31 on the merged tree; `pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts'`; the `/new` boot probe after every merge; the preview smoke green.

## Verifier

Estimate: 32 agent hours, day 0 and days 6 and 7.

### Owns

`docs/gslides-parity/VERIFICATION-4.md`, `docs/gslides-parity/verification-4/**` (the two PP 9.5 JSON files copied on 2026-09-13, `perf-budget-baseline-<date>.json`, `perf-budget-preview-<date>.json`, `perf-budget-production-<date>.json`, the tab strip screenshots, the confusion sheet, the `/home` shots, the OG decode, the banner output, the mark rasters, the skeleton and filmstrip screenshots, the parity audit and chrome lint outputs, the hosted smoke tables), `scripts/gslides-parity-audit.mjs` (the title row's mark row). Dev server port 4346.

### Delivers

1. Day 0: the two PP 9.5 JSON files and the log are already under `verification-4/` (copied on 2026-09-13, sha256 in SPEC-4 0.49); the verifier checks the hashes and runs the baseline of 6.3 on the round three ship deploy.
2. Day 6: sections 6.2 to 6.5 on the merged tree (the node-server build) and on the preview: the parity audit exit 0, the chrome lint on six URLs, the tooltip audit at zero, the perf run with the deployment profile, the brand asset checks re-run with Pillow, the six tab screenshots, the confusion sheet through the judge loop's lens, the `/home` shots, the OG decode, the README lockup on both grounds, the banner, the raster edge check, the skeleton and filmstrip screenshots.
3. Day 7: VERIFICATION-4.md in the shape of VERIFICATION-2.md: the 31 check steps with their numbers, every budget row against its ceiling with the baseline beside it, the brand checks, the deviations recorded (SPEC 5.5 for the filmstrip; R01 acceptance item 5 amended to three colours at 16 px), the blockers, and the list for Kevin (section 8 of SPEC-4 with the round's reading of each, the unverified facts: Vercel's runtime glibc until the preview records it, whether Chrome on Android follows a runtime `theme-color` change, the `webmanifest` content type from the static layer, whether `vite preview` serves SSR routes, which step 31 sidesteps).
4. After the ship: the production table (6.3) appended.

### Acceptance

VERIFICATION-4.md names every miss with the builder who owns the file, every budget row against its ceiling with the run's date and URL, and every deviation with its reason; `verification-4/` holds the JSON, the screenshots and the tables.

## Fixer round

Estimate: 24 agent hours, day 7.

The verifier's VERIFICATION-4.md lists every miss with the builder who owns the file. Each builder fixes only in their own files; the integrator merges in the same order as merge 2; the verifier reruns the parity audit, the chrome lint, steps 29 to 31 and `pnpm check`. A miss that needs a design change (a budget the arithmetic cannot reach without a round five item, a Vercel behaviour the preview contradicts, a glibc the addon cannot load under) is written into VERIFICATION-4.md as a deviation with the reason and left for Kevin, and nobody patches around it; a budget row that fails only on the deployment profile and passes locally is recorded with both numbers and stays a failure until the fixer round closes it or Kevin accepts the ceiling. The fixer round ends when `pnpm check` is 31 of 31 and the deployment profile is green on the preview, or when the remaining misses are all recorded deviations.

## Ship step

Estimate: 8 agent hours.

1. `pnpm check` 31 of 31 on `gs4/integration` with `main` merged in; `git log` shows one commit per builder plus the integration commits; no conflict markers (`git grep -n '<<<<<<<'` empty); the icon set, the twins, `brand-manifest.json`, `mark-geometry.json`, `facts.json`, the native outputs with `BUILD-RECORD.json` and the generated definitions string committed; `git diff --exit-code packages/chrome/src/tokens.css` against `BASE` empty.
2. A preview deployment of `gs4/integration`; `node scripts/hosted-smoke.mjs --base <preview>` green including the new rows; the parity audit against the preview exit 0; `node scripts/perf-budget.mjs --base <preview> --profile deployment --runs 3` green on every asserted row; the layout shift audit of SPEC-3 step 27 at zero on the preview build.
3. Kevin's manual checks on the preview: the tab icon in Chrome, Firefox and Safari on both strips; `/home` at 1440 and on a phone in both appearances, the hero still, every number with its source line, the speed rows in the right tense; the title row's mark leaving the editor for `/decks` without a document load; a typed heading appearing on its filmstrip card before the save; `/decks` painting its Recent row before the list; Delete forever leaving in one frame; `turboslide --version`; the README's lockup on GitHub; the repository description, topics and social preview set by hand from `docs/brand.md`.
4. Merge to `main`, push, production deploy; `hosted-smoke.mjs` against production green; `perf-budget.mjs --profile deployment` against production without `--write`; the verifier appends the production table to VERIFICATION-4.md; the integrator writes `BUILD-STATUS-4.md`.
5. If 0.38's addon is committed: the production `describeBackends` answer is `native`, and `/home`'s Rust rows move from after to today in the same deploy; else the rows stay in the after tense and the sentence "The hosted studio runs the TypeScript stages today." stands.

## What ships in this round

- The identity: the dither mark from one geometry module at every size, the framed paper tile as the tab icon, the icon set with its manifest and card served from the CDN, the wordmark and lockups, eleven `--ts-` tokens in `brand.css` with a parity test, the title row, app bar, empty state, Not found, print bar and progress surfaces carrying the mark or the dither, the loading curtain's figure and ramp, the CLI banner, the README lockup, `docs/brand.md`, and every `--pt-` token unchanged.
- `/home`: a prerendered, indexable product page in nine bands with a still two tone hero cut from a captured liquid metal frame, the fifteen screenshots with `srcset` and lazy loading, every count from the tree and every measured number with its source line and date, the honest speed rows in the tense the code allows, the agent commands, the comparison with the rows where Turboslide has less, the appearance group, the speculation rules prerender of `/new`, and a budget the check asserts.
- Performance: the `blob` tier list from manifests and the shell streamed before the list; the editor's filmstrip clone first with a windowed DOM; the thumbnail cache on Blob with stale while revalidate, `waitUntil` and retention; the Blob write in four rounds with deletions after the commit; `'data-only'` editor and presenter routes over the skeletons with the trimmed payload; the seed twins out of the function bundle; the presenter's own chunk; the bundle diet with the shape table as one string, Paper Shaders and CodeMirror on first use, the editor out of the entry, and a chunk ceiling in the build check; the title row as a `Link`, 30 s preload staleness, viewport preloading on the cards, view transitions, the config level root redirect, immutable twins; the wasm module in the dither worker and the Linux addon in the function as committed outputs with a CI rebuild rule; `scripts/perf-budget.mjs` as check step 31 with 4.7's new rows.
- The acceptance: 31 check steps, the parity audit and the chrome lint unchanged, the perf budgets green on the node-server build and on a preview deployment, the brand asset test, the visual checks under `verification-4/`, VERIFICATION-4.md.

## What is round five

In the order of SPEC-4 section 7: the live monochrome hero after the shader split and a second measurement; the per deck card; the 320 px clone twins; the blob tier deck index; the render worker on a host and Chromium out of the secret holding function; field INP and Lighthouse CI; the cold start and function size gates; the round three dither patterns in the crate; the base function's Chromium split; a second sheet theme; React's `<ViewTransition>`; and SPEC-3 section 17's list. Each is recorded as round five's in `docs/performance.md` and `docs/brand.md` without naming a round on any product surface.
