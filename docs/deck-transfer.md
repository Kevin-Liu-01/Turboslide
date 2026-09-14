# Deck transfer

How a deck moves between a checkout and a hosted studio, written for the round of 2026-09-11.
Kevin's directive, verbatim: "for presentation thing be able to copy the thing into the main app
to edit it on your own or have a way to connect the local slides with the app for you to edit or
something or just be able to edit it locally", and in the same round: "we should be able to create
decks in turboslide deployment, and we can see the gt template presentation too". The unit of
transfer is the deck bundle, one zip; the four CLI commands `deck pack`, `deck unpack`, `deck push`
and `deck pull` and the two studio routes move it; the studio's own pages download and upload it
through server functions, so the browser never holds the deployment's bearer token.

## 1. The bundle

A bundle is a plain zip (`application/zip`, any archive tool opens it) holding `manifest.json` at
the root and the deck's files under `decks/<id>/` in the layout of SPEC 4.1:

```
manifest.json                         bundleVersion 1, deckId, title, revision, packedAt, digests
decks/<id>/deck.json                  the manifest
decks/<id>/slides/<slideId>.json      one file per slide
decks/<id>/assets/<file>              the twins and recipes
decks/<id>/versions/<n>.json          the version log (optional: `deck pack --no-versions`)
decks/<id>/import-ids.json            the sidecars, when the deck has them
decks/<id>/import-report.json
decks/<id>/known-findings.json
```

`manifest.json` carries `documents` and `assets`, each a map from the file's path relative to the
deck directory to `{ bytes, sha256 }`. Leases (`leases.json`) and the `.turboslide/` state folder
never travel: leases expire and belong to one store, the state is derived. The writer sorts the
entries, stamps every one with the deck's `updatedAt` and deflates each entry only when that is
smaller (JPEG twins are stored), so packing one revision twice gives identical bytes; the reader
walks the central directory, so an archive made by `zip -r` or macOS Finder reads too, with its
`__MACOSX/` folders ignored. The zip code is `@turboslide/store/zip`, dependency free on
`node:zlib` (deflate, inflate, CRC-32); zip64 (over 4 GB or 65,535 entries) is refused with a
TypeError, as is an entry whose inflated bytes miss their recorded size or CRC.

Unpack checks everything before it writes anything (`@turboslide/store/unpack` `inspectBundle`):
the manifest's shape and version; that every archive entry sits under `decks/<manifest.deckId>/`,
is listed in the manifest and matches its digest, and that nothing the manifest lists is missing;
that every file under `assets/` is one of png, jpg, gif, webp, svg or json and, for an image,
carries the signature of the type its extension claims (a `.png` holding JPEG bytes is refused);
and that the document passes `validateDeck` (SPEC 4.4) with no severity 3 issue. The archive may
inflate to at most twice the 200 MB bundle cap. The deck is then written into a staging folder
under `<decks>/.turboslide/unpack/` and renamed into place, so a reader never sees a half-written
deck.

The target id is the bundle's deck id, or `--as <id>`. An id that is taken becomes the next free
sibling (`<id>-2`, `<id>-3`) unless `--replace` removes the deck that holds it first; an explicit
`--as` that is taken is refused without `--replace`, since the caller named it. When the id
changes, `deck.json` is rewritten with the new id in canonical form; otherwise every file lands
byte for byte as it was packed. `templates` is never a deck id.

## 2. The CLI

Four actions of the table (`packages/schema/src/actions.ts`, transport `cli`), run by
`apps/cli/src/commands/deck.ts`:

| Command                                                                                         | Action        | What it does                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turboslide deck pack <id> [--out <file.zip>] [--no-versions] [--decks <dir>]`                  | `deck.pack`   | writes decks/<id> (or a deck directory given as a path) as a bundle; the default name is `<id>-r<revision>.zip` in the working directory; reports the counts, the bytes and the sha256       |
| `turboslide deck unpack <file.zip> [--as <id>] [--replace] [--decks <dir>]`                     | `deck.unpack` | creates or replaces a deck under decks/ from a bundle; exit 2 with the reason when the bundle is refused, and nothing written                                                                |
| `turboslide deck push <id> --to <url> [--token <t>] [--as <id>] [--replace] [--from-url <url>]` | `deck.push`   | packs decks/<id> and uploads the bundle to a studio through `POST /api/decks/bundle`; prints the editor URL of the deck there; `--from-url` posts `{ url }` instead of the bytes (section 4) |
| `turboslide deck pull <id> --from <url> [--token <t>] [--as <id>] [--replace]`                  | `deck.pull`   | downloads a bundle from a studio through `GET /api/decks/<id>/bundle` (a 302 to a stored copy is followed) and unpacks it under decks/                                                       |

The bearer token: `--token <t>` once, and the CLI saves it for that origin in
`~/.config/turboslide/hosts.json` (`XDG_CONFIG_HOME/turboslide/hosts.json` when set;
`TURBOSLIDE_CONFIG_DIR` for tests), mode 0600, the folder 0700, never under the checkout
(`apps/cli/src/hosts.ts`). The next call reads it back; `TURBOSLIDE_TOKEN` in the environment and
`--token` both outrank the file. A 401 names the flag and the file; nothing prints a token. Against
a preview deployment behind Vercel Authentication the CLI also sends the project's development
token in the Trusted Sources header when `VERCEL_OIDC_TOKEN` is in the environment (`vercel env
pull`, docs/hosting.md section 7), the way `scripts/hosted-smoke.mjs` does; the value is never
printed either.

Measured on this machine (2026-09-11, `apps/cli/e2e/deck-transfer.mjs` against a `vite preview`
of the built studio on the checkout's decks/): push of the fixture deck 17 to 22 ms, pull 6 to 7
ms, the round trip byte identical for every slide and asset; `GET /api/decks/gt-brand/bundle`
answers the GT deck as 19,283,934 bytes (the 30 MB of twins, JPEG stored, JSON deflated).

## 3. The studio routes

| Route                                    | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/decks/:deckId/bundle`          | the bundle as an attachment `<deckId>-r<revision>.zip`, packed from the store (synced first, the twins pulled to disk), with `X-Turboslide-Bundle: { deckId, revision, bytes, counts }`; 404 for a missing deck                                                                                                                                                                                                                                                                                     |
| `POST /api/decks/bundle[?as=&replace=1]` | creates (201) or replaces (200) the deck a bundle holds and answers the unpack result with `editUrl` and a `Location` header; the body is the zip (`application/zip` or `application/octet-stream`), a multipart form with the zip as a file part (`file` or `bundle`; the /decks page), or `{ "url": "<stored copy>", "as"?, "replace"? }` as JSON; 400 with the reason for a refused bundle (`code: invalid_input`), 413 over 200 MB (`payload_too_large`), one error body as the agent surface's |

Authentication (SPEC 11): with `TURBOSLIDE_TOKEN` set, both routes require `Authorization: Bearer
<token>`, the rule of the export route; unset (a checkout), they are open. The studio's own pages
never hold the token: the `bundleDownloadTicket` and `bundleUploadTicket` server functions
(`apps/studio/src/server/bundle.ts`) mint a ticket, HMAC-SHA256 over the purpose (download of one
deck, or upload), the subject and a ten minute expiry, keyed from the bearer token when set (so a
ticket minted on one instance verifies on another), else `TURBOSLIDE_DOWNLOAD_SECRET`, else a
per-process random key; the route accepts `?t=<ticket>` in place of the bearer. Measured against
the built studio started with `TURBOSLIDE_TOKEN` set: `/api/decks/gt-brand/bundle` 401 without the
header and 200 with it, `POST /api/decks/bundle` 401, `/api/agent` 401 and 200 with the bearer,
`GET /api/export/gt-brand` 401, the `?w=160` thumbnail 200; the page's Download bundle and Upload
deck bundle both worked through their tickets (`apps/studio/e2e/deck-transfer.spec.ts`).

On the blob backend (docs/hosting.md) an upload is written into the overlay, uploaded to the Blob
store with `deck.json` last (`pushDeckDir`), and on a replace the store's files the new deck does
not carry (removed slides, old versions, the leases) are deleted, so the next instance lists and
opens the deck; a replaced deck's thumbnails and render cache on the instance are purged. An id
that is taken is judged by the store (`HostedDecks.has`), not by this instance's folder, so a deck
made on another instance counts.

## 4. Hosted limits

A Vercel function accepts a 4.5 MB request body and answers at most 4.5 MB
(docs/hosting-diagnosis.md section 4), and the GT deck's bundle is 19.3 MB. Two paths around it:

- Download: inside a function a bundle over the cap is stored on the Blob store under
  `bundles/<deckId>/<stamp>-<random>/<file>` (public, unguessable) and the route answers 302 to
  that copy, which `deck pull` and a browser follow; on the tmp backend, which cannot hold a copy,
  the answer is 413 with the reason. The copies are never deleted (`vercel blob del` removes them).
- Upload: `POST /api/decks/bundle` with `{ "url": "<stored copy>" }` makes the studio fetch the zip
  itself (redirects refused, 200 MB cap), from the deck store's Blob host only
  (`*.blob.vercel-storage.com`, plus localhost in a checkout, never any other host). Store the zip
  there first (`vercel blob put <file.zip>` prints the URL) and run `turboslide deck push <id> --to
<url> --from-url <blobUrl>`; a raw push over the cap answers 413 and the CLI says so. A direct
  client upload to Blob from the CLI (a client token from the studio) is the next step and is not
  built.

## 5. The studio pages

Since the Google Slides parity round (gslides-parity SPEC 6.2 to 6.5) the pages read as Google's:

- `/decks` is the home page: "Start a new presentation" with the Blank card (`/new`) and the GT
  brand deck card (`deck.create` from the GT template through the store, which on the blob backend
  uploads the new deck before it answers), then "Recent presentations" as cards or rows over
  `deck.list`, each with a menu: Open, Open in new tab, Present (`/deck/<id>?present=1` in a new
  tab), Rename (in place, one `deck.set /title` through the deck's store), Make a copy (the dialog
  below), Download (the bundle zip through the same ticket route as before) and Move to trash
  (`deck.trash`, with Undo in the snackbar). Trash at the bottom opens `/decks/trash`, where
  Restore and Delete forever run `deck.restore` and `deck.remove`. The Connect card and the bundle
  upload form left the page: the connect facts live in Extensions > Agent access, the upload in
  File > Open's Upload tab, which posts the zip to `POST /api/decks/bundle` with a ticket from
  `bundleUploadTicket` exactly as the old form did.
- Make a copy (`deck.copy`, server side in `apps/studio/src/server/decks.ts` `copyStoredDeck` over
  the collection): the dialog's Name is prefilled "Copy of <title>" and selected, "Remove speaker
  notes" is off, Enter runs it, and the copy opens in a new tab. From the editor, File > Make a
  copy > Selected slides passes `slideIds`; the copy keeps only those slides and their sections,
  never copies leases or the trash stamp, and starts at revision 0.
- Import slides (`slide.import`, server side in `apps/studio/src/server/actions.ts`): the dialog
  lists `deck.list`, then the source deck's slides through `readSourceDeckSlides` (decks.ts), and
  one write inserts the copies after the current slide with the assets they reference copied under
  the target deck (and pushed under its prefix on the blob backend).
- `/deck/<id>?present=1` opens the viewer in present mode on load (the GT template presentation is
  `/deck/gt-brand?present=1` on any studio that holds the deck); `/deck` and `/embed` payloads
  carry no speaker notes and no skipped slides (SPEC 6.6), and a deck in the trash answers 404.

## 6. Tests

- `packages/store/src/bundle.test.ts` (11): the zip round trip byte for byte and deterministic,
  the CRC and name refusals, the inflate cap, the system `unzip -t` accepting the archive and the
  system `zip -r` archive reading (skipped where the tools are missing), the image sniffing, pack
  and unpack of the worked deck byte for byte with versions and sidecars and without leases, a bad
  slide refused before any write, digest and layout and asset refusals, the free sibling id, the
  refused `--as`, replace, the `exists` hook.
- `apps/cli/src/commands/deck-transfer.test.ts` (4): pack and unpack through the CLI, a bad bundle
  at exit 2 with nothing written, push and pull against a stand-in studio with the token saved by
  `--token` (mode 0600) and read back, `--as` and `--replace` as query parameters, `--from-url`,
  the 401 and 404 messages, and the hosts file's resolution order.
- `packages/chrome/src/__tests__/connect-card.test.tsx` (3): the commands, the token note, Copy,
  and the Export menu's bundle entry.
- `node apps/cli/e2e/deck-transfer.mjs` against a running studio (6 steps; 7 with
  `TURBOSLIDE_TOKEN` set on both sides): push, the listing and the editor and presentation pages,
  the route's zip and header, pull byte for byte, the free sibling, the refused bundle, the 401s.
  Run on 2026-09-11 against `vite preview` builds on the file store, the tmp store and with the
  token set.
- `apps/studio/e2e/deck-transfer.spec.ts` (4, Playwright): Download bundle on a row, Upload deck
  bundle to a free id and into the editor, the Export menu entry and the Presentation tab, present
  mode from the address.

## 7. What this round did not cover

- A direct client upload to the Blob store from the CLI for bundles over a function's body cap
  (section 4); the `{ url }` form and the stored copy stand in.
- The stored download copies under `bundles/` are never deleted.
- A bundle carries the version log as files; a replaced deck's log restarts from the bundle's
  records, and the store's `documentAt` needs a contiguous chain, so a bundle packed with
  `--no-versions` unpacks with an empty history.
- The MCP and HTTP transports do not offer the four actions (they take paths on the caller's
  machine); the routes above are the hosted surface.

## 8. The Google Slides parity round three: the comments group and deck follow

The bundle gains a third group. `manifest.json` may carry `comments`, a map like `documents` and
`assets` over `comments/index.json`, `comments/<threadId>.json` and `comments/authors.json`, the
comments sidecar of `docs/gslides-parity/SPEC-3.md` section 2.2. The group is opt-in: `turboslide
deck pack --comments` (`packDeckDir(dir, { comments: true })`) writes it, and without the flag a
bundle has the bytes it had before the group existed, so `packages/store/src/bundle.test.ts`
asserts a pack with and without comments byte for byte. The group is absent from the manifest when
the deck has no sidecar, and a bundle from an older studio has no `comments` key; both read as
before. On the way in (`inspectBundle`) every file of the group is checked before any write:
`index.json` against `commentsIndexSchema` and naming this deck, `authors.json` against
`commentAuthorsSchema`, every other file against `threadSchema` with its id equal to its file name
and its deck equal to the bundle's; a thread that does not validate refuses the whole bundle, as a
bad slide does. Unpacked under another id (`--as`), the sidecar's `deckId` is rewritten with the
new id in canonical form.

Two records never travel and are dropped on the way in whether or not a manifest lists them:
`access.json` (the owner, the grants, the links) and `leases.json`; the `.turboslide/` state folder
stays out as before. `listDeckFiles` never lists `access.json` as a sidecar, so a mirror folder
of the Blob store, which holds the record beside `deck.json`, packs without it; and an archive
that smuggles one in reads with the record dropped (`InspectedBundle.dropped` names it). A deck a
person shares after unpacking gets a fresh record from `share.claim`.

`turboslide deck follow <id> --from <studio> [--push] [--comments] [--once]` (SPEC-3 3.7 f; B1's
`apps/cli/src/commands/follow.ts`) mirrors a hosted deck into the checkout as it changes: the
command long polls `deck.watch { since }` through the agent route with the saved API key, applies
every version record the host holds past the local revision forward through the `FileStore` with
the record's author and note and the same reducer, checks the result's revision against the host's,
and with `--comments` mirrors the sidecar from `comment.list` into `decks/<id>/comments/`. On the
hosted side the records it reads are the ones the room's checkpointer writes
(`apps/studio/src/server/checkpoint.ts`): a typing session lands as one record per author and
contiguous run, so a follower sees the same history a person sees in Version history, and a
comment added in a tab reaches the follower at the next checkpoint (2 s idle, 10 s at most).
`--push` sends the records the host lacks as writes under the per slide conflict rule; a record
that spans several slides or the deck level is listed as a conflict for `deck push`. The local
editor on the dev server shows a followed record as it shows any CLI write: through the room's
follower (`Room.follow`), which turns a record written outside the room into stream entries so
every open tab applies it live.
