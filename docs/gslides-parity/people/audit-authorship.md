# Audit: authorship

Area: how an author is named and drawn across the Version history panel, the comments UI, the deck cards, the Share dialog and the trash page. Read on the worktree at `origin/main` (8ceb6294) on 2026-09-29. The Version history numbers below were measured in a headless Chromium at 1440 by 900 in dark mode against a dev server of this worktree on port 4398, on `decks/gt-brand` (seven local records, all by the unresolved author `kevinliu`, two 15 minute windows). Every x below is relative to the panel's outer left edge; the panel is 320 px wide and draws its own 1 px `--pt-hair` border at x 0, so the body starts at x 1.

## What exists

### The identity chain every surface shares

- `packages/chrome/src/editor-shell.ts:246-260` `IdentityView`: `principalId`, `label` (the generated label, always present), `name` (the typed or account name), `trust` (`label`, `guest`, `verified`, `agent`), `kind`, `email`, `mark`, `runId`.
- `packages/chrome/src/presence/IdentityChip.tsx:79-85` `nameOf`: the name, else the label; an agent with a run id reads `Agent · <runId>` (`AGENT_SENTENCES.agentTrust`, `menus/strings.ts:321`).
- `IdentityChip.tsx:88-90` `trustWordOf`: `guest` for a typed name, nothing for a label, a verified account or an agent (`PRESENCE.guest`, `strings.ts:104`).
- `IdentityChip.tsx:104-177` the chip: a `span.ts-chip` sized by the `size` prop (24, 16 or 14), `role="img"` with the name and trust word as its label, the SVG plate at `size - 2` (`presence/mark-svg.ts:29-31`), initials at 11, 8 or 7 px (`mark-svg.ts:34-36`). `presence/presence.css:12-24`: `box-sizing: border-box`, a 1 px `--pt-edge` border (`tokens.css:51` light `rgba(7,7,7,0.62)`, `:162` dark `rgba(242,242,240,0.55)`), paper ground, `is-self` in `--pt-ink`, `is-agent` dashed.
- `presence.css:34-37` `.ts-chip.is-blank` is 24 by 24; it is the empty box a surface draws when it has no identity.
- `packages/chrome/src/versions-model.ts:41-81` `identityOfAuthor`: a version record's `Author` (`packages/schema/src/mutations.ts:185-190`, `kind`, `name`, `runId?`, `principalId?`) becomes an `IdentityView`: the resolved identity by principal id when the shell passed one; an agent author keeps its own name; the round one `studio` author with no principal becomes `Earlier edits` (`principalId 'legacy:studio'`, trust `label`); anything else becomes a guest named by the typed label (`principalId 'local:<name>'`).
- `packages/chrome/src/dispatch.ts:23-25` `authorName`: the older rule, `Assistant` for any agent, else the raw `author.name`. Still used by the Inspector's embedded versions list (`VersionsPanel.tsx:602`) and by Change history (`HistoryPanel.tsx:58`).

### Version history panel

Mounted by `packages/chrome/src/EditorShell.tsx:1896-1927` inside `Panel` (`Panel.tsx:31-60`; `Panel.css:6-17` 320 px, `border-left: 1px solid var(--pt-hair)`; the head has `padding: 0 8px 0 16px`, `Panel.css:25`; the body is `.ts-panel-body.pt-scroll`, `overflow-y: scroll`, `tokens.css:194-197`).

The "You" rule. `EditorShell.tsx:1907-1911` passes `me` as the account principal when signed in, else `presence.self` (the anonymous principal the room knows the tab by). `VersionsPanel.tsx:163-168` `authorWord`: `You` when the record's identity has `me`'s principal id; an agent author with a name of its own reads that name; otherwise `nameOf`. `VersionsPanel.tsx:317` drops the trust word after `You`, so the own row never reads `You · guest`.

The grouping. `versions-model.ts:110-151` `groupVersions`: newest first, by day, then by a 15 minute window; a named record stands alone; a window carries its distinct authors in first appearance order and the sum of `mutations.length`.

The per version row (`VersionsPanel.tsx:237-354`), `li.ts-version`, a grid `16px minmax(0,1fr) auto auto` with an 8 px gap (`VersionsPanel.css:85-93`, `:229-231`), `padding: 6px 8px 6px 16px` (`:199-201`), `min-height: 40px`:

- Column 1 `span.ts-version-mark` (`:233-239`, a 16 by 16 inline-flex box) holding `IdentityChip size={16}` or, for Earlier edits, `span.ts-chip.is-blank.ts-chip-16` with `aria-hidden`.
- Column 2 `span.ts-version-body` (`:109-114`, a column, 1 px gap): the note line is a `button.ts-version-note.ts-version-pick` (`:116-123`, `:246-257`) reading the note, else the time inside a window, else `Sep 11, 01:06 AM`; then `span.ts-version-meta` (`:130-138`, 12 px `--pt-ink-2`, tabular figures, one line, ellipsis) reading `<when> · ` for a named record, then `span.ts-version-author` (`:268-275`, inline-block, `max-width: 140px`, ellipsis) with `You` or `<name> · guest`, then ` · <n changes | named>`, then ` · current` on the head record (`VersionsPanel.tsx:313-324`).
- Columns 3 and 4: the `Restore this version` text button (absent on the current record) and the More button, 28 px wide (`:207-210`).

How a note is truncated. `.ts-version-note` is `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` (`VersionsPanel.css:116-123`) and the pick button is `max-width: 100%` (`:256`); the whole note is only in the tooltip (`tipProps` name, `VersionsPanel.tsx:299-304`) and the Restore button's accessible name (`:331`). A named row reads its note at weight 500 in ink (`:125-128`); the current record's note also at 500 (`:203-205`). Measured: the row's column 2 is about 100 px wide once the Restore text button and More take theirs, so the meta line of a row inside a window is cut to `kevinliu · gu` (the trust word and the count are gone; see defect 5).

The group row (`VersionsPanel.tsx:356-409`), `li.ts-version-window > button.ts-version-window-row`, a grid `70px minmax(0,1fr) 16px` (`VersionsPanel.css:281-298`), `padding: 4px 0`, `min-height: 40px`:

- Column 1 `span.ts-version-marks` (`:305-311`, a fixed 70 px strip, 2 px gaps) holding up to four 16 px chips (`MARKS_PER_WINDOW`, `versions-model.ts:17`) and `+N` at 9 px (`:313-317`); the strip carries an `aria-label` of the author words.
- Column 2: `span.ts-version-note` reading `01:06 AM to 01:06 AM`, then `span.ts-version-meta` reading `<author words joined by ", "> · <n changes>`.
- Column 3: a text chevron `▸` or `▾`.
- Expanded, `ul.ts-versions-list.is-window` (`:324-328`, `padding-left: 12px`, `border-left: 1px solid var(--pt-hair-soft)`) lists the rows with `inWindow`.

Where the marks fall (measured). Window row: the row starts at x 1 with `padding-left: 0`, so the chip's box is at x 1 to 17 and its own 1 px `--pt-edge` border sits on the pixel column right after the panel's `--pt-hair` border; the note text starts at x 79. Standalone or named row: the chip at x 17, the text at x 41. Row inside an expanded window: the nested list's own 1 px rule at x 1 (a second vertical line beside the panel's border), the chip at x 30, the text at x 54. The day heading (`.ts-versions-day-head`, `margin: 12px 16px 4px`, `:193-197`) and the Only show named box (`.ts-versions-named`, `padding: 0 16px`, `:151-161`) both start at x 17. The panel therefore draws marks at three x positions (1, 17, 30) and text at three (79, 41, 54), and only the standalone row's mark sits on the panel's 16 px column.

Above the list: `.ts-versions-tools` (`:221-227`, a flex row, no horizontal padding) holds the Only show named label (`.ts-versions-named`, its own `border-bottom`) and the `Name this version` text button, which measured to a right edge at x 316. Under the list: the Show changes label reuses `.ts-versions-named` with `.ts-versions-foot` (declared at `:212-216` and again at `:330-334`).

The Inspector's embedded form (`VersionsPanel.tsx:545-620`) is a different row: the record number in a 28 px column (`:99-107`), the note or `write, n mutations`, and `authorName(version.author) · r<revision> · <when>` at `:602`. No chip, no You.

The versions the panel reads. `apps/studio/src/server/write.ts:216-228` `trimVersionLog` sends the loader the newest 50 records with `mutations: []` ("what the Version history panel's rows read before the panel loads the full log"); `write.ts:407` is the call. No code in `packages/chrome` or `apps/studio/src` calls `version.list` to load the full log afterwards (grep for `version.list` in `EditorShell.tsx`, `editor-shell.ts` and the routes: no hit).

### Show changes overlay

`packages/chrome/src/ShowChanges.tsx:91-94` draws the author's `IdentityChip size={16}` in `span.ts-change-chip` positioned absolutely (`ShowChanges.css:41-44`) at the touched block; the hatch angle per author index is `hatchAngle` (`versions-model.ts:170-173`). Not measured this pass.

### Title row

`packages/chrome/src/TitleRow.tsx:89-101` `lastEditWords`: `Last edit <ago> by <nameOf(editor)>` from the newest record's resolved identity, the round one label when none, never `You` (`TITLE_ROW.lastEditBy`, `strings.ts:42`).

### Comments

- The card (`packages/chrome/src/comments/CommentCard.tsx:163-179`): `div.ts-comment-head`, a grid `24px minmax(0,1fr) auto auto auto`, 6 px gap, 28 px tall (`comments.css:96-102`); `IdentityChip size={24}`, `span.ts-comment-who` (`:104-109`, inline-flex, baseline) with `span.ts-comment-name` at weight 500, one line, ellipsis (`:111-116`) and `span.ts-comment-trust` at 11 px `--pt-ink-2` (`:118-122`); `time.ts-comment-time` in tabular 11 px, `min-width: 3ch`, right aligned (`:124-130`) reading `shortTime` (`comments-model.ts:345-357`: `now`, `5m`, `3h`, `2d`, else `Sep 11`) and ` · edited`. The card is 300 px (`:28-38`); each comment has `padding: 8px 10px` (`:86-90`), so the chip sits 10 px in from the card's `--pt-edge` border.
- The author's name is always `nameOf(comment.author)` (`CommentCard.tsx:172`); `me` is used only for `mine` (Edit and Delete, `:135`) and the reaction state (`:233`). Nobody reads `You` in a comment.
- Mentions inline: `span.ts-comment-mention` (`CommentCard.tsx:90-97`, `comments.css:155-161`) with a 14 px chip and `nameOf`.
- The Comments panel row (`CommentsPanel.tsx:165-200`): `button.ts-comments-row-btn`, a grid `24px minmax(0,1fr) auto`, 8 px gap, 64 px tall, `padding: 0 12px` (`comments.css:496-512`); the 24 px chip, then `.ts-comments-row-head` (`:530-535`) with `.ts-comments-row-name` at 500, ellipsis (`:537-542`), the trust word, and `slide N` pushed right (`:544-550`); under it the first line of the thread, one line, ellipsis (`:552-556`, `firstLine`, `comments-model.ts:365-368`).
- The reply box mention list (`ReplyBox.tsx:170-190`): `button.ts-reply-mention`, a grid `16px minmax(0,1fr) auto`, 28 px tall (`comments.css:308-316`), the 16 px chip, the name, a literal `guest` (`ReplyBox.tsx:188`).

### The deck cards on /decks

`apps/studio/src/routes/decks.index.tsx:1405-1447` `CardView`: `li.ts-hm-card`, the thumbnail link, `.ts-hm-card-body` with the title link, `span.ts-hm-card-when` and the More button. The when line (`whenLine`, `:1253-1259`) reads `Opened 2 hours ago` from this browser's history, else `editedLine` (`:247-265`): `Edited today at 2:02 PM`, `Edited yesterday at 2:02 PM`, else `Edited Sep 12, 2026`, and `by <name>` when `updatedBy` is set. `.ts-hm-card-when` is 12 px `--pt-ink-2`, one line, ellipsis (`decks.css:392-400`). `CardWithAuthor` (`:1250-1251`) reads `updatedBy` off the card, but `DeckHead` (`packages/store/src/templates.ts:1055-1065`: id, title, slides, sections, revision, updatedAt, createdAt, trashedAt) and `DeckCard` (`apps/studio/src/server/decks.ts:64-68`: appearance, firstSlide) carry no author, owner or grant fields; `updatedBy` appears nowhere else in `apps` or `packages` (grep). No card draws a chip, an owner name or a shared mark.

### The Share dialog

`packages/chrome/src/dialogs/Share.tsx:555-559`: `me` is `account?.principal ?? presence?.self`; `personName` reads `You` for `me`'s principal, else `nameOf`. The people list (`:1011-1058`, `ul.ts-share-list`, drawn when the record names an owner, a pending owner or a grant): the owner row `li.ts-share-row.is-owner` with `IdentityChip size={24}`, the name, an empty 64 px chip column, the word `Owner`; the pending owner row with `Pending` in the chip column and `Pending ownership`; then `GrantRow` per grant (`:1539-1640`): the chip or `span.ts-chip.is-blank` for an email with no principal (`:1574-1578`), `.ts-share-row-name` with `title={grant.email}` (`:1579`), the status chip (`Pending`, `Expired`), the role select for a sharer or the role word for a reader. `share.css:167-176`: a grid `24px minmax(0,1fr) 64px auto`, 8 px gap, 40 px tall, `padding: 0 10px`, `--pt-hair-soft` under each; `.ts-share-row-name` one line, ellipsis (`:187-191`); the role word 12 px `--pt-ink-2` (`:210-216`). Requests (`:1475-1495`) read the name or address and the role asked for, with the chip or a blank chip.

### The trash page

`apps/studio/src/routes/decks.trash.tsx:339-352`: the card's when line reads `Trashed <shortDate> · N slides` from `card.trashedAt ?? card.updatedAt`. No author, no who trashed it, no chip. `home.spec.ts:300` asserts only `Trashed`.

### The versions-by-author e2e spec

`apps/studio/e2e/versions-by-author.spec.ts:142-244`: two editor contexts each type on a different slide; the spec asserts two distinct principals in `version.list` (`:159-164`), one window row with two `.ts-chip` marks (`:175-177`), two rows with two distinct `data-author` values after expanding (`:179-182`), Show changes drawing a `.ts-change-chip .ts-chip` (`:194`), Only named hiding both (`:198-205`), the two delete rows disabled with their clause (`:208-218`), and Make a copy at a version (`:221-239`). It asserts no author word, no `You`, no change count and no geometry. The unit tests (`packages/chrome/src/__tests__/versions-model.test.ts:88-96`, `versions-panel-switch.test.tsx`) cover the grouping and the Show changes switch, not the words or the layout.

### Other author surfaces, for completeness

- Inbox and Activity rows (`inbox/InboxPanel.tsx:77-81`, `activity/ActivityPanel.tsx:111-115`): a 24 px chip or a blank chip before a sentence; the sentence names the actor server side.
- Change history (`HistoryPanel.tsx:56-60`): `r<revision>`, `authorName(entry.author)`, the time, the note. No chip, no You, the raw label.

## Defects

1. The group row's mark sits on the panel's left border. `packages/chrome/src/VersionsPanel.css:281-298` gives `.ts-version-window-row` `padding: 4px 0`, while the version rows get `padding: 6px 8px 6px 16px` at `:199-201`. Measured: the window row starts at x 1 and its first chip occupies x 1 to 17, so the chip's `--pt-edge` border (dark `rgba(242,242,240,0.55)`) is drawn on the column right after the panel's `--pt-hair` border (dark `rgba(242,242,240,0.22)`); the two lines read as one thick edge in dark mode, which is Kevin's screenshot. The rows' marks sit at x 17 (standalone) and x 30 (inside an expanded window). Screenshot: `versions-panel-before.png` in the session scratchpad. Fix: `.ts-version-window-row { padding: 4px 8px 4px 16px; }` (the same inset as `.ts-versions.is-history .ts-version`), which puts the first chip at x 17, level with the day heading, the Only show named box and the standalone rows' marks.

2. The expanded window's rule doubles the panel border. `VersionsPanel.css:324-328` `.ts-versions-list.is-window { padding-left: 12px; border-left: 1px solid var(--pt-hair-soft); }` with no margin, and the window `li` has no padding, so the rule is drawn at x 1, right beside the panel's border, and the rows inside carry their own 16 px (`:199-201`) on top of the 12 px: chip at x 30, text at x 54. Fix: `.ts-versions-list.is-window { margin-left: 24px; padding-left: 0; }` and keep the rows' 16 px, so the rule stands at x 25 (under the parent mark's centre, x 17 plus 8) and the child marks at x 41, the parent's text column. The `margin-bottom: 4px` stays.

3. The group row's text does not share a column with any other text. `VersionsPanel.css:284` `grid-template-columns: 70px minmax(0, 1fr) 16px` and `:305-311` `.ts-version-marks { width: 70px }` reserve four marks whether one or four authors wrote the window; measured, the window's text starts at x 79 against x 41 for a standalone row, with 54 px of empty strip after a single chip. The 70 px was chosen so the text does not move between windows of one and four authors; the price is that every single author window (the common case on a one person deck) reads as indented. Fix: `.ts-version-window-row { grid-template-columns: auto minmax(0, 1fr) 16px; }` and `.ts-version-marks { width: auto; min-width: 16px; }`, so a one author window's text lands at x 41 with the rows; the marks of a many author window push their text right, which Google's grouped rows do too. If the fixed strip is wanted, use 16 px for one author and 70 px only when `window.authors.length > 1` through a class on the row.

4. Every row reads `0 changes` or `named`, whatever the record holds. `apps/studio/src/server/write.ts:216-228` strips `mutations` from the 50 records the loader sends (`write.ts:407`), and nothing reloads the log (no `version.list` call in the chrome or the routes). `versions-model.ts:135, 143` sums `mutations.length` for the window count and `VersionsPanel.tsx:320-322` reads `named` when the length is 0, else `n changes`. Measured on gt-brand: both window rows read `kevinliu · 0 changes` while `decks/gt-brand/versions/4.json` holds 1 mutation and `7.json` holds 15; every unnamed row inside a window reads `· named`. The count needs a field the trim keeps (`changes: number` on the trimmed record, or `mutationCount`), and the `named` word should key on `note !== ''`, not on the mutation count.

5. The meta line inside a window truncates to `kevinliu · gu`. Measured on the expanded rows (`versions-panel-expanded.png`): the Restore this version text button (`VersionsPanel.tsx:327-335`, a `ToolButton` with a label) and the 28 px More button take about 160 px of the 315 px row, the body column is about 100 px, and `.ts-version-meta` (`VersionsPanel.css:130-138`) clips after `gu`; the inline-block `.ts-version-author` (`:268-275`, `max-width: 140px`) is clipped without the outer ellipsis. The trust word, the count and `current` are unreadable in any row that is not the head record. Google draws Restore in the More menu and on the row's hover. Fix: move Restore into `MORE_ITEMS` (`VersionsPanel.tsx:126-142`) as its first row, or render it only on hover and focus of the row (`.ts-version:hover .ts-version-restore`), and let the meta line have the column.

6. The Earlier edits mark is drawn at 24 px in a 16 px box. `VersionsPanel.tsx:259` and `:382` render `span.ts-chip.is-blank.ts-chip-16`; `presence.css:34-37` `.ts-chip.is-blank { width: 24px; height: 24px }` has specificity (0,2,0) and `VersionsPanel.css:241-244` `.ts-chip-16` has (0,1,0), so the 24 px wins in both cascade orders and the blank chip overflows the 16 px `.ts-version-mark` box and the 16 px grid column. Read from the cascade; gt-brand has no `studio` record to measure. Fix: `.ts-chip.is-blank.ts-chip-16 { width: 16px; height: 16px; }` in `VersionsPanel.css`, or size the blank chip by the same `style={{ width, height }}` the `IdentityChip` uses.

7. The Show changes row is inset twice and ruled twice. `.ts-versions-foot` is declared at `VersionsPanel.css:212-216` (`margin: 12px 16px 0`) and again at `:330-334` (`margin-top: 12px; padding-top: 8px; border-top`); the row also carries `.ts-versions-named` (`:151-161`, `padding: 0 16px`, `border-bottom`). The box therefore sits at x 33 against x 17 for Only show named, between a top rule and a bottom rule. Not measured this pass (the row is drawn only with Tools > Advanced tools on). Fix: one `.ts-versions-foot` block, `margin: 12px 0 0; padding-top: 8px; border-top: 1px solid var(--pt-hair-soft); border-bottom: 0;`.

8. The tools row's rule stops under the checkbox label. `.ts-versions-named` (`VersionsPanel.css:160`) draws its own `border-bottom`, and in `.ts-versions-tools` (`:221-227`, a flex row without padding) that label measured 170.66 px wide, so a rule runs from x 17 to x 187 and stops before `Name this version`. The button's right edge measured at x 316, 4 px from the panel's edge, against the 8 px right inset of the panel head (`Panel.css:25`). Fix: move the rule to the tools row (`.ts-versions-tools { padding: 0 8px 0 0; border-bottom: 1px solid var(--pt-hair-soft); }`) and drop it from `.ts-versions-named` inside the tools row.

9. The group row has no hover state. `.ts-version-window-row` (`VersionsPanel.css:281-303`) declares `background: none` and only a focus outline; `docs/PRODUCT.md` 3.1 has every shell button take `--pt-plate` on hover (`Panel.css:69-74` does for the X). Fix: `.ts-version-window-row:hover { background: var(--pt-plate); }`.

10. A window that fits in one minute reads `01:06 AM to 01:06 AM`. `VersionsPanel.tsx:375, 391` always formats `from` and `to`; measured on the 2 second window of records 6 and 7. Fix: one time when `formatTime(from) === formatTime(to)`.

11. Two records in one window read identically. Measured: both rows in the expanded window read `01:06 AM` with the same meta; the record number and revision are not drawn (`versionRow` never prints `version.n` or `version.revision` in the history form) and the tooltip name is the same `formatWhen`. Fix: add `r<revision>` to the meta line, or seconds to the in-window time when two rows share a minute.

12. The own row's `me` differs between the panel and the Share dialog. `EditorShell.tsx:1911` reads `presence.self` for an anonymous browser (the roster entry the room holds), while `Share.tsx:556` reads `account.principal` first. On a memory tier room (`turboslide room: realtime tier memory (one process)` on this dev server) or before the room connects, the panel's own rows read the label and the Share dialog reads `You` for the same principal. Fix: one `meOf(input)` in `editor-shell.ts` that both surfaces read.

13. The version rows and the Inspector list disagree on the author. The embedded form (`VersionsPanel.tsx:602`) and Change history (`HistoryPanel.tsx:58`) print `authorName` (`dispatch.ts:23-25`): the raw typed label, `Assistant` for every agent, never `You`, no chip. Research 11 6.9 asks the history panel's meta line to gain the 16 px chip. Fix: pass `identities` and `me` to both and read `identityOfAuthor` and `authorWord`.

14. The deck card's `by <name>` never renders. `decks.index.tsx:1250-1259` reads `updatedBy` off `DeckCard`, but no listing writes it (`DeckHead`, `templates.ts:1055-1065`; `decks.ts:64-68`; grep across `apps` and `packages`), so `docs/PRODUCT.md:157` ("Edited by Kevin when the author is known") is unmet. Fix: `listDecks` reads the newest version record's author per deck and the server resolves it to a display name.

15. The `+N` mark count is 9 px. `VersionsPanel.css:313-317`; the smallest text elsewhere in the chrome is 11 px (`comments.css:118-122`). Fix: 11 px tabular in `--pt-ink-2`, and count it in the strip's width.

16. The email of a grantee is exposed as a tooltip. `Share.tsx:1579` `title={grant.email}` on every grant row for anyone who can open the people list, while `IdentityView.email` (`editor-shell.ts:254`) is documented as "never for anyone the caller may not see it". The people rows are drawn for a sharer (`Share.tsx:761, 844`), so the exposure is to editors; check that this is the intended audience or drop the `title`.

17. `Up to ${40}` in the Name this version tooltip. `VersionsPanel.tsx:447` hard codes the cap; `NAMED_CAP` (`versions-model.ts:16`) is the constant.

18. `dayLabel` exists twice. `VersionsPanel.tsx:92-108` and `versions-model.ts:88-104` are the same function; the panel's copy is used only by `groupByDay`, which the history form no longer calls.

19. The window row's `aria-label` sits on a `span`. `VersionsPanel.tsx:379` puts the author words on `span.ts-version-marks`, a generic element, which screen readers do not read as a label; the chips already carry `role="img"` with their names and the meta line prints the same words. Drop the attribute.

20. The e2e spec does not read the words or the geometry. `versions-by-author.spec.ts` asserts marks, `data-author` and the Show changes chip, never `You`, never the count, never a mark's x. Add: the own row reads `You`; the other row reads the display name and `guest`; a window row's first `.ts-chip` has `left` at least 16 px from the panel's `left`; the window's count equals the sum of the records' mutations.

## Gaps against the target

- Attribution: Google names each editor in a colour on the grouped row and the record row (research 3 01 section 6; SPEC-3 5.7). Turboslide draws the monochrome mark and the name; the mark's placement is inconsistent (defects 1 to 3) and the count is always 0 (defect 4).
- The record's contents: Google's row reads the time, the editor and, on hover, Restore; Turboslide draws Restore as a permanent text button that eats the meta line (defect 5).
- The change count wording: SPEC-3 5.7 asks for the window's change count; the trimmed log makes it 0 (defect 4).
- Change history and the Inspector list have no chip and no `You` (research 11 6.9; defect 13).
- /decks: `docs/PRODUCT.md` section 2 rank 4 puts Your presentations and Everyone's presentations, and the owner on a card, in the round after; today a card has no owner, no `by <name>` (defect 14) and no shared mark. Google's list shows the owner column (`me` or the name) and a people icon on a shared deck.
- Trash: Google's trash lists the owner and the trash date; Turboslide lists the date and the slide count only (`decks.trash.tsx:349-351`). The security log holds who trashed a deck (SPEC-3 6.1); nothing reads it for the card.
- Comments name the author with `nameOf`, never `You`; Google does the same (your own name on your comments), so this is consistent, but the roster, the Share dialog and the versions panel read `You` for the same principal, so a person sees two names for themself across the panels.
- The Share dialog reads `You` on the own row (`share.dialog.you-label`, `docs/PRODUCT.md:471`, recorded broken at severity 3 in that table); `share-dialog.test.tsx:970` covers it in the unit test; `share.spec.ts` asserts nothing on the row.

## Notes for the design

- One column for every mark in the panel: 16 px left inset for the day heading, the checkbox boxes, the group row's first chip and the standalone rows' chips; a nested window's rule under the parent chip's centre (x 25) and its children's chips at the parent's text column (x 41). The values are in defects 1 to 3.
- One author word rule for every panel: `You` for the own principal, the display name else, the trust word after a typed name, the agent's own name for an agent. `authorWord` (`VersionsPanel.tsx:163-168`) is that rule; move it beside `nameOf` in `IdentityChip.tsx` and read it from Change history, the Inspector list, the Title row's last edit line and the comments if the comments should read `You`.
- The count must travel with the trimmed record: add `changes` to the loader's version shape and keep `mutations` off the wire.
- Restore belongs in the More menu and on hover, so the meta line keeps its column at 320 px.
- The blank chip needs a size per surface: 24 in the roster, the inbox, the activity list and the Share rows; 16 in the versions list. A `size` on a `BlankChip` component beats a class that the cascade loses.
- The 9 px `+N` should be 11 px; the chrome has no text under 11 px.
- Every value here can be checked by `measure-versions.mjs` in the session scratchpad against a dev server of the worktree: the panel's x of each chip and each text, the tools row's right edge, the foot's rules.
