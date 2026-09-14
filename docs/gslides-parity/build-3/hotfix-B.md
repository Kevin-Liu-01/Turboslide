# Hotfix B: the server access path and share links

Fixer B's record for the round after the round three ship (`docs/gslides-parity/build-3/ship.md`
section 6; VERIFICATION-3 findings 34 and 48), written 2026-09-14 on the shared checkout. Section
numbers refer to SPEC-3 unless prefixed. No git write command ran; no `pnpm install`, `pnpm add`,
`pnpm exec` or `pnpm build`; the dev server was `node_modules/.bin/vite dev --port 4352` from
`apps/studio` and is stopped. Files touched: `packages/store/src/access-store.ts`,
`packages/store/src/access-cache.test.ts`, `apps/studio/src/server/access.ts`,
`apps/studio/src/server/authorize.ts`, `apps/studio/src/start.ts` (the `findShareLink` binding
only), `apps/studio/src/routes/deck.$deckId.tsx` (the search grammar, the `headers` option and
the robots meta only), and the new `apps/studio/src/server/access-hooks.test.ts`.

## 1. Finding 34: the record cache and the share writes

What the production walk met: the commenter link minted after the viewer link's exchange answered
"decks/verifier-walk-…/access.json changed in the Blob store since it was read", the store's own
sentence, although `blobAccessStore.write` maps a `BlobPreconditionError` to an
`AccessPreconditionError` and `hostedAccessHooks.save` maps that to the SPEC-3 sentence. The likely
cause, read from the deployment output under `apps/studio/.vercel/output` (round two's build, the
same bundling): the function carries two copies of `packages/store/src/blob-store.ts`, one in the
Nitro server chunk (`index.mjs`, where the hosting plugin builds the Blob client) and one in the
SSR chunk (`_ssr/root-*.mjs`, where the store and the share actions run). The client throws the
Nitro chunk's `BlobPreconditionError`; the store's `instanceof` in the SSR chunk does not know it;
the raw error passes through every mapping and `errorBodyOf` answers 500 with its message. This is
a reading of the bundle, not a reproduction on production (a redeploy is the ship step's).

Changes, in order:

1. `packages/store/src/access-store.ts`: `isBlobConflict(error)` matches the two conflict classes
   by class and by `name`; `blobAccessStore.write` and `blobIndexStore.update` use it.
   `isAccessPrecondition(error)` does the same for `AccessPreconditionError` (a name match plus
   the `current` field), and `recordNewDeck` and the hooks use it.
2. The link hash index (F2): `LinkIndex` with `fileLinkIndex(stateDir)` (`.turboslide/links/
<hex>.json`), `blobLinkIndex(client)` (`links/<hex>.json` beside the records, an overwriting put
   so two instances indexing one link never conflict) and `memoryLinkIndex()`; `linkIndexKey`
   keeps the hex alone in the path; `newLinkHashes(previous, next)` names the links a save mints.
   `server/access.ts` builds the index beside the stores (`linkIndex()`).
3. `hostedAccessHooks(deckId, deps?)`: `load` reads past the cache (F1, drop then read) and keeps
   the stored record; `save` indexes the new links first, then writes with the read etag, then
   announces the `access` event. A conflict against the very record the write based on (equal
   canonical bytes under another etag, what a lagging copy of `access.json` produces) is retried
   once on the store's etag; a record that moved is a `ConflictError` with the SPEC-3 sentence,
   `currentRevision` the stored record's revision and `current` the stored record (the old code
   sent the attempted revision, which a client cannot re-base on). Any other error passes through.
   The deps are injectable for the tests; `actions.ts` keeps calling `hostedAccessHooks(deckId)`.
4. `findShareLink(hash, options, deps?)` in `server/access.ts`, bound by `start.ts`: the index
   names the deck and one record read answers, live or dead; a dangling entry or an unknown hash
   falls back to the scan of every stored deck's record and a hit heals the index; with `fresh`
   (the exchange always passes it) every record is read past the cache. The old binding read every
   deck through the cache and then every deck past it; an unknown token still costs one read per
   deck, as the ship step accepted.
5. The drop bus stays process local on the blob tier with the 5 s trust window of the ship step.
   The channel's `publish` is process local there too (`blobChannel` folds a memory channel), so
   an access bus riding it would reach no other instance; the TTL is the round's bound and every
   share write and exchange reads past the cache. The redis tier's shared drop is Kevin's install
   and B2's stream route: see request R3.

Measured on the checkout (the file tier, 4352): `share.get`, `share.createLink`, `share.stop` over
HTTP on a fresh copy answer in 20 to 40 ms; the exchange of a minted link as a navigation answers
303 to `/deck/<id>` with `x-robots-tag: noindex` and `referrer-policy: no-referrer`, the index entry
sits at `.turboslide/links/<hex>.json`, and the same navigation after `share.revokeLink` answers 404.

## 2. Finding 48: the published player's noindex

`apps/studio/src/routes/deck.$deckId.tsx`: `DeckSearch` gains `p` (the published token, validated
against `getDeck`'s grammar `[A-Za-z0-9_-]{16,64}`); the route's `headers` option answers
`x-robots-tag: noindex` when the address carries `p`, and `head` adds the robots meta beside the
title. Measured on 4352: `/deck/gt-brand?p=<22 chars>` answers 200 with `x-robots-tag: noindex`
and `<meta name="robots" content="noindex">`; `/deck/gt-brand` and `/deck/gt-brand?q=x` carry
neither. `share.spec.ts:268` passes (section 4). The `p` value is not yet passed to `getDeck` as
`publishToken` (request R1), so the player still opens through shadow mode's admission and the
410 after unpublish is not answered; the deck route beyond the header is not this fixer's file.

`apps/studio/src/server/authorize.ts`: a `gone` decision (a revoked publish token) is refused in
shadow mode as well, with `shadow: false` on its log line. Publishing is a round three construct,
so the shadow week has no earlier behaviour to keep for it, and SPEC-3 6.4 pins the 410 after
`deck.unpublish`. Every other denial passes with the legacy role as before (the two rows of
`authorize.test.ts` on shadow mode still pass; the new test pins both cases). The verifier may
reverse this if R3's reading is that shadow mode admits everything.

## 3. Tests added

- `packages/store/src/access-cache.test.ts` (5 tests kept, 6 added): two cached blob stores over
  one fake Blob store as two instances: the second link minted after another instance's write
  (the fresh read carries the store's etag and lands; the cached etag is a mapped conflict with the
  current record attached, never the store's sentence); the revoke seen by the other instance
  within the 5 s window and by a fresh read at once; a conflict thrown by another module copy
  (same `name`, foreign class) still mapped; the index key grammar, `newLinkHashes`, and the three
  index backends including a torn or foreign body as a miss.
- `apps/studio/src/server/access-hooks.test.ts` (7 tests): the hooks synthesize the legacy record,
  index before the record write and announce; two instances mint one link each through the fresh
  load; the one retry on an equal record under another etag; the SPEC-3 sentence with the current
  record when the record moved, for the store's class and a foreign copy of it, and a plain error
  passing through; `findShareLink` from the index with one read (fresh drops the cache; a dead link
  is null with no scan; without fresh the cache answers), the scan for an unknown or dangling hash
  healing the index and surviving an index that throws; `authorize()` answering 410 in shadow
  mode for a revoked publish token while a plain stranger stays admitted.

## 4. Commands run and results

| Command                                                                                                                                                                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b`                                                                                                                                                                         | exit 0 (10.9 s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `cd packages/store && ../../node_modules/.bin/vitest run`                                                                                                                                          | 12 files, 128 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `cd packages/identity && ../../node_modules/.bin/vitest run`                                                                                                                                       | 10 files, 79 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `cd apps/studio && ../../node_modules/.bin/vitest run`                                                                                                                                             | 25 files, 173 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `node apps/cli/e2e/share.mjs`                                                                                                                                                                      | 19 steps passed (2.9 s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `PLAYWRIGHT_BASE_URL=http://localhost:4352 node_modules/.bin/playwright test apps/studio/e2e/share.spec.ts` (tmp store, memory channel, `.turboslide/e2e.lock` held)                               | run 1: row 1 passed, row 2 failed at the commenter's `/edit` page not settling in 5 s (the page showed a banner only; the dev log shows another fixer's edit of `edit.$deckId.tsx` hot reloading during the run; a timed probe of the same steps settled the commenter page in 1.7 s in `commenting`). Run 2: rows 1 and 2 passed, row 3 passed the header at line 268 (finding 48) and the player's 200 and failed at line 280, the embed's `gt-deck-slide` message (section 5, R2); row 4 did not run |
| `PLAYWRIGHT_BASE_URL=http://localhost:4352 TURBOSLIDE_AUTH_DB=<abs>/.turboslide/auth-b.sqlite node_modules/.bin/playwright test apps/studio/e2e/agent-http.spec.ts --grep "API keys"` (file store) | 2 passed: the key accepted with the registered name and run id, the unknown and revoked key 401. The file store because the spec seeds `decks/e2e-agent` in the checkout and reads `deck.json` back (`revisionOnDisk`), which the tmp overlay cannot see; the auth database path is absolute because the server resolves a relative one against its root and the spec against the checkout                                                                                                              |
| `curl` on 4352: `/deck/gt-brand?p=<token>`, `/deck/gt-brand`, `/deck/gt-brand?q=x`, `/embed/gt-brand?p=<token>`                                                                                    | noindex header and meta on the first; none on the second and third; none on the embed (R1)                                                                                                                                                                                                                                                                                                                                                                                                              |
| `curl` on 4352 (file store): `deck.copy` of `fixture`, `share.createLink`, the exchange as a navigation, `share.revokeLink`, the exchange again                                                    | 200, 200 (`.turboslide/links/<hex>.json` written), 303 to `/deck/probe-b-link` with noindex and no-referrer, 200, 404; the scratch copy removed by hand after `deck.trash` and `deck.remove` answered 400 on an empty body                                                                                                                                                                                                                                                                              |
| `node_modules/.bin/prettier --check` on the seven files                                                                                                                                            | three files reformatted with `--write` (`access-store.ts`, `access.ts`, the two tests and this note), then `--check` clean on all eight; `tsc -b` and the store and studio vitest reruns green after the reformat                                                                                                                                                                                                                                                                                       |

One protocol slip, recorded: the second `share.spec.ts` run's wait loop proceeded after 60 misses
of `mkdir .turboslide/e2e.lock` (another run's lock from 03:05 stood) and started Playwright without
holding the lock; it was killed within a minute, before its first row finished, and the run was
repeated once the lock was free with a loop that runs nothing without the lock.

## 5. Requests (other fixers' files; the verifier or the ship step applies them)

- R1 (B4 and B2, `apps/studio/src/routes/deck.$deckId.tsx` beyond the header, `embed.$deckId.tsx`,
  `server/decks.ts`): nothing reads `?p=` today. The deck loader must pass `publishToken: deps.p`
  to `getDeck` (with `p` in `loaderDeps`), the embed loader the same, and the embed route the same
  `headers` and robots meta (SPEC-3 6.4 "every response reached through a token carries noindex").
  With that and the authorize change of section 2, `getDeck` throws `DeniedError(410)` for a
  revoked token; the route needs an `errorComponent` that renders `REFUSALS.noLongerPublished`
  ("This presentation is no longer published") and a 410 status on the server's answer, so the
  `share.spec.ts` row 3 assertions at lines 283 to 285 hold. Until then the player opens through
  shadow mode's admission whatever the token says.
- R2 (B5 or B6, `apps/studio/src/components/DeckViewer.tsx:84`): the embed posts `gt-deck-slide`
  with `window.location.origin` as the target origin, so only a parent on the studio's own origin
  ever receives it; the Prototemplate page and the spec's `about:blank` parent (`share.spec.ts:270`)
  receive nothing. The message carries a slide number only; post with `'*'`, or with the ancestor
  origin read from `document.referrer` when the embed ancestors list names it.
- R3 (B2, `apps/studio/src/routes/api/decks.$deckId.stream.ts:130`): on an `access` event from the
  channel, drop the cached record before the recheck (`(await accessStore()).drop(deckId)` or
  `readStoredAccessFresh`), so on the redis tier another instance's share write is seen by the open
  streams at once instead of within the cache window. On the blob tier the event is process local
  and the drop is a no-op.
- R4 (B4 or B6, the deck route's `notFoundComponent` and the three viewer routes): the You need
  access page (`packages/chrome/src/YouNeedAccess.tsx`) is mounted by no route, so `share.spec.ts`
  row 4 (the stranger's request form on `/deck/<id>`) and row 2's enforce branch cannot pass in any
  mode; row 4 also needs enforce mode, because row 2's shadow branch pins 200 for the same stranger
  on the same address. The spec's two rows disagree about the mode; the verifier decides which
  mode the check chain runs the file in.
- R5 (B2 and B6, an observation, not measured further): the first window API call on a freshly
  copied deck's editor page waits 16 to 20 s (`share.get` 20,000 ms, `share.createLink` 16.7 s in
  two probes) while the same actions over HTTP answer in 20 to 40 ms and the page's later calls in
  about 100 ms. Something in the window transport's first call on a new deck waits a full 20 s poll
  (`sessions.ts` `POLL_DEFAULT_MS`, `write.ts` `WATCH_DEFAULT_MS`). Not this fixer's files.
