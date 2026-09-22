// The chart block (gslides-parity SPEC-2 2.8.1, decision 0.24): Google's Insert > Chart drawn as
// inline SVG in the diagram grammar (DECK-GRAMMAR.md:44): 1 px ink axes on the half pixel, the
// bars, columns, lines and slices in the palette (the series colour, else the palette order of
// chart.ts CHART_SERIES_COLORS), 18 px labels in the body tone, a 20 px title in the display face
// with `data-run` so it travels as a run, the legend as 15 px rows with a 10 px swatch, and the
// values on the marks when `labels` is set, written in the chart's number format. The geometry is
// arithmetic over the box: a positioned chart takes its `pos`, a flow chart the slot width and its
// `height` (480 when absent). Nothing here reads a DOM; the export screenshots the svg as a
// raster in Perfect and writes `addChart` from the block's data in Editable text.
import type { BlockOf } from '@turboslide/schema/blocks';
import {
  CHART_SERIES_COLORS,
  chartSeriesColor,
  formatChartNumber,
} from '@turboslide/schema/blocks/chart';
import type { ChartLegend } from '@turboslide/schema/blocks/chart';
import { colorCss } from '@turboslide/schema/color';
import { escapeAttr, escapeText, px } from '../html.ts';
import { renderText } from '../text.ts';
import { dataAttrs, raster, rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { dropShadowDeclaration } from './primitives.ts';

/** A flow layout chart's height when the block sets none. */
export const CHART_FLOW_HEIGHT = 480;

/** The chart's type sizes (SPEC-2 2.8.1): labels, the title, the legend rows. */
export const CHART_TYPE = { label: 18, title: 20, legend: 15 } as const;

/** Inner padding of the plot, the axis label gutters, the legend column width and row pitch. */
const PAD = 8;
const TICK = 6;
const LEGEND_SWATCH = 10;
const LEGEND_ROW = 24;
const LEGEND_GAP = 24;
const LABEL_LINE = 24;

type Box = { x: number; y: number; w: number; h: number };

/** Snaps to the half pixel for a 1 px stroke (report 03 section 5.11). */
function half(value: number): number {
  return Math.round(value - 0.5) + 0.5;
}

/**
 * A value axis scale: the ticks at nice steps from zero (or the negative floor) to a ceiling at
 * or above the largest value, five ticks or fewer.
 */
export function valueScale(values: readonly number[]): {
  min: number;
  max: number;
  ticks: number[];
} {
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const rough = span / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * power);
  const step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1] ?? 1;
  const max = Math.ceil(top / step) * step;
  const min = Math.floor(bottom / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max: max === min ? min + step : max, ticks };
}

/** The legend's box inside the chart and the plot box that remains. */
function splitLegend(
  box: Box,
  legend: ChartLegend,
  names: readonly string[],
): { plot: Box; legend?: Box } {
  if (legend === 'none' || names.length === 0) return { plot: box };
  const longest = Math.max(...names.map((n) => n.length));
  // 15 px Inter runs about 7.4 px per character; the swatch and its gap come first
  const columnW = Math.min(box.w / 3, LEGEND_SWATCH + 8 + Math.ceil(longest * 7.4) + 8);
  if (legend === 'right')
    return {
      plot: { ...box, w: box.w - columnW - LEGEND_GAP },
      legend: { x: box.x + box.w - columnW, y: box.y, w: columnW, h: box.h },
    };
  if (legend === 'left')
    return {
      plot: { ...box, x: box.x + columnW + LEGEND_GAP, w: box.w - columnW - LEGEND_GAP },
      legend: { x: box.x, y: box.y, w: columnW, h: box.h },
    };
  const rowH = LEGEND_ROW;
  if (legend === 'top')
    return {
      plot: { ...box, y: box.y + rowH + LEGEND_GAP / 2, h: box.h - rowH - LEGEND_GAP / 2 },
      legend: { x: box.x, y: box.y, w: box.w, h: rowH },
    };
  return {
    plot: { ...box, h: box.h - rowH - LEGEND_GAP / 2 },
    legend: { x: box.x, y: box.y + box.h - rowH, w: box.w, h: rowH },
  };
}

function legendMarkup(
  box: Box,
  legend: ChartLegend,
  entries: readonly { name: string; color: string }[],
): string {
  let out = `<g class="legend">`;
  const vertical = legend === 'right' || legend === 'left';
  let x = box.x;
  let y = box.y;
  entries.forEach((entry, i) => {
    if (vertical) {
      y = box.y + i * LEGEND_ROW;
      x = box.x;
    } else {
      // rows across: each entry takes its swatch, 8 px and about 7.4 px per character plus 20
      if (i > 0) {
        const previous = entries[i - 1] as { name: string };
        x += LEGEND_SWATCH + 8 + Math.ceil(previous.name.length * 7.4) + 20;
      }
    }
    const cy = y + LEGEND_ROW / 2;
    out += `<rect x="${px(x)}" y="${px(cy - LEGEND_SWATCH / 2)}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" fill="${entry.color}"/>`;
    out += `<text x="${px(x + LEGEND_SWATCH + 8)}" y="${px(cy + 5)}">${escapeText(entry.name)}</text>`;
  });
  return `${out}</g>`;
}

export function renderChart(block: BlockOf<'chart'>, ctx: BlockContext): string {
  const w = block.pos?.w ?? ctx.slotWidth ?? 1326;
  const h = block.pos?.h ?? block.height ?? CHART_FLOW_HEIGHT;
  const format = block.numberFormat;
  const legendAt: ChartLegend = block.legend ?? 'right';
  const series = block.series.map((s, i) => ({
    name: s.name,
    values: s.values,
    color: colorCss(chartSeriesColor(s, i)),
  }));
  const attributes = rootAttrs(block, ctx, {
    className: 'chart',
    style: dropShadowDeclaration(block.shadow) || undefined,
  });
  let open = `<svg viewBox="0 0 ${px(w)} ${px(h)}" width="${px(w)}" height="${px(h)}"`;
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    open += ` ${name}="${escapeAttr(value)}"`;
  }
  open += dataAttrs(raster(ctx, block.id, 'dia', true));
  open += ` data-chart="${block.kind}"`;
  open +=
    block.alt !== undefined ? ` aria-label="${escapeAttr(block.alt)}"` : ' aria-hidden="true"';
  let body = '';
  let top = PAD;
  if (block.title !== undefined && block.title !== '') {
    const run = runAttr(ctx, block.id, 'title');
    body += `<text class="title"${run !== undefined ? ` data-run="${escapeAttr(run)}"` : ''} x="${PAD}" y="${top + CHART_TYPE.title}">${renderText(block.title, { gtWord: false })}</text>`;
    top += CHART_TYPE.title + 16;
  }
  const outer: Box = { x: PAD, y: top, w: w - 2 * PAD, h: h - top - PAD };
  const legendNames = block.kind === 'pie' ? block.categories : series.map((s) => s.name);
  const { plot, legend } = splitLegend(outer, legendAt, legendNames);
  const legendEntries =
    block.kind === 'pie'
      ? block.categories.map((name, i) => ({
          name,
          color: colorCss(CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length] ?? 'ink'),
        }))
      : series.map((s) => ({ name: s.name, color: s.color }));

  if (block.kind === 'pie') {
    body += pieMarkup(
      block,
      plot,
      legendEntries.map((e) => e.color),
      format,
    );
  } else {
    body += axesMarkup(block, plot, series, format);
  }
  if (legend) body += legendMarkup(legend, legendAt, legendEntries);
  return `${open}>${body}</svg>`;
}

function pieMarkup(
  block: BlockOf<'chart'>,
  plot: Box,
  colors: readonly string[],
  format: BlockOf<'chart'>['numberFormat'],
): string {
  const values = block.series[0]?.values ?? [];
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0) || 1;
  const labelRoom = block.labels === true ? 48 : 0;
  const r = Math.max(8, Math.min(plot.w, plot.h) / 2 - labelRoom);
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  let angle = -Math.PI / 2;
  let out = `<g class="slices">`;
  let labels = '';
  values.forEach((raw, i) => {
    const value = Math.max(0, raw);
    const sweep = (value / total) * Math.PI * 2;
    const end = angle + sweep;
    const color = colors[i % colors.length] ?? 'var(--ink)';
    /* every mark names its cell (`data-series`, `data-category`) so a click on a slice, a bar or a
       point of the selected chart makes its cell active in the Chart data grid (docs/FEATURES.md
       2.2 rank 7; the editor's mark hit test reads the two attributes, never the drawing) */
    const mark = ` data-series="0" data-category="${i}"`;
    if (values.length === 1 || sweep >= Math.PI * 2 - 1e-6) {
      out += `<circle cx="${px(cx)}" cy="${px(cy)}" r="${px(r)}"${mark} fill="${color}" stroke="var(--paper)" stroke-width="1"/>`;
    } else if (sweep > 0) {
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;
      out += `<path d="M${px(cx)},${px(cy)} L${px(x1)},${px(y1)} A${px(r)},${px(r)} 0 ${large} 1 ${px(x2)},${px(y2)} Z"${mark} fill="${color}" stroke="var(--paper)" stroke-width="1"/>`;
    }
    if (block.labels === true && sweep > 0) {
      const mid = angle + sweep / 2;
      const lx = cx + (r + 24) * Math.cos(mid);
      const ly = cy + (r + 24) * Math.sin(mid);
      const anchor = Math.cos(mid) < -0.2 ? 'end' : Math.cos(mid) > 0.2 ? 'start' : 'middle';
      const text =
        format === 'percent'
          ? `${Math.round((value / total) * 100)}%`
          : formatChartNumber(value, format);
      labels += `<text class="value" x="${px(lx)}" y="${px(ly + 6)}" text-anchor="${anchor}">${escapeText(text)}</text>`;
    }
    angle = end;
  });
  return `${out}</g>${labels}`;
}

function axesMarkup(
  block: BlockOf<'chart'>,
  plot: Box,
  series: readonly { name: string; values: number[]; color: string }[],
  format: BlockOf<'chart'>['numberFormat'],
): string {
  const values = series.flatMap((s) => s.values);
  const scale = valueScale(values);
  const categories = block.categories;
  const horizontal = block.kind === 'bar';
  // the value axis labels take a gutter sized by the longest tick label
  const tickLabels = scale.ticks.map((t) => formatChartNumber(t, format));
  const tickW = Math.max(...tickLabels.map((t) => t.length)) * 10 + TICK + 8;
  const catLabelW = Math.max(...categories.map((c) => c.length)) * 9 + TICK + 8;
  const left =
    plot.x + (horizontal ? Math.min(catLabelW, plot.w / 3) : Math.min(tickW, plot.w / 3));
  const bottom = plot.y + plot.h - LABEL_LINE;
  const right = plot.x + plot.w;
  const topY = plot.y + (block.labels === true && !horizontal ? LABEL_LINE : 8);
  const areaW = Math.max(1, right - left);
  const areaH = Math.max(1, bottom - topY);
  const span = scale.max - scale.min || 1;
  const along = (v: number): number =>
    horizontal
      ? left + ((v - scale.min) / span) * areaW
      : bottom - ((v - scale.min) / span) * areaH;
  let out = `<g class="grid">`;
  // ticks and their labels
  for (const [i, tick] of scale.ticks.entries()) {
    const label = tickLabels[i] ?? '';
    if (horizontal) {
      const x = half(along(tick));
      out += `<line class="hair" x1="${px(x)}" y1="${px(topY)}" x2="${px(x)}" y2="${px(bottom)}" stroke-width="1"/>`;
      out += `<text x="${px(x)}" y="${px(bottom + 20)}" text-anchor="middle">${escapeText(label)}</text>`;
    } else {
      const y = half(along(tick));
      out += `<line class="hair" x1="${px(left)}" y1="${px(y)}" x2="${px(right)}" y2="${px(y)}" stroke-width="1"/>`;
      out += `<text x="${px(left - TICK - 4)}" y="${px(y + 6)}" text-anchor="end">${escapeText(label)}</text>`;
    }
  }
  out += '</g>';
  // the axes in ink
  const axisX = half(left);
  const zeroLine = half(along(0));
  if (horizontal) {
    out += `<line class="ink" x1="${px(axisX)}" y1="${px(topY)}" x2="${px(axisX)}" y2="${px(bottom)}" stroke-width="1"/>`;
    out += `<line class="ink" x1="${px(zeroLine)}" y1="${px(topY)}" x2="${px(zeroLine)}" y2="${px(bottom)}" stroke-width="1"/>`;
  } else {
    out += `<line class="ink" x1="${px(axisX)}" y1="${px(topY)}" x2="${px(axisX)}" y2="${px(bottom)}" stroke-width="1"/>`;
    out += `<line class="ink" x1="${px(left)}" y1="${px(zeroLine)}" x2="${px(right)}" y2="${px(zeroLine)}" stroke-width="1"/>`;
  }
  const n = categories.length;
  const slot = (horizontal ? areaH : areaW) / Math.max(1, n);
  // category labels
  out += '<g class="categories">';
  categories.forEach((category, i) => {
    const center = (horizontal ? topY : left) + slot * (i + 0.5);
    if (horizontal)
      out += `<text x="${px(left - TICK - 4)}" y="${px(center + 6)}" text-anchor="end">${escapeText(category)}</text>`;
    else
      out += `<text x="${px(center)}" y="${px(bottom + 20)}" text-anchor="middle">${escapeText(category)}</text>`;
  });
  out += '</g>';
  if (block.kind === 'line') {
    series.forEach((s, si) => {
      const points = s.values.map((v, i) => ({ x: left + slot * (i + 0.5), y: along(v) }));
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x)},${px(p.y)}`).join(' ');
      out += `<path class="series" data-series="${si}" d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      /* a point names its cell for the editor's mark hit test (docs/FEATURES.md 2.2 rank 7) */
      points.forEach((p, i) => {
        out += `<circle cx="${px(p.x)}" cy="${px(p.y)}" r="4" data-series="${si}" data-category="${i}" fill="${s.color}"/>`;
      });
      if (block.labels === true)
        s.values.forEach((v, i) => {
          const p = points[i] as { x: number; y: number };
          out += `<text class="value" x="${px(p.x)}" y="${px(p.y - 10)}" text-anchor="middle">${escapeText(formatChartNumber(v, format))}</text>`;
        });
    });
    return out;
  }
  // bars and columns: the series side by side inside each category slot, a gap of a fifth
  const groupGap = slot * 0.2;
  const barSize = Math.max(1, (slot - groupGap) / Math.max(1, series.length));
  series.forEach((s, si) => {
    out += `<g class="series" data-series="${si}">`;
    s.values.forEach((v, i) => {
      const start = (horizontal ? topY : left) + slot * i + groupGap / 2 + barSize * si;
      const zero = along(0);
      const end = along(v);
      const from = Math.min(zero, end);
      const length = Math.abs(end - zero);
      /* a bar names its cell for the editor's mark hit test (docs/FEATURES.md 2.2 rank 7) */
      const mark = ` data-series="${si}" data-category="${i}"`;
      if (horizontal)
        out += `<rect x="${px(from)}" y="${px(start)}" width="${px(length)}" height="${px(Math.max(0, barSize - 2))}"${mark} fill="${s.color}"/>`;
      else
        out += `<rect x="${px(start)}" y="${px(from)}" width="${px(Math.max(0, barSize - 2))}" height="${px(length)}"${mark} fill="${s.color}"/>`;
      if (block.labels === true) {
        const label = escapeText(formatChartNumber(v, format));
        if (horizontal)
          out += `<text class="value" x="${px(end + 6)}" y="${px(start + barSize / 2 + 5)}">${label}</text>`;
        else
          out += `<text class="value" x="${px(start + barSize / 2 - 1)}" y="${px(end - 8)}" text-anchor="middle">${label}</text>`;
      }
    });
    out += '</g>';
  });
  return out;
}
