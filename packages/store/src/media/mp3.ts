// The MP3 parser (gslides-parity SPEC-5 3.3; R11 1.2, 1.3): the ID3v2 tag skip (a 28 bit
// synchsafe size, ten more bytes when the footer flag is set), the frame header (eleven sync
// bits, the version, layer, bitrate, sample rate, padding and channel mode fields with the
// MPEG-1, MPEG-2 and MPEG-2.5 tables), the `Xing` or `Info` header with its frame count and the
// LAME extension's encoder delay and padding, the `VBRI` header, and the exact fallback: a walk
// over every frame header counting samples. The duration is what ffprobe reports for the same
// bytes within 20 ms (`fixtures/media/facts.json`): with a Xing frame count and a LAME tag the
// delay and padding samples are subtracted, which is why a one second tone reads 1000 ms and not
// the 1152 ms its sixteen 576 sample frames hold; without a header the frame walk counts what is
// there. Framework free; `sniff.ts` reads `id3v2Size` and `frameHeaderAt` to recognise the
// format, `info.ts` calls `parseMp3`.
import { MediaParseError, ascii, startsWith, u32be } from './bytes.ts';

/** MPEG audio version from the two version bits: 3 is MPEG-1, 2 is MPEG-2, 0 is MPEG-2.5; 1 is reserved. */
export type MpegVersion = 1 | 2 | 2.5;

export type Mp3FrameHeader = {
  version: MpegVersion;
  /** 1, 2 or 3; the intake accepts Layer III alone (an `.mp3`), the others are named in the refusal */
  layer: 1 | 2 | 3;
  bitrateKbps: number;
  sampleRate: number;
  padding: boolean;
  /** 0 stereo, 1 joint stereo, 2 dual channel, 3 mono */
  channelMode: number;
  channels: 1 | 2;
  samplesPerFrame: number;
  /** the whole frame including its four header bytes */
  frameBytes: number;
};

export type Mp3Info = {
  /** where the first frame starts (after the ID3v2 tag and any junk before the sync) */
  audioAt: number;
  header: Mp3FrameHeader;
  /** which header supplied the frame count, or null for the frame walk */
  vbrHeader: 'xing' | 'info' | 'vbri' | null;
  frames: number;
  /** the LAME tag's encoder delay and padding in samples, when the tag is present */
  encoderDelay?: number;
  encoderPadding?: number;
  durationMs: number;
  /** the average over the stream (the frame count and the byte count), rounded */
  bitrateKbps: number;
  sampleRate: number;
  channels: 1 | 2;
};

// bitrate tables in kbps by [version group][layer][index 1 to 14]; index 0 is free format, 15 is bad
const BITRATES_MPEG1: Record<1 | 2 | 3, ReadonlyArray<number>> = {
  1: [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
};
const BITRATES_MPEG2: Record<1 | 2 | 3, ReadonlyArray<number>> = {
  1: [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES: Record<MpegVersion, ReadonlyArray<number>> = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
};

/** The ID3v2 tag's byte length at the start of the file, or 0 when there is none (S9 3.1, 3.4, 6.2). */
export function id3v2Size(bytes: Uint8Array, at = 0): number {
  if (!startsWith(bytes, [0x49, 0x44, 0x33], at)) return 0; // 'ID3'
  if (bytes.byteLength < at + 10) return 0;
  const major = bytes[at + 3] as number;
  if (major === 0xff || (bytes[at + 4] as number) === 0xff) return 0;
  const flags = bytes[at + 5] as number;
  const size =
    ((bytes[at + 6] as number) << 21) |
    ((bytes[at + 7] as number) << 14) |
    ((bytes[at + 8] as number) << 7) |
    (bytes[at + 9] as number);
  if (
    ((bytes[at + 6] as number) |
      (bytes[at + 7] as number) |
      (bytes[at + 8] as number) |
      (bytes[at + 9] as number)) &
    0x80
  )
    return 0;
  const footer = major >= 4 && (flags & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/** The frame header at `at`, or null when the four bytes are not a valid MPEG audio frame header (S7). */
export function frameHeaderAt(bytes: Uint8Array, at: number): Mp3FrameHeader | null {
  if (at < 0 || at + 4 > bytes.byteLength) return null;
  const b1 = bytes[at] as number;
  const b2 = bytes[at + 1] as number;
  const b3 = bytes[at + 2] as number;
  const b4 = bytes[at + 3] as number;
  if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null;
  const versionBits = (b2 >> 3) & 0x3;
  const layerBits = (b2 >> 1) & 0x3;
  if (versionBits === 1 || layerBits === 0) return null;
  const version: MpegVersion = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer = (4 - layerBits) as 1 | 2 | 3;
  const bitrateIndex = (b3 >> 4) & 0xf;
  const rateIndex = (b3 >> 2) & 0x3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const table = version === 1 ? BITRATES_MPEG1 : BITRATES_MPEG2;
  const bitrateKbps = table[layer][bitrateIndex - 1] as number;
  const sampleRate = SAMPLE_RATES[version][rateIndex] as number;
  const padding = ((b3 >> 1) & 0x1) === 1;
  const channelMode = (b4 >> 6) & 0x3;
  const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576;
  const frameBytes =
    layer === 1
      ? (Math.floor((12 * bitrateKbps * 1000) / sampleRate) + (padding ? 1 : 0)) * 4
      : Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) + (padding ? 1 : 0);
  return {
    version,
    layer,
    bitrateKbps,
    sampleRate,
    padding,
    channelMode,
    channels: channelMode === 3 ? 1 : 2,
    samplesPerFrame,
    frameBytes,
  };
}

/**
 * The offset of the first frame header from `from` that is followed by a second valid header at
 * its frame length (so a stray sync byte inside a tag is not taken for a frame), searched over
 * `window` bytes; -1 when none. A header whose next frame would start past the end of the file
 * is accepted when it is the only frame (a one frame file).
 */
export function findFirstFrame(bytes: Uint8Array, from: number, window = 65536): number {
  const end = Math.min(bytes.byteLength - 4, from + window);
  for (let at = from; at <= end; at++) {
    if ((bytes[at] as number) !== 0xff) continue;
    const header = frameHeaderAt(bytes, at);
    if (header === null) continue;
    const nextAt = at + header.frameBytes;
    if (nextAt >= bytes.byteLength) return at;
    const next = frameHeaderAt(bytes, nextAt);
    if (next !== null && next.version === header.version && next.layer === header.layer) return at;
  }
  return -1;
}

/** The side information length after the four header bytes; the Xing header sits right after it (S8). */
function sideInfoBytes(header: Mp3FrameHeader): number {
  if (header.version === 1) return header.channels === 1 ? 17 : 32;
  return header.channels === 1 ? 9 : 17;
}

type VbrHeader = {
  kind: 'xing' | 'info' | 'vbri';
  frames: number | null;
  bytes: number | null;
  encoderDelay?: number;
  encoderPadding?: number;
};

function readXing(bytes: Uint8Array, at: number, header: Mp3FrameHeader): VbrHeader | null {
  const xingAt = at + 4 + sideInfoBytes(header);
  if (xingAt + 8 > bytes.byteLength) return null;
  const tag = ascii(bytes, xingAt, 4);
  if (tag !== 'Xing' && tag !== 'Info') return null;
  const flags = u32be(bytes, xingAt + 4);
  let cursor = xingAt + 8;
  let frames: number | null = null;
  let byteCount: number | null = null;
  if (flags & 0x1) {
    frames = u32be(bytes, cursor);
    cursor += 4;
  }
  if (flags & 0x2) {
    byteCount = u32be(bytes, cursor);
    cursor += 4;
  }
  if (flags & 0x4) cursor += 100; // the table of contents
  if (flags & 0x8) cursor += 4; // the quality indicator
  const out: VbrHeader = { kind: tag === 'Xing' ? 'xing' : 'info', frames, bytes: byteCount };
  // the LAME extension: a 9 byte encoder string, then at +21 twelve bits of delay and twelve of padding
  if (cursor + 24 <= bytes.byteLength) {
    const encoder = ascii(bytes, cursor, 4);
    if (encoder === 'LAME' || encoder === 'Lavc' || encoder === 'Lavf') {
      const b0 = bytes[cursor + 21] as number;
      const b1 = bytes[cursor + 22] as number;
      const b2 = bytes[cursor + 23] as number;
      out.encoderDelay = (b0 << 4) | (b1 >> 4);
      out.encoderPadding = ((b1 & 0xf) << 8) | b2;
    }
  }
  return out;
}

function readVbri(bytes: Uint8Array, at: number): VbrHeader | null {
  const vbriAt = at + 4 + 32;
  if (vbriAt + 26 > bytes.byteLength) return null;
  if (ascii(bytes, vbriAt, 4) !== 'VBRI') return null;
  return {
    kind: 'vbri',
    bytes: u32be(bytes, vbriAt + 10),
    frames: u32be(bytes, vbriAt + 14),
  };
}

/** Walks every frame from `at`, summing samples until the headers stop (an ID3v1 tag, an APE tag, the end). */
function walkFrames(
  bytes: Uint8Array,
  at: number,
): { frames: number; samples: number; sampleRate: number; bytes: number } {
  let cursor = at;
  let frames = 0;
  let seconds = 0;
  let sampleRate = 0;
  while (cursor + 4 <= bytes.byteLength) {
    const header = frameHeaderAt(bytes, cursor);
    if (header === null) break;
    if (cursor + header.frameBytes > bytes.byteLength) {
      // a final frame cut short still holds its header; count it as ffprobe's size estimate would
      frames += 1;
      seconds += header.samplesPerFrame / header.sampleRate;
      sampleRate = header.sampleRate;
      cursor = bytes.byteLength;
      break;
    }
    frames += 1;
    seconds += header.samplesPerFrame / header.sampleRate;
    sampleRate = header.sampleRate;
    cursor += header.frameBytes;
  }
  return { frames, samples: seconds * (sampleRate || 1), sampleRate, bytes: cursor - at };
}

/**
 * Reads an MP3 stream: the tag is skipped, the first frame gives the stream facts, a Xing, Info or
 * VBRI header gives the frame count (with the LAME delay and padding subtracted when present),
 * otherwise every frame is walked. Throws `MediaParseError` when no frame is found or the first
 * frame is not Layer III.
 */
export function parseMp3(bytes: Uint8Array): Mp3Info {
  const tag = id3v2Size(bytes);
  const audioAt = findFirstFrame(bytes, tag);
  if (audioAt < 0) throw new MediaParseError('no MPEG audio frame follows the tag');
  const header = frameHeaderAt(bytes, audioAt);
  if (header === null) throw new MediaParseError('no MPEG audio frame follows the tag');
  if (header.layer !== 3) {
    throw new MediaParseError(
      `an MPEG Layer ${header.layer === 1 ? 'I' : 'II'} stream is not an mp3`,
    );
  }
  const vbr = readXing(bytes, audioAt, header) ?? readVbri(bytes, audioAt);
  let frames: number;
  let streamBytes: number;
  let durationMs: number;
  if (vbr !== null && vbr.frames !== null && vbr.frames > 0) {
    frames = vbr.frames;
    streamBytes = vbr.bytes ?? bytes.byteLength - audioAt;
    let samples = frames * header.samplesPerFrame;
    if (vbr.encoderDelay !== undefined && vbr.encoderPadding !== undefined) {
      samples = Math.max(0, samples - vbr.encoderDelay - vbr.encoderPadding);
    }
    durationMs = Math.round((samples * 1000) / header.sampleRate);
  } else {
    const walk = walkFrames(bytes, audioAt);
    frames = walk.frames;
    streamBytes = walk.bytes;
    durationMs = Math.round((walk.samples * 1000) / (walk.sampleRate || header.sampleRate));
  }
  const seconds = durationMs / 1000;
  const bitrateKbps =
    seconds > 0 ? Math.round((streamBytes * 8) / seconds / 1000) : header.bitrateKbps;
  const info: Mp3Info = {
    audioAt,
    header,
    vbrHeader: vbr?.kind ?? null,
    frames,
    durationMs,
    bitrateKbps,
    sampleRate: header.sampleRate,
    channels: header.channels,
  };
  if (vbr?.encoderDelay !== undefined) info.encoderDelay = vbr.encoderDelay;
  if (vbr?.encoderPadding !== undefined) info.encoderPadding = vbr.encoderPadding;
  return info;
}
