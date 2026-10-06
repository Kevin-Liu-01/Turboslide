import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { contrastRatio, composite, parseColor, toHex } from '@turboslide/theme/contrast';
import type { Rgba } from '@turboslide/theme/contrast';
import { PAIRS } from '@turboslide/theme/palette';
import type { PairGround } from '@turboslide/theme/palette';

import {
  Scratch,
  extraHTTPHeaders,
  headingRun,
  newDeck,
  settled,
  teardownAll,
  title,
  typeInto,
  waitEditor,
} from './lib';
import { isCoreId } from './matrix';

// Lane D1's rows of the design round in core/chrome.spec.ts (docs/DESIGN.md 10.1, 11): the
// chrome's colour pairs at their WCAG 2.2 floors, one font request of the Latin subset, and the
// subsets loaded on demand. The spec file calls `chromeFoundation()` once and spreads its ids into
// its coverage list, the shape of chrome-round1.ts; a row registers once its id is in the matrix.
// Each test opens its own context; the decks it makes are torn down through the product.

type Person = { context: BrowserContext; page: Page; scratch: Scratch };
const people: Person[] = [];

async function contextAt(
  browser: Browser,
  width: number,
  height: number,
  appearance?: 'light' | 'dark',
): Promise<Person> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height },
    ...(appearance ? { colorScheme: appearance } : {}),
  });
  if (appearance)
    await context.addInitScript((value) => {
      try {
        localStorage.setItem('gt-theme', value);
      } catch {
        /* a storage that refuses keeps the system's appearance */
      }
    }, appearance);
  const page = await context.newPage();
  const person = { context, page, scratch: new Scratch() };
  people.push(person);
  return person;
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** A ground of PAIRS as the page computes it: a token, or a token over another. */
function groundOf(ground: PairGround, values: Record<string, string>): Rgba {
  const top = parseColor(values[ground.token] ?? '');
  if (!top) throw new Error(`${ground.token} computes no colour (${values[ground.token]})`);
  const under = ground.over ? parseColor(values[ground.over] ?? '') : WHITE;
  if (!under) throw new Error(`${ground.over} computes no colour`);
  return top.a < 1 ? composite(top, under.a < 1 ? composite(under, WHITE) : under) : top;
}

/** The custom properties the pairs read, computed on the root of a page. */
async function computedTokens(
  page: Page,
  names: readonly string[],
): Promise<Record<string, string>> {
  return page.evaluate((list) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(list.map((name) => [name, style.getPropertyValue(name).trim()]));
  }, names);
}

/** The menu key text of a hovered row of File, composited over the row's ground and the plate's. */
async function hoveredMenuKey(page: Page) {
  await page.locator('[data-control="menubar.file"]').first().click();
  await page.locator('#ts-menu-file').waitFor({ timeout: 8000 });
  const row = page
    .locator('#ts-menu-file .ts-menu-item:not(.is-disabled):has(.ts-menu-key)')
    .first();
  await row.hover();
  await page.waitForTimeout(300);
  const facts = await row.evaluate((el) => {
    const key = el.querySelector('.ts-menu-key');
    const plate = el.closest('.ts-menu') ?? el.parentElement;
    return {
      key: key ? getComputedStyle(key).color : '',
      row: getComputedStyle(el).backgroundColor,
      plate: plate ? getComputedStyle(plate).backgroundColor : '',
      text: key?.textContent ?? '',
    };
  });
  await page.keyboard.press('Escape');
  return facts;
}

type DrawnChip = { where: string; text: string; color: string; grounds: string[] };

/**
 * The key chips as drawn, each with its text colour and the backgrounds from the chip up to the
 * first opaque one (DR-V1.5 finding 7: the search card's chips read 4.27:1 in light and the
 * pairs of PAIRS never named them): the tooltip's key on Undo, every chip of the search card and
 * the toolbar search pill's chip where the pill draws it.
 */
async function drawnKeyChips(page: Page): Promise<DrawnChip[]> {
  const read = (where: string, selector: string) =>
    page.$$eval(
      selector,
      (els, place) =>
        els
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const grounds: string[] = [];
            for (let node: Element | null = el; node; node = node.parentElement) {
              const bg = getComputedStyle(node).backgroundColor;
              if (/^rgba\(.*,\s*0\)$/.test(bg) || bg === 'transparent') continue;
              grounds.push(bg);
              if (!/^rgba/.test(bg)) break;
            }
            return {
              where: place,
              text: (el.textContent ?? '').trim(),
              color: getComputedStyle(el).color,
              grounds,
            };
          }),
      where,
    );
  const chips: DrawnChip[] = [];
  await page.mouse.move(720, 640);
  await page.locator('[data-control="toolbar.undo"]').first().hover();
  await page.locator('.pt-tip:not([hidden]) .pt-tip-key').first().waitFor({ timeout: 8000 });
  chips.push(...(await read('the tooltip', '.pt-tip:not([hidden]) .pt-tip-key')));
  chips.push(...(await read('the toolbar search pill', '.pt-search-kbd')));
  await page.mouse.move(720, 640);
  await page.locator('[data-control="toolbar.search"]').first().click();
  await page.locator('.pt-search-card').waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  chips.push(...(await read('the search card', '.pt-search kbd')));
  await page.keyboard.press('Escape');
  await page.locator('.pt-search-card').waitFor({ state: 'hidden', timeout: 8000 });
  return chips;
}

/** A drawn chip's ground: its backgrounds composited from the opaque one (or white) up. */
function chipGround(grounds: readonly string[]): Rgba {
  let ground = WHITE;
  for (const css of [...grounds].reverse()) {
    const layer = parseColor(css);
    if (!layer) continue;
    ground = layer.a < 1 ? composite(layer, ground) : layer;
  }
  return ground;
}

export function chromeFoundation(): string[] {
  const declared: string[] = [];
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (!isCoreId(id)) return;
    declared.push(id);
    test(title(id), body);
  };
  test.afterAll(async () => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    for (const person of people.splice(0)) {
      try {
        if (person.scratch.ids.size > 0) await teardownAll(person.page, person.scratch);
      } catch (error) {
        failures.push(
          error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error),
        );
      } finally {
        await person.context.close().catch(() => undefined);
      }
    }
    expect(failures, 'every deck of the D1 rows is torn down').toEqual([]);
  });

  /* DESIGN.md 5.3: every text pair of the generated table at 4.5:1, the boundaries, glyphs and
     the scrollbar thumb at 3:1, read from the computed tokens of /new in both appearances, and the
     pairs read from the drawn elements: a menu key on a hovered row (research-type 3.1) and every
     key chip of the tooltip, the search card and the toolbar search pill (DR-V1.5 finding 7) */
  row('chrome.colors.pairs-at-floor', async ({ browser }) => {
    test.setTimeout(240_000);
    const names = [
      ...new Set(
        PAIRS.flatMap((pair) => [pair.text, pair.ground.token, pair.ground.over ?? pair.text]),
      ),
    ];
    const readings: string[] = [];
    for (const appearance of ['light', 'dark'] as const) {
      const { page } = await contextAt(browser, 1440, 900, appearance);
      await page.goto('/new');
      await waitEditor(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);
      const values = await computedTokens(page, names);
      for (const pair of PAIRS.filter((each) => each.floor > 0)) {
        const ground = groundOf(pair.ground, values);
        const text = parseColor(values[pair.text] ?? '');
        expect(text, `${appearance} ${pair.text} computes a colour`).not.toBeNull();
        const drawn = (text as Rgba).a < 1 ? composite(text as Rgba, ground) : (text as Rgba);
        const ratio = contrastRatio(drawn, ground);
        readings.push(
          `${appearance} ${pair.name}: ${toHex(drawn)} on ${toHex(ground)} ${ratio.toFixed(2)}`,
        );
        expect(ratio, `${appearance} ${pair.name}`).toBeGreaterThanOrEqual(pair.floor);
      }
      const menu = await hoveredMenuKey(page);
      const plate = parseColor(menu.plate) ?? WHITE;
      const rowGround = parseColor(menu.row);
      const ground =
        rowGround && rowGround.a > 0
          ? composite(rowGround, plate.a < 1 ? composite(plate, WHITE) : plate)
          : plate;
      const key = parseColor(menu.key);
      expect(key, `${appearance} the menu key computes a colour`).not.toBeNull();
      const drawn = (key as Rgba).a < 1 ? composite(key as Rgba, ground) : (key as Rgba);
      const ratio = contrastRatio(drawn, ground);
      readings.push(
        `${appearance} the drawn menu key "${menu.text}" on a hovered row: ${toHex(drawn)} on ${toHex(ground)} ${ratio.toFixed(2)}`,
      );
      expect(ratio, `${appearance} a menu key on a hovered row`).toBeGreaterThanOrEqual(4.5);
      /* the key chips as drawn: text on --pt-hair-soft over the plate (DR-V1.5 finding 7) */
      const chips = await drawnKeyChips(page);
      expect(
        chips.filter((chip) => chip.where === 'the search card').length,
        `${appearance} the search card draws its key chips`,
      ).toBeGreaterThan(0);
      expect(
        chips.filter((chip) => chip.where === 'the tooltip').length,
        `${appearance} the tooltip draws its key chip`,
      ).toBe(1);
      const lowest = new Map<string, { text: string; drawn: Rgba; ground: Rgba; ratio: number }>();
      const counts = new Map<string, number>();
      for (const chip of chips) {
        const chipColor = parseColor(chip.color);
        expect(
          chipColor,
          `${appearance} ${chip.where} "${chip.text}" computes a colour`,
        ).not.toBeNull();
        const ground = chipGround(chip.grounds);
        const drawnChip =
          (chipColor as Rgba).a < 1 ? composite(chipColor as Rgba, ground) : (chipColor as Rgba);
        const chipRatio = contrastRatio(drawnChip, ground);
        counts.set(chip.where, (counts.get(chip.where) ?? 0) + 1);
        const seen = lowest.get(chip.where);
        if (!seen || chipRatio < seen.ratio)
          lowest.set(chip.where, { text: chip.text, drawn: drawnChip, ground, ratio: chipRatio });
        expect(
          chipRatio,
          `${appearance} ${chip.where}'s key chip "${chip.text}"`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const [where, low] of lowest)
        readings.push(
          `${appearance} ${where}'s key chips (${counts.get(where)}), the lowest "${low.text}": ${toHex(low.drawn)} on ${toHex(low.ground)} ${low.ratio.toFixed(2)}`,
        );
    }
    test.info().annotations.push({ type: 'pairs', description: readings.join('; ') });
  });

  /* DESIGN.md 4.4: cold, one font request on /home, /decks and /new, the Latin subset of the
     original Inter at most 120,000 B; no GT Inter and no Berkeley Mono anywhere */
  row('chrome.font.one-subset', async ({ browser }) => {
    test.setTimeout(300_000);
    const facts: string[] = [];
    for (const path of ['/home', '/decks', '/new']) {
      const { page } = await contextAt(browser, 1440, 900);
      await page.goto(path);
      if (path === '/new') await waitEditor(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(2000);
      /* the font files the page fetched, read from Resource Timing as home.budget.shared reads
         them: one entry per fetch, a preload the face then used counted once (a dev server also
         imports each face's URL as a module, `?import&url`, which is script) */
      const fonts = await page.evaluate(() =>
        (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .filter((r) => /\.(woff2?|ttf|otf)(\?|$)/.test(r.name) && !/[?&]import\b/.test(r.name))
          .map((r) => ({ url: r.name, bytes: r.encodedBodySize || r.decodedBodySize })),
      );
      const families = await page.evaluate(() =>
        [...document.fonts].map((face) => `${face.family} ${face.style} ${face.status}`),
      );
      const interLoaded = await page.evaluate(() =>
        document.fonts.check('16px Inter', 'Turboslide'),
      );
      facts.push(
        `${path}: ${fonts.map((f) => `${f.url.split('/').pop()} ${f.bytes} B`).join(', ') || 'none'}; ${families.length} faces`,
      );
      expect(fonts, `${path}: one font request`).toHaveLength(1);
      /* the file as the dev server names it, or with the build's eight character hash */
      expect(fonts[0]?.url, `${path}: the Latin subset`).toMatch(
        /\/InterVariable-latin(?:-[\w-]{8})?\.woff2(?:\?|$)/,
      );
      expect(fonts[0]?.bytes ?? 0, `${path}: at most 120,000 B`).toBeLessThanOrEqual(120_000);
      expect(fonts[0]?.bytes ?? 0).toBeGreaterThan(0);
      for (const name of [...fonts.map((f) => f.url), ...families])
        expect(name, `${path}: no GT Inter and no Berkeley`).not.toMatch(/GT Inter|Berkeley/i);
      expect(interLoaded, `${path}: Inter is loaded`).toBe(true);
    }
    test.info().annotations.push({ type: 'fonts', description: facts.join('; ') });
  });

  /* DESIGN.md 4.4: a script outside Latin loads its subset when its text is drawn; the italic
     face loads when an italic run is drawn (the Latin italic is prefetched on /edit, so the
     reading is the face's status in document.fonts and that no other italic file is requested) */
  row('chrome.font.on-demand', async ({ browser }) => {
    test.setTimeout(300_000);
    const person = await contextAt(browser, 1440, 900);
    const { page, scratch } = person;
    const requested: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/InterVariable[^/]*\.woff2/.test(url)) requested.push(url.split('/').pop() ?? url);
    });
    await newDeck(page, scratch, 'Fonts on demand');
    await settled(page);
    const italicLoaded = () =>
      page.evaluate(() =>
        [...document.fonts].some(
          (face) =>
            face.family.replace(/["']/g, '') === 'Inter' &&
            face.style === 'italic' &&
            face.status === 'loaded',
        ),
      );
    expect(await italicLoaded(), 'no italic face is loaded before an italic run is drawn').toBe(
      false,
    );
    expect(
      requested.filter(
        (name) => /Italic/.test(name) && !/Italic-latin(?:-[\w-]{8})?\.woff2/.test(name),
      ),
      'no italic file but the prefetched Latin one',
    ).toEqual([]);
    const before = requested.length;
    const run = await headingRun(page);
    const started = Date.now();
    await typeInto(page, run, 'Привет, мир');
    await expect
      .poll(() => requested.slice(before).some((name) => /cyrillic/.test(name)), {
        timeout: 10_000,
      })
      .toBe(true);
    const cyrillicMs = Date.now() - started;
    await expect
      .poll(() => page.evaluate(() => document.fonts.check('500 44px Inter', 'Привет')), {
        timeout: 10_000,
      })
      .toBe(true);
    /* an italic run: the title made italic with Cmd+I, as fonts.inter.italic-release draws it */
    const heading = page
      .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
      .first();
    await heading.dblclick();
    await page.waitForTimeout(200);
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+i');
    await expect.poll(italicLoaded, { timeout: 10_000 }).toBe(true);
    await page.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'fonts',
      description: `requested ${requested.join(', ')}; the Cyrillic subset ${cyrillicMs} ms after the typing began`,
    });
  });

  return declared;
}
