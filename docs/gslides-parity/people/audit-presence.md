# Audit: presence

Read on branch `people/round` at `origin/main`, 2026-09-29. Line numbers are of the files at that commit. The target is Google Slides as the research pages record it (research-3/01 section 2 lines 38 to 58 and section 9 lines 170 to 187; research/10 A1, A2, A9): avatar circles at the top right with the account picture or initials and a name tooltip, an overflow circle with a count, anonymous people as animals, a caret in the person's colour with a name flag, a pointer in the colour with a floating name, a Following badge on the followed avatar, and the account avatar at the far right.

## What exists

### The identity chip

`packages/chrome/src/presence/IdentityChip.tsx` draws every collaborator mark. One `span.ts-chip` per principal at 24, 16 or 14 px (`size` prop, line 106), `role="img"` with `aria-label` from the server's `mark.label` or `chipName` (line 143; `chipName` at 93 to 97 gives "Maya, guest"; the server's `accessibleName` in `packages/identity/src/marks.ts` 77 to 87 gives "Agent, run-12" for an agent).

- Box: square, `box-sizing: border-box`, `border: 1px solid var(--pt-edge)`, `background: var(--pt-paper)`, no radius, `overflow: visible` (`presence.css` 12 to 24). `--pt-edge` is `rgba(7, 7, 7, 0.62)` in light and `rgba(242, 242, 240, 0.55)` in dark (`packages/chrome/src/tokens.css` 51, 162). The own chip swaps the border for `--pt-ink` (`presence.css` 26 to 28, `is-self`). An agent's border is dashed (30 to 32).
- Plate: `plateOf(size) = size - 2` (`mark-svg.ts` 29 to 31), so 22, 14 or 12 px. The plate is an inline `<svg>` of that width and height with `viewBox 0 0 plate plate` and `shapeRendering="crispEdges"` (`IdentityChip.tsx` 148 to 155), one `<rect>` per lit cell (156 to 158), fill `--pt-ink` (`presence.css` 39 to 42). The plate fills the interior exactly; there is no padding between the border and the first cell.
- Initials variant: a Bayer field at density d/8 with 2 px cells (`mark-svg.ts` 39 to 58; d from two hash bits, `marks.ts` 66 to 74), then the initials as an SVG `<text>` at 11, 8 or 7 px (`initialsFontSize`, `mark-svg.ts` 34 to 36), Inter 500 with `cv11 ss01`, painted with a 2 px paper stroke under the fill (`presence.css` 49 to 57). Initials come from `initialsFor` (`marks.ts` 53 to 63): the first letter of the first two words, the first two letters of a one word name, and one letter alone for a generated label.
- Glyph variant: a 5 by 5 grid of 4 px cells inside the 22 px plate at 24 px, five glyphs mirrored left to right from the seed; 2 px squares at 16 and 14 (`mark-svg.ts` 60 to 123).
- Dither variant: a Bayer screened ramp from the seed's centre, angle and curve (126 to 155).
- Agent variant: a half density Bayer field with a centred solid square of `max(4, round(plate / 3))`, that is 7 px at 24, 5 at 16, 4 at 14 (158 to 166).
- Picture variant: an `<img class="ts-chip-picture">` of `plate` by `plate` with `object-fit: cover` (`IdentityChip.tsx` 145 to 146; `presence.css` 44 to 47). It draws only when `spec.variant === 'picture'` and a URL is present (line 124).
- Live stripe: `i.ts-chip-stripe`, 2 px tall at the plate's bottom, `background: var(--ts-hue)` (`presence.css` 60 to 68), drawn when `live` and the mark has a hue (`IdentityChip.tsx` 173).
- Presenter badge: `i.ts-chip-presenter`, a 6 by 6 right pointing triangle in ink at the bottom right, inset 1 px, with a 1 px paper outline (`presence.css` 71 to 82; `IdentityChip.tsx` 174).
- Halo over a picture slide: `has-halo` adds `box-shadow 0 0 0 1px #070707, 0 0 0 2px #ffffff` (`presence.css` 85 to 92).
- The mark itself: `markOf` (`IdentityChip.tsx` 58 to 76) uses the view's `mark` when the server sent one, else computes one with `markSpec(resolvedOf(identity))`, and `resolvedOf` hard codes `avatar: { variant: 'initials' }` (line 51). The hue comes from `hueSlot` when `isHueSlot` accepts it, else from `identity.mark.hue` (62, 68).
- Colours: the six hues are `#2f5ce0 #789000 #0f6a6a #1d8fc8 #148d51 #5533ff` for slots 1 to 6 (`packages/identity/src/hues.ts` 22 to 29); `isHueSlot` accepts 1 to 6 only (38 to 40). The room grants the slot: the preferred slot is `sha256(principalId)[0] mod 6 + 1` (49 to 52), the least used slot otherwise (59 to 73). `grantHueSlot` in `apps/studio/src/server/room.ts` 2055 to 2061 returns the slot an existing row of the same principal holds, so two tabs of one person share a hue.

### The title row slot

`packages/chrome/src/TitleRow.tsx` 505 mounts `<PresenceSlot />` first in `.ts-title-r` (a flex row, 8 px gap, `TitleRow.css` 29 to 34). `PresenceSlot.tsx`:

- The group `div.ts-presence` is a 184 by 32 grid with the tracks `24 4 24 4 24 4 24 4 32 8 1 7 24` (`presence.css` 95 to 128; `packages/render/src/collab.ts` 47 to 55), `role="group"`, `aria-label="Collaborators"`, `data-count`, and its own tooltip "Collaborators" with "Who is in this presentation now. Nobody else has it open" or "N other people have it open" (`PresenceSlot.tsx` 30 to 38, 75 to 84).
- Four 24 px slots (85 to 124): `slotChips` takes `others.slice(0, 4)` in roster order (`presence-model.ts` 43 to 49). An empty slot is a `span.is-empty` at opacity 0 (`presence.css` 153 to 156). A filled slot is a `button.ts-presence-chip` holding `<IdentityChip size={24} hueSlot={participant.hue} live presenter={presenting} />` (115 to 121). Its tooltip is `chipTipOf`: "Maya · guest · slide 12" (`presence-model.ts` 123 to 129; `strings.ts` 99 to 102), with the doc "Click to follow; click again to stop", "Go to slide 12" or "This person has no slide open" (104 to 113). While followed the name reads "Following Maya" and the chip gains a 1 px hue outline at 1 px offset (`presence.css` 159 to 162). A click follows when `canFollow` holds, else jumps once (`goTo`, 63 to 73, 103).
- `canFollow` (`presence-model.ts` 112 to 120): the `follow` capability, `kind === 'account'`, role owner or editor, a slide open. `kind` is derived on the client from the principal id prefix `usr_` (`apps/studio/src/editor/controller.tsx` 305 to 309).
- The opener `button.ts-presence-more`, 32 by 24 with a `--pt-edge` border (`presence.css` 172 to 178): nothing drawn and no pointer events while nobody else is present (`is-empty`, 184 to 187), a 14 px `user-group` glyph while one to four others are present, "+N" in 12 px tabular figures inside a 23 px left aligned box from the fifth (`PresenceSlot.tsx` 130 to 150; `presence.css` 197 to 200). Its tooltip is "Collaborators". It opens the roster.
- The hair rule (1 by 24, `--pt-hair`) and the own chip `button.ts-presence-me` (24 px, `IdentityChip size={24} self`, tooltip "<name> (you)") are drawn only while `isPresent(itemById('title.account'))` holds (154 to 182). `title.account` is `parked` in `packages/chrome/src/menus/model.ts` 867 to 870, and `isPresent` (3431 to 3434) returns false for a parked or `advanced` item unless `settings.advancedTools` is true (3417 to 3419). The own chip's identity is `input.account.principal` when the route passed an account, else `presence.self` (42 to 48). A blank 24 px `is-blank` box stands in when there is no identity (175 to 177).

### The roster menu

`RosterMenu.tsx` inside `PlateMenu.tsx`: a fixed 240 px plate (`PlateMenu.tsx` 48; `presence.css` 216 to 230) placed below the anchor, `role="menu"` with `aria-label="Collaborators"` and `id="ts-menu-roster"` (81 to 84), rows in a 320 px scroll region, so ten 32 px rows (`presence.css` 233 to 238). Shift+Tab from any open menu opens or focuses it (`roster-hook.ts` 9 to 35).

- Rows (`RosterMenu.tsx` 71 to 75): the own row first when `title.presence.me` is present (advanced only, `model.ts` 795 to 800), then `presence.others` in roster order.
- A row (128 to 185): grid `24px 1fr auto` (`presence.css` 240 to 258), the 24 px chip with `live`, `self` and `presenter` (149 to 156), the name (`displayNameFor` for others, the own name for self) plus " (you)" for self and " · guest" in 11 px `--pt-ink-2` for a typed name (157 to 162), the meta line in 11 px `--pt-ink-2`: the role word ("owner", "editor", "commenter", "viewer" or "by link", `rosterRoleWord`, `presence-model.ts` 103 to 106) then " · slide 12" or " · Presenting slide 12" (163 to 170), and the action word in 12 px: "Follow" or "Stop" (drawn only while `title.presence.follow` is present, advanced only) or "Go to slide 12" (172 to 183). Tooltips: "<name> (you)", "Follow", or "Go to slide 12" (113 to 127). Click or Enter follows, jumps, or opens the account menu (139 to 146).
- The footer "Join chat" is a disabled Later stub, present only under Advanced tools (85 to 102; `model.ts` 794).

### The account menu

`AccountMenu.tsx`: a header with the 24 px self chip, the name and "Signed in as kevin@…" or "Not signed in" (38 to 42, 52 to 60; `strings.ts` 204 to 205), then the rows of `title.account`: Change name, Change avatar, Sign in or Sign out, Forget this browser, Sessions (`model.ts` 871 to 899).

### Names, trust words and "You"

- `displayNameFor` (`presence-model.ts` 87 to 95): an agent is "Agent · <runId>" (`strings.ts` 321); a verified account seen by a link visitor without the owner's "Show names" switch is "An editor", "A commenter" or "A viewer" (70 to 80; `strings.ts` 107 to 109); everyone else is `name ?? label`.
- The server applies the same rule before the stream: `rosterEntryForReader` (`room.ts` 2129 to 2145) rewrites a verified entry's `label` to "The owner", "An editor", "A commenter" or "A viewer" (2101 to 2112), sets `trust: 'label'` and replaces the mark's initials with the role word's last initial ("E", "C", "V", "O").
- "You": the own chip tooltip "<name> (you)" (`PresenceSlot.tsx` 168 to 171) and the roster's own row "<name> (you)" (`RosterMenu.tsx` 115, 160); `PRESENCE.you` is "(you)" (`strings.ts` 103). Both surfaces are behind Advanced tools.
- An anonymous viewer: the principal record gives a label `<Material> <NNN>` from 64 material words and a number 100 to 999 (`packages/identity/src/labels.ts` 1 to 12), for instance "Titanium 471". `participantOf` (`controller.tsx` 300 to 342) copies `label`, sets `name` only for `guest` and `verified` (302 to 304), `kind: 'anonymous'` (305 to 309). The chip shows one letter ("T") on a Bayer plate, the tooltip reads "Titanium 471 · slide 3", the roster row "Titanium 471" over "viewer · slide 3", and the action is "Go to slide 3" because `kind !== 'account'` refuses Follow. A typed name without an account shows the name, "guest" beside it, and is also refused Follow.

### Cursors, selections and pointers

`packages/chrome/src/CollabLayer.tsx` 68 to 76 mounts `RemoteCursors` inside the overlay (`Overlay.tsx` 740) when the editor shell is present and not in present mode. `RemoteCursors.tsx`:

- Only participants whose `slideId` is the overlay's slide are drawn (95).
- Caret: `span.ts-remote-caret`, 2 px wide, at least 8 px tall, `background: var(--ts-hue, var(--pt-ink))`, measured by `remoteCaretBox` from the run element and a collapsed Range (`remote-caret.ts` 61 to 98), `is-dim` at opacity 0.5 (219 to 233; `presence.css` 464 to 474).
- Flag (`Flag`, 61 to 83): `span.ts-flag`, 120 by 18, ink plate, paper text 13 px 500, 1 px paper border, padding 0 6 px, a 14 px chip with a paper border on ink (`presence.css` 411 to 450), then `flagText`: the first word of the name plus " · guest" when the total fits 13 characters (`presence-model.ts` 135 to 140). `role="img"` with the name and trust word. The caret's flag sits above the caret, below it within 24 px of the sheet top, stacks 20 px up when two overlap (151 to 161; `stackFlags` 173 to 196), and fades 3 s after the caret last moved (144; `FLAG_FADE_MS`).
- Selection outline: `span.ts-remote-outline`, 1 px solid in the first holder's hue at the block box (168 to 194; `presence.css` 452 to 457), dashed ink for an agent (459 to 462), skipped when the own selection holds the block (179). At most two flags at the top right then a "+N" flag (195 to 215).
- Pointer: a 12 by 16 SVG polygon with three strokes (3 px white, 1.5 px `#070707`, then the hue fill) moved by `translate3d` over 80 ms, the flag at (14, 16) from the tip (245 to 284; `presence.css` 476 to 506; `collab.ts` 32 to 41). Drawn only while `pointersDrawn` holds: `pointersVisible`, not present mode, participants at or under the cap of 20 (`presence-model.ts` 159 to 167). Agents get no pointer (247).
- Halo: hued elements add `has-halo` only when the slide kind is opener, mood or closing (`CollabLayer.tsx` 46).

### Following

`FollowingPlate.tsx` 22 to 48: a 240 by 24 ink plate at the stage's top centre, 8 px down, with a 14 px chip, "Following Maya", a middle dot and an underlined Stop button (`presence.css` 353 to 408); mounted by `EditorShell.tsx` 2314 to 2322 when `presence.following` names a participant (1840 to 1843). `followClient` (`controller.tsx` 4428 to 4434) publishes `following`, posts `follow` to the room and selects the target's slide; a later `presence` event of the followed client selects their slide (1908 to 1921); `leave` clears it (1922 to 1925); `stopFollowing` runs on the tab's own commit (1555 to 1557, 2365).

### Filmstrip

`FilmstripMarks.tsx` 21 to 57 inside `span.ts-card-frame` (`Filmstrip.tsx` 324 to 338): a 70 by 16 row reverse box at top 4 right 4 (`Filmstrip.css` 219 to 232), up to three 16 px chips with the stripe, the presenter badge and the halo on picture slides, then a 16 px "+N" chip in 9 px tabular figures (234 to 245). `OutlineMarks` (60 to 84) draws one 14 px chip forced to 12 px by `.ts-chip-12` (`Sidebar.css` 703 to 711) and a "+N" numeral in 9 px `--pt-ink-2` (713 to 717). `aria-label` lists the names.

### Announcements

`Announcer.tsx` 23 to 42: a visually hidden `aria-live="polite"` region, on only under Tools > Accessibility settings (`EditorShell.tsx` 2390 to 2395), speaking "Maya joined", "Maya left", "Kai is editing slide 4" coalesced to one sentence per person per 5 s (`presence-model.ts` 207 to 255; `strings.ts` 115 to 117).

### The room and the wire

- `PresencePost` (`packages/realtime/src/protocol.ts` 240 to 257): `clientId`, `clock`, `slideId`, `selection { blockIds (64 max), caret }`, `pointer { x, y }` in sheet units 1600 by 900, `follow`, `pointerOn`, `presenting`; at most 2048 bytes, 15 states a second (54 to 68). The roster entry adds the server's `principalId`, `label`, `trust`, `mark`, `hueSlot` 0 to 5, `kind human | agent`, `role` (277 to 292).
- `rosterEntryFor` (`room.ts` 2068 to 2098): the identity from the session, `label: resolved.displayName`, `mark: markSpec(resolved, { hueSlot: slot })` with no `pictureUrl` (2079), `hueSlot: slot - 1` (2094), the pointer kept only for an owner or editor within the first 20 by join order and only with `pointerOn` (2081 to 2088).
- Cadence (`packages/realtime/client/room-client.ts` 19 to 21, 221, 1671 to 1687, 1823 to 1835): a state change posts after an 80 ms batch; the heartbeat is 5 s while the pointer, selection or slide moved in the last 30 s and 10 s otherwise; an entry expires after 120 s (`PRESENCE_EXPIRY_MS`).
- The client mapping: `participantOf` (`controller.tsx` 300 to 342) and `partitionRoster` (`apps/studio/src/editor/client-ids.ts` 99 to 111) split the roster into `self` and `others`; `EditorRoot.tsx` 753 to 779 builds `EditorPresence` with `cap: 20`, `pointersVisible`, `pointerMine`, `following`, `showNames` and the callbacks. `reportPresence` (735 to 750) sends `slideId`, `selection` and `presenting`.

## Defects

1. Chips move between slots on every presence update. `controller.tsx` 1909 to 1910 handles a `presence` event with `const rest = latest().roster.filter((row) => row.clientId !== event.clientId); publish({ roster: [...rest, event.state] })`, so the updated client moves to the end of the roster. `EditorRoot.tsx` 753 to 756 maps the roster in that order and `slotChips` (`presence-model.ts` 43 to 49) takes the first four. With five or more others, a caret move by anyone can swap a chip out of the four slots and into "+N"; with two to four others the chips swap positions. SPEC-3 4.2 (line 346) and research 11 6.2 (line 285) call for join order that never reorders.

2. The hue slot is off by one on the client. The server writes `hueSlot: slot - 1` (`room.ts` 2094; the schema takes 0 to 5, `protocol.ts` 282), `participantOf` passes it through as `hue: entry.hueSlot` (`controller.tsx` 318), and the chrome reads it with `isHueSlot`, which accepts 1 to 6 (`hues.ts` 38 to 40; `IdentityChip.tsx` 62, 100 to 102; `RemoteCursors.tsx` 62, 171, 220, 248). A person granted slot 1 (the brand blue, the most common preferred slot) arrives as 0, `hueHexOf` answers null, and their caret, outline, pointer and flag chip draw in ink through `var(--ts-hue, var(--pt-ink))`; their chip stripe falls back to `mark.hue` and is blue. A person granted slot 2 to 6 draws in the hue one below the grant, while `mark.hue` on the same entry and `presence.list` carry the granted hue, so the CLI and the chrome disagree.

3. The pointer position is never published. `reportPresence` in `EditorRoot.tsx` 735 to 750 sends `slideId`, `selection` and `presenting`; `setPointerOn` (`controller.tsx` 4443 to 4448) sends `pointerOn` alone; no file in `apps/studio/src` or `packages/viewer/src` writes `pointer: { x, y }` into a presence state (`Editor.tsx` 5658 to 5665 reads the pointer for the ruler only). The View > Live pointers rows and the toolbar toggle flip `pointerOn` and draw nothing for anyone. The only live pointers ever drawn are the e2e's simulated POSTs (`apps/studio/e2e/presence.spec.ts` 487).

4. Picture avatars are never drawn. Four seams each drop the picture: `rosterEntryFor` calls `markSpec(resolved, { hueSlot: slot })` without `pictureUrl` (`room.ts` 2079), and `markSpec` falls to initials unless `options.pictureUrl` is set (`marks.ts` 109); the route's `EditorIdentity` carries no mark, avatar or picture (`apps/studio/src/server/write.ts` 88 to 95) and `identityView` copies it (`controller.tsx` 286 to 298); `EditorAccount.pictureUrl` (`editor-shell.ts` 554) is never set by `EditorRoot.tsx` (806 to 830), so `Profile.tsx` 79 and `AvatarBuilder.tsx` 134, 215 read undefined; and `setAvatar` forwards `variant`, `initials` and `salt` only (`EditorRoot.tsx` 823 to 828) while the builder puts the file in `choice.picture` (`AvatarBuilder.tsx` 177), so the server throws `picture is required for the picture variant` (`apps/studio/src/server/auth/actions.ts` 352) and the dialog shows that sentence. `identityViewFor`, the one helper that accepts a `pictureUrl` (`apps/studio/src/server/auth/identity.ts` 695 to 720), is called only by `account.me` (`actions.ts` 148).

5. The own chip ignores the avatar choice. `selfIdentity` prefers `input.account.principal` (`PresenceSlot.tsx` 42 to 48, 178), which has no `mark` (defect 4), so `markOf` computes one with `avatar: { variant: 'initials' }` (`IdentityChip.tsx` 51, 71). A person who chose Glyph or Dither sees initials on their own chip while every other tab draws the server's glyph or dither mark (`room.ts` 2079). The same mismatch applies to the account menu header (`AccountMenu.tsx` 54) and the Profile dialog.

6. "You" and the account entry are absent in the default view. The own chip and the hair rule draw only while `title.account` is present (`PresenceSlot.tsx` 154 to 182), `title.account` is `parked` (`model.ts` 867 to 870), `title.presence.me` and `title.presence.follow` carry `advanced: true` (795 to 800, 778 to 783), and `isPresent` hides all three with Advanced tools off (3431 to 3434). A seller sees four chips and a people glyph, no own chip, no "(you)" row, no Follow word, and no way from the title row to the name, avatar or sign in rows. The parity audit records the `title.presence.me` rows as failing on the preview for the per instance roster as well (VERIFICATION-4.md line 60).

7. Following stops on two of Google's seven triggers. `stopFollowing` (`controller.tsx` 1555 to 1557) has one caller, the tab's own commit (2365); `leave` clears it when the followed client leaves (1922 to 1925). A click on another slide, a comment, Slideshow and Version history do not stop it (SPEC-3 4.4 line 371; research/10 A1 line 20). `stopFollowing` also publishes `following: null` without `room.setPresence({ follow: undefined })`, unlike `unfollow` (4435 to 4438), so the roster keeps the stale `follow` for others.

8. The caret never dims. `participantOf` sets `lastSeenAt: now` at mapping time and `idle: false` (`controller.tsx` 339 to 340); the wire carries `clock` and no last seen time (`protocol.ts` 240 to 257). `RemoteCursors.tsx` 139 to 145 computes `now - lastSeen` from that mapping time, so the 30 s `CARET_DIM_MS` rule (`presence-model.ts` 31) cannot fire.

9. "by link" is unreachable. `rosterRoleWord` answers "by link" for `role === 'link'` (`presence-model.ts` 103 to 106), but the server's role is one of four (`protocol.ts` 273; `room.ts` 2097) and `rosterEntryForReader` keeps it (2129 to 2145). A person admitted by an editor link reads "editor" in the roster, the same as an invited editor.

10. The chrome's mark and the package's mark disagree for agents. `IdentityChip.tsx` 8 to 11 says the chrome's `mark-svg.ts` stands in until `renderMarkSvg` lands; it landed (`marks-render.ts` 302 to 360) and the chip still uses the copy. The copies differ: the chrome's agent field lights cells where `bayer8 < 32` (`mark-svg.ts` 158 to 160 through `bayerCells(size, 4)`, 47) while the package lights `bayer8 >= 32` (`marks-render.ts` 190 to 193), so the two fields are complements; the chrome's square is 7 px at 24 (`mark-svg.ts` 161) where the package and research 11 3.3 say 8 (`marks-render.ts` 195). The CLI's PNG and the chip differ for every agent. The agent border is dashed in `--pt-edge` (`presence.css` 30 to 32) where research 11 3.3 (line 182) asks for `--pt-ink-2` with a 2 px dash.

11. The plate touches the border. The plate is `size - 2` (`mark-svg.ts` 29 to 31), the SVG and the picture are drawn at that size (`IdentityChip.tsx` 116, 146, 150 to 152) and `.ts-chip` has no padding (`presence.css` 12 to 24), so the first Bayer cell, the first glyph column and a picture's edge sit against the inner edge of the 1 px border. With `--pt-edge` at 62 percent alpha on light paper the border and an edge cell read as one shape, and the 3/8 and 4/8 fields at 16 and 14 px read as a solid ring around the letters. Research 11 6.1 (line 269) defines the plate as the chip less the border, so this is the drawing as specified; it is listed here because it is what Kevin's note names.

12. The outline density chip is blurred. `OutlineMarks` asks for a 14 px chip (`FilmstripMarks.tsx` 72 to 78) and `.ts-chip-12` forces the box to 12 px and the SVG to 10 px (`Sidebar.css` 703 to 711) while the SVG keeps `viewBox 0 0 12 12`, so 2 px cells scale to 1.67 px under `crispEdges`. The retired lease dot's rule `.pt-orow-lease` remains in `Sidebar.css` 358 to 362 with no element using it.

13. The halo does not follow picture blocks. `CollabLayer.tsx` 46 sets `halo` by slide kind (opener, mood, closing) only; research 11 6.7 (line 323) asks for it over a picture block with a dither under it on any slide.

14. The announcer effect runs every render. `EditorShell.tsx` 2394 passes `viewerFactsOf(...)`, a fresh object each render, and `Announcer.tsx` 27 to 30 lists it in the effect's dependencies, so `model.update` runs on every shell render. The 5 s coalescing hides it from the user; it is wasted work and a trap for anyone lowering the window.

15. Two tabs of one person are two chips. `partitionRoster` keeps a same principal row under another client id in `others` (`client-ids.ts` 93 to 111), and `grantHueSlot` gives it the same hue (`room.ts` 2056 to 2058). A person who opens a deck twice fills two of the four slots with the same mark. Whether Google collapses them is unverified (research-3/01 Unverified).

16. On the blob tier the roster is per instance. `docs/FOCUS.md` line 663 records `collab.presence-chips` as broken at severity 1 on production: chips of closed tabs stay, and a third browser showed four chips for two tabs. VERIFICATION-4.md line 60 records the `title.presence.me` rows failing on the preview for the same cause. The drawing is right and the data under it is not.

17. The following ring is 1 px. `presence.css` 159 to 162 draws `outline: 1px solid var(--ts-hue)` at 1 px offset and its comment says "a 2 px ring"; SPEC-3 4.4 (line 371) says "a 2 px hue border" and research 11 6.3 (line 295) says 1 px at 1 px offset. The file's own comment and SPEC disagree with what is drawn.

18. The slot's tooltip and the chip's tooltip nest. The group carries `tipProps` (`PresenceSlot.tsx` 83) and every chip and the opener carry their own (104 to 113, 141); `docs/FOCUS.md` line 951 records `chrome.presence.tooltip` as broken at severity 1.

## Gaps against the target

- Account picture: Google draws the account's picture in the circle; Turboslide never draws a picture anywhere in the room (defect 4).
- Account avatar at the far right: Google shows it always; Turboslide's own chip is behind Advanced tools (defect 6).
- Circles: Google's avatars are circles with a coloured ring; Turboslide's are squares with a 1 px edge border and a 2 px hue stripe at the bottom. The square is the theme's rule (research 11 section 6, line 265: every box is square). The colour appears on the stripe alone, not around the mark.
- Name tooltip: Google shows the full name on hover; Turboslide shows "Maya · guest · slide 12" (`chipTipOf`). Matches, with more facts.
- Anonymous people: Google shows "Anonymous Badger"; Turboslide shows "Titanium 471" with a one letter initial. A deliberate departure (labels.ts 9 to 11): no animals by rule.
- Coloured caret with a name flag: present, but drawn in ink for slot 1 and one hue off for the rest (defect 2).
- Pointer with a floating name: drawn only from simulated data; a real tab never publishes a pointer (defect 3).
- Following badge beneath the avatar: Turboslide draws a 1 px ring on the chip and a plate over the stage. The word "Following" is not on the chip itself; it is in the tooltip and the plate.
- Overflow circle with a count: present as a 32 by 24 "+N" box from the fifth person; a people glyph from the first.
- Row shown only while others are present: the slot is reserved at 184 px from the first paint and stays empty (SPEC-3 4.2). By rule, not a gap.
- Follow refusals: Google refuses anonymous people and those without edit permission; Turboslide refuses the same. `kind` is derived on the client from the `usr_` prefix (`controller.tsx` 305 to 309), which `packages/identity/src/ids.ts` 14 defines as the account prefix, so the derivation holds.
- Filmstrip marker: present at 16 px in the card corner.
- Chat: a disabled stub under Advanced tools only.

## Notes for the design

- Keep the roster in join order on the client: replace the row in place in the `presence` handler (`controller.tsx` 1909 to 1910) instead of re-appending it, or sort by a join sequence the server stamps on the entry. Everything downstream (slots, roster, filmstrip order) then stops moving.
- Fix the slot base once, at the seam: `participantOf` should pass `hue: entry.hueSlot + 1`, or the server should send the 1 based slot and the schema take 1 to 6. Pin it with a test that draws a slot 1 participant and asserts the caret colour is `#2f5ce0`.
- Publish the pointer from the stage: on `pointermove` over `.pt-stagewrap`, convert to sheet units through the same `sheetPoint` the ruler uses (`Editor.tsx` 5664) and call `reportPresence({ pointer })` at the room client's 80 ms batch; send `pointer: undefined` on leave. Hide the own pointer as today.
- Carry the picture through the four seams: `rosterEntryFor` passes `pictureUrl(record.avatar, 64)`; `EditorIdentity` gains `mark` and `pictureUrl` from `identityViewFor`; `EditorRoot` sets `account.pictureUrl` and reads the file into a data URL for `account.setAvatar`. Then the own chip, the roster and the flags draw the same mark.
- Draw the own chip from the room's `self` mark, not from `account.principal`, so what a person sees of themselves is what others see.
- Decide whether the own chip belongs in the default view. Google's account avatar is always present; the sales judgment parked it. If it stays parked, the roster needs a "(you)" row in the default view so a person can find their own name.
- Give the plate a 1 px paper gap inside the border (plate 20 at 24, 12 at 16, 10 at 14) if the touching border is to change; the Bayer grid still aligns to the plate's top left and the cell counts become 10, 6 and 5. That changes `plateOf` in both `mark-svg.ts` and `marks-render.ts` and the flag's chip inset in research 11 6.5. Alternatively keep the plate and draw the border with `outline` outside the box, which keeps the 22 px plate and gives the picture its full size.
- Retire `mark-svg.ts` for `renderMarkSvg` or make the two agree, and test them against each other over random specs the way `marks-render.test.ts` does for the PNG.
- Add the five missing follow stops in one place: a `stopFollowing` call on slide select by the person, on a comment post, on Slideshow, on Version history, and clear the room's `follow` in it.
- Send a server time on each roster entry or keep the client's receipt time per client id so the caret dim can work; `idle` can be set by the server from the heartbeat's quiet cadence.
- Decide what a link visitor's role word should read; if "by link" stays, the server has to mark the entry (`via` is on the reader, not the entry).
