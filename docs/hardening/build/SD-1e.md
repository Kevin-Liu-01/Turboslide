# HR-SD#1e, the room's replay floor: build notes

The finding came from the verifier of HR-SD#1d (`harden/wave1-v5` at `75f8fb74`, `docs/hardening/build/SD.md` request 6): severity 3, older than wave 1, on production. A stream open replays the entries above the position the tab names, on the function's stream route (`?since=` or `Last-Event-ID` on the memory, redis and blob tiers) and in the Worker's deck room (`since` on the socket, the do tier production runs), and it did so for any reader admitted on `read`. A viewer link holder who opened `/api/decks/<id>/stream?since=0` read the op log, a heading the owner wrote and deleted before sharing among it (the verifier's readings at `75f8fb74`, port 4882, production's settings: V 9,111 B, C 10,781 B, L 10,606 B, each with the figure), while `version.list`, `activity.list` and the loader's `origins` refuse that reader. The work is on the branch `harden/sd1e`, made at `75f8fb74` in a scratch worktree.

## The design

The floor is the position of the document the server handed the reader, signed by the server that handed it, so the replay never goes below what the reader already has.

- Who gets one. A reader without the `history` capability: a viewer and a commenter, whatever the way in (`roleAllows` in `@turboslide/identity/access`: `history` is `roleAtLeast(role, 'editor')`, and no link setting changes it). An owner and an editor keep today's replay, since they read the op log in Version history anyway.
- The rule, one for both hosts (`packages/realtime`): `replayFloorFor(reader, head)` in `room-core.ts` answers the signed floor when the reader's facts carry one, none for an owner or an editor, and the head at the open otherwise; `replayPlan(position, head, floor)` in `admission.ts` answers `resync` for a position below the floor and keeps every other rule. A test pins that the role rule equals `roleAllows(role, 'history')` for every role.
- Who signs it. The editor loader (`readEditorDeckFn` in `write.ts`) knows the position of the document it hands out (`live.seq`). For a reader without `history` it puts a floor token in the payload's `room.floor`: `<seq>.<mac>`, 32 hex of an HMAC-SHA256 under the session secret over the deck, the identity the request resolves to, the tier and the position (`apps/studio/src/server/replay-floor.ts`). On the do tier the loader also signs the position into the room ticket as `fl` (`room-ticket.ts`).
- How it travels. The editor's transport (`apps/studio/src/editor/transport.ts`) sends the token as the `x-turboslide-floor` header on every stream open and every ticket refresh, never in a query string. The stream route reads it with `readReplayFloor` for the request's identity, the deck and the room's tier; the ticket route reads it for the do tier and carries the position into the refreshed ticket's `fl`. A token of another identity, deck or tier, a moved position or a changed mac proves nothing.
- What a reader gets. A position at or above the floor replays the entries above it as before, so a reconnect after a gap gets every entry it missed. A position below it is answered `resync`, the current document, which the room client reloads through the loader (`onResync`) with its pending ops folded on top. A request that proves no floor puts a reader without `history` at the head: no entry it did not see live, and a reconnect after a gap reloads the document.
- The Worker's `between`. The ack of an ops frame carried the entries between the post's base and its own to any writer; the app's ops route answered them only to a post with an edit. A commenter's comment post with a base of 0 read the entries above the base whole, the speaker notes among them. The Worker now answers `between` only to a post with an edit, as the app does (a writer who may edit holds `history`).

## Deploy order and the ticket without a floor

`worker_first`: yes. The ticket's schema is strict (`ticketClaimsSchema` in `frames.ts`), so a Worker that predates `fl` refuses every ticket that carries it, and an app that mints `fl` before the Worker reads it would close every viewer's and commenter's socket with 4401. The Worker half (`HR-SD#1e (Worker)`) deploys first. The guard's pass deploys the production Worker before the production app, so one push holding both commits keeps that order on production; two pushes in commit order keep it on the preview as well, where the guard deploys the app before the preview Worker.

A ticket without `fl` is one an app from before the claim minted (production's app between the Worker's deploy and the app's, and for the ten minutes such a ticket lives), or one whose refresh carried no token that verifies. The Worker treats it by the role: an owner or an editor replays as before, a viewer or a commenter replays nothing below the head at the open. That closes the leak on production as soon as the Worker half deploys, without waiting for the app. The cost falls on a viewer's or a commenter's tab of the older app: a socket open whose `since` is under the head (an entry landed between the page load and the open, or a reconnect after a gap) reloads the document once instead of replaying, through the resync path every tab already takes past 2,000 entries. The other choice, today's replay for a ticket without `fl`, keeps the leak open until the app deploys and keeps it open for good for any ticket that omits the claim by mistake.

## Commits

- `a736bb2d` `HR-SD#1e (Worker)`: the shared rule (`admission.ts`, `room-core.ts`), the ticket claim (`frames.ts`), the Worker's replay and `between` (`deck-room.ts`), the fake transport's floor, and the tests (`apps/realtime-worker/test/replay-floor.test.ts` new, `stand-ins.test.ts`, `admission.test.ts`, `frames.test.ts`, `room-core.test.ts`, `room-client.test.ts`).
- `a2360c16` `HR-SD#1e (app)`: `replay-floor.ts` (new), the loader (`write.ts`), `room.ts`, the stream and ticket routes, `room-ticket.ts`, the transport, `REPLAY_FLOOR_HEADER` in `protocol.ts`, and the tests (`replay-floor.test.ts` new, `replay-resync.test.ts`, `room-ticket.test.ts`, `transport.test.ts`).
- The notes commit: this file, `docs/security.md` section 15 and `docs/CLOUDFLARE.md` 3.3.

## Settings of every local reading

All on the scratch worktree of `harden/sd1e`, port 4884 for the app and 8884 for the Worker, each stopped after its readings. No secret was printed: the app and the Worker read test values (`TURBOSLIDE_ROOM_SECRET`, `TURBOSLIDE_ROOM_BEARER`, `TURBOSLIDE_DB_BEARER` from the Worker's `.dev.vars`, 600, ignored by git; `TURBOSLIDE_SESSION_SECRET` and `TURBOSLIDE_DOWNLOAD_SECRET` made for the lane), and the drive reports a floor token by its position alone.

- Memory tier: `vite dev` of `apps/studio` with `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/sd1e-overlay`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-sd1e.sqlite`, `TURBOSLIDE_MAIL=capture` and the fake Google client. The drive ran with production's settings (`TURBOSLIDE_LOCAL_OPEN` and `TURBOSLIDE_AUTH_RATE_LIMIT` unset); the rows with `-c vite.no-watch.config.ts`, `TURBOSLIDE_LOCAL_OPEN=1` and `TURBOSLIDE_AUTH_RATE_LIMIT=off`.
- Do tier, the two process run of `docs/hosting.md` 13.7: `wrangler dev --port 8884 --ip 127.0.0.1` in `apps/realtime-worker` over a local D1 made by `wrangler d1 migrations apply turboslide-accounts --local` (0001 to 0004), `TURBOSLIDE_APP_ORIGIN=http://127.0.0.1:4884`; the app is the node-server build (`NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` under the build lock, 231 s, load 67) served by `node apps/studio/.output/server/index.mjs` on 4884 with `TURBOSLIDE_REALTIME=do`, `TURBOSLIDE_ROOM_HOST=127.0.0.1:8884`, `TURBOSLIDE_ROOM_INSECURE=1`, the tmp store and a sqlite accounts file. The drive with production's settings, the rows with local open and the rate limit off.
- The drive is `scratchpad/hr-sd1e-drive/drive.mjs` (not in the tree). An anonymous browser makes a deck at `/new`, so it owns it, pastes a heading with a figure (`Figure 4471 <stamp>`, one input, so one entry holds it whole), replaces the heading, and makes a viewer link and a commenter link. L (an anonymous viewer link holder) and C (an anonymous commenter link holder) open the links and the editor. Each reader's floor is read off its page (the stream request's header on the memory tier; the served payload's `room.floor` and the loader's ticket on the do tier). From each reader's page the drive then asks for the replay by hand (a `fetch` of the stream route on memory; on do, a `fetch` of the ticket route with or without the header and a WebSocket to the Worker with `?since=`), and the owner's replay from 0 is the control.

## Readings

Loads are the one minute load. A timing taken at a load over 24 is not a verdict; every pin below is a count, a frame or a status.

Unit tests and the type check, on the branch's tree:

| Reading                                                                                                                                                                                      | Result                                                                                                                                            | Load      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `apps/realtime-worker` suite (with `replay-floor.test.ts`, 5 cases)                                                                                                                          | 69 of 69, 133 s                                                                                                                                   | 70        |
| `replay-floor.test.ts` with `deck-room.ts` at `75f8fb74`                                                                                                                                     | 4 of 5 red (the reconnect case passes both ways)                                                                                                  | about 110 |
| `packages/realtime` (the floor's plans, `fl` parsed, `replayFloorFor` and its role rule against `roleAllows(role, 'history')`, the room client's reconnect at the floor and resync below it) | 203 of 203, 50 s                                                                                                                                  | 70        |
| `apps/studio` unit suite                                                                                                                                                                     | 1,172 of 1,180, 1,059 s; the 8 red were 5 s timeouts                                                                                              | 67 to 70  |
| The 7 files with a timeout, read again                                                                                                                                                       | 64 of 67, 105 s; the 3 still red (`agent-gate.test.ts` 2, `comment-stand-ins.test.ts` 1) are red at `75f8fb74` as well, timeouts (40 s and 7.9 s) | 63 to 73  |
| `tsc -b`                                                                                                                                                                                     | exit 0, 0 errors, 487 s                                                                                                                           | 67 to 81  |

The drive, memory tier, production's settings (13:51 to 13:53 UTC, load 90 to 106). The owner's paste made entries 1 to 3, so each reader's floor is 3.

| Reading by hand, from each reader's page | Viewer link holder L                   | Commenter link holder C  |
| ---------------------------------------- | -------------------------------------- | ------------------------ |
| The page's own stream open               | `since=3` with its token on the header | the same                 |
| `since=0`, no token                      | hello, resync, 0 entries               | hello, resync, 0 entries |
| `since=0`, its token                     | hello, resync                          | hello, resync            |
| `since=2`, its token                     | hello, resync                          | hello, resync            |
| `since=3`, its token                     | hello, nothing below                   | hello, nothing below     |
| `since=0`, the other reader's token      | hello, resync                          | hello, resync            |
| Any frame with the figure                | none                                   | none                     |

The owner's `since=0` replayed entries 1 to 3 with the figure (the control). After the owner typed again, L's `since=3` replayed 4 to 6 and L's live editor showed the words.

The drive, do tier, production's settings (14:24 to 14:25 UTC, load 43 to 45; the same readings at 14:18 to 14:19, load 58 to 64). The served payload of each reader carried its floor token for 3, and the ticket the loader minted carried `fl: 3`.

| Reading by hand, a ticket from the ticket route and a socket to the Worker | L                                                           | C                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------ |
| `since=0`, no header (the ticket carries no `fl`)                          | hello, resync                                               | hello, resync            |
| `since=0`, its token (`fl: 3`)                                             | hello, resync                                               | hello, resync            |
| `since=2`, its token                                                       | hello, resync                                               | hello, resync            |
| `since=3`, its token                                                       | hello, ops with no entry                                    | hello, ops with no entry |
| `since=0`, the other reader's token (no `fl`)                              | hello, resync                                               | hello, resync            |
| An access change (a new link): the object's reauth, the page's refresh     | one ticket call with the header for 3, the answer's `fl: 3` | the same                 |
| Any frame with the figure                                                  | none                                                        | none                     |

The owner's `since=0` replayed 1 to 3 with the figure. After the owner typed, L's `since=3` replayed 4 and its live editor showed the words. L's context went offline, the owner typed, L's context came back: its own socket opened again with one hello and a replay of the missed entry (5), no resync, and the editor showed the words.

Before, the same drive at `75f8fb74` (a detached worktree of the base, its own install and build):

- Memory tier, `vite dev` with production's settings (14:41 to 14:42 UTC, load 73 to 92): L's and C's `since=0` (any header, the header means nothing there), `since=2` and `since=0` with the other's header each replayed entries 1 to 3 with the figure (2,712 to 4,394 B). This is the verifier's reading of the finding (r1 and r2), read again.
- Do tier, the base app and the base Worker (14:36 to 14:37 UTC, load 64 to 82): L's and C's sockets with `since=0` replayed entries 1 to 3 with the figure (2,716 B and 2,719 B). The verifier did not read the do tier (production, read only); this is the do tier's reading of the finding on the local two process run.

The Worker first, the order of the deploy: the base app (`75f8fb74`, its tickets carry no `fl`) against this branch's Worker (14:26 to 14:27 UTC, load 45 to 49). Every socket of the old app opened (its tickets verify). L's and C's `since=0` read hello and resync, 0 entries, no figure: the leak closes with the Worker alone. The access change's reauth and the old app's refresh worked. The owner replayed 1 to 3 as before. L's context went offline while the owner typed and came back: its own socket read one hello and one resync (the fail closed floor of a ticket without `fl`), and the old client reloaded and showed the words. That is the transition's cost: a reload in place of a replay for a viewer or a commenter whose socket opens behind the head, until the app half deploys.

The five realtime rows (the node-server build or `vite dev` with local open and the rate limit off; one run each, then each red read again):

| Configuration                                                                  | join.chip-within-1s | title.two-typers | reload.loses-nothing | reconnect.loses-nothing | caret.within-300ms |
| ------------------------------------------------------------------------------ | ------------------- | ---------------- | -------------------- | ----------------------- | ------------------ |
| Memory tier, this branch (13:55 to 14:05, load 55 to 77)                       | pass                | 1 of 3           | pass                 | pass                    | pass               |
| Do tier, this branch's app and Worker (14:20 to 14:24, load 48 to 72)          | pass                | pass             | pass                 | pass                    | pass               |
| Do tier, the base app and this branch's Worker (14:27 to 14:33, load 47 to 66) | pass                | 1 of 3           | pass                 | pass                    | pass               |
| Do tier, the base app and the base Worker (14:33 to 14:36, load 63 to 69)      |                     | 0 of 2           |                      |                         |                    |

Every red of `realtime.title.two-typers` missed only the 500 ms bound (502 to 1,658 ms on this branch, 604 to 1,209 ms with the base app, 1,218 ms on the base) with the two documents equal and every word once (the row's lines 1102 and 1103 passed), a timing at a load over 24 and red on the base as well, so a flake of the loaded machine. The row's two people are editors with history: their opens carry no floor header and plan as before, and an edit post's `between` is unchanged.

## What stays, and requests

- The tier hand off. A floor token names its tier, so after a hand off between the do tier and the blob tier the token proves nothing on the other tier and such a tab's floor is the head until the page loads again: a reconnect after a gap reloads the document. The hand off happens when the Worker is down; the tab stays correct, it reloads more often.
- A viewer whose role rises to editor keeps its payload's floor token, which its new standing ignores (an editor's facts carry `floor: null`). A role that falls from editor to viewer has no token in its payload, so its floor is the head until it loads again.
- The floor token has no expiry: it proves to one identity, on one deck and tier, a position that identity was handed. A reader who loses access and is given it again later can replay from its old floor (at most 2,000 entries, within what the log holds). The decision runs at every open, so a reader without access reads nothing.
- To lane RC (HR-RC#5a, the pending store's Apply from a saved position): for a viewer or a commenter a saved position below the floor of the tab that applies is answered `resync`, so Apply for such a reader goes through the resync read (`origins`), never the replay.
- The room client's resync, read in the code and not reproduced (pre-existing, not changed here): `resync` in `room-client.ts` replaces the document with the reloaded one and keeps the position at `max(seq, helloSeq)`, so an entry that lands after the loader's read and reaches the tab before the resync ends is applied to the old document and dropped with it, and the tab can miss it until its next reload. A below floor resync adds no new path; it is the one every tab takes past 2,000 entries and on a tier change. To lane RC, for a look.
