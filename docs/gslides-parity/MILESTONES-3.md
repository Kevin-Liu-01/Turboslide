# Google Slides parity build round three

Companion to `docs/gslides-parity/SPEC-3.md` (the addendum this round builds; section numbers below refer to it unless prefixed SPEC or SPEC-2) in the shape of `MILESTONES.md` and `MILESTONES-2.md`. One round, six builders with disjoint file ownership, an integrator, a verifier, a fixer round and a ship step. Written 2026-09-13 against `main` at `61b16e4` (the working tree carries `28cb63b`, a README change; another workflow edits `README.md` and `docs/readme/` during this round and nobody here touches them). Every acceptance command runs from the repository root at `/Users/kevinliu/repos/Turboslide` unless the row says otherwise. Estimates are agent hours judged from rounds one and two.

Rules (AGENTS.md is the contract; the round one and two rules stand):

- Shared checkout, disjoint ownership per the "Owns" lists below, as the files exist in the tree today (`git ls-files` at `61b16e4`) plus the new files each row names. A builder edits only the files named in their row. A change needed elsewhere is a request in the builder's own file `docs/gslides-parity/build-3/<key>.md` and the integrator makes it or reassigns it. Never edit another builder's files, never revert another builder's work, never run git write commands (read only git is fine).
- Never run `pnpm install`, `pnpm add` or `pnpm exec` (implicit install); call binaries as `node_modules/.bin/<tool>` or `node <script>`. Never run `pnpm build` or `vite build` (the integrator builds); typecheck with `node_modules/.bin/tsc -b` and run vitest per package (`cd <package> && ../../node_modules/.bin/vitest run`). A dev server is `TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory node_modules/.bin/vite dev --port <port>` from `apps/studio` on the port the builder's row names, always with the tmp store and the memory channel so no spec writes `decks/` or needs a service; stop it before returning; never touch 4321, 3005 or another builder's port. Playwright runs against the builder's own server with `PLAYWRIGHT_BASE_URL=http://localhost:<port>` and never overlaps: take `.turboslide/e2e.lock` with `mkdir` before `playwright test`, `rmdir` it after, and wait while it exists. One browser page at a time.
- New dependencies are named in the builder's report and added by the integrator to the catalog (`better-auth`, `@simplewebauthn/server`, `@simplewebauthn/browser`, `resend`, `ioredis`, `@upstash/ratelimit`, `dompurify`, `kysely`, `pg`, `ulid`); a builder never installs one. Every `node:` import stays out of browser safe packages (`packages/realtime` outside `redis.ts`, `packages/identity`, `packages/effects` outside `io.ts`); `scripts/check-client-bundle.mjs` is the gate.
- Copy rules (Kevin): plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings, full sentences in body; labels are Google's words; agent vocabulary never appears in the default view or its tooltips; the refusal sentences of SPEC-3 6.8 are data in `menus/strings.ts` and are used verbatim.
- Mimic Google's structure, labels, positions, shortcuts and behaviours; never copy Google's icons, logos or artwork; icons are Heroicons 20 solid from the theme sprite; the identity marks are drawn by `packages/identity` and nothing else.
- Every new behaviour has a unit test or an e2e spec; never weaken an existing test to pass; the Perfect export of the GT deck stays pixel identical (compare-to-shoot at 0.5 percent); the canvas fidelity gate stays green; the migration test keeps the GT deck and the templates unchanged; every new document field is optional at schema version 1; `text.replace` keeps its meaning (SPEC-3 0.4).
- Nothing of this round is claimed done until the acceptance commands exit 0 and the report file `docs/gslides-parity/build-3/<key>.md` exists with the commands run and their results; durable notes go into the repository, never only into a scratchpad. Never sign in to any account; never print `TURBOSLIDE_TOKEN` or a key; previews run with `TURBOSLIDE_MAIL=capture`.

Baseline: `main` at `61b16e4` plus `28cb63b`. The working tree is clean apart from the design and research documents of this round under `docs/gslides-parity/` and the untracked `.github/`, which stays untracked until the integrator commits the workflow.

## The order

```
Day 1                                 Day 2                     Days 2 to 6                              Day 7            Day 8            Day 9
B1 principalId, text.splice/mark,  ─► merge 1b ─┐           B1 transform, comments.ts, access.ts,     merge 2 ──────►  verifier ──────► fixer round ──► ship
   PictureDither, variants, the       (redis      │              actions, CLI, MCP, contracts, fonts     (integrator:     (preview:        (each in own      (R0 to R5
   64 action ids, GS3, groups         channel,    │           B2 redis and blob channels, checkpointer,  pnpm check,      latency, load,   files; second     on production,
B2 packages/realtime interface,       decide())   │              room client, edit route, stores,        preview deploy,  CLS, security,   verifier pass)    R7 beside,
   protocol, putAsset, coalesce       ─────────── ┼─►            private store, migration                migrate on the   S1 to S4,                          R6 on Kevin's
B3 packages/identity skeleton,                    │           B3 better-auth, cookie, principal record,  preview store)   unverified list)                   domain, R8 dated)
   the cookie, decide() signature                 │              alias, avatar route, tokens, device
B4 SERVER_SIDE_WINDOW_ACTIONS,                    │           B4 authorize call sites, limits, headers,
   authorize() wrapper, R0 edits                  │              CSP, safeFetch, uploads, sanitizer,
B5 renderer DOM classes, img size                 │              frame, flags, log, rules.json, check
B6 editor-shell.ts contract, strings              │           B5 dither pipeline, variants, renderer,
integrator: merge 1 (day 1 evening),              │              export, dialog rows, Dither section,
   catalog, playwright config,                    │              CLS route fixes, skeletons, audit script
   vitest project list, AGENTS.md ◄───────────────┘           B6 title row, roster, cursors, comments
                                                                 panel, inbox, Share, versions, dialogs
```

- Day 1: every builder lands their seam (the next section) in their own files; B4 also lands the R0 edits of SPEC-3 11.5 (the dependency bumps go through the integrator's catalog change in the same merge). The integrator adds the catalog entries, `packages/realtime` and `packages/identity` to `pnpm-workspace.yaml` (they match `packages/*` already; the `package.json` files are the integrator's), `firewall/`, the dev server exception and the port table to AGENTS.md, and merges everything as merge 1 on the evening of day 1 so every builder types against real seams from day 2.
- Day 2: B2 lands the `redis` channel against a fake and B3 lands `decide()` with its matrix test; the integrator merges them as merge 1b the same evening, because B4 wires `authorize()` through `decide()` and B6 renders the role predicates from day 3.
- Days 2 to 6: the six builders build in parallel against merge 1 (merge 1b for the matrix and the channel). The integrator keeps `pnpm generate:contracts` current, makes the requests, and wires nothing in the edit route (B2 owns it this round, MILESTONES-2's integrator ownership of `edit.$deckId.tsx` does not carry over).
- Day 7: merge 2 in the order B1, B2, B3, B4, B5, B6; `pnpm check` on the merged tree; the preview deployment with the Marketplace installs and the environment of SPEC-3 11.4; `turboslide admin migrate-storage` run to its dual read window on the preview store.
- Day 8: the verifier's pass: the preview measurements of 16.7, the load test, the CLS run, the security rows, the sales situations S1 to S4, the unverified list.
- Day 9: the fixer round in each builder's files (step 21's finding 28 included), the second verifier pass, the ship step with R0 to R5 on production, R7 beside R5, R6 waiting on Kevin's sending domain, R8 dated by Kevin.

## The seams every builder types against

Fixed by SPEC-3 so the parallel builders need no negotiation; every builder lands theirs on day 1 and the integrator merges them as merge 1.

- The document (B1, `packages/schema`): `Author.principalId?`, `text.splice` and `text.mark` in `MUTATION_OPS` with reducer cases and inverses (3.1), `PictureDither` on `picture` and `shot` and `Asset.variants` (10.1), `HtmlBlock.htmlSanitized?`, the link scheme refinement, `VersionRecord.ops?` (a type in `packages/store/src/store.ts`, B2), `packages/schema/src/{comments,access,transform}.ts` with their types and zod schemas (`resolveAnchor`, `shiftAnchors`, `AccessRecord`, `Capability`, `Role`, `Decision`, and the transform function signatures as stubs that throw `NotImplementedError` until day 3), the 64 action ids of section 12 in `ACTION_IDS` with `group`, `milestone: 'GS3'`, `input`, `output`, `cli`, `mcp` and `example` (handlers may throw `NotImplementedError` until their builder lands them), `ActionGroup` and `Milestone` extended.
- The channel (B2, `packages/realtime`): `RealtimeChannel`, `Entry`, `RoomEvent`, `PresenceState` and the message shapes of 3.3 as `protocol.ts` zod schemas; the `memory` implementation; `keys.ts`; `DeckStore.putAsset` and `removeAsset` on the contract in `packages/store/src/store.ts` with the `file`, `tmp` and `blob` implementations (the R0 asset write fix, SPEC-3 0.39); `selectRealtime(env)`.
- Identity (B3, `packages/identity`): `Principal`, `AuthContext`, `MarkSpec`, `Trust`, the signatures of `decide()`, `resolvePrincipal()`, `markSpec()`, `labelFor()`, `hueFor()`, `normalizeName()`; the `principalId` formats `anon_<uuid>`, `usr_<id>`, `agent:<tokenId>`; the sealed cookie reader `readPrincipal(request)` in `apps/studio/src/server/auth/session.ts`.
- The server wrapper (B4): `authorize(ctx, deckId, capability)` in `apps/studio/src/server/authorize.ts` calling B3's `decide()` over B2's access store, in shadow mode by default (`TURBOSLIDE_AUTHORIZE=shadow | enforce`); `SERVER_SIDE_WINDOW_ACTIONS` extended by the ids of SPEC-3 11.3 with `runDeckAction` dispatching to `NotImplementedError` handlers until they land.
- The renderer's DOM (B5): `.picture[data-dither][data-dither-key][data-dither-state]`, `canvas.picture-dither`, `img[width][height]` on every emitted image, `iframe.ts-x-frame` for `html` blocks (the element B4's frame module fills), `.ts-flag`, `.ts-remote-outline`, `.ts-remote-pointer`, `.ts-following`, `.ts-comment-marker`, `.ts-presence` as the class names B6 draws against.
- The chrome contract (B6, `packages/chrome/src/editor-shell.ts`): `EditorShellInput` gains `presence`, `comments`, `inbox`, `access`, `account`, `sync`, `role`, `capabilities`, `mode`; `PanelId` gains `comments`, `inbox`, `activity`; `DIALOG_IDS` gains `namePrompt`, `signIn`, `profile`, `avatarBuilder`, `notificationSettings`, `requestAccess`, `publish`; `EditorHandle` gains `followClient`, `goToClient`, `openComment`, `ditherPreview`, `setMode`; the strings of SPEC-3 6.8 and 15 in `menus/strings.ts`; the menu rows of section 13 with `GS3_ACTION_IDS` and the role predicates.

## B1 Document, transform, comments and access types, actions, CLI, MCP, contracts, fonts, lint, fixture deck

Estimate: 84 agent hours. The seams land on day 1 because every other builder reads them; the MCP budgets gate the tool list before any new tool is served.

### Inputs

SPEC-3 sections 0 (0.4, 0.19 for the name rules as data, 0.36, 0.40, 0.47), 3.1, 5.1, 5.9, 6.1, 6.9, 7.9, 10.1, 10.5, 11.1, 12, 16.1 (steps 3 and 5), 16.6 (the schema, cli, mcp, agent and fonts rows), 9.2 G1; reports 02 3.3, 06 4.1 and 5, 08 1 and 8, 09 1.1 and 7, 05 4 (the fallback face).

### Owns

`packages/schema/src/**` (every existing file including `mutations.ts`, `reduce.ts`, `diff.ts`, `blocks.ts`, `assets.ts`, `actions.ts`, `text.ts`, `validate.ts`, `rules.json`, the tests; new `comments.ts`, `access.ts`, `transform.ts` and their tests), `packages/lint/src/**` (the rules `picture/blank-twin`, `picture/plate-clear`, `html/sanitize` as a `fix` rule calling B4's `@turboslide/render/sanitize`), `packages/lint/fixtures/index.json`, `packages/fonts/src/**` (`inter.css` with the metric matched fallback face, `inter.ts`, `inter.test.ts`) and `scripts/build-fonts.py`, `packages/agent/src/generate/**`, `packages/agent/generated/**`, `packages/agent/src/__tests__/**`, `packages/agent/src/dispatch.ts`, `packages/agent/src/index.ts`, `packages/mcp/src/**`, `apps/cli/src/**` (`store-actions.ts`, `cli.ts`, `hosts.ts`, new `commands/{comment,share,account,presence,follow,admin,dither,login}.ts` and their tests), `apps/cli/e2e/**` (new `share.mjs`), `apps/studio/src/routes/{mcp,llms[.]txt,llms-full[.]txt,openapi[.]json}.ts`, `decks/fixture/gslides/**` (the two dither slides, the three fixture threads under `comments/`, the README), `skills/*/references`, `docs/grammar.md`.

### Delivers

1. Day 1: the document seam above; the reducer cases and exact inverses for `text.splice` and `text.mark` with `diff.ts` sentences; `PictureDither` with its zod ranges, `annotate` groups and the "no continuous source" refusal; `Asset.variants`; the 64 action entries with parsing examples; `coverage.test.ts` `landed` gaining `GS3`; `pnpm generate:contracts` clean on the stubs.
2. Day 1: the fallback face in `inter.css` (`size-adjust`, `ascent-override`, `descent-override`, `line-gap-override` computed by `scripts/build-fonts.py` against Arial) pinned by `inter.test.ts`; `turboslide fonts build --check` exit 0.
3. Day 3: `transform.ts` with the property test over 10,000 random pairs and the interleaving anomaly documented; `resolveAnchor` and `shiftAnchors` with the cases of 16.6; the reduce test asserting `text.replace` unchanged on the recorded round one and two records.
4. Days 3 to 5: every CLI command of section 12 over the file store with no server (`comment`, `comments`, `notifications`, `activity`, `version diff`, `share *`, `deck publish`, `deck unpublish`, `account *`, `admin *`, `presence *`, `sync status`, `deck watch`, `deck follow`, `block dither`, `picture materialize`, `slide background-picture`, `slide background-material`), the anchor grammar parser, `--author` for the file store's principal, `turboslide login` and `logout` over the device flow client (the server side is B3's), `hosts.json` `kind: 'api-key'`.
5. Days 4 to 6: MCP: the tool list for the 64 actions under the `apps/cli/src/commands/mcp.test.ts` budgets (the gate before any tool is served), `DESTRUCTIVE_ACTIONS` gaining the ids of section 12, `resources.ts` with `deck://<id>/comments`, `deck://inbox`, `deck://<id>/presence`, `resources: { subscribe: true, listChanged: true }` and `notifications/resources/updated` from `fs.watch` over stdio and from B2's channel hosted; `packages/mcp/src/http.ts` binding a session to the key record B3's resolver returns.
6. The lint rules and their fixture plants; the fixture deck's two dither slides (`background-dither` with the Photograph numbers and a plate group, `picture-dither-strength` at 0.6) and three threads; the four skill tables regenerated; `docs/grammar.md`.

### Acceptance

```
cd packages/schema && ../../node_modules/.bin/vitest run
cd packages/lint && ../../node_modules/.bin/vitest run
cd packages/fonts && ../../node_modules/.bin/vitest run
cd apps/cli && ../../node_modules/.bin/vitest run          # mcp.test.ts budgets included
cd packages/mcp && ../../node_modules/.bin/vitest run
cd packages/agent && ../../node_modules/.bin/vitest run    # coverage.test.ts names the 64 actions
pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts'
node apps/cli/bin/turboslide.mjs validate decks/gt-brand && node apps/cli/bin/turboslide.mjs validate decks/fixture/gslides
node apps/cli/bin/turboslide.mjs fonts build --check
node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot /Users/kevinliu/repos/Prototemplate/deck --max-mismatch 0.005
```

Plus, in a temp deck copied from `decks/fixture/gslides`: `comment add slide:s2 -m "check this"`, `comment reply <threadId> -m "done"`, `comment resolve <threadId>`, `comments --for-me`, `share access --mode link --role viewer`, `share link --role commenter`, `share get`, `share stop`, `deck publish`, `deck unpublish`, `block dither s2#picture --pattern bayer8 --black 120 --white 230 --gamma 0.9`, `picture materialize --dry-run`, `slide background-picture s3 --asset mood-rosetta --dither`, `presence list`, `sync status`, `account me`, `notifications --unread` each exit 0 and the deck validates after each; a stock MCP client reads `tools/list` over stdio under the budgets and `resources/subscribe` on `deck://<id>/comments` fires after a CLI `comment add`.

## B2 Realtime, store, checkpointer, room client, the edit route, private store, migration

Estimate: 92 agent hours. The channel interface, `putAsset` and the `memory` channel land on day 1; the `redis` channel on day 2 (merge 1b); the room client and the edit route wiring by day 4 so B6's surfaces have live data.

### Inputs

SPEC-3 sections 0 (0.3, 0.5, 0.7, 0.8, 0.9, 0.26, 0.39, 0.49, 0.51, 0.52, 0.53), 2, 3 (every subsection), 5.2, 5.5 (the `Inbox` interface), 6.1 (the record store), 6.7, 8.5 (the day one asset write), 8.9, 11.2, 11.3 (the routes B2 owns), 11.5 (the migration procedure), 16.3 (`realtime.spec.ts`), 16.6 (the realtime and store rows), 16.7; reports 02 (Parts 1 to 7), 08 2 and 3, 09 1 and 5, 10 F24 to F36, F49, F50, 5.2.

### Owns

New `packages/realtime/**` (`src/{channel,protocol,keys,memory,redis,blob,lua,coalesce,admission,select}.ts` and tests, `client/{room-client,pending-store,fake-transport}.ts` and tests; the `package.json` is the integrator's), `packages/store/src/**` (every existing file; new `access-store.ts`, `comments-store.ts`, `inbox.ts`, `migrate.ts` and their tests), `packages/viewer/src/InlineText.tsx` and `packages/viewer/src/__tests__/{inline-text,inline-offsets}.test.ts` (the typing path emitting `text.splice`, the remote caret hooks), `apps/studio/src/server/{write,sessions}.ts`, new `apps/studio/src/server/{room,checkpoint,comments,access,index,migrate}.ts`, `apps/studio/src/routes/edit.$deckId.tsx` and `edit.$deckId.css`, new `apps/studio/src/routes/api/decks.$deckId.{stream,ops,presence}.ts`, new `apps/studio/src/routes/api/{comments,share,access,notify}.$.ts`, `apps/studio/src/components/useStudioSession.ts`, new `apps/studio/e2e/realtime.spec.ts`, `docs/hosting.md`, `docs/deck-transfer.md`. Dev server port 4331.

### Delivers

1. Day 1: the channel seam; `DeckStore.putAsset` and `removeAsset` on `file`, `tmp` and `blob` with digest names and `allowOverwrite: false`; the two instance asset test of 10 F49 in `hosted.test.ts` (fails at `61b16e4`, passes after); `isMirroredDocument` excluding `access.json`, `localDocuments` including `comments/`; `VersionRecord.ops?`.
2. Day 2 (merge 1b): the `redis` channel over the Redis protocol with the Lua compare and append, the key builder, the contention test against a fake (1,000 appends, no lost entry, wait under 50 ms); the `blob` channel; `selectRealtime`.
3. Day 3: the checkpointer (`apps/studio/src/server/checkpoint.ts` over `coalesce.ts`) with the lock of 0.8, the four triggers of 0.3, the coalescing rules of 0.51 tested on a recorded typing session and on an interleaved two author session, `XTRIM`; the ops, stream and presence routes with the caps of 3.3 and 3.4 and the `hello` roster filtered by role through B3's `decide()`; the 100 editing tabs ceiling.
4. Day 4: the room client with pending, retained, per author undo, the IndexedDB pending store with "3 unsaved changes from this browser; Apply or Discard", reconnect, resync, the `blob` tier fallback; the edit route wired to it (replacing `commitAs`'s queue, `pump`, `watchLoop` and `adoptExternal`, keeping the history and `setDocument`), the presence poster, the save words' five phrases, the retired conflict card except its two cases, the `on(...)` table for every new action, the role shaped editor (Viewing and Commenting modes through B6's `setMode`), the props for B6's presence, comments, inbox and Share surfaces; `InlineText.tsx` emitting `text.splice` at 100 ms and exposing the remote caret hooks; `watchDeck` kept one release.
5. Day 5: the comments store (file under the lock, Blob with `ifMatch` on `index.json`, the stream path), `comment.shift` on both paths with the identical bytes test (0.52), the `Inbox` interface with file, Redis and memory backends, the access store with `ifMatch`, the 60 s Redis cache and pub/sub, the per identity index and head cache, the session registry moved to Redis and bound to identities (with B3's principal), `sessions.test.ts` caps.
6. Day 6: the two Blob clients, the storage layout v2 and `turboslide admin migrate-storage` with the cursor, etag verification, dual read window, rollback flag and batched deletes, tested on the fake; the bundle's `comments` group, the record validation and the drops in `unpack.ts`; `docs/hosting.md` sections for Redis, the private store and the runbook; `docs/deck-transfer.md` for `deck follow` and the comments group; `realtime.spec.ts`.

### Acceptance

```
cd packages/realtime && ../../node_modules/.bin/vitest run
cd packages/store && ../../node_modules/.bin/vitest run
cd packages/viewer && ../../node_modules/.bin/vitest run
cd apps/studio && ../../node_modules/.bin/tsc -b
PLAYWRIGHT_BASE_URL=http://localhost:4331 node_modules/.bin/playwright test apps/studio/e2e/realtime.spec.ts
```

Plus: two browsers on the builder's server type in one paragraph and converge; a `resync` after 2,001 entries; a reconnect with `Last-Event-ID`; a rejected op shows its content; a closed tab's pending queue is offered on reopen; `sync.status` through the window API and the CLI agree; the measured op to screen on the dev server recorded in `build-3/b2.md`.

## B3 Identity and accounts

Estimate: 64 agent hours. The identity skeleton and the cookie land on day 1; `decide()` with its matrix test on day 2 (merge 1b) because B4 and B6 depend on it.

### Inputs

SPEC-3 sections 0 (0.17 to 0.23), 4.1, 4.8, 6.2 (the matrix), 6.4 (the exchange route), 7 (every subsection), 8.2 (the identity rows), 16.3 (`accounts.spec.ts`), 16.6 (the identity rows); reports 03 (Parts B to J), 09 2.1, 3, 4, 6, 10 F26, F31, F32, F40 to F45, F47, 11 (sections 1 to 7).

### Owns

New `packages/identity/**` (`src/{labels,marks,hues,names,access,resolve,index}.ts` and their tests, the LDNOOBW and reserved word fixtures with their licences; the `package.json` is the integrator's), `apps/studio/src/server/auth.ts`, new `apps/studio/src/server/auth/**` (`better-auth.ts` with the plugins, `session.ts` the sealed cookie, `principal.ts` the record with its TTL, `alias.ts`, `avatar.ts` the sharp pipeline, `tokens.ts` the API key resolver and `admin.bootstrap`, `device.ts`, `mail/**` the templates, the Resend client and the capture mode, the Kysely schema and migrations), new `apps/studio/src/routes/{api/auth.$,device,s.$token,api/avatar.$}.tsx|ts`, `packages/agent/src/http/{auth,sessions}.ts` and `packages/agent/src/http/sessions.test.ts`, `apps/studio/e2e/agent-http.spec.ts` (the identity rows; B2 requests the `comment.add` row), new `apps/studio/e2e/accounts.spec.ts`. Dev server port 4332 with `TURBOSLIDE_AUTH_DB=.turboslide/auth-b3.sqlite`.

### Delivers

1. Day 1: the identity seam; the sealed `__Host-ts_id` cookie minted on the first request and read by `readPrincipal(request)`; the label generator with its word list and deny list; `normalizeName` with the rules of 0.19 and the eight cases test; the `principal:<id>` record with the 90 day TTL on Redis and the file fallback.
2. Day 2 (merge 1b): `decide()` over the matrix of 6.2 including `readComments`, table tested with one assertion per cell and the synthesized legacy record; `resolvePrincipal` over the records and the alias table; `markSpec`, `renderMarkSvg`, `renderMarkBits`, `renderMarkPng1`, `hueFor` with the WCAG and CVD test; 1,000 marks equal in SVG and PNG.
3. Day 3: better-auth 1.7.4 with the TanStack Start integration, the Kysely adapter over Postgres and `node:sqlite`, Redis `secondaryStorage`, the magic link and email OTP plugins in one mail, the passkey plugin behind the domain gate, GitHub when configured, the anonymous linking through the alias table in `onLinkAccount`, sessions with `freshAge`, `TURBOSLIDE_MAIL=capture` writing mail to a Redis list read by `admin.mail.list`.
4. Day 4: `GET /s/:token` (validation, the grant on the session or the identity session and the account's index, `Referrer-Policy: no-referrer`, the navigation only rule, the redirect per 0.13); the API key plugin records, the bearer resolver returning the record and its owner, `TURBOSLIDE_TOKEN` as bootstrap only, `admin.bootstrap`, the device authorization flow and `/device`; MCP sessions bound to keys through the resolver B1's `http.ts` calls; the session registry binding (with B2).
5. Day 5: the avatar route with the sharp pipeline (the sniff, `failOn: 'error'`, `limitInputPixels`, rotate, crop, the four WebP sizes and the PNG, metadata stripped, `u/<avatarKey>/`, the key rotation and the prefix delete, SVG refused, anonymous refused with the sentence); `account.me`, `account.setName`, `account.setAvatar`, `account.sessions`, `account.signOut`, `account.forget` (clearing both mirrors through a response header the room client and the boot script honour), `account.decks`, `account.tokens.*` server side.
6. Day 6: the invitation binding on the first verified session, the request access mail batching, the transfer mail, the digest sender of 5.5 with `List-Unsubscribe` and the one click endpoint under `/api/notify/unsubscribe` (the route file is B2's; B3 provides the handler); `accounts.spec.ts`; the identity rows of `agent-http.spec.ts`.

### Acceptance

```
cd packages/identity && ../../node_modules/.bin/vitest run
cd packages/agent && ../../node_modules/.bin/vitest run src/http
cd apps/studio && ../../node_modules/.bin/tsc -b
PLAYWRIGHT_BASE_URL=http://localhost:4332 node_modules/.bin/playwright test apps/studio/e2e/accounts.spec.ts apps/studio/e2e/agent-http.spec.ts
```

Plus: the name prompt fires on the first edit and not on open; a reserved and a confusable name are refused with the fixed sentences; sign in with a captured code links the anonymous id; `/s/<token>` from a bare address bar and from a page on another origin both land, a `cors` fetch is 403; `turboslide login` against the builder's server stores a key; the avatar pipeline refuses SVG and HEIF and an anonymous upload.

## B4 Security platform and the check chain

Estimate: 88 agent hours. The R0 edits and the `authorize()` wrapper in shadow mode land on day 1; enforcement is a flag flip the integrator makes at merge 2.

### Inputs

SPEC-3 sections 0 (0.24 to 0.34, 0.50), 6.2 (the call sites), 6.3, 6.6, 8 (every subsection), 11.3 (the routes B4 owns), 11.4, 11.5 (R0), 16.1, 16.4, 16.6 (the render html row, the headless row); reports 04 (sections 6 to 9), 10 (Parts 1, 3, 4), 09 8.

### Owns

`apps/studio/src/start.ts`, `apps/studio/src/server/{actions,agent-actions,root,root.test,decks,download,render,thumbs,tokens,bundle,bundle-core,export-sync,export-batch,health,hosting-plugin,json,lint,lint-rendered,measure,warm,contracts}.ts`, new `apps/studio/src/server/{authorize,ratelimit,headers,upload,flags,log}.ts`, `apps/studio/src/routes/api/{actions.$action,agent,decks.$deckId.bundle,decks.bundle,download.$token,export.$deckId,render.$slideId}.ts`, new `apps/studio/src/routes/api/x.{export,render,upload}.$.ts`, `apps/studio/src/routes/decks.$deckId.assets.$.ts`, `packages/headless/src/**`, `packages/render/src/blocks/html-escape.ts`, new `packages/render/src/sanitize/**` (`html.ts`, `css.ts`, `frame.ts`), `packages/render/src/__tests__/html-escape.test.ts`, `packages/agent/src/http/{dispatch,manifest,readers,errors}.ts` and `http.test.ts`, `readers.test.ts`, `packages/agent/src/window/**` (the per page nonce), `packages/viewer/src/{SlideView,LiveClone}.tsx` (the sandboxed frame in the live views), `apps/studio/e2e/window-api.spec.ts` (the nonce row), new `apps/studio/e2e/security.spec.ts`, new `firewall/rules.json`, new `scripts/audit-allow.json`, `scripts/check.mjs`, `scripts/hosted-smoke.mjs`, `scripts/check-client-bundle.mjs`, `apps/studio/vite.deploy.config.ts`, `apps/studio/vercel.json`, `docker/**`, `.github/workflows/**`, new `docs/security.md`. Dev server port 4333.

### Delivers

1. Day 1: the R0 edits (sharp `block` at process start, `TURBOSLIDE_DOWNLOAD_SECRET` required, loopback out of `DEFAULT_ALLOW_HOSTS` hosted, `file` refused on the HTTP, MCP and window dispatchers, `AbortSignal.timeout` and the byte cap on `readInput`, `.svg` and `.json` as attachments with `nosniff`, `firewall/rules.json` with R1 to R21 in log mode); `authorize()` in `authorize.ts` over B3's `decide()` and B2's access store in shadow mode; `SERVER_SIDE_WINDOW_ACTIONS` extended; `TURBOSLIDE_TRUST_PROXY`.
2. Day 3: `authorize()` first in every server function and route B4 owns, the author derived from the session, `?author=` and the body author refused on browser transports, `removeStoredDeck` owner only, bundle tickets carrying the identity, `includeNotes` and `includeSkipped` against the capabilities, the You need access answer on the routes, the signed thumbnail URL, the cancel token, the download token spent set in Redis; the `/api/x/*` routes carrying the export, render and upload server functions; the presigned upload route.
3. Day 4: the rate limit middleware with the application quotas of 8.3 over `@upstash/ratelimit` (memory on a checkout) answering 429 with `Retry-After`, the deck caps in `applyWrite` and at admission (with B2's `admission.ts`), the kill switches with the defaults table, the structured log with the IP HMAC and the alert list, the retention jobs (a scheduled function or the render worker's cron); `safeFetch` with the pinned lookup and the Chromium egress denial in every render context; the web security flags dropped when the `file://` fixture renders without them.
4. Day 5: the `html` block: DOMPurify through jsdom with the lazy import, the CSS tokenizer, `htmlSanitized`, the sandboxed frame in the renderer's `iframe.ts-x-frame`, the live views and the standalone file, the scheme check in the schema (through a request to B1) and `renderRuns`, the `allowHtmlBlocks` policy, the eight payload fixture; the widened CSRF filter with the `/s/*` rule, the JSON content type requirement, the agent routes' `Origin` refusal, the MCP transport options, the per checkout token; the headers middleware and the nonce CSP report only with the report endpoint; the F47 nonce on the window adapter.
5. Day 6: `scripts/check.mjs` steps 26, 27 and 28 with `--list` printing 28 steps and step 6's greps; `scripts/hosted-smoke.mjs` rows of 10 P23 and the `worker-src` assertion; `scripts/audit-allow.json`; `vite.deploy.config.ts` with the bundle routes in `HEAVY` and the stream routes on the catch all; the Docker image with the new dependencies; the CI workflow; `docs/security.md` (the threat model summary, the rules, the runbook for a kill switch and a key rotation); `security.spec.ts`; the `window-api.spec.ts` nonce row.

### Acceptance

```
cd packages/headless && ../../node_modules/.bin/vitest run
cd packages/render && ../../node_modules/.bin/vitest run __tests__/html-escape
cd packages/agent && ../../node_modules/.bin/vitest run
cd apps/studio && ../../node_modules/.bin/tsc -b && ../../node_modules/.bin/vitest run src/server/root.test.ts
PLAYWRIGHT_BASE_URL=http://localhost:4333 node_modules/.bin/playwright test apps/studio/e2e/security.spec.ts apps/studio/e2e/window-api.spec.ts
node scripts/check.mjs --list          # prints 28 steps
pnpm audit --prod --audit-level=high   # clean under scripts/audit-allow.json
```

Plus: the eight payloads inert in the editor, the viewer and a standalone file opened from disk on the builder's server; the cross site `text/plain` POSTs refused; the ninth stream refused; a foreign `clientId` 403; the unsigned thumbnail and cancel requests 403; a kill switch flip read within 5 s; `TURBOSLIDE_AUTHORIZE=shadow` logging a denial without refusing and `enforce` refusing it; the studio function bundle size before and after the sanitizer recorded in `build-3/b4.md`.

## B5 Dither pipeline, variants, renderer, export, materials, the dialog rows, layout shift audit and route fixes

Estimate: 80 agent hours. The renderer's DOM classes and the `<img>` sizes land on day 1; the pipeline by day 3 so the chrome section has a preview to drive.

### Inputs

SPEC-3 sections 0 (0.35 to 0.38), 9 (every subsection), 10 (every subsection), 11.3 (the components), 16.1 (steps 25 and 27), 16.5, 16.6 (the effects, render, export rows); reports 05 (sections 3 to 5), 06 (every section), 11 8 (the rows B5's surfaces carry).

### Owns

`packages/effects/**` (new `src/dither.ts`, `src/blue64.ts` with the pinned texture, `src/dither.test.ts`, the fixtures), `crates/turboslide-native/**`, `packages/native/**`, `packages/materials/src/**`, `packages/render/src/**` except B4's `blocks/html-escape.ts`, `sanitize/**` and `__tests__/html-escape.test.ts` (so `blocks/{picture,context,figures}.ts`, `slide.ts`, `runtime.ts`, `print.ts`, `standalone.ts`, `thumb.ts`, new `dither-runtime.ts`, the other tests), `packages/export/src/**`, `apps/studio/src/workers/dither.worker.ts`, `packages/viewer/src/{dither.ts,MaterialMount.tsx}`, `packages/viewer/src/__tests__/dither.test.ts`, `packages/viewer/standalone/**`, `packages/chrome/src/inspector/{dither,material,picture}.tsx`, `packages/chrome/src/inspector/{dither,material}.css`, `packages/chrome/src/inspector/format-sections.ts`, `packages/chrome/src/dialogs/Background.tsx`, `packages/chrome/src/__tests__/{format-sections.test.ts,materials-sections.test.tsx,format-options-round-two.test.tsx}`, `packages/theme/src/gt-ink-paper/{sheet,stage}.css`, new `scripts/layout-shift-audit.mjs`, `apps/studio/src/routes/{__root,index,new,deck.$deckId,embed.$deckId,decks.index,decks.trash,present.$deckId,print.$deckId}.tsx`, `apps/studio/src/routes/{decks,print}.css`, `apps/studio/src/router.tsx`, `apps/studio/src/styles.css`, `apps/studio/src/components/{DeckViewer,Slideshow}.tsx`, `apps/studio/src/components/{Slideshow.css,presentActions.ts,useMountEffect.ts}`, new `apps/studio/src/components/{EditorSkeleton,PresenterSkeleton}.tsx`, new `apps/studio/e2e/dither.spec.ts`, `docs/pptx.md`, `docs/freeform.md`. Dev server port 4334 and a `vite preview` on 4344 for the audit.

### Delivers

1. Day 1: the renderer's DOM seam; `imgAttrs` and `renderPicture` emitting `width` and `height` from `asset.size` with the render test that asserts every emitted `<img` carries both; the escape block's `<img>` rewrite adding them; the sheet rules leaving the other dimension `auto`.
2. Day 3: `ditherPicture` with the parity test (agreement 1.0 on the 16 recorded treatments), `bayer4`, `blue64`, `random`, polarity, strength, the cached `toneBase`; the worker with the id and stale drop and the equal bits test; `dither-runtime.ts` and the renderer path with both states; `picture.dither`'s store implementation in `apps/cli/src/store-actions.ts` is B1's, so B5 provides `@turboslide/effects/dither` and `@turboslide/materials` `materialize()` and B1 wires them.
3. Day 4: `picture.materialize`, `slide.setBackgroundPicture`, `slide.setBackgroundMaterial` and `asset.add --replace-source` in `packages/materials/src/actions.ts` through B2's `putAsset`; the variant records and pruning; the GT deck's 16 sources attached where the recipe or the allowlisted URL exists.
4. Day 5: the export paths (variants materialized before the shoot, the 1 bit page at both scales, `slide.background = { data }`, the strength composite in Node, the residual lines, `includeComments` with the `p:cmLst` and `p:cmAuthorLst` parts over B1's comment types and the Python count); the standalone build's variant inlining and "materialize first"; the fixture exports perfect in both modes.
5. Day 5: the Format options Dither section with the Preset rows highlighted by equality, the metrics line, Advanced, Reset, the `data-control` ids; the Background dialog's Dither toggle applying the Photograph numbers, the Photograph and Neutral chips, the thumbnail row, the Material row with Choose, Dither and Place, the reserved upload line and the presigned path through B4's route; the Material section's Dither toggle and Play.
6. Day 6: every layout shift fix of 9.2 owned by B5 (the skeletons with `pendingMs: 0`, the boot script attributes and the preloads in `__root.tsx`, `initialPresent`, the `ts-home` cookie, the rename height, `--k` in print, the `height: auto` sheet rules; the presenter console's fixed boxes are B6's in `packages/viewer/src/present`); `scripts/layout-shift-audit.mjs` with the matrix, the frame sampler, the declared sources per state and the JSON and markdown outputs; `dither.spec.ts` with the 100 ms measurement; `docs/pptx.md` and `docs/freeform.md` sections.

### Acceptance

```
cd packages/effects && ../../node_modules/.bin/vitest run
cd packages/materials && ../../node_modules/.bin/vitest run
cd packages/render && ../../node_modules/.bin/vitest run
cd packages/export && ../../node_modules/.bin/vitest run
cd packages/chrome && ../../node_modules/.bin/vitest run __tests__/format-sections __tests__/materials-sections __tests__/format-options-round-two
node apps/cli/bin/turboslide.mjs export decks/fixture/gslides --mode native --out .turboslide/gs-native && node apps/cli/bin/turboslide.mjs export check .turboslide/gs-native
node apps/cli/bin/turboslide.mjs export decks/fixture/gslides --mode flatten --out .turboslide/gs-flatten && node apps/cli/bin/turboslide.mjs export check .turboslide/gs-flatten
node scripts/canvas-fidelity.mjs --deck decks/gt-brand --deck decks/templates/gt-brand --deck decks/templates/blank --max-mismatch 0.005
node scripts/layout-shift-audit.mjs --base http://localhost:4344 --out .turboslide/layout-shift.json
PLAYWRIGHT_BASE_URL=http://localhost:4334 node_modules/.bin/playwright test apps/studio/e2e/dither.spec.ts
```

Plus: the flatten report `perfect: true` with the `dither:` and `comments:` residual lines; the 100 ms budget at the 95th percentile over 200 slider events recorded in `build-3/b5.md`; the audit at zero entries on every cell of the builder's preview build (the integrator builds it on request, or the builder runs `node_modules/.bin/vite build` inside `apps/studio` under the written exception the integrator records in AGENTS.md on day 1 for this row only).

## B6 Chrome: presence, comments, inbox, share, versions, accounts dialogs, menu model

Estimate: 92 agent hours. The chrome contract, the strings and the menu rows land on day 1; the surfaces follow in the order the sales situations meet them (the presence slot and roster, the Share dialog, the comment card and panel, the inbox, versions, the account dialogs, Notification settings).

### Inputs

SPEC-3 sections 0 (0.9, 0.11 to 0.13, 0.16, 0.18, 0.21, 0.22, 0.41 to 0.47), 1, 4 (every subsection), 5.3 to 5.7, 6.5, 6.8, 7.2, 7.4 to 7.6, 7.8, 9.3, 13, 14, 15, 16.2, 16.3 (`presence.spec.ts`, `comments.spec.ts`, `share.spec.ts`, `versions-by-author.spec.ts`), 16.6 (the chrome row); reports 01 (sections 2, 3, 5, 6, 9, 10), 08 (sections 4 to 6, 9, 10), 09 (sections 3.6, 4, 8.5), 11 (sections 6, 8), 03 (Parts B3, F, I3), 05 4.

### Owns

`packages/chrome/src/**` except B5's files (`inspector/{dither,material,picture}.tsx`, `inspector/{dither,material}.css`, `inspector/format-sections.ts`, `dialogs/Background.tsx`, the three tests B5's row names): `TitleRow.tsx` and `.css`, `Sidebar.tsx` and `.css`, `Thumb.tsx`, `ThumbShot.tsx`, `Overlay.tsx` and `.css`, `StatusChip.tsx`, `Inspector.tsx`, `VersionsPanel.tsx` and `.css`, `HistoryPanel.tsx`, `ViewerShell.tsx` and `.css`, `EditorShell.tsx` and `.css`, `Toolbar.tsx`, `ToolbarHead.tsx`, `ToolbarTail.tsx`, `Dialog.tsx` and `.css`, `Menu.tsx`, `MenuBar.tsx`, `Snackbar.tsx`, `SourceDrawer.tsx` (the Edit HTML panel), `tokens.css`, `menus/**`, `editor-shell.ts`, `editor-shell-context.ts`, `shell-context.ts`, `dispatch.ts`, `useEditorKeys.ts`, `useShellKeys.ts`, the other existing files, `dialogs/{Share,Publish,MakeCopy}.tsx` rebuilt, new `dialogs/{NamePrompt,SignIn,Profile,AvatarBuilder,NotificationSettings,RequestAccess}.tsx`, new `presence/**` (`PresenceSlot`, `RosterMenu`, `FollowingPlate`, `IdentityChip`, `RemoteCursors`), new `comments/**` (the card, the panel, the reply box, the mention autocomplete, the marker), new `inbox/**`, new `activity/**`, new `YouNeedAccess.tsx`, the `__tests__/**` not named in B5's row; `packages/viewer/src/**` except B2's `InlineText.tsx` and its two tests, B4's `SlideView.tsx` and `LiveClone.tsx`, B5's `dither.ts`, `MaterialMount.tsx`, `__tests__/dither.test.ts` and `standalone/**`; `scripts/tooltip-audit.mjs`; new `apps/studio/e2e/{presence,comments,share,versions-by-author}.spec.ts`; the round two specs of step 21 that finding 28 names in B6's files (`canvas.spec.ts`, `objects.spec.ts`, `tables.spec.ts`, `text-styles.spec.ts`) for the fixer round. Dev server port 4335.

### Delivers

1. Day 1: the chrome contract seam; the menu rows of section 13 with `GS3_ACTION_IDS`, the role predicates, `COMMENTS_LATER` removed, the Later clauses of 13.3; every string of 6.8 and 15 in `strings.ts` with `strings.test.ts`; `--pt-presence-w` and `--pt-inbox-w` in `tokens.css`.
2. Day 3: the title row's five fixed slots in the order of 0.43 (the presence slot with four chips, the `+N` chip drawn empty, the hair rule and the own chip; the comments glyph live; the inbox plate present at zero; Slideshow; Share with the dot), the save words' five phrases in one cell, the Last edit tooltip and dot from `resolvePrincipal`; the roster menu with Follow and "Go to slide", the Join chat stub, the own chip's menu; the Following plate; the filmstrip chips and the count chip; the remote carets, flags, outlines and pointers in `Overlay.tsx` and `packages/viewer/src/RemotePresence.tsx`; the pointer toggle and the View only button in `ToolbarTail.tsx`; the Viewing and Commenting mode gates in `Editor.tsx`; the announcements region and Shift+Tab to the roster.
3. Day 4: the Share dialog of 6.5 with the gear's five switches and the footer sentence, the Publish dialog with Stop publishing, the Make a copy dialog's Copy comments checkbox, `YouNeedAccess.tsx` with the request form, the Claim banner, the Copy link row.
4. Day 5: the comment card, the marker, the count chip, the Comments panel with For you, search, the filter and Slide order, the four display modes, the chords of section 14, the mention autocomplete with the disclosure rule, Assign and Done, reactions, the tombstone with Undo; the Notifications panel and the inbox plate; Notification settings; the Activity panel without the trend bar.
5. Day 6: the Versions panel by author with the windows, the marks, Show changes with the hatched plates and the run level underline and strike, the disabled delete rows; the name prompt (360 by 168), the sign in dialog (400 by 320), the profile (560 by 640), the avatar builder with its four tabs and the Picture tab's sentence for anonymous principals; the Edit HTML source panel; every fix of 9.2 and 9.3 owned by B6 (the initializers, the `useLayoutEffect` refits, `.pt-scroll`, the `cqw` placeholders, the container query tiers, the fixed dialogs); the chrome lint taught the hue exception; the four specs.

### Acceptance

```
cd packages/chrome && ../../node_modules/.bin/vitest run
cd packages/viewer && ../../node_modules/.bin/vitest run
cd apps/studio && ../../node_modules/.bin/tsc -b
PLAYWRIGHT_BASE_URL=http://localhost:4335 node_modules/.bin/playwright test apps/studio/e2e/presence.spec.ts apps/studio/e2e/comments.spec.ts apps/studio/e2e/share.spec.ts apps/studio/e2e/versions-by-author.spec.ts
node scripts/tooltip-audit.mjs --strict
node apps/cli/bin/turboslide.mjs lint --chrome --url http://localhost:4335/edit/gt-brand --widths 1440,1280,390 --themes light,dark
```

Plus: `menu-model.test.ts` with no comment row `later` and every new row naming an action or a client effect; the parity audit (`node scripts/gslides-parity-audit.mjs --base http://localhost:4335 --out .turboslide/parity-audit.json`, the verifier's script) with the section 13 rows as `now` and the viewer role state; `presence.spec.ts` at zero layout shift entries through the twenty participant walk; the acceptance sentence of 4.10 asserted.

## Integrator

Estimate: 48 agent hours.

### Owns

`AGENTS.md`, `pnpm-workspace.yaml` (the catalog additions and `allowBuilds`), `pnpm-lock.yaml`, every `package.json` (the new `packages/realtime` and `packages/identity` included), `playwright.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `.gitignore` (`decks/*/comments/`, `.turboslide/`, `.turboslide/token`), `.vercelignore`, `docs/gslides-parity/{SPEC-3,MILESTONES-3,BUILD-STATUS-3}.md`, `docs/gslides-parity/build-3/integrator.md`, the merges, the preview deployments, the Marketplace installs (Upstash Redis on the fixed plan, Neon Postgres, the second Blob store) and the environment of SPEC-3 11.4 on the Vercel project with Kevin, the WAF rules applied from `firewall/rules.json`, `TURBOSLIDE_MAIL=capture` on every preview, the storage migration run on the preview store, `pnpm generate:contracts` on the merged tree, the deviations list.

### Delivers

1. Day 1: `pnpm install` once after the catalog additions; the `package.json` files for `packages/realtime` and `packages/identity`; AGENTS.md's round three sections (the realtime channel, identity, the two stores, the dev server exception with the port table 4331 to 4336 and 4344, the `vite build` exception for B5's audit, the per checkout token); merge 1 with every seam and B4's R0 edits; the `/new` boot probe on a dev server after the merge.
2. Day 2: merge 1b (B2's `redis` channel, B3's `decide()`).
3. Days 2 to 6: the requests in `build-3/<key>.md`, `pnpm generate:contracts` after each action lands, the studio function bundle size recorded before and after the sanitizer.
4. Day 7: merge 2 in the order B1, B2, B3, B4, B5, B6; `pnpm check` on the merged tree with `--list` at 28; the preview deployment with `TURBOSLIDE_AUTHORIZE=shadow` and the storage migration to its dual read window; `node scripts/hosted-smoke.mjs --base <preview>`.
5. Day 9: the ship step below.

### Acceptance

`pnpm check` at 28 of 28 on the merged tree (step 21 green, finding 28 closed, or the named exceptions recorded); `git diff --exit-code` after `generate:contracts`; the preview smoke green; the `/new` boot probe on a dev server after every merge.

## Verifier

Estimate: 40 agent hours.

### Owns

`docs/gslides-parity/VERIFICATION-3.md`, `docs/gslides-parity/verification-3/**`, `scripts/gslides-parity-audit.mjs` (the round three rows, the viewer and commenter role states, the Dither section's ids, the title row slots, the Shift+Tab row). Dev server port 4336.

### Delivers

`pnpm check` 28 of 28 recorded step by step; the parity audit locally and against the preview; the layout shift audit on the preview build (gated) and on the hosted deployment (recorded); the canvas walk of round two on the merged tree (no regression); the multiplayer walk on the preview (two browsers in two regions: a keystroke's op to screen at the 50th and 95th percentile, a comment's arrival, a share exchange, a revoked link, a published embed at 410 after unpublish, a persisted queue applied after a closed tab); the agent walk (`turboslide login`, `comments --for-me`, `block dither`, `deck follow` tracking the preview byte for byte, the MCP stdio list under the budgets); the preview measurements of SPEC-3 16.7 and the load test; the security rows of 16.4 on the preview; the invite round trip with `TURBOSLIDE_MAIL=capture`; the storage migration verified deck by deck; the hosted round trip of a 6 MB picture and its variant on a second instance; the container verification (step 25); S1 to S4 walked in the sales voice with revisions and screenshots (16.8); the list of every unverified Google fact of 0.55 with the round's reading of each, for Kevin (section 18 item 15); the monthly cost projection from the preview's usage page.

### Acceptance

VERIFICATION-3.md names every miss with the builder who owns the file, every number of 16.7 against its target, and every deviation with its reason; `verification-3/` holds the logs, the JSON outputs and the screenshots.

## Fixer round

Estimate: 32 agent hours, day 9.

The verifier's VERIFICATION-3.md lists every miss with the builder who owns the file. Each builder fixes only in their own files; the integrator merges in the same order as merge 2; the verifier reruns the parity audit, the specs of steps 21 and 26, the layout shift audit and `pnpm check`. Finding 28 of VERIFICATION-2 (the round two specs of step 21 that have never run green on the merged tree) is a fixer item of this round for B6 (`canvas.spec.ts`, `objects.spec.ts`, `tables.spec.ts`, `text-styles.spec.ts`) and is distinguishable from a round three regression because the round three specs run in their own step 26. A miss that needs a design change (a Google fact the audit shows we read wrong, a better-auth option that does not exist, a Vercel limit the preview contradicts) is written into VERIFICATION-3.md as a deviation with the reason and left for Kevin, not patched around. The fixer round ends when the audit exits 0 and `pnpm check` is 28 of 28, or when the remaining misses are all recorded deviations.

## Ship step

Estimate: 12 agent hours.

1. `pnpm check` 28 of 28 on `gs3/integration` with `main` merged in; `git log` shows one commit per builder plus the integration commits; no conflict markers (`git grep -n '<<<<<<<'` empty); the contracts, the fonts and the fixture committed; `README.md` and `docs/readme/` untouched by this round.
2. A preview deployment of `gs3/integration` with the Marketplace installs; `node scripts/hosted-smoke.mjs --base <preview>` green including the round three rows; the parity audit against the preview exit 0; the storage migration verified to its dual read window; the two browser walk repeated.
3. Kevin's manual checks on the preview: a second browser joining a deck and typing in one heading with him; a comment with a mention and its inbox line; the Share dialog opening on Restricted, a viewer link in the clipboard with no token in the address bar, the prospect view without notes and without the comment; a commenter link landing in Commenting mode; the name prompt on the first edit and the own chip's menu as the only account surface; Change background with a photograph and the Dither toggle giving the deck's look in one click, the Neutral chip, the Format options section; a shader background with Dither; the wording of 6.8 and 15 on screen; the Later stubs of 13.3 reading as intended; nothing moving when a person joins or a comment lands.
4. Merge to `main`, push, production deploy; R0 to R5 of SPEC-3 11.5 applied in order on production (the private store connected and the migration cut over before `TURBOSLIDE_AUTHORIZE=enforce` is set and the team is told; the gt-brand deck claimed by the admin and left `open: viewer`); R7 beside R5; `hosted-smoke.mjs` against production green; a production `share.get` on a deck written after the deploy reports its record; a production keystroke between two browsers measured.
5. R6 waits on Kevin's sending domain (section 18 item 10); R8 is dated by Kevin (item 12); the WAF rules and the CSP stay in log and report only mode for the week the plan names.
6. The verifier appends the production table to VERIFICATION-3.md; the integrator writes `BUILD-STATUS-3.md`.

## What ships in this round

- Multiplayer: an operation stream in front of the revision log with server serialized merging, two new text ops that leave every stored record replayable, no locks for people, live carets, selections, pointers and Follow, the presence slot and roster in the title row, the filmstrip chips, a pending queue that survives a closed tab, the `blob` tier as the fallback, a local checkout that follows a hosted deck, the MCP resources with subscribe, agents in the roster.
- Comments and notifications: the sidecar with six anchors, threads, mentions, assignment, reactions, resolve and reopen, the card, the markers, the panel with For you, the four display modes and every chord, the in app inbox with Google's three levels and email digests for signed in grant holders, version history by author with Show changes, the Activity panel, comments in PPTX for editors.
- Sharing: owner, editor, commenter and viewer on one access record, `authorize()` on every server function and route, the Share dialog opening on Restricted with the people field first and Anyone with the link as Viewer, share links exchanged once at `/s/<token>`, the published player and Stop publishing, request access, invitations, transfer, the home page's four views, the two switches for comments and names, the footer sentence, the refusals in words.
- Accounts: anonymous by default with a sealed cookie, a label and one prompt; sign in by email code and link, passkeys once the domain is fixed, GitHub when configured; sessions, linking, sign out, Forget this browser; the avatar builder with Initials, Glyph, Dither and Picture; agent API keys with scopes and the device flow; the per checkout token.
- Security: every finding F1 to F53 of reports 04 and 10 closed or deferred by name, with the WAF rules as a committed file, the application quotas, the deck caps, the sandboxed and sanitized `html` block with its Edit HTML panel, the upload pipeline with the presigned path, `safeFetch`, the widened CSRF filter, the headers and the nonce CSP, two Blob stores with a specified migration, the window nonce, the signed thumbnails, the cancel token, the kill switches with a defaults table, the structured log with retention.
- Layout shift: zero measured entries on every route and state as a check step, with the nine rules applied to every new surface and the fixes of report 05 landed.
- Backgrounds: a photograph as a background with the deck's two tone screen in one click through the Background dialog's toggle and the Photograph preset, the Neutral identity in the Format options Dither section with every parameter, materialized variants in every export, shader materials as backgrounds with the same control, hosted asset writes that reach the store.
- The acceptance: 64 actions on every transport, 28 check steps, the parity audit over every flipped row and two role states, six new two browser specs, the security suite, the layout shift audit at zero, the two dither fixture slides and three fixture threads exported in both modes and in the container, VERIFICATION-3.md.

## What is round four

In the order of SPEC-3 section 17: Chromium in a function or worker without secrets; the WebSocket transport and multi region; a per Text CRDT if needed; chat inside the file, Q&A, Approvals, Show live edits, the Viewers tab; `version.delete` and the comment trend bar; email collaborators, organizations and groups, an admin console, snooze, cross deck comment search; passkeys if the domain comes late and a Blob backed auth adapter if the databases prove unwanted; error diffusion and halftone dithers, the GPU shader preview, Add picture to theme, Edit theme; PowerPoint's modern comment parts; Available offline and suggestions; Reflection and Recolor, Preferences, PPTX import, transitions and animations, nested groups, handouts. Each is a Later stub this round where Google has the row, with the clause of SPEC-3 13.3, and no clause names a round.
