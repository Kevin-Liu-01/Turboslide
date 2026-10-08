# Hardening research: verification of the data audit

Key `data-verify`. Port 4842. Written 2026-10-08 against `/Users/kevinliu/repos/Turboslide-harden` at
`0d3920a3` (the tree production serves). This pass tries to refute each finding of
`docs/hardening/research/data.md` (DATA-1 to DATA-4) and then looks for what that audit missed in its
own scope. Research only: nothing committed, pushed or deployed, and no Vercel, Cloudflare, GitHub or
Google setting changed. Production was read passively: three `HEAD` requests on the public seed deck
`gt-brand` in the public Blob store, and the production guard's own smoke files in the tree. No
secret value is printed; the two local test accounts and their sign in codes existed only in the
local SQLite file, which was deleted with the overlay when the server stopped.

## Local server

```
cd /Users/kevinliu/repos/Turboslide-harden/apps/studio
TURBOSLIDE_STORE=tmp TURBOSLIDE_OVERLAY_DIR=.turboslide/data-verify-overlay TURBOSLIDE_REALTIME=memory \
TURBOSLIDE_AUTH_DB=.turboslide/auth-data-verify.sqlite TURBOSLIDE_MAIL=capture \
GOOGLE_CLIENT_ID=fake-client-id.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=fake-secret-for-local-tests \
TURBOSLIDE_SESSION_SECRET=<40 chars> TURBOSLIDE_DOWNLOAD_SECRET=<40 chars> \
TURBOSLIDE_ROOT=/Users/kevinliu/repos/Turboslide-harden \
[TURBOSLIDE_AUTHORIZE=enforce] node_modules/.bin/vite dev --port 4842 --strictPort
```

Production's settings were kept where a result depends on them: `TURBOSLIDE_LOCAL_OPEN` unset,
`TURBOSLIDE_AUTH_RATE_LIMIT` unset (the limiter on), `TURBOSLIDE_MISSING_RECORD` unset (`open`, which
production keeps). The shadow runs leave `TURBOSLIDE_AUTHORIZE` unset (production's mode); the
enforce runs set it. Differences from production that the results do not depend on: the `tmp` store
in place of Vercel Blob and the `memory` realtime tier in place of the Durable Object. Every
reproduction goes through the server functions the editor and the home page call
(`POST /_serverFn/<id>`, serialized as the TanStack client does) or the routes under `/api`, with two
anonymous cookies minted by the server (A, the owner; B, a stranger) and, for the account rows, a
local test account signed in through the email code that `TURBOSLIDE_MAIL=capture` stores. The one
minute load was 67 to 221 during the runs (other sessions' jobs); no timing here is a verdict. The
server was stopped and the overlay removed before this report was written.

## Verdicts

### DATA-1: real, severity 4

Reproduced end to end. A created a deck through `createDeckFn` (`decks.ts` 448 to 467), which wrote
a restricted record with A as owner, and renamed it to a marker title. B, a fresh anonymous cookie:

| Action by B                          | Shadow (production's mode)                                         | Enforce             |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------- |
| `GET /api/access/verify-secret-plan` | 200, owner id, general access, `role: viewer`, `authorize: shadow` | 404 `not_found`     |
| `GET /deck/<id>`                     | 200, the owner's marker title in the HTML                          | 404                 |
| `renameDeckFn` (a write)             | ok, revision 2, title "Changed by a stranger"                      | refused `not_found` |
| `copyDeckFn`                         | ok, a copy `stolen-copy` owned by B                                | refused `not_found` |
| `trashDeckFn`                        | ok, trashed                                                        | refused `not_found` |
| `removeDeckFn` (delete forever)      | ok, `removed: true`; the deck folder and its record are gone       | refused `not_found` |

That production runs in shadow holds: the guard's smoke of 2026-10-08 11:35Z
(`docs/gslides-parity/polish-two/production/guard/20261008T113510Z-6fd18a49-smoke-production.txt`,
row `unsigned thumbnail`) read a 302 for a cookieless thumbnail request, and in enforce mode
`routes/api/render.$slideId.ts` answers 403 to a request with no principal and no agent. On
production the realtime tier is `do`, so `/ops` answers 409, and a socket ticket carries the shadow
floor role `viewer`, which the Durable Object refuses for edits (`deck-room.ts` 937 to 940). The
reach stands anyway: rename, trash, remove and copy are server functions that write the store
directly, and `writeDeckFn` (`write.ts` 861) passes a shadowed decision to `admitServerWrite`, which
on the `do` tier writes through the Worker under the bearer with no role check.

Two corrections to the audit's text. First, the stranger cannot change sharing even in shadow mode:
`share.setGeneralAccess` and `share.invite` from B answered 404 "This presentation is not available
to you", because the record functions behind `shareWriteFor` check the caller's standing again. So
"read the membership" holds for the owner id and the general access through `/api/access`; the
grants with their email addresses leak through DATA-2, not this path. Second, "production has no
accounts database, so every principal is an anonymous cookie" is stale: production offers Continue
with Google and has a Google client (`docs/gslides-parity/polish-two/production.md` rows 5 and 37).
That matters for the fix: flipping to enforce today locks signed in owners out of their own decks
(DATA-V4 below), so DATA-V4 must land before or with the flip.

### DATA-2: real, severity 4

Confirmed passively at 18:31Z on production's public store, on the public seed deck only:

```
HEAD https://ggmycvj7j6224ay5.public.blob.vercel-storage.com/decks/gt-brand/deck.json
  -> 200 application/json, 96268 B, cache-control public, max-age=2592000
HEAD .../decks/gt-brand/versions/1.json   -> 200 application/json, 80164 B, same cache
HEAD .../decks/gt-brand/slides/title.json -> 200 application/json, 302 B, same cache
```

The code confirms every document goes to that store: `layoutBlobClient` returns the public client
when `TURBOSLIDE_BLOB_PRIVATE_TOKEN` is unset (`packages/store/src/blob-vercel.ts` 269 to 273);
`blobAccessStore` writes `decks/<id>/access.json` (`access-store.ts` 430 to 431) and `putWithCopy`
also keeps every revision of it at `decks/<id>/.turboslide/copies/<md5>.json` (`access-store.ts` 312
to 351), so revoked grants and their email addresses are never overwritten; `blobIndexStore` writes
each principal's deck list to `users/<principal>/decks.json` (`access-store.ts` 704 to 706);
`docs/HOSTING-MOVE.md` 1.3 lists 943 such indexes on the store. The grant schema carries the
invitee's email (`packages/schema/src/access.ts` 218 to 221).

The audit's fix is incomplete as built, which changes what "pass" means for its pin:

- The migration leaves `decks/<id>/assets/`, `exports/`, `bundles/` and `u/` on the public store
  (`packages/store/src/migrate.ts` 81 to 86) and does not copy twins to `d/<id>/<assetKey>/`
  (`migrate.ts` 14 to 15).
- Every new record's asset key is `legacyAssetKey(deckId)`, the id padded with zeros
  (`apps/studio/src/server/access.ts` 548 to 554, `packages/schema/src/access.ts` 311 to 314;
  read locally: `"assetKey":"verify-secret-plan0000"`). So the pictures of a restricted deck stay at
  derivable public paths after the migration, and the smoke row `twin URL not derivable` cannot pass
  until a random key is minted and the twins move.
- `.thumbs/` goes private under the migration while `render.$slideId.ts` answers a 302 to the stored
  object, so that route has to stream the thumbnail after the cutover.
- The documents carry `max-age=2592000`; a browser or proxy that fetched one keeps it up to 30 days
  after the public copy is deleted. The private store should be the place every new document is
  written from the first day, with the cache shortened on the public copies before the cutover.

### DATA-3: not real as stated, severity 1 (residual)

The central claim is false for the deployed tree. `remove()` deletes `exports/<id>/`,
`builds/<id>/` and `bundles/<id>/` before the deck (`packages/store/src/blob-store.ts` 263
`DECK_COPY_FOLDERS = ['exports', 'builds', 'bundles']`, and 2919 to 2925, inside the very range the
audit cited). It landed in `8bc8d845` (2026-10-02, "H7: a deck's export, build and bundle copies leave
the store with the deck"), an ancestor of `0d3920a3`. The unit test that pins it passes:

```
cd packages/store && ../../node_modules/.bin/vitest run src/hosted.test.ts -t "copies with the deck"
  1 passed | 81 skipped   (load 85)
```

The 2,114 objects for 219 deck ids that the audit quotes were measured on 2026-09-20
(`HOSTING-MOVE.md` 1.3), twelve days before H7. What remains: (a) the exports of decks removed before
H7 are still on the store, since no sweep names them; (b) a produced export lives at a public URL with
an unguessable job id (`<base36 time>-<6 hex>`, `apps/render-worker/src/queue.ts` 107) until the next
batched export of the same deck prunes jobs older than a day (`export-batch.ts` 191 to 196) or the deck
is removed. Fix: one sweep of `exports/` for deck ids with no `deck.json`, and a daily prune of
produced files older than seven days. Pin: a sweep unit test over the memory Blob client.

### DATA-4: partly real, severity 2

- "A replaced picture stays readable": false. `setPictureAvatar` writes the new files under a fresh
  128 bit key and deletes the previous key (`apps/studio/src/server/auth/avatar.ts` 395 to 430);
  choosing a non picture avatar deletes it too (`auth/actions.ts` 493). The test "stores the files
  under a fresh key, records the choice, and deletes the previous key on change" passes (12 of 12 in
  `avatar.test.ts`).
- "`account.forget` does not reach it": not a defect. `account.forget` mints a fresh anonymous
  cookie (`auth/actions.ts` 548 to 554), and anonymous principals cannot upload a picture
  (`avatar.ts` 404 `SIGN_IN_TO_UPLOAD`).
- "Survives account deletion": real, reproduced. A local test account set a picture through
  `runDeckActionFn` `account.setAvatar`, then `POST /api/auth/delete-user` answered
  `{"success":true}`. Afterwards the five files stayed under `.turboslide/users/u/<key>/` and
  `GET /api/avatar/u/<key>/<digest>-64.webp` answered 200 `image/webp`. `onUserDeleted`
  (`auth/identity.ts` 736 to 743) nulls the profile's `avatarKey` and never calls `removePictureFiles`
  (`avatar.ts` 444), which nothing calls; the orphan is removed only when an admin runs
  `turboslide admin avatar-sweep` by hand. On the blob tier the files are public URLs with a year of
  cache. The URL needs the 128 bit key, which every collaborator who saw the person's avatar holds.

Fix: call `removePictureFiles` from `beforeUserDelete` (the hook list in `identity.ts` 109 and 388 is
empty today), and run the sweep on a schedule. Pin: a unit test that deleting a user with a picture
leaves no file under the key.

## What the audit missed

### DATA-V1 (severity 3): deck ids are guessable, and two routes say whether a restricted deck exists

- Ids are the slug of the title: `deckIdFor` (`packages/store/src/templates.ts` 952 to 953) for
  `deck.create`, templates and `deck.copy` ("Copy of Q3 plan" becomes `copy-of-q3-plan`). Read
  locally: "Verify Secret Plan" became `verify-secret-plan`.
- A draft from `/new` is `untitled-<yyyymmdd>-<4 chars>` from `Math.random` over 36 characters
  (`apps/studio/src/server/root.ts` 389 to 402): 1,679,616 ids per day.
- With DATA-2, anyone can enumerate a day's drafts or a dictionary of titles against
  `decks/<id>/deck.json` on the public store, with no link, no cookie and no rate limit of the app.
- After enforce, two oracles remain. `GET /api/access/<id>` answers 404 for a restricted deck and 200
  with a synthesized open record for an id that does not exist (read on 4842 in enforce:
  `does-not-exist-xyz` 200, `verify-second-deck` 404), against the route's own comment that it
  "never says whether a deck exists". And `createDeckFn` from B with the name "Verify Second Deck"
  answered "decks/verify-second-deck exists already; pick another name" for A's restricted deck
  (`templates.ts` 1024, `blob-store.ts` 2796 and 2835).

Fix: give every new deck a random id of at least 128 bits (the title lives in the manifest), keep the
slug only for templates; answer a missing deck with the same 404 as a restricted one in
`/api/access`; on an id collision pick a fresh random id instead of naming the existing deck. Pin: a
unit test on the id generator's length and alphabet; an enforce row that `/api/access/<random>` and
`/api/access/<restricted>` answer the same status and body.

### DATA-V2 (severity 3): one deck leads to its owner's and collaborators' whole library

The owner's principal id is in every `/api/access` answer to a reader (`shapeRecordFor`,
`access.ts` 874 to 893; B read `"owner":"anon_117b98b6-…"` in shadow), and every version record names
its author's `principalId` (`authorize.ts` `authorFor`; read locally:
`"author":{"kind":"human","name":"Silicon 623","principalId":"usr_…"}`). The index
`users/<principal>/decks.json` on the public store lists `owned`, `shared`, `trashed` and `recent` deck
ids (`access-store.ts` 586 to 611). So a person given one view link, or anyone who read one deck's
versions from the store, reads the owner's index and then every deck in it. Not tried on production
(it would read other people's data); proven from the code and the store listing in
`HOSTING-MOVE.md` 1.3. Fix: the private store of DATA-2 (`users/` is private under `isPublicPath`), and
stop sending principal ids to readers who are not share holders (a role word or the display name is
enough for the UI). Pin: the hosted smoke reads `users/<own id>/decks.json` on the public host and
expects 403 or 404.

### DATA-V3 (severity 3): a deck without a record is open to everyone in enforce mode and any signed in person can claim it

- `recordNewDeck` writes nothing when the caller has no identity (`access.ts` 540 to 541), and
  `decide()` reads a missing record as the open editor deck while `TURBOSLIDE_MISSING_RECORD=open`,
  which DATA-1's fix keeps. Reproduced in enforce: `createDeckFn` without a cookie made
  `cookieless-board-notes` with no record; B then read `/api/access` 200 with
  `generalAccess: open editor` and capabilities including `write`, `trash`, `publish` and `share`, and
  renamed it.
- The first save of a draft creates the deck and then writes the record (`write.ts` 846 then 856)
  with no rollback; `createDeckFn` and `copyDeckFn` do the same (`decks.ts` 464 to 466, 577 to 579).
  When the record write throws (a Blob 429 or 5xx, which production sees), the deck stays without a
  record, the retry finds the deck and skips the record, and the deck is open to every visitor from
  then on. Proven from the code; not fault injected.
- `share.claim` lets any signed in account take an unowned deck (`apps/cli/src/records/access.ts`
  847 to 868). Reproduced in enforce: a local test account claimed `cookieless-board-notes`, became
  owner, set it to restricted, and B then read 404. On production that applies to `gt-brand` and every
  legacy deck without a record, for anyone with a Google account.

Fix: create the record before the deck or in the same step, and refuse a create without an identity
(the server functions can mint the cookie as `requestIdentity` does); write explicit records for the
legacy decks (an open record for `gt-brand` with an admin owner), then set
`TURBOSLIDE_MISSING_RECORD=notFound`; restrict `share.claim` to the admin. Pin: a unit test that a
failed record write leaves no deck; an enforce row that a cookieless create is refused; an enforce row
that a signed in stranger's `share.claim` on a legacy deck is refused.

### DATA-V4 (severity 3): server functions never see the signed in account, so enforce locks owners out

`requestContext()` builds the context from `authContextFor`, which reads only the anonymous cookie
(`apps/studio/src/server/auth/session.ts` 329 to 338 and 400 to 403; `authorize.ts` 359 to 385). The
routes use `requestIdentity`, which resolves the account. A deck first saved on `/new` by a signed in
person is recorded with the account `usr_…` as owner (`write.ts` 856 through `room.requestIdentity`).
Reproduced in enforce with a local test account: `writeDeckFn` on `untitled-20261008-vq7k` saved
revision 1 and `/api/access` read `role: owner`, then `GET /deck/untitled-20261008-vq7k` as that same
person answered 404 and `trashDeckFn` answered `not_found`; on a deck the account had claimed,
`renameDeckFn` and `removeDeckFn` answered `not_found` too. Shadow mode hides this today; the
`e2e/core` roles rows that DATA-1 cites run with anonymous principals. Every server function that
calls `requestContext` is affected: `getDeck`, rename, trash, restore, remove, copy, deck details,
downloads, render grants and bundles.

Fix: one context builder for routes and server functions (`requestContext` delegating to
`requestIdentity`, or `authContextFor` resolving the session), then flip to enforce. Pin: an enforce
spec row that a signed in creator opens `/deck/<id>` and moves it to trash.

### DATA-V5 (severity 2): account deletion leaves the person's decks behind

After `POST /api/auth/delete-user` the test account's decks stayed with records naming the deleted
principal (`signed-in-made`, `untitled-20261008-vq7k`, `cookieless-board-notes`); `onUserDeleted`
(`identity.ts` 736 to 743) touches the profile, aliases, principal record and keys only, and no
`onDeleted` hook is bound (`start.ts` 71 to 76). The decks keep their content (public on the blob
tier, DATA-2) and only the deployment admin can remove them, because `remove` is owner only. Fix: on
deletion, trash every deck the account owns with a removal date, drop its grants on other decks and
its index. Pin: a unit test over the memory stores.

### DATA-V6 (severity 1): create and copy answer the server's file path

`createDeckFn` and `copyDeckFn` return `dir`, the absolute folder on the instance (read locally:
`/Users/kevinliu/repos/Turboslide-harden/apps/studio/.turboslide/data-verify-overlay/decks/…`). Drop
`dir` from the browser answer. Pin: a unit test on the answer's keys.
