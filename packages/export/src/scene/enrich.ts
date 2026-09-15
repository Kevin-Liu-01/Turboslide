// The document's facts onto a measured scene (gslides-parity SPEC-2 1.5, section 2): the page
// measures boxes, line boxes, computed colours and the data attributes the renderer wrote; the
// fields the builder writes natively but the page does not show as pixels come from the slide
// itself, here, in Node: a block's shadow (its token resolved to the theme's hex), its alt text,
// the vertical alignment, the padding, word art's outline, the paragraph spacing and columns, a
// connector's attachments (the target's object name and site), a chart's data, a table's border
// weight, a list preset's numeral form, and the slide background of 2.6 (the colour the page
// measured, or the picture object that covers the sheet at the bottom of the stack, which the
// builder writes as `slide.background`). Pure over the scene and the slide; extract.ts calls it
// once per scene.
import type { Block, Shadow } from '@turboslide/schema/blocks';
import { SHADOW_DEFAULTS } from '@turboslide/schema/blocks';
import { SEMANTIC_PALETTE, isColorToken } from '@turboslide/schema/color';
import type { Color } from '@turboslide/schema/color';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { canvasObjects } from '@turboslide/schema/deck';
import { ditherKey12, readDither, resolveDither, variantFor } from '@turboslide/render/dither-key';
import { ditheredPictures } from '@turboslide/render/dither-walk';
import { boundingBox } from '@turboslide/schema/freeform';
import type { NumberPreset } from '@turboslide/schema/text';
import { NUMBER_PRESETS, NUMBER_PRESET_FORMS, presetSlot } from '@turboslide/schema/text';
import type { Theme } from '@turboslide/schema/render';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';
import { TOKENS } from '@turboslide/theme/tokens';

import { parseCssColor } from '../units.ts';
import { join } from 'node:path';

import type { Scene, SceneBullet, SceneDither, SceneShadow, SceneText } from './types.ts';

/** A Color as the theme's hex (no hash), for the shadow and outline the builder writes. */
export function colorHexFor(color: Color, theme: Theme): string {
  if (isColorToken(color)) {
    if (color === 'green' || color === 'amber' || color === 'red' || color === 'blue')
      return SEMANTIC_PALETTE[color].slice(1).toUpperCase();
    const tokens = TOKENS[theme] as Record<string, string>;
    const value = tokens[color] ?? tokens['ink'] ?? '#070707';
    return cssToHex(value, theme);
  }
  return color.slice(1).toUpperCase();
}

/** A token's CSS value (a hex or an rgba over the paper) as a composite hex. */
function cssToHex(value: string, theme: Theme): string {
  if (value.startsWith('#')) return value.slice(1).toUpperCase();
  const match = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(
    value,
  );
  if (!match) return '070707';
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  const paper = theme === 'dark' ? [7, 7, 7] : [255, 255, 255];
  const channel = (i: number): string => {
    const c = Number(match[i] ?? 0);
    const over = Math.round(c * alpha + (paper[i - 1] ?? 255) * (1 - alpha));
    return over.toString(16).padStart(2, '0').toUpperCase();
  };
  return `${channel(1)}${channel(2)}${channel(3)}`;
}

/** The scene form of a block's shadow (SPEC-2 2.3.4) with the defaults filled in. */
export function sceneShadow(shadow: Shadow, theme: Theme): SceneShadow {
  return {
    colorHex: colorHexFor(shadow.color ?? SHADOW_DEFAULTS.color, theme),
    opacity: shadow.opacity ?? SHADOW_DEFAULTS.opacity,
    angle: shadow.angle ?? SHADOW_DEFAULTS.angle,
    distance: shadow.distance ?? SHADOW_DEFAULTS.distance,
    blur: shadow.blur ?? SHADOW_DEFAULTS.blur,
  };
}

/** Every block of a slide by id: the slots, the plate and the cells of a composite. */
export function blocksOf(slide: Slide): Map<string, Block> {
  const out = new Map<string, Block>();
  const walk = (blocks: readonly Block[]): void => {
    for (const block of blocks) {
      out.set(block.id, block);
      if (block.type === 'composite') for (const cell of block.cells) walk(cell.blocks);
    }
  };
  if (slide.kind === 'content') for (const list of Object.values(slide.slots)) walk(list ?? []);
  else if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing')
    walk(slide.plate.blocks);
  return out;
}

/** The four sides of a padding value in px, or undefined. */
function paddingOf(block: Block): [number, number, number, number] | undefined {
  if (!('padding' in block) || block.padding === undefined) return undefined;
  const p = block.padding;
  if (typeof p === 'number') return [p, p, p, p];
  return [p.top, p.right, p.bottom, p.left];
}

/**
 * The pptxgenjs numbering scheme of a preset's form at a level (SPEC-2 2.2.13): the six forms map
 * to `arabicPeriod`, `alphaLcPeriod`, `romanLcPeriod`, `alphaUcPeriod`, `romanUcPeriod` and their
 * `ParenR` twins; the `zerodigit` form ("01.") and the nested form ("1.2.1.") have no
 * `ST_TextAutonumberScheme` value and travel as `arabicPeriod`, named in the residual.
 */
export function numberTypeFor(
  preset: string | undefined,
  level: number,
): { numberType: string; substituted: boolean } {
  const name: NumberPreset = (NUMBER_PRESETS as ReadonlyArray<string>).includes(preset ?? '')
    ? (preset as NumberPreset)
    : 'digit-alpha-roman';
  const spec = NUMBER_PRESET_FORMS[name];
  const form = spec.forms[presetSlot(level)];
  const suffix = spec.suffix === ')' ? 'ParenR' : 'Period';
  if (spec.nested) return { numberType: 'arabicPeriod', substituted: true };
  switch (form) {
    case 'digit':
      return { numberType: `arabic${suffix}`, substituted: false };
    case 'zerodigit':
      return { numberType: `arabic${suffix}`, substituted: true };
    case 'alpha':
      return { numberType: `alphaLc${suffix}`, substituted: false };
    case 'upperalpha':
      return { numberType: `alphaUc${suffix}`, substituted: false };
    case 'roman':
      return { numberType: `romanLc${suffix}`, substituted: false };
    case 'upperroman':
      return { numberType: `romanUc${suffix}`, substituted: false };
  }
}

function completeBullet(bullet: SceneBullet): SceneBullet {
  if (bullet.kind !== 'number') return bullet;
  const { numberType, substituted } = numberTypeFor(bullet.preset, bullet.level);
  return {
    ...bullet,
    numberType,
    startAt: bullet.index ?? 1,
    ...(substituted ? { substituted: true } : {}),
  };
}

/** True when a box covers the whole sheet (the picture object of a converted picture kind). */
function coversSheet(pos: { x: number; y: number; w: number; h: number }): boolean {
  return pos.x <= 0 && pos.y <= 0 && pos.x + pos.w >= SHEET_WIDTH && pos.y + pos.h >= SHEET_HEIGHT;
}

/**
 * The scene with the document's facts on its entries (SPEC-2 1.5). Mutates and returns `scene`.
 */
export type EnrichContext = {
  /** The deck, for the asset records the dither variants live on (SPEC-3 10.4). */
  deck?: Deck;
  /** The deck directory, so the variant file path on the scene is absolute for the builder. */
  deckDir?: string;
};

export function enrichScene(scene: Scene, slide: Slide, context: EnrichContext = {}): Scene {
  const theme = scene.theme;
  const blocks = blocksOf(slide);
  const objectFacts = (blockId: string) => {
    const block = blocks.get(blockId);
    if (!block) return {};
    const out: { shadow?: SceneShadow; alt?: string; dash?: Scene['rects'][number]['dash'] } = {};
    if ('shadow' in block && block.shadow !== undefined)
      out.shadow = sceneShadow(block.shadow, theme);
    if (block.alt !== undefined) out.alt = block.alt;
    if ('dash' in block && block.dash !== undefined) out.dash = block.dash;
    return out;
  };
  const apply = <T extends { blockId?: string }>(entry: T): T => {
    if (entry.blockId === undefined) return entry;
    return Object.assign(entry, objectFacts(entry.blockId));
  };
  scene.rects.forEach(apply);
  scene.lines?.forEach(apply);
  scene.rasters.forEach(apply);
  scene.tables?.forEach(apply);
  scene.charts?.forEach(apply);

  for (const text of scene.texts) {
    const block = blocks.get(text.blockId);
    if (!block) continue;
    Object.assign(text, objectFacts(text.blockId));
    if ('valign' in block && block.valign !== undefined) text.valign = block.valign;
    const padding = paddingOf(block);
    if (padding && (block.type === 'text' || block.type === 'shape')) text.padding = padding;
    if (block.type === 'text' && block.outline !== undefined)
      text.outline = {
        colorHex: colorHexFor(block.outline.color, theme),
        width: block.outline.width,
      };
    if ('typography' in block && block.typography !== undefined) {
      const t = block.typography;
      if ((t.spaceBefore ?? 0) > 0 || (t.spaceAfter ?? 0) > 0)
        text.paraSpace = {
          ...(t.spaceBefore !== undefined && t.spaceBefore > 0 ? { before: t.spaceBefore } : {}),
          ...(t.spaceAfter !== undefined && t.spaceAfter > 0 ? { after: t.spaceAfter } : {}),
        };
      if (t.columns !== undefined && t.columns > 1) text.columns = t.columns;
    }
    if (text.bullet) text.bullet = completeBullet(text.bullet);
  }
  for (const rect of scene.rects) {
    const block = rect.blockId ? blocks.get(rect.blockId) : undefined;
    if (!block) continue;
    if ('valign' in block && block.valign !== undefined) rect.valign = block.valign;
    const padding = paddingOf(block);
    if (padding) rect.padding = padding;
    if (block.type === 'shape' && block.adjust !== undefined && rect.adjust === undefined)
      rect.adjust = [...block.adjust];
  }
  // a connector's attachments (SPEC-2 2.4.7): the target's object name for stCxn and endCxn
  for (const line of scene.lines ?? []) {
    const block = blocks.get(line.blockId);
    if (!block || block.type !== 'shape' || block.connect === undefined) continue;
    const name = (id: string): string => `ts:${scene.slideId}#${id}`;
    line.connect = {
      ...(block.connect.start
        ? { start: { name: name(block.connect.start.block), site: block.connect.start.site } }
        : {}),
      ...(block.connect.end
        ? { end: { name: name(block.connect.end.block), site: block.connect.end.site } }
        : {}),
    };
  }
  // the chart data (SPEC-2 2.8.1)
  for (const chart of scene.charts ?? []) {
    const block = blocks.get(chart.blockId);
    if (!block || block.type !== 'chart') continue;
    // the page measured the marks' colours (one per series, or one per slice of a pie) as
    // computed css colours; the builder wants hex
    const measured = chart.series.map((series) => parseCssColor(series.colorHex).hex);
    chart.kind = block.kind;
    chart.categories = [...block.categories];
    chart.series = block.series.map((series, i) => ({
      name: series.name,
      values: [...series.values],
      colorHex: measured[i] ?? measured[0] ?? '070707',
    }));
    if (block.kind === 'pie') chart.sliceColorsHex = measured;
    chart.labelColor = parseCssColor(chart.labelColor).hex;
    chart.titleColor = parseCssColor(chart.titleColor).hex;
    if (block.title !== undefined && block.title !== '') chart.title = block.title;
    chart.legend = block.legend ?? 'right';
    chart.numberFormat = block.numberFormat ?? 'plain';
    chart.labels = block.labels === true;
  }
  // the table border weight and dash from the block (the page reads the computed rule)
  for (const table of scene.tables ?? []) {
    const block = blocks.get(table.blockId);
    if (!block || block.type !== 'table') continue;
    if (block.border !== undefined) {
      table.border = {
        weight: block.border.weight,
        ...(block.border.dash !== undefined && block.border.dash !== 'solid'
          ? { dash: block.border.dash }
          : {}),
      };
    }
  }
  // the covering picture object at the bottom of the stack is the slide background (SPEC-2 2.6.4, 1.5)
  const objects = canvasObjects(slide);
  if (objects.length > 0) {
    const ordered = [...objects].sort((a, b) => (a.pos?.z ?? 0) - (b.pos?.z ?? 0));
    const lowest = ordered[0];
    if (
      lowest &&
      lowest.type === 'picture' &&
      lowest.pos !== undefined &&
      coversSheet(boundingBox(lowest.pos)) &&
      (lowest.pos.rotate ?? 0) === 0
    ) {
      const raster = scene.rasters.find((r) => r.blockId === lowest.id);
      if (raster) {
        scene.background = {
          ...(scene.background ?? {}),
          pictureRasterId: raster.id,
          pictureBlockId: lowest.id,
        };
        // a dithered covering picture that is a plain two tone plane travels as the variant's own
        // bytes in Editable text (SPEC-3 10.4), else the raster the page shot
        const variantFile = variantFileOf(lowest, context, theme);
        if (variantFile !== undefined) scene.background.pictureVariantFile = variantFile;
      }
    }
  }
  // the dithered pictures of the slide with the state each was shot in (SPEC-3 10.4)
  if (context.deck !== undefined) {
    const dithers = ditherEntries(slide, context.deck);
    if (dithers.length > 0) scene.dithers = dithers;
  }
  return scene;
}

/** The dithered pictures of a slide as the scene records them; none for a slide without the field. */
export function ditherEntries(slide: Slide, deck: Deck): SceneDither[] {
  try {
    return ditheredPictures({ deck, slides: { [slide.id]: slide } }, [slide.id]).map((target) => ({
      blockId: target.block.id,
      assetId: target.asset.id,
      key12: ditherKey12(target.key),
      state: target.asset.variants?.[target.key] !== undefined ? 'variant' : 'live',
    }));
  } catch {
    // a dither over an asset without a source: the validator names it; the export shoots the twin
    return [];
  }
}

/**
 * The theme's variant file of a covering picture whose dither is a plain two tone plane at full
 * strength with no crop, mask, adjustments or frame, else undefined (the raster stands in).
 */
export function variantFileOf(
  block: Block,
  context: EnrichContext,
  theme: Theme,
): string | undefined {
  if (context.deck === undefined || context.deckDir === undefined) return undefined;
  if (block.type !== 'picture') return undefined;
  const dither = readDither(block);
  if (dither === undefined) return undefined;
  const resolved = resolveDither(dither);
  if (resolved.strength < 1 || resolved.tone !== 'two') return undefined;
  if (
    block.trim !== undefined ||
    block.mask !== undefined ||
    block.adjust !== undefined ||
    block.frame !== undefined
  )
    return undefined;
  const asset = context.deck.assets[block.asset];
  if (asset === undefined) return undefined;
  const entries = ditheredPictures(
    {
      deck: context.deck,
      slides: {
        s: {
          schemaVersion: 1,
          id: 's',
          kind: 'content',
          layout: { type: 'freeform' },
          slots: { main: [block] },
        },
      },
    },
    ['s'],
  );
  const found = entries[0];
  if (found === undefined) return undefined;
  const variant = variantFor(asset, found.key);
  if (variant === undefined) return undefined;
  const twin = 'neutral' in variant.twins ? variant.twins.neutral : variant.twins[theme];
  return join(context.deckDir, ...twin.split('/'));
}

/** The texts a builder writes as ordinary text boxes: not the counter, not a shape's text layer. */
export function freeTexts(scene: Scene): SceneText[] {
  return scene.texts.filter((text) => text.inShape === undefined);
}
