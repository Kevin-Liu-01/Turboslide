// The repair-risk strip of the OOXML post-process (docs/pptx.md "PowerPoint notes"). PowerPoint
// opens a file it cannot fully trust through its repair dialog; the parts it is known to object to
// are removed or corrected here before the package is written: `kern="0"` on every run (kern.ts;
// it also turns kerning off), empty `extLst` containers (an `a:extLst` with no `a:ext` child is
// invalid against the schema), `[Content_Types].xml` overrides that name parts the package does not
// hold (pptxgenjs writes one slideMaster override per slide while the package holds one master),
// the non-standard `image/jpg` content type, and the zip entry dates below the DOS epoch. The
// same pass writes the slide titles into docProps/app.xml so PowerPoint's file properties list
// them instead of "Slide N".
import { stripKern } from './kern.ts';
import { hasPart, listParts, readPart, writePart } from './zip.ts';
import type { Package } from './zip.ts';

const EMPTY_EXT_LIST = /<(a|p):extLst>\s*<\/\1:extLst>|<(a|p):extLst\s*\/>/g;

/** Removes `extLst` elements that hold no `ext` child. */
export function stripEmptyExtLst(xml: string): string {
  return xml.replace(EMPTY_EXT_LIST, '');
}

export function countEmptyExtLst(xml: string): number {
  return (xml.match(EMPTY_EXT_LIST) ?? []).length;
}

export type RepairStrip = { xml: string; kern: number; extLst: number; custGeom: number };

/**
 * One slide part through every XML-level strip. `custGeom` is counted, not removed: the exporter
 * never writes one (every shape is a `prstGeom` rect or line), so a count above zero names a
 * change in the generator worth a look, and a custom geometry that a shape carries is by
 * definition used by that shape.
 */
export function stripRepairRisks(xml: string): RepairStrip {
  const kern = (xml.match(/\skern="0"/g) ?? []).length;
  const extLst = countEmptyExtLst(xml);
  const custGeom = (xml.match(/<a:custGeom>/g) ?? []).length;
  return { xml: stripEmptyExtLst(stripKern(xml)), kern, extLst, custGeom };
}

export type ContentTypesClean = { removedOverrides: string[]; fixedTypes: string[] };

/**
 * `[Content_Types].xml`: drops overrides whose part is missing and corrects `image/jpg` to
 * `image/jpeg` (the registered type; PowerPoint writes `image/jpeg` for `.jpg` too).
 */
export async function cleanContentTypes(zip: Package): Promise<ContentTypesClean> {
  const path = '[Content_Types].xml';
  if (!hasPart(zip, path)) return { removedOverrides: [], fixedTypes: [] };
  let xml = await readPart(zip, path);
  const removedOverrides: string[] = [];
  const fixedTypes: string[] = [];
  xml = xml.replace(/\s*<Override PartName="([^"]+)" ContentType="[^"]+"\s*\/>/g, (match, name) => {
    const part = String(name).replace(/^\//, '');
    if (hasPart(zip, part)) return match;
    removedOverrides.push(String(name));
    return '';
  });
  if (/ContentType="image\/jpg"/.test(xml)) {
    xml = xml.replace(/ContentType="image\/jpg"/g, 'ContentType="image/jpeg"');
    fixedTypes.push('image/jpg');
  }
  writePart(zip, path, xml);
  return { removedOverrides, fixedTypes };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * docProps/app.xml: the `Slide N` entries of `TitlesOfParts` become the slide titles, in order.
 * Returns the number of entries replaced.
 */
export async function setAppTitles(zip: Package, titles: readonly string[]): Promise<number> {
  const path = 'docProps/app.xml';
  if (!hasPart(zip, path)) return 0;
  let xml = await readPart(zip, path);
  let replaced = 0;
  xml = xml.replace(/<vt:lpstr>Slide (\d+)<\/vt:lpstr>/g, (match, n) => {
    const title = titles[Number(n) - 1];
    if (title === undefined) return match;
    replaced += 1;
    return `<vt:lpstr>${escapeXml(title)}</vt:lpstr>`;
  });
  if (replaced > 0) writePart(zip, path, xml);
  return replaced;
}

/** The media parts of the package with their byte sizes, for the report. */
export async function mediaParts(zip: Package): Promise<{ path: string; bytes: number }[]> {
  const out: { path: string; bytes: number }[] = [];
  for (const path of listParts(zip)) {
    if (!/^ppt\/media\//.test(path)) continue;
    const file = zip.file(path);
    if (!file) continue;
    const bytes = await file.async('uint8array');
    out.push({ path, bytes: bytes.byteLength });
  }
  return out;
}
