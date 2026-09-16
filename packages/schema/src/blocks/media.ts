// The media block and the speaker spotlight block (gslides-parity SPEC-5 1.2, 0.16, 3.1; R05 3,
// R11 1.4): the fields the two blocks add to `BlockBase`, without the base itself, so `blocks.ts`
// composes the block schemas the way it composes the table and chart blocks (`tableFieldsShape`)
// and no import cycle forms. A media block is a positioned object like a picture: `kind`, one
// source (a stored `MediaAsset` or a YouTube video id), an optional poster (the block's poster
// wins over the asset's) and Google's playback fields. A spotlight block is the placeholder the
// show fills with the camera. The integrator landed this module on day 0 as the typed seam of
// SPEC-5 1.6; from day 1 it is B2's (MILESTONES-5 B2 "Owns"): the runtime helpers at the end of
// the file are the `MediaAsset` union's (the extension and mime tables every content type table
// reads, the kinds a mime carries, the digest named file name, the caps, the effective playback
// with Google's defaults, the poster rule, the duration label) and `validate/media.ts` holds the
// `media` validator rules over them.
import { z } from 'zod';
import { annotate } from '../annotate.ts';
import type { Asset, AssetTwins, AssetVariant, MediaAsset, MediaMime } from '../assets.ts';
import type { RecolorPreset } from '../blocks.ts';
import type { Color } from '../color.ts';
import type { AssetId } from '../ids.ts';
import { slugSchema } from '../ids.ts';

export const MEDIA_KINDS = ['audio', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Google's three start modes (R05 3): Play (on click), Play (automatically), Play (manual). */
export const PLAYBACK_STARTS = ['click', 'auto', 'manual'] as const;
export type PlaybackStart = (typeof PLAYBACK_STARTS)[number];

/** Google's labels for the start dropdown (R02 a.1; the Format options media section). */
export const PLAYBACK_START_LABELS: Readonly<Record<PlaybackStart, string>> = {
  click: 'Play (on click)',
  auto: 'Play (automatically)',
  manual: 'Play (manual)',
};

/** The eight URL forms the By URL tab accepts resolve to an eleven character video id (R11 4.1). */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type MediaSource = { asset: AssetId } | { youtube: string };

export type MediaPlayback = {
  start: PlaybackStart;
  loop?: true;
  /** 0 to 100 */
  volume?: number;
  mute?: true;
  /** audio: keep playing across slides when false; Google's Stop on slide change is the default */
  stopOnSlideChange?: false;
  /** audio: Google's Hide icon when presenting */
  hideIcon?: true;
  /** video: Google's Start at and End at, milliseconds */
  startMs?: number;
  endMs?: number;
};

/** The media block's own fields; BlockBase (id, ext, pos, link, alt) is added in blocks.ts. */
export type MediaFields = {
  type: 'media';
  kind: MediaKind;
  /** a stored file (the asset record carries mime, bytes, duration) or a YouTube video */
  source: MediaSource;
  /** the still the editor, the stills and the PPTX show; the frame at startMs for a video, the speaker glyph for audio */
  poster?: AssetId;
  playback: MediaPlayback;
};

export const SPOTLIGHT_SHAPES = ['ellipse', 'rect', 'roundRect'] as const;
export type SpotlightShape = (typeof SPOTLIGHT_SHAPES)[number];

/**
 * The speaker spotlight's own fields (SPEC-5 1.2, 3.7): the shape the camera is clipped to and an
 * optional picture drawn where the camera will be. SPEC-5 1.2 names that picture `placeholder`;
 * here it is `picture`, because `placeholder` on every block is the custom layout's placeholder
 * kind (R03 4.1, `BlockBase.placeholder`), recorded in build-5/integrator.md.
 */
export type SpotlightFields = {
  type: 'spotlight';
  shape: SpotlightShape;
  picture?: AssetId;
};

const MEDIA_GROUP = 'Block' as const;

/** A stored media asset, or `''` for a block whose file is not chosen yet (the palette's insert; the figure layouts' rule). */
export const mediaAssetRefSchema = z.union([slugSchema, z.literal('')]);

export const mediaSourceSchema = z.union([
  z.strictObject({ asset: mediaAssetRefSchema }),
  z.strictObject({ youtube: z.string().regex(YOUTUBE_ID_PATTERN, 'an eleven character video id') }),
]) satisfies z.ZodType<MediaSource>;

export const mediaPlaybackSchema = z.strictObject({
  start: annotate(z.enum(PLAYBACK_STARTS), {
    label: 'Start',
    control: 'select',
    snap: PLAYBACK_STARTS,
    group: MEDIA_GROUP,
    help: 'Play (on click) is Google’s default; Play (automatically) takes its place among the animations as a Play step; Play (manual) plays only when the object is clicked (gslides-parity SPEC-5 3.1).',
  }),
  loop: annotate(z.literal(true).optional(), {
    label: 'Loop',
    control: 'toggle',
    group: MEDIA_GROUP,
  }),
  volume: annotate(z.number().min(0).max(100).optional(), {
    label: 'Volume',
    control: 'number',
    snap: [0, 25, 50, 75, 100],
    group: MEDIA_GROUP,
    help: '0 to 100; 100 when absent.',
  }),
  mute: annotate(z.literal(true).optional(), {
    label: 'Mute audio',
    control: 'toggle',
    group: MEDIA_GROUP,
  }),
  stopOnSlideChange: annotate(z.literal(false).optional(), {
    label: 'Stop on slide change',
    control: 'toggle',
    group: MEDIA_GROUP,
    help: 'On when absent (Google’s default); false keeps an audio playing across slides.',
  }),
  hideIcon: annotate(z.literal(true).optional(), {
    label: 'Hide icon when presenting',
    control: 'toggle',
    group: MEDIA_GROUP,
    help: 'Audio only; the still shows the icon anyway (gslides-parity SPEC-5 0.3).',
  }),
  startMs: annotate(z.number().int().nonnegative().optional(), {
    label: 'Start at',
    control: 'number',
    group: MEDIA_GROUP,
    help: 'Milliseconds into the media; 0 when absent.',
  }),
  endMs: annotate(z.number().int().positive().optional(), {
    label: 'End at',
    control: 'number',
    group: MEDIA_GROUP,
    help: 'Milliseconds into the media; the end when absent. The validator refuses an end at or before the start.',
  }),
}) satisfies z.ZodType<MediaPlayback>;

/** The media block's fields as a shape, spread into `mediaBlockSchema` in blocks.ts. */
export const mediaFieldsShape = {
  type: z.literal('media'),
  kind: annotate(z.enum(MEDIA_KINDS), {
    label: 'Kind',
    control: 'select',
    snap: MEDIA_KINDS,
    group: MEDIA_GROUP,
  }),
  source: annotate(mediaSourceSchema, {
    label: 'Source',
    control: 'json',
    group: MEDIA_GROUP,
    help: 'A stored media asset by id, or a YouTube video id played through youtube-nocookie.com (gslides-parity SPEC-5 0.18).',
  }),
  poster: annotate(slugSchema.optional(), {
    label: 'Poster',
    control: 'asset',
    group: 'Asset',
    help: 'The picture asset every still and the editor show; the asset’s own poster when absent (gslides-parity SPEC-5 0.16).',
  }),
  playback: annotate(mediaPlaybackSchema, {
    label: 'Playback',
    control: 'json',
    group: MEDIA_GROUP,
    help: 'Google’s Format options media section: start, loop, volume, mute, stop on slide change, hide icon, start at and end at.',
  }),
};

/** The spotlight block's fields as a shape, spread into `spotlightBlockSchema` in blocks.ts. */
export const spotlightFieldsShape = {
  type: z.literal('spotlight'),
  shape: annotate(z.enum(SPOTLIGHT_SHAPES), {
    label: 'Shape',
    control: 'select',
    snap: SPOTLIGHT_SHAPES,
    group: MEDIA_GROUP,
    help: 'The shape the camera is clipped to in the show (gslides-parity SPEC-5 3.7).',
  }),
  picture: annotate(slugSchema.optional(), {
    label: 'Picture',
    control: 'asset',
    group: 'Asset',
    help: 'A picture asset drawn where the camera will be; the person glyph when absent (gslides-parity SPEC-5 3.7).',
  }),
};

/** The default playback of a new media block (SPEC-5 3.1: Play (on click)). */
export const DEFAULT_PLAYBACK: MediaPlayback = { start: 'click' };

export function isYoutubeSource(source: MediaSource): source is { youtube: string } {
  return 'youtube' in source;
}

// ---------------------------------------------------------------------------------------------
// The MediaAsset union's runtime helpers (SPEC-5 0.16, 0.18, 3.3; R11 1.1, 1.4, 1.5; B2 day 1)

/**
 * The stored mime per file extension (R11 1.1, 1.5): the one table `blobContentType`, the assets
 * route, the inline list, the media grant and the bundle scan read, so a `.m4v` is `video/mp4`
 * everywhere and no table names a sixth type. Keys are extensions without the dot, lower case.
 */
export const MEDIA_MIME_BY_EXTENSION: Readonly<Record<string, MediaMime>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

/** The mime a file name's extension announces (`talk.MP4`, `clip.m4v`), or null outside the six extensions. */
export function mediaMimeOfName(name: string): MediaMime | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return MEDIA_MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * The kinds a stored mime may carry: `video/webm` carries `audio` too, because WebM has no audio
 * only mime among the five and a recording with no video track is an audio asset in a webm
 * container (R11 1.3); an mp4 with sound tracks alone is stored as `audio/mp4` (m4a), so
 * `video/mp4` is video alone.
 */
export const MEDIA_KINDS_OF_MIME: Readonly<Record<MediaMime, ReadonlyArray<MediaKind>>> = {
  'video/mp4': ['video'],
  'video/webm': ['video', 'audio'],
  'audio/mpeg': ['audio'],
  'audio/mp4': ['audio'],
  'audio/wav': ['audio'],
};

export function mediaKindsOfMime(mime: MediaMime): ReadonlyArray<MediaKind> {
  return MEDIA_KINDS_OF_MIME[mime];
}

/** The kind a mime carries by default: the first of its kinds. */
export function mediaKindOfMime(mime: MediaMime): MediaKind {
  return MEDIA_KINDS_OF_MIME[mime][0] as MediaKind;
}

const MB = 1024 * 1024;

/**
 * The largest file per kind the validator admits (SPEC-5 0.18: `largestAudioBytes` 50 MB and
 * `largestVideoBytes` 200 MB on the account and agent tiers; the anonymous tier's 25 MB is the
 * intake's quota row, not the document's rule).
 */
export const MEDIA_BYTES_MAX: Readonly<Record<MediaKind, number>> = {
  audio: 50 * MB,
  video: 200 * MB,
};

/** `DECK_CAPS.mediaBytes` (SPEC-5 0.18): the sum of `MediaAsset.bytes` a deck may hold. */
export const DECK_MEDIA_BYTES_MAX = 300 * MB;

/** The digest named file of a media asset (R11 1.4): `assets/<id>.<sha8>.<ext>`, never overwritten. */
export function mediaAssetFile(id: AssetId, sha256: string, mime: MediaMime): string {
  const ext = Object.entries(MEDIA_MIME_BY_EXTENSION).find(
    ([extension, value]) => value === mime && extension !== 'm4v',
  )?.[0];
  return `assets/${id}.${sha256.slice(0, 8)}.${ext ?? 'bin'}`;
}

/** The media record a block plays, or undefined for a YouTube source, an empty reference or an id the map lacks. */
export function mediaAssetForBlock(
  media: Readonly<Record<string, MediaAsset>> | undefined,
  block: Pick<MediaFields, 'source'>,
): MediaAsset | undefined {
  if (isYoutubeSource(block.source) || block.source.asset === '') return undefined;
  return media?.[block.source.asset];
}

/** The poster a still shows (SPEC-5 0.16): the block's wins over the asset's; undefined draws the glyph frame. */
export function posterOf(
  block: Pick<MediaFields, 'poster'>,
  asset: Pick<MediaAsset, 'poster'> | undefined,
): AssetId | undefined {
  return block.poster ?? asset?.poster;
}

/** The sum of the stored media bytes of a deck, against `DECK_MEDIA_BYTES_MAX`. */
export function mediaBytesOf(media: Readonly<Record<string, MediaAsset>> | undefined): number {
  if (media === undefined) return 0;
  return Object.values(media).reduce((sum, asset) => sum + asset.bytes, 0);
}

/** Every playback field with Google's default filled in (SPEC-5 3.1), the shape the poster root's eight attributes and the controller read. */
export type EffectivePlayback = {
  start: PlaybackStart;
  loop: boolean;
  volume: number;
  mute: boolean;
  stopOnSlideChange: boolean;
  hideIcon: boolean;
  startMs: number;
  endMs: number | null;
};

export function effectivePlayback(playback: MediaPlayback | undefined): EffectivePlayback {
  return {
    start: playback?.start ?? 'click',
    loop: playback?.loop === true,
    volume: playback?.volume ?? 100,
    mute: playback?.mute === true,
    stopOnSlideChange: playback?.stopOnSlideChange !== false,
    hideIcon: playback?.hideIcon === true,
    startMs: playback?.startMs ?? 0,
    endMs: playback?.endMs ?? null,
  };
}

export type PlaybackProblem = {
  /** the field the message is about, for the issue pointer and the dialog's field error */
  field: keyof MediaPlayback;
  message: string;
  /** 3 refuses the write (the rules of SPEC-5 1.2); 2 is a defect against a known duration */
  severity: 2 | 3;
};

/**
 * The reason a playback record is refused (SPEC-5 1.2 `media`; R11 8.1 `media.setPlayback`), or
 * null: an end at or before the start, a volume outside 0 to 100 and `loop` on a YouTube source
 * at severity 3; a start or end past a known duration at severity 2.
 */
export function playbackProblem(
  playback: MediaPlayback,
  source: MediaSource,
  durationMs: number | null | undefined,
): PlaybackProblem | null {
  if (playback.volume !== undefined && (playback.volume < 0 || playback.volume > 100)) {
    return {
      field: 'volume',
      severity: 3,
      message: `Volume ${playback.volume} is outside 0 to 100`,
    };
  }
  const start = playback.startMs ?? 0;
  if (playback.endMs !== undefined && playback.endMs <= start) {
    return {
      field: 'endMs',
      severity: 3,
      message: `End at ${formatDuration(playback.endMs)} is not after Start at ${formatDuration(start)}`,
    };
  }
  if (playback.loop === true && isYoutubeSource(source)) {
    return { field: 'loop', severity: 3, message: 'Loop is not offered for a YouTube video' };
  }
  if (typeof durationMs === 'number' && durationMs > 0) {
    if (start >= durationMs) {
      return {
        field: 'startMs',
        severity: 2,
        message: `Start at ${formatDuration(start)} is past the end of the media (${formatDuration(durationMs)})`,
      };
    }
    if (playback.endMs !== undefined && playback.endMs > durationMs) {
      return {
        field: 'endMs',
        severity: 2,
        message: `End at ${formatDuration(playback.endMs)} is past the end of the media (${formatDuration(durationMs)})`,
      };
    }
  }
  return null;
}

/** `m:ss` for a duration in milliseconds, `h:mm:ss` from one hour (the poster's frame, the presenter's "0:42 / 2:10" row). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const two = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** Parses Google's `m:ss` (or `h:mm:ss`, or plain seconds) into milliseconds; null for text that is none of them. */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part)))
    return null;
  const numbers = parts.map(Number);
  const seconds = numbers.reduce((sum, value) => sum * 60 + value, 0);
  return Math.round(seconds * 1000);
}

/** The title a still and the console show: the record's title, else the file name without its digest and extension. */
export function mediaTitle(asset: Pick<MediaAsset, 'title' | 'file' | 'id'>): string {
  if (asset.title !== undefined && asset.title.trim() !== '') return asset.title.trim();
  const base = asset.file.slice(asset.file.lastIndexOf('/') + 1);
  const stem = base.replace(/\.[0-9a-f]{8}\.[a-z0-9]+$/i, '').replace(/\.[a-z0-9]+$/i, '');
  return stem === '' ? asset.id : stem;
}

// ---------------------------------------------------------------------------------------------
// The By URL grammar, the default boxes, the playback patch and the Play row rule (SPEC-5 3.1,
// 3.2, 3.8; R11 4.1, 5.4, 8.1; b1.md request 5; B2 day 3)

/** The hosts the By URL tab reads a YouTube link from (R11 4.1): the eight registered forms plus `embed/`. */
const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
]);

/** One `1h2m3s`, `2m3s`, `90s` or plain seconds value of a share link's `t` (R11 4.1, unverified grammar), in milliseconds. */
export function parseYoutubeTime(text: string | null | undefined): number | undefined {
  if (text === undefined || text === null) return undefined;
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(trimmed);
  if (match === null || match[0] === '') return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

export type YoutubeLink = {
  /** the eleven character video id */
  id: string;
  /** the `t` or `start` of the link, milliseconds */
  startMs?: number;
  /** the `end` of an embed link, milliseconds */
  endMs?: number;
};

export type YoutubeParse = { ok: true; link: YoutubeLink } | { ok: false; reason: string };

/** The refusal of a playlist link with no video (SPEC-5 3.2; R11 4.1). */
export const YOUTUBE_PLAYLIST_SENTENCE = 'Paste a link to one video';
export const YOUTUBE_NOT_A_LINK_SENTENCE =
  'Paste a YouTube link (youtube.com/watch, youtu.be, shorts, live, embed) or an eleven character video id';

/**
 * The By URL grammar (R11 4.1): `watch?v=`, `/v/<id>`, `youtu.be/<id>`, `shorts/<id>`,
 * `live/<id>`, `embed/<id>` on either host, `music.youtube.com/watch?v=` and a bare eleven
 * character id; `t` and `start` map to `startMs`, `end` to `endMs`; a playlist without a video is
 * refused with its sentence and anything else with the grammar sentence.
 */
export function parseYoutubeUrl(text: string): YoutubeParse {
  const trimmed = text.trim();
  if (YOUTUBE_ID_PATTERN.test(trimmed)) return { ok: true, link: { id: trimmed } };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: YOUTUBE_NOT_A_LINK_SENTENCE };
  }
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return { ok: false, reason: YOUTUBE_NOT_A_LINK_SENTENCE };
  const segments = url.pathname.split('/').filter((segment) => segment !== '');
  let id: string | null = null;
  if (host === 'youtu.be') id = segments[0] ?? null;
  else if (segments[0] === 'watch') id = url.searchParams.get('v');
  else if (
    segments.length >= 2 &&
    (segments[0] === 'v' ||
      segments[0] === 'shorts' ||
      segments[0] === 'live' ||
      segments[0] === 'embed')
  )
    id = segments[1] ?? null;
  else if (segments[0] === 'playlist' || url.searchParams.has('list')) {
    const v = url.searchParams.get('v');
    if (v === null) return { ok: false, reason: YOUTUBE_PLAYLIST_SENTENCE };
    id = v;
  }
  if (id === null || !YOUTUBE_ID_PATTERN.test(id))
    return { ok: false, reason: YOUTUBE_NOT_A_LINK_SENTENCE };
  const startMs = parseYoutubeTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
  const endMs = parseYoutubeTime(url.searchParams.get('end'));
  return {
    ok: true,
    link: {
      id,
      ...(startMs !== undefined && startMs > 0 ? { startMs } : {}),
      ...(endMs !== undefined && endMs > 0 ? { endMs } : {}),
    },
  };
}

/** The privacy enhanced host every player mounts on (SPEC-5 0.18; R11 4.2). */
export const YOUTUBE_EMBED_HOST = 'https://www.youtube-nocookie.com';

/** The hosts the CSP's `frame-src` names for the player and the API's rewrite of the frame (R11 4.2). */
export const YOUTUBE_FRAME_HOSTS: ReadonlyArray<string> = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
];

/** The IFrame API script and its widget script hosts, for `script-src` on engines without `'strict-dynamic'` (R11 4.2). */
export const YOUTUBE_SCRIPT_HOSTS: ReadonlyArray<string> = [
  'https://www.youtube.com',
  'https://s.ytimg.com',
];

/** The live thumbnail host the editor shows and never stores (R11 4.3). */
export const YOUTUBE_THUMBNAIL_HOST = 'https://i.ytimg.com';

/** The oEmbed endpoint the title comes from, over `safeFetch` (R11 4.3, M3). */
export function youtubeOembedUrl(id: string): string {
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
}

/** The live `hqdefault` thumbnail of a video (R11 4.3, M4), shown in the dialog and the inspector alone. */
export function youtubeThumbnailUrl(id: string): string {
  return `${YOUTUBE_THUMBNAIL_HOST}/vi/${id}/hqdefault.jpg`;
}

/**
 * The player URL of a YouTube block (R11 4.2): `enablejsapi`, `origin`, `playsinline`, `rel=0`,
 * `controls=1`, `start` and `end` in seconds and `mute`; `controls=0` and `loop` are never
 * written and nothing is drawn over the player (the terms).
 */
export function youtubeEmbedUrl(
  id: string,
  playback: EffectivePlayback,
  origin: string | undefined,
): string {
  const params = new URLSearchParams();
  params.set('enablejsapi', '1');
  if (origin !== undefined && origin !== '') params.set('origin', origin);
  params.set('playsinline', '1');
  params.set('rel', '0');
  params.set('controls', '1');
  if (playback.startMs > 0) params.set('start', String(Math.floor(playback.startMs / 1000)));
  if (playback.endMs !== null) params.set('end', String(Math.ceil(playback.endMs / 1000)));
  if (playback.mute) params.set('mute', '1');
  return `${YOUTUBE_EMBED_HOST}/embed/${id}?${params.toString()}`;
}

/** The default video box (SPEC-5 3.2): 960 by 540, Google's 480 by 270 recommendation doubled for the 2x sheet. */
export const VIDEO_DEFAULT_BOX = { w: 960, h: 540 } as const;
/** The default audio glyph box (SPEC-5 3.2): 96 by 96. */
export const AUDIO_DEFAULT_BOX = { w: 96, h: 96 } as const;
/** A YouTube player is never smaller than this on the sheet (R11 4.2, Y1). */
export const YOUTUBE_MIN_BOX = 200;
export const YOUTUBE_TOO_SMALL_SENTENCE = 'A YouTube player is at least 200 by 200 pixels';

type PageLike = { width: number; height: number };

/** The centred default box of a new media block on a page (SPEC-5 3.2): 960 by 540 for video, 96 by 96 for audio. */
export function defaultMediaBox(
  kind: MediaKind,
  page: PageLike,
  size?: [number, number] | undefined,
): { x: number; y: number; w: number; h: number } {
  let w: number = kind === 'video' ? VIDEO_DEFAULT_BOX.w : AUDIO_DEFAULT_BOX.w;
  let h: number = kind === 'video' ? VIDEO_DEFAULT_BOX.h : AUDIO_DEFAULT_BOX.h;
  if (kind === 'video' && size !== undefined && size[0] > 0 && size[1] > 0) {
    // the stored aspect at the default width, never wider than the page's content box
    h = Math.round((w * size[1]) / size[0]);
    const maxH = Math.max(120, page.height - 2 * 129);
    if (h > maxH) {
      w = Math.round((maxH * size[0]) / size[1]);
      h = maxH;
    }
  }
  return {
    x: Math.round((page.width - w) / 2),
    y: Math.round((page.height - h) / 2),
    w,
    h,
  };
}

/** A `media.setPlayback` input's fields: a value writes, null clears, absent leaves the field. */
export type PlaybackPatch = {
  start?: PlaybackStart;
  startMs?: number | null;
  endMs?: number | null;
  mute?: boolean;
  loop?: boolean;
  volume?: number | null;
  hideIcon?: boolean;
  stopOnSlideChange?: boolean;
};

/**
 * The playback record after a patch (SPEC-5 3.1, 3.8): a boolean field stores its non default
 * value alone (`mute: true`, `loop: true`, `hideIcon: true`, `stopOnSlideChange: false`), a
 * number field is dropped when null, and the record always carries `start`.
 */
export function applyPlaybackPatch(
  playback: MediaPlayback | undefined,
  patch: PlaybackPatch,
): MediaPlayback {
  const next: MediaPlayback = { ...(playback ?? DEFAULT_PLAYBACK) };
  if (patch.start !== undefined) next.start = patch.start;
  for (const key of ['startMs', 'endMs', 'volume'] as const) {
    const value = patch[key];
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  for (const key of ['mute', 'loop', 'hideIcon'] as const) {
    const value = patch[key];
    if (value === true) next[key] = true;
    else if (value === false) delete next[key];
  }
  if (patch.stopOnSlideChange === false) next.stopOnSlideChange = false;
  else if (patch.stopOnSlideChange === true) delete next.stopOnSlideChange;
  if (next.volume === 100) delete next.volume;
  if (next.startMs === 0) delete next.startMs;
  return next;
}

/** The shape of an animation row the Play rule reads and writes (SPEC-5 1.3; the motion module's `Animation`). */
export type PlayAnimationRow = {
  id: string;
  blockId: string;
  effect: string;
  trigger: string;
  durationMs: number;
  [key: string]: unknown;
};

/** The default length of a new Play row (SPEC-5 1.3 `DURATION_MS.defaultAnimation`); the compiler replaces it with the media's remaining length. */
export const PLAY_ROW_DURATION_MS = 500;

/** The first free `a<n>` id of a slide's animation list (the motion module's `nextAnimationId` rule). */
export function nextPlayRowId(animations: ReadonlyArray<{ id: string }>): string {
  const taken = new Set(animations.map((animation) => animation.id));
  let n = 1;
  while (taken.has(`a${n}`)) n += 1;
  return `a${n}`;
}

/**
 * The `playMedia` row rule of SPEC-5 2.1 (b1.md request 5): a block whose start becomes `auto`
 * gains one `{ effect: 'playMedia', trigger: 'withPrevious' }` row when it has none; a block that
 * leaves `auto` loses every `playMedia` row it owned. Answers the next list, or null when the
 * list is unchanged, so the caller writes `/animations` only when it moved.
 */
export function playRowsFor<T extends PlayAnimationRow>(
  animations: ReadonlyArray<T> | undefined,
  blockId: string,
  start: PlaybackStart,
): T[] | null {
  const list = animations ?? [];
  const own = list.filter((row) => row.effect === 'playMedia' && row.blockId === blockId);
  if (start === 'auto') {
    if (own.length > 0) return null;
    const row = {
      id: nextPlayRowId(list),
      blockId,
      effect: 'playMedia',
      trigger: 'withPrevious',
      durationMs: PLAY_ROW_DURATION_MS,
    } as T;
    return [...list, row];
  }
  if (own.length === 0) return null;
  return list.filter((row) => !(row.effect === 'playMedia' && row.blockId === blockId));
}

/** A YouTube block set to Play (automatically) beside another one on the slide (R11 4.2: one automatically playing player per page). */
export const SECOND_AUTO_YOUTUBE_SENTENCE =
  'One YouTube video per slide may play automatically; this one plays on click';

/** The alt text a fresh media block carries when the caller gives none: the title, else the kind. */
export function defaultMediaAlt(kind: MediaKind, title: string | undefined): string {
  const trimmed = title?.trim() ?? '';
  return trimmed !== '' ? trimmed : kind === 'audio' ? 'Audio' : 'Video';
}

// ---------------------------------------------------------------------------------------------
// The picture effects of gslides-parity SPEC-5 0.47 (Reflection and Recolor; B2 day 6): which
// Recolor presets the Editable text file writes natively and the two colours of each duotone,
// shared by the renderer (`render/blocks/picture.ts`), the exporter (`pptx/images.ts`) and the
// scene rows (`scene/media.ts`). They live here because the schema is the one package every
// consumer already reaches; the block fields themselves are `ShotAdjust` in blocks.ts.

/** The presets the Editable text file writes as native blip elements (`a:grayscl`, `a:duotone`); the rest bake into the raster. */
export const NATIVE_RECOLOR_PRESETS: ReadonlyArray<RecolorPreset> = [
  'grayscale',
  'ink-light',
  'ink-dark',
  'ink-2-light',
  'ink-2-dark',
  'titanium-light',
  'titanium-dark',
  'green-light',
  'green-dark',
  'amber-light',
  'amber-dark',
  'red-light',
  'red-dark',
  'blue-light',
  'blue-dark',
];

export function isNativeRecolor(preset: RecolorPreset): boolean {
  return NATIVE_RECOLOR_PRESETS.includes(preset);
}

/**
 * The two colours of a duotone preset (shadows first, highlights second), built from the theme's
 * tokens as Google builds its list from the theme's colours (the list `unverified: true`): a light
 * preset maps shadows to the colour and highlights to paper; a dark preset maps shadows to ink and
 * highlights to the colour (ink's dark form takes titanium as its highlight so the two differ).
 * Null for the presets that are not duotones.
 */
export function duotoneColors(preset: RecolorPreset): { shadow: Color; highlight: Color } | null {
  const match = /^(ink-2|ink|titanium|green|amber|red|blue)-(light|dark)$/.exec(preset);
  if (match === null) return null;
  const hue = match[1] as Color;
  if (match[2] === 'light') return { shadow: hue, highlight: 'paper' };
  return { shadow: 'ink', highlight: hue === 'ink' ? 'titanium' : hue };
}

// ---------------------------------------------------------------------------------------------
// The 320 px twin variant (gslides-parity SPEC-5 11 "The 320 px twin variant"; SPEC-4 7; B2 day
// 7): an `AssetVariant` of `TWIN_VARIANT_SIZE` written at intake and by `picture.materialize
// --clone`, whose files the filmstrip clone's `<img srcset>` names beside the 1600 twin. The files
// are digest named (`assets/<id>.<key8>-320-light.png`), so the store never overwrites them and
// the assets route serves them immutable; the key is the sha256 the writer computes over the
// twin it downsampled (packages/materials actions.ts), the first eight hex digits naming the file.

/**
 * The variant's width in sheet pixels, `TWIN_VARIANT_SIZE[0]` of assets.ts spelt here because this
 * module may import that one for types alone (assets.ts imports blocks.ts, which imports this
 * module; `blocks/media.test.ts` pins the two equal).
 */
export const TWIN_VARIANT_WIDTH = 320;

/** The file suffix that marks a twin variant, after the eight digest digits: `-320`, then the theme. */
export const TWIN_VARIANT_STEM = String(TWIN_VARIANT_WIDTH);

/** True for a path a twin variant file carries. */
export const TWIN_VARIANT_FILE_PATTERN = /^assets\/[^/]+\.[0-9a-f]{8}-320(?:-light|-dark)?\.png$/;

/** The variant files of an asset for a key: `assets/<id>.<key8>-320-light.png` and `-dark.png`, or one neutral file. */
export function twinVariantFileNames(assetId: string, key: string, neutral: boolean): AssetTwins {
  const stem = `assets/${assetId}.${key.slice(0, 8)}-${TWIN_VARIANT_STEM}`;
  return neutral
    ? { neutral: `${stem}.png` }
    : { light: `${stem}-light.png`, dark: `${stem}-dark.png` };
}

/** The twin variant of a picture asset, or undefined: the variant whose files carry the `-320` suffix at the variant size. */
export function twinVariantOf(asset: Pick<Asset, 'variants'>): AssetVariant | undefined {
  for (const variant of Object.values(asset.variants ?? {})) {
    const files =
      'neutral' in variant.twins
        ? [variant.twins.neutral]
        : [variant.twins.light, variant.twins.dark];
    if (
      variant.size[0] === TWIN_VARIANT_WIDTH &&
      files.every((file) => TWIN_VARIANT_FILE_PATTERN.test(file))
    )
      return variant;
  }
  return undefined;
}

/**
 * The `srcset` of a picture whose record carries the twin variant: the 320 file at `320w` and the
 * stored twin at its pixel width; the theme picks the file. Undefined without the variant, so a
 * deck that never ran `--clone` renders byte for byte as before.
 */
export function twinSrcset(
  asset: Pick<Asset, 'variants' | 'size' | 'twins'>,
  theme: 'light' | 'dark',
  fullSrc: string,
  assetUrl: (path: string) => string,
): string | undefined {
  const variant = twinVariantOf(asset);
  if (variant === undefined || fullSrc === '') return undefined;
  const small = 'neutral' in variant.twins ? variant.twins.neutral : variant.twins[theme];
  const fullWidth = Math.max(TWIN_VARIANT_WIDTH + 1, asset.size[0]);
  return `${assetUrl(small)} ${TWIN_VARIANT_WIDTH}w, ${fullSrc} ${fullWidth}w`;
}
