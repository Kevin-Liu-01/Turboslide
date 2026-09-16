// The ISOBMFF parser (gslides-parity SPEC-5 3.3; R11 1.2, 1.3): the box walk (a 32 bit size and
// four character type, `largesize` when the size is 1, "to the end" when it is 0, `uuid` types
// skipped), bounded at 64 levels and 20,000 boxes, reading `ftyp` (the major and compatible
// brands), `moov` > `mvhd` (the time scale and duration, version 0 with 32 bit fields and version
// 1 with 64 bit times), `mvex` > `mehd` (a fragmented file's duration), and per `trak` the `tkhd`
// width and height (16.16 fixed point, the last eight bytes of the box), `mdia` > `hdlr` (the
// handler: `vide`, `soun`), `mdhd` (the track's own time scale and duration) and `stbl` > `stsd`
// (the sample entry codes: `avc1`, `mp4a`, `hvc1`, `vp09`, `av01`, `Opus`, and the coded width
// and height or sample rate and channels inside the entry). A `moov` after `mdat` (a file written
// without faststart) is reached by skipping `mdat` by its size, which is why the parser takes the
// whole file and not its first kilobytes. Framework free; `info.ts` turns the result into a
// `MediaInfo` and decides mp4 against m4a from the brand and the tracks.
import { MediaParseError, fourcc, u16be, u32be, u64be, u8 } from './bytes.ts';

export type IsobmffTrack = {
  id: number;
  /** the hdlr handler type: vide, soun, subt, text, hint, meta, or the code found */
  handler: string;
  /** the stsd sample entry codes, in order */
  codecs: string[];
  /** tkhd width and height, or the stsd coded size when tkhd holds zeros */
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  /** from mdhd; null when the field is all ones (unknown) or zero */
  durationMs: number | null;
};

export type IsobmffInfo = {
  brand: string;
  compatible: string[];
  /** mvhd time scale, 0 when the box is absent */
  timescale: number;
  /** mvhd duration over its time scale, mehd for a fragmented file, else the longest track; null when none states one */
  durationMs: number | null;
  fragmented: boolean;
  tracks: IsobmffTrack[];
};

const MAX_DEPTH = 64;
const MAX_BOXES = 20_000;
const CONTAINERS: ReadonlySet<string> = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex']);

type Box = { type: string; bodyAt: number; bodyEnd: number };

type Visitor = (box: Box, depth: number, parent: string) => void;

class Budget {
  boxes = 0;
  take(): void {
    this.boxes += 1;
    if (this.boxes > MAX_BOXES) throw new MediaParseError(`more than ${MAX_BOXES} boxes`);
  }
}

function walk(
  bytes: Uint8Array,
  start: number,
  end: number,
  depth: number,
  parent: string,
  budget: Budget,
  visit: Visitor,
): void {
  if (depth > MAX_DEPTH) throw new MediaParseError(`boxes nest deeper than ${MAX_DEPTH} levels`);
  let cursor = start;
  while (cursor + 8 <= end) {
    budget.take();
    let size = u32be(bytes, cursor);
    const type = fourcc(bytes, cursor + 4);
    let header = 8;
    if (size === 1) {
      size = u64be(bytes, cursor + 8);
      header = 16;
    } else if (size === 0) {
      size = end - cursor;
    }
    if (type === 'uuid') header += 16;
    if (size < header)
      throw new MediaParseError(`a ${type} box of ${size} bytes is shorter than its header`);
    const boxEnd = cursor + size;
    if (boxEnd > end) {
      // a box that runs past its parent: the file is truncated or the size lies; mdat is the
      // usual case in a cut file and is harmless, anything else is refused by the caller's rule
      if (type === 'mdat' || type === 'free' || type === 'skip') return;
      throw new MediaParseError(`a ${type} box runs past the end of the file`);
    }
    const box: Box = { type, bodyAt: cursor + header, bodyEnd: boxEnd };
    visit(box, depth, parent);
    if (CONTAINERS.has(type)) walk(bytes, box.bodyAt, box.bodyEnd, depth + 1, type, budget, visit);
    cursor = boxEnd;
  }
}

function fullBoxVersion(bytes: Uint8Array, box: Box): number {
  return u8(bytes, box.bodyAt);
}

/** A 32 or 64 bit duration is "unknown" when every bit is set. */
function knownDuration(value: number, bits: 32 | 64): number | null {
  if (bits === 32 && value === 0xffffffff) return null;
  if (bits === 64 && value >= 0xffffffffffffffff) return null;
  return value;
}

function toMs(units: number | null, timescale: number): number | null {
  if (units === null || timescale <= 0) return null;
  return Math.round((units * 1000) / timescale);
}

/** Reads the sample entries of an stsd box: the codes and, per entry, the coded size or the sample facts. */
function readStsd(bytes: Uint8Array, box: Box, track: IsobmffTrack): void {
  const count = u32be(bytes, box.bodyAt + 4);
  let cursor = box.bodyAt + 8;
  for (let i = 0; i < count && i < 32 && cursor + 8 <= box.bodyEnd; i++) {
    const size = u32be(bytes, cursor);
    const code = fourcc(bytes, cursor + 4);
    if (size < 8 || cursor + size > box.bodyEnd) break;
    track.codecs.push(code.trim());
    const entryBody = cursor + 8;
    if (track.handler === 'vide' && size >= 8 + 28) {
      // 6 reserved, data reference index, 16 pre defined and reserved, then width and height
      const width = u16be(bytes, entryBody + 24);
      const height = u16be(bytes, entryBody + 26);
      if (track.width === undefined && width > 0 && height > 0) {
        track.width = width;
        track.height = height;
      }
    } else if (track.handler === 'soun' && size >= 8 + 28) {
      // 6 reserved, data reference index, 8 reserved, channel count, sample size, 4 reserved, sample rate 16.16
      const channels = u16be(bytes, entryBody + 16);
      const rate = u32be(bytes, entryBody + 24) >>> 16;
      if (track.channels === undefined && channels > 0) track.channels = channels;
      if (track.sampleRate === undefined && rate > 0) track.sampleRate = rate;
    }
    cursor += size;
  }
}

/** Reads an ISO base media file; throws `MediaParseError` when `ftyp` or `moov` is missing or a box is malformed. */
export function parseIsobmff(bytes: Uint8Array): IsobmffInfo {
  if (bytes.byteLength < 12 || fourcc(bytes, 4) !== 'ftyp') {
    throw new MediaParseError('the file does not start with an ftyp box');
  }
  const info: IsobmffInfo = {
    brand: '',
    compatible: [],
    timescale: 0,
    durationMs: null,
    fragmented: false,
    tracks: [],
  };
  let mvhdDuration: number | null = null;
  let mehdMs: number | null = null;
  let sawMoov = false;
  let track: IsobmffTrack | null = null;
  const budget = new Budget();
  walk(bytes, 0, bytes.byteLength, 0, '', budget, (box, _depth, parent) => {
    switch (box.type) {
      case 'ftyp': {
        info.brand = fourcc(bytes, box.bodyAt);
        for (let at = box.bodyAt + 8; at + 4 <= box.bodyEnd; at += 4) {
          const brand = fourcc(bytes, at);
          // a zero filled slot reads as '????' through ascii(); a brand has at least one letter or digit
          if (/[A-Za-z0-9]/.test(brand)) info.compatible.push(brand);
        }
        break;
      }
      case 'moov':
        sawMoov = true;
        break;
      case 'mvhd': {
        const version = fullBoxVersion(bytes, box);
        if (version === 1) {
          info.timescale = u32be(bytes, box.bodyAt + 20);
          mvhdDuration = knownDuration(u64be(bytes, box.bodyAt + 24), 64);
        } else {
          info.timescale = u32be(bytes, box.bodyAt + 12);
          mvhdDuration = knownDuration(u32be(bytes, box.bodyAt + 16), 32);
        }
        break;
      }
      case 'mvex':
        info.fragmented = true;
        break;
      case 'mehd': {
        const version = fullBoxVersion(bytes, box);
        const units = version === 1 ? u64be(bytes, box.bodyAt + 4) : u32be(bytes, box.bodyAt + 4);
        mehdMs = toMs(units, info.timescale);
        break;
      }
      case 'trak':
        track = { id: 0, handler: '', codecs: [], durationMs: null };
        info.tracks.push(track);
        break;
      case 'tkhd': {
        if (track === null) break;
        const version = fullBoxVersion(bytes, box);
        track.id = u32be(bytes, box.bodyAt + (version === 1 ? 20 : 12));
        const length = box.bodyEnd - box.bodyAt;
        if (length >= 84) {
          const width = u32be(bytes, box.bodyEnd - 8) >>> 16;
          const height = u32be(bytes, box.bodyEnd - 4) >>> 16;
          if (width > 0 && height > 0) {
            track.width = width;
            track.height = height;
          }
        }
        break;
      }
      case 'mdhd': {
        if (track === null || parent !== 'mdia') break;
        const version = fullBoxVersion(bytes, box);
        const timescale = u32be(bytes, box.bodyAt + (version === 1 ? 20 : 12));
        const units =
          version === 1
            ? knownDuration(u64be(bytes, box.bodyAt + 24), 64)
            : knownDuration(u32be(bytes, box.bodyAt + 16), 32);
        track.durationMs = units === 0 ? null : toMs(units, timescale);
        break;
      }
      case 'hdlr': {
        if (track === null || parent !== 'mdia') break;
        track.handler = fourcc(bytes, box.bodyAt + 8);
        break;
      }
      case 'stsd': {
        if (track === null) break;
        readStsd(bytes, box, track);
        break;
      }
      default:
        break;
    }
  });
  if (!sawMoov)
    throw new MediaParseError('no moov box: the file is truncated or still being written');
  const trackMs = info.tracks.map((row) => row.durationMs ?? 0).reduce((a, b) => Math.max(a, b), 0);
  const movieMs =
    mvhdDuration !== null && mvhdDuration > 0 ? toMs(mvhdDuration, info.timescale) : null;
  info.durationMs = movieMs ?? mehdMs ?? (trackMs > 0 ? trackMs : null);
  return info;
}

/** The brands of an MP4 file the intake accepts (S5); `M4A ` marks iTunes audio, `qt  ` a QuickTime movie. */
export const MP4_BRANDS: ReadonlySet<string> = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'iso7',
  'iso8',
  'iso9',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'cmfc',
  'cmf2',
  'M4V ',
  'M4A ',
  'mp71',
  'iso1',
]);

export const M4A_BRAND = 'M4A ';
export const QUICKTIME_BRAND = 'qt  ';

/** True when the major brand or a compatible brand is in the MP4 set. */
export function isMp4Brand(brand: string, compatible: ReadonlyArray<string>): boolean {
  return MP4_BRANDS.has(brand) || compatible.some((row) => MP4_BRANDS.has(row));
}
