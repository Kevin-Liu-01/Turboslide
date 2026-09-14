# Hotfix verifier: the requests outside every fixer's files, and the verification

The verifier of the round three hotfix (2026-09-14, port 4321 and the chain's own server; the
preview deployment of this round). Section numbers refer to SPEC-3 unless prefixed. No git write
command ran; no `pnpm install`, `pnpm add`, `pnpm exec` or `pnpm build` outside the check chain's
own steps 1 and 6; Docker was not used (the chain ran without step 25 by number, because the
daemon was up on this machine and the round's rule excludes it); no token, cookie or secret was
printed. The numbers and the findings are in `docs/gslides-parity/VERIFICATION-3.md` section 17;
the logs are under `docs/gslides-parity/verification-3/hotfix/`.

## 1. The edits this verifier made

Each one is the smallest edit that answers a fixer's request in a file no fixer owned this round.

1. Fixer B request R1 (the published player's token, `deck.$deckId.tsx` beyond the header,
   `embed.$deckId.tsx`, the 410 after `deck.unpublish`; 6.4, VERIFICATION-3 finding 48).
   - New `apps/studio/src/server/published.ts`: `publishedPlayerGate(request, deckId)` reads
     `?p=` off the request, builds the request's own context (`requestContext`, so the bearer, the
     sealed cookie and the localhost rule all decide as they do elsewhere), sets `publishToken`
     and calls `authorize(read)`; a 410 decision (a revoked token: `decide()` answers `gone`, and
     fixer B's `authorize` refuses it in shadow mode too) is the 410 page with
     `REFUSALS.noLongerPublished` and the player's noindex; anything else is null. A page route's
     loader can answer 200, 404 or 500 alone (`@tanstack/router-core` `load-server.ts` maps a
     thrown loader error to 500 and `notFound()` to 404, and `renderRouterToStream` takes that
     status; `setResponseStatus` does not override a returned `Response`, h3's
     `prepareResponse` returns a `Response` as is), so the 410 is answered by the route's server
     GET handler before the document renders.
   - `apps/studio/src/routes/deck.$deckId.tsx`: `loaderDeps` carries `p`, the loader passes
     `publishToken` to `getDeck` (so the record decides the read and the payload is shaped by the
     `publish` via), `server.handlers` (through `createHandlers`) runs the gate and defers to the
     loader with `next()` otherwise, `deckRobotsMeta` shares the meta with the embed, and an
     `errorComponent` renders the sentence when a client side navigation meets the loader's
     `DeniedError(410)` (`isNoLongerPublished` reads the status or the serialized
     `{"error":"gone"}`). The client transform strips the `server` block (measured on the dev
     server: the transformed route module carries no `publishedPlayerGate`; the production build
     of check step 6 and `check-client-bundle.mjs` are the second proof).
   - `apps/studio/src/routes/embed.$deckId.tsx`: the same `loaderDeps`, `publishToken`, gate,
     `headers` and robots meta.
   - Measured on the file store (4321, `verifier/publish-410-probe.mjs`): `deck.publish` answers
     the player address with `?p=`; the player and the embed answer 200 with `x-robots-tag:
noindex` and the robots meta; the plain `/deck/<id>` carries neither; a wrong token is 200 in
     shadow mode; after `deck.unpublish` the player and the embed answer 410 with the sentence
     and noindex; the plain `/deck/<id>` still answers 200 in shadow mode. One reading for the
     probe writer: a cookieless request is a 401 inside `decide()` before the publish token is
     read, and shadow mode admits it, so a player probe holds the identity cookie the first page
     minted, as a browser does (`share.spec.ts` row 3 does through the player context).
2. Fixer B request R2 (`apps/studio/src/components/DeckViewer.tsx`): the embed posts
   `gt-deck-slide` with target origin `*`. The frame is admitted by the `frame-ancestors` rule of
   `server/headers.ts` (Prototemplate and the customer domains, never the studio's own origin), and
   the message carries a slide number and nothing else; with `window.location.origin` a parent on
   another origin received nothing (`share.spec.ts:280`, `viewer.spec.ts` frames it same origin
   and still passes).
3. Fixer B request R3 (`apps/studio/src/routes/api/decks.$deckId.stream.ts`): the stream's
   `recheck` drops this instance's cached access record before the `authorize` recheck when an
   `access` event arrives (`recheck(true)`), so on the redis tier another instance's share write is
   seen by the open streams at once; on the blob tier the event is process local and the drop
   repeats what the writer's hooks did. The 60 s timer keeps the cached read.
4. Fixer C item 1 (`apps/studio/src/routes/new.tsx`, the skeleton beside the live editor for about
   600 ms after the first write and the registry gap in that window): not changed. The fix needs
   `hygiene.spec.ts` row 2 (the undo after the first write, SPEC-2 8.6) re-verified against a
   changed pending presentation, and the specs no longer depend on the window; recorded as a
   finding for the next round.
5. Fixer C item 4 (a quota switch for a checkout server): not made; the chain's server spends 4
   of the 5 anonymous exports per process (dither 2, charts 1, export-batch 1) and a fresh server
   per run keeps it under the limit, as the chain does.
6. Formatting: `prettier --write` on the three files the fixers left unformatted
   (`apps/studio/e2e/realtime.spec.ts`, `packages/realtime/client/room-client.test.ts`,
   `scripts/probes/new-write-probe.mjs`), a no behaviour change so check step 19 reads the round's
   own files clean. The other workflow's untracked `design-4/`, `research-4/`, `verification-4/`,
   `SPEC-4.md` and `layout-shift.*` files still fail step 19 and were not touched.

## 2. What was verified and how

The table of commands and their results is VERIFICATION-3 section 17. In short: `tsc -b` on the
tree; the vitest suites of `packages/realtime`, `packages/viewer`, `packages/store`,
`packages/identity`, `apps/studio` and `packages/chrome`; `node scripts/check.mjs` in two
segments (1 to 6, then 7 to 28 without 25, `vite preview` on 4344 over the step 6 build for step
27; `verification-3/hotfix/run-check-chain.sh`); `scripts/probes/new-write-probe.mjs` against the
verifier's dev server and against the preview; the S2 two browser case against the verifier's
server (`realtime.spec.ts` row 2 in step 26 and `walk/s2-typing-probe.mjs`); a preview deployment
from the repository root (`vercel deploy --yes --archive=tgz` with `TURBOSLIDE_AUTHORIZE=shadow`,
`TURBOSLIDE_REALTIME=blob`, `TURBOSLIDE_MAIL=off` and two secrets generated inline, never
printed); `hosted-smoke.mjs` with the bearer; the share link sequence (`verifier/share-sequence-
probe.mjs`: mint a viewer link, exchange from a fresh context, mint a commenter link, revoke,
exchange again over 20 s of navigations); the publish 410 probe on the preview.

## 3. The cutoff

The orchestrator asked for the report while the check chain was on step 20 (the parity audit) at
about 04:55 PDT. The verifier stopped the chain driver, sent the runner its interrupt so it stopped
its own dev server on 4321, stopped the `vite preview` on 4344 and the audit's browser, released
`.turboslide/e2e.lock`, removed the audit's scratch draft `decks/untitled-20260914-3jzh` and
restored the half written `verification-3/parity-audit.json` from the committed tree (`git show`
into the file; no git write command). Not run before the cutoff: check steps 6, 20 to 24 and 26 to
28; `scripts/probes/new-write-probe.mjs` against the verifier's server and against the preview; the
S2 two browser case against the verifier's server. VERIFICATION-3 section 17 says so row by row.
The driver's step 6 defect is finding 56 there: a run resumed at step 5 or 6 must finish segment 1
before segment 2 starts.
