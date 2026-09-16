// One `MediaInfo` per accepted file (gslides-parity SPEC-5 0.18, 3.3; R11 1.1, 1.3, 8.1): the
// sniff names the container, the container's parser reads the facts, and this module decides the
// format (mp4 or m4a by the brand and the tracks, webm by the DocType), the kind (video when a
// video track exists, else audio), the stored mime and extension, the codec list, the duration
// (null when the container states none), the coded size and the per engine playability advisory
// of R11 1.1. Every path outside the accepted set answers a `MediaRefusal` with one sentence
// (R11 1.1's table: a QuickTime file is told to save as mp4, an Ogg to convert to mp3 or m4a, the
// rest are named with the accepted list); a malformed file answers the parser's sentence. Nothing
// here throws on bad bytes. The extension table the store's content types, the assets route and
// the bundle scan share lives in `@turboslide/schema/blocks/media` (`MEDIA_MIME_BY_EXTENSION`);
// `mediaFormatProblem` is the bundle scan's rule: a file whose name and bytes disagree is refused
// before a byte is written (R11 1.2). Framework free.
import type { MediaAssetKind, MediaMime } from '@turboslide/schema/assets';
import { MEDIA_EXTENSIONS } from '@turboslide/schema/assets';
import { MEDIA_MIME_BY_EXTENSION, mediaKindsOfMime } from '@turboslide/schema/blocks/media';

import { MediaParseError } from './bytes.ts';
import { parseEbml } from './ebml.ts';
import { M4A_BRAND, QUICKTIME_BRAND, isMp4Brand, parseIsobmff } from './isobmff.ts';
import { parseMp3 } from './mp3.ts';
import { parseWav } from './wav.ts';
import type { MediaContainer, SniffedMedia } from './sniff.ts';
import { sniffMedia } from './sniff.ts';

/** The five stored formats (SPEC-5 0.18); `m4v` is stored as mp4. */
export type MediaFormat = 'mp4' | 'm4a' | 'webm' | 'mp3' | 'wav';

export const MEDIA_FORMATS: ReadonlyArray<MediaFormat> = ['mp4', 'webm', 'mp3', 'm4a', 'wav'];

/** The sentence every refusal ends with, naming the accepted list (R11 1.1). */
export const ACCEPTED_MEDIA_SENTENCE = 'Audio and video files must be mp4, webm, mp3, m4a or wav.';

/**
 * Whether each engine decodes the file (R11 1.1): Chromium builds (Playwright's, the render
 * worker's chrome-headless-shell) lack H.264 and AAC, Google Chrome and Safari decode them,
 * Firefox decodes them where the operating system does (`os`); every engine decodes VP9, VP8,
 * Opus, Vorbis, MP3 and PCM.
 */
export type MediaPlayability = {
  chromium: boolean;
  chrome: boolean;
  safari: boolean;
  firefox: 'yes' | 'os' | 'no';
};

export type MediaInfo = {
  kind: MediaAssetKind;
  format: MediaFormat;
  mime: MediaMime;
  /** the extension the store writes: mp4, m4a, webm, mp3, wav */
  ext: string;
  container: 'isobmff' | 'ebml' | 'mp3' | 'wav';
  bytes: number;
  /** null when the container states none (a live or recorded webm); the browser fills it later */
  durationMs: number | null;
  /** video: coded pixels of the first video track */
  size?: [number, number];
  /** the sample entry codes or Matroska codec ids, video first: ['avc1', 'mp4a'], ['V_VP9', 'A_OPUS'], ['mp3'], ['pcm_s16le'] */
  codecs: string[];
  sampleRate?: number;
  channels?: number;
  /** ISOBMFF: the major brand; EBML: the DocType */
  brand?: string;
  /** EBML: the Segment's size is unknown (a live muxer or a MediaRecorder capture) */
  live?: boolean;
  playable: MediaPlayability;
};

export type MediaRefusal = {
  /** one or two full sentences for the user or the agent */
  refused: string;
  container: MediaContainer | null;
};

export type MediaInfoResult = MediaInfo | MediaRefusal;

export function isMediaRefusal(result: MediaInfoResult): result is MediaRefusal {
  return 'refused' in result;
}

/** The sentence for a container the intake never accepts. */
function refuse(container: MediaContainer | null, sentence: string): MediaRefusal {
  return { refused: sentence, container };
}

const REFUSED_CONTAINERS: Record<
  Exclude<MediaContainer, 'isobmff' | 'ebml' | 'mp3' | 'wav'>,
  string
> = {
  avi: `An AVI file is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`,
  ogg: 'An Ogg file is not accepted. Convert it to mp3 or m4a.',
  flac: `A FLAC file is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`,
  adts: `A raw AAC (adts) file is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`,
};

export const UNKNOWN_MEDIA_SENTENCE = `The file is not an audio or video file Turboslide reads. ${ACCEPTED_MEDIA_SENTENCE}`;
export const QUICKTIME_SENTENCE = 'A QuickTime (mov) file is not accepted. Save it as mp4.';
export const MATROSKA_SENTENCE = `A Matroska (mkv) file is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`;

const H264_AAC: ReadonlySet<string> = new Set(['avc1', 'avc3', 'mp4a', 'aac', 'h264']);
const HEVC: ReadonlySet<string> = new Set(['hvc1', 'hev1', 'dvh1', 'dvhe']);

/** The playability advisory of R11 1.1 for a format and its codecs. */
export function playabilityOf(
  format: MediaFormat,
  codecs: ReadonlyArray<string>,
): MediaPlayability {
  if (format === 'mp4' || format === 'm4a') {
    if (codecs.some((code) => HEVC.has(code))) {
      return { chromium: false, chrome: false, safari: true, firefox: 'no' };
    }
    if (codecs.some((code) => H264_AAC.has(code))) {
      return { chromium: false, chrome: true, safari: true, firefox: 'os' };
    }
    // AV1, VP9, Opus or FLAC inside MP4 decode in every Chromium build; Safari decodes AV1 and Opus in MP4 from 17
    return { chromium: true, chrome: true, safari: true, firefox: 'yes' };
  }
  return { chromium: true, chrome: true, safari: true, firefox: 'yes' };
}

function formatInfo(
  format: MediaFormat,
  kind: MediaAssetKind,
  container: MediaInfo['container'],
  bytes: number,
  facts: Pick<MediaInfo, 'durationMs' | 'codecs'> &
    Partial<Pick<MediaInfo, 'size' | 'sampleRate' | 'channels' | 'brand' | 'live'>>,
): MediaInfo {
  const mime = MEDIA_MIME_BY_EXTENSION[format] as MediaMime;
  return {
    kind,
    format,
    mime,
    ext: MEDIA_EXTENSIONS[mime],
    container,
    bytes,
    durationMs: facts.durationMs,
    codecs: facts.codecs,
    ...(facts.size !== undefined ? { size: facts.size } : {}),
    ...(facts.sampleRate !== undefined ? { sampleRate: facts.sampleRate } : {}),
    ...(facts.channels !== undefined ? { channels: facts.channels } : {}),
    ...(facts.brand !== undefined ? { brand: facts.brand } : {}),
    ...(facts.live !== undefined ? { live: facts.live } : {}),
    playable: playabilityOf(format, facts.codecs),
  };
}

function isobmffInfo(
  bytes: Uint8Array,
  sniff: Extract<SniffedMedia, { container: 'isobmff' }>,
): MediaInfoResult {
  if (sniff.brand === QUICKTIME_BRAND) return refuse('isobmff', QUICKTIME_SENTENCE);
  if (!isMp4Brand(sniff.brand, sniff.compatible)) {
    return refuse(
      'isobmff',
      `An ISO media file with the brand "${sniff.brand.trim()}" is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`,
    );
  }
  const parsed = parseIsobmff(bytes);
  const video = parsed.tracks.filter((track) => track.handler === 'vide');
  const audio = parsed.tracks.filter((track) => track.handler === 'soun');
  if (video.length === 0 && audio.length === 0) {
    return refuse('isobmff', 'The mp4 file holds no audio or video track.');
  }
  const codecs = [...video, ...audio].flatMap((track) => track.codecs);
  const first = video[0];
  const sound = audio[0];
  const kind: MediaAssetKind = video.length > 0 ? 'video' : 'audio';
  const format: MediaFormat = kind === 'video' ? 'mp4' : 'm4a';
  return formatInfo(format, kind, 'isobmff', bytes.byteLength, {
    durationMs: parsed.durationMs,
    codecs,
    ...(first !== undefined && first.width !== undefined && first.height !== undefined
      ? { size: [first.width, first.height] as [number, number] }
      : {}),
    ...(sound?.sampleRate !== undefined ? { sampleRate: sound.sampleRate } : {}),
    ...(sound?.channels !== undefined ? { channels: sound.channels } : {}),
    brand: parsed.brand === M4A_BRAND ? 'M4A' : parsed.brand.trim(),
  });
}

function ebmlInfo(
  bytes: Uint8Array,
  sniff: Extract<SniffedMedia, { container: 'ebml' }>,
): MediaInfoResult {
  if (sniff.docType === 'matroska') return refuse('ebml', MATROSKA_SENTENCE);
  if (sniff.docType !== 'webm') {
    return refuse(
      'ebml',
      `An EBML file with the DocType "${sniff.docType ?? ''}" is not accepted. ${ACCEPTED_MEDIA_SENTENCE}`,
    );
  }
  const parsed = parseEbml(bytes);
  const video = parsed.tracks.filter((track) => track.type === 1);
  const audio = parsed.tracks.filter((track) => track.type === 2);
  if (video.length === 0 && audio.length === 0)
    return refuse('ebml', 'The webm file holds no audio or video track.');
  const first = video[0];
  const sound = audio[0];
  return formatInfo('webm', video.length > 0 ? 'video' : 'audio', 'ebml', bytes.byteLength, {
    durationMs: parsed.durationMs,
    codecs: [...video, ...audio].map((track) => track.codecId).filter((row) => row !== ''),
    ...(first !== undefined && first.width !== undefined && first.height !== undefined
      ? { size: [first.width, first.height] as [number, number] }
      : {}),
    ...(sound?.sampleRate !== undefined ? { sampleRate: sound.sampleRate } : {}),
    ...(sound?.channels !== undefined ? { channels: sound.channels } : {}),
    brand: parsed.docType,
    live: parsed.liveSegment,
  });
}

/** The facts of one media file, or the sentence refusing it; never throws on bad bytes. */
export function mediaInfo(bytes: Uint8Array): MediaInfoResult {
  const sniff = sniffMedia(bytes);
  if (sniff === null) return refuse(null, UNKNOWN_MEDIA_SENTENCE);
  try {
    switch (sniff.container) {
      case 'isobmff':
        return isobmffInfo(bytes, sniff);
      case 'ebml':
        return ebmlInfo(bytes, sniff);
      case 'mp3': {
        const parsed = parseMp3(bytes);
        return formatInfo('mp3', 'audio', 'mp3', bytes.byteLength, {
          durationMs: parsed.durationMs,
          codecs: ['mp3'],
          sampleRate: parsed.sampleRate,
          channels: parsed.channels,
        });
      }
      case 'wav': {
        const parsed = parseWav(bytes);
        return formatInfo('wav', 'audio', 'wav', bytes.byteLength, {
          durationMs: parsed.durationMs,
          codecs: [parsed.codec],
          sampleRate: parsed.sampleRate,
          channels: parsed.channels,
        });
      }
      default:
        return refuse(sniff.container, REFUSED_CONTAINERS[sniff.container]);
    }
  } catch (error) {
    if (error instanceof MediaParseError) {
      const name =
        sniff.container === 'isobmff'
          ? 'mp4'
          : sniff.container === 'ebml'
            ? 'webm'
            : sniff.container;
      return refuse(sniff.container, `The ${name} file could not be read: ${error.message}.`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Names and the bundle scan's rule

/** The format a file name's extension announces (`talk.MP4`, `clip.m4v` as mp4), or null for a name outside the six extensions. */
export function mediaFormatOfName(name: string): MediaFormat | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const mime = MEDIA_MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()];
  if (mime === undefined) return null;
  return MEDIA_EXTENSIONS[mime] as MediaFormat;
}

/** The container each stored format is written in. */
export const CONTAINER_OF_FORMAT: Readonly<Record<MediaFormat, MediaInfo['container']>> = {
  mp4: 'isobmff',
  m4a: 'isobmff',
  webm: 'ebml',
  mp3: 'mp3',
  wav: 'wav',
};

/** The short name of a sniffed container for a sentence: mp4, mov, webm, mkv, mp3, wav, avi, ogg, flac, aac. */
export function sniffName(sniff: SniffedMedia): string {
  switch (sniff.container) {
    case 'isobmff':
      return sniff.brand === QUICKTIME_BRAND ? 'mov' : sniff.brand === M4A_BRAND ? 'm4a' : 'mp4';
    case 'ebml':
      return sniff.docType === 'webm' ? 'webm' : sniff.docType === 'matroska' ? 'mkv' : 'ebml';
    case 'adts':
      return 'aac';
    default:
      return sniff.container;
  }
}

/**
 * The bundle scan's rule for a media entry under `assets/` (R11 1.2, 1.6): the bytes must carry
 * the container the extension announces (an `.mp4` or `.m4a` an ISO media file with an mp4 brand,
 * a `.webm` an EBML file with the webm DocType, an `.mp3` MPEG audio, a `.wav` RIFF WAVE); null
 * when they do, else the sentence. The kind (mp4 against m4a) is the record's, not the name's.
 */
export function mediaFormatProblem(path: string, bytes: Uint8Array): string | null {
  const format = mediaFormatOfName(path);
  if (format === null) return `${path}: not a media file name`;
  const sniff = sniffMedia(bytes);
  if (sniff === null) return `${path}: the bytes are not an audio or video file`;
  const expected = CONTAINER_OF_FORMAT[format];
  if (sniff.container !== expected)
    return `${path}: the bytes are a ${sniffName(sniff)} file, not ${format}`;
  if (
    sniff.container === 'isobmff' &&
    (sniff.brand === QUICKTIME_BRAND || !isMp4Brand(sniff.brand, sniff.compatible))
  ) {
    return `${path}: the bytes are a ${sniffName(sniff)} file, not ${format}`;
  }
  if (sniff.container === 'ebml' && sniff.docType !== 'webm') {
    return `${path}: the bytes are a ${sniffName(sniff)} file, not webm`;
  }
  return null;
}

/** The kinds a stored mime may carry (a webm with audio tracks alone is an audio asset in a video/webm container). */
export { mediaKindsOfMime };
