# Lane SA, wave 3a (HR-SA#3 to HR-SA#7)

The notes of lane SA of the hardening round (docs/hardening/HARDENING.md 4.3), wave 3a: pushes 55 to 59 of section 5. The worktree is `/Users/kevinliu/repos/Turboslide-harden3`, branch `harden/wave3a`, made from `origin/main` `f7e97039`. Every load below is the machine's one minute load at the reading; it was 300 to 550 the whole time, so timings are records and the verdicts rest on status codes, rows, statement counts and test counts. Nothing was pushed and production was not read.

## The rig

Every reading ran on the shape production has: two studio processes over one accounts D1 behind the realtime Worker.

- The Worker: `wrangler dev --port 8853` in `apps/realtime-worker` with test values for the three secrets (`--var`), its local state in a scratch folder (`--persist-to`), the migrations applied with `wrangler d1 migrations apply turboslide-accounts --local` (0001 to 0004 for the before readings, 0005 added for the after readings). `/health` answered `db: own`, `statements: enforce`, so every statement went through the accounts list as on production.
- Two studios from `apps/studio`, ports 4853 and 4854 (4854 with `TURBOSLIDE_MAIL=off` for HR-SA#4): `vite dev -c vite.no-watch.config.ts` with `TURBOSLIDE_ACCOUNTS=d1`, `TURBOSLIDE_ROOM_HOST=127.0.0.1:8853`, `TURBOSLIDE_ROOM_INSECURE=1`, the test database bearer, `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/SA-overlay`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_MAIL=capture`, the fake Google pair, test session and download secrets, `TURBOSLIDE_ROOT` set, and `TURBOSLIDE_LOCAL_OPEN`, `TURBOSLIDE_AUTH_RATE_LIMIT` and `TURBOSLIDE_AUTHORIZE` unset (production's settings).
- The before readings ran on `origin/main`'s code for every file of the lane, before any edit; each after reading ran on studios restarted on the push's code.
- The readings are node scripts in the session's scratch folder that print statuses, row counts and sentences, never a key, a cookie or a code. Mail codes were read from `ts_mail` in the local D1 file.

## HR-SA#3: one limiter (AUTH-8, first half)

Commit `c5b4e92b`. The sign in limits of better-auth, the application quotas and the spent set of the one-time download tokens counted in one function instance's memory, so a caller spread over instances passed every limit. They now count in `ts_limits` in the accounts database: one upsert per take that adds the cost to the key's window, starts a new window once the stored one ended, writes nothing past the limit, and returns the row it wrote (a refusal is the answer with no row). Keys are stored as SHA-256 digests; better-auth's key (the address and the path) under the library's secret first. A store that fails counts in memory and logs `config.degraded` once a minute. `start.ts` binds it as the limiter and the spent set when the accounts engine is D1 or Postgres; a checkout on SQLite keeps memory.

| Reading                                                                             | Before (origin/main's code)        | After (this push)                                                     | Load     |
| ----------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- | -------- |
| Ten mail requests from one address on 4853, the eleventh there, the twelfth on 4854 | 200 ×10, 429, then **200** on 4854 | 200 ×10, 429, then **429** on 4854                                    | 553; 433 |
| A download token on 4853, again on 4853, then on 4854                               | 200, 404, **200**                  | 200, 404, **404**                                                     | 442; 436 |
| The Worker's refusals and `ts_db_unlisted` after the after reading                  |                                    | no statement refused, no unlisted row; `ts_limits` 4 rows, no address | 436      |

Tests: `limits.test.ts` 5 of 5 (two runtimes over one fake D1, so two instances: a quota of three across them, a spent token, the library's tenth and eleventh mail; a window that ends, a slot released, a cost above the limit; the prune; a failing store; SQLite keeps memory). `record-statements.test.ts` 8 of 8 after the list was regenerated: four new shapes (the take, the refusal's read, the release, the prune), none left. Worker `limits.test.ts` and `db.test.ts` 16 of 16 (the listed statements on D1 under workerd: up to the limit, no row past it, a new window, the release, the prune). `tsc -b` exit 0.

Deviations from the spec, each on purpose:

- The migration is `0005_limits.sql`: `0004` is HR-K2#3's `ts_db_unlisted`.
- better-auth's limiter counts through `rateLimit.customStorage` over the same limiter, not `storage: 'database'`. The library's database storage reads before it writes and sends five statement shapes of its own to a `rateLimit` table; one table and one counting statement serve all three counters.
- `AUTH_SCHEMA_VERSION` stays. On D1 the table comes from the migration, and `/db` refuses schema statements, so a build that read another version would try to migrate through `/db` and fail; the release before keeps reading the same value and boots on the newer database. The rule is written beside the constant.
- The spent set's `has` and `add` became one `spend` that answers whether this call spent the nonce, so two instances can never both serve one token.

## HR-SA#4: mail off (AUTH-8, second half)

Commit `4d93736a`. With `TURBOSLIDE_MAIL=off` every route of the magic link and code plugins (read from the plugins' own endpoints) and `/sign-in/pair` joins better-auth's `disabledPaths`, which answers 404 before the limiter or any write.

| Reading on 4854, mail off                                                    | Before                                                        | After                                      | Load            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ | --------------- |
| `sign-in/magic-link`, `email-otp/send-verification-otp`, `sign-in/email-otp` | 200, 200, 403; the `__Host-ts.signin_browser` cookie set      | 404, 404, 404; no sign in cookie           | 408 to 471; 418 |
| Rows written by the three requests                                           | verification 6 to 9, `ts_quota` 18 to 20, `ts_mail` unchanged | verification 37 to 37, `ts_quota` 34 to 34 | as above        |

Tests: `mail-off.test.ts` 3 of 3; with `better-auth.test.ts` and `signin-binding.test.ts` 27 of 27. `tsc -b` exit 0.

## HR-SA#5: device keys expire (AUTH-7, CRIT-M14)

Commit `8c86a9c5`. A device key lives 90 days; one minted before with no expiry stops on 2027-01-06, read at every use (`keyExpiry`; the name `turboslide login` marks a device key). An expired key answers 401 `key_expired`; the CLI prints "Your sign in expired. Run turboslide login." with the full command and exits 1; `logout` forgets such a host. `/device` with the code in its address names the scopes and the time the code was made. `device-expiry.test.ts` also pins the device flow's owner binding and Google's account linking (rust.md section 6).

| Reading                                                                           | Before                                    | After                                                                                                                                                                 | Load       |
| --------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| The device flow's key row                                                         | name `turboslide login`, `expiresAt` null | `expiresAt` = `createdAt` + 90 days (2026-10-12T09:06:48Z to 2027-01-10T09:06:48Z)                                                                                    | 359; 358   |
| The key with its expiry moved to the past (the Worker's listed update), 6 s later |                                           | `/api/actions/account.me` 401, code `key_expired`                                                                                                                     | 358 to 378 |
| `bin/turboslide.mjs account me --to <4853>` with that key in a test hosts file    |                                           | exit 1, "turboslide: Your sign in expired. Run turboslide login." and the login command; the key in neither stream                                                    | 378        |
| `GET /device?user_code=<code>`, signed in                                         | the code fields alone                     | "This code asks to read decks, comment on decks, edit decks, export decks and share decks. It was made at 09:07 UTC." and "The terminal stays signed in for 90 days." | 378        |

Read at once after the move (before the instance's 5 s key cache passed) the key still answered 200: HR-SA#6's finding, recorded and then read past.

Pictures, each opened and looked at: `docs/hardening/SA/sa5-device-1440-light.jpg`, `sa5-device-1440-dark.jpg`, `sa5-device-390-light.jpg`, `sa5-device-390-dark.jpg` (27 to 142 kB). The sentence sits under "Type the code your terminal shows.", the lifetime closes the foot line, and both wrap cleanly at 390.

Tests: `device-expiry.test.ts` 5 of 5 (a new key's expiry; a legacy key works on 2027-01-05 and answers `key_expired` from 2027-01-06, a Profile key with no expiry keeps working, a revoked key reads unknown; what /device shows, for its owner alone; a code claimed by one account: another reads no scope and cannot approve, the key is the claimer's; Google with an unverified address does not join an address account, with a verified one it does). `login.test.ts` 6 of 6. With the studio's auth folder, the chrome sign in plate and auth tests, the deck transfer tests and the agent http tests: 297 of 297. `tsc -b` exit 0.

## HR-SA#6: the key cache (AUTH-5)

Commit `e229cafb`. A request with a bearer is primed before the routes' synchronous checks (the request middleware and `requestIdentity`): on the D1 path, a key this instance has not read, or read 5 s ago or more, is read by its hash (a listed statement). The static bearer re-reads the key count while it is zero. A revoke clears the instance's own view.

| Reading                                                                   | Before              | After         | Load            |
| ------------------------------------------------------------------------- | ------------------- | ------------- | --------------- |
| A key minted on 4853, its first request on 4854                           | 401 in 4 of 4 tries | 200 in 3 of 3 | 356 to 377; 313 |
| A key read on 4854, revoked on 4853, read on 4854 0.86 s after the revoke | 200                 |               | 357             |
| A key revoked on 4853, read on 4854 5.5 s later                           |                     | 401           | 303             |
| A key read on 4854, idle 30 s, revoked on 4853, read on 4854 at once      |                     | 401           | 303             |

The bound is the spec's: a revoke elsewhere is refused here at most 5 s after this instance last read the key, however long it sat idle. Within those 5 s an instance may still answer from its read.

Tests: `key-cache.test.ts` 3 of 3 (a cold instance, the bootstrap count, a revoke after an hour idle, one statement per key per window, two runtimes through `requestIdentity`). The auth folder with `auth.test.ts` and `agent-gate.test.ts` 247 of 247 (no new statement shape); agent actions, comments, gate, authorize, room bearer and room 56 of 56. `tsc -b` exit 0.

## HR-SA#7: sessions ended elsewhere (AUTH-6)

Commit `bf602a21`. The library's cookie cache and an instance's session facts keep a session 60 s (`SESSION_CACHE_S`; they kept it 300 s), and a facts miss reads the session row past the cookie cache, so the two caches never stack. The library wraps a failed database read of a session in a 500 `FAILED_TO_GET_SESSION`, so that answer is retried once like the proxy's own error. The Profile dialog says "Other devices are signed out within a minute" under the sessions list, and the two sign out buttons' notes say "within a minute".

| Reading                                                                                                                                                                                                | Before                    | After                          | Load                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------ | ---------------------- |
| Two sessions of one account; the second's cookie on 4854, then every session revoked on 4853 (0 rows), then the second's cookie on 4854 at +65 s: `/api/access/<own deck>` and `/api/auth/get-session` | `200 owner` and a session | `404 not_found` and no session | 438 to 426; 330 to 374 |

No stored `sessionEpoch` was added, against the spec's text. The epoch would be bumped by Sign out everywhere and checked on each cached read: checking a stored epoch on each cached read is a database read per request, which removes the cache; an epoch kept per instance tells the other instances nothing; and Sign out everywhere already deletes the session rows, so the first read after the minute finds none. The 60 s bound is what the row asks for.

Cost: a signed in browser's session facts are read once a minute per instance instead of once every five (four to five indexed rows each), and the library reads the session row once a minute instead of every five.

Tests: `sessions-revoked.test.ts` 2 of 2 (both caches 60 s; a copied cookie on a second instance is an account before the revoke and nobody 61 s after it, through the request identity and through the library's `get-session`); `identity-d1.test.ts` 9 of 9 with the retry of the library's 500; `profile-sessions.test.tsx` 2 of 2 (the sentence under a list with other sessions, Sign out everywhere else answering it; nothing with one session); the studio's auth folder, room, the chrome menu strings, menu model and sign in plate tests 400 of 400. `tsc -b` exit 0.

A finding this push does not fix. The editor never fills the Profile dialog's sessions, keys or `revokeToken`: `EditorRoot.tsx` builds the account without them, and the Profile dialog lives in the editor shell alone. So in the product the Sessions list is empty, "No keys yet" shows for an account with keys, and Sign out everywhere else and a key's Revoke are not reachable from the dialog; the CLI (`turboslide account sign-out --all`, `account tokens revoke`) and the actions reach them. The sentence this push adds shows once the list is filled. Pictures of the dialog as it renders, an account with two sessions and a device key, each opened and looked at: `docs/hardening/SA/sa7-profile-today-1440-light.jpg`, `sa7-profile-today-1440-dark.jpg`, `sa7-profile-today-390-light.jpg`, `sa7-profile-today-390-dark.jpg` (25 to 55 kB). At 390 the head also squeezes the name to "Bis..." beside the two buttons. The wiring needs the `account.sessions` answer (id, createdAt, lastSeenAt, current, userAgent) mapped to the dialog's rows (browser, platform, lastActiveAt) and is a request below.

## Gates every push ran

- `node_modules/.bin/tsc -b` exit 0 at each push (10:57, 6:52, 3:50, 2:41, 0:51 at loads 315 to 451).
- `core-matrix.test.mjs`, `what-works.test.mjs`, `docs-index.test.mjs` and the competitor guard 62 of 62; `what-works.mjs --check` exit 0.
- Brand lint enforce exits 1 on one stale accepted finding, `packages/chrome/src/dialogs/ImportSlides.tsx` ("Select a file from your device"), the same on `origin/main`'s tree; no push of this lane touches the file.
- `prettier --check` on each push's files.

## The rows HR-0 enters for this lane

Both are local rows of `apps/studio/e2e/accounts.spec.ts` (`not driven`, no severity). The bodies, as this lane read the flows:

- `security.device.names-scopes`: a signed in context posts `/api/auth/device/code` with `client_id: turboslide-cli` and the five scopes, opens `/device?user_code=<code>` and reads `[data-control="device.request"]`: "This code asks to read decks, comment on decks, edit decks, export decks and share decks. It was made at HH:MM UTC."; Approve, then the token poll's answer carries `expires_at` 90 days after the key's `createdAt` (`identity-seed.mts` can read the row).
- `security.sessions.revoked-within-60s`: one account signs in in context one and context two; context two loads `/decks` signed in; context one runs Sign out everywhere else from Profile; context two's cookies, copied into a fresh context, load `/decks` 61 s later and read signed out (the Sign In link), and `/api/auth/get-session` answers no session.

## Requests

- To the ship step: HR-SA#3 adds migration `0005_limits.sql`. Run `realtime-env.mjs worker-migrate` and `worker-migrate --env preview` before its deploy. A studio that finds no table counts in memory and logs `config.degraded`, so the order slip is not an outage, but the limits hold only once the table is there.
- To lane O: the spec gave O#2c migration 0005; it is 0006 now.
- To the ship step: this branch's commits are in the order HR-W#3a, HR-W#3b, HR-SD#2, HR-SA#3, HR-SA#4, HR-K2#7, HR-SA#5, HR-SA#6, HR-SA#7. SD#2 (push 60) and K2#7 (push 61) were committed by their lanes before this lane's pushes and touch `start.ts`, `identity.ts` and `better-auth.ts` in other hunks; pushing in branch order ships them ahead of SA#3 to SA#7.
- To lane C (question 18, after SA#3): the Redis and Upstash limiters and `kvSpentSet` are now bound only where neither D1 nor Postgres holds the accounts; with them gone, `ts_quota`'s read then write counters (avatar uploads, device attempts, the per address mail cap) are the last second counter, and could move onto `ts_limits`.
- To lane C or Kevin: `account.tokens.create` still accepts the name `turboslide login`; a Profile key so named with no expiry would read the device keys' 2027-01-06 expiry. Refusing that name for Profile keys closes it.
- To the owner of `apps/studio/src/editor/EditorRoot.tsx` after DD-C#2 (PC#2, C#6 or the orchestrator): fill the Profile dialog's `sessions` (from `account.sessions`, the user agent read as browser and platform), `tokens` (from `account.tokens.list`) and `revokeToken` (`account.tokens.revoke`), and read them again after a sign out or a revoke. Until then Sign out everywhere else and a key's Revoke are not reachable from the dialog (HR-SA#7's finding, with its four pictures).
- To HR-0: the two row bodies above.
