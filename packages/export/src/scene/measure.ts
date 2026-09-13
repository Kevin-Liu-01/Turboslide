// Scene extraction in the rendered page (SPEC 8.1): one page.evaluate that walks the active slide
// and returns a Scene in sheet pixels. For every text carrier (`[data-run]`, plus the stage
// counter) it reads the computed style and the browser's own line boxes: a per-character caret
// walk over Range.getClientRects() groups characters into lines and splits the string at the line
// boundaries, so the PPTX gets one hard break per browser line and no renderer rewraps. A `.rows`
// key's inline `<svg>` icon is not text and never produces a line (pptx report section 6 item 1);
// the hidden `GT` letters of a gt-word become a run at the mark's box (SPEC 5.2); a paragraph
// break is the `.para` span a line sits in, a block link the `.link` wrapper around the block, a
// numbered item's numeral its own `data-num` carrier, and a table block yields its rules and its
// grid (gslides-parity SPEC 7.2.6, 7.2.7, 7.3, 7.4). Hairlines are
// read from the computed borders of the native blocks, plates and chips from their boxes, and
// every element the exporter must screenshot carries a `data-ts-rid` tag written by
// `tagRasterElements`, which runs on every page of the extraction (the 1x page the scene is measured
// on and the 2x and 3x pages the rasters are shot on, M5) in the same document order, so one tag
// names one element on every page. A block nested in a composite is its own block: the composite
// root is a grid and emits nothing (M5 native export of every block type). The callbacks are
// self-contained: Playwright serializes their source.
import type { Page } from 'playwright-core';

import type {
  Scene,
  SceneBlock,
  SceneChart,
  SceneRaster,
  SceneRect,
  SceneRule,
  SceneSegment,
  SceneTable,
  SceneTableCell,
  SceneText,
} from './types.ts';

/**
 * What the page reads of a chart block (gslides-parity SPEC-2 2.8.1): its box, the transform and
 * the colours the theme resolved; the data comes from the document (scene/enrich.ts).
 */
export type MeasuredChart = Pick<
  SceneChart,
  'blockId' | 'box' | 'kind' | 'labelColor' | 'titleColor' | 'rotate' | 'flip' | 'userGroup' | 'alt'
> & { seriesColors: string[] };

/** What one tagged raster element is, as tagRasterElements returns it (boxes are measured later). */
export type RasterTag = {
  rid: number;
  blockId: string;
  kind: SceneRaster['kind'];
  alpha: boolean;
};

/**
 * Tags every element the native export screenshots with `data-ts-rid`, in document order, and
 * returns the tags: raster leaf blocks as a whole (every non-composite block whose type is not
 * in `nativeTypes`), the `[data-raster]` elements inside native blocks (icons, marks, shots,
 * dither canvases, diagram svgs), the untagged inline icons and the gt-word svgs inside native
 * blocks, the closing plate's mark and the stage wordmark. Stale tags of an earlier slide in the
 * same document are cleared first, or a hidden slide's element would win the selector. Runs on
 * every page of the extraction so the 1x geometry and the 2x or 3x pixels name the same elements.
 */
export async function tagRasterElements(
  page: Page,
  options: { nativeTypes: readonly string[]; slideSelector?: string; sheetSelector?: string },
): Promise<RasterTag[]> {
  return page.evaluate(
    ({ nativeTypes, slideSelector, sheetSelector }) => {
      const firstOf = (list: string): Element | null => {
        for (const sel of list.split(',')) {
          const el = document.querySelector(sel.trim());
          if (el) return el;
        }
        return null;
      };
      const sheetEl = firstOf(sheetSelector) ?? document.body;
      const stage = sheetEl.querySelector('.ts-stage, .stage') ?? sheetEl;
      const slide = firstOf(slideSelector) ?? sheetEl;
      const isComposite = (el: Element): boolean => el.getAttribute('data-type') === 'composite';
      const ownerOf = (el: Element): HTMLElement | null => {
        let cur: HTMLElement | null = el.closest('[data-block]');
        while (cur && isComposite(cur)) cur = cur.parentElement?.closest('[data-block]') ?? null;
        return cur;
      };
      const isNativeOwner = (el: Element): boolean => {
        const owner = ownerOf(el);
        if (!owner) return true;
        return nativeTypes.includes(owner.getAttribute('data-type') ?? '');
      };
      document.querySelectorAll('[data-ts-rid]').forEach((el) => el.removeAttribute('data-ts-rid'));
      const tags: { rid: number; blockId: string; kind: string; alpha: boolean }[] = [];
      let rid = 0;
      const tag = (el: Element, blockId: string, kind: string, alpha: boolean): void => {
        rid += 1;
        (el as HTMLElement).dataset.tsRid = String(rid);
        tags.push({ rid, blockId, kind, alpha });
      };
      const leafBlocks = [...slide.querySelectorAll<HTMLElement>('[data-block]')].filter(
        (el) => !isComposite(el),
      );
      for (const el of leafBlocks) {
        const type = el.getAttribute('data-type') ?? '';
        if (!nativeTypes.includes(type))
          tag(el, el.getAttribute('data-block') ?? '', 'block', true);
      }
      slide.querySelectorAll<HTMLElement>('[data-raster]').forEach((el) => {
        if (!isNativeOwner(el)) return;
        if (el.closest('[data-ts-rid]') !== null) return;
        const kind = el.getAttribute('data-raster') ?? 'icon';
        const owner = ownerOf(el);
        // a native chart travels through addChart (gslides-parity SPEC-2 2.8.1) and a native shape
        // as a preset geometry (2.3.1): their svgs are not rasters of their own
        const ownerType = owner?.getAttribute('data-type');
        if (ownerType === 'chart' || (ownerType === 'shape' && kind === 'dia')) return;
        const blockId =
          owner?.getAttribute('data-block') ??
          (el.getAttribute('data-rid') ?? 'raster').split(':')[0] ??
          'raster';
        tag(el, blockId, kind, kind !== 'shot' && kind !== 'html');
      });
      slide
        .querySelectorAll<HTMLElement>('svg.ic:not([data-raster]), .gt-word svg')
        .forEach((el) => {
          if (!isNativeOwner(el)) return;
          if (el.closest('[data-ts-rid]') !== null) return;
          const owner = ownerOf(el);
          tag(
            el,
            owner?.getAttribute('data-block') ?? 'inline',
            el.closest('.gt-word') ? 'mark' : 'icon',
            true,
          );
        });
      slide.querySelectorAll<HTMLElement>('svg.mark').forEach((el) => {
        if (el.closest('[data-ts-rid]') === null) tag(el, 'plate-mark', 'mark', true);
      });
      const wordmarkSvg = stage.querySelector<SVGElement>('.wordmark svg');
      if (wordmarkSvg) tag(wordmarkSvg, 'wordmark', 'mark', true);
      return tags;
    },
    {
      nativeTypes: [...options.nativeTypes],
      slideSelector: options.slideSelector ?? DEFAULT_SLIDE_SELECTOR,
      sheetSelector: options.sheetSelector ?? DEFAULT_SHEET_SELECTOR,
    },
  ) as Promise<RasterTag[]>;
}

export type MeasureSceneOptions = {
  slideId: string;
  n: number;
  total: number;
  theme: 'light' | 'dark';
  kind: Scene['kind'];
  /** Block types written as native text (NATIVE_BLOCK_TYPES). */
  nativeTypes: readonly string[];
  /** The picture asset of a full-picture slide, recorded on the scene. */
  pictureAssetId?: string;
  notes?: string;
  sheetSelector?: string;
  slideSelector?: string;
  /** The raster tags of this page, when the caller ran tagRasterElements already. */
  tags?: RasterTag[];
};

export const DEFAULT_SHEET_SELECTOR = '.ts-sheet, .sheet, body';
export const DEFAULT_SLIDE_SELECTOR = '.slide.is-on, [data-slide], .slide';

/** What the page returns; the Node side adds the ids, the notes and the asset id. */
type PageScene = Omit<Scene, 'slideId' | 'n' | 'total' | 'theme' | 'kind' | 'notes' | 'charts'> & {
  pictureSrc?: string;
  /** The chart boxes and colours; scene/enrich.ts adds the data from the document. */
  chartsDom?: MeasuredChart[];
};

export async function measureScene(page: Page, options: MeasureSceneOptions): Promise<Scene> {
  const tags =
    options.tags ??
    (await tagRasterElements(page, {
      nativeTypes: options.nativeTypes,
      ...(options.slideSelector ? { slideSelector: options.slideSelector } : {}),
      ...(options.sheetSelector ? { sheetSelector: options.sheetSelector } : {}),
    }));
  const measured = (await page.evaluate(
    ({ sheetSelector, slideSelector, nativeTypes, theme, tags }) => {
      const W = 1600;
      const H = 900;
      type Box = [number, number, number, number];
      type Style = {
        family: string;
        mono: boolean;
        weight: number;
        size: number;
        letterSpacing: number;
        lineHeight: number;
        color: string;
        strike: boolean;
        link?: string;
        features: string;
        align: 'left' | 'center' | 'right' | 'justify';
        italic?: boolean;
        underline?: boolean;
        baseline?: 'super' | 'sub';
        highlight?: string;
      };
      type Transform = {
        rotate?: number;
        flip?: 'h' | 'v' | 'hv';
        userGroup?: string;
        alt?: string;
      };
      type Run = {
        text: string;
        rect: DOMRect;
        style: Style;
        gt?: true;
        gtLetters?: number;
        gapAfter?: number;
        spaceWidth?: number;
        /** The `.para` span the run sits in (gslides-parity SPEC 7.4); 0 without one. */
        paragraph: number;
      };
      type Line = { top: number; bottom: number; runs: Run[]; paragraph: number; band: number };

      const firstOf = (list: string): Element | null => {
        for (const sel of list.split(',')) {
          const el = document.querySelector(sel.trim());
          if (el) return el;
        }
        return null;
      };
      const round = (v: number): number => Math.round(v * 100) / 100;
      // The origin is the stage's box: the render surface offsets the bordered sheet by -1 px so
      // the stage (and the slide) start at the viewport origin (block-css.ts, .ts-present).
      const sheetEl = firstOf(sheetSelector) ?? document.body;
      const stageEl = sheetEl.querySelector('.ts-stage, .stage');
      let sr = (stageEl ?? sheetEl).getBoundingClientRect();
      if (sr.width < 1 || sr.height < 1) sr = new DOMRect(0, 0, W, H);
      const ox = sr.left;
      const oy = sr.top;
      const toBox = (r: DOMRect): Box => [
        round(r.left - ox),
        round(r.top - oy),
        round(r.width),
        round(r.height),
      ];
      const union = (a: DOMRect, b: DOMRect): DOMRect => {
        const left = Math.min(a.left, b.left);
        const top = Math.min(a.top, b.top);
        return new DOMRect(
          left,
          top,
          Math.max(a.right, b.right) - left,
          Math.max(a.bottom, b.bottom) - top,
        );
      };
      const slide = firstOf(slideSelector) ?? sheetEl;
      const stage = stageEl ?? sheetEl;
      const rootStyle = getComputedStyle(sheetEl);
      const paper =
        rootStyle.getPropertyValue('--paper').trim() || (theme === 'dark' ? '#070707' : '#ffffff');
      const ink =
        rootStyle.getPropertyValue('--ink').trim() || (theme === 'dark' ? '#f2f2f0' : '#070707');
      const warnings: string[] = [];

      // Blocks: every data-block root that is not a composite. A composite is a grid whose cells
      // hold blocks; each of those is its own block, native or raster by its own type (M5).
      const isComposite = (el: Element): boolean => el.getAttribute('data-type') === 'composite';
      const blockEls = [...slide.querySelectorAll<HTMLElement>('[data-block]')].filter(
        (el) => !isComposite(el),
      );
      // A linked block sits in its `.link` wrapper (an anchor outside the editor, render
      // blocks/prompt.ts); the wrapper's first element is the block itself, so a block inside a
      // linked composite is not mistaken for a linked one (gslides-parity SPEC 7.2.7).
      const linkOf = (el: Element): string | undefined => {
        const wrapper = el.parentElement;
        if (!wrapper || !wrapper.classList.contains('link') || wrapper.firstElementChild !== el)
          return undefined;
        return wrapper.getAttribute('href') ?? wrapper.getAttribute('data-link') ?? undefined;
      };
      const blocks: SceneBlock[] = blockEls.map((el) => {
        const type = el.getAttribute('data-type') ?? el.tagName.toLowerCase();
        const link = linkOf(el);
        return {
          blockId: el.getAttribute('data-block') ?? '',
          type,
          box: toBox(el.getBoundingClientRect()),
          native: nativeTypes.includes(type),
          ...(link !== undefined ? { link } : {}),
        };
      });
      const linkOfBlock = new Map(blocks.map((b) => [b.blockId, b.link]));
      const ownerOf = (el: Element): HTMLElement | null => {
        let cur: HTMLElement | null = el.closest('[data-block]');
        while (cur && isComposite(cur)) cur = cur.parentElement?.closest('[data-block]') ?? null;
        return cur;
      };
      const isNativeOwner = (el: Element): boolean => {
        const owner = ownerOf(el);
        if (!owner) return true;
        return nativeTypes.includes(owner.getAttribute('data-type') ?? '');
      };

      // the positioned object's wrapper (gslides-parity SPEC-2 1.4, 2.1): the rotation, the flip,
      // the group tag and the alt text travel on the scene entries of the block
      const objectOf = (el: Element | null): Transform => {
        const owner = el ? ownerOf(el) : null;
        const wrapper = owner?.parentElement?.closest('.free[data-free]') ?? null;
        if (!wrapper || wrapper.getAttribute('data-free') !== owner?.getAttribute('data-block'))
          return {};
        const out: Transform = {};
        const rotate = parseFloat(wrapper.getAttribute('data-rotate') ?? '');
        if (Number.isFinite(rotate) && rotate !== 0) out.rotate = rotate;
        const flip = wrapper.getAttribute('data-flip');
        if (flip === 'h' || flip === 'v' || flip === 'hv') out.flip = flip;
        const group = wrapper.getAttribute('data-group');
        if (group) out.userGroup = group;
        const alt = wrapper.getAttribute('aria-label');
        if (alt) out.alt = alt;
        return out;
      };
      const firstFamily = (ff: string): string =>
        (ff.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
      const hasStrike = (el: Element, stop: Element): boolean => {
        let cur: Element | null = el;
        while (cur) {
          if (/line-through/.test(getComputedStyle(cur).textDecorationLine)) return true;
          if (cur === stop) break;
          cur = cur.parentElement;
        }
        return false;
      };
      // the mark span's elements between the run and its carrier (gslides-parity SPEC-2 7.2)
      const within = (el: Element, carrier: Element, selector: string): Element | null => {
        const found = el.closest(selector);
        return found && carrier.contains(found) && found !== carrier ? found : null;
      };
      const styleOf = (el: Element, carrier: Element): Style => {
        const c = getComputedStyle(el);
        const size = parseFloat(c.fontSize);
        // a super or subscript run keeps its line at the carrier's height (line-height 0 on the
        // element, render sheet.css), so the line box is measured from the carrier's line height
        const supOrSub = within(el, carrier, 'sup, sub');
        const lineHost = supOrSub ? (supOrSub.parentElement ?? el) : el;
        const hostStyle = lineHost === el ? c : getComputedStyle(lineHost);
        const lineHeight =
          hostStyle.lineHeight === 'normal'
            ? parseFloat(hostStyle.fontSize) * 1.21
            : parseFloat(hostStyle.lineHeight);
        const letterSpacing = c.letterSpacing === 'normal' ? 0 : parseFloat(c.letterSpacing);
        const anchor = el.closest('a');
        const align = c.textAlign;
        const style: Style = {
          family: firstFamily(c.fontFamily),
          mono: /monospace|Menlo|Consolas|SF Mono|Courier/i.test(c.fontFamily),
          weight: parseInt(c.fontWeight, 10) || 400,
          size: round(size),
          letterSpacing: round(letterSpacing),
          lineHeight: round(lineHeight),
          color: c.color,
          strike: hasStrike(el, carrier),
          features: c.fontFeatureSettings,
          align:
            align === 'center'
              ? 'center'
              : align === 'right' || align === 'end'
                ? 'right'
                : align === 'justify'
                  ? 'justify'
                  : 'left',
        };
        const href = anchor?.getAttribute('href');
        if (href) style.link = href;
        if (c.fontStyle === 'italic' || c.fontStyle.startsWith('oblique')) style.italic = true;
        if (within(el, carrier, 'u') !== null) style.underline = true;
        if (supOrSub !== null)
          style.baseline = supOrSub.tagName.toLowerCase() === 'sup' ? 'super' : 'sub';
        const mark = within(el, carrier, 'mark');
        if (mark !== null) {
          const bg = getComputedStyle(mark).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)') style.highlight = bg;
        }
        return style;
      };
      const sameStyle = (a: Style, b: Style): boolean =>
        a.family === b.family &&
        a.weight === b.weight &&
        a.size === b.size &&
        a.letterSpacing === b.letterSpacing &&
        a.color === b.color &&
        a.strike === b.strike &&
        a.link === b.link &&
        a.mono === b.mono &&
        a.italic === b.italic &&
        a.underline === b.underline &&
        a.baseline === b.baseline &&
        a.highlight === b.highlight;

      // One carrier to lines of runs.
      const measureCarrier = (el: Element): { lines: Line[]; style: Style } => {
        const lines: Line[] = [];
        const range = document.createRange();
        // The width the hidden letters of a GT word take in the host's font, measured on a detached
        // span, so the exporter can space the invisible run to the mark's width (M5 width gate:
        // the letters are about 4 px wider than the mark at 22 px and pushed the rest of the line).
        const lettersWidth = (host: Element, text: string): number => {
          const probe = document.createElement('span');
          const c = getComputedStyle(host);
          probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;font:${c.font};letter-spacing:${c.letterSpacing};font-feature-settings:${c.fontFeatureSettings};font-optical-sizing:${c.fontOpticalSizing};font-variation-settings:${c.fontVariationSettings};font-kerning:${c.fontKerning}`;
          probe.textContent = text;
          document.body.appendChild(probe);
          const width = probe.getBoundingClientRect().width;
          probe.remove();
          return round(width);
        };
        // the paragraph spans of a multiline Text, in order (render blocks/prompt.ts)
        const paras = [...el.querySelectorAll('.para')];
        const paragraphOf = (node: Element): number => {
          const para = node.closest('.para');
          if (!para || !el.contains(para)) return 0;
          const at = paras.indexOf(para);
          return at < 0 ? 0 : at;
        };
        // A multi column carrier (SPEC-2 2.2.10, `column-count`) sets lines of two columns at one
        // height: a run's column band, from its left edge over the carrier's width, keeps them
        // apart, and the lines sort by paragraph, then band, then top, the reading order the file
        // needs (one `<a:p>` per paragraph, the viewer flowing its own columns). Sorted by top
        // alone the fixture's two column paragraph read "1.5.leaves 12 px after." in LibreOffice
        // (b2.md, fix round).
        const columnCount = Math.max(1, Number.parseInt(getComputedStyle(el).columnCount, 10) || 1);
        const carrierRect = el.getBoundingClientRect();
        const bandOf = (rect: DOMRect): number => {
          if (columnCount < 2 || carrierRect.width <= 0) return 0;
          const at = Math.floor(((rect.left - carrierRect.left) / carrierRect.width) * columnCount);
          return Math.min(columnCount - 1, Math.max(0, at));
        };
        const pushRun = (
          rect: DOMRect,
          text: string,
          style: Style,
          gt: boolean,
          paragraph: number,
          gtLetters?: number,
        ): void => {
          const cy = rect.top + rect.height / 2;
          const band = bandOf(rect);
          let line = lines.find((l) => l.band === band && cy >= l.top - 1 && cy <= l.bottom + 1);
          if (!line) {
            line = { top: rect.top, bottom: rect.bottom, runs: [], paragraph, band };
            lines.push(line);
          }
          if (!gt) {
            line.top = Math.min(line.top, rect.top);
            line.bottom = Math.max(line.bottom, rect.bottom);
          }
          const last = line.runs[line.runs.length - 1];
          if (last && !gt && last.gt === undefined && sameStyle(last.style, style)) {
            last.text += text;
            last.rect = union(last.rect, rect);
            return;
          }
          const run: Run = { text, rect, style, paragraph };
          if (gt) run.gt = true;
          if (gtLetters !== undefined) run.gtLetters = gtLetters;
          line.runs.push(run);
        };
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const parent = node.parentElement;
          if (!parent) continue;
          const pcs = getComputedStyle(parent);
          if (pcs.display === 'none' || pcs.visibility === 'hidden') continue;
          const text = node.textContent ?? '';
          if (text.length === 0) continue;
          const sr2 = parent.closest('.sr');
          if (sr2) {
            // the hidden letters of the GT word: one run at the mark's box (SPEC 5.2)
            const word = sr2.closest('.gt-word');
            const svg = word?.querySelector('svg');
            if (!word || !svg) continue;
            const host = word.parentElement ?? parent;
            const letters = text.trim() || 'GT';
            pushRun(
              svg.getBoundingClientRect(),
              letters,
              styleOf(host, el),
              true,
              paragraphOf(host),
              lettersWidth(host, letters),
            );
            continue;
          }
          // a prompt is not content (gslides-parity SPEC 5.4); the render surface never draws
          // one, and the guard keeps a live document honest too
          if (parent.closest('[data-prompt]')) continue;
          const style = styleOf(parent, el);
          const paragraph = paragraphOf(parent);
          let runText = '';
          let runRect: DOMRect | null = null;
          const flush = (): void => {
            if (runRect && runText.length > 0) pushRun(runRect, runText, style, false, paragraph);
            runText = '';
            runRect = null;
          };
          for (let i = 0; i < text.length; i += 1) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
            const ch = text.charAt(i);
            if (rects.length === 0) {
              // collapsed white space (a wrap point, leading or trailing space) is dropped as
              // the browser dropped it; the document's zero-width joiners (U+2060, the nowrap
              // device the importer writes after a hyphen; U+200B; U+FEFF) are dropped too: the
              // lines are already hard breaks, and LibreOffice drew them from a fallback face
              // (M5 round three: fixed-points#h4 dw +10); any other zero-width character stays
              if (/\s/.test(ch) || /[\u2060\u200b\ufeff]/.test(ch)) continue;
              if (runRect) runText += ch;
              continue;
            }
            const r = rects[rects.length - 1] as DOMRect;
            if (runRect) {
              const cy = r.top + r.height / 2;
              const sameLine = cy >= runRect.top - 1 && cy <= runRect.bottom + 1;
              if (!sameLine) flush();
            }
            runText += ch;
            runRect = runRect ? union(runRect, r) : r;
          }
          flush();
        }
        lines.sort((a, b) => a.paragraph - b.paragraph || a.band - b.band || a.top - b.top);
        // An inline element that is not text (the external glyph after a link in a link table,
        // head:121) leaves a horizontal gap between two runs; the run before it records the gap
        // and the width of a no-break space in its font, so the exporter can fill the gap with an
        // invisible run and the text after it keeps its position (M5 width gate: surfaces#rows
        // measured 6 px narrower with the two glyphs of one line collapsed).
        for (const line of lines) {
          for (let i = 0; i + 1 < line.runs.length; i += 1) {
            const a = line.runs[i];
            const b = line.runs[i + 1];
            if (!a || !b || a.gt || b.gt) continue;
            const gap = b.rect.left - a.rect.right;
            if (gap > 1.5) {
              a.gapAfter = round(gap);
              a.spaceWidth = lettersWidth(el, '\u00a0');
            }
          }
        }
        return { lines, style: styleOf(el, el) };
      };

      const toText = (
        el: Element,
        id: string,
        blockId: string,
        native: boolean,
        group?: string,
      ): SceneText | null => {
        const { lines, style } = measureCarrier(el);
        if (lines.length === 0) return null;
        const elRect = el.getBoundingClientRect();
        const sceneLines = lines.map((line) => {
          const textRuns = line.runs.filter((r) => r.gt === undefined);
          const inline = (textRuns.length > 0 ? textRuns : line.runs)
            .map((r) => r.rect)
            .reduce((a, b) => union(a, b));
          const lh = Math.max(...line.runs.map((r) => r.style.lineHeight));
          const top = inline.top - (lh - inline.height) / 2;
          return {
            box: [round(inline.left - ox), round(top - oy), round(inline.width), round(lh)] as Box,
            paragraph: line.paragraph,
            runs: line.runs.map((r) => {
              const out: SceneText['lines'][number]['runs'][number] = {
                text: r.text,
                box: toBox(r.rect),
                style: r.style,
              };
              if (r.gt) out.gt = true;
              if (r.gtLetters !== undefined) out.gtLetters = r.gtLetters;
              if (r.gapAfter !== undefined) out.gapAfter = r.gapAfter;
              if (r.spaceWidth !== undefined) out.spaceWidth = r.spaceWidth;
              return out;
            }),
          };
        });
        const first = sceneLines[0] as (typeof sceneLines)[number];
        const last = sceneLines[sceneLines.length - 1] as (typeof sceneLines)[number];
        const left = Math.min(...sceneLines.map((l) => l.box[0]));
        const right = Math.max(...sceneLines.map((l) => l.box[0] + l.box[2]));
        const elLeft = round(elRect.left - ox);
        const elRight = round(elRect.right - ox);
        let textBox: Box;
        if (style.align === 'left') {
          textBox = [
            left,
            first.box[1],
            Math.max(right, elRight) - left,
            last.box[1] + last.box[3] - first.box[1],
          ];
        } else {
          textBox = [
            elLeft,
            first.box[1],
            elRight - elLeft,
            last.box[1] + last.box[3] - first.box[1],
          ];
        }
        const text: SceneText = {
          id,
          blockId,
          box: toBox(elRect),
          textBox,
          style,
          lines: sceneLines,
          native,
          ...objectOf(el),
        };
        if (group !== undefined) text.group = group;
        const link = linkOfBlock.get(blockId);
        if (link !== undefined) text.link = link;
        // the text layer of a shape with text (SPEC-2 2.2.17): merged with the shape by the builder
        if (el.classList.contains('shape-text')) text.inShape = blockId;
        return text;
      };

      // Text carriers in document order: every data-run Text, and the numeral of a numbered
      // list item (data-num, gslides-parity SPEC 7.2.6), which travels as its own run.
      const texts: SceneText[] = [];
      // the counts per level of a numbered list, reset by a shallower item (schema listNumerals)
      const listCounters = new Map<Element, number[]>();
      slide.querySelectorAll<HTMLElement>('[data-run], [data-num]').forEach((el) => {
        const numeral = el.getAttribute('data-num');
        const id = numeral !== null ? `${numeral}/num` : (el.getAttribute('data-run') ?? '');
        const owner = ownerOf(el);
        const blockId = owner?.getAttribute('data-block') ?? id.split('/')[0] ?? '';
        const native = isNativeOwner(el);
        // a Google list (gslides-parity SPEC-2 2.2.12): the glyph or numeral travels as the
        // paragraph's bullet, not as a text of its own
        const marked = owner !== null && owner.classList.contains('marked');
        if (marked && numeral !== null) return;
        let group: string | undefined;
        const row = el.parentElement;
        if (owner && row && row.parentElement === owner && owner.classList.contains('rows')) {
          const i = [...owner.children].indexOf(row);
          group = `${blockId}/row/${i}`;
        } else if (owner && el.parentElement === owner && owner.classList.contains('plain')) {
          const i = [...owner.children].indexOf(el);
          group = `${blockId}/item/${i}`;
        } else if (
          owner &&
          row &&
          row.parentElement === owner &&
          owner.classList.contains('plain') &&
          row.classList.contains('item')
        ) {
          // a numbered item: the numeral and the text share the item's group
          const i = [...owner.children].indexOf(row);
          group = `${blockId}/item/${i}`;
        } else if (
          owner &&
          row &&
          row.parentElement === owner &&
          owner.classList.contains('table')
        ) {
          // a table cell shares its row's group (SPEC 7.3; the ruled rows construction)
          const i = [...owner.children].indexOf(row);
          group = `${blockId}/row/${i}`;
        }
        const text = toText(el, id, blockId, native, group);
        if (text) {
          if (marked && owner && row && row.classList.contains('item')) {
            const glyphEl = row.querySelector(':scope > .num');
            const level = Math.max(1, parseInt(row.getAttribute('data-level') ?? '1', 10) || 1);
            const kind = owner.getAttribute('data-marker') === 'number' ? 'number' : 'bullet';
            const counters = listCounters.get(owner) ?? [];
            counters.length = Math.min(counters.length, level);
            while (counters.length < level) counters.push(0);
            counters[level - 1] = (counters[level - 1] ?? 0) + 1;
            listCounters.set(owner, counters);
            text.bullet = {
              kind,
              glyph: (glyphEl?.textContent ?? '').trim(),
              level,
              index: counters[level - 1] ?? 1,
              ...(owner.getAttribute('data-preset')
                ? { preset: owner.getAttribute('data-preset') ?? '' }
                : {}),
            };
          }
          texts.push(text);
        }
      });

      // Rules, rects and lines of the native blocks: computed borders, backgrounds and strokes.
      const rules: SceneRule[] = [];
      const rects: SceneRect[] = [];
      const lines: SceneSegment[] = [];
      const tables: SceneTable[] = [];
      const borderRules = (
        el: Element,
        blockId: string,
        role: SceneRule['role'],
        group?: string,
        sides: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom'],
      ): void => {
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        for (const side of sides) {
          const width = parseFloat(
            side === 'top'
              ? c.borderTopWidth
              : side === 'bottom'
                ? c.borderBottomWidth
                : side === 'left'
                  ? c.borderLeftWidth
                  : c.borderRightWidth,
          );
          if (!(width > 0)) continue;
          const color =
            side === 'top'
              ? c.borderTopColor
              : side === 'bottom'
                ? c.borderBottomColor
                : side === 'left'
                  ? c.borderLeftColor
                  : c.borderRightColor;
          const box: Box =
            side === 'top'
              ? [round(r.left - ox), round(r.top - oy), round(r.width), round(width)]
              : side === 'bottom'
                ? [round(r.left - ox), round(r.bottom - width - oy), round(r.width), round(width)]
                : side === 'left'
                  ? [round(r.left - ox), round(r.top - oy), round(width), round(r.height)]
                  : [round(r.right - width - ox), round(r.top - oy), round(width), round(r.height)];
          const rule: SceneRule = { box, color, width: round(width), blockId, role };
          if (group !== undefined) rule.group = group;
          rules.push(rule);
        }
      };
      for (const el of blockEls) {
        const type = el.getAttribute('data-type') ?? '';
        const blockId = el.getAttribute('data-block') ?? '';
        if (!nativeTypes.includes(type)) continue;
        if (type === 'rows' || type === 'say' || type === 'ladder') {
          // a top hairline and one under every row (say renders as .rows.ex, the ladder as
          // .ladder > div; both carry the rows' rules, M5)
          borderRules(el, blockId, 'rows', undefined, ['top']);
          [...el.children].forEach((row, i) =>
            borderRules(row, blockId, 'rows', `${blockId}/row/${i}`, ['bottom']),
          );
        } else if (type === 'table') {
          // The table block (gslides-parity SPEC 7.3): the rules of the ruled rows construction
          // (a hairline above, one under every row, grouped with the row's cells), and the grid
          // addTable takes: the column and row boxes, the cells' alignment, fill and padding, the
          // rule colors from the computed borders, the vertical alignment and the font size.
          borderRules(el, blockId, 'rows', undefined, ['top']);
          const rowEls = [...el.querySelectorAll<HTMLElement>(':scope > .tr')];
          rowEls.forEach((row, i) =>
            borderRules(row, blockId, 'rows', `${blockId}/row/${i}`, ['bottom']),
          );
          const rootStyleOf = getComputedStyle(el);
          const alignOf = (value: string): 'left' | 'center' | 'right' =>
            value === 'center' ? 'center' : value === 'right' || value === 'end' ? 'right' : 'left';
          const valignOf = (value: string): 'top' | 'middle' | 'bottom' =>
            value === 'center'
              ? 'middle'
              : value === 'end' || value === 'flex-end'
                ? 'bottom'
                : 'top';
          // the grid form (SPEC-2 2.7.1, 2.7.2): the rows are display contents, the cells carry
          // the rules and a merged cell spans; the row box is the union of its cells
          const gridForm = el.classList.contains('grid');
          const dashOf = (style: string): 'dash' | 'dot' | undefined =>
            style === 'dashed' ? 'dash' : style === 'dotted' ? 'dot' : undefined;
          let rule: SceneTable['rule'] | undefined;
          let headerRule: SceneTable['headerRule'];
          let merged = false;
          let rowDash: string | undefined;
          const rows = rowEls.map((row) => {
            const header = row.classList.contains('header');
            const cellEls = [...row.querySelectorAll<HTMLElement>(':scope > .td')];
            let r = row.getBoundingClientRect();
            if (r.height < 1 && cellEls.length > 0) {
              r = cellEls.map((cell) => cell.getBoundingClientRect()).reduce((a, b) => union(a, b));
            }
            const c = getComputedStyle(row);
            if (!gridForm) {
              const width = parseFloat(c.borderBottomWidth);
              const line = { color: c.borderBottomColor, width: round(width) };
              if (header) headerRule ??= line;
              else rule ??= line;
              rowDash ??= c.borderBottomStyle;
            }
            const cells: SceneTableCell[] = cellEls.map((cell) => {
              const cs = getComputedStyle(cell);
              const fill = parseFloat(cs.backgroundColor.split(',')[3] ?? '1');
              const out: SceneTableCell = {
                box: toBox(cell.getBoundingClientRect()),
                textId: cell.getAttribute('data-run') ?? '',
                align: alignOf(cs.textAlign),
                margin: [
                  round(parseFloat(cs.paddingTop)),
                  round(parseFloat(cs.paddingRight)),
                  round(parseFloat(cs.paddingBottom)),
                  round(parseFloat(cs.paddingLeft)),
                ],
              };
              if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && fill !== 0)
                out.fill = cs.backgroundColor;
              const span = cell.getAttribute('data-span');
              if (span) {
                const [rs, cs2] = span.split('x').map(Number);
                if ((rs ?? 1) > 1) out.rowspan = rs;
                if ((cs2 ?? 1) > 1) out.colspan = cs2;
                merged = true;
              }
              if (gridForm) {
                const bw = parseFloat(cs.borderBottomWidth);
                if (!(bw > 0) || cs.borderBottomStyle === 'none') out.border = 'none';
                else {
                  const dash = dashOf(cs.borderBottomStyle);
                  out.border = {
                    color: cs.borderBottomColor,
                    width: round(bw),
                    ...(dash ? { dash } : {}),
                  };
                  const line = { color: cs.borderBottomColor, width: round(bw) };
                  if (header) headerRule ??= line;
                  else rule ??= line;
                  rowDash ??= cs.borderBottomStyle;
                }
              }
              return out;
            });
            return { y: round(r.top - oy), h: round(r.height), header, cells };
          });
          if (gridForm) {
            // In the grid form the rows are display contents, so a row's box is the union of its
            // cells: a merged cell spanning down makes it the span's height, and a track taller
            // than its cells (an explicit row height) is missed. The row height addTable takes is
            // the track pitch: the next row's top less this one's, the table's bottom edge for the
            // last row. Measured on the fixture's merged table: cells of 54 px in 56 px tracks
            // wrote 54 px rows, and LibreOffice's rows drifted 2 px per row (b2.md, fix round).
            const tableBox = toBox(el.getBoundingClientRect());
            const bottom = tableBox[1] + tableBox[3];
            rows.forEach((row, i) => {
              const next = rows[i + 1];
              const pitch = round((next ? next.y : bottom) - row.y);
              if (pitch > 0) row.h = pitch;
            });
          }
          // the columns from the row with the most cells (a merged row lists fewer)
          const widest = rows.reduce<SceneTable['rows'][number] | undefined>(
            (best, row) =>
              best === undefined || row.cells.length > best.cells.length ? row : best,
            undefined,
          );
          const columns = widest
            ? widest.cells.map((cell) => ({ x: cell.box[0], w: cell.box[2] }))
            : [];
          const fallbackRule = {
            color: rootStyleOf.borderTopColor,
            width: round(parseFloat(rootStyleOf.borderTopWidth) || 1),
          };
          const table: SceneTable = {
            blockId,
            box: toBox(el.getBoundingClientRect()),
            columns,
            rows,
            rule: rule ?? headerRule ?? fallbackRule,
            valign: valignOf(
              rowEls[0]
                ? gridForm
                  ? getComputedStyle(el).getPropertyValue('--table-valign').trim() || 'start'
                  : getComputedStyle(rowEls[0]).alignItems
                : 'start',
            ),
            size: round(parseFloat(rootStyleOf.fontSize)),
            ...objectOf(el),
          };
          if (headerRule) table.headerRule = headerRule;
          if (merged) table.merged = true;
          const tableDash = dashOf(rowDash ?? rootStyleOf.borderTopStyle);
          const ruleWidth = round(parseFloat(rootStyleOf.borderTopWidth) || 0);
          if (tableDash || ruleWidth === 0)
            table.border = { weight: ruleWidth, ...(tableDash ? { dash: tableDash } : {}) };
          tables.push(table);
        } else if (type === 'plain' || type === 'refs') {
          // a top hairline (plain) and a soft rule under every item; refs has no top border, and
          // borderRules reads the computed widths, so it emits none
          borderRules(el, blockId, 'plain', undefined, ['top']);
          [...el.children].forEach((item, i) =>
            borderRules(item, blockId, 'plain', `${blockId}/item/${i}`, ['bottom']),
          );
        } else if (type === 'panel') {
          const c = getComputedStyle(el);
          const rect: SceneRect = {
            box: toBox(el.getBoundingClientRect()),
            fill: c.backgroundColor,
            blockId,
            role: 'panel',
          };
          const bw = parseFloat(c.borderTopWidth);
          if (bw > 0) rect.line = { color: c.borderTopColor, width: round(bw) };
          rects.push(rect);
        } else if (type === 'box') {
          // the box block (docs/freeform.md): its ground, border and corner from the computed style;
          // its text is a [data-run] carrier measured with the others
          const c = getComputedStyle(el);
          const rect: SceneRect = {
            box: toBox(el.getBoundingClientRect()),
            fill: c.backgroundColor,
            blockId,
            role: 'box',
            shape: 'rect',
            ...objectOf(el),
          };
          const bw = parseFloat(c.borderTopWidth);
          if (bw > 0) rect.line = { color: c.borderTopColor, width: round(bw) };
          const radius = parseFloat(c.borderTopLeftRadius);
          if (radius > 0) {
            rect.shape = 'roundRect';
            rect.radius = round(radius);
          }
          rects.push(rect);
        } else if (type === 'rule') {
          // the rule block: the element is the line, its background the color
          const c = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          rules.push({
            box: toBox(r),
            color: c.backgroundColor,
            width: round(Math.min(r.width, r.height)),
            blockId,
            role: 'rule',
          });
        } else if (type === 'shape') {
          // the shape block: the svg's own box (the svg itself, or the svg inside a `.shape-block`
          // root when the shape holds text, gslides-parity SPEC-2 2.2.17), the inner element's
          // computed fill and stroke (a token resolves to rgb here), the ends, heads, points and
          // decorations from the data attributes the renderer wrote in viewBox units, scaled to the box
          const svg = el.matches('svg') ? el : el.querySelector(':scope > svg.shape');
          if (!svg) continue;
          const kind = svg.getAttribute('data-shape') ?? 'rectangle';
          const svgRect = svg.getBoundingClientRect();
          const viewBox = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
          const sx = svgRect.width / (viewBox[2] || 1);
          const sy = svgRect.height / (viewBox[3] || 1);
          const point = (value: string): [number, number] => {
            const parts = value.split(',').map(Number);
            return [
              round(svgRect.left - ox + (parts[0] ?? 0) * sx),
              round(svgRect.top - oy + (parts[1] ?? 0) * sy),
            ];
          };
          const transform = objectOf(el);
          const lineKinds = ['line', 'arrow', 'elbow', 'curved', 'curve', 'polyline', 'scribble'];
          if (lineKinds.includes(kind)) {
            const strokeEl = svg.querySelector('line, path');
            if (strokeEl) {
              const c = getComputedStyle(strokeEl);
              const headsAttr = svg.getAttribute('data-heads');
              const heads: SceneSegment['heads'] =
                headsAttr === 'start' || headsAttr === 'end' || headsAttr === 'both'
                  ? headsAttr
                  : 'none';
              const pointsAttr = svg.getAttribute('data-points');
              const points = pointsAttr ? pointsAttr.split(' ').map(point) : undefined;
              const from = svg.getAttribute('data-from');
              const to = svg.getAttribute('data-to');
              const first = points?.[0];
              const last = points?.[points.length - 1];
              const segment: SceneSegment = {
                blockId,
                from: from
                  ? point(from)
                  : (first ?? [round(svgRect.left - ox), round(svgRect.top - oy)]),
                to: to
                  ? point(to)
                  : (last ?? [round(svgRect.right - ox), round(svgRect.bottom - oy)]),
                color: c.stroke,
                width: round(parseFloat(c.strokeWidth) || 1),
                heads,
                ...transform,
              };
              if (
                kind !== 'line' &&
                kind !== 'arrow' &&
                kind !== 'elbow' &&
                kind !== 'curved' &&
                kind !== 'curve' &&
                kind !== 'polyline' &&
                kind !== 'scribble'
              ) {
                // unreachable by the list above; keeps the union narrow for the compiler
              } else segment.kind = kind;
              if (points) segment.points = points;
              const bend = parseFloat(svg.getAttribute('data-bend') ?? '');
              if (Number.isFinite(bend)) segment.bend = bend;
              const startEnd = svg.getAttribute('data-start');
              const endEnd = svg.getAttribute('data-end');
              if (startEnd) segment.startEnd = startEnd;
              if (endEnd) segment.endEnd = endEnd;
              if (svg.getAttribute('data-closed') === '1') {
                segment.closed = true;
                if (c.fill && c.fill !== 'none') segment.fill = c.fill;
              }
              const dashed = c.strokeDasharray && c.strokeDasharray !== 'none';
              if (dashed) segment.dash = 'dash';
              lines.push(segment);
            }
          } else {
            const shapeEl = svg.querySelector('rect, ellipse, path');
            if (shapeEl) {
              const c = getComputedStyle(shapeEl);
              const legacy: Record<string, SceneRect['shape']> = {
                rectangle: 'rect',
                rect: 'rect',
                rounded: 'roundRect',
                roundRect: 'roundRect',
                ellipse: 'ellipse',
              };
              const rect: SceneRect = {
                box: toBox(svgRect),
                fill: c.fill === 'none' || c.fill === '' ? 'rgba(0, 0, 0, 0)' : c.fill,
                blockId,
                role: 'shape',
                shape: legacy[kind] ?? 'rect',
                ...transform,
              };
              if (!(kind in legacy)) rect.preset = kind;
              const adjust = svg.getAttribute('data-adjust');
              if (adjust) rect.adjust = adjust.split(',').map(Number);
              if (kind === 'rounded' || kind === 'roundRect') {
                const rx = parseFloat(shapeEl.getAttribute('rx') ?? '');
                if (Number.isFinite(rx) && rx > 0) rect.radius = round(rx * sx);
              }
              const sw = parseFloat(c.strokeWidth);
              if (c.stroke !== 'none' && c.stroke !== '' && sw > 0)
                rect.line = { color: c.stroke, width: round(sw) };
              rects.push(rect);
            }
          }
        }
      }
      // the chart blocks (gslides-parity SPEC-2 2.8.1): the box and the colours the theme resolved;
      // the data comes from the document (scene/enrich.ts)
      const chartsDom: MeasuredChart[] = [];
      for (const el of blockEls) {
        if (el.getAttribute('data-type') !== 'chart') continue;
        const blockId = el.getAttribute('data-block') ?? '';
        const svg = el.matches('svg') ? el : el.querySelector('svg.chart');
        if (!svg) continue;
        const kindAttr = svg.getAttribute('data-chart');
        const kind: MeasuredChart['kind'] =
          kindAttr === 'bar' || kindAttr === 'column' || kindAttr === 'line' || kindAttr === 'pie'
            ? kindAttr
            : 'column';
        const seriesColors: string[] = [];
        svg.querySelectorAll('.series').forEach((series) => {
          const mark = series.matches('path') ? series : series.querySelector('rect, path');
          if (!mark) return;
          const c = getComputedStyle(mark);
          seriesColors.push(series.matches('path') ? c.stroke : c.fill);
        });
        if (kind === 'pie')
          svg.querySelectorAll('.slices > *').forEach((slice) => {
            seriesColors.push(getComputedStyle(slice).fill);
          });
        const label = svg.querySelector('.categories text, .legend text, text');
        const title = svg.querySelector('.title');
        chartsDom.push({
          blockId,
          box: toBox(svg.getBoundingClientRect()),
          kind,
          seriesColors,
          labelColor: label ? getComputedStyle(label).fill : ink,
          titleColor: title ? getComputedStyle(title).fill : ink,
          ...objectOf(el),
        });
      }

      // Plates and chips of a full-picture slide.
      const plates: SceneRect[] = [];
      slide.querySelectorAll<HTMLElement>('.opener-plate, .mood-plate').forEach((el) => {
        plates.push({
          box: toBox(el.getBoundingClientRect()),
          fill: getComputedStyle(el).backgroundColor,
          role: 'plate',
        });
      });
      const chips: Box[] = slide.querySelector('.ts-chips')
        ? [
            [66, 858, 40, 30],
            [1474, 856, 60, 28],
          ]
        : [];

      // The picture.
      const img = slide.querySelector<HTMLImageElement>('img.opener-img, img.mood-img');
      let picture: PageScene['picture'];
      let pictureSrc: string | undefined;
      if (img) {
        const c = getComputedStyle(img);
        picture = {
          src: img.currentSrc || img.getAttribute('src') || '',
          box: toBox(img.getBoundingClientRect()),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          objectFit: c.objectFit,
          objectPosition: c.objectPosition,
          alt: img.getAttribute('alt') ?? '',
        };
        pictureSrc = picture.src;
      }

      // The frame (SPEC 2.1; head:39-49): two rails, two rules, four crosses.
      const hair = rootStyle.getPropertyValue('--hair').trim();
      const cross = rootStyle.getPropertyValue('--cross').trim();
      const frameRules: SceneRule[] = [
        { box: [56, 0, 1, H], color: hair, width: 1, role: 'frame' },
        { box: [W - 57, 0, 1, H], color: hair, width: 1, role: 'frame' },
        { box: [0, 56, W, 1], color: hair, width: 1, role: 'frame' },
        { box: [0, H - 57, W, 1], color: hair, width: 1, role: 'frame' },
      ];
      const crosses: Box[] = [
        [51, 51, 11, 11],
        [W - 62, 51, 11, 11],
        [51, H - 62, 11, 11],
        [W - 62, H - 62, 11, 11],
      ];

      // Wordmark and counter from the stage.
      const wordmarkSvg = stage.querySelector<SVGElement>('.wordmark svg');
      const wordmark = wordmarkSvg ? toBox(wordmarkSvg.getBoundingClientRect()) : undefined;
      const counterEl = stage.querySelector<HTMLElement>('.counter');
      const counter =
        counterEl && (counterEl.textContent ?? '').trim()
          ? (toText(counterEl, 'counter', 'counter', true) ?? undefined)
          : undefined;

      // Rasters: the elements tagRasterElements tagged on this page, with their boxes. A root
      // with no box of its own (an escape block whose markup is `position: absolute`) takes the
      // union of its visible descendants, clipped to the sheet.
      const contentBox = (el: Element): { box: Box; clip: boolean } => {
        const own = el.getBoundingClientRect();
        if (own.width >= 1 && own.height >= 1) return { box: toBox(own), clip: false };
        let left = Number.POSITIVE_INFINITY;
        let top = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;
        el.querySelectorAll('*').forEach((child) => {
          if (child.tagName === 'STYLE') return;
          const r = child.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return;
          left = Math.min(left, r.left);
          top = Math.min(top, r.top);
          right = Math.max(right, r.right);
          bottom = Math.max(bottom, r.bottom);
        });
        if (!Number.isFinite(left)) return { box: toBox(own), clip: false };
        const x = Math.max(0, left - ox);
        const y = Math.max(0, top - oy);
        return {
          box: [
            round(x),
            round(y),
            round(Math.min(W, right - ox) - x),
            round(Math.min(H, bottom - oy) - y),
          ],
          clip: true,
        };
      };
      const rasters: SceneRaster[] = [];
      for (const t of tags) {
        const el = document.querySelector(`[data-ts-rid="${t.rid}"]`);
        if (!el) continue;
        const { box, clip } = contentBox(el);
        const raster: SceneRaster = {
          id: `${t.blockId}:${t.rid}`,
          blockId: t.blockId,
          kind: t.kind,
          selector: `[data-ts-rid="${t.rid}"]`,
          box,
          alpha: t.alpha,
          scale: 2,
          ...objectOf(el),
        };
        if (clip) raster.clip = true;
        rasters.push(raster);
      }

      // the slide background colour layer (gslides-parity SPEC-2 2.6.1, 2.6.2)
      const bgEl = slide.querySelector<HTMLElement>(':scope > .slide-bg');
      const background: Scene['background'] = bgEl
        ? { color: getComputedStyle(bgEl).backgroundColor }
        : undefined;

      const fonts = [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => `${face.family.replace(/^['"]|['"]$/g, '')} ${face.weight}`);

      const out: PageScene = {
        sheet: toBox(sr),
        paper,
        ink,
        frame: { rules: frameRules, crosses, crossColor: cross },
        plates,
        chips,
        texts,
        rules,
        rects,
        lines,
        tables,
        rasters,
        blocks,
        fonts,
        warnings,
      };
      if (picture) out.picture = picture;
      if (pictureSrc !== undefined) out.pictureSrc = pictureSrc;
      if (wordmark) out.wordmark = wordmark;
      if (counter) out.counter = counter;
      if (chartsDom.length > 0) out.chartsDom = chartsDom;
      if (background) out.background = background;
      return out;
    },
    {
      sheetSelector: options.sheetSelector ?? DEFAULT_SHEET_SELECTOR,
      slideSelector: options.slideSelector ?? DEFAULT_SLIDE_SELECTOR,
      nativeTypes: [...options.nativeTypes],
      theme: options.theme,
      tags,
    },
  )) as PageScene;
  const { pictureSrc, chartsDom, ...rest } = measured;
  void pictureSrc;
  const scene: Scene = {
    slideId: options.slideId,
    n: options.n,
    total: options.total,
    theme: options.theme,
    kind: options.kind,
    ...rest,
  };
  if (scene.picture && options.pictureAssetId) scene.picture.assetId = options.pictureAssetId;
  if (options.notes) scene.notes = options.notes;
  // the chart boxes and colours travel to scene/enrich.ts, which adds the data from the document
  if (chartsDom && chartsDom.length > 0)
    scene.charts = chartsDom.map((chart) => ({
      ...chart,
      categories: [],
      series: chart.seriesColors.map((colorHex) => ({ name: '', values: [], colorHex })),
      legend: 'none',
      numberFormat: 'plain',
      labels: false,
    }));
  return scene;
}
