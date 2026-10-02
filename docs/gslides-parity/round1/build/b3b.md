# Lane B3b: the editor chrome (Round 1, NEXT.md 4.1.3 items 13 to 18, pushes 9 to 14)

Written by lane B3b in the worktree `/Users/kevinliu/repos/Turboslide-next` on `next/round1`. The specification is `docs/NEXT.md` 4.1.3 items 13 to 18, 4.1.5 (the rows) and 4.1.6 (the owned files), with the sheet (`round1/sheet.md`) and its judge (`round1/sheet-judge.md`). Lines below are this branch's at `0b6df8d4` unless a commit is named. The dev server is mine on 4506 (tmp store, memory channel, local open surface, the fake Google pair of `playwright.config.ts`), and 4516 is kept free.

## Round 1

Written first, on day 0 (2026-10-02 01:45 to 02:10 PDT), before any edit to a product file.

### Requests

1. To B1, the owner of `packages/theme/src/brand.ts` and `brand.test.ts` (question 3's default): `SELECTION_COLORS` (321 to 324) becomes `light: { select: '#2f5ce0', text: '#ffffff', guide: '#d6336c' }` and `dark: { select: '#2f5ce0', text: '#ffffff', guide: '#f0397a' }`. The block "the selection colour" of `brand.test.ts` (286 to 330) then reads, against `packages/chrome/src/tokens.css` and `Overlay.css` as push 10 writes them:
   - `--pt-select` is `SELECTION_COLORS[theme].select` and the new `--pt-select-text` is `SELECTION_COLORS[theme].text` in both appearances;
   - the chip's text is `contrastRatio(text, select) >= 4.5` (white on `#2f5ce0` is 5.63:1) where it read `--pt-paper` on the blue;
   - `.ts-select-chip`'s `color` is `var(--pt-select-text)` where it read `var(--pt-paper)`;
   - the stated numbers become `#2f5ce0` 5.63:1 on `#ffffff` and 3.58:1 on `#070707`, in place of the four `#1a73e8` and `#3d86f0` lines. `#2f5ce0` holds 3:1 against both the paper and the ink of each appearance (light ink `#070707` 3.58:1, dark ink `#f2f2f0` 5.0:1, both computed with `contrastRatio`), so the 3:1 loop holds unchanged.
   The test reads my two files, so the hunk and push 10's token change cannot pass apart: the test is red between the two commits whichever lands first. I ask that the two land adjacent, B1's commit first and push 10 right after it, and that the integrator folds them into one push in the ship order if the guard needs every push green. Until B1's hunk is on the branch, push 10 commits the corners, the scroll rule and the status hues, and the selection items wait with their row `chrome.selection.gt-blue`.
2. To B1, for its push pictures: push 12 draws `TurboslideMark` where `GtMark` stood on the `/deck` view's sidebar head (`Sidebar.tsx` 1038 and 1042), the viewer toolbar (`Toolbar.tsx` 530) and the filmstrip (`Filmstrip.tsx` 1105 and 1109). I pass the sizes 16 and 24 only, the two steps of the sheet judge's fix 2, so the snapped steps need no change at these sites. The row `chrome.mark.one-product-mark` compares the served `icon.svg`, the title row's home link and the `/decks` bar against one path set, so it reads B1's geometry once B1's mark push lands and today's geometry before it.
3. To B3a, the owner of `scripts/probes/core-walk/areas/chrome.mjs` (676 to 715, the step `chrome.cluster.gaps-heights`) and of the row's text in `core-matrix.json`: push 10 sets Share's corner to 0 (question 9's default; NEXT.md 4.1.3 item 14), so the step's `/^8px/.test(c.share.radius)` reads `0px` and the interaction's words "both with the 8 px corner" become "the split button with the 8 px corner and Share square". Push 9 draws Sign In as text after Share for an anonymous visitor on a deployment that offers a sign in method, so the step's inset reads from the last control's right edge (`title.signIn` when drawn, else Share). The row is broken today (`today: broken`), so neither change turns a green row red; I ask for it so the row can pass.
4. To the integrator, the files NEXT.md 4.1.6 gives no lane and that my pushes need. I edit them in my own pushes, as HB did with `export.$deckId.ts` and `identity.ts`, and name each in the push's paragraph below; the integrator may move any of them:
   - `packages/chrome/src/VersionsPanel.tsx` 85 and 93: `hour: 'numeric'` in place of `'2-digit'`, so a version reads "6:45 PM" (push 13, row `versions.panel.seam-and-time`).
   - `scripts/probes/core-walk/areas/arrange.mjs` 1350 to 1375, the steps `arrange.selection-colour.dark` and `.light`, and the two rows' interaction words: the ring and the chip read `rgb(47, 92, 224)` in both appearances (push 10, with request 1).
   - `packages/chrome/src/EditorShell.css` and `MenuBar.tsx` for the phone editor (push 14): the menu bar row's height under 720 px and the Menus key. If the integrator prefers, the phone rules live in a new stylesheet of my lane imported by `EditorShell.tsx`, which is what push 14 does unless told otherwise.
5. To B2, the owner of `/decks` (`decks.index.tsx`): the title row's Sign In reads "Sign In" in Title Case and opens the same dialog as the account menu's Sign in row (`title.account.signIn`, `dialog('Sign in')`), so the `/decks` bar's Sign In (B2b) and the editor's read the same.

6. To B1, the owner of `packages/theme/src/brand.test.ts` (added 02:35 PDT, after reading B1's working `brand.test.ts`, which takes request 1 as written; thank you): push 10 adds three status hue tokens to `tokens.css` in `:root` and in the dark block, `--pt-status-done`, `--pt-status-open` and `--pt-status-refused` (NEXT.md 4.1.3 item 14: "status icons in the shell's per theme hues"; light `#12a37a`, `#c47d00`, `#e5484d`, dark `#1fbf92`, `#f0a020`, `#e5484d`). The test "leaves every other --pt- token of tokens.css with its name and value" (466 to 480) lists the dark remap's names exactly, so it needs the three names after `pt-plate-on-ink-open`, in that order. `--pt-select-text` is declared in `:root` alone, which the test's `inDark` fallback reads, so the list needs no `pt-select-text`.

7. To B3a, the owner of `packages/chrome/src/menus/model.ts` (added 02:47 PDT): push 12 takes the sparkle out of the chrome's own sites (NEXT.md 4.1.3 item 16, `P:deck/slides/39-avoid.html` 12). Four model rows still name `icon: 'sparkles'`, and the tool finder (Search the menus) draws a row's model icon, so `chrome.ai.no-sparkle` reads a sparkle on any of them that the finder lists: `title.assist` (835: Assist reads as the word; the title row and the More key already draw no glyph for it), `tools.tailor` (2560), `insert.icon` (1639, parked) and the `tools.advanced.suggestionMarks` entry of the icon table (2921). The ask: no `icon` on `title.assist`, and a glyph that is not the sparkle on the other three (`chat` for Tailor for a customer is my suggestion; the Icon block's glyph in the inspector is now `squares-2x2`, `inspector/sections.ts`). Until it lands, the row's finder reading types a phrase that lists Assist and reads red on that row alone.

### Pictures before any change

Taken at 01:48 to 01:50 PDT at a load of 8.74 to 11.95 (`.turboslide/round1/b3b/shoot-before.jsonl`), with `build/b3b/shoot.mjs` on my server at `0b6df8d4`: `build/b3b/before-*.png`. They show what each push fixes:

- `before-titlerow-390-light.png`, `-dark.png`: the row is 491 px wide in 390 px (its `scrollWidth`), the deck name 18 px wide reading "U", Slideshow from x 381 and Share ending at x 479, out of the viewport.
- `before-editor-1440-dark.png`: in dark chrome the light deck's stage sits on a white workspace and the filmstrip draws the same slides black.
- `before-titlerow-1440-*.png`: "Last edit just now by Silicon 613" beside "All changes saved", two status phrases; the sparkle before Assist.
- `before-share-1440-light.png`: the owner row and More each framed as boxes; "General access" as a label above the field.
- `before-versions-1440-light.png`: the rule under "Only show named versions" stops at the button; the times read "01:49 AM".
- `before-present-390-light.png`: the presenter head's status sentence drawn over Pause and Reset.
- `before-view-1440-*.png`: the `/deck` view's sidebar head (the GT monogram).

### How the pushes are staged and read

- Every push is one commit of my files by an explicit path list under `.turboslide/git.lock`, through `.turboslide/round1/b3b/stage.mjs` (untracked). A file several lanes share (`core-matrix.json`, `core-matrix.test.mjs`, `README.md`, the core specs, `arrange.mjs`, the files no lane owns) is staged as `HEAD`'s text with the push's hunk applied, never the working file, so other lanes' uncommitted hunks stay out; the README's generated section is rendered from the staged matrix in a copied tree, where `core-matrix.test.mjs` and `what-works.test.mjs` run before the commit. A file of mine that two of my pushes change is staged from a snapshot taken when its push's hunks were done.
- The rows of each push live in one lane module per spec: `apps/studio/e2e/core/chrome-round1.ts` (core/chrome.spec.ts) and `b3b-dialogs.ts` (core/share.spec.ts and core/present.spec.ts). The spec carries three lines: the import, the call and the ids spread into its coverage list. A test is declared only once its row is in the matrix, so the module serves every push and a later push's test stays inert until its own push enters its row. Pushes 10 to 14 add tests to that module.
- The readings of push 9 were taken on my server started before any later push's edit (02:18 PDT, the config without the watcher, so no later edit reached it). The rows of pushes 10 to 14 were written while the load stayed over 24 for most of an hour, and they are read on one restarted server holding all five pushes together; each push's paragraph says so.

## Push 9: B3b#9, the title row (item 13)

Files: `packages/chrome/src/TitleRow.tsx`, `TitleRow.css`; tests `packages/chrome/src/__tests__/title-row-round1.test.tsx` (new, 6 tests) and `presence-slot.test.tsx` (the slot order gains `title.more`); `apps/studio/e2e/core/chrome-round1.ts` (new) with its hook in `core/chrome.spec.ts`.

What changed:

- One status phrase. A draft reads no Last edit words: the route passes the draft's `updatedAt` (the time `/new` built it) as `lastEditAt`, so a draft now reads `ago = null`. After a write the words read "Last edit just now"; the author is in their tooltip and in the clock's accessible name ("Last edit just now by Gesso 759"). From 1280 px up, while the save cell reads All changes saved and the Last edit words show, the save words are clipped to 1 px (they stay in the live region and in `textContent`, which the walk's `saveWords()` and the specs' `settled()` read); Saving, the retry word, Offline and Reconnecting show as before. Under 1280 px the Last edit words are hidden, as before, and the save words are the one phrase.
- The name plate floats under the row's right end in the menu bar's 28 px band (`position: fixed`), so the deck name keeps its width while it shows.
- The deck name keeps `min-width: 96px` at every width.
- Sign In is a text button after Share where the account menu's Sign in row is present (`canSignIn`: an anonymous visitor on a deployment with a method). It reads B3a's `title.signIn` once B3a#8 lands it (b3a.md request 5), else `title.account.signIn`; both open the Sign in dialog.
- Under 480 px the presence slot, Assist, the comments and side panel glyphs, the inbox, Sign In and the Slideshow arrow fold into one More key (`title.more`, `titleMoreItems`). Its rows are the model's own items: Assist, Show all comments, Show or Hide side panel, Collaborators, Notifications (parked, so absent), Presenter view, Start from beginning, Sign in. Collaborators opens the roster plate at the key, and the roster's own row opens the account menu there. Slideshow is a 32 px key.

Why Sign In moves into More at 390 px (the sheet judge's note): at 390 the row holds the mark (32), the name (96 at least), the clock (32) and the save glyph (34) on the left and Slideshow, Share and More (32 each) on the right, 22 px of padding and seven 8 px gaps: 360 px with the name at 96. Sign In needs about 60 px, which leaves the name 126 px without it and under 96 with it. The save glyph and the clock stay because they say whether the work is saved.

Deviations:

- NEXT.md 4.1.5 names `probe --core` as `chrome.title-row.one-status`'s driver. The walk area `chrome.mjs` is B3a's file, so the row is driven in `core/chrome.spec.ts`.
- B's graft puts Sign In "in place of the generated pixel chip". The own chip stays beside Sign In: it opens the account menu (Change name, Change avatar, Forget this browser), and the people round's rows (`people.own-chip-follows-name` and the presence slot tests) read it.
- The words "Sign In", "More" and the More key's tooltip are literals in `TitleRow.tsx`, as the row's other control words are ("Show side panel", "Presentation options"), so the push waits on no `strings.ts` change.

Rows (entered in this push): `chrome.title-row.phone` (broken, 3), `chrome.title-row.name-after-first-write` (flaky, 2), `chrome.title-row.one-status` (broken, 2), driver `core/chrome.spec.ts`; the matrix total gains 3.

Readings on 4506 (`.turboslide/round1/b3b/runs/`, the ledger in `ledger.txt`):

| Run | UTC and load | Rows | Result |
| --- | --- | --- | --- |
| b3b9-run1 | 09:12:16Z to 09:16:14Z, load 20.56 to 32.95 | the three rows | 1 passed, 2 failed: `one-status` read two phrases because the clip sat on the cell's wrapper while the reader measures the live span (the picture showed one phrase); `name-after-first-write` timed out on a click at the stage's corner. The clip moved to the live span and the driver presses Escape |
| b3b9-run2 | 09:18:41Z to 09:19:27Z, load 18.09 to 20.38 | the three rows | 3 passed |
| b3b9-neighbours | 09:20:38Z to 09:21:19Z, load 27.10 to 30.84 (the load rose between the check and the start) | `slides.layout.plate-four-columns`, `share.dialog.more-row`, `chrome.toolbar.fold-any-width` | 3 passed |

The readings of b3b9-run2: at 390 the row is 390 of 390 px (`scrollWidth` 390, it was 491), the name 121.8 px reading "Title row at 390" (it read "U" at 18 px), Slideshow 270 to 302, Share 310 to 342, More 350 to 382, and More lists `title.assist`, `title.comments`, `title.sidePanel`, `title.presence`, the two Slideshow rows and `title.account.signIn`. At 1440 the plate showed 2,096 ms after the write at x 1033 to 1428, y 44 to 72, and the name was 130.8 px and not truncated. The fresh draft drew no phrase and the clock's name read "Last edit"; after the write the row drew "Last edit just now" alone.

Unit tests: `title-row-round1.test.tsx` 6 passed, `presence-slot.test.tsx` 11 passed, the chrome suite 912 passed at 02:45 PDT (97 files).

Pictures (`build/b3b/`, looked at; taken at 02:53 to 02:54 PDT at a load of 21.41 to 23.92 on the same push 9 server, `.turboslide/round1/b3b/shoot-after9.jsonl`):

- `after9-titlerow-390-light.png`, `-dark.png` against `before-titlerow-390-*.png`: the row fits 390 px; the name reads "Untitled present..." at 138 px; Slideshow, Share and More are 32 px keys inside the row.
- `after9-more-390-light.png`, `-dark.png`: the More menu's rows, Assist to Sign in.
- `after9-titlerow-1440-light.png`, `-dark.png` against `before-titlerow-1440-*.png`: "Last edit just now" alone with the cloud glyph, where "Last edit just now by Silicon 613" stood beside "All changes saved"; Sign In as text after Share.
- `after9-draft-1440-light.png` against `before-draft-1440-light.png`: the fresh draft shows the clock glyph and no words.
- `after9-firstwrite-1440-light.png`: the name plate under the row's right end in the menu bar band, the name beside it whole. `before-firstwrite-1440-light.png` caught no plate (the before shot wrote once, on `/new`).
- The Assist sparkle, Share's 8 px corner and the glyph first Slideshow are pushes 10 and 12, so they still show here. The title row's mark is B1's working geometry, which my server read from the shared tree.

## Push 10: B3b#10, the chrome's values (item 14)

Files: `packages/chrome/src/TitleRow.css`, `ToolButton.css`, `Palette.css`, `DiagramPanel.css`, `inspector/table.css`, `inspector/chart.css`, `inspector/text.css`, `inspector/lint-mark.css`, `pickers/DiagramPicker.css`, `tokens.css`, `Overlay.css`, `Filmstrip.tsx` (one hunk), `packages/viewer/src/BookView.css`; with consent, B1's `packages/theme/src/brand.test.ts` (the dark remap's names, b1.md request 6) and B3a's hunk of `scripts/probes/core-walk/areas/chrome.mjs` with the words of `chrome.cluster.gaps-heights` (b3a.md 12); and `scripts/probes/core-walk/areas/arrange.mjs` (no lane's file).

What changed:

- Corners. Share, the solid button, the name plate, its Continue and its error plate are square. Slideshow keeps 8 px on `.ts-title-slideshow` (the one exception B5's lint holds) and draws its word before the play glyph. The off token radii of `Palette.css` (the key chip), `DiagramPanel.css`, `inspector/table.css` (the height field and the swatch), `pickers/DiagramPicker.css` and `inspector/chart.css` (the text field, the swatch, the remove key) are 0. Sign In lost its negative margin, so its box keeps the row's 12 px inset (b3a.md 12 read it 4 px).
- Selection. `--pt-select` is `#2f5ce0` in both appearances and `--pt-select-text` `#ffffff` (declared in `:root`, read in both), and the chip's text reads it (`Overlay.css`). B1's `SELECTION_COLORS` landed in B1#2. The walk's two selection steps and their rows read `rgb(47, 92, 224)`.
- No smooth scroll. `BookView.css` 16 and its reduced motion override left. The filmstrip's follow jumps (`scrollBehavior()` answers `auto`), since a smooth scroll in script is the same motion the deck refuses.
- Status hues. `--pt-status-done`, `--pt-status-open` and `--pt-status-refused` per theme (light `#12a37a` 3.21:1, `#c47d00` 3.34:1, `#e5484d` 3.91:1 on `#ffffff`; dark `#1fbf92` 8.56:1, `#f0a020` 9.36:1, `#e5484d` 5.15:1 on `#070707`). The chrome's one status glyph today is the inspector's lint mark: the open hue at severity 1 and 2 and the refused hue at 3, where it read titanium and ink.
- B5's report findings in my files that no item named (b5.md 120 and 121): the table section's heading leaves its tracked capitals, and the multiline text field sets slide text in Inter, not monospace.

Not done: B5's `gt-ui/cta-title-case` findings in my files (b5.md 122: `Toolbar.tsx` "Exit fullscreen" and "Copy link", `inspector/table.tsx` four labels, `inspector/asset.tsx` "Add asset") change words that tests and the agent's generated docs pin (`describe.json`, `materials-sections.test.tsx`, `tooltip.test.tsx`); no item of mine names them, so they wait for B5b's enforce push or the integrator.

Rows (entered in this push): `chrome.selection.gt-blue` (broken, 1) and `chrome.scroll.no-smooth` (broken, 1), driver `core/chrome.spec.ts`; the words of `arrange.selection-colour.light` and `.dark` and of `chrome.cluster.gaps-heights` (B3a's hunk) changed with their drivers; the matrix total gains 2.

Readings. The rows of pushes 10 to 14 were read on one server holding all five pushes (restarted at 10:43 PDT on the config without the watcher), because the load stayed over 24 for most of the hours they were written in:

| Run | UTC and load | Rows | Result |
| --- | --- | --- | --- |
| b3b-all-chrome | 17:22:03Z to 17:38:38Z, load 21.76 to 26.00 | the ten rows of `chrome-round1.ts` | 5 passed (the three title row rows, `chrome.scroll.no-smooth`, `chrome.selection.gt-blue`); 5 failed, read below under their pushes |
| b3b-all-chrome2 | 18:43:07Z to 18:49:51Z, load 16.68 to 54.98 | the five that failed | 3 passed; 2 failed, read below |
| b3b-chrome3 | 20:06:27Z to 20:07:09Z, load 10.80 to 17.87 | `chrome.mark.one-product-mark`, `chrome.phone.menus-key` | 2 passed |
| b3b-share | 20:07:09Z to 20:09:23Z, load 17.87 to 31.93 | `share.dialog.ruled-rows`, `share.name-prompt.empty-field`, `share.dialog.one-link`, `share.dialog.open` | 4 passed |
| b3b-present | 20:34:23Z to 20:34:59Z, load 12.65 to 16.50 | `present.presenter.phone-head`, `present.presenter.sentence-case`, `present.presenter-view.arrow` | 3 passed |
| b3b-chrome-neighbours | 20:35:00Z to 20:35:33Z, load 16.50 to 17.23 | `share.dialog.more-row`, `chrome.toolbar.fold-any-width`, `slides.layout.plate-four-columns` | 3 passed |
| walk chrome, arrange | 20:35:33Z to 20:50:41Z, load 17.23 to 43.35 | the walk's `chrome` and `arrange` areas (`editor-walk-probe.mjs --core --only chrome,arrange`) | 122 passed, 9 failed, 1 not driven; read below |

This push's readings: `chrome.selection.gt-blue` read the ring, the chip and the chip's text `rgb(47, 92, 224)`, `rgb(47, 92, 224)` and `rgb(255, 255, 255)` on a light deck and on a dark deck (the overlay's `data-theme` light, then dark; the overlay takes the deck's appearance, so these are the two appearances the ring is drawn in). The chrome read light both times: the test's stored `ts-chrome-appearance` did not turn it, and the dark chrome's token is the same `#2f5ce0` (`tokens.css`), which `chrome.stage.deck-appearance` reads in dark chrome. `chrome.scroll.no-smooth` read 581 elements on the editor, 468 on the book view (`/deck/<id>?mode=book`), 279 on `/home` and 232 on `/decks`, none computing `smooth`. In the walk, `arrange.selection-colour.light` and `.dark` passed on the one blue, and `chrome.cluster.gaps-heights` passed for the first time ("gaps 8, 8, 8, 8, 8, 8; inset 12 from Sign In; corners share 0px, split 8px"), with every other `chrome.*` row the walk reads passing.

Unit tests: the chrome suite 921 passed (98 files), the viewer suite 515, the studio's components and editor 234; `brand.test.ts` 36 of 37, the one red being "counts the check steps" (b1.md request 8, red at HEAD since B5a#19).


## Push 11: B3b#11, the stage's appearance (item 15)

The trace. Four causes, one per surface:

1. The editor's workspace. `tokens.css` gave `.ts-stagewrap[data-theme]` the sheet's token block, and `packages/render/src/block-css.ts` 19 paints every `.ts-sheet` root with the deck's `--paper`. The stage root is `.ts-stagewrap.ts-sheet`, so a light deck's workspace drew white in dark chrome.
2. The filmstrip. `Filmstrip.tsx` drew its cards in `useTheme()`, the chrome's theme, so the same light slide drew black.
3. The presenter view. `PresenterPage.tsx` rendered the console's slides in `useTheme()`.
4. The `/deck` view. `DeckViewer.tsx` drew the stage, the show, the grid and the book in `useTheme(serverTheme)`, and the sidebar's cards read the chrome's theme too.

The changes: `.ts-stagewrap` left the sheet appearance selectors of `tokens.css` (the overlay keeps them, so the ring, the seams and the guides keep the sheet's contrast); `packages/viewer/src/Stage.css` gives `.ts-stagewrap.ts-sheet` no ground of its own, so the chrome's `--pt-plate` of `.pt-stagewrap` shows; the filmstrip and the tree sidebar draw the edited deck's appearance; the presenter page draws `deckAppearance`; the `/deck` view draws the payload's appearance (the route's `?theme=`, else the deck's own, `server/decks.ts` `loadShaped`) and passes it to its sidebar through `ViewerShell`'s new `appearance` prop. The stage band's logo twin and the thumbnail warm up follow the slide's appearance (`EditorRoot.tsx`, `shell-bridge.tsx`). The `/deck` view's Theme button now turns the chrome alone.

Files no lane owns, edited here: `apps/studio/src/components/DeckViewer.tsx`, `PresenterPage.tsx`, `apps/studio/src/editor/EditorRoot.tsx` (two lines), `shell-bridge.tsx`, `packages/chrome/src/ViewerShell.tsx`, `packages/viewer/src/Stage.css`.

Row (entered in this push): `chrome.stage.deck-appearance` (broken, 3), driver `core/chrome.spec.ts`; the matrix total gains 1.

Readings: in b3b-all-chrome (17:22Z, load 21.76 to 26.00) the row read the stage, the filmstrip, the presenter and the `/deck` view light in dark chrome and failed on the workspace, which still painted `rgb(255, 255, 255)`: the probe that followed found the paper on the stage root from `block-css.ts`, which is the fourth cause above, and `Stage.css` took the rule. In b3b-all-chrome2 (18:43:07Z to 18:49:51Z, load 16.68 to 54.98) it passed: the chrome dark, the stage `light`, the slide's paint `rgb(255, 255, 255)`, the workspace's paint `rgba(242, 242, 240, 0.08)` equal to the chrome's `--pt-plate`, the filmstrip's cards `light` and painting white; the presenter's frames `light` under dark chrome; the `/deck` view's stage and its sidebar's cards `light` under dark chrome.

Unit tests: the viewer suite 515 passed, the studio's components and editor 234, the chrome suite 921.

