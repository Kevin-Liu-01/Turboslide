// The SVG writer (gslides-parity SPEC-5 6.4; R09 3): one slide's scene as a standalone SVG at the
// deck's page (`viewBox` from `scene.page`): the paper, the background colour or the covering
// picture, the frame's rules and crosses, the plates and chips, every rect and preset as a path
// from the shape interpreter (`shapePaths`), the lines with triangle heads, the tables' fills and
// rules, the rasters as PNG data URIs, the icons and the mark as sprite symbols (vectors, R09
// decision 6), and the text as one `<text>` per measured line with a `<tspan>` per run carrying
// `x`, the baseline, `textLength` and `lengthAdjust="spacingAndGlyphs"`, so no viewer rewraps or
// respaces a line. Three text modes: `embed` (the InterVariable woff2 as the one `@font-face`
// rule of the one `style` element), `outline` (fontkit glyph paths, the string on `aria-label`),
// `link` (the family names alone). One `<title>`, one `<desc>`, a `<metadata>` block, no script,
// no `on*` attribute, no external reference: `check/svg.ts` reads all of it back.
import type { Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { SvgTextMode } from '@turboslide/schema/preferences';
import type { Box } from '@turboslide/schema/render';
import { pathData, shapePaths } from '@turboslide/schema/shapes/geometry';

import type {
  Scene,
  SceneLine,
  SceneObject,
  SceneRect,
  SceneRun,
  SceneSegment,
  SceneText,
} from '../scene/types.ts';
import { interFontBytes, interFontFaceCss, layoutRun } from './fonts.ts';

export type SvgWriteOptions = {
  text: SvgTextMode;
  /** The theme's sprite markup: the icon and mark symbols are copied from it. */
  sprite?: string;
  /** The document slide, for the icon names and the block types the rasters need. */
  slide?: Slide;
  /** Reads a raster or picture file the scene names; undefined when absent. */
  readFile: (path: string) => Uint8Array | undefined;
  deckTitle?: string;
  revision?: number;
  language?: string;
};

export type SvgWriteResult = {
  svg: string;
  bytes: number;
  residual: string[];
  counts: { texts: number; runs: number; paths: number; images: number; symbols: number };
};

/** Inter's ascent over its units per em: the baseline's distance below the inline box top. */
export const INTER_ASCENT = 1984 / 2048;
/** Inter's content area (ascent plus descent) over its units per em: the inline box height at a size. */
export const INTER_CONTENT = (1984 + 494) / 2048;

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(text: string): string {
  return esc(text).replace(/"/g, '&quot;');
}

function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function attrs(values: Record<string, string | number | undefined>): string {
  return Object.entries(values)
    .filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '',
    )
    .map(([key, value]) => ` ${key}="${escAttr(String(value))}"`)
    .join('');
}

/** A CSS colour as an SVG paint; `none` for a transparent one. */
export function paintOf(color: string | undefined): { paint: string; opacity?: number } {
  if (color === undefined) return { paint: 'none' };
  const v = color.trim();
  if (v === '' || v === 'none' || v === 'transparent') return { paint: 'none' };
  const rgba =
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
      v,
    );
  if (rgba === null) return { paint: v };
  const a = rgba[4];
  const alpha = a === undefined ? 1 : a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a);
  if (alpha <= 0) return { paint: 'none' };
  const paint = `rgb(${Math.round(Number(rgba[1]))}, ${Math.round(Number(rgba[2]))}, ${Math.round(Number(rgba[3]))})`;
  return alpha < 1 ? { paint, opacity: alpha } : { paint };
}

/** The `transform` of a rotated or mirrored object about its box centre. */
export function transformOf(object: SceneObject, box: Box): string | undefined {
  const [x, y, w, h] = box;
  const parts: string[] = [];
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (object.rotate !== undefined && object.rotate !== 0)
    parts.push(`rotate(${num(object.rotate)} ${num(cx)} ${num(cy)})`);
  if (object.flip !== undefined) {
    const sx = object.flip === 'h' || object.flip === 'hv' ? -1 : 1;
    const sy = object.flip === 'v' || object.flip === 'hv' ? -1 : 1;
    parts.push(
      `translate(${num(cx)} ${num(cy)}) scale(${sx} ${sy}) translate(${num(-cx)} ${num(-cy)})`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** The baseline of a line: the measured one, else Inter's ascent under the tallest run's inline box top. */
export function baselineOf(line: SceneLine): number {
  if (line.baseline !== undefined) return line.baseline;
  const run = line.runs.reduce<SceneRun | undefined>(
    (best, r) => (best === undefined || r.style.size > best.style.size ? r : best),
    undefined,
  );
  if (run === undefined) return line.box[1] + line.box[3] * 0.8;
  // the inline box is centred in the line box; the baseline sits the ascent below its top
  const content = run.style.size * INTER_CONTENT;
  const top = line.box[1] + (line.box[3] - content) / 2;
  return top + run.style.size * INTER_ASCENT;
}

/** The family a run names in the file: Inter for the sheet's faces, a catalog face by its name. */
export function svgFamily(run: SceneRun): string {
  if (run.style.mono) return 'ui-monospace, Menlo, Consolas, monospace';
  const family = run.style.family.trim();
  if (
    family === '' ||
    family === 'Inter' ||
    family.startsWith('GT Inter') ||
    family.startsWith('Inter ')
  )
    return 'Inter';
  return family;
}

/** The symbol markup of an id from the sprite, or undefined. */
export function spriteSymbol(sprite: string | undefined, id: string): string | undefined {
  if (sprite === undefined) return undefined;
  const match = new RegExp(`<symbol id="${id}"[^>]*>[\\s\\S]*?<\\/symbol>`).exec(sprite);
  return match?.[0];
}

function pngDataUri(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** The path of a rect (a plate, chip, box or preset shape) from the shape interpreter, with its paint. */
export function rectXml(rect: SceneRect, counts: SvgWriteResult['counts']): string {
  const [x, y, w, h] = rect.box;
  const preset =
    rect.preset ??
    (rect.shape === 'ellipse' ? 'ellipse' : rect.shape === 'roundRect' ? 'roundRect' : 'rect');
  const adjusts =
    rect.adjust !== undefined
      ? rect.adjust.map((a) => a * 100000)
      : preset === 'roundRect' && rect.radius !== undefined && Math.min(w, h) > 0
        ? [Math.min(50000, (rect.radius / Math.min(w, h)) * 100000)]
        : [];
  const fill = paintOf(rect.fill);
  const stroke = rect.line !== undefined ? paintOf(rect.line.color) : { paint: 'none' };
  const transform = transformOf(rect, rect.box);
  return shapePaths(preset, { x, y, w, h }, adjusts)
    .map((part) => {
      counts.paths += 1;
      return `<path${attrs({
        d: pathData(part.commands),
        fill: part.fill === 'none' ? 'none' : fill.paint,
        'fill-opacity': part.fill !== 'none' ? fill.opacity : undefined,
        stroke: part.stroke ? stroke.paint : 'none',
        'stroke-width': part.stroke && rect.line !== undefined ? num(rect.line.width) : undefined,
        'stroke-opacity': part.stroke ? stroke.opacity : undefined,
        'stroke-linejoin': 'miter',
        transform,
        'data-block': rect.blockId,
      })}/>`;
    })
    .join('');
}

/** A triangle head at an end of a segment, pointing along it. */
function headXml(
  at: [number, number],
  from: [number, number],
  width: number,
  color: string,
): string {
  const angle = Math.atan2(at[1] - from[1], at[0] - from[0]);
  const size = Math.max(6, width * 5);
  const back = size;
  const half = size / 2;
  const p1 = at;
  const p2: [number, number] = [
    at[0] - back * Math.cos(angle) + half * Math.sin(angle),
    at[1] - back * Math.sin(angle) - half * Math.cos(angle),
  ];
  const p3: [number, number] = [
    at[0] - back * Math.cos(angle) - half * Math.sin(angle),
    at[1] - back * Math.sin(angle) + half * Math.cos(angle),
  ];
  return `<path${attrs({ d: `M${num(p1[0])},${num(p1[1])} L${num(p2[0])},${num(p2[1])} L${num(p3[0])},${num(p3[1])} Z`, fill: color })}/>`;
}

/** A segment: a line or a path through its points, with its heads. */
export function segmentXml(segment: SceneSegment, counts: SvgWriteResult['counts']): string {
  const stroke = paintOf(segment.color);
  const dash =
    segment.dash !== undefined && segment.dash !== 'solid'
      ? `${num(segment.width * 4)} ${num(segment.width * 3)}`
      : undefined;
  const common = {
    stroke: stroke.paint,
    'stroke-width': num(segment.width),
    'stroke-opacity': stroke.opacity,
    'stroke-dasharray': dash,
    'stroke-linecap': 'butt',
    fill: segment.closed === true ? paintOf(segment.fill).paint : 'none',
    'data-block': segment.blockId,
  };
  const points = segment.points;
  let body: string;
  if (points === undefined || points.length < 2) {
    body = `<line${attrs({ x1: num(segment.from[0]), y1: num(segment.from[1]), x2: num(segment.to[0]), y2: num(segment.to[1]), ...common })}/>`;
  } else {
    let d: string;
    if (segment.kind === 'curve' && points.length >= 3) {
      const parts = [`M${num(points[0]?.[0] ?? 0)},${num(points[0]?.[1] ?? 0)}`];
      for (let i = 1; i < points.length - 1; i += 1) {
        const p = points[i];
        const n = points[i + 1];
        if (p === undefined || n === undefined) continue;
        parts.push(
          `Q${num(p[0])},${num(p[1])} ${num((p[0] + n[0]) / 2)},${num((p[1] + n[1]) / 2)}`,
        );
      }
      const last = points[points.length - 1];
      if (last !== undefined) parts.push(`L${num(last[0])},${num(last[1])}`);
      d = parts.join(' ');
    } else d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${num(x)},${num(y)}`).join(' ');
    if (segment.closed === true) d += ' Z';
    body = `<path${attrs({ d, ...common })}/>`;
    counts.paths += 1;
  }
  const heads: string[] = [];
  const start = points?.[0] ?? segment.from;
  const second = points?.[1] ?? segment.to;
  const end = points?.[points.length - 1] ?? segment.to;
  const beforeEnd = points?.[points.length - 2] ?? segment.from;
  if ((segment.heads === 'start' || segment.heads === 'both') && segment.startEnd !== 'none')
    heads.push(headXml(start, second, segment.width, stroke.paint));
  if ((segment.heads === 'end' || segment.heads === 'both') && segment.endEnd !== 'none')
    heads.push(headXml(end, beforeEnd, segment.width, stroke.paint));
  return `<g${attrs({ transform: transformOf(segment, [Math.min(segment.from[0], segment.to[0]), Math.min(segment.from[1], segment.to[1]), Math.abs(segment.to[0] - segment.from[0]), Math.abs(segment.to[1] - segment.from[1])]) })}>${body}${heads.join('')}</g>`;
}

/** One measured text as `<text>` elements (embed and link) or glyph paths (outline). */
export function textXml(
  text: SceneText,
  mode: SvgTextMode,
  counts: SvgWriteResult['counts'],
): string {
  const transform = transformOf(text, text.box);
  const lines = text.lines.map((line) => {
    const baseline = baselineOf(line);
    if (mode === 'outline') {
      const runs = line.runs
        .filter((run) => run.text !== '' && run.gt !== true)
        .map((run) => {
          const laid = layoutRun(run);
          const scale = run.style.size / laid.unitsPerEm;
          const natural = laid.advance * scale;
          const sx = natural > 0 ? (run.box[2] / natural) * scale : scale;
          const fill = paintOf(run.style.color);
          let advance = 0;
          const glyphs = laid.glyphs
            .map((glyph) => {
              const x = run.box[0] + advance * sx;
              advance += glyph.advance;
              if (glyph.path === '') return '';
              counts.paths += 1;
              return `<path${attrs({ d: glyph.path, transform: `translate(${num(x)} ${num(baseline)}) scale(${num(sx)} ${num(-scale)})` })}/>`;
            })
            .join('');
          counts.runs += 1;
          return `<g${attrs({ fill: fill.paint, 'fill-opacity': fill.opacity, 'aria-label': run.text, 'data-weight': run.style.weight, role: 'img' })}>${glyphs}</g>`;
        })
        .join('');
      return runs;
    }
    const spans = line.runs
      .filter((run) => run.text !== '')
      .map((run) => {
        counts.runs += 1;
        const fill = paintOf(run.gt === true ? 'transparent' : run.style.color);
        const decoration = [
          run.style.underline === true ? 'underline' : '',
          run.style.strike ? 'line-through' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<tspan${attrs({
          x: num(run.box[0]),
          y: num(baseline),
          textLength: num(run.gt === true && run.gtLetters !== undefined ? run.box[2] : run.box[2]),
          lengthAdjust: 'spacingAndGlyphs',
          'font-family': svgFamily(run),
          'font-size': num(run.style.size),
          'font-weight': run.style.weight,
          'font-style': run.style.italic === true ? 'italic' : undefined,
          'letter-spacing':
            run.style.letterSpacing !== 0 ? num(run.style.letterSpacing) : undefined,
          fill: fill.paint,
          'fill-opacity': fill.opacity,
          'text-decoration': decoration || undefined,
          'baseline-shift':
            run.style.baseline === 'super'
              ? 'super'
              : run.style.baseline === 'sub'
                ? 'sub'
                : undefined,
          style:
            run.style.features !== '' && run.style.features !== 'normal'
              ? `font-feature-settings: ${run.style.features}`
              : undefined,
        })}>${esc(run.text)}</tspan>`;
      })
      .join('');
    counts.texts += 1;
    return `<text${attrs({ 'xml:space': 'preserve', 'data-block': text.blockId })}>${spans}</text>`;
  });
  return `<g${attrs({ transform, 'data-run': text.id })}>${lines.join('')}</g>`;
}

export function writeSvg(scene: Scene, options: SvgWriteOptions): SvgWriteResult {
  const page = scene.page ?? { width: scene.sheet[2], height: scene.sheet[3] };
  const counts = { texts: 0, runs: 0, paths: 0, images: 0, symbols: 0 };
  const residual: string[] = [];
  const body: string[] = [];
  const defs: string[] = [];
  const usedSymbols = new Set<string>();
  const paper = paintOf(scene.paper).paint;
  const ink = paintOf(scene.ink).paint;
  const blocks =
    options.slide !== undefined
      ? new Map(slideBlocks(options.slide).map(({ block }) => [block.id, block]))
      : new Map();

  const useSymbol = (id: string, box: Box, fill: string): string => {
    const symbol = spriteSymbol(options.sprite, id);
    if (symbol === undefined) return '';
    if (!usedSymbols.has(id)) {
      usedSymbols.add(id);
      defs.push(symbol);
      counts.symbols += 1;
    }
    return `<use${attrs({ href: `#${id}`, x: num(box[0]), y: num(box[1]), width: num(box[2]), height: num(box[3]), fill })}/>`;
  };
  const image = (
    path: string | undefined,
    box: Box,
    object: SceneObject = {},
    alt?: string,
  ): string => {
    const bytes = path !== undefined ? options.readFile(path) : undefined;
    if (bytes === undefined) {
      residual.push(`raster: no file for the picture at ${box.join(',')}`);
      return '';
    }
    counts.images += 1;
    const mime =
      path?.toLowerCase().endsWith('.jpg') || path?.toLowerCase().endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';
    const href =
      mime === 'image/png'
        ? pngDataUri(bytes)
        : `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;
    // the alt text rides on aria-label: the document keeps its one desc element (check/svg.ts)
    return `<image${attrs({ href, x: num(box[0]), y: num(box[1]), width: num(box[2]), height: num(box[3]), preserveAspectRatio: 'none', transform: transformOf(object, box), 'aria-label': alt !== undefined && alt !== '' ? alt : undefined })}/>`;
  };

  // the paper, then the background
  body.push(
    `<rect${attrs({ x: 0, y: 0, width: num(page.width), height: num(page.height), fill: paper, 'data-role': 'paper' })}/>`,
  );
  const background = scene.background;
  if (background?.color !== undefined && paintOf(background.color).paint !== 'none')
    body.push(
      `<rect${attrs({ x: 0, y: 0, width: num(page.width), height: num(page.height), fill: paintOf(background.color).paint, 'data-role': 'background' })}/>`,
    );
  if (scene.picture !== undefined && !scene.pictureExcluded)
    body.push(image(scene.pictureFile, scene.picture.box, {}, scene.picture.alt));
  const backgroundRaster =
    background?.pictureRasterId !== undefined
      ? scene.rasters.find((r) => r.id === background.pictureRasterId)
      : undefined;
  if (backgroundRaster !== undefined)
    body.push(image(backgroundRaster.file, backgroundRaster.box, backgroundRaster));

  // the frame
  for (const rule of scene.frame.rules) {
    const stroke = paintOf(rule.color);
    body.push(
      `<rect${attrs({ x: num(rule.box[0]), y: num(rule.box[1]), width: num(Math.max(rule.box[2], rule.width)), height: num(Math.max(rule.box[3], rule.width)), fill: stroke.paint, 'fill-opacity': stroke.opacity, 'data-role': 'frame' })}/>`,
    );
  }
  for (const cross of scene.frame.crosses) {
    const [x, y, w, h] = cross;
    const stroke = paintOf(scene.frame.crossColor);
    body.push(
      `<path${attrs({ d: `M${num(x)},${num(y + h / 2)} H${num(x + w)} M${num(x + w / 2)},${num(y)} V${num(y + h)}`, stroke: stroke.paint, 'stroke-opacity': stroke.opacity, 'stroke-width': 1, fill: 'none', 'data-role': 'cross' })}/>`,
    );
  }
  for (const plate of scene.plates) body.push(rectXml(plate, counts));
  for (const chip of scene.chips)
    body.push(rectXml({ box: chip, fill: scene.ink, role: 'chip' }, counts));

  // the objects; a table's cell texts are measured texts and travel with the rest below
  for (const table of scene.tables ?? []) {
    for (const row of table.rows)
      for (const cell of row.cells) {
        if (cell.fill !== undefined && paintOf(cell.fill).paint !== 'none')
          body.push(
            `<rect${attrs({ x: num(cell.box[0]), y: num(cell.box[1]), width: num(cell.box[2]), height: num(cell.box[3]), fill: paintOf(cell.fill).paint, 'data-block': table.blockId })}/>`,
          );
      }
    for (const row of table.rows) {
      const rule = row.header && table.headerRule ? table.headerRule : table.rule;
      const stroke = paintOf(rule.color);
      if (stroke.paint !== 'none' && rule.width > 0)
        body.push(
          `<rect${attrs({ x: num(table.box[0]), y: num(row.y + row.h - rule.width), width: num(table.box[2]), height: num(rule.width), fill: stroke.paint, 'fill-opacity': stroke.opacity, 'data-block': table.blockId })}/>`,
        );
    }
  }
  for (const rect of scene.rects) body.push(rectXml(rect, counts));
  for (const rule of scene.rules) {
    const stroke = paintOf(rule.color);
    body.push(
      `<rect${attrs({ x: num(rule.box[0]), y: num(rule.box[1]), width: num(Math.max(rule.box[2], rule.width)), height: num(Math.max(rule.box[3], rule.width)), fill: stroke.paint, 'fill-opacity': stroke.opacity, 'data-block': rule.blockId })}/>`,
    );
  }
  for (const segment of scene.lines ?? []) body.push(segmentXml(segment, counts));
  for (const raster of scene.rasters) {
    if (raster.blockId === 'wordmark' || raster.id === background?.pictureRasterId) continue;
    const block = blocks.get(raster.blockId) as { type?: string; icon?: string } | undefined;
    if (raster.kind === 'mark') {
      const used = useSymbol('gt-mark', raster.box, ink);
      if (used !== '') {
        body.push(used);
        continue;
      }
    }
    if (raster.kind === 'icon' && block?.icon !== undefined) {
      const used = useSymbol(`i-${block.icon}`, raster.box, ink);
      if (used !== '') {
        body.push(used);
        continue;
      }
    }
    body.push(image(raster.file, raster.box, raster));
  }
  for (const text of scene.texts) body.push(textXml(text, options.text, counts));
  if (scene.counter !== undefined) body.push(textXml(scene.counter, options.text, counts));
  if (scene.wordmark !== undefined) {
    const used = useSymbol('gt-mark', scene.wordmark, paintOf(scene.frame.crossColor).paint);
    if (used !== '') body.push(used);
  }

  if (options.text === 'embed')
    residual.push(
      `svg: the Inter face inlined as one @font-face of ${interFontBytes()} bytes (embed)`,
    );
  if (options.text === 'outline')
    residual.push(
      'svg: the text as glyph paths from the Inter Regular master (fontkit 2.0.4 does not instance the variable WOFF2 here); each run scaled to its measured width, the string on aria-label',
    );
  if (options.text === 'link')
    residual.push('svg: the text names its families and inlines no font (link)');

  const title = scene.title ?? scene.slideId;
  const desc = `Slide ${scene.n} of ${scene.total}${options.deckTitle !== undefined ? ` of ${options.deckTitle}` : ''}, ${scene.theme} appearance, written by Turboslide${options.revision !== undefined ? ` at revision ${options.revision}` : ''}.`;
  const metadata = JSON.stringify({
    generator: 'Turboslide',
    slide: scene.slideId,
    n: scene.n,
    total: scene.total,
    theme: scene.theme,
    page,
    text: options.text,
    ...(options.revision !== undefined ? { revision: options.revision } : {}),
  });
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(page.width)} ${num(page.height)}" width="${num(page.width)}" height="${num(page.height)}" role="img" aria-labelledby="ts-title" data-ts-text="${options.text}" data-ts-slide="${escAttr(scene.slideId)}" data-ts-theme="${scene.theme}"${options.language !== undefined ? ` xml:lang="${escAttr(options.language)}"` : ''}>` +
    `<title id="ts-title">${esc(title)}</title>` +
    `<desc>${esc(desc)}</desc>` +
    `<metadata>${esc(metadata)}</metadata>` +
    (options.text === 'embed' ? `<style>${interFontFaceCss()}</style>` : '') +
    (defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '') +
    body.join('') +
    `</svg>\n`;
  return { svg, bytes: Buffer.byteLength(svg, 'utf8'), residual, counts };
}
