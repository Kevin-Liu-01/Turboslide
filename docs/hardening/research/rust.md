# The Rust map (key: rust)

Research for the hardening round's fifth ask, the backend logic in Rust. Read on 2026-10-08 from
the worktree `/Users/kevinliu/repos/Turboslide-harden` at `0d3920a3` (origin/main). Nothing in the
tree changed apart from this file: every build went to `CARGO_TARGET_DIR` under the scratch folder
`/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/harden/rust/`,
which also holds every script and output named below. No local server was started (port 4837
stayed unused): every finding reproduces on the pure functions the server and the browser run.
Production was read through one `HEAD /` (server `Vercel`); nothing else.

Machine: Apple M5 Max, 18 cores, macOS, Node 24.13.0, cargo and rustc 1.98.1. The one minute load
was 64 to 227 during the work. Under the round's rule no timing below is a verdict. To make the
numbers usable anyway, every timing is CPU time from `process.cpuUsage()` (or `/usr/bin/time` user
time for Rust) plus the minimum wall time of the run, and every comparison is between rows of one
run. Re-measure at a load under 24 before any number goes on a product page.

## 1. The answer

No backend module should be rewritten in Rust this round. The reasons, each measured or read:

1. The backend has one CPU hot path, the realtime admission, and its cost is algorithmic. Every
   typed entry clones the whole document and validates the whole document
   (`packages/realtime/src/room-core.ts` 351 and 371, `packages/schema/src/reduce.ts` 641). On the
   85 slide GT deck that is 9 to 16 ms of CPU per entry (fastest wall time to mean CPU); on an 850 slide copy it is 105 to 122 ms.
   A TypeScript prototype that copies only the touched slide and validates only that slide took
   0.051 ms and 0.261 ms for the same entry, 300 to 470 times less (RUST-1).
2. A Rust validator cannot reach that number on the Worker. serde_json in wasm needs 1.82 ms (GT)
   and 9.85 ms (850 slides) only to parse and walk the document once from a string, and 2.70 ms
   and 15.9 ms from a JavaScript object, where V8 does the same walk in 1.10 ms and 6.91 ms
   (section 4). V8's `JSON.parse` is faster than serde_json compiled to wasm, so a port that
   passes the document across the boundary per entry is slower before it validates anything.
3. The reducer, the transforms and the validator run in the browser, the Vercel function and the
   Durable Object from one TypeScript source. That one source is what makes two browsers and the
   server converge. A Rust port on the server alone makes a second implementation that must match
   the browser's byte for byte forever. The tree already shows the cost of copies in one
   language: the "whole Text rewrite" rule exists in four copies, three disagree, and the browser
   removes typed words the server would admit (RUST-2).
4. The transforms cost 0.017 ms per entry against 50 landed splices; the Worker bundle is 888 KB
   minified (182 KB gzip) and its admission core evaluates in 64 to 74 ms of CPU, far inside the 1
   s startup limit and the 64 MiB size limit. Neither speed nor size asks for a port.
5. Auth stays on better-auth (section 6).
6. The existing crate stays, scoped to pixel work. Its Node addon never shipped: no Linux build, no
   CI, and production's function runs the TypeScript stages. The one binding that ships, the wasm
   module in the browser's dither worker, rebuilds byte for byte from the crate (section 2).
   Recommendation: drop the napi binding and keep wasm as the crate's one output (RUST-3).

What the round should do instead is section 7: the TypeScript admission change, one rewrite rule,
the deck cap enforced, CI, and then a Rust phase limited to the crate.

## 2. The toolchain and the CI path

| Item                                                                                    | Reading                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain                                                                               | cargo 1.98.1, rustc 1.98.1, wasm-bindgen 0.2.128 (the crate's pin), targets `aarch64-apple-darwin`, `wasm32-unknown-unknown`, `wasm32-wasip1`. Not installed: `x86_64-unknown-linux-gnu`, cargo-zigbuild, zig, wasm-opt. Docker and colima are present.                                                                       |
| Cold addon build (`--release --features napi`, 42 `cargo tree` entries)                 | 140.8 s wall, 40.6 s user, load 81 to 79. docs/native.md records about 32 s on an idle machine.                                                                                                                                                                                                                               |
| wasm build (`--target wasm32-unknown-unknown --features wasm`, 24 `cargo tree` entries) | 48.5 s wall, 22.9 s user, load 78 to 73; `wasm-bindgen --target web` 0.05 s.                                                                                                                                                                                                                                                  |
| Reproducibility                                                                         | The four wasm outputs built here have the sha256 of the four committed files in `packages/native/wasm/` and in `BUILD-RECORD.json` (d228dbe8 for the glue, 6286f96a for the 273,863 byte module). The committed wasm is reproducible from the crate at this commit on this machine.                                           |
| `cargo test --release`                                                                  | 37 unit tests and 6 Pillow parity tests pass; 2 min 37 s at load 72 to 64.                                                                                                                                                                                                                                                    |
| Addon                                                                                   | 771,968 bytes for darwin-arm64; `require` of it lists `dssim, version, twoTone, toneLut, diffExact, encodePng1, lanczosCoeffs, twoToneScreen, diffPixelmatch, gaussianKernel, bayerThresholds`; `version()` is `0.1.0+napi`.                                                                                                  |
| CI                                                                                      | There is no `.github/` folder. `packages/native/ci/native.yml` is a template that its own header says "the integrator places at .github/workflows/native.yml"; that never happened. `docs/archive/status/M1-STATUS.md` 198 records why: the `gh` token lacks the `workflow` scope and GitHub refused the first workflow push. |
| Linux addon                                                                             | Not built. `BUILD-RECORD.json` holds `bytes: null, sha256: null` for it, with a note that `.github/workflows/native.yml` builds it, a file that does not exist.                                                                                                                                                               |
| What production runs                                                                    | The function: the TypeScript stages (no addon in the bundle, docs/native.md "What runs where"). The browser's dither worker: the wasm module (`apps/studio/src/workers/dither.worker.ts` imports the committed glue).                                                                                                         |

## 3. What the platforms support (pages read 2026-10-08)

- Vercel, napi inside the Node function: works today for sharp 0.35.4. The function runs on
  Amazon Linux 2023 (the build image page), whose glibc is newer than the 2.28 floor the CI
  template targets. The Vercel build runs no cargo step, so an addon has to arrive as a committed
  file or a fetched artefact with a pinned hash, and its Linux build needs Linux CI or a cross
  toolchain this machine does not have.
- Vercel's Rust runtime: "The Rust runtime (Beta) is available on all plans", on Fluid compute,
  each handler a `[[bin]]` under `api/` with the `vercel_runtime` crate (the runtime page,
  last_updated 2025-12-08). Each Rust function is its own function: its own cold start, no shared
  memory with the TanStack Start function, and no page read says how `api/*.rs` coexists with the
  Build Output API that Nitro writes for this project. Every request that touches both would pay
  a network hop.
- Cloudflare Workers (the limits page, last updated 2026-09-05): 64 MiB script size uncompressed
  on both plans and no compressed limit; 1 s for the global scope; 128 MB per isolate, wasm
  allocations included; CPU 10 ms per request on Free and up to 5 minutes on Paid. Durable Objects
  (the limits page, last updated 2026-06-01): 30 s of CPU per request by default, and the
  integrator's reading on the Free preview Worker
  (`docs/gslides-parity/realtime/build/integrator.md` section 7 item 1) shows the object running
  about 30 s of synchronous CPU, so the 10 ms row does not bound the object.
- workers-rs 0.8.7: the `DurableObject` trait has `fetch`, `alarm`, `websocket_message`,
  `websocket_close` and `websocket_error`, and SQLite is reached through `storage().sql()`. The
  README says "Expect a few rough edges, some unimplemented APIs, and maybe a bug or two". A Rust
  object is possible; what it would have to contain is the problem (RUST-2, section 1 item 3).
- Today's Worker: `esbuild` of `apps/realtime-worker/src/index.ts` with the Worker conditions is
  888,432 bytes minified and 182,419 gzip: zod 450,344 bytes, the schema 362,906, `deck-room.ts`
  38,556, the realtime package 17,336. The admission core bundled alone (831,280 bytes) evaluates
  in 64 to 74 ms of CPU under Node.

## 4. The hot paths, measured

`bench-admission.mts`, `bench-incremental.mts`, `bench-shared.mts`, `bench-transform.mts`,
`bench-wasm.cjs` and the Rust `proto` crate in the scratch folder. GT is `decks/gt-brand` (85
slides, a 205,311 byte document); x10 is the same deck copied ten times with new ids (850 slides,
1,465,095 bytes; `validateDeck` reads it `ok`). CPU is the mean per call; min is the smallest wall
time in the run.

| Operation                                                                                      | GT CPU (min)                                       | x10 CPU (min)                                  | Load       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- | ---------- |
| `JSON.parse` of deck.json and the slide files                                                  | 1.04 ms (0.72)                                     | 3.61 ms (3.05)                                 | 102 to 87  |
| `JSON.stringify` of the document                                                               | 0.88 ms (0.58)                                     | 3.36 ms (2.66)                                 | same       |
| `cloneJson` of the document (`pointer.ts` 133)                                                 | 1.83 ms (1.34)                                     | 7.34 ms (6.19)                                 | same       |
| `validateDocument`, zod JIT                                                                    | 14.0 ms (11.4)                                     | 107 ms                                         | same       |
| `validateDocument`, zod jitless (the Worker's mode)                                            | 14.6 ms (11.3)                                     | not run                                        | 96         |
| `applyMutations` with one `text.splice`                                                        | 1.37 ms (1.01)                                     | 7.82 ms (6.62)                                 | 102 to 87  |
| `landCandidate` with one `text.splice` (one admitted entry)                                    | 13.5 to 16.3 ms (8.9 to 9.4)                       | 121.6 to 122.4 ms                              | 102 to 78  |
| `transformEntry`, one entry past 50 landed splices                                             | 0.017 ms                                           |                                                | 81         |
| `validateSlide`, one slide                                                                     | 0.008 ms (`thesis`) to 0.204 ms (`diagrams`, 6 KB) |                                                | 83         |
| `validateDeck` of the manifest alone                                                           | 0.886 ms                                           |                                                | 83         |
| Prototype: copy the touched slide, apply, `validateSlide` it                                   | 0.051 ms (0.029)                                   | 0.261 ms (0.161)                               | 87 to 78   |
| JavaScript parse and walk of the document string                                               | 1.10 ms (0.73)                                     | 6.91 ms (5.39)                                 | 175 to 145 |
| Rust native, serde_json parse and walk (user CPU is the run's total over its calls, see below) | 1.28 s for 500 calls and 500 round trips (0.84)    | 1.69 s for 100 calls and 100 round trips (9.5) | 204 to 177 |
| wasm from Node, parse and walk from the string                                                 | 1.82 ms (1.31)                                     | 9.85 ms (12.4)                                 | 175 to 145 |
| wasm from Node, from the object (stringify, then parse in wasm)                                | 2.70 ms (2.18)                                     | 15.9 ms (17.3)                                 | same       |
| wasm from Node, object to object round trip                                                    | 4.42 ms (3.75)                                     | 17.7 ms (14.9)                                 | same       |

The Rust native row: the bench binary ran its calls on GT in 1.28 s of user CPU in all, so a parse
and walk costs under 1.3 ms, and the fastest single one took 0.84 ms; on x10 the fastest took
9.5 ms. Native Rust and V8 parse this document in the same order of time, and the wasm build is
slower than both.

The CPU profile of 300 `validateDocument` calls on GT (`prof/`, `summarize.cjs`): `text.ts` 31.8
percent (`parseInto` 15.1, `parseText` 4.6, `serializeRuns` 2.4), zod 19.8, `validate.ts` 11.8,
`pointer.ts` 11.6 (`unescapeToken` 4.2, `parsePointer` 2.8, `getAt` 2.7), `catalog.ts` 5.1, the
garbage collector 5.0. The validator re-parses every Text of every slide on every call; that is
the work, and it is linear in the deck.

The image pipeline's costs are docs/native.md's (2026-09-10, an idle machine): the two tone screen
52 ms TypeScript, 20 ms napi, 23 ms wasm per 1600 by 900 picture; pixelmatch 208, 153 and 233 ms;
DSSIM 1,849, 1,275 and 2,019 ms. In Node the wasm module is slower than TypeScript for both diffs.

The CLI: `node apps/cli/bin/turboslide.mjs --help` costs 1.33 to 1.46 s of user CPU (load 131 to 120) and 0.75 to 0.78 s with `NODE_COMPILE_CACHE` set; the profile puts 23.7 percent in Node's own
type stripper (amaro, itself SWC compiled to wasm) and 14.3 percent in `playwright-core`, loaded
for a help screen (RUST-6).

## 5. The inventory and the verdicts

Lines are source lines without tests, then test lines. "Browser" means the module also ships to
the page.

| Module                                                                                                      | Runtime                                              | Lines                                 | Hot path and dependencies                                                                                                                                                                                                                                                                                                            | Verdict                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/studio/src/server` and `src/routes/api`                                                               | Vercel Node function (Nitro)                         | 33,956 and 3,665 / 16,807             | Blob reads and writes, SSR loaders, the memory and blob tier rooms (`room.ts` 3,595, the same `landCandidate`), the checkpoint route (`applyWrite`, a whole validation per checkpoint), Chromium jobs (export, render, thumbs), sharp (logos, avatars, uploads), node:crypto HMAC (tickets, sealed cookies), better-auth over Kysely | Keep in TypeScript. The time goes to the network, Chromium and sharp, which is native already. The one CPU item is the admission, fixed in TypeScript (RUST-1).                                                                    |
| `apps/studio/src/server/auth`                                                                               | Function                                             | 7,090                                 | better-auth 1.7.4: Google, anonymous principals, magic link, email OTP, device authorization; the D1 proxy dialect                                                                                                                                                                                                                   | Keep better-auth (section 6).                                                                                                                                                                                                      |
| `apps/studio/src/server/logo-sanitize.ts`                                                                   | Function                                             | 823 / 3 tests (43 in `logos.test.ts`) | A hand written strict XML reader and an allow list over untrusted SVG                                                                                                                                                                                                                                                                | Keep in TypeScript; add a fuzz harness first (RUST-5). Port later to `roxmltree` only if the harness finds a parser defect.                                                                                                        |
| `packages/store`                                                                                            | Function, CLI                                        | 12,691 / 9,119                        | Vercel Blob I/O, the FileStore, the zip reader (bounded: `maxOutputLength`, a 512 MiB total, safe names)                                                                                                                                                                                                                             | Keep. I/O bound; nothing to gain.                                                                                                                                                                                                  |
| `packages/realtime` (room-core 598, admission 233, conversion 225, protocol 503, channel 400; client 3,421) | Durable Object, function, browser (client)           | 9,676 / 7,129                         | `landCandidate` per entry (section 4); `transformEntry` 0.017 ms                                                                                                                                                                                                                                                                     | Keep in TypeScript; fix RUST-1, RUST-2, RUST-4.                                                                                                                                                                                    |
| `packages/identity`                                                                                         | Browser, function, Worker                            | 2,312 / 2,137                         | The capability matrix, hues, labels                                                                                                                                                                                                                                                                                                  | Keep. Small and shared with the page.                                                                                                                                                                                              |
| `packages/schema` (validate 921, reduce 709, transform 418, migrations 67, text 1,324)                      | Browser, function, Worker, CLI                       | 27,396 / 10,793                       | Validation is the hot path (section 4); migrations are 67 lines                                                                                                                                                                                                                                                                      | Keep in TypeScript; incremental validation and a Text memo (RUST-1, RUST-7). Port later only as one wasm core that the browser runs too, behind the trigger of section 7.                                                          |
| `packages/export`                                                                                           | Render worker, CLI, function (sync export)           | 13,161 / 6,690                        | Chromium scene extraction (an export ran 147 to 1,429 s in docs/pptx.md), pptxgenjs, jszip, sharp; DSSIM and pixelmatch in the verify loop                                                                                                                                                                                           | Keep in TypeScript. DSSIM stays in the crate for the verify loop (section 7, phase 1).                                                                                                                                             |
| `packages/import`                                                                                           | CLI                                                  | 3,691 / 573                           | parse5 over Prototemplate HTML, run once per import                                                                                                                                                                                                                                                                                  | Keep.                                                                                                                                                                                                                              |
| `packages/render`                                                                                           | Browser, function SSR, render worker                 | 10,031 / 6,395                        | The string renderer; DOMPurify over jsdom at write time                                                                                                                                                                                                                                                                              | Keep. DOMPurify is the reference sanitizer against mutation XSS; ammonia changes the sanitizer's semantics on a security boundary and is weaker on SVG. The regex fallback (`sanitize/html.ts` 162 to 229) is the security lane's. |
| `packages/fonts`                                                                                            | Data, build time                                     | 4,198 / 1,016                         | InterVariable and the catalog; `scripts/build-fonts.py` cuts instances                                                                                                                                                                                                                                                               | Keep.                                                                                                                                                                                                                              |
| `packages/materials`                                                                                        | Browser, Chromium capture                            | 4,665 / 1,942                         | Paper shaders, playwright-core                                                                                                                                                                                                                                                                                                       | Keep.                                                                                                                                                                                                                              |
| `packages/effects` and `crates/turboslide-native`                                                           | Browser worker (wasm), CLI and function (TypeScript) | 2,588 / 1,493 and 3,024 Rust          | The two tone screen, the 1-bit PNG, pixelmatch, DSSIM                                                                                                                                                                                                                                                                                | Keep both, wasm only (RUST-3).                                                                                                                                                                                                     |
| `apps/realtime-worker`                                                                                      | Cloudflare Worker and Durable Object                 | 4,096 / 1,632                         | The admission (RUST-1), SQLite rows, sockets                                                                                                                                                                                                                                                                                         | Keep in TypeScript. A workers-rs object would need the schema's reducer, transforms and validator in Rust while the browser keeps TypeScript.                                                                                      |
| `apps/render-worker`                                                                                        | Docker, Node                                         | 1,922 / 428                           | A job runner over Chromium                                                                                                                                                                                                                                                                                                           | Keep.                                                                                                                                                                                                                              |
| `apps/cli`                                                                                                  | Node                                                 | 20,824 / 6,631                        | Startup 1.3 to 1.5 s of CPU (section 4)                                                                                                                                                                                                                                                                                              | Keep in TypeScript; lazy imports and the compile cache (RUST-6). Every command's work is the TypeScript packages, so a Rust front end would only add a process hop.                                                                |
| `packages/mcp`                                                                                              | Function, CLI                                        | 1,848 / 1,247                         | The MCP SDK, which is TypeScript                                                                                                                                                                                                                                                                                                     | Keep.                                                                                                                                                                                                                              |
| `packages/agent`, `headless`, `lint`                                                                        | Function, CLI, render worker                         | 5,035, 4,177, 9,982                   | The dispatcher, Playwright, the grammar linter over renders                                                                                                                                                                                                                                                                          | Keep.                                                                                                                                                                                                                              |

The cost of two implementations, from the one place the tree has them: the effects package is
2,588 lines of TypeScript and 1,493 of tests beside 3,024 lines of Rust and a parity test, and it
needed a hand written `libm` choice, JavaScript rounding ports and a CORE-MATH note
(docs/native.md "Why it agrees") to light the same cells. The schema is ten times larger than the
effects package.

## 6. Auth: better-auth against a Rust implementation

- What runs: better-auth 1.7.4 with Google (production's one sign in), anonymous principals joined
  through the alias table, magic link, email OTP and the device authorization flow for the CLI,
  over Kysely (SQLite locally, the D1 proxy dialect on production, pg available). The studio's
  auth folder is 7,090 lines around it.
- The record of the library: Better Auth's June 2026 security update published 13 advisories,
  among them "Device-flow owner binding" (GHSA-cq3f-vc6p-68fh, CVE-2026-45337, High) and "OAuth
  account linking ownership" (GHSA-g38m-r43w-p2q7, High), both in features Turboslide uses, fixed
  in 1.6.11. Turboslide's 1.7.4 is after the fix. Outside reporters found these because many
  deployments run the same code; a Rust implementation written this round would carry the same
  classes of bug with no outside review and no advisory feed to tell anyone.
- What Rust offers: `oauth2` and `openidconnect` are building blocks. Sessions, the device flow,
  magic links, OTP, anonymous linking and the database adapters would be new code on the most
  attacked surface of the product.
- Where it would run: the cookies, the Google callback and the session reads live in the TanStack
  Start function on `www.turboslide.com`. A Rust auth would be a separate Vercel Rust function
  (beta) or a Worker, which adds a hop to every session read the SSR loaders make.
- The cryptography already runs in native code: HMAC tickets and sealed cookies use node:crypto
  in the function and WebCrypto in the Worker.

Verdict: keep better-auth. What makes auth safer is tracking its advisories (no CI means no
Dependabot or OSV scan today, RUST-3), tests in Turboslide's own suite for the device flow's owner
binding and for account linking, and the auth lane's findings.

## 7. The plan

The parity method for any port, unchanged from the crate's rule and made general: the TypeScript
stays the reference; the Rust passes the same vitest suite through a backend selector (as
`packages/effects/src/select.ts` does); a seeded random comparison (mulberry32 seeds recorded in
the report, as `packages/schema/src/transform.test.ts` 452 does for the transforms) compares
outputs byte for byte or within a stated tolerance; CI runs it with `TURBOSLIDE_NATIVE_REQUIRED=1`;
the Rust ships behind `TURBOSLIDE_<AREA>_BACKEND=typescript|wasm|auto` with the TypeScript as the
fallback and `describeBackends()` reporting which one ran; production runs both on a sample and
logs disagreements before the flip. The TypeScript copy is removed only when every runtime that
ran it runs the Rust, the browser included; otherwise the TypeScript stays for good and the pair
is permanent maintenance.

Phase 0, this round, TypeScript (no Rust):

1. RUST-1: the incremental admission (copy the touched slides, validate the touched slides and
   the cross references they take part in, full validation for deck, section, asset and version
   operations), with the same change in `applyMutations` so the browser's rebases stop copying
   the whole document. Parity: seeded random mutation sequences on GT and x10, today's
   `landCandidate` against the new one, identical `ok`, reason, message and resulting document.
   Gain, measured on the prototype: 16.3 ms to 0.051 ms (GT) and 122 ms to 0.261 ms (x10) of CPU
   per admitted entry.
2. RUST-2: one rewrite rule in `@turboslide/schema/transform`, used by the admission, the browser
   and comments.
3. RUST-4: the 25 MB deck cap enforced at admission.
4. RUST-3: CI (Kevin's scope grant), so every parity gate runs on push.
5. RUST-7: the Text memo, for the full validations that remain.

Phase 1, Rust, limited to the crate:

1. Drop the napi binding (`cargo tree` lists 42 entries with the napi feature and 24 with wasm;
   seven platform packages, `build:napi`, the `SERVER_ONLY` and `traceDeps` branch in `vite.deploy.config.ts`, the zigbuild and glibc steps
   of the CI template). The wasm module is the crate's one output; Node runs the TypeScript stages,
   which the parity test proves identical; the browser worker keeps wasm.
2. The native workflow in `.github/workflows` once CI exists: `cargo test`, the wasm rebuild and
   sha256 diff (reproducible today), the parity test with `TURBOSLIDE_NATIVE_REQUIRED=1`.
3. Measure before porting: the block dither's `ditherFrame` in the worker at 1600 by 900 on a mid
   range machine. Port the round three patterns (`bayer4`, `blue64`, `random`, strength) into the
   crate only if a frame misses 16 ms (docs/native.md open item).
4. DSSIM for the verify loop: restructure `dssim.rs` and `dssim.ts` together (fewer allocations,
   one pass per blur) under the 1e-9 parity tolerance. The gain lands in export verification in the
   CLI and the render worker; no page a person waits on calls DSSIM. Measure at a load under 24 first.

Measurable gain of phase 1: a smaller build, a parity gate that runs on push, and a binary whose
hash is checked. No user facing speed claim.

Phase 2, port later, each with its trigger:

- Image decode, resize, encode and SVG raster in the crate's wasm (`image`, `png`, `zune-jpeg`,
  `resvg` and `usvg`), replacing sharp where N-API is missing. Trigger: the stage 2 move of the app
  onto Workers (docs/CLOUDFLARE.md 580 already names "the Rust crate's wasm twin").
- The logo sanitizer on `roxmltree`. Trigger: the RUST-5 harness finds a parser defect.
- A document core in Rust (reducer, transforms, validator) compiled to wasm and run by the browser,
  the function and the object alike. Trigger: a measured cost that the phase 0 code cannot meet on
  a mid range laptop or in the object. Never a server only copy.

Never: auth, the Blob store, Chromium orchestration (export, render, materials), the MCP server,
SSR.

## 8. Findings

### RUST-1 (3): every admitted entry clones and validates the whole document; one typist saturates the object of a large deck

Evidence. `packages/realtime/src/room-core.ts` 341 `landCandidate` calls `reanchorAll` (351),
which calls `applyMutations`, which starts with `cloneJson(document)` (`packages/schema/src/reduce.ts`
641, `JSON.parse(JSON.stringify(value))` at `pointer.ts` 134), then `validateDocument(next)` on the
whole deck (room-core 371). The object runs this for every entry of every POST
(`apps/realtime-worker/src/deck-room.ts` 1011 to 1031), and so do the function's memory and blob
tiers (`apps/studio/src/server/room.ts` 1908, 1964, 2325, 3503). Measured (section 4): 13.5 to
16.3 ms of CPU per entry on GT (minimum wall 8.9 ms) and 121.6 to 122.4 ms on the 850 slide copy,
at load 78 to 102. A client may send 60 entries a second (`admission.ts` 27); a person typing
sends about ten (the 100 ms text flush). Ten entries a second cost the object about 0.1 to 0.16 s
of CPU per second on GT and about 1.2 s per second on the 850 slide copy: one typist saturates the
single threaded object, and every other editor's acknowledgement waits behind the queue. The
browser has the same shape: the room client calls `applyMutations` on the whole document for each
pending op and each landed entry (`packages/realtime/client/room-client.ts` 1122, 1230, 1276, 1476,
1550, 1559) at 1.4 ms (GT) and 7.8 ms (x10) a call on this machine, several times per remote
entry. Each clone also allocates a full parsed copy inside a 128 MB isolate that other objects
share. The cost grows without a bound because the deck cap is not enforced (RUST-4).

Fix. In TypeScript: `applyMutations` copies the deck object and the slide map shallowly and clones
only the slides the mutations touch (`touchedSlides`), and the manifest only for deck level
operations; `landCandidate` validates the touched slides with `validateSlide` plus their cross
references (asset ids, opener placement, slide links) and runs `validateDocument` only for
`slide.insert`, `slide.remove`, `slide.move`, section, asset, `deck.set` and `version.restore`.
The prototype (`bench-shared.mts`) measured 0.051 ms on GT and 0.261 ms on x10 and produced the
same slide bytes as today's path.

Test. A vitest `admission.incremental-parity`: 2,000 seeded random mutation sequences on GT and on
a generated large deck, today's `landCandidate` against the new one, identical `ok`, `reason`,
`message` and document. A bench row `admission.cpu-per-entry` that records CPU per entry on GT and
x10 and fails over 1 ms (CPU time, so it reads at any load, with the load recorded beside it).

### RUST-2 (3): the "whole Text rewrite" rule has four copies; three disagree, and the browser removes typed words the server would admit

Evidence. The rule that decides whether a pending text op survives a concurrent write exists in
`packages/schema/src/transform.ts` 345, `packages/realtime/src/room-core.ts` 99 (the server
admission), `packages/realtime/client/room-client.ts` 518 (the browser) and
`packages/schema/src/comments.ts` 654 (comment anchors, a fourth variant: any `slide.set` of the
slide except a typography path re-places the anchor, and removals are not in it). The browser's comment (room-client 512 to 517) says it follows the schema "so the client never keeps an op the admission would refuse".
The hotfix `ef72431c` (fields take a font of their own) taught the schema's copy that a
`slide.set` of `/typography/<field>` rewrites no Text; the browser's copy was not changed. The
server's copy keeps the op for every slide pointer that is not a field, which matches the schema
for typography and differs from it for notes. Reproduced with the exported functions (`repro-rewrites.mts`):

| Concurrent write                                                                               | Browser keeps the typed op | Server admission keeps it | Schema rule keeps it |
| ---------------------------------------------------------------------------------------------- | -------------------------- | ------------------------- | -------------------- |
| `slide.set /typography/heading` while you type in `/lead` (a colleague changes the title font) | no                         | yes                       | yes                  |
| `slide.set /notes` while you type in `/lead`                                                   | no                         | yes                       | no                   |
| `block.set` with path `''` while you type in the block                                         | yes                        | yes                       | no                   |

When the browser's copy says "rewritten", `transformPast` (room-client 826) drops the op, the
rebase marks it `stale` (1536 to 1543), and the editor removes the words from the page and shows
the refusal card with Copy text (`apps/studio/src/editor/controller.tsx` 2051 to 2063). For an op
still waiting for its 100 ms flush the words are never sent. The server would have admitted them.
The third row is the opposite disagreement: the browser and the server splice into the block's
new value at the old offset, where the schema's rule returns the op to its author. Every copy ends
in `default: return false`, so a new mutation operation is silently "not a rewrite" in all four.

Fix. One exported rule in `@turboslide/schema/transform`, chosen once (question 3), imported by
`room-core.ts` and `room-client.ts`; comments keep their own function only under a different name
if anchors need a different rule. Replace `default: return false` with an exhaustive check on
`never`, which gives the exhaustive match people cite as a reason for Rust.

Test. A table test that enumerates every `Mutation` op against a text op on a slide field and on a
block, and asserts the admission, the browser rebase and the schema rule answer the same. An e2e
row `collab.typing-survives-font-change`: two browsers, A types in the lead while B changes the
title's font, A's words are on both pages and no refusal card shows.

### RUST-3 (2): no CI runs any parity gate, and the native records describe a pipeline that does not exist

Evidence. No `.github/` folder (section 2). `packages/native/BUILD-RECORD.json` holds `null` for
the Linux addon with a note that `.github/workflows/native.yml` builds it. docs/performance.md 52
has carried "The image pipeline runs on the Rust addon in the function" as "after" since
2026-09-14. The Rust tests, the parity test and the wasm diff run only when someone runs
`pnpm check` with cargo installed. The cleanup lane's CLEANUP-3 and CLEANUP-7 read the same facts
and leave the addon decision to this lane.

Fix. Kevin runs `gh auth refresh -h github.com -s workflow` (his step); the check workflow and the
native workflow go into `.github/workflows`. The addon decision: drop napi (phase 1 item 1). The
node addon buys 52 to 20 ms on a two tone screen the function computes when a designer treats an
asset, which no person perceives, and it costs a Linux build, a committed binary and a glibc
question. Remove the "after" row from docs/performance.md and the Linux row from
`BUILD-RECORD.json`.

Test. The native job green on a pull request, with the wasm sha256 diff and the parity test under
`TURBOSLIDE_NATIVE_REQUIRED=1`.

### RUST-4 (2): the 25 MB deck cap is declared and never enforced

Evidence. `CAPS.deckMaxBytes` is `25 * MB` at `packages/realtime/src/admission.ts` 37; a search of
`packages` and `apps` finds no other use of it. The admission enforces the 200 KB slide cap
(room-core 89 and 365 to 370) and the per minute byte budgets (2 MB anonymous, 8 MB
signed in, `admission.ts` 31), so a deck grows by inserts with no upper bound, and RUST-1's cost
grows with it: at the declared 25 MB the measured rate (122 ms per 1.47 MB) extrapolates to about
2 s of CPU per entry today.

Fix. Keep a running byte total of the live document's canonical slides and manifest in the object
and the function's room (the touched slides' bytes are already computed per entry) and refuse an
entry that passes the cap with `too-large`.

Test. A room-core vitest that grows a document past the cap with `slide.insert` and reads
`too-large`, on the memory tier and in the Worker suite.

### RUST-5 (2): a hand written XML parser on an untrusted boundary has no fuzz harness

Evidence. `apps/studio/src/server/logo-sanitize.ts` builds its own strict XML reader (header lines
1 to 24: "A small strict XML reader (no DOM library...)") for SVG from thesvg.org and from uploads
(the 2 MB upload cap, `upload.ts` 70). `logo-sanitize.test.ts` holds 3 tests and `logos.test.ts`
43 fixture tests; no test generates inputs. Rewriting it in Rust would replace one unfuzzed parser
with another.

Fix. A seeded generator over the fixture set (attribute and entity mutations, CDATA, comments,
namespaces, `url(` and `href` forms, nesting) with the invariant that the output, read again by
the same reader, holds only listed elements and attributes, only `#id` references and `url(#id)`.
If it finds a parser confusion, `roxmltree` behind the wasm module is the port (phase 2).

Test. `logo-sanitize.fuzz.test.ts` with a recorded seed list and 20,000 cases per run.

### RUST-6 (1): the CLI spends 1.3 to 1.5 s of CPU before it prints help

Evidence. Section 4: 1.33 to 1.46 s user CPU for `--help` (load 131 to 120); 0.75 to 0.78 s with
`NODE_COMPILE_CACHE`; Node's type stripper takes 23.7 percent and `playwright-core` 14.3 percent of
the profile. `apps/cli/bin/turboslide.mjs` imports `../src/main.ts` for every command.

Fix. Import each command's module when the command runs (Playwright only for render, export,
capture and judge), call `module.enableCompileCache()` in the launcher, and ship the tsdown bundle
for distribution. A Rust launcher would not help, since every command runs the TypeScript packages.

Test. A CLI test that runs `--help` and `info` under `process.cpuUsage()` and fails over 300 ms of
CPU.

### RUST-7 (1): validation re-parses every Text of every slide on every call

Evidence. The profile in section 4: `text.ts` is 31.8 percent of `validateDocument`, mostly
`parseInto` and `parseText` over Text strings that did not change since the last call. After
RUST-1 the full validations that remain (checkpoints, store writes, imports, `pnpm check`) still
pay it.

Fix. A bounded memo of `canonicalText` keyed by the input string (the function is pure), shared
by the validator and the reducer.

Test. The existing schema suite unchanged, plus a bench row recording `validateDocument` CPU on GT
before and after.

## 9. Questions, each with a default

1. Does the round grant CI (`gh auth refresh -s workflow`, Kevin's step)? Default: the spec lists
   it as Kevin's step; until it happens every parity gate runs through `pnpm check` by hand and
   the report of each lane says so.
2. The crate's Node binding: drop napi and keep wasm only, or build the Linux addon in CI and ship
   it in the function? Default: drop napi; the function stays on the TypeScript stages.
3. Which rewrite rule is right for a `slide.set` of a slide pointer that is not a field (notes,
   typography, layout) and for a `block.set` of a parent path? Default: the server admission's
   rule for `slide.set` (only a whole value write of a field rewrites that field's Text), since
   production enforces it today and it keeps typed words; the schema's prefix rule for
   `block.set`, since splicing into a replaced value at an old offset puts characters at the wrong
   place.
4. Does any Rust port happen this round, given Kevin's words? Default: no port of backend logic;
   the Rust work is the crate (phase 1) and this report's reasons go into the spec so Kevin can
   overrule them with the triggers of phase 2 in view.
5. Is the 25 MB cap the right number, given RUST-1's cost per byte? Default: keep 25 MB once
   RUST-1 lands (the incremental path's cost does not grow with the deck); enforce it either way.
