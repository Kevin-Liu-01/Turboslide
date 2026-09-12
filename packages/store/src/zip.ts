// A small zip writer and reader for deck bundles (docs/deck-transfer.md). The bundle is a plain
// zip so a person can open it with any archive tool, and the store needs no dependency for it:
// node:zlib deflates, inflates and computes the CRC. The writer emits one local header per entry
// with the sizes and the CRC set (no data descriptors), a central directory and the end record,
// in the order the caller gives, with one modification time for every entry, so the same files
// give the same bytes. The reader walks the central directory, which is what every archive tool
// writes last and trusts, and takes each entry's sizes and method from there, so an archive made
// by macOS Finder or `zip -r` (data descriptors, `__MACOSX/` folders) reads too. Methods 0 (store)
// and 8 (deflate) are the two the format's common writers use; zip64 archives (over 4 GB or
// 65,535 entries) are refused with a TypeError, as are entries whose inflated bytes do not match
// their recorded CRC or size.
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export type ZipEntry = {
  /** the entry name with `/` separators */
  name: string;
  data: Uint8Array;
};

export type WriteZipOptions = {
  /** the modification time stamped on every entry; defaults to 1980-01-01T00:00:00Z */
  date?: Date;
  /** deflate level 0 to 9; default 6 */
  level?: number;
};

export type ReadZipOptions = {
  /** the most bytes the entries may inflate to together; default 512 MiB */
  maxTotalBytes?: number;
};

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;
const ZIP64_END_RECORD = 0x06064b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
/** the general purpose flag that says the name is UTF-8 */
const FLAG_UTF8 = 0x0800;
/** version 2.0: deflate and directories */
const VERSION_NEEDED = 20;
/** made by: Unix (3) at version 3.0 */
const VERSION_MADE_BY = (3 << 8) | 30;
/** a regular file, 0644, in the Unix half of the external attributes */
const UNIX_FILE_ATTRS = 0o100644 << 16;
const DEFAULT_MAX_TOTAL = 512 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** The DOS date and time fields for a moment, clamped to the format's 1980 to 2107 range. */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  const time =
    (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);
  const dos = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, date: dos };
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/** Writes the entries as one archive. Names must be non-empty, relative, `/`-separated. */
export function writeZip(
  entries: ReadonlyArray<ZipEntry>,
  options: WriteZipOptions = {},
): Uint8Array<ArrayBuffer> {
  if (entries.length > 0xffff) {
    throw new TypeError(`A bundle holds at most 65535 entries; got ${entries.length}`);
  }
  const stamp = dosDateTime(options.date ?? new Date(Date.UTC(1980, 0, 1)));
  const level = options.level ?? 6;
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isEntryName(entry.name)) throw new TypeError(`"${entry.name}" is not a zip entry name`);
    if (seen.has(entry.name)) throw new TypeError(`"${entry.name}" appears twice in the bundle`);
    seen.add(entry.name);
    const name = encoder.encode(entry.name);
    if (name.byteLength > 0xffff) throw new TypeError(`"${entry.name}" is too long for a zip name`);
    const crc = crc32(entry.data) >>> 0;
    const deflated = deflateRawSync(entry.data, { level });
    const stored = deflated.byteLength >= entry.data.byteLength;
    const payload = stored ? entry.data : new Uint8Array(deflated);
    const method = stored ? METHOD_STORE : METHOD_DEFLATE;
    if (entry.data.byteLength >= 0xffffffff || offset >= 0xffffffff) {
      throw new TypeError('A bundle over 4 GB needs zip64, which the store does not write');
    }
    const local = new Uint8Array(30 + name.byteLength + payload.byteLength);
    const lv = new DataView(local.buffer);
    u32(lv, 0, LOCAL_HEADER);
    u16(lv, 4, VERSION_NEEDED);
    u16(lv, 6, FLAG_UTF8);
    u16(lv, 8, method);
    u16(lv, 10, stamp.time);
    u16(lv, 12, stamp.date);
    u32(lv, 14, crc);
    u32(lv, 18, payload.byteLength);
    u32(lv, 22, entry.data.byteLength);
    u16(lv, 26, name.byteLength);
    u16(lv, 28, 0);
    local.set(name, 30);
    local.set(payload, 30 + name.byteLength);
    locals.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    const cv = new DataView(central.buffer);
    u32(cv, 0, CENTRAL_HEADER);
    u16(cv, 4, VERSION_MADE_BY);
    u16(cv, 6, VERSION_NEEDED);
    u16(cv, 8, FLAG_UTF8);
    u16(cv, 10, method);
    u16(cv, 12, stamp.time);
    u16(cv, 14, stamp.date);
    u32(cv, 16, crc);
    u32(cv, 20, payload.byteLength);
    u32(cv, 24, entry.data.byteLength);
    u16(cv, 28, name.byteLength);
    u16(cv, 30, 0);
    u16(cv, 32, 0);
    u16(cv, 34, 0);
    u16(cv, 36, 0);
    u32(cv, 38, UNIX_FILE_ATTRS);
    u32(cv, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.byteLength;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, END_RECORD);
  u16(ev, 4, 0);
  u16(ev, 6, 0);
  u16(ev, 8, entries.length);
  u16(ev, 10, entries.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, offset);
  u16(ev, 20, 0);
  const out = new Uint8Array(offset + centralSize + end.byteLength);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/** A relative `/`-separated name with no empty, `.` or `..` segment and no control characters. */
export function isEntryName(name: string): boolean {
  if (name === '' || name.startsWith('/') || name.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex -- the format forbids control characters in names
  if (/[\u0000-\u001f]/.test(name)) return false;
  return name.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function findEndRecord(bytes: Uint8Array, view: DataView): number {
  const minimum = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let at = bytes.byteLength - 22; at >= minimum; at -= 1) {
    if (view.getUint32(at, true) === END_RECORD) return at;
  }
  throw new TypeError('Not a zip archive: the end of central directory record is missing');
}

/** Every file entry of an archive, in central directory order; directory entries are skipped. */
export function readZip(bytes: Uint8Array, options: ReadZipOptions = {}): ZipEntry[] {
  if (bytes.byteLength < 22) throw new TypeError('Not a zip archive: the file is too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endAt = findEndRecord(bytes, view);
  if (endAt >= 20 && view.getUint32(endAt - 20, true) === 0x07064b50) {
    throw new TypeError('zip64 archives are not supported; a bundle stays under 4 GB');
  }
  const count = view.getUint16(endAt + 10, true);
  const centralSize = view.getUint32(endAt + 12, true);
  const centralAt = view.getUint32(endAt + 16, true);
  if (count === 0xffff || centralSize === 0xffffffff || centralAt === 0xffffffff) {
    throw new TypeError('zip64 archives are not supported; a bundle stays under 4 GB');
  }
  if (centralAt + centralSize > endAt) {
    throw new TypeError('Not a zip archive: the central directory runs past the end record');
  }
  const maxTotal = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL;
  const entries: ZipEntry[] = [];
  let at = centralAt;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > bytes.byteLength || view.getUint32(at, true) !== CENTRAL_HEADER) {
      if (view.getUint32(at, true) === ZIP64_END_RECORD) {
        throw new TypeError('zip64 archives are not supported; a bundle stays under 4 GB');
      }
      throw new TypeError(`Not a zip archive: central directory entry ${index} is malformed`);
    }
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localAt === 0xffffffff) {
      throw new TypeError('zip64 archives are not supported; a bundle stays under 4 GB');
    }
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (!isEntryName(name)) throw new TypeError(`"${name}" is not a safe zip entry name`);
    total += size;
    if (total > maxTotal) {
      throw new TypeError(`The archive inflates past ${maxTotal} bytes, the bundle limit`);
    }
    if (localAt + 30 > bytes.byteLength || view.getUint32(localAt, true) !== LOCAL_HEADER) {
      throw new TypeError(`Not a zip archive: the local header of "${name}" is malformed`);
    }
    const localNameLength = view.getUint16(localAt + 26, true);
    const localExtraLength = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + localNameLength + localExtraLength;
    if (dataAt + compressedSize > bytes.byteLength) {
      throw new TypeError(`Not a zip archive: the data of "${name}" runs past the end`);
    }
    const payload = bytes.subarray(dataAt, dataAt + compressedSize);
    let data: Uint8Array;
    if (method === METHOD_STORE) {
      data = new Uint8Array(payload);
    } else if (method === METHOD_DEFLATE) {
      data = new Uint8Array(inflateRawSync(payload, { maxOutputLength: size + 1 }));
    } else {
      throw new TypeError(
        `"${name}" uses compression method ${method}; only store and deflate are read`,
      );
    }
    if (data.byteLength !== size) {
      throw new TypeError(
        `"${name}" inflates to ${data.byteLength} bytes, not the recorded ${size}`,
      );
    }
    if (crc32(data) >>> 0 !== crc) throw new TypeError(`"${name}" fails its CRC check`);
    entries.push({ name, data });
  }
  return entries;
}
