# People audit

Written 2026-09-29 from the seven audit notes in this folder (`audit-identity.md`, `audit-presence.md`, `audit-authorship.md`, `audit-avatars.md`, `audit-accounts.md`, `audit-production.md`, `audit-parity.md`) against the worktree `Turboslide-people` (branch `people/round`, head `8ceb6294`, at `origin/main`). Line numbers are those of that tree. A citation such as "presence 2" names defect 2 of `audit-presence.md`; "production gap 1" names gap 1 of `audit-production.md`. The production readings come from `drive/facts.json` and the pictures beside it, driven against https://www.turboslide.com on the same day with two anonymous browsers; the scratch deck was removed by its id.

One change was made to the tree while this note was written and is not committed: `packages/chrome/src/VersionsPanel.css` gives the version window row the record rows' 16 px left inset and sizes the blank legacy chip at 16 px in the 16 px column (defect 1 below). `versions-panel-switch.test.tsx`, `versions-model.test.ts` and `presence-slot.test.tsx` pass after the change (19 of 19).

## 1. How people appear today, by surface

The model. Every record attributes work to a principal id and never to a name (`packages/identity/src/ids.ts` 1 to 19): `anon_<uuid>` for a browser, `usr_<id>` for an account, `agent:<tokenId>` for an API key. The name, the trust state and the mark are computed at render time by `resolvePrincipal` (`resolve.ts` 139 to 211). An anonymous browser carries a label `<Material> <NNN>` hashed from its id (`labels.ts` 107 to 110), for instance "Titanium 471". A typed name makes the person a guest; an account is verified; a token is an agent. The mark is one square plate per principal (`marks.ts` 20 to 35): initials on a Bayer field by default, a glyph or dither field when chosen in the builder, a picture when a URL is known, a dashed agent plate. The hue is one of six slots granted by the room and drawn on live surfaces only (`hues.ts` 22 to 29; `room.ts` 2055 to 2061).

Production. `DATABASE_URL`, `REDIS_URL` and the mail variables are unset (`docs/HOSTING-MOVE.md` 20). `GET /api/auth/get-session` answers 404. Every person on production is anonymous with a label or a typed name; no surface can show an account, a session or a picture. The principal store is a file per instance, so an avatar choice made on one instance is initials on the next (identity 1.7).

| Surface                                    | What is drawn today                                                                                                                                                                                                                                                                                                                               | Source                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Title row presence slot                    | Four 24 px chips for others in roster order, a people glyph or "+N" opener, then a hair rule and the own chip only while Tools > Advanced tools is on. Each chip: 1 px `--pt-edge` border, the plate, a 2 px hue stripe at the bottom, the presenter triangle. Tooltip "Maya · guest · slide 12".                                                 | `PresenceSlot.tsx` 75 to 182; `presence.css` 12 to 128                                  |
| Own chip, account menu                     | Behind the switch. The head shows the chip, the name or label and "Not signed in"; rows Change name, Change avatar, Forget this browser, Sessions. On a deck made from /new the head reads `studio` with initials `ST` even after the name is set.                                                                                                | `AccountMenu.tsx` 29 to 88; `menus/model.ts` 865 to 903; production 1                   |
| Roster menu                                | A 240 px plate, one 32 px row per participant: the 24 px live chip, the name with " · guest" for a typed name, the role word, the slide, Go to slide or Follow. The own row reads "(you)" and is behind the switch.                                                                                                                               | `RosterMenu.tsx` 53 to 190                                                              |
| Caret flag, pointer, outline               | A caret and an outline in the hue with a 120 by 18 flag holding a 14 px chip and the first name. The pointer is never published by a real tab. Slot 1 draws in ink because of an off by one.                                                                                                                                                      | `RemoteCursors.tsx` 61 to 284; presence 2, 3                                            |
| Filmstrip and outline                      | Up to three 16 px chips in the card corner with the stripe; one 12 px chip in the outline row.                                                                                                                                                                                                                                                    | `FilmstripMarks.tsx` 21 to 84                                                           |
| Comment card, panel row, marker            | The 24 px author chip, the name in 500 weight, the trust word, the time. The stored author is `{ principalId, label, kind }`; a name typed later never reaches an older comment. Nobody reads "You".                                                                                                                                              | `CommentCard.tsx` 163 to 179; `comments.ts` 140                                         |
| Version history                            | A 16 px chip per record, "You" for the own records, the name and " · guest" for others. Windows of 15 minutes collapse under a row with up to four 16 px marks. Every count reads "0 changes" or "named" because the loader strips mutations. The author is resolved through an `identities` map nothing fills, so every human author is a guest. | `VersionsPanel.tsx` 237 to 409; `versions-model.ts` 41 to 151; authorship 4; accounts 6 |
| Show changes                               | The author's 16 px chip at the changed block, hatched by author index.                                                                                                                                                                                                                                                                            | `ShowChanges.tsx` 64 to 94                                                              |
| Share dialog                               | The owner row, the pending owner, one row per grant: a 24 px chip, the name, the role. Every person is built from the id alone, so an anonymous grantee shows its label and an account shows a label with `trust: 'verified'`. The email is a `title` attribute.                                                                                  | `Share.tsx` 277 to 285, 1011 to 1058, 1539 to 1640                                      |
| Profile dialog, avatar builder             | The head chip, one trust sentence, Sessions, keys and Delete account for an account. The builder has Initials, Glyph, Dither and Picture tabs with eight previews; the Picture tab reads "Sign in to upload a picture" for everyone on production. Apply on Glyph changes what others see and not the own chip.                                   | `Profile.tsx` 57 to 259; `AvatarBuilder.tsx` 106 to 302; production 1.10                |
| /decks cards, trash                        | "Edited yesterday at 2:02 PM" with no author; the `by <name>` branch has no producer. Trash lists the date and the slide count.                                                                                                                                                                                                                   | `decks.index.tsx` 247 to 265, 1250 to 1259; authorship 14                               |
| Last edit                                  | "Last edit <ago> by <name>" from the newest record's resolved identity, never "You".                                                                                                                                                                                                                                                              | `TitleRow.tsx` 89 to 101                                                                |
| Inbox, Activity, Change history, Inspector | A 24 px chip or a blank chip before a sentence; Change history and the Inspector list print the raw author name with no chip and no "You".                                                                                                                                                                                                        | `InboxPanel.tsx` 77 to 81; `HistoryPanel.tsx` 56 to 60; `VersionsPanel.tsx` 602         |
| CLI and exports                            | `account me --avatar-png` is a usage error; the PPTX comment authors use no mark renderer.                                                                                                                                                                                                                                                        | `apps/cli/src/commands/account.ts` 46 to 51; avatars 9                                  |

Two facts change every reading above on production. First, `apps/studio/src/styles.css` 35 to 46 declares `.ts-chip` for the viewer's word chip with `padding: 0 5px`, so every identity chip's SVG is letterboxed to 12 px inside its 24 px box and the fields read as grey noise (production 3). Second, the two anonymous browsers told each other apart by the label, the single initial, the hue stripe and the density of the Bayer field; with one name typed, the other browser saw "Ada Lovelace · guest" on every surface within the poll.

## 2. Defects

Deduplicated across the seven notes. Each entry names the files and lines, the evidence, and the audit defects it merges.

1. The version window row's mark sits on the panel's left border. `packages/chrome/src/VersionsPanel.css` 281 to 298 gave `.ts-version-window-row` `padding: 4px 0` while the record rows have `padding: 6px 8px 6px 16px` (199 to 201). Measured on production and on a dev server: the window row's first 16 px chip had `leftOfPanel: 0` (`facts.json` `versions.A.markEdge`, `versions.B.markEdge`), so its `--pt-edge` border was drawn on the column beside the panel's `--pt-hair` border; in dark chrome the two lines read as one thick edge (`drive/zoom-A-version-window-mark.png`, `A-version-history-dark.png`). The record rows' chips sat at x 17 and x 30. Fixed in this worktree: `padding: 4px 8px 4px 16px`, which puts the first chip at x 17 with the day heading, the Only show named box and the standalone rows. The blank legacy chip drawn in the same column at 24 px (`presence.css` 34 to 37 outranks `.ts-chip-16`) is sized by a new `.ts-chip.is-blank.ts-chip-16` rule. Merges authorship 1 and 6, production 4, parity 1.

2. The expanded window's rule doubles the panel border and the marks strip indents every one author window. `VersionsPanel.css` 324 to 328 draws `.ts-versions-list.is-window` with `padding-left: 12px` and a border at x 1 beside the panel's own; the 70 px `.ts-version-marks` strip (305 to 311) puts a single author window's text at x 79 against x 41 for a record. Not changed here; the values are in authorship 2 and 3.

3. Two `.ts-chip` rules collide and halve every mark on production. `apps/studio/src/styles.css` 35 to 46 (the viewer's word chip, `padding: 0 5px`, `border: 1px solid var(--pt-hair)`) and `packages/chrome/src/presence/presence.css` 12 to 24 share one class at one specificity; the later sheet wins and the order differs between the dev server and the built page. Measured on every chip on production: `svg.ts-chip-plate` with `width="22"` had a computed width of 12 px and 6 px of paper to every edge (`facts.json` `slot.*.svg`, `cellsExtent`), including the builder's 256 px preview. `DeckViewer.tsx` 219 is the word chip's only user. Merges production 3, 5 and 7, parity 6.

4. The mark's field touches the chip border, and so does the stripe. The plate is `size - 2` (`marks-render.ts` 117 to 119; `mark-svg.ts` 29 to 31), the initials, dither and agent fields start at the plate's first pixel (`marks-render.ts` 146 to 203; `mark-svg.ts` 48 to 53, 145 to 150), a picture is drawn at the plate size (`IdentityChip.tsx` 146 to 147), and the stripe runs `left: 0; right: 0; bottom: 0` (`presence.css` 60 to 66). Measured at 24 px: 22 to 44 of a plate's ink pixels lie on its outer ring. Only the glyph variant keeps a 1 px inset. Merges identity 1, presence 11, the production stripe note.

5. The chrome and the package draw different marks. `mark-svg.ts` 61 to 77 and 130 to 134 derive the glyph grid and the ramp from the seed one way; `marks-render.ts` 56 to 96 another. Measured at 24 px on three ids: the glyph plates share 22 to 48 of 130 to 192 ink pixels; the agent fields are complements (`mark-svg.ts` 158 to 160 against `marks-render.ts` 190 to 193). The CLI PNG and the chip differ for every glyph, dither and agent mark; the file records the intent to switch (`mark-svg.ts` 8 to 11). Merges identity 2, presence 10.

6. Sign in never reaches the deck surfaces. `room.ts` 309 to 377 `requestIdentity` reads the bearer and the anonymous cookie and never the better-auth session (`session.ts` 202 can only answer anonymous; the `signedIn` branch at `room.ts` 373 is dead); `room.ts` 398 to 407 `resolveIdentity` passes `alias: () => null, account: () => null`, so a `usr_` id renders as "Deleted account" and an aliased `anon_` id never renders as its account. The editor boot (`write.ts` 333, 380 to 389), presence, ops, stream, share, access, notify and the version authors (`room.ts` 379 to 395) all see a signed in browser as its anonymous id, while comments through `/api/actions` (`actions.ts` 696) see `usr_`; one person is two ids with two marks in one deck. The full resolver exists (`identity.ts` 455 to 723) and only `account.me` calls it. Merges identity 3, accounts 1 to 3.

7. The verified state has no mark, no word and no tooltip. `TRUST_WORDS.verified` is `''` (`resolve.ts` 24); `trustWordOf` and `trustWordFor` answer for `guest` only (`IdentityChip.tsx` 88 to 90; `presence-model.ts` 98 to 100); the `check-badge` glyph (`icons.tsx` 356) is drawn by no people surface; `data-trust` has no stylesheet rule; `trustTooltip` (`resolve.ts` 29 to 40) has no caller; the roster entry carries no email (`channel.ts` 150 to 160). SPEC-3 0.19 and research 11 5.2 name the badge and the email tooltip. Merges identity 4, accounts 4 and 5, parity 7, 9 and 11.

8. The version panel never receives resolved identities. `EditorShell.tsx` 1907 passes `input.identities`; nothing in `apps/studio/src` sets it. `identityOfAuthor` (`versions-model.ts` 75 to 81) then makes every human author `trust: 'guest'` with the stored name as the label, so an account reads "Maya Chen · guest" and a label author reads "Titanium 471 · guest". Merges accounts 6, parity 4.

9. A comment's author is a label snapshot with the wrong trust once the person leaves. The stored author is `{ principalId, label, kind }` (`comments.ts` 140); `identityOfPrincipal` (`controller.tsx` 542 to 555) sets `label` for an anonymous id, so a guest who typed "Maya" and left reads "Maya" with no guest word, and a name typed later never reaches an older comment. The author record also carries two hues (`hue: 1` beside `mark.hue.slot: 2`, `facts.json` `comments.B.state`) because `room.ts` 2094 writes `slot - 1` and 2079 computes the mark with `slot`. Merges identity 10, parity 5, production 6.

10. The Share dialog does not resolve people and exposes the email as a tooltip. `Share.tsx` 277 to 285 and `EditorRoot.tsx` 876 to 906 build the owner and every grant principal from the id alone (`label: labelFor(principalId)`, no name, no mark), so a signed in owner reads as "Cobalt 512"; `Share.tsx` 1579 puts `grant.email` in a `title` for any sharer. Merges identity 9, parity 3, authorship 16.

11. The own chip, the account head and the Profile head do not read what others see. `PresenceSlot.tsx` 42 to 48 and 178 draw the own chip from `input.account.principal`, built once from the page payload with no `mark` and no `live`; `IdentityChip.tsx` 42 to 55 hard codes `avatar: { variant: 'initials' }` for a view without a mark. After Change name the roster row reads "Ada Lovelace (you)" while the slot chip reads `ST` (`drive/A-roster-named.png` against `A-account-menu-named.png`); after Apply on Glyph the other browser's chip changed and the own chip did not (`A-slot-after-glyph-avatar.png`). On a deck made from /new the payload carries no identity at all (`write.ts` 459 to 535 `readDraftDeckFn`; `routes/new.tsx` 103 to 110 `pinAddress`), so the head reads `studio` and the name prompt never fires on the first edit (`controller.tsx` 2350 to 2353). `setAvatar` calls neither `controller.refreshPresence()` (`EditorRoot.tsx` 823 to 828) nor `room.forgetIdentity` (`auth/actions.ts` 341 to 377), and the builder starts from `account.avatar`, which is never populated (`AvatarBuilder.tsx` 110). Merges production 1 and 2, presence 5, parity 8 and 12, avatars 4 and 5, authorship 12.

12. The picture avatar cannot be uploaded, drawn or served. `EditorRoot.tsx` 823 to 828 forwards `variant`, `initials` and `salt` and drops `choice.picture`; the schema wants a data URL string (`packages/schema/src/actions.ts` 5425 to 5428) and nothing encodes the `File`; the server answers "picture is required for the picture variant" (`auth/actions.ts` 352). A picture set through the transport is never drawn because no caller passes `pictureUrl` to `markSpec` (`marks.ts` 109; `room.ts` 2079; `auth/actions.ts` 148 to 160). Hosted, `server/actions.ts` 1256 registers the actions without `avatarStore`, the default is the file store on the function's disk (`auth/actions.ts` 293 to 294), `blobAvatarStore` (`avatar.ts` 243) has no caller, `u/` is not a public path (`packages/store/src/migrate.ts` 77 to 82), and `routes/api/avatar.$.ts` 21 to 23 answers 404 when hosted. There is no crop (`AvatarBuilder.tsx` 277 to 287 says "Drag to crop" over a box with no handler), no client resize, and the caps do not line up (5 MB in the dialog, 1 MB on `/api/actions` per `dispatch.ts` 21 and 96, 4.5 MB on the server function). One 64 px URL serves every size (`auth/actions.ts` 104 to 106). The CLI's `--picture <path>` throws "picture must be a data URL" (`auth/actions.ts` 262 to 270). Merges avatars 1, 2, 3, 6, 7, 8, 12, 13, presence 4, parity 2, identity 11.

13. The avatar choice and the settings are per instance on production. The principal store is Redis or a file store (`auth/principal.ts` 104 to 110); production has no Redis. `account.setName` writes the name onto the Blob deck index (`actions.ts` 322 to 330; `access.ts` 230 to 234) and `account.setAvatar` writes the record only (`actions.ts` 366 to 369). `ts_profile.avatar` is written and never read (`profile.ts` 94 to 106; `identity.ts` 345 to 352). Merges identity 5, avatars 11.

14. The own chip and "(you)" are absent by default. `title.account` is parked whole (`menus/model.ts` 865 to 903); `title.presence.me` and `title.presence.follow` are `advanced: true` (795 to 800, 778 to 783); the own chip draws only under `isPresent` (`PresenceSlot.tsx` 154). A link visitor has no way to see how they appear, name themselves or change their avatar until the first edit or the first Share (`B.ownChip: {account: 0, rule: 0}`). Merges presence 6, production gap 1, identity 8 in part.

15. The hue slot is off by one on the client. `room.ts` 2094 writes `hueSlot: slot - 1`; `participantOf` passes it through (`controller.tsx` 318); `isHueSlot` accepts 1 to 6 (`hues.ts` 38 to 40). Slot 1 draws its caret, outline and flag in ink; slots 2 to 6 draw one hue below the grant. Presence 2.

16. Chips move between slots on every presence update. `controller.tsx` 1909 to 1910 removes the updated row and appends it, so a caret move reorders the roster and `slotChips` (`presence-model.ts` 43 to 49) swaps chips in and out of the four slots. Presence 1.

17. The pointer position is never published. `reportPresence` (`EditorRoot.tsx` 735 to 750) sends `slideId`, `selection` and `presenting`; no file writes `pointer: { x, y }`. The View > Live pointers rows draw nothing for anyone. Presence 3.

18. Two anonymous principals with one label are not told apart. `disambiguateLabels` (`labels.ts` 125 to 143) has no caller outside its test; the stored marks differ by two hash bits of density. On a deployment's history a collision is certain. Merges identity 7, parity 10, production gap 2.

19. The initials variant separates two people by four greys and does not read at the small sizes. `density` is two hash bits (`marks.ts` 71). Measured on production: the initials box was 7 px tall over the shrunken field and `zoom-A-version-window-mark.png` shows the 16 px chip as a grey square with no letter; even at the intended size a 2 px paper stroke around 11 px letters on a 3/8 field leaves no contrast. The glyph and dither variants carry 32 bits and are behind the parked builder. Merges identity 8, production 7.

20. Per deck name uniqueness reads the version log alone. `taken` is the log's human author names (`actions.ts` 185 to 205), not the roster or the grants (SPEC-3 7.2), and runs only with a deck in the request. A second "Kevin" is accepted while the first has only commented or is only present. Identity 6.

21. An account's display name falls back to its email. `resolve.ts` 124 `displayName: profile.name.trim() || profile.email`; `toIdentityView` 241 to 242 copies it into `name` past the `showEmail` gate. The magic link creates `name: ""` and the dialog posts no name (`EditorRoot.tsx` 833). The name the server writes for such an account is the label (`identity.ts` 548), so one account is "kevin@…" in one place and "Cobalt 412" in another. Merges accounts 7, identity 13.

22. Every version row reads "0 changes" or "named". `write.ts` 216 to 228 strips `mutations` from the 50 records the loader sends and nothing reloads the log; `versions-model.ts` 135 and 143 sum `mutations.length`; `VersionsPanel.tsx` 320 to 322 reads `named` at 0. Measured: both browsers, `A-version-history-light.png` against `B-version-history-light.png`. Merges authorship 4, production 5.

23. The Restore text button truncates the version meta line to "kevinliu · gu". `VersionsPanel.tsx` 327 to 335 draws Restore as a permanent text button; the body column is about 100 px of 315 and `.ts-version-meta` clips (`VersionsPanel.css` 130 to 138, 268 to 275). Authorship 5.

24. Smaller version panel items: the Show changes row is inset and ruled twice (`VersionsPanel.css` 212 to 216 and 330 to 334, authorship 7); the tools row's rule stops under the checkbox label (160, 221 to 227, authorship 8); the window row has no hover state (281 to 303, authorship 9); a window inside one minute reads "01:06 AM to 01:06 AM" (`VersionsPanel.tsx` 375, 391, authorship 10); two records in one minute read identically (authorship 11); the "+N" count is 9 px (`VersionsPanel.css` 313 to 317, authorship 15); `Up to ${40}` is hard coded (`VersionsPanel.tsx` 447, authorship 17); `dayLabel` exists twice (authorship 18); the window row's `aria-label` sits on a `span` (379, authorship 19).

25. Change history, the Inspector list and the deck cards do not use the author rule. `HistoryPanel.tsx` 58 and `VersionsPanel.tsx` 602 print `authorName` (`dispatch.ts` 23 to 25) with no chip and no "You"; `decks.index.tsx` 1250 to 1259 reads `updatedBy`, which no listing writes (`templates.ts` 1055 to 1065; `decks.ts` 64 to 68). Merges authorship 13 and 14, the identity gap on "Edited by".

26. Deletion leaves two readings of one person. `onUserDeleted` (`identity.ts` 392 to 398) removes the record and every alias, so a `usr_` record reads "Deleted account" and an aliased `anon_` record reads its label again. Identity 12.

27. The link visitor's role initial reuses the person's plate. `rosterEntryForReader` (`room.ts` 2137 to 2143) keeps the verified person's density, glyph seed and hue and swaps the initials only, so a visitor who later gains a grant can pair the two. Identity 14.

28. "by link" is unreachable. `rosterRoleWord` answers it for `role === 'link'` (`presence-model.ts` 103 to 106); the server's role is one of four (`protocol.ts` 273; `room.ts` 2097). Presence 9.

29. Following stops on two of seven triggers, and the caret never dims. `stopFollowing` (`controller.tsx` 1555 to 1557) has one caller (2365) and does not clear the room's `follow`; `participantOf` sets `lastSeenAt: now` at mapping time (`controller.tsx` 339 to 340), so the 30 s dim rule cannot fire. Presence 7 and 8.

30. The outline density chip is blurred, the halo follows the slide kind only, the announcer runs every render, two tabs of one person are two chips, the following ring is 1 px against SPEC-3 4.4's 2 px, and the slot's tooltip nests the chips' tooltips. `Sidebar.css` 703 to 711; `CollabLayer.tsx` 46; `EditorShell.tsx` 2394 with `Announcer.tsx` 27 to 30; `client-ids.ts` 93 to 111; `presence.css` 159 to 162; `PresenceSlot.tsx` 83. Presence 12 to 15, 17, 18; parity 14.

31. On the blob tier the roster is per instance. `docs/FOCUS.md` 663 records `collab.presence-chips` broken at severity 1; chips of closed tabs stay. Presence 16.

32. The dark theme's chip edge reads as the light value. In `drive/A-slot-dark.png` the other chips' border is mid grey while the own chip and the opener read white; the builder's dark cell overrides `--pt-edge` to `rgba(242, 242, 240, 0.55)` (`accounts.css` 239 to 245). Production 8.

33. Sessions and the Profile dialog are offered to anonymous people (`menus/model.ts` 896 to 899; `actions.ts` 223), the sign in dialog does not read the mail mode (`write.ts` 400; `EditorRoot.tsx` 805 to 853), the home copy and the access page name a sign in production does not have (`copy.ts` 697; `-access-page.tsx` 75 to 86), and the user row's `image` column is never read (`identity.ts` 319 to 323). Accounts 8 to 11.

34. Delete account is not wired and the mirror in `localStorage` does not exist. `Profile.tsx` 233 to 252 disables the button unless `account.deleteAccount` exists; no `account.delete` action id exists; `removePictureFiles` (`avatar.ts` 328) has no caller. SPEC-3 0.17 describes a `localStorage` mirror of name and avatar that no file implements. Avatars 10 and 18.

35. Unknown id formats render as guests. `resolve.ts` 146 to 158 renders a legacy author name as a person with the guest word and a mark hashed from the name. Identity 16.

36. The tests do not read people. `presence.spec.ts` asserts no `data-variant`, `data-trust`, `data-hue` or stripe; `accounts.spec.ts` 384 to 387 skips when the own chip is absent and never opens the builder; `versions-by-author.spec.ts` asserts no author word, no count and no mark position; `share.spec.ts` 1314 to 1320 would pass with an owner reading as a label; `actions.test.ts` 223 asserts `avatar.url` and never a drawn picture. Merges avatars 17, accounts 12, parity 15, authorship 20.

## 3. Gaps against the parity target

The target is `audit-parity.md` section "The target for Turboslide": Google's collaborator surfaces with a monochrome mark, a hue on live surfaces only, and four kinds of person (an account with a picture, an account without one, a guest, a label).

| Target row                                                                                                           | State                                                                             | Defects       |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- |
| The account picture on the chip, the roster, the flag, the comment, the version row, the Share row, the account menu | Missing on every surface                                                          | 12            |
| A verified mark and word after an account's name                                                                     | Missing                                                                           | 7             |
| Name and email on hover for a named collaborator the reader may see                                                  | Name only; the email never leaves the server for another person                   | 7             |
| Share row: picture, name, email under it, role                                                                       | Label, hidden email, role                                                         | 10            |
| Version row: the account's name and mark, "(2)" on colliding labels                                                  | Guest word, a hashed plate, no suffix                                             | 8, 18         |
| Comment by a guest who left: the name and "guest"                                                                    | The name alone                                                                    | 9             |
| The own chip changes with the name and the avatar, and is one object with the roster's own row                       | Stale until reload; two sources                                                   | 11            |
| The own chip present by default                                                                                      | Parked                                                                            | 14            |
| One renderer for the mark                                                                                            | Two, disagreeing for three variants                                               | 5             |
| One `.ts-chip`                                                                                                       | Two rules; the cascade decides                                                    | 3             |
| The plate inside a 1 px `--pt-edge` border                                                                           | Drawn; the field runs into it                                                     | 4             |
| Old records render as the account after sign in (SPEC-3 2.4, 7.4)                                                    | Built in the package; reaches no deck surface                                     | 6             |
| The mark's column in the version panel                                                                               | Fixed here for the window row; the nested rule and the strip remain               | 1, 2          |
| A coloured caret and flag                                                                                            | Present; ink for slot 1, one hue off otherwise                                    | 15            |
| A pointer with a floating name                                                                                       | Drawn only from simulated data                                                    | 17            |
| Two labels in one deck told apart                                                                                    | Not told apart                                                                    | 18            |
| Per deck name uniqueness against the owner, the roster and the log                                                   | The log only                                                                      | 20            |
| The picture's limits: client resize, a 512 KB request cap, one sentence in the dialog                                | Server sanitising and the digest path exist; the resize and the cap are missing   | 12            |
| "Edited by <name>" on /decks, the owner in the trash                                                                 | No producer                                                                       | 25            |
| Sign in that names a person and owns their decks (`docs/PRODUCT.md` section 9)                                       | Built and switched off: no database, no mail, no provider variables on production | accounts gaps |
| Anonymous label: a material word and a number, never an animal                                                       | Present                                                                           |               |
| The guest word on a typed name                                                                                       | Present on the roster, the card of a present author, the flag when it fits        |               |
| The hue on live surfaces only                                                                                        | Present                                                                           |               |
| The role word for a link visitor in place of an account's name                                                       | Present; the plate should be the role's                                           | 27            |
| Follow refused for anonymous people and for viewers                                                                  | Present                                                                           |               |
| Organisations, groups, domain modes                                                                                  | Out of scope in SPEC-3 1247; no document plans an organisation mark               |               |

## 4. Three design options

The brief: account distinguishing and avatars limited by file size. The core matrix rows below follow the row shape of `docs/gslides-parity/focus/core-matrix.json` (`id`, `feature`, `interaction`, `driver`, `today`, `evidence`). A lane is one builder for one build round, as the previous rounds counted them.

Every option shares one prerequisite. Until the room's identity path reads the session (defect 6) no account is visible on any deck surface, and until production has `DATABASE_URL`, a mail path and `REDIS_URL` nothing built here changes for a seller on production. Options A to C can be built and verified on a preview with `TURBOSLIDE_AUTH_DB` and `TURBOSLIDE_MAIL=capture` (the `accounts.spec.ts` setup).

### Option A, the smallest change: marks and names only, an account label

What a reader gets. An account is told from a guest by a 14 px `check-badge` after the name in `--pt-ink-2`, one word in the accessible name ("signed in"), and the tooltip "Signed in as <email>" for a grant holder. Two labels in one deck get the "(2)" suffix. The own chip reads what others see. No picture anywhere.

Files touched.

- `apps/studio/src/server/room.ts` 309 to 377 and 398 to 407: read the better-auth session before the cookie when `identityRuntime().auth !== null`; pass the runtime's alias and account lookups to `resolvePrincipal`; add `email` to the roster entry under the same rule `rosterEntryForReader` applies (2127 to 2143); swap the plate, not only the initials, for a link visitor (defect 27).
- `packages/realtime/src/channel.ts` 150 to 160: `email?` on `RosterIdentity`.
- `packages/identity/src/resolve.ts` 124: the display name of an account without a typed name is its label, not its email.
- `apps/studio/src/server/write.ts` 380 to 389 and 459 to 535: the own identity and a resolved `identities` map (version authors, comment authors, the access record's owner and grants) on the editor payload and on the draft payload.
- `apps/studio/src/editor/controller.tsx` 287 to 299, 542 to 580, 1909 to 1910: the own view carries the server's `mark`; `identityIndex` calls `disambiguateLabels`; the presence handler replaces the row in place.
- `apps/studio/src/editor/EditorRoot.tsx` 801 to 863, 876 to 906: `account.principal` derived from the roster's own entry; `setName` and `setAvatar` write the answer back; the Share principals come resolved.
- `packages/chrome/src/presence/IdentityChip.tsx` 88 to 97: `trustMarkOf` and the word; `RosterMenu.tsx` 161, `comments/CommentCard.tsx` 173, `comments/CommentsPanel.tsx` 195, `VersionsPanel.tsx` 317, `presence/AccountMenu.tsx` 56, `dialogs/Share.tsx` 277 to 285 and 1579: draw the badge, drop `identityOf`, print the email as a line for a sharer or drop the `title`.
- `packages/chrome/src/presence/presence-model.ts` 122 to 129: the tooltip through `trustTooltip`.
- `packages/chrome/src/menus/strings.ts`: the word and the tooltip sentences.
- `apps/studio/src/styles.css` 35 to 46 and `components/DeckViewer.tsx` 219: rename the word chip (defect 3).
- `packages/chrome/src/VersionsPanel.css` 305 to 328: the nested rule and the strip (defect 2), on top of the inset already applied.

Rows to add to the core matrix.

- `people.verified-badge`, feature `share`: a signed in editor's roster row, comment head and version row carry the badge and the accessible word; a guest's carry "guest" and no badge. Driver `core/share.spec.ts`.
- `people.own-chip-follows-name`, feature `share`: after Change name the own chip, the account head and the roster's own row read the new name within 2 s with no reload. Driver `probe --core`.
- `people.versions-author-account`, feature `versions`: a record written by a signed in browser reads the account's name with no guest word after a reload. Driver `core/share.spec.ts`.
- `people.labels-disambiguated`, feature `share`: two seeded principals with one label read "<label>" and "<label> (2)" in the roster and the version list. Driver `core/share.spec.ts` with a `setup` write.
- `people.comment-departed-guest`, feature `comments`: a comment by a guest who closed the tab still reads the name and "guest". Driver `core/share.spec.ts`.
- `versions.window-mark-column`, feature `versions`: a window row's first `.ts-chip` has `left` at least 16 px from the panel's left and level with the standalone rows' marks. Driver `probe --core`.
- `people.chip-plate-size`, feature `share`: every `svg.ts-chip-plate` in a 24 px chip measures 22 px. Driver `probe --core`.

Risks. The shared Blob store: none, no file is written. The CDN cache: none. Privacy: the email travels to a grant holder's tooltip and the Share row, which SPEC-3 4.8 allows and today's `title` already leaks to any sharer; the roster entry must carry it only after the reader's role is known, so the field is added in `rosterEntryForReader`, not in `rosterEntryFor`. The session read on the room routes changes the author id of every write by a signed in browser; old `anon_` records render as the account through the alias, which is the promised behaviour, and `accounts.spec.ts` needs a row that asserts it.

Estimate. Two lanes: one server (the room's identity path, the payload's `identities`, the roster email, the resolver's name rule) and one chrome (the badge, the own chip's single source, the Share rows, the label suffix, the class rename, the version panel column). One verifier lane on a preview with `TURBOSLIDE_AUTH_DB`.

### Option B, account pictures uploaded and resized on the client with a server cap

What a reader gets. Everything in A, plus a picture on every chip for an account that uploaded one: the browser crops a square and resizes it to 256 px WebP, the server caps the request at 512 KB, sniffs, decodes and re-encodes the ladder, and the store serves it from a digest named path. The chip draws 32 px at 1x and 64 px at 2x and falls back to the initials plate when the image fails.

Files touched, beyond A.

- `packages/chrome/src/dialogs/AvatarBuilder.tsx` 147 to 162, 258 to 295: `createImageBitmap(file, { imageOrientation: 'from-image' })`, a dragged square in the 256 by 256 box, `canvas.toBlob('image/webp', 0.8)` at 256 (and 128 if the server is not to derive), the cap sentence, the current choice from `account.avatar`.
- `packages/chrome/src/editor-shell.ts` 525 to 554: `EditorAccount.avatar`, `pictureUrl`, `setAvatar` takes the data URL and a `salt: number`.
- `apps/studio/src/editor/EditorRoot.tsx` 806 to 863: forward the data URL, set `account.avatar` and `pictureUrl` from the payload and the answer, call `controller.refreshPresence()`.
- `packages/schema/src/actions.ts` 5413 to 5433: `picture` bounded to the cap's data URL length; drop `crop` from the server contract if the browser crops.
- `apps/studio/src/server/auth/actions.ts` 293 to 294, 341 to 377: the string length check before `Buffer.from`, `room.forgetIdentity`, the answer's `mark` and `avatar`.
- `apps/studio/src/server/auth/avatar.ts` 30 to 45, 102 to 172, 243 to 264: `AVATAR_MAX_BYTES` 512 KB, `limitInputPixels` 1024 by 1024, a base computed from `TURBOSLIDE_PUBLIC_STORE_HOST` (`server/headers.ts` 154) instead of the per process map, `cacheControlMaxAge` of a year on the put.
- `apps/studio/src/server/actions.ts` 1256: `avatarStore` per tier (`blobAvatarStore(publicClient)` hosted, the file store on a checkout).
- `packages/store/src/migrate.ts` 77 to 82: `u/` is a public path.
- `packages/identity/src/resolve.ts` and `marks.ts` 108 to 111: `pictureUrl` on `ResolvedIdentity` from `pictureUrl(avatar, 64)` so `markSpec` reads it with no per caller argument; `room.ts` 2079 and `auth/actions.ts` 148 then draw it.
- `packages/chrome/src/presence/IdentityChip.tsx` 124, 145 to 146 and `presence.css` 44 to 47: `srcset` for 32 and 64, `decoding="async"`, `onError` that hides the image and shows the plate, the 1 px paper gap of defect 4 so the picture touches neither ring.
- `packages/chrome/src/dialogs/Profile.tsx` 79: the 128 px file in the head.
- `apps/studio/src/server/room.ts` 2137 to 2143: a link visitor without the switch sees the role initial and never the picture.
- `apps/cli/src/commands/account.ts` 46 to 88: read `--picture <file>` into a data URL under the cap; `--avatar-png` through `renderMarkPng1`.
- `apps/studio/src/server/auth/profile.ts` 94 to 116 and `identity.ts` 345 to 352: one source for the choice (read `ts_profile.avatar`, fall back to the record) so the choice survives the record's 90 day TTL.
- `apps/studio/e2e/accounts.spec.ts`: the rows below. `docs/security.md` section 10: the new cap.

Rows to add to the core matrix, beyond A.

- `people.avatar-upload`, feature `share`: signed in, the builder's Picture tab takes a 1200 by 900 JPEG fixture, the own chip's `<img src>` matches `/u\/[A-Za-z0-9_-]{22}\/[0-9a-f]{64}-(32|64)\.webp$/` within 5 s, and a second browser's chip for that person draws the same URL within 10 s.
- `people.avatar-cap-refusal`, feature `share`: a 600 KB WebP data URL answers the cap sentence in the dialog's error row and writes nothing.
- `people.avatar-anonymous-refused`, feature `share`: an anonymous principal's Picture tab shows the sign in sentence and `account.setAvatar` with a picture answers "Sign in to upload a picture".
- `people.avatar-rotation`, feature `share`: a second upload answers a new key and the first URL answers 404 on the checkout route (hosted: the listing under the old key is empty).
- `people.avatar-fallback-plate`, feature `share`: a chip whose picture URL answers 404 draws the initials plate and no empty box.
- `people.avatar-link-visitor`, feature `share`: a link visitor without the owner's switch sees the role initial, not the picture.
- `people.avatar-metadata-stripped`, feature `share`: the served 256 px PNG carries no EXIF (the unit test lifted to the route).

Risks.

- The shared Blob store. Production and every preview write the one public store `turboslide-decks`; the `u/<key>/` prefix is new there. A sweep by date or by name would remove pictures; only removal by key is safe, and every round's cleanup script must skip `u/`. `overwrite: false` and the digest name make a collision impossible, but a failed `put` between the files and the record write (`avatar.ts` 297 to 310) leaves orphan files under a key nothing references; a listing under `u/` with no owning profile needs a janitor.
- The CDN cache. The name carries the digest, so a URL is never rewritten and a year's `max-age` is safe. The cost is deletion: after key rotation or account deletion the edge keeps the old file until its age expires, and the store's purge is not exposed per path. A person who removes a picture must be told the old URL can stay readable for as long as the cache holds it. `base` must be computed, not remembered per instance (avatars 13), or the second instance serves a relative path.
- Privacy of pictures on public decks. A picture on a chip is a public URL with the key and the digest in it; anyone who can open the deck can copy it, and the export paths (PPTX comment authors, SVG export of a chip) would embed it. The URL is unguessable and unlisted, but it is not access controlled, unlike the deck. Link visitors must get the role initial (SPEC-3 0.12); a picture chosen once is shown on every deck the account touches, including decks made public later, and there is no per deck opt out. The dialog should say that in one sentence.
- Two transports with two caps. The 512 KB rule has to hold on `/api/actions` (`dispatch.ts` 21, 96 at 1 MB, fine) and on the server function (4.5 MB, fine), and the client must refuse before encoding.

Estimate. A's two lanes plus two: one client (the builder's crop and resize, the shell types, the editor's write back, the chip's `srcset` and fallback) and one server and store (the cap, the store per tier, the public path, the computed base, the resolver's picture URL, the CLI). Four builder lanes and one verifier lane.

### Option C, B plus Gravatar style pictures from the email hash and organisation badges

What a reader gets. An account that uploaded nothing gets a picture from the hash of its email, when one exists. Accounts whose email domains match get an organisation badge beside the name.

Files touched, beyond B.

- `apps/studio/src/server/auth/avatar.ts`: `fetchHashedAvatar(email)` that computes `sha256(lowercase(email))`, asks the picture service with `d=404` and a size of 256, and runs the bytes through `processAvatar` into the same store under a key, so nothing is hotlinked and the hash never appears in a URL the browser sees.
- `apps/studio/src/server/auth/identity.ts` 373 to 390: on the first session, or on a daily touch, fill the profile's avatar when it is the bare default.
- `apps/studio/src/server/auth/profile.ts` and `schema.ts`: a `source: 'upload' | 'hashed'` on the choice so an upload beats the fetched picture and a person can turn the fetched one off.
- `packages/identity/src/principal.ts` 27 to 43: the `source` on `AvatarChoice`.
- `packages/chrome/src/dialogs/AvatarBuilder.tsx`: a row "Use the picture from your email address" with the source named.
- An organisation: `packages/identity/src/org.ts` (a domain to organisation name table, the free mail domains excluded), a `ts_org` row or a derivation at resolve time, `orgOf(email)` on `ResolvedIdentity`, `IdentityView.org?` in `editor-shell.ts` 246 to 258, a 14 px badge after the verified mark in `RosterMenu.tsx`, `CommentCard.tsx`, `Share.tsx` and the Profile head, and the same reader rule as the email (grant holders only).
- `apps/studio/src/server/headers.ts` 208: no CSP change if the picture is proxied through the store; an `img-src` entry if it is not.
- `docs/security.md`: the outbound fetch, its timeout and size cap, the hash handling.

Rows to add to the core matrix, beyond B.

- `people.hashed-picture-fallback`, feature `share`: a seeded account with a known picture on the service and no upload draws that picture from the store's `u/` path, not from the service's host.
- `people.hashed-picture-404`, feature `share`: an address with no picture draws the initials plate and no request leaves for the chip.
- `people.hashed-picture-opt-out`, feature `share`: the builder's row turns the fetched picture off and the plate returns within 5 s.
- `people.org-badge`, feature `share`: two seeded accounts on one company domain carry the badge on the roster row and the Share row for a grant holder; a free mail domain carries none.
- `people.org-badge-link-visitor`, feature `share`: a link visitor without the switch sees no badge.

Risks.

- The email hash. The service's URLs are `hash of the email`; published rainbow tables map common addresses back from that hash, so the hash must never reach a browser or a log. Proxying through the store closes that, at the cost of an outbound fetch per account (with a timeout, a size cap and the same sniff and re-encode) and a third party's picture cached on the CDN for a year under a key the person did not choose.
- Consent. A person who signed in by email did not choose to show a picture; the fetched picture appears on every deck they touch. Defaulting it on is a decision only Kevin can make; defaulting it off makes the option a row in the builder and little more.
- Organisations. SPEC-3 1247 puts organisations and groups out of this round; no document defines what an organisation is, who names it, or what the badge means to a rep. A domain derived badge misfires on shared domains, contractors and personal addresses, and a company name from a domain is a guess. At 24 px a chip already carries a stripe and a triangle; the badge has to live beside the name, and the roster row is 240 px.
- The Blob store and the CDN as in B, with more files per account and a second writer (the fetch) racing the upload for the same key.

Estimate. B's four lanes plus two: one for the fetched picture (the fetch, the proxy, the source flag, the builder row) and one for the organisation (the model, the resolver, the badge on four surfaces). Six builder lanes and one verifier lane, and a decision on organisations before the lane starts.

## 5. Questions only Kevin can answer

1. Does production get `DATABASE_URL`, `REDIS_URL` and a mail sender (`RESEND_API_KEY`, `TURBOSLIDE_MAIL_FROM`, or GitHub's two variables) in this round? Without them every account row in this note is invisible to a seller and the round is verified on a preview only.
2. Does the own chip return to the default view, or does the account state stay behind Advanced tools with the badge drawn on the other surfaces regardless? A link visitor today has no picture of themselves and no door to the name or the avatar.
3. The word beside the verified badge in the accessible name and the tooltip: "signed in" or "verified".
4. Which channel tells two people with one typed name apart at 14 px: the plate (glyph or dither by default instead of initials on four greys), the label's number as a suffix on text surfaces ("Kevin · 471"), or "(2)" by first appearance.
5. The picture caps: 512 KB on the request and 256 px on the crop as `audit-avatars.md` section 3 names them, or other values. The dialog says the number in one sentence.
6. Whether a picture is shown to link visitors on a deck open to anyone with the link, or the role initial as for names (SPEC-3 0.12), and whether an account can hide its picture per deck.
7. Whether a picture from the email hash is wanted at all, given the hash exposure, the outbound fetch and the consent question, and if so whether it defaults on or off.
8. Whether organisations enter this round with a domain derived badge, or wait for an organisation model that names who belongs to what.
9. In the version panel: Restore into the More menu and on hover so the meta line keeps its column, and the marks strip sized to the authors rather than a fixed 70 px.
10. Whether the initials variant stays the default once the plate is drawn at full size (defect 3), or the glyph variant becomes the default and initials are drawn on plain paper.
11. Whether `/decks` gets "Edited by <name>" and the trash gets who trashed a deck in this round (`docs/PRODUCT.md` section 2 rank 4 puts them in the round after).
