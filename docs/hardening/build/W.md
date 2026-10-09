# Lane W, the web surface and the supply chain (wave 1)

The notes of lane W for wave 1 of the hardening round (`docs/hardening/HARDENING.md` 4.5 and 5): HR-W#1a to HR-W#1e (WEB-2), HR-W#2 (WEB-3 on the document routes) and HR-W#6 (CRIT-M9). Ports 4856 and 4857, the Worker on 8856. Every timing below carries the one minute load it was read at; the load on this machine was 53 to 500 for the whole lane, so no timing here is a verdict. Counts, status codes and audit results do not move with load and are the evidence.

## How the lane worked

The worktree is shared with the other lanes, so the dependency pushes were built and tested in a scratch worktree of the round (detached, under the session's scratchpad, its own `pnpm install` from the store), one push after another. At each commit, under the git lock, the push's diff was applied to the round's tree, `pnpm install --frozen-lockfile` synced its `node_modules` (and proved the lock matches the workspace with every earlier lane's change in it), the audit was read again there, and the commit took the push's paths by name. W#2 and W#6 were tested the same way in a second scratch worktree with the round's code and the lane's changes, on its own servers.

Servers: `vite dev -c vite.no-watch.config.ts` with the environment of 4.0 (test secrets minted into a 600 file in the scratchpad, never printed). The rows ran with `TURBOSLIDE_LOCAL_OPEN=1` and `TURBOSLIDE_AUTH_RATE_LIMIT=off`, as `playwright.config.ts` gives its own server.

## HR-W#1a: sharp 0.35.5 (`00b98261`)

- Unit tests over the nine files that load sharp: 79 of 80; the miss (`home/assets.test.ts`, its 5 s test timeout, load 92 to 230) passed alone with a 60 s timeout.
- Rows on 4856 (memory tier, tmp store): `svg.import.upload` passed (the SVG lands with its PNG twin at scale 3, the librsvg path), `svg.intake.long-comment` passed, `images.background.upload-picture` passed, `people.avatar-upload` and `people.avatar-metadata-stripped` passed (load 92 to 222). `images.insert.upload` missed twice, once its 5 s bound and once the file chooser's 10 s wait, at loads 92 to 260; production reads that row flaky.
- The audit after: 7 at high or above, 2 accepted, 5 open (seroval twice, source-map-js, proxy-addr, the MCP SDK).
- miniflare, wrangler's local runtime, keeps its own sharp 0.35.4; it is a dev dependency of the Worker, outside `pnpm audit --prod`.

## HR-W#1b: the MCP SDK 1.31.0 (`510cb840`)

- H2's tests passed: `packages/mcp` http, prompts, resources, server and tools; `packages/agent` http; `agent-gate.test.ts` 10 of 10 with a 900 s test timeout (two of its tests missed the 5 s default at a load of 450). `apps/cli` `mcp.test.ts` 4 of 4. `tsc -b packages/mcp apps/cli` exit 0.
- `/mcp` on 4856: initialize 200 with a session, `notifications/initialized` 202, `tools/list` 200 with 169 tools, `tools/call` 200 through the gate.
- `e2e/agent-http.spec.ts` on a file store server on 4856: the manifest, the 409 on a stale base, the lease, the unknown field and the agent write in the open editor passed. `realtime.agent.write-announced` ran out of its 240 s twice at loads of 380 to 500 (production reads it broken), and the two theme rows were skipped by the spec on that base. On a tmp store the spec's seeded deck has no record and the manifest test reads an empty list; the spec seeds `decks/e2e-agent`, so it needs the checkout's file store.
- The audit after: 6 at high or above, 2 accepted, 4 open.

## HR-W#1c: DOMPurify 3.4.16 (`4ce89a00`)

- `vitest --project render`: 31 files, 535 tests, among them H1's 103 `style-breakout` cases (load 57 to 61).
- `pnpm audit --prod` lists no low advisory after it.

## HR-W#1d: the overrides (`303762ef`)

pnpm 11 reads overrides from `pnpm-workspace.yaml`, so they live there beside the pptxgenjs one, not under `package.json`'s `pnpm` key as 4.5 wrote. proxy-addr 2.0.8, ip-address 10.7.3, fast-uri 3.1.8, source-map-js 1.2.2 and brace-expansion 5.0.12, each inside its dependent's declared range. fast-uri (moderate) and brace-expansion (whose two high acceptances ran to 2026-10-30) were added because they could move, so `audit-allow.json` is empty.

- `pnpm test`: 544 of 554 files. Seven failures were 5 s timeouts at loads of 60 to 450 and passed with a long timeout (7 of 7 files, 115 tests, load 69). Three fail the same way on the round's tree without any W#1 push: `apps/cli` `banner.test.ts` (CLI version 2026.1001.3 against `docs/updates.md`'s 2026.1008.2), `import.test.ts` (93 slides in this machine's Prototemplate deck, 95 expected) and `docs/readme/docs-index.test.mjs` (`docs/hardening/` is not linked from `docs/README.md`).
- The node-server build served on 4870: `/decks` 200, `/home` 200, `/new` 200, `/deck/gt-brand` 200, `/api/agent` 200.
- The audit after: 2 open, both seroval.

## HR-W#1e: the devtools and seroval (`46d558dd`)

Moving `@tanstack/react-devtools` to `devDependencies` alone leaves seroval 1.5.6 in the production graph: better-auth resolves the devtools' solid-js 1.9.15 as its optional peer, and `pnpm audit --prod` walks it (measured: after the move the audit still read `apps__studio>better-auth>solid-js>seroval`). The push also overrides solid-js below 1.9.16 to 1.9.16, the first release on seroval ~1.6.8 (released 2026-10-06; 1.9.17 of 2026-10-07 was left for its age).

- `node scripts/check.mjs --audit` exits 0: 0 at high or above, 0 accepted, 0 open; `pnpm audit --prod` lists nothing at any level.
- The Vercel build (`NITRO_PRESET=vercel build:deploy`) exit 0 and `check-vercel-output.mjs` 40 of 40. The function names one seroval, the TanStack Start serializer's 1.6.7 (patched), in ten files; no file names seroval 1.5, solid-js or the devtools. 4.5's "no seroval under the function" cannot hold, because Start's own serializer is seroval; what it guards against, the vulnerable release, is gone.
- The dev server with `navigator.webdriver` false, so the root mounts the devtools: the devtools module loads on `/new` and the page logs no error.
- `tsc -b` over the scratch tree with all five pushes: exit 0 (load 70 to 140).

## HR-W#2: the document routes enforce the CSP

With `TURBOSLIDE_CSP` unset, `/deck`, `/embed`, `/present`, `/print`, `/s`, `/edit` and `/new` answer `Content-Security-Policy`; every other route keeps the report only header until HR-W#4; `TURBOSLIDE_CSP=report` is the way back. The local run found two things the policy would have broken, and the push fixes both:

- The print page's fit script had no nonce. On the enforced studio a page probe read `script-src-elem inline /print/gt-brand:651` and the console's refusal; the script now takes the request nonce as the root's scripts do.
- The embed's frame rule. `frame-ancestors` on `/embed` names the Prototemplate hosts and `TURBOSLIDE_EMBED_ANCESTORS`, while Publish to the web hands out an iframe snippet for any site. Enforced, it stops every published embed outside that list (`viewer.spec.ts`'s same origin host page failed on it under `TURBOSLIDE_CSP=enforce`). By default the embed now enforces every directive but the frame rule, which goes out as a report only header of its own; `TURBOSLIDE_CSP=enforce` enforces it as before.

Readings. The scratch tree held the round at `6427b65f` with W#2 and W#6; the server on 4857 was the check chain's (file store, memory tier, `TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`) with the policy variable unset. The CSP report endpoint logs one `csp.report` line per report, from enforced and report only policies alike, so the count of those lines while a spec ran is the count of its violations on any route.

- `headers.test.ts` 18 of 18.
- The headers on 4857: `/deck`, `/edit`, `/new`, `/present`, `/print` and `/s` enforced with `frame-ancestors`; `/embed` enforced without it, plus the report only frame rule; `/decks`, `/home`, `/signin` and `/docs` report only; `/api/agent` none.
- The specs of check steps 17, 21 and 26, 25 files, 02:03 to 03:12 UTC at loads of 54 to 160: two report lines. One is `frame-ancestors` on `/` from `viewer.spec.ts`'s same origin host page around `/embed` (report only now; the test passed). The other is `base-uri` on `/edit/e2e-security` at line 1701 of the parser's bundle, which is DOMPurify's `new DOMParser().parseFromString(...)`: the parse document of the security spec's `<base>` payload inherits the page's policy and reports, while the page never receives the element (that test, "the eight html payloads are inert", passed). No spec file with a failure logged a report. The failures are the older specs' drift and load: `text-editing.spec.ts` navigates to a hard coded `localhost:4321`, `objects.spec.ts` meets two `insert.shape` rows, `canvas.spec.ts` sends `lint.run` an input its contract refuses, `landing.spec.ts` and others read a checkout path or time out at 5 s to 240 s.
- A page probe on the server with `TURBOSLIDE_CSP=enforce` (load 76): no `securitypolicyviolation` event and no console CSP error on `/deck`, `/edit`, `/new`, `/present`, `/embed`, `/decks`, `/home`, `/docs` and `/signin`; `/print` read the fit script, fixed above. The viewer settles on the enforced `/deck/gt-brand` in 5.5 s (load 71).
- `scripts/hosted-smoke.mjs --base http://localhost:4857`: `csp enforced /deck/gt-brand` pass, `headers /edit`, `/deck` and `/embed` pass; 40 of 41 (`/decks` lists the checkout's decks on a file store, as without this push).
- The core gate: The core gate on 4857, 03:23 to 05:23 UTC at loads of 53 to 140: the walk ran to its end, 808 rows, 781 passed and 17 red, and every red one is not driven or broken on production or red without lane W's pushes too (`export.pptx.dialog` and `export.print.layout-with-notes`, read again on a tree without W#2 and W#6 on 4856: both red); the server logged no report line during it. The gate's spec phase passed 39 tests and failed 5, all in `core/assist.spec.ts`, which needs `TURBOSLIDE_ASSIST=fixture` on the server, with no report line, before the run stopped at the two hour limit of its background job; the cost phase did not run. One report line in that window is not a violation: `script-src` `inline` on `/new` at 03:47:54 is the synthetic report the hosted smoke's `csp report endpoint` row posts, which ran against 4857 at that second.
- `tsc -b` over the round with W#1a to W#1e, W#2 and W#6: exit 0. The brand lint in enforce mode: 0 open findings; the competitor guard 9 of 9. `core-matrix.test.mjs` and `what-works.test.mjs` pass and `what-works.mjs --check` reads the README current; `docs-index.test.mjs` fails on `docs/hardening/` missing from `docs/README.md`, as it does on the round's tree before any lane W push.

Not run: the WEB-1 reproduction of the research report. H1 closed WEB-1 at the sanitizer, `web-verify.md` read that an enforced policy refuses its payload, and the security spec's payload test passed on the enforced studio.

## HR-W#6

Written with its commit.
