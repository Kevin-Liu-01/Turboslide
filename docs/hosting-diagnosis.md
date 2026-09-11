# Hosting diagnosis

Why https://studio-delta-six-40.vercel.app/ answers 500, measured on 2026-09-11 before the
hosting round's builders start, with the facts each builder needs. Kevin's directive, verbatim:
"https://studio-delta-six-40.vercel.app/ shows something went wrong; also instead of exporting to
google slides just make it perfect pptx." No product code was changed for this document. Every
command below ran from `apps/studio` unless the line says otherwise; secrets are named, never
printed.

## 1. The deployment as it stands

Facts from `vercel whoami`, `vercel teams ls`, `vercel projects ls --scope kl01s-projects`,
`vercel ls`, `vercel inspect`, and the REST API (`GET /v2/teams/<id>`, `GET /v9/projects/<id>`,
`GET /v13/deployments/<id>`, read with the CLI's own token):

| Fact                  | Value                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI                   | Vercel CLI 58.4.4 on Node 24.13.0, logged in as `kevin-liu-01`                                                                                                                                                    |
| Team                  | `kl01s-projects` ("KL01's projects"), `team_KpAxFhYN63bKUy7bj8bNoOkh`, plan `pro`                                                                                                                                 |
| Project               | `studio`, `prj_sWt52OAxiFaboav50hepmtl7Ct74`, Git link `Kevin-Liu-01/Turboslide`, production branch `main`, `rootDirectory: apps/studio`                                                                          |
| Framework             | the project record says `framework: "nitro"` (detected from the build output); `apps/studio/vercel.json` sets `framework: null`                                                                                   |
| Build                 | `vercel.json`: `NITRO_PRESET=vercel pnpm run build:deploy`, install `pnpm install --frozen-lockfile`; 27 s on the latest deployment                                                                               |
| Node                  | `nodeVersion: 24.x`; the function runtime is `nodejs24.x`                                                                                                                                                         |
| Region                | `serverlessFunctionRegion: iad1`, `functionDefaultRegions: ["iad1"]`; requests arrive through `sfo1` (`x-vercel-id: sfo1::iad1::...`)                                                                             |
| Compute               | Fluid compute on, `elasticConcurrencyEnabled: true`, default timeout 300 s, default memory type `standard` (2 GB, 1 vCPU)                                                                                         |
| Protection            | `ssoProtection.deploymentType: all_except_custom_domains`; the production alias answers `curl` without a session                                                                                                  |
| Environment variables | `vercel env ls`: "No Environment Variables found for kl01s-projects/studio"                                                                                                                                       |
| Latest deployment     | `dpl_4em11DN2zv2hbo5TcCFEkVoxEeAi`, created 2026-09-11 02:57:40 PDT, Ready, one function `λ __server (10.63MB) [iad1]`                                                                                            |
| Aliases               | `studio-delta-six-40.vercel.app`, `studio-kl01s-projects.vercel.app`, `studio-git-main-kl01s-projects.vercel.app`                                                                                                 |
| Deployment history    | six production deployments in 20 hours; the first (`studio-8mke44k24`) failed with "No Output Directory named "public" found" before `vercel.json` existed; the five since are Ready                              |
| Blob                  | `vercel blob list-stores`: "No blob stores connected to studio"; `--all` lists three team stores that belong to other projects (`agent-machines-blob` sfo1, `nextjs-ai-chatbot2-blob` iad1, `lumachor-blob` iad1) |
| Link                  | `vercel link --yes --project studio --scope kl01s-projects` wrote `apps/studio/.vercel/project.json` (`projectId`, `orgId`, `projectName`); `.vercel` is ignored by the root `.gitignore` line 13                 |

The link command also created `apps/studio/.gitignore` (`.vercel`, `.env*`) and
`apps/studio/.env.local` holding a `VERCEL_OIDC_TOKEN`. Both were removed: the root ignore file
already covers `.vercel`, and Vite loads `.env.local` into the dev server's environment, so a
token file there is a trap. `git status --short` shows only `?? .github/` afterwards. Expect
`vercel env pull` and a second `vercel link` to recreate `.env.local`.

## 2. What the production URL answers

`curl -s -o /dev/null -w "%{http_code} %{size_download}B"` against the production alias:

| Path                                      | Status | Body     | What answered                                                                                                                                                  |
| ----------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                       | 500    | 15,485 B | TanStack Start's default error component: "Something went wrong!" with a "Show Error" button; no error text in the HTML                                        |
| `/deck/gt-brand`                          | 404    | 15,663 B | the route's `DeckMissing` component ("No deck named", "Nothing under decks/")                                                                                  |
| `/edit/gt-brand`                          | 200    | 15,590 B | the `ssr: false` shell; the client then calls the same server functions and fails                                                                              |
| `/decks`                                  | 200    | 17,579 B | the deck list, empty                                                                                                                                           |
| `/api/agent`                              | 401    | 237 B    | the bearer rule (`packages/agent/src/http/auth`): no `TURBOSLIDE_TOKEN`, host not localhost                                                                    |
| `/api/actions/slide.update?deck=gt-brand` | 401    | 237 B    | the same rule                                                                                                                                                  |
| `/openapi.json`                           | 200    | 236 B    | the stub of `contracts.ts` ("Placeholder: packages/agent/generated/openapi.json has not been generated yet"), `paths: {}`; the committed file is 424,742 bytes |
| `/llms.txt`                               | 200    | 302 B    | the same stub for `llms.txt` (the committed file is 4,745 bytes): `readGenerated` finds nothing under `repoRoot()`                                             |
| `/decks/gt-brand/assets/x.png`            | 404    | 9 B      | the assets route, no folder                                                                                                                                    |

`vercel logs https://studio-delta-six-40.vercel.app --json` records every request above as
`"source":"serverless"` with the status code and `"logs":[]`: the function writes nothing to
stdout or stderr on the 500, so the runtime log carries no stack. The stack below comes from a
local run of the same Build Output API bundle (section 3).

## 3. The cause, reproduced

The deploy build was run once in a scratch copy of the repository (rsync without `node_modules`,
`.git`, `.turboslide`, `dist`, `crates/*/target` and `decks/gt-brand/assets`; `pnpm install
--frozen-lockfile --offline` in 4.1 s; `NITRO_PRESET=vercel node_modules/.bin/vite build -c
vite.deploy.config.ts` in `apps/studio`). The output matches the Vercel build log: Nitro
`3.0.260903-beta`, preset `vercel`, compatibility date `2026-09-06`, `.vercel/output/static`,
`.vercel/output/functions/__server.func`, `.vercel/output/config.json`.

`.vercel/output/config.json`:

```json
{
  "version": 3,
  "framework": { "name": "nitro", "version": "3.0.260903-beta" },
  "overrides": {},
  "routes": [
    {
      "headers": { "cache-control": "public, max-age=31536000, immutable" },
      "src": "/assets/(.*)"
    },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/__server" }
  ]
}
```

`.vercel/output/functions/__server.func/.vc-config.json`:

```json
{
  "handler": "index.mjs",
  "launcherType": "Nodejs",
  "shouldAddHelpers": false,
  "supportsResponseStreaming": true,
  "runtime": "nodejs24.x"
}
```

No `memory`, no `maxDuration`, no `regions`: the project defaults apply (300 s, 2 GB). The
function directory holds `index.mjs`, `_runtime.mjs`, `_chunks/`, `_libs/`, `_ssr/`, the manifest
chunk, and a traced `node_modules/` whose `package.json` lists exactly `sharp`, `@img/colour`,
`@img/sharp-darwin-arm64`, `@img/sharp-libvips-darwin-arm64` (the host platform's libvips; the
Vercel build traces the linux x64 pair instead), `detect-libc`, `fsevents`, `playwright-core` and
`semver`. 30 MB on this machine, 10.63 MB in the Vercel build. The bundle contains no `decks/`
folder, no `template.json`, no `packages/theme/assets/sprite.svg`, no `packages/agent/generated`
and no `@turboslide/cli` package (its code is bundled into the `_ssr` chunks; the package itself,
with `bin/turboslide.mjs`, is not there). Three chunks carry the literal `pnpm-workspace.yaml`:
`root-*.mjs` (`apps/studio/src/server/root.ts`), `paths-*.mjs`
(`apps/render-worker/src/paths.ts`) and `client-*.mjs`.

The function was copied to a directory with no `pnpm-workspace.yaml` in any ancestor (Vercel's
`/var/task` has none) and driven with `new Request('https://studio-delta-six-40.vercel.app/')`
through the entry's `default.fetch`, with `node:fs` traced and the `RangeError` constructor
wrapped. `GET /` answered 500 with the same 15.5 KB error page, no `console.error`, and this
sequence:

```
existsSync <func>/pnpm-workspace.yaml            (repoRoot: eight ancestors, none found)
existsSync <scratchpad>/pnpm-workspace.yaml ... existsSync /pnpm-workspace.yaml
existsSync <func>/decks                            (listDeckHeads: missing, returns [])
existsSync <func>/pnpm-workspace.yaml ... (repoRoot again, for createDeck)
existsSync <func>/decks/gt-brand-deck              (createDeck: the new deck's folder)
existsSync <func>/decks/templates/gt-brand/template.json
RangeError thrown: No template.json in <func>/decks/templates/gt-brand
    at readTemplate (_ssr/slide-CAHxRYu1.mjs:70:31)        packages/store/src/templates.ts readTemplate
    at createDeck (_ssr/slide-CAHxRYu1.mjs:146:20)         packages/store/src/templates.ts createDeck
    at Object.serverFn (_ssr/decks-rjliILAB.mjs:139:69)    apps/studio/src/server/decks.ts createDeckFn
    at server (_ssr/ssr.mjs:4601:44)                       @tanstack/react-start server function handler
    at callNextMiddleware (_ssr/ssr.mjs:4529:26)
```

So the chain is: `apps/studio/src/server/root.ts` `repoRoot()` walks up from `process.cwd()`
(`/var/task` in the function) looking for `pnpm-workspace.yaml`, finds none in eight levels and
returns `process.cwd()`; `listDecks()` (`decks.ts:153`) calls `listDeckHeads(join(cwd, 'decks'))`,
which returns `[]` because the folder does not exist (`templates.ts:313`); the root route's
`beforeLoad` (`routes/index.tsx`) therefore calls `createNewDeck({ name: 'GT brand deck', from:
'gt-brand' })`; `createDeck` reads `decks/templates/gt-brand/template.json` under the same missing
folder and throws `RangeError: No template.json in /var/task/decks/templates/gt-brand`
(`templates.ts:157`); the router renders its default error component with status 500. The
read-only filesystem is not reached: the RangeError precedes every write. Had the template been
present, `cpSync` of the 30 MB assets folder into `/var/task/decks/<id>/assets` would have failed
with `EROFS` instead (only `/tmp` is writable in a Vercel function).

`GET /deck/gt-brand` follows the same walk, probes `<func>/decks/gt-brand/deck.json`, falls back to
the `fixture` deck (`decks.ts` `FALLBACK_DECK`), misses again, `getDeck` returns null and the
loader throws `notFound()`: the 404. `GET /decks` lists nothing and renders. `GET /edit/gt-brand`
is `ssr: false`, so the shell is 200 and the client fails on the same server functions.
`/openapi.json` and `/llms.txt` read `join(repoRoot(), 'packages', 'agent', 'generated', name)`
(`contracts.ts:19`) and serve a short body instead of the committed files.

Every place the studio reaches the filesystem through `repoRoot()` or `deckDir()`, counted with
`grep -rn -E 'deckDir\(|repoRoot\(|readFileSync|createReadStream|writeFileSync|mkdirSync|readdirSync|existsSync|statSync|readFile\(|writeFile\(|rmSync|cpSync' apps/studio/src`
(test files excluded): `server/actions.ts` 17, `server/decks.ts` 12 (decks, the theme sprite),
`server/thumbs.ts` 11 (`.turboslide/thumbs/<deck>/<revision>`), `server/write.ts` 7,
`server/download.ts` 7, `server/lint.ts` 6, `server/root.ts` 5, `routes/api/assets.$token.ts` 5
(the Slides image host over `.turboslide/gslides-assets`), `routes/decks.$deckId.assets.$.ts` 4
(the asset twins), `server/tokens.ts` 3 (`buildsDir`), `server/render.ts` 3, `server/contracts.ts`
3, `routes/api/download.$token.ts` 2, `server/agent-actions.ts` 1, `routes/api/actions.$action.ts`

1. The store itself (`packages/store/src/file-store.ts`, `versions.ts`, `lease.ts`, `watch.ts`,
   `templates.ts`) is file based behind the `DeckStore` type (`store.ts:83`, read, revision, write,
   saveVersion, listVersions, records, documentAt, documentAtRevision, lease, release, leases,
   watch), which SPEC 11 Hosting names as the seam for a `SqliteStore` and Postgres.

## 4. Renders and exports inside the function

Two more facts stop every render and export in the function even after the store is fixed:

- The render worker's local mode (`apps/render-worker/src/client.ts`, used whenever
  `TURBOSLIDE_WORKER_URL` is unset) runs each job as a child process: `turboslideBin()` in
  `apps/render-worker/src/cli.ts` resolves `import.meta.resolve('@turboslide/cli/package.json')`
  and spawns `process.execPath bin/turboslide.mjs`. The traced `node_modules` has no
  `@turboslide/cli`, so `export.run`, `render` and `lint --chrome` from the studio fail before a
  browser is asked for. `download.ts` also reports `downloads: true` only for the local worker.
- `packages/headless/src/launch.ts` `resolveExecutable()` returns `TURBOSLIDE_CHROME`, then the
  `chromium-1217` macOS path, then `chromium.executablePath()` from `playwright-core` 1.62.1
  (`browsers.json`: revision 1234, Chrome for Testing 151.0.7922.34). None exists in the
  function. LibreOffice (`TURBOSLIDE_SOFFICE`) and poppler (`TURBOSLIDE_PDFTOPPM`,
  `TURBOSLIDE_PDFTOCAIRO`) for the verify loop (SPEC 8.5) exist only in the
  `turboslide-render-worker` image.

Vercel Function limits read on 2026-09-11 (https://vercel.com/docs/functions/limitations, updated
2026-08-24; https://vercel.com/docs/functions/configuring-functions/duration):

| Limit                     | Value                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle, uncompressed      | 250 MB (500 MB Python); "large functions" up to 5 GB in beta, needs Fluid compute with Active CPU, opt in with `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` for existing projects |
| Memory                    | default 2 GB / 1 vCPU; Pro maximum 4 GB / 2 vCPU                                                                                                                        |
| Duration                  | default 300 s; Pro maximum 800 s (GA); 1800 s in beta, per function, `nodejs24.x` supported                                                                             |
| Request and response body | 4.5 MB, else 413 `FUNCTION_PAYLOAD_TOO_LARGE`                                                                                                                           |
| File descriptors          | 1,024 shared across concurrent executions                                                                                                                               |
| Architecture              | `.vc-config.json` `architecture` is `x86_64` by default, `arm64` allowed (Build Output API primitives page)                                                             |
| Writable filesystem       | `/tmp` only; the limits page does not state its size                                                                                                                    |

The 4.5 MB body cap matters twice: the native PPTX files measured in `docs/M4-M5-STATUS.md` are
28.05 MB and 29.21 MB, so an export cannot return through the function response and must land in
storage with a download URL; and the agent surface's 25 MB asset upload cap (`AGENTS.md`) cannot
be honored through a function body.

Container images: Vercel runs OCI images as functions (https://vercel.com/docs/functions/container-images,
updated 2026-07-07): a `Dockerfile.vercel` at the project root, or `vercel.json` `services` with
`root` and `entrypoint` plus `rewrites` to `{ "service": "<name>" }`; the container serves HTTP
on port 80 or `PORT`; instances scale to zero after 5 minutes without traffic in production (30 s
in preview) with a 30 s `SIGTERM` grace; "the same limits and Active CPU pricing model of Vercel
Functions apply"; Secure Compute and Static IPs unsupported. The render worker image
(`docker/render-worker.Dockerfile`) is 1.29 GB and `arm64` on this machine (`docker image inspect
turboslide-render-worker`: `arm64 linux`, `761bfc93680e`, built from the M4 and M5 tree), so it
would need an x86_64 build and a size well under the function bundle limit before it could be a
service; the page does not state a separate image size limit, so this path is unverified.

## 5. Serverless Chromium

`npm view @sparticuz/chromium versions --json | tail`: ..., `143.0.4`, `147.0.0`, `147.0.1`,
`147.0.2`, `148.0.0`, `149.0.0`, `152.0.0` (latest, released 2026-09-08). The package version is
`MajorChromiumVersion.MinorChromiumIncrement.PatchLevel` and the README says breaking changes may
land at the patch level. The match for the spec's Chromium 147 line is `147.0.2`, published
2026-04-20 (`147.0.0` on 2026-04-10, "Chromium 147" in PR 488):

- `npm view @sparticuz/chromium@147.0.2`: `dist.unpackedSize` 68,409,349 bytes, `engines.node
  > =22.17.0`, dependency `tar-fs ^3.1.2`. The package ships Linux x64 only; arm64 exists from
Chromium 135 as release assets (`chromium-v147.0.2-pack.arm64.tar`, 66,826,240 bytes;
`chromium-v147.0.2-layer.arm64.zip`) for `@sparticuz/chromium-min`(52,889 bytes unpacked) with`chromium.executablePath('<https URL of the pack tar>')`. The x64 pack is 68,362,240 bytes.
Vercel functions are `x86_64` by default, which is the npm package's platform.
- At runtime the package inflates Brotli files into `/tmp` (about 130 MB extracted per the
  README; `swiftshader.tar.br` extracts to `/tmp` as well); the README recommends 1600 MB or more
  of memory.
- The binary is `chrome-headless-shell`, not the full Chrome for Testing: `source/index.ts` at
  `v147.0.2` passes `--headless='shell'` ("We only support running chrome-headless-shell") and the
  README section "What is chrome-headless-shell?" says the package is built on `headless_shell`.
  SPEC 5.3 and `AGENTS.md` "Chromium" require the full binary and never the headless shell, so a
  serverless render is a recorded deviation, and the renderer string in every `RenderRecord` must
  say so. The exact `147.0.x.y` build behind the package is not stated in the release notes or the
  `Makefile`; the render worker image renders with Chrome for Testing 147.0.7727.0 and this
  machine with 147.0.7727.15, so `compare-to-shoot` stays a local and container gate.
- `chromium.args` at `v147.0.2` adds, among others, `--single-process`, `--no-zygote`,
  `--no-sandbox`, `--disable-setuid-sandbox`, `--in-process-gpu`, `--ignore-gpu-blocklist`,
  `--font-render-hinting=none`, `--disable-web-security`, and in graphics mode (the default)
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, which are exactly
  Turboslide's Linux flags (`LAUNCH_ARGS.swiftshader`). `chromium.setGraphicsMode = false` disables
  WebGL, which the materials and two-tone pipelines need, so it stays on. `executablePath()` is
  async; `resolveExecutable()` is sync today.
- Playwright usage from the README: `chromium.launch({ args: chromium.args, executablePath: await
chromium.executablePath(), headless: true })` with `playwright-core`.

## 6. Nitro's vercel preset

Read from the installed package, `node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/`:
`docs/1.deploy/2.providers/21.vercel.md`, `docs/0.docs/7.assets.md`, `docs/2.config/0.index/index.md`
and the preset code in `_presets.mjs` (lines 1401 to 1417, 1597 to 1612, 1763 to 1778).

- Output: `output.dir` is `{{ rootDir }}/.vercel/output`, `serverDir` is
  `functions/__server.func`, `publicDir` is `static/{{ baseURL }}`; the entry is
  `vercel/runtime/vercel.{format}` with `format` `web` by default (`vercel.entryFormat`; `node`
  when a handler needs Node request objects).
- Function config: `generateFunctionFiles` writes `.vc-config.json` as `{ handler: 'index.mjs',
launcherType: 'Nodejs', shouldAddHelpers: false, supportsResponseStreaming: true,
...(sourcemap ? { shouldAddSourcemapSupport: true } : {}), ...nitro.options.vercel?.functions }`.
  So `maxDuration`, `memory`, `regions`, `architecture` and `runtime` are set through
  `vercel.functions` in the Nitro config (`nitro({ vercel: { functions: { maxDuration: 800, memory:
4096 } } })` in `vite.deploy.config.ts`; the docs page shows `vercel: { functions: { runtime:
'bun1.x' } }` and the Vercel duration page shows `vercel: { functions: { maxDuration: 5 } }`).
- Per route: `vercel.functionRules` maps a rou3 route pattern to a partial function config merged
  over the base (`{ '/api/heavy-computation': { maxDuration: 800, memory: 4096 } }` in the docs;
  arrays such as `regions` replace rather than merge). For each pattern Nitro creates
  `<pattern>.func` beside `__server.func` with the merged `.vc-config.json`
  (`createFunctionDirWithCustomConfig`) and adds a route for it in `config.json`. TanStack Start
  server functions post to `/_serverFn/<id>` in this build (`ssr.mjs`), so a rule for the export
  path must name `/_serverFn/**` as well as `/api/export/**`.
- Runtime: `resolveVercelRuntime` uses `vercel.functions.runtime` when set, else `bun1.x` when
  `vercel.json` has `bunVersion`, else `nodejs<major>.x` from the build machine's Node (24 here).
- Build output config: `vercel.config` is merged (`defu`) into the generated `config.json`
  (`version: 3`, the framework block, the `/assets/(.*)` immutable header, `handle: filesystem`,
  the catch-all to `/__server`); `bypassToken` for ISR lives there.
- Server assets: `serverAssets: [{ baseName, dir, pattern, ignore }]` bundles a directory into the
  server and exposes it through `useStorage('assets:<baseName>')` from `nitro/storage`; in
  production the files become lazy imports with precomputed MIME type, ETag and mtime, and the
  docs warn about size because they travel inside the function bundle. Files under
  `assets/` (relative to `serverDir`, else the root) are included by default, and "if your code
  never uses `useStorage()`, server assets won't be included in the server bundle". Files can also
  be inlined with `import x from './file.json' with { type: 'bytes' | 'text' }` or `raw:`.
- Public assets: `publicAssets` directories are served by Vercel's CDN from `static/`, one year
  cache by default for non-root bases, `404` with `no-store` for a miss under a non-fallthrough
  base.
- Other keys: `vercel.regions` (edge only), `vercel.skewProtection`, `vercel.cronHandlerRoute`,
  `vercel.queues.triggers`, `vercel.immutableStaticFiles` (nightly only).

## 7. Vercel Blob

Read from https://vercel.com/docs/vercel-blob/usage-and-pricing (updated 2026-08-11) and the CLI:

- The CLI 58.4.4 has `vercel blob create-store [name] --access public|private [--region iad1]
[--environment production,preview,development] --yes`, `list-stores`, `get-store`,
  `delete-store`, `empty-store`, `put`, `get`, `del`, `copy`, `list`, `signed-token`, `presign`.
  Nothing was created; that is the hosting store builder's or the integrator's decision.
- Limits: Pro allows 500 stores; a blob may be 5 TB; blobs over 512 MB are never cached; Pro rate
  limits 7,200 simple and 4,500 advanced operations per minute; `put`, `copy` and `list` are
  advanced operations, URL reads on a cache miss and `head` are simple, `del` is free.
- Pricing (the page's example): storage $0.023 per GB-month over 5 GB included, $0.40 per million
  simple operations over 100K, $5.00 per million advanced over 10K, data transfer $0.05 per GB
  over 100 GB in `iad1`.
- Private stores are read through a function (Blob Data Transfer plus Fast Origin Transfer);
  public stores are read straight from the store URL, which is what asset twins and export files
  want.

## 8. Other measured facts

- `pnpm-workspace.yaml` catalog: `@tanstack/react-start` 1.168.50, `@tanstack/react-router`
  1.170.33, `nitro` 3.0.260903-beta, `playwright-core` 1.62.1, `sharp` 0.35.0, `googleapis`
  178.1.1; `allowBuilds` lists `sharp`.
- Decks: `decks/gt-brand` 31 MB of which `assets/` is 30 MB (revision 24, 85 slides, 115 assets);
  `decks/templates/gt-brand` 500 KB with `template.json` naming `assets: "../../gt-brand/assets"`;
  `decks/fixture` is the viewer fallback.
- Environment variables the code reads (`grep -rhoE "TURBOSLIDE_[A-Z0-9_]+"` over the studio, the
  worker, headless, export, cli, agent and materials sources): `TURBOSLIDE_TOKEN`,
  `TURBOSLIDE_ASSET_BASE_URL`, `TURBOSLIDE_DECK`, `TURBOSLIDE_GCS_BUCKET`, `TURBOSLIDE_WORKER_URL`,
  `TURBOSLIDE_DECKS_DIR`, `TURBOSLIDE_CHROME`, `TURBOSLIDE_BIN`, `TURBOSLIDE_GOOGLE_CREDENTIALS`,
  `TURBOSLIDE_ROOT`, `TURBOSLIDE_WORKER_TOKEN`, `TURBOSLIDE_PYTHON`, `TURBOSLIDE_GPU`,
  `TURBOSLIDE_WORKER_DIR`, `TURBOSLIDE_SOFFICE`, `TURBOSLIDE_GCS_CREDENTIALS`, `TURBOSLIDE_AUTHOR`,
  `TURBOSLIDE_PDFTOCAIRO`, `TURBOSLIDE_DOWNLOAD_SECRET`, `TURBOSLIDE_AGENT_LOG`,
  `TURBOSLIDE_WORKER_PORT`, `TURBOSLIDE_WORKER_HOST`, `TURBOSLIDE_PDFTOPPM`, `TURBOSLIDE_PDFINFO`,
  `TURBOSLIDE_GCS_PREFIX`, `TURBOSLIDE_PAPER_DIST` and the test-only `TURBOSLIDE_SKIP_BROWSER`,
  `TURBOSLIDE_SKIP_BROWSER_TESTS`, `TURBOSLIDE_TEST_TTF_DIR`, `TURBOSLIDE_FONTS_CHECK`,
  `TURBOSLIDE_KEEP_EXPORT_TEST`. None is set on the project.
- The Google Slides surface, for removal: `grep -rl gslides` outside `node_modules`,
  `.turboslide`, `dist` and `.git` finds 32 files: `packages/export/src/gslides/` (auth, build,
  calibration, client, ids, images, notes, pace, requests, schema, thumbs, units, the fixtures and
  five test files), `packages/export/src/calibration/slides.json` and `calibration.json`,
  `packages/export/package.json` (`googleapis`), `packages/schema/src/actions.ts` and `export.ts`
  (the `export.run` format enum), `apps/cli/src/commands/export.ts` and `mcp.ts`,
  `apps/render-worker/src/jobs/export.ts`, `apps/studio/src/routes/api/assets.$token.ts` (the
  Slides image host), `apps/studio/src/routes/api/export.$deckId.ts`, `apps/studio/src/routes/edit.$deckId.tsx`,
  `apps/studio/src/server/download.ts`, `apps/studio/e2e/landing.spec.ts`,
  `packages/chrome/src/ExportMenu.tsx`, `ExportReportCard.tsx`, `SetupCard.tsx`,
  `packages/agent/generated/mcp-tools.json` and `openapi.json` (regenerated by
  `pnpm generate:contracts`), `docs/google-slides.md`, `docs/M2-STATUS.md`, `docs/M4-M5-STATUS.md`,
  `docs/spec/SPEC.md`, `docs/spec/MILESTONES.md`, `AGENTS.md`, `README.md`.
- PPTX tooling on this machine: `python-pptx 1.0.2` on Python 3.14.6 in `.turboslide/venv`
  (`fonttools` and `pyftfeatfreeze` beside it); no `soffice` or `libreoffice` on the host; the
  `turboslide-render-worker:latest` image (`761bfc93680e`, LibreOffice 25.2.3.2, pdftocairo
  25.03.0, Chrome for Testing 147.0.7727.0 on SwiftShader) is the only verify environment; the
  native gate last passed there on 170 pages with 624 gated blocks (`docs/M4-M5-STATUS.md`).

## 9. Recommended fixes per builder

Hosting store.

1. Replace the `repoRoot()` file tree as the deck store behind the `DeckStore` seam: deck
   documents (`deck.json`, `slides/*.json`, `versions/`, leases) and the asset twins in a Vercel
   Blob store created with `vercel blob create-store turboslide --access public --region iad1
--yes` (connected to production, preview and development, which sets
   `BLOB_READ_WRITE_TOKEN`), with the asset twins content addressed so `deck.create` from the GT
   template copies references, not the 30 MB (or blob `copy()`, 230 advanced operations per
   deck). Keep `FileStore` for the CLI and the container; select the store from the environment
   (`VERCEL` or `TURBOSLIDE_STORE=blob`).
2. Ship the template record without the repository: the 500 KB `decks/templates/gt-brand` as Nitro
   `serverAssets` (or inlined JSON imports) and its assets seeded once into the store by a script
   the integrator runs (`vercel blob put` or the SDK with the store's token); the theme sprite and
   `packages/agent/generated/*` as bundled imports so `decks.ts`, `write.ts` and `contracts.ts`
   stop reading `repoRoot()`.
3. Point every remaining write at `/tmp` (`thumbs.ts`, `tokens.ts` `buildsDir`, `actions.ts`
   `.turboslide/http/*`) or at the store; serve `/decks/$deckId/assets/$` by redirecting to the
   blob URL; replace the fs watch channel (`watch.ts`) with revision polling against the store.
4. Set `TURBOSLIDE_TOKEN` (and `TURBOSLIDE_DOWNLOAD_SECRET`) on the project so the agent surface
   answers off localhost (SPEC 11), and add `nitro({ vercel: { functions: { maxDuration: 300 } } })`
   as the base with `functionRules` for the export paths (section 6).

Serverless Chromium and sync export.

1. Add `@sparticuz/chromium` `147.0.2` to the catalog and to `packages/headless` (x64 only; the
   function is `x86_64`); make `resolveExecutable` async and, when `TURBOSLIDE_CHROME` is unset and
   `process.platform === 'linux'` with no Playwright browser on disk, use `await
chromium.executablePath()` with `chromium.args` merged into `LAUNCH_ARGS.swiftshader`; record
   `chrome-headless-shell` in the renderer string and the deviation from SPEC 5.3 in `AGENTS.md`.
2. Run export in process: the worker's local mode must stop spawning `bin/turboslide.mjs` when
   `TURBOSLIDE_BIN` is unavailable and call the export module directly (SPEC 3.3 item 7 says the
   browser never runs inside the web app; hosting on one function makes this a recorded
   deviation, or the worker becomes a container service, section 4).
3. Budget: `functionRules` for `/api/export/**` and `/_serverFn/**` at `maxDuration: 800` and
   `memory: 4096` (Pro maximum; the README wants 1600 MB for Chromium alone); write the produced
   PPTX to the Blob store and return its URL because a 28 MB file cannot pass the 4.5 MB response
   cap; skip `verify` in the function and say so in the report (`residual`), since LibreOffice
   and poppler exist only in the container.
4. Check that the export page under headless shell can load the GT Inter faces and the twins from
   the deployment URL (the render worker renders from the deck folder today).

PPTX.

1. Remove the Google Slides exporter along the 32 files above: `gslides` out of the `export.run`
   format enum (`packages/schema/src/actions.ts`, `export.ts`), the CLI and MCP commands, the
   worker job, the Export menu entries (`ExportMenu.tsx`, `SetupCard.tsx`, `ExportReportCard.tsx`),
   `api/assets.$token.ts`, `packages/export/src/gslides/` and `calibration/slides.json`,
   `googleapis` from the catalog and `packages/export/package.json`, `docs/google-slides.md`; then
   `pnpm generate:contracts` and the coverage and skills tests; `landing.spec.ts` drops the setup
   card and Dry run cases; `AGENTS.md`, `README.md` and the M4 and M5 status lines that name it.
2. "Perfect PPTX" means the native mode keeps its measured gate (every one of the 624 blocks within
   budget in the container) while closing the recorded residuals: the GT run as a paper colored
   text under the mark, DejaVu Sans Mono for code panels (Menlo on a Mac without it), the `say`
   block as a raster, and the unverified PowerPoint items (EOT acceptance, the first-baseline
   constant, `custGeom` counters, `docs/export-verification.md`). `python-pptx` in the venv is
   available for structural assertions on the package; pixel verification stays in the
   `turboslide-render-worker` image and CI.
3. Default the Export menu to PPTX native, both themes, verify off when the worker has no
   LibreOffice, and make the report card say which checks ran.
