# AGENTS.md

Rules for anyone, human or agent, working in this repository. The specification is authoritative
where this file is silent; see "Where the specification lives" at the end.

## What this repository is

Turboslide is a block document with a validator and a grammar linter, and everything else is a
client of that one library (SPEC 1). The slides are the GT brand deck, unchanged; the theme is
`gt-ink-paper` (SPEC 2.1). The chrome is the Prototemplate viewer shell ported as source (SPEC 2.2).
The repo is a pnpm workspace on TanStack Start (SPEC 3). Package ownership, file lists and
acceptance commands per milestone are in the milestone plan; the M1 acceptance is `pnpm check`.

## Code rules

- TypeScript strict, ESM everywhere, Node 24. Every package has its own `tsconfig.json` that
  extends `tooling/tsconfig/node.json` or `react.json` by relative path and lists its workspace
  dependencies under `references`; the root `tsconfig.json` references every package so
  `pnpm exec tsc -b` checks the whole tree.
- Dependency versions come from the catalog in `pnpm-workspace.yaml` (`"catalog:"`), which pins
  the exact versions of SPEC 3.2. Never write `latest` or a range. Workspace packages depend on
  each other with `workspace:*`, in the one-way direction of SPEC 3.3 item 3.
- Single quotes, two-space indent, semicolons, 100 columns (`pnpm format`). No `any`. Types, not
  interfaces, except where a library requires interface merging (say so in a comment). No default
  exports except where a framework requires one (Vite, Vitest, Playwright and tsdown configs,
  `eslint.config.js`). No barrel files: packages export TypeScript source through explicit
  subpath `exports` (`"./validate": "./src/validate.ts"`), one line per module (SPEC 3.3 item 2).
- Every package under `packages/` except `viewer`, `chrome` and (later) `native` is framework
  free: no React, no Vite, no `createServerFn`. `createServerFn` appears only under
  `apps/studio/src/server/` (SPEC 3.3 items 1 and 4). Headless Chromium never runs inside the web
  app (SPEC 3.3 item 7).
- Erasable TypeScript syntax only (`erasableSyntaxOnly` in `tsconfig.base.json`): the CLI and the
  contracts generator run their source directly through Node's type stripping, so no `enum`,
  namespaces or parameter properties, and relative imports inside those packages carry the `.ts`
  extension.
- Plain CSS: one `tokens.css` and one small CSS file per component, no Tailwind (SPEC 3.3 item 6).
- Comments and docs in plain technical English, sentence case, no em dashes, no metaphors. Where a
  rule comes from the grammar or the spec, cite the section (`SPEC 5.1`, `DECK-GRAMMAR.md:22`,
  `head:11-176`).

## Parity chains

The theme has one source of truth and two copies that must agree (SPEC 5.1):

`Prototemplate/deck/parts/head.html` (lines 11 to 176 and 249 to 258) is ported once to
`packages/theme/src/gt-ink-paper/sheet.css` and `stage.css` under the `.ts-sheet` root class, and
the same values exist as data in `packages/theme/src/tokens.ts`. A vitest parses `sheet.css` and
asserts that the two agree. A change to a token, a size or a grid constant is made in `sheet.css`
and `tokens.ts` together; the test fails otherwise. `packages/theme/assets/sprite.svg` is the
sprite copied out of `head.html` (63 Heroicons plus `gt-mark`; the ids are in `sprite-ids.json`)
and `sprite.ts` is generated from it.

A UI capability change walks the chain in this order (SPEC 7.5): schema and migration, mutation,
inspector control with label and `data-control`, action table entry, `pnpm generate:contracts`,
skill reference, docs, tests. The chrome is diffable against its source: every file under
`packages/chrome/src` records its Prototemplate origin and commit in `PORTED_FROM.json`, and the
`--pt-` tokens keep their names (SPEC 2.2).

## Dev server rules

These come from a measured incident (tanstack report section 6.3: a console-forwarding loop wrote
a 10.7 GB log in eleven minutes) and from the parallel-builder setup.

- The studio dev server runs on port 4321, always: `pnpm dev` is `vite dev --port 4321 --strictPort`.
  No other port, no second server on one checkout.
- Only the studio builder, the integrator and the verifier start it, and they stop it when done.
  Everyone else works without a server.
- `server.forwardConsole` stays `false` and `devtools()` stays in every Vite config
  (`apps/studio/vite.config.ts` says why). Never redirect the dev server's output to an unbounded
  file; `scripts/check.mjs` and `playwright.config.ts` cap or discard it.
- One browser page at a time: the machine is shared. Playwright runs with one worker.
- The dev server is never a build step. Anything the product needs in production is a server
  route or a server function, not a Vite plugin hook.

## Installs and dependencies

- `pnpm install` runs once, by the scaffolder or the integrator. Never run `pnpm install` while
  another builder may be installing. If a package needs a dependency, add it to that package's
  `package.json` (and to the catalog if it is new) and tell the integrator in the report; do not
  install it.
- `pnpm-workspace.yaml` carries `allowBuilds` because pnpm 11 refuses unlisted build scripts. A
  new dependency with an install script needs an entry there, decided explicitly.
- `pnpm check` starts with `pnpm install --frozen-lockfile`, so the lockfile is always committed
  and current.

## Ownership and git

- Builders own disjoint packages and create or edit only the paths their task assigns. The
  scaffold placeholders (`src/index.ts` in every package) are meant to be replaced by their owner.
- Never `git add -A`. Run git commands only when the task lists them. Commits in this repository
  are authored as Kevin <kk23907751@gmail.com> (the repo-local identity).
- Nothing is claimed done until the acceptance commands exit 0 and the report files named in the
  milestone plan exist. A claim about a deck names the revision.

## Acceptance

`pnpm check` runs `scripts/check.mjs`: the M1 acceptance chain from the milestone plan, in order,
stopping at the first failure. `node scripts/check.mjs --list` prints the steps; `--only 4,5` and
`--from 6` run parts of it. The runner skips the two steps that read the Prototemplate checkout
when `/Users/kevinliu/repos/Prototemplate/deck` (or `TURBOSLIDE_PROTOTEMPLATE_DECK`) is missing,
which is the case in CI, and starts and stops the dev server for the two steps that need it.

All 18 steps pass on the M1 tree (2026-09-10, 219 s on Kevin's machine with the Prototemplate
checkout present); `docs/M1-STATUS.md` records every step with its measured numbers. On the bare
scaffold only steps 1 to 6 passed (install, route generation, contracts generation, `tsc -b`,
vitest, build plus the client bundle check).

Type checking: `pnpm exec tsr generate` must run before `tsc -b` because `routeTree.gen.ts` is
generated and git-ignored (measured: three type errors otherwise). `tsc -b` writes declaration
output to `<package>/dist/types` (project references need it); run `pnpm typecheck` once after a
clone so editors resolve cross-package imports.

Tests: root `pnpm test` runs vitest with every folder under `packages/` and `apps/cli` as a
project. A package that needs jsdom (`viewer`, `chrome`) adds its own `vitest.config.ts` and the
`jsdom` dependency. Browser tests live in `apps/studio/e2e` and run through the root
`playwright.config.ts` (`pnpm exec playwright test apps/studio/e2e/<spec>`), which reuses a
running 4321 server or starts one.

## Chromium

Rendering uses the full Chrome for Testing binary, never the headless shell (SPEC 3.2, 5.3), with
`--use-gl=angle --use-angle=metal --ignore-gpu-blocklist` on macOS and
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` on Linux.

Measured on 2026-09-10 while scaffolding: `playwright-core` 1.62.1 installs Chromium revision
1234 (Chrome for Testing 151.0.7922.34), not the `chromium-1217` build (147.0.7727.15) that the
spec names and that the deck's `shoot-slide.mjs` hard-codes at
`/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
The pixel comparison against `shoot-slide.mjs` (`scripts/compare-to-shoot.mjs`) is only meaningful
on the same build, so `@turboslide/headless` resolves the executable in this order:
`TURBOSLIDE_CHROME` if set, then that `chromium-1217` path if it exists, then
`chromium.executablePath()` from `playwright-core`. CI installs with
`pnpm exec playwright-core install --with-deps chromium` and records the renderer string in every
`RenderRecord` (SPEC 4.2).

## Contracts between builders that the scripts assume

- `turboslide render --out <dir> --json` writes `<dir>/render.json` as `RenderRecord[]` (SPEC 4.2)
  whose `image` is the PNG path, relative to `<dir>` or absolute, and names the files
  `<nn>-<slideId>-<theme>.png` (SPEC 7.2). `compare-to-shoot.mjs` reads the records first and
  falls back to the file names.
- Slide numbering is `deck.json` `sections[].slideIds` flattened, `n = index + 1` (SPEC 4.2).
- `decks/gt-brand/import-report.json` has one row per slide with the slide `id` and an `html`
  field that is `null` or `{ reason }` when an escape block was needed; `htmlBlocks` at the top
  level is the count. `scripts/lib/import-report.mjs` documents the other shapes it accepts.
- `turboslide import --json` prints `{ slides, sections, htmlBlocks, ... }` on stdout (the
  acceptance asserts 85, 8 and at most 4).
- `apps/studio` keeps a route that calls a server function returning
  `TURBOSLIDE_SERVER_ONLY_MARKER_7f3a` (today `src/server/health.ts` from `routes/index.tsx`);
  `scripts/check-client-bundle.mjs` fails when the marker is missing from `dist/server` or present
  in `dist/client`, or when a Solid or devtools chunk lands in the server output.
- The root `tsr.config.json` exists so that the literal acceptance line
  `pnpm exec tsr generate --config apps/studio/tsr.config.json` works from the repo root: the
  `tsr` CLI has no `--config` flag (yargs ignores it) and reads `tsr.config.json` from the working
  directory, so the root copy points at `apps/studio/src/routes`. The app's own `tsr.config.json`
  is read by the Vite plugin. Both produce the same `routeTree.gen.ts` (verified).
- `pnpm generate:contracts` runs `packages/agent/src/generate/main.ts` with Node's type stripping;
  it must write every generated file deterministically so `git diff --exit-code` passes.

## Deviations from the spec, recorded

- `vitest` is pinned at 4.1.11, not a 3.x release: vitest 3 depends on Vite 5 to 7 and would have
  pulled a second Vite next to the pinned 8.2.2; vitest 4 runs on Vite 8.
- `eslint` is 10.10.0: `@tanstack/eslint-config` 0.4.0 depends on `@eslint/js` 10, and 9.39.5 is
  deprecated on npm.
- The Chromium revision note above.
- The acceptance line names `apps/studio/src/routes/openapi.json.ts`. The file is
  `apps/studio/src/routes/openapi[.]json.ts` because TanStack Router's file-based routing escapes
  a dot inside a path segment as `[.]` (the route path stays `/openapi.json`), and the
  generator does not write it; it serves `packages/agent/generated/openapi.json`. Step 3 of
  `scripts/check.mjs` names the file through git's `:(literal)` pathspec magic so the brackets
  are not read as a glob class.

## License

The repository license is SPEC open question 14 and is Kevin's decision. MIT (`LICENSE`,
copyright 2026 Kevin Liu) is the provisional choice, matching Glyphfield. If the repository stays
public under MIT, the GT deck and its licensed photographs move to a private `decks/` overlay
(SPEC 11).

## Where the specification lives

The specification is `docs/spec/SPEC.md`, the milestone plan `docs/spec/MILESTONES.md`, and the
three experiment reports are under `docs/spec/experiments/`. They were written on 2026-09-10 in a
session scratchpad that was cleared the same day and were recovered from that session's transcript
(`docs/spec/README.md` records the provenance and what was not recoverable: the three candidate
designs and the M1 evidence directory). The recovered text is as written, so it still names the
scratchpad paths and cites private material; whether `docs/spec/` stays in this public repository
or moves to a private overlay is Kevin's decision (SPEC 11, open question 14). A SPEC citation in
code (`SPEC 5.1`) is checked against `docs/spec/SPEC.md`.
