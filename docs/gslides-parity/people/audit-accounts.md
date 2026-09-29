# Accounts audit

Read on 2026-09-29 from the worktree `Turboslide-people` at `8ceb6294` (branch `people/round`, at `origin/main`). Line numbers are of that tree. Production facts were read from `https://www.turboslide.com` on the same day with an anonymous cookie and no bearer.

The questions this note answers: how a person becomes an account rather than an anonymous browser, what an account carries, what "account distinguishing" means in the UI today, what the documents plan, and the smallest change that makes accounts visibly distinct from anonymous people in the title row, the roster, comments and versions.

## Summary

- An account exists only on a deployment with an identity database. Production has none: `GET /api/auth/get-session` answers 404 with "Sign in needs a database on this deployment; the studio runs anonymous only". `TURBOSLIDE_MAIL=off` never comes into play there because no sign in mail is ever requested.
- On a deployment with a database, a person becomes an account by email: one mail with a magic link and a six digit code through better-auth, no password. The anonymous principal of the browser is linked to the account in an alias table on the first session.
- An account carries a user row (id, email, emailVerified, name, image), a profile row (admin, avatar choice, avatar key, deletedAt) and a principal record under `usr_<id>` (typed name, avatar, link grants). The name is empty at creation and stays empty until the person types one.
- Nothing in the chrome draws an account differently from an anonymous person. The trust state `verified` exists in every type, but its word is the empty string, no badge is drawn, no tooltip names the email, and no stylesheet reads it.
- The larger defect sits under the chrome: the room's identity path (`room.ts`) reads the anonymous cookie only and never the account session, and its resolver has no alias or account lookup. A signed in browser is its anonymous principal in the editor boot, the presence roster, the ops and stream routes, the share and access routes, and the version log. Only the `/api/actions` transport (comments, `account.*`, `share.*`) sees the account.
- The documents plan a check badge glyph after a verified name, the email in the tooltip, and the sentence "Signed in as <email>" in the own chip's menu. Organisations are out of scope in every spec.

## What exists

### The anonymous principal

- `apps/studio/src/server/auth/session.ts` 21 to 27: the cookie `__Host-ts_id` (`ts_id` on plain http off localhost), 400 days, the seal version `v1`.
- `session.ts` 226 to 244 `ensurePrincipal`: mints `anon_<uuid v4>` when no cookie verifies and no bearer is present. `session.ts` 74 to 91 `sealPrincipalCookie` refuses any id that is not anonymous (`parsed.kind !== 'anonymous'` at 80). `unsealPrincipalCookie` at 117 refuses the same on read.
- `apps/studio/src/server/auth/middleware.ts` 30 to 46: the request middleware that mints the cookie and binds the principal to the request.
- `packages/identity/src/principal.ts` (`newPrincipalRecord`): the record `{ principalId, label, name?, avatar, linkGrants, livePointers, lastSeenAt, ... }` under `.turboslide/principals/` on a checkout (`apps/studio/src/server/auth/principal.ts` 56 to 94) or Redis hosted (104 to 110). Production runs the file store per instance (the b1.md R17 note at `room.ts` 356 to 365).
- The label: `packages/identity/src/labels.ts` 107 to 111, `<Word> <NNN>` from `sha256(principalId)`. The grammar check `matchesLabelGrammar` at 121 keeps a typed name from looking generated.

### Becoming an account

- `apps/studio/src/routes/api/auth.$.ts` 16 to 25: better-auth's handler on `/api/auth/$`. Without a database (`runtime.auth === null`) every request answers 404 with `NO_DATABASE_NOTICE`. This is the production answer today.
- `apps/studio/src/server/auth/better-auth.ts` 78 to 87 `signInMethods`: `available` and `email` are true only with a database; `passkeys` is always false with the notice "Passkeys arrive once the address is final" (53); `github` needs `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
- `better-auth.ts` 235 to 260: the magic link plugin (`storeToken: 'hashed'`, 300 s) asks the OTP plugin for a code (271 to 276) and sends both in one mail through `sendSignIn` (127 to 157), which takes a per address quota of 3 per 10 minutes (134 to 143) and answers the same whether or not a mail left (149 to 156).
- `apps/studio/src/server/auth/mail/templates.ts` 49 to 73 `signInMail`: the one mail, subject "Your Turboslide sign in code is <code>".
- `apps/studio/src/server/auth/mail/mailer.ts` 65 to 74 `selectMail`: `capture`, `resend` (needs `RESEND_API_KEY` and `TURBOSLIDE_MAIL_FROM`), else `off`. `offMailer` at 252 to 267 drops every mail, warns once on the server, and answers `status: 'dropped'` to the caller. The caller's answer to the browser is unchanged.
- The session hook `better-auth.ts` 221 to 231 calls `onSessionCreated`; `apps/studio/src/server/auth/identity.ts` 373 to 390 then touches the `usr_` record, sets the admin flag for `TURBOSLIDE_ADMIN_EMAILS`, links the browser's anonymous cookie to the account (`linkAnonymous`, 357 to 371, through the alias table of `alias.ts` 25 to 39), merges the anonymous record into the account's record (`mergePrincipalRecords`, `alias.ts` 101 to 120), and binds email invitations when `emailVerified` is true.
- The dialog: `packages/chrome/src/dialogs/SignIn.tsx` 23 to 218. The address field, Continue, then the six digit code, Verify. `apps/studio/src/editor/EditorRoot.tsx` 830 to 839 posts `sign-in/magic-link` with `{ email, callbackURL }` and `sign-in/email-otp` with `{ email, otp }`, then `window.location.reload()` (836). No name is posted.
- The entry points to the dialog: the own chip's menu row `title.account.signIn` (`packages/chrome/src/menus/model.ts` 880 to 885, `when: 'canSignIn'`) and the name prompt's Sign in link (`packages/chrome/src/dialogs/NamePrompt.tsx` 125 to 141, drawn only when `account.signInAvailable === true`). `canSignIn` (`model.ts` 3410) needs `signInAvailable`, which is `auth.signIn` of the boot payload (`EditorRoot.tsx` 809, `controller.tsx` 4232), which is `runtime.methods.available` (`apps/studio/src/server/write.ts` 395), which is `db !== null` (`identity.ts` 222).
- The device flow for `turboslide login`: `better-auth.ts` 261 to 267 and the `/device` page; covered by `apps/studio/e2e/accounts.spec.ts` 270 to 348.
- `admin.bootstrap` (`apps/studio/src/server/auth/actions.ts` 513 to 528) creates a user row by email with `emailVerified: 1` and `name: ''` (`ensureUserByEmail`, 259 to 288) without a sign in.

### What an account carries

- The user row: `better-auth.ts` 311 types it as `{ id, email, emailVerified, name, image? }`. `accountFacts` (`identity.ts` 313 to 336) selects `id`, `email`, `emailVerified`, `name` only; `image` is never read anywhere in the studio.
- The name at creation is the empty string: better-auth's magic link creates the user with `name: name || ""` (`node_modules/.pnpm/better-auth@1.7.4_*/node_modules/better-auth/dist/plugins/magic-link/index.mjs` 167) and the dialog posts no name (`EditorRoot.tsx` 833). `account.setName` writes `user.name` (`actions.ts` 331 to 336) and the `usr_` record's `name` (321).
- The profile row `ts_profile` (`apps/studio/src/server/auth/profile.ts` 12 to 20): `admin`, `avatar` (the choice as JSON), `avatarKey` (the picture files' prefix, rotated on change), `deletedAt`.
- The picture avatar: `apps/studio/src/server/auth/avatar.ts` and `actions.ts` 352 to 364; only an account may upload one (`packages/chrome/src/dialogs/AvatarBuilder.tsx` 119, 198, 259: the Picture tab's upload is drawn only when `account.signedIn`).
- The principal record `usr_<id>`: the same shape as an anonymous record; `mergePrincipalRecords` copies the anonymous typed name and avatar into it once (`alias.ts` 116 to 118).
- The sessions list: `actions.ts` 218 to 237 `sessionsOf` (id, createdAt, lastSeenAt, current, userAgent) for `identity.kind === 'account'` only; empty for everyone else.
- API keys: `actions.ts` 450 to 506, accounts only (`SIGN_IN_FOR_KEYS` at 51).
- The admin flag: `profile.admin` or the address in `TURBOSLIDE_ADMIN_EMAILS` (`identity.ts` 333; `profile.ts` 183 to 193).
- `account.me` (`actions.ts` 146 to 182) answers `{ principal: { id, kind, email?, admin }, trust, label, name?, mark, avatar, sessions? }`. `trust` is `'verified'` for an account.

### How an id resolves to what a surface shows

- `packages/identity/src/resolve.ts` 139 to 211 `resolvePrincipal`: a `usr_` id resolves through `lookup.account`; an `anon_` id resolves through `lookup.alias` to the account when linked, else through the record to a typed name (`guest`) or the label (`label`). A `usr_` id whose account lookup answers null renders as "Deleted account" with `trust: 'verified'` and `deleted: true` (180 to 189).
- `fromAccount` (101 to 133): `displayName: profile.name.trim() || profile.email` (124), `trust: 'verified'`, `email`, `admin`.
- `TRUST_WORDS` (21 to 26): `label: ''`, `guest: 'guest'`, `verified: ''`, `agent: 'Agent'`.
- `trustTooltip` (29 to 40): "Signed in as <email>" for `verified`. No file outside `resolve.ts` calls it (grep over `packages` and `apps`).
- `toIdentityView` (231 to 248): `view.name` is set for any trust other than `label`; `view.email` only under `showEmail`.
- The studio's full resolver: `identity.ts` 653 to 692 `resolveIdentity` and 694 to 723 `identityViewFor`, which read the alias table, the account profile and the token store. Their only callers are `meOf` in `auth/actions.ts` (148) and the tests.

### The two identity paths of the server

- `apps/studio/src/server/auth/identity.ts` 455 to 641 `requestIdentity`: a bearer, then the better-auth session (`sessionOf`, 540), then the anonymous cookie, then a fresh mint. For a session it answers `kind: 'account'`, `principalId: usr_<id>`, `author: { kind: 'human', name, principalId: usr_<id> }` where `name = account.name.trim() || displayNameOf(record, principalId)` (548), so an account without a typed name writes under its label.
- Its callers: `apps/studio/src/server/actions.ts` 696 (`callerFactsFor`, the `/api/actions/<action>` transport: comments, `account.*`, `share.*`, `admin.*`) and 727 (`accountFactsFor`), and `apps/studio/src/routes/s.$token.ts` 71 (the share link exchange).
- `apps/studio/src/server/room.ts` 309 to 377 `requestIdentity`: a bearer as the agent context, a cookieless localhost call as the checkout holder, else `readPrincipal` (334), else `ensurePrincipal` (338). It never calls `sessionOf` or the identity runtime (no import of `auth/identity` in the file). Line 373 reads `kind: principal.kind === 'account' ? 'signedIn' : 'anonymous'`, and `readPrincipal` can only answer an anonymous principal (`session.ts` 202), so `signedIn` is unreachable.
- Its callers: `write.ts` 333 (the editor boot `readEditorDeck`), 606 and 754 (the writes), `sessions.server.ts` 35, `routes/api/decks.$deckId.ops.ts` 67, `decks.$deckId.stream.ts` 88, `decks.$deckId.presence.ts` 74, `share.$.ts` 91, `access.$.ts` 37, `notify.$.ts` 74, `assist.ts` 47, and `room.ts` 962.
- `room.ts` 398 to 407 `resolveIdentity`: `resolvePrincipal(principalId, { record, alias: () => null, account: () => null })`. The comment at 397 reads "the alias and account lookups are B3's day four". `cachedIdentity` (2033 to 2053) and `authorOf` (380 to 394) use it. `rosterEntryFor` (2085 to 2098) builds the roster entry from it: `label: resolved.displayName`, `trust: resolved.trust`, `mark`, `kind: 'human' | 'agent'`; no email field (`packages/realtime/src/channel.ts` 150 to 160 `RosterIdentity`).
- The boot payload's `identity` (`write.ts` 380 to 388): `principalId`, `label`, `name` for `guest` and `verified`, `trust`, `kind`, `email` when resolved. It comes from `room.resolveIdentity` (368 to 371), so it is anonymous for a signed in browser.
- The boot payload's `auth` (`write.ts` 394 to 401): `signIn`, `email`, `passkeys`, `passkeysNotice`, `github`, `mail`. The chrome reads `signIn`, `email`, `passkeys`, `github` (`EditorRoot.tsx` 805 to 811, 830 to 853) and never `mail`.

### What the chrome draws

- `packages/chrome/src/editor-shell.ts` 236 to 262: `TrustState` and `IdentityView` (`principalId`, `label`, `name?`, `trust`, `kind`, `email?`, `mark?`, `runId?`). 505 to 530 `EditorAccount`: `principal`, `signedIn`, `signInAvailable`, `passkeysAvailable`, `githubAvailable`, `sessions?`, `tokens?`.
- `packages/chrome/src/presence/IdentityChip.tsx` 87 to 90 `trustWordOf`: "guest" for `guest`, null for everything else. 92 to 97 `chipName`: the accessible name is the name plus the guest word. 139: `data-trust={identity.trust}` on the chip. `packages/chrome/src/presence/presence.css` has rules for `.is-self` (26), `.is-agent` (30, dashed) and `.is-blank` (34), none for `data-trust`.
- `packages/chrome/src/presence/presence-model.ts` 97 to 100 `trustWordFor` (guest only), 87 to 95 `displayNameFor` (a verified name becomes the role word for a link visitor without the switch), 121 to 129 `chipTipOf` ("Maya · guest · slide 12"), 135 to 140 `flagText` (the guest word only when the 13 character capacity has room).
- The title row: `packages/chrome/src/presence/PresenceSlot.tsx` 85 to 124 draws the other people's chips with `chipTipOf`; 151 to 182 draws the own chip only while `title.account` is present, which is behind Tools > Advanced tools (`model.ts` 866 to 869 `parked(sub('title.account', ...))`; `docs/FOCUS.md` 144). The own chip's tooltip is "<name> (you)" (167 to 173).
- The own chip's menu: `packages/chrome/src/presence/AccountMenu.tsx` 39 to 42: "Signed in as <email>" when `account.signedIn === true && identity.email !== undefined`, else "Not signed in"; the rows from `title.account` filtered by `isPresent` (38). The rows (`model.ts` 872 to 899): Change name, Change avatar, Sign in (`when: 'canSignIn'`), Sign out (`when: 'signedIn'`), Forget this browser, Sessions (no predicate).
- The roster: `packages/chrome/src/presence/RosterMenu.tsx` 105 to 175: chip, name, "(you)" on the own row, the guest word at 161, the role word (`rosterRoleWord`, `presence-model.ts` 103 to 106), the slide.
- Comments: `packages/chrome/src/comments/CommentCard.tsx` 136 and 173 (the guest word beside the name), `CommentsPanel.tsx` 167 and 195 to 197, `ReplyBox.tsx` 187 to 189 (the guest word in the mention list). `comments.css` 118 to 122 styles the word in `--pt-ink-2` at 11 px.
- Versions: `packages/chrome/src/VersionsPanel.tsx` 239 to 241 and 313 to 318: a 16 px chip, "You" for the own principal, the name, " · guest" for a guest. `versions-model.ts` 40 to 85 `identityOfAuthor`: the resolved identity from `identities` when present, else an agent view, else "Earlier edits" for the round one `studio` author, else `{ name: author.name, trust: 'guest', kind: 'anonymous' }` (78 to 85).
- The client side derivation of `verified`: `apps/studio/src/editor/controller.tsx` 542 to 555 `identityOfPrincipal` gives `trust: 'verified', kind: 'account'` to any id that starts with `usr_`; 302 to 314 `participantOf` gives `kind: 'account'` by the same prefix. `identityIndex` (561 to 580) maps comment authors, roster rows and the caller; it has no alias.
- Share: `packages/chrome/src/dialogs/Share.tsx` 277 to 284 `identityOf` marks a `usr_` grant holder `verified` and everyone else `label`; the people list carries the mark and the name or email.
- Profile: `packages/chrome/src/dialogs/Profile.tsx` 37 to 44: the sentence "Signed in as <email>, verified", "You are known by the name you typed", or "You are known by a label" (`menus/strings.ts` 238 to 242).
- Notification settings: `packages/chrome/src/dialogs/NotificationSettings.tsx` 19, 31, 77: the email option only for a signed in account.
- The You need access page: `apps/studio/src/routes/-access-page.tsx` 75 to 86 renders "Sign in from your presentations" with the tooltip "Sign in from the account chip on your presentations, then open the link again". The file reads no auth fact.
- The home copy: `apps/studio/src/components/home/copy.ts` 692 to 697: "Optional. Anonymous by default with a label such as Wax 613; sign in by email code or magic link is behind Advanced tools."

### What a seller sees on production

- `https://www.turboslide.com/api/auth/get-session` answers 404 `{"error":{"name":"RangeError","status":404,"message":"Sign in needs a database on this deployment; the studio runs anonymous only"}}`. `docs/HOSTING-MOVE.md` 20 lists the production variables: `TURBOSLIDE_MAIL` is set, `DATABASE_URL` and `RESEND_API_KEY` are not.
- So `auth.signIn` is false in every boot payload. The name prompt has no Sign in link. The own chip is absent until Tools > Advanced tools is on. With the switch on, the own chip's menu reads "Not signed in" and offers Change name, Change avatar, Forget this browser and Sessions; there is no Sign in row (`canSignIn` is false) and no Sign out row.
- `TURBOSLIDE_MAIL=off` is not reached: no mail is ever composed because the sign in routes answer 404 before better-auth runs. The mail mode matters only once a database is added.
- Every person on production is an anonymous principal with a label or a typed name. The roster shows "<name> · guest" or "<label>", comments and versions the same. Nobody is an account, and nothing could show one.

### The tests and the verification record

- `apps/studio/e2e/accounts.spec.ts` 174 to 367: the share link exchange, the sign in with the captured code and the alias (230 to 268), the device flow, the avatar route. 369 to 408: the chrome row skips when the own chip is absent (384 to 387) and otherwise asserts four rows (Change name, Change avatar, Forget this browser, Sessions) behind Advanced tools. No row opens the editor as a signed in browser, and no row asserts a badge, the "Signed in as" sentence, or the Sign out row.
- `apps/studio/src/server/auth/identity.test.ts` 295 and 366: the code signs in and links the anonymous id, through the auth runtime's `requestIdentity`. Nothing tests the room path with a session.
- `docs/gslides-parity/VERIFICATION-3.md` 187 to 190: the walk recorded the own chip's menu with "Not signed in" as the only account surface; no pass records a signed in chip. Finding 20 (535 to 540): the own chip keeps the label after `account.setName` until a reload. Finding 35 (612 to 614): the Sign in row is absent on the first read after `/new` because `signInAvailable` arrives after the first render.

## Defects

1. The room's identity path never reads the account session. `room.ts` 309 to 377 reads the anonymous cookie only; `session.ts` 196 to 205 `readPrincipal` can only return `kind: 'anonymous'`; the `'signedIn'` branch at `room.ts` 373 is dead. Every caller listed above (the editor boot at `write.ts` 333, the writes at 606 and 754, presence, ops, stream, share, access, notify, assist) sees a signed in browser as its anonymous principal. In the chrome: `signedIn` is `payload.identity?.kind === 'account'` (`EditorRoot.tsx` 808; `controller.tsx` 4231) and the boot identity comes from `room.resolveIdentity` (`write.ts` 368 to 388), so `signedIn` is never true. The AccountMenu sentence stays "Not signed in" (`AccountMenu.tsx` 39 to 42), the Sign out row never appears (`model.ts` 886 to 890), the Sign in row stays after a sign in, the reload at `EditorRoot.tsx` 836 lands on the same anonymous chip, the Picture tab keeps saying sign in (`AvatarBuilder.tsx` 259), and the notification email option never appears (`NotificationSettings.tsx` 77). Version records and presence rows are written under `anon_` for a signed in person (`room.ts` 380 to 394 `authorOf`).

2. The room's resolver has no alias and no account lookup. `room.ts` 398 to 407 passes `alias: () => null, account: () => null`. Run against `packages/identity/src/resolve.ts` with those lookups, a `usr_` id resolves to `{"displayName":"Deleted account","trust":"verified","deleted":true,"email":null}` (a node run of `resolvePrincipal('usr_abc…', { record: () => null, alias: () => null, account: () => null })` on this tree), and an aliased `anon_` id never resolves to its account, against SPEC-3 452 ("old records render the account's name with the check badge") and 7.4. The studio has the full resolver already (`identity.ts` 653 to 723) and uses it only for `account.me`. The comment at `room.ts` 397 records the seam as unbuilt.

3. One person is two ids across surfaces. A comment posted from the browser runs through `/api/actions` and `callerFactsFor` (`actions.ts` 696 to 712), which uses the auth runtime's `requestIdentity`, so the comment author is `usr_<id>` (`apps/studio/src/server/comments.ts` 327 to 331). The same browser's edits and presence run through `room.requestIdentity` and are `anon_<uuid>`. `identityIndex` (`controller.tsx` 561 to 580) has no alias, so the comment shows one chip and the roster row another, with different marks (`markHash` of `packages/identity/src/marks.ts` 66 to 74 hashes the id), and the versions panel's "You" test (`VersionsPanel.tsx` 163) fails for one of the two.

4. No visible mark for a verified account anywhere. `TRUST_WORDS.verified` is `''` (`resolve.ts` 25); `trustWordOf` and `trustWordFor` answer null for `verified` (`IdentityChip.tsx` 88 to 90; `presence-model.ts` 98 to 100); the `check-badge` glyph exists (`packages/chrome/src/icons.tsx` 356) and no presence, comments or versions file references it; `data-trust` on the chip (`IdentityChip.tsx` 139) has no stylesheet rule. So the roster row (`RosterMenu.tsx` 161), the comment head (`CommentCard.tsx` 173), the comments list (`CommentsPanel.tsx` 195), the version row (`VersionsPanel.tsx` 317), the caret flag (`RemoteCursors.tsx` 72; `flagText`), the chip tooltip (`chipTipOf`) and the accessible name (`chipName`) draw an account exactly as a label. SPEC-3 0.19 (line 40), 15 (line 1159) and research 11 5.2 (line 244) each name the check badge and the email tooltip.

5. The chip tooltips never say who is signed in. `trustTooltip` (`resolve.ts` 29 to 40) has no caller. `PresenceSlot.tsx` 104 to 113 and `RosterMenu.tsx` 113 to 127 build tips from the name, the guest word and the slide. The roster entry carries no email (`channel.ts` 150 to 160), so even a grant holder, who may see it under SPEC-3 4.8, cannot.

6. The versions panel never receives resolved identities. `EditorShell.tsx` 1907 passes `input.identities`; no file under `apps/studio/src` sets `identities` (grep over `.ts` and `.tsx`; the only hits are counters in `room.ts` 2405 and 2491). `identityOfAuthor` then falls to `versions-model.ts` 78 to 85 for every human author with a principal id: `trust: 'guest'` and `name: author.name`. Read from the code, a label author renders "Titanium 471 · guest" and an account author (once records carry `usr_`) renders "<name> · guest" too. `__tests__/versions-model.test.ts` 95 to 97 pins that fallback for an author without a principal id and does not cover one with a `usr_` or `anon_` id and no identities map. A live check on a two browser deck is needed to confirm the rendering.

7. An account's display name falls back to its email address. `resolve.ts` 124 `displayName: profile.name.trim() || profile.email`, and `toIdentityView` 241 to 242 copies `displayName` into `view.name` for any trust other than `label`, while `view.email` is gated by `showEmail` (243). Once defect 2 is fixed, an account that never typed a name shows its address as its name on every surface that resolves it, past the `showEmail` gate and against 4.8 (a link visitor sees a verified person as a role word only through `displayNameFor`, which is a separate rule in `presence-model.ts` 92). The name is empty at creation because the magic link creates `name: ""` (better-auth `magic-link/index.mjs` 167) and the dialog posts none (`EditorRoot.tsx` 833). Meanwhile the author name the server writes for such an account is the label (`identity.ts` 548), so the same account is "kevin@…" in one place and "Cobalt 412" in another.

8. The Sessions row and the Profile dialog are offered to anonymous people. `title.account.sessions` has no predicate (`model.ts` 896 to 899); `account.sessions` answers `[]` for anyone but an account (`actions.ts` 223); the Profile dialog then shows "You are known by a label" over an empty list with Sign out per row and Delete account rows that cannot apply (`Profile.tsx` 37 to 44 and below).

9. The sign in dialog does not read the mail mode. `write.ts` 400 sends `mail`; `EditorRoot.tsx` 805 to 853 never reads it. On a deployment with a database and `TURBOSLIDE_MAIL=off`, `offMailer` drops the mail (`mailer.ts` 256 to 264) and the dialog still says "If that address can sign in, a message with a link and a six digit code is on its way" (`strings.ts` 226). The sentence is honest by design for a stranger address (03 C2), but on such a deployment it is false for every address.

10. Copy that names a sign in the deployment does not have. `copy.ts` 697 says sign in by email code or magic link is behind Advanced tools; on production there is no database, so the row behind the switch has no Sign in. `-access-page.tsx` 75 to 86 tells a stranger to sign in from their presentations on a deployment where the account chip has no Sign in row.

11. The `image` column of the user row is never read. `accountFacts` (`identity.ts` 319 to 323) selects `id`, `email`, `emailVerified`, `name`; a GitHub sign in sets `image` and the mark never uses it. The picture path is the separate upload of `avatar.ts`.

12. The e2e coverage of the chrome's account state is a skip. `accounts.spec.ts` 384 to 387 skips when the own chip is absent, and the row that runs asserts four rows behind Advanced tools. SPEC-3 1194 names the rows "old records render with the check badge", "the own chip's menu holds the six rows", and the Picture tab accepting a picture for a signed in person; none is asserted. VERIFICATION-3 finding 35 (the missing Sign in row on the first read) is recorded, not re-measured here.

## Gaps against the target

The target of this round is an account that a reader can tell from an anonymous person in the title row, the roster, comments and versions.

- Production has no accounts. `DATABASE_URL` is unset (`docs/HOSTING-MOVE.md` 20) and `/api/auth/*` answers 404. `docs/hosting.md` 810 to 841 names the Neon install (`DATABASE_URL`, `BETTER_AUTH_SECRET`) and Resend (`RESEND_API_KEY`, `TURBOSLIDE_MAIL_FROM`) as Kevin's steps. `docs/PRODUCT.md` 637 and 658 place optional sign in in "the round after" with the email link as the first provider; `docs/gslides-parity/product/audit-seller.md` 152 to 158 (item 4) is the seller side reason. Until a database exists, no chrome change can show an account on production.
- With a database and no mail sender, `TURBOSLIDE_MAIL=off` drops the sign in mail and nobody can complete a sign in. `capture` exposes the code to admins through `admin.mail.list` (`actions.ts` 530 to 551), which is a preview device, not a production one.
- The server never carries the account into the room (defects 1 and 2), so the presence roster, the boot identity and the version authors cannot carry `verified` for a real account today. The `usr_` ids reach the chrome only through comments.
- The chrome has no visual for `verified` (defect 4), no tooltip (defect 5) and no resolved identities for versions (defect 6).
- The title row's own chip is parked (`docs/FOCUS.md` 3.2, line 144; `README.md` 94). A visible account state in the title row needs either the own chip back in the default view or a mark on the presence chips of others.
- The word beside a name for a verified account is undefined in the strings: `PRESENCE` has `guest` and `byLink` (`strings.ts` 103 to 105) and nothing for a signed in person; `ACCOUNT.profile.trust.verified` says "verified" (`strings.ts` 241), the sentence of 15 says "check badge".
- Organisations, groups and domain modes are out of scope: SPEC-3 1247 lists "organizations and groups in the people field" and "Show names to everyone in my organization" under what this round does not do; SPEC-5 mentions an organisation only in a template scenario (S4, line 31). No document plans an organisation mark.

## Notes for the design

### What the documents already decided

- SPEC-3 0.19 (line 40): three trust states with marks, "label, guest (the word "guest"), verified (the check badge), plus the dashed agent mark".
- SPEC-3 15 (line 1159): "a typed name carries "guest" in `--pt-ink-2`; a verified account carries the check badge and the email in the tooltip; an agent carries the dashed mark and "Agent · <runId>"".
- Research 11 5.2 (line 244): the `check-badge` glyph at 14 px in `--pt-ink-2` after the name, the tooltip "Signed in as <email>", "never drawn for a guest or a label, and never in a hue".
- SPEC-3 4.8 and 0.12: a link visitor sees a verified person as a role word unless the owner turns on "Show names to people with the link"; grant holders see the name. The badge and the email follow the same rule.
- SPEC-3 0.21 and 7.5: the own chip's menu is the one place accounts appear, with "Signed in as <email>" as a sentence, not a row. The badge beside other people's names is a mark, not an account surface, and does not conflict with 0.21.
- SPEC-3 4.9 and 15: every chip's accessible name is the name and the trust word, so the badge needs a word for screen readers.

### The smallest change that makes accounts visibly distinct

Server, so that a `verified` identity reaches the surfaces at all:

1. `room.ts` `requestIdentity` reads the better-auth session before the cookie when `identityRuntime().auth !== null` (the auth runtime's `requestIdentity` at `identity.ts` 455 already does the whole rule; the room's type at 291 to 302 needs `kind: 'signedIn'`, `principalId: usr_<id>` and the account's record). This makes the boot identity, the presence rows and the version authors carry `usr_` ids and `trust: 'verified'`, and turns on the Sign out row, the "Signed in as" sentence, the Picture tab and the email option with no chrome change.
2. `room.ts` `resolveIdentity` takes the alias and account lookups from the runtime (`runtime.aliases.accountOf`, `accountProfile`), the way `identity.ts` 653 to 692 does. Old `anon_` records then render as the account, and a `usr_` id stops resolving to "Deleted account". `cachedIdentity` keeps its 5 s cache.
3. The boot identity's `name` for an account without a typed name should be the label, not the email (`resolve.ts` 124), so the email only ever travels in `email` under `showEmail`.

Chrome, one glyph and one word:

4. Beside `trustWordOf`, a `trustMarkOf(identity)` in `IdentityChip.tsx` that returns the `check-badge` glyph at 14 px in `--pt-ink-2` for `verified` and nothing otherwise, drawn after the name in the four places that already draw the guest word: `RosterMenu.tsx` 161, `CommentCard.tsx` 173, `CommentsPanel.tsx` 195, `VersionsPanel.tsx` 317, and in the AccountMenu head (`AccountMenu.tsx` 56). The version row's author span is 140 px with an ellipsis (`VersionsPanel.css` 268 to 276); the badge sits outside that span so it never truncates.
5. `chipName` appends a word for `verified` so the badge is not shape alone. "signed in" reads as a state and matches the menu's "Signed in as"; "verified" is the type's name and the Profile string. One word, used everywhere.
6. The tooltips: `chipTipOf` and the roster tip take `trustTooltip` (`resolve.ts` 29) with the email when the view carries one, which is only when the server put it there for a grant holder. The roster entry needs an `email` field (`channel.ts` 150 to 160) filled by `rosterEntryFor` under the same rule `rosterEntryForReader` applies (`room.ts` 2127 to 2143).
7. Versions: pass the `identityIndex` map as `identities` into the shell input (`controller.tsx` 561 to 580 already builds it for comments and the inbox), or teach `identityOfAuthor` the `usr_` prefix and the label grammar. Without this the badge never reaches a version row.

Where the badge does not go:

- The caret flag: 120 px and 13 characters of capacity (`presence-model.ts` 27); the guest word already yields to the name there. The flag keeps the name only.
- The presence chips of the title row: a 24 px chip has the hue stripe and the presenter triangle already (`IdentityChip.tsx` 173 to 174); a third mark on the chip crowds it. The badge belongs beside the name, where the roster and the tooltip show it. If Kevin wants the title row itself to distinguish accounts, the cheapest honest signal is the tooltip word, not a glyph on the chip.
- Link visitors without the owner's switch: the name is a role word and no badge is drawn (the role word rewrite at `room.ts` 2136 to 2143 already sets `trust: 'label'`).
- A deleted account: "Deleted account" with the default mark and no badge (`resolve.ts` 108 to 119 keeps `trust: 'verified'` for it; the chrome should key the badge on `deleted === false`, which `IdentityView` does not carry today).

Copy, in Kevin's rules (sentence case, no metaphors, one thought per sentence):

- The own chip's menu sentence stays "Signed in as <email>" and "Not signed in".
- The tooltip on a verified name: "Signed in as <email>" for a grant holder, "Signed in" for everyone else who may see the name.
- The accessible name: "<name>, signed in".
- The home row `copy.ts` 697 should say what the deployment does: "Optional. Anonymous by default with a label such as Wax 613. Sign in by email exists on deployments with an identity database." The access page's sign in line should be drawn only when `auth.signIn` is true.

What to decide before building:

- Whether the own chip returns to the default view for this round, or the account state stays behind Advanced tools with the badge drawn on other surfaces regardless.
- The word beside the badge ("signed in" or "verified").
- Whether production gets a database and a mail sender in this round; without both, the surfaces can be built and verified on a preview with `TURBOSLIDE_AUTH_DB` and `TURBOSLIDE_MAIL=capture` (the `accounts.spec.ts` setup) and nothing changes for sellers on production.
