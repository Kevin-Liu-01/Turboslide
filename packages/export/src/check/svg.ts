// The SVG section of `export check` (gslides-parity SPEC-5 0.33, 6.4, 16.7 step 36): the root
// element in the SVG namespace, a `viewBox` that reads the page, no `script` element, no `on*`
// attribute, every `href` a fragment or a data URI (no external reference), every `use` target
// defined in the document, one `title` and one `desc`, and in embed mode one `style` element whose
// only rule is the `@font-face`. Landed by the integrator on day 0 as `{ ok: true, lines: [] }`
// (SPEC-5 1.6); B4 filled it with the SVG writer (svg/write.ts). `checkSvgFile(file)` builds the
// whole ExportCheck an SVG answers, the shape `turboslide export check <file.svg>` prints.
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { ExportCheck, ExportCheckSection } from '@turboslide/schema/export';
import { exportCheckSchema } from '@turboslide/schema/export';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** The `data-ts-text` value the writer stamps on the root: which text mode the file was written in. */
export type SvgTextModeAttr = 'embed' | 'outline' | 'link';

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/** The root `<svg ...>` start tag, or null. */
export function svgRoot(text: string): string | null {
  return /<svg\b[^>]*>/.exec(text)?.[0] ?? null;
}

/** The `viewBox` of the root as four numbers, or null. */
export function svgViewBox(text: string): [number, number, number, number] | null {
  const root = svgRoot(text);
  if (root === null) return null;
  const raw = /\sviewBox="([^"]+)"/.exec(root)?.[1];
  if (raw === undefined) return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

export function checkSvg(text: string): ExportCheckSection {
  const lines: string[] = [];
  const root = svgRoot(text);
  if (root === null) return { ok: false, lines: ['svg: no root svg element'] };
  if (!root.includes(`xmlns="${SVG_NS}"`)) lines.push('svg: the root is not in the SVG namespace');
  const viewBox = svgViewBox(text);
  if (viewBox === null) lines.push('svg: the root carries no viewBox');
  else if (viewBox[2] <= 0 || viewBox[3] <= 0) lines.push('svg: the viewBox has no area');
  if (/<script\b/i.test(text)) lines.push('svg: the file carries a script element');
  if (/\son[a-z]+\s*=/i.test(text)) lines.push('svg: the file carries an on* attribute');
  if (/<foreignObject\b/i.test(text)) lines.push('svg: the file carries a foreignObject');
  const hrefs = [...text.matchAll(/\s(?:xlink:)?href="([^"]*)"/g)].map((m) => m[1] ?? '');
  for (const href of hrefs) {
    if (href.startsWith('#') || href.startsWith('data:')) continue;
    lines.push(`svg: external reference ${href.slice(0, 60)}`);
  }
  const ids = new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? ''));
  const uses = [...text.matchAll(/<use\b[^>]*\s(?:xlink:)?href="#([^"]+)"/g)].map(
    (m) => m[1] ?? '',
  );
  for (const target of uses)
    if (!ids.has(target)) lines.push(`svg: use target #${target} is not defined`);
  const titles = count(text, /<title\b/g);
  const descs = count(text, /<desc\b/g);
  if (titles !== 1) lines.push(`svg: ${titles} title element(s), expected one`);
  if (descs !== 1) lines.push(`svg: ${descs} desc element(s), expected one`);
  const mode = /\sdata-ts-text="([^"]+)"/.exec(root)?.[1] as SvgTextModeAttr | undefined;
  const styles = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
  if (mode === 'embed') {
    if (styles.length !== 1)
      lines.push(`svg: ${styles.length} style element(s), expected one in embed mode`);
    else {
      const body = (styles[0] ?? '').trim();
      // the one rule: `@font-face { ... }` blocks alone, nothing after the last brace
      const stripped = body.replace(/@font-face\s*\{[^}]*\}/g, '').trim();
      if (stripped !== '')
        lines.push('svg: the style element carries a rule beyond the @font-face');
      if (!/@font-face/.test(body)) lines.push('svg: embed mode without an @font-face');
      if (!/src:\s*url\(data:/.test(body))
        lines.push('svg: the @font-face does not inline its file');
    }
  } else if (mode === 'outline') {
    if (/<text\b/.test(text)) lines.push('svg: outline mode carries a text element');
    if (styles.some((s) => /@font-face/.test(s)))
      lines.push('svg: outline mode carries an @font-face');
  } else if (mode === 'link') {
    if (styles.some((s) => /@font-face/.test(s)))
      lines.push('svg: link mode carries an @font-face');
  }
  const ok = lines.length === 0;
  const counts = {
    texts: count(text, /<text\b/g),
    tspans: count(text, /<tspan\b/g),
    paths: count(text, /<path\b/g),
    images: count(text, /<image\b/g),
    uses: uses.length,
    symbols: count(text, /<symbol\b/g),
  };
  return {
    ok,
    lines: ok
      ? [
          `svg: ok, ${mode ?? 'unmarked'} text, viewBox ${viewBox?.join(' ') ?? ''}, ${counts.texts} text(s), ${counts.paths} path(s), ${counts.images} image(s), ${counts.uses} symbol use(s)`,
        ]
      : lines,
    counts,
  };
}

export type SvgCheckOptions = {
  /** The page the file must draw in sheet pixels; the root's own viewBox when absent. */
  page?: { width: number; height: number };
};

/** `export check` of an `.svg` (SPEC-5 6.4): the section above as a whole ExportCheck. */
export async function checkSvgFile(
  file: string,
  options: SvgCheckOptions = {},
): Promise<ExportCheck> {
  const path = resolve(file);
  if (!existsSync(path)) throw new RangeError(`export check: ${file} does not exist`);
  const text = await readFile(path, 'utf8');
  const svg = checkSvg(text);
  const viewBox = svgViewBox(text);
  const width = viewBox?.[2] ?? 0;
  const height = viewBox?.[3] ?? 0;
  const pageSizeOk =
    options.page === undefined
      ? viewBox !== null
      : viewBox !== null && width === options.page.width && height === options.page.height;
  const issues = [...(svg.ok ? [] : svg.lines)];
  if (!pageSizeOk && options.page !== undefined)
    issues.push(
      `page size ${width} by ${height} sheet px, expected ${options.page.width} by ${options.page.height}`,
    );
  const check: ExportCheck = {
    file: basename(path),
    bytes: statSync(path).size,
    parts: 1,
    slides: 1,
    notes: 0,
    // the SVG's page in EMU, the unit the other file kinds report
    pageSize: { cx: Math.round(width * 7620), cy: Math.round(height * 7620) },
    pageSizeOk,
    slideNames: [/<title\b[^>]*>([^<]*)<\/title>/.exec(text)?.[1] ?? ''],
    titledSlides: /<title\b/.test(text) ? 1 : 0,
    formats: { 'svg-image': svg.counts?.images ?? 0 },
    mediaBytes: 0,
    embeddedFonts: /@font-face/.test(text) ? ['Inter'] : [],
    custGeom: svg.counts?.paths ?? 0,
    normAutofit: 0,
    kernZero: 0,
    shapes: (svg.counts?.paths ?? 0) + (svg.counts?.images ?? 0) + (svg.counts?.texts ?? 0),
    outOfBounds: 0,
    relationships: { checked: svg.counts?.uses ?? 0, invalid: [] },
    contentTypes: { undeclared: [], missingOverrides: [] },
    pythonPptx: { ran: false, error: 'not a PowerPoint file; the SVG section stands in' },
    quickLook: { ran: false, error: 'off for an SVG' },
    issues,
    valid: issues.length === 0,
    svg,
  };
  return exportCheckSchema.parse(check);
}
