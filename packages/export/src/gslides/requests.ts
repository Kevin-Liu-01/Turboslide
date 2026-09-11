// Scene to batchUpdate requests (SPEC 8.3). Native mode: every slide is a BLANK slide whose page
// background is the paper (solidFill) or the full-sheet picture (stretchedPictureFill); the frame
// rails, rules and crosses are STRAIGHT lines at 0.45 pt with the token's alpha, grouped; plates,
// chips and panels are RECTANGLE shapes; every measured text is a TEXT_BOX with the browser's lines
// as hard breaks, `weightedFontFamily` Inter at the measured weight, `fontSize` in PT, the
// paragraph pitch as a percentage of Inter's normal, and the default inset compensated; a ruled row
// is its hairline plus its two boxes in one group; every raster is a createImage from a hosted URL.
// Flatten mode: the text layer first, in the paper color because TextStyle has no alpha, then one
// createImage of the 2x sheet raster over the whole page, so the text stays searchable behind a
// pixel-exact picture. Units: units.ts; ids: ids.ts; the request shapes: schema.ts.
import type { ExportMode } from '@turboslide/schema/export';
import type { Box, Theme } from '@turboslide/schema/render';

import type {
  Scene,
  SceneRect,
  SceneRule,
  SceneRun,
  SceneStyle,
  SceneText,
} from '../scene/types.ts';
import { parseCssColor } from '../units.ts';
import { loadSlidesCalibration } from './calibration.ts';
import type { SlidesCalibration } from './calibration.ts';
import { IdRegistry, slideObjectId } from './ids.ts';
import type { ElementProperties, SlidesRequest, SolidFill, TextStyle } from './schema.ts';
import { requestKind } from './schema.ts';
import {
  cssToRgb,
  elementGeometry,
  hexToRgb,
  insidePage,
  lineSpacingPercent,
  pt,
  ptToPx,
  pxToPt,
} from './units.ts';

/** What an image is used for; the host may derive a file (a cover crop) from it. */
export type ImageUse = {
  slideId: string;
  blockId: string;
  kind: string;
  role: 'raster' | 'picture' | 'sheet' | 'wordmark';
  /** A cover crop the picture needs before hosting: the element box and the natural size. */
  crop?: { box: Box; naturalWidth: number; naturalHeight: number; objectPosition: string };
};

/** Resolves a PNG path to the URL createImage will fetch; undefined skips the image with a warning. */
export type UrlResolver = (file: string, use: ImageUse) => string | undefined;

export type PlanOptions = {
  mode: ExportMode;
  theme: Theme;
  resolveUrl: UrlResolver;
  /** The theme's wordmark PNG at 2x (extract.ts wordmark[theme]); placed on every native slide. */
  wordmarkFile?: string;
  defaultNotes?: string;
  calibration?: SlidesCalibration;
  ids?: IdRegistry;
};

export type SlideCounts = {
  requests: number;
  textBoxes: number;
  rects: number;
  lines: number;
  images: number;
  groups: number;
};

export type GeometryEntry = {
  objectId: string;
  slideId: string;
  kind: 'text' | 'rect' | 'line' | 'image';
  /** translateX, translateY, width, height in EMU. */
  emu: [number, number, number, number];
  inBounds: boolean;
};

export type SlidePlan = {
  slideId: string;
  n: number;
  objectId: string;
  requests: SlidesRequest[];
  counts: SlideCounts;
  /** The speaker notes text, when the slide or the deck default carries one. */
  notes?: string;
  native: string[];
  raster: string[];
  /** The JSON byte size of the slide's requests. */
  bytes: number;
};

export type PresentationPlan = {
  theme: Theme;
  mode: ExportMode;
  slides: SlidePlan[];
  /** Every request in order: the slides' requests one after another. */
  requests: SlidesRequest[];
  geometry: GeometryEntry[];
  geometryInBounds: boolean;
  warnings: string[];
  residual: string[];
  ids: IdRegistry;
};

type Ctx = {
  options: PlanOptions;
  cal: SlidesCalibration;
  ids: IdRegistry;
  scene: Scene;
  page: string;
  paperHex: string;
  requests: SlidesRequest[];
  geometry: GeometryEntry[];
  counts: SlideCounts;
  warnings: string[];
  residual: Set<string>;
};

const FULL_SHEET_TOLERANCE_PX = 0.5;

function zeroCounts(): SlideCounts {
  return { requests: 0, textBoxes: 0, rects: 0, lines: 0, images: 0, groups: 0 };
}

function push(ctx: Ctx, request: SlidesRequest): void {
  ctx.requests.push(request);
  ctx.counts.requests += 1;
}

/** The element properties of a sheet box under a page, recorded for the geometry check. */
function placed(
  ctx: Ctx,
  objectId: string,
  kind: GeometryEntry['kind'],
  box: Box,
): ElementProperties {
  const geometry = elementGeometry(box);
  const { translateX, translateY } = geometry.transform;
  const width = geometry.size.width.magnitude;
  const height = geometry.size.height.magnitude;
  ctx.geometry.push({
    objectId,
    slideId: ctx.scene.slideId,
    kind,
    emu: [translateX, translateY, width, height],
    inBounds: insidePage(translateX, translateY, width, height),
  });
  return { pageObjectId: ctx.page, ...geometry };
}

/** Clamps a box to the sheet, warning when more than half a pixel had to go. */
function clampToSheet(ctx: Ctx, box: Box, what: string): Box {
  let [x, y, w, h] = box;
  const W = ctx.cal.page.widthPx;
  const H = ctx.cal.page.heightPx;
  let moved = 0;
  if (x < 0) {
    moved = Math.max(moved, -x);
    w += x;
    x = 0;
  }
  if (y < 0) {
    moved = Math.max(moved, -y);
    h += y;
    y = 0;
  }
  if (x + w > W) {
    moved = Math.max(moved, x + w - W);
    w = W - x;
  }
  if (y + h > H) {
    moved = Math.max(moved, y + h - H);
    h = H - y;
  }
  if (moved > FULL_SHEET_TOLERANCE_PX)
    ctx.warnings.push(
      `${ctx.scene.slideId}: ${what} left the page by ${Math.round(moved * 100) / 100} px and was clamped`,
    );
  return [x, y, Math.max(0, w), Math.max(0, h)];
}

function solidFill(cssColor: string, groundHex?: string): SolidFill {
  const { rgb, alpha } = cssToRgb(cssColor, groundHex);
  const fill: SolidFill = { color: { rgbColor: rgb } };
  if (alpha < 1) fill.alpha = alpha;
  return fill;
}

// ---------------------------------------------------------------------------------------------
// Lines

/** A rule box (an axis-aligned strip) as a STRAIGHT line along its long axis. */
export function lineBox(box: Box, cal: SlidesCalibration): Box {
  const [x, y, w, h] = box;
  const thin =
    cal.lines.zeroHeightAccepted === false ? cal.lines.fallbackThicknessEmu / cal.page.emuPerPx : 0;
  if (w >= h) return [x, y + h / 2 - thin / 2, w, thin];
  return [x + w / 2 - thin / 2, y, thin, h];
}

function planLine(ctx: Ctx, box: Box, cssColor: string, widthPx: number): string {
  const objectId = ctx.ids.next(ctx.page, 'line');
  const geometry = lineBox(box, ctx.cal);
  push(ctx, {
    createLine: {
      objectId,
      category: 'STRAIGHT',
      elementProperties: placed(ctx, objectId, 'line', geometry),
    },
  });
  push(ctx, {
    updateLineProperties: {
      objectId,
      lineProperties: {
        weight: pt(pxToPt(widthPx)),
        lineFill: { solidFill: solidFill(cssColor) },
        dashStyle: 'SOLID',
      },
      fields: 'weight,lineFill,dashStyle',
    },
  });
  ctx.counts.lines += 1;
  return objectId;
}

function planRule(ctx: Ctx, rule: SceneRule): string {
  return planLine(ctx, rule.box, rule.color, rule.width);
}

/** The 11 by 11 registration cross: a vertical and a horizontal 1 px line through the center. */
function planCross(ctx: Ctx, box: Box, cssColor: string): string[] {
  const [x, y, w, h] = box;
  return [
    planLine(ctx, [x + Math.floor(w / 2), y, 1, h], cssColor, 1),
    planLine(ctx, [x, y + Math.floor(h / 2), w, 1], cssColor, 1),
  ];
}

// ---------------------------------------------------------------------------------------------
// Rects and images

function planRect(ctx: Ctx, rect: SceneRect, groundHex: string | undefined): string {
  const objectId = ctx.ids.next(ctx.page, 'rect');
  push(ctx, {
    createShape: {
      objectId,
      shapeType: 'RECTANGLE',
      elementProperties: placed(ctx, objectId, 'rect', clampToSheet(ctx, rect.box, 'a rectangle')),
    },
  });
  push(ctx, {
    updateShapeProperties: {
      objectId,
      shapeProperties: {
        shapeBackgroundFill: { solidFill: solidFill(rect.fill, groundHex) },
        outline: rect.line
          ? {
              weight: pt(pxToPt(rect.line.width)),
              outlineFill: { solidFill: solidFill(rect.line.color) },
              dashStyle: 'SOLID',
            }
          : { propertyState: 'NOT_RENDERED' },
      },
      fields: 'shapeBackgroundFill.solidFill,outline',
    },
  });
  ctx.counts.rects += 1;
  return objectId;
}

function planImage(ctx: Ctx, file: string | undefined, box: Box, use: ImageUse): string | null {
  const [, , w, h] = box;
  if (!file) {
    ctx.warnings.push(`${ctx.scene.slideId}#${use.blockId}: ${use.role} ${use.kind} has no file`);
    return null;
  }
  if (w <= 0 || h <= 0) return null;
  const url = ctx.options.resolveUrl(file, use);
  if (!url) {
    ctx.warnings.push(`${ctx.scene.slideId}#${use.blockId}: no URL for ${use.role} ${file}`);
    return null;
  }
  const objectId = ctx.ids.next(ctx.page, 'image');
  push(ctx, {
    createImage: {
      objectId,
      url,
      elementProperties: placed(
        ctx,
        objectId,
        'image',
        clampToSheet(ctx, box, `image ${use.blockId}`),
      ),
    },
  });
  ctx.counts.images += 1;
  return objectId;
}

function coversSheet(box: Box, cal: SlidesCalibration): boolean {
  const [x, y, w, h] = box;
  const t = FULL_SHEET_TOLERANCE_PX;
  return x <= t && y <= t && x + w >= cal.page.widthPx - t && y + h >= cal.page.heightPx - t;
}

// ---------------------------------------------------------------------------------------------
// Text

export type TextEmit = {
  objectId: string;
  /** The text inserted: the browser's lines joined by newlines. */
  content: string;
  /** The compensated box in sheet px. */
  box: Box;
};

/** The family, weight and size of a run for Slides; the mono stack becomes the mono font. */
export function textStyleOf(
  style: SceneStyle,
  cal: SlidesCalibration,
  color: { hex: string },
  options: { invisible: boolean; hidden: boolean },
): TextStyle {
  const family = style.mono ? cal.fonts.mono : cal.fonts.family;
  const weight = Math.min(900, Math.max(100, Math.round(style.weight / 100) * 100));
  const out: TextStyle = {
    fontFamily: family,
    weightedFontFamily: { fontFamily: family, weight },
    fontSize: pt(pxToPt(style.size)),
  };
  out.foregroundColor = { opaqueColor: { rgbColor: hexToRgb(color.hex) } };
  if (style.strike) out.strikethrough = true;
  if (style.link && !options.invisible && !options.hidden) {
    out.link = { url: style.link };
    out.underline = true;
  }
  return out;
}

function runStyle(ctx: Ctx, run: SceneRun, invisible: boolean): TextStyle {
  // Text has no alpha in Slides (TextStyle.foregroundColor is an OpaqueColor): the flatten
  // layer and the hidden GT letters under a mark take the paper color; a translucent text color
  // is composited on the paper.
  const hidden = run.gt === true;
  const hex = invisible || hidden ? ctx.paperHex : cssToRgbHex(run.style.color, ctx.paperHex);
  return textStyleOf(run.style, ctx.cal, { hex }, { invisible, hidden });
}

function cssToRgbHex(value: string, groundHex: string): string {
  const parsed = parseCssColor(value);
  if (parsed.alpha >= 1) return parsed.hex;
  const { rgb } = cssToRgb(value, groundHex);
  const channel = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `${channel(rgb.red)}${channel(rgb.green)}${channel(rgb.blue)}`.toUpperCase();
}

function sameStyle(a: TextStyle, b: TextStyle): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fieldsOf(style: TextStyle): string {
  return Object.keys(style).join(',');
}

/** The box the TEXT_BOX is written at: the measured text box widened by the insets and the slack. */
export function compensatedTextBox(text: SceneText, cal: SlidesCalibration): Box {
  const [x, y, w, h] = text.textBox;
  const inset = cal.text.defaultInsetPt;
  const left = ptToPx(inset.left);
  const right = ptToPx(inset.right);
  const top = ptToPx(inset.top);
  const bottom = ptToPx(inset.bottom);
  const size = text.lines[0]?.runs[0]?.style.size ?? text.style.size;
  const slack =
    size >= cal.text.headingMinSizePx
      ? Math.max(cal.text.widthSlackPx, w * cal.text.headingWidthSlack)
      : cal.text.widthSlackPx;
  const lineHeight = Math.max(h, ...text.lines.map((l) => l.box[3]));
  const shift = cal.text.firstBaselineOffsetPx ?? 0;
  let bx = x - left;
  if (text.style.align === 'center') bx -= slack / 2;
  else if (text.style.align === 'right') bx -= slack;
  const round = (v: number): number => Math.round(v * 100) / 100;
  return [
    round(bx),
    round(y - top - shift),
    round(w + left + right + slack),
    round(lineHeight + top + bottom),
  ];
}

/** Lines to the inserted string and the UTF-16 offset of every run. */
export function textContent(text: SceneText): {
  content: string;
  runs: { run: SceneRun; start: number; end: number }[];
} {
  const runs: { run: SceneRun; start: number; end: number }[] = [];
  let content = '';
  text.lines.forEach((line, li) => {
    if (li > 0) content += '\n';
    for (const run of line.runs) {
      const start = content.length;
      content += run.text;
      runs.push({ run, start, end: content.length });
    }
  });
  return { content, runs };
}

function planText(ctx: Ctx, text: SceneText, invisible: boolean): TextEmit | null {
  const { content, runs } = textContent(text);
  if (content.length === 0 || runs.length === 0) return null;
  const first = runs[0] as (typeof runs)[number];
  const objectId = ctx.ids.next(ctx.page, 'text');
  const box = clampToSheet(ctx, compensatedTextBox(text, ctx.cal), `text ${text.id}`);
  push(ctx, {
    createShape: {
      objectId,
      shapeType: 'TEXT_BOX',
      elementProperties: placed(ctx, objectId, 'text', box),
    },
  });
  push(ctx, { insertText: { objectId, insertionIndex: 0, text: content } });
  push(ctx, {
    updateShapeProperties: {
      objectId,
      shapeProperties: { autofit: { autofitType: 'NONE' }, contentAlignment: 'TOP' },
      fields: 'autofit.autofitType,contentAlignment',
    },
  });
  const base = runStyle(ctx, first.run, invisible);
  push(ctx, {
    updateTextStyle: { objectId, textRange: { type: 'ALL' }, style: base, fields: fieldsOf(base) },
  });
  for (const entry of runs) {
    if (entry.end <= entry.start) continue;
    const style = runStyle(ctx, entry.run, invisible);
    if (sameStyle(style, base)) continue;
    push(ctx, {
      updateTextStyle: {
        objectId,
        textRange: { type: 'FIXED_RANGE', startIndex: entry.start, endIndex: entry.end },
        style,
        fields: fieldsOf(style),
      },
    });
  }
  const lineHeight = first.run.style.lineHeight || text.style.lineHeight;
  const size = first.run.style.size || text.style.size;
  push(ctx, {
    updateParagraphStyle: {
      objectId,
      textRange: { type: 'ALL' },
      style: {
        lineSpacing: lineSpacingPercent(lineHeight, size, ctx.cal.text.normalPitchFactor),
        alignment:
          text.style.align === 'center' ? 'CENTER' : text.style.align === 'right' ? 'END' : 'START',
        spaceAbove: pt(0),
        spaceBelow: pt(0),
        indentStart: pt(0),
        indentEnd: pt(0),
        indentFirstLine: pt(0),
      },
      fields: 'lineSpacing,alignment,spaceAbove,spaceBelow,indentStart,indentEnd,indentFirstLine',
    },
  });
  ctx.counts.textBoxes += 1;
  if (text.style.letterSpacing !== 0 || runs.some((r) => r.run.style.letterSpacing !== 0))
    ctx.residual.add(
      'letter spacing is not carried: Slides has no tracking; heading boxes carry the width slack of calibration/slides.json',
    );
  if (runs.some((r) => r.run.gt))
    ctx.residual.add(
      `${ctx.scene.slideId}#${text.blockId}: the GT letters are a paper-colored run under the mark; text after the mark on that line may shift by the width difference`,
    );
  if (text.style.mono)
    ctx.residual.add(`code panels travel in ${ctx.cal.fonts.mono}, a Google font (SPEC 8.6)`);
  return { objectId, content, box };
}

function planGroup(ctx: Ctx, children: string[]): string | null {
  if (children.length < 2) return null;
  const groupObjectId = ctx.ids.next(ctx.page, 'group');
  push(ctx, { groupObjects: { groupObjectId, childrenObjectIds: children } });
  ctx.counts.groups += 1;
  return groupObjectId;
}

// ---------------------------------------------------------------------------------------------
// Slides

function planSlide(
  scene: Scene,
  index: number,
  options: PlanOptions,
  cal: SlidesCalibration,
  ids: IdRegistry,
  shared: { warnings: string[]; residual: Set<string>; geometry: GeometryEntry[] },
): SlidePlan {
  const page = ids.claim(slideObjectId(scene.slideId));
  const paperHex = parseCssColor(scene.paper).hex;
  const ctx: Ctx = {
    options,
    cal,
    ids,
    scene,
    page,
    paperHex,
    requests: [],
    geometry: [],
    counts: zeroCounts(),
    warnings: [],
    residual: shared.residual,
  };
  push(ctx, {
    createSlide: {
      objectId: page,
      insertionIndex: index,
      slideLayoutReference: { predefinedLayout: 'BLANK' },
    },
  });
  const paperFill: SlidesRequest = {
    updatePageProperties: {
      objectId: page,
      pageProperties: { pageBackgroundFill: { solidFill: solidFill(scene.paper) } },
      fields: 'pageBackgroundFill',
    },
  };

  if (options.mode === 'flatten') {
    push(ctx, paperFill);
    for (const text of scene.texts) planText(ctx, text, true);
    if (scene.counter) planText(ctx, scene.counter, true);
    if (scene.sheetImage) {
      planImage(ctx, scene.sheetImage, [0, 0, cal.page.widthPx, cal.page.heightPx], {
        slideId: scene.slideId,
        blockId: 'sheet',
        kind: 'sheet',
        role: 'sheet',
      });
    } else {
      ctx.warnings.push(
        `${scene.slideId}: no sheet screenshot; the slide shows the text layer on paper`,
      );
    }
  } else {
    // The picture first, then the chrome over it.
    const hasPicture =
      Boolean(scene.picture) && !scene.pictureExcluded && Boolean(scene.pictureFile);
    let pictureUrlOk = false;
    if (hasPicture && scene.picture && scene.pictureFile) {
      const use: ImageUse = {
        slideId: scene.slideId,
        blockId: scene.picture.assetId ?? 'picture',
        kind: 'picture',
        role: 'picture',
        crop: {
          box: scene.picture.box,
          naturalWidth: scene.picture.naturalWidth,
          naturalHeight: scene.picture.naturalHeight,
          objectPosition: scene.picture.objectPosition,
        },
      };
      if (coversSheet(scene.picture.box, cal)) {
        const url = options.resolveUrl(scene.pictureFile, use);
        if (url) {
          push(ctx, {
            updatePageProperties: {
              objectId: page,
              pageProperties: { pageBackgroundFill: { stretchedPictureFill: { contentUrl: url } } },
              fields: 'pageBackgroundFill',
            },
          });
          ctx.counts.images += 1;
          pictureUrlOk = true;
        } else {
          ctx.warnings.push(`${scene.slideId}: no URL for the picture ${scene.pictureFile}`);
        }
      } else {
        push(ctx, paperFill);
        pictureUrlOk = planImage(ctx, scene.pictureFile, scene.picture.box, use) !== null;
      }
      if (scene.picture.objectPosition !== '50% 50%')
        shared.residual.add(
          `${scene.slideId}: the picture is a center cover crop; object-position ${scene.picture.objectPosition} is not carried`,
        );
    }
    if (!pictureUrlOk) {
      if (ctx.requests.length === 1) push(ctx, paperFill);
      if (scene.pictureExcluded)
        shared.residual.add(
          `${scene.slideId}: share-alike picture excluded; the plate carries the credit (SPEC 11)`,
        );
    }
    // The frame: rails, rules and crosses as one group (the rail set, SPEC 8.3).
    const frame: string[] = [];
    for (const rule of scene.frame.rules) frame.push(planRule(ctx, rule));
    for (const cross of scene.frame.crosses)
      frame.push(...planCross(ctx, cross, scene.frame.crossColor));
    planGroup(ctx, frame);
    // Paper chips under the wordmark and the counter on a full-picture slide, then the wordmark.
    for (const chip of scene.chips)
      planRect(ctx, { box: chip, fill: scene.paper, role: 'chip' }, undefined);
    if (scene.wordmark) {
      planImage(ctx, options.wordmarkFile, scene.wordmark, {
        slideId: scene.slideId,
        blockId: 'wordmark',
        kind: 'mark',
        role: 'wordmark',
      });
    }
    for (const plate of scene.plates) planRect(ctx, plate, paperHex);
    for (const rect of scene.rects) planRect(ctx, rect, paperHex);
    // Block hairlines and native texts, collected by group key for the ruled rows and lists.
    const groups = new Map<string, string[]>();
    const remember = (key: string | undefined, id: string | null): void => {
      if (!key || !id) return;
      const list = groups.get(key) ?? [];
      list.push(id);
      groups.set(key, list);
    };
    for (const rule of scene.rules) remember(rule.group, planRule(ctx, rule));
    for (const text of scene.texts) {
      if (!text.native) continue;
      remember(text.group, planText(ctx, text, false)?.objectId ?? null);
    }
    if (scene.counter) planText(ctx, scene.counter, false);
    for (const raster of scene.rasters) {
      if (raster.blockId === 'wordmark') continue;
      planImage(ctx, raster.file, raster.box, {
        slideId: scene.slideId,
        blockId: raster.blockId,
        kind: raster.kind,
        role: 'raster',
      });
    }
    for (const children of groups.values()) planGroup(ctx, children);
  }

  for (const w of scene.warnings) ctx.warnings.push(`${scene.slideId}: ${w}`);
  shared.warnings.push(...ctx.warnings);
  shared.geometry.push(...ctx.geometry);
  const notes = (scene.notes ?? options.defaultNotes ?? '').trim();
  const plan: SlidePlan = {
    slideId: scene.slideId,
    n: scene.n,
    objectId: page,
    requests: ctx.requests,
    counts: ctx.counts,
    native: scene.blocks.filter((b) => b.native).map((b) => b.blockId),
    raster: scene.blocks.filter((b) => !b.native).map((b) => b.blockId),
    bytes: Buffer.byteLength(JSON.stringify(ctx.requests)),
  };
  if (notes.length > 0) plan.notes = notes;
  return plan;
}

/** One theme's scenes to the requests of one presentation, in deck order. */
export function planPresentation(scenes: readonly Scene[], options: PlanOptions): PresentationPlan {
  const cal = options.calibration ?? loadSlidesCalibration();
  const ids = options.ids ?? new IdRegistry();
  const shared = {
    warnings: [] as string[],
    residual: new Set<string>(),
    geometry: [] as GeometryEntry[],
  };
  const slides = scenes.map((scene, index) => planSlide(scene, index, options, cal, ids, shared));
  if (options.mode === 'flatten')
    shared.residual.add(
      'flatten: the slide is a 2x raster of the sheet; the text layer sits behind it in the paper color, since TextStyle has no alpha',
    );
  return {
    theme: options.theme,
    mode: options.mode,
    slides,
    requests: slides.flatMap((s) => s.requests),
    geometry: shared.geometry,
    geometryInBounds: shared.geometry.every((g) => g.inBounds),
    warnings: shared.warnings,
    residual: [...shared.residual],
    ids,
  };
}

/** Request counts by kind over a list. */
export function countKinds(requests: readonly SlidesRequest[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const request of requests) {
    const kind = requestKind(request);
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
}
