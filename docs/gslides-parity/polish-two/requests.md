# Polish two, requests

Requests of the lanes of `docs/POLISH-2.md` for files outside their own, made by the integrator. Each lane writes under its own key.

## F

### P2-F-1, to the integrator: the runner reads the generated brand sources as text

`docs/POLISH-2.md` 2.3 item 4 adds `packages/theme/brand/` to the roots of `css/chrome-alternates`,
with its HTML and SVG read as text. Lane F's files hold the rule and the roots (`config.ts`
`ALTERNATES_ROOTS`, in `LINT_ROOTS`; `source.ts` `isAlternatesOnly`, so the other rules do not read
them; `css.ts` `lintAlternatesText`), but `packages/lint/src/brand/run.ts` dispatches only scripts and
stylesheets, so the CLI reads the TypeScript under the three roots and not `og-template.html` or the
SVG files. Until then `css.test.ts` runs `lintAlternatesText` on the committed `wordmark.svg` and
`og-template.html`, and `scripts/build-brand.ts`, which writes them, is read by the rule. The change,
in the file loop of `runBrandLint` after the stylesheet branch:

```ts
} else if (/\.(?:html|svg)$/.test(file) && isAlternatesOnly(file)) {
  findings.push(...lintAlternatesText(file, text, rules));
}
```

with `isAlternatesOnly` imported from `./source.ts` and `lintAlternatesText` from `./css.ts`; the
summary's `read` counts may gain a `texts` field. No acceptance changes: the tree has no finding.

### P2-F-2, to the integrator: an observation, not a request for lane F's files

At 390 in both appearances on the editor from `/new` (a vite dev server of this tree on 4741,
memory tier), More, Collaborators opens the roster plate as an empty outlined pill about 240 CSS px
wide under the title row, with no row for a person alone
(`docs/gslides-parity/polish-two/f/editor-390-light-roster-open.jpg`, `editor-390-dark-roster-open.jpg`).
The own row is in the default view since the people round, so a person alone should read one row.

## A

- A-R1 (to D or the integrator; read on lane A's node-server build of 2026-10-07 13:31Z, with the
  tree as it stood): the shared entry chunk `vendor-*.js` is 1,524,170 B, and it holds zod
  (`ZodError`), the docs' source (`Use Turboslide`, `Action reference`) and `fumadocs`, so every
  route's preload is over its ceiling in `scripts/check-client-bundle.mjs` (`/decks` 1,577,115 B of
  600,000; `/deck/gt-brand` 1,538,826 of 1,000,000; `/edit/gt-brand` 2,045,184 of 2,000,000) and
  the largest chunk ceiling fails. `/signin`'s own chunks are 17,505 B (`AuthPage` 15,663,
  `sign-in-auth` 1,251, the route 591); its line of 600,000 B fails on the vendor chunk alone. The
  docs' modules belong in the docs routes' own chunks (DESIGN.md 8.16 and POLISH-2.md 5.1 name
  13.0 KB gzip of script on docs pages and nothing on `/home`).

- A-R2 (to the integrator; `apps/studio/src/server/headers.ts` or `apps/cli/src/commands/login.ts`):
  `turboslide login` cannot start. The CSRF filter validates every `/api/auth/*` request, and the
  CLI's `POST /api/auth/device/code` and `/api/auth/device/token` carry neither `Sec-Fetch-Site` nor
  `Origin`, so the TanStack CSRF middleware answers 403 ("does not offer the device flow (403)").
  The two device endpoints are RFC 8628's endpoints for clients that are not browsers and read no
  cookie; exempting `POST /api/auth/device/code` and `/api/auth/device/token` from `csrfFilter` (as
  the bearer routes are) fixes it without touching a browser path. Read on lane A's server with
  `accounts.device-flow` on 2026-10-07; production carries the same filter.
- A-R3 (to the integrator; `apps/cli/src/commands/login.ts` and the studio's token check,
  `apps/studio/src/server/auth/tokens.ts`): the token `/api/auth/device/token` grants is a
  better-auth session token, which the CLI stores as `kind: 'api-key'` and the agent surface refuses
  as a bearer ("the bearer is not an API key of this deployment"). The grant needs to mint an API
  key for the account (the `account.tokens.create` path) or the bearer check needs to accept the
  device session; `account me` then answers the account.

## N

### P2-N-1, to the integrator: the route stops passing the nonce to the bar

Since P2-N#1 the bar renders no script: the pressed script of the motion toggles moved after the
footer's toggle, the last one in the document (`docs/POLISH-2.md` 3.1 item 3), and
`apps/studio/src/components/home/HomeFooter.tsx` reads the request's nonce itself through
`useRouter().options.ssr?.nonce`, as `routes/home.tsx` 81 does. In
`apps/studio/src/routes/home.tsx` 136, `<HomeNav nonce={nonce} />` becomes `<HomeNav />`; lane N
then drops the unused `_props` parameter of `HomeNav` in its next push.

### P2-N-2, to the integrator: `/home`'s document crosses its line from the shared tree

The node-server build of the shared tree at 15:06 serves `/home` at 100,579 B decoded against the
100,000 B line of `home.budget.bytes-first` (DESIGN.md 8.16 read 99,756 B on `f2d48868`). Lane N's
P2-N#1 changes it by -51 B. The rest is in the head and the router's state, from other lanes' work:
a `vendor-*.css` stylesheet link (about 118 B) with lane D's work in the tree; once lane A's
`/signin` imported the shared `ThemeButton` (`packages/chrome/src/auth/AuthPage.tsx`), Rolldown
moved it into a chunk of its own, so `/home` gained `<link rel="modulepreload"
href="/assets/ThemeButton-*.js">` (80 B) and `<link rel="stylesheet"
href="/assets/ToolButton-*.css">` (about 103 B); the router's manifest grew 81 B with the new
routes. Lane N has no more bytes to give in its own files without changing the mark or the copy.
Two ways out for the integrator with lanes A and D: keep the shared chrome modules `/home` imports
(`ThemeButton`, `ToolButton.css`, `Tooltip`) in one group of `output.codeSplitting.groups` in
`apps/studio/vite.config.ts` so a second importer adds no link to `/home`, and keep the docs'
styles out of the vendor stylesheet; or ask Kevin to move the line. The line is not raised here.

### P2-N-3, to the integrator: the theme button's name in `e2e/home-page.spec.ts`

Since P2-N#2 the shared `ThemeButton`'s icon button is named "Dark or light" in both appearances,
before and after hydration and after a press (`docs/POLISH-2.md` 3.3, C10, question Q27); the
labelled button in the editor's toolbar is named "Theme". `apps/studio/e2e/home-page.spec.ts` 152
and 156 (`pnpm check`'s `ROUND_THREE_SPECS`) still expect `Switch to ${other}` and `Switch to
${theme}`. Both lines become `await expect(button).toHaveAttribute('aria-label', 'Dark or light');`,
and the test can read the drawn glyph instead: the `.pt-theme-glyph` whose computed `display` is not
`none` reads ◐ in light and ◑ in dark (`apps/studio/e2e/core/home/header.ts` `readThemeButton`).
