# Web audit verification (key `web-verify`)

Adversarial verification of `docs/hardening/research/web.md` (key `web`). Each finding was either
reproduced on a local server with production's settings or refuted from the code; the default was
"not real" when neither held. Port 4843.

Method. One local `node_modules/.bin/vite dev` on port 4843 from
`/Users/kevinliu/repos/Turboslide-harden/apps/studio`, `TURBOSLIDE_STORE=tmp`,
`TURBOSLIDE_OVERLAY_DIR=.turboslide/web-verify-overlay`, `TURBOSLIDE_REALTIME=memory`,
`TURBOSLIDE_AUTH_DB=.turboslide/auth-web-verify.sqlite`, `TURBOSLIDE_MAIL=capture`, fresh
`TURBOSLIDE_SESSION_SECRET` and `TURBOSLIDE_DOWNLOAD_SECRET`, fake `GOOGLE_CLIENT_ID`/`_SECRET`.
Run A: `TURBOSLIDE_AUTHORIZE=enforce`, CSP at its default (report only), `TURBOSLIDE_LOCAL_OPEN`
and `TURBOSLIDE_AUTH_RATE_LIMIT` unset (stricter than the web audit, which used `LOCAL_OPEN=1` and
authorize `shadow`). Run B: the same plus `TURBOSLIDE_CSP=enforce`. Production read passively
(response headers of a page load) only. Machine one minute load 73 to 370 across the run; no
timing claim is a verdict here, only functional pass/fail. Server stopped before this was written.

## Verdicts

### WEB-1 (stored XSS through a slide's `ext.import.css`) — REAL, severity 4 (CONFIRMED)

Reproduced end to end as the exact attacker the finding names: an anonymous collaborator holding
an editor link grant, in authorize `enforce` mode.

- Reach. As admin on the localhost agent surface I made a blank deck `verify-xss` and an editor
  share link. A fresh browser context opened `/s/<token>`, which set `__Host-ts_lg` (the editor
  link grant) and `__Host-ts_id` (an anonymous principal). From that context, a same origin
  `POST /api/actions/slide.update?deck=verify-xss` with one `slide.set` of `/ext` to
  `{import:{css:".a{}</style><img src=/nonexistent.png onerror=\"...\"><style>.b{}"}}` returned
  200 and bumped the deck revision. So an anonymous editor-link collaborator writes the residual
  CSS; no admin bearer is needed. The reach claim holds, and `authorize(write)` in enforce mode
  does not stop it (the editor link confers `write`).
- Sink. The payload is emitted unescaped. Raw server HTML of `/deck`, `/embed` and `/print`
  contains `...ts-x-title </style><img src=/nonexistent.png onerror="...">` verbatim; `/present`
  carries it in the dehydrated loader payload. `rewriteSlideScope` (slide.ts:784) even prefixes
  the `</style>` fragment with `.ts-sheet .ts-x-title ` as if it were a selector, but the
  `</style>` still closes the `<style>` element the browser parses.
- Runtime. On all four viewer routes the injected handler ran: `window.__COLLABXSS === 1`,
  `document.title === 'COLLABXSS'`, and exactly one live `img[onerror]` element present (the
  breakout produced a real element, not text inside `<style>`). The slide HTML reaches the DOM
  through `dangerouslySetInnerHTML` (`packages/viewer/src/SlideView.tsx:83`), and an `<img onerror>`
  fires through `innerHTML`. The handler runs on the studio origin, where it reads the session and
  calls the same origin, CSRF-exempt server functions. Confirmed with production's CSP (report
  only).

Caveat on the proposed fix (see missed WEBV-1): the finding's first fix step — run `residual.css`
through `sanitizeCss` — is **insufficient**, because `sanitizeCss` does not strip `<` or `</style>`
(proven below). Only the second clause (reject any `<` in the CSS) closes the break, and it must
be applied to the html block's CSS as well.

### WEB-2 (dependency gate is red) — REAL, severity 3 (CONFIRMED), with two evidence corrections

`pnpm audit --prod --audit-level=low --json` reports **2 critical, 6 high, 4 moderate, 2 low**,
matching the finding exactly. `node scripts/check.mjs --audit` (step 28, `--audit-level=high`
filtered by `scripts/audit-allow.json`) prints "6 open" and returns non zero: seroval
(GHSA-p6vx-979v-rg4c critical, GHSA-jp82-f5mq-hwhp high), proxy-addr (GHSA-jqcg-44mw-7w3h
critical), source-map-js (GHSA-68fv-2mgg-jv7q high), sharp (GHSA-wq5f-xc86-pv6w high),
`@modelcontextprotocol/sdk` (GHSA-6qxp-vccf-f47h high). Only the two dev-path `brace-expansion`
advisories are accepted, neither expired. The step fails today. Confirmed.

Runtime reachability, verified from the code:

- sharp 0.35.4 (high, librsvg CVE-2026-96889, patched 0.35.5): reachable. `packages/headless/src/capture/intake.ts` `rasterizeSvg` feeds sanitized SVG bytes to librsvg through sharp on the
  seller SVG raster path; `packages/effects` and `apps/cli` also link sharp. This is the one
  genuinely runtime-reachable high over partly attacker controlled input, which carries the
  severity 3.
- proxy-addr (critical) and `@modelcontextprotocol/sdk` (high): reach the `/mcp` express route
  through `packages/mcp`.

Two corrections to the finding's evidence (the conclusion stands, the write-up overstates two
rows):

- **dompurify** is listed as the DOM XSS pair "patched 3.4.16" implying it feeds the red gate.
  Both advisories (GHSA-p98j-92pf-mc4p, GHSA-6688-9rhm-gjv2) are **low**, so step 28
  (`--audit-level=high`) does not fail on them; bumping dompurify is hygiene, not what makes the
  gate red.
- **seroval** is described as "the TanStack Start SSR serializer that writes the `$R[...]` stream
  payloads of every document." The audit JSON's own paths show it resolves through
  `apps/studio > @tanstack/react-devtools > @tanstack/devtools > @neodrag/solid > solid-js >
seroval`, i.e. the devtools dependency (listed under `dependencies` in
  `apps/studio/package.json`, which is why `--prod` walks it), not the Start SSR serializer. It
  does fail the gate, but its runtime reachability in the shipped server bundle is unproven and
  likely nil (devtools are tree shaken from production), so it is a gate/hygiene failure, not a
  live SSR deserialization path.
- Not in the finding: **source-map-js** high (GHSA-68fv-2mgg-jv7q) also opens the gate; it is a
  build time vite/postcss dependency, no runtime path.

### WEB-3 (production CSP is report only, so the nonce policy is no runtime XSS defence) — REAL, severity 2 (CONFIRMED)

Production `https://www.turboslide.com/sign-in` answers `Content-Security-Policy-Report-Only`
(read passively from the response headers), confirming the report only state. Decisive test of the
claim that enforce is real defence for WEB-1: on run B (`TURBOSLIDE_CSP=enforce`) the same WEB-1
deck loaded on `/deck` did **not** fire (`window.__COLLABXSS` unset, title unchanged) although the
breakout markup and the `img[onerror]` element were still present, and the browser logged
"Executing inline event handler violates the following Content Security Policy directive
'script-src 'self' 'nonce-...' 'strict-dynamic' ...'" (4 violations). On run A (report only) the
same deck fired. So report only is exactly what makes WEB-1 live in production, and the enforce
flip blocks the inline `onerror` without `'unsafe-inline'`; `style-src 'unsafe-inline'` does not
re-admit script. Severity kept at 2 (a missing runtime defence; its exploit lives in WEB-1).

## Missed (within the audit's own scope: XSS sinks and the CSP)

### WEBV-1 (severity 3): the same `</style>` breakout exists in the `html` block's CSS on the inline render paths; `sanitizeCss` does not stop it

The audit calls `ext.import.css` "the one unescaped render sink." It is not the only one. The
`html` escape block emits `<style>${scopeCss(sanitizeCss(block.css))}</style>` inline
(`packages/render/src/blocks/html-escape.ts:62`) whenever the render context supplies no frame
source, and `sanitizeCss` preserves `<` and `</style>`:

- Proven: `sanitizeCss('.z{color:red}</style><img src=x onerror="alert(1)"><style>.y{color:blue}')`
  returns `.z { color: red; } </style><img src=x onerror="alert(1)"><style>.y { color: blue; }`
  (the `</style>` and `onerror` survive); and
  `sanitizeCss('a{content:"</style><img src=x onerror=alert(1)>"}')` keeps the `</style>` inside
  the value.
- Proven: `renderHtmlEscape` of a `type:'html'` block with
  `css: '.z{}</style><img src=x onerror="alert(1)"><style>.y{}'` returns
  `...<style>.ts-sheet .ts-x-title-h1 .z { } .ts-sheet .ts-x-title-h1 </style><img src=x onerror="alert(1)"><style>.y { }</style>...` — a live breakout element, exactly as WEB-1.

Where it fires: the inline render paths that pass no `htmlFrame` — the editor stage
(`apps/studio/src/editor/controller.tsx:1267`, `packages/viewer/src/Editor.tsx:1218`), the
template cover (`apps/studio/src/server/templates.ts:137`), the thumbnail render and the
standalone export. The hosted viewer routes (`/deck`, `/embed`, `/present`, `/print`) render the
`html` block inside the sandboxed `<iframe sandbox="" srcdoc>` with `default-src 'none'`
(`packages/render/src/sanitize/frame.ts`), so a breakout there cannot run script — contained. The
live case is the **editor**: a collaborator (editor link, anonymous included) inserts an `html`
block whose CSS carries the breakout, and it runs in every other collaborator's and the owner's
`/edit` session on the studio origin. `allowHtmlBlocks` does not gate this: that setting only
switches the hosted viewer between the frame and a note plate (`frame.ts:123`); it does not gate
block insertion or the editor's inline render. The `html` block's markup is DOMPurify sanitized at
write time but its CSS is only `sanitizeCss`'d, which (above) does not strip `</style>`.

Fix: the WEB-1 fix must reject any `<` in CSS for **both** `ext.import.css` and `html` block
`css`, at write time and at render time; running CSS through `sanitizeCss` alone does not close
either. Pin with a render test asserting a `</style>`-bearing `html` block `css` does not appear
unescaped in `renderHtmlEscape` output, and the CSP enforce flip (WEB-3) as the defence in depth
that also covers the editor path.

## Notes

- All three findings reproduced in `enforce` authorize mode, stricter than the web audit's run.
  WEB-1's reach does not depend on `TURBOSLIDE_LOCAL_OPEN`; the write came through the anonymous
  editor link grant cookie, the real production path.
- WEB-1 and WEBV-1 are the same sink class (deck controlled CSS into an inline `<style>`); WEB-3's
  enforce flip mitigates both at runtime; the write time `<`-rejection is the structural fix.
- Severities: WEB-1 kept at 4; WEB-2 kept at 3 (the red gate is ~2, the reachable sharp/librsvg
  path lifts it to 3) with the dompurify and seroval evidence corrected; WEB-3 kept at 2; WEBV-1
  new at 3.
