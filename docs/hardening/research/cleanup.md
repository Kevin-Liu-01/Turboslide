# Cleanup research (key: cleanup)

Research for the hardening round's fourth ask, the codebase cleanup. Read on 2026-10-08 from the
worktree `/Users/kevinliu/repos/Turboslide-harden` at `0d3920a3` (origin/main). Nothing in the tree
changed apart from this file. The machine's one minute load was 80 to 245 during the work; no timing
below is a verdict, and every number below is a count, a byte size or a status code.

Scratch outputs (knip JSON, the verified export lists, the move manifest) are in
`/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/harden/cleanup/`.

## 1. Method

Entry points used for reachability:

- `apps/studio`: every file under `src/routes/`, `src/router.tsx`, `src/start.ts`, `src/workers/*.ts`,
  the three Vite configs, `vitest.config.ts`, `e2e/**`, `src/**/*.test.*`.
- `apps/cli`: `bin/turboslide.mjs`, the package's `exports`, `e2e/*.mjs`, tests.
- `apps/realtime-worker`: `src/index.ts` (wrangler `main`), `test/**`.
- `apps/render-worker`: `src/main.ts`, the package's `exports`, tests.
- `packages/*`: each package's `exports` map, `scripts/**`, tests.
- Root: every file under `scripts/`, `docker/*.mjs`, `docs/readme/*.mjs`, the test configs.
- The guard: `~/.config/turboslide/gt-follow.sh` was searched for repository paths only (no value
  was read). It runs `scripts/hosted-smoke.mjs` and `scripts/probes/core-gate.mjs`, reads
  `scripts/hosting/production.json`, `docs/gslides-parity/focus/core-matrix.json` (line 140) and the
  newest `docs/gslides-parity/focus/ship-*.json` by commit time (lines 281 to 290), and treats a push
  that changes only `docs/` or `*.md` as smoke only (lines 269 to 278).

Tools:

- `npx knip@6.40.0` with a monorepo config written for these entries
  (`scratchpad/.../knip.json`). The default config reports 476 unused files because it does not know
  the TanStack routes or the scripts `check.mjs` runs by path; the tailored config reports 3 unused
  files, 742 unused exports and types, 11 unused dependencies, 3 unused devDependencies, 1 unused
  catalog entry.
- Every knip export was checked against a whole tree identifier search (all tracked `.ts`, `.tsx`,
  `.mts`, `.mjs`, `.js`, `.mdx` outside `docs/`). Result: 48 exports are named nowhere but their own
  declaration, 508 are used only inside their own file, 186 are named in other files (knip misses
  member use after `await import()` in `start.ts`, so those 186 are treated as used).
- Package subpath exports were indexed by specifier and by relative import: 486 subpaths, 15 with
  no importer of either kind.
- Identical function bodies (normalized, over 120 characters) defined in more than one file: 33.
- Every docs path named outside `docs/` was classified as a program read (a file a script or test
  opens) or a citation (a comment or a sentence).

## 2. Findings

Severity: 4 a person's data or account can be read, changed or lost by someone else or by a common
failure; 3 a serious weakness with a plausible path; 2 a real defect or a missing defence; 1 hygiene.

### CLEANUP-1 (2): thirteen hand written constant time comparisons; one throws on a non-ASCII grant and the route answers 500

Evidence:

- `timingSafeEqual` is called directly in 13 places (plus `auth/digest.ts:301`, which compares two
  decoded Buffers and is safe): `apps/studio/src/server/tokens.ts:194`,
  `auth/tokens.ts:421`, `bundle-core.ts:123,155`, `upload.ts:141`, `room.ts:2717`,
  `room-bearer.ts:21`, `logos.ts:838`, `assist.ts:682`, `routes/api/export.$deckId.ts:172`,
  `routes/api/render.$slideId.ts:72`, `packages/agent/src/http/auth.ts:65`, and the Worker's own
  `apps/realtime-worker/src/ticket.ts:107`.
- `tokens.ts:192` `sameHex` checks the string lengths and then compares `Buffer.from(given, 'utf8')`
  with the hex `expected`. A 32 character string of `é` has the length of a 32 character MAC and 64
  bytes, so `timingSafeEqual` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`.
- Reproduced on a local dev server on port 4836 (settings: `TURBOSLIDE_STORE=tmp`,
  `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`, captured
  mail, fake Google pair, fresh 48 character secrets; load 150 to 245):
  - `GET /api/render/s01?deck=gt-brand&g=<exp>.0123456789abcdef0123456789abcdef` answered 404
    `{"error":{"message":"no slide s01 in deck gt-brand","status":404}}` (the grant fails and the
    route continues).
  - `GET /api/render/s01?deck=gt-brand&g=<exp>.<32 × %C3%A9>` answered 500
    `{"status":500,"unhandled":true,"message":"HTTPError"}`; the server log shows `RangeError: Input
buffers must have the same byte length at sameHex (tokens.ts:194) at verifyRenderGrant
(tokens.ts:438) at GET (render.$slideId.ts:117)`.
  - `verifyRenderGrant` runs at `render.$slideId.ts:117`, before `unauthorized()`, so
    `TURBOSLIDE_LOCAL_OPEN` and the rate limit setting do not change the outcome; the same throw is
    reachable through `verifyThumbGrant` (`?w=160&s=`, `tokens.ts:389`) and `verifyCancelToken`
    (`export.$deckId.ts:357`, the `ct` query).

Fix: one module, `safeEqual(a: string, b: string): boolean`, that encodes both with `TextEncoder`,
returns false when the byte lengths differ, and compares with a constant time loop over the bytes.
It needs no `node:` import, so the studio, `packages/agent` and the Worker use the same file
(proposed home: `packages/identity/src/safe-equal.ts`, which is already node free). Replace all 13
call sites; delete the local `sameToken`, `sameSecret` and `sameHex` helpers.

Pin: a unit test of `safeEqual` with a 32 character non-ASCII string against 32 hex characters
(false, no throw); a studio route test that `GET /api/render/s01?g=<exp>.<32 é>` answers 4xx; a
lint rule (or a test that greps) that `timingSafeEqual` appears only in `safe-equal.ts`.

### CLEANUP-2 (2): the account deck index is read and never written; deck listing is implemented three times

Evidence:

- `apps/studio/src/server/index.ts:40-84` defines `noteHead`, `touchRecent`, `noteOwned`,
  `noteUnowned`, `noteShared`, `noteUnshared`, `noteTrashed`, `noteRestored`, `noteRemoved`. None
  has a caller anywhere in the tree (whole tree search), and `git log -S'noteOwned('` finds only
  the commit that wrote them (`1178478c`, round three, 2026-09-14), so no call ever existed. `indexUpdates.owned`, `.recent`,
  `.trashed`, `.restored`, `.removed` are called only from those nine functions; only `shared`,
  `name` and `avatar` are written (`access.ts:276,340,363`).
- `start.ts:76` binds `deckIndex` to `index.accountDecks`, which serves the `account.decks` action
  (`auth/actions.ts:556`, `auth/identity.ts:1091`). On a hosted store `view: 'recent'` and
  `view: 'trash'` read `index.recent` and `index.trashed`, which stay empty, so the action answers
  `[]`; `view: 'owned'` finds `index.owned` empty and lists every deck in the store, reading each
  access record (`index.ts:121-129`) on every call.
- The `/decks` page lists through a second implementation, `server/deck-scope.ts:302` `listScoped`
  (and `ownedTrash`, `browserTrash`); a third is the fallback in `auth/identity.ts:1085-1100`
  `deckIndexFor`; the CLI has its own `record-actions.ts:346` for a checkout.

Fix: one listing module. `account.decks` answers from `deck-scope.ts` (`listScoped` for owned and
shared, `ownedTrash` for trash) so the agent action and the page agree; delete the nine dead writers
and the index's `owned`, `recent` and `trashed` fields (or write them on create, open, trash,
restore and remove in the commit paths, if Kevin wants a per person index for speed; the
performance lane owns that choice). Delete `deckIndexFor`'s scan fallback once the hook is always
bound.

Pin: a studio unit test on the tmp hosted store: create a deck as principal P, trash it, then
`account.decks {view:'trash'}` contains it and `{view:'owned'}` does not; a second test that the
agent action and `listHomeDecks` return the same ids for P.

### CLEANUP-3 (2): five Playwright specs, the realtime Worker's tests and the Rust tests run in no gate

Evidence:

- `apps/studio/e2e/editor.spec.ts` (525 lines), `resize.spec.ts` (914), `roles.spec.ts` (568, last
  changed 2026-10-07), `undo.spec.ts` (262), `window-api.spec.ts` (411) are named by no step of
  `scripts/check.mjs` (steps 17, 21, 26 list specs by name and never run the folder), by
  `core-gate.mjs` or by `core-matrix.json`.
- `apps/realtime-worker/test/*.test.ts` (1,632 lines) run only through
  `pnpm --filter @turboslide/realtime-worker test`; the root vitest config leaves the app out on
  purpose and `check.mjs` has no step for it.
- `crates/turboslide-native` has 48 `#[test]` items and `tests/pillow.rs`; no step runs
  `cargo test` (step 29 rebuilds the wasm module only when the toolchain is present).

Fix: run the five specs once on a local server; add the green ones to step 21 or 26 and delete any
whose rows a `core/*.spec.ts` already drives (roles and window-api look like the ones to keep).
Add a check step `pnpm worker:test` and a `cargo test` step that skips with a line when cargo is
absent.

Pin: a scripts test that every `apps/studio/e2e/**/*.spec.ts` is named by `check.mjs`, by
`core-gate.mjs` or by a `driver` in `core-matrix.json`.

### CLEANUP-4 (2): ESLint is outside the check chain and has drifted; the root scripts are not type checked

Evidence:

- `scripts/check.mjs --list` prints 33 steps and none runs `scripts/lint-packages.mjs` or
  `pnpm lint`.
- `tooling/eslint-config/baseline.json` was last written on 2026-09-13 (`13d0361d`). A run of
  `node scripts/lint-packages.mjs --only store,render,effects` (load 81) counted 72 errors where the
  baseline allows 4 (effects 5 against 0, render 39 against 1, store 28 against 3). The top rules:
  `no-unnecessary-type-assertion` 21, `no-unnecessary-condition` 16, `import/no-duplicates` 14,
  `no-restricted-syntax` 8 (default exports or barrels, the repository's own rule), `import/first` 5.
- `scripts/` holds 81 `.mjs` files (about 70,000 lines). No tsconfig includes them and none carries
  `// @ts-check`.

Fix: add `node scripts/lint-packages.mjs --changed` to the check chain (it lints only the files a
change touches, so it stays fast under load), rewrite the baseline after the cleanup lands, and add
`// @ts-check` plus a `scripts/tsconfig.json` (`allowJs`, `checkJs`, `noEmit`) referenced from the
root `tsconfig.json`.

Pin: the new check step; a scripts test that `baseline.json` counts are at or above the measured
counts of `lint-packages.mjs --json`.

### CLEANUP-5 (2): the round evidence folder is 70 percent of the tree and 94 percent of the history; the program's own bound is exceeded and nothing checks it

Evidence:

- Tracked tree at `0d3920a3`: 9,085 files, 417.3 MB. `docs/gslides-parity/`: 5,884 files, 294.0 MB
  (JSON 110 MB, JPEG 78 MB, Markdown 58 MB, PNG 49 MB, 385 script files with 123,470 lines).
- History reachable from origin/main (722 commits): about 1,400 MB packed, of which
  `docs/gslides-parity/` is 1,320.7 MB.
- A `git clone --depth 10 --no-checkout` of origin/main measured 192 MB of `.git`; its blobs split
  115.6 MB evidence folder, 8.9 MB other docs, 51.4 MB everything else.
- 17 Turboslide worktrees exist on this machine; each checkout carries the 294 MB.
- Search cost: 177 MB of text in the folder. `git grep -w authorize` finds 393 lines in the folder
  and 262 in the code; `core-matrix` finds 669 and 61.
- `docs/NEXT.md` 5.6 item 1 bounds a fresh checkout at 5,000 tracked files and 300 MB. The tree is
  at 9,085 and 417 MB. `docs/readme/evidence-policy.test.mjs` checks picture sizes and folder
  widths, and no test checks the bound.
- Program readers inside the folder: 12 files (section 3.1). Everything else is cited by comments
  and prose only.
- Deploys: the team project's git deployments are blocked and the guard deploys with the CLI
  (`gt-follow.sh` header), so `.vercelignore` governs production uploads, and it already leaves out
  `docs/gslides-parity` (line 35). Moving the folder saves no Vercel build or upload time.

Fix: section 3.1, steps D1 to D4.

Pin: a test (beside `evidence-policy.test.mjs`) that `git ls-files | wc -l` is at most 3,500 and the
tracked bytes at most 150 MB after the move; a test that every docs path named in a non-comment
line of code exists (today 9 named paths are missing, section 3.3).

### CLEANUP-17 (2): three source files hold a literal NUL byte; git treats the mail module as binary

Evidence: `apps/studio/src/server/auth/digest.ts:83` (`${principalId}<NUL>${deckId}`, the digest
key), `packages/viewer/src/MaterialMount.tsx:335` (`join('<NUL>')`) and
`packages/headless/src/capture/shared.test.ts:224` (`'GIF89a<NUL><NUL>'`) contain the byte 0x00
typed into a string literal. Git looks for a NUL in the first 8,000 bytes to call a file binary:
`digest.ts`'s is at line 83, so `git log -p` prints "Binary files /dev/null and
b/apps/studio/src/server/auth/digest.ts differ", `git grep` prints "Binary file ... matches", and a
pull request shows no diff for the module that sends mail and checks unsubscribe tokens. The other
two are past the first 8,000 bytes and still diff as text, until an edit moves the byte up.

Fix: write the separator as the escape `'\u0000'` (or `'\0'`) in all three.

Pin: a scripts test that no tracked `.ts`, `.tsx`, `.mts`, `.mjs` or `.css` file contains a 0x00 byte.

### CLEANUP-6 (1): code paths for infrastructure Kevin ruled out stay in the tree

Evidence: `docs/hosting.md:1169` and `docs/CLOUDFLARE.md` 4.4 record Kevin's rule "No Upstash, no
Neon, no `REDIS_URL`, no `DATABASE_URL`, ever". The tree still carries:

- The Redis realtime tier: `packages/realtime/src/redis.ts` (533), `redis-fake.ts` (625), `lua.ts`
  (172), `redis.test.ts` (351), the `ioredis` dependency, `apps/studio/src/server/room.ts:3,34-35`
  and its `redisCommands()` branch. `scripts/hosting/production.json` says the tier "is never
  deployed".
- The shared counters bound only over Redis or Upstash: `start.ts:77-115` (`kvLimiter`,
  `kvSpentSet`, `upstashLimiter`), `@upstash/ratelimit` and `@upstash/redis` in the studio, the
  Upstash part of `ratelimit.ts`.
- The Postgres accounts path: `auth/db.ts:18-19,160` (`pg`, `PostgresDialect`), `pg` and `@types/pg`
  in the catalog. Production's accounts are D1 (`TURBOSLIDE_ACCOUNTS=d1`, `docs/security.md:416`).
- `auth/secondary-storage.ts:54` `memoryRedisKv`, named nowhere else.
- A consequence the security lane should own: with neither Redis nor Upstash, production binds the
  memory limiter and the memory spent set per function instance (`ratelimit.ts` header,
  `tokens.ts:175,180`).

Fix: delete the Redis tier, the Upstash and ioredis wiring, the Postgres dialect and the dead KV
helper; keep the `RateLimiter` and `SpentSet` interfaces and give them one Worker backed
implementation (D1 or the Durable Object) when the security lane builds the shared counter.

Pin: `knip` reports no `ioredis`, `@upstash/*` or `pg` import; `select.ts` tests list the tiers
`memory`, `blob`, `do`.

### CLEANUP-7 (1): the napi addon was never built; seven platform packages and the deploy branch for it are scaffolding

Evidence:

- `packages/native/BUILD-RECORD.json`: the `npm/linux-x64-gnu/turboslide-native.linux-x64-gnu.node`
  entry has `bytes: null`, `sha256: null`, note "not built yet"; `git log --all` shows no commit
  of a `.node` file; `packages/native/npm/linux-x64-gnu/.gitignore` still holds `*.node`.
- `packages/native/npm/{darwin-arm64,darwin-x64,linux-arm64-gnu,linux-arm64-musl,linux-x64-gnu,
linux-x64-musl,win32-x64-msvc}` hold a `package.json` and a `.gitignore` each; the Vercel install
  prints an "Unsupported platform" warning for six of them on every build
  (`docs/gslides-parity/verification-3/hotfix/vercel-deploy.txt`).
- `packages/native/ci/native.yml` is a GitHub Actions workflow that was never placed under
  `.github/`.
- `apps/studio/vite.deploy.config.ts:40-48` adds the addon to the externals only when the package
  resolves, which it never does.
- The function bundle does not carry `packages/native/wasm` either, and production's `/api/agent`
  reported `effectsBackend: "typescript"` (`docs/gslides-parity/focus/audit-export.md:90`; the
  endpoint needs a bearer, so it was not read again here). The crate runs in production only in the
  browser's dither worker (`apps/studio/src/workers/dither.worker.ts`). The round's framing says
  the crate is loaded through napi in the Vercel function; the tree says it is not.

Fix: the Rust lane decides between building the Linux addon and dropping napi for wasm in Node.
Either way delete the six non Linux shells and `ci/native.yml`; if napi goes, delete
`linux-x64-gnu`, the deploy config branch and the addon half of `packages/native/src/node.ts`.

Pin: `node packages/native/scripts/check-record.mjs` with the record rewritten; a deploy check
that reads `instance.effectsBackend` on the preview with the guard's bearer.

### CLEANUP-8 (1): passkeys were planned and never enabled

Evidence: `@simplewebauthn/browser` and `@simplewebauthn/server` are dependencies of
`apps/studio/package.json:19-20` and no file imports either; `better-auth.ts:60`
`PASSKEY_RPID_VARIABLE` is named nowhere else; `EditorRoot.tsx` passes `passkeysAvailable` from
`auth.passkeys`, which no server code sets true; `e2e/accounts.spec.ts:2161` asserts there is no
passkey row.

Fix: remove the two dependencies, the variable and the `passkeysAvailable` plumbing (question 4).

Pin: knip reports no unused dependency in `apps/studio`.

### CLEANUP-9 (1): dead files, scaffold barrels, dead exports and unused aliases

Evidence and the exact lists:

- Files nothing imports: `apps/studio/src/components/home/SectionIcon.tsx` (18 lines; the type
  `SectionIconName` in `copy.ts` stays), `packages/chrome/src/panels/AssistViewerPanel.tsx` (28
  lines; `panels/Assist.tsx:196` draws the same sentence, and the polish round removed the Assist
  button from the view link) with its `exports` entry `./panels/AssistViewerPanel`.
- Scaffold barrels that only export `PACKAGE_NAME` and say they are to be deleted:
  `packages/{agent,fonts,identity,schema,theme}/src/index.ts` and the `"./index"` entry of each
  `package.json`. No file imports them.
- Exports named nowhere but their declaration (48; whole tree search):

| File                                               | Exports                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/studio/src/components/home/copy.ts`          | PRODUCTION (24), resolveText (608)                                           |
| `apps/studio/src/components/home/live/motion.ts`   | runningCount (214)                                                           |
| `apps/studio/src/components/home/live/theme.ts`    | colorsOfKit (184)                                                            |
| `apps/studio/src/components/home/sign-in-auth.ts`  | returnAddress (109)                                                          |
| `apps/studio/src/components/presentActions.ts`     | audiencePath (36)                                                            |
| `apps/studio/src/server/assist-route.ts`           | ASSIST_ROUTE_PATH (40)                                                       |
| `apps/studio/src/server/auth/better-auth.ts`       | PASSKEY_RPID_VARIABLE (60)                                                   |
| `apps/studio/src/server/auth/d1-proxy-dialect.ts`  | D1_COUNTERS_PATH (56)                                                        |
| `apps/studio/src/server/auth/identity.ts`          | forgetAllAccountFacts (601), localTokenMissing (1001)                        |
| `apps/studio/src/server/auth/secondary-storage.ts` | memoryRedisKv (54)                                                           |
| `apps/studio/src/server/bundle-core.ts`            | bundleRouteAuth (195)                                                        |
| `apps/studio/src/server/decks.ts`                  | getHostingFacts (391, a `createServerFn`, so an endpoint), deckDetails (693) |
| `apps/studio/src/server/export-sync.ts`            | fileNames (510)                                                              |
| `apps/studio/src/server/index.ts`                  | the nine writers of CLEANUP-2                                                |
| `apps/studio/src/server/logo-index.ts`             | cachedKeysOfSlug (495)                                                       |
| `apps/studio/src/server/logo-sanitize.ts`          | sniffSvg (818)                                                               |
| `apps/studio/src/server/room-ticket.ts`            | ROOM_TICKET_REFRESH_MS (31)                                                  |
| `apps/studio/src/server/room.ts`                   | closeRooms (1573), threadIdsOf (3177), hostedRoom (3185)                     |
| `apps/studio/src/server/templates.ts`              | readDeploymentDefaultKit (197)                                               |
| `apps/studio/src/server/thumbs.ts`                 | nearestThumbWidth (94), thumbShot (213)                                      |
| `apps/studio/src/server/upload.ts`                 | uploadIdentity (484)                                                         |
| `packages/chrome/src/ToolbarTail.tsx`              | nearestStep (258)                                                            |
| `packages/chrome/src/comments/comments-model.ts`   | slideOfThread (88), threadsOnSlide (93)                                      |
| `packages/chrome/src/inbox/inbox-model.ts`         | unreadOf (58)                                                                |
| `packages/chrome/src/menus/toolbar-tails.ts`       | MORE_BREAKPOINT_PX (762)                                                     |
| `packages/chrome/src/panels/assist-model.ts`       | cardSlideIds (74)                                                            |
| `packages/chrome/src/pickers/DiagramPicker.tsx`    | DIAGRAM_TILE_BOX (309)                                                       |
| `packages/chrome/src/presence/presence-model.ts`   | participantsOnBlock (299), AnnouncementKind (354)                            |
| `packages/chrome/src/table-tools.ts`               | TABLE_COMMAND_LABELS (78)                                                    |
| `packages/export/src/dither-variants.ts`           | ditherResidualLine (50)                                                      |
| `packages/export/src/scene/enrich.ts`              | freeTexts (372)                                                              |
| `packages/lint/src/rendered/bitmap.ts`             | colorAt (88)                                                                 |

- Exports used only inside their own file (508): `apps/studio` 305, `apps/cli` 52, `packages/chrome`
  53, `packages/lint` 43, `apps/realtime-worker` 12, `packages/render` 11, `packages/export` 8,
  `packages/agent` 6, `packages/import` 6, `packages/fonts` 6, `packages/viewer` 5,
  `packages/realtime` 1. The list is `exports-verified.json` (`localOnly`) in the scratch folder.
- Aliases nothing uses: `apps/studio/package.json` `"imports": {"#/*"}` and
  `apps/studio/tsconfig.json` `paths` `#/*` and `@/*` (0 imports of either).
- Six export aliases that name one value twice (knip "duplicates"): `facts.ts` COUNT_KEYS and
  FACT_KEYS, `schema/actions.ts` TRANSPORTS and ALL_TRANSPORTS, `schema/comments.ts` threadIdSchema
  and commentIdSchema, `room-client.ts` BACKOFF_MAX_MS and RECONNECT_HOLD_MAX_MS, `protocol.ts`
  presencePostSchema and presenceStateSchema, `home/live/tailor.ts` startTailor and start.

Fix: delete the files, barrels, entries and the 48 exports; drop the `export` keyword from the 508
(mechanical, then `tsc -b` with `noUnusedLocals` catches any that were also unused locally); remove
the aliases. `getHostingFacts` is a server function, so deleting it also removes an endpoint; the
security lane may want a list of every `createServerFn` without a client caller.

Pin: commit `knip.json` (the config of section 1) and a check step `npx knip --include
files,exports,types,dependencies,unlisted --no-progress` that exits 0.

### CLEANUP-10 (1): unused dependencies and one script that cannot resolve its import

Evidence (each verified by searching the package for the specifier):

| Package                       | Unused                                              |
| ----------------------------- | --------------------------------------------------- |
| `apps/studio`                 | `@simplewebauthn/browser`, `@simplewebauthn/server` |
| `packages/agent`              | `@turboslide/headless`, `@turboslide/render`        |
| `packages/export`             | `zod`                                               |
| `packages/headless`           | `pixelmatch`, `pngjs`, `@types/pngjs`               |
| `packages/effects`            | `pngjs`, `@types/pngjs`                             |
| `packages/import`             | `@turboslide/theme`                                 |
| `packages/mcp`                | `@turboslide/identity`                              |
| `packages/theme`              | `@turboslide/effects`                               |
| `pnpm-workspace.yaml` catalog | `ulid`                                              |

`scripts/blob-copy.mjs:408` does `await import('@vercel/blob')`; from `scripts/` that specifier does
not resolve (`ERR_MODULE_NOT_FOUND`), so the fallback copy of the hosting move fails at its first
real run (its test drives in memory stores). `scripts/judge-loop.mjs:218` imports
`@anthropic-ai/claude-agent-sdk`, which is not installed; it falls back to the `claude` CLI.

Fix: remove the dependencies (the `^build` edges of `agent` shrink with them); give `blob-copy.mjs`
the same `createRequire` from `packages/store/package.json` that `build-home-assets.ts:687` uses
for jszip, or archive it (question 8).

Pin: the knip check step of CLEANUP-9.

### CLEANUP-11 (1): one job done two to four times

Evidence (identical or equivalent code in more than one module):

- Sign in requests: `apps/studio/src/editor/EditorRoot.tsx:273` `authPost`, `:300`
  `signInReturnAddress`, `:309` `signInErrorAddress`, `:1032` `socialSignIn` duplicate
  `apps/studio/src/components/home/sign-in-auth.ts` (`authPost`, `returnAddresses`,
  `socialSignIn`). The two `authPost` differ: the page's throws `AuthRefusal` with the library's
  code and status, the editor's throws a plain `Error` with the message only, so the editor's sign
  in window cannot pick a sentence by code; the page's applies `safeNext`, the editor's does not.
- Zip writers: `packages/store/src/zip.ts` (writer and reader over `node:zlib`),
  `apps/studio/src/server/export-sync.ts:364` `zipStored` (its comment says "the studio has no zip
  dependency", while the studio depends on `@turboslide/store`), and in `packages/export` two
  identical JSZip helpers, `batch/merge.ts:166` `zipStoredFiles` and `export-pptx.ts:139`
  `zipFiles`.
- `packages/identity/src/sha256.ts` and `packages/materials/src/sha256.ts` (identical bodies).
- `apps/studio/src/components/useMountEffect.ts` and `packages/chrome/src/lib/useMountEffect.ts`.
- `writeAtomic` three times: `packages/store/src/access-store.ts`, `blob-store.ts`,
  `blob-templates.ts`.
- Deck listing three times (CLEANUP-2); constant time comparison thirteen times (CLEANUP-1).
- Smaller pairs from the scan: `cachedRecords` (`server/actions.ts`, `server/lint-rendered.ts`),
  `materialBlocksOf` (`server/shader-frames.ts`, `export/src/scene/shaders.ts`), `blockFamilies`
  (`chrome/font-picker-model.ts`, `fonts/used.ts`), `formatBytes` (`cli/output.ts`,
  `chrome/ExportReportCard.tsx`), `logoUpstreamMode` (`server/flags.ts`, `server/logo-index.ts`),
  `requireSlug` three times in `server/{decks,sessions,templates}.ts`, `requireSlide` three times
  (`cli/store-actions.ts`, `agent/http/readers.ts`, `schema/reduce.ts`), `pressWithoutFocus` three
  times, `json` twice in the Worker. The full list of 33 is `dups.txt` in the scratch folder.
- About 90 `TURBOSLIDE_*` variable names are read across 142 files, each module with its own
  `*_VARIABLE` constant; there is no one typed environment module.

Fix: keep one of each: `sign-in-auth.ts` for every sign in call (the editor imports it); `store/zip.ts`
for every zip (export drops JSZip for writing if `writeZip` covers stored entries; JSZip stays only
where a PowerPoint file is read); `identity/sha256.ts`; `chrome/lib/useMountEffect.ts`; one
`writeAtomic` in `store`; one `requireSlug` in `schema/slug`. An environment module is a larger
change; question 10.

Pin: rerun the duplicate body scan (`dups.mjs`) as a scripts test with an allowlist that only
shrinks.

### CLEANUP-12 (1): scripts to archive, and the 385 scripts inside the evidence folder

Evidence:

- `scripts/` holds 102 files and 87,536 lines. Every script was matched against `package.json`,
  `check.mjs`, the guard, other scripts, tests and the top level documents (`scripts-refs.txt` in
  the scratch folder). Run by nothing and named only by `docs/NEXT.md` 5.4 as archive candidates:
  - `scripts/probes/sync-ordering-probe.mjs` (1,272 lines) and `scripts/probes/presence-drain.mjs`
    (153) with `presence-drain.test.mjs` (137): NEXT.md 5.4 item 1 archives them "once the `do`
    tier is production's"; `scripts/hosting/production.json` says `do`.
  - `scripts/blob-copy.mjs` (581) with its test (331) and `scripts/hosting-check.mjs` (456) with
    its test (199): archived "when question 24 closes the hosting move". `turboslide.vercel.app`
    still serves the whole app (a 307 to `/new` on 2026-10-08, and its `/new` names 29 assets of
    which five differ from `www.turboslide.com`'s, so it serves another build), so the move is not
    closed.
- Kept, with the reason: `gslides-parity-audit.mjs` (6,763 lines; check step 20, its output feeds
  `packages/theme/brand/facts.json` `parityRows`, which `/home` draws), `judge-loop.mjs` (named by
  `turboslide judge bundle`'s output and `docs/judge-loop.md`), `tooltip-audit.mjs` (AGENTS.md ship
  step), `logo-coverage.mjs` (manual tool with a test), `docker/chromium-test.mjs` and
  `packages/export/src/calibration/run.ts` (documented manual measurements).
- `docs/gslides-parity/` holds 385 `.mjs`, `.js`, `.sh` and `.py` files (123,470 lines), run by no
  gate; they leave with the folder (step D2).

Fix: move the two realtime probes now; the hosting move pair after question 8.

Pin: the scripts test of CLEANUP-3 extended: every file under `scripts/` is named by `package.json`,
`check.mjs`, another script, a test, or a line in `AGENTS.md`.

### CLEANUP-13 (1): `.vercelignore` describes a deploy path production no longer uses

Evidence: `.vercelignore:1-3` says the production deploy is a git push and the file only matters
for CLI previews. The guard deploys production by CLI (`gt-follow.sh` header and lines 536 to 548),
so the file decides production's upload. The upload set today is about 123 MB: `packages` 49.7,
`decks` 34.4, `apps` 17.3, `docs` outside the evidence folder 17.0, `scripts` 3.6, `skills` 0.6. No
build step reads `docs/`, `scripts/`, `skills/`, `docker/`, `crates/` or `hosting/`
(`vite.deploy.config.ts` reads `decks/` and `apps/studio/content/docs`).

Fix: rewrite the comment and leave out `docs`, `scripts`, `skills`, `docker`, `crates`, `hosting`
and the root Markdown files. The CLI uploads by content hash, so the saving per deploy is the
changed files only; the gain is a smaller, clearer upload set.

Pin: `scripts/check-vercel-output.mjs` passes after a `vercel deploy` of a preview with the new file.

### CLEANUP-14 (1): the public agent contracts cite repository documents

Evidence: `GET https://www.turboslide.com/openapi.json` (200, 2,430,266 bytes) names
`docs/freeform.md` 77 times, `docs/archive/rounds/PRODUCT.md` 21, `docs/pptx.md` 19 and four other
files, plus seven `SPEC-2` and `SPEC-3` section numbers. `packages/agent/generated/mcp-tools.json`
carries the same text to MCP clients. The text comes from the action descriptions in
`packages/schema/src/actions.ts` and `catalog.ts`.

Fix: point descriptions at `/docs` pages, or drop the citation from the description and keep it in
a source comment.

Pin: a test over `packages/agent/generated/*.json` that no string contains `docs/` or `SPEC-`.

### CLEANUP-15 (1): AGENTS.md is 83,415 bytes and every agent session loads it

Evidence: the sections "Contracts between builders that the scripts assume" (22,110 bytes) and
"Dev server rules" (20,778 bytes, with a 32 row table of builder ports) hold round specific
working rules. `README.md` is 74,518 bytes.

Fix: keep the stable rules (code rules, ports 4321 and the rule for picking one, the check chain);
move the builder contracts next to the scripts they describe and the port table into the active
round's spec.

Pin: a test that `AGENTS.md` stays under 30,000 bytes.

### CLEANUP-16 (1): two features have been parked behind Tools > Advanced tools since the focus round

Evidence: `docs/gslides-parity/focus/ship-4300058d.json` `parkedFeatures: ["inbox","templates"]`
plus 11 parked rows (14 controls in `packages/chrome/src/parked-controls.ts`). The templates
feature is about 3,600 lines (`packages/store/src/templates.ts` 1,438, `blob-templates.ts` 440,
`apps/studio/src/routes/decks.templates.tsx` 550 with its CSS 298, `server/templates.ts` 385,
`chrome/dialogs/SaveAsTemplate.tsx` 246, `cli/commands/template.ts` 138); the inbox about 1,550
(`store/inbox.ts` 328, `server/auth/digest.ts` 343, `routes/api/notify.$.ts` 139,
`cli/records/inbox.ts` 229, `chrome/inbox/*` 274, `dialogs/NotificationSettings.tsx` 104,
`cli/commands/notifications.ts` 132). Release notes from the product round to Round 1 repeat that
both stay parked.

Fix: Kevin's call (question 5). Code that ships behind the switch is still maintained, linted and
bundled.

Pin: none until the decision.

## 3. The docs folder

### 3.1 What a program reads

Program reads under `docs/gslides-parity/` (the keep list, 12 files, 2.6 MB):

| File                                                             | Read by                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/gslides-parity/README.md`                                  | `docs/readme/evidence-policy.test.mjs` asserts it exists; it states the policy                                                                                                                                               |
| `focus/core-matrix.json`                                         | `scripts/probes/core-matrix.mjs:143` (the gate, the drivers, `--emit-parked`), `scripts/probes/brand-spec-writes.test.mjs:17`, `docs/readme/what-works.mjs` (the README block), `focus/render-focus.mjs`, the guard line 140 |
| `focus/ship-4300058d.json`                                       | the guard's `parked_list()` (newest `ship-*.json` by commit time); `core-matrix.mjs --emit-parked` wrote `packages/chrome/src/parked-controls.ts` from it                                                                    |
| `focus/render-focus.mjs`, `focus/focus-body.md`, `focus/rows.md` | render `docs/FOCUS.md` (read by `docs/readme/what-works.test.mjs:33`) and the row table                                                                                                                                      |
| `focus/manual-checklist.md`, `focus/AMENDMENTS.md`               | named by a probe message (`core-walk/areas/text.mjs:1887`) and by product code comments (`viewer/src/Editor.tsx`, `render/src/block-css.ts`) as the rule of record                                                           |
| `features/build/logo-coverage-list.txt`                          | `scripts/probes/logo-coverage.mjs:183`                                                                                                                                                                                       |
| `verification-3/parity-audit.json`                               | written by check step 20; read by `scripts/build-brand.ts:1594` for `facts.json` `parityRows`                                                                                                                                |
| `verification-3/layout-shift.json`                               | written by check step 27                                                                                                                                                                                                     |
| `verification-4/perf-budget-production-ship-2026-09-14.json`     | `scripts/build-brand.ts:1568` picks the newest production run in the folder for `facts.json` `measured`                                                                                                                      |

Program reads in the rest of `docs/`: `docs/updates.md` (`apps/cli/src/commands/banner.test.ts:81`,
the brand lint's `TEXT_ROOTS`), `docs/grammar.md` (written by `pnpm generate:contracts`, checked by
step 3), `docs/brand.md` and `docs/readme/brand/*` (`packages/theme/src/brand.test.ts:592-616`),
`docs/README.md` (`docs/readme/docs-index.test.mjs`), `docs/FOCUS.md`, `docs/readme/*.mjs` and
their tests (vitest project `scripts`, check step 19), the README's pictures under `docs/readme/`
(every one is named by `README.md`).

The other 5,872 files under `docs/gslides-parity/` (291.4 MB) are read by no program. They are
cited by comments and prose as the record of a decision.

### 3.2 The steps

- D1. Keep the 12 files of 3.1 at their paths. The guard (Kevin's file outside the tree) reads two
  of them; moving those needs his edit of `gt-follow.sh` lines 140 and 283 (question 9).
- D2. Move the other 5,872 tracked files out of the tree in one docs only commit. The exact list is
  `git ls-files docs/gslides-parity | grep -vxF -f keep.txt` with `keep.txt` the 12 paths of 3.1
  (`move-gslides-parity.txt` in the scratch folder holds today's list). Where they go is question 1.
  Before the commit, copy them to the destination at the same paths and record the destination's
  commit; after it, `docs/gslides-parity/README.md` names that commit and this repository's last
  commit that held them (`0d3920a3` or the parent of the move).
- D3. In the same commit, change `docs/readme/evidence-policy.test.mjs`: its check that the closed
  folders `build-4`, `design-4`, `features`, `focus`, `objects`, `people`, `polish`, `product`,
  `return`, `sync`, `vector`, `verification`, `verification-2`, `verification-3`, `verification-4`
  each hold a `README.md` becomes a check that `docs/gslides-parity/README.md` names the archive
  commit; add the size bound of CLEANUP-5.
- D4. Leave the citations in code comments as they are (about a thousand lines name moved paths);
  the README of D2 says where a path that is no longer in the tree lives. Rewriting them is churn in
  722 or more files for no reader.
- Optional D5. `docs/archive/status/` holds 44 pictures (5.9 MB) under the same rule; move them with
  D2 if Kevin wants the archive text only.

Results of D2: the tree goes from 9,085 files and 417.3 MB to 3,213 files and 125.9 MB; a
`--depth 10` clone from about 192 MB to about 75 MB (the measured 51.4 MB of code and assets, 8.9
MB of other docs, the keep list and the trees); 17 worktrees free about 5 GB together; full
clones stay about 1.4 GB until a history rewrite (question 2: after a `git filter-repo
--path docs/gslides-parity --invert-paths`, keeping the 12 files, the history reachable from main
measures about 85 MB: 81.9 MB of other blobs, 0.7 MB for the 12 files' versions, 2.3 MB of trees
and commits). Vercel build and upload time do not change (CLEANUP-5, CLEANUP-13).

### 3.3 Named paths that do not exist today

Nine docs paths named outside `docs/` are missing: `docs/gslides-parity/focus/ship-` (a prefix in
`AGENTS.md`, `parked-controls.ts`, `hosting-check.mjs`), `docs/PRODUCT.md` and
`docs/gslides-parity/SPEC-3.md` (`firewall/rules.json`, `decks/templates/blank/template.json`),
`docs/readme/brand/lockup-` (a prefix in `build-brand.ts`), `docs/gslides-parity/verification-4/
parity-audit.json` (`build-brand.ts` tolerates its absence), `docs/FEATURES.md`
(`scripts/build-fonts.py`), `docs/gslides-parity/focus/ship-abc1234.json` (a test fixture name),
`docs/gslides-parity/realtime/build/guard.patch` (`scripts/hosting/README.md`),
`docs/gslides-parity/sync/audit-ordering/run` (`sync-ordering-probe.mjs`). The real ones to fix are
`firewall/rules.json`, `template.json`, `build-fonts.py` and `scripts/hosting/README.md`.

## 4. Committed build outputs and fixtures

Kept, with the reason:

- `packages/agent/generated/*` (5.5 MB at HEAD; 157 versions cost 1.0 MB packed because they
  delta well), `docs/grammar.md`, `skills/*/references`, `packages/schema/src/rules.json`,
  `packages/lint/fixtures/index.json`, `apps/studio/content/docs/reference/*.mdx`: generated and
  checked byte for byte by step 3; the routes serve some of them.
- `apps/studio/src/components/home/*.generated.*`, `packages/theme/src/colors.generated.ts`,
  `packages/native/wasm/*` (pinned by `BUILD-RECORD.json`): checked by step 29.
- `apps/studio/src/server/logo-index.snapshot.json` (3.5 MB): bundled with the function; its size
  is the performance lane's.
- `decks/gt-brand` (33.3 MB, 306 files; 209 of 210 assets are named by the deck's or the template's
  JSON, the one exception is `liquid-metal-diamond.recipe.json` at 1,098 bytes),
  `packages/fonts/assets` (17.2 MB, the font picker's faces), `apps/studio/public` (2.8 MB, every
  file named by code), `apps/studio/home-deck` (1.9 MB), `decks/fixture` (0.7 MB): product data
  and test fixtures in use.
- No tracked `dist`, `.output`, log, `.DS_Store`, `.tsbuildinfo` or session file. No credential
  shaped string in tracked files (the five bearer shaped strings in tests are fake values).

## 5. Lint and format configuration

- Prettier: step 19 runs `pnpm format:check`; `.prettierignore` leaves out the evidence folder,
  generated files and the wasm glue. No change needed beyond D2.
- ESLint: CLEANUP-4.
- TypeScript: `tsconfig.base.json` already sets `noUnusedLocals` and `noUnusedParameters`, so
  unused locals are caught; unused exports are not (CLEANUP-9's knip step covers them).
- knip: add `knip` to the catalog at 6.40.0 and commit the config of section 1 as `knip.json`, with
  `apps/realtime-worker`'s vitest plugin turned off (its config calls `readD1Migrations('./migrations')`
  relative to the working directory, which fails from the root).

## 6. Order of the cleanup and the checks that prove nothing used was removed

Order, so that each commit is small and the guard's docs only rule applies where it can:

1. D2 to D4 (docs only commit; the guard runs the smoke alone).
2. CLEANUP-9 and CLEANUP-10 (dead files, exports, dependencies, aliases) with `knip.json`.
3. CLEANUP-17 (the NUL bytes, first, so the later diffs of `digest.ts` are readable), CLEANUP-1
   (one `safeEqual`), CLEANUP-11 (one module per job), CLEANUP-2 (one listing).
4. CLEANUP-6, CLEANUP-7, CLEANUP-8 after Kevin's answers.
5. CLEANUP-12, CLEANUP-13, CLEANUP-14, CLEANUP-15.
6. CLEANUP-3 and CLEANUP-4 (the new gates), with the ESLint baseline rewritten last.

The dropdown round edits `packages/chrome`, `packages/viewer` and `apps/studio/src/routes`; steps 2
and 3 touch files there (`ToolbarTail.tsx`, `toolbar-tails.ts`, `DiagramPicker.tsx`,
`EditorRoot.tsx`), so they land after that round merges.

Checks after each step:

- `pnpm exec tsc -b` and `pnpm test` (every vitest project, the `scripts` project included).
- `npx knip@6.40.0 --config knip.json --no-progress` exits 0.
- `node scripts/check.mjs --only 3,19,29` (generated contracts, format and the README block,
  generated files including `build-brand.ts --check`, which reads the keep list's verification
  files).
- `NITRO_PRESET=vercel pnpm --filter @turboslide/studio build:deploy && node
scripts/check-vercel-output.mjs`.
- `node scripts/probes/core-matrix.mjs --emit-parked docs/gslides-parity/focus/ship-4300058d.json
--check` (the parked set still matches) and the guard's `parked_list()` logic run by hand against
  the tree (it must still print `docs/gslides-parity/focus/ship-4300058d.json`).
- `node scripts/probes/core-gate.mjs --base http://localhost:<port> --out <scratch>` on a local
  server, and `node scripts/hosted-smoke.mjs` on the preview (the guard does both per push).
- The missing path test of 3.3 and the size test of CLEANUP-5.
- For D2: `git ls-files | wc -l` at most 3,500; `git ls-tree -r -l HEAD` bytes at most 150 MB; a
  `git clone --depth 10` of the result measured.

## 7. Questions, each with the default the pipeline takes without an answer

1. Where the moved evidence goes: a separate private repository at the same paths (default); an
   orphan branch in this repository keeps every object in a full clone; a release archive keeps the
   files outside git but they are not searchable.
2. A history rewrite of `docs/gslides-parity` once D2 lands: default no (as in NEXT.md question 21);
   full clones stay about 1.4 GB.
3. Delete the Redis tier, the Upstash wiring and the Postgres accounts path (CLEANUP-6): default yes,
   in the same push as the security lane's Worker backed counter.
4. Passkeys (CLEANUP-8): default remove the dependencies and the plumbing.
5. Templates and the inbox (CLEANUP-16): default leave them parked and unchanged this round.
6. The napi addon (CLEANUP-7): default delete the six non Linux shells and `ci/native.yml` now; the
   Rust lane decides the Linux addon.
7. The five specs no gate runs (CLEANUP-3): default run them once, add the green ones to step 26,
   delete the ones a core spec already covers.
8. The hosting move tools and `turboslide.vercel.app` (NEXT.md question 24): default keep
   `blob-copy.mjs`, `hosting-check.mjs` and `HOSTING-MOVE.md` until Kevin answers; fix
   `blob-copy.mjs`'s import either way.
9. Moving `core-matrix.json` and the ship list out of `docs/` needs an edit of the guard: default
   keep them at their paths this round.
10. One typed environment module for the about 90 `TURBOSLIDE_*` names: default not this round;
    the safe comparison, zip and sign in modules come first.
