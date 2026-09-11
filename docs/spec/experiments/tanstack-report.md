# TanStack Start experiment for Turboslide

Written 2026-09-10. Throwaway app at `turboslide-tanstack/` in this directory. Everything below was run on this machine (macOS, Node v24.13.0, pnpm 11.15.1 through corepack, Google Chrome via Prototemplate's `playwright-core` 1.62.1). Claims taken from documentation carry a URL; claims without a URL were measured here.

## 1. Verdict in one paragraph

TanStack Start works for Turboslide's shape: a large client-only canvas route (`ssr: false`), server functions that never reach the client bundle (verified with a marker string and a `node:os` import), server routes for the render and agent API, a Vite-bundled module worker that runs WebGL2 on an `OffscreenCanvas` (verified in the browser pane and in headless Chrome with two GPU backends), and one Nitro-driven build that produced a Node server, a Vercel Build Output API directory and a Bun bundle from the same source. Build time is under two seconds and the dev server is ready in about 0.4 s. Two things argue for care: the default scaffold ships dev-only devtools that break SSR the moment their Vite plugin is dropped from a config, and the combination of Vite 8 console forwarding with TanStack devtools console piping produced a self-feeding log loop that wrote a 10.7 GB log in eleven minutes. Both are configuration, not architecture. The recommendation is to adopt TanStack Start for `apps/studio`, keep every deck package framework-free so the CLI and the exporter share them without Vite, and run headless Chromium and LibreOffice in a separate Node worker rather than in the web app's function.

## 2. Commands that were run

The official create command from the quick start is `npx @tanstack/cli@latest create` (https://tanstack.com/start/latest/docs/framework/react/quick-start). Its non-interactive flags come from `create --help` of `@tanstack/cli` 0.71.0 (https://www.npmjs.com/package/@tanstack/cli). The exact invocation used here, with pnpm:

```
pnpm dlx @tanstack/cli@latest create turboslide-tanstack \
  --framework React --package-manager pnpm --toolchain eslint \
  --no-examples --no-git --no-intent --non-interactive
```

`--framework React` selects React, TypeScript is always on (`.cta.json` records `"typescript": true`), and file-based routing is the default mode (`"mode": "file-router"`; `--router-only` would drop Start and keep only the router). Other flags worth knowing: `--blank` (one route, no Tailwind, no devtools), `--deployment <cloudflare|netlify|nitro|railway|render|vercel>`, `--add-ons`, `--template <url-or-id>`, `--target-dir`, `--json`. The interactive `TanStack Builder` is the documented alternative (same quick-start page).

The first install failed. pnpm 11 blocks dependency build scripts it has not reviewed and exits non-zero (`strictDepBuilds` defaults to true; https://pnpm.io/settings/build). The CLI wrote `pnpm-workspace.yaml` with `allowBuilds: { esbuild: true, lightningcss: true, unrs-resolver: "set this to true or false" }` and stopped at `ERR_PNPM_IGNORED_BUILDS: unrs-resolver@1.12.2`. The scaffold's `package.json` also carries a `pnpm.onlyBuiltDependencies` block that pnpm 11 ignores with a warning on every command; the docs say `onlyBuiltDependencies`, `neverBuiltDependencies`, `ignoredBuiltDependencies` and `ignoreDepScripts` were removed in v11 and replaced by `allowBuilds` (same URL). Fix applied: set `unrs-resolver: true` in `pnpm-workspace.yaml`, then `pnpm install` (0.7 s from the store) and `pnpm generate-routes`. The pristine file is kept as `pnpm-workspace.yaml.scaffold`.

Then, in order: `pnpm exec tsc --noEmit -p tsconfig.json`, `pnpm exec vite build`, `pnpm add -D nitro srvx`, three `vite build -c vite.nitro.config.ts` runs (default, `NITRO_PRESET=vercel`, `NITRO_PRESET=bun`), `PORT=4322 node .output/server/index.mjs`, `pnpm exec vite dev --port 4321`, a browser-pane check of `/canvas`, and `node headless-canvas.mjs metal|swiftshader` against the dev server. Both servers were stopped afterwards; nothing is listening on 4321 or 4322.

## 3. Versions installed

The scaffold pins every `@tanstack/*` package to the `latest` dist-tag, not a range. Resolved on 2026-09-10:

| Package                            | Version                                                                | Note                                       |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| `@tanstack/cli`                    | 0.71.0                                                                 | run through `pnpm dlx`                     |
| `@tanstack/react-start`            | 1.168.50                                                               |                                            |
| `@tanstack/react-router`           | 1.170.33                                                               |                                            |
| `@tanstack/router-core`            | 1.171.28                                                               | transitive                                 |
| `@tanstack/start-server-core`      | 1.169.32                                                               | transitive                                 |
| `@tanstack/start-client-core`      | 1.170.28                                                               | transitive                                 |
| `@tanstack/start-plugin-core`      | 1.171.40                                                               | transitive; the Vite plugin                |
| `@tanstack/router-plugin`          | 19.3.0                                                                 | transitive; note the separate major line   |
| `@tanstack/router-generator`       | 1.167.34                                                               | transitive; owns `tsr.config.json`         |
| `@tanstack/router-cli`             | 1.167.34                                                               | devDependency; `tsr generate`              |
| `@tanstack/react-devtools`         | 0.10.12                                                                | Solid-based, dev only                      |
| `@tanstack/devtools-vite`          | 0.8.5                                                                  | strips devtools from builds, pipes console |
| `@tanstack/react-router-devtools`  | 1.167.1                                                                |                                            |
| `@tanstack/eslint-config`          | 0.4.0                                                                  |                                            |
| `vite`                             | 8.2.2                                                                  | Rolldown bundler                           |
| `rolldown`                         | 1.2.8                                                                  | transitive                                 |
| `@vitejs/plugin-react`             | 6.x per package.json (resolved dir shows 2.7.0 hash; not load-bearing) |                                            |
| `react`, `react-dom`               | 19.3.0                                                                 |                                            |
| `typescript`                       | 6.0.3                                                                  | the last JavaScript-based compiler line    |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.3                                                                  | scaffold default                           |
| `eslint`                           | 9.39.5                                                                 |                                            |
| `prettier`                         | 3.9.6                                                                  |                                            |
| `@types/node`                      | 22.20.2                                                                | stale against Node 24; harmless here       |
| `h3`                               | 2.0.1-rc.20                                                            | transitive server toolkit                  |
| `srvx`                             | 0.11.22 transitive; 1.0.4 added                                        | universal server adapter                   |
| `nitro`                            | 3.0.260903-beta                                                        | added for deployment builds                |
| `seroval`                          | 1.5.6 and 1.6.7                                                        | server function serialization              |

`node_modules` is 184 MB with 294 store entries after the base install.

Vite 8 shipped 2026-03-12 with Rolldown as its single Rust bundler and requires Node 20.19+ or 22.12+ (https://vite.dev/blog/announcing-vite8). TypeScript 6.0 is the final JavaScript-based release before the Go-native 7.0; it deprecates `baseUrl` as a lookup root and `moduleResolution: node10`, both still usable behind `ignoreDeprecations: "6.0"` (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html, https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/). The scaffold's tsconfig already uses `moduleResolution: bundler` and `paths` without `baseUrl`, so it is clean for 7.0.

## 4. File layout

As generated (before the experiment files):

```
turboslide-tanstack/
  .cta.json                 scaffold choices (framework, mode, add-ons)
  .gitignore  .prettierignore  .vscode/settings.json
  README.md
  eslint.config.js  prettier.config.js
  package.json              scripts: dev, generate-routes, build, preview, lint, format, check
  pnpm-lock.yaml  pnpm-workspace.yaml (allowBuilds only)
  tsconfig.json             strict, bundler resolution, paths "#/*" and "@/*" -> ./src/*
  tsr.config.json           { "target": "react" }
  vite.config.ts            plugins: devtools(), tailwindcss(), tanstackStart(), viteReact()
  src/
    router.tsx              getRouter(): createRouter({ routeTree, scrollRestoration, defaultPreload: 'intent' })
    routeTree.gen.ts        generated; must exist before tsc runs
    routes/__root.tsx       createRootRoute({ head, shellComponent: RootDocument })
    routes/index.tsx        createFileRoute('/')
    styles.css
```

There is no `src/server.ts`, `src/client.tsx` or `src/start.ts`; the plugin supplies default entries. The server entry contract is a module whose default export is `createServerEntry({ fetch(request) })`, the universal fetch handler shape used by Cloudflare Workers and other WinterCG runtimes, and a custom `src/server.ts` can wrap `createStartHandler(defaultStreamHandler)` (https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point). The built `dist/server/server.js` ends with exactly that: `var server_default = createServerEntry({ fetch: fetch$1 })`.

Plugin options of note, read from the installed schemas: `tanstackStart({ srcDirectory: 'src', router: {...}, serverFns: {...}, spa: {...}, prerender: {...}, pages: [...], sitemap: {...}, importProtection: {...} })` (`start-plugin-core/dist/esm/schema.js`), and the generator's `routesDirectory` (default `./src/routes`), `generatedRouteTree` (default `./src/routeTree.gen.ts`), `routeFileIgnorePrefix` (default `-`), `routeFileIgnorePattern`, `virtualRouteConfig`, `autoCodeSplitting`, `quoteStyle`, `disableTypes`, `addExtensions` (`router-generator/dist/esm/config.js`). Routes can therefore live anywhere inside the app; the generator does not reach into other workspace packages, which is the right constraint (see section 10).

Files added for the experiment:

```
src/lib/deck.functions.ts        two server functions; imports node:os; carries a marker string
src/routes/api/render.$id.ts     server route: GET and POST /api/render/:id
src/routes/canvas.tsx            ssr: false route; spawns the WebGL worker; calls a server function
src/workers/gl.worker.ts         module worker: WebGL2 on OffscreenCanvas, 4x4 Bayer two-tone shader
vite.config.ts                   plus an inline plugin with a configureServer middleware
vite.nitro.config.ts             same plugins plus nitro() for deployment builds
../headless-canvas.mjs           Playwright script against /canvas (system Chrome)
../canvas-headless-metal.png, ../canvas-headless-swiftshader.png
```

## 5. How the pieces work, with what was observed

### 5.1 Routing and the generated tree

File routes under `src/routes` map by convention (`users.ts` to `/users`, `users/$id.ts` to `/users/$id`, `file/$.ts` to a splat) (https://tanstack.com/start/latest/docs/framework/react/guide/server-routes). `routeTree.gen.ts` is produced by the plugin during `vite dev` and `vite build`, or by `tsr generate`. Consequence measured here: adding `canvas.tsx` and `api/render.$id.ts` and running `tsc` before a build gave three errors (`'/canvas' is not assignable to '/'`, `params` typed `{}`); after `vite build` regenerated the tree, `tsc --noEmit` passed. A CI typecheck must run the generator first.

### 5.2 Server functions

`createServerFn({ method })` chains `.validator()` then `.handler()`; the build replaces server function bodies with RPC stubs in client bundles and calls become `fetch` requests (https://tanstack.com/start/latest/docs/framework/react/guide/server-functions). `.inputValidator()` still works but the build prints a deprecation in favor of `.validator()` (observed with 1.168.50; the local skill reference that suggested `.validator` matched the current docs). Request access is through `getRequest`, `getRequestHeader`, `setResponseHeaders`, `setResponseStatus` from `@tanstack/react-start/server`; a `createCsrfMiddleware()` exists for cross-site protection (same URL).

Evidence: `deck.functions.ts` imports `node:os` and returns `TURBOSLIDE_SERVER_ONLY_MARKER_7f3a`. After `vite build`, `grep -rl` for the marker finds 0 files under `dist/client`, 0 client files containing `node:os`, and 1 file under `dist/server` (`assets/deck.functions-*.js`). In the browser, clicking the button on `/canvas` returned `{"marker":"TURBOSLIDE_SERVER_ONLY_MARKER_7f3a","host":"Kevins-GT-Pro.attlocal.net","node":"v24.13.0","sheet":[1600,900],"revision":1}` from the server.

Environment helpers for code shared with a CLI: `createIsomorphicFn().server(fn).client(fn)` tree-shakes each side out of the other bundle; `createServerOnlyFn` and `createClientOnlyFn` throw descriptive runtime errors when called in the wrong environment (https://tanstack.com/start/latest/docs/framework/react/guide/environment-functions).

### 5.3 Server routes (the API)

A route file gains an API by adding `server: { handlers: { GET, POST, ... } }` to `createFileRoute`; handlers receive Web `Request`, `params` and `context` and return `Response`; route-level and handler-level middleware compose, and a file may carry both `server` and `component` (https://tanstack.com/start/latest/docs/framework/react/guide/server-routes). Measured on the Nitro Node build at 4322: `GET /api/render/s1?theme=light` returned `{"slideId":"s1","theme":"light","sheet":[1600,900],"runtime":"v24.13.0","overflow":[]}`, `POST /api/render/x` with a JSON body returned `{"queued":["a","b"]}` with status 202. The same results came from the dev server at 4321.

### 5.4 SSR modes

`ssr: true` is the default (loader and component on the server), `ssr: false` disables both for the route, `ssr: 'data-only'` runs `beforeLoad` and `loader` on the server and renders on the client; children can only become more restrictive than their parent; `createStart(() => ({ defaultSsr: false }))` sets the app default; the root's `shellComponent` still renders the HTML shell (https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr). SPA mode (`tanstackStart({ spa: { enabled: true, maskPath, prerender } })`) emits a static `_shell.html` and keeps server functions and server routes working behind allow-listed paths such as `/_serverFn/*` and `/api/*` (https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode).

Evidence for `ssr: false`: `curl http://localhost:4321/canvas` returned 2,288 bytes of document shell (`<html>`, head links, `<body><!--$--><!--$--><!--/$--><script>...`) with no `<canvas>` and no `data-testid="canvas-page"`; the route mounted only in the browser. The root `/` route rendered its text on the server (`Welcome to TanStack Start` present in the SSR HTML, 2,033 bytes on the Node build).

The build-from-scratch guide warns that enabling `verbatimModuleSyntax` can leak server bundles into client bundles (https://tanstack.com/start/latest/docs/framework/react/build-from-scratch), yet the scaffold's tsconfig sets `verbatimModuleSyntax: true`. No leak occurred in this experiment (section 5.2), but the contradiction is worth a test in Turboslide's CI: grep the client output for a server-only marker on every build.

### 5.5 Devtools are a build-time dependency of correctness

`__root.tsx` renders `<TanStackDevtools>` (Solid-based). The `devtools()` Vite plugin removes that code at build time (log line `[@tanstack/devtools-vite] Removed devtools code from: /src/routes/__root.tsx`). The first `vite.nitro.config.ts` omitted `devtools()`; the build succeeded, then every request returned HTTP 500 with `Error: Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` from `@solid-primitives/event-listener`, and `.output/server/_libs` contained `neodrag__core.mjs`, `neodrag__solid+solid-js.mjs` and `@tanstack/devtools+[...].mjs` (263 kB). Adding `devtools()` back removed them and every route returned 200. For Turboslide: mount devtools only under `import.meta.env.DEV` or keep the plugin in every config, and add a build assertion that no Solid chunk lands in the server output.

## 6. Build and deployment

### 6.1 Plain `vite build`

Total 3.3 s wall (client environment 174 ms, SSR environment 128 ms of bundling). Output 616 kB:

```
dist/client/assets/index-*.js        343.10 kB (109 kB gzip)   app + router + react
dist/client/assets/canvas-*.js         5.44 kB                  code-split route
dist/client/assets/gl.worker-*.js      1.66 kB                  the module worker
dist/client/assets/routes-*.js, styles-*.css
dist/server/server.js                231.44 kB                  fetch handler, no listener
dist/server/assets/deck.functions-*.js, canvas-*.js, router-*.js, routes-*.js, start-*.js,
                   _tanstack-start-manifest_*.js, empty-plugin-adapters-*.js
```

`dist/server/server.js` exports a `createServerEntry({ fetch })` object and does not listen on a port. Serving it needs an adapter (srvx, Bun.serve, or Nitro). The hosting guide's own Node section uses Nitro and `node .output/server/index.mjs` (https://tanstack.com/start/latest/docs/framework/react/guide/hosting).

### 6.2 Nitro targets from one config

`vite.nitro.config.ts` adds `nitro()` from `nitro/vite` (nitro 3.0.260903-beta). Nitro picks the preset from `NITRO_PRESET` or auto-detects the provider (https://nitro.build/deploy).

Node (default `node-server`): build 1.96 s wall. `.output/nitro.json` records `"preset": "node-server"`, `"serverEntry": "server/index.mjs"`, `"publicDir": "public"`, preview command `node ./server/index.mjs`. Output 1.4 MB with `.output/public/assets/*` (client, fonts, the worker chunk) and `.output/server/{index.mjs,_runtime.mjs,_ssr/*,_libs/h3+rou3+srvx.mjs,...}`. Ran with `PORT=4322 node .output/server/index.mjs`; log `Listening on: http://localhost:4322/`; `/` 200 text/html, `/canvas` 200 shell, `/api/render/s1` 200 JSON, `POST /api/render/x` 202, worker chunk 200.

Vercel (`NITRO_PRESET=vercel`): log lines `[nitro:vercel] Using nodejs24.x runtime` and `Using web entry format`. Output `.vercel/output/config.json` (Build Output API `"version": 3`, routes: immutable cache header on `/assets/(.*)`, `handle: filesystem`, then `/(.*)` to `/__server`), `.vercel/output/functions/__server.func/{.vc-config.json,index.mjs,_ssr,_libs,...}`, `.vercel/output/static/assets/*`. Vercel's own page says TanStack Start on Vercel is paired with Nitro (`plugins: [tanstackStart(), nitro(), viteReact()]`) and runs on Vercel Functions with Fluid compute by default (https://vercel.com/docs/frameworks/full-stack/tanstack-start). Nitro's provider page: zero config or `NITRO_PRESET=vercel`, `.vercel/output`, Node by default with an option for Bun (`runtime: "bun1.x"`), per-route `functionRules` for `maxDuration` and memory, ISR route rules (https://nitro.build/deploy/providers/vercel). Not deployed from here; no Vercel project was touched.

Bun (`NITRO_PRESET=bun`): `.output/nitro.json` records `"preset": "bun"` and preview `bun run ./server/index.mjs` (https://nitro.build/deploy/runtimes/bun). Bun is not installed on this machine, so the bundle was built but not run. The hosting guide notes Bun needs React 19 or later (https://tanstack.com/start/latest/docs/framework/react/guide/hosting).

Cloudflare Workers (documented, not built): `@cloudflare/vite-plugin` with `cloudflare({ viteEnvironment: { name: 'ssr' } })` placed before `tanstackStart()`, wrangler `main: "@tanstack/react-start/server-entry"` and `compatibility_flags: ["nodejs_compat"]`; create command `npm create cloudflare@latest -- my-app --framework=tanstack-start` (https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack/, https://tanstack.com/start/latest/docs/framework/react/guide/hosting). Netlify uses `@netlify/vite-plugin-tanstack-start` (same hosting URL). Railway and Render appear as CLI add-ons (`--deployment railway|render`).

### 6.3 Dev server

`pnpm exec vite dev --port 4321`: `VITE v8.2.2 ready in 427 ms`. Note that the scaffold's `dev` script hard-codes `--port 3000`, so pass the port to `vite dev` directly or edit the script. The inline plugin's `configureServer` middleware answered `GET /__turboslide/ping` with `{"ok":true,"from":"vite-plugin configureServer"}`; it does not exist in any production build, which is the whole distinction between a Vite plugin hook and a server route (section 8).

Incident: after about eleven minutes with the browser pane attached, `dev.log` had grown to 10,726,957,256 bytes and the machine's load average reached 19. The log was a single repeating pattern, `[vite] (client) [console.warn] [Server] 12:14:52 PM [vite] (client) [console.warn] [Server] ...`, and the browser console held 3,000 entries prefixed `[Server]`. Two documented features produce those two prefixes: Vite 8's `server.forwardConsole` option, which forwards browser console output to the terminal (present in the installed `vite/dist/node/index.d.ts` as `forwardConsole?: boolean | ForwardConsoleOptions`; feature commit https://github.com/vitejs/vite/commit/2540ed06d0b6f93829d2d764b6a02f7dbfd14923), and TanStack devtools-vite's console piping, which sends server logs to the browser console and client logs to the terminal (https://tanstack.com/devtools/latest/docs/vite-plugin). The observed nesting is consistent with each forwarder re-forwarding the other's output. The mechanism was not bisected here; the fix to test in Turboslide is `server: { forwardConsole: false }` in `vite.config.ts` or disabling the devtools plugin's log piping, plus never writing `vite dev` output to an unbounded file. The dev server was stopped and the log deleted.

## 7. WebGL in a worker, in the browser and headless

`src/workers/gl.worker.ts` receives an `OffscreenCanvas`, creates a WebGL2 context, compiles a fragment shader that dithers a horizontal gradient with a 4 by 4 Bayer matrix into `#070707` ink and white paper at 2 px cells, draws one triangle, and reads back the corner pixel. Vite bundled it from `new Worker(new URL('../workers/gl.worker.ts', import.meta.url), { type: 'module' })` into `dist/client/assets/gl.worker-*.js` (1.66 kB), the constructor form Vite documents along with `?worker`, `?worker&inline` and `?worker&url` imports (https://vite.dev/guide/features.html#web-workers).

Browser pane (Chromium inside the Claude Code app) at `/canvas`: `{"ok":true,"version":"WebGL 2.0 (OpenGL ES 3.0 Chromium)","corner":[7,7,7,255]}` and the dithered gradient visible. Headless, through Prototemplate's `playwright-core` with `chromium.launch({ channel: 'chrome', headless: true, args })`, viewport 1600 by 900, `reducedMotion: 'reduce'`:

| GPU args                                 | Result                                                         | Wall time (launch to screenshot) |
| ---------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| `--use-angle=metal`                      | ok, `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, corner `[7,7,7,255]` | 2.9 s                            |
| `--use-gl=angle --use-angle=swiftshader` | ok, same version string, same corner                           | 6.3 s                            |

The screenshots are `canvas-headless-metal.png` and `canvas-headless-swiftshader.png`; both show the two-tone dither and the server function's JSON under the canvas. `waitUntil: 'networkidle'` never resolves against `vite dev` (HMR socket), so the script waits for `load` and then for the report text. SwiftShader matters because Linux CI has no Metal; the deck rounds used `--use-angle=metal` on this Mac.

One real hazard surfaced: `HTMLCanvasElement.transferControlToOffscreen()` is one-shot per element, and the effect that called it ran twice on the same `<canvas>` in development (`Failed to execute 'transferControlToOffscreen' on 'HTMLCanvasElement': Cannot transfer control from a canvas for more than one time`, caught by the route error boundary). No `StrictMode` wrapper exists in `@tanstack/react-start` or `start-client-core` (grep of the installed packages), so the double run came from the route remounting during dev. The fix that works is to create the canvas element inside the effect and remove it in cleanup, never in JSX. Turboslide's canvas mount should follow that rule from day one.

## 8. Where a headless render step can live

Three hosts were exercised or documented:

1. A server route (`/api/render/$id`) in the same app. It runs wherever the server bundle runs. With the Node or Bun preset it can spawn Playwright and LibreOffice; with the Vercel preset it runs inside a Vercel Function (Node 24 runtime as built here) where bundle size and duration limits apply, which Nitro exposes per route through `functionRules` (`maxDuration`, memory) (https://nitro.build/deploy/providers/vercel); on Cloudflare Workers there is no local Chromium, and Cloudflare's Browser Run product supplies remote browsers with limits of 3 concurrent browsers and 1 new instance per 20 s on the free plan, 200 concurrent and 3 per second on the paid plan, with a 60 s browser timeout on both (https://developers.cloudflare.com/browser-run/limits/). None of those documents mention GPU or WebGL.
2. A Vite plugin (`configureServer` middleware, verified at `/__turboslide/ping`). Dev only. Useful for a designer's local loop (render the current slide on save) but never for the product or the CLI.
3. A separate Node worker process (a `packages/render` service or the CLI itself) that imports the same renderer package and drives Chromium directly. This is what `headless-canvas.mjs` did from outside the app in 2.9 s including browser launch, and it is what the research brief's CLI-first plan needs (`gtdeck render`, `sheet`, `lint`). It also isolates the 10 GB-log class of failure from the web app.

Recommendation: 3 for renders, contact sheets, PPTX and Slides verification; 1 as a thin façade that enqueues jobs and streams results; 2 only as a local convenience. The systems-level path (Rust or Go) fits host 3 as a sidecar binary or a napi-rs module: SVG rasterization, image diffing, Bayer dithering and PNG encoding are the CPU-heavy steps, and none of them need a browser. Candidate crates to evaluate, not evaluated here: resvg for SVG to raster (https://github.com/linebender/resvg), dssim for perceptual diffs (https://github.com/kornelski/dssim), wgpu for headless shader frames without Chromium (https://wgpu.rs), napi-rs for Node bindings (https://napi.rs), wasm-bindgen for a browser build of the same crate (https://rustwasm.github.io/wasm-bindgen/). Go is viable for a service binary but has no comparable SVG or GPU story, so Rust is the better fit for the raster path and Go for nothing that the Node side does not already cover.

## 9. For and against TanStack Start for Turboslide

For:

- The canvas can be an `ssr: false` route inside an SSR app, so the deck list, share pages and agent docs render on the server while the editor stays client-only. Verified.
- Server functions give the editor a typed RPC surface with proven client stripping, and server routes give the agent API real `Request`/`Response` handlers in the same route tree. Both verified.
- One source, several targets: Node, Vercel and Bun bundles came from one config with an environment variable; Cloudflare and Netlify are one plugin swap. Verified for three of five.
- Vite 8 with Rolldown: sub-second bundling here, module workers as first-class outputs, and Vite's rule that linked workspace packages resolving outside `node_modules` are treated as source (https://vite.dev/guide/dep-pre-bundling.html), so shared packages need no build step in dev.
- The framework does not impose a document or state model, which matters because the block document must be the single state owner and must be shared with a CLI that has no React.
- The TanStack CLI has an agent-facing side (`--json`, `--intent`, `doc`, `search-docs`) and the docs are fetchable as Markdown; that fits an agent-native product.

Against, or needing care:

- Version discipline. The scaffold pins `latest` for every `@tanstack/*` package and `@tanstack/router-plugin` is on a 19.x line while the runtime is 1.17x; `nitro` is a dated beta (`3.0.260903-beta`). Pin exact versions with a pnpm catalog and hold `pnpm update` behind CI.
- Devtools are load-bearing (section 5.5) and the console-forwarding loop (section 6.3) is a real footgun in a repo where agents run dev servers unattended. Disable forwarding, gate devtools on `import.meta.env.DEV`, and cap log files.
- `routeTree.gen.ts` must be generated before `tsc`; CI needs `tsr generate` (or a build) first.
- Server functions belong to the app. `createServerFn` is compiled by the Start plugin, so it must not appear in packages the CLI imports; packages stay pure TypeScript and the app wraps them.
- Headless Chromium and LibreOffice do not belong in a Vercel Function or a Worker; the export pipeline needs a Node host regardless of the web framework. TanStack Start neither helps nor hurts here.
- Two TypeScript compilers in Kevin's world: gt-cloud builds with the native v7 `tsc` and aliases v6 for Next; TanStack's scaffold uses 6.0.3. Turboslide is standalone, so pick one (6.x now, 7 when `@tanstack/*` types are verified against it) and record it in the catalog.
- The pnpm 11 `allowBuilds` gate breaks the scaffold's own install until a human or a committed `pnpm-workspace.yaml` approves `unrs-resolver`; commit the approved list.

Nothing found argues against the framework for the editor itself. The risks are in tooling hygiene, not in routing, SSR or bundling.

## 10. Recommended monorepo layout for Turboslide

Standalone repo at `/Users/kevinliu/repos/Turboslide` (currently only `.git`). pnpm workspaces with catalogs (default catalog for shared versions; catalogs need pnpm 10.12.1 or later, https://pnpm.io/catalogs), TypeScript project references for `tsc -b` type checking (https://www.typescriptlang.org/docs/handbook/project-references.html), Turborepo for the task graph because gt-cloud already uses it (https://turborepo.com/docs). Packages export TypeScript source through explicit subpath `exports` (no single index barrel), which Vite consumes directly and the CLI runs through a bundler at publish time.

```
Turboslide/
  package.json                 private; scripts: dev, build, typecheck (tsc -b), lint, test, render
  pnpm-workspace.yaml          packages: apps/*, packages/*, crates/* (npm shims); catalog: react, vite, typescript, @tanstack/*
  turbo.json                   build depends on ^build; typecheck depends on generate-routes
  tsconfig.base.json           strict, moduleResolution bundler, composite, no baseUrl
  tsconfig.json                references: every package and app
  AGENTS.md                    parity chain, render and lint commands, completion rules
  apps/
    studio/                    TanStack Start app (this experiment's shape)
      src/routes/              __root.tsx (shell, theme boot), index.tsx (deck list), deck.$deckId.tsx (viewer),
                               edit.$deckId.tsx (ssr: false editor canvas), present.$deckId.tsx,
                               api/deck.$id.ts, api/render.$id.ts, api/agent.ts (manifest), openapi.json.ts, llms.txt.ts
      src/server/              server functions wrapping packages (createServerFn lives only here)
      src/workers/             material and dither workers (OffscreenCanvas, WebGL2)
      vite.config.ts           devtools() gated to dev, forwardConsole false, tanstackStart(), viteReact()
      vite.deploy.config.ts    plus nitro(); NITRO_PRESET selects node-server, vercel, bun
    cli/                       `turboslide` bin: render, sheet, lint, validate, diff, build, export, serve, mcp
                               depends on packages only; drives Chromium through playwright-core; bundled with tsdown
    render-worker/             Node service: job queue for renders, contact sheets, PPTX and Slides verification;
                               LibreOffice and pdftoppm live here; Docker image; same renderer as studio
  packages/
    deck-schema/               block document types, validator (unknown fields preserved), migrations, typed mutations,
                               block catalog, action table; generates OpenAPI, MCP tool list, skill tables
    deck-theme/                tokens (nine colors, dark remap), type ladder, grid constants, Inter woff2, icon sprite
    deck-render/               document to HTML and CSS; runs in the browser, in the CLI and in the exporter; no React
    deck-viewer/               React: Sheet, GridView, BookView, presenter, keys, hash and postMessage sync
    deck-effects/              Bayer two-tone pipeline as a library function, plate clearance metrics, material recipes
    deck-lint/                 static rules on the document and rendered rules on the render record; finding schema
    deck-export/               PPTX (pptxgenjs plus OOXML post-processing) and Google Slides batchUpdate builders
    deck-import/               parser for the 85 existing HTML slides into blocks with html escape blocks
    chrome/                    Prototemplate editor chrome: pt tokens.css, Seg, Toolbar, Sidebar tree, palette, PreviewLayer,
                               thin scrollbars; the line law as tokens
    agent/                     window.turboslide.studio adapter registry, MCP server over the action table, skills
  crates/
    raster/                    Rust: SVG to PNG (resvg), Bayer dither, PNG encode; napi-rs binding for Node, wasm for the browser
    diff/                      Rust: pixel and SSIM diffs with per-region budgets; napi-rs binding
  tooling/
    tsconfig/                  base, react, node, worker presets
    eslint-config/  prettier-config/
  skills/                      turboslide-create, turboslide-api, turboslide-studio, turboslide-verify
```

Rules that make this work:

- `apps/studio` is the only place that imports `@tanstack/react-start`. Packages depend on nothing framework-specific except `deck-viewer` and `chrome` on React.
- `deck-render` produces the same HTML and CSS for the browser, the CLI and the exporter, which is the condition for the export fidelity loop in the research brief.
- Workers are bundled by Vite in the app and by tsdown in the CLI from the same `packages/deck-effects` source; the CLI runs them in Chromium through Playwright, not in Node.
- The Rust crates are optional accelerators behind a TypeScript interface with a pure TypeScript fallback, so the CLI installs without a toolchain and CI can skip the native build until it pays for itself.
- Pin `@tanstack/*` and `nitro` to exact versions in the catalog; run `tsr generate` before `tsc -b`; grep the client output for a server-only marker in CI; assert no Solid chunk in the server output.
- Deploy `apps/studio` with the Nitro Node preset first (a container is enough), keep the Vercel preset as a verified option, and never put Chromium or LibreOffice in the web app's function.

## 11. Unverified and open

- Bun runtime not exercised (Bun not installed); Cloudflare and Netlify builds not run.
- The console-forwarding loop was observed and attributed to two documented features; it was not bisected to a single setting.
- `verbatimModuleSyntax` leak warning versus the scaffold default: no leak seen in one small app; needs the CI grep.
- pptxgenjs, LibreOffice, resvg, dssim and wgpu were not installed or run; they are named as candidates.
- Vercel Function size and duration limits for a Playwright-carrying function were not measured; the recommendation avoids the question by moving renders to a Node worker.
- The `@vitejs/plugin-react` version printed by the store path (2.7.0 hash) disagrees with `package.json` (`^6.0.1`); the resolver printed a peer-hashed directory name, and the exact version is not load-bearing here.

## 12. Sources

- TanStack Start quick start: https://tanstack.com/start/latest/docs/framework/react/quick-start
- Build from scratch: https://tanstack.com/start/latest/docs/framework/react/build-from-scratch
- Server functions: https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- Server routes: https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
- Selective SSR: https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
- SPA mode: https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode
- Environment functions: https://tanstack.com/start/latest/docs/framework/react/guide/environment-functions
- Server entry point: https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point
- Hosting: https://tanstack.com/start/latest/docs/framework/react/guide/hosting
- TanStack devtools Vite plugin: https://tanstack.com/devtools/latest/docs/vite-plugin
- @tanstack/cli on npm: https://www.npmjs.com/package/@tanstack/cli
- Vercel, TanStack Start: https://vercel.com/docs/frameworks/full-stack/tanstack-start
- Nitro deploy, Vercel provider, Bun runtime: https://nitro.build/deploy, https://nitro.build/deploy/providers/vercel, https://nitro.build/deploy/runtimes/bun
- Cloudflare Workers guide for TanStack Start: https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack/
- Cloudflare Browser Run limits: https://developers.cloudflare.com/browser-run/limits/
- Vite 8 announcement: https://vite.dev/blog/announcing-vite8
- Vite web workers: https://vite.dev/guide/features.html#web-workers
- Vite linked dependencies: https://vite.dev/guide/dep-pre-bundling.html
- Vite console forwarding commit: https://github.com/vitejs/vite/commit/2540ed06d0b6f93829d2d764b6a02f7dbfd14923
- pnpm build settings (allowBuilds): https://pnpm.io/settings/build
- pnpm catalogs: https://pnpm.io/catalogs
- TypeScript 6.0: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html, https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Turborepo: https://turborepo.com/docs
- Rust candidates: https://github.com/linebender/resvg, https://github.com/kornelski/dssim, https://wgpu.rs, https://napi.rs, https://rustwasm.github.io/wasm-bindgen/
