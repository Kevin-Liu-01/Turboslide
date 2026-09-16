// Byte readers shared by the four media parsers (gslides-parity SPEC-5 3.3; R11 1.2, 1.3): big
// endian for ISOBMFF and EBML, little endian for RIFF, four character codes and ASCII runs, each
// bounds checked so a truncated file raises `MediaParseError` instead of reading undefined. No
// Node import: the module runs in the function, in the CLI and in the browser (the editor's drop
// path slices a `File` and hands the bytes to the same parsers).

/** A container the parser cannot read: truncated, malformed, or a shape outside the accepted set. */
export class MediaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaParseError';
  }
}

export function need(bytes: Uint8Array, at: number, length: number, what: string): void {
  if (at < 0 || !Number.isFinite(at) || at + length > bytes.byteLength) {
    throw new MediaParseError(`${what} at byte ${at} runs past the end of the file`);
  }
}

export function u8(bytes: Uint8Array, at: number): number {
  need(bytes, at, 1, 'a byte');
  return bytes[at] as number;
}

export function u16be(bytes: Uint8Array, at: number): number {
  need(bytes, at, 2, 'a 16 bit field');
  return ((bytes[at] as number) << 8) | (bytes[at + 1] as number);
}

export function u32be(bytes: Uint8Array, at: number): number {
  need(bytes, at, 4, 'a 32 bit field');
  return (
    (((bytes[at] as number) << 24) >>> 0) +
    ((bytes[at + 1] as number) << 16) +
    ((bytes[at + 2] as number) << 8) +
    (bytes[at + 3] as number)
  );
}

/** A 64 bit unsigned field as a number; over 2^53 the value is inexact, which no media file reaches. */
export function u64be(bytes: Uint8Array, at: number): number {
  need(bytes, at, 8, 'a 64 bit field');
  return u32be(bytes, at) * 0x1_0000_0000 + u32be(bytes, at + 4);
}

export function u16le(bytes: Uint8Array, at: number): number {
  need(bytes, at, 2, 'a 16 bit field');
  return (bytes[at] as number) | ((bytes[at + 1] as number) << 8);
}

export function u32le(bytes: Uint8Array, at: number): number {
  need(bytes, at, 4, 'a 32 bit field');
  return (
    (bytes[at] as number) +
    ((bytes[at + 1] as number) << 8) +
    ((bytes[at + 2] as number) << 16) +
    (((bytes[at + 3] as number) << 24) >>> 0)
  );
}

/** A big endian IEEE float of 4 or 8 bytes (EBML's Duration and SamplingFrequency). */
export function floatBe(bytes: Uint8Array, at: number, length: number): number {
  need(bytes, at, length, 'a float');
  const view = new DataView(bytes.buffer, bytes.byteOffset + at, length);
  if (length === 4) return view.getFloat32(0);
  if (length === 8) return view.getFloat64(0);
  throw new MediaParseError(`a float of ${length} bytes is not 4 or 8`);
}

/** A little endian IEEE float32 (the WAV float sub format is read as samples, never here; kept for symmetry). */
export function floatLe(bytes: Uint8Array, at: number): number {
  need(bytes, at, 4, 'a float');
  return new DataView(bytes.buffer, bytes.byteOffset + at, 4).getFloat32(0, true);
}

/** A run of ASCII bytes as a string; a byte outside printable ASCII becomes `?` so a code never carries control characters. */
export function ascii(bytes: Uint8Array, at: number, length: number): string {
  need(bytes, at, length, 'a string');
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[at + i] as number;
    out += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '?';
  }
  return out;
}

/** A four character code (ISOBMFF box types and brands, RIFF chunk ids). */
export function fourcc(bytes: Uint8Array, at: number): string {
  return ascii(bytes, at, 4);
}

/** True when `signature` sits at `at`; false (never a throw) when the file is shorter. */
export function startsWith(bytes: Uint8Array, signature: ReadonlyArray<number>, at = 0): boolean {
  if (at < 0 || bytes.byteLength < at + signature.length) return false;
  return signature.every((byte, index) => bytes[at + index] === byte);
}

/** The bytes of an ASCII string, for signature tables written as text (`ftyp`, `WAVE`, `OggS`). */
export function codes(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}
