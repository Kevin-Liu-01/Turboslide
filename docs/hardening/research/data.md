# Hardening research: data authorization and storage

Key `data`. Port 4832. Written 2026-10-08 against the worktree `/Users/kevinliu/repos/Turboslide-harden`
at `0d3920a3` (the tree production serves). Research only: nothing committed, pushed, deployed or
changed on any Vercel, Cloudflare, Google or GitHub setting. Production was read passively (page
loads, response headers, public Blob files). Every finding below was reproduced on a local server on
port 4832 (the environment the task names), stopped before this report was returned. No secret value
is printed; a secret is named by its variable.

Scope: every route and server function that reads or writes data
(`apps/studio/src/routes/api/**`, the `createServerFn` surface, `actions.ts`, `agent-actions.ts`,
`room.ts`, comments, export, download, uploads, logos, fonts, assist), each checked against the
access model (`packages/identity/src/access.ts` `decide`, `apps/studio/src/server/authorize.ts`,
`deck-scope.ts`, link grants, the roles owner/editor/commenter/viewer, anonymous decks), and the
storage (Vercel Blob objects, presence, overlay, retention and deletion).

The headline: the access model is fully built and unit tested, but two deployment facts make almost
all of it inert on production today. (1) `TURBOSLIDE_AUTHORIZE=shadow`, so every authorization
denial is downgraded to an allow. (2) Storage layout v1 is one **public** Blob store, so every
document is readable by URL regardless of any decision. Either one alone lets a stranger read a
deck's content and membership; together they mean production has, in practice, no data authorization.

## Local server used for reproduction

```
cd /Users/kevinliu/repos/Turboslide-harden/apps/studio
TURBOSLIDE_STORE=tmp TURBOSLIDE_OVERLAY_DIR=.turboslide/data-overlay TURBOSLIDE_REALTIME=memory \
TURBOSLIDE_AUTH_DB=.turboslide/auth-data.sqlite TURBOSLIDE_MAIL=capture \
TURBOSLIDE_AUTH_RATE_LIMIT=off GOOGLE_CLIENT_ID=fake-client-id.apps.googleusercontent.com \
GOOGLE_CLIENT_SECRET=fake-secret-for-local-tests TURBOSLIDE_SESSION_SECRET=<32+ chars> \
TURBOSLIDE_DOWNLOAD_SECRET=<32+ chars> TURBOSLIDE_ROOT=/Users/kevinliu/repos/Turboslide-harden \
node_modules/.bin/vite dev --port 4832 --strictPort
```

`TURBOSLIDE_AUTHORIZE` unset (the default, `shadow`) for the shadow runs; `=enforce` for the enforce
runs. `TURBOSLIDE_LOCAL_OPEN` was left unset so the agent surface and the dev gallery behave as on a
deployment. Machine one minute load during the reproductions was 80 to 120 (other sessions' jobs); no
timing below is offered as a verdict.

---

## DATA-1 (severity 4) — production runs `TURBOSLIDE_AUTHORIZE=shadow`, so the whole access model is advisory

**What.** `authorize()` (`apps/studio/src/server/authorize.ts`) runs first in every server function
and route, but in shadow mode a denial does not refuse the call: it is logged and returned as
`ok: true` with a floor role. `authorizeMode()` defaults to `shadow` unless the variable spells
`enforce` (`authorize.ts:77-80`), and the shadow branch turns every denial except a 410 into an allow:

```
// authorize.ts 237-245
const refused = mode === 'enforce' || decision.code === 'gone';
...
const standing = shadowStanding((record as AccessRecord | null) ?? null, ctx, d.now());
return { ok: true, role: standing.role, via: standing.via, shadow: { status, code } };
```

Every read and write handler gates only on `decision.ok`, so a shadowed denial proceeds:
`writeDeckFn` (`write.ts:861-863`, throws only when `!decision.ok`), the ops route
(`routes/api/decks.$deckId.ops.ts`: `decideFor` then `if (!decision.ok)`), `runDeckActionFn`
(`agent-actions.ts:357-361`), and the `decks.ts` / `download.ts` / `render.ts` / `bundle.ts` server
functions through `authorizeRequest`, which throws `DeniedError` only on `!decision.ok`. So in shadow
a stranger may read, write, rename, trash, remove, export and read the access record of any deck,
including a restricted deck owned by someone else.

**Production is in shadow.** The production guard's own smoke of today
(`docs/gslides-parity/polish-two/production/guard/20261008T113510Z-6fd18a49-smoke-production.txt:27`)
records `unsigned thumbnail  302  pass  shadow: the stored object` — the smoke detects the mode from
whether the unsigned thumbnail is refused, and it read shadow. `docs/gslides-parity/realtime/research-hosting.md`
(2026-10-01) lists `TURBOSLIDE_AUTHORIZE` present on production, and `docs/gslides-parity/sync/build/ship.md`
and `docs/gslides-parity/focus/build/b6.md` describe the flip to `enforce` as still pending. The
planned shadow window (SPEC-3 11.5 R3) was one week around the realtime round; it has been open far
longer. Compounding it, production has no accounts database
(`research-hosting.md`: no `DATABASE_URL`, no `BETTER_AUTH_SECRET`), so every principal is an
anonymous cookie and every "restricted" deck is owned by an `anon_<uuid>`; in shadow, every other
visitor is admitted to it.

**Reproduced (local, port 4832).** A restricted record was placed for `gt-brand`
(`owner: anon_1111…`, `generalAccess: { mode: 'restricted', role: 'viewer' }`, no grants) and read by
a fresh anonymous stranger (a different cookie, `Sec-Fetch-Site: same-origin`):

- Shadow: `GET /api/access/gt-brand` → **HTTP 200**, body carries the record
  (`owner`, `generalAccess`, `settings`, `revision`) and `"role":"viewer","via":"open",
"capabilities":["read","presence","export","copy"],"authorize":"shadow"`.
- Enforce (same request, server restarted with `TURBOSLIDE_AUTHORIZE=enforce`): **HTTP 404**
  `{"error":"not_found"}`.

The write path uses the identical `decision.ok` gate, so the same downgrade admits a stranger's
`writeDeck`, `/ops` edit, `deck.trash` and `deck.remove`.

**Fix.** Set `TURBOSLIDE_AUTHORIZE=enforce` on both production projects and redeploy (the flip is
independent of the CSP report weeks and the WAF flip; `docs/gslides-parity/sync/build/ship.md:220`
and `HOSTING-MOVE.md` section 5 hold the exact commands). Read the `authorize.deny` log lines from the
shadow week first and raise any cell that fires on the editor's own traffic, then flip. Keep
`TURBOSLIDE_MISSING_RECORD=open` until every production deck has a record (legacy `gt-brand` has
none), or legacy decks become 404.

**Test to pin it.** The `hosted-smoke.mjs` `unsigned thumbnail` row flips from `shadow` to `403`, and
`apps/studio/e2e/core/*` roles rows run under `TURBOSLIDE_AUTHORIZE=enforce` in `pnpm check` step 26
(they already do on the runner; the gap is production's variable, not the test).

---

## DATA-2 (severity 4) — layout v1 serves every document at a public URL, so authorization is bypassed at the storage layer

**What.** Production runs storage layout v1: one **public** Vercel Blob store
(`turboslide-decks`, host `ggmycvj7j6224ay5.public.blob.vercel-storage.com`). Every document of a deck
lives at a derivable public path under `decks/<id>/` and is served to anyone, with no identity and no
`authorize()` in the path. The exposed objects include:

- `decks/<id>/deck.json`, `decks/<id>/slides/<slideId>.json` — the deck's content.
- `decks/<id>/versions/<n>.json` — every committed version, each carrying the full document snapshot,
  the author identity and the note.
- `decks/<id>/access.json` (blob tier path, `access-store.ts:431` `blobAccessStore` →
  `deckPrefix(deckId) + access.json`) — the membership: `owner`, `grants` (each with the invitee's
  **email address** and role), `links` (token hashes and roles), `publish` (token hash), `requests`.
- `decks/<id>/.turboslide/presence*.json` — who is viewing, with principal ids and display names
  (`HOSTING-MOVE.md` 1.3: 4,149 presence sidecars on the public store).
- `decks/<id>/assets/<file>` — the deck's images, at guessable `assets/` paths (a restricted deck's
  pictures are public by URL; layout v2 is what moves them to an unguessable `d/<id>/<assetKey>/`).

This is research 04 F8, which layout v2 (a second, **private** store) was designed to fix. Layout v2
is **not deployed**: production has no `TURBOSLIDE_BLOB_PRIVATE_TOKEN`
(`research-hosting.md`, `HOSTING-MOVE.md` line 20), so `layoutBlobClient` returns the plain public
client and every document is written public (`packages/store/src/blob-vercel.ts`;
`docs/hosting.md` section 10).

**Reproduced (passive, against production's public store — public files only).**

```
GET https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/gt-brand/versions/1.json
  → 200 application/json, 80,164 bytes   (a full version record: document + authors + note)
GET …/decks/gt-brand/slides/title.json   → 200 application/json, 302 bytes
GET …/decks/gt-brand/deck.json           → 200 application/json, 96,268 bytes, cache public max-age 2592000
```

(`gt-brand` is the public seed deck and has no `access.json`; any claimed or user-created deck does,
at `decks/<id>/access.json`, served the same way. I did not enumerate other users' decks on
production.) The mechanism is confirmed locally and in `hosting.md` section 10, which states the
problem and names layout v2 as the unshipped fix.

**Impact.** Even once DATA-1 is fixed (enforce), a `viewer`-link holder, or anyone who learns or
guesses a deck id, reads the deck's slides, every past version, the owner and every collaborator's
email address, and the live presence of viewers — directly from the store, below the application. A
viewer who is later removed keeps reading by URL; a revoked link does not revoke the object.

**Fix.** Create the private documents store and run the migration of `docs/hosting.md` section 10
(Kevin creates the paid store; the migration is `turboslide admin migrate-storage plan|copy|verify|cutover|delete`),
so `deck.json`, `slides/`, `versions/`, `snapshots/`, `access.json`, `comments/`, `leases.json` and
the per-principal index move to `access: private` and the twins move to the unguessable
`d/<id>/<assetKey>/` layout. Until then, treat every deck on production as world-readable and tell
Kevin so.

**Test to pin it.** The `hosted-smoke.mjs` rows `private document 403` and `twin URL not derivable`
(today listed as skipped "until the private store exists") must pass; add a migration `verify` gate.

---

## DATA-3 (severity 2) — produced exports outlive the deck and stay public by URL

**What.** `deck.remove` deletes only the `decks/<id>/` prefix (plus the copies, presence and pulse):
`packages/store/src/blob-store.ts:2907-2935` lists and deletes `deckPrefix(deckId)` and never the
`exports/<deckId>/` or `bundles/<deckId>/` prefixes, although `export-batch.ts:76` claims
"`deck.remove` … cover it". Produced PPTX and PDF exports are stored under
`exports/<deckId>/<jobId>/<name>` on the **public** store and their `?download=1` public URLs are kept
in the export job record (`export-sync.ts:34`, `hosting.md` section 4). So a deck's exported file
survives the deck's deletion and the revocation of its access, and is readable by URL by anyone.
`HOSTING-MOVE.md` 1.3 measured the drift: `exports/` held 2,114 objects for **219 deck ids while 72
decks exist**, 206 objects over seven days old (200 MiB) — exports of deleted decks, still public.

**Impact.** A confidential deck that was exported and then deleted (or whose sharing was revoked)
remains downloadable by anyone with the URL, which was handed to the browser as a bare public-store
link. Deletion does not delete.

**Fix.** Make `deck.remove` also delete `exports/<deckId>/` and `bundles/<deckId>/`; stop minting bare
public-store URLs for produced exports and serve them only through the signed `/api/download/<token>`
route (15-minute, single-use token, `download.ts`), or move `exports/` and `bundles/` to the private
store. Prune produced export files on the deck prefix the audit shows is accumulating.

**Test to pin it.** A unit test over the blob store fake: `remove(deckId)` leaves no object under
`exports/<deckId>/` or `bundles/<deckId>/`; a `hosted-smoke` row that a produced export URL is not a
bare public-store URL.

---

## DATA-4 (severity 2) — replaced and deleted avatars stay readable, and survive account deletion

**What.** Avatar pictures land under the public `u/<avatarKey>/` prefix with a year of cache
(`security.md` section 10, `upload.ts`). A replaced picture stays readable at its old (unguessable)
URL until the cache expires, and files under `u/` are removed **only** by `admin.avatar.sweep`
(`auth/actions.ts` `registerAdminActions`, admin-gated, needs the accounts database) — never by
`account.forget` or an account deletion. So a profile picture outlives the account that set it and the
person who deletes their account cannot cause it to be removed.

**Impact.** Personal data (a face) persists after deletion and after replacement; `account.forget`
does not reach it. Lower reach than DATA-1/2 because the key is unguessable, but it is retained
personal data a deletion should remove.

**Fix.** On `account.setAvatar` replacing a picture and on account deletion/`account.forget`, delete
the prior `u/<avatarKey>/` object (or move avatars to the private store and serve through a signed
route). Run `admin.avatar.sweep` on a schedule once the accounts database exists.

**Test to pin it.** A unit test: setting a second picture deletes the first object; `account.forget`
deletes the principal's avatar objects.

---

## DATA-5 (severity 1) — the access route discloses the enforcement mode

**What.** `GET /api/access/<id>` returns `"authorize": authorizeMode()` in its body
(`routes/api/access.$.ts:31`), telling any caller whether the deployment is in `shadow` or `enforce`.
Combined with DATA-1 this hands an attacker the one fact that tells them authorization is not being
enforced. The response also carries `server-timing: cold;dur=…` on cold starts.

**Fix.** Drop `authorize` from the response body (the editor does not need it; the role and
capabilities already shape the UI), or gate it to the admin. Strip `server-timing` detail from public
answers.

**Test.** A `hosted-smoke` assertion that `/api/access/<id>` carries no `authorize` field.

---

## What is well built (checked, no finding)

- The agent surface (`/api/actions/*`, `/api/agent`, `/mcp`) runs `requireAgentAuth` before the deck
  is opened, refuses off-localhost without a bearer, compares the bootstrap token and API keys in
  constant time (`auth/tokens.ts` `resolveBearerSync`, `auth.ts`), confines the static bearer to
  `admin.bootstrap` once a key exists, and refuses a browser `Origin` that is not the studio's
  (`refuseForeignOrigin`). `?author=` and the body author are never trusted for identity
  (`authorFor`, `SPEC-3 8.2`).
- The Worker callback routes `/api/decks/<id>/seed` and `/checkpoint` require the room bearer in
  constant time (`room-bearer.ts`, constant-time compare) and 401 without it.
- The room ticket route decides `read` before minting, binds the client id to the session, and the
  ticket's `org` claim (not the host) bounds which page may open a socket
  (`routes/api/decks.$deckId.ticket.ts`, `room.ts` `decideFor`). The ops route re-decides `write`
  vs `comment` per POST and binds the client id (`admitOps`).
- `deck.list` is scoped to the caller's own and shared decks on the hosted tiers
  (`deck-scope.ts` `listingScope`), so there is no mass deck enumeration through the action (the
  enumeration risk is the public store of DATA-2, not the listing).
- `admin.*` account actions call `requireAdmin` (`auth/actions.ts`); `admin.flag` and
  `admin.assignOwner` are reached only after `authorize()` (today the bootstrap bearer / checkout
  holder is the admin; once the record store binds, `admin`-capability only).

These are the reason DATA-1 and DATA-2 are the whole story: the request-time checks and the agent
boundary are sound; what is missing is that the checks are not enforced (DATA-1) and the data sits in
the open underneath them (DATA-2).
