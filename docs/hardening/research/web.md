# Hardening research: the web surface and the supply chain (key `web`)

Scope: response headers and CSP on every route kind, XSS sinks (slide html, residual CSS, SVG,
theme and font names, og card), SSRF on server side fetches, prompt injection in assist, uploads,
dependencies, the committed native binaries, the GitHub workflow and the Worker configuration.

Method: production (https://www.turboslide.com) read passively (page loads and response headers
only); every vulnerability reproduced on a local dev server on port 4833 from
`/Users/kevinliu/repos/Turboslide-harden/apps/studio`, store `tmp`, realtime `memory`,
`TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`, CSP at its default (report only),
stopped before this report was written. Machine one minute load 87 to 117 during the run; no
timing claim is made here.

Positives confirmed first, because they bound the findings:

- The global security headers are correct and present on both production and the local build:
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on https,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy:
same-origin`, `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on `/s/*`),
  `Permissions-Policy` locking the sensor and payment features, `Cross-Origin-Resource-Policy:
same-site` on asset routes, `Cache-Control: no-store` on every API answer, a per request nonce
  CSP, and `frame-ancestors` tightened to Prototemplate on `/embed` alone. `apps/studio/src/server/headers.ts`.
- The committed wasm module is reproducible. `crates/turboslide-native` at the record's
  `crateCommit` 3ee5b090 rebuilt with the record's toolchain (rustc 1.98.1, wasm-bindgen 0.2.128)
  to a byte identical `turboslide_native_bg.wasm` (sha256 6286f96a..., matching
  `packages/native/BUILD-RECORD.json`). The Linux `.node` addon is not committed (the record row
  is pending, the file is git ignored), so no unverified native binary sits in the tree.
- The SSRF posture of `safeFetch` is strong: an allowlist of exact hosts, a pinned DNS lookup that
  refuses a name resolving to any private, loopback, link local, multicast, reserved or mapped
  address, the connection pinned to the checked address with the name kept for TLS, redirects
  re-checked per hop, a 20 s timeout and a 25 MB counted body
  (`packages/headless/src/capture/shared.ts`). The bundle fetch and the seed asset fetch read
  deployment-controlled or `*.blob.vercel-storage.com` hosts only.
- Assist resists prompt injection: the deck text rides a fenced block labelled as data, the output
  schema enumerates the slide's own target keys, and the answer is applied as `text.replace` on
  those keys, written through `escapeText`, so an injected deck cannot run actions or emit script
  (`apps/studio/src/server/assist.ts`). The model base URL is fixed, never deck controlled.

## Findings

### WEB-1 (severity 4): stored XSS through a slide's `ext.import.css`, rendered unescaped into a `<style>` element

`packages/render/src/slide.ts:268` emits the slide's residual CSS as
`` `<style>${rewriteSlideScope(residual.css, `.ts-x-${slide.id}`)}</style>` ``, where
`residual.css` is `importResidual(slide.ext).css`. `rewriteSlideScope` (`slide.ts:784`) only
splits on `}` and prefixes selectors; it never escapes `<`, never strips `</style>`, and never
runs the CSS tokenizer. The value is an arbitrary string: `importResidualSchema`
(`packages/schema/src/ext.ts:19`) declares `css: z.string().optional()`, and the slide schema's
`ext` accepts the object, so `slide.set /ext` (or `slide.update` with the same op) writes it with
no sanitizer. This is the one unescaped render sink: the `html` escape block path
(`renderHtmlEscape`) runs `sanitizeCss` + `sanitizeHtml` + a sandboxed `srcdoc` frame, brand
colours are `hexColorSchema`, brand and block fonts are a `FONT_IDS` enum, block level residual
(`ext.import.style`, `ext.import.classes`) lands in attributes through `escapeAttr`. Only the
slide level `ext.import.css` is written raw.

Reproduction (local server on port 4833, settings above): `deck.create` a deck, then
`POST /api/actions/slide.update?deck=<id>` with one `slide.set` of `/ext` to
`{"import":{"css":"<breakout that closes the style element, adds an element with an error handler,
reopens a style element>"}}`. Loading `/deck/<id>`, `/embed/<id>`, `/print/<id>` and
`/present/<id>` each ran the injected handler in the page (a `localStorage` marker written from
`/embed` and `/print`, `document.title` rewritten on `/deck`; the markup was present verbatim in
the server HTML of `/deck`, `/embed` and `/print`, and inside the dehydrated loader payload of
`/edit` and `/present`). The handler runs on the studio's own origin, where it can read the
session and call the CSRF-exempt same-origin server functions.

Reach: `slide.update`/`slide.set` need the `write` capability
(`apps/studio/src/server/authorize.ts:577`, `mutates` maps to `write`), which an editor link grant
confers, anonymous included. So a collaborator with an edit link plants markup that runs in the
owner's and every viewer's browser on `/deck`, `/embed`, `/present`, `/print` and the `/s/<token>`
viewer. Production runs CSP in report only mode today (see WEB-3), so nothing blocks it at runtime.

Fix: run `residual.css` through `sanitizeCss` (the same tokenizer the html block uses) before
`rewriteSlideScope`, and reject any `<` in the CSS (valid CSS never contains one), so a `</style>`
breakout cannot form; stamp and validate it at write time the way `sanitizeHtmlBlock` stamps
`htmlSanitized`. Pin it with a render unit test asserting a `</style>`-bearing `ext.import.css`
does not appear unescaped in `renderSlide` output, and an e2e that loads such a deck on `/deck`
and asserts no handler fires.

### WEB-2 (severity 3): the dependency gate is red, with runtime-reachable high and critical advisories in catalog-pinned versions

`pnpm audit --prod --audit-level=low` now reports 2 critical, 6 high, 4 moderate and 2 low.
`scripts/audit-allow.json` accepts only the two dev-path `brace-expansion` advisories, and
`pnpm check` step 28 runs `--audit-level=high`, so the step fails today. The runtime-reachable
ones:

- `sharp` 0.35.4 (pinned, `pnpm-workspace.yaml:87`) — high, GHSA for the bundled librsvg, patched
  0.35.5. Reachable: `packages/headless/src/capture/intake.ts` `rasterizeSvg` feeds sanitized SVG
  to sharp/librsvg on the hosted logo and vector upload path, so a seller-supplied vector reaches
  the vulnerable parser.
- `dompurify` 3.4.15 (pinned, `pnpm-workspace.yaml:64`) — the DOM XSS advisories
  GHSA-p98j-92pf-mc4p and GHSA-6688-9rhm-gjv2, patched 3.4.16. This is the exact html-block
  sanitizer (`packages/render/src/sanitize/html.ts`).
- `@modelcontextprotocol/sdk` 1.30.0 (pinned, `pnpm-workspace.yaml:29`) — high, OAuth client token
  misuse, patched 1.31.0. The `/mcp` route serves it.
- `proxy-addr` <2.0.8 — critical, IP spoofing via IPv4-mapped addresses, through `@turboslide/mcp`.
- `seroval` <=1.6.2 — critical (`fromJSON` thenable assimilation) plus high (memory exhaustion),
  the TanStack Start SSR serializer that writes the `$R[...]` stream payloads of every document
  (dependency of `@turboslide/studio`).
- `ip-address` <=10.7.0 — moderate, `isInSubnet` allowlist bypass (transitive).

Fix: bump the three catalog pins (sharp 0.35.5, dompurify 3.4.16, `@modelcontextprotocol/sdk`
1.31.0) and add `pnpm.overrides` for the transitive `proxy-addr`, `seroval` and `ip-address`; for
any that cannot move, add a dated `audit-allow.json` entry with a reachability reading the way the
`brace-expansion` entries are written. Re-run step 28 to green.

### WEB-3 (severity 2): production CSP is report only, so the nonce policy gives no runtime XSS defence today

Production answers `Content-Security-Policy-Report-Only` on `/new`, `/edit/new`, `/s/*`,
`/embed/*` and `/sign-in` (read from the response headers). This is the documented R8-pending
state (`docs/security.md` section 8; Kevin dates the flip), but it is what makes WEB-1 exploitable
in production. In enforce mode the `script-src 'self' 'nonce-...' 'strict-dynamic'` directive (no
`'unsafe-inline'`) would block the injected inline event handler, and `style-src 'unsafe-inline'`
does not re-admit script, so flipping enforce is real defence in depth for WEB-1 and any future
injection. Recommend flipping `TURBOSLIDE_CSP=enforce` on the document routes
(`/deck`, `/embed`, `/present`, `/print`, `/s`) first once the report-week drain is clean, then
site-wide. Pin with the hosted smoke asserting `content-security-policy` (not report-only) on a
document route.

### WEB-4 (severity 1): hygiene notes

- The static and redirect routes `/` (307), `/favicon.ico` and `/robots.txt` carry only the short
  `Strict-Transport-Security: max-age=63072000` and no nonce CSP, nosniff or frame rule, because
  they are served by Vercel's static layer ahead of the app middleware. They hold no sensitive
  content, but the asset routes' `nosniff` and CORP do not reach them; a `_headers`/`vercel.json`
  rule would close the gap.
- `packages/native/ci/native.yml` (the template the integrator installs at
  `.github/workflows/native.yml`; no `.github/` exists in this checkout) sets
  `permissions: contents: read` correctly but pins actions by floating major
  (`actions/checkout@v4`, `dtolnay/rust-toolchain@stable`, `actions/cache@v4`); pinning by commit
  SHA would harden the supply chain of the one job that produces committed binaries.
- The realtime Worker config (`apps/realtime-worker/wrangler.jsonc`) holds no secret and no
  account id (all via `wrangler secret`/env), observability on, D1 ids (not secrets) inline, and
  the bearer and ticket routes verify in constant time (`secretsMatch`, `verifyTicket`). Clean.
