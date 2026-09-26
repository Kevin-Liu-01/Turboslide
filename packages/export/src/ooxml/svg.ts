// The vector picture of the OOXML post-process (docs/VECTOR.md 4.6): a `p:pic` pptxgenjs wrote
// from a PNG (the fallback every viewer reads) gains, inside its `a:blip`, the extension
// PowerPoint 2016 and later read for a vector, `<a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">`
// holding `<asvg:svgBlip r:embed="rIdN"/>`, a relationship of the image type from the slide's rels
// part to `ppt/media/<name>.svg`, the SVG's bytes as stored (already sanitized by the intake), and
// the `svg` default in `[Content_Types].xml`, once. pptxgenjs's own svg support is not used: its
// fallback part is the SVG's bytes under a `.png` name when it runs in Node (the probe of
// VECTOR.md), so a reader of the fallback (LibreOffice, Keynote, Google Slides) would draw nothing.
// The writer takes the slide part's XML as the other rewrites do and returns it; the rels, the
// media and the content types are written to the package here. A pic the part does not hold, or
// one that already carries an svgBlip, changes nothing and `written` says so.
import { listShapes } from './groups.ts';
import { hasPart, readPart, writePart } from './zip.ts';
import type { Package } from './zip.ts';

/** The DrawingML extension URI PowerPoint reads a vector picture under (probe (b) of VECTOR.md). */
export const SVG_BLIP_EXT_URI = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';

export const SVG_BLIP_NS = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main';

export const IMAGE_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

export const SVG_CONTENT_TYPE = 'image/svg+xml';

/**
 * True when the bytes open with an svg root after an optional BOM, white space, an XML prolog,
 * comments and a doctype: the intake's own sniff (headless/capture/shared.ts `sniffFormat`), so
 * a stored file that is not an svg never becomes a vector part.
 */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096)))
    .toString('utf8')
    .replace(/^﻿/, '')
    .trimStart();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
    text,
  );
}

/** The rels part of a slide part: `ppt/slides/slide1.xml` -> `ppt/slides/_rels/slide1.xml.rels`. */
export function relsPartOf(part: string): string {
  const slash = part.lastIndexOf('/');
  const dir = slash >= 0 ? part.slice(0, slash + 1) : '';
  const name = slash >= 0 ? part.slice(slash + 1) : part;
  return `${dir}_rels/${name}.rels`;
}

/** The next free `rIdN` of a rels part: one past the highest number it holds. */
export function nextRelationshipId(relsXml: string): string {
  let max = 0;
  for (const match of relsXml.matchAll(/\sId="rId(\d+)"/g)) max = Math.max(max, Number(match[1]));
  return `rId${max + 1}`;
}

/** A media file name from an object name: the safe characters kept, the rest one dash. */
export function mediaNameFor(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe === '' ? 'vector' : safe;
}

/** Adds the `svg` default to `[Content_Types].xml` once; `added` is false when it was there. */
export function addSvgDefault(xml: string): { xml: string; added: boolean } {
  if (/<Default\b[^>]*\sExtension="svg"/i.test(xml)) return { xml, added: false };
  const tag = `<Default Extension="svg" ContentType="${SVG_CONTENT_TYPE}"/>`;
  const defaults = [...xml.matchAll(/<Default\b[^>]*\/>/g)];
  const last = defaults[defaults.length - 1];
  if (last !== undefined && last.index !== undefined) {
    const at = last.index + last[0].length;
    return { xml: xml.slice(0, at) + tag + xml.slice(at), added: true };
  }
  const close = xml.lastIndexOf('</Types>');
  if (close < 0) return { xml, added: false };
  return { xml: xml.slice(0, close) + tag + xml.slice(close), added: true };
}

/** The number of pictures carrying an svgBlip in a slide part, for the read-back. */
export function countSvgBlips(xml: string): number {
  return (xml.match(/<asvg:svgBlip\b/g) ?? []).length;
}

export type SvgBlipResult = {
  xml: string;
  written: boolean;
  /** The media part written, when one was. */
  media?: string;
};

/**
 * Writes the vector of the picture named `name` (VECTOR.md 4.6): the svgBlip extension inside the
 * pic's blip (appended to an `a:extLst` the blip already holds, else a new one as its last
 * child), the image relationship with the slide's next free id, the media part and the content
 * type default. Idempotent: a pic that already carries an svgBlip changes nothing.
 */
export async function writeSvgBlip(
  zip: Package,
  part: string,
  xml: string,
  name: string,
  svg: Uint8Array,
): Promise<SvgBlipResult> {
  const pic = listShapes(xml).find((s) => s.name === name);
  if (!pic || !pic.xml.startsWith('<p:pic>')) return { xml, written: false };
  if (countSvgBlips(pic.xml) > 0) return { xml, written: false };
  const blip = /<a:blip\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:blip>)/.exec(pic.xml);
  if (blip === null) return { xml, written: false };
  const rels = relsPartOf(part);
  if (!hasPart(zip, rels)) return { xml, written: false };

  const relsXml = await readPart(zip, rels);
  const rId = nextRelationshipId(relsXml);
  const base = mediaNameFor(name);
  let file = `${base}.svg`;
  for (let n = 2; hasPart(zip, `ppt/media/${file}`); n += 1) file = `${base}-${n}.svg`;
  const media = `ppt/media/${file}`;
  writePart(zip, media, svg);
  const relationship = `<Relationship Id="${rId}" Type="${IMAGE_REL_TYPE}" Target="../media/${file}"/>`;
  const close = relsXml.lastIndexOf('</Relationships>');
  if (close < 0) return { xml, written: false };
  writePart(zip, rels, relsXml.slice(0, close) + relationship + relsXml.slice(close));

  const ext = `<a:ext uri="${SVG_BLIP_EXT_URI}"><asvg:svgBlip xmlns:asvg="${SVG_BLIP_NS}" r:embed="${rId}"/></a:ext>`;
  const attrs = blip[1] ?? '';
  const inner = blip[2] ?? '';
  const withExt = inner.includes('</a:extLst>')
    ? inner.replace('</a:extLst>', `${ext}</a:extLst>`)
    : `${inner}<a:extLst>${ext}</a:extLst>`;
  const nextPic = pic.xml.replace(blip[0], `<a:blip${attrs}>${withExt}</a:blip>`);

  const types = '[Content_Types].xml';
  if (hasPart(zip, types)) {
    const out = addSvgDefault(await readPart(zip, types));
    if (out.added) writePart(zip, types, out.xml);
  }
  return {
    xml: xml.slice(0, pic.start) + nextPic + xml.slice(pic.end),
    written: true,
    media,
  };
}
