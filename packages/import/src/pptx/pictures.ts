// Pictures (gslides-parity SPEC-5 5.1; R04 5.5): one `p:pic` read into a `picture` block and an
// `Asset` record whose file is the media part's bytes, de-duplicated across slides by part name
// (one part is one asset). The trims, the mask, the adjustments, the frame, the picture effects
// of round five (`a:grayscl`, `a:biLevel`, `a:duotone` onto `adjust.recolor`, `a:reflection`
// onto `adjust.reflection`) and the alt text come along; a format the store cannot serve (EMF,
// WMF) lands as a labelled `box` with a row; a picture over the tier's byte cap is refused with a
// row; an OLE preview is the picture with the object named in a row. The media pictures (an
// `a:videoFile`, an `a:audioFile`, a `p14:media`) are `media.ts`'s and never reach this module.
import type { Element } from '@xmldom/xmldom';

import type { Asset } from '@turboslide/schema/assets';
import type {
  Block,
  BoxBlock,
  PictureBlock,
  ShotAdjust,
  ShotFrame,
} from '@turboslide/schema/blocks';
import { RECOLOR_PRESETS } from '@turboslide/schema/blocks';
import type { RecolorPreset } from '@turboslide/schema/blocks';
import type { Position } from '@turboslide/schema/position';

import type { SlideContext } from './context.ts';
import { altOf, colorOf, placed, px2, rowOn, shapeFacts } from './context.ts';
import type { ShapeFacts } from './context.ts';
import { inheritedXfrm } from './inherit.ts';
import { REL } from './package.ts';
import { ROW_CODES } from './report.ts';
import { positionOf, readGeometry, readLine, readShadow, snapLadder, spPrOf } from './shapes.ts';
import { channelDistance, resolveColor } from './theme.ts';
import { clamp01, percentOf } from './units.ts';
import { attr, attrNS, child, children, elementChildren, is } from './xml.ts';

/** The picture formats the store serves as they are, by their signature (R04 5.5). */
export type PictureFormat =
  'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'tiff' | 'svg' | 'emf' | 'wmf' | 'unknown';

export const SERVED_FORMATS: ReadonlySet<PictureFormat> = new Set<PictureFormat>([
  'png',
  'jpeg',
  'gif',
  'webp',
]);

export const PICTURE_CONTENT_TYPES: Readonly<Record<PictureFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  emf: 'image/emf',
  wmf: 'image/wmf',
  unknown: 'application/octet-stream',
};

const EXTENSIONS: Readonly<Record<PictureFormat, string>> = {
  png: 'png',
  jpeg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  bmp: 'bmp',
  tiff: 'tiff',
  svg: 'svg',
  emf: 'emf',
  wmf: 'wmf',
  unknown: 'bin',
};

/** The format by the bytes' signature, never by the name (R04 9). */
export function sniffPicture(bytes: Uint8Array): PictureFormat {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  )
    return 'gif';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'webp';
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  )
    return 'tiff';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x01 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x00
  )
    return 'emf';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xd7 &&
    bytes[1] === 0xcd &&
    bytes[2] === 0xc6 &&
    bytes[3] === 0x9a
  )
    return 'wmf';
  if (bytes.length >= 2 && bytes[0] === 0x01 && bytes[1] === 0x00) return 'wmf';
  const head = new TextDecoder('utf-8', { fatal: false }).decode(
    bytes.subarray(0, Math.min(512, bytes.length)),
  );
  if (/<svg[\s>]/i.test(head) || (/^\s*<\?xml/.test(head) && /<svg/i.test(head))) return 'svg';
  return 'unknown';
}

/** The pixel size of a PNG, JPEG, GIF, WebP or BMP from its header; undefined when unreadable. */
export function pictureSize(
  bytes: Uint8Array,
  format: PictureFormat,
): [number, number] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    switch (format) {
      case 'png':
        if (bytes.length < 24) return undefined;
        return [view.getUint32(16), view.getUint32(20)];
      case 'gif':
        if (bytes.length < 10) return undefined;
        return [view.getUint16(6, true), view.getUint16(8, true)];
      case 'bmp':
        if (bytes.length < 26) return undefined;
        return [Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true))];
      case 'webp': {
        if (bytes.length < 30) return undefined;
        const chunk = String.fromCharCode(
          bytes[12] ?? 0,
          bytes[13] ?? 0,
          bytes[14] ?? 0,
          bytes[15] ?? 0,
        );
        if (chunk === 'VP8 ')
          return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
        if (chunk === 'VP8L') {
          const b0 = bytes[21] ?? 0;
          const b1 = bytes[22] ?? 0;
          const b2 = bytes[23] ?? 0;
          const b3 = bytes[24] ?? 0;
          return [
            1 + (((b1 & 0x3f) << 8) | b0),
            1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
          ];
        }
        if (chunk === 'VP8X')
          return [
            1 + (view.getUint32(24, true) & 0xffffff),
            1 + (view.getUint32(27, true) & 0xffffff),
          ];
        return undefined;
      }
      case 'jpeg': {
        let offset = 2;
        while (offset + 9 < bytes.length) {
          if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
          }
          const marker = bytes[offset + 1] ?? 0;
          if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
          }
          const length = view.getUint16(offset + 2);
          if (
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)
          ) {
            return [view.getUint16(offset + 7), view.getUint16(offset + 5)];
          }
          offset += 2 + length;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/** A short digest of bytes for asset file names (FNV-1a over the bytes, 12 hex characters). */
export function shortDigest(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ bytes.length;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] ?? 0;
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((b << (i % 8)) & 0xff), 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.slice(0, 12);
}

export type StoredPicture = { asset: Asset; format: PictureFormat; size: [number, number] };

/**
 * The asset for a media part, made once per part: the id from the part's stem, the file under
 * `assets/<id>-<digest12>.<ext>` as the neutral twin, `role: 'other'`, `source: { kind: 'file' }`,
 * `inline: 'native'`. Undefined with the reason when the part cannot be stored.
 */
export function storePicture(
  part: string,
  alt: string,
  ctx: SlideContext,
): { stored: StoredPicture } | { refused: string } {
  const existing = ctx.assets.idOf(part);
  if (existing !== undefined) {
    const asset = ctx.assets.assets.get(existing);
    if (asset !== undefined)
      return { stored: { asset, format: formatOfName(asset), size: asset.size } };
  }
  if (!ctx.pkg.has(part)) return { refused: `the package has no part ${part}` };
  const bytes = ctx.pkg.bytes(part);
  if (bytes.byteLength > ctx.options.pictureMaxBytes)
    return {
      refused: `${part} is ${bytes.byteLength} bytes; a picture is at most ${ctx.options.pictureMaxBytes} on this tier`,
    };
  const format = sniffPicture(bytes);
  if (!SERVED_FORMATS.has(format))
    return {
      refused: `${part} is ${format === 'unknown' ? 'not a picture the store serves' : `a ${format.toUpperCase()} file`}`,
    };
  const size = pictureSize(bytes, format) ?? [1600, 900];
  const stem =
    part
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? 'picture';
  const id = ctx.assets.freshId(stem);
  const relative = `assets/${id}-${shortDigest(bytes)}.${EXTENSIONS[format]}`;
  const asset: Asset = {
    id,
    role: 'other',
    alt,
    twins: { neutral: relative },
    size,
    scale: 1,
    source: { kind: 'file' },
    inline: 'native',
    ext: { pptxPart: part },
  };
  ctx.assets.addPicture(part, asset, {
    relative,
    bytes,
    contentType: PICTURE_CONTENT_TYPES[format],
  });
  return { stored: { asset, format, size } };
}

function formatOfName(asset: Asset): PictureFormat {
  const file = 'neutral' in asset.twins ? asset.twins.neutral : asset.twins.light;
  const ext = file.split('.').pop() ?? '';
  const entry = (Object.entries(EXTENSIONS) as [PictureFormat, string][]).find(
    ([, e]) => e === ext,
  );
  return entry?.[0] ?? 'unknown';
}

/** The `a:blip` of a `p:blipFill`, with the embedded part resolved; the SVG's PNG fallback is the blip itself. */
export function blipPart(
  blipFill: Element | undefined,
  ctx: SlideContext,
): { part?: string; blip?: Element; svgPart?: string } {
  const blip = blipFill === undefined ? undefined : child(blipFill, 'a', 'blip');
  if (blip === undefined) return {};
  const embed = attrNS(blip, 'r', 'embed');
  const part = embed === undefined ? undefined : ctx.pkg.relationship(ctx.slide.part, embed)?.part;
  let svgPart: string | undefined;
  const extLst = child(blip, 'a', 'extLst');
  if (extLst !== undefined) {
    for (const ext of children(extLst, 'a', 'ext')) {
      const svg = child(ext, 'asvg', 'svgBlip');
      const id = svg === undefined ? undefined : attrNS(svg, 'r', 'embed');
      if (id !== undefined) svgPart = ctx.pkg.relationship(ctx.slide.part, id)?.part;
    }
  }
  return {
    ...(part !== undefined ? { part } : {}),
    blip,
    ...(svgPart !== undefined ? { svgPart } : {}),
  };
}

/** `a:srcRect` as the schema's trim (fractions of the source, positive insets; outsets clamp to 0). */
export function trimOf(
  blipFill: Element | undefined,
  ctx: SlideContext,
  object: string,
): PictureBlock['trim'] | undefined {
  const srcRect = blipFill === undefined ? undefined : child(blipFill, 'a', 'srcRect');
  if (srcRect === undefined) return undefined;
  const read = (name: string): number => {
    const value = percentOf(attr(srcRect, name)) ?? 0;
    if (value < 0)
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: 'picture.trim',
        message: 'A negative crop (an outset) was clamped to the picture’s edge',
      });
    return clamp01(value);
  };
  const trim = { left: read('l'), top: read('t'), right: read('r'), bottom: read('b') };
  if (trim.left === 0 && trim.top === 0 && trim.right === 0 && trim.bottom === 0) return undefined;
  return trim;
}

/** The picture adjustments of a blip: transparency, brightness, contrast, and the recolor effects (SPEC-5 5.1). */
export function adjustOf(
  blip: Element | undefined,
  ctx: SlideContext,
  object: string,
): ShotAdjust | undefined {
  if (blip === undefined) return undefined;
  const adjust: ShotAdjust = {};
  for (const node of elementChildren(blip)) {
    if (is(node, 'a', 'alphaModFix')) {
      const amt = percentOf(attr(node, 'amt')) ?? 1;
      const transparency = Math.round((1 - clamp01(amt)) * 100) / 100;
      if (transparency > 0) adjust.transparency = transparency;
    } else if (is(node, 'a', 'lum')) {
      const bright = percentOf(attr(node, 'bright')) ?? 0;
      const contrast = percentOf(attr(node, 'contrast')) ?? 0;
      if (bright !== 0)
        adjust.brightness = Math.max(-1, Math.min(1, Math.round(bright * 100) / 100));
      if (contrast !== 0)
        adjust.contrast = Math.max(-1, Math.min(1, Math.round(contrast * 100) / 100));
    } else if (is(node, 'a', 'grayscl')) {
      adjust.recolor = 'grayscale';
    } else if (is(node, 'a', 'biLevel')) {
      adjust.recolor = 'grayscale';
      ctx.report.substitute({
        ...rowOn(ctx, object),
        code: ROW_CODES.pictureEffect,
        message: `A black and white threshold at ${Math.round((percentOf(attr(node, 'thresh')) ?? 0.5) * 100)} percent became Grayscale`,
      });
    } else if (is(node, 'a', 'duotone')) {
      const preset = duotonePreset(node, ctx);
      adjust.recolor = preset.preset;
      if (!preset.exact)
        ctx.report.substitute({
          ...rowOn(ctx, object),
          code: ROW_CODES.pictureEffect,
          message: `A duotone whose colours match no theme colour became ${preset.preset}`,
        });
    }
  }
  return Object.keys(adjust).length === 0 ? undefined : adjust;
}

const DUOTONE_TARGETS: readonly { token: string; hex: `#${string}` }[] = [
  { token: 'ink', hex: '#070707' },
  { token: 'ink-2', hex: '#3a3d44' },
  { token: 'titanium', hex: '#8a8f98' },
  { token: 'green', hex: '#12a37a' },
  { token: 'amber', hex: '#f0a020' },
  { token: 'red', hex: '#e5484d' },
  { token: 'blue', hex: '#2f5ce0' },
];

/** The recolor preset of an `a:duotone`: the dark colour names the token, the light one says light or dark (SPEC-5 0.47). */
function duotonePreset(
  duotone: Element,
  ctx: SlideContext,
): { preset: RecolorPreset; exact: boolean } {
  const colors = elementChildren(duotone)
    .map((el) => resolveColor(el, ctx.chain.colors))
    .filter((c) => c !== undefined);
  const first = colors[0];
  const second = colors[1];
  if (first === undefined || second === undefined) return { preset: 'grayscale', exact: false };
  const lum = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  };
  const [dark, light] = lum(first.hex) <= lum(second.hex) ? [first, second] : [second, first];
  let best = DUOTONE_TARGETS[0] as (typeof DUOTONE_TARGETS)[number];
  let bestDistance = Infinity;
  for (const target of DUOTONE_TARGETS) {
    const distance = channelDistance(dark.hex, target.hex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = target;
    }
  }
  const exact = bestDistance <= 12;
  const variant = lum(light.hex) >= 128 ? 'light' : 'dark';
  const preset = `${best.token}-${variant}`;
  const known = (RECOLOR_PRESETS as readonly string[]).includes(preset);
  return { preset: (known ? preset : 'grayscale') as RecolorPreset, exact: exact && known };
}

/** The reflection of an effect list onto `adjust.reflection` (SPEC-5 0.47). */
export function reflectionOf(
  spPr: Element | undefined,
  ctx: SlideContext,
): ShotAdjust['reflection'] | undefined {
  const effects = spPr === undefined ? undefined : child(spPr, 'a', 'effectLst');
  const reflection = effects === undefined ? undefined : child(effects, 'a', 'reflection');
  if (reflection === undefined) return undefined;
  void ctx;
  const dist = Number(attr(reflection, 'dist') ?? '0');
  const start = percentOf(attr(reflection, 'stA')) ?? 0.5;
  const size = percentOf(attr(reflection, 'sy'));
  return {
    transparency: Math.round(clamp01(1 - start) * 100) / 100,
    distance: px2(Math.max(0, dist) / 7620),
    size: Math.round(clamp01(Math.abs(size ?? 0.5)) * 100) / 100,
  };
}

/** The frame of a picture from its outline. */
export function frameOf(spPr: Element | undefined, ctx: SlideContext): ShotFrame | undefined {
  const line = readLine(spPr, undefined, ctx);
  if (!line.present || line.noFill) return undefined;
  const frame: ShotFrame = {};
  if (line.widthPx !== undefined)
    frame.weight = snapLadder(line.widthPx, [1, 1.5, 2] as const).value;
  if (line.color !== undefined) frame.color = line.color;
  if (line.dash !== undefined) frame.dash = line.dash;
  return frame;
}

/** The placeholder box a picture that cannot be stored leaves (R04 5.5): a dashed hair box with the alt text. */
export function placeholderBox(id: string, pos: Position, label: string, ctx: SlideContext): Block {
  const box: BoxBlock = {
    id,
    type: 'box',
    stroke: 'hair',
    strokeWidth: 1,
    dash: 'dash',
    text: label,
    typography: { size: 16 },
    color: 'titanium',
    valign: 'middle',
    padding: 12,
    pos,
  };
  return placed(ctx, box);
}

/** Reads one `p:pic` that is a picture (not a media frame) into a picture block, or a placeholder box with a row. */
export function readPicture(pic: Element, ctx: SlideContext, oleProgId?: string): Block[] {
  const facts = shapeFacts(pic);
  const object = facts.name;
  if (facts.hidden) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: 'shape.hidden',
      message: 'A hidden picture was left out',
    });
    return [];
  }
  const inherited = inheritedXfrm(pic, ctx.chain);
  if (inherited === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: 'shape.noBox',
      message: 'A picture without a box was dropped',
    });
    return [];
  }
  const pos = positionOf(inherited.xfrm, ctx);
  const spPr = spPrOf(pic);
  const blipFill = child(pic, 'p', 'blipFill');
  const { part, blip, svgPart } = blipPart(blipFill, ctx);
  const alt = altOf(facts) ?? (facts.name !== '' ? facts.name : 'Picture');
  if (part === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: ROW_CODES.pictureFormat,
      message: 'A picture without an embedded file was dropped',
    });
    return [];
  }
  const stored = storePicture(part, alt, ctx);
  if ('refused' in stored) {
    const format = ctx.pkg.has(part) ? sniffPicture(ctx.pkg.bytes(part)) : 'unknown';
    const code =
      format === 'emf' || format === 'wmf'
        ? ROW_CODES.pictureFormat
        : ctx.pkg.has(part) && ctx.pkg.bytes(part).byteLength > ctx.options.pictureMaxBytes
          ? 'picture.cap'
          : ROW_CODES.pictureFormat;
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code,
      message:
        format === 'emf' || format === 'wmf'
          ? `A vector metafile (${format.toUpperCase()}) has no decoder; a labelled box stands in its place`
          : `${stored.refused}; a labelled box stands in its place`,
    });
    return [placeholderBox(ctx.ids.take(facts.name, 'picture'), pos, alt, ctx)];
  }
  const mark = ctx.report.mark();
  const block: PictureBlock = {
    id: ctx.ids.take(facts.name, 'picture'),
    type: 'picture',
    asset: stored.stored.asset.id,
    pos,
  };
  const trim = trimOf(blipFill, ctx, object);
  if (trim !== undefined) block.trim = trim;
  const geometry = readGeometry(spPr);
  if (geometry.kind === 'preset' && geometry.prst !== 'rect') block.mask = geometry.prst;
  else if (geometry.kind === 'custom')
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: 'picture.mask',
      message: 'A custom crop shape on a picture was dropped; the picture shows whole',
    });
  const adjust = adjustOf(blip, ctx, object) ?? {};
  const reflection = reflectionOf(spPr, ctx);
  if (reflection !== undefined) adjust.reflection = reflection;
  if (Object.keys(adjust).length > 0) block.adjust = adjust;
  const frame = frameOf(spPr, ctx);
  if (frame !== undefined) block.frame = frame;
  const shadow = readShadow(spPr, ctx, object);
  if (shadow !== undefined) block.shadow = shadow;
  const stretch = blipFill === undefined ? undefined : child(blipFill, 'a', 'stretch');
  const fillRect = stretch === undefined ? undefined : child(stretch, 'a', 'fillRect');
  if (fillRect !== undefined) {
    const t = percentOf(attr(fillRect, 't')) ?? 0;
    const b = percentOf(attr(fillRect, 'b')) ?? 0;
    const l = percentOf(attr(fillRect, 'l')) ?? 0;
    const r = percentOf(attr(fillRect, 'r')) ?? 0;
    if (l === 0 && r === 0 && (t !== 0 || b !== 0)) block.position = t > b ? 'bottom' : 'top';
    else if (l !== 0 || r !== 0)
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: 'picture.offset',
        message: 'A horizontal picture offset was dropped',
      });
  }
  if (blipFill !== undefined && child(blipFill, 'a', 'tile') !== undefined)
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: 'picture.tile',
      message: 'A tiled picture fill shows once',
    });
  block.alt = alt;
  const cNvPr = child(child(pic, 'p', 'nvPicPr') as Element, 'p', 'cNvPr');
  const click = cNvPr === undefined ? undefined : child(cNvPr, 'a', 'hlinkClick');
  if (click !== undefined) {
    const rId = attrNS(click, 'r', 'id');
    const rel = rId === undefined ? undefined : ctx.pkg.relationship(ctx.slide.part, rId);
    if (rel !== undefined && rel.mode === 'External' && /^(https?:|mailto:|tel:)/.test(rel.target))
      block.link = rel.target;
    else if (rel !== undefined && rel.type === REL.slide && rel.part !== undefined) {
      const slideId = ctx.slideIdsByPart.get(rel.part);
      if (slideId !== undefined) block.link = `#s/${slideId}`;
    }
  }
  block.ext = {
    pptxName: facts.name,
    ...(svgPart !== undefined ? { pptxSvgPart: svgPart } : {}),
    ...(oleProgId !== undefined ? { pptxOleProgId: oleProgId } : {}),
  };
  if (oleProgId !== undefined)
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.ole,
      message: `An embedded object (${oleProgId}) is shown as its preview picture`,
    });
  else if (svgPart !== undefined)
    ctx.report.row('kept', {
      ...rowOn(ctx, object),
      code: 'picture.svg',
      message: 'An SVG picture is shown through its PNG fallback',
    });
  if (oleProgId === undefined) ctx.report.keepUnless(mark);
  return [placed(ctx, block)];
}

/** A `p:graphicFrame` holding a `p:oleObj`: the preview picture, else a labelled box (R04 5.10). */
export function readOleFrame(
  frame: Element,
  oleObj: Element,
  pos: Position,
  facts: ShapeFacts,
  ctx: SlideContext,
): Block[] {
  const progId = attr(oleObj, 'progId') ?? 'an OLE object';
  const pic =
    child(oleObj, 'p', 'pic') ?? elementChildren(oleObj).flatMap((n) => children(n, 'p', 'pic'))[0];
  if (pic !== undefined) {
    // the preview picture carries no transform of its own: it takes the frame's box
    const blocks = readPicture(pic, { ...ctx, chain: { ...ctx.chain } }, progId);
    return blocks.map((block) =>
      block.pos === undefined ? block : { ...block, pos: { ...pos, z: block.pos.z } },
    );
  }
  ctx.report.drop({
    ...rowOn(ctx, facts.name),
    code: ROW_CODES.ole,
    message: `An embedded object (${progId}) without a preview was dropped`,
  });
  void frame;
  return [];
}

/** The colour of a picture fill on a slide background, for `slide.background`; the picture itself is `backgroundPicture`. */
export function pictureFillPart(bgPr: Element, ctx: SlideContext): string | undefined {
  const blipFill = child(bgPr, 'a', 'blipFill');
  return blipPart(blipFill, ctx).part;
}

/** A slide background picture as the bottom of the stack (SPEC-2 2.6.4). */
export function backgroundPicture(part: string, ctx: SlideContext): Block | undefined {
  const stored = storePicture(part, 'Slide background', ctx);
  if ('refused' in stored) {
    ctx.report.row('kept', {
      ...rowOn(ctx, 'background'),
      code: ROW_CODES.pictureFormat,
      message: `The background picture was dropped: ${stored.refused}`,
    });
    return undefined;
  }
  ctx.report.row('kept', {
    ...rowOn(ctx, 'background'),
    code: 'background.picture',
    message: 'The background picture is the bottom of the stack',
  });
  const block: PictureBlock = {
    id: ctx.ids.take('background', 'background'),
    type: 'picture',
    asset: stored.stored.asset.id,
    alt: 'Slide background',
    pos: { x: 0, y: 0, w: ctx.mapping.page.width, h: ctx.mapping.page.height },
    ext: { pptxBackground: true },
  };
  return placed(ctx, block);
}

/** A colour the theme mode snaps, for callers outside the shape reader. */
export { colorOf };
