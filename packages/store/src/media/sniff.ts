// The media sniff (gslides-parity SPEC-5 1.1 rule 6, 3.3; R11 1.2): the container a file's first
// bytes announce, decided before any parser or decoder reads further, the way `sniffImage` in
// `bundle.ts` and `capture/shared.ts` guards the picture path. The signature table is R11 1.2's:
// `ftyp` at bytes 4 to 7 with the major brand at 8 (ISOBMFF: mp4, m4a, m4v, mov), the EBML header
// `1A 45 DF A3` with the `DocType` inside it (webm, matroska), `ID3` or an MPEG audio frame sync
// with Layer III (mp3), `RIFF` with `WAVE` at 8 (wav) or `AVI ` (avi), `OggS` (ogg), `fLaC` (flac)
// and the ADTS sync `FFF` with layer bits 00 (raw aac). The sniff names the container alone; which
// of them the intake accepts and with which sentence is `info.ts`'s table. Framework free, no
// Node import: `packages/headless/src/capture/shared.ts` re-exports it for `readInput` and
// `bundle.ts` calls it from the asset scan, so the two intakes and the bundle agree by construction.
import { codes, fourcc, startsWith } from './bytes.ts';
import { EBML_IDS } from './ebml.ts';
import { frameHeaderAt, id3v2Size, findFirstFrame } from './mp3.ts';

export type MediaContainer = 'isobmff' | 'ebml' | 'mp3' | 'wav' | 'avi' | 'ogg' | 'flac' | 'adts';

export type SniffedMedia =
  | { container: 'isobmff'; brand: string; compatible: string[] }
  | { container: 'ebml'; docType: string | null }
  | { container: 'mp3'; tagBytes: number; audioAt: number }
  | { container: 'wav' }
  | { container: 'avi' }
  | { container: 'ogg' }
  | { container: 'flac' }
  | { container: 'adts' };

/** How many bytes the sniff needs at most: the EBML header's DocType sits inside the first 64 bytes, an ID3 tag can be longer, so the mp3 search reads up to this window. */
export const SNIFF_WINDOW_BYTES = 65536;

/** The DocType inside the EBML header (the first element), or null when the header lacks one in the window. */
function ebmlDocType(bytes: Uint8Array): string | null {
  // the header's size vint follows its four byte id; the children are (id, size, data) rows
  let at = 4;
  const size = vint(bytes, at, false);
  if (size === null) return null;
  at += size.length;
  const end = Math.min(bytes.byteLength, at + size.value);
  let guard = 0;
  while (at < end && guard < 32) {
    guard += 1;
    const id = vint(bytes, at, true);
    if (id === null) return null;
    const childSize = vint(bytes, at + id.length, false);
    if (childSize === null) return null;
    const dataAt = at + id.length + childSize.length;
    if (id.value === EBML_IDS.docType) {
      const length = Math.min(childSize.value, 32, bytes.byteLength - dataAt);
      let text = '';
      for (let i = 0; i < length; i++) {
        const byte = bytes[dataAt + i] as number;
        if (byte === 0) break;
        text += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '?';
      }
      return text;
    }
    at = dataAt + childSize.value;
  }
  return null;
}

function vint(
  bytes: Uint8Array,
  at: number,
  id: boolean,
): { value: number; length: number } | null {
  if (at >= bytes.byteLength) return null;
  const first = bytes[at] as number;
  if (first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while ((first & mask) === 0) {
    length += 1;
    mask >>= 1;
  }
  if (length > 8 || at + length > bytes.byteLength) return null;
  let value = id ? first : first & (mask - 1);
  for (let i = 1; i < length; i++) value = value * 256 + (bytes[at + i] as number);
  return { value, length };
}

/** The container the bytes carry by their signature; null when they are none of the eight. */
export function sniffMedia(bytes: Uint8Array): SniffedMedia | null {
  if (startsWith(bytes, codes('RIFF')) && bytes.byteLength >= 12) {
    if (startsWith(bytes, codes('WAVE'), 8)) return { container: 'wav' };
    if (startsWith(bytes, codes('AVI '), 8)) return { container: 'avi' };
    return null; // WebP is RIFF too and belongs to the picture sniff
  }
  if (bytes.byteLength >= 12 && fourcc(bytes, 4) === 'ftyp') {
    const brand = fourcc(bytes, 8);
    const compatible: string[] = [];
    const boxSize =
      ((bytes[0] as number) << 24) |
      ((bytes[1] as number) << 16) |
      ((bytes[2] as number) << 8) |
      (bytes[3] as number);
    const end = Math.min(bytes.byteLength, boxSize > 16 ? boxSize : 16, 256);
    for (let at = 16; at + 4 <= end; at += 4) {
      const row = fourcc(bytes, at);
      if (/[A-Za-z0-9]/.test(row)) compatible.push(row);
    }
    return { container: 'isobmff', brand, compatible };
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { container: 'ebml', docType: ebmlDocType(bytes) };
  }
  if (startsWith(bytes, codes('OggS'))) return { container: 'ogg' };
  if (startsWith(bytes, codes('fLaC'))) return { container: 'flac' };
  // an mp3: an ID3v2 tag, or a Layer III frame sync confirmed by a second frame; ADTS raw AAC shares
  // the twelve bit sync and has layer bits 00, which frameHeaderAt refuses, so it is told apart here
  const tagBytes = id3v2Size(bytes);
  const first =
    tagBytes > 0 ||
    (bytes.byteLength >= 2 &&
      (bytes[0] as number) === 0xff &&
      ((bytes[1] as number) & 0xe0) === 0xe0)
      ? findFirstFrame(bytes, tagBytes, SNIFF_WINDOW_BYTES)
      : -1;
  if (first >= 0) {
    const header = frameHeaderAt(bytes, first);
    if (header !== null && header.layer === 3)
      return { container: 'mp3', tagBytes, audioAt: first };
  }
  if (
    bytes.byteLength >= 7 &&
    (bytes[0] as number) === 0xff &&
    ((bytes[1] as number) & 0xf6) === 0xf0
  ) {
    return { container: 'adts' };
  }
  if (tagBytes > 0) return { container: 'mp3', tagBytes, audioAt: -1 }; // a tag with no frame in the window: the parser decides
  return null;
}
