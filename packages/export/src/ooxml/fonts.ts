// Font embedding (SPEC 8.2 post-process, 8.4; pptx report section 4.9): pptxgenjs has no feature
// (issue #176) and python-pptx no API (issue #355), so the package is edited directly. Each static
// TTF is wrapped in an EOT header (the W3C submission, version 0x00020001, no MicroType Express
// compression, no XOR; https://www.w3.org/submissions/EOT/) and written as ppt/fonts/fontN.fntdata,
// `[Content_Types].xml` gains the `application/x-fontdata` default (PowerPoint reports a corrupt
// file without it, pandoc issue 11492), ppt/_rels/presentation.xml.rels gains one font
// relationship per file, and presentation.xml gains `<p:embeddedFontLst>` after `<p:notesSz>` with
// one `<p:embeddedFont>` per family. PowerPoint requires every listed typeface to be unique and
// used (MS-OE376 2.1.1170); the caller passes the families the runs use. PowerPoint acceptance of
// the uncompressed EOT is unverified on this machine (pptx report section 7).
import { hasPart, readPart, writePart } from './zip.ts';
import type { Package } from './zip.ts';

export type TtfInfo = {
  family: string;
  subfamily: string;
  fullName: string;
  version: string;
  weightClass: number;
  italic: boolean;
  fsType: number;
  panose: Uint8Array;
  unicodeRange: [number, number, number, number];
  codePageRange: [number, number];
  checkSumAdjustment: number;
  /** The number of glyphs, for the report. */
  numGlyphs: number;
};

function tables(bytes: Uint8Array): Map<string, { offset: number; length: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = view.getUint32(0);
  // 0x00010000 TrueType, 'OTTO' CFF, 'true' Apple; a font collection or a woff is not accepted
  if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565)
    throw new TypeError('ooxml/fonts: not a TrueType or OpenType font file');
  const numTables = view.getUint16(4);
  const out = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16;
    const name = Buffer.from(bytes.buffer, bytes.byteOffset + at, 4).toString('latin1');
    out.set(name, { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  return out;
}

function nameRecords(
  bytes: Uint8Array,
  table: { offset: number; length: number },
): Map<number, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = table.offset;
  const count = view.getUint16(base + 2);
  const stringOffset = base + view.getUint16(base + 4);
  const out = new Map<number, string>();
  const rank = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    const at = base + 6 + i * 12;
    const platform = view.getUint16(at);
    const encoding = view.getUint16(at + 2);
    const language = view.getUint16(at + 4);
    const nameId = view.getUint16(at + 6);
    const length = view.getUint16(at + 8);
    const offset = view.getUint16(at + 10);
    let value: string;
    let score: number;
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      value = Buffer.from(bytes.buffer, bytes.byteOffset + stringOffset + offset, length)
        .swap16()
        .toString('utf16le');
      score = language === 0x0409 ? 3 : 2;
    } else if (platform === 1 && encoding === 0) {
      value = Buffer.from(bytes.buffer, bytes.byteOffset + stringOffset + offset, length).toString(
        'latin1',
      );
      score = 1;
    } else continue;
    if ((rank.get(nameId) ?? 0) < score) {
      out.set(nameId, value);
      rank.set(nameId, score);
    }
  }
  return out;
}

/** The fields the EOT header needs, read from the name, OS/2 and head tables. */
export function readTtfInfo(bytes: Uint8Array): TtfInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dir = tables(bytes);
  const name = dir.get('name');
  const os2 = dir.get('OS/2');
  const head = dir.get('head');
  const maxp = dir.get('maxp');
  if (!name || !os2 || !head) throw new TypeError('ooxml/fonts: the font lacks name, OS/2 or head');
  const names = nameRecords(bytes, name);
  const os2Version = view.getUint16(os2.offset);
  const panose = bytes.slice(os2.offset + 32, os2.offset + 42);
  const macStyle = view.getUint16(head.offset + 44);
  return {
    family: names.get(16) ?? names.get(1) ?? '',
    subfamily: names.get(17) ?? names.get(2) ?? 'Regular',
    fullName: names.get(4) ?? names.get(1) ?? '',
    version: names.get(5) ?? '',
    weightClass: view.getUint16(os2.offset + 4),
    italic: (macStyle & 2) !== 0,
    fsType: view.getUint16(os2.offset + 8),
    panose,
    unicodeRange: [
      view.getUint32(os2.offset + 42),
      view.getUint32(os2.offset + 46),
      view.getUint32(os2.offset + 50),
      view.getUint32(os2.offset + 54),
    ],
    codePageRange:
      os2Version >= 1 ? [view.getUint32(os2.offset + 78), view.getUint32(os2.offset + 82)] : [0, 0],
    checkSumAdjustment: view.getUint32(head.offset + 8),
    numGlyphs: maxp ? view.getUint16(maxp.offset + 4) : 0,
  };
}

/** The EOT version written: the 0x00020001 layout with the root string fields. */
export const EOT_VERSION = 0x00020001;
export const EOT_MAGIC = 0x504c;

function utf16le(value: string): Buffer {
  return Buffer.from(value, 'utf16le');
}

/**
 * Wraps a TTF in an EOT header (https://www.w3.org/submissions/EOT/, section 2). Little-endian
 * throughout; the font data is uncompressed and not XORed (Flags 0), the form PowerPoint writes
 * for its own .fntdata parts.
 */
export function eotWrap(ttf: Uint8Array, info: TtfInfo = readTtfInfo(ttf)): Uint8Array {
  const family = utf16le(info.family);
  const style = utf16le(info.subfamily);
  const version = utf16le(info.version);
  const full = utf16le(info.fullName);
  const fixed = 82; // EOTSize .. Padding1
  const headerSize =
    fixed +
    2 +
    family.length +
    2 +
    2 +
    style.length +
    2 +
    2 +
    version.length +
    2 +
    2 +
    full.length +
    2 +
    2; // Padding5, RootStringSize (empty root string)
  const header = Buffer.alloc(headerSize);
  let o = 0;
  const u32 = (v: number): void => {
    header.writeUInt32LE(v >>> 0, o);
    o += 4;
  };
  const u16 = (v: number): void => {
    header.writeUInt16LE(v & 0xffff, o);
    o += 2;
  };
  u32(headerSize + ttf.byteLength); // EOTSize
  u32(ttf.byteLength); // FontDataSize
  u32(EOT_VERSION);
  u32(0); // Flags
  Buffer.from(info.panose).copy(header, o, 0, 10);
  o += 10;
  header[o] = 1; // Charset: DEFAULT_CHARSET
  o += 1;
  header[o] = info.italic ? 1 : 0;
  o += 1;
  u32(info.weightClass);
  u16(info.fsType);
  u16(EOT_MAGIC);
  for (const range of info.unicodeRange) u32(range);
  for (const range of info.codePageRange) u32(range);
  u32(info.checkSumAdjustment);
  u32(0);
  u32(0);
  u32(0);
  u32(0); // Reserved1..4
  u16(0); // Padding1
  u16(family.length);
  family.copy(header, o);
  o += family.length;
  u16(0); // Padding2
  u16(style.length);
  style.copy(header, o);
  o += style.length;
  u16(0); // Padding3
  u16(version.length);
  version.copy(header, o);
  o += version.length;
  u16(0); // Padding4
  u16(full.length);
  full.copy(header, o);
  o += full.length;
  u16(0); // Padding5
  u16(0); // RootStringSize
  if (o !== headerSize)
    throw new Error(`ooxml/fonts: EOT header size mismatch ${o} != ${headerSize}`);
  const out = new Uint8Array(headerSize + ttf.byteLength);
  out.set(header, 0);
  out.set(ttf, headerSize);
  return out;
}

/** The fields of an EOT header a test reads back. */
export function readEotHeader(eot: Uint8Array): {
  eotSize: number;
  fontDataSize: number;
  version: number;
  magic: number;
  family: string;
} {
  const view = new DataView(eot.buffer, eot.byteOffset, eot.byteLength);
  const familySize = view.getUint16(82, true);
  return {
    eotSize: view.getUint32(0, true),
    fontDataSize: view.getUint32(4, true),
    version: view.getUint32(8, true),
    magic: view.getUint16(34, true),
    family: Buffer.from(eot.buffer, eot.byteOffset + 84, familySize).toString('utf16le'),
  };
}

export type EmbedFont = { family: string; ttf: Uint8Array };

export type EmbedResult = { embedded: string[]; parts: string[]; warnings: string[] };

const FONT_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';

/** Embeds the fonts into the package. Families already listed are skipped. */
export async function embedFonts(zip: Package, fonts: EmbedFont[]): Promise<EmbedResult> {
  const result: EmbedResult = { embedded: [], parts: [], warnings: [] };
  if (fonts.length === 0) return result;
  let contentTypes = await readPart(zip, '[Content_Types].xml');
  if (!/Extension="fntdata"/.test(contentTypes)) {
    contentTypes = contentTypes.replace(
      /(<Types[^>]*>)/,
      '$1<Default Extension="fntdata" ContentType="application/x-fontdata"/>',
    );
  }
  let rels = await readPart(zip, 'ppt/_rels/presentation.xml.rels');
  let presentation = await readPart(zip, 'ppt/presentation.xml');
  const existingIds = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  let nextRel = Math.max(0, ...existingIds) + 1;
  let fontIndex = 1;
  while (hasPart(zip, `ppt/fonts/font${fontIndex}.fntdata`)) fontIndex += 1;
  const entries: string[] = [];
  for (const font of fonts) {
    if (new RegExp(`<p:font typeface="${escapeRegExp(font.family)}"`).test(presentation)) continue;
    let info: TtfInfo;
    try {
      info = readTtfInfo(font.ttf);
    } catch (error) {
      result.warnings.push(
        `${font.family}: ${error instanceof Error ? error.message : String(error)}; not embedded`,
      );
      continue;
    }
    if (info.family !== font.family)
      result.warnings.push(
        `${font.family}: the file names itself "${info.family}"; PowerPoint matches the run typeface against the embedded name`,
      );
    if (info.fsType !== 0 && (info.fsType & 0x0002) !== 0) {
      result.warnings.push(`${font.family}: fsType ${info.fsType} forbids embedding; not embedded`);
      continue;
    }
    const part = `ppt/fonts/font${fontIndex}.fntdata`;
    const rId = `rIdFont${nextRel}`;
    writePart(zip, part, eotWrap(font.ttf, { ...info, family: font.family }));
    rels = rels.replace(
      /<\/Relationships>/,
      `<Relationship Id="${rId}" Type="${FONT_REL_TYPE}" Target="fonts/font${fontIndex}.fntdata"/></Relationships>`,
    );
    entries.push(
      `<p:embeddedFont><p:font typeface="${escapeXml(font.family)}" pitchFamily="34" charset="0"/><p:regular r:id="${rId}"/></p:embeddedFont>`,
    );
    result.embedded.push(font.family);
    result.parts.push(part);
    fontIndex += 1;
    nextRel += 1;
  }
  if (entries.length > 0) {
    if (/<p:embeddedFontLst>/.test(presentation)) {
      presentation = presentation.replace(
        '</p:embeddedFontLst>',
        `${entries.join('')}</p:embeddedFontLst>`,
      );
    } else if (/<p:notesSz[^>]*\/>/.test(presentation)) {
      presentation = presentation.replace(
        /(<p:notesSz[^>]*\/>)/,
        `$1<p:embeddedFontLst>${entries.join('')}</p:embeddedFontLst>`,
      );
    } else {
      presentation = presentation.replace(
        /(<p:sldSz[^>]*\/>)/,
        `$1<p:embeddedFontLst>${entries.join('')}</p:embeddedFontLst>`,
      );
    }
    if (!/embedTrueTypeFonts=/.test(presentation))
      presentation = presentation.replace(
        /<p:presentation\b/,
        '<p:presentation embedTrueTypeFonts="1"',
      );
    writePart(zip, '[Content_Types].xml', contentTypes);
    writePart(zip, 'ppt/_rels/presentation.xml.rels', rels);
    writePart(zip, 'ppt/presentation.xml', presentation);
  }
  return result;
}

/** The typefaces listed in presentation.xml's embeddedFontLst. */
export async function listEmbeddedFonts(zip: Package): Promise<string[]> {
  const presentation = await readPart(zip, 'ppt/presentation.xml');
  return [...presentation.matchAll(/<p:font typeface="([^"]+)"/g)].map((m) =>
    unescapeXml(m[1] ?? ''),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}
