# Implementation plans

Written by the improve skill (github.com/shadcn/improve at cac56e1) on 2026-11-09 against commit
`c6d37cfe3`. Standard effort over `apps/studio`, `packages/chrome` and `packages/viewer`, with the
check scripts that gate the studio. The run had nobody to choose, so the plans are the top
findings by leverage. Each executor: read the plan fully, honor its STOP conditions and update
your row.

## Execution order and status

| Plan | Title                                                                                  | Priority | Effort | Depends on | Status             |
| ---- | -------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ------------------ |
| 001  | The editor controller removes its document listeners when it stops                     | P1       | S      | none       | DONE               |
| 002  | A cancelled press on an object's body is disarmed                                      | P1       | S      | none       | DONE               |
| 003  | No tooltip on keyboard focus inside any menu, and the outline row menu keeps its focus | P2       | S      | none       | DONE (two commits) |
| 004  | The docs search keeps focus inside its window and returns it to its opener             | P2       | S      | none       | DONE               |
| 005  | Esc closes the print preview, as its tooltip says                                      | P2       | S      | none       | DONE               |
| 006  | A failed undo or redo leaves the history as it was                                     | P2       | M      | none       | DONE               |

Status values: TODO, IN PROGRESS, DONE, BLOCKED (with a reason), REJECTED (with a reason).

No plan depends on another. 001 and 006 both edit `apps/studio/src/editor/controller.tsx`, in
different functions.

Plans 001 to 005 and the small fixes were applied on the branch `claude/shadcn-improve` in the
same session, each as its own commit with a unit test where the code has a test harness, and
checked in a browser on a dev server (the docs search, the account menu, typing, undo, a drag and
the print preview). Plan 003 landed as two commits, one per defect. Plan 006 was applied on
2026-11-10: a step the room refuses goes back to its stack, and the draft's first write, whose
document keeps the step, is left as it was. A row marked DONE is found with
`git log --oneline -- <a file of the row>`.

## Small fixes that need no plan

One or two line changes, each with its evidence.

| Finding                                                                                                                                                    | Where                                                 | Status |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| The picture decode of the site's field canvas has no catch, so a failed picture is an unhandled rejection on every `/home` load                            | `apps/studio/src/components/site/field-canvas.ts:440` | DONE   |
| Check step 6 fails on a shader preview named `pulsing-border--solid-line.webp`: the Solid check matches any file name containing "solid"                   | `scripts/check-client-bundle.mjs:192`                 | DONE   |
| The `/home` LCP row accepts a picture under `/home/`; the hero poster has been emitted under `/assets/` since the site build                               | `scripts/perf-budget.mjs:545`                         | DONE   |
| Three CSS rules with no user: `.site-mark`, `.site-ln.is-out`, `.ts-shell-banner`                                                                          | `site.css:156`, `site.css:608`, `EditorShell.css:178` | DONE   |
| The README's counts of actions, MCP tools and HTTP paths are the 2026-09-14 numbers (169, 146, 153); `packages/theme/brand/facts.json` reads 203, 179, 187 | `README.md:64`                                        | DONE   |
| `docs/readme/docs-index.test.mjs` has failed since 2026-10-19: the docs index does not link `html-layers.md`                                               | `docs/README.md`                                      | DONE   |
| `pnpm format:check` (check step 19) fails on twelve files last changed between 2026-10-05 and 2026-10-16                                                   | twelve files, Prettier's output alone                 | DONE   |

## What the checks read on the branch

Run on 2026-11-09 at a machine load of 80 to 240, on the branch with every commit above. The
branch was then rebased onto the GT logo commit `2cae692db`, which shares no file with it.

- Check step 4 (`tsc -b`): passed, and passed again on the rebased tree.
- Check step 5 (the root `vitest run`): 43 of 7,032 tests failed, the ones the output kept all
  5 s and 30 s timeouts in the CLI, schema and studio projects, plus the docs index test the
  branch has since fixed. The three packages the branch touches were then run alone with a 180 s
  timeout: viewer 618 of 618; chrome 1,230 of 1,235, where the failures move between runs (a lazy
  dialog not found in time) except one share dialog focus test that fails the same way on the
  base files; studio 1,468 of 1,469, where the one failure (`index-facts.test.ts`, a 5 s cache
  row read in a test that took 7 to 10 s) fails the same way on the base files. Not run again
  after the rebase.
- Check step 19 (format, and the README's "What works today"): failed on twelve files no plan
  touches, and passed after the commit that formats them. After the rebase Prettier read the 39
  files of the GT logo commit alone, and passed.

## Security

The run found access control findings on the studio's server. The repository is public, so they
are not written here; they went to Kevin with their evidence.

## Findings without a plan

Vetted by reading the cited code. Listed so the next run does not audit them again.

| Finding                                                                                                                                                                                                                                 | Category  | Effort | Risk | Why no plan now                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ | ---- | ---------------------------------------------------------------------------------------------------- |
| A collaborator's presence event re-renders the whole editor: `publish({ roster })` replaces the snapshot `EditorRoot` subscribes to whole (`controller.tsx:2009`, `EditorRoot.tsx:544`, `:1714`)                                        | perf      | M      | MED  | Needs a render count first; the roster needs its own subscription                                    |
| Every document change lints the whole deck inside a render, and `toSections` filters the findings once per slide (`EditorRoot.tsx:711`, `:298`)                                                                                         | perf      | S to M | LOW  | The findings feed the shell (`EditorRoot.tsx:1757`), so "compute on demand" needs its readers mapped |
| With the ruler on or a line tool armed, every pointer move sets state at the top of `Editor` (`Editor.tsx:6248`, `:6259`; `Gestures.tsx:1023` returns a new empty array)                                                                | perf      | S      | LOW  | Both tools are behind Advanced tools                                                                 |
| The first drag on a slide converts it from the slide as it was at pointer down, so a collaborator's edit made during the drag is overwritten (`Editor.tsx:3397`, `:3589`)                                                               | bug       | M      | MED  | Not traced through the room's transform; needs an investigation plan                                 |
| The snackbar's Undo after a delete runs `undo()`, which undoes the newest edit, not the delete, when an edit landed in between (`EditorRoot.tsx:1452`)                                                                                  | bug       | S      | MED  | May be meant as Edit > Undo; Kevin's call                                                            |
| The print page's PDF poll has no deadline (`print.$deckId.tsx:187`)                                                                                                                                                                     | bug       | S      | LOW  | Only a job that never ends reaches it; the download finishing after Close Preview is wanted          |
| eslint is in no check step and no CI job, and the baseline has drifted: `packages/chrome` 45 accepted, 240 found; six disable comments name `react-hooks/exhaustive-deps`, a rule the config does not load                              | dx        | M      | MED  | A mass fix across files other sessions are editing                                                   |
| Seven Apple platform checks, two spellings of one chord (`menus/platform.ts:13` against `Toolbar.tsx:156`, `Overlay.tsx:216`, `EditorRoot.tsx:416`, `Editor.tsx:5596`, `DocsShell.tsx:75`)                                              | tech-debt | S      | LOW  | A visible change to key labels; wants one decision on the spelling                                   |
| About ten hand written `localStorage` wrappers, three of which cast the parsed value unchecked (`useEditorKeys.ts:123`, `Sidebar.tsx:727`)                                                                                              | tech-debt | S      | LOW  | Sixteen files; not urgent                                                                            |
| `decks.index.tsx:203` decodes a cookie outside a `try`, so a malformed `ts-home` cookie answers 500 on `/decks`                                                                                                                         | bug       | S      | LOW  | The file is being edited by another session                                                          |
| AGENTS.md says `createServerFn` appears only under `apps/studio/src/server/` and that every chrome file is in `PORTED_FROM.json`; four files and 337 files say otherwise                                                                | docs      | S      | LOW  | AGENTS.md and `PORTED_FROM.json` are being edited by another session                                 |
| The README's "What works today" is rendered from the audits of 2026-09-15                                                                                                                                                               | docs      | S      | LOW  | Needs a gate run to render from                                                                      |
| No unit test covers the bundle import's source allowlist and fetch guards (`bundle-core.ts:379`, `:402`), `download.ts` (its test file tests `export-sync`), the controller's base check, or the attach and detach of `/home`'s modules | tests     | M      | LOW  | Tests only; a plan each when picked                                                                  |
| `deckDetails` (`apps/studio/src/server/decks.ts:720`) has no caller; `scripts/knip-allow.json` lists it as a known unused export                                                                                                        | tech-debt | S      | LOW  | Deleting it also removes two lines of `scripts/knip-allow.json`; a cutover Kevin may want kept       |
| Three export progress tests sleep on real timers (`export-jobs.test.ts:770`)                                                                                                                                                            | tests     | S      | LOW  | Not seen failing                                                                                     |

## Direction

Options for the maintainer, each from the repository's own evidence.

- Drivers before fixes. Of the rows that hold a feature behind Advanced tools in the README, 227
  are "not driven" against 439 broken (Fonts 18 of 22, the brand kit 17 of 26). docs/FOCUS.md
  section 8 returns a feature once its rows are driven and pass, so a driver may free a feature
  that already works.
- PowerPoint import. docs/NEXT.md 4.4.1 ranks it second and notes it is not built; the export
  exists and `export.check` already reopens a file, so the first step is a round trip of the
  repository's own output.
- Tracked share links and "Send this version". docs/NEXT.md 4.4.1 ranks them first and fourth;
  `share.createLink`, `version.save` and `activity.list` already hold most of the data.

## Considered and rejected

- The Details dialog reading the whole store listing (`apps/studio/src/server/decks.ts:731`):
  nothing calls `deckDetails`. `scripts/knip-allow.json` lists it as a known unused export, and
  the dialog reads its facts elsewhere. A fix was written, then dropped when the caller search
  came back empty. What is left is in the table above: the unused server function.
- A guest controller on `/try` that outlives its session's stop: covered by plan 001.
- The `checkpointing` chain of `try/tab-backend.ts:191` staying rejected after one failure: the
  room it belongs to is already broken when that happens.
- The dead `[data-control="view.theme"]` lookup in `home-entry.ts:42`: harmless.
- The size of `Editor.tsx` and `controller.tsx`, the features behind `advanced: true`, the three
  allowed `import()` sites, the forwarding exports of `Tooltip.tsx`, `Layer.ts` and `theme.ts`,
  the pinned jsdom, and the open Dependabot bumps: decided, recorded in AGENTS.md or its docs.
- A fallthrough at `editor-shell.ts:994` and a constant condition at `Sidebar.tsx:301` that
  eslint reports: both intended.

## Not audited

`packages/render`, `packages/store`, `packages/schema`, `packages/export`, `packages/materials`,
`packages/realtime`, the CLI, the realtime Worker and the Rust crate, except where a finding led
into them. `packages/theme/assets/sprite.svg`, `GT_BAND`, `decks/gt-brand`, `decks/templates` and
the files another session was editing (`GtMark.tsx`, `ThemesPanel.tsx`, `dialogs/Logo.tsx`,
`palette-data.ts`, `Frame.tsx`, `decks.index.tsx`). No command that needs a server or a build ran.
