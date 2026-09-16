// The mapping context every reader module shares (gslides-parity SPEC-5 5.1; R04 5): one record
// per import holding the package, the presentation facts, the sheet mapping, the theme mode and
// the report builder, and one per slide holding the inheritance chain, the block id allocator, the
// z counter, the shape id map the connectors and the timing tree resolve through, and the asset
// collector. The modules `text.ts`, `shapes.ts`, `pictures.ts`, `tables.ts`, `charts.ts`,
// `groups.ts`, `diagrams.ts`, `motion.ts`, `media.ts` and `equations.ts` take a `SlideContext` and
// answer blocks; `import-pptx.ts` builds the contexts and assembles the deck. Node free: the bytes
// of a picture or a media file stay in memory as `Uint8Array` entries the caller writes.
import type { Element } from '@xmldom/xmldom';

import type { Asset, MediaAsset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import { BLOCK_ID_PATTERN, slugify } from '@turboslide/schema/ids';
import type { Color, HexColor } from '@turboslide/schema/color';

import type { SlideChain } from './inherit.ts';
import type { PptxPackage, PresentationInfo, SlideRef } from './package.ts';
import type { ImportReportBuilder, RowInput } from './report.ts';
import type { ThemeMode } from './theme.ts';
import { compositeOn, snapColor } from './theme.ts';
import type { ResolvedColor } from './theme.ts';
import type { SheetMapping } from './units.ts';

/** The options `import.pptx` takes that the mapping reads (SPEC-5 5.2). */
export type MappingOptions = {
  theme: ThemeMode;
  snapLadder: boolean;
  masterShapes: boolean;
  includeHidden: boolean;
  comments: boolean;
  splitMixedSizes: boolean;
  truncateTables: boolean;
  keepPageRaster: boolean;
  /** the per picture byte cap of the caller's tier (R04 5.5); 25 MB when absent */
  pictureMaxBytes: number;
};

export const DEFAULT_MAPPING_OPTIONS: MappingOptions = {
  theme: 'adopt',
  snapLadder: false,
  masterShapes: true,
  includeHidden: true,
  comments: false,
  splitMixedSizes: true,
  truncateTables: true,
  keepPageRaster: false,
  pictureMaxBytes: 25 * 1024 * 1024,
};

/** One file the import writes under the deck's `assets/` folder. */
export type AssetFile = { relative: string; bytes: Uint8Array; contentType: string };

/**
 * The pictures and media of one import, one record per distinct part (R04 5.5: a media part used
 * on several slides is one asset). Keyed by the part name; the id is a slug of the part's stem
 * with a short digest so two parts named `image1.png` in different folders never collide.
 */
export class AssetCollector {
  readonly assets = new Map<string, Asset>();
  readonly media = new Map<string, MediaAsset>();
  readonly files: AssetFile[] = [];
  private readonly byPart = new Map<string, string>();
  private readonly ids = new Set<string>();

  /** The asset id already made for a part, or undefined. */
  idOf(part: string): string | undefined {
    return this.byPart.get(part);
  }

  /** A fresh asset id from a stem, unique in this import. */
  freshId(stem: string): string {
    const base = slugify(stem) || 'asset';
    let candidate = base;
    let n = 2;
    while (this.ids.has(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    this.ids.add(candidate);
    return candidate;
  }

  addPicture(part: string, asset: Asset, file: AssetFile): void {
    this.byPart.set(part, asset.id);
    this.assets.set(asset.id, asset);
    if (!this.files.some((f) => f.relative === file.relative)) this.files.push(file);
  }

  addMedia(part: string, asset: MediaAsset, file: AssetFile): void {
    this.byPart.set(part, asset.id);
    this.media.set(asset.id, asset);
    if (!this.files.some((f) => f.relative === file.relative)) this.files.push(file);
  }
}

/** The import wide context. */
export type ImportContext = {
  pkg: PptxPackage;
  presentation: PresentationInfo;
  mapping: SheetMapping;
  options: MappingOptions;
  report: ImportReportBuilder;
  assets: AssetCollector;
  /** the slide id of each source slide index (one based), for `hlinksldjump` links */
  slideIds: Map<number, string>;
  /** the slide ids by slide part name */
  slideIdsByPart: Map<string, string>;
  /** the block ids the round trip recognises from object names (`ts:<slide>#<block>`), by slide */
  roundTrip: boolean;
};

/** The per slide context. */
export type SlideContext = ImportContext & {
  slide: SlideRef;
  slideId: string;
  chain: SlideChain;
  ids: BlockIds;
  /** the next z; the reader writes z in shape tree order so the stack is the source's */
  nextZ: () => number;
  /** `cNvPr id` to block id for the shapes read so far (connectors, the timing tree) */
  shapeIds: Map<number, string>;
  /** the group path the block being read belongs to, when inside a `p:grpSp` */
  group?: string;
};

/** Block ids unique within one slide, from the source names with a type stem as the fallback. */
export class BlockIds {
  private readonly taken = new Set<string>();

  /**
   * A block id from a source name, or the stem when the name gives nothing usable. A round trip
   * object name (`ts:<slide>#<block>[@...]`, the exporter's grammar) hands back its block id, so
   * the ids survive the trip without `import-ids.json` (R04 7).
   */
  take(name: string | undefined, stem: string): string {
    const trip = name === undefined ? undefined : parseRoundTripName(name);
    // a block's own text box is the block; another part (`rule/0`, `items/0/num`) joins the id
    const fromTrip =
      trip === undefined
        ? undefined
        : trip.part === undefined || trip.part === 'text'
          ? trip.blockId
          : `${trip.blockId}-${slugify(trip.part)}`;
    const fromName = fromTrip !== undefined ? fromTrip : name === undefined ? '' : blockSlug(name);
    const base = fromName !== '' ? fromName : stem;
    let candidate = base;
    let n = 2;
    while (this.taken.has(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    this.taken.add(candidate);
    return candidate;
  }

  /** Reserves an id the round trip recovered from an object name; false when it is taken. */
  reserve(id: string): boolean {
    if (!BLOCK_ID_PATTERN.test(id) || this.taken.has(id)) return false;
    this.taken.add(id);
    return true;
  }

  has(id: string): boolean {
    return this.taken.has(id);
  }
}

/** A block id slug: lower case letters, digits and hyphens; PowerPoint's default names give ''. */
export function blockSlug(name: string): string {
  const trimmed = name.trim();
  // PowerPoint's defaults ("Rectangle 3", "TextBox 7", "Picture 2", "Title 1") say nothing about the object
  if (
    /^(rectangle|textbox|text box|picture|title|subtitle|content placeholder|oval|straight connector|elbow connector|curved connector|freeform|group|table|chart|diagram|graphic|object|slide number placeholder|date placeholder|footer placeholder|google shape|line|shape|arrow|isosceles triangle|right triangle|parallelogram|trapezoid|diamond|pentagon|hexagon|octagon|star|heart|cloud|flowchart|callout)\b[\s\d;:.#()-]*$/i.test(
      trimmed,
    )
  )
    return '';
  const slug = slugify(trimmed);
  return slug.length > 48 ? slug.slice(0, 48).replace(/-+$/, '') : slug;
}

/** The colour a resolved fill lands as: snapped in `adopt`, a hex in `keep`, alpha composited on the ground. */
export function colorOf(
  resolved: ResolvedColor,
  ctx: Pick<ImportContext, 'options'>,
  ground: HexColor = '#ffffff',
): Color {
  const hex = resolved.alpha < 1 ? compositeOn(resolved, ground) : resolved.hex;
  return snapColor(hex, ctx.options.theme);
}

/** A report row on the current slide. */
export function rowOn(
  ctx: SlideContext,
  object: string | undefined,
): Omit<RowInput, 'code' | 'message'> {
  return {
    slideIndex: ctx.slide.index,
    slideId: ctx.slideId,
    ...(object !== undefined && object !== '' ? { object } : {}),
  };
}

/** A block with its `pos.z` set from the context's counter, and the group path when inside one. */
export function placed<T extends Block>(ctx: SlideContext, block: T): T {
  if (block.pos === undefined) return block;
  const pos = { ...block.pos, z: ctx.nextZ() };
  if (ctx.group !== undefined) pos.group = ctx.group;
  return { ...block, pos };
}

/** The `p:cNvPr` element of a shape, picture, frame, connector or group. */
export function cNvPr(shape: Element): Element | undefined {
  for (let i = 0; i < shape.childNodes.length; i += 1) {
    const node = shape.childNodes[i];
    if (node === undefined || node.nodeType !== 1) continue;
    const el = node as Element;
    if (/^nv[A-Za-z]*Pr$/.test(el.localName ?? '')) {
      for (let j = 0; j < el.childNodes.length; j += 1) {
        const inner = el.childNodes[j];
        if (inner !== undefined && inner.nodeType === 1 && (inner as Element).localName === 'cNvPr')
          return inner as Element;
      }
    }
  }
  return undefined;
}

/** The `name`, `id`, `descr`, `title` and `hidden` facts of a shape's `cNvPr`. */
export type ShapeFacts = {
  id: number;
  name: string;
  descr?: string;
  title?: string;
  hidden: boolean;
};

export function shapeFacts(shape: Element): ShapeFacts {
  const el = cNvPr(shape);
  const id = Number(el?.getAttribute('id') ?? '0');
  const descr = el?.getAttribute('descr') ?? undefined;
  const title = el?.getAttribute('title') ?? undefined;
  const hidden = el?.getAttribute('hidden');
  return {
    id: Number.isFinite(id) ? id : 0,
    name: el?.getAttribute('name') ?? '',
    ...(descr !== undefined && descr !== '' ? { descr } : {}),
    ...(title !== undefined && title !== '' ? { title } : {}),
    hidden: hidden === '1' || hidden === 'true',
  };
}

/** Alt text: `descr`, else `title`, cut at 512 characters (R04 9). */
export function altOf(facts: ShapeFacts): string | undefined {
  const text = (facts.descr ?? facts.title ?? '').trim();
  if (text === '') return undefined;
  return text.length > 512 ? text.slice(0, 512) : text;
}

/**
 * The round trip's object name grammar (`pptx/shapes.ts` `objectName`; `scene/extract.ts`):
 * `ts:<slide>#<block>[/<part>|:<n>][@g:<tag>][@<key>]`, the block id up to the first `/`, `:`
 * or `@`, the part after it (`text` for a block's own text box, `rule/0`, `items/0/num`, `1` for
 * a mark picture), and the group keys after each `@`.
 */
export type RoundTripName = {
  slideId: string;
  blockId: string;
  /** the part after a `/`: `text`, `rule/0`, `items/0/num` */
  part?: string;
  /** the picture index after a `:` (`mark:1`, `photo:1`), never part of the id */
  pictureIndex?: number;
  group?: string;
  keys: string[];
};

export function parseRoundTripName(name: string): RoundTripName | undefined {
  const m = /^ts:([a-z0-9-]+)#([a-z0-9-]+)([/:][^@]*)?((?:@[^@]+)*)$/.exec(name.trim());
  if (m === null) return undefined;
  const out: RoundTripName = { slideId: m[1] ?? '', blockId: m[2] ?? '', keys: [] };
  const raw = m[3] ?? '';
  if (raw.startsWith(':')) {
    const index = Number(raw.slice(1));
    if (Number.isFinite(index)) out.pictureIndex = index;
    else out.part = raw.slice(1);
  } else if (raw.startsWith('/')) out.part = raw.slice(1);
  const keys = (m[4] ?? '').split('@').filter((k) => k.length > 0);
  for (const key of keys) {
    if (key.startsWith('g:')) out.group = key.slice(2);
    else out.keys.push(key);
  }
  return out;
}

/** The frame chrome the exporter draws on a slide (`counter`, `mark`, `frame`, `cross`, `chip`, `wordmark`): the theme's, never imported (R04 7). */
export function isSlideChrome(name: RoundTripName): boolean {
  if (name.blockId === 'counter' || name.blockId === 'wordmark') return true;
  if (name.blockId === 'mark' && name.pictureIndex !== undefined) return true;
  if (
    (name.blockId === 'frame' || name.blockId === 'cross' || name.blockId === 'chip') &&
    name.part !== undefined &&
    /^\d/.test(name.part)
  )
    return true;
  return false;
}

/** Rounds to the half pixel the schema's sizes use. */
export function halfPx(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Rounds to 0.01 px, the position precision. */
export function px2(value: number): number {
  return Math.round(value * 100) / 100;
}
