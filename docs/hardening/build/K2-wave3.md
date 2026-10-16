# K2, wave 3a: Google's tokens at rest

Lane K2 of the hardening round (`docs/hardening/HARDENING.md` 4.2), wave 3a: HR-K2#7 (SPEC-2), push 61, after HR-SD#2 (push 60). Worktree `/Users/kevinliu/repos/Turboslide-harden3`, branch `harden/wave3a` from `origin/main` `f7e97039`, 2026-10-12. Port 4852, Worker port 8852. The other K2 pushes shipped in wave 1 (`docs/hardening/build/K2.md`); HR-K2#4 and HR-K2#6 are not in this run.

## The commit

| Push    | Commit     | Ships                                                                               |
| ------- | ---------- | ----------------------------------------------------------------------------------- |
| HR-K2#7 | `72d0a28d` | now. No step of Kevin's, no migration, no new variable; it rolls back alone (below) |

Files: `apps/studio/src/server/auth/better-auth.ts`, `apps/studio/src/server/auth/google-tokens-at-rest.test.ts` (new), `docs/security.md` (section 12, the new subsection "Google's tokens at rest (HR-K2#7)").

Its place on the branch: after HR-SA#4 (`4d93736a`), which followed HR-SD#2 (`34e08c3e`, with its test and notes commits `a7e2aae2` and `3b3d804b`). It was committed while `better-auth.ts` held no other lane's uncommitted edit, so it sits before HR-SA#5 to HR-SA#7. It shares no line with them: SA#5 and SA#6 edit `tokens.ts` and `device-grant.ts`, and SA#7's line in `better-auth.ts` is the cookie cache, which this push does not touch.

## What the push does, and the correction to the spec

The spec's text for HR-K2#7 says `account: { encryptOAuthTokens: true }` stores Google's access, refresh and ID tokens encrypted. better-auth 1.7.4 encrypts the access and refresh tokens alone: every write of an account (`api/routes/callback.mjs` 184 to 197, `oauth2/link-account.mjs` 103 to 105, 150 to 152 and 205 to 207) passes those two through `setTokenUtil` and stores `idToken` as Google sent it. A Google ID token is a JWT that Google signs for this deployment's client, and for an hour after the sign in it is a sign in by itself: `POST /api/auth/sign-in/social` with `{ provider: 'google', idToken: { token } }` checks it against Google's key set (with no nonce posted, no nonce is compared) and signs in as its person. So the push is two settings in `better-auth.ts`:

1. `account: { encryptOAuthTokens: true }`: the access and refresh tokens are stored encrypted under the library's secret (`BETTER_AUTH_SECRET` per environment on Vercel; the Worker never holds it), so the database bearer and the accounts export read ciphertext.
2. `disableIdTokenSignIn: true` on the Google provider: the ID token path of `/sign-in/social` and of `/link-social` answers 404 `ID_TOKEN_NOT_SUPPORTED`. Nothing in the studio, the CLI or an agent signs in with an ID token (no caller of either route sends `idToken`, and the one tap plugin is not installed), so the stored ID token is no sign in here.

Removing the stored ID token altogether (an account hook that writes `null`) was the other way. It would add a second mechanism to the push for the same result, since the token's only use is the path the setting closes.

Rows stored before the deploy: the library decrypts only a value that looks encrypted (hex, or `$ba$`), and Google's tokens are neither, so a plain row reads as it is and the person's next Google sign in rewrites it encrypted. No one time rewrite is needed. The studio has never asked Google for offline access (`prompt: 'select_account'` and no `accessType` since `023e5c48`), so production's rows hold no refresh token, and a Google access token and ID token expire an hour after the sign in that stored them. Rolled back alone, the build before reads an encrypted access token as ciphertext; nothing in the studio reads it, and the next Google sign in stores a plain one again.

## Readings

The one minute load is in parentheses. Settings for every security reading: `TURBOSLIDE_LOCAL_OPEN`, `TURBOSLIDE_AUTH_RATE_LIMIT` and `TURBOSLIDE_AUTHORIZE` unset (production's), `TURBOSLIDE_MAIL=capture`, the fake Google pair (`GOOGLE_CLIENT_ID=fake-client-id.apps.googleusercontent.com`). Google's token endpoint and key set were answered by a Node preload in the lane's scratch folder with test values (an RSA key made per run, an ID token signed with it). Every secret was a random test value made in the launcher and never printed.

The unit test (gate 6, the reproduction the push's text names), `google-tokens-at-rest.test.ts`:

- On `origin/main` `f7e97039` (04:29 and 05:00 UTC, load 230 and 405): 3 failed. The stored access token equals Google's (`expected 'ya29.k2-test-access-…' not to be 'ya29.k2-test-access-…'`), and the stored ID token posted to `/sign-in/social` answered `{ status: 200, signedInAs: 'cy@example.test' }` where `{ status: 404, signedInAs: null }` was expected.
- With the change: 3 passed (04:35 and 05:01 UTC, load 268 and 405), and in the commit's lock on the branch's HEAD `4d93736a` with the three files applied: `google-tokens-at-rest`, `better-auth`, `record-statements` and `token-at-rest`, 4 files, 31 tests passed (08:56 UTC, load 390).

The lane's server on 4852, a dev server from a sparse scratch checkout of `f7e97039` (its packages resolved to this worktree's), one Google sign in through `/api/auth/sign-in/social` and `/api/auth/callback/google` per reading, then the row read as stored, `/api/auth/get-access-token`, and the stored ID token posted to `/api/auth/sign-in/social` from a client with no cookie:

| Engine                                   | Build      | Stored access token          | Read back  | Stored ID token posted as a sign in                       | Load |
| ---------------------------------------- | ---------- | ---------------------------- | ---------- | --------------------------------------------------------- | ---: |
| SQLite (`TURBOSLIDE_AUTH_DB`), 04:48 UTC | `f7e97039` | Google's value               | 200, equal | 200, a session cookie, signed in as the person            |  537 |
| SQLite, 04:54 UTC                        | the change | hex ciphertext, not Google's | 200, equal | 404 `ID_TOKEN_NOT_SUPPORTED`, no cookie, nobody signed in |  355 |
| SQLite, the before row signed in again   | the change | rewritten as hex ciphertext  | 200, equal | 404, no cookie                                            |  367 |
| D1 through the local Worker on 8852      | `f7e97039` | Google's value               | 200, equal | 200, a session cookie, signed in as the person            |  437 |
| D1                                       | the change | hex ciphertext, not Google's | 200, equal | 404 `ID_TOKEN_NOT_SUPPORTED`, no cookie, nobody signed in |  390 |
| D1, the before row signed in again       | the change | rewritten as hex ciphertext  | 200, equal | 404, no cookie                                            |  390 |

The D1 rows are production's engine: `wrangler dev --port 8852` of `apps/realtime-worker` at `f7e97039` with its own `--persist-to` D1 (migrations 0001 to 0004 applied, `/health` `db: own`, `statements: enforce`) and test values in a 600 `.dev.vars`, the studio with `TURBOSLIDE_ACCOUNTS=d1`, `TURBOSLIDE_ROOM_HOST=127.0.0.1:8852` and `TURBOSLIDE_ROOM_INSECURE=1` (08:39 to 08:42 UTC). The row was read the way a holder of the database bearer reads it: `POST /db/query` under the database bearer with the listed statement by provider and subject (`select "primary".* from (select * from "account" where ("account"."providerId" = ? and "account"."accountId" = ?) limit ?) as "primary"`), 200 each time. Before the change that answer held Google's access token and an ID token that signed in as the person: the full path from the database bearer to a session. After the run, `/control/db-unlisted` answered `{"shapes":0,"rows":[]}`, and the Worker's log held 82 `POST /db` calls and no refused statement. No Google refresh token was issued in any reading, as with Google itself without offline access.

## Gates

1. `node_modules/.bin/tsc -b` from the root: exit 0, 08:57 to 08:58 UTC (load 385 to 388), on `72d0a28d` with SA#5's uncommitted `tokens.ts` and `device-grant.ts` in the tree. Before the commit, the two files were checked over the studio's options in the scratch checkout with no error in either (04:33 UTC, load 302).
2. `apps/studio` auth unit tests with the change in the scratch checkout (04:57 to 05:00 UTC): 22 files, 203 of 210 passed at vitest's default 5 s, and 7 timed out at 5 s (load 446): `authorize.test.ts` 2, `actions.test.ts` 1, `avatar.test.ts` 1, `record-statements.test.ts` 3. Those four files again with `--testTimeout=180000`: 47 of 47 passed (load 412 to 428). A timing at a load over 24 is not a verdict; the counts are. The in-lock run is under Readings.
3. Brand lint enforce (`.turboslide/brand-lint-K2.json`): 0 open findings, 21 accepted; exit 1 on one stale acceptance that predates the lane (`gt-ui/cta-title-case` in `packages/chrome/src/dialogs/ImportSlides.tsx`, "Select a file from your device", whose label `5142310c` DD-fix#9 changed; the W lane's run at 04:38 UTC reads the same). The competitor guard passed.
4. `core-matrix.test.mjs`, `what-works.test.mjs`, `docs-index.test.mjs` and the competitor guard: 4 files, 62 tests passed; `node docs/readme/what-works.mjs --check`: current. The push enters no row.
5. Prettier: the three files pass `--check`.
6. Readings above.
7. Not run: the push changes no surface a person sees and no client module (`better-auth.ts` is server only).
8. The Google rows on the lane's server (this worktree at `72d0a28d`, the orchestrator's dev server environment with the fake Google pair, `TURBOSLIDE_AUTH_DB` and `TURBOSLIDE_OVERLAY_DIR` absolute): `core-gate.mjs --only accounts --rows accounts.google-button,accounts.google-leaves,accounts.google-error-sentence`. The first run (08:59 to 09:01 UTC, load 382 to 351) read `accounts.google-button` red and the other two not driven: the setup's `newDeck` waited 90 s for an editor that never hydrated, because the dev server's first page load mixed two dependency optimizer versions of React (`react.js?v=7376d509` against `react-dom_client.js?v=bfe2ba21`, "Cannot read properties of null (reading 'useContext')" in `RootDocument`), the cold start of a dev server and not a row. The second run on the same server (09:02 to 09:04 UTC, load 353 to 355): 3 passed, zero retries, verdict ok. `accounts.email-hidden-without-mail` needs a second server with `TURBOSLIDE_MAIL=off` and was not run; the push changes nothing it reads.
9. `node scripts/check.mjs --audit`: exit 0, 0 advisories at high or above (05:11 UTC, load 342).
10. No pictures: no surface a person sees changed.

Every server and the local Worker were stopped before the lane returned (4852 and 8852 free). The scratch checkout was removed.

## Requests

1. To the ship step: `72d0a28d` ships alone and needs no `worker-migrate`, no variable and no step of Kevin's. Its pin is the unit test; no hosted smoke row reads it.
2. To lane SA: `better-auth.ts` carries HR-K2#7's three insertions since `72d0a28d` (the header sentence, `disableIdTokenSignIn` in the Google provider, `account: { encryptOAuthTokens: true }` above `user`). SA#7 edits the cookie cache in the same file; keep the three. `google-tokens-at-rest.test.ts` fails if either setting leaves.
3. To the orchestrator, for `HARDENING.md`: the SPEC-2 row and HR-K2#7's text say the ID token is stored encrypted. The library encrypts the access and refresh tokens alone; the ID token is stored as sent and is closed by `disableIdTokenSignIn`. `docs/security.md` section 12 and this file record the correction.
4. To HR-0, when it enters rows: HR-K2#7 adds no matrix row. Its pin is the unit test, which runs in the auth suite (`apps/studio` vitest project).
