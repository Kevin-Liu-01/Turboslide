# Auth audit, adversarial verification

The verifier of the auth audit. Each finding below was tested by reproducing it on a local server
with production's settings, or by proving from the code that it cannot happen. Default to not real
when neither holds.

## How the reproductions ran

One local studio server on port 4841 from `/Users/kevinliu/repos/Turboslide-harden/apps/studio`:
`TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=<sqlite>`,
`TURBOSLIDE_MAIL=capture`, fake Google variables, `TURBOSLIDE_SESSION_SECRET` and
`TURBOSLIDE_DOWNLOAD_SECRET` (32 bytes each), `TURBOSLIDE_TOKEN` set (production has it,
HOSTING-MOVE.md line 20), `TURBOSLIDE_AUTHORIZE=enforce`, `TURBOSLIDE_ADMIN_EMAILS=boss@example.test`,
and `TURBOSLIDE_LOCAL_OPEN` and `TURBOSLIDE_AUTH_RATE_LIMIT` unset so the bearer rule and the
library limiter run as on production. Two signed in accounts (A, B) through captured magic links;
API keys through the device flow (A: read write; B: read). Every finding that depends on the D1
accounts engine (the Postgres and D1 cache path) is read from the code, because the sqlite harness
takes the synchronous handle, not the cache path. Machine one minute load was 60 to 350 across the
run; every verdict below rests on a status code or a stored row, not a timing measurement.

Scratch: `/private/tmp/claude-501/.../scratchpad/harden/auth-verify/` (`run1.mjs`, `run2.mjs`,
`run2b.mjs`, `run3*.mjs`, `mcp.mjs`, `lib.mjs`). No token, cookie or secret is printed here.

## Verdicts

### AUTH-1 — not real (refuted by reproduction). Severity 0 as shipped; the fix is still warranted.

The claim is that an API key reaches `/api/actions` and is given the deployment admin context by
`bootstrapAgentContext(auth.mode)` (actions.$action.ts:64). It does not. `handleActionRequest`
(`packages/agent/src/http/dispatch.ts:197`) re-runs the **agent package's own** `authorize(request,
env)` (`packages/agent/src/http/auth.ts:76`), which knows only `TURBOSLIDE_TOKEN` and localhost.
With `TURBOSLIDE_TOKEN` set (production), an API key bearer is not equal to the token, so that inner
check answers 401 before any deck handler runs. Reproduced: A's own read/write key and B's read key
both got 401 on `POST /api/actions/deck.info?deck=<A's deck>`, with the agent package's message
`"bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN>"` (no "or an API key"), which
is the inner check, not the studio's. So `bootstrapAgentContext(auth.mode)` is dead code for keys;
the admin context is never reached by a key.

Why the fix still matters: the code is one edit from live. The whole key system implies keys should
work on `/api/actions`; the moment the inner check is relaxed to accept keys (AUTH-1's own proposed
fix path), line 64 grants every key admin on every deck. Build the context from
`requestIdentity(request).ctx` as the finding says, and delete the inner token-only `authorize` call
from the studio's use of `handleActionRequest`, in the same change. See missed finding AV-1.

### AUTH-2 — real, severity 4 (reproduced), and broader than stated.

`/mcp` (routes/mcp.ts:25-31) runs `requireAgentAuth` and then `deckDispatcher(?deck=)` with no
`authorize()` call, so any valid key reaches any deck. Reproduced on the enforce server: account B
holds a key with scope `["read"]` only. B opened an MCP session on A's restricted deck
(`alpha-…`, owner `usr_A`, generalAccess restricted/viewer) and:

- `deck_get_info` → 200, the full title, sections and revision.
- `deck_set {"path":"/title","value":"Written by B over MCP","baseRevision":0}` → 200, revision 1.
- A's own session then read the title as "Written by B over MCP".

So `/mcp` bypasses **both** the per-deck authorize and the per-key scope check: a read scoped key of
an unrelated account wrote a restricted deck. On production (D1 accounts, `TURBOSLIDE_TOKEN` set,
Google sign in), any Google account mints a key (`account.tokens.create` or the device flow) and
reaches any deck it can name over `/mcp`. The production realtime Worker is live (`GET /health` ->
`realtime:"on"`), and `/mcp` is on the Vercel app, not the Worker; the key reaches it directly. Fix
as the finding says: resolve the identity at initialize, `authorize(ctx, deckId, 'read')`, and gate
each tool call by the action's capability and the key's scope (route MCP through the same per-action
authorize `/api/actions` will use once AUTH-1's dead branch is removed).

### AUTH-3 — real, severity 3 (code plus passive production reads).

`apps/realtime-worker/src/index.ts:291-299` serves `/db/query` and `/db/batch` under
`TURBOSLIDE_ROOM_BEARER`, and `db.ts:59-89` runs any SQL string against the bound D1. The accounts
`session` table stores `token` as a plaintext secret equal to the cookie (confirmed by reading the
sqlite schema and a row: `session(id, expiresAt, token, …)`, token length 32, the cookie value), so
one `select * from session` is a full session hijack of every signed in user; `ts_api_key` stores
the hash but leaks ids, owners and scopes.

The bearer is one secret shared across environments. `scripts/hosting/realtime-env.mjs` reads
`TURBOSLIDE_ROOM_SECRET` and `TURBOSLIDE_ROOM_BEARER` from one `room.env` (lines 134, 155-156,
176-178) and `worker-secrets` pipes those same two values to the production Worker and, with
`--env preview`, to the preview Worker (lines 749-750), while `do` sets the same pair on the Vercel
production and preview environments. Both Workers are internet reachable and answer `/health`
(`turboslide-realtime.kk23907751.workers.dev` and `…-preview…`, read passively). So a leak of the
bearer from any preview build or preview environment lets the holder call the **production** Worker's
`/db/query` over the public internet and run arbitrary SQL on the production accounts D1 — every
session token and every account row. I did not forge a `/db` request against production (passive
reads only); the surface is established by the code, the env script and the two public `/health`
answers. Fix: per environment secrets and a separate preview D1; split the database bearer from the
room bearer; narrow `/db` to the Kysely dialect's statement shapes, or move better-auth onto a D1
binding in the Worker's own runtime so no raw-SQL endpoint exists.

### AUTH-4 — real, severity 3 (reproduced); gated on the email method, which production does not run today.

Reproduced end to end on the enforce server. Browser one (anonymous) created a deck; its owner in the
stored record is browser one's anonymous principal `anon_45461…`. Browser one then requested a magic
link for `other-person-…@example.test` and opened it in the same browser. After the open, `ts_alias`
held `anon_45461… -> <that account>` (identity.ts `onSessionCreated` -> `linkAnonymous`, 717-735),
and a **separate** browser signed into that account read `GET /api/access/<browser-one deck>` as
`{role:"owner", via:"owner", owner:"anon_45461…"}`. So the account whose address the link named now
owns the deck another browser made, from any device — read, edit and delete. `packages/identity`
`standingOf` (281-283) matches the record owner against the account's aliases, which is correct once
the alias exists; the defect is that the magic-link verify is bound to no browser, so opening it in a
browser that owns anonymous decks silently donates them.

Production gating, in production's favour: production runs Google only with `TURBOSLIDE_MAIL=off`
(AGENTS.md 396, REALTIME.md 7.7). With mail off the magic link is created but dropped, so an attacker
cannot deliver a usable link today, and the Google path is bound by the state cookie (login CSRF is
closed there). The defect is live code and the round plans to enable mail (R6); under that
configuration it is a real severity 3. As production stands this round it is latent (sev 2). Fix:
bind magic-link verify to the requesting browser (a short lived cookie set at request time), and
confirm before linking an anonymous id that already owns decks.

### AUTH-5 — real, severity 2 (code; the finding's 3 is high for the window).

`tokens.ts` `dbApiKeyStore`: `cached = auth.sqlite === undefined` (212), so Postgres and D1 (the
production engine) take the cache path. `resolveSync` -> `syncRow` (219-232) returns `cache.get(hash)`
and only `refreshIfStale` kicks a background refresh every `KEY_CACHE_MS` (5 s). After a revoke on
another instance, a warm instance keeps answering the revoked key from its cache until a resolve past
the 5 s mark triggers a refresh that then completes — roughly a 5 s plus one request window. The cold
instance case is also real: `if (cached) void refresh()` starts asynchronously and `syncRow` returns
`cache.get(hash) ?? null` meanwhile, so a valid key is refused 401 until the first refresh lands. Not
reproduced on sqlite (it uses the synchronous handle, the non-cache path); the cache path is
deterministic in the code. Bounded to ~5 s, so a real missing defence rather than a serious weakness:
severity 2. Fix: await a point lookup by hash, or refuse when the cache is older than `KEY_CACHE_MS`
and await the refresh.

### AUTH-6 — real, severity 2 (code).

`better-auth.ts:281` sets `cookieCache { enabled: true, maxAge: 5*60 }`, and the signed
`__Secure-ts.session_data` cookie is trusted for 300 s with no database read (the cookie was present
on every signed in jar in the reproduction). `identity.ts` `SESSION_FACTS_CACHE_MS` is `5*60_000` on
the d1 engine (180), and `forgetAccountFacts` (590-600) clears only the instance that handled the
sign out. So after `revokeOtherSessions`, a copied session cookie keeps working for up to ~5 minutes
on any instance that has not re-read the row. Severity 2. Fix: shorten or disable the cookie cache for
sensitive actions, add a revocation epoch the cache checks, and state the delay in the sessions UI.

### AUTH-7 — real, severity 2 (reproduced).

`device-grant.ts:55-60` creates the key with no `expiresAt`. Reproduced: both device keys landed in
`ts_api_key` with `expiresAt: null`. The approval page shows no scopes: `auth-words.ts` `device`
carries `heading`, `lede`, `approve`/`deny` and the foot "Approve only a code you started from your
own terminal," and the `/device` component (routes/device.tsx) prefills the code from `?user_code`.
The CLI requests `scope: 'read comment write export share'` (apps/cli/src/commands/login.ts:72), so a
phishing link to `/device?user_code=…` that a person approves yields a long lived read/write/share key
over that person's account, with nothing on the page naming what is granted. Severity 2 (it is one
approval click from a durable write/share key; a case for 3). Fix: a default expiry, and show the
scopes and the request time on `/device`.

### AUTH-8 — real, severity 2 (code).

`better-auth.ts:293-297`: `storage: secondaryStorage !== undefined ? 'secondary-storage' : 'memory'`,
and production has no Redis (`REDIS_URL` never set, HOSTING-MOVE.md 20), so each instance counts sign
in attempts in its own memory and the count resets on a cold start. The email endpoints still run with
mail off: a `POST /api/auth/sign-in/magic-link` creates the verification row and takes the per address
quota row before any mail is attempted, so unauthenticated posts write rows regardless. Severity 2.
Fix: apply the firewall per IP rules R8/R9, or back the limiter with D1 or KV; refuse the email
endpoints before any database write when mail is off.

### AUTH-9 — real, severity 1 (code; lowered from 2).

`identity.ts` `accountFacts` (538): `admin: profile.admin || adminEmails(env).includes(email)`, and
`onSessionCreated` (726-727) sets the profile admin when the address matches — neither checks
`emailVerified`. Real as a defense in depth gap. But no sign in method on this deployment yields an
account with an unverified address that it chose: Google asserts `email_verified`, and magic link and
email OTP verify by delivery; email and password is not enabled. So there is no current path to an
unverified account on the admin list. Severity 1. Fix: require `emailVerified` before honoring
`TURBOSLIDE_ADMIN_EMAILS`, which is cheap and closes it for any future method.

## Missed, in the audit's own scope

### AV-1 — `/api/actions` is unreachable by API keys; the key write path is the unauthorized one. Severity 2.

Because `handleActionRequest` re-runs the token-only agent authorize (AUTH-1 above), **every** API key
request to `/api/actions` answers 401, whatever the deck or action (reproduced: A's own key got 401 on
its own deck). So the only path a key can drive the studio is `/mcp` — the path with no per-deck
authorize and no scope check (AUTH-2). The two findings compound: the guarded route refuses keys
outright, and the unguarded route accepts them for any deck. Fixing AUTH-1 and AUTH-2 together is the
point: give `/api/actions` the key's real identity and capability check, and give `/mcp` the same one.

### AV-2 — `/mcp` bypasses the read-only kill switch and the write-rate quota too. Severity 2.

`/api/actions` enforces `assertFlag('readOnly')` and `checkQuota('writesPerMinutePerDeck')` before a
write (actions.$action.ts:69-89). `/mcp` (routes/mcp.ts) enforces neither, so an agent's writes over
MCP ignore the deployment's read-only switch (SPEC-3 0.33's safety control) and the per deck write
ceiling. The reproduced B-writes-A over MCP never touched either gate. Fix: run the same `assertFlag`
and `checkQuota` on the MCP write path, alongside the authorize AUTH-2 asks for.
