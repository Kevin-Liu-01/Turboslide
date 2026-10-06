import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { loadavg } from 'node:os';

import { HISTORY, KITS as WORDS } from '../../../src/components/home/copy';
import { title } from '../lib';
import { bandReady, openHome } from './objects';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.8, 6.7, the second pass). V2's, push
// V2#12: the kits band. home.kits.restyle reads the three swatches on every slide root of the
// page (the hero frame, the miniature, the grid, every band, the show), the contrast of every
// visible text sampled every 40 ms through the clear, Globex's four colours and the ring's 3:1,
// GT's return and Undo, and the colours at rest; home.kits.color reads the typed background: the
// preview at the seventh key, Enter's one change, Escape, the contrast refusal and the invalid
// value. Every observation is through the page; /home writes no store.

export const ROWS: readonly string[] = ['home.kits.restyle', 'home.kits.color'];

const SELECT = 'rgb(47, 92, 224)';
const KITS = {
  kestrel: { paper: '#f3efe6', ink: '#1f1b16', ink2: '#4d463c', titanium: '#6e665a' },
  globex: { paper: '#0a1b38', ink: '#f4f1ea', ink2: '#c9cbd3', titanium: '#8d97ab' },
} as const;
const RESTYLE_BOUND_MS = 500;
const LOAD_LINE = 24;

function loadReading(): { load: number; read: boolean } {
  const load = Math.round((loadavg()[0] ?? 0) * 10) / 10;
  return { load, read: load < LOAD_LINE };
}

const band = (page: Page): Locator => page.locator('[data-band="kits"]');

/** The kit's six variables on every slide root of the page and its sheets. */
const kitVars = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-home-slides]')]
      .filter((root) => root.closest('[data-live-overlay]') === null)
      .map((root) => {
        const cs = getComputedStyle(root);
        const v = (n: string) => cs.getPropertyValue(n).trim().toLowerCase();
        return {
          where: `${root.closest('[data-band]')?.getAttribute('data-band') ?? '?'}:${root.dataset['instance'] ?? ''}`,
          paper: v('--paper'),
          ink: v('--ink'),
          ink2: v('--ink-2'),
          titanium: v('--titanium'),
          blue: v('--blue'),
          accent: v('--accent'),
        };
      }),
  );

/** The worst contrast of the text on every visible slide against its ground, and the veils up. */
const textContrast = (page: Page) =>
  page.evaluate(() => {
    const parse = (c: string): [number, number, number] => {
      if (c.startsWith('#')) {
        const n = Number.parseInt(c.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
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
      if (r.bottom < 0 || r.top > innerHeight || r.width < 120) continue;
      if (root.closest('[data-live-overlay]') !== null) continue;
      const ground = parse(getComputedStyle(root).getPropertyValue('--paper').trim());
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
      const seen = new Set<Element>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const el = node.parentElement;
        if (el === null || seen.has(el) || (node.textContent ?? '').trim() === '') continue;
        seen.add(el);
        if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        if (el.closest('[data-skipped]') !== null) continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.bottom < 0 || b.top > innerHeight) continue;
        read += 1;
        worst = Math.min(worst, ratio(parse(getComputedStyle(el).color), ground));
        if (opaque(b.left + b.width / 2, b.top + b.height / 2)) covered += 1;
      }
    }
    const veiled = document.querySelectorAll('[data-home-slides] canvas[data-live-overlay]').length;
    return { worst, covered, read, veiled };
  });

type Sample = Awaited<ReturnType<typeof textContrast>>;

async function sample(page: Page, act: () => Promise<void>, ms = 600): Promise<Sample[]> {
  const samples: Sample[] = [];
  await act();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    samples.push(await textContrast(page));
    await page.waitForTimeout(40);
  }
  return samples;
}

function expectReadable(samples: readonly Sample[], kit: string): void {
  for (const s of samples) {
    expect(s.read, `${kit}: text read`).toBeGreaterThan(0);
    expect(s.worst, `${kit}: text against its ground`).toBeGreaterThanOrEqual(4.5);
    expect(s.covered, `${kit}: no text under the old ground`).toBe(0);
  }
}

/** Every colour on /home with a hue (paper and ink are grey), and where it is painted. */
const hues = (page: Page) =>
  page.evaluate(() => {
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

const noteBound = (what: string, ms: number): void => {
  const { load, read } = loadReading();
  test.info().annotations.push({
    type: read ? 'reading' : 'not read: load',
    description: `${what}: ${ms} ms at load ${load}`,
  });
  if (read) expect(ms, what).toBeLessThanOrEqual(RESTYLE_BOUND_MS);
};

const newest = (page: Page): Promise<string> =>
  page.evaluate(
    () =>
      (
        window as unknown as { tsHomeStore: { get(): { history: { words: string }[] } } }
      ).tsHomeStore
        .get()
        .history.at(-1)?.words ?? '',
  );

export function rows(): void {
  test(title('home.kits.restyle'), async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await openHome(browser);
    try {
      // the bands above it in: the miniature and the canvas draw the kit too
      for (const b of ['menus', 'canvas', 'tailor']) await bandReady(page, b);
      await bandReady(page, 'kits');
      // at rest: the one colour outside paper and ink is Globex's swatch, besides the status
      // glyphs' hue (the hero's done glyph, docs/DESIGN.md 8.0 "Colour"; restated by DR-D4#4),
      // and no #2f5ce0
      const rest = await hues(page);
      const done = await page.evaluate(() => {
        const probe = document.createElement('i');
        probe.style.color = 'var(--pt-status-done)';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      expect(
        rest.filter((h) => !h.startsWith('rgb(10, 27, 56)') && !h.startsWith(`${done} `)),
      ).toEqual([]);
      expect(rest.join(' ')).not.toContain(SELECT);
      for (const kit of ['gt', 'kestrel', 'globex'] as const)
        await expect(band(page).locator(`[data-kit="${kit}"]`)).toHaveAttribute(
          'data-tip',
          WORDS.kits[kit].tip,
        );
      // the grid holds the nine slides, framed, in the deck's order
      const grid = band(page).locator('[data-kit-grid] [data-home-slides]');
      await expect(grid).toHaveCount(9);

      // Kestrel: within 500 ms on every slide root of the page, read in the page from the press
      // to the first frame every root holds the kit; every 40 ms no text under 4.5:1
      await page.evaluate((paper) => {
        const at = { press: 0, all: 0 };
        (window as unknown as { tsKitAt: typeof at }).tsKitAt = at;
        document.addEventListener('pointerdown', () => (at.press = performance.now()), {
          capture: true,
          once: true,
        });
        const tick = (): void => {
          const all = [...document.querySelectorAll<HTMLElement>('[data-home-slides]')].every(
            (el) => getComputedStyle(el).getPropertyValue('--paper').trim() === paper,
          );
          if (at.press > 0 && all) at.all = performance.now();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, KITS.kestrel.paper);
      const samples = await sample(page, async () => {
        await band(page).locator('[data-kit="kestrel"]').click();
      });
      expectReadable(samples, 'Kestrel');
      expect(
        samples.some((s) => s.veiled > 0),
        'a sample during the clear',
      ).toBe(true);
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll<HTMLElement>('[data-home-slides]')].every(
            (el) => getComputedStyle(el).getPropertyValue('--paper').trim() === '#f3efe6',
          ),
        undefined,
        { timeout: 3000 },
      );
      const at = await page.evaluate(
        () => (window as unknown as { tsKitAt: { press: number; all: number } }).tsKitAt,
      );
      expect(at.all, 'every root held the kit').toBeGreaterThan(0);
      noteBound('Kestrel on every slide', Math.round(at.all - at.press));
      for (const v of await kitVars(page))
        expect(v, v.where).toEqual({
          where: v.where,
          paper: KITS.kestrel.paper,
          ink: KITS.kestrel.ink,
          ink2: KITS.kestrel.ink2,
          titanium: KITS.kestrel.titanium,
          blue: KITS.kestrel.ink,
          accent: KITS.kestrel.ink,
        });
      const where = new Set((await kitVars(page)).map((v) => v.where.split(':')[0]));
      for (const b of ['hero', 'menus', 'canvas', 'tailor', 'kits'])
        expect(where.has(b), b).toBe(true);
      await expect(page.locator('main')).toHaveAttribute('data-page-kit', 'kestrel');
      await expect(band(page).locator('[data-kit-status]')).toHaveText(
        WORDS.status.kit('kestrel', 9),
      );
      expect(await newest(page)).toBe(HISTORY.kit('Kestrel'));

      // the show draws the kit (V3's show)
      await bandReady(page, 'present');
      const present = page.locator('[data-band="present"] [data-present]').first();
      await present.click();
      const shown = page.locator('[data-show-stage] [data-home-slides]').first();
      if (
        await shown.waitFor({ timeout: 3000 }).then(
          () => true,
          () => false,
        )
      ) {
        expect(
          await shown.evaluate((el) =>
            getComputedStyle(el).getPropertyValue('--paper').trim().toLowerCase(),
          ),
        ).toBe(KITS.kestrel.paper);
        await page.keyboard.press('Escape');
      } else
        test.info().annotations.push({
          type: 'not reached',
          description: 'the show draws the kit: Present opened no show on this tree',
        });

      // Globex: its four colours, the selection ring at 3:1 on its ground
      await bandReady(page, 'kits');
      expectReadable(
        await sample(page, async () => {
          await band(page).locator('[data-kit="globex"]').click();
        }),
        'Globex',
      );
      for (const v of await kitVars(page)) {
        expect(v.paper, v.where).toBe(KITS.globex.paper);
        expect(v.ink, v.where).toBe(KITS.globex.ink);
        expect(v.ink2, v.where).toBe(KITS.globex.ink2);
        expect(v.titanium, v.where).toBe(KITS.globex.titanium);
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
      await expect(band(page).locator('[data-kit-status]')).toHaveText(
        WORDS.status.kit('globex', 9),
      );
      expect(await band(page).locator('[data-kit="globex"]').getAttribute('aria-pressed')).toBe(
        'true',
      );

      // Undo takes Globex back to Kestrel; GT then removes every inline colour
      await band(page).locator('[data-undo="kits"]').click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.querySelector('[data-home-slides]') as HTMLElement)
              .getPropertyValue('--paper')
              .trim(),
          ),
        )
        .toBe(KITS.kestrel.paper);
      await band(page).locator('[data-kit="gt"]').click();
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
    } finally {
      await context.close();
    }
  });

  test(title('home.kits.color'), async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await openHome(browser);
    try {
      await bandReady(page, 'kits');
      const field = band(page).locator('[data-kit-color]');
      const status = band(page).locator('[data-kit-status]');
      const papers = () =>
        page.evaluate(() => [
          ...new Set(
            [...document.querySelectorAll<HTMLElement>('[data-home-slides]')]
              .filter((el) => el.closest('[data-live-overlay]') === null)
              .map((el) => getComputedStyle(el).getPropertyValue('--paper').trim().toLowerCase()),
          ),
        ]);
      const rows0 = await page.evaluate(
        () =>
          (
            window as unknown as { tsHomeStore: { get(): { history: unknown[] } } }
          ).tsHomeStore.get().history.length,
      );

      // the preview at the seventh key, on every slide, before any change is made
      await field.click();
      for (const [i, key] of [...'#e6e0d2'].entries()) {
        await page.keyboard.type(key);
        if (i < 6) expect(await papers(), `after key ${i + 1}`).not.toContain('#e6e0d2');
      }
      expect(await papers()).toEqual(['#e6e0d2']);
      expect(
        await page.evaluate(
          () =>
            (
              window as unknown as { tsHomeStore: { get(): { history: unknown[] } } }
            ).tsHomeStore.get().history.length,
        ),
      ).toBe(rows0);
      // Escape puts the kit's back
      await page.keyboard.press('Escape');
      expect(await papers()).not.toContain('#e6e0d2');
      await expect(status).toHaveText(WORDS.status.backgroundReset);

      // Enter commits one change with its row; the text takes the ink that reads higher
      await field.fill('');
      await field.type('#e6e0d2');
      await field.press('Enter');
      expect(await papers()).toEqual(['#e6e0d2']);
      await expect(status).toHaveText(WORDS.status.background('#e6e0d2'));
      expect(await newest(page)).toBe(HISTORY.background('#e6e0d2'));
      const worst = await textContrast(page);
      expect(worst.worst).toBeGreaterThanOrEqual(4.5);

      // a dark colour: the text turns to the light ink, every text at 4.5:1 or more
      await field.fill('#3d2b1f');
      await field.press('Enter');
      expect(await papers()).toEqual(['#3d2b1f']);
      expect((await textContrast(page)).worst).toBeGreaterThanOrEqual(4.5);

      // a colour whose best text reads under 4.5:1 is refused and changes nothing
      await field.fill('#777777');
      await field.press('Enter');
      expect(await papers()).toEqual(['#3d2b1f']);
      await expect(status).toHaveText(/^Text on #777777 reads at \d\.\d to 1\./);
      // an invalid value answers its sentence
      await field.fill('#12');
      await field.press('Enter');
      await expect(status).toHaveText(WORDS.status.invalid);

      // Undo, twice: the dark ground, then the light one; the kit's own ground is back
      await band(page).locator('[data-undo="kits"]').click();
      expect(await papers()).toEqual(['#e6e0d2']);
      await band(page).locator('[data-undo="kits"]').click();
      expect(await papers()).not.toContain('#e6e0d2');
    } finally {
      await context.close();
    }
  });
}
