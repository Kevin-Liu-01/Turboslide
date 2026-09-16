// The media lane's handlers (gslides-parity SPEC-5 3.3, 3.8; R11 1.8, 8.1; MILESTONES-5 B2 day 3):
// media.insert (a file, a URL through safeFetch, a presigned upload key or a YouTube link becomes
// a MediaAsset record and a media block on the slide in one write), media.setPlayback (Google's
// Format options fields as one block.set with the Play row rule of 2.1), media.poster (a picture
// file as the poster; the frame capture is the editor's or the worker's), media.info and
// media.list (the stored records and the blocks that play them), camera.capture (the Camera
// dialog is the executor; a transport without a page says so) and view.presentOnScreen (the
// show is the executor; the server answers unsupported). Landed empty by the integrator on day 0
// as the seam of SPEC-5 1.6; B2 fills the registrations here.
//
// The module stays free of `node:` imports: the editor page imports this graph through
// store-actions.ts. Everything that reads a file, fetches a URL, digests bytes or decodes a
// picture arrives through `MediaIntakeDeps`, composed by `nodeMediaIntake` (media-node.ts) on
// the CLI and the hosted dispatcher; a dispatcher composed without it answers `media.insert`
// with the sentence below for the file forms and still serves the YouTube form, the playback
// write and the reads. The write path (the canvas conversion, the commit, the findings) is
// store-actions.ts's, imported at call time; the two modules reference each other and neither
// reads the other at module evaluation, so the cycle is inert under ESM live bindings.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import type { Asset, MediaAsset } from '@turboslide/schema/assets';
import type { Block, MediaBlock } from '@turboslide/schema/blocks';
import {
  DECK_MEDIA_BYTES_MAX,
  MEDIA_BYTES_MAX,
  SECOND_AUTO_YOUTUBE_SENTENCE,
  YOUTUBE_MIN_BOX,
  YOUTUBE_TOO_SMALL_SENTENCE,
  applyPlaybackPatch,
  defaultMediaAlt,
  defaultMediaBox,
  isYoutubeSource,
  mediaAssetFile,
  mediaBytesOf,
  mediaKindsOfMime,
  parseYoutubeUrl,
  playRowsFor,
  playbackProblem,
} from '@turboslide/schema/blocks/media';
import type {
  MediaKind,
  MediaPlayback,
  PlaybackPatch,
  PlaybackStart,
} from '@turboslide/schema/blocks/media';
import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { canvasObjects, slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { deckPage } from '@turboslide/schema/render';
import { mediaInfo, isMediaRefusal } from '@turboslide/store/media/info';
import type { MediaInfo } from '@turboslide/store/media/info';

import type { LaneDeps } from './deps.ts';
import { commit, findingsFor, withCanvas } from '../store-actions.ts';
import type { SlideResult, WriteContext } from '../store-actions.ts';

/** A media file as the intake reads it: the bytes once in memory, the name the id derives from, where it came from. */
export type MediaInput = {
  bytes: Uint8Array;
  /** a file name to derive the id and the title from */
  name: string;
  /** the origin recorded on the asset: the file name, the URL, the upload key */
  origin: string;
  kind: 'path' | 'data' | 'url' | 'upload';
  /** removes a staged upload once the record committed or the file was refused */
  cleanup?: () => Promise<void>;
};

/** The Node half of the lane (media-node.ts), injected so this module stays free of `node:` imports. */
export type MediaIntakeDeps = {
  /** a path (a checkout), a `data:` URL (the editor's drop) or an https URL through safeFetch (R11 1.8 path 1) */
  readInput: (input: string, options: { maxBytes: number }) => Promise<MediaInput>;
  /** hosted: the staged bytes of a presigned upload by key (R11 1.8 path 3); null when nothing is there */
  readUpload?: (key: string) => Promise<MediaInput | null>;
  /** sha256 hex of the bytes */
  digest: (bytes: Uint8Array) => string;
  /** the oEmbed title of a video over safeFetch (R11 4.3); null when the fetch fails or is not allowed */
  fetchYoutubeTitle?: (id: string) => Promise<string | null>;
  /** a picture file as a picture asset through the picture intake (the poster of media.poster --file) */
  addPicture?: (request: {
    id: string;
    file: string;
    alt: string;
    role: 'thumb';
  }) => Promise<Asset>;
  /** the stored bytes of an asset file, for media.info --refresh */
  readStored?: (relative: string) => Promise<Uint8Array | null>;
  /** the caller's tier caps per kind (SPEC-5 0.18); the schema's MEDIA_BYTES_MAX when absent (a checkout) */
  maxBytes?: (kind: MediaKind) => number;
  /** why this transport refuses media files (the tmp tier, the missing private store); null admits */
  refusal?: string | null;
  /** hosted: counts a file or url intake against the daily media rows (an upload was counted by its grant) */
  countMedia?: (bytes: number) => Promise<void>;
  /**
   * hosted: the deck's `assetKey` when its access mode is `restricted` (gslides-parity SPEC-5
   * 0.19), read from the access record after the caller's write check; null on an open or link
   * deck and on a checkout. With a key the file is stored under `d/<deckId>/<assetKey>/` through
   * the store's `putKeyedAsset` and the record keeps its `assets/<file>` path (the key is the
   * reader's, so a rotation moves no record).
   */
  assetKey?: () => Promise<string | null>;
  log?: (line: string) => void;
};

/** A store that can write a keyed media file (the blob backend); the file and tmp stores cannot. */
type KeyedAssetStore = {
  putKeyedAsset: (
    relative: string,
    bytes: Uint8Array,
    assetKey: string,
    contentType?: string,
  ) => Promise<{ relative: string; url: string | null; existed: boolean }>;
};

function keyedStoreOf(store: unknown): KeyedAssetStore | null {
  return typeof (store as KeyedAssetStore).putKeyedAsset === 'function'
    ? (store as KeyedAssetStore)
    : null;
}

export type MediaLaneDeps = LaneDeps & { media?: MediaIntakeDeps };

/** The refusal of a dispatcher composed without the Node half (the editor page's own transport). */
export function noMediaIntake(id: string): string {
  return `${id} needs the media intake on this transport (a file, a URL or an upload is read on the server or the CLI); the dispatcher was composed without it`;
}

/** The sentence a transport without a page answers `camera.capture` with (R11 8.1). */
export const CAMERA_NEEDS_EDITOR =
  'Needs the editor open: run camera.capture from the Camera dialog, or pass --from <studio>';

type Rev = { baseRevision: number };

export type MediaInsertInput = Rev & {
  slideId: string;
  kind?: MediaKind;
  file?: string;
  url?: string;
  upload?: string;
  youtube?: string;
  pos?: Position;
  playback?: Partial<MediaPlayback>;
  alt?: string;
  title?: string;
};

export type MediaInsertOutput = SlideResult & {
  blockId: string;
  assetId?: string;
  asset?: MediaAsset;
};

export type MediaSetPlaybackInput = Rev & { slideId: string; blockId: string } & PlaybackPatch;

export type MediaPosterInput = Rev & {
  slideId: string;
  blockId: string;
  atMs?: number;
  file?: string;
};

export type MediaInfoInput = { id: string; refresh?: boolean };

export type MediaInfoOutput = {
  asset: MediaAsset;
  blocks: { slideId: string; blockId: string }[];
};

function requireSlide(document: DeckDocument, slideId: string): Slide {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  return slide;
}

function requireMediaBlock(slide: Slide, blockId: string): MediaBlock {
  const row = slideBlocks(slide).find(({ block }) => block.id === blockId);
  if (row === undefined) throw new RangeError(`No block "${blockId}" on slide "${slide.id}"`);
  if (row.block.type !== 'media')
    throw new TypeError(
      `Block "${blockId}" is a ${row.block.type}; the media actions work on audio and video`,
    );
  return row.block;
}

/** The media blocks of a slide, composite cells included (validate/media.ts walks the same). */
export function mediaBlocks(slide: Slide): MediaBlock[] {
  const out: MediaBlock[] = [];
  const walk = (blocks: ReadonlyArray<Block>): void => {
    for (const block of blocks) {
      if (block.type === 'media') out.push(block);
      if (block.type === 'composite') for (const cell of block.cells) walk(cell.blocks);
    }
  };
  walk(slideBlocks(slide).map(({ block }) => block));
  return out;
}

/** The slides and blocks of a deck that play one media record (media.info's `blocks`). */
export function blocksPlaying(
  document: DeckDocument,
  assetId: string,
): { slideId: string; blockId: string }[] {
  const out: { slideId: string; blockId: string }[] = [];
  for (const slideId of document.deck.sections.flatMap((section) => section.slideIds)) {
    const slide = document.slides[slideId];
    if (slide === undefined) continue;
    for (const block of mediaBlocks(slide)) {
      if (!isYoutubeSource(block.source) && block.source.asset === assetId)
        out.push({ slideId, blockId: block.id });
    }
  }
  return out;
}

/** A slug from a file name's stem, `media` when nothing is left. */
export function mediaSlug(name: string): string {
  const stem = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'media' : slug;
}

function freeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Every id in use across the two asset maps (SPEC-5 0.16: one id space). */
function takenAssetIds(deck: Deck): Set<string> {
  return new Set([...Object.keys(deck.assets), ...Object.keys(deck.media ?? {})]);
}

/** True when another YouTube block of the slide already plays automatically (R11 4.2: one automatic player per page). */
export function hasAutoYoutube(slide: Slide, exceptBlockId?: string): boolean {
  return mediaBlocks(slide).some(
    (block) =>
      block.id !== exceptBlockId &&
      isYoutubeSource(block.source) &&
      block.playback.start === 'auto',
  );
}

/**
 * The mutations that place a new object on a canvas slide the way `blockInsert` does (SPEC-2
 * 1.6, 0.8): the conversion prefix when the slide is not a canvas yet, the object on top of the
 * stack, last in `main`; plus the Play row when the block starts automatically.
 */
async function insertMutations(
  deps: MediaLaneDeps,
  document: DeckDocument,
  slide: Slide,
  block: MediaBlock,
): Promise<{ mutations: Mutation[]; slide: Slide }> {
  const canvas = await withCanvas(deps, document, slide);
  const objects = canvasObjects(canvas.slide);
  const after = objects.length > 0 ? objects[objects.length - 1]?.id : undefined;
  const top = objects.length > 0 ? Math.max(...objects.map((object) => object.pos?.z ?? 0)) : -1;
  const placed: MediaBlock = {
    ...block,
    pos: { ...(block.pos as Position), z: block.pos?.z ?? top + 1 },
  };
  const mutations: Mutation[] = [
    ...canvas.prefix,
    {
      op: 'block.insert',
      slideId: slide.id,
      slot: 'main',
      ...(after !== undefined ? { after } : {}),
      block: placed,
    },
  ];
  const rows = playRowsFor(canvas.slide.animations, placed.id, placed.playback.start);
  if (rows !== null)
    mutations.push({ op: 'slide.set', slideId: slide.id, path: '/animations', value: rows });
  return { mutations, slide: canvas.slide };
}

function slideResult(
  deps: LaneDeps,
  document: DeckDocument,
  revision: number,
  slideId: string,
): SlideResult {
  return {
    slide: requireSlide(document, slideId),
    revision,
    findings: findingsFor(deps, document, slideId),
  };
}

/** The intake refusal a caller sees: the sentence of R11 1.1's table as a TypeError (400). */
function refuse(sentence: string): never {
  throw new TypeError(sentence);
}

function playbackFor(
  input: Partial<MediaPlayback> | undefined,
  extra: { startMs?: number; endMs?: number } = {},
): MediaPlayback {
  const patch: PlaybackPatch = {
    ...(input?.start !== undefined ? { start: input.start } : {}),
    ...(input?.startMs !== undefined ? { startMs: input.startMs } : {}),
    ...(input?.endMs !== undefined ? { endMs: input.endMs } : {}),
    ...(input?.mute !== undefined ? { mute: input.mute } : {}),
    ...(input?.loop !== undefined ? { loop: input.loop } : {}),
    ...(input?.volume !== undefined ? { volume: input.volume } : {}),
    ...(input?.hideIcon !== undefined ? { hideIcon: input.hideIcon } : {}),
    ...(input?.stopOnSlideChange !== undefined
      ? { stopOnSlideChange: input.stopOnSlideChange }
      : {}),
    ...(extra.startMs !== undefined && input?.startMs === undefined
      ? { startMs: extra.startMs }
      : {}),
    ...(extra.endMs !== undefined && input?.endMs === undefined ? { endMs: extra.endMs } : {}),
  };
  return applyPlaybackPatch(undefined, patch);
}

export async function mediaInsert(
  deps: MediaLaneDeps,
  ctx: WriteContext,
  input: MediaInsertInput,
): Promise<MediaInsertOutput> {
  const forms = [input.file, input.url, input.upload, input.youtube].filter((v) => v !== undefined);
  if (forms.length !== 1)
    throw new TypeError('media.insert wants exactly one of file, url, upload or youtube');
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const page = deckPage(current.deck);
  const takenBlocks = new Set(slideBlocks(slide).map(({ block }) => block.id));

  if (input.youtube !== undefined) {
    const parsed = parseYoutubeUrl(input.youtube);
    if (!parsed.ok) throw new TypeError(parsed.reason);
    const title =
      input.title ??
      (await deps.media?.fetchYoutubeTitle?.(parsed.link.id).catch(() => null)) ??
      undefined;
    let playback = playbackFor(input.playback, parsed.link);
    if (playback.loop === true) refuse('Loop is not offered for a YouTube video');
    if (playback.start === 'auto' && hasAutoYoutube(slide)) {
      deps.media?.log?.(SECOND_AUTO_YOUTUBE_SENTENCE);
      playback = { ...playback, start: 'click' };
    }
    const box = input.pos ?? defaultMediaBox('video', page);
    if (box.w < YOUTUBE_MIN_BOX || box.h < YOUTUBE_MIN_BOX) refuse(YOUTUBE_TOO_SMALL_SENTENCE);
    const block: MediaBlock = {
      id: freeId(mediaSlug(title ?? 'video'), takenBlocks),
      type: 'media',
      kind: 'video',
      source: { youtube: parsed.link.id },
      playback,
      alt: input.alt ?? defaultMediaAlt('video', title),
      pos: box,
      ...(title !== undefined ? { ext: { mediaTitle: title } } : {}),
    };
    const { mutations } = await insertMutations(deps, current, slide, block);
    const committed = await commit(deps, ctx, input.baseRevision, mutations);
    return {
      ...slideResult(deps, committed.document, committed.revision, input.slideId),
      blockId: block.id,
    };
  }

  const media = deps.media;
  if (media === undefined) throw new TypeError(noMediaIntake('media.insert'));
  if (media.refusal !== undefined && media.refusal !== null) refuse(media.refusal);
  const cap = (kind: MediaKind): number => media.maxBytes?.(kind) ?? MEDIA_BYTES_MAX[kind];
  const readCap = Math.max(cap('audio'), cap('video'));
  let read: MediaInput | null;
  if (input.upload !== undefined) {
    if (media.readUpload === undefined)
      throw new TypeError(noMediaIntake('media.insert { upload }'));
    read = await media.readUpload(input.upload);
    if (read === null)
      throw new RangeError(
        'No upload is stored under that key; request a grant and PUT the file first',
      );
  } else {
    read = await media.readInput((input.file ?? input.url) as string, { maxBytes: readCap });
  }
  try {
    const info = mediaInfo(read.bytes);
    if (isMediaRefusal(info)) refuse(info.refused);
    const kind: MediaKind = input.kind ?? info.kind;
    if (!mediaKindsOfMime(info.mime).includes(kind))
      refuse(`A ${info.format} file is ${info.kind}, not ${kind}`);
    if (read.bytes.byteLength > cap(kind))
      refuse(kind === 'audio' ? 'This audio file is too large' : 'This video is too large');
    if (mediaBytesOf(current.deck.media) + read.bytes.byteLength > DECK_MEDIA_BYTES_MAX)
      refuse(
        `This presentation holds ${Math.round(mediaBytesOf(current.deck.media) / (1024 * 1024))} MB of audio and video; the cap is ${Math.round(DECK_MEDIA_BYTES_MAX / (1024 * 1024))} MB`,
      );
    const sha256 = media.digest(read.bytes);
    const assetId = freeId(mediaSlug(read.name), takenAssetIds(current.deck));
    const file = mediaAssetFile(assetId, sha256, info.mime);
    // a dropped or pasted file has no name to title the record by (R11 1.8: `pasted.<ext>`)
    const title = input.title ?? (read.kind === 'data' ? undefined : titleFromName(read.name));
    const record: MediaAsset = {
      id: assetId,
      kind,
      role: 'media',
      file,
      mime: info.mime,
      bytes: read.bytes.byteLength,
      sha256,
      durationMs: info.durationMs,
      ...(info.size !== undefined ? { size: info.size } : {}),
      codecs: info.codecs,
      ...(title !== undefined ? { title } : {}),
      source: sourceOf(read),
    };
    const playback = playbackFor(input.playback);
    const problem = playbackProblem(playback, { asset: assetId }, info.durationMs);
    if (problem !== null && problem.severity === 3) refuse(problem.message);
    const box = input.pos ?? defaultMediaBox(kind, page, info.size);
    const block: MediaBlock = {
      id: freeId(mediaSlug(read.name), takenBlocks),
      type: 'media',
      kind,
      source: { asset: assetId },
      playback,
      alt: input.alt ?? defaultMediaAlt(kind, title),
      pos: box,
    };
    // the file first (this instance's renderer and the next instance read the store), then the record and the block in one write;
    // a restricted deck's file goes under its key (SPEC-5 0.19) when the store can hold one there
    const keyed = keyedStoreOf(deps.store);
    const assetKey = keyed === null ? null : ((await media.assetKey?.()) ?? null);
    const put =
      keyed !== null && assetKey !== null
        ? await keyed.putKeyedAsset(file, read.bytes, assetKey, info.mime)
        : await deps.store.putAsset(file, read.bytes, info.mime);
    media.log?.(
      `media: ${put.relative} ${read.bytes.byteLength} bytes${put.existed ? ' (existed)' : ''}${assetKey !== null ? ' (keyed)' : ''}`,
    );
    const { mutations } = await insertMutations(deps, current, slide, block);
    const committed = await commit(deps, ctx, input.baseRevision, [
      { op: 'asset.set', asset: record },
      ...mutations,
    ]);
    if (read.kind !== 'upload') await media.countMedia?.(read.bytes.byteLength);
    const stored = committed.document.deck.media?.[assetId] ?? record;
    return {
      ...slideResult(deps, committed.document, committed.revision, input.slideId),
      blockId: block.id,
      assetId,
      asset: stored,
    };
  } finally {
    await read.cleanup?.().catch(() => undefined);
  }
}

/** The title a file name gives a record: the stem with dashes and underscores as spaces. */
export function titleFromName(name: string): string | undefined {
  const stem = name
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return stem === '' ? undefined : stem;
}

function sourceOf(read: MediaInput): MediaAsset['source'] {
  switch (read.kind) {
    case 'url': {
      let origin = read.origin;
      try {
        origin = new URL(read.origin).origin;
      } catch {
        // the origin stays the string
      }
      return { kind: 'url', origin };
    }
    case 'upload':
      return { kind: 'upload' };
    default:
      return { kind: 'file' };
  }
}

export async function mediaSetPlayback(
  deps: MediaLaneDeps,
  ctx: WriteContext,
  input: MediaSetPlaybackInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const block = requireMediaBlock(slide, input.blockId);
  const { slideId, blockId, baseRevision, ...patch } = input;
  const next = applyPlaybackPatch(block.playback, patch);
  const asset = isYoutubeSource(block.source)
    ? undefined
    : current.deck.media?.[block.source.asset];
  const problem = playbackProblem(next, block.source, asset?.durationMs);
  if (problem !== null && problem.severity === 3) throw new TypeError(problem.message);
  if (
    next.start === 'auto' &&
    block.playback.start !== 'auto' &&
    isYoutubeSource(block.source) &&
    hasAutoYoutube(slide, block.id)
  )
    throw new TypeError(SECOND_AUTO_YOUTUBE_SENTENCE);
  const mutations: Mutation[] = [
    { op: 'block.set', slideId, blockId, path: '/playback', value: next },
  ];
  const rows = playRowsFor(slide.animations, blockId, next.start as PlaybackStart);
  if (rows !== null) mutations.push({ op: 'slide.set', slideId, path: '/animations', value: rows });
  const committed = await commit(deps, ctx, baseRevision, mutations);
  return slideResult(deps, committed.document, committed.revision, slideId);
}

/** The refusal of a frame capture on a transport without a page (R11 3, 8.1). */
export const POSTER_NEEDS_PAGE =
  'media.poster --at captures a frame in the editor; on this transport pass --file <frame.png> (the render worker captures webm posters only)';

export async function mediaPoster(
  deps: MediaLaneDeps,
  ctx: WriteContext,
  input: MediaPosterInput,
): Promise<SlideResult & { posterAssetId: string }> {
  if ((input.atMs === undefined) === (input.file === undefined))
    throw new TypeError('media.poster takes atMs or file, not both and not neither');
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const block = requireMediaBlock(slide, input.blockId);
  if (input.file === undefined) throw new TypeError(POSTER_NEEDS_PAGE);
  const media = deps.media;
  if (media?.addPicture === undefined) throw new TypeError(noMediaIntake('media.poster'));
  const posterId = freeId(`${block.id}-poster`, takenAssetIds(current.deck));
  const picture = await media.addPicture({
    id: posterId,
    file: input.file,
    alt: block.alt ?? `Poster of ${block.id}`,
    role: 'thumb',
  });
  const mutations: Mutation[] = [
    { op: 'asset.set', asset: picture },
    { op: 'block.set', slideId: slide.id, blockId: block.id, path: '/poster', value: picture.id },
  ];
  // the previous poster leaves with the block when nothing else names it
  const previous = block.poster;
  if (
    previous !== undefined &&
    previous !== picture.id &&
    !namedElsewhere(current, previous, block.id)
  )
    mutations.push({ op: 'asset.remove', assetId: previous });
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    ...slideResult(deps, committed.document, committed.revision, input.slideId),
    posterAssetId: picture.id,
  };
}

/** True when a picture asset is named by any block or record other than the one block given. */
function namedElsewhere(document: DeckDocument, assetId: string, exceptBlockId: string): boolean {
  for (const record of Object.values(document.deck.media ?? {}))
    if (record.poster === assetId) return true;
  for (const slide of Object.values(document.slides)) {
    for (const { block } of slideBlocks(slide)) {
      if (block.id === exceptBlockId) continue;
      const json = JSON.stringify(block);
      if (json.includes(`"${assetId}"`)) return true;
    }
  }
  return false;
}

export async function mediaInfoAction(
  deps: MediaLaneDeps,
  ctx: WriteContext,
  input: MediaInfoInput,
): Promise<MediaInfoOutput> {
  const current = (await deps.store.read()).document;
  let asset = current.deck.media?.[input.id];
  if (asset === undefined) {
    // a block id: the record its source names
    for (const slide of Object.values(current.slides)) {
      const block = mediaBlocks(slide).find((candidate) => candidate.id === input.id);
      if (block === undefined) continue;
      if (isYoutubeSource(block.source))
        throw new TypeError(`Block "${input.id}" plays a YouTube video and has no stored record`);
      asset = current.deck.media?.[block.source.asset];
      break;
    }
  }
  if (asset === undefined) throw new RangeError(`No media asset or media block "${input.id}"`);
  if (input.refresh === true && deps.media?.readStored !== undefined) {
    const bytes = await deps.media.readStored(asset.file);
    if (bytes !== null) {
      const info = mediaInfo(bytes);
      if (!isMediaRefusal(info)) {
        const refreshed = refreshedRecord(asset, info);
        if (JSON.stringify(refreshed) !== JSON.stringify(asset)) {
          const committed = await commit(deps, ctx, current.deck.revision, [
            { op: 'asset.set', asset: refreshed },
          ]);
          asset = committed.document.deck.media?.[asset.id] ?? refreshed;
        }
      }
    }
  }
  return { asset, blocks: blocksPlaying(current, asset.id) };
}

/** The record with the container's current facts (duration, size, codecs) and nothing else moved. */
export function refreshedRecord(asset: MediaAsset, info: MediaInfo): MediaAsset {
  const next: MediaAsset = { ...asset, durationMs: info.durationMs, codecs: info.codecs };
  if (info.size !== undefined) next.size = info.size;
  else delete next.size;
  return next;
}

export async function mediaList(deps: MediaLaneDeps): Promise<{ assets: MediaAsset[] }> {
  const current = (await deps.store.read()).document;
  return { assets: Object.values(current.deck.media ?? {}) };
}

/** The handlers this lane registers on a dispatcher (the CLI's, the MCP server's, the hosted one). */
export function registerMediaActions(dispatcher: Dispatcher, deps: MediaLaneDeps): void {
  dispatcher.register('media.insert', (input, context) =>
    mediaInsert(deps, context as WriteContext, input as MediaInsertInput),
  );
  dispatcher.register('media.setPlayback', (input, context) =>
    mediaSetPlayback(deps, context as WriteContext, input as MediaSetPlaybackInput),
  );
  dispatcher.register('media.poster', (input, context) =>
    mediaPoster(deps, context as WriteContext, input as MediaPosterInput),
  );
  dispatcher.register('media.info', (input, context) =>
    mediaInfoAction(deps, context as WriteContext, input as MediaInfoInput),
  );
  dispatcher.register('media.list', () => mediaList(deps));
  dispatcher.register('camera.capture', () => {
    throw new TypeError(CAMERA_NEEDS_EDITOR);
  });
  // the show is the executor (R11 7): a transport without a page answers unsupported so the row shows its disabled state
  dispatcher.register('view.presentOnScreen', () => ({
    supported: false,
    screens: 0,
    opened: false,
  }));
}
