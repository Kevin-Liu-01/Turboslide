// A reader of the tables a test or a fetch needs from a woff2 file (docs/FEATURES.md 3.1 items 1
// and 4; ported from the audit's `docs/gslides-parity/features/audit-fonts/woff2-names.mjs`): the
// table directory with its variable length sizes, one brotli stream over every table, then the
// `name` table's Windows strings, the `head` table's units per em and the GSUB feature tags. The
// glyf and loca tables arrive transformed and are not read. Node only (`node:zlib`); inter.test.ts
// reads the italic file's version string from its bytes and catalog.test.ts the `tnum` flag of
// every family from the committed files.
import { brotliDecompressSync } from 'node:zlib';

/** The tags the woff2 directory names by index (the WOFF2 specification's known table tags). */
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
] as const;

export type Woff2Tables = {
  bytes: number;
  /** the untransformed tables by tag (glyf and loca are transformed and left out) */
  tables: ReadonlyMap<string, Buffer>;
};

function base128(buf: Buffer, pos: { o: number }): number {
  let acc = 0;
  for (let i = 0; i < 5; i += 1) {
    const b = buf[pos.o] ?? 0;
    pos.o += 1;
    acc = acc * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) return acc;
  }
  throw new Error('woff2: a base 128 number runs past five bytes');
}

/** The tables of a woff2 buffer; throws on anything but the `wOF2` signature. */
export function readWoff2(buf: Buffer): Woff2Tables {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('woff2: not a woff2 file');
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  const pos = { o: 48 };
  const dir: { tag: string; length: number; transformed: boolean }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[pos.o] ?? 0;
    pos.o += 1;
    let tag: string;
    if ((flags & 0x3f) === 63) {
      tag = buf.toString('latin1', pos.o, pos.o + 4);
      pos.o += 4;
    } else tag = KNOWN_TAGS[flags & 0x3f] ?? '????';
    const transform = (flags >> 6) & 0x03;
    const origLength = base128(buf, pos);
    const transformed = tag === 'glyf' || tag === 'loca' ? transform === 0 : transform !== 0;
    const length = transformed ? base128(buf, pos) : origLength;
    dir.push({ tag, length, transformed });
  }
  const data = brotliDecompressSync(buf.subarray(pos.o, pos.o + totalCompressedSize));
  const tables = new Map<string, Buffer>();
  let off = 0;
  for (const t of dir) {
    if (!t.transformed) tables.set(t.tag, data.subarray(off, off + t.length));
    off += t.length;
  }
  return { bytes: buf.length, tables };
}

/** The Windows (platform 3) strings of the `name` table by name ID; the first record of an ID wins. */
export function nameStrings(tables: ReadonlyMap<string, Buffer>): ReadonlyMap<number, string> {
  const tbl = tables.get('name');
  const out = new Map<number, string>();
  if (tbl === undefined) return out;
  const count = tbl.readUInt16BE(2);
  const strOff = tbl.readUInt16BE(4);
  for (let i = 0; i < count; i += 1) {
    const r = 6 + i * 12;
    const platform = tbl.readUInt16BE(r);
    const nameId = tbl.readUInt16BE(r + 6);
    const len = tbl.readUInt16BE(r + 8);
    const o = tbl.readUInt16BE(r + 10);
    if (platform !== 3) continue;
    const raw = Buffer.from(tbl.subarray(strOff + o, strOff + o + len));
    raw.swap16();
    if (!out.has(nameId)) out.set(nameId, raw.toString('utf16le'));
  }
  return out;
}

/** The GSUB feature tags a file carries, sorted and unique; empty without a GSUB table. */
export function gsubFeatures(tables: ReadonlyMap<string, Buffer>): string[] {
  const tbl = tables.get('GSUB');
  if (tbl === undefined) return [];
  const flOff = tbl.readUInt16BE(6);
  const count = tbl.readUInt16BE(flOff);
  const tags = new Set<string>();
  for (let i = 0; i < count; i += 1)
    tags.add(tbl.toString('latin1', flOff + 2 + i * 6, flOff + 6 + i * 6));
  return [...tags].sort();
}

/** The facts the tests read from one woff2: the name table's family, subfamily and version and the GSUB tags. */
export function woff2Facts(buf: Buffer): {
  family: string | undefined;
  subfamily: string | undefined;
  version: string | undefined;
  features: string[];
} {
  const { tables } = readWoff2(buf);
  const names = nameStrings(tables);
  return {
    family: names.get(16) ?? names.get(1),
    subfamily: names.get(17) ?? names.get(2),
    version: names.get(5),
    features: gsubFeatures(tables),
  };
}
