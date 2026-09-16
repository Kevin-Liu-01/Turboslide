// The media block's poster root and the speaker spotlight's placeholder (gslides-parity SPEC-5
// 0.17, 3.4, 3.5, 3.7; R11 5.1; MILESTONES-5 B2 day 4). The renderer never emits `<audio>`,
// `<video>` or an `<iframe>`: every surface (the editor stage, the sheet route, the print
// document, the stills, the thumbnails, the standalone file, the presenter console's clones)
// shows the poster inside a `.ts-media` root that carries the block's playback as data
// attributes, and the show's media controller (viewer/present/media-controller.ts) mounts the
// element over that root when the slide shows. The eight attributes are the effective playback of
// `effectivePlayback` (Google's defaults filled in): `data-play`, `data-loop`, `data-volume`,
// `data-mute`, `data-stop-on-change`, `data-hide-icon`, `data-start`, `data-end`; beside them
// `data-media` (the block id), `data-kind`, `data-src` (the stored file's URL, empty for
// YouTube), `data-youtube` (the video id), `data-title` and `data-duration`. The root is a button
// for the assistive tree (`role="button"`, `tabindex="0"`, `aria-label` from the alt); the poster
// image is the picture asset the block or the record names (the block's wins, SPEC-5 0.16), and
// without one the frame is Turboslide's own: paper, the play glyph in ink for a video, the
// speaker glyph for an audio, the title and the duration, drawn with no asset at all. The three
// glyphs are the sprite's `ts-play`, `ts-speaker` and `ts-person` (packages/theme), never Google's,
// YouTube's or PowerPoint's artwork. The exporter shoots the root as a `shot` raster, the picture
// `ooxml/media.ts` rewrites into the media picture.
import type { MediaAsset } from '@turboslide/schema/assets';
import type { BlockOf } from '@turboslide/schema/blocks';
import {
  effectivePlayback,
  formatDuration,
  isYoutubeSource,
  mediaTitle,
  posterOf,
  twinSrcset,
} from '@turboslide/schema/blocks/media';
import type { EffectivePlayback } from '@turboslide/schema/blocks/media';
import { shapePath } from '@turboslide/schema/shapes';
import { classes, el, escapeText, px, style, voidEl } from '../html.ts';
import type { BlockContext, ResolvedImage } from './context.ts';
import { imageFor, raster, rootAttrs, sizeAttrs, twinAttrs } from './context.ts';

/** The class of the poster root the controller, the pen and the standalone script address. */
export const MEDIA_ROOT_CLASS = 'ts-media';
/** The class of the spotlight root the show fills with the camera. */
export const SPOTLIGHT_ROOT_CLASS = 'ts-spotlight';

/** The data attributes of a poster root (R11 5.1), in the order they are written. */
export const MEDIA_DATA_ATTRIBUTES = [
  'data-media',
  'data-kind',
  'data-src',
  'data-youtube',
  'data-title',
  'data-duration',
  'data-start',
  'data-end',
  'data-play',
  'data-loop',
  'data-volume',
  'data-mute',
  'data-stop-on-change',
  'data-hide-icon',
] as const;

/** The playback attributes of a root from the effective record: the eight of SPEC-5 3.5. */
export function playbackAttributes(playback: EffectivePlayback): Record<string, string> {
  return {
    'data-start': String(playback.startMs),
    'data-end': playback.endMs === null ? '' : String(playback.endMs),
    'data-play': playback.start,
    'data-loop': playback.loop ? '1' : '0',
    'data-volume': String(playback.volume),
    'data-mute': playback.mute ? '1' : '0',
    'data-stop-on-change': playback.stopOnSlideChange ? '1' : '0',
    'data-hide-icon': playback.hideIcon ? '1' : '0',
  };
}

/** The title a block shows: the YouTube title the insert recorded, the record's title, the alt, the kind. */
export function mediaLabel(block: BlockOf<'media'>, asset: MediaAsset | undefined): string {
  const recorded = (block.ext as { mediaTitle?: unknown } | undefined)?.mediaTitle;
  if (typeof recorded === 'string' && recorded.trim() !== '') return recorded.trim();
  if (asset !== undefined) return mediaTitle(asset);
  if (block.alt !== undefined && block.alt.trim() !== '') return block.alt.trim();
  return block.kind === 'audio' ? 'Audio' : 'Video';
}

/** A glyph of the sprite at a class: `<svg class="ts-media-glyph" aria-hidden="true"><use href="#ts-play"/></svg>`. */
function glyph(name: 'ts-play' | 'ts-speaker' | 'ts-person', className: string): string {
  return `<svg class="${className}" aria-hidden="true"><use href="#${name}"/></svg>`;
}

/**
 * The fallback frame (SPEC-5 3.4): paper, the glyph in ink, the title and the duration, all from
 * the theme's tokens so the frame exists without any asset. An audio always draws the speaker.
 */
function frameHtml(
  kind: 'audio' | 'video',
  label: string,
  durationMs: number | null | undefined,
  short: boolean,
): string {
  const duration =
    typeof durationMs === 'number' && durationMs > 0 ? formatDuration(durationMs) : '';
  const words = short
    ? ''
    : el(
        'span',
        { class: 'ts-media-words' },
        el('span', { class: 'ts-media-title' }, escapeText(label)) +
          (duration === '' ? '' : el('span', { class: 'ts-media-duration' }, escapeText(duration))),
      );
  return el(
    'div',
    { class: classes('ts-media-frame', `is-${kind}`), 'aria-hidden': 'true' },
    glyph(kind === 'audio' ? 'ts-speaker' : 'ts-play', 'ts-media-glyph') + words,
  );
}

export function renderMedia(block: BlockOf<'media'>, ctx: BlockContext): string {
  const w = block.pos?.w ?? ctx.slotWidth ?? (block.kind === 'audio' ? 96 : 960);
  const h =
    block.pos?.h ?? ctx.slotHeight ?? (block.kind === 'audio' ? 96 : Math.round((w * 9) / 16));
  const source = block.source;
  const youtube = isYoutubeSource(source);
  const assetId = youtube ? '' : source.asset;
  const asset = assetId !== '' ? ctx.media?.(assetId) : undefined;
  if (assetId !== '' && ctx.media !== undefined && asset === undefined)
    ctx.warnings.push(`${ctx.slideId}#${block.id}: media ${assetId} is not in the deck`);
  const playback = effectivePlayback(block.playback);
  const label = mediaLabel(block, asset);
  const posterId = posterOf(block, asset);
  const poster: ResolvedImage | undefined =
    posterId !== undefined ? imageFor(ctx, posterId, block.id) : undefined;
  const hasPoster = poster !== undefined && poster.src !== '';
  const src = asset !== undefined ? (ctx.mediaUrl ?? ctx.assetUrl)(asset.file) : '';
  const durationMs = asset?.durationMs ?? null;
  // a tiny box (the 96 px audio glyph) draws the glyph alone; the words need room
  const short = w < 220 || h < 120;
  // the poster's 320 px twin variant (SPEC-5 11): `srcset` when the picture record carries it, so
  // the filmstrip clone shows the poster 320 px wide and the sheet 1600 (LiveClone sets `sizes`)
  const posterAsset = posterId !== undefined ? ctx.asset?.(posterId) : undefined;
  const posterSrcset =
    hasPoster && posterAsset !== undefined
      ? twinSrcset(posterAsset, ctx.theme, poster.src, ctx.assetUrl)
      : undefined;
  const inner = hasPoster
    ? voidEl('img', {
        class: 'ts-media-poster',
        src: poster.src,
        ...(posterSrcset !== undefined ? { srcset: posterSrcset } : {}),
        ...twinAttrs(poster),
        ...sizeAttrs(poster.size),
        alt: '',
        loading: 'lazy',
        decoding: 'async',
      }) + (block.kind === 'video' ? glyph('ts-play', 'ts-media-badge') : '')
    : frameHtml(block.kind, label, durationMs, short);
  const frameStyle = style(block.pos === undefined && `width:${px(w)}px;height:${px(h)}px`);
  return el(
    'div',
    {
      ...rootAttrs(block, ctx, {
        className: classes(
          MEDIA_ROOT_CLASS,
          `is-${block.kind}`,
          youtube && 'is-youtube',
          hasPoster && 'has-poster',
          playback.hideIcon && 'hide-icon',
        ),
        style: frameStyle,
      }),
      'data-media': block.id,
      'data-kind': block.kind,
      'data-src': src,
      'data-youtube': youtube ? source.youtube : '',
      'data-title': label,
      'data-duration': durationMs === null ? '' : String(durationMs),
      ...playbackAttributes(playback),
      role: 'button',
      tabindex: '0',
      'aria-label': block.alt !== undefined && block.alt !== '' ? block.alt : label,
      ...raster(ctx, block.id, 'shot', false),
    },
    inner,
  );
}

/** The spotlight's clip for its shape (SPEC-5 3.7): the ellipse, the rounded rectangle, or nothing for a rectangle. */
export function spotlightClip(
  shape: BlockOf<'spotlight'>['shape'],
  w: number,
  h: number,
): string | false {
  if (shape === 'rect') return false;
  return `clip-path:path('${shapePath(shape, w, h)}')`;
}

/**
 * The speaker spotlight (SPEC-5 3.7; R11 6): a placeholder the show fills with the presenter's
 * camera. In every still it draws the picture the block names inside its shape, or Turboslide's
 * person glyph on the plate ground; the root carries `data-spotlight` and `data-shape` for the
 * controller's `getUserMedia` mount, and the exporter shoots it as a `shot` raster (the
 * placeholder picture named `ts:<slide>#<block>`).
 */
export function renderSpotlight(block: BlockOf<'spotlight'>, ctx: BlockContext): string {
  const w = block.pos?.w ?? ctx.slotWidth ?? 480;
  const h = block.pos?.h ?? ctx.slotHeight ?? 480;
  const picture = block.picture !== undefined ? imageFor(ctx, block.picture, block.id) : undefined;
  const hasPicture = picture !== undefined && picture.src !== '';
  const inner = hasPicture
    ? voidEl('img', {
        class: 'ts-spotlight-picture',
        src: picture.src,
        ...twinAttrs(picture),
        ...sizeAttrs(picture.size),
        alt: '',
      })
    : glyph('ts-person', 'ts-spotlight-glyph');
  return el(
    'div',
    {
      ...rootAttrs(block, ctx, {
        className: classes(SPOTLIGHT_ROOT_CLASS, `is-${block.shape}`, hasPicture && 'has-picture'),
        style: style(
          block.pos === undefined && `width:${px(w)}px;height:${px(h)}px`,
          spotlightClip(block.shape, w, h),
        ),
      }),
      'data-spotlight': block.id,
      'data-shape': block.shape,
      role: 'img',
      'aria-label': block.alt ?? 'Speaker spotlight',
      ...raster(ctx, block.id, 'shot', false),
    },
    inner,
  );
}

/**
 * The stylesheet of the two roots, appended to `BLOCK_CSS` (block-css.ts, by request to the
 * integrator): the root fills its box and clips; the poster covers it; the frame is paper with
 * the glyph in ink, the title in the text face and the duration in the small size; the badge is
 * the play glyph over a video poster; `hide-icon` hides the root in the show alone (the stills
 * keep the icon, SPEC-5 0.3), which the present layer's class `is-present` scopes.
 */
export const MEDIA_BLOCK_CSS = `
/* ---- media (gslides-parity SPEC-5 3.4, 3.5; B2): the poster root the show mounts the element over ---- */
.ts-sheet .ts-media { position: relative; display: block; box-sizing: border-box; overflow: hidden; background: var(--paper); color: var(--ink); cursor: pointer; outline: none; }
.ts-sheet .free > .ts-media, .ts-sheet .free > .link > .ts-media { width: 100%; height: 100%; }
.ts-sheet .ts-media > img.ts-media-poster { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.ts-sheet .ts-media > .ts-media-frame { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 8%; box-sizing: border-box; border: 1px solid var(--hair); text-align: center; }
.ts-sheet .ts-media .ts-media-glyph { width: 28%; height: 28%; max-width: 160px; max-height: 160px; min-width: 20px; min-height: 20px; fill: currentColor; display: block; }
.ts-sheet .ts-media.is-audio .ts-media-glyph { width: 56%; height: 56%; }
.ts-sheet .ts-media .ts-media-words { display: grid; gap: 4px; max-width: 100%; }
.ts-sheet .ts-media .ts-media-title { font-family: var(--text); font-size: 22px; line-height: 1.3; font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.ts-sheet .ts-media .ts-media-duration { font-family: var(--text); font-size: 16px; line-height: 1.4; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.ts-sheet .ts-media .ts-media-badge { position: absolute; left: 50%; top: 50%; width: 96px; height: 96px; margin: -48px 0 0 -48px; padding: 24px; box-sizing: border-box; border-radius: 50%; background: var(--paper); color: var(--ink); fill: currentColor; opacity: 0.92; pointer-events: none; }
.ts-sheet .ts-media > video, .ts-sheet .ts-media > audio, .ts-sheet .ts-media > iframe { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border: 0; display: block; background: var(--paper); }
.ts-sheet .ts-media.is-mounted > img.ts-media-poster, .ts-sheet .ts-media.is-mounted > .ts-media-badge, .ts-sheet .ts-media.is-mounted > .ts-media-frame { visibility: hidden; }
.ts-sheet.is-present .ts-media.hide-icon, .ts-slideshow .ts-media.hide-icon { visibility: hidden; }
/* ---- the speaker spotlight (SPEC-5 3.7): the placeholder the show fills with the camera ---- */
.ts-sheet .ts-spotlight { position: relative; display: grid; place-items: center; box-sizing: border-box; overflow: hidden; background: var(--plate, var(--paper)); color: var(--ink); border: 1px solid var(--hair); }
.ts-sheet .free > .ts-spotlight, .ts-sheet .free > .link > .ts-spotlight { width: 100%; height: 100%; }
.ts-sheet .ts-spotlight .ts-spotlight-glyph { width: 48%; height: 48%; fill: currentColor; color: var(--ink-2); display: block; }
.ts-sheet .ts-spotlight > img.ts-spotlight-picture, .ts-sheet .ts-spotlight > video { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.ts-sheet .ts-spotlight.is-live > .ts-spotlight-glyph, .ts-sheet .ts-spotlight.is-live > img { visibility: hidden; }
`;

// ---------------------------------------------------------------------------------------------
// The standalone file's three media modes (gslides-parity SPEC-5 3.6 "HTML"; R05 9.2; B2 day 5,
// handed to B1's `renderStandalone`): `inline` turns every stored media file the slides name into
// a `data:` URL inside the 16 MB budget, the largest files first so the ones that do not fit fall
// back to their URL; `url` keeps the renderer's URLs (the Blob URL hosted, the default there);
// `poster` empties `data-src`, so the standalone motion script mounts nothing and the poster
// stands. The function is pure over the rendered HTML: it rewrites the `data-src` attribute of
// the poster roots and nothing else, so B1 calls it on the concatenated slides with the bytes it
// read (`readBytes(file)` from the deck folder) and the budget it has left.

export type StandaloneMediaMode = 'inline' | 'url' | 'poster';

export type StandaloneMediaInput = {
  html: string;
  mode: StandaloneMediaMode;
  /** the deck's media records, whose `file` the roots name through `resolve` */
  media: Readonly<Record<string, MediaAsset>>;
  /** the URL the renderer wrote for a record's file (`ctx.mediaUrl ?? ctx.assetUrl`) */
  resolve: (asset: MediaAsset) => string;
  /** the stored bytes of a record's file; null when the file is not on this instance */
  readBytes?: (asset: MediaAsset) => Uint8Array | null;
  /** the bytes the data URLs may add together; 16 MB less what the page already holds */
  budgetBytes?: number;
};

export type StandaloneMediaResult = {
  html: string;
  /** the record ids whose files travel inline */
  inlined: string[];
  /** the record ids left at their URL because the budget or the bytes were missing */
  fallback: string[];
  /** the bytes the data URLs added (the base64 length) */
  addedBytes: number;
};

/** The standalone build's whole budget (SPEC 5.2 renderStandalone; SPEC-5 3.6). */
export const STANDALONE_BUDGET_BYTES = 16 * 1024 * 1024;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function base64Of(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined')
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The base64 length of a byte count, what a data URL adds to the file. */
export function dataUrlBytes(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

export function standaloneMediaSources(input: StandaloneMediaInput): StandaloneMediaResult {
  const result: StandaloneMediaResult = {
    html: input.html,
    inlined: [],
    fallback: [],
    addedBytes: 0,
  };
  const records = Object.values(input.media);
  if (input.mode === 'url' || records.length === 0) return result;
  const replaceSrc = (url: string, next: string): boolean => {
    if (url === '') return false;
    const pattern = new RegExp(
      `(<div\\b[^>]*\\bdata-media="[^"]*"[^>]*\\bdata-src=")${escapeRegExp(url)}(")`,
      'g',
    );
    let hit = false;
    result.html = result.html.replace(pattern, (_m, head: string, tail: string) => {
      hit = true;
      return `${head}${next}${tail}`;
    });
    return hit;
  };
  if (input.mode === 'poster') {
    for (const asset of records) replaceSrc(input.resolve(asset), '');
    return result;
  }
  // inline: the largest first, so a file that does not fit leaves room for the next
  const budget = input.budgetBytes ?? STANDALONE_BUDGET_BYTES;
  const named = records.filter((asset) =>
    result.html.includes(`data-src="${input.resolve(asset)}"`),
  );
  const ordered = [...named].sort((a, b) => b.bytes - a.bytes);
  for (const asset of ordered) {
    const bytes = input.readBytes?.(asset) ?? null;
    const cost = bytes === null ? Number.POSITIVE_INFINITY : dataUrlBytes(bytes.byteLength);
    if (bytes === null || result.addedBytes + cost > budget) {
      result.fallback.push(asset.id);
      continue;
    }
    if (replaceSrc(input.resolve(asset), `data:${asset.mime};base64,${base64Of(bytes)}`)) {
      result.inlined.push(asset.id);
      result.addedBytes += cost;
    }
  }
  return result;
}
