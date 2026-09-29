# Audit: parity

Read on 2026-09-29 against the worktree `Turboslide-people` (branch `people/round`, at `origin/main`, head `8ceb6294`). Line numbers are those of the files on that commit. Screenshots cited as `drive/A-*.png` are the ones under `docs/gslides-parity/people/drive/`. The sibling audits `audit-avatars.md` and `audit-authorship.md` in this folder go deeper on the upload path and on the version history panel. This note cites their defect numbers where they overlap and does not repeat their evidence.

The one line answer. Turboslide draws one monochrome mark per person on every surface Google has, and the mark's inputs are right for an anonymous person. For an account it is wrong on most surfaces: the account's name reaches the roster and the comments, but the Share dialog, the version list and a comment from someone who has left show a generated label or a guest word instead of the account, no surface shows a picture, no surface shows the verified mark, and the email that Google shows on hover and in the share rows is never in the data the chrome receives.

## The target

### How Google Slides shows people, as of 2026

The facts below come from the repo's research (`research/10` A1, A9, A14; `research-3/01` sections 2, 5, 6; `research-3/09` 3.6; `research-3/11` 5.2, 6.1) and from product knowledge where the research left a row unverified. Product knowledge rows are marked.

| Surface | What Google shows |
| --- | --- |
| Account picture circles, top right | One circle per collaborator present, left of Share, stacked with a small overlap. Each is the account's profile picture, or its initial on a colour when no picture is set. About 32 px in the title row (product knowledge; the research does not give the size). Hover shows the name and, for a named person, the email. The person the reader follows, and the person editing right now, carry a coloured ring in that person's colour. The row is absent while nobody else is present. An overflow circle with the count opens the collaborator list and chat. |
| Cursor flags | A caret in the collaborator's colour with a name flag above it on the canvas. The flag carries the first name or the full name in white on the colour. A selected shape gets an outline in the same colour. The flag hides after a pause and returns on the next edit (product knowledge for the hide). |
| Anonymous viewers | A person who is not signed in, or who was not invited by name, is "Anonymous <animal>" with a coloured animal glyph in the circle and the same colour on the caret. The animal cannot be followed. Its edits file under "All anonymous users" in version history and its comments under "Anonymous" (single source, `research-3/01` section 2). |
| Comment author | The author's picture circle, the name, and the time on every comment and reply. An anonymous comment reads "Anonymous" with the generic circle. |
| Version history | Versions grouped by time, each with its editors' names, each name with a coloured dot in that editor's colour. Show changes colours the changed text on the canvas by editor. |
| Share dialog people rows | One row per person: the picture circle, the name, the email under it, the role dropdown at the right. The owner reads "Owner". A pending invitation shows the email alone. Access requests show the requester's picture, name and email in the Review band. |
| Account menu | The account picture at the far right of the title row. Clicking it opens the Google account card: the picture at a large size, the name, the email, the account switcher, sign out. |
| Last edit | Hover on Last edit reads who last changed the file and when. |

### The target for Turboslide

The surfaces, and what each should show for the four kinds of person a rep meets. Monochrome marks and a hue on live surfaces only, as SPEC-3 4.1 fixes. The columns are: an account with a picture, an account without a picture, an anonymous person with a typed name (a guest), an anonymous person with no name (a label).

| Surface | Account with a picture | Account without a picture | Guest (typed name) | Label (no name) |
| --- | --- | --- | --- | --- |
| Presence slot chip, 24 px | The picture on the plate, 1 px `--pt-edge` border, 2 px live stripe in the hue, the verified mark after the name in the tooltip | Initials on the Bayer plate, the same border and stripe | Initials of the typed name, the same border and stripe | The label's initial on the plate, the same border and stripe |
| Chip tooltip | "Maya Chen · slide 12" with "Signed in as maya@…" when the reader may see the address | The same | "Maya · guest · slide 12" | "Titanium 471 · slide 12" |
| Own chip | The picture, 1 px ink border, the same live stripe as the roster's own row | Initials, ink border | Initials, ink border | The label's initial, ink border |
| Roster row | Picture, name, verified mark, role word, slide number, Follow | Initials, the same words | Initials, name, "guest", role word, slide number, Go to slide | Initial, label, role word, slide number, Go to slide |
| Caret flag, 120 by 18 | 14 px picture chip, the first name | 14 px initials chip, the first name | 14 px chip, the first name, then " · guest" when it fits | 14 px chip, the label |
| Pointer and outline | The hue, the same flag | The same | The same | The same |
| Filmstrip card | 16 px picture chip inset 4 px with the stripe | 16 px initials chip | 16 px chip | 16 px chip |
| Comment card | 24 px picture, name, verified mark, time | 24 px initials, name, verified mark, time | 24 px initials, name, "guest", time | 24 px initial, label, time |
| Comment marker | 16 px picture chip beside the ink plate | 16 px initials chip | 16 px chip | 16 px chip |
| Version history row | 16 px picture chip, the name | 16 px initials chip, the name | 16 px chip, name and "guest" | 16 px chip, the label, "(2)" when two labels collide in one deck |
| Show changes | The 16 px chip at the changed block, hatched plate, no hue | The same | The same | The same |
| Share dialog people row | 24 px picture, name, email under it, role dropdown | 24 px initials, name, email, role | Never a row: a guest holds no grant (SPEC-3 7.1). A link row reads "by link" | The same as a guest |
| Account menu | 24 px picture, name, "Signed in as maya@…", Change name, Change avatar, Sign out | 24 px initials, the same rows | 24 px initials, name, "Not signed in", Change name, Change avatar, Sign in | The label's initial, the label, "Not signed in", the same rows |
| Profile dialog | The picture at 24 px in the head, the sentence "Signed in as maya@…, verified" | Initials, the same sentence | Initials, "You are known by the name you typed" | The initial, "You are known by a label" |
| Last edit tooltip | "Last edit 2 minutes ago by Maya Chen" | The same | "by Maya · guest" | "by Titanium 471" |

The picture's limits and fallbacks, for the sales audience:

- The upload is JPEG, PNG, WebP or GIF (first frame). The browser resizes the square crop to 256 px before upload. The request is capped at 512 KB (`audit-avatars.md` section 3). The dialog says the cap in one sentence.
- The server keeps 32, 64, 128 and 256 px WebP and one 256 px PNG under a rotated key with the digest in the name (`avatar.ts` 30 to 40, 145 to 167). The chip reads 32 px at 1x and 64 px at 2x; the profile head and the builder's strip read 128 or 256.
- When the picture fails to load, the chip draws the initials plate underneath, so a broken URL never leaves an empty box.
- An anonymous person never uploads. The Picture tab reads "Sign in to upload a picture" (`avatar.ts` 42).
- A deleted account renders as "Deleted account" with the initials plate of that text (`resolve.ts` 100 to 115).
- A name is 1 to 40 code points in one script, never a label word, never the label grammar (`names.ts` 8, 32; `labels.ts` 116 to 123).

## What exists

### The mark and the identity data

- `packages/identity/src/marks.ts` 20 to 35: `MarkSpec` (variant `initials | glyph | dither | picture | agent`, initials, density 1 to 4, glyphSeed, `pictureUrl?`, presenter, self, hue, trust, label). Lines 90 to 125: `markSpec(identity, options)`. Line 109: the picture variant is drawn only `if (chosen === 'picture' && options.pictureUrl)`; otherwise the choice falls to initials (115 to 124).
- `packages/identity/src/labels.ts` 15 to 80: the 64 material words. 83: the denied numbers `[187, 311, 420, 666, 911]`. 107 to 110: `labelFor` gives `<Word> <NNN>`. 129 to 143: `disambiguateLabels` adds " (2)". No file in `apps` or `packages/chrome` calls it.
- `packages/identity/src/resolve.ts` 18 to 24: `TRUST_WORDS` is `{ label: '', guest: 'guest', verified: '', agent: 'Agent' }`. 27 to 38: `trustTooltip`. 231 to 248: `toIdentityView` copies `name` only when `trust !== 'label'` and `displayName !== label`, and `email` only under `showEmail`.
- `packages/identity/src/hues.ts` 23 to 28: the six hues; 32 to 33: the halo values.
- `packages/chrome/src/editor-shell.ts` 246 to 258: `IdentityView` (principalId, label, name?, trust, kind, email?, mark?, runId?). 262 to 284: `PresenceParticipant` adds clientId, role, hue, slideId, selection, pointer, following, presenting, idle, lastSeenAt. 514 to 555: `EditorAccount` with `avatar?`, `setAvatar?`, `pictureUrl?`.
- `apps/studio/src/server/room.ts` 2068 to 2098: `rosterEntryFor` computes the roster entry's mark with `markSpec(resolved, { hueSlot: slot })` (2079) and writes `label: resolved.displayName`, `trust`, `mark`, `hueSlot`, `kind`, `role` (2092 to 2097). No email, no picture URL.
- `apps/studio/src/server/write.ts` 380 to 389: the page payload's own identity: principalId, label, `name` for guest and verified, trust, kind, email.
- `apps/studio/src/server/auth/actions.ts` 146 to 175: `account.me` builds the mark through `identityViewFor(runtime, principal.id, { self: true, showEmail: true, agent })` and answers `avatar.url` as the 64 px picture URL separately (104 to 106).
- `apps/studio/src/editor/controller.tsx` 287 to 299: `identityView(payload.identity, author)` makes the own `IdentityView` with no `mark`. 302 to 340: `participantOf(entry)` carries the roster entry's `mark` and sets `name` from the label for guest and verified trust. 542 to 555: `identityOfPrincipal(principalId, label?, kind?)` derives trust from the id prefix alone (`usr_` is verified, else label). 561 to 580: `identityIndex` builds the name map from the comment authors, the roster and the caller.

### The presence slot and the roster

- `packages/chrome/src/presence/PresenceSlot.tsx` 85 to 124: four 24 px slots, each `<IdentityChip identity={participant} size={24} hueSlot live presenter />` with the tooltip from `chipTipOf` (104 to 113). 130 to 150: the `+N` chip, a people glyph from the first other person. 154 to 182: the own chip behind the rule, `<IdentityChip identity={self} size={24} self />` (178), drawn only while Tools > Advanced tools is on (154).
- `packages/chrome/src/presence/presence.css` 12 to 24: `.ts-chip` (inline flex, `box-sizing: border-box`, `border: 1px solid var(--pt-edge)`, paper background). 26 to 28: the own chip's ink border. 34 to 37: `.ts-chip.is-blank` at 24 px. 44 to 47: `.ts-chip-picture` (`display: block; object-fit: cover`). 60 to 68: the 2 px stripe at `bottom: 0` from `left: 0` to `right: 0`. 71 to 82: the presenter triangle. 95 to 106: the 184 px slot grid.
- `packages/chrome/src/presence/mark-svg.ts` 29 to 31: the plate is the chip less 1 px per side. 39 to 58: the Bayer cells aligned to the plate's top left. 80 to 123: the glyph grid with a 1 px inset at 24 px.
- `packages/chrome/src/presence/RosterMenu.tsx` 105 to 187: one row per participant with `<IdentityChip … live self={self} presenter />` (149 to 156), the name and " · guest" (158 to 162), the role word and the slide (163 to 170), Follow or Go to slide (172 to 184).
- `packages/chrome/src/presence/presence-model.ts` 87 to 95: `displayNameFor` hides a verified name behind the role word for a link visitor without the switch. 98 to 100: `trustWordFor` returns "guest" only. 122 to 129: the chip tooltip. 135 to 140: `flagText` fits " · guest" into 13 characters.
- `packages/chrome/src/presence/AccountMenu.tsx` 52 to 60: the head with `<IdentityChip identity={identity} size={24} self />`, the name and "Signed in as <email>" or "Not signed in".
- `packages/chrome/src/menus/strings.ts` `PRESENCE` block: `guest`, `byLink`, `anEditor`, `chipTip`, `you`; `ACCOUNT` block: `signedInAs`, `notSignedIn`, `profile.trust.*`, `avatar.*`.

### The canvas, the filmstrip, the plate

- `packages/chrome/src/presence/RemoteCursors.tsx` 61 to 83: the flag, `<IdentityChip … size={14} hueSlot live />` and `flagText`. 168 to 218: the outlines with at most two flags then "+N". 219 onward: the carets and the pointers.
- `packages/chrome/src/presence/FollowingPlate.tsx` 22 to 49: the 240 by 24 plate with a 14 px chip.
- `packages/chrome/src/presence/FilmstripMarks.tsx` 34 to 56: three 16 px chips with the stripe and the halo, then "+N". 60 to 84: one 14 px chip forced to 12 px by `.ts-chip-12` (`Sidebar.css` 703 to 706, with `!important`).
- `packages/chrome/src/Filmstrip.css` 219 to 230: `.ts-card-marks` absolute at `top: 4px; right: 4px`, 70 px wide.

### The stored surfaces

- `packages/chrome/src/comments/CommentCard.tsx` 169 to 178: the head with a 24 px chip, `nameOf(comment.author)`, the trust word, the time. 92 to 97: a mention as a 14 px chip and the name. 560 to 565: the assignee line.
- `packages/chrome/src/comments/CommentMarkers.tsx` 70 to 106: the marker button with a 16 px chip, the 20 px ink plate and the count chip.
- `packages/chrome/src/comments/CommentsPanel.tsx` 191 to 194: the list row with a 24 px chip and the name.
- `packages/schema/src/comments.ts` 140 to 146: a stored author is `{ principalId, label, kind }`. No trust, no name.
- `packages/chrome/src/VersionsPanel.tsx` 237 to 263: the row with `identityOfAuthor(version.author, identities)` and a 16 px chip or a blank chip for the legacy author. 379 to 388: the window row's marks. `packages/chrome/src/versions-model.ts` 41 to 82: `identityOfAuthor`; with no entry in `identities` a human author becomes `{ principalId: author.principalId ?? 'local:<name>', label: name, name, trust: 'guest', kind: 'anonymous' }` (75 to 81).
- `packages/chrome/src/EditorShell.tsx` 1907: `identities={input.identities}`. No file in `apps/studio/src` writes `identities` into the shell input.
- `packages/chrome/src/ShowChanges.tsx` 64 and 94: the same resolver and a 16 px chip at the changed block.
- `packages/chrome/src/dialogs/Share.tsx` 277 to 285: `identityOf(principalId)` builds a view from the id alone with `label: labelFor(principalId)` and no name. 1018 to 1032: the owner and pending owner rows with a 24 px chip and `personName`. 1568 to 1582: a grant row with a chip, the name span with `title={grant.email}`, the status chip, the role dropdown. `apps/studio/src/editor/EditorRoot.tsx` 876 to 906: the editor builds the owner and each grant principal the same way, `label: labelFor(...)`, trust by the `usr_` prefix, no name, no mark.
- `packages/chrome/src/dialogs/Profile.tsx` 78 to 108: the head with `pictureUrl={account?.pictureUrl}` and the trust sentence.
- `packages/chrome/src/dialogs/AvatarBuilder.tsx` 43 to 104: the preview strip at 24, 32, 64 and 256 in light and dark; 258 to 295: the Picture tab. The upload path is `audit-avatars.md` section 1.
- `apps/studio/src/server/auth/avatar.ts` 30 to 45: the sizes, the 5 MB cap, the ten per day quota, the four sentences. 103 to 169: the sharp pipeline.
- `packages/chrome/src/TitleRow.tsx` 274 to 282: the Last edit words from `save?.lastEditor`.
- `apps/studio/src/components/home/HomePipeline.tsx` 36 to 51: the home page's chip specimen for an anonymous label, monochrome, no stripe.

### Evidence images

- `drive/A-slot-named.png`: one other chip with the blue stripe, the people glyph, the rule, the own chip reading "St".
- `drive/A-roster-named.png`: the roster's own row reads "Ada Lovelace (you) · guest, slide 1" with a stripe on its chip, while the slot's own chip beside it reads "St" with no stripe.
- `drive/A-account-menu-named.png`, `A-account-menu-anonymous.png`: the account head with the chip, the name and the sentence.
- `docs/gslides-parity/return/audit-surface/76-presence-roster-3.png`: the roster on production at the return round.

## Defects

1. The mark Kevin named sits on the version panel's left border. `VersionsPanel.css` 281 to 298 give `.ts-version-window-row` `padding: 4px 0` and a `70px` first column, while the version rows get `padding: 6px 8px 6px 16px` (199 to 201). The window row's first 16 px chip therefore starts at x 1, and its `--pt-edge` border is drawn on the column right after the panel's `--pt-hair` border. In dark chrome the two lines read as one thick edge. This is `audit-authorship.md` defect 1, with the measurement and the fix (a 16 px left inset on the window row so every mark shares one column with the standalone rows). Related: defect 2 there doubles the panel border with the window's rule, and defect 6 there draws the blank legacy chip at 24 px inside the 16 px column because `.ts-chip.is-blank` (`presence.css` 34 to 37, specificity 0,2,0) beats `.ts-chip-16` (`VersionsPanel.css` 241 to 244).

2. No surface can show a picture. `room.ts` 2079 computes the roster mark with `{ hueSlot: slot }` only; `auth/actions.ts` 148 to 152 computes the own mark with `self`, `showEmail` and `agent` only; `marks.ts` 109 draws the picture only when `options.pictureUrl` is given. `EditorRoot.tsx` 806 to 863 never sets `account.pictureUrl` or `account.avatar`, so `Profile.tsx` 79 and `AvatarBuilder.tsx` 215 receive `undefined`. `IdentityChip.tsx` 42 to 55 (`resolvedOf`) hard codes `avatar: { variant: 'initials' }`, so an identity without a server mark is always initials. The picture upload itself is dropped by `EditorRoot.tsx` 823 to 828 (`audit-avatars.md` defects 1 to 3). Net: Google's first column, the account picture, is missing on every row of the target table.

3. The Share dialog shows an account as a generated label. `EditorRoot.tsx` 876 to 906 and `Share.tsx` 277 to 285 build the owner, the pending owner and every grant principal from the id alone: `label: labelFor(principalId)`, `trust: 'verified'` for `usr_`, no `name`, no `mark`. `Share.tsx` 1038 and 558 to 559 read `personName`, which is `nameOf`, which is `identity.name ?? identity.label` (`IdentityChip.tsx` 81 to 87). A signed in owner who is not the reader is therefore shown as, for example, "Cobalt 512", with a Bayer plate computed from `resolvedOf`. The row's email is a `title` attribute (1579), never a visible line. Google's row is picture, name, email, role.

4. Version history authors lose their account. `EditorShell.tsx` 1907 passes `input.identities`, but nothing in `apps/studio/src` populates it (grep `identities` across `apps/studio/src`: `room.ts` counters only). `identityOfAuthor` (`versions-model.ts` 75 to 81) then makes every human author `trust: 'guest', kind: 'anonymous'` with `label: author.name`, so a signed in account's versions read "Maya Chen · guest" with the initials plate hashed from its id, and a label author whose record stored the label reads the same way. The chip's `data-trust` and the `guest` word are wrong for two of the four kinds of person. The 0 changes count is `audit-authorship.md` defect 4.

5. A comment by someone who left shows the wrong trust. A stored author is `{ principalId, label, kind }` (`comments.ts` 140). `identityIndex` (`controller.tsx` 566 to 573) resolves a principal not in the roster through `identityOfPrincipal(principalId, label, kind)` (542 to 555): trust is `label` for an anonymous id and `verified` for `usr_`, `name` is unset. A guest who typed "Maya" and left is shown as "Maya" with no "guest" word (`trustWordOf` reads `trust === 'guest'`, `IdentityChip.tsx` 90 to 92), so a typed name reads as verified, which research 11 5.2 forbids. An account author who left keeps the name the record stored but gets the initials plate of its id, not its chosen mark.

6. Two `.ts-chip` rules collide. `apps/studio/src/styles.css` 35 to 46 declare `.ts-chip` for the sidebar's "fixture" word chip with `padding: 0 5px`, `line-height: 16px`, `font-size: 11px`, `color: var(--pt-titanium)`, `border: 1px solid var(--pt-hair)`; `presence.css` 12 to 24 declare the identity chip under the same class with `border: 1px solid var(--pt-edge)`. Both are one class deep, so the later sheet wins: `styles.css` is a `?url` link in `routes/__root.tsx` 20 and `presence.css` is a component import (`IdentityChip.tsx` 14), and their order differs between the dev server (style tags injected after the links) and the built page. When `styles.css` wins the identity chip has a 1.51:1 hair border, 10 px of horizontal padding inside a 24 px box (the plate overflows the content box) and titanium text. `DeckViewer.tsx` 219 is the only user of the word chip; renaming it removes the collision.

7. No verified mark exists. Research 11 5.2 and `resolve.ts` 18 to 24 give a verified account no word and the `check-badge` glyph after the name at 14 px in `--pt-ink-2`. The glyph exists (`icons.tsx` 57, 355 to 356) and is drawn by no people surface (the only reader is `Sidebar.tsx` 124 for a closing state). The roster, the comment card, the Share row, the account menu and the version row show a verified account and a guest the same way except for the guest word. For a rep the difference between "Maya Chen" (an account) and "Maya Chen" (a typed name) is invisible.

8. The own chip and the roster's own row disagree. `PresenceSlot.tsx` 178 draws the own chip from `input.account.principal`, which `EditorRoot.tsx` 801 builds once from the page payload with no `mark` and no `live`; `RosterMenu.tsx` 149 to 156 draws the own row from the roster entry with its server mark and `live`. After Change name, `setName` refreshes the roster (`EditorRoot.tsx` 816 to 821) and not the payload identity, so the slot's chip keeps the old initials until a reload while the roster row reads the new name (`drive/A-roster-named.png`: the slot's own chip reads "St", the roster's own row reads "Ada Lovelace (you)"). The slot's own chip also lacks the stripe the row's chip has. After Change avatar nothing refreshes either (`audit-avatars.md` defect 4).

9. The chip tooltip and the roster never carry an email. `rosterEntryFor` (`room.ts` 2087 to 2097) writes no email, `chipTipOf` (`presence-model.ts` 122 to 129) reads name, trust word and slide, and `PresenceSlot.tsx` 104 to 113 shows that. Google's hover shows the name and the email of a named collaborator. SPEC-3 4.8 lets a grant holder see named people by name; nothing in it forbids the address for a person who holds a grant. The only place the address appears is the reader's own account menu (`AccountMenu.tsx` 39 to 42).

10. Two labels that collide in one deck are not told apart. `disambiguateLabels` (`labels.ts` 129 to 143) has no caller outside its tests, so two anonymous people who hash to "Titanium 471" in one deck read identically in the roster, the comments and the version list. Research 11 4.3 asks for the " (2)" suffix by first appearance.

11. The comment author's time is not on the target's own row for a label. `CommentCard.tsx` 171 to 178 draw name, trust word and time for everyone; for a label author `trustWordOf` is null, so the card reads the label alone with no cue that the person is not signed in. Research 11 5.2 accepts this ("the grammar is the signal") and the tooltip sentence "Not signed in. A generated label for this browser." (`resolve.ts` 30) is drawn nowhere in the chrome: no chip carries a `title` or a tooltip with `trustTooltip`.

12. The account menu's head and the profile's head draw the chip without the roster's mark. `AccountMenu.tsx` 54 and `Profile.tsx` 79 pass `identity` from `account.principal`, which has no `mark` (defect 8), so a glyph or dither choice shows as initials in the two places that exist to show the choice.

13. The Last edit words come from the save state, not from the resolver. `TitleRow.tsx` 276 reads `save?.lastEditor` and `save?.lastEditBy`; SPEC-3 4.2 asks for the newest record's author through `resolvePrincipal`. Whether the save state carries a resolved name for another person's edit is not settled by this read; `audit-authorship.md` "Title row" covers the surface.

14. The filmstrip's outline density chip is forced with `!important` (`Sidebar.css` 703 to 706) over a 14 px `IdentityChip`, and its plate is scaled by CSS to 10 px while the cells were computed for a 12 px plate (`mark-svg.ts` 29 to 31 at size 14). The cells no longer sit on whole pixels at 1x.

15. The e2e rows read no mark facts. `presence.spec.ts` asserts no `data-variant`, `data-trust`, `data-hue` or stripe; `accounts.spec.ts` 405 opens the menu and stops; `share.spec.ts` 1314 to 1320 read the row's name span, so an account owner reading as a label would pass. The unit test `presence-slot.test.tsx` covers the slot's geometry only.

## Gaps against the target

| Target row | State | Where |
| --- | --- | --- |
| Account picture on the chip, the roster, the flag, the comment, the version row, the Share row, the account menu | Missing on every surface | defect 2; `audit-avatars.md` 1 to 3 |
| Verified mark after an account's name | Missing | defect 7 |
| Name and email on hover for a named collaborator | Name only; the email never leaves the server for another person | defect 9 |
| Share row: picture, name, email, role | Label, hidden email, role | defect 3 |
| Version row: the account's name and mark | Guest word and a hashed plate | defect 4 |
| Comment by a guest who left: name and "guest" | Name alone | defect 5 |
| Comment by a label: the label and a cue | The label alone, no tooltip | defect 11 |
| Two labels in one deck told apart | Not told apart | defect 10 |
| The own chip changes with the name and the avatar | Stale until reload | defect 8 |
| The account menu head shows the chosen mark | Initials always | defect 12 |
| One `.ts-chip` | Two rules, cascade order decides the border | defect 6 |
| The mark's column in the version panel | On the panel border | defect 1 |
| Anonymous label: a material word and a number, never an animal | Present and stable | `labels.ts` |
| The guest word on a typed name | Present on the roster, the flag when it fits, the comment card of a present author | `presence-model.ts` 98, 135 |
| The hue on live surfaces only | Present | `marks.ts` 9 to 11; `presence.css` |
| The role word for a link visitor in place of an account's name | Present | `presence-model.ts` 87 to 95 |
| The picture's size limit and fallbacks | The server side is present (5 MB, four formats, sniffed); the client resize and the 512 KB request cap are missing | `avatar.ts` 30 to 45; `audit-avatars.md` section 3 |
| A deleted account renders as "Deleted account" | Present at the resolver, drawn by no surface that reaches the resolver (defect 4) | `resolve.ts` 100 to 115 |

## Notes for the design

1. Resolve people on the server once and ship the view. Every stored surface (versions, comments, Share, Last edit) should receive an `IdentityView` with `name`, `trust`, `mark` and, where the reader may see it, `email`, from `resolveIdentity` plus `toIdentityView`. The page payload should carry `identities` keyed by principal id for the version authors and the comment authors on the deck, and the access record's owner and grants should be resolved the same way before they reach `EditorRoot.tsx`. That closes defects 3, 4, 5 and 12 in one place and removes `identityOf` in `Share.tsx` and the label building in `EditorRoot.tsx` 876 to 906.

2. Put the picture URL into the resolver's output. `ResolvedIdentity` should carry `pictureUrl` from `pictureUrl(avatar, 64)` and `markSpec` should read it, so the roster, `account.me`, the comment authors and the version authors draw the picture with no per caller argument. `IdentityChip` then needs `srcset` for 32 and 64 px and an `onError` that hides the image and lets the plate show.

3. One own identity. `account.principal` should be the roster's own entry when the room holds one, else the payload identity, and `setName` and `setAvatar` should write the action's answer (`name`, `mark`, `avatar`, `pictureUrl`) back into it. The own chip in the slot and the own row in the roster then read one source, with the stripe on both or on neither.

4. Draw the verified mark. Add the 14 px `check-badge` after the name in the roster row, the comment head, the Share row and the account head for `trust === 'verified'`, in `--pt-ink-2`, never in a hue. Keep the guest word as it is. A label gets a tooltip with `trustTooltip('label')` on the chip.

5. Show the email where Google does. The chip tooltip and the roster row for a verified account should read the address under the name when the reader holds a grant on the deck (SPEC-3 4.8), and the Share row should print it under the name rather than in a `title`. The roster entry needs an `email` field written by `rosterEntryFor` under the same rule the payload uses (`write.ts` 388).

6. Rename the word chip. `.ts-chip` in `styles.css` 35 to 46 should become `.ts-word-chip` with `DeckViewer.tsx` 219 updated, so the identity chip's border is `--pt-edge` in every build.

7. Call `disambiguateLabels` when building the name map. `identityIndex` in `controller.tsx` knows every principal on the deck; the " (2)" suffix should be computed there by first appearance and applied to `label` and `name` of the view.

8. The version panel's mark column. Give the window row the rows' 16 px inset and drop the 70 px reserve (`audit-authorship.md` defects 1 to 3), and size the blank chip per surface with a `BlankChip` component that takes `size`.

9. Keep the 12 px outline chip honest. Either compute a 12 px mark (`MarkSize` gains 12 with a 10 px plate and 2 px cells) or draw the 14 px chip and give the outline row the two pixels.

10. Rows for the walk. The presence walk should read `data-variant`, `data-trust` and the stripe on a chip of each kind of person; the Share walk should assert the owner row reads the account's name; the versions walk should assert a signed in author's row has no guest word; the comments walk should assert a guest author who closed the tab still reads "guest".
