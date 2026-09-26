// The shape rewrites of the OOXML post-process the Google Slides parity round two adds
// (gslides-parity SPEC-2 2.2.10, 2.3.2, 2.4.1, 2.4.7), on the shapes pptxgenjs wrote, addressed by
// their object names: the adjust values of a preset as `<a:gd name="adjN" fmla="val …"/>` inside
// the shape's `avLst` (a callout's pointer, a snipped corner, a connector's bend), the text
// columns of a text box as `numCol` and `spcCol` on its `a:bodyPr`, and an attached connector
// rewritten from the `p:sp` pptxgenjs wrote to a `p:cxnSp` whose `p:nvCxnSpPr` carries `a:stCxn`
// and `a:endCxn` with the target shape's id and connection site, so PowerPoint keeps the
// attachment and moves the connector with the shape. Since the vector round (docs/VECTOR.md 2.5)
// an end is attached only when its site index is one the target's preset lists: a rectangle
// offers eight sites in the product (the ECMA four then four corners) and the file has an index
// for the first four alone, so an end on a corner is dropped and the connector keeps its drawn
// ends. Every function takes and returns the slide part's XML; a name the part does not hold
// changes nothing and the count says so.
import { presetOf, shapeAdjustDefaults, sites } from '@turboslide/schema/shapes';

import { listShapes } from './groups.ts';

function encodeEntities(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The `p:sp` (or `p:cxnSp`) element named `name`, with its bounds in the part, or null. */
function findShape(
  xml: string,
  name: string,
): { start: number; end: number; xml: string; id: number } | null {
  const shape = listShapes(xml).find((s) => s.name === name);
  if (!shape) return null;
  return { start: shape.start, end: shape.end, xml: shape.xml, id: shape.id };
}

function replaceAt(xml: string, start: number, end: number, next: string): string {
  return xml.slice(0, start) + next + xml.slice(end);
}

/**
 * Writes the adjust values of a preset (SPEC-2 2.3.2): `<a:prstGeom prst="…"><a:avLst>` gains one
 * `<a:gd name="<guide>" fmla="val <value>"/>` per guide, replacing what the generator wrote there
 * (pptxgenjs writes a rounded rectangle's own `adj`). `guides` are the preset's guide names in the
 * definitions file's order; `values` the block's numbers. Returns the XML and whether a shape was
 * rewritten.
 */
export function writeAdjustValues(
  xml: string,
  name: string,
  guides: readonly string[],
  values: readonly number[],
): { xml: string; written: boolean } {
  const shape = findShape(xml, name);
  if (!shape || values.length === 0) return { xml, written: false };
  const gds = values
    .map((value, i) => {
      const guide = guides[i] ?? `adj${i + 1}`;
      return `<a:gd name="${encodeEntities(guide)}" fmla="val ${Math.round(value)}"/>`;
    })
    .join('');
  const next = shape.xml.replace(
    /<a:prstGeom prst="([^"]*)"><a:avLst>[\s\S]*?<\/a:avLst><\/a:prstGeom>|<a:prstGeom prst="([^"]*)"><a:avLst\/><\/a:prstGeom>/,
    (_m, a: string | undefined, b: string | undefined) =>
      `<a:prstGeom prst="${a ?? b ?? 'rect'}"><a:avLst>${gds}</a:avLst></a:prstGeom>`,
  );
  if (next === shape.xml) return { xml, written: false };
  return { xml: replaceAt(xml, shape.start, shape.end, next), written: true };
}

/**
 * Writes the text columns of a text box (SPEC-2 2.2.10): `numCol="<n>" spcCol="<gap EMU>"` on the
 * shape's `a:bodyPr`. Returns the XML and whether a shape was rewritten.
 */
export function writeColumns(
  xml: string,
  name: string,
  columns: number,
  gapEmu: number,
): { xml: string; written: boolean } {
  const shape = findShape(xml, name);
  if (!shape || columns < 2) return { xml, written: false };
  const next = shape.xml.replace(
    /<a:bodyPr\b([^>]*?)(\/?)>/,
    (_m, attrs: string, selfClose: string) => {
      const cleaned = attrs.replace(/\s(numCol|spcCol)="[^"]*"/g, '');
      return `<a:bodyPr${cleaned} numCol="${columns}" spcCol="${Math.round(gapEmu)}"${selfClose}>`;
    },
  );
  if (next === shape.xml) return { xml, written: false };
  return { xml: replaceAt(xml, shape.start, shape.end, next), written: true };
}

export type ConnectorEnds = {
  start?: { name: string; site: number };
  end?: { name: string; site: number };
};

/**
 * The connection sites a preset lists in the file (its ECMA `cxnLst`), which `stCxn` and `endCxn`
 * index (VECTOR.md 2.5): a rectangle's four (the product appends four corner sites the file has no
 * index for, schema shapes.ts `rectSites`), else the preset's own list as `sites` answers it.
 * Undefined for a geometry that is not a preset (a custom geometry, a graphic frame), which keeps
 * the index as given.
 */
export function presetSiteCount(prst: string): number | undefined {
  if (prst === 'rect') return 4;
  if (presetOf(prst) === undefined) return undefined;
  return sites(prst, 100, 100, shapeAdjustDefaults(prst)).length;
}

export type ConnectorResult = {
  xml: string;
  written: boolean;
  /** The ends whose site index the target's preset does not list, left unattached. */
  dropped: ('start' | 'end')[];
};

/**
 * Rewrites the named `p:sp` as a `p:cxnSp` attached to its targets (SPEC-2 2.4.7): the
 * `p:nvSpPr` becomes `p:nvCxnSpPr` with `a:stCxn` and `a:endCxn` naming the target shapes' ids and
 * sites, the `p:spPr` stays, and a text body (a connector holds none) is dropped. A target the
 * part does not hold leaves that end unattached, and so does a site index at or past the
 * target's preset site count (VECTOR.md 2.5), which `dropped` names. Returns the XML and whether
 * the shape became a connector.
 */
export function toConnector(xml: string, name: string, ends: ConnectorEnds): ConnectorResult {
  const shape = findShape(xml, name);
  if (!shape || !shape.xml.startsWith('<p:sp>')) return { xml, written: false, dropped: [] };
  const dropped: ('start' | 'end')[] = [];
  const idOf = (
    which: 'start' | 'end',
    end: { name: string; site: number } | undefined,
  ): number | undefined => {
    if (end === undefined) return undefined;
    // the target's own shape, whatever group suffix its name carries
    const found = listShapes(xml).find(
      (s) => s.name === end.name || s.name.startsWith(`${end.name}@`),
    );
    if (found === undefined) return undefined;
    const prst = /<a:prstGeom prst="([^"]*)"/.exec(found.xml)?.[1];
    const bound = prst === undefined ? undefined : presetSiteCount(prst);
    if (bound !== undefined && !(end.site < bound)) {
      dropped.push(which);
      return undefined;
    }
    return found.id;
  };
  const startId = idOf('start', ends.start);
  const endId = idOf('end', ends.end);
  if (startId === undefined && endId === undefined) return { xml, written: false, dropped };
  const cxn =
    (startId !== undefined && ends.start
      ? `<a:stCxn id="${startId}" idx="${ends.start.site}"/>`
      : '') +
    (endId !== undefined && ends.end ? `<a:endCxn id="${endId}" idx="${ends.end.site}"/>` : '');
  let next = shape.xml
    .replace(/^<p:sp>/, '<p:cxnSp>')
    .replace(/<\/p:sp>$/, '</p:cxnSp>')
    .replace(/<p:nvSpPr>/, '<p:nvCxnSpPr>')
    .replace(/<\/p:nvSpPr>/, '</p:nvCxnSpPr>')
    .replace(
      /<p:cNvSpPr\b[^>]*\/>|<p:cNvSpPr\b[^>]*>[\s\S]*?<\/p:cNvSpPr>/,
      `<p:cNvCxnSpPr>${cxn}</p:cNvCxnSpPr>`,
    );
  // a connector carries no text body
  next = next.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, '');
  return { xml: replaceAt(xml, shape.start, shape.end, next), written: true, dropped };
}

/**
 * Writes a block's alt text as `descr` on the named shape's `p:cNvPr` (SPEC-2 2.5.6): pptxgenjs
 * 4.0.1 writes `descr` for pictures and charts only, so a shape's or a text box's `altText` is
 * written here. An existing `descr` is replaced. Returns the XML and whether a shape was rewritten.
 */
export function writeAltText(
  xml: string,
  name: string,
  alt: string,
): { xml: string; written: boolean } {
  const shape = findShape(xml, name);
  if (!shape || alt === '') return { xml, written: false };
  const next = shape.xml.replace(
    /<p:cNvPr\b([^>]*?)(\/?)>/,
    (_m, attrs: string, selfClose: string) => {
      const cleaned = attrs.replace(/\sdescr="[^"]*"/g, '');
      return `<p:cNvPr${cleaned} descr="${encodeEntities(alt)}"${selfClose}>`;
    },
  );
  if (next === shape.xml) return { xml, written: false };
  return { xml: replaceAt(xml, shape.start, shape.end, next), written: true };
}

/** The number of shapes and text boxes with a `descr` in a slide part, for the read-back. */
export function countAltTexts(xml: string): number {
  return (xml.match(/<p:cNvPr\b[^>]*\sdescr="[^"]+"/g) ?? []).length;
}

/** The number of connectors with an attachment in a slide part, for the read-back. */
export function countConnectors(xml: string): number {
  return (xml.match(/<p:cxnSp>[\s\S]*?<a:(stCxn|endCxn)\b/g) ?? []).length;
}
