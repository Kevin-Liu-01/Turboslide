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
