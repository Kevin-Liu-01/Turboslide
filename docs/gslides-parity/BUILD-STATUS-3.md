# Google Slides parity round three, build status

Kept by the integrator (`docs/gslides-parity/MILESTONES-3.md`, "Integrator"). One heading per
builder: what landed at merge 1 and at merge 2, what is carried to the fixer round, and the open
requests with where they went. Section numbers refer to `docs/gslides-parity/SPEC-3.md` unless
prefixed SPEC or SPEC-2. Written at merge 1 and rewritten at merge 2, 2026-09-13, over `main` at
`28cb63b`; nothing is committed until the ship step. Full notes: `docs/gslides-parity/build-3/b1.md`
to `b6.md` and `integrator.md` (sections 8 to 15 are merge 2). Kevin's directives of the round:
every Google Slides feature with its exact behaviour and a cleaner interface for the sales team;
multiplayer with every collaboration feature, optional logins and avatars; no layout shift;
attacks prevented and rate limited; pictures as backgrounds with dithers over them; every
capability an action on the CLI, MCP and the window API, on a checkout and hosted.

## The tree at merge 2

`node_modules/.bin/tsc -b` exit 0 on the whole tree. `pnpm generate:contracts` current (14 files;
169 actions, 64 of them round three's, 146 MCP tools). The whole tree's vitest run (check step 5)
passes at 2,801 tests and 3 skipped in 109 s once the machine is quiet; under a load average above
ten it trips the 5 second budgets of the CLI's browser tests and the schema's 10,000 pair property
test, and every file passes alone (VERIFICATION-2 section 14's class, seen again). `pnpm build` and
`scripts/check-client-bundle.mjs` pass (the studio function bundle is 10.6 MB of `dist/server`
against 7.2 MB at merge 1, the sanitizer and the round's server modules; the client 4.1 MB
against 3.8 MB). The editor boots on a dev server with the tmp store and the memory channel
(`/new` ready and settled in 8.3 s cold, `/edit/gt-brand` in 2.6 s, no page error). The GT deck's
render is unchanged against the Prototemplate shoot (check step 12) and the canvas fidelity gate
holds (step 24). The 64 round three actions resolve on `POST /api/actions` (62 of 64 contracts on
GET, `deck.follow` and `account.forget` being offered elsewhere by design; no 500 and one 501,
`share.emailCollaborators`, round four), the CLI walk of `apps/cli/e2e/share.mjs` passes 19 of 19
steps, and the hosted smoke answers 19 of 19 rows on the preview
`https://turboslide-igavfcg2x-kl01s-projects.vercel.app`.

The check chain at merge 2 (`node scripts/check.mjs`, run in parts because step 3 fails as written
on the uncommitted generated files and step 19 on the other workflow's untracked documents): the
table below records every step; `integrator.md` section 15 holds the commands and their timings.

| Step | Result at merge 2                                                                                                                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | ok, `pnpm install --frozen-lockfile` (workspace links only)                                                                                                                                                                   |
| 2    | ok, `tsr generate`                                                                                                                                                                                                            |
| 3    | fails as written on the uncommitted contracts (the tree is uncommitted until the ship step); `pnpm generate:contracts` twice answers "14 files current" and `contracts.test.ts` passes in step 5                              |
| 4    | ok, `tsc -b`                                                                                                                                                                                                                  |
| 5    | ok on the quiet machine (260 files, 2,801 passed, 3 skipped, 109 s); two earlier runs tripped the 5 s budgets under a load average of 18 to 21 with a build and a deploy beside                                               |
| 6    | ok after the sessions split and the overwrite allowlist (`pnpm build`, `check-client-bundle` marker 0 of 45 client files and 1 of 115 server files, node builtins 0 of 33, the greps)                                         |
| 7, 8 | ok, the GT deck re-imported at 85 slides, 8 sections, 0 escape blocks                                                                                                                                                         |
| 9    | ok, `validate decks/gt-brand`                                                                                                                                                                                                 |
| 10   | ok, 170 renders                                                                                                                                                                                                               |
| 11   | ok, no page error                                                                                                                                                                                                             |
| 12   | ok, compare-to-shoot within 0.5 percent                                                                                                                                                                                       |
| 13   | ok, the sheets                                                                                                                                                                                                                |
| 14   | ok, 85 cells                                                                                                                                                                                                                  |
| 15   | ok, `lint all`                                                                                                                                                                                                                |
| 16   | ok, the standalone build under 16 MB                                                                                                                                                                                          |
| 17   | ok, `viewer.spec.ts`                                                                                                                                                                                                          |
| 18   | failed once on the own chip's ink ring at every width and theme on `/edit/gt-brand` (24 audits with findings); the hue exception of SPEC-3 4.9 landed in the chrome lint; the rerun is recorded in `integrator.md` section 15 |
| 19   | fails on the other workflow's untracked `research-4/`, `design-4/` and `verification-4/` files alone; every file of this round passes `prettier --check`                                                                      |
| 20   | recorded in `integrator.md` section 15 (the parity audit)                                                                                                                                                                     |
| 21   | recorded in `integrator.md` section 15 (finding 28 stays a fixer round item)                                                                                                                                                  |
| 22   | recorded in `integrator.md` section 15 (the fixture export in both modes with the two dither slides)                                                                                                                          |
| 23   | recorded in `integrator.md` section 15 (`fonts build --check`)                                                                                                                                                                |
| 24   | recorded in `integrator.md` section 15 (the canvas fidelity gate)                                                                                                                                                             |
| 25   | recorded in `integrator.md` section 15 (the container)                                                                                                                                                                        |
| 26   | recorded in `integrator.md` section 15 (the eight round three specs; the builders' stage 2 reports list what each spec still needs)                                                                                           |
| 27   | recorded in `integrator.md` section 15 (the layout shift audit against `vite preview` on 4344)                                                                                                                                |
| 28   | ok, `pnpm audit --prod --audit-level=high` clean                                                                                                                                                                              |

## The account boundary of the round

No agent installs a Vercel Marketplace product, creates a paid resource, changes DNS, registers a
sending domain or signs up for any service. The redis channel, the Upstash rate limiter, Neon
Postgres and Resend are built and tested against fakes and local backends and documented in
`docs/hosting.md` (B2, with the integrator's rows at merge 2) with the steps Kevin takes to turn
each on. The preview and production run on the degraded tiers this round (the blob channel,
anonymous identity with the name prompt, the magic link and the code disabled with the row saying
why, captured mail). The WAF rules ship as `firewall/rules.json` and were not applied at merge 2
(the ship step's plan review). `TURBOSLIDE_AUTHORIZE` ships in shadow mode. The private Blob store
of 11.4 was not created: the storage migration ran on the fake only, and its dual read window on
the preview store needs the store's token, which Kevin's decision yields (`docs/hosting.md`
section 10). The preview's environment (`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_AUTHORIZE=shadow`,
`TURBOSLIDE_REALTIME=blob`, `TURBOSLIDE_SESSION_SECRET`, `TURBOSLIDE_DOWNLOAD_SECRET`) was passed
per deployment; the project's stored environments hold `TURBOSLIDE_TOKEN` and
`BLOB_READ_WRITE_TOKEN` only, so the ship step sets the two secrets on production with Kevin
before the deploy.

## B1 Document, transform, comments and access types, actions, CLI, MCP, contracts, fonts, lint, fixture deck

Landed (stage 1, `b1.md`): `Author.principalId?`; `text.splice` and `text.mark` in the mutation
language with exact inverses; the plain offset primitives and the link scheme rule; `PictureDither`
and `Asset.variants`; `HtmlBlock.htmlSanitized?`; `comments.ts` (six anchors, thirteen stream
entries, `resolveAnchor`, `shiftAnchors`); `access.ts` (the record, the matrix of 6.2, the flags);
the 64 action ids of section 12 with the milestone `GS3`; the contracts regenerated.

Landed (stage 2): the metric matched `Inter Fallback` face computed by `scripts/build-fonts.py`
and pinned by `inter.test.ts`; the op against op transforms with two 10,000 pair property tests
and the interleaving demonstration; `text.splice.flags`; `Decision` widened (403 `capability`, 410
`gone`) with `ForbiddenError` and `GoneError`; every CLI command of section 12 over the file store
with no server (`apps/cli/src/records/`, `record-actions.ts`, the anchor grammar, `--author` as
`local:<name>`, `login` and `logout` over the device flow, 403 and 410 as exit 2); the MCP
resources `deck://<id>/comments`, `deck://<id>/presence`, `deck://inbox` with `resources/subscribe`,
the key binding of `http.ts` (16 sessions per key); the `html/sanitize` fix rule and the two
picture rules over block level dithers; the fixture deck's two dither slides (29 slides) and three
comment threads; the skills reference sections; `apps/cli/e2e/share.mjs` (19 steps). Merge 2:
`RecordDeps.access` (the studio's access store stands in for the file), `picture.materialize`
forwarded to the materials pipeline on the CLI, the fixture's two variants materialized in the
committed deck (revision 2), the chrome lint's hue exception (b6.md request 5).

Carried to the fixer round: `account me --avatar-png` through `@turboslide/identity/marks-png`
(the dependency is installed); `block.resetImage` writing `dither: null` and the standalone build's
`inlineAssets` including the variants' twins (b5.md request 3); the CLI's `FileStore` opened with
`fileCommentsOnWrite` so a CLI write shifts a checkout's comment anchors (b2.md R16); `resolveKey`
on the MCP route so `http.ts` binds sessions to key records; the CLI `build` passing `htmlFrame`
(b4.md 2.4.5); `closeAgentSessions` bound in `routes/mcp.ts` (b3.md R15b). Deviations in `b1.md`:
`--author-id <who>` for the comments filter (SPEC-3 12 spells `--author`), rotate-link minting a
new record, the checkout holder rule before a record is persisted, `principal.kind` `local`.

## B2 Realtime, store, checkpointer, room client, the edit route, private store, migration

Landed (stage 1, `b2.md`): `DeckStore.putAsset` and `removeAsset` for the three backends with
digest names and `AssetExistsError`; `VersionRecord.ops?`; `packages/realtime` with the channel
interface, the protocol schemas, the memory, redis (over an injected client) and blob channels,
the coalescing and admission rules, the contention test.

Landed (stage 2): the room per deck (`room.ts`: the live document, the follower, admission with
budgets, the base window, B1's transform, the retried op id answered from the stream), the
checkpointer (`SET NX PX` lock, four triggers, coalescing, `XTRIM`), the stream, ops and presence
routes; the room client with the pending store and the fake transport (13 tests), `InlineText.tsx`
emitting `text.splice` at 100 ms with the remote caret hooks and the absorb of a collaborator's
change, the edit route wired to the room (presence, sync, access, account, the persisted queue
plate, the reject card, the name prompt deferred to the end of an inline session); the comments,
inbox and access stores and the session directory; the split Blob client, the migration on the
fake (plan, copy, verify, cutover, delete, rollback), the bundle's comments group; `docs/hosting.md`
sections 9 to 11, `docs/deck-transfer.md` section 8; `realtime.spec.ts` (11 rows). Measured on a
dev server under load: op to screen p50 321 to 342 ms, p95 341 to 447 ms; an agent write reached
both tabs in 347 to 364 ms. Merge 2: `EditorSkeleton` at 0 ms on the edit route, the `picture.dither`
row in the page, the cookieless localhost caller on the room's identity path, the share writes of
`/api/share` dispatching the record functions, the server half of `sessions.ts` moved to
`sessions.server.ts` (the production build's import protection), `docs/hosting.md`'s rows.

Carried to the fixer round (recorded as defects in `b2.md`): the window API's `describe()` and
`sync.status` answering a frozen revision after the controller was replaced (row 4 of
`realtime.spec.ts` met a 409 in four runs; row 11 never ran); coalesced writes that did not commit
after the resync row (the store lagging the live document by the resent op); `realtime.spec.ts`
never passed all eleven rows in one run (rows 1 to 10 passed in at least one run). Requests: the
route's stage 2 additions for B6 (`save.changedSinceOpen`, `identities`, `activity`, `diffVersions`,
the account sign in callbacks; R19), `PictureTarget.dither` and `uploadingBytes` (b5.md request 6),
the page nonce on the adapter, `htmlFrame` in the live renders, the thumbnail grant and
`sanitizeHtmlBlock` on the write path and in the bundle importer (b4.md 2.4.3), the presence
route's simulate hook (b6.md request 2), `presence.list` and `sync.status` from the room's roster
over HTTP and MCP (the file records answer today), the identity hooks (`bindInvitations`,
`onLinkGrant`, `onLinked`, the session registry's `principalId`, the Redis runtime), the digest
queue and the one click unsubscribe (b3.md R14, R17; `/api/notify/unsubscribe` is 501), the window
API's name prompt on `/new` blocking the round two rows of `window-api.spec.ts` (b4.md 2.7.10), the
intermittent `no thread` 404 on a reopen right after a resolve (one of six sequences on the merge 2
walk). Deviations in `b2.md` (1 to 20): the store entries below the document's revision skipped on
a cold replay, the comment actions on the stream path with the checkpointer writing the sidecar,
the index as the sidecar's commit point, layout v2 leaving the twins at `decks/<id>/assets/`, the
split client instead of a two client store, `TURBOSLIDE_BLOB_PRIVATE_TOKEN` and
`TURBOSLIDE_BLOB_PRIVATE_DIR`, the opt in comments group, `?author=` accepted and ignored.

## B3 Identity and accounts

Landed (stage 1, `b3.md`): `packages/identity` with the three principal id formats, the label
generator, the six hues, `normalizeName`, `decide()` with the matrix test, `resolvePrincipal`,
`markSpec`, the principal record; the sealed `__Host-ts_id` cookie and `principalMiddleware`.

Landed (stage 2): the identity marks (`renderMarkSvg`, `renderMarkPng1`, 1,000 marks equal in SVG
and PNG); better-auth 1.7.4 over `node:sqlite` (Kysely, an own dialect) or Postgres behind
`DATABASE_URL`, the magic link and the code in one mail, the device authorization plugin, sessions
of 7 days idle, GitHub when configured, the sign in limits; mail in `capture`, `resend` and `off`
modes with the templates; the alias, profile, quota and secondary storage stores; API keys (`ts_`
secrets hashed, `resolveBearerSync` with the bootstrap, checkout and key branches, the per checkout
token minted once); `requestIdentity` (bearer, session, anonymous cookie), `linkAnonymous`,
`bindIdentityHooks`; the share link exchange at `/s/<token>` (303 to `/deck` or `/edit`, the 404
page, 403 for a fetch); the avatar pipeline (sharp, four WebP sizes, digest names, ten a day);
the account and admin actions server side; the studio bearer rule (API keys bind the author to the
request, `?author=` ignored); the digest queue and the request batcher; the `/device` page and the
`/api/auth` handler; `accounts.spec.ts` and `agent-http.spec.ts` (14 passed on a fresh 4332). Merge
2: the twelve account and admin ids answer on every transport with the request's identity as the
facts; `findShareLink` and `deckIndex` bound; GET on `/device` and the magic link verify URL pass
the CSRF filter (R11; the `test.fail` marker in `accounts.spec.ts` now fails as an unexpected pass
and is B3's fixer row).

Carried to the fixer round: the flip of `localTokenRequired`'s default (R12's second half; the
switches are in the Playwright and check runner environments); the passkey plugin behind the
domain gate (R10) and the Postgres path against a live database; `accounts.spec.ts`'s chrome row
once B6's surfaces are wired to the route; `closeAgentSessions`; the built server's better-auth
schema check reporting `Database schema mismatch` (missing `user`, `session`, `account`,
`verification`, `deviceCode`) on the production preview of 4344 against a fresh
`.turboslide/auth.sqlite` while the dev server on 4321 over the same file reports nothing (the
migration's order in the built bundle). Deviations in `b3.md`: the passkey and API key plugins
absent (separate packages in 1.7), the per checkout token opt in this round, the raster only
equality of SVG and PNG, `TURBOSLIDE_LOCAL_TOKEN` and `TURBOSLIDE_LOCAL_OPEN`, the file store for
the specs.

## B4 Security platform and the check chain

Landed (stage 1, `b4.md`): the R0 intake edits, `TURBOSLIDE_TRUST_PROXY`, `authorize()` in shadow
mode, `SERVER_SIDE_WINDOW_ACTIONS` extended, `TURBOSLIDE_DOWNLOAD_SECRET` required hosted, the
attachment rule for `.svg` and `.json` assets, the security log, `firewall/rules.json`.

Landed (stage 2): `authorize()` first in every server function and route B4 owns with the author
derived from the session; the quotas of 8.3 as data with memory, kv and Upstash backends and the
429 with Retry-After; the deck caps; the security headers, the nonce CSP in report only mode with
the report endpoint, the widened CSRF filter, the content type rule, the foreign origin refusal;
`safeFetch` with the pinned lookup and the private range refusal, the Chromium egress denial;
the upload pipeline (re-encode, the magic byte sniff, the caps, the presigned path); the sanitizer
over DOMPurify with the CSS tokenizer and the sandboxed frame; the twelve kill switches with
`admin.flag`; the structured log with 68 event names, the IP hash and the retention table; the
cancel token, the thumbnail grant, the window API nonce guard; check steps 26 to 28 and `--greps`,
the smoke's security rows, `security.spec.ts` (7 rows green in both modes), `docs/security.md`.
Merge 2: the deck dispatcher's round three composition (`actions.ts`), `bindServerSeams` in
`start.ts`, the CSRF exemptions, `layoutBlobClient` in the hosting plugin, the check runner's two
switches, the overwrite allowlist for B2's record writers, the Build Output route stamping the
attachment headers on the CDN served `.json` and `.svg` twins (found by the hosted smoke), the
deterministic tamper in `tokens.test.ts`.

Carried to the fixer round: the two `script-src` `eval` CSP reports from the dev server's
dependency chunk (b5.md request 9); `maxBytes` per tier on the asset actions and `htmlFrame` in the
render worker (2.4.4); `TURBOSLIDE_PUBLIC_STORE_HOST` on the previews and `TURBOSLIDE_CSP=enforce`
after the report weeks (2.4.7); the WAF rules applied in log mode (the ship step). The ship step
also sets `TURBOSLIDE_SESSION_SECRET` and `TURBOSLIDE_DOWNLOAD_SECRET` on production.

## B5 Dither pipeline, variants, renderer, export, materials, the dialog rows, layout shift audit and route fixes

Landed (stage 1, `b5.md`): the renderer's DOM seam, the variant key, `img[width][height]`,
`iframe.ts-x-frame`, the collaborator classes and geometry.

Landed (stage 2): the dither pipeline in TypeScript (`dither.ts`, `blue64.ts` pinned by sha256,
`dither-io.ts`; parity 1.0 against `twoTone` on the sixteen recorded GT treatments); the variants
keyed by the dither parameters and the renderer path for `picture` and `shot`; the live canvas
preview runtime with the inline and worker hosts; the materials actions (`picture.materialize`
with prune, dry run and the missing list, `slide.setBackgroundPicture` and
`slide.setBackgroundMaterial`, `asset.add` with `replaceSource`); both export paths carrying the
variant bytes with the `dither:` residual lines and Perfect kept perfect; the Background dialog
rows (the Dither toggle, the Photograph and Neutral chips, the Material row) and the Format options
Dither section; the layout shift audit script, the editor and presenter skeletons, the font
preloads and the shell boot script, the nonce on the boot scripts and the block CSS (B4's request
2); `dither.spec.ts`; `docs/pptx.md` and `docs/freeform.md` sections. Merge 2: the `slide.toCanvas`
input and the `missing` answer of `picture.materialize` fixed, the two dither tests over scratch
copies without the fixture's variants, the export fixture test at 29 slides and 28 pages with the
two dither rows, `case 'dither'` in `FormatOptions.tsx`.

Carried to the fixer round: the Rust napi and wasm accelerator stages (decision 10; the
TypeScript stages are the reference); the 100 ms preview budget over 200 slider events recorded by
`dither.spec.ts` (the spec could not rerun under the e2e lock in stage 2); the audit's findings
attributed per builder in `b5.md` (`PicturesPanel`'s object material section,
`ViewerShell.initialPresent`, the `data-boot-*` unsettled frame rules, the presenter's fixed clock
boxes for B6; `uploadingBytes` and `PictureTarget.dither` for B2). The layout shift gate runs
against `vite preview` on 4344 in check step 27 now that the production build passes.

## B6 Chrome: presence, comments, inbox, share, versions, accounts dialogs, menu model

Landed (stage 1, `b6.md`): the `editor-shell.ts` contract, the menu model with the 64 ids, the
role predicates and the Later rows, the strings of 6.8 and 15, the comment chords, the toolbar
tails, the tokens.

Landed (stage 2): the title row with the five fixed slots (the presence slot at 184 px, the
comments glyph, the inbox plate with the count, Slideshow, Share with the request dot), the own
chip's menu, the roster on Shift+Tab, the Following plate, the remote carets, flags, outlines and
pointers in the six hues, the filmstrip chips and the comment count chip, the announcements
region; the Share dialog of 6.5 with the gear's five switches and the footer sentence, Publish with
Stop publishing, Make a copy with Copy comments, Request access, the You need access page; the
comment card, the markers, the Comments panel with For you, the four display modes and every chord
of section 14, the mention autocomplete, reactions, the tombstone with Undo; the inbox panel and
Notification settings, the Activity panel; version history by author with Show changes and the
disabled delete rows; the name prompt, sign in, profile and avatar builder dialogs at their fixed
boxes; the Edit HTML panel; the three round two open items closed in the viewer (group click,
Cmd+A, the crop mode double write); the four round three specs written against the contract;
chrome 474 tests, viewer 229. Merge 2: `case 'dither'` in `FormatOptions.tsx` (B5's request).

Carried to the fixer round: the four specs and the two audits on 4335 now that the editor boots
(the route still lacks `identities`, `activity`, `diffVersions` and the account callbacks, B2
R19); `IdentityChip` drawing from `@turboslide/identity/marks-render` (the export exists); the
audit's refits named in `b5.md`; finding 28 of VERIFICATION-2 (`canvas`, `objects`, `tables`,
`text-styles`); the presence spec's twenty participant walk (the simulate hook, B2). For Kevin
(b6.md decisions 2 and 3): the avatar builder's "Glyph" tab and the roster's "Agent · <runId>"
carry words the default view words test forbids and are exempted by name.

## Integrator

Merge 1 (`integrator.md` sections 1 to 7): the two `package.json` files, the catalog and the one
install, the exports and dependencies of every request, the vitest projects, the Playwright server
environment, the ignore files, the AGENTS.md sections, the contracts, the boot probe.

Merge 2 (`integrator.md` sections 8 to 15): the export and dependency requests of the six reports;
the deck dispatcher's round three composition with the request's identity as the caller; the
server seams bound at start; the CSRF exemptions; the hosting plugin's split client; the two
switches in the Playwright and check runner environments; the fixture's variants materialized;
the sessions split for the production build; the overwrite allowlist; the chrome lint's hue
exception; the Build Output route for the CDN served twins; the documents of the round (AGENTS.md,
README.md, docs/README.md, the skills, `docs/hosting.md` rows); three preview deployments with the
smoke at 19 of 19 on the third. Deviations in `integrator.md` section 12 (the account boundary
held, the two implementations of the background writes, the fixture's variants, the cookieless
localhost caller, `presence.list` over HTTP from the file records, the local token default not
flipped, the narrower CSRF exemptions, the import protection chain, the overwrite allowlist,
`share.emailCollaborators` 501 by design, the vitest budgets under load, the tamper flip).

Next: the verifier's pass on the preview `turboslide-igavfcg2x` and on a dev server (the eight
specs of step 26 with the builders' stage 2 reports as the map of what each still needs, the
parity audit, the layout shift audit on 4344, the multiplayer walk over the blob channel, S1 to
S4), then the fixer round in each builder's files, then the ship step: `pnpm check` 28 of 28 with
the contracts, the fonts and the fixture committed; the two secrets on production; the merge and
the production deploy with R0 to R5 in order; the WAF rules in log mode if the plan accepts them;
R6 on Kevin's domain and R8 on Kevin's date.

## Carried from VERIFICATION-2 sections 10 and 14

Group click selection, Cmd+A on the canvas and the crop mode double write are closed by B6 in
`packages/viewer/src/Editor.tsx` (stage 2). The four stale round two Playwright specs (`canvas`,
`objects`, `tables`, `text-styles`; finding 28) stay a fixer round item: `tables.spec.ts` and
`objects.spec.ts` carry B6's locator fixes but ran only to the boot timeout of the stage, and the
other two need a run against the booting editor before their counts change. The vitest budgets
under load stay open (seen at merge 1 and merge 2 in the tree runs; every file passes alone).
