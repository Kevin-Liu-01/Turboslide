// The Brand kit import (the Glyphfield port, wave 2 item 6, product.md item 17): a Glyphfield kit
// ZIP, or its `tokens/tokens.json` alone, gives the kit its colours in one write. The file is the
// Design Tokens Community Group JSON Glyphfield exports (its src/lib/brandTokens.ts
// `brandDesignTokens`): `semantic.<light|dark>.<role>` holds an alias such as `{color.ink}` or
// `{palette.ink.700}`, and the alias's token holds the colour as `{ colorSpace, components, hex }`.
// Four of Glyphfield's roles have a place in a Turboslide kit (packages/schema/src/brand.ts):
// background is Background, foreground is Text, foreground-muted is Captions and Hints (its use
// reads "secondary text, hints and metadata"), primary is Primary. Accent is left to follow
// Primary. Every other role is refused by name, and a file without a light or dark role is refused
// whole. The ZIP is read here with the browser's DecompressionStream for a deflated entry, so the
// import adds no dependency; Glyphfield writes its kits stored, without compression.
import type { KitColor } from '@turboslide/schema/brand';
import type { HexColor } from '@turboslide/schema/color';
import { isHexColor } from '@turboslide/schema/color';
import { APPEARANCES } from '@turboslide/schema/deck';
import { toHex } from '@turboslide/theme/contrast';

/** Glyphfield's semantic roles and the kit roles each one writes. */
const KIT_IMPORT_ROLES: Readonly<Record<string, readonly KitColor[]>> = {
  background: ['background'],
  foreground: ['text'],
  'foreground-muted': ['caption', 'hint'],
  primary: ['primary'],
};

/** The largest kit file read, ZIP or JSON: a kit is tokens, logos and a few font files. */
const KIT_IMPORT_MAX_BYTES = 32 * 1024 * 1024;

export type KitImport = {
  /** the kit writes, `/colors/<appearance>/<role>`, in appearance then role order */
  writes: [pointer: string, value: HexColor][];
  /** Glyphfield's roles that have no place in the kit, each named once */
  refused: string[];
};

const decoder = new TextDecoder();

/** The bytes of the ZIP entry whose name ends with `tokens.json`, `tokens/tokens.json` first. */
async function tokensEntry(zip: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  /* the end of central directory record: 22 bytes, then a comment of up to 65,535 */
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new RangeError('This file is not a ZIP archive Turboslide can read');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const found: { name: string; method: number; size: number; local: number }[] = [];
  for (let n = 0; n < count && at + 46 <= zip.length; n += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));
    if (/(^|\/)tokens\.json$/.test(name)) found.push({ name, method, size, local });
    at += 46 + nameLength + extra + comment;
  }
  const entry =
    found.find((candidate) => /(^|\/)tokens\/tokens\.json$/.test(candidate.name)) ?? found[0];
  if (entry === undefined) throw new RangeError('This ZIP holds no tokens.json');
  if (view.getUint32(entry.local, true) !== 0x04034b50)
    throw new RangeError('This ZIP’s tokens.json could not be read');
  const start =
    entry.local +
    30 +
    view.getUint16(entry.local + 26, true) +
    view.getUint16(entry.local + 28, true);
  const data = zip.subarray(start, start + entry.size);
  if (entry.method === 0) return data;
  if (entry.method !== 8)
    throw new RangeError('This ZIP’s tokens.json is compressed in a way Turboslide cannot read');
  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The JSON of a kit file: a ZIP's tokens.json, or the file itself. */
export async function readKitFile(bytes: Uint8Array): Promise<unknown> {
  if (bytes.length > KIT_IMPORT_MAX_BYTES) throw new RangeError('This file is larger than 32 MB');
  const zip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3;
  const text = decoder.decode(zip ? await tokensEntry(bytes) : bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RangeError('This file is not a ZIP or a JSON file');
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** The hex of a token's `$value`: `{ hex }`, `{ components }` in sRGB 0 to 1, or a hex string. */
function hexOfValue(value: unknown): string | null {
  if (typeof value === 'string') return isHexColor(value) ? value.toLowerCase() : null;
  const color = record(value);
  if (color === null) return null;
  if (typeof color.hex === 'string' && isHexColor(color.hex)) return color.hex.toLowerCase();
  const parts = color.components;
  if (
    (color.colorSpace === undefined || color.colorSpace === 'srgb') &&
    Array.isArray(parts) &&
    parts.length >= 3 &&
    parts.slice(0, 3).every((part) => typeof part === 'number' && part >= 0 && part <= 1)
  ) {
    const [r, g, b] = parts as number[];
    return toHex({ r: (r ?? 0) * 255, g: (g ?? 0) * 255, b: (b ?? 0) * 255, a: 1 });
  }
  return null;
}

/** A token's colour, following `{group.name}` aliases through the file, at most eight deep. */
function resolve(tokens: Record<string, unknown>, value: unknown, depth = 0): string | null {
  if (depth > 8) return null;
  if (typeof value === 'string') {
    const alias = /^\{([^{}]+)\}$/.exec(value.trim());
    if (alias === null) return hexOfValue(value);
    let node: unknown = tokens;
    for (const key of (alias[1] ?? '').split('.')) node = record(node)?.[key];
    return resolve(tokens, record(node)?.$value, depth + 1);
  }
  return hexOfValue(value);
}

/**
 * The kit writes of a Glyphfield token file. Throws a RangeError, one sentence, when the file
 * holds no light or dark role that has a place in the kit.
 */
export function kitColorsOf(json: unknown): KitImport {
  const tokens = record(json);
  const semantic = record(tokens?.semantic);
  if (tokens === null || semantic === null)
    throw new RangeError(
      'This file holds no Glyphfield color roles (semantic.light or semantic.dark)',
    );
  const writes: [string, HexColor][] = [];
  const refused = new Set<string>();
  for (const appearance of APPEARANCES) {
    const roles = record(semantic[appearance]);
    if (roles === null) continue;
    for (const [name, token] of Object.entries(roles)) {
      const targets = KIT_IMPORT_ROLES[name];
      if (targets === undefined) {
        if (!name.startsWith('$')) refused.add(name);
        continue;
      }
      const hex = resolve(tokens, record(token)?.$value);
      if (hex === null || !isHexColor(hex)) {
        refused.add(name);
        continue;
      }
      for (const role of targets) writes.push([`/colors/${appearance}/${role}`, hex]);
    }
  }
  if (writes.length === 0)
    throw new RangeError('This file holds no color role a Turboslide kit can take');
  return { writes, refused: [...refused] };
}
