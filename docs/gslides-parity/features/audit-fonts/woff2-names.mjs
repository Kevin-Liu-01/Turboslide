// Reads a woff2's name, head, OS/2, fvar and GSUB feature tags. Node only, no dependencies.
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const KNOWN = ['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];

function base128(buf, pos) {
  let acc = 0;
  for (let i = 0; i < 5; i += 1) {
    const b = buf[pos.o]; pos.o += 1;
    acc = (acc * 128) + (b & 0x7f);
    if ((b & 0x80) === 0) return acc;
  }
  throw new Error('bad base128');
}

export function readWoff2(path) {
  const buf = readFileSync(path);
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not woff2');
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  const pos = { o: 48 };
  const dir = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[pos.o]; pos.o += 1;
    let tag;
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', pos.o, pos.o + 4); pos.o += 4; }
    else tag = KNOWN[flags & 0x3f];
    const transform = (flags >> 6) & 0x03;
    const origLength = base128(buf, pos);
    let transformLength = origLength;
    const transformed = (tag === 'glyf' || tag === 'loca') ? transform === 0 : transform !== 0;
    if (transformed) transformLength = base128(buf, pos);
    dir.push({ tag, origLength, transformLength, transformed });
  }
  const data = brotliDecompressSync(buf.subarray(pos.o, pos.o + totalCompressedSize));
  const tables = new Map();
  let off = 0;
  for (const t of dir) { tables.set(t.tag, data.subarray(off, off + t.transformLength)); off += t.transformLength; }
  return { bytes: buf.length, tables, dir };
}

function names(tbl) {
  const out = new Map();
  const count = tbl.readUInt16BE(2);
  const strOff = tbl.readUInt16BE(4);
  for (let i = 0; i < count; i += 1) {
    const r = 6 + i * 12;
    const platform = tbl.readUInt16BE(r);
    const nameId = tbl.readUInt16BE(r + 6);
    const len = tbl.readUInt16BE(r + 8);
    const o = tbl.readUInt16BE(r + 10);
    if (platform !== 3) continue;
    const raw = Buffer.from(tbl.subarray(strOff + o, strOff + o + len)); raw.swap16();
    if (!out.has(nameId)) out.set(nameId, raw.toString('utf16le'));
  }
  return out;
}

function fvar(tbl) {
  if (!tbl) return null;
  const axesOff = tbl.readUInt16BE(4);
  const axisCount = tbl.readUInt16BE(8);
  const axisSize = tbl.readUInt16BE(10);
  const instanceCount = tbl.readUInt16BE(12);
  const axes = [];
  for (let i = 0; i < axisCount; i += 1) {
    const a = axesOff + i * axisSize;
    axes.push({ tag: tbl.toString('latin1', a, a + 4), min: tbl.readInt32BE(a + 4) / 65536, def: tbl.readInt32BE(a + 8) / 65536, max: tbl.readInt32BE(a + 12) / 65536 });
  }
  return { axes, instanceCount };
}

function features(tbl) {
  if (!tbl) return [];
  const flOff = tbl.readUInt16BE(6);
  const count = tbl.readUInt16BE(flOff);
  const tags = new Set();
  for (let i = 0; i < count; i += 1) tags.add(tbl.toString('latin1', flOff + 2 + i * 6, flOff + 6 + i * 6));
  return [...tags].sort();
}

for (const path of process.argv.slice(2)) {
  const { bytes, tables, dir } = readWoff2(path);
  const n = names(tables.get('name'));
  const head = tables.get('head');
  const os2 = tables.get('OS/2');
  const rev = head.readInt32BE(4) / 65536;
  const upem = head.readUInt16BE(18);
  const created = Number(head.readBigInt64BE(20));
  const epoch = Date.UTC(1904, 0, 1) / 1000;
  const fsType = os2.readUInt16BE(8);
  const gsub = features(tables.get('GSUB'));
  const cv = gsub.filter((t) => /^cv\d\d$/.test(t));
  const ss = gsub.filter((t) => /^ss\d\d$/.test(t));
  console.log(JSON.stringify({
    path, bytes, tables: dir.map((d) => `${d.tag}:${d.origLength}`),
    family: n.get(1), subfamily: n.get(2), fullName: n.get(4), version: n.get(5), psName: n.get(6),
    typoFamily: n.get(16), typoSub: n.get(17), designer: n.get(9), copyright: n.get(0), license: n.get(13)?.slice(0, 120), licenseUrl: n.get(14),
    headRevision: rev.toFixed(3), unitsPerEm: upem, created: new Date((created + epoch) * 1000).toISOString(), fsType,
    fvar: fvar(tables.get('fvar')), gsubFeatures: gsub.filter((t) => !/^(cv|ss)\d\d$/.test(t)), cv, ss,
  }, null, 2));
}
