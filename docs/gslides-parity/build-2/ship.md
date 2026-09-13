# Ship step, Google Slides parity round two

The ship step's record (`docs/gslides-parity/MILESTONES-2.md` "Ship step"), written 2026-09-13
(PDT) on the shared checkout at `/Users/kevinliu/repos/Turboslide`, `main` at `a65b313` plus the
working tree of the six builders, the integrator and the fixers, after the verifier's pass 2
(`docs/gslides-parity/VERIFICATION-2.md`; its section 14 is the production table this step
appends). Section numbers refer to SPEC-2 unless prefixed SPEC; finding numbers are
VERIFICATION-2 section 10's. Every command ran from the repository root; the git write commands
here are the ship step's own (`git add` by explicit path list, two commits, two pushes); no `pnpm
install`, `pnpm add`, `pnpm exec` or `pnpm build` ran outside `scripts/check.mjs`; Docker ran
inside check step 25 only; the token of `~/.config/turboslide/hosts.json` was read in code
(`verification-2/ship/run-with-token.mjs`) and never printed.

## 1. Preconditions, as verified here

- `git status` at the start: 402 paths, nothing committed, `.github/` untracked. After the ship
  step's own edits the first commit carries 520 paths (250 added, 269 modified, 1 deleted:
  `packages/chrome/src/dialogs/InsertTable.tsx`), the list being `git status --porcelain -uall` minus `.github/`, asserted free of `.github`, `.turboslide`, `.vercel`,
  `dist`, `target`, `node_modules`, `__pycache__`, `.log`, `.env` and `.tsbuildinfo` paths. The
  verifier's `.log` evidence files under `verification-2/` are ignored by the root `.gitignore`'s
  `*.log` rule and stay local, as round one's did (its committed evidence is `.txt`, `.json`,
  `.png`, `.jpg`, `.pdf`, `.pptx`, `.mjs`, `.sh`); the ship step's own evidence is `.txt`.
- `git grep -n '<<<<<<<'`: no marker outside the prose that names the command.
- `pnpm generate:contracts`: "14 files current" before and after the ship step's edits (the MCP
  compaction of section 2 changes what the live server serves, not the generator's derivation).
- `node_modules/.bin/tsc -b`: exit 0 (6.5 s).
- VERIFICATION-2 section 10 left two severity 3 findings (15, 16) and seven severity 2 findings
  (17, 18, 19, 24, 26, 27, 28) open, against this step's precondition of severity 1 or recorded
  deviations. Section 2 says which the ship step closed; section 6 records the rest as blockers
  for the next fix round. Kevin asked for no stops.

## 2. Fixed at the ship step

1. Finding 15 (severity 3). The 22 slide files of `decks/templates/gt-brand/slides` were copied
   from `decks/gt-brand/slides`, the re-snapshot the templates test itself prescribes ("copying
   decks/gt-brand/deck.json and slides/\*.json over the template"); the only difference was the
   `alt` key's position on the `dia` and `dither` blocks, 52 lines, no value. The template's
   `deck.json` keeps revision 24 and `template.json` names it, which the manifest test compares
   apart from the revision and the stamps. `packages/store` `templates.test.ts` 14 of 14;
   `packages/schema` `migrations.test.ts` 10 of 10; check step 7 stays idempotent (revision 25
   kept, `decks/gt-brand` unchanged after the commit).
2. Finding 16 (severity 3) with 13. `packages/mcp/src/tools.ts`: the outputSchema served on
   tools/list is `compactOutputSchema(wrappedOutputSchema(...))`. Every property whose JSON is
   over `OUTPUT_PROPERTY_BUDGET` (16 KB) is reduced to its JSON type (the one type the variants
   of a `oneOf` share, so the Slide union serves as `type: object`) and a sentence naming the
   committed contracts; arrays keep `items: {}`; the definitions nothing references any more
   are dropped. Measured on the tree: the 88 tools serialise at 1,531,574 bytes (1.46 MB) where
   the same list was 27,211,421 bytes; the outputs fell from 25.8 MB in total (477 KB each for
   the 46 tools that answer with the slide) to under 16 KB each; the inputs (1.4 MB, the four
   block taking tools at 258 to 407 KB) are untouched, so an agent still reads the full block
   union where it writes one. `outputSchemaFor` still returns the full schema (the existing test
   on `version.list`'s recursive definitions holds) and the committed `mcp-tools.json` is the
   generator's own derivation, unchanged. Two tests in `tools.test.ts`: the served `slide` is
   `type: object` with the sentence and no definitions while `deck.info` and `export.run` are
   served whole (the same object, byte for byte), and `deriveTools(() => true)` stays under 4 MB
   with every outputSchema under 32 KB. `packages/mcp` 36 of 36 in 3.8 s; `apps/cli`
   `mcp.test.ts` 2 of 2 in 3.0 s (both timed out in the verifier's root run, finding 13).
3. Finding 20. `scripts/check.mjs` step 20 writes `docs/gslides-parity/verification-2/parity-audit.json`,
   MILESTONES-2's path; round one's committed report is no longer overwritten.
4. Finding 26. `centredPosition` in `packages/chrome/src/editor-shell.ts` centres without the
   8 px grid (6.1 row 31: Snap to > Grid is off by default; the fixture's `chart-bar` sits at
   320, 180). `packages/chrome` 411 of 411; `charts.spec.ts` 2 of 2 in the chain; the production
   walk's chart lands at 320, 180.
5. Finding 27. `apps/studio/e2e/present.spec.ts` derives `PLAY` from the fixture's sections minus
   the slides that carry `skip: true` (26 of 27), per SPEC-2 0.42; 3 of 3 in the chain.

## 3. The chain

`node scripts/check.mjs --from 4`, then `--only 5`, `--from 6`, `--from 21` and `--from 22`
(`verification-2/ship/check-from-4.txt`, `check-only-5.txt`, `check-from-6.txt`,
`check-from-21.txt`, `check-from-22.txt`), each with `TURBOSLIDE_EXPORT_BATCH=3`, the runner's
own dev server on 4321 for the server steps (stopped by the runner; 4321 was free before and
after). Step 3 was not rerun as a step: `pnpm generate:contracts` answers "14 files current" and
the diff it gates is the round's uncommitted output, committed below. The machine carried load
from processes outside the round for the whole chain: `uptime` load averages 14.98, 24.75 and
31.21 at 10:06 PDT, four root owned `top -l 0 -s 1` monitors up for 1 day 22 hours at 2 to 35
percent CPU each, a screen recorder's GPU process at 34 percent, and B4's dev server on 4444
(`.turboslide/b4/vite.config.ts`, 17 hours old); none of them the ship step's to stop.

| Step | Command (abridged)                                                        | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4    | `tsc -b`                                                                  | ok, 0.5 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5    | `pnpm test` (the root vitest run)                                         | FAIL twice on 5 s budgets under load: in the chain 1 of 1,990 (`apps/cli` `canvas.test.ts` "set-layout --type freeform is the same measured conversion", 80.5 s); alone (`--only 5`) 17 of 1,990 in 161 s, every one "Test timed out in 5000ms" (cli canvas, freeform, gslides, mcp and walk tests, mcp `tools.test.ts` twice, schema `apply-layout`, effects parity, pixelmatch and DSSIM); every failing file passes alone (cli canvas 5 of 5 in 7.6 s, cli mcp 2 of 2 in 3.0 s, mcp 36 of 36 in 3.8 s, chrome 411 of 411)     |
| 6    | `pnpm build && check-client-bundle`                                       | ok, 5.8 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 7, 8 | the Prototemplate import, 85 slides, 8 sections, 0 html blocks            | ok, 1.8 s; idempotent, revision 25 kept                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 9    | `turboslide validate decks/gt-brand`                                      | ok, 1.0 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 10   | `render all --theme light,dark`                                           | ok, 18.4 s; 170 records, no page error (11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 12   | `compare-to-shoot.mjs --max-mismatch 0.005`                               | ok, 53.0 s: 170 pairs, 170 compared, 0 over budget; worst 0.408 percent (`fixed-points`), mean 0.016 percent against the Prototemplate shoot                                                                                                                                                                                                                                                                                                                                                                                     |
| 13   | `sheet all`, both sheets with 85 cells (14)                               | ok, 3.8 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 15   | `lint all --json`                                                         | ok, 8.5 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 16   | `build --budget 16`                                                       | ok, 2.9 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 17   | `playwright test viewer.spec.ts`                                          | ok, 20.2 s: 6 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 18   | `lint --chrome` on `/deck`, `/edit`, `/new`, `/decks` at 1440, 1280, 390  | ok, 158.5 s: 24, 24, 24 and 6 audits, 0 with findings, 0 states unapplied                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 19   | `pnpm format:check`                                                       | ok, 36.9 s (the ship scripts included)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 20   | `gslides-parity-audit.mjs --out verification-2/parity-audit.json`         | FAIL, 815.4 s: 2,127 pass, 8 fail, 382 skipped; the eight are `format.dropShadow` on a paragraph (finding 10), the six group state rows `group.chip`, `toolbar.group`, `contextMenu group`, `sections.group`, `group.ring`, `arrange.regroup` (finding 17) and `key.selectAll` reading "Title" over 7 objects (finding 18); no new row                                                                                                                                                                                           |
| 21   | the 15 Playwright specs                                                   | FAIL, 767.5 s: 66 tests, 57 passed, 4 failed, 5 did not run in 12.8 min (the verifier: 54, 6, 6). `charts.spec.ts` 2 of 2 and `present.spec.ts` 3 of 3 now pass (findings 26 and 27). The four failures are finding 28's rows: `canvas.spec.ts` 19 writes expected, 18 read after Cmd+Shift+Up; `objects.spec.ts:198` no `handle.text.move` after the rotation; `tables.spec.ts` strict mode on `table/rows/1/cells/1` (the filmstrip's live clones); `text-styles.spec.ts` 14 writes expected, 13 read in the paint format test |
| 22   | the fixture in both modes with `export check`, the flatten report perfect | ok, 59.7 s: native `passed: true`, flatten `perfect: true`, worst decoded mismatch 0.000 percent on 26 pages in both themes                                                                                                                                                                                                                                                                                                                                                                                                      |
| 23   | `fonts build --check`                                                     | ok, 67.3 s: 0 stale files, version 4.001+gt.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 24   | `canvas-fidelity.mjs` over the GT deck and the two templates              | ok, 131.5 s: 171 slides converted, 342 pairs, 0 over budget, worst 0.262 percent (`gt-brand/directions` dark), mean 0.004 percent                                                                                                                                                                                                                                                                                                                                                                                                |
| 25   | Docker build and `export --mode native --verify` in the image             | FAIL, 86.8 s, in the image build: `playwright-core install-deps chromium` stops at apt "You don't have enough free space in /var/cache/apt/archives/" (exit 100); `docker system df` reads 147 images, 97.52 GB, 56.09 GB reclaimable, from other projects on this machine. No verify ran; the verifier's container pass (VERIFICATION-2 section 7) is the container record                                                                                                                                                      |

## 4. The commit and the push

Commit `13d0361` on `main`, "Turboslide Google Slides parity, round two: the canvas, text styles,
rotation, groups, shapes, lines, charts, diagrams, table tools, image tools", authored as the
repository's local identity (Kevin <kk23907751@gmail.com>) with the body carrying the acceptance
summary and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; 520 paths,
341,391 insertions, 24,361 deletions. Pushed `a65b313..13d0361` to `origin/main` at 10:43:26 to
10:43:34 PDT. The second commit, "Turboslide Google Slides parity, round two: the production
table", carries VERIFICATION-2.md section 14, this file, `verification-2/production-canvas.jpg`
and the ship evidence under `verification-2/ship/` (the check logs, the poll, the smoke rows, the
walk's script, report and six run logs, the export row, the Vercel record, the two helper
scripts).

## 5. Production

The Vercel Git integration built `dpl_23EcNRDJMM33QZ9pw6Gc9eoQXBVP`
(`turboslide-1uhwap5ew-kl01s-projects.vercel.app`) from the push: created 10:43:38 PDT, Ready,
aliased to `https://turboslide.vercel.app`, `turboslide-kl01s-projects.vercel.app` and
`turboslide-git-main-kl01s-projects.vercel.app`, four functions at 105.69 MB in `iad1`
(`verification-2/ship/production-vercel.txt`). The poll (`ship/poll-deploy.py`,
`production-poll.txt`; a first run, `production-poll-run1.txt`, stopped on a generic marker the
round one bundle also carries and was corrected) read the round one deploy at 10:44:22 (`/new`
18,537 B, `ts-ruler` 0, `ts-deck-guide` 0 across 11 stylesheets and 1 script) and the new one at
10:44:54, 80 s after the push (`/new` 24,563 B and `/edit/gt-brand` 24,649 B, `ts-ruler` 31 and
`ts-deck-guide` 10 bytes of markers in their assets).

`node scripts/hosted-smoke.mjs --base https://turboslide.vercel.app` at 10:45:19 PDT: 10 of 10
(`production-smoke.txt`; VERIFICATION-2 section 14 has the table). With the bearer,
`--token-env TURBOSLIDE_TOKEN --export-batch` at 10:45:30 (`production-smoke-batch.txt`): 12 of
12; `deck.info` on `gt-brand` 0 snapshots at revision 31 (no write since the deploy); the
batched Perfect export of the 85 slides in 237.7 s of wall time: the plan in 1.9 s (2 batches of
60), batch 0 60 slides in 79.4 s, batch 1 25 slides in 41.7 s, the merge 85 pages in 111.0 s at a
peak of 668.4 MiB, `perfect: true`, `gt-brand-light.pptx` 16,276,070 bytes stored (the preview's
run: 239.5 s, 784.2 MiB).

The canvas on production (`ship/production-canvas.mjs`; the record `production-canvas.json`, the
screenshot `verification-2/production-canvas.jpg`): six runs while the script's own selectors
were corrected (`production-canvas-run1.txt` to `run5.txt` with their JSON: the italic check
read a JSON flag where the Text carries the mark span `[Canvas round two]{i}`, the Shapes row is
the shell's drawn plate whose tiles are `insert.shape.shapes.pick.<preset>`, the trash card is
`trash.card.<id>`, and the editor's own navigation to `/decks` after Move to trash raced a read
in the same tab, now a second tab); the product steps passed in every run they reached. The
final run at 10:53:54 PDT, 11 of 11 in 16.0 s, 0 page errors: `/new` ready in 626 ms; the Title
slide's heading dragged 60 by 40 sheet pixels, the slide converted to the freeform layout
(`kind: content`, `template: title`) and the deck `untitled-20260913-9xqu` created on the Blob
store in the same write; a rectangle drawn at 1000, 520 by 240 by 160 and rotated to 30 degrees by
Option+Right twice; Insert > Chart > Bar at 320, 180 by 960 by 540 (z 4); "Canvas round two"
typed into the heading and Cmd+I over the line, read back as `[Canvas round two]{i}`; revision 6
with 6 versions; `deck.info` over `/api/actions` with the bearer reporting `counts.snapshots` 6
(MILESTONES-2 ship item 4); File > Move to trash listing the deck on `/decks/trash` and not on
`/decks`; Delete forever through the trash page's own button for this run's deck and for the
previous run's. The objects after the walk: `mark` 137, 307.28, 132 by 84 (z 0); `heading` 197,
484, 593.44 by 90 (z 1); `lead` 137, 555.03, 593.44 by 38 (z 2); `shape` 1000, 520, 240 by 160,
rotate 30 (z 3); `chart` 320, 180, 960 by 540 (z 4). Every scratch deck of the six runs was
deleted forever; `deck.list` with the trash at 10:55 lists 15 decks and no trashed one. The
fifteenth, `untitled-20260913-tii2` ("V1", revision 11, not trashed), was written by another
author after the deploy and is not the ship step's.

## 6. Blockers recorded for the next fix round

Every item below is VERIFICATION-2 section 10's, unchanged in this step; the owner is the one
named there.

1. Finding 17 (severity 2, B4): a click on a grouped object's text surface, or while another
   object is selected, selects the member and not the group; the audit's six group rows and
   Regroup.
2. Finding 18 (severity 2, B4): Cmd+A on the canvas keeps only the selected object unless it is
   the first in the slide's order.
3. Finding 19 (severity 2, or a deviation for Kevin, B4): a double click on the photograph of an
   unconverted picture kind writes the conversion before crop mode opens.
4. Finding 28 (severity 2, B4, B5): the four step 21 rows above (`canvas.spec.ts`,
   `objects.spec.ts`, `tables.spec.ts`, `text-styles.spec.ts`); the products behind them pass the
   verifier's walk and the production walk here, so the specs need their locators and counts.
5. Finding 24 (severity 2, B2): the container's native verify is load sensitive; this step could
   not build the image at all (section 3, step 25: the Docker VM's disk).
6. The 5 s vitest budgets of the root run under load (section 3, step 5): the headless tests of
   `apps/cli` and the schema and effects tests pass alone and time out in the root run on a loaded
   machine; a budget per headless test, or a `testTimeout` for the root run, is B1's and the
   integrator's call.
7. Findings 9, 10 (B3, the Format > Text rows on an empty placeholder; Drop shadow from a
   paragraph's right-click menu), 21 (the `validate.run` window handler), 22 and 23 (Format options
   tooltips and the `layout` section), 25 (the client build's externalized `node:` modules), 29 and
   30 (the default view words and the tooltip audit on the Vercel toolbar), severity 1 as recorded.

## 7. Commands run

| Command                                                                                                                                         | Result                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `git status --short`, `git grep -n '<<<<<<<'`, `git check-ignore -v` on the verifier's logs                                                     | 402 paths; no marker; `*.log` ignored                          |
| `cd packages/store && vitest run src/templates.test.ts` before and after the re-snapshot                                                        | 1 failed of 14, then 14 of 14; `migrations.test.ts` 10 of 10   |
| the tool list measured through `toolEntry` and `deriveTools` before and after the compaction                                                    | 27,211,421 B, then 1,531,574 B for 88 tools                    |
| `node_modules/.bin/tsc -b`                                                                                                                      | exit 0                                                         |
| `vitest run` in `packages/mcp`, `packages/chrome`, `apps/cli src/commands/mcp.test.ts`, `apps/cli src/commands/canvas.test.ts`                  | 36 of 36; 411 of 411; 2 of 2; 5 of 5                           |
| `node_modules/.bin/prettier --check` and `--write` on the edited files and the ship scripts                                                     | clean                                                          |
| `pnpm generate:contracts`                                                                                                                       | 14 files current                                               |
| `node scripts/check.mjs --from 4`; `--only 5`; `--from 6`; `--from 21`; `--from 22`                                                             | section 3                                                      |
| `git add -- <520 paths>`; `git commit -F <message>`; `git push origin main`                                                                     | `13d0361`; `a65b313..13d0361` at 10:43:34 PDT                  |
| `python3 verification-2/ship/poll-deploy.py https://turboslide.vercel.app 15`                                                                   | the new deploy at 10:44:54, second poll                        |
| `vercel ls turboslide --prod`; `vercel inspect turboslide-1uhwap5ew-kl01s-projects.vercel.app`                                                  | Ready, created 10:43:38, aliased to turboslide.vercel.app      |
| `node scripts/hosted-smoke.mjs --base https://turboslide.vercel.app`                                                                            | 10 of 10                                                       |
| `node verification-2/ship/run-with-token.mjs <host> -- node scripts/hosted-smoke.mjs --base <host> --token-env TURBOSLIDE_TOKEN --export-batch` | 12 of 12; the batched export in 237.7 s, perfect, 16,276,070 B |
| `node verification-2/ship/run-with-token.mjs <host> -- node verification-2/ship/production-canvas.mjs --base <host> [--purge <id>]` (six runs)  | 11 of 11 in the final run; every scratch deck deleted forever  |
| `deck.list` with `includeTrashed` over `/api/actions` with the bearer                                                                           | 15 decks, none trashed                                         |
| `docker system df`                                                                                                                              | 147 images, 97.52 GB, 56.09 GB reclaimable (step 25's cause)   |
| the second commit and push                                                                                                                      | the hash in the ship report                                    |
