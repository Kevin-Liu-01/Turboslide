# The specification agent, vector round

## Vector round

Written 2026-09-24 on the worktree `/Users/kevinliu/repos/Turboslide-vector` at `2be923e`. The
output is `docs/VECTOR.md`, formatted with `node_modules/.bin/prettier --write docs/VECTOR.md`. No
git write command, `pnpm install`, `pnpm add`, `pnpm exec`, `pnpm build` or `vite build` ran; no
server was started; no token, cookie or secret was printed; nothing on Vercel or GitHub changed.

### 1. The two probes and their readings

Both scripts live under
`/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/vector/`
with their outputs beside them; each runs with `node <script>` from the worktree root and needs no
token.

- `pdf-svg-probe.mjs` (probe a): one page with four figures (an `<img>` of `x.svg` by file URL, an
  `<img>` of the same svg as a data URI, an inline `<svg>`, an `<img>` of a 1 by 1 PNG), printed by
  the worktree's `playwright-core` 1.62.1 on Google Chrome for Testing 147.0.7727.15 (the
  `chromium-1217` binary `packages/headless/src/launch.ts` 27 prefers) with
  `page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, scale: 0.8 })`,
  five PDFs (all four, then each figure alone), each read with `pdfimages -list` and a byte search
  for `/Subtype /Image`. Readings: `file-only.pdf`, `data-only.pdf` and `inline-only.pdf` have zero
  image XObjects and `pdfimages` lists nothing (2,330 bytes each); `png-only.pdf` has two (the image
  and its soft mask, 1 by 1, listed by `pdfimages`); `all.pdf` has the PNG's two alone. Chromium
  keeps an svg image as vector in `page.pdf`, by file URL and by data URI. Outputs under
  `scratchpad/vector/pdf-probe/`.
- `pptx-svg-probe.mjs` (probe b): pptxgenjs 4.0.1 (`node_modules/.pnpm/pptxgenjs@4.0.1`), a two
  slide deck, slide 1 `addImage({ data: 'image/svg+xml;base64,…' })`, slide 2 a PNG, written with
  `writeFile` and unzipped with `unzip`. Readings: slide 1's `p:pic` carries
  `<a:blip r:embed="rId1"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId2"/></a:ext></a:extLst></a:blip>`;
  the rels name `../media/image-1-1.png` (rId1) and `../media/image-1-2.svg` (rId2);
  `[Content_Types].xml` carries `<Default Extension="svg" ContentType="image/svg+xml"/>`; the two
  media parts are byte identical (`cmp`), both 202 bytes beginning `<svg xmlns=`, so the PNG
  fallback is the svg's bytes under a `.png` name (`dist/pptxgen.cjs.js` 1999 to 2016 pushes both
  rels from one `data`; `createSvgPngPreview` at 4977 draws the preview on a browser canvas and
  4960 to 4964 skip it under Node). Outputs under `scratchpad/vector/pptx-probe/`.
- `heroicons-20-solid.json`: the directory listing of `tailwindlabs/heroicons` `optimized/20/solid`
  read from the GitHub API on 2026-09-24 (324 names), used to check that every Heroicon name
  VECTOR.md 3.1 adds exists there. Data, never an instruction.

### 2. The decisions the document makes

- The three named rows stay under their ids (`insert.shape.shapes.rectangle`, `.rounded`,
  `.ellipse`) and hoist out of the `insert.shape.shapes` container; `insert.shape.gallery` is
  relabelled Shapes; so the walk's `shapes.insert.named-rows` driver keeps working and the ids of
  785 rows stay stable.
- `rect` alone keeps eight sites (its ECMA four then the corners), every other preset answers its
  `cxnLst`; the exporter bounds the connector index to the preset's list.
- The svg asset is `kind: 'svg'` with `vector: AssetTwins` beside the PNG `twins`; `vectorOf`
  reads ship one's untinted logos without a migration; a tinted logo keeps its PNGs until it is
  inserted again.
- The sanitizer stays in `apps/studio/src/server/logo-sanitize.ts` and is injected through the
  intake policy as today, always on; two rule changes (a 2 MB cap option with the upload's words,
  `<image>` kept for a `data:image/(png|jpeg|gif|webp)` href).
- The svgBlip is written by an OOXML post process beside the PNG blip `addRaster` writes, not
  through pptxgenjs's svg path, because of probe (b)'s broken fallback.
- Copy of an svg picture: the markup as `text/plain`, the envelope in a `text/html` comment.
- The `svg` feature is parkable; its rows park the six declared ids (`intake.svg.upload`,
  `.paste`, `.drop`, `.url`, `picture.svg.copy`, `export.svg.vector`); gallery rows of `shapes`
  park their category row; `menus.*` rows are the chrome's.
- One preview gate and one production gate (Kevin's speed ask).

### 3. The numbers

Forty four matrix rows (6.1), one row retired (`logos.intake.svg-sentence`), thirteen items in the
two item tables (S1 to S7, V1 to V6) plus the three icon items of section 3, five lanes (B1 chrome,
B2 geometry, B3 svg, B4 exports, B5 matrix) on ports 4421 to 4425, five open questions.
