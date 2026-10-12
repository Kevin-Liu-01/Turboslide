# HR-DD, wave 3b: the dropdown round's open findings, build notes

Lane DD builds the follow-ups of the custom dropdown round Kevin asked for on 2026-10-08 ("use custom dropdowns!!!", shipped 2026-10-10 as `7c352dde`). The findings are the last verifier passes of that round, read in full: `verify-final-3-a11y.md` (keyboard and assistive technology, F1 to F4) and `verify-final-3-visual.md` (look, stacking and fit, F1 to F8 and the link popover at phone width in its section 8), saved under `~/.config/turboslide/resume/dropdown-verify-notes/`. The worktree is `/Users/kevinliu/repos/Turboslide-harden4` on `harden/wave3b`, made from `origin/main` `f7e97039`. Nothing was pushed or deployed, production was not read, no Vercel, Cloudflare, GitHub or Google setting changed, and no token, cookie or secret was printed.

## The findings and where each went

| Finding | Severity | Reading on `origin/main` `f7e97039` | Push |
| --- | --- | --- | --- |
| a11y F1: a Share control that disables itself sends the focus to Done | 2 | Already fixed on main by DD-fix#9 (`5142310c`, `FocusHold.tsx`, `Dialog.tsx`, before the round shipped). Read: a Permissions box toggled with Space keeps the focus on the box for 1.8 s (the focus sampled every 25 ms), and a second Space toggles it back with the dialog open, both boxes | none |
| a11y F2: the typography Align and Columns fields are named with the block's id | 1 | `combobox "vv-text: Align"`, `combobox "vv-text: Columns"` | HR-DD#7 |
| a11y F3: Cmd+Z on a Format options dropdown right after a choice undoes nothing | 1 | Border weight 1 px to None by the keyboard, revision 31 to 32; Cmd+Z on the field: None, revision 32 | HR-DD#8 |
| a11y F4: the cell border fields take the disabled attribute under the press after a click into a cell | 1 | After a click into cell 1,1 Border weight is enabled; a click on it leaves it `disabled`, not open, "Click a table cell first", the focus on the body | HR-DD#9 |
| visual F1: the trigger's width follows the chosen label | 1 | /decks sort 156.8, 66.5 and 123 px; the view toggle at x 997, 1087 and 1031 | HR-DD#4 |
| visual F2: a list stays open after its trigger is scrolled out of view | 1 | 1440 by 600: Line type open, the panel scrolled 666 px: trigger at 1027, list open at 470 to 592. 390 with touch: a 700 px touch scroll from the trigger: trigger at 999, list at 714 to 836 | HR-DD#2 |
| visual F3: Format options' dropdown borders are darker than the text fields beside them | 1 | Legend and Number format 0.44, the Title field 0.18 | HR-DD#5 |
| visual F4: the asset picker's role filter squeezes the segmented control | 1 | Head 277 px: filter 91, Seg 58 with All, Openers and Moods drawn over each other, dropdown 96 | HR-DD#3 |
| visual F5: a generated field with a "none" value reads "None" and "none" | 1 | The chart's Legend: None, none, right, bottom, top, left | HR-DD#6 |
| visual F6: the link popover's slide field has a corner unlike its row | 1 | Address 4 px, slide 6 px, Apply 4 px, Remove 4 px | HR-DD#10 |
| visual F7: the link popover runs past the window's right edge | 1 | At 1440, the popover 900 to 1481, Remove 1396 to 1472 | HR-DD#10 |
| visual F8: a list of exactly ten rows scrolls by 2 px and draws the scrollbar | 1 | Line end: 288 px tall, client 286, scroll 288, gutter 8 | HR-DD#1 |
| The link popover at 390, older than the round | 2 | 581 px wide in a 390 px window (12 to 593), the slide field, Apply and Remove outside it; no tap applies a slide link | HR-DD#10 |

## The pushes

Each push is one commit on `harden/wave3b`, in this order, each made by explicit path under the git lock. None needs Kevin, a migration or a setting; none adds a dependency. Every one rolls back alone.

| Push | Commit | Closes | Files |
| --- | --- | --- | --- |
| HR-DD#1 | `2ed9a4cc` | visual F8 | `Select.tsx` (`SELECT_MAX_HEIGHT` 290: ten rows, 8 px of padding, 2 px of border), `Select.css` (`max-height: 290px`), `select.test.tsx`, `apps/studio/e2e/core/dropdowns.ts` (`chrome.select.placement` checks at most 290.5 px), `docs/DROPDOWNS.md` 3.6 |
| HR-DD#2 | `0e8d6fe6` | visual F2 | `Select.tsx` (`clippedWhole`: a scroll that leaves nothing of the trigger in the window or in a clipping ancestor's box closes the list; a touch press on the open trigger counts as the person's scroll), `select.test.tsx`, `docs/DROPDOWNS.md` 3.6 |
| HR-DD#3 | `a65eb0dc` | visual F4 | `AssetPicker.css` (the head wraps, the filter on its own line, the role Seg's buttons sized to their words) |
| HR-DD#4 | `c616d3f3` | visual F1 | `Select.tsx` (a hidden sizer per label in the trigger's one grid cell, words as generated content, `aria-hidden`), `Select.css`, `select.test.tsx`, `docs/DROPDOWNS.md` 3.7 |
| HR-DD#5 | `7b1d885b` | visual F3 | the resting border of the inspector's and Format options' text fields to `--pt-field`: `inspector/{chart,stepper,text,json,fields,table,asset,shader,palette}.css`, `FormatOptions.css`, `Inspector.css`, `AssetPicker.css` (the filter) |
| HR-DD#6 | `4959926f` | visual F5 | `inspector/select.tsx` (the removing row reads "Default" where a tag reads "none"), `inspector-fields.test.tsx` |
| HR-DD#7 | `f6d4ee21` | a11y F2 | `Select.tsx` (`labelledBy`), `inspector/props.ts`, `inspector/select.tsx`, `inspector/typography.tsx`, `inspector-sections.test.tsx` |
| HR-DD#8 | `5dfeea32` | a11y F3 | `useEditorKeys.ts` (`isHistoryOnDropdown`: Undo and Redo reach the key table from a closed trigger), `use-editor-keys.test.tsx` |
| HR-DD#9 | `2b0f6196` | a11y F4 | `inspector/table.tsx` (the Cell group carries `SESSION_PARK_ATTRIBUTE`), `table-section.test.tsx` |
| HR-DD#10 | `39dfc356` | the phone popover (severity 2), visual F7 and F6 | `packages/viewer/src/InlineText.tsx` (`popoverPlace`, measured from the offset parent with the drawn size), `InlineText.css` (the phone layout under 600 px, the control corner on the popover's field and buttons), `link-popover.test.ts` |
| notes | this commit | | this file and the pictures under `docs/hardening/DD/` |

Choices worth naming:

- F1 sizes the trigger to its widest option, as the native select did, rather than giving each site a width: one rule in the shared component reaches every site, and a site's own width or the compact 96 to 220 px bounds still win. The sizers draw their words with `::before { content: attr(data-label) }`, so no reader of the trigger's text, no `getByText` and no screen reader meets them.
- F2 closes the list when nothing of the trigger shows, and keeps it on a trigger a scroll leaves partly in view (the verifier's 888 to 918 case against a 900 px panel edge). The check reads `overflow` and its two longhands, since jsdom computes `overflow-x` as `visible` for `overflow: auto`.
- F3 moves the text fields to the token the dropdowns and every dialog field already draw (`tokens.css`: "the boundary of every input, select and textarea"), not the dropdowns back to `--pt-hair`, which is under 3:1.
- F4 keeps both role controls (the Seg for All and the first three roles, the dropdown for every role when there are more than four); it only stops them crushing each other. The Seg's words stay as written ("openers", lower case), older than the round.
- F5 changes the words of one row only where the tags collide; every other optional field still reads "None", so the window API's `set(label, '')` and the existing tests are unchanged.
- a11y F2 keeps `aria-label` ("t: Align") because the window API's `set()` reads it first; `aria-labelledby` wins in the accessible name, so a person hears "Align".
- a11y F3 gives a closed dropdown the deck's Undo and Redo only. Every other chord stays the field's, as DROPDOWNS.md C10 decided, and an open list keeps every key.
- a11y F4 uses the existing parking rule of the toolbar's size field rather than a new cell selection model: the cell's text session parks while a Cell control holds the focus, so the cell stays chosen and the field writes on it.
- HR-DD#10 measures the popover from its offset parent (the overlay over the sheet) with its drawn size, in a layout effect before paint, and wraps it under a 600 px window. The link chip uses the same placement.

## Settings of every local reading

- Dev server: `vite dev --port 4867 --strictPort -c vite.no-watch.config.ts` from `apps/studio`, with `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/dd3b-overlay`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-dd3b.sqlite`, `TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`, the fake Google pair and session and download secrets of 48 characters from a mode 600 file. The no-watch config was needed: another lane's save reloaded the page in the middle of the first deck setup. The server was restarted to read each edit, and stopped at the end.
- The before readings ran on the unchanged tree (`origin/main` `f7e97039` for every file this lane changes; other lanes' uncommitted edits were in the worktree), the after readings on the lane's final tree, and the write readings on a scratch worktree (below).
- A scratch deck on the tmp store: a line, a table, a chart, a text box near the slide's right edge, an icon, a list, a picture, a dithered picture, two shaders, a comment thread, twelve slides, and on slide two a pair with five assets of five roles. The harness is `scratchpad/dd3b/h/` (`probe.mjs`, `lib.mjs` from the dropdown verifier's `vf3`), not in the tree.
- Playwright's Chromium from the worktree's `playwright-core`; 1440 by 900 (by 600 for the panel scroll), 390 by 844 with touch and a device scale of 2.
- Load: the one minute load read 300 to 570 through every reading, from other sessions' jobs (never stopped). No reading below is a timing verdict; boxes, attributes, revisions and counts do not move with load.

## Readings after

Loads 300 to 570 throughout; none of these is a timing.

On the shared worktree's server (layout and attribute readings; that server also held other lanes' uncommitted edits to the write path, under which no write reached the revision, so no write reading is taken from it):

- F1: /decks sort 156.8 px with Last opened by me, Title and Last modified, the view toggle at 997 each time (before 156.8, 66.5, 123 and 997, 1087, 1031). Border dash 114.9 px (production 115), /print's layout 212 px (production 212). Share at 1440: General access fills its row (446 px), the invite role 120 px; at 390: 284 and 120 px, no sideways scroll. Format options of a line and a table at 1440 and 390: no sideways scroll.
- F2: at 1440 by 600 the same 666 px panel scroll closes the list (before: open at 470 to 592 with the trigger at 1027); at 390 with touch the same 700 px touch scroll from the trigger closes it (before: open at 714 to 836, trigger at 999); the value stays Line in both.
- F3: the chart's Title field and the generated chart fields 1px rgba(7, 7, 7, 0.44), as the Legend and Number format triggers.
- F5: the Legend's rows "Default, none, right, bottom, top, left".
- F8: Line end at 1440 and 390: 290 px tall, client 288, scroll 288, no overflow, no gutter.
- a11y F2: `combobox "Align"`, `combobox "Columns"`, their lists named the same, `aria-label` still "vv-text: Align".
- a11y F1 (unchanged, on main already): the two Permissions boxes keep the focus through Space and toggle back on the second Space with the dialog open.

On a scratch worktree of `harden/wave3b` at HR-DD#7 (`f6d4ee21`) with this lane's last three pushes, which is the tree of HR-DD#10 without the other lanes' uncommitted edits (a fresh install, the same settings on 4867, a fresh scratch deck with a table, a text box, a line, a chart and a pair with five assets), removed afterwards:

- a11y F3: Border weight 1 px to None by the keyboard (revision 12 to 13), Cmd+Z on the field: 1 px (revision 14), the focus still on the field; with the list open, Cmd+Z changes nothing (revision 14).
- a11y F4: after a click into cell 2,2 the Cell Border weight opens on a click (enabled, focused, its list at 723 to 873) and 2 px writes once, at 1440 light and dark; the section heads "Cell 2,2".
- F7 and the phone popover: at 1440 light and dark the popover spans 851 to 1432 (8 px inside), its four controls at 6 px corners; Previous slide and Apply write once (revision 15 to 16, 17 to 18) and close it. At 390 light and dark with touch it spans 8 to 382 (374 px): the address field 17 to 373, the slide field 17 to 224, Apply 230 to 292, Remove 298 to 373, all inside; a tap on Previous slide and a tap on Apply write once (revision 16 to 17, 19 to 20) and close it.
- F4: the asset picker's head at 1440 (277 px) and 390 (285 px), light and dark: the filter alone on the first line (261 and 269 px), the Seg 230 px with All, openers, moods and captures each whole, Every role on the third line.
- F1, F3, F8 and the names again in both appearances: the same readings as above (dark borders rgba(242, 242, 240, 0.44)).

## Tests and checks

- Every new test was run on the unchanged source first and failed for the finding: `select.test.tsx` (the cap "expected 288 to be 290"; the scroll and touch cases "expected true to be false"; the sizers missing), `use-editor-keys.test.tsx` ("expected [] to deeply equal [edit.undo, edit.redo]"), `inspector-fields.test.tsx` ("None, none, right, bottom"), `inspector-sections.test.tsx` ("Unable to find ... combobox and name Align"), `table-section.test.tsx` ("expected false to be true" on the Border weight), `link-popover.test.ts` ("popoverPlace is not a function").
- On the lane's final tree: `select.test.tsx`, `use-editor-keys.test.tsx`, `inspector-sections.test.tsx` 70 passed; `inspector-fields.test.tsx` and `table-section.test.tsx` passed; the whole `packages/chrome` suite 1,105 passed and 4 failed in `editor-shell-render.test.tsx` under the suite's parallel load, which pass alone (21 of 21); the whole `packages/viewer` suite 561 passed (58 files). Load 300 to 470.
- `tsc -b packages/viewer packages/chrome`: no error in this lane's files; the only errors were TS6307 on `dither-factory.ts` and `menus/chords.ts`, new files of another lane (PC) that were not yet in the build info at the time (both are committed in HR-PC#2 since).
- `prettier --check` on every file the lane changed: clean.
- Not run by this lane: the node-server or Vercel build, `check-client-bundle.mjs` and the core matrix rows. HR-DD#4 adds a few hundred bytes to every page that draws a dropdown (/decks, /print, the access page and the editor); the PC lane reads the bundle budgets on the branch, which holds this push. `chrome.select.placement` (`apps/studio/e2e/core/dropdowns.ts`) was changed to the new cap and not run here.

## Pictures

Under `docs/hardening/DD/`, JPEG, each under 200,000 B (the largest 88,318 B); every one was opened and looked at.

- F1: `F1-before-sort-title-light-1440.jpg` (Title shrinks the field), `F1-after-sort-title-light-1440.jpg`, `F1-after-sort-title-dark-1440.jpg`, `F1-after-share-light-1440.jpg`, `F1-after-table-panel-light-1440.jpg` (Weight 96 px, Dash 115 px), `F1-after-print-light-1440.jpg`.
- F2: `F2-before-panel-scroll-light-1440x600.jpg` (the list over Position with its trigger scrolled away), `F2-after-panel-scroll-light-1440x600.jpg`, `F2-before-touch-drag-light-390.jpg` (the list over Transparency), `F2-after-touch-drag-light-390.jpg`.
- F3: `F3-before-chart-fields-light-1440.jpg`, `F3-after-chart-fields-light-1440.jpg`, `F3-after-chart-fields-dark-1440.jpg`.
- F4: `F4-before-asset-head-light-390.jpg` (All, Openers and Moods over each other), `F4-after-asset-head-{light,dark}-{1440,390}.jpg`.
- F5: `F5-before-legend-light-1440.jpg`, `F5-after-legend-light-1440.jpg`.
- F6, F7 and the phone: `F7-before-popover-light-1440.jpg` ("Remo" cut at the edge), `F7-after-popover-{light,dark}-1440.jpg`, `phone-before-popover-light-390.jpg` (Apply and Remove past the edge), `phone-after-popover-{light,dark}-390.jpg`.
- F8: `F8-before-line-end-light-1440.jpg` (the bar), `F8-after-line-end-{light,dark}-{1440,390}.jpg`.
- a11y F4: `A4-before-cell-field-light-1440.jpg` ("Click a table cell first" after the press), `A4-after-cell-field-{light,dark}-1440.jpg` ("Cell 2,2", the choice written).

## Not done and requests

- Not built: HR-C#1 (question 9 unanswered), no Rust step. Nothing of this lane needs Kevin.
- Not reproduced here: the Share card case of visual F2 at 390 by 560 (the card of this deck scrolls 202 px, which leaves the invite role trigger inside it); the same rule closes it once the trigger leaves the card's box or the window.
- Not read: the asset picker's after reading was taken with advanced tools on (the pair's asset fields show there); Firefox and WebKit were not driven; the Comments filter and the Download dialog's fields after HR-DD#4 were not read (the shared rule is the same; the select before the round was as wide as its widest option there too).
- To the orchestrator: `harden/wave3b` holds the lane's ten pushes and this notes commit in order, interleaved with other lanes' commits; HR-PC#2 (`9acaa348`) sits on top of HR-DD#10 and edits `Select.tsx` (its icon import), so the ship order on the branch is the order to keep.
- To the orchestrator, against wave 2 (`harden/wave2-ship`): HR-RC#3 edits `packages/viewer/src/InlineText.tsx` at `absorbedText` (about line 978) and HR-DD#10 edits its link popover (about 1695 and 2840 to 2970); the hunks are far apart and apply in either order. Wave 2 changes no other file of this lane.
- To HR-0's owner: the row text of `chrome.select.placement` in `docs/gslides-parity/focus/core-matrix.json` says "at most 288 px tall"; with HR-DD#1 the cap is 290 px and the row's check reads 290.5. The words belong to the matrix file, which this lane does not edit.
- To the PC lane: read the /decks, /print and editor budgets on a tree with HR-DD#4 (the sizers add a span per option in each trigger and about 40 lines of CSS).
- Seen outside the findings: the asset picker's Seg reads its roles in lower case ("openers", "moods") beside "All" and the dropdown's sentence case ("Openers"); older than the round. On the shared worktree's dev server, writes did not reach the revision while other lanes' edits to `room.ts`, `actions.ts` and the file store were uncommitted; nothing of this lane is involved, and the scratch worktree of the committed branch writes normally.
