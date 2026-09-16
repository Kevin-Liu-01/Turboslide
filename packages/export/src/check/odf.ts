// The ODF sections of `export check` (gslides-parity SPEC-5 6.3, 0.32, 16.7 step 36): the
// container (`mimetype` first in the zip, stored, no extra field, the manifest naming every part
// and every named part present) and the attribute names of what the writer emitted (the page
// size, the transitions' `smil:type` and speed words, the animation tree's node types and preset
// ids, the `draw:plugin` media, the `draw:custom-shape` presets with their `draw:enhanced-path`,
// the default style's `fo:language` and `fo:country`). Landed by the integrator on day 0 as
// `{ ok: true, lines: [] }` (SPEC-5 1.6); B4 filled it with the ODP writer (odp/build.ts), whose
// element table is the one read here, so a writer change that forgets an attribute fails this
// check before LibreOffice sees the file. `checkOdp(file)` builds the whole ExportCheck an ODP
// answers, the shape `turboslide export check <file.odp>` prints.
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { ExportCheck, ExportCheckSection } from '@turboslide/schema/export';
import { exportCheckSchema } from '@turboslide/schema/export';
import { DEFAULT_PAGE } from '@turboslide/schema/render';

import { hasPart, listParts, openPackage, readPart, readPartBytes } from '../ooxml/zip.ts';
import type { Package } from '../ooxml/zip.ts';
import { mediaFormatOf } from '../check.ts';

/** The ODF presentation mime type, the bytes of the `mimetype` entry. */
export const ODP_MIME = 'application/vnd.oasis.opendocument.presentation';

/** EMU per centimetre: 914,400 per inch over 2.54. */
export const EMU_PER_CM = 360000;

/** The transition names the writer emits (`smil:type`), LibreOffice's vocabulary (R09 2.2). */
export const ODF_TRANSITION_TYPES = new Set([
  'fade',
  'slideWipe',
  'barWipe',
  'pushWipe',
  'irisWipe',
  'dissolve',
  'checkerBoardWipe',
  'randomBarWipe',
  'zoom',
]);

/** The speed words of `presentation:transition-speed`. */
export const ODF_SPEEDS = new Set(['slow', 'medium', 'fast']);

/** The node types an `anim:par` or `anim:seq` carries in the tree the writer emits. */
export const ODF_NODE_TYPES = new Set([
  'timing-root',
  'main-sequence',
  'on-click',
  'with-previous',
  'after-previous',
  'default',
]);

/** A length in cm, mm, in, pt or px as EMU, rounded. */
export function odfLengthEmu(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)(cm|mm|in|pt|px)$/.exec(value.trim());
  if (match === null) return null;
  const n = Number(match[1]);
  switch (match[2]) {
    case 'cm':
      return Math.round(n * EMU_PER_CM);
    case 'mm':
      return Math.round(n * (EMU_PER_CM / 10));
    case 'in':
      return Math.round(n * 914400);
    case 'pt':
      return Math.round(n * 12700);
    case 'px':
      return Math.round(n * 7620);
    default:
      return null;
  }
}

function count(xml: string, pattern: RegExp): number {
  return (xml.match(pattern) ?? []).length;
}

function attrs(xml: string, pattern: RegExp): string[] {
  return [...xml.matchAll(pattern)].map((m) => m[1] ?? '');
}

/**
 * The zip's first local file header: the entry name, its method (0 stored, 8 deflated) and the
 * extra field length, read from the bytes because jszip does not expose them after loading. ODF
 * 1.2 part 3 section 3.3: the `mimetype` file is the first entry, uncompressed, with no extra
 * field, so a reader identifies the package from its first 38 bytes plus the name.
 */
export function firstEntryFacts(
  bytes: Uint8Array,
): { name: string; method: number; extraLength: number } | null {
  if (bytes.byteLength < 30) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) return null;
  const method = view.getUint16(8, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const name = Buffer.from(bytes.buffer, bytes.byteOffset + 30, nameLength).toString('utf8');
  return { name, method, extraLength };
}

/**
 * The container over the file's bytes: `mimetype` first, stored, no extra field, with the
 * presentation mime type; the manifest present and complete both ways.
 */
export async function checkOdfContainerBytes(bytes: Uint8Array): Promise<ExportCheckSection> {
  const lines: string[] = [];
  const first = firstEntryFacts(bytes);
  if (first === null) lines.push('container: the file is not a zip');
  else {
    if (first.name !== 'mimetype')
      lines.push(`container: the first entry is ${first.name}, expected mimetype`);
    if (first.method !== 0) lines.push('container: mimetype is deflated, expected stored');
    if (first.extraLength !== 0)
      lines.push(`container: mimetype carries a ${first.extraLength} byte extra field`);
  }
  const zip = await openPackage(bytes);
  const inner = await checkOdfContainer(zip);
  lines.push(...inner.lines.filter((line) => !line.startsWith('container: ok')));
  const ok = lines.length === 0;
  return {
    ok,
    lines: ok ? ['container: ok, mimetype first and stored, the manifest complete'] : lines,
    counts: inner.counts,
  };
}

/** The manifest's `manifest:full-path` entries, the directory root left out. */
export function manifestPaths(manifest: string): string[] {
  return attrs(manifest, /manifest:full-path="([^"]+)"/g).filter((path) => path !== '/');
}

/**
 * The container over the opened package: the mimetype entry's bytes, the manifest listing every
 * part (directories aside) and every listed part present.
 */
export async function checkOdfContainer(zip: Package): Promise<ExportCheckSection> {
  const lines: string[] = [];
  const parts = listParts(zip);
  if (!hasPart(zip, 'mimetype')) lines.push('container: no mimetype entry');
  else {
    const mime = (await readPart(zip, 'mimetype')).trim();
    if (mime !== ODP_MIME) lines.push(`container: mimetype reads ${mime}, expected ${ODP_MIME}`);
  }
  let listed = 0;
  if (!hasPart(zip, 'META-INF/manifest.xml')) lines.push('container: no META-INF/manifest.xml');
  else {
    const manifest = await readPart(zip, 'META-INF/manifest.xml');
    const named = manifestPaths(manifest).filter((path) => !path.endsWith('/'));
    listed = named.length;
    for (const path of named)
      if (!hasPart(zip, path)) lines.push(`container: the manifest names ${path}, which is absent`);
    for (const path of parts) {
      if (path === 'mimetype' || path === 'META-INF/manifest.xml') continue;
      if (!named.includes(path)) lines.push(`container: ${path} is not in the manifest`);
    }
    if (!/manifest:media-type="application\/vnd\.oasis\.opendocument\.presentation"/.test(manifest))
      lines.push('container: the manifest root names no presentation media type');
  }
  for (const required of ['content.xml', 'styles.xml', 'meta.xml'])
    if (!hasPart(zip, required)) lines.push(`container: no ${required}`);
  const ok = lines.length === 0;
  return {
    ok,
    lines: ok ? [`container: ok, ${parts.length} parts, ${listed} in the manifest`] : lines,
    counts: { parts: parts.length, manifest: listed },
  };
}

/**
 * The ODF attribute names (R09 2.2): every drawing page style's transition names a known
 * `smil:type` with a speed word; every animation node names a node type the tree uses and every
 * effect an `presentation:preset-id`; every `draw:plugin` carries `xlink:href` and
 * `draw:mime-type`; every `draw:custom-shape` with an `ooxml-` type carries a `draw:enhanced-path`;
 * the default style carries `fo:language` and `fo:country`.
 */
export async function checkOdf(zip: Package): Promise<ExportCheckSection> {
  const lines: string[] = [];
  if (!hasPart(zip, 'content.xml')) return { ok: false, lines: ['odf: no content.xml'] };
  const content = await readPart(zip, 'content.xml');
  const styles = hasPart(zip, 'styles.xml') ? await readPart(zip, 'styles.xml') : '';
  const pages = count(content, /<draw:page[\s>]/g);
  const transitions = attrs(content, /smil:type="([^"]+)"/g);
  for (const type of transitions)
    if (!ODF_TRANSITION_TYPES.has(type)) lines.push(`odf: unknown transition smil:type ${type}`);
  const speeds = attrs(content, /presentation:transition-speed="([^"]+)"/g);
  for (const speed of speeds)
    if (!ODF_SPEEDS.has(speed)) lines.push(`odf: unknown transition speed ${speed}`);
  const nodeTypes = attrs(content, /presentation:node-type="([^"]+)"/g);
  for (const type of nodeTypes)
    if (!ODF_NODE_TYPES.has(type)) lines.push(`odf: unknown animation node type ${type}`);
  const roots = count(content, /presentation:node-type="timing-root"/g);
  if (roots > pages) lines.push(`odf: ${roots} timing roots on ${pages} pages`);
  const effects = count(content, /presentation:preset-class="/g);
  const presetIds = count(content, /presentation:preset-id="/g);
  if (effects !== presetIds)
    lines.push(`odf: ${effects} effect nodes carry a preset class and ${presetIds} a preset id`);
  const plugins = [...content.matchAll(/<draw:plugin\b([^>]*)\/?>/g)];
  for (const plugin of plugins) {
    const inner = plugin[1] ?? '';
    if (!/xlink:href="/.test(inner)) lines.push('odf: a draw:plugin carries no xlink:href');
    if (!/draw:mime-type="/.test(inner)) lines.push('odf: a draw:plugin carries no draw:mime-type');
  }
  const customShapes = [...content.matchAll(/<draw:custom-shape\b[\s\S]*?<\/draw:custom-shape>/g)];
  let presets = 0;
  for (const shape of customShapes) {
    const xml = shape[0];
    const type = /draw:type="([^"]+)"/.exec(xml)?.[1];
    if (type === undefined) {
      lines.push('odf: a draw:custom-shape names no draw:type');
      continue;
    }
    if (type.startsWith('ooxml-')) {
      presets += 1;
      if (!/draw:enhanced-path="/.test(xml))
        lines.push(`odf: the ${type} shape carries no draw:enhanced-path`);
    }
  }
  if (!/fo:language="[a-z]{2,3}"/.test(styles) || !/fo:country="[A-Z]{2}"/.test(styles))
    lines.push('odf: the default style names no fo:language and fo:country');
  const pageWidth = /fo:page-width="([^"]+)"/.exec(styles)?.[1];
  const pageHeight = /fo:page-height="([^"]+)"/.exec(styles)?.[1];
  if (pageWidth === undefined || pageHeight === undefined)
    lines.push('odf: the page layout names no fo:page-width and fo:page-height');
  const ok = lines.length === 0;
  const counts = {
    pages,
    transitions: transitions.length,
    animations: effects,
    plugins: plugins.length,
    presets,
    notes: count(content, /<presentation:notes\b/g),
  };
  return {
    ok,
    lines: ok
      ? [
          `odf: ok, ${pages} page(s), ${transitions.length} transition(s), ${effects} effect(s), ${plugins.length} plugin(s), ${presets} preset shape(s)`,
        ]
      : lines,
    counts,
  };
}

export type OdpCheckOptions = {
  /** The page the file must carry in sheet pixels; the default page when absent (SPEC-5 6.1). */
  page?: { width: number; height: number };
  log?: (line: string) => void;
};

/**
 * `export check` of an `.odp` (SPEC-5 6.3): the container, the ODF attribute names, the page size
 * against the expected page (in EMU, from the page layout's cm), the pictures classed by their
 * bytes, the manifest as the relationship table, and `valid` when every section holds.
 */
export async function checkOdp(file: string, options: OdpCheckOptions = {}): Promise<ExportCheck> {
  const path = resolve(file);
  if (!existsSync(path)) throw new RangeError(`export check: ${file} does not exist`);
  const bytes = new Uint8Array(await readFile(path));
  const zip = await openPackage(bytes);
  const parts = listParts(zip);
  const container = await checkOdfContainerBytes(bytes);
  const odf = await checkOdf(zip);
  const content = hasPart(zip, 'content.xml') ? await readPart(zip, 'content.xml') : '';
  const styles = hasPart(zip, 'styles.xml') ? await readPart(zip, 'styles.xml') : '';
  const expected = options.page ?? DEFAULT_PAGE;
  const cx = odfLengthEmu(/fo:page-width="([^"]+)"/.exec(styles)?.[1] ?? '') ?? 0;
  const cy = odfLengthEmu(/fo:page-height="([^"]+)"/.exec(styles)?.[1] ?? '') ?? 0;
  // the writer rounds the page to 0.001 cm, 3,600 EMU; a whole sheet pixel is the tolerance
  const pageSizeOk =
    Math.abs(cx - expected.width * 7620) <= 7620 && Math.abs(cy - expected.height * 7620) <= 7620;
  const slideNames = attrs(content, /<draw:page\b[^>]*draw:name="([^"]+)"/g);
  const formats: Record<string, number> = {};
  let mediaBytes = 0;
  for (const part of parts.filter((p) => /^Pictures\//.test(p))) {
    const media = await readPartBytes(zip, part);
    mediaBytes += media.byteLength;
    const format = mediaFormatOf(media);
    formats[format] = (formats[format] ?? 0) + 1;
  }
  const manifest = hasPart(zip, 'META-INF/manifest.xml')
    ? await readPart(zip, 'META-INF/manifest.xml')
    : '';
  const named = manifestPaths(manifest).filter((p) => !p.endsWith('/'));
  const invalid = named.filter((p) => !hasPart(zip, p));
  const undeclared = parts.filter(
    (p) => p !== 'mimetype' && p !== 'META-INF/manifest.xml' && !named.includes(p),
  );
  const issues: string[] = [];
  if (!container.ok) issues.push(...container.lines);
  if (!odf.ok) issues.push(...odf.lines);
  if (!pageSizeOk)
    issues.push(
      `page size ${cx} by ${cy} EMU, expected ${expected.width * 7620} by ${expected.height * 7620}`,
    );
  const check: ExportCheck = {
    file: basename(path),
    bytes: statSync(path).size,
    parts: parts.length,
    slides: odf.counts?.pages ?? 0,
    notes: odf.counts?.notes ?? 0,
    pageSize: { cx, cy },
    pageSizeOk,
    slideNames,
    titledSlides: slideNames.filter((name) => name !== '').length,
    formats,
    mediaBytes,
    embeddedFonts: [],
    custGeom: odf.counts?.presets ?? 0,
    normAutofit: 0,
    kernZero: 0,
    shapes:
      count(content, /<draw:frame\b/g) +
      count(content, /<draw:custom-shape\b/g) +
      count(content, /<draw:line\b/g) +
      count(content, /<draw:path\b/g) +
      count(content, /<draw:connector\b/g),
    outOfBounds: 0,
    groups: count(content, /<draw:g\b/g),
    tables: count(content, /<table:table\b/g),
    connectors: count(content, /<draw:connector\b/g),
    relationships: { checked: named.length, invalid },
    contentTypes: { undeclared, missingOverrides: [] },
    pythonPptx: { ran: false, error: 'not a PowerPoint file; the ODF sections stand in' },
    quickLook: { ran: false, error: 'off for an ODP' },
    issues,
    valid: issues.length === 0,
    container,
    odf,
  };
  return exportCheckSchema.parse(check);
}
