// Audio and video (gslides-parity SPEC-5 5.1; R04 5.5; R11 1): a `p:pic` whose `p:nvPr` carries
// `a:videoFile` or `a:audioFile` (with the file behind `p14:media` in its `p:extLst`) becomes a
// `media` block and a `MediaAsset` when the file is one of the five formats and under the kind's
// cap, else the poster picture with a row. `p14:trim` gives Start at and End at; the click and
// auto play facts of `p:cMediaNode` give the playback start; a linked web video (an external
// relationship) becomes the YouTube form when it is a YouTube link. The sha256 is computed with
// WebCrypto, so the reader is asynchronous where a media part is present.
import type { Element } from '@xmldom/xmldom';

import type { MediaAsset } from '@turboslide/schema/assets';
import type { Block, MediaBlock } from '@turboslide/schema/blocks';
import type { MediaKind, MediaPlayback } from '@turboslide/schema/blocks/media';
import { MEDIA_BYTES_MAX, mediaAssetFile, parseYoutubeUrl } from '@turboslide/schema/blocks/media';
import { isMediaRefusal, mediaInfo } from '@turboslide/store/media/info';

import type { SlideContext } from './context.ts';
import { altOf, placed, rowOn, shapeFacts } from './context.ts';
import { inheritedXfrm } from './inherit.ts';
import { REL } from './package.ts';
import { blipPart, readPicture, storePicture } from './pictures.ts';
import { ROW_CODES } from './report.ts';
import { positionOf } from './shapes.ts';
import { attr, attrNS, child, children, descendants, elementChildren, is, path } from './xml.ts';

/** The media facts of a `p:pic`'s `p:nvPr`: the kind and the relationship of the file. */
export type MediaFacts = {
  kind: MediaKind;
  /** the `a:videoFile` or `a:audioFile` relationship id (a link to the part or an external URL) */
  linkId?: string;
  /** the `p14:media r:embed` relationship id, the embedded file PowerPoint 2010 and later write */
  embedId?: string;
  trim?: { startMs?: number; endMs?: number };
};

/** The media facts of a picture, or undefined for a plain picture. */
export function mediaFacts(pic: Element): MediaFacts | undefined {
  const nvPr = path(pic, ['p', 'nvPicPr'], ['p', 'nvPr']);
  if (nvPr === undefined) return undefined;
  const video = child(nvPr, 'a', 'videoFile');
  const audio = child(nvPr, 'a', 'audioFile') ?? child(nvPr, 'a', 'wavAudioFile');
  if (video === undefined && audio === undefined) return undefined;
  const facts: MediaFacts = { kind: video !== undefined ? 'video' : 'audio' };
  const linkId =
    attrNS((video ?? audio) as Element, 'r', 'link') ??
    attrNS((video ?? audio) as Element, 'r', 'embed');
  if (linkId !== undefined) facts.linkId = linkId;
  const extLst = child(nvPr, 'p', 'extLst');
  if (extLst !== undefined) {
    for (const ext of children(extLst, 'p', 'ext')) {
      const media = child(ext, 'p14', 'media');
      if (media === undefined) continue;
      const embed = attrNS(media, 'r', 'embed');
      if (embed !== undefined) facts.embedId = embed;
      const trim = child(media, 'p14', 'trim');
      if (trim !== undefined) {
        const st = Number(attr(trim, 'st') ?? '');
        const end = Number(attr(trim, 'end') ?? '');
        facts.trim = {
          ...(Number.isFinite(st) && st > 0 ? { startMs: Math.round(st) } : {}),
          ...(Number.isFinite(end) && end > 0 ? { endMs: Math.round(end) } : {}),
        };
      }
    }
  }
  return facts;
}

/** The sha256 of bytes as hex through WebCrypto (Node 20 and the browsers). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The playback the timing tree says: auto when a `p:cMediaNode` under an `afterEffect` or `withEffect` plays it, click otherwise. */
export function playbackOf(slideRoot: Element, spid: number, facts: MediaFacts): MediaPlayback {
  const playback: MediaPlayback = { start: 'click' };
  const timing = child(slideRoot, 'p', 'timing');
  if (timing !== undefined) {
    for (const node of [
      ...descendants(timing, 'p', 'video'),
      ...descendants(timing, 'p', 'audio'),
    ]) {
      const media = child(node, 'p', 'cMediaNode');
      if (media === undefined) continue;
      const target = descendants(media, 'p', 'spTgt')[0];
      if (target === undefined || Number(attr(target, 'spid') ?? '') !== spid) continue;
      const cTn = child(media, 'p', 'cTn');
      const repeat = cTn === undefined ? undefined : attr(cTn, 'repeatCount');
      if (repeat === 'indefinite') playback.loop = true;
      const vol = attr(media, 'vol');
      const mute = attr(media, 'mute');
      if (mute === '1' || mute === 'true') playback.mute = true;
      else if (vol !== undefined) {
        const v = Number(vol);
        if (Number.isFinite(v)) playback.volume = Math.max(0, Math.min(100, Math.round(v / 1000)));
      }
      if (attr(media, 'showWhenStopped') === '0' && facts.kind === 'audio')
        playback.hideIcon = true;
      const parent = node.parentNode as Element | null;
      const parentCTn =
        parent === null ? undefined : elementChildren(parent).find((el) => is(el, 'p', 'cTn'));
      const nodeType = parentCTn === undefined ? undefined : attr(parentCTn, 'nodeType');
      const enclosing = descendants(timing, 'p', 'cTn').find(
        (el) => attr(el, 'nodeType') === 'afterEffect' || attr(el, 'nodeType') === 'withEffect',
      );
      void enclosing;
      if (nodeType === 'afterEffect' || nodeType === 'withEffect') playback.start = 'auto';
    }
  }
  if (facts.trim?.startMs !== undefined) playback.startMs = facts.trim.startMs;
  if (facts.trim?.endMs !== undefined) playback.endMs = facts.trim.endMs;
  return playback;
}

/**
 * Reads a media picture into a media block with its stored file and poster, or the poster picture
 * alone with a row when the file cannot be stored (R04 5.5; SPEC-5 5.1).
 */
export async function readMedia(
  pic: Element,
  facts: MediaFacts,
  slideRoot: Element,
  ctx: SlideContext,
): Promise<Block[]> {
  const shape = shapeFacts(pic);
  const object = shape.name;
  if (shape.hidden) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: 'shape.hidden',
      message: 'A hidden media object was left out',
    });
    return [];
  }
  const inherited = inheritedXfrm(pic, ctx.chain);
  if (inherited === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: 'shape.noBox',
      message: 'A media object without a box was dropped',
    });
    return [];
  }
  const pos = positionOf(inherited.xfrm, ctx);
  const alt =
    altOf(shape) ?? (shape.name !== '' ? shape.name : facts.kind === 'video' ? 'Video' : 'Audio');
  const blipFill = child(pic, 'p', 'blipFill');
  const posterPart = blipPart(blipFill, ctx).part;
  let poster: string | undefined;
  if (posterPart !== undefined) {
    const stored = storePicture(posterPart, alt, ctx);
    if ('stored' in stored) poster = stored.stored.asset.id;
  }
  const playback = playbackOf(slideRoot, shape.id, facts);
  // the file: the embedded part first, the linked part second, a web link third
  const embedRel =
    facts.embedId === undefined ? undefined : ctx.pkg.relationship(ctx.slide.part, facts.embedId);
  const linkRel =
    facts.linkId === undefined ? undefined : ctx.pkg.relationship(ctx.slide.part, facts.linkId);
  const part =
    embedRel?.part ??
    (linkRel !== undefined && linkRel.mode === 'Internal' ? linkRel.part : undefined);
  const external =
    linkRel !== undefined && linkRel.mode === 'External' ? linkRel.target : undefined;
  const id = ctx.ids.take(shape.name, facts.kind);
  if (part === undefined && external !== undefined) {
    const youtube = parseYoutubeUrl(external);
    if (youtube.ok) {
      ctx.report.keep();
      const block: MediaBlock = {
        id,
        type: 'media',
        kind: 'video',
        source: { youtube: youtube.link.id },
        playback,
        pos,
        alt,
      };
      if (poster !== undefined) block.poster = poster;
      block.ext = { pptxName: shape.name, pptxMediaUrl: external };
      return [placed(ctx, block)];
    }
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.mediaFormat,
      message: `A linked ${facts.kind} at ${external} is shown as its poster; only YouTube links play`,
    });
    return posterOnly(pic, ctx, id, pos, alt, external);
  }
  if (part === undefined || !ctx.pkg.has(part)) {
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.mediaFormat,
      message: `A ${facts.kind} without an embedded file is shown as its poster`,
    });
    return posterOnly(pic, ctx, id, pos, alt, undefined);
  }
  const existing = ctx.assets.idOf(part);
  let asset: MediaAsset | undefined =
    existing === undefined ? undefined : ctx.assets.media.get(existing);
  if (asset === undefined) {
    const name = part.split('/').pop() ?? part;
    const bytes = ctx.pkg.bytes(part);
    // the store's own parsers (B2, R11 1): the container by signature, the duration, the codecs;
    // a cut or foreign file is a refusal with its sentence
    const info = mediaInfo(bytes);
    if (isMediaRefusal(info)) {
      ctx.report.substitute({
        ...rowOn(ctx, object),
        code: ROW_CODES.mediaFormat,
        message: `The ${facts.kind} file ${name} is shown as its poster: ${info.refused}`,
      });
      return posterOnly(pic, ctx, id, pos, alt, undefined);
    }
    const kind: MediaKind = info.kind;
    const cap = MEDIA_BYTES_MAX[kind];
    if (bytes.byteLength > cap) {
      ctx.report.substitute({
        ...rowOn(ctx, object),
        code: ROW_CODES.mediaCap,
        message: `The ${facts.kind} file is ${bytes.byteLength} bytes, over the ${cap} byte cap; it is shown as its poster`,
      });
      return posterOnly(pic, ctx, id, pos, alt, undefined);
    }
    const sha256 = await sha256Hex(bytes);
    const assetId = ctx.assets.freshId(name.replace(/\.[^.]+$/, '') || facts.kind);
    const file = mediaAssetFile(assetId, sha256, info.mime);
    asset = {
      id: assetId,
      kind,
      role: 'media',
      file,
      mime: info.mime,
      bytes: bytes.byteLength,
      sha256,
      durationMs: info.durationMs,
      codecs: info.codecs,
      source: { kind: 'file' },
      ext: { pptxPart: part },
    };
    if (info.size !== undefined) asset.size = info.size;
    if (poster !== undefined) asset.poster = poster;
    if (shape.name !== '') asset.title = shape.name;
    ctx.assets.addMedia(part, asset, { relative: file, bytes, contentType: info.mime });
  }
  ctx.report.keep();
  const block: MediaBlock = {
    id,
    type: 'media',
    kind: asset.kind,
    source: { asset: asset.id },
    playback,
    pos,
    alt,
  };
  if (poster !== undefined) block.poster = poster;
  block.ext = { pptxName: shape.name };
  return [placed(ctx, block)];
}

/** The poster picture alone, as a `picture` block, when the file could not come along. */
function posterOnly(
  pic: Element,
  ctx: SlideContext,
  id: string,
  pos: Blocks0,
  alt: string,
  url: string | undefined,
): Block[] {
  void id;
  const blocks = readPicture(pic, ctx);
  return blocks.map((block) => ({
    ...block,
    ...(block.pos !== undefined
      ? {
          pos: {
            ...pos,
            z: block.pos.z,
            ...(block.pos.group !== undefined ? { group: block.pos.group } : {}),
          },
        }
      : {}),
    alt,
    ext: {
      ...(block.ext ?? {}),
      pptxMediaPoster: true,
      ...(url !== undefined ? { pptxMediaUrl: url } : {}),
    },
  }));
}

type Blocks0 = NonNullable<Block['pos']>;

/** True when a `p:pic` is a media frame (R04 5.5). */
export function isMediaPicture(pic: Element): boolean {
  return mediaFacts(pic) !== undefined;
}

export { REL };
