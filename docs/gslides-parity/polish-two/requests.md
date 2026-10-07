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
