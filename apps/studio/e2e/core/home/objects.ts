import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { extraHTTPHeaders, title } from '../lib';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.2, 2.6, 6.7; build/integrator.md "Landing,
// day 0" 4.9 and 5.1), L2's, push 2: the selection replica on slides 1 and 6, the gestures, the
// Command row, Google's keys and the live module's request. Every observation is through the page
// and the network; nothing is written to a store (/home writes none), so no row tears anything
// down. Each test opens its own context so a row never reads another row's changes.

export const ROWS: readonly string[] = [
  'home.hero.select',
  'home.hero.edit',
  'home.canvas.gestures',
  'home.canvas.log',
  'home.objects.keyboard',
];

/** `--pt-select`, the one blue of the page, as computed styles print it. */
const SELECT = 'rgb(47, 92, 224)';
/** The move curve of LANDING.md 3.1 (`--ts-ease-move`). */
const MOVE_CURVE = 'cubic-bezier(0.65, 0, 0.35, 1)';

/**
 * A curve's text with the zero before every decimal point written: the build's CSS minifier writes
 * the token as `cubic-bezier(.65, 0, .35, 1)`, the same curve, and a Web Animation keeps the text
 * it was given.
 */
const curveText = (text: string | undefined): string =>
  (text ?? '').replace(/(^|[(\s,])\.(?=\d)/g, '$10.');

/** The hero frame's slide 1 title (LANDING.md 2.2): the frame's thumbnails carry the same id, unfocusable. */
const HERO_TITLE = '[data-band="hero"] [data-hero-slide] [data-object="title#heading"]';
const LIVE_READY = 'main[data-live="ready"]';

type Opened = { context: BrowserContext; page: Page };

type OpenOptions = { width?: number; height?: number; touch?: boolean };

/** /home in a fresh context, the live module started and the hero's sequence ended. */
export async function openHome(browser: Browser, options: OpenOptions = {}): Promise<Opened> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    ...(options.touch === true ? { hasTouch: true } : {}),
  });
  const page = await context.newPage();
  await page.goto('/home');
  await page.locator(LIVE_READY).waitFor({ timeout: 30_000 });
  await page.evaluate(() => {
    const boot = (window as unknown as { tsHomeBoot?: { end?: () => void } }).tsHomeBoot;
    boot?.end?.();
  });
  return { context, page };
}

/**
 * Brings a band below the first screen into view and waits for the band loader to insert its
 * instrument (`[data-reserve][data-filled]`, LANDING.md 4.2), which starts the band's code in the
 * same task; a band with no reserved box (its markup in the document) is ready at once.
 */
export async function bandReady(page: Page, band: string): Promise<void> {
  const section = page.locator(`[data-band="${band}"]`);
  await section.scrollIntoViewIfNeeded();
  const reserve = section.locator('[data-reserve]');
  if ((await reserve.count()) > 0)
    await section.locator('[data-reserve][data-filled]').first().waitFor({ timeout: 15_000 });
  await section.scrollIntoViewIfNeeded();
}

/** An object's box as the page draws it: its centre, its own size and turn, in screen px. */
export type Geom = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  s: number;
  sheetLeft: number;
  sheetTop: number;
};

export function geom(page: Page, selector: string): Promise<Geom> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (el === null) throw new Error(`no ${sel}`);
    const sheet = el.closest<HTMLElement>('[data-home-slides]');
    if (sheet === null) throw new Error(`${sel} sits on no slide`);
    const r = el.getBoundingClientRect();
    const sr = sheet.getBoundingClientRect();
    const s = sr.width / 1600;
    // the renderer's 1,600 px stage, scaled to the sheet: its layout px per drawn px
    const frame = sheet.querySelector<HTMLElement>('.ts-stage') ?? sheet;
    const l = (s * frame.offsetWidth) / (frame.getBoundingClientRect().width || 1);
    const t = getComputedStyle(el).transform;
    const m = new DOMMatrix(t === 'none' ? undefined : t);
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      w: (el.offsetWidth * s) / l,
      h: (el.offsetHeight * s) / l,
      rot: Math.round(((Math.atan2(m.b, m.a) * 180) / Math.PI) * 100) / 100,
      s,
      sheetLeft: sr.left,
      sheetTop: sr.top,
    };
  }, selector);
}

/** The overlay as drawn: visible, its ring colour and width, its squares, stem, knob and chip. */
export function overlay(page: Page) {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>('.ts-home-sel')].filter(
      (b) => !b.hidden && b.checkVisibility(),
    );
    const box = boxes[0];
    if (box === undefined) return null;
    const ring = box.querySelector<HTMLElement>('.ts-home-sel-ring');
    const rs = ring === null ? null : getComputedStyle(ring);
    const squares = [...box.querySelectorAll<HTMLElement>('.ts-home-sel-h')].map((h) => {
      const before = getComputedStyle(h, '::before');
      return {
        visible: h.checkVisibility(),
        w: before.width,
        h: before.height,
        border: before.borderTopColor,
      };
    });
    const vis = (sel: string): boolean =>
      box.querySelector<HTMLElement>(sel)?.checkVisibility() ?? false;
    const r = box.getBoundingClientRect();
    return {
      count: boxes.length,
      ring:
        rs === null
          ? null
          : { color: rs.borderTopColor, width: rs.borderTopWidth, style: rs.borderTopStyle },
      squares,
      stem: vis('.ts-home-sel-stem'),
      knob: vis('.ts-home-sel-knob'),
      chip: box.querySelector('.ts-home-sel-chip')?.textContent ?? '',
      editing: box.hasAttribute('data-editing'),
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    };
  });
}

/** Every element of the page that paints `--pt-select` now (colour, ground, border, outline). */
export function bluePainted(page: Page): Promise<string[]> {
  return page.evaluate((blue) => {
    const found: string[] = [];
    const name = (el: Element): string =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''}`;
    for (const el of document.querySelectorAll('body *')) {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      for (const pseudo of [null, '::before', '::after'] as const) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo !== null && (cs.content === 'none' || cs.content === 'normal')) continue;
        const paints: string[] = [];
        if (
          el.childNodes.length > 0 &&
          [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())
        )
          paints.push(cs.color);
        paints.push(cs.backgroundColor);
        for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const)
          if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none')
            paints.push(cs[`border${side}Color`]);
        if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
          paints.push(cs.outlineColor);
        if (el instanceof SVGElement) paints.push(cs.fill, cs.stroke);
        if (paints.includes(blue)) found.push(`${name(el)}${pseudo ?? ''}`);
      }
    }
    return found;
  }, SELECT);
}

const frame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

/** A Web Animation as the page created it: its target, duration, curve and animated properties. */
export type Played = { target: string; duration: number; easing: string; props: string[] };

/**
 * Records every `Element.animate` call from now on (the page's motions are Web Animations, 3.5),
 * so a short motion is read from its start whatever the time a round trip takes; `played` returns
 * the calls since the last `recordAnimations`. The target is named by its `data-object` or
 * `data-thumb`.
 */
export async function recordAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __played?: unknown[];
      __animate?: typeof Element.prototype.animate;
    };
    w.__played = [];
    if (w.__animate !== undefined) return;
    const original = Element.prototype.animate;
    w.__animate = original;
    Element.prototype.animate = function animate(this: Element, keyframes, options) {
      const el = this as HTMLElement;
      const frames = Array.isArray(keyframes) ? keyframes : [];
      const timing = typeof options === 'number' ? { duration: options } : (options ?? {});
      w.__played?.push({
        target: el.dataset?.['object'] ?? el.dataset?.['thumb'] ?? el.tagName.toLowerCase(),
        duration: Number(timing.duration ?? 0),
        easing: String(timing.easing ?? 'linear'),
        props: [...new Set(frames.flatMap((f) => Object.keys(f)))].filter(
          (k) => !['offset', 'easing', 'composite'].includes(k),
        ),
      });
      return original.call(this, keyframes, options);
    };
  });
}

export function played(page: Page): Promise<Played[]> {
  return page.evaluate(
    () => ((window as unknown as { __played?: Played[] }).__played ?? []) as Played[],
  );
}

/** Tabs from the top until `selector` holds focus; the Tab stops it passed, by name. */
async function tabTo(page: Page, selector: string, limit = 80): Promise<void> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector))
      return;
  }
  throw new Error(`Tab never reached ${selector} in ${limit} stops`);
}

/** Waits until no animation runs on the element, at most `ms`. */
async function settledIn(page: Page, selector: string, ms: number): Promise<number> {
  const t0 = Date.now();
  await page.waitForFunction(
    (sel) => (document.querySelector(sel)?.getAnimations().length ?? 0) === 0,
    selector,
    { timeout: ms },
  );
  return Date.now() - t0;
}

/**
 * The ink in the ring from 0.2 to 0.8 of the clear zone outside an object's box, from a screenshot
 * decoded in the page. The selection and the slide's other text (the subtitle, the mark, the
 * counter, the credit) are hidden for the shot, so any ink left in the ring is the field's dither.
 */
async function paperAround(
  page: Page,
  selector: string,
  box: { x: number; y: number; w: number; h: number },
  pad: number,
) {
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.w + pad * 2,
    height: box.h + pad * 2,
  };
  await page.evaluate((sel) => {
    const style = document.createElement('style');
    style.id = 'l2-zone-probe';
    style.textContent = `.ts-home-sel-layer, [data-band="hero"] [data-object]:not(${sel}), [data-band="hero"] :is(.wordmark, .counter, .ts-home-credit) { visibility: hidden !important; }`;
    document.head.append(style);
  }, selector);
  const shot = await page.screenshot({ clip });
  await page.evaluate(() => document.getElementById('l2-zone-probe')?.remove());
  return page.evaluate(
    async ({ b64, pad: p, w, h }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      if (ctx === null) return { ink: -1, total: 0 };
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const kx = img.width / (w + p * 2);
      let ink = 0;
      let total = 0;
      const lum = (i: number) =>
        0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
      const paper = lum(0);
      // a ring from 0.2 to 0.8 of the clear zone's width outside the box: the clear zone, which
      // the field never prints into
      for (let y = 0; y < img.height; y += 1)
        for (let x = 0; x < img.width; x += 1) {
          const ux = x / kx;
          const uy = y / kx;
          const inside = ux > p * 0.8 && ux < p * 1.2 + w && uy > p * 0.8 && uy < p * 1.2 + h;
          const zone = ux > p * 0.2 && ux < p * 1.8 + w && uy > p * 0.2 && uy < p * 1.8 + h;
          if (inside || !zone) continue;
          total += 1;
          if (Math.abs(lum((y * img.width + x) * 4) - paper) > 40) ink += 1;
        }
      return { ink, total };
    },
    { b64: shot.toString('base64'), pad, w: box.w, h: box.h },
  );
}

export function rows(): void {
  test(title('home.hero.select'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      expect(await bluePainted(page), 'no blue at rest').toEqual([]);
      const titleBox = page.locator(HERO_TITLE);
      await titleBox.scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const w = window as unknown as { __selT?: number; __pdT?: number };
        document.addEventListener('pointerdown', () => (w.__pdT = performance.now()), {
          capture: true,
          once: true,
        });
        const mo = new MutationObserver(() => {
          const box = document.querySelector<HTMLElement>('.ts-home-sel');
          if (box !== null && !box.hidden) {
            w.__selT = performance.now();
            mo.disconnect();
          }
        });
        mo.observe(document.querySelector('main') ?? document.body, {
          subtree: true,
          childList: true,
          attributes: true,
        });
      });
      const g = await geom(page, HERO_TITLE);
      await page.mouse.click(g.cx, g.cy);
      const ms = await page.evaluate(() => {
        const w = window as unknown as { __selT?: number; __pdT?: number };
        return (w.__selT ?? Number.POSITIVE_INFINITY) - (w.__pdT ?? 0);
      });
      expect(ms, 'the ring within 50 ms of the press').toBeLessThanOrEqual(50);
      const o = await overlay(page);
      expect(o).not.toBeNull();
      expect(o?.ring).toEqual({ color: SELECT, width: '1px', style: 'solid' });
      expect(o?.squares).toHaveLength(8);
      for (const sq of o?.squares ?? [])
        expect(sq).toEqual({ visible: true, w: '11px', h: '11px', border: SELECT });
      expect(o?.stem && o.knob).toBe(true);
      expect(o?.chip).toBe('Title');
      expect(Math.abs((o?.rect.w ?? 0) - g.w)).toBeLessThanOrEqual(1);

      // Tab reaches the title and draws the same selection
      await page.mouse.click(4, 4);
      expect(await overlay(page)).toBeNull();
      await tabTo(page, HERO_TITLE);
      const t = await overlay(page);
      expect(t?.chip).toBe('Title');
      expect(t?.ring?.color).toBe(SELECT);

      // any slide the frame shows takes the selection (2.2): slide 2's heading, from its filmstrip
      const thumb = page.locator('[data-band="hero"] [data-hero-thumb="plan"]');
      const heading = '[data-band="hero"] [data-hero-slide] [data-object="plan#h"]';
      if ((await thumb.count()) > 0) await thumb.click();
      // the frame's filmstrip shows a slide by a cut once V1#15's stage is on the tree
      const shown = await page
        .locator(heading)
        .waitFor({ timeout: 2000 })
        .then(
          () => true,
          () => false,
        );
      if (shown) {
        const h = await geom(page, heading);
        await page.mouse.click(h.cx, h.cy);
        const o2 = await overlay(page);
        expect(o2?.chip).toBe('Heading');
        expect(o2?.ring?.color).toBe(SELECT);
        expect(Math.abs((o2?.rect.w ?? 0) - h.w)).toBeLessThanOrEqual(1);
      } else
        test.info().annotations.push({
          type: 'not reached',
          description:
            "another slide in the frame: the frame's filmstrip shows no other slide on this tree",
        });
    } finally {
      await context.close();
    }
  });

  test(title('home.hero.edit'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      const g0 = await geom(page, HERO_TITLE);
      const text0 = await page.locator(HERO_TITLE).innerText();
      // select, then drag 160 px: the box follows the pointer within one frame
      await page.mouse.click(g0.cx, g0.cy);
      await page.mouse.down();
      await page.mouse.move(g0.cx + 40, g0.cy + 20, { steps: 4 });
      await page.mouse.move(g0.cx + 80, g0.cy + 40, { steps: 4 });
      await frame(page);
      const g1 = await geom(page, HERO_TITLE);
      const snapped1 = await page.locator('.ts-home-guide:not([hidden])').count();
      if (snapped1 === 0) {
        expect(Math.abs(g1.cx - g0.cx - 80)).toBeLessThanOrEqual(1);
        expect(Math.abs(g1.cy - g0.cy - 40)).toBeLessThanOrEqual(1);
      }
      // within 6 px of the sheet's centre line it snaps, with a 1 px guide in --pt-select
      const centre = g0.sheetLeft + 800 * g0.s;
      const off = centre - g0.cx + 4;
      await page.mouse.move(g0.cx + off, g0.cy + 100, { steps: 6 });
      await frame(page);
      const g2 = await geom(page, HERO_TITLE);
      expect(Math.abs(g2.cx - centre), 'the centre snaps to the centre line').toBeLessThanOrEqual(
        0.75,
      );
      const guide = await page.evaluate(() => {
        const v = document.querySelector<HTMLElement>('.ts-home-guide[data-axis="v"]');
        if (v === null || v.hidden) return null;
        const cs = getComputedStyle(v);
        const r = v.getBoundingClientRect();
        return { bg: cs.backgroundColor, w: r.width, x: r.left };
      });
      expect(guide?.bg).toBe(SELECT);
      expect(guide?.w).toBe(1);
      expect(Math.abs((guide?.x ?? 0) - centre)).toBeLessThanOrEqual(1);
      // 100 px down the frame's 304 px slide (LANDING.md 6.7 home.hero.edit: dragged 100 px), less
      // at most the 6 px a snap to a line across may take
      expect(Math.hypot(g2.cx - g0.cx, g2.cy - g0.cy)).toBeGreaterThanOrEqual(93.5);
      await page.mouse.up();
      expect(await page.locator('.ts-home-guide:not([hidden])').count()).toBe(0);

      // the clear zone moved with the title: paper all round its new place
      const zone = await paperAround(
        page,
        HERO_TITLE,
        { x: g2.cx - g2.w / 2, y: g2.cy - g2.h / 2, w: g2.w, h: g2.h },
        Math.round(24 * g2.s),
      );
      expect(zone.total).toBeGreaterThan(0);
      expect(zone.ink / zone.total, 'no dither inside the clear zone').toBeLessThan(0.01);

      // a second click types at the pointer with the browser's caret; Escape ends and keeps focus
      await page.mouse.click(g2.cx, g2.cy);
      const editingNow = await page.evaluate(
        (sel) =>
          document.querySelector(sel)?.querySelector('[contenteditable]') !== null ||
          (document.querySelector<HTMLElement>(sel)?.isContentEditable ?? false),
        HERO_TITLE,
      );
      expect(editingNow).toBe(true);
      expect((await overlay(page))?.editing).toBe(true);
      await page.keyboard.press('End');
      await page.keyboard.type(' today', { delay: 40 });
      expect(await page.locator(HERO_TITLE).innerText()).toContain('today');
      await page.keyboard.press('Escape');
      const after = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        return {
          focused: document.activeElement === el,
          editable: el?.isContentEditable ?? true,
        };
      }, HERO_TITLE);
      expect(after).toEqual({ focused: true, editable: false });

      // Undo: the words first, then the place, on the move curve by transform within 700 ms
      const undo = page.locator('[data-undo="hero"]');
      await undo.click();
      expect(await page.locator(HERO_TITLE).innerText()).toBe(text0);
      await recordAnimations(page);
      await undo.click();
      const anim = (await played(page)).find((p) => p.target === 'title#heading');
      expect(anim).toBeDefined();
      expect(anim?.duration).toBeGreaterThan(0);
      expect(anim?.duration).toBeLessThanOrEqual(700);
      expect(curveText(anim?.easing)).toBe(MOVE_CURVE);
      expect(anim?.props).toEqual(['transform']);
      expect(await settledIn(page, HERO_TITLE, 900)).toBeLessThanOrEqual(800);
      const g3 = await geom(page, HERO_TITLE);
      expect(Math.abs(g3.cx - g3.sheetLeft - (g0.cx - g0.sheetLeft))).toBeLessThanOrEqual(1);
      expect(Math.abs(g3.cy - g3.sheetTop - (g0.cy - g0.sheetTop))).toBeLessThanOrEqual(1);
    } finally {
      await context.close();
    }

    // on touch the first tap only selects
    const touch = await openHome(browser, { touch: true });
    try {
      const g = await geom(touch.page, HERO_TITLE);
      await touch.page.touchscreen.tap(g.cx, g.cy);
      const o = await overlay(touch.page);
      expect(o?.chip).toBe('Title');
      expect(o?.editing).toBe(false);
      const g1 = await geom(touch.page, HERO_TITLE);
      expect(Math.abs(g1.cx - g.cx) + Math.abs(g1.cy - g.cy)).toBeLessThanOrEqual(1);
      expect(
        await touch.page.locator(HERO_TITLE).evaluate((el) => getComputedStyle(el).touchAction),
      ).toBe('none');
    } finally {
      await touch.context.close();
    }
  });

  test(title('home.canvas.gestures'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      const band = page.locator('[data-band="canvas"]');
      await bandReady(page, 'canvas');
      const objects = await band
        .locator('[data-object]')
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['object'] ?? ''));
      const heading = objects.find((id) => id.startsWith('lighthouse#h')) ?? objects[0] ?? '';
      const H = `[data-band="canvas"] [data-object="${heading}"]`;
      const rest = new Map<string, Geom>();
      for (const id of objects)
        rest.set(id, await geom(page, `[data-band="canvas"] [data-object="${id}"]`));
      const layoutWord = (): Promise<string> => band.locator('[data-layout-row]').innerText();
      expect(await layoutWord()).toContain('Mood');

      // 1. turn it 30 degrees with the knob and Shift: 15 degree steps, the angle in the chip
      const g0 = await geom(page, H);
      await page.mouse.click(g0.cx, g0.cy);
      const knob = await page.locator('.ts-home-sel:not([hidden]) .ts-home-sel-knob').boundingBox();
      expect(knob).not.toBeNull();
      const kx = (knob?.x ?? 0) + (knob?.width ?? 0) / 2;
      const ky = (knob?.y ?? 0) + (knob?.height ?? 0) / 2;
      await page.keyboard.down('Shift');
      await page.mouse.move(kx, ky);
      await page.mouse.down();
      const radius = Math.hypot(kx - g0.cx, ky - g0.cy);
      const angles: string[] = [];
      for (const deg of [10, 20, 33]) {
        const a = (deg * Math.PI) / 180;
        await page.mouse.move(g0.cx + radius * Math.sin(a), g0.cy - radius * Math.cos(a), {
          steps: 3,
        });
        angles.push((await overlay(page))?.chip ?? '');
      }
      await page.mouse.up();
      await page.keyboard.up('Shift');
      for (const chip of angles) {
        expect(chip).toMatch(/^-?\d+°$/);
        expect(Number.parseInt(chip, 10) % 15).toBe(0);
      }
      const g1 = await geom(page, H);
      expect(Math.abs(g1.rot - 30)).toBeLessThanOrEqual(0.5);
      expect(await layoutWord()).toContain('Canvas');

      // 2. resize by the east handle at that turn: the opposite (west) edge stays where it was on
      // the slide (read against the sheet, so a band above that changes height moves nothing here)
      const west = (g: Geom) => {
        const a = (g.rot * Math.PI) / 180;
        const cx = g.cx - g.sheetLeft;
        const cy = g.cy - g.sheetTop;
        return { x: cx - (g.w / 2) * Math.cos(a), y: cy - (g.w / 2) * Math.sin(a) };
      };
      const east = await page
        .locator('.ts-home-sel:not([hidden]) .ts-home-sel-h[data-h="e"]')
        .boundingBox();
      expect(east).not.toBeNull();
      const ex = (east?.x ?? 0) + (east?.width ?? 0) / 2;
      const ey = (east?.y ?? 0) + (east?.height ?? 0) / 2;
      const a = (g1.rot * Math.PI) / 180;
      await page.mouse.move(ex, ey);
      await page.mouse.down();
      await page.mouse.move(ex - 60 * Math.cos(a), ey - 60 * Math.sin(a), { steps: 6 });
      await page.mouse.up();
      const g2 = await geom(page, H);
      expect(g2.w).toBeLessThan(g1.w - 40);
      // the west edge's line holds: its top corner and the turn are unchanged
      expect(Math.abs(g2.rot - g1.rot)).toBeLessThanOrEqual(0.5);
      const corner = (g: Geom) => {
        const r = (g.rot * Math.PI) / 180;
        const w = west(g);
        return { x: w.x + (g.h / 2) * Math.sin(r), y: w.y - (g.h / 2) * Math.cos(r) };
      };
      const c1 = corner(g1);
      const c2 = corner(g2);
      expect(Math.hypot(c2.x - c1.x, c2.y - c1.y), 'the west edge stays').toBeLessThanOrEqual(1.5);

      // 3. drag it off the plate
      await page.mouse.move(g2.cx, g2.cy);
      await page.mouse.down();
      await page.mouse.move(g2.cx - 260, g2.cy - 160, { steps: 8 });
      await page.mouse.up();
      const g3 = await geom(page, H);
      expect(Math.hypot(g3.cx - g2.cx, g3.cy - g2.cy)).toBeGreaterThan(200);
      expect(await layoutWord()).toContain('Canvas');
      // the moved text keeps its paper ground: the slide's paper in the box and around it
      const ground = await page.locator(H).evaluate((el) => {
        const cs = getComputedStyle(el);
        const probe = document.createElement('i');
        probe.style.color = cs.getPropertyValue('--paper');
        el.append(probe);
        const paper = getComputedStyle(probe).color;
        probe.remove();
        return { paper, bg: cs.backgroundColor, outline: cs.outlineColor, width: cs.outlineWidth };
      });
      expect(ground.bg).toBe(ground.paper);
      expect(ground.outline).toBe(ground.paper);
      expect(Number.parseFloat(ground.width)).toBeGreaterThan(0);

      // Undo three times returns every object, and the row reads Mood
      const undo = band.locator('[data-undo="canvas"]');
      for (let i = 0; i < 3; i += 1) {
        await undo.click();
        await settledIn(page, H, 1200);
      }
      for (const id of objects) {
        const g = await geom(page, `[data-band="canvas"] [data-object="${id}"]`);
        const r = rest.get(id);
        // on the slide: its place against the sheet
        const dx = g.cx - g.sheetLeft - ((r?.cx ?? 0) - (r?.sheetLeft ?? 0));
        const dy = g.cy - g.sheetTop - ((r?.cy ?? 0) - (r?.sheetTop ?? 0));
        expect(Math.abs(dx), id).toBeLessThanOrEqual(1);
        expect(Math.abs(dy), id).toBeLessThanOrEqual(1);
        expect(Math.abs(g.w - (r?.w ?? 0)), id).toBeLessThanOrEqual(1);
        expect(g.rot, id).toBe(0);
      }
      expect(await layoutWord()).toContain('Mood');
      expect(await page.locator('[data-live-spacer]').count()).toBe(0);
    } finally {
      await context.close();
    }
  });

  test(title('home.canvas.log'), async ({ browser }) => {
    for (const width of [1440, 390]) {
      const { context, page } = await openHome(browser, {
        width,
        height: width === 390 ? 844 : 900,
      });
      try {
        const band = page.locator('[data-band="canvas"]');
        await bandReady(page, 'canvas');
        const code = band.locator('[data-log]');
        const looks = await code.evaluate((el) => ({
          tag: el.tagName,
          face: getComputedStyle(el).fontFamily,
        }));
        expect(looks.tag).toBe('CODE');
        expect(looks.face).toMatch(/^"?Inter/);
        expect(looks.face).not.toMatch(/mono/i);
        const panels = await band.evaluate(
          (el) =>
            [...el.querySelectorAll('*')].filter(
              (n) => getComputedStyle(n).backgroundColor === 'rgb(16, 16, 16)',
            ).length,
        );
        expect(panels, 'no #101010 panel in the canvas band').toBe(0);
        const ids = await band
          .locator('[data-object]')
          .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['object'] ?? ''));
        const heading = ids.find((id) => id.startsWith('lighthouse#h')) ?? ids[0] ?? '';
        const H = `[data-band="canvas"] [data-object="${heading}"]`;
        const g0 = await geom(page, H);
        // a move: to-canvas first, then the block's pos in whole units, within 450 ms
        await page.mouse.click(g0.cx, g0.cy);
        await page.mouse.down();
        await page.mouse.move(g0.cx - 50, g0.cy - 30, { steps: 5 });
        const t0 = Date.now();
        await page.mouse.up();
        await expect(code).toHaveText(
          /^turboslide block set lighthouse#\S+ \/pos '\{"x":-?\d+,"y":-?\d+,"w":\d+,"h":\d+\}'$/,
          {
            timeout: 450,
          },
        );
        expect(Date.now() - t0).toBeLessThanOrEqual(450);
        const line = (await code.innerText()).trim();
        const json = JSON.parse(line.slice(line.indexOf("'") + 1, line.lastIndexOf("'"))) as Record<
          string,
          number
        >;
        const g1 = await geom(page, H);
        const ux = (g1.cx - g1.sheetLeft) / g1.s - g1.w / g1.s / 2;
        const uy = (g1.cy - g1.sheetTop) / g1.s - g1.h / g1.s / 2;
        expect(Math.abs((json['x'] ?? 0) - ux)).toBeLessThanOrEqual(1);
        expect(Math.abs((json['y'] ?? 0) - uy)).toBeLessThanOrEqual(1);
        expect(Math.abs((json['w'] ?? 0) - g1.w / g1.s)).toBeLessThanOrEqual(1);
        expect(Math.abs((json['h'] ?? 0) - g1.h / g1.s)).toBeLessThanOrEqual(1);
        await expect(band.locator('[data-announce]')).toHaveText(line);
        // the first line was to-canvas: the announcements kept it in order
        // a turn by the keys: the rotate form after the burst ends
        await page.keyboard.press('Alt+ArrowRight');
        await page.keyboard.press('Alt+ArrowRight');
        await expect(code).toHaveText(/^turboslide block rotate lighthouse#\S+ --to 30$/, {
          timeout: 900,
        });
        // no line breaks inside a token
        const broken = await code.evaluate((el) => {
          const text = el.firstChild;
          if (text === null || text.nodeType !== 3) return ['no text node'];
          const words = (text.textContent ?? '').split(' ');
          const out: string[] = [];
          let at = 0;
          for (const w of words) {
            const r = document.createRange();
            r.setStart(text, at);
            r.setEnd(text, at + w.length);
            const lines = new Set([...r.getClientRects()].map((q) => Math.round(q.top)));
            if (lines.size > 1) out.push(w);
            at += w.length + 1;
          }
          return out;
        });
        expect(broken).toEqual([]);
      } finally {
        await context.close();
      }
    }
    // the first gesture of a visit prints to-canvas before its own line
    const { context, page } = await openHome(browser);
    try {
      const band = page.locator('[data-band="canvas"]');
      await bandReady(page, 'canvas');
      await page.evaluate(() => {
        const code = document.querySelector('[data-band="canvas"] [data-log]');
        const seen: string[] = [];
        (window as unknown as { __lines: string[] }).__lines = seen;
        if (code !== null)
          new MutationObserver(() => seen.push(code.textContent ?? '')).observe(code, {
            childList: true,
            characterData: true,
            subtree: true,
          });
      });
      const first = await band.locator('[data-object]').first().getAttribute('data-object');
      await page.locator(`[data-band="canvas"] [data-object="${first}"]`).focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(700);
      const lines = await page.evaluate(() => (window as unknown as { __lines: string[] }).__lines);
      expect(lines[0]).toBe('turboslide slide to-canvas lighthouse');
      expect(lines[1]).toMatch(/^turboslide block set lighthouse#\S+ \/pos /);
    } finally {
      await context.close();
    }
  });

  test(title('home.objects.keyboard'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      // Tab reaches every object of the frame's slide, the miniature's stage and the lighthouse,
      // in reading order (a band below the first screen once its chunk is in)
      await bandReady(page, 'canvas');
      if ((await page.locator('[data-band="menus"]').count()) > 0) await bandReady(page, 'menus');
      const want = await page
        .locator(
          '[data-band="hero"] [data-object]:not([tabindex="-1"]), [data-band="menus"] [data-mini-stage] [data-object]:not([tabindex="-1"]), [data-band="canvas"] [data-object]:not([tabindex="-1"])',
        )
        .evaluateAll((els) =>
          els
            .filter((e) => (e as HTMLElement).checkVisibility())
            .map((e) => (e as HTMLElement).dataset['object'] ?? ''),
        );
      expect(want.length).toBeGreaterThanOrEqual(5);
      const reached: string[] = [];
      await page.evaluate(() => window.scrollTo(0, 0));
      for (let i = 0; i < 200 && reached.length < want.length; i += 1) {
        await page.keyboard.press('Tab');
        const id = await page.evaluate(
          () => (document.activeElement as HTMLElement | null)?.dataset['object'] ?? null,
        );
        if (id !== null && !reached.includes(id)) reached.push(id);
      }
      expect(reached).toEqual(want);

      // arrows nudge 1 unit and 10 with Shift; nudges within 700 ms are one undo step
      const T = HERO_TITLE;
      const undo = page.locator('[data-undo="hero"]');
      await page.locator(T).focus();
      const g0 = await geom(page, T);
      expect(await undo.getAttribute('aria-disabled')).toBe('true');
      await page.keyboard.press('ArrowRight');
      let g = await geom(page, T);
      expect(Math.abs((g.cx - g0.cx) / g0.s - 1)).toBeLessThanOrEqual(0.05);
      await page.keyboard.press('Shift+ArrowDown');
      g = await geom(page, T);
      expect(Math.abs((g.cy - g0.cy) / g0.s - 10)).toBeLessThanOrEqual(0.05);
      await page.keyboard.press('ArrowLeft');
      await undo.click();
      await settledIn(page, T, 1200);
      g = await geom(page, T);
      expect(
        Math.abs(g.cx - g0.cx) + Math.abs(g.cy - g0.cy),
        'one Undo for the burst',
      ).toBeLessThanOrEqual(1);
      expect(await undo.getAttribute('aria-disabled'), 'nothing left to undo').toBe('true');

      // Option or Alt with Left or Right turns 15 degrees, with Shift 1 degree
      await page.locator(T).focus();
      await page.keyboard.press('Alt+ArrowRight');
      expect((await geom(page, T)).rot).toBe(15);
      await page.keyboard.press('Alt+Shift+ArrowLeft');
      expect((await geom(page, T)).rot).toBe(14);
      await page.waitForTimeout(800);

      // Enter edits, Escape returns focus to the object
      await page.keyboard.press('Enter');
      expect(
        await page.evaluate(
          (sel) =>
            document.querySelector<HTMLElement>(sel)?.isContentEditable ||
            document.querySelector(sel)?.querySelector('[contenteditable]') !== null,
          T,
        ),
      ).toBe(true);
      await page.keyboard.press('Escape');
      expect(
        await page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          return document.activeElement === el && !(el?.isContentEditable ?? true);
        }, T),
      ).toBe(true);

      // [, ] and S do nothing
      const before = await geom(page, T);
      const undoable = await undo.getAttribute('aria-disabled');
      for (const key of ['[', ']', 's', 'S']) await page.keyboard.press(key);
      const after = await geom(page, T);
      expect(after).toEqual(before);
      expect(await undo.getAttribute('aria-disabled')).toBe(undoable);
      expect(await page.locator('[data-show]:not([hidden])').count()).toBe(0);
    } finally {
      await context.close();
    }
  });
}
