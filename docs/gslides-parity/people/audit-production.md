# People on production: what two anonymous browsers see of each other

Driven on 2026-09-29 against https://www.turboslide.com with the workspace's Playwright 1.62.1 (chromium headless, two browser contexts, 1440 by 900 at device scale 2). The script is `docs/gslides-parity/people/drive/people.mjs`; every reading it took is in `docs/gslides-parity/people/drive/facts.json`; the pictures are in the same folder and named below. The scratch deck `untitled-20260929-kved` was created from /new by context A, opened by context B through an editor share link, and removed by its id through the bearer at the end (`deck.info` at revision 3, `deck.trash` 200, `deck.remove` 200 `removed: true`, `/edit/<id>` 404). A first run of the script (`untitled-20260929-cli4`) stopped at the comment step and was removed the same way; its pictures were overwritten by the second run.

Scenario as driven. A opens /new, types a title, reads the deck id, opens the deck to anyone with the link as an editor through the window API (`share.setGeneralAccess`), and B follows the minted /s/ link to `/edit/<id>`. Both are anonymous with labels first (A `Bismuth 168`, owner; B `Copper 183`, editor). A then turns Tools > Advanced tools on, opens the own chip's menu, and sets the display name `Ada Lovelace` through Change name. A posts a comment, applies the Glyph avatar, and opens the Profile dialog and the avatar builder. B stays unnamed and without Advanced tools, as a person who arrived by link would.

## What exists

The chip. `packages/chrome/src/presence/IdentityChip.tsx` 104 to 177 draws one `span.ts-chip` per principal: a 24, 16 or 14 px box with a 1 px `--pt-edge` border (`--pt-ink` for the own chip, dashed for an agent), an inner `svg.ts-chip-plate` of `plateOf(size)` = size minus 2 (`presence/mark-svg.ts` 29 to 31), one `rect` per lit cell, the initials as an SVG `text` at 11 px (`initialsFontSize`, mark-svg.ts 34 to 36) with `paint-order: stroke fill` and a 2 px paper stroke (`presence/presence.css` 49 to 57), a 2 px `--ts-hue` stripe at the bottom while the roster holds a live entry (presence.css 59 to 68), a 6 px presenter triangle, and an `img.ts-chip-picture` for the picture variant. `aria-label` is the mark's label or `chipName` (the name and the trust word, IdentityChip.tsx 92 to 97 and 143).

The mark. `packages/identity/src/marks.ts` 90 to 125 computes one `MarkSpec` per principal: variant `initials` by default with a Bayer field at density 1 to 4 eighths from two hash bits (66 to 74), `glyph` and `dither` from a seed the builder's Another rerolls, `picture` when a picture URL is known, `agent` for a token. `initialsFor` (53 to 63) gives one letter for a label and two for a typed or account name. The hue is never computed here; it comes with the room's grant (`apps/studio/src/server/room.ts` 2079, `grantHueSlot`) and is drawn on live surfaces only.

The label. `packages/identity/src/labels.ts`: `<Material> <NNN>` from sha256 of the principal id, 64 words by 895 numbers. `disambiguateLabels` (129 to 143) adds a display only " (2)" to the second principal with the same label. Nothing in `packages/chrome` or `apps/studio` calls it (a grep over both trees finds it in `labels.ts` and `labels.test.ts` only).

The presence slot. `packages/chrome/src/presence/PresenceSlot.tsx` 75 to 219: a 184 px grid (`presence.css` 95 to 106, tracks `24 4 24 4 24 4 24 4 32 8 1 7 24`) with four 24 px chips for others (buttons `presence.chip.<clientId>`, a click follows or jumps), the `presence.more` opener (a people glyph from the first other person, `+N` from the fifth, nothing while alone, PresenceSlot.tsx 125 to 150), and the own chip `title.account` with its hair rule, drawn only while `isPresent(itemById('title.account'))` (PresenceSlot.tsx 154). `title.account` is parked whole under Tools > Advanced tools (`packages/chrome/src/menus/model.ts` 865 to 903, `parked(sub('title.account', ...))`), and so is the roster's own row `title.presence.me` (model.ts 795 to 799, `advanced: true`) and the Follow word (778 to 783).

The roster. `packages/chrome/src/presence/RosterMenu.tsx` 53 to 190: a 240 px `PlateMenu` (`PlateMenu.tsx` 43) labelled Collaborators, one 32 px row per participant with the 24 px live chip, the name with the trust word (`· guest`), the role word or `by link` (`presence-model.ts` 102 to 106), `slide N`, and Go to slide N or Follow on the right; the own row reads `(you)` and opens the account menu; Join chat is a Later stub under the switch.

Names across viewers. `presence-model.ts` 87 to 95 `displayNameFor`: a verified account's name reaches only grant holders or link visitors under the owner's Show names switch, otherwise its role word; a label or a typed name reaches everyone. The server does the same before it sends the roster (`room.ts` 2122 to 2144 `rosterEntryForReader`), and the client turns a roster entry into a participant with `name: entry.label` when the trust is guest or verified (`apps/studio/src/editor/controller.tsx` 302 to 307 `participantOf`).

The own chip's menu. `presence/AccountMenu.tsx` 29 to 88: a head with the 24 px self chip, `identity.name ?? identity.label` and `Signed in as <email>` or `Not signed in`, then the rows of `title.account` that pass `isPresent`: Change name, Change avatar, Sign in (when the deployment offers one), Sign out, Forget this browser, Sessions. Sessions opens the Profile dialog (`editor-shell.ts` 1035 to 1036 maps 'Sessions' to `profile`).

The name prompt. `dialogs/NamePrompt.tsx` 40 to 148: 360 by 168, "How should others see you?", one field prefilled with the name or the label, Continue, and a Sign in link when available; `modal={false}` when the first edit fires it, `modal` from Change name. The controller fires it on the first edit of a principal whose trust is `label` (`controller.tsx` 2350 to 2361: `identity !== undefined && identity.trust === 'label' && !latest().namePrompt && !promptedName`). The Share dialog raises its own copy titled "Your name, shown to collaborators" on the first Share of a browser (`dialogs/Share.tsx` 206 to 221 and 664 to 674).

The Profile dialog. `dialogs/Profile.tsx` 57 to 259: 560 by 640, a head with the 24 px self chip, `nameOf(identity)`, one trust sentence (`ACCOUNT.profile.trust`, `menus/strings.ts`: "You are known by a label", "You are known by the name you typed", "Signed in as <email>, verified"), Change name and Change avatar; a Sessions section with 40 px rows; API keys and Delete account for a signed in account only.

The avatar builder. `dialogs/AvatarBuilder.tsx` 106 to 302: 560 by 640, tabs Initials, Glyph, Dither, Picture (`dialog.avatarBuilder.tab.<tab>`), a fixed strip of eight previews at 24, 32, 64 and 256 px in light and dark (`.ts-avatar-strip`, `dialogs/accounts.css` 220 to 245), an Initials field (max two letters), Another on Glyph and Dither, and on Picture either the upload control (`label.ts-avatar-upload` with a hidden `input type=file accept="image/png,image/jpeg,image/webp,image/gif"`, a 256 by 256 crop box and the sentence "Pictures up to 5 MB", AvatarBuilder.tsx 258 to 289) for a signed in principal, or the sentence "Sign in to upload a picture" for an anonymous one (291 to 294) with Apply disabled (198). The server side limit is 5 MB after a browser resize to at most 1024 px, 16.7 megapixels of input, ten uploads per identity per day, JPEG, PNG, WebP or GIF by magic number, derived to 32, 64, 128 and 256 px WebP plus one 256 px PNG (`apps/studio/src/server/auth/avatar.ts` 30 to 45).

Version history. `packages/chrome/src/VersionsPanel.tsx` 163 to 168 `authorWord`: `You` for this browser's own records, the display name otherwise. Each record row carries the author's 16 px chip (261) and `<word> · <trust> · <n changes>` (315 to 321). Records in one window collapse under a window row with up to four 16 px marks in a 70 px strip and the authors' words (360 to 400; `VersionsPanel.css` 306 to 311).

Comments. `comments/CommentCard.tsx` 170 to 173: the 24 px author chip, the name in 500 weight and the trust word beside it (`comments/comments.css` 96 to 122); the panel row (`CommentsPanel.tsx` 184) and the slide marker (`CommentMarkers.tsx` 96, a 16 px chip with the halo over a dithered picture) show the same author.

Themes. `<html data-theme>` from `localStorage.gt-theme` (`apps/studio/src/routes/__root.tsx` 64); every chip colour is a token (`--pt-ink`, `--pt-paper`, `--pt-edge`), so the dark pictures below came from setting the attribute and the key.

## What each person saw

Both anonymous, no names (pictures `A-slot-anonymous.png`, `B-slot-anonymous.png`, `A-title-row-anonymous.png`, `A-roster-anonymous.png`, `B-roster-anonymous.png`, `A-chip-tooltip-anonymous.png`).

- A saw B as one 24 px chip in the first slot: `aria-label` `Copper 183`, `data-trust` `label`, `data-hue` `4` (`--ts-hue: #1d8fc8`), initials `C`, a live stripe. The tooltip read `Copper 183 · slide 1` over `Go to slide 1`. The roster listed one row `Copper 183` / `editor · slide 1` / `Go to slide 1`. No own chip, no rule, no own row (`ownChip: false`, `rule: false`).
- B saw A the same way: `Bismuth 168`, trust `label`, hue `1` (`#2f5ce0`), initials `B`; roster row `Bismuth 168` / `owner`. B's first roster read `owner` without `slide 1` and an empty action word, the row's slide arriving with a later heartbeat.
- Neither saw a "You": the own chip and the roster's own row are parked (Defect 3).
- Two unnamed people are told apart by the label word and number, the single initial, the hue stripe (slots 1 and 4 here), and the density of the Bayer field (49 cells against 61). Two people who happen to share one label would show the same word, number and initial; only the hue and the field density would differ, since `disambiguateLabels` is never called (Gap 2).

After A named itself `Ada Lovelace` (pictures `A-slot-named.png`, `B-slot-named.png`, `A-roster-named.png`, `B-roster-named.png`, `B-chip-tooltip-named.png`, `A-account-menu-named.png`).

- B saw A's chip change to `Ada Lovelace, guest`, `data-trust` `guest`, initials `AL`, the same hue 1. The tooltip read `Ada Lovelace · guest · slide 1`. The roster row read `Ada Lovelace · guest` / `owner · slide 1` / `Go to slide 1`. The state's participant for A carried `label: "Ada Lovelace"`, `name: "Ada Lovelace"`, `trust: "guest"`.
- A's own roster row (Advanced tools on) read `Ada Lovelace (you) · guest` / `slide 1` with the `AL` chip and hue 1, and Join chat as a stub under it. A's own chip in the title row and the account menu head still read `studio` with initials `ST` and the sentence `Not signed in` (Defect 1).
- Dark mode (`A-slot-dark.png`, `B-slot-dark.png`, `A-roster-dark.png`, `B-roster-dark.png`, `A-version-history-dark.png`, `B-version-history-dark.png`, `A-profile-dialog-dark.png`, `A-avatar-builder-picture-dark.png`): the same chips with the tokens swapped; the hue stripe keeps its hex in both themes.

The comment (`A-comment-compose.png`, `A-comment-marker.png`, `B-comment-by-A.png`, `B-comment-card.png`, `B-comments-panel.png`, `zoom-B-comment-chip.png`). B's panel row read `Ada Lovelace guest slide 1 Can you check the title on this slid... now` with the `Ada Lovelace, guest` chip; the opened card read `Ada Lovelace guest now` and the sentence; the thread's author record carried `hue: 1` from A's roster entry while the mark inside it carried `hue: {slot: 2}` (Defect 6). In A the card closed as soon as Comment was clicked and only the slide marker stayed.

Version history (`A-version-history-light.png`, `B-version-history-light.png`, `zoom-A-version-window-mark.png`). A read one window `11:56 AM to 11:56 AM` / `You · 1 change` with two records `You · named · current` and `You · 1 change`, both with 16 px chips (`Ada Lovelace, guest` on the newer, `Bismuth 168, guest` on the older). B read the same window as `Ada Lovelace · 0 changes` and the records as `Ada Lovelace · guest · named · current` and `Bismuth 168 · guest · named` (Defects 4 and 5).

Profile and avatar builder in A (`A-profile-dialog.png`, `A-profile-head.png`, `A-profile-dialog-dark.png`, `A-avatar-builder-initials.png`, `A-avatar-builder-glyph.png`, `A-avatar-builder-dither.png`, `A-avatar-builder-picture.png`, `A-avatar-builder-strip.png`, `zoom-A-avatar-strip-small.png`). Profile: head `studio` / `You are known by the name you typed` with the `ST` chip, Change name, Change avatar; Sessions listing `Not signed in`; no keys, no Delete account. Avatar builder: the strip drew eight previews (`ST` on Initials); the Picture tab showed no upload control, no crop box and no limit, only `Sign in to upload a picture` with Apply disabled (`file: 0`, `uploadLabel: null`). Apply on Glyph closed the dialog; B's chip for A changed to `data-variant` `glyph` within the poll (`B-slot-after-glyph-avatar.png`), so the choice travels. A's own chip did not change (`A-slot-after-glyph-avatar.png`, still `ST` initials).

B, unnamed and without the switch, had no own chip, no rule and no account row (`B.ownChip: {account: 0, rule: 0}`), so B has no way to see itself, name itself or change its avatar until its first edit fires the prompt or the Share dialog asks.

## Defects

1. The own chip, the account menu and the Profile dialog show `studio` instead of the person, for a deck created from /new.
   Evidence: `slot.A.advanced` chip under `title.account` reads `aria-label: "studio, guest"`, initials `ST`; `accountMenu.A.named` reads `name: "studio", sentence: "Not signed in"` after the name was set; `profile.A` head reads `studio` with the sentence `You are known by the name you typed`; `account.A.named` from `describe().state` reads `{principalId: null, label: "studio", trust: "guest", signedIn: false}`; the roster's own row read `Ada Lovelace (you) · guest` at the same moment (`A-roster-named.png` against `A-account-menu-named.png`, `A-profile-head.png`).
   Cause: the /new draft payload carries no identity (`apps/studio/src/server/write.ts` 459 to 535 `readDraftDeckFn` builds its `EditorDeck` without the `identity` field that `readEditorDeckFn` sets at 380), the address moves to `/edit/<id>` after the first write without the router and its loader (`apps/studio/src/routes/new.tsx` 103 to 110 `pinAddress`, `History.prototype.replaceState`), and the page keeps `DEFAULT_AUTHOR = 'studio'` (`apps/studio/src/editor/EditorRoot.tsx` 150 to 159 `authorOfIdentity`). The controller then reports `account.label: identity?.label ?? author.name` (`controller.tsx` 4226 to 4232) and the own chip draws `presence.self ?? null` only when the route passed no account (`PresenceSlot.tsx` 42 to 48), which it did, as `studio`.

2. The name prompt did not fire on the first edit.
   Evidence: `namePrompt.firstEdit: false` in both runs, read after the title was typed, committed, the address moved and the row read All changes saved; the prompt appeared only from Change name.
   Cause: the same missing identity; `controller.tsx` 2350 to 2353 requires `identity !== undefined && identity.trust === 'label'`, and the /new page has no identity. The same shape means Kevin's /new session never gets asked for a name unless Share is opened (`Share.tsx` 664 to 674) or the switch is on.

3. Every identity mark is drawn at half size and off the plate's grid, because the editor's `.ts-chip` collides with the home page's fixture chip class.
   Evidence: on every chip measured, the `svg.ts-chip-plate` with `width="22"` has a computed width of 12 px and a height of 22 px (`slot.*` readings: `svg: {w: 12, h: 22, attrW: "22", cssW: "12px"}`); the lit cells span a 12 by 12 square with 6 px of paper to every edge inside the 24 px box (`cellsExtent: {fromLeft: 6, fromTop: 6, fromRight: 6, fromBottom: 6}`); the same 6 px inset on the 24 and 256 px previews of the builder (`avatar.A.initials` chips `plateInset: {l: 6, r: 6}`). Pictures: `zoom-A-other-chip-anonymous.png`, `zoom-B-other-chip-named.png`, `zoom-A-own-chip.png`, `zoom-A-avatar-strip-small.png`.
   Cause: `apps/studio/src/styles.css` 35 to 45 declares `.ts-chip { ... padding: 0 5px; ... border: 1px solid var(--pt-hair); font-size: 11px; line-height: 16px; ... }` for the viewer's "fixture" chip (`apps/studio/src/components/DeckViewer.tsx` 219). `packages/chrome/src/presence/presence.css` 12 to 24 sets no padding, so the 5 px sides survive the cascade; the SVG is a flex item in a 12 px content box and shrinks to 12 px, and `preserveAspectRatio` (the default `meet`) letterboxes the 22 unit view box into a 12 px square in the middle. The Bayer grid, meant to align to the plate's top left at whole cells (`mark-svg.ts` 13 to 18), now draws at 12/22 scale with sub pixel cells, which is why the fields read as grey noise at 24 px and the initials sit on a speckle rather than on a field.

4. The version window's author mark sits on the panel's left border.
   Evidence: `versions.A.markEdge[0]` and `versions.B.markEdge[0]`: the window row's 16 px chip has `leftOfPanel: 0` and `leftOfHost: 0` while the record rows' chips sit at 29 px; `zoom-A-version-window-mark.png` and `A-version-history-dark.png` show the chip's left edge on the vertical hair line of the panel with no air.
   Cause: `.ts-version-window-row` has `padding: 4px 0` and the grid `70px minmax(0, 1fr) 16px` (`VersionsPanel.css` 281 to 293), and the marks strip starts at the row's first column, while the record rows under `.ts-versions.is-history .ts-version` carry `padding: 6px 8px 6px 16px` (VersionsPanel.css 199 to 201) and the panel itself has `padding: 8px 0 12px` (147 to 149). Nothing gives the window row the 16 px left inset the records have. This is the avatar touching the border in the request; the fix is a left padding on `.ts-version-window-row` equal to the record rows' 16 px (and the strip's 70 px then covers four 16 px marks at 2 px gaps with the count, as the comment on 306 says).

5. The window's change count differs between viewers.
   Evidence: A read `You · 1 change` for the window; B read `Ada Lovelace · 0 changes` for the same window and `named` on the older record where A read `1 change` (`versions.A.light` against `versions.B.light`, `A-version-history-light.png` against `B-version-history-light.png`).
   Cause (probable, not driven further): `versions-model.ts` 135 and 143 sum `version.mutations.length`; the records B receives arrive with their mutations stripped (`room.ts` 2147 `stripNotes` and the reader side entry shaping), so a record reads `0` changes and the row's word becomes `named` (VersionsPanel.tsx 319 to 321 shows `named` when `mutations.length === 0`). B therefore sees A's edits as "named" records with no change count.

6. A comment's author carries two different hues.
   Evidence: `comments.B.state.threads[0].comment.author` has `hue: 1` (the slot granted to A's live entry) and `mark.hue: {slot: 2, hex: "#789000"}`; in the first run the same author read `hue: 2` beside `mark.hue.slot: 3`. The stored comment card is monochrome by rule (marks.ts 9 to 11), so nothing visible depends on it today, but the record is inconsistent and a design that colours stored surfaces would draw the wrong hue.
   Cause: the roster entry's `hueSlot` is `slot - 1` (`room.ts` 2094) while `markSpec` is computed with `hueSlot: slot` (2079); the comment author is a copy of the roster entry with both fields.

7. Initials are illegible at 24 px and absent at 16 px.
   Evidence: `initialsBox` reads 7 px tall and 4 to 8 px wide (`fontSize: 11px`) over the 12 px field; `zoom-B-other-chip-named.png` shows `AL` as a smear on a checkerboard; `zoom-A-version-window-mark.png` shows the 16 px chip as a 10 px grey square with no letter; the comment marker chip in `zoom-B-comment-chip.png` is a black block with a white bite where the 16 px chip's halo, the `is-self` border and the selection ring meet.
   Cause: Defect 3 halves the plate, and the 2 px paper stroke around 11 px letters on a Bayer field at 3 or 4 eighths leaves no contrast between the letter and the cells even at the intended size; at 16 px the initials render at 8 px (`initialsFontSize`) on a 6 px field after the shrink.

8. The dark theme's chip edge is the light theme's value.
   Evidence: in `A-slot-dark.png` and `B-roster-dark.png` the other person's chip border reads as a mid grey on black while the own chip and the `+N` opener read white; the computed border in light was `rgba(7, 7, 7, 0.62)` (`--pt-edge`); the `.ts-avatar-cell.is-dark` preview overrides `--pt-edge` to `rgba(242, 242, 240, 0.55)` (`accounts.css` 239 to 245), which is what the live chrome should take from the theme too.
   This is a token question for the design rather than a code path, so it is listed without a fix.

9. B's first roster row read the role alone.
   Evidence: `roster.B.anon` row meta `owner` with an empty action word while A's row for B read `editor · slide 1` / `Go to slide 1` at the same moment; 800 ms later (`roster.B.named`) the row read `owner · slide 1`. A's `slideId` reached B's roster with the next presence post; until then the row offers no jump. Minor, timing only.

## Gaps against the target

The target here is Google Slides' collaborator surface as SPEC-3 sections 4, 5 and 7 describe it, read against the pictures.

1. A person has no self surface by default. The own chip, its rule, the account menu and the roster's `(you)` row are parked under Tools > Advanced tools (model.ts 795 to 799 and 865 to 903; `B.ownChip: {account: 0}`). Google shows the own avatar at the row's right at all times; here a link visitor cannot see how they appear, and cannot reach Change name, Change avatar, Profile or Forget this browser. The name prompt (first edit, or first Share) is the only default path to a name, and Defect 2 closes the first of those for a deck made from /new.

2. Two people with one label are not told apart in text. `disambiguateLabels` exists (labels.ts 129 to 143) but nothing calls it; the roster, the chips, the comments and the history would show two `Copper 183` rows with the same initial. The marks differ only by hue (live surfaces) and Bayer density (two bits, four values), which is not a distinction a reader can name. Google's anonymous animals are unique per session within a document.

3. Picture avatars exist only for signed in accounts, and this deployment offers no sign in (`account.signInAvailable: false`; `avatar.A.picture.upload: {file: 0}`; the Picture tab reads `Sign in to upload a picture` with Apply disabled). So on production nobody can upload a picture, and the stated limit ("Pictures up to 5 MB", the JPEG, PNG, WebP or GIF sentence) is never shown. The Sign in row of the account menu is absent for the same reason (`accountMenu.A.*` rows: changeName, changeAvatar, forget, sessions).

4. The own chip and the presence chips are computed by two paths. The roster comes from the server (`room.ts` 2067 to 2096, `markSpec(resolved, ...)`), the own chip from the route payload through `identityView` (`controller.tsx` 287 to 299) or `presence.self`; when the payload is empty the two disagree (`ST`/`studio` against `AL`/`Ada Lovelace`). One source for "me" is the design's first requirement.

5. The chip's geometry is not what the spec drew. The 22 px plate at whole 2 px cells (mark-svg.ts 13 to 18; SPEC-3 4.1) is drawn as a 12 px letterboxed square inside 5 px of padding (Defect 3), so no picture on production shows the intended mark at any size, including the builder's 256 px preview, which draws 244 px.

6. Stored surfaces carry no "You". The comment card and panel row show `Ada Lovelace guest` to A itself (the Comments panel in A would read the same as B's; version history alone says `You`, VersionsPanel.tsx 164). Google says "You" on the author's own comments.

7. Version history hides a link visitor's change counts (Defect 5), so B cannot tell a one change record from a named marker.

8. The presence slot draws nothing to say who is present when alone: the four empty slots and the empty opener are `opacity: 0` (presence.css 153 to 156 and 184 to 187), and with no own chip the 184 px track is blank paper in the title row (`A-title-row-anonymous.png`, the gap between the theme button and the people glyph). Google keeps the own avatar there.

## Notes for the design

- Fix the class collision first (Defect 3): rename the viewer's fixture chip in `apps/studio/src/styles.css` 35 (for example `.ts-fixture-chip`) and `DeckViewer.tsx` 219, or give `presence.css` `.ts-chip` an explicit `padding: 0` and `font: 0/0 a` reset so no later stylesheet can pad it. Every screenshot in this folder shows the shrunken mark; the design should be judged only after this change, since the field density, the initials contrast and the halo were all sized for a 22 px plate.

- Give the version window row the record rows' left inset (`.ts-version-window-row { padding: 4px 8px 4px 16px }`, VersionsPanel.css 281) so the mark clears the panel's border by 16 px like the rows under it; the `70px` marks column already reserves four marks and a count.

- Make "me" one object: the room's own roster entry (`presence.self`, which already carries the name, the trust, the mark and the hue) should feed the own chip, the account head and the Profile head; `input.account.principal` should be derived from it or from the identity the /new route can fetch after the first write (a `readEditorDeck` of the new id, or an identity field on the draft payload). Until then the own chip lies for every deck made from /new.

- The own chip should leave the parked set. Without it a person has no picture of themselves and no door to the name, the avatar and the sessions; the roster's `(you)` row can stay parked if the chip returns.

- Anonymous distinction needs a text channel: call `disambiguateLabels` over the roster and the comment and history authors in first appearance order, and render the suffix in the roster, the chip tooltip and the card; keep the mark as the second channel.

- Initials on a Bayer field do not read at 24 px; at 16 px they are dropped. The design should decide between a letter mark (initials on plain paper, the density expressed as a 2 px frame or a corner) and a field mark (the glyph and dither variants, no letters), and stop combining them. The glyph variant B saw after Apply (`B-slot-after-glyph-avatar.png`) reads better than the initials at 24 px even shrunken.

- The hue stripe is the only colour and it works: A's blue stripe and B's cyan stripe identify the chips in every picture. Keep the stripe inside the border with a 1 px paper gap rather than flush against it; today it runs edge to edge under the plate (presence.css 60 to 66, `left: 0; right: 0; bottom: 0`) and touches the border on three sides.

- Dark theme: define `--pt-edge` for `[data-theme='dark']` at the value the builder's dark cell uses (`rgba(242, 242, 240, 0.55)`, accounts.css 242) so the other chips' frames match the own chip and the opener in dark.

- The Picture tab should state the limit and the formats even when the control is absent, and the Sign in sentence should link to the way in when one exists; on this deployment it should say that sign in is not offered here rather than ask for it.

- Comments should say "You" for the reader's own comments the way version history does (`authorWord`, VersionsPanel.tsx 163 to 168), and the stored author record should carry one hue field or none.

## Pictures

All under `docs/gslides-parity/people/drive/`, 2x pixels:

- Title row and slot: `A-title-row-anonymous.png`, `A-slot-anonymous.png`, `B-slot-anonymous.png`, `A-slot-advanced-own-chip.png`, `A-slot-named.png`, `B-slot-named.png`, `A-slot-dark.png`, `B-slot-dark.png`, `A-slot-after-glyph-avatar.png`, `B-slot-after-glyph-avatar.png`.
- Tooltips: `A-chip-tooltip-anonymous.png`, `B-chip-tooltip-named.png`.
- Roster: `A-roster-anonymous.png`, `B-roster-anonymous.png`, `A-roster-named.png`, `B-roster-named.png`, `A-roster-dark.png`, `B-roster-dark.png`.
- Account menu and name: `A-account-menu-anonymous.png`, `A-account-menu-named.png`, `A-change-name-dialog.png`.
- Version history: `A-version-history-light.png`, `A-version-history-dark.png`, `B-version-history-light.png`, `B-version-history-dark.png`.
- Comment: `A-comment-compose.png`, `A-comment-marker.png`, `B-comment-by-A.png`, `B-comment-card.png`, `B-comments-panel.png`.
- Profile and avatar builder: `A-profile-dialog.png`, `A-profile-head.png`, `A-profile-dialog-dark.png`, `A-avatar-builder-initials.png`, `A-avatar-builder-glyph.png`, `A-avatar-builder-dither.png`, `A-avatar-builder-picture.png`, `A-avatar-builder-picture-dark.png`, `A-avatar-builder-strip.png`.
- Zoomed crops (nearest neighbour, 4x to 6x): `zoom-A-other-chip-anonymous.png`, `zoom-B-other-chip-named.png`, `zoom-A-own-chip.png`, `zoom-A-version-window-mark.png`, `zoom-B-comment-chip.png`, `zoom-A-avatar-strip-small.png`.
- Readings: `facts.json`; the drive: `people.mjs`.
