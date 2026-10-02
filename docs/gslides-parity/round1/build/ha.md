# Hotfix builder HA: H2, H3 and H4

Written by hotfix builder HA in the worktree `/Users/kevinliu/repos/Turboslide-next` on `next/round1`, on 2026-10-01 PDT (2026-10-02 UTC). The specification is `docs/NEXT.md` 3.2 (H2 to H4), 4.1.5 and 4.3.3. Lines below are this branch's unless a commit is named.

## Round 1

### What each hotfix changes

**H2, the deck listing scoped to the viewer.** One rule in a new module, `apps/studio/src/server/deck-scope.ts`, answers both callers:

- The deployment's admin bearer (`TURBOSLIDE_TOKEN`), a checkout's cookieless localhost holder, and every caller of a checkout's file store list the whole store, as before.
- Everyone else lists the decks they own and the decks shared with them. A deck is theirs when its access record names them (or an anonymous id linked to their account) as the owner, a live grant names them or their verified address, or they hold a live link of it. The record's general access is read as restricted for this test, so a legacy open deck is nobody's, and the admin flag is read as off.
- An anonymous visitor's `/decks` asks the store for nothing: the page draws this browser's Recent record (`routes/-recent.ts`). The server answers this without resolving the identity when the request carries no account session cookie and no bearer (`server/decks.ts` `pageScope`).
- `/decks` reads `listHomeDecks` (`server/decks.ts`), which also says whether the viewer is the deployment's admin. The admin sees their own and shared decks by default and every deck with the filter `?show=all` (the `home.show` select, drawn for the admin alone). The editor's Open and Import slides dialogs read `listDecks`, scoped the same way.
- The `deck.list` dispatcher handler (`server/actions.ts` `registerHostedDeckActions`, `listingScopeOf`) answers the caller's own and shared decks, anonymous principals included, with and without `includeTrashed`. The window transport (`controller.tsx` `serverSide('deck.list')`, `agent-actions.ts` 53) runs through the same dispatcher, so neither file changed. `authorize.ts` 527 gained a comment and no code: the action has no deck to check, and its handler scopes the answer.
- The caption "Every presentation on this Turboslide is listed here" left `/decks` and `packages/chrome/src/menus/strings.ts` (`HOME.listed`). `HOME.showOwn` and `HOME.showAll` are the filter's two words.

The mechanism differs from NEXT.md 3.2's sentence in one place. NEXT.md says a signed in person reads the `account.decks` views `owned` and `shared`. Those views (`server/index.ts` `accountDecks`, bound at `start.ts` 76) are incomplete on this branch: `noteOwned` is never called, so `owned` always falls back to a record scan that compares the owner with the account id alone and misses the decks made before the sign in under a linked anonymous id; `shared` reads the index's link rows alone and misses grants by email. H2 therefore reads the records directly through `standingOf` (`packages/identity/src/access.ts` 272), which already handles aliases, email grants and link grants, and leaves `account.decks` and `auth/actions.ts` 526 to 544 unchanged (request 4 below).

Cost: an anonymous `/decks` view makes no store listing (it made one head per deck before, about 150 on production per audit-performance 91). A signed in view lists the heads as before and reads each listed deck's access record through the access store's cache (5 s on the blob tier), eight at a time. Production holds no accounts before the realtime flip, so that path does not run there yet. Round 2's index object (NEXT.md 4.2.2 fix 1) replaces the listing for every caller.

**H3, Sign out in one click.** The account menu's Sign out row sent `account.signOut` with `{}`. The action's schema requires `sessionId` or `all` (`packages/schema/src/actions.ts` 5507 to 5509), so the dispatcher refused the input (audit-auth finding 2 recorded it as `signedOut: 0`; on this branch it is an invalid input error). Now:

- `apps/studio/src/editor/EditorRoot.tsx`: the shell's dispatcher sends a menu `account.signOut` with no session named to `EditorAccount.signOut()`. That function reads `account.sessions`, takes the row marked `current`, runs `account.signOut { sessionId }` and reloads the page. On an unsaved `/new` draft the window transport has no stored deck to run on, so there it falls back to the library's `POST /api/auth/sign-out`, which ends the session without the new cookie (request 5).
- `apps/studio/src/server/auth/actions.ts`: signing out the request's own session also mints a fresh anonymous principal and its sealed cookie (`freshAnonymousCookie`, shared with `account.forget`), so the signed out browser reads as a new label to itself and to others; the old anonymous id stays linked and its edits keep the account's name. The library's cleared session cookies and the new identity cookie go out in one `set-cookie` call (`ActionRequestFacts.setHeader` takes a list): `setResponseHeader` replaces a header on each call (`@tanstack/start-server-core` `request-response.js` 127 to 133), so the loop that set the lines one by one kept only the last.

**H4, no dead sign in method.** `packages/chrome/src/dialogs/SignIn.tsx` draws the passkey row only when the deployment offers passkeys (`passkeysAvailable`, which `better-auth.ts` 121 reports false until A5 installs the plugin with `TURBOSLIDE_PASSKEY_RPID`), and then as an enabled method. The greyed row, its `is-later` state and the sentence "Passkeys arrive once the address is final" left the dialog, and `ACCOUNT.signInDialog.passkeysLater` left `strings.ts`.

### Rows and tests

Rows entered in `docs/gslides-parity/focus/core-matrix.json`, each in its hotfix's commit:

| Row | Feature | Driver | Today | Commit |
| --- | --- | --- | --- | --- |
| `decks.list.own-and-shared` | decks | `core/decks.spec.ts` | broken, 3 | H2 |
| `decks.list.action-scoped` | decks | `core/decks.spec.ts` | broken, 3 | H2 |
| `accounts.decks-list-scoped` | share (local) | `e2e/accounts.spec.ts` | not driven | H2 |
| `accounts.sign-out-clean` | share (local) | `e2e/accounts.spec.ts` | not driven | H3 |
| `accounts.no-dead-method` | share | `core/share.spec.ts` | broken, 1 | H4 |

The two local rows read `not driven` where NEXT.md 4.3.3 says broken. The matrix's rule for local rows, which `scripts/probes/core-matrix.test.mjs` 1154 to 1155 asserts ("every local row is not driven today: production holds no account"), wins; each row's note names the difference. The local rows sit before the five Google rows, which the realtime round's tests require to stay the last local rows (1286 to 1290 and 1369).

H4 changed one row of the realtime round: `accounts.google-button`'s driver asserted "the passkey row is drawn under Google". The row's interaction and its driver now read that no passkey row is drawn while the deployment offers none (`e2e/accounts.spec.ts` `GOOGLE_ROWS.button` and the test).

Each commit also bumps the matrix total in `core-matrix.test.mjs` 456 and regenerates the README's generated section (`node docs/readme/what-works.mjs`, between the markers at `README.md` 35 and 88). Both files are shared with the other lanes, so each commit staged HEAD's text with its own edit applied, never the working file, and ran the two test files against that staged text in `.turboslide/ha-stage/` before committing.

Unit tests:

- `apps/studio/src/server/deck-scope.test.ts` (H2): 13 tests, who lists what and which decks a principal's listing keeps.
- `apps/studio/src/server/auth/actions.test.ts` (H3): two new tests, the current session ends and a fresh anonymous cookie is set in one header call; an anonymous browser has nothing to sign out.
- `packages/chrome/src/__tests__/sign-in-methods.test.tsx` (H4): two tests, no passkey row and no roadmap sentence without passkeys; an enabled passkey row with them. `packages/chrome/src/menus/__tests__/strings.test.ts` now asserts the sentence is gone.
- `apps/studio/e2e/home.spec.ts` (H2): the caption assertion became its absence.

### Readings

All on HA's dev server: `apps/studio`, `vite dev --port 4501 -c vite.no-watch.config.ts` with `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_LOCAL_OPEN=1`, the auth database `.turboslide/auth-ha-4501.sqlite`, `TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`, generated secrets and the fake Google pair of `playwright.config.ts`, driven from `http://localhost:4501` under `.turboslide/e2e.lock`. The three hotfixes were in the working tree together for these runs (the load windows were short; the rows of each touch none of the others' code paths), and each commit stages only its own paths. The load is the one minute average at the start and the end of each run.

| Run (UTC, 2026-10-02) | Load | Rows | Result |
| --- | --- | --- | --- |
| 07:01Z to 07:02Z | 36.33 at the start | 8 decks rows | not a reading: started over the bound after a 16.77 reading two minutes earlier; the file's `beforeAll` timed out on a page the dependency optimizer had reloaded behind the mocked HMR socket (two React copies). The server was warmed with one page visit after it |
| 08:23:39Z to 08:24:12Z | 23.41 to 22.23 | `decks.list.own-and-shared`, `decks.list.action-scoped`, and the neighbours `decks.list.read`, `.search`, `.open-recent`, `decks.card.make-a-copy`, `.move-to-trash-undo`, `decks.list.one-card-per-deck` | 8 passed |
| 08:24:18Z to 08:24:54Z | 22.53 to 20.59 | `accounts.google-button`, `accounts.decks-list-scoped`, `accounts.sign-out-clean` | 3 passed |
| 08:24:58Z to 08:25:12Z | 19.66 to 19.34 | `accounts.no-dead-method` | passed |
| 08:25:23Z to 08:25:43Z | 18.42 to 18.26 | the two decks rows again | 2 passed |
| 08:25:43Z to 08:26:21Z | 18.26 to 19.60 | the three accounts rows again | 3 passed |
| 08:26:21Z to 08:26:36Z | 19.60 to 19.59 | `accounts.no-dead-method` again | passed |

The readings of the second runs (each test's annotation):

- `decks.list.own-and-shared` (6.0 s): a fresh browser drew 0 cards; after it made and opened its own deck, `/decks` drew that card alone; the caption count was 0; the spec file's own deck (another principal's) was not listed.
- `decks.list.action-scoped` (5.1 s): the fresh principal's window `deck.list` answered its own deck alone, and 1 deck with `includeTrashed`; `POST /api/actions/deck.list` with its cookie answered 200 with its own deck alone; the cookieless localhost holder answered 200 with 3 decks, the file's deck and the fresh deck among them.
- `accounts.decks-list-scoped` (18.4 s): B's `/decks` and B's `deck.list` held B's own deck and A's deck shared with B by address; A's held A's deck alone; C's anonymous deck was in neither.
- `accounts.sign-out-clean` (12.5 s): 120 ms from the click on Sign out to the reloaded page's load; B read A's verified chip gone 7 ms after that load; A was `usr_…` with trust `verified` before and a new `anon_…` with the label "Chrome 943" and trust `label` after; the identity cookie changed and `get-session` answered `null`; no badge on the own chip or the account menu's head.
- `accounts.google-button` (1.9 s): the methods were `dialog.signIn.google` alone (no GitHub pair on this server, no passkey row).
- `accounts.no-dead-method` (1.9 s): the dialog drew `dialog.signIn.google` alone, no method that cannot complete, no roadmap sentence.

Not run: `apps/studio/e2e/home.spec.ts`, which needs the file store server with its seeded decks; its caption assertion became the caption's absence. No deck was made on any deployment; every scratch deck of the runs was on the tmp store and the specs' teardowns removed them by id.

Unit and static checks, at any load: `deck-scope.test.ts` 13 passed; `auth/actions.test.ts` 11 passed (2 new); `sign-in-methods.test.tsx` and `strings.test.ts` 9 passed; the matrix and README tests (`core-matrix.test.mjs`, `what-works.test.mjs`) 43 passed against each commit's staged text; `tsc -b apps/studio/tsconfig.json packages/chrome/tsconfig.json` exit 0; prettier clean on every file the commits carry.

### Requests

1. To the integrator (and B2 if it takes `/decks/trash`): `/decks/trash` still lists every trashed deck in the store to every visitor (`apps/studio/src/server/decks.ts` `listTrashedDecks`, the next server function after `listHomeDecks`). It is the same defect as H2's for trashed titles; H2's text names `/decks` and `deck.list` alone, so it was left. The fix is one line over the new module: `listScoped(scope, { includeTrashed: true })` filtered to the trashed decks the caller owns.
2. To A2 (Round 3), the owner of `packages/chrome/src/dialogs/accounts.css`: the `.ts-sign-in-method.is-later` and `.ts-sign-in-note` rules are unused after H4. To A5, with the passkey plugin: `passkeysNotice` (`apps/studio/src/server/auth/better-auth.ts` 99 and 122, `PASSKEYS_LATER` at 78) still carries the roadmap sentence into the editor's payload (`apps/studio/src/server/write.ts` 556 and 750); nothing draws it.
3. To B1, the owner of `README.md` 1 to 60: H2 and H4 regenerated the generated "What works today" section (35 to 88) from the matrix, as `node docs/readme/what-works.mjs --check` requires of every push that adds a row. B1's move of the ledger out of the head keeps that check in step.
4. To A1 (Round 3) and the owner of `apps/studio/src/server/index.ts`: `account.decks` `owned` misses decks owned by a linked anonymous id and `shared` misses grants by email (see H2 above). `server/deck-scope.ts` `ownStanding` is the rule `/decks` and `deck.list` now use; `account.decks` can answer from it, or the index can write `owned` rows at `recordNewDeck` and merge them at `onLinked`.
5. To A1 (A1a, NEXT.md 4.3.2 item 1): on an unsaved draft the window transport has no stored deck, so Sign out there falls back to the library's route and keeps the anonymous cookie. Moving the rotation into the sign out route (`apps/studio/src/routes/api/auth.$.ts`) or letting the account actions run without a deck closes it.
6. To B2, the owner of `apps/studio/src/routes/decks.css`: `.ts-recent-lead` (251) is unused after the caption left.
7. To B3a, the owner of `scripts/probes/core-matrix.test.mjs`: the total at 456 gained `+ 3`, `+ 1` and `+ 1` with a comment line each.
