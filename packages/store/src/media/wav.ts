// The WAV parser (gslides-parity SPEC-5 3.3; R11 1.3): the `RIFF` chunk with `WAVE`, the `fmt `
// chunk (the format tag, channels, sample rate, average bytes per second, block align, bits per
// sample, and for `WAVE_FORMAT_EXTENSIBLE` the sub format GUID whose first two bytes are the
// tag), the `data` chunk's length, and the duration as the data bytes over the byte rate. PCM
// (tag 1) and IEEE float (tag 3) are accepted, plain or extensible; ADPCM, MP3 in WAV, A-law and
// every other tag are refused with the tag named, because a browser's decoder and PowerPoint's
// agree on PCM alone (R11 1.3). Chunks are walked by their padded sizes, so a `LIST`, `fact` or
// `cue ` chunk before the data is skipped. Framework free.
import { MediaParseError, fourcc, u16le, u32le } from './bytes.ts';

export type WavInfo = {
  /** 1 PCM, 3 IEEE float; the extensible form resolves to its sub format's tag */
  formatTag: 1 | 3;
  extensible: boolean;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  avgBytesPerSec: number;
  /** the bytes of the data chunk actually present (a declared size past the file end is clamped) */
  dataBytes: number;
  durationMs: number;
  /** ffprobe's codec name for the sample format: pcm_u8, pcm_s16le, pcm_s24le, pcm_s32le, pcm_f32le, pcm_f64le */
  codec: string;
};

const FORMAT_NAMES: Record<number, string> = {
  0x0002: 'MS ADPCM',
  0x0006: 'A-law',
  0x0007: 'mu-law',
  0x0011: 'IMA ADPCM',
  0x0050: 'MPEG',
  0x0055: 'MP3',
  0x2000: 'AC-3',
  0xf1ac: 'FLAC',
};

/** The name of a WAV format tag the intake refuses, for the refusal sentence. */
export function wavFormatName(tag: number): string {
  return FORMAT_NAMES[tag] ?? `format tag 0x${tag.toString(16)}`;
}

function codecOf(tag: 1 | 3, bits: number): string {
  if (tag === 3) return bits === 64 ? 'pcm_f64le' : 'pcm_f32le';
  if (bits === 8) return 'pcm_u8';
  return `pcm_s${bits}le`;
}

export function isRiffWave(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && fourcc(bytes, 0) === 'RIFF' && fourcc(bytes, 8) === 'WAVE';
}

/** Reads a RIFF WAVE file; throws `MediaParseError` for a non PCM format or a missing chunk. */
export function parseWav(bytes: Uint8Array): WavInfo {
  if (!isRiffWave(bytes)) throw new MediaParseError('not a RIFF WAVE file');
  let cursor = 12;
  let fmt: Omit<WavInfo, 'dataBytes' | 'durationMs' | 'codec'> | null = null;
  let dataBytes: number | null = null;
  let chunks = 0;
  while (cursor + 8 <= bytes.byteLength && chunks < 1024) {
    chunks += 1;
    const id = fourcc(bytes, cursor);
    const size = u32le(bytes, cursor + 4);
    const bodyAt = cursor + 8;
    if (id === 'fmt ') {
      if (size < 16) throw new MediaParseError('the fmt chunk is shorter than 16 bytes');
      let tag = u16le(bytes, bodyAt);
      const channels = u16le(bytes, bodyAt + 2);
      const sampleRate = u32le(bytes, bodyAt + 4);
      const avgBytesPerSec = u32le(bytes, bodyAt + 8);
      const blockAlign = u16le(bytes, bodyAt + 12);
      const bitsPerSample = u16le(bytes, bodyAt + 14);
      let extensible = false;
      if (tag === 0xfffe) {
        extensible = true;
        if (size < 40)
          throw new MediaParseError('the extensible fmt chunk is shorter than 40 bytes');
        tag = u16le(bytes, bodyAt + 24); // the first two bytes of the sub format GUID
      }
      if (tag !== 1 && tag !== 3) {
        throw new MediaParseError(
          `the WAV holds ${wavFormatName(tag)} audio; only PCM and float WAV files are accepted`,
        );
      }
      if (channels === 0 || sampleRate === 0) {
        throw new MediaParseError('the fmt chunk names zero channels or a zero sample rate');
      }
      fmt = {
        formatTag: tag,
        extensible,
        channels,
        sampleRate,
        bitsPerSample,
        blockAlign,
        avgBytesPerSec,
      };
    } else if (id === 'data') {
      // 0xFFFFFFFF or a size past the end (a stream written without seeking back) is clamped to what is there
      const available = bytes.byteLength - bodyAt;
      dataBytes = size === 0xffffffff || size > available ? available : size;
      if (fmt !== null) break;
    }
    const step = 8 + size + (size % 2);
    if (size === 0xffffffff || cursor + step > bytes.byteLength) break;
    cursor += step;
  }
  if (fmt === null) throw new MediaParseError('no fmt chunk');
  if (dataBytes === null) throw new MediaParseError('no data chunk');
  const byteRate =
    fmt.avgBytesPerSec > 0
      ? fmt.avgBytesPerSec
      : fmt.blockAlign * fmt.sampleRate || (fmt.channels * fmt.bitsPerSample * fmt.sampleRate) / 8;
  if (byteRate <= 0) throw new MediaParseError('the fmt chunk gives no byte rate');
  return {
    ...fmt,
    dataBytes,
    durationMs: Math.round((dataBytes * 1000) / byteRate),
    codec: codecOf(fmt.formatTag, fmt.bitsPerSample),
  };
}
