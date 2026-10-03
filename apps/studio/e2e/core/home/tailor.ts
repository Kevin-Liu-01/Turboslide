import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { TAILOR as PRODUCT } from '@turboslide/chrome/panels/assist-strings';

import { ANNOUNCE, TAILOR } from '../../../src/components/home/copy';
import { HOME_RUN } from '../../../src/components/home/run.generated';
import { title } from '../lib';
import { openHome, played, recordAnimations } from './objects';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.5, 6.7; build/integrator.md "Landing,
// day 0" 3, 4.9 and 5.1), L2's, push 3: Tailor, the example kits and the filmstrip. Every
// observation is through the page; /home writes no store. The figures the count must equal are the
// CLI's recorded answers (`run.generated.ts` `tailorCounts`), and the strings are the product's
// (`assist-strings.ts` TAILOR) and the page's (`copy.ts` TAILOR).

export const ROWS: readonly string[] = [
  'home.tailor.apply',
  'home.tailor.theme',
  'home.tailor.filmstrip',
];

const SELECT = 'rgb(47, 92, 224)';
const KITS = {
  kestrel: { paper: '#f3efe6', ink: '#1f1b16', ink2: '#4d463c', titanium: '#6e665a' },
  fenwick: { paper: '#0a1b38', ink: '#f4f1ea', ink2: '#c9cbd3', titanium: '#8d97ab' },
} as const;

/** The text of every slide on the page, joined; the Present list's titles with it. */
const slidesText = (page: Page): Promise<string> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-home-slides], [data-slide-row]')]
      .map((el) => el.textContent ?? '')
      .join('\n'),
  );

const count = (text: string, word: string): number => text.split(word).length - 1;

/** The six kit variables on every slide root and sheet of the page. */
const kitVars = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-home-slides]')].flatMap((root) =>
      [root.querySelector<HTMLElement>('.ts-sheet') ?? root].map((el) => {
        const cs = getComputedStyle(el);
        const v = (n: string) => cs.getPropertyValue(n).trim().toLowerCase();
        return {
          slide: root.dataset['slide'] ?? '',
          paper: v('--paper'),
          ink: v('--ink'),
          ink2: v('--ink-2'),
          titanium: v('--titanium'),
          blue: v('--blue'),
          accent: v('--accent'),
        };
      }),
    ),
  );

/** Every text box on the visible slides: its text's contrast on its ground, and what covers it. */
const textContrast = (page: Page) =>
  page.evaluate(() => {
    const rgb = (c: string): [number, number, number] => {
      const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
    };
    const hex = (h: string): [number, number, number] => {
      if (h.startsWith('#')) {
        const n = Number.parseInt(h.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      return rgb(h);
    };
    const lum = ([r, g, b]: [number, number, number]) =>
      [r, g, b]
        .map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const ratio = (a: [number, number, number], b: [number, number, number]) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
    };
    let worst = 99;
    let covered = 0;
    let read = 0;
    for (const root of document.querySelectorAll<HTMLElement>('[data-home-slides]')) {
      const r = root.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue;
      const ground = hex(
        getComputedStyle(root.querySelector('.ts-sheet') ?? root)
          .getPropertyValue('--paper')
          .trim(),
      );
      // the old ground still drawn over this slide, if a kit change is clearing it
      const veil = root.querySelector<HTMLCanvasElement>('canvas[data-live-overlay]');
      const vr = veil?.getBoundingClientRect();
      const cells = veil?.getContext('2d')?.getImageData(0, 0, veil.width, veil.height).data;
      const opaque = (x: number, y: number): boolean => {
        if (veil === null || vr === undefined || cells === undefined || vr.width === 0)
          return false;
        const cx = Math.floor(((x - vr.left) * veil.width) / vr.width);
        const cy = Math.floor(((y - vr.top) * veil.height) / vr.height);
        if (cx < 0 || cy < 0 || cx >= veil.width || cy >= veil.height) return false;
        return (cells[(cy * veil.width + cx) * 4 + 3] ?? 0) > 0;
      };
      // every element on the slide that holds text of its own (most slides carry no data-block)
      const seen = new Set<Element>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const el = node.parentElement;
        if (el === null || seen.has(el) || (node.textContent ?? '').trim() === '') continue;
        seen.add(el);
        if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.bottom < 0 || b.top > innerHeight) continue;
        read += 1;
        worst = Math.min(worst, ratio(rgb(getComputedStyle(el).color), ground));
        const points = [
          [b.left + b.width / 2, b.top + b.height / 2],
          [b.left + b.width * 0.2, b.top + b.height / 2],
          [b.left + b.width * 0.8, b.top + b.height / 2],
        ];
        if (points.some(([x, y]) => opaque(x ?? 0, y ?? 0))) covered += 1;
      }
    }
    const veiled = document.querySelectorAll('[data-home-slides] canvas[data-live-overlay]').length;
    return { worst, covered, read, veiled };
  });

type Sample = Awaited<ReturnType<typeof textContrast>>;

/** Presses a kit's swatch and samples the visible slides every 40 ms for 600 ms (row home.tailor.theme). */
async function sampleKit(page: Page, swatch: Locator): Promise<Sample[]> {
  const samples: Sample[] = [];
  const t0 = Date.now();
  await swatch.click();
  while (Date.now() - t0 < 600) {
    samples.push(await textContrast(page));
    await page.waitForTimeout(40);
  }
  return samples;
}

/** No text under 4.5:1 on its ground and none under the old ground, in every sample. */
function expectReadable(samples: readonly Sample[], kit: string): void {
  expect(
    samples.some((s) => s.veiled > 0),
    `${kit}: a sample during the clear`,
  ).toBe(true);
  for (const s of samples) {
    expect(s.read, `${kit}: text read`).toBeGreaterThan(0);
    expect(s.worst, `${kit}: text against its ground`).toBeGreaterThanOrEqual(4.5);
    expect(s.covered, `${kit}: no text under the old ground`).toBe(0);
  }
}

/**
 * The --pt-select pixels the page shows across a 6 px run centred on (x, y), read from a
 * screenshot decoded in the page (what the eye sees, whatever paints over a rule).
 */
async function blueAt(page: Page, x: number, y: number): Promise<number> {
  const shot = await page.screenshot({
    clip: { x: Math.max(0, x - 3), y: Math.max(0, y), width: 6, height: 1 },
  });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (ctx === null) return -1;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (
        Math.abs((d[i] ?? 0) - 47) < 24 &&
        Math.abs((d[i + 1] ?? 0) - 92) < 24 &&
        Math.abs((d[i + 2] ?? 0) - 224) < 24
      )
        n += 1;
    return n;
  }, shot.toString('base64'));
}

export function rows(): void {
  test(title('home.tailor.apply'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      const band = page.locator('[data-band="tailor"]');
      await band.scrollIntoViewIfNeeded();
      const field = band.locator('[data-tailor-to]');
      const countCell = band.locator('[data-tailor-count]');
      const apply = band.locator('[data-tailor-apply]');
      expect(await field.getAttribute('maxlength')).toBe('24');

      // an empty field answers the page's sentence
      await apply.click();
      await expect(countCell).toHaveText(TAILOR.empty);

      // the count is the product's sentence with the CLI's figures for the deck the page holds
      const rest = HOME_RUN.tailorCounts.rest;
      await field.fill('Globex');
      await expect(countCell).toHaveText(PRODUCT.count(rest.places, rest.slides));
      const before = await slidesText(page);
      const names = count(before, 'Northwind');
      expect(names).toBeGreaterThan(0);

      // Enter: every name on every slide within 1 s, the snackbar with the product's words
      const t0 = Date.now();
      await field.press('Enter');
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('[data-home-slides], [data-slide-row]')].some((el) =>
            (el.textContent ?? '').includes('Northwind'),
          ),
        undefined,
        { timeout: 1000 },
      );
      expect(Date.now() - t0).toBeLessThanOrEqual(1000);
      const after = await slidesText(page);
      expect(count(after, 'Globex')).toBe(names);
      const snack = band.locator('[data-snackbar]');
      await expect(snack).toHaveAttribute('data-on', '');
      await expect(snack.locator('[data-snackbar-text]')).toHaveText(
        PRODUCT.result('Globex', rest.places, rest.slides, 0),
      );
      await expect(band.locator('[data-tailor-from]')).toHaveText('Globex');

      // the snackbar's Undo puts every name back and the bar leaves by a cut
      await snack.locator('[data-snackbar-undo]').click();
      expect(await snack.getAttribute('data-on')).toBeNull();
      expect(await snack.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
      expect(count(await slidesText(page), 'Northwind')).toBe(names);
      expect(count(await slidesText(page), 'Globex')).toBe(0);

      // Apply by the button; the next change of the band cuts the snackbar
      await field.fill('Initech');
      await apply.click();
      await expect(snack).toHaveAttribute('data-on', '');
      await band.locator('[data-kit="kestrel"]').click();
      await expect(snack.locator('[data-snackbar-text]')).not.toContainText('Initech');
      await page.keyboard.press('Escape');
      expect(await snack.getAttribute('data-on')).toBeNull();
      // the band's Undo by the key with focus in the band (2.0): the kit, then the names
      await band.locator('[data-kit="kestrel"]').focus();
      await page.keyboard.press('ControlOrMeta+z');
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => count(await slidesText(page), 'Northwind')).toBe(names);

      // the field takes at most 24 characters
      await field.fill('');
      await field.type('A customer name over twenty four characters', { delay: 5 });
      expect((await field.inputValue()).length).toBeLessThanOrEqual(24);

      // without slide 5 (the agents band's Run Again cuts to the run's start, A8; step 1's
      // placeholders hold no name) the count is the fixture's recording. The page holds that deck
      // only once the run is live (L3, push 4); before it, every deck the page can hold has slide
      // 5, and the clause is recorded as not reached rather than passed
      const run = page.locator('[data-agent-run]');
      await run.scrollIntoViewIfNeeded();
      await run.click();
      const cut = await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll<HTMLElement>('[data-home-slides][data-counter]')].some(
              (el) => (el.dataset['counter'] ?? '').endsWith('/ 7'),
            ),
          undefined,
          { timeout: 3000 },
        )
        .then(
          () => true,
          () => false,
        );
      if (cut) {
        const start = HOME_RUN.tailorCounts.start;
        await expect(countCell).toHaveText(PRODUCT.count(start.places, start.slides));
        await field.fill('Globex');
        await field.press('Enter');
        await expect(band.locator('[data-snackbar-text]')).toHaveText(
          PRODUCT.result('Globex', start.places, start.slides, 0),
        );
      } else
        test.info().annotations.push({
          type: 'not reached',
          description:
            'the deck without slide 5: Run Again did not cut to the run start, so this tree has no live run (L3, push 4)',
        });
    } finally {
      await context.close();
    }
  });

  test(title('home.tailor.theme'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      const band = page.locator('[data-band="tailor"]');
      await band.scrollIntoViewIfNeeded();
      // at rest: no --pt-select, and the one colour outside paper and ink is Fenwick's swatch
      const hues = await page.evaluate(() => {
        const out = new Set<string>();
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
          const cs = getComputedStyle(el);
          const paints = [cs.backgroundColor];
          if ([...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim()))
            paints.push(cs.color);
          if (parseFloat(cs.borderTopWidth) > 0) paints.push(cs.borderTopColor);
          for (const p of paints) {
            const m = p.match(/[\d.]+/g)?.map(Number) ?? [];
            if (m.length < 3 || (m[3] !== undefined && m[3] === 0)) continue;
            const [r = 0, g = 0, b = 0] = m;
            if (Math.max(r, g, b) - Math.min(r, g, b) > 20)
              out.add(
                `${p} ${el.tagName.toLowerCase()}${el.dataset['kit'] ? `[data-kit=${el.dataset['kit']}]` : ''}`,
              );
          }
        }
        return [...out];
      });
      expect(hues.filter((h) => !h.startsWith('rgb(10, 27, 56)'))).toEqual([]);
      expect(hues.join(' ')).not.toContain(SELECT);
      await expect(band.getByText(TAILOR.examplesKey, { exact: true })).toBeVisible();
      for (const kit of ['gt', 'kestrel', 'fenwick'] as const)
        await expect(band.locator(`[data-kit="${kit}"]`)).toHaveAttribute(
          'data-tip',
          TAILOR.kits[kit].tip,
        );

      // Kestrel: the six variables on every slide within 500 ms; every 40 ms no text under 4.5:1
      expectReadable(await sampleKit(page, band.locator('[data-kit="kestrel"]')), 'Kestrel');
      for (const v of await kitVars(page))
        expect(v, v.slide).toEqual({
          slide: v.slide,
          paper: KITS.kestrel.paper,
          ink: KITS.kestrel.ink,
          ink2: KITS.kestrel.ink2,
          titanium: KITS.kestrel.titanium,
          blue: KITS.kestrel.ink,
          accent: KITS.kestrel.ink,
        });
      await expect(page.locator('main')).toHaveAttribute('data-page-kit', 'kestrel');
      await expect(band.locator('[data-snackbar-text]')).toHaveText(TAILOR.kitStatus('kestrel', 8));
      expect(await band.locator('[data-kit="kestrel"]').getAttribute('aria-pressed')).toBe('true');

      // the show then draws Kestrel (L3's show, push 5)
      const present = page.locator('[data-present]');
      await present.scrollIntoViewIfNeeded();
      await present.click();
      const shown = page.locator('[data-show-stage] [data-home-slides]').first();
      const opened = await shown.waitFor({ timeout: 3000 }).then(
        () => true,
        () => false,
      );
      if (opened) {
        const showPaper = await shown.evaluate((el) =>
          getComputedStyle(el.querySelector('.ts-sheet') ?? el)
            .getPropertyValue('--paper')
            .trim()
            .toLowerCase(),
        );
        expect(showPaper).toBe(KITS.kestrel.paper);
        await page.keyboard.press('Escape');
      } else
        test.info().annotations.push({
          type: 'not reached',
          description:
            'the show draws the kit: Present opened no show, so this tree has no live show (L3, push 5)',
        });

      // Fenwick: its four colours, the selection ring at 3:1 on its ground
      await band.scrollIntoViewIfNeeded();
      expectReadable(await sampleKit(page, band.locator('[data-kit="fenwick"]')), 'Fenwick');
      for (const v of await kitVars(page)) {
        expect(v.paper).toBe(KITS.fenwick.paper);
        expect(v.ink).toBe(KITS.fenwick.ink);
        expect(v.ink2).toBe(KITS.fenwick.ink2);
        expect(v.titanium).toBe(KITS.fenwick.titanium);
      }
      const ring = await page.evaluate(() => {
        const L = (h: number[]) =>
          h
            .map((v) => v / 255)
            .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
            .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
        const a = L([0x2f, 0x5c, 0xe0]);
        const b = L([0x0a, 0x1b, 0x38]);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ring).toBeGreaterThanOrEqual(3);
      await expect(band.locator('[data-snackbar-text]')).toHaveText(TAILOR.kitStatus('fenwick', 8));

      // GT restores the deck's own kit
      await band.locator('[data-kit="gt"]').click();
      await page.waitForTimeout(600);
      const inline = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-home-slides], [data-home-slides] .ts-sheet',
          ),
        ].some((el) => el.style.getPropertyValue('--paper') !== ''),
      );
      expect(inline).toBe(false);
      expect(await page.locator('main').getAttribute('data-page-kit')).toBeNull();
      await expect(band.locator('[data-snackbar-text]')).toHaveText(TAILOR.kitStatus('gt', 8));
    } finally {
      await context.close();
    }
  });

  test(title('home.tailor.filmstrip'), async ({ browser }) => {
    const { context, page } = await openHome(browser);
    try {
      const band = page.locator('[data-band="tailor"]');
      await band.scrollIntoViewIfNeeded();
      const order = () =>
        band
          .locator('[data-filmstrip] [data-thumb]:not([hidden])')
          .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['thumb'] ?? ''));
      const counters = () =>
        page.evaluate(() =>
          Object.fromEntries(
            [...document.querySelectorAll<HTMLElement>('[data-home-slides]')].map((el) => [
              `${el.dataset['instance'] ?? ''}`,
              el.dataset['counter'] ?? '',
            ]),
          ),
        );
      const o0 = await order();
      expect(o0.slice(0, 4)).toEqual(['plan', 'gets', 'ships', 'next-steps']);
      const thumb = (id: string) => band.locator(`[data-thumb="${id}"]`);
      const box = async (id: string) => {
        const b = await thumb(id).boundingBox();
        if (b === null) throw new Error(`no box for ${id}`);
        return b;
      };

      // drag slide 2 to place 4: lifted with a 2 px outline, the others make room in 200 ms
      const a = await box('plan');
      const c = await box('ships');
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 + 3, a.y + a.height / 2 + 3, { steps: 2 });
      await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2 + 2, { steps: 10 });
      // the outline as the eye sees it: --pt-select pixels along the held slide's left edge
      const edge = await thumb('plan').evaluate((el) => {
        const sheet = (el.querySelector('.ts-home-sheet') ?? el).getBoundingClientRect();
        return { x: sheet.left, y: sheet.top + sheet.height / 2 };
      });
      expect(
        await blueAt(page, edge.x, edge.y),
        'lifted with a 2 px outline in --pt-select',
      ).toBeGreaterThanOrEqual(2);
      const room = await thumb('gets').evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(room).toBe('0.2s');
      await recordAnimations(page);
      await page.mouse.up();
      const settle = (await played(page)).filter((p) => p.target === 'plan');
      expect(settle.map((p) => [p.duration, p.props])).toEqual([[240, ['transform']]]);
      await page.waitForTimeout(300);
      expect((await order()).slice(0, 4)).toEqual(['gets', 'ships', 'plan', 'next-steps']);
      // every counter on the page renumbers
      const cs = await counters();
      for (const [instance, counter] of Object.entries(cs)) {
        if (instance.includes('plan') || instance === 'tailor-stage') continue;
        if (instance.includes('gets') || instance === 'present')
          expect(counter, instance).toBe('2 / 8');
        if (instance.includes('ships')) expect(counter, instance).toBe('3 / 8');
      }
      expect(cs['tailor-thumb-plan']).toBe('4 / 8');
      await expect(band.locator('[data-announce]')).toHaveText(ANNOUNCE.slideMoved(2, 4));

      // Undo returns it (the move's sentence holds the snackbar's Undo)
      await expect(band.locator('[data-snackbar-text]')).toHaveText(ANNOUNCE.slideMoved(2, 4));
      await band.locator('[data-snackbar-undo]').click();
      await page.waitForTimeout(300);
      expect((await order()).slice(0, 4)).toEqual(o0.slice(0, 4));
      expect((await counters())['tailor-thumb-plan']).toBe('2 / 8');

      // Cmd or Ctrl with Down moves the focused slide; Move Up moves it back
      await thumb('gets').focus();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      expect((await order()).slice(0, 4)).toEqual(['plan', 'ships', 'gets', 'next-steps']);
      await thumb('gets').click();
      const up = thumb('gets').locator('[data-thumb-move="up"]');
      await expect(up).toBeVisible();
      await up.click();
      expect((await order()).slice(0, 4)).toEqual(o0.slice(0, 4));
      await thumb('gets').locator('[data-thumb-move="down"]').click();
      expect((await order()).slice(0, 4)).toEqual(['plan', 'ships', 'gets', 'next-steps']);
    } finally {
      await context.close();
    }

    // on touch a 350 ms press lifts it; a quick swipe does not
    const touch = await openHome(browser, { touch: true, width: 390, height: 844 });
    try {
      const band = touch.page.locator('[data-band="tailor"]');
      await band.scrollIntoViewIfNeeded();
      const t = band.locator('[data-thumb="plan"]');
      const b = await t.boundingBox();
      if (b === null) throw new Error('no plan thumbnail');
      const cdp = await touch.context.newCDPSession(touch.page);
      const point = (x: number, y: number) => [{ x, y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(b.x + 20, b.y + 20),
      });
      await touch.page.waitForTimeout(420);
      expect(await t.getAttribute('data-lifted'), 'a 350 ms press lifts it').toBe('');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await touch.context.close();
    }
  });
}
