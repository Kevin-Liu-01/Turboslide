// Scene measurement in the page (SPEC 5.3, MILESTONES M1 item 8): the overflow scan ported from
// shoot-slide.mjs lines 47 to 55 (any element inside the current slide whose bounding rect
// leaves the 1600 by 900 sheet by more than one pixel), one box per data-block with its text
// metrics, the row values of rows blocks, the cells of table blocks (gslides-parity SPEC 7.3),
// and the data-raster elements the exporter screenshots.
// Coordinates are sheet pixels relative to the sheet element, so the same function serves a
// document where the sheet is offset or scaled.
import type { Page } from 'playwright-core';

import type { CanvasBoxes } from '@turboslide/schema/canvas';
import {
  CANVAS_SELECTORS,
  measureCanvasBoxes,
  measureFitBoxes,
} from '@turboslide/render/measure-dom';
import type { FitBox } from '@turboslide/render/measure-dom';

import type { Box, RenderBlock, RenderOverflow, RasterKind } from './contracts.ts';

export type MeasuredRaster = {
  blockId: string;
  kind: RasterKind;
  selector: string;
  box: Box;
  alpha: boolean;
};

export type SlideMeasure = {
  sheet: Box;
  overflow: RenderOverflow[];
  blocks: Record<string, RenderBlock>;
  rasters: MeasuredRaster[];
};

export type MeasureOptions = {
  sheetSelector?: string;
  slideSelector?: string;
  /** Overflow entries kept; the deck's report kept six, the record keeps more for the lint. */
  maxOverflow?: number;
};

export const DEFAULT_SHEET_SELECTOR = '.ts-sheet, .sheet, body';
export const DEFAULT_SLIDE_SELECTOR = '.slide.is-on, [data-slide], .slide';

export async function measureSlide(
  page: Page,
  options: MeasureOptions = {},
): Promise<SlideMeasure> {
  return page.evaluate(
    ({ sheetSelector, slideSelector, maxOverflow }) => {
      const W = 1600;
      const H = 900;
      // Selector lists are tried in order (a comma list handed to querySelector would return the
      // first match in document order, which is body). The sheet's own rect, else the stage's,
      // else the viewport: in present mode the sheet fills the 1600 by 900 viewport.
      const firstOf = (list: string): Element | null => {
        for (const sel of list.split(',')) {
          const el = document.querySelector(sel.trim());
          if (el) return el;
        }
        return null;
      };
      const candidates = [firstOf(sheetSelector), firstOf('.ts-stage, .stage')];
      let sr = new DOMRect(0, 0, W, H);
      for (const el of candidates) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= 1 && r.height >= 1) {
          sr = r;
          break;
        }
      }
      const sheet = candidates[0] ?? document.body;
      const ox = sr.left;
      const oy = sr.top;
      const slide = firstOf(slideSelector) ?? sheet;
      const label = (el: Element): string => {
        const cls = typeof el.className === 'string' ? el.className.trim() : '';
        return el.tagName.toLowerCase() + (cls ? `.${cls.split(/\s+/)[0]}` : '');
      };
      const toBox = (r: DOMRect): [number, number, number, number] => [
        Math.round(r.left - ox),
        Math.round(r.top - oy),
        Math.round(r.width),
        Math.round(r.height),
      ];

      const overflow: {
        blockId?: string;
        selector: string;
        box: [number, number, number, number];
      }[] = [];
      slide.querySelectorAll('*').forEach((el) => {
        if (overflow.length >= maxOverflow) return;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        if (r.right - ox > W + 1 || r.bottom - oy > H + 1 || r.left - ox < -1 || r.top - oy < -1) {
          const blockEl = el.closest('[data-block]');
          const blockId = blockEl?.getAttribute('data-block');
          overflow.push({ ...(blockId ? { blockId } : {}), selector: label(el), box: toBox(r) });
        }
      });

      const textInfo = (root: Element, box?: Element) => {
        let minSize = Number.POSITIVE_INFINITY;
        let maxWeight = 0;
        let color: string | undefined;
        let bottom = Number.NEGATIVE_INFINITY;
        const tops = new Set<number>();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!(node.textContent ?? '').trim()) continue;
          const el = node.parentElement;
          if (!el || el.closest('.sr')) continue;
          // a prompt is not content (gslides-parity SPEC 5.4)
          if (el.closest('.prompt')) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const size = parseFloat(cs.fontSize);
          const weight = parseInt(cs.fontWeight, 10) || 400;
          if (size < minSize) minSize = size;
          if (weight > maxWeight) maxWeight = weight;
          color ??= cs.color;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rr of range.getClientRects()) {
            if (!(rr.width > 0 && rr.height > 0)) continue;
            tops.add(Math.round((rr.top - oy) / 3));
            if (rr.bottom > bottom) bottom = rr.bottom;
          }
        }
        const out: {
          lines?: number;
          fontSize?: number;
          fontWeight?: number;
          color?: string;
          contentHeight?: number;
        } = {};
        if (tops.size) out.lines = tops.size;
        if (Number.isFinite(minSize)) out.fontSize = Math.round(minSize * 100) / 100;
        if (maxWeight) out.fontWeight = maxWeight;
        if (color) out.color = color;
        // the height the text needs in its box (gslides-parity SPEC-2 1.6, 2.1.5): the lowest line
        // box less the box's top plus the bottom padding, what text/overflow compares with the box
        if (box !== undefined && Number.isFinite(bottom)) {
          const top = box.getBoundingClientRect().top;
          const pad = parseFloat(getComputedStyle(box).paddingBottom) || 0;
          const inner = parseFloat(getComputedStyle(root).paddingBottom) || 0;
          out.contentHeight = Math.round(bottom - top + Math.max(pad, inner));
        }
        return out;
      };

      const blocks: Record<
        string,
        {
          type: string;
          box: [number, number, number, number];
          lines?: number;
          fontSize?: number;
          fontWeight?: number;
          color?: string;
          contentHeight?: number;
        }
      > = {};
      slide.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => {
        const id = el.getAttribute('data-block');
        if (!id) return;
        const type = el.getAttribute('data-type') ?? el.tagName.toLowerCase();
        // a positioned block measures through its `.free[data-free]` wrapper, the box `pos` wrote
        // (docs/freeform.md; gslides-parity SPEC-2 1.3)
        const wrapper = el.parentElement?.closest<HTMLElement>('.free[data-free]') ?? null;
        const target = wrapper && wrapper.getAttribute('data-free') === id ? wrapper : el;
        blocks[id] = { type, box: toBox(target.getBoundingClientRect()), ...textInfo(el, target) };
        if (type === 'rows') {
          [...el.querySelectorAll(':scope > div')].forEach((row, i) => {
            const value = row.querySelector(':scope > span:last-child') ?? row;
            blocks[`${id}/${i}`] = {
              type: 'row',
              box: toBox(value.getBoundingClientRect()),
              ...textInfo(value),
            };
          });
        }
        if (type === 'table') {
          // a table cell is `<blockId>/<row>/<column>` of type cell (gslides-parity SPEC 7.3):
          // rows/two-lines reads its lines, the export's verify loop measures its ink box against
          // the 3 px text budget (packages/export/src/verify/report.ts)
          [...el.querySelectorAll(':scope > .tr')].forEach((row, r) => {
            [...row.querySelectorAll(':scope > .td')].forEach((cell, c) => {
              blocks[`${id}/${r}/${c}`] = {
                type: 'cell',
                box: toBox(cell.getBoundingClientRect()),
                ...textInfo(cell),
              };
            });
          });
        }
      });

      const rasters: {
        blockId: string;
        kind: string;
        selector: string;
        box: [number, number, number, number];
        alpha: boolean;
      }[] = [];
      slide.querySelectorAll<HTMLElement>('[data-raster]').forEach((el, i) => {
        const kind = el.getAttribute('data-raster') ?? 'html';
        const blockId = el.closest('[data-block]')?.getAttribute('data-block') ?? kind;
        el.dataset.rasterIndex = String(i);
        rasters.push({
          blockId,
          kind,
          selector: `[data-raster-index="${i}"]`,
          box: toBox(el.getBoundingClientRect()),
          alpha: kind !== 'shot' && kind !== 'html',
        });
      });

      return { sheet: toBox(sr), overflow, blocks, rasters };
    },
    {
      sheetSelector: options.sheetSelector ?? DEFAULT_SHEET_SELECTOR,
      slideSelector: options.slideSelector ?? DEFAULT_SLIDE_SELECTOR,
      maxOverflow: options.maxOverflow ?? 40,
    },
  ) as Promise<SlideMeasure>;
}

/** The deck's overflow line: `slideId#blockId x,y wxh` (SPEC 7.2), or the selector when no block owns it. */
export function formatOverflow(slideId: string, entry: RenderOverflow): string {
  const [x, y, w, h] = entry.box;
  return `${slideId}#${entry.blockId ?? entry.selector} ${x},${y} ${w}x${h}`;
}

/**
 * The canvas boxes of the shown slide (gslides-parity SPEC-2 1.3): `measureCanvasBoxes` of
 * @turboslide/render/measure-dom evaluated in the page over the `.ts-stage` origin (the sheet
 * root carries a 1 px edge in the render surface, which would put every box one pixel off), on a
 * sheet page rendered at 1x with `prompts: true` and readied by `waitForReady`. The editor's
 * `measureForCanvas` runs the same function on a hidden sheet, so the `pos` both write agree.
 */
export async function measureCanvas(page: Page, precision = 64): Promise<CanvasBoxes> {
  return page.evaluate(
    `((measure, selectors, precision) => {
      const firstOf = (list) => {
        for (const sel of list.split(',')) {
          const el = document.querySelector(sel.trim());
          if (el) return el;
        }
        return null;
      };
      const stage = firstOf(selectors.stage) || firstOf('.ts-sheet') || document.body;
      const root = firstOf('.ts-sheet') || document.body;
      return measure(root, stage, selectors, precision);
    })(${measureCanvasBoxes.toString()}, ${JSON.stringify(CANVAS_SELECTORS)}, ${precision})`,
  ) as Promise<CanvasBoxes>;
}

/**
 * The height every block's text needs and its font size (gslides-parity SPEC-2 2.1.5, 0.64):
 * `measureFitBoxes` of @turboslide/render/measure-dom evaluated in the page, what
 * `block.autofit --apply` reads to step a size down the ladder or write the box height.
 */
export async function measureFit(page: Page): Promise<Record<string, FitBox>> {
  return page.evaluate(
    `((measure, selectors) => {
      const firstOf = (list) => {
        for (const sel of list.split(',')) {
          const el = document.querySelector(sel.trim());
          if (el) return el;
        }
        return null;
      };
      const stage = firstOf(selectors.stage) || firstOf('.ts-sheet') || document.body;
      const root = firstOf('.ts-sheet') || document.body;
      return measure(root, stage, selectors);
    })(${measureFitBoxes.toString()}, ${JSON.stringify(CANVAS_SELECTORS)})`,
  ) as Promise<Record<string, FitBox>>;
}
