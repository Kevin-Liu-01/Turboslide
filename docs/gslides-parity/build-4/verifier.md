# Verifier, round four: day 0 notes and requests

Owner of `docs/gslides-parity/VERIFICATION-4.md`, `docs/gslides-parity/verification-4/**` and the
parity audit's mark row (MILESTONES-4 "Verifier"). Port 4346. This file holds the requests to
other owners; the numbers are in `verification-4/BASELINE.md` and `verification-4/baseline-2026-09-14.json`.

## Day 0, 2026-09-14

Done: the PP 9.5 hashes verified (SPEC-4 0.49); `perf-budget.mjs --profile deployment --runs 3
--report` run against production on the `d5d7f07` deploy
(`verification-4/perf-budget-baseline-2026-09-14.json`, 58 of 121 budgets met); the R04
measurements re-taken on production (routes with request counts, transitions, an editor session
on a scratch deck, the filmstrip, the material paint, the idle minute) and on a `vite preview` of
`apps/studio/dist` on port 4346 with `TURBOSLIDE_STORE=tmp`
(`verification-4/perf-budget-local-2026-09-14.json`, 73 of 121); every scratch deck trashed and
deleted forever through the UI (`untitled-20260914-nc3e` on production, `untitled-20260914-k2k0`
and `untitled-20260914-8a73` on the tmp store; each answers 404). No git write, no install, no
build; the preview server was stopped at the end.

## Requests to the integrator (the moved `scripts/perf-budget.mjs` and step 31)

1. SPEC-4 4.6 row 1 ("last keyup to the local commit") measures the network on round three:
   `describe().state.revision` is `reportedRevision()`, which moves when `POST /api/decks/<id>/ops`
   answers, not when the reducer runs (BASELINE.md section 5). The probe needs a page-side stamp of
   the reducer (the current card's clone carrying the text, which the check already takes, or
   `sync.pending` rising) before the 450 ms ceiling can mean what R04 meant. On production the
   acknowledgement lands at 512 to 707 ms after the last keyup.
2. The local profile with `TURBOSLIDE_STORE=tmp` cannot click `toolbar.layout` on `/edit`: the
   hosting banner (`edit.$deckId.tsx` `HostingBanner`, `position: fixed` under the bar, no dismiss
   control) covers it and Playwright's click times out after 30 s, which ends the transitions check
   with an exception and no JSON. Either the check dismisses or hides the banner for the pointer
   steps and records that it did, or the banner leaves the toolbar clear on the tmp tier. Step 31
   meets this as it stands.
3. On the memory channel every write after the first reaches `serverRevision >= revision` at
   2.02 to 2.09 s, a fixed cadence, so 4.6's local ceilings (600 for a text burst to saved, 250 for
   a new slide to saved) fail by construction on `TURBOSLIDE_STORE=tmp`. The check's "saved" on the
   memory tier should be the acknowledgement, or the row should carry the checkpoint cadence, or
   the cadence should change; the decision is the integrator's with B4.
4. The twins row counts a 304 revalidation (transfer 300 bytes, decoded 0) as a re-fetch; production
   revalidates both twins on the second visit of `/deck/gt-brand`. Count `transferSize` above the
   header size, or have B5 send an immutable `Cache-Control` on `/decks/<id>/assets/*` so the check
   passes on the deployment profile for the right reason.
5. The idle check's `/api/events/` pattern counts nothing on round three; SPEC-4 4.4 already renames
   it to `/api/decks/.*/stream`. The 60 s window also misses a stream that opened before it (2
   connections per session, 0 in the window); the row may want the connection count from page load.
6. `vite preview` serves this build's SSR routes once `TURBOSLIDE_SESSION_SECRET` is set (it answers
   500 without it), so a local run needs the placeholder secrets `playwright.config.ts` sets. The
   `.output` node-server build named in 4.8 does not exist on the tree; the verifier did not build
   it (the rules), so the day 0 local numbers are the vite preview's.

## Requests to builders

- B1 or the chrome owner: the Layout grid plate (`layout.apply.plate`) does not close on `Escape`
  or on the toggle button; only an outside pointer press closed it, on production and locally, in
  two runs each (BASELINE.md finding 9). A dialog Escape does not dismiss is an accessibility miss.
- B3: `/edit/gt-brand` on production stalled past 120 s twice inside one eight minute window (the
  title row and skeleton up, the studio handle and `data-settled` never arriving); the next load
  was ready in 2.4 s (finding 6). Worth a look beside the `/new` skeleton window of SPEC-3 finding 51.
- B4: the duplicated slide's static thumbnail did not arrive within 45 s on production or locally
  (one `/api/render` 404 in each session); the new slide's arrived in 409 ms (finding 10). The
  filmstrip holds 4,921 DOM nodes with 85 cards after three passes on production against 1,218
  locally with the same build (finding 3).
- B5: JavaScript is 3,049 to 3,187 KB decoded in 19 to 23 files on every route; the largest chunk
  `index-D6IA9RCO.js` is 1,202,643 bytes and `dither-key-3-G63s7k.js` (737,517) is in every
  route's preload set (finding 2).

## For Kevin or the integrator

Two decks on production are not the verifier's and were left alone: `untitled-20260913-tii2` on
`/decks` (the list holds 17 cards) and `untitled-20260914-ah39` already in `/decks/trash`.
