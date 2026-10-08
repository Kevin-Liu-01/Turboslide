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

- A-R4 (to the integrator; `apps/studio/e2e/roles.spec.ts` 562): the access page's sign in
  sentence links to `/signin` since P2-A#4, as `access.signin.link` with the href
  `/signin?next=%2Fedit%2F<deck>`; the spec still reads `access.signin.decks` with the href `/decks`.
- A-R5 (to N; read on lane A's node-server build of 2026-10-07 at 16:00Z, the tree as it stood):
  `home.budget.bytes-first` fails on the document, 100,588 B decoded against the 100,000 B line
  (DESIGN.md 8.16 read 99,756 B). Lane A adds nothing to `/home`'s document: the Sign In slot is
  the same empty span until the facts arrive after hydration, and the link it then draws is in the
  route's chunk. The other four `home.budget.*` rows pass on the same build.

## D

### P2-D-1, to lane F or the integrator: robots.txt names the sitemap (row `help.docs.links`)

`apps/studio/public/robots.txt` is an output of `scripts/build-brand.ts` (`robotsTxt()`), which lane F
owns in this round, and `node scripts/build-brand.ts --check` compares it byte for byte, so lane D did
not edit it by hand. The change:

1. `packages/theme/brand/site.ts` `ROBOTS` gains `sitemap: '/sitemap.xml'`.
2. `scripts/build-brand.ts` `robotsTxt()` ends with an empty line and
   `Sitemap: ${SITE.productionOrigin}${SITE.robots.sitemap}` (`https://www.turboslide.com/sitemap.xml`).
3. `node scripts/build-brand.ts`, so `apps/studio/public/robots.txt` and `brand-manifest.json` carry it.
4. `apps/studio/src/brand-files.test.ts`, "writes robots.txt from the site rules", gains
   `expect(robots).toContain(\`Sitemap: ${SITE.productionOrigin}/sitemap.xml\`)`, the unit test of
   `docs/POLISH-2.md` 5.2 that pins the line to `productionOrigin`.

`/sitemap.xml` is lane D's (`apps/studio/src/routes/sitemap[.]xml.ts`, prerendered, `/home` and every
docs page). Until this lands `help.docs.links` reads red on its robots clause alone; every other
clause passed on the node-server build (`docs/gslides-parity/polish-two/d.md`).

### P2-D-2, to the integrator: the shared chunk is named `vendor` since the docs' lazy chunks

On the node-server build with the docs in, the client's shared entry chunk is written as
`vendor-*.js` (1,428,094 B), where a control build of the same tree without the fumadocs-mdx plugin
writes it as `index-*.js` (1,427,016 B): the vendor group of `vite.deploy.config.ts`
(`codeSplitting.groups`, whose recursive dependencies pull the app's statically reachable modules
in) takes effect once the docs add their 35 lazy page chunks. The bytes every route preloads are the
same within the route tree's 1,078 B, but `scripts/check-client-bundle.mjs` now finds a vendor chunk
and asserts the 600,000 B largest chunk ceiling it used to report, so check step 31 fails on that
line. Lane D's options do not move it (`updateViteConfig: false` was measured, same result). A
decision for the integrator: keep that line reported until the vendor group holds React, the
scheduler and the router alone (`includeDependenciesRecursively: false`, a separate measured change
to every route's chunks), or accept the line as asserted. The same build reads `/docs` preloading
1,527,714 B against its 450,000 B ceiling for the same shared chunk (the docs' own: 41,511 B for the
shell, 6,041 B for the route chunk, and the chrome's 51,137 B icon table that `/decks` preloads too),
as `/decks` and `/deck/gt-brand` read over theirs.

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

## Integrator

The answers of polish two's integrator, 2026-10-07, each in the push of the lane it serves
(`docs/gslides-parity/polish-two/integrator.md` has the readings).

- P2-F-1, done in `P2-integrator (F)` (`516fb670`): `runBrandLint` hands an HTML or SVG file under
  `ALTERNATES_ROOTS` to `lintAlternatesText`; the summary reads 6 HTML and SVG files, 0 findings.
- P2-F-2, recorded, not changed: `RosterMenu` draws the own row from `presence.self` alone, while
  the own chip reads `meOf` (the account's principal, then `presence.self`), so a plate opened when
  the shell has no `presence.self` lists nobody; lane F's pictures show that under 480 px for a
  person alone. It is older than this round and outside its files; `integrator.md` names it as a
  follow up.
- A-R1 and P2-D-2, done in `P2-integrator (D)` (`f3b49f8a`): the vendor group's test matched
  `react-dom/server.edge`, which fumadocs-core imports on demand, so 207 KB of React DOM's server
  renderer joined the chunk every route preloads. The test leaves out the server renderers: the
  shared chunk is 1,221,208 B (1,430,037 B before, the design round's entry 1,210,171 B) and the
  renderer is a lazy chunk that no route preloads. zod and the schema were in the design round's
  entry already, and fumadocs and the docs' text are not in the shared chunk. The largest chunk line
  stays asserted: it reads the shared chunk over 600,000 B, as `/decks` and `/deck/gt-brand` have
  read over their ceilings since before the design round; `/signin` and `/docs` read over theirs on
  the same chunk. The diet of SPEC-4 3.12 is the fix and is not this round's.
- A-R2 and A-R3, done in `P2-integrator (A)` (`bc582877`): the CSRF filter lets a POST to exactly
  `/api/auth/device/code` and `/api/auth/device/token` through (neither reads or sets a cookie;
  `/device`, approve and deny stay filtered), and the token poll answers an API key of the account
  named `turboslide login` in place of the session token (`server/auth/device-grant.ts`). A key acts
  as its account's agent, so `account me` names `agent:<tokenId>`; `accounts.device-flow` reads that
  and the key in the account's list, and now approves the CLI's own printed code: `turboslide login`
  stores the key, exits 0, and `account me` answers through the stored key.
- A-R4, done in `P2-integrator (A)` (`bc582877`): `roles.spec.ts` reads `access.signin.link` with the
  href `/signin?next=%2Fedit%2F<deck>`.
- A-R5 and P2-N-2, done in `P2-integrator (D)` (`f3b49f8a`): with the docs' lazy chunks in the graph
  the build split the nine modules `/home`'s route shares with its live bands into seven chunks,
  seven preload links in the document. A second group, `home-shared`, keeps them in one chunk:
  `/home`'s document is 99,784 B (100,588 B before) and every `home.budget.*` byte row passes.
- P2-D-1, done in `P2-integrator (D)` (`f3b49f8a`): `ROBOTS.sitemap`, the `Sitemap:` line at
  `SITE.productionOrigin`, the regenerated `robots.txt` and manifest record, the unit test; it sits
  in D's push because `/sitemap.xml` arrives with P2-D#4. `help.docs.links` passed.
- P2-N-1 and P2-N-3, done in `P2-integrator (N)` (`695f995a`): `<HomeNav />` with no props, and
  `home-page.spec.ts` reads "Dark or light" and the drawn half disc before and after the press.
