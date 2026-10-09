# Lane SD, security of stored data: wave 1 build notes

The lane's wave 1 pushes of `docs/hardening/HARDENING.md` (4.4, 5): HR-SD#5 (#2), HR-SD#6 (#9) and HR-SD#1 (#12). The worktree is `/Users/kevinliu/repos/Turboslide-harden` on `harden/round`. The lane built and tested each push in its own detached checkout of `harden/round` (`scratchpad/sd/wt`, with its own `pnpm install --offline`). It moved each push's files into the shared worktree only inside the git lock, in the same critical section as the commit (4.0, shared files). Port 4855.

## Settings of every local reading

The dev server ran from the lane's checkout on port 4855 with `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/sd-overlay`, `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-sd.sqlite`, `TURBOSLIDE_MAIL=capture`, the fake Google client, and test values minted for `TURBOSLIDE_SESSION_SECRET`, `TURBOSLIDE_DOWNLOAD_SECRET` and `TURBOSLIDE_TOKEN`, which were never printed. `TURBOSLIDE_LOCAL_OPEN`, `TURBOSLIDE_AUTH_RATE_LIMIT` and `TURBOSLIDE_AUTHORIZE` were unset, as on production. Every timing below carries the one minute load beside it. A timing at a load over 24 is a record, never a verdict.

## HR-SD#5, the thumbnail's cache rule (CRIT-M2)

Commit: the `HR-SD#5` commit, on SA#1 (`120b202f`), which SD#5 waits on in the order of section 5.

What changed. `thumbCacheControl` (`apps/studio/src/server/thumbs.ts`) takes the reader's standing: the decision's `via` when the render route ran `authorize`, or the thumbnail grant's expiry when the URL's `s` stood for the decision. `via: 'open'` and `via: 'publish'` keep the two public values. A grant answers `public, s-maxage=<seconds left>`, at most 60 for an answer that is not the URL's current pixels, never `immutable`. Everyone else, and every 302 to the stored object, answers `private, no-store`.

Readings.

| Reading | Before | After | Load |
| --- | --- | --- | --- |
| `render-thumb-cache.test.ts`, one reader per standing | 3 of 5 red: owner, grant holder, link holder and admin read `public, max-age=31536000, immutable`; the grant answer had no `s-maxage`; the 302 carried the year | 5 of 5 | 97 |
| `thumbs.test.ts` with the route test and SA#1's `safe-equal-sites.test.ts`, on `120b202f` | | 19 of 19 | 313 |
| Smoke `restricted thumbnail private`, port 4855 | red: `200 public, s-maxage=60, stale-while-revalidate=86400` | `200 private, no-store` | 149, 291 |
| Smoke `access answer reads enforce` | | 200, `authorize: 'enforce'`, an identity cookie minted | 291 |
| Smoke `thumbnail without r`, with that cookie, on `gt-brand` | | 200, `public, s-maxage=60, stale-while-revalidate=86400`, stamp present (51.6 s for the first render, a record) | 291 |
| Smoke `thumbnail with r twice` | | 200 from disk, `public, max-age=31536000, immutable` | 291 |
| Smoke `scratch deck removed` | | trash 200, remove 200, `deck.info` 404 | 163 |

The smoke readings ran the push's rows alone (a copy of `hosted-smoke.mjs` whose main calls only them), because the page rows of the full table time out on a dev server at a load over 150. The CDN hit itself needs a CDN; on production the restated row reads either a 200 that is a CDN hit and immutable, or, while the seed's thumbnails sit on the public store, a 302 that is `private, no-store`.

Why the smoke sends a cookie. Since H3 a thumbnail request with no identity of its own is refused, so the old `thumbnail with r twice` passed by reading the 403 ("enforce mode: not requested"). The row now asks as a person does. The access route takes same origin requests alone, so the smoke sends `sec-fetch-site: same-origin` and its own origin, as the page's fetch does. `restricted thumbnail private` uses the bearer, which reaches the scratch deck as the admin (`via: 'admin'`), and the row fails on any 200, 204 or 302 that is not `private, no-store`.

What the guard's smoke now writes. With `--token-env`, which the guard always passes, the smoke makes one blank deck through `deck.create` on the deployment it reads, renders one 160 px thumbnail of it, and removes it forever (`deck.trash`, `deck.remove`, then `deck.info` 404). Store removal deletes the deck's `.thumbs/` with the rest of its prefix. A failed removal leaves the id in the `scratch deck removed` row for a hand cleanup.

Cost of the rule, recorded for the performance lane. A card on `/decks` names its revision (`r`) and carries no grant, so its owner's answer was a 302 kept a year by the browser and the CDN, and is now `private, no-store`: each view of `/decks` asks the function once per card (an authorize and up to two Blob `head` calls) where it asked none. Readers of open decks keep the public rules. A browser only rule (`private, max-age=...`) would keep the owner's own copy without a shared cache; the spec's words are `private, no-store`, so the push keeps them and the request below names the choice.

## Requests

1. To the orchestrator and HR-0: `security.thumbnail.restricted-not-cached` (8.2) enters with HR-0, since SD#5 ships before it. The body the lane would write: as a person, make a deck from `/new` (it is restricted to its creator), read a thumbnail URL with the page's grant (`thumbGrant`), and assert `public, s-maxage=N` with N at most 600 and no `immutable`; read the same thumbnail with the cookie and no `s` and assert `private, no-store`; read `gt-brand`'s with the cookie and assert a public value or a `private, no-store` 302.
2. To the orchestrator, for the performance lane: whether the owner's own card thumbnails on `/decks` may carry a browser only rule (`private, max-age=31536000, immutable` for a stamped answer of the current pixels) in place of `private, no-store`. No shared cache keeps a `private` answer, so the CRIT-M2 rule holds either way; the spec's words are `private, no-store`, which this push keeps.
3. To the orchestrator: `docs/readme/docs-index.test.mjs` is red on `harden/round` since the spec commit, because `docs/README.md` does not link `docs/hardening/`. No lane owns `docs/README.md` in 4.13; one line in the docs index closes it.
