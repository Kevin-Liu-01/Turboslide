# M1 status

The state of Turboslide at the end of milestone 1 (the document, the renderer, the import of the GT
deck, the viewer, the CLI; `docs/spec/MILESTONES.md`, M1). Written by the integrator on 2026-09-10
after the full acceptance chain passed. Every number below was measured by the `pnpm check` run
that started at 16:06:50 and ended at 16:10:30 local time (219.0 s) on Kevin's machine: Node
24.13.0, pnpm 11.15.1, Chrome for Testing 147.0.7727.15 (`chromium-1217`) on ANGLE Metal, Apple
M5 Max, with the Prototemplate checkout at `/Users/kevinliu/repos/Prototemplate/deck`. The deck
revision the run produced and this commit carries is 12. The evidence directory `.turboslide/` is
git-ignored; this file is the record of it.

## What shipped

Scope items are numbered as in the M1 section of the milestone plan.

1. Scaffold (committed as `5934ff0` and `67463d6` before this commit): `pnpm-workspace.yaml`
   with the exact catalog of SPEC 3.2 and `allowBuilds`, `tsconfig.base.json` with project
   references, `turbo.json`, `AGENTS.md`, `THIRD_PARTY_NOTICES.md`, `tooling/*`,
   `scripts/check.mjs`, `scripts/check-client-bundle.mjs`, `scripts/compare-to-shoot.mjs`, and
   `.github/workflows/check.yml` running `pnpm check` (written, in the working tree, not in this
   commit; see "Blockers").
2. `apps/studio` on TanStack Start 1.168.50 with Tailwind removed, `devtools()` kept,
   `forwardConsole: false`, the dev server on 4321, `vite.deploy.config.ts` with `nitro()` and
   `vercel.json`.
3. `@turboslide/schema` (31 source files): `deck`, `text`, `blocks`, `assets`, `mutations`,
   `findings`, `render`, `export`, `actions`, `validate`, `reduce`, `diff`, `catalog`, `rules`,
   `migrations`, `pointer`, `ids`, `icons`, `annotate`, `ext`, `errors`, `json`, `fixtures`.
4. `@turboslide/agent`: the dispatcher and the contracts generator. `pnpm generate:contracts`
   writes 10 files and reports them current: `packages/agent/generated/{cli,mcp-tools,describe,
openapi,manifest}.json` (30.2 KB, 363.8 KB, 12.8 KB, 332.0 KB, 4.5 KB), `docs/grammar.md`
   (54.4 KB) and the four `skills/*/references/*.md` tables.
5. `@turboslide/theme`: `gt-ink-paper/sheet.css` and `stage.css` under `.ts-sheet`, `tokens.ts`
   with the CSS parity test, `sprite.ts` (63 Heroicons plus `gt-mark`), `copy.ts`,
   `scripts/build-sprite.ts` and `scripts/add-icon.ts`. `@turboslide/fonts`: `inter.css` and
   `assets/InterVariable.woff2`.
6. `@turboslide/render`: `slide`, `deck`, `standalone`, `thumb`, `stage`, `geometry`, `text`,
   `html`, `block-css`, `runtime`, `theme-node` and `blocks/*`, with snapshot tests per block type
   in both themes.
7. `@turboslide/import` and `decks/gt-brand/`: 85 slides in 8 sections, 286 blocks, 114 assets
   (199 files, 30 MB), `import-ids.json`, `import-report.json` and `known-findings.json` with the
   two severity 3 findings the deck has today.
8. `@turboslide/headless`: `launch`, `context`, `document`, `ready`, `measure`, `screenshot`,
   `record`, `sheet`, `shell`. `@turboslide/effects`: `bayer`, `ramp`, `tone`, `filters`,
   `resample`, `two-tone`, `png1`, `metrics`, `diff`, `io`, `image`, with the Pillow and two-tone
   fixtures.
9. `@turboslide/lint`: the static rules (`copy`, `type`, `color`, `icon`, `rows`, `dia`,
   `asset`, `structure`), the rendered rules over `RenderRecord`s, the known-findings gate and
   the line law auditor behind `lint --chrome`.
10. `apps/cli`: `import`, `validate`, `info`, `slides`, `slide get`, `render`, `sheet`, `lint`,
    `lint --chrome`, `build`, `generate`. No writes beyond `import`; `slide put`, `patch`,
    `insert`, `remove` and `move` answer with a usage error naming M2.
11. `apps/studio` routes: `/` (deck list), `/deck/$deckId` (slide, grid, book, present; theme;
    keys; `#NN` and `#s/<slideId>`; the sidebar tree; the toolbar Seg; the hover preview layer
    over live clones), `/embed/$deckId` (the `gt-theme` and `gt-deck-slide` protocol),
    `/decks/$deckId/assets/$`, `/openapi.json`, `/llms.txt`, `/api/agent`; server functions
    under `src/server/` only. No editing.
12. `@turboslide/viewer`: `Stage`, `Sheet`, `SlideView`, `GridView`, `BookView`, `LiveClone`,
    `Frame`, `theme`, `keys`, `hash`, `dither`, `model` and `standalone/` (the `tail.html` port
    used by `renderStandalone`). `@turboslide/chrome`: `tokens.css` with the `--pt-` names,
    `ToolButton`, `Seg`, `Toolbar`, `Sidebar`, `ListRow`, `SidebarFilter`, `ThumbShot`,
    `PreviewLayer`, `HelpCard`, `Toast`, `Progress`, `ThemeButton`, `useShellKeys`,
    `ViewerShell`, `GtMark`, and `PORTED_FROM.json` with 32 entries recorded against Prototemplate
    HEAD `0594fa19`.

Also in the tree: four `skills/*/SKILL.md` stubs (32 to 35 lines each) with a generated reference
and an `agents/openai.yaml`; the recovered specification under `docs/spec/`; 34 test files (33
vitest files with 386 passing cases and 1 skipped, plus `apps/studio/e2e/viewer.spec.ts` with 6
Playwright cases).

## Acceptance

`pnpm check` runs the 18 steps of the M1 acceptance in order and exited 0. The first run of the
day stopped at step 3 (see "Fixes made during acceptance"); the run recorded here is the complete
one after that fix.

| Step | Command (abridged)                                                    | Result | Measured                                                                                                                                      |
| ---- | --------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm install --frozen-lockfile`                                      | pass   | 17 workspace projects, already up to date, 0.8 s                                                                                              |
| 2    | `pnpm exec tsr generate`                                              | pass   | 1.4 s; one Node warning from `@tanstack/router-cli` (`replaceRouteChunk` in a circular dependency), exit 0                                    |
| 3    | tracked check, `pnpm generate:contracts`, `git diff --exit-code`      | pass   | 10 generated files current, no diff, 2.2 s                                                                                                    |
| 4    | `pnpm exec tsc -b`                                                    | pass   | 2.2 s                                                                                                                                         |
| 5    | `pnpm test`                                                           | pass   | 33 files, 386 passed, 1 skipped, 8.20 s in vitest 4.1.11                                                                                      |
| 6    | `pnpm build && check-client-bundle.mjs`                               | pass   | 2 turbo tasks; marker in 0 of 14 client files and 1 of 18 server files; 6.9 s                                                                 |
| 7    | `turboslide import … --into gt-brand --json`                          | pass   | 85 slides, 8 sections, 4 html escape blocks, 114 assets, 2.2 s                                                                                |
| 8    | import assertion                                                      | pass   | `slides` 85, `sections` 8, `htmlBlocks` 4 (at most 4 allowed)                                                                                 |
| 9    | `turboslide validate decks/gt-brand`                                  | pass   | 85 slides, 0 errors, 43 warnings (every one an `ext` kept notice: 25 assets, 18 slides), 2.1 s                                                |
| 10   | `turboslide render all --theme light,dark --scale 1`                  | pass   | 170 PNGs and records in 49.7 s; renderer `Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max`                                        |
| 11   | render assertion                                                      | pass   | 170 records, 0 page errors (also 0 console errors, 0 overflow entries, fonts `loaded` in every record)                                        |
| 12   | `compare-to-shoot.mjs --max-mismatch 0.005 --skip-html-escapes`       | pass   | 170 pairs compared, 8 skipped as escapes, 0 over budget; worst non-escape 0.332 percent, mean 0.011 percent; reference shot in 60.9 s; 67.3 s |
| 13   | `turboslide sheet all --cols 4 --thumb 480 --numbered`                | pass   | two sheets of 2056 by 8396 px, 85 cells and 8 section labels each, 5.9 s                                                                      |
| 14   | sheet assertion                                                       | pass   | both PNGs exist, both JSON cell maps have 85 cells                                                                                            |
| 15   | `turboslide lint all --json`                                          | pass   | 115 findings: 2 at severity 3 (2 known, 0 blocking), 28 at 2, 85 at 1; 170 render records read; 1.3 s                                         |
| 16   | `turboslide build --out … --budget 16`                                | pass   | 14.53 MiB of 16.00 MiB, 85 slides, revision 12; 5.7 s                                                                                         |
| 17   | `playwright test apps/studio/e2e/viewer.spec.ts`                      | pass   | 6 passed in 15.6 s, one worker, against the dev server the runner started on 4321                                                             |
| 18   | `turboslide lint --chrome --widths 1440,1280,390 --themes light,dark` | pass   | 24 audits over 3 widths and 2 themes, 0 with findings, 0 states unapplied; 36.6 s; server stopped afterwards                                  |

### Render records

170 records at revision 12, all on the same renderer string. Readiness wait p50 6 ms, p95 28 ms,
max 40 ms; screenshot p50 99 ms, p95 282 ms, max 539 ms. 448 raster references in total. No
record carries a page error, a console error or an overflow entry.

### Compare to shoot

`scripts/compare-to-shoot.mjs` renders every slide with the deck's own `shoot-slide.mjs` on the
same `chromium-1217` build and diffs it against the Turboslide render with pixelmatch at threshold
0.1. Budget 0.50 percent per pair. The worst pairs:

| n   | Slide                         | Theme | Mismatch |
| --- | ----------------------------- | ----- | -------- |
| 51  | `gem-smoke`                   | light | 0.332 %  |
| 51  | `gem-smoke`                   | dark  | 0.332 %  |
| 57  | `dx`                          | dark  | 0.169 %  |
| 57  | `dx`                          | light | 0.168 %  |
| 80  | `state`                       | light | 0.089 %  |
| 80  | `state`                       | dark  | 0.079 %  |
| 77  | `glyphfield-materials`        | light | 0.042 %  |
| 77  | `glyphfield-materials`        | dark  | 0.042 %  |
| 49  | `blog-covers`                 | light | 0.039 %  |
| 56  | `opener-developer-experience` | dark  | 0.035 %  |
| 56  | `opener-developer-experience` | light | 0.032 %  |
| 38  | `details`                     | light | 0.026 %  |

Every other compared pair is under 0.026 percent. The 8 skipped pairs are the four escape slides
in both themes; their mismatch was measured anyway and lies between 0.001 and 0.021 percent.

### Build

`brand-deck.html` is 15,240,347 bytes (14.53 MiB) against the 16 MiB budget. Inlining by asset
class: native 32 twins at 1.89 MiB, resample-1280 81 twins at 5.82 MiB, two-color 32 twins at
458.4 KiB, pass-through 54 twins at 1.99 MiB.

## Known findings baseline

`decks/gt-brand/known-findings.json` holds the 2 severity 3 findings the deck has, both inside html
escape blocks, each with the retirement path in its `reason`:

| Slide | Block  | Rule                 | Reason                                                                              |
| ----- | ------ | -------------------- | ----------------------------------------------------------------------------------- |
| 83    | `html` | `icon/known`         | `fixed-points` defines its own `i-lock-closed` symbol inline; the sprite lacks it   |
| 84    | `html` | `type/svg-label-min` | `goals` sets a 16 px figcaption in escape CSS, which the rule reads as diagram text |

The lint report at revision 12 is 115 findings: 2 at severity 3 (both known, 0 blocking), 28 at
severity 2, 85 at severity 1. By rule: `export/non-native` 58, `dia/stroke-grammar` 14,
`dia/fit-slot` 8, `rows/two-lines` 8, `opener/sentence-lists-section` 6,
`copy/full-sentence-caption` 5, `escape/html-block` 4, `dia/half-pixel` 3,
`numbers/contradiction` 3, `copy/metaphor-candidate` 2, `copy/sentence-case` 1,
`type/sizes-ladder` 1, `icon/known` 1, `type/svg-label-min` 1.

## Html escape blocks

4 of 85 slides carry an `html` block (the acceptance allows at most 4). Each is flagged by
`escape/html-block` at severity 2 and exports as a raster until it is expressed in the grammar:

| n   | Slide               | Markup the importer had no block for | Source                      |
| --- | ------------------- | ------------------------------------ | --------------------------- |
| 25  | `diagrams`          | `<div class="rules">`                | `25-diagrams.html`          |
| 67  | `presenter-compare` | `<div class="tools">`                | `67-presenter-compare.html` |
| 83  | `fixed-points`      | `<div class="two">`                  | `83-fixed-points.html`      |
| 84  | `goals`             | `<div class="proof">`                | `84-goals.html`             |

The import consumed 983 scoped CSS rules and left 17 rules and 12 inline styles over, kept under
`ext` (the 43 validate warnings). The 12 slides with residual CSS: `voice`, `ladder`,
`doubled-line`, `iso`, `language-as-material`, `nearest-page-routing`, `blog-vision`, `archive`,
`glyphfield-tools`, `books-and-templates`, `glyphfield-materials`, `identity-project`.

## Fixes made during acceptance

- Step 3 named `apps/studio/src/routes/openapi.json.ts`, the file name the milestone plan wrote.
  The file is `openapi[.]json.ts` because TanStack Router's file-based routing escapes a dot inside
  a path segment as `[.]` (the route path stays `/openapi.json`); the generator does not write it,
  it serves `packages/agent/generated/openapi.json`. The first run failed there in 0.0 s
  (`pathspec did not match any file(s) known to git`). `scripts/check.mjs` now names the file with
  git's `:(literal)` pathspec magic so the brackets are not read as a glob class, and AGENTS.md
  records the deviation.
- The step 3 guard (`git ls-files --error-unmatch` before the diff) requires the generated files
  to be in the index. They were staged before the run, so the run recorded here is the state of
  this commit.

## Deviations recorded

- Step 7 re-imports over the committed deck. The slide files, the assets and the id sidecar came
  out byte-identical, but `deck.json` gained a revision (11 to 12) and `updatedAt`, and
  `import-report.json` its `importedAt`; every `pnpm check` on a machine with the Prototemplate
  checkout does the same. This commit carries revision 12.
- Renders and the compare step run on `chromium-1217` (147.0.7727.15), the build the deck's
  `shoot-slide.mjs` hard-codes; `playwright-core` 1.62.1 installs `chromium-1234` (151.0.7922.34),
  which is what CI renders on. Steps 7, 8 and 12 are skipped in CI because the Prototemplate
  checkout is not there (AGENTS.md, Chromium).
- `vitest` 4.1.11 and `eslint` 10.10.0 instead of the 3.x and 9.x lines the spec named
  (AGENTS.md, Deviations).
- The 1 skipped vitest case is `two-tone.test.ts`, "reproduces the pair within the floor", which
  runs only when `TURBOSLIDE_TWO_TONE_SOURCE` names the 3200 by 1800 liquid metal source render;
  that render was not recovered (`docs/spec/README.md`, "Not recovered").

## Blockers

- `.github/workflows/check.yml` is written but not committed or pushed. GitHub rejected the push
  of the M1 commit with `refusing to allow an OAuth App to create or update workflow
.github/workflows/check.yml without workflow scope`: the `gh` token that git uses for
  github.com (`credential.https://github.com.helper`) has the scopes `gist`, `read:org` and
  `repo` only. Kevin runs `gh auth refresh -h github.com -s workflow` once, then
  `git add .github && git commit` and `git push origin main`. Until then CI does not run on push.

## Open items

- Express the 4 escape blocks in the grammar (the `composite` block, SPEC 4.2, is M5) and retire
  the 2 known findings with them; append `lock-closed` to the sprite with `scripts/add-icon.ts`.
- Map the 17 residual CSS rules and 12 inline styles on the 12 slides listed above, or decide they
  stay under `ext`.
- Make a re-import that changes nothing a no-op on `revision`, or point the acceptance import at
  a scratch deck, so `pnpm check` stops dirtying `decks/gt-brand/deck.json`.
- The 28 severity 2 findings, mostly `dia/stroke-grammar` (14) on raw svg diagrams and
  `rows/two-lines` (8).
- The compare budget holds with a margin (worst 0.332 percent of 0.5); `gem-smoke` and `dx` are
  the two slides to look at if a renderer change moves the numbers.
- Writes, the store, MCP over stdio and flatten PPTX export are M2; the editor and the window API
  are M3; the skills are stubs until M4.
- `docs/spec/` and the deck's licensed photographs are in a public repository provisionally (SPEC
  11, open question 14); Kevin's decision.
- Archive `.turboslide/` from an accepted run when the milestone is signed off; it is regenerated
  by `pnpm check` and is not committed.
