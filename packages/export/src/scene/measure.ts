// Scene extraction in the rendered page (SPEC 8.1): one page.evaluate that walks the active slide
// and returns a Scene in sheet pixels. For every text carrier (`[data-run]`, plus the stage
// counter) it reads the computed style and the browser's own line boxes: a per-character caret
// walk over Range.getClientRects() groups characters into lines and splits the string at the line
// boundaries, so the PPTX gets one hard break per browser line and no renderer rewraps. A `.rows`
// key's inline `<svg>` icon is not text and never produces a line (pptx report section 6 item 1);
// the hidden `GT` letters of a gt-word become a run at the mark's box (SPEC 5.2). Hairlines are
// read from the computed borders of the native blocks, plates and chips from their boxes, and
// every element the exporter must screenshot is tagged with `data-ts-rid` so the extractor can
// address it. The callback is self-contained: Playwright serializes its source.
import type { Page } from 'playwright-core';

import type { Scene, SceneBlock, SceneRaster, SceneRect, SceneRule, SceneText } from './types.ts';

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
};

export const DEFAULT_SHEET_SELECTOR = '.ts-sheet, .sheet, body';
export const DEFAULT_SLIDE_SELECTOR = '.slide.is-on, [data-slide], .slide';

/** What the page returns; the Node side adds the ids, the notes and the asset id. */
type PageScene = Omit<Scene, 'slideId' | 'n' | 'total' | 'theme' | 'kind' | 'notes'> & {
  pictureSrc?: string;
};

export async function measureScene(page: Page, options: MeasureSceneOptions): Promise<Scene> {
  const measured = (await page.evaluate(
    ({ sheetSelector, slideSelector, nativeTypes, theme }) => {
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
        align: 'left' | 'center' | 'right';
      };
      type Run = { text: string; rect: DOMRect; style: Style; gt?: true };
      type Line = { top: number; bottom: number; runs: Run[] };

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

      // Blocks: the top-level data-block roots; a block nested in a composite belongs to it.
      const blockEls = [...slide.querySelectorAll<HTMLElement>('[data-block]')].filter(
        (el) => el.parentElement?.closest('[data-block]') === null,
      );
      const blocks: SceneBlock[] = blockEls.map((el) => {
        const type = el.getAttribute('data-type') ?? el.tagName.toLowerCase();
        return {
          blockId: el.getAttribute('data-block') ?? '',
          type,
          box: toBox(el.getBoundingClientRect()),
          native: nativeTypes.includes(type),
        };
      });
      const ownerOf = (el: Element): HTMLElement | null => {
        let cur: HTMLElement | null = el.closest('[data-block]');
        let top: HTMLElement | null = cur;
        while (cur) {
          top = cur;
          cur = cur.parentElement?.closest('[data-block]') ?? null;
        }
        return top;
      };
      const isNativeOwner = (el: Element): boolean => {
        const owner = ownerOf(el);
        if (!owner) return true;
        return nativeTypes.includes(owner.getAttribute('data-type') ?? '');
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
      const styleOf = (el: Element, carrier: Element): Style => {
        const c = getComputedStyle(el);
        const size = parseFloat(c.fontSize);
        const lineHeight = c.lineHeight === 'normal' ? size * 1.21 : parseFloat(c.lineHeight);
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
            align === 'center' ? 'center' : align === 'right' || align === 'end' ? 'right' : 'left',
        };
        const href = anchor?.getAttribute('href');
        if (href) style.link = href;
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
        a.mono === b.mono;

      // One carrier to lines of runs.
      const measureCarrier = (el: Element): { lines: Line[]; style: Style } => {
        const lines: Line[] = [];
        const range = document.createRange();
        const pushRun = (rect: DOMRect, text: string, style: Style, gt: boolean): void => {
          const cy = rect.top + rect.height / 2;
          let line = lines.find((l) => cy >= l.top - 1 && cy <= l.bottom + 1);
          if (!line) {
            line = { top: rect.top, bottom: rect.bottom, runs: [] };
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
          const run: Run = { text, rect, style };
          if (gt) run.gt = true;
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
            pushRun(svg.getBoundingClientRect(), text.trim() || 'GT', styleOf(host, el), true);
            continue;
          }
          const style = styleOf(parent, el);
          let runText = '';
          let runRect: DOMRect | null = null;
          const flush = (): void => {
            if (runRect && runText.length > 0) pushRun(runRect, runText, style, false);
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
              // the browser dropped it; a zero-width non-space character stays with its run
              if (/\s/.test(ch)) continue;
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
        lines.sort((a, b) => a.top - b.top);
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
            runs: line.runs.map((r) => {
              const out: SceneText['lines'][number]['runs'][number] = {
                text: r.text,
                box: toBox(r.rect),
                style: r.style,
              };
              if (r.gt) out.gt = true;
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
        };
        if (group !== undefined) text.group = group;
        return text;
      };

      // Text carriers in document order.
      const texts: SceneText[] = [];
      slide.querySelectorAll<HTMLElement>('[data-run]').forEach((el) => {
        const id = el.getAttribute('data-run') ?? '';
        const owner = ownerOf(el);
        const blockId = owner?.getAttribute('data-block') ?? id.split('/')[0] ?? '';
        const native = isNativeOwner(el);
        let group: string | undefined;
        const row = el.parentElement;
        if (owner && row && row.parentElement === owner && owner.classList.contains('rows')) {
          const i = [...owner.children].indexOf(row);
          group = `${blockId}/row/${i}`;
        } else if (owner && el.parentElement === owner && owner.classList.contains('plain')) {
          const i = [...owner.children].indexOf(el);
          group = `${blockId}/item/${i}`;
        }
        const text = toText(el, id, blockId, native, group);
        if (text) texts.push(text);
      });

      // Rules and rects of the native blocks: computed borders and backgrounds.
      const rules: SceneRule[] = [];
      const rects: SceneRect[] = [];
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
        if (type === 'rows') {
          borderRules(el, blockId, 'rows', undefined, ['top']);
          [...el.children].forEach((row, i) =>
            borderRules(row, blockId, 'rows', `${blockId}/row/${i}`, ['bottom']),
          );
        } else if (type === 'plain') {
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
        }
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

      // Rasters: raster blocks as a whole; icons, marks and the gt-word svgs inside native blocks;
      // the closing plate's mark. Each element gets a data-ts-rid the extractor screenshots; the
      // tags of the slides measured before in the same document are cleared first, or a stale tag
      // on a hidden slide would win the selector.
      document.querySelectorAll('[data-ts-rid]').forEach((el) => el.removeAttribute('data-ts-rid'));
      const rasters: SceneRaster[] = [];
      let rid = 0;
      // A root with no box of its own (an escape block whose markup is `position: absolute`) takes
      // the union of its visible descendants, clipped to the sheet.
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
      const tag = (
        el: Element,
        blockId: string,
        kind: SceneRaster['kind'],
        alpha: boolean,
      ): void => {
        rid += 1;
        (el as HTMLElement).dataset.tsRid = String(rid);
        const { box, clip } = contentBox(el);
        const raster: SceneRaster = {
          id: `${blockId}:${rid}`,
          blockId,
          kind,
          selector: `[data-ts-rid="${rid}"]`,
          box,
          alpha,
          scale: 2,
        };
        if (clip) raster.clip = true;
        rasters.push(raster);
      };
      for (const el of blockEls) {
        const type = el.getAttribute('data-type') ?? '';
        if (!nativeTypes.includes(type))
          tag(el, el.getAttribute('data-block') ?? '', 'block', true);
      }
      slide.querySelectorAll<HTMLElement>('[data-raster]').forEach((el) => {
        if (!isNativeOwner(el)) return;
        const kind = (el.getAttribute('data-raster') ?? 'icon') as SceneRaster['kind'];
        const owner = ownerOf(el);
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
          const owner = ownerOf(el);
          tag(
            el,
            owner?.getAttribute('data-block') ?? 'inline',
            el.closest('.gt-word') ? 'mark' : 'icon',
            true,
          );
        });
      slide
        .querySelectorAll<HTMLElement>('svg.mark')
        .forEach((el) => tag(el, 'plate-mark', 'mark', true));
      if (wordmarkSvg) tag(wordmarkSvg, 'wordmark', 'mark', true);

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
        rasters,
        blocks,
        fonts,
        warnings,
      };
      if (picture) out.picture = picture;
      if (pictureSrc !== undefined) out.pictureSrc = pictureSrc;
      if (wordmark) out.wordmark = wordmark;
      if (counter) out.counter = counter;
      return out;
    },
    {
      sheetSelector: options.sheetSelector ?? DEFAULT_SHEET_SELECTOR,
      slideSelector: options.slideSelector ?? DEFAULT_SLIDE_SELECTOR,
      nativeTypes: [...options.nativeTypes],
      theme: options.theme,
    },
  )) as PageScene;
  const { pictureSrc, ...rest } = measured;
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
  return scene;
}
