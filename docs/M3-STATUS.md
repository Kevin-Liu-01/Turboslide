# M3 status

The state of Turboslide at the end of milestone 3 (the editor and the window API;
`docs/spec/MILESTONES.md`, M3). Written by the verifier on 2026-09-10 after `pnpm check` and the
rest of the M3 acceptance list ran once more, in order, on the tree this commit carries, with the
integration fixes applied. Every number below comes from that run unless the sentence names an
earlier measurement. `pnpm check` started at 22:33:00 local time and passed all 19 steps in
163.4 s (ended 22:35:43); the window API vitest line ran at 22:34:29, during step 10, which needs
no browser; the four browser lines ran from 22:36:38 to 22:37:48 against a dev server the verifier
started on 4321 at 22:36:13 (Vite ready in 877 ms) and stopped after the audit. Host: Node 24.13.0,
pnpm 11.15.1, Chrome for Testing 147.0.7727.15 (`chromium-1217`) on ANGLE Metal, Apple M5 Max, the
Prototemplate checkout at `/Users/kevinliu/repos/Prototemplate/deck`. The deck revision this tree
carries is 13, unchanged: every browser step ran on scratch copies of `decks/fixture` that the
specs create and remove (`decks/e2e-window`, `decks/e2e-editor`, `decks/e2e-undo`), and
`git status decks` is empty after the run. The evidence directory `.turboslide/m3-final/`
(`check.log`, one Playwright log per spec, `vitest-window.json`, `lint-chrome-edit.log`, the capped
`dev-server.log` at 17.6 KB) is git-ignored, as is the integrator's `.turboslide/m3/`; the eight
editor screenshots are committed under `docs/m3-evidence/`; this file is the record.

## What shipped

Scope items are numbered as in the M3 section of the milestone plan.

1. `/edit/:deckId` (`apps/studio/src/routes/edit.$deckId.tsx`, `ssr: false`): the chrome's
   `ViewerShell` around the viewer's stage with the editor's regions in the shell's own slots:
   `toolbarStatus` (the status chip), `toolbarSlot` (`EditTools`: the `Edit | View` Seg, Twin, Lint
   with its count, Source), `onSearch` (the Cmd K palette with the five groups of SPEC 6.3: Go to
   slide `#`, Insert `+`, Actions `>`, View, Versions), `panel` (the inspector in the main region's
   second column), `drawer` (the source drawer over the stage) and `sidebarEdit` (drag reorder
   within and across sections, Alt arrows and the row menu, every write a `slide.move`,
   `slide.insert`, `slide.remove` or `lint.run`; the density Seg switches the rows between the
   outline and the thumbnails). Search params carry the view (`?mode`, `?edit=0`, `?theme`,
   `?twin`, `?lint`, `?src`, plus `?author`); without `?mode` the editor opens on the slide at
   every width. Sidebar minis and grid tiles take the render worker's static captures over the
   live clone once they decode (`Thumb`, `GridView` `StaticShot`), through
   `/api/render/:slideId?w=320&r=<stamp>`.
2. The inspector (`@turboslide/chrome/Inspector`) generated from the Zod annotations
   (`inspector/generate.ts`: Seg for an enum of four or fewer values, select above, stepper for a
   `snap` number, check row, textarea with the live copy lint, sprite picker with the tone Seg,
   asset card, JSON fallback), with the Slide, Layout, Block, Asset, Lint (with Fix), Versions,
   History and Deck tokens sections; every control carries the accessible label
   `<block id>: <property label>` and the `data-control` id (`block.list.size`). The source drawer
   (`SourceDrawer`, CodeMirror 6 with JSON Schema completion from `@turboslide/schema`) with Apply,
   Reset, Copy, Copy as turboslide command and Close, registered as a delegating window API owner
   while open.
3. Selection and the overlay (`@turboslide/viewer/Editor` with `@turboslide/chrome/Overlay`: the
   hair outline under the pointer, the ink ring with the `type · id` chip, the lint boxes), the
   direct manipulation table of SPEC 6.4 except diagram editing (the table below), inline text with
   the run toolbar (weight 500, link, the GT mark), undo and redo as forward writes carrying the
   inverse mutations, `version.restore` as a mutation applied server first, autosave through
   `writeDeck` in one serialized queue, the conflict card (Rebase, Discard), the external revision
   banner from the store's watch channel (a long poll over the server function), advisory leases
   with the sidebar dot and the chip's lease part.
4. `window.turboslide.studio` (the six modules under `packages/agent/src/window`: `registry`,
   `adapter`, `controls`, `invoke`, `ready`, `history`) with three owners on this route: the editor and the viewer on two marker
   elements whose `data-active` follows the `Edit | View` Seg, and the source drawer registered
   while it is open with `excludeOwner` delegation to the editor. `describe().actions` equals the
   generated list from `/api/agent`. The surface is listed under "The window API" below.
5. Static thumbnails (`apps/studio/src/server/thumbs.ts`, `warm.ts`; three widths, cached on disk
   per revision), the twin view (`TwinStage` with the route's `TwinOverlay` for the ring and the
   lint boxes on both panes), the eight remaining rendered lint rules
   (`packages/lint/src/rendered/{clearance,lines,contrast,layout,stretched,thumb}.ts` with
   `palette`, `png`, `bitmap`, `svg`: `dia/label-clearance`, `lines/law`, `contrast/both-themes`,
   `layout/empty-half`, `layout/pair-gaps`, `layout/columns-aligned`, `asset/stretched`,
   `sheet/thumb-legible`), and `RENDERED_LIMITS` in the schema so the docs table and the rules read
   one set of numbers.

Also in the tree: `packages/lint/src/lint-static.ts` (the static layer on its own, decision 1),
`apps/studio/src/server/{write,lint,json}.ts` (the store functions, the lint function and the
JSON boundary), `apps/studio/src/workers/dither.worker.ts` (the two-tone preview worker; see the
open items for what it is not yet wired to), the `sharp` browser stub in both studio Vite configs
(decision 3), the `inspector`, `source`, `palette` and `twin` states of the headless shell driver
with the matching probe fields and a `titanium` role in the chrome auditor (decision 9), the three
Playwright specs, nine jsdom component tests under `packages/chrome/src/__tests__`, four viewer
test files (`gestures`, `selection`, `inline-text`, `snap`), the `./Overlay` export and the
`PORTED_FROM.json` entries for every M3 chrome file (77 entries in total). The catalog gained the
CodeMirror 6 packages and the jsdom test dependencies (defaults, item 1); `pnpm install` was run
once by the integrator and the lockfile is current (check step 1).

## Decisions taken during the integration

Each was forced by a measured failure or a contract mismatch between the builders; the spec's
default was kept wherever it spoke. Recorded by the integrator; the verifier's run confirms each.

1. `lintStatic` moved to `packages/lint/src/lint-static.ts` (`@turboslide/lint/lint-static`);
   `run.ts` re-exports it, so the CLI's import is unchanged. The editor runs the static layer in the
   browser; `run.ts` now also imports the rendered layer, whose PNG decoder needs `node:zlib`, and
   the dev server threw at `packages/lint/src/rendered/png.ts:1` when the route imported
   `@turboslide/lint/run` (Vite externalizes Node builtins for the browser as throwing stubs).
2. `warmThumbnails` moved from `thumbs.ts` to `server/warm.ts`. A `createServerFn` module reaches
   the browser with its handlers removed, but the plain functions `thumbs.ts` exports beside it keep
   their imports in the client transform, and those reach `@turboslide/effects/io`: the route's
   lazy chunk failed on `/@id/sharp` (404) and then `node:zlib` in `effects/src/png1.ts`.
3. `externalSharp()` in `apps/studio/vite.config.ts` and `vite.deploy.config.ts` resolves `sharp`
   to a throwing stub for the client consumer and stays external for the server. The production
   client bundle tree-shakes it; the dev server needed the stub for the same reason as decision 2.
4. `InlineText`'s effect defers its teardown one tick, as `chrome/lib/useMountEffect` does. TanStack
   Start's client runs under React StrictMode in dev, which simulates an unmount right after mount;
   the synchronous cleanup called `finish(false)`, ended the session and marked it done, so every
   inline edit in the dev server lost its listeners at once (the production preview the stage
   builder verified has no StrictMode). Measured with a Playwright probe: contenteditable set,
   removed with the innerHTML restored, set again, then no listener.
5. `runsFromNode` turns a non-breaking space at either edge of a text node back into a space, not
   only a trailing one: Chrome writes `&nbsp;` on both sides of the non-editable GT mark
   (measured: `with ` + the mark + `&nbsp;now`). The deck's two deliberate non-breaking spaces
   ("8 by 8", "4 by 4", a code block) are interior and untouched.
6. The overlay's lint box class is `.ts-lint-box` (chip `.ts-lint-box-chip`). Two builders used
   `.ts-lint`: the overlay's box (`position: absolute`, titanium border, `pointer-events: none`)
   and the LintPanel's root, so on the editor page the panel painted over the Versions section and
   its Fix button took no clicks. The auditor's `lint` selector follows the rename.
7. The status chip shows the state and the revision (`Saved · r13`, `Unsaved`, `Saving`,
   `Conflict · r13`) plus a lease part when another author holds the slide; the lint count is on
   the Lint button (SPEC 6.3) and not on the chip, because both specs assert the chip's exact text.
8. History rows come from the client's undo stack (`n` is the entry id, the revision is recorded
   when the local write applies, the author is the session's); "Undo to here" undoes every entry
   after the row, as the HistoryPanel's title says. The client's `EditHistory` is the source, not
   the server log, because only it carries the inverses the forward undo writes need.
9. `lint --chrome` gained the four editor states: `inspector` (Tab selects the first block; the
   probe wants `.ts-inspector` and `.ts-overlay .ts-select`), `source` (Cmd /, `.ts-drawer`),
   `palette` (Cmd K, the search card) and `twin` (Shift D, `.ts-twin`). The auditor reads
   `--pt-titanium` as a role and allows titanium or ink borders on `.ts-lint-box` only (SPEC 2.2
   junction table); nothing else changed in the line law.
10. Thumbnail URLs are keyed by a stamp of the slide's canonical JSON (`?r=<fnv1a>`), so an
    unchanged slide keeps its immutable capture across revisions and a changed one asks the worker
    once; on disk the cache stays per revision (`thumbs.ts`). The warm job runs once per theme, the
    first time the sidebar shows thumbnails or the grid opens, never on deck open, so the worker's
    queue is free for `render.slide` during the specs.
11. Two chords work from inside a field: Cmd / (the drawer, whose CodeMirror would otherwise keep
    the focus) and Cmd L; every other key stays inert in inputs except Escape (SPEC 6.9). Tab with
    nothing selected selects the first block from the page, Shift Tab the last; with a selection the
    stage Editor cycles. Escape, Delete, Backspace, Enter and the arrows on a selection belong to
    the Editor alone (the route no longer duplicates them).
12. The sidebar mini prefers the static capture and falls back to the live clone (M3 item 5); the
    chrome builder's `Mini` preferred the clone. The grid tile does the same inside the viewer with
    no chrome import (`StaticShot`).
13. The inspector's `busy` flag follows the conflict card only. Disabling every control while a
    write is in flight would blank the panel on each keystroke of a stepper.
14. Each twin pane paints its theme's ground across its column (`.ts-twin-root.ts-sheet` carries
    the theme tokens and the ground), so light chrome holds a dark stage on the right. It passes the
    audit and reads as the two-theme split SPEC 6.8 asks for; whether the plate should show around
    both sheets instead is Kevin's call.
15. The TanStack devtools trigger (the round button at the bottom right) is in every dev
    screenshot; `devtools()` stays in the Vite config by rule (AGENTS.md) and the production build
    strips it.

## Defaults taken

Where the spec left a choice or the implementation had to depart from its letter, the choice taken
and why. Kevin has not reviewed these.

1. CodeMirror 6 is pinned in the catalog at the versions current on 2026-09-10:
   `@codemirror/autocomplete` 6.20.3, `@codemirror/commands` 6.11.0, `@codemirror/lang-json`
   6.0.2, `@codemirror/language` 6.12.4, `@codemirror/lint` 6.9.7, `@codemirror/state` 6.7.4,
   `@codemirror/view` 6.43.11, `@lezer/highlight` 1.2.3. The jsdom tests of `chrome` and `agent`
   pin `jsdom` 30.0.1, `@testing-library/dom` 10.4.1 and `@testing-library/react` 16.3.3.
2. An inline text edit commits one `block.set` of the whole markup at the run's pointer (or a
   `slide.set` of the text field for a title or statement slide) when the session ends: Enter or a
   blur that leaves the run toolbar commits, Escape restores the original markup
   (`InlineText.tsx`, `textCommitMutation`). SPEC 6.4 and 6.7 name `text.replace` coalesced at
   400 ms per block; the M3 plan (item 3) names one write per commit, and one write per session
   gives one History row and one undo per edit instead of one per pause. `text.replace` stays in
   the action table for agents and the CLI.
3. The plate's right edge snaps to the plate width set the schema declares (`PLATE_WIDTHS`, the
   values the validator accepts) rather than to 20 px steps up to the kind's cap (SPEC 6.4), so a
   drag can never produce a width the document would refuse. The seam, the key edge and the shot
   edge snap as the spec says (`snap.ts`; `snap.test.ts` pins the tables).
4. Grid tiles select and do not drag (`GridView` sets `draggable={false}`); slide reorder is the
   sidebar row drag, Alt with the arrows on a focused row, and the palette. SPEC 6.4 lists the grid
   tile beside the row; the tile drag is not in the M3 plan's file list and was left out.
5. Leases stay advisory (M2 default 3; M4 enforces). The editor takes a ten minute lease
   (`LEASE_MINUTES`) on the slide it edits, renews it while the author keeps editing, and shows
   another author's lease in the sidebar dot, the status chip and the inspector's lease line.
6. The server functions under `apps/studio/src/server/write.ts` take and return JSON text:
   TanStack Start's serializability typing refuses `unknown`, which the document types carry on
   purpose (`ext` on slides, blocks and assets; mutation values), so the boundary is a string that
   `json.ts` parses and the schema package validates. The bytes on the wire are what they would
   have been.
7. `describe()` carries two Turboslide additions to Glyphfield's shape: `owner` (the owner id, also
   `owner()` on the handle) and `state` (the owner's facts: deck id, revision, slide id, mode,
   theme), so an agent can tell the editor from the viewer and read the deck facts without a
   second call. The `presenter` owner id is declared and its action list generated
   (`presenterActionIds`), but nothing registers it until `/present` lands (M6).
8. `lint --chrome` takes `--states` (a comma list) for the editor states; without it the audit runs
   the viewer's states as in M1 and M2, so `pnpm check` step 18 is unchanged.
9. The route is `ssr: false` (the milestone plan says so): the editor reads the deck through the
   server function on the client, and the viewer route keeps its SSR.

## Acceptance

The M3 acceptance list of the milestone plan, run in order from the repository root on
2026-09-10. As in M2, the regenerated contract files (`docs/grammar.md` and the two skill
references, one table row each for the sharper `sheet/thumb-legible` check text) were staged before
the run, so step 3 compares the generator's output with what this commit carries. The integrator's
earlier run (21:46) lost its Prototemplate browser in step 12 (`page.waitForTimeout: Target page,
context or browser has been closed` from `shoot-slide.mjs:45`) while other agents' Chrome
processes ran on the machine; the verifier's run passed the step with the M1 and M2 numbers, so
the failure was load, not code (blockers, item 3).

| Line                                                                                                                                                             | Result | Numbers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                                                                     | pass   | all 19 steps in 163.4 s (22:33:00 to 22:35:43); the table below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm exec playwright test apps/studio/e2e/window-api.spec.ts`                                                                                                   | pass   | 3 passed in 10.0 s (11 s wall): `describe().actions` equals `/api/agent` and the owner hands over editor, viewer, editor through the Seg (2.5 s); the deck seeded only through `applySource`, `set('list: Size', 22)` and `set('block.list.size', 22)` each one `block.set` write, `readSource()` shows `size: 22`, `render.slide` before and after: the list box shorter and the row pitch smaller (5.5 s); the drawer owner returns `RangeError` for an unknown action, refuses an invalid source and a slide with another id with `TypeError` and `RangeError` and writes nothing (1.4 s)                         |
| `pnpm exec playwright test apps/studio/e2e/editor.spec.ts`                                                                                                       | pass   | 5 passed in 9.9 s (11 s wall): the key edge drag wrote one `block.set /key` on a snap value other than the seeded 240, the seam drag one `slide.set /layout/ratio` on a named ratio or a 10 px step (1.9 s); inline `with GT now` committed one `block.set` with the letters and the mark rendered (1.7 s); Apply and `applySource` produced identical `slide.replace` logs (2.4 s); Fix on `copy/no-em-dash` wrote one `block.set /text` and cleared the row (1.6 s); Tab from the page selected the first block once, Delete wrote one `block.remove` with a toast naming the undo key and no entrance cut (1.7 s) |
| `pnpm exec playwright test apps/studio/e2e/undo.spec.ts`                                                                                                         | pass   | 1 passed in 2.6 s (3 s wall): ten writes take the chip from `Saved · r<n>` to `r<n+10>` and ten version files, ten Cmd Z to `r<n+20>` and twenty; the slide file is byte identical to the normalized start and `deck.json` identical apart from `revision` and `updatedAt`                                                                                                                                                                                                                                                                                                                                           |
| `pnpm exec turboslide lint --chrome --url http://localhost:4321/edit/gt-brand --widths 1440,1280,390 --themes light,dark --states inspector,source,palette,twin` | pass   | 30 audits over 3 widths and 2 themes (rest plus the four states), 0 with findings, 0 states unapplied, exit 0, 44 s wall                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm exec vitest run packages/agent/src/window`                                                                                                                 | pass   | 3 files, 8 tests, 0.76 s: `history.test.ts` (2), `registry.test.ts` (3: ownership, delegation, the ready event once per owner change), `__tests__/lifetime.test.tsx` (3: the handle survives re-renders and reaches the current props)                                                                                                                                                                                                                                                                                                                                                                               |

### `pnpm check`

| Step | Command (abridged)                                                    | Result | Measured                                                                                                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `pnpm install --frozen-lockfile`                                      | pass   | 21 workspace projects, already up to date, 0.3 s; the lockfile gained 619 lines for CodeMirror 6, jsdom and the testing library                                                                                                                                                            |
| 2    | `pnpm exec tsr generate`                                              | pass   | 0.6 s; picks up `edit.$deckId.tsx`                                                                                                                                                                                                                                                         |
| 3    | tracked check, `pnpm generate:contracts`, `git diff --exit-code`      | pass   | 10 files current, no diff, 0.8 s                                                                                                                                                                                                                                                           |
| 4    | `pnpm exec tsc -b`                                                    | pass   | 2.1 s over the 17 referenced projects                                                                                                                                                                                                                                                      |
| 5    | `pnpm test`                                                           | pass   | 72 files, 658 passed, 2 skipped, 10.79 s in vitest 4.1.11 (M2: 52 files, 509 passed, 2 skipped); step 11.4 s                                                                                                                                                                               |
| 6    | `pnpm build && check-client-bundle.mjs`                               | pass   | 2 turbo tasks in 2.1 s (`cli` 102.17 kB through tsdown; studio client 438 modules, SSR 536 modules); marker in 0 of 20 client files and 1 of 41 server files; 2.6 s                                                                                                                        |
| 7    | `turboslide import … --into gt-brand --json`                          | pass   | 85 slides, 8 sections, 4 html escape blocks, 114 assets, 0.9 s; no file under `decks/gt-brand` changed                                                                                                                                                                                     |
| 8    | import assertion                                                      | pass   | `slides` 85, `sections` 8, `htmlBlocks` 4                                                                                                                                                                                                                                                  |
| 9    | `turboslide validate decks/gt-brand`                                  | pass   | 85 slides, 0 errors, 43 warnings (every one an `ext` kept notice), 0.8 s                                                                                                                                                                                                                   |
| 10   | `turboslide render all --theme light,dark --scale 1`                  | pass   | 170 PNGs and records in 17.2 s (step 18.0 s); renderer `Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max`                                                                                                                                                                       |
| 11   | render assertion                                                      | pass   | 170 records at revision 13, 0 page errors, 0 console errors, 0 overflow entries, fonts `loaded` in every record; readiness p50 8 ms, p95 19 ms, max 35 ms; screenshot p50 39 ms, p95 101 ms, max 145 ms                                                                                    |
| 12   | `compare-to-shoot.mjs --max-mismatch 0.005 --skip-html-escapes`       | pass   | 170 pairs compared, 8 skipped as escapes, 0 over budget; worst non-escape 0.332 percent (`gem-smoke`), mean 0.011 percent, the M1 and M2 numbers exactly; 54.3 s                                                                                                                           |
| 13   | `turboslide sheet all --cols 4 --thumb 480 --numbered`                | pass   | two sheets of 2056 by 8396 px, 85 cells and 8 section labels each, 3.7 s                                                                                                                                                                                                                   |
| 14   | sheet assertion                                                       | pass   | both PNGs exist, both JSON cell maps have 85 cells                                                                                                                                                                                                                                         |
| 15   | `turboslide lint all --json`                                          | pass   | 174 findings: 2 at severity 3 (the 2 known), 80 at 2, 92 at 1; the 52 new severity 2 findings against M2's 122 are the two new rendered rules, `contrast/both-themes` 36 and `dia/label-clearance` 16 (the baseline below); 7.9 s (M2: 0.8 s; the rendered layer now decodes the 170 PNGs) |
| 16   | `turboslide build --out … --budget 16`                                | pass   | 14.53 MiB of 16.00 MiB, 85 slides, revision 13; native 32 twins 1.89 MiB, resample-1280 81 twins 5.82 MiB, two-color 32 twins 458.4 KiB, pass-through 54 twins 1.99 MiB; 2.7 s                                                                                                             |
| 17   | `playwright test apps/studio/e2e/viewer.spec.ts`                      | pass   | 6 passed in 9.3 s, one worker, against the dev server the runner started on 4321; step 9.8 s                                                                                                                                                                                               |
| 18   | `turboslide lint --chrome --widths 1440,1280,390 --themes light,dark` | pass   | 24 audits over 3 widths and 2 themes on `/deck/gt-brand`, 0 with findings, 0 states unapplied; 31.6 s; the runner stopped the server                                                                                                                                                       |
| 19   | `pnpm format:check`                                                   | pass   | every matched file clean, 8.7 s; run again after this document, `docs/README.md` and `AGENTS.md` were written and formatted (the M2 step 33 pattern)                                                                                                                                       |

### Lint baseline

`turboslide lint all` on the committed deck at revision 13 now reports 174 findings (M2: 122). By
rule: `export/non-native` 65, `contrast/both-themes` 36, `dia/label-clearance` 16,
`dia/stroke-grammar` 14, `dia/fit-slot` 8, `rows/two-lines` 8, `opener/sentence-lists-section` 6,
`copy/full-sentence-caption` 5, `escape/html-block` 4, `dia/half-pixel` 3,
`numbers/contradiction` 3, `copy/metaphor-candidate` 2, `copy/sentence-case` 1, `icon/known` 1,
`type/sizes-ladder` 1, `type/svg-label-min` 1. The two severity 3 findings are the M1 known pair.
The other six new rendered rules (`lines/law`, `layout/empty-half`, `layout/pair-gaps`,
`layout/columns-aligned`, `asset/stretched`, `sheet/thumb-legible`) report nothing on this deck;
their unit tests (`rules.test.ts`, `svg.test.ts`, `png.test.ts`, `palette.test.ts` over
`fixtures.ts`) prove they fire on constructed records.

## Direct manipulation

The table of SPEC 6.4, with what this tree does. Every gesture ends in a mutation the reducer
already has (`Gestures.tsx` `gestureMutation`, `blockMoveFor`, `nudgeMutation`); the drag preview
is the reducer's document, so a drag can never show a state the document cannot hold. Each handle
carries the label `<block id>: <property>` and a `handle.<…>` control id, and the arrow keys nudge
it through the same snap tables.

| Gesture (SPEC 6.4)                                                     | Mutation                                                     | This tree                                                                                                                                                                                                                            | Proof                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Drag a slide row or a grid tile                                        | `slide.move`                                                 | Sidebar rows drag within and across sections; Alt with the arrows moves a focused row; the row menu and the palette move, insert, duplicate and remove. Grid tiles select only (defaults, item 4)                                    | `Sidebar.tsx`; the viewer spec selects grid tiles      |
| Drag a block up or down inside a slot, or across the two slots of cols | `block.move`                                                 | Implemented: the selection chip is the handle; a block never leaves a plate                                                                                                                                                          | `gestures.test.ts` `blockMoveFor` (4 cases)            |
| Drag the column seam of cols                                           | `slide.set /layout/ratio`                                    | Implemented: 4/8, 5/7 and 1/1 within 12 px, then 10 px steps, 200 px minimum column                                                                                                                                                  | `editor.spec.ts` 1; `gestures.test.ts`; `snap.test.ts` |
| Drag the key column edge of rows                                       | `block.set /key`                                             | Implemented: snaps to the rows key set the schema declares                                                                                                                                                                           | `editor.spec.ts` 1; `gestures.test.ts`                 |
| Drag the plate's right edge on a full-picture slide                    | `slide.set /plate/maxWidth`                                  | Implemented: snaps to `PLATE_WIDTHS`, not 20 px steps (defaults, item 3)                                                                                                                                                             | `gestures.test.ts` "plate, shot, scales and pair"      |
| Drag a plate to the other side                                         | `slide.set /plate/side`                                      | Implemented: flips by the pointer half, among the sides the kind allows                                                                                                                                                              | `gestures.test.ts`                                     |
| Drag a scales marker                                                   | `block.set /items/i/value`                                   | Implemented: integer 0 to 100; the marker is derived from the value                                                                                                                                                                  | `gestures.test.ts`                                     |
| Resize a shot                                                          | `block.set /width`                                           | Implemented: snaps to the column width (which deletes the property), 425 and the slot height; a vertical drag past 24 px flips `/crop` between top and center (an addition, `shot-crop`)                                             | `gestures.test.ts`                                     |
| Swap the figures of a pair                                             | `block.set /figures`                                         | An addition beyond the spec's table: dragging one figure of a `pair` over the other swaps them                                                                                                                                       | `gestures.test.ts`                                     |
| Alt-drag a label or marker in a declared dia                           | `block.set /data/…`                                          | Not implemented; M5 by the plan, a `dia` block gets no handle beyond its chip                                                                                                                                                        | `Gestures.tsx` `handlesFor`                            |
| Double-click text                                                      | `block.set` of the run's markup (`text.replace` by the spec) | Implemented: contenteditable on the run, Enter also starts it; the run toolbar has weight 500 (Cmd B), link (Cmd K) and the GT mark; a typed standalone `GT` renders as the mark on commit; one write per session (defaults, item 2) | `editor.spec.ts` 2; `inline-text.test.ts` (9)          |

Selection is by click on the innermost `[data-block]`; Tab and Shift Tab walk the blocks in
document order (from the page they select the first or the last); Escape steps back from text edit
to block to nothing; Delete and Backspace remove the selected block with a toast naming the undo
key. There are no free x and y, no resize handles on text, no z-order, no rotation. The `html`
block shows a titanium hatch and its severity 2 lint.

## The window API

`window.turboslide.studio` is `glyphfield/src/lib/studioAutomation.ts` with the names changed,
attributed in `THIRD_PARTY_NOTICES.md` ("Glyphfield"). The package is framework free
(`packages/agent/src/window`, six modules, exported one line each from `@turboslide/agent`); the
React glue is the route's `useStudioOwner` over `createLiveAdapter`.

- The handle: `version` 1, `describe()`, `controls()`, `activate(label)`, `set(label, value)`,
  `readSource()`, `applySource(doc)`, `invoke(action, input)`, `download(artifact)`, `owner()`.
- `describe()` returns `{ version, global: 'window.turboslide.studio', event:
'turboslide:studio-api-ready', owner, actions, source: { read, apply }, state }`. The editor's
  `actions` is `windowActionIds()`, every action whose transports include `window`, and equals the
  generated list `/api/agent` serves; the viewer's is `viewerActionIds()` (`view.*`,
  `render.slide`, `render.sheet`); the presenter's is generated and unused until M6.
- Ownership (registry.ts): `registerStudioAutomation(adapter, owner)` records a registration
  bound to an owner element; the `studio` getter resolves the last registration whose owner is
  connected and not under `[inert]`, `[hidden]`, `[aria-hidden="true"]` or
  `[data-active="false"]`; a `MutationObserver` on those attributes dispatches the ready event with
  `describe()` as its detail only when the active adapter changes (`announceOwnership`). A handle
  stays bound to its owner and throws once that owner is disposed or inactive, so a delayed write
  never lands on another owner. On `/edit/:deckId` the editor and the viewer sit on two marker
  elements whose `data-active` follows the `Edit | View` Seg, so exactly one is active.
- Delegation: `studioAutomationForOwner(scope, { excludeOwner })` gives a delegating owner the
  handle of another owner in the same `data-automation-scope`; the source drawer registers while
  open, answers `source.read` and `source.apply` with the slide it shows (an invalid document or a
  slide with another id is refused by the validator and nothing is written), and forwards every
  other action to the editor.
- Controls (controls.ts): found by `data-control` id first, then by normalized accessible label
  from `aria-label`, `title`, `name`, `aria-labelledby` or the wrapping `<label>`; a Seg is a
  `role="group"` whose options carry `block.list.size.22` style ids, so `set` on it clicks the
  option; a missing label throws `RangeError` naming it; `set` writes through the prototype setter
  and dispatches `input` and `change`; `activate` on a group throws `TypeError` and asks for `set`.
  `inspectorControlId()` and `inspectorControlLabel()` build the ids and labels the inspector and
  the handles use.
- `invoke` (invoke.ts): the six standard actions (`source.read`, `source.apply`, `controls.list`,
  `control.activate`, `control.set`, `artifact.download`) are handled by the API itself; every
  other action goes to the adapter's `invoke`, which in the studio is the dispatcher over the same
  handlers a click uses (`@turboslide/chrome/dispatch`, SPEC 7.1). Malformed input is `TypeError`,
  an unknown action `RangeError`.
- Ready (ready.ts): `whenStudioReady(timeoutMs)` resolves at once when an owner is active and
  otherwise on the next event; `applySource` runs the owner's validator, commits, and waits two
  animation frames (`waitForCommit`).
- Undo (history.ts): `createEditHistory()` holds the undo and redo stacks and the step log; every
  entry carries the mutations and the reducer's inverse; `undo()` and `redo()` hand the caller
  what to commit forward, `undoTo(id)` the entries down to a row, `clear()` forgets everything
  after a conflict replaced the document.

## Evidence

`docs/m3-evidence/` holds eight JPEGs of `/edit/gt-brand` at 1440 by 900 on slide 53
(`content-rule`), light and dark, taken by the integrator at 21:40 on the integrated tree:
`edit-inspector-*` (Tab selected `paragraph · p1`; the ring, the chip, the Block section),
`edit-source-*` (Cmd /, the drawer over the stage column), `edit-palette-*` (Cmd K, 157 entries)
and `edit-twin-*` (Shift D). Read against the Prototemplate shell at `localhost:3005/deck` in both
themes (`.turboslide/m3/prototemplate-deck-*.jpg`, not committed): the same 52 px bar and its
groups, the same hairline seams (toolbar bottom, sidebar right edge, sheet ring), ink only on the
active mode and the pressed tools, Inter at 13 px, the one 6 px radius on the Search pill and the
Segs. The editor adds the status chip, the Search pill, the `EditTools` group and the 460 px
inspector column in the same grammar. The verifier did not retake them (one browser page at a
time on a loaded machine); the audit of the same four states passed on the final tree.

## Blockers

- `.github/workflows/check.yml` is written but not committed or pushed, as in M1 and M2: the `gh`
  token that git uses for github.com still lacks the `workflow` scope, and GitHub refuses a push
  that creates a workflow file without it. Kevin runs `gh auth refresh -h github.com -s workflow`
  once, then `git add .github && git commit` and `git push origin main`. Until then CI does not
  run on push.
- The M2 blockers stand unchanged: the native export gate (`avoid#p1` and `surfaces#rows` out of
  the 3 px width budget), the PowerPoint manual pass, the render worker client's coupling, Menlo
  in code panels. None of the M2 container lines were re-run for M3; they are not in the M3 list.
- Step 12 (`compare-to-shoot.mjs`) depends on the machine's load: the shoot script drives its own
  Chromium and lost the page in the integrator's run while other agents' browsers ran; it passed
  for the verifier with the M1 numbers. A retry of `node scripts/check.mjs --from 12` is the
  remedy; the runner does not retry on its own.
- The Asset section shows the twins, credit and license through `AssetCard`; the live two-tone
  preview from `dither.worker.ts` with its metrics and Recapture (SPEC 6.5) is not wired to it.
  The worker and its parity check exist; the control that drives it is M5 work with
  `asset.dither`.

## Open items

- The rendered lint layer reaches the inspector only through `lint.run` (the server function
  reads the worker's cache for the current revision); the panel's default findings are the static
  layer. The 52 new severity 2 findings of the baseline above (`contrast/both-themes` on 36
  records, `dia/label-clearance` on 16 raw diagrams) are deck work or a limits decision for Kevin
  (`RENDERED_LIMITS`); they do not block.
- Leases stay advisory (M4 enforces). A lease another author holds shows in the sidebar dot, the
  status chip and the inspector's lease line.
- Cmd D (duplicate slide) is in the sidebar row menu and the palette, not on the key; grid tiles
  do not drag (defaults, item 4).
- The inline text commit is one write per session, not `text.replace` coalesced at 400 ms
  (defaults, item 2); if Kevin wants the spec's letter the coalescing lives in `InlineText.tsx`.
- The thumbnails cache on disk is per revision under `.turboslide/thumbs/<deck>/<revision>/`; an
  editing session with many writes leaves one sparse directory per revision it warmed.
- The twin view paints each pane's own ground (decision 14); whether the plate should show around
  both sheets is Kevin's call.
- The M2 open items stand (the extractor's 1.5 px positioning disagreement, the calibration
  baseline table, the `GT Inter` family name, the four escape blocks, `docs/spec/` and the
  photographs in a public repository, the MIT license).
- Archive `.turboslide/m3-final/` and `.turboslide/m3/` from this accepted run when the milestone
  is signed off; they are regenerated by `pnpm check` plus the six lines above and are not
  committed.
