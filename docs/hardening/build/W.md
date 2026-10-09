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

## HR-W#1e: the devtools and seroval

Moving `@tanstack/react-devtools` to `devDependencies` alone leaves seroval 1.5.6 in the production graph: better-auth resolves the devtools' solid-js 1.9.15 as its optional peer, and `pnpm audit --prod` walks it (measured: after the move the audit still read `apps__studio>better-auth>solid-js>seroval`). The push also overrides solid-js below 1.9.16 to 1.9.16, the first release on seroval ~1.6.8 (released 2026-10-06; 1.9.17 of 2026-10-07 was left for its age).

- `node scripts/check.mjs --audit` exits 0: 0 at high or above, 0 accepted, 0 open; `pnpm audit --prod` lists nothing at any level.
- The Vercel build (`NITRO_PRESET=vercel build:deploy`) exit 0 and `check-vercel-output.mjs` 40 of 40. The function names one seroval, the TanStack Start serializer's 1.6.7 (patched), in ten files; no file names seroval 1.5, solid-js or the devtools. 4.5's "no seroval under the function" cannot hold, because Start's own serializer is seroval; what it guards against, the vulnerable release, is gone.
- The dev server with `navigator.webdriver` false, so the root mounts the devtools: the devtools module loads on `/new` and the page logs no error.
- `tsc -b` over the scratch tree with all five pushes: exit 0 (load 70 to 140).

## HR-W#2 and HR-W#6

Written with their commits below.
