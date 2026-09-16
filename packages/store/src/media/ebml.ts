// The EBML parser for WebM (gslides-parity SPEC-5 3.3; R11 1.2, 1.3; RFC 8794 for the element
// grammar, RFC 9559 for the Matroska elements): variable size integers whose first set bit gives
// their length (an element id keeps its marker bit, a size drops it, a size of all ones is
// "unknown"), the EBML header's `DocType` (`webm` accepted, `matroska` refused as an mkv), then
// the `Segment` > `Info` element's `TimestampScale` (nanoseconds per tick, 1,000,000 by default)
// and `Duration` (a float in ticks) and the `Tracks` > `TrackEntry` rows (`TrackType` 1 video and
// 2 audio, `CodecID`, `Video` > `PixelWidth` and `PixelHeight`, `Audio` > `SamplingFrequency` and
// `Channels`). The walk stops at the first `Cluster`, so a 200 MB file costs its header alone; a
// `Segment` of unknown size (a live muxer, a MediaRecorder capture) is read to the end of the
// buffer, and a file with no `Duration` answers `durationMs: null`, which the browser fills later
// (R11 1.3). Framework free.
import { MediaParseError, ascii, floatBe } from './bytes.ts';

export type EbmlTrack = {
  number: number;
  /** 1 video, 2 audio, 17 subtitle, else the value found */
  type: number;
  /** the Matroska codec id: V_VP9, V_VP8, V_AV1, A_OPUS, A_VORBIS, ... */
  codecId: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
};

export type EbmlInfo = {
  docType: string;
  docTypeVersion: number | null;
  /** nanoseconds per tick */
  timestampScale: number;
  /** Duration times the scale over 1e6; null when the Info element states none */
  durationMs: number | null;
  /** true when the Segment's size is unknown (a live or recorded file) */
  liveSegment: boolean;
  muxingApp?: string;
  writingApp?: string;
  tracks: EbmlTrack[];
};

/** The element ids this parser reads (RFC 9559 section 5), as the integers their bytes spell. */
export const EBML_IDS = {
  header: 0x1a45dfa3,
  docType: 0x4282,
  docTypeVersion: 0x4287,
  segment: 0x18538067,
  seekHead: 0x114d9b74,
  info: 0x1549a966,
  timestampScale: 0x2ad7b1,
  duration: 0x4489,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  codecId: 0x86,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  audio: 0xe1,
  samplingFrequency: 0xb5,
  channels: 0x9f,
  cluster: 0x1f43b675,
  cues: 0x1c53bb6b,
  void: 0xec,
} as const;

const MAX_DEPTH = 16;
const MAX_ELEMENTS = 20_000;

type Vint = { value: number; length: number; unknown: boolean };

/** Reads a variable size integer at `at`; `id` keeps the marker bit, a size drops it. */
function readVint(bytes: Uint8Array, at: number, id: boolean): Vint {
  if (at >= bytes.byteLength)
    throw new MediaParseError(`an element at byte ${at} runs past the end of the file`);
  const first = bytes[at] as number;
  if (first === 0) throw new MediaParseError(`an invalid variable size integer at byte ${at}`);
  let length = 1;
  let mask = 0x80;
  while ((first & mask) === 0) {
    length += 1;
    mask >>= 1;
  }
  if (length > 8)
    throw new MediaParseError(`a variable size integer longer than 8 bytes at byte ${at}`);
  if (at + length > bytes.byteLength) {
    throw new MediaParseError(`an element at byte ${at} runs past the end of the file`);
  }
  let value = id ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    const byte = bytes[at + i] as number;
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !id && allOnes };
}

function readUint(bytes: Uint8Array, at: number, length: number): number {
  if (length > 8) throw new MediaParseError('an unsigned integer longer than 8 bytes');
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + (bytes[at + i] as number);
  return value;
}

function readFloat(bytes: Uint8Array, at: number, length: number): number {
  if (length === 0) return 0;
  return floatBe(bytes, at, length);
}

type Element = { id: number; dataAt: number; dataEnd: number; unknown: boolean };

type Visitor = (element: Element, depth: number, parentId: number) => 'descend' | 'skip' | 'stop';

class Budget {
  elements = 0;
  take(): void {
    this.elements += 1;
    if (this.elements > MAX_ELEMENTS)
      throw new MediaParseError(`more than ${MAX_ELEMENTS} elements`);
  }
}

/** Walks the elements between `start` and `end`; returns false when the visitor asked to stop. */
function walk(
  bytes: Uint8Array,
  start: number,
  end: number,
  depth: number,
  parentId: number,
  budget: Budget,
  visit: Visitor,
): boolean {
  if (depth > MAX_DEPTH) throw new MediaParseError(`elements nest deeper than ${MAX_DEPTH} levels`);
  let cursor = start;
  while (cursor < end) {
    budget.take();
    const id = readVint(bytes, cursor, true);
    const size = readVint(bytes, cursor + id.length, false);
    const dataAt = cursor + id.length + size.length;
    // an unknown size runs to the parent's end; a size past the parent is a truncated file, and the
    // element is read as far as the bytes go (a cut Cluster is the common case)
    const dataEnd = size.unknown ? end : Math.min(dataAt + size.value, end);
    const element: Element = { id: id.value, dataAt, dataEnd, unknown: size.unknown };
    const verdict = visit(element, depth, parentId);
    if (verdict === 'stop') return false;
    if (verdict === 'descend') {
      const go = walk(bytes, dataAt, dataEnd, depth + 1, id.value, budget, visit);
      if (!go) return false;
    }
    if (size.unknown && verdict !== 'descend') return true; // nothing can follow an unknown size we did not enter
    cursor = dataEnd;
  }
  return true;
}

/** Reads a WebM or Matroska file's header, Info and Tracks; throws `MediaParseError` for a malformed or non EBML file. */
export function parseEbml(bytes: Uint8Array): EbmlInfo {
  if (bytes.byteLength < 4 || readUint(bytes, 0, 4) !== EBML_IDS.header) {
    throw new MediaParseError('the file does not start with an EBML header');
  }
  const info: EbmlInfo = {
    docType: '',
    docTypeVersion: null,
    timestampScale: 1_000_000,
    durationMs: null,
    liveSegment: false,
    tracks: [],
  };
  let durationTicks: number | null = null;
  let track: EbmlTrack | null = null;
  let sawSegment = false;
  const budget = new Budget();
  walk(bytes, 0, bytes.byteLength, 0, 0, budget, (element, _depth, parentId) => {
    const length = element.dataEnd - element.dataAt;
    switch (element.id) {
      case EBML_IDS.header:
        return 'descend';
      case EBML_IDS.docType:
        if (parentId === EBML_IDS.header)
          info.docType = ascii(bytes, element.dataAt, length).replace(/\0+$/, '');
        return 'skip';
      case EBML_IDS.docTypeVersion:
        if (parentId === EBML_IDS.header)
          info.docTypeVersion = readUint(bytes, element.dataAt, length);
        return 'skip';
      case EBML_IDS.segment:
        sawSegment = true;
        info.liveSegment = element.unknown;
        return 'descend';
      case EBML_IDS.info:
      case EBML_IDS.tracks:
        return parentId === EBML_IDS.segment ? 'descend' : 'skip';
      case EBML_IDS.timestampScale:
        if (parentId === EBML_IDS.info)
          info.timestampScale = readUint(bytes, element.dataAt, length);
        return 'skip';
      case EBML_IDS.duration:
        if (parentId === EBML_IDS.info) durationTicks = readFloat(bytes, element.dataAt, length);
        return 'skip';
      case EBML_IDS.muxingApp:
        if (parentId === EBML_IDS.info)
          info.muxingApp = ascii(bytes, element.dataAt, Math.min(length, 64));
        return 'skip';
      case EBML_IDS.writingApp:
        if (parentId === EBML_IDS.info)
          info.writingApp = ascii(bytes, element.dataAt, Math.min(length, 64));
        return 'skip';
      case EBML_IDS.trackEntry:
        if (parentId !== EBML_IDS.tracks) return 'skip';
        track = { number: 0, type: 0, codecId: '' };
        info.tracks.push(track);
        return 'descend';
      case EBML_IDS.trackNumber:
        if (track !== null && parentId === EBML_IDS.trackEntry)
          track.number = readUint(bytes, element.dataAt, length);
        return 'skip';
      case EBML_IDS.trackType:
        if (track !== null && parentId === EBML_IDS.trackEntry)
          track.type = readUint(bytes, element.dataAt, length);
        return 'skip';
      case EBML_IDS.codecId:
        if (track !== null && parentId === EBML_IDS.trackEntry) {
          track.codecId = ascii(bytes, element.dataAt, Math.min(length, 32)).replace(/\0+$/, '');
        }
        return 'skip';
      case EBML_IDS.video:
      case EBML_IDS.audio:
        return parentId === EBML_IDS.trackEntry ? 'descend' : 'skip';
      case EBML_IDS.pixelWidth:
        if (track !== null && parentId === EBML_IDS.video)
          track.width = readUint(bytes, element.dataAt, length);
        return 'skip';
      case EBML_IDS.pixelHeight:
        if (track !== null && parentId === EBML_IDS.video)
          track.height = readUint(bytes, element.dataAt, length);
        return 'skip';
      case EBML_IDS.samplingFrequency:
        if (track !== null && parentId === EBML_IDS.audio)
          track.sampleRate = Math.round(readFloat(bytes, element.dataAt, length));
        return 'skip';
      case EBML_IDS.channels:
        if (track !== null && parentId === EBML_IDS.audio)
          track.channels = readUint(bytes, element.dataAt, length);
        return 'skip';
      case EBML_IDS.cluster:
        return 'stop';
      default:
        return 'skip';
    }
  });
  if (info.docType === '') throw new MediaParseError('the EBML header names no DocType');
  if (!sawSegment) throw new MediaParseError('no Segment element');
  if (durationTicks !== null && durationTicks > 0) {
    info.durationMs = Math.round((durationTicks * info.timestampScale) / 1e6);
  }
  return info;
}
