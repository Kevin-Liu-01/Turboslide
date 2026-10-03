import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, request, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  ctl,
  extraHTTPHeaders,
  headingRun,
  invoke,
  menuPath,
  newDeck,
  openEditor,
  placeBlock,
  selectBlock,
  settled,
  state,
  teardownAll,
  title,
  typeInto,
  waitEditor,
  waitRevision,
} from './lib';
import { isCoreId } from './matrix';

// Lane B3b's rows of Round 1 in core/chrome.spec.ts (docs/NEXT.md 4.1.3 items 13 to 18, 4.1.5):
// the title row at 390 px, the deck name while the name plate shows, one status phrase. The spec
// file calls `chromeRound1()` once and spreads its ids into its coverage list, so the rows live in
// one module of the lane and the shared spec file carries three lines of it. Each test opens its
// own context with its own deck made from /new and torn down through the product, as
// core/chrome.spec.ts's own tests do.

type Person = { context: BrowserContext; page: Page; scratch: Scratch };
const people: Person[] = [];

async function contextAt(browser: Browser, width: number, height: number): Promise<Person> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const person = { context, page, scratch: new Scratch() };
  people.push(person);
  return person;
}

type Box = { x: number; right: number; w: number; y: number; bottom: number };

/** The title row's boxes at the viewport the page has: the row, the name and the right keys. */
async function titleRowFacts(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el || el.getClientRects().length === 0) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return {
        x: Math.round(r.x * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        bottom: Math.round(r.bottom * 10) / 10,
      };
    };
    const row = document.querySelector<HTMLElement>('[data-control="title.row"]');
    const name = document.querySelector<HTMLElement>('[data-control="deck.name"]');
    return {
      viewport: window.innerWidth,
      row: box('[data-control="title.row"]'),
      rowScroll: row ? row.scrollWidth : null,
      rowClient: row ? row.clientWidth : null,
      name: box('[data-control="deck.name"]'),
      nameText: name?.textContent ?? null,
      nameTruncated: name ? name.scrollWidth > name.clientWidth + 1 : null,
      slideshow: box('[data-control="present.split"]'),
      share: box('[data-control="share.open"]'),
      more: box('[data-control="title.more"]'),
      presence: box('[data-control="title.presence"]'),
      plate: box('.ts-title-name-plate'),
    };
  });
}

const inside = (b: Box | null, width: number) => b !== null && b.x >= 0 && b.right <= width + 0.5;

/** The first write through the product on /new: the title typed into the heading run. */
async function firstWrite(page: Page, scratch: Scratch, text: string): Promise<string> {
  await page.goto('/new');
  await waitEditor(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  scratch.add(info.id);
  await typeInto(page, await headingRun(page), text);
  await waitRevision(page, 1, 30_000);
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  return info.id;
}

/** The phrases the title row's left group draws: the Last edit words and the save words. */
async function statusPhrases(page: Page) {
  return page.evaluate(() => {
    const drawn = (el: Element | null) => {
      if (!el || el.getClientRects().length === 0) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        cs.visibility !== 'hidden' &&
        cs.display !== 'none' &&
        r.width > 8 &&
        (el.textContent ?? '').trim() !== ''
      );
    };
    const words = document.querySelector('[data-control="deck.lastEdit.words"]');
    const save = document.querySelector('[data-control="deck.saveState"] .ts-title-save-live');
    const phrases: string[] = [];
    if (drawn(words)) phrases.push((words?.textContent ?? '').trim());
    if (drawn(save)) phrases.push((save?.textContent ?? '').trim());
    return {
      phrases,
      wordsTip: words?.getAttribute('data-tip') ?? null,
      clockLabel:
        document.querySelector('[data-control="deck.lastEdit"]')?.getAttribute('aria-label') ??
        null,
      saveState:
        document.querySelector('[data-control="deck.saveState"]')?.getAttribute('data-state') ??
        null,
      saveText: (
        document.querySelector('[data-control="deck.saveState"]')?.textContent ?? ''
      ).trim(),
    };
  });
}

/** The head of the sparkles glyph's path (packages/chrome/src/icons.tsx `sparkles`, Heroicons 20 solid). */
const SPARKLES_D = 'M15.98 1.804a1 1 0 0 0-1.96 0';

/** The rows a surface draws and the sparkle glyphs among its paths. */
async function sparklesIn(page: Page, selector: string) {
  return page.evaluate(
    ([sel, head]) => {
      const root = document.querySelector(sel);
      if (!root) return { rows: 0, sparkles: -1 };
      const rows = root.querySelectorAll('button, [role="option"], [role="menuitem"], li').length;
      const sparkles = [...root.querySelectorAll('path')].filter((p) =>
        (p.getAttribute('d') ?? '').startsWith(head),
      ).length;
      return { rows, sparkles };
    },
    [selector, SPARKLES_D] as const,
  );
}

/** The head of the GT monogram's path (packages/chrome/src/GtMark.tsx), drawn by the GT deck alone. */
const GT_MARK_D = 'M363 222.5L1197 222.5';

/** The GT monograms drawn in the chrome, outside any slide. */
async function gtMarks(page: Page) {
  return page.evaluate((head) => {
    return [...document.querySelectorAll('path')].filter(
      (p) =>
        (p.getAttribute('d') ?? '').startsWith(head) &&
        /* a drawn mark: not a slide's, not the GT template's own card (its cover is the GT
           deck), and not the theme sprite's symbol, which a GT deck's slides reference
           (<use href="#gt-mark">) and which draws nothing itself */
        p.closest(
          '.ts-sheet, .sheet, .pt-slide, .ts-card, .pt-page, .ts-template-gt, symbol, defs, .ts-sprite',
        ) === null,
    ).length;
  }, GT_MARK_D);
}

/** The Turboslide marks (`svg.ts-mark`) under the first element a selector finds. */
async function markIn(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    return { mark: root.querySelectorAll('svg.ts-mark').length };
  }, selector);
}

/**
 * Declares the lane's chrome rows; returns their ids for the spec file's coverage list. A row's
 * test is declared only once its row is in the matrix: each push of the lane enters its rows in
 * core-matrix.json, so this one module serves every push and a later push's test stays inert
 * until its row lands (round1/build/b3b.md).
 */
export function chromeRound1(): string[] {
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
        /* the teardown opens File from the menu bar, which the phone editor folds into its
           Menus key under 720 px (PhoneEditor.css): a phone context is widened first */
        await person.page.setViewportSize({ width: 1440, height: 900 });
        await teardownAll(person.page, person.scratch);
      } catch (error) {
        failures.push(
          error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error),
        );
      } finally {
        await person.context.close().catch(() => undefined);
      }
    }
    expect(failures, 'every deck of the B3b rows is torn down').toEqual([]);
  });

  row('chrome.title-row.phone', async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 390, 844);
    const deck = await newDeck(page, scratch, 'Title row at 390');
    await openEditor(page, deck);
    await page.waitForTimeout(400);
    const facts = await titleRowFacts(page);
    test.info().annotations.push({ type: 'title row at 390', description: JSON.stringify(facts) });
    expect(facts.viewport).toBe(390);
    expect(
      facts.rowScroll !== null && facts.rowClient !== null && facts.rowScroll <= facts.rowClient,
      `the row's content fits its box (${facts.rowScroll} in ${facts.rowClient})`,
    ).toBe(true);
    expect(inside(facts.row, 390), 'the row is inside the viewport').toBe(true);
    expect(
      facts.name?.w ?? 0,
      `the deck name is at least 96 px wide (${facts.name?.w})`,
    ).toBeGreaterThanOrEqual(96);
    expect(
      inside(facts.slideshow, 390),
      `Slideshow is inside the row (${JSON.stringify(facts.slideshow)})`,
    ).toBe(true);
    expect(
      inside(facts.share, 390),
      `Share is inside the row (${JSON.stringify(facts.share)})`,
    ).toBe(true);
    expect(inside(facts.more, 390), 'the More key is drawn inside the row').toBe(true);
    expect(facts.presence, 'the presence slot folds into More').toBeNull();
    /* the folded controls are one tap away: More lists Show all comments and Collaborators */
    await ctl(page, 'title.more').click();
    const menu = page.locator('#ts-menu-title-more');
    await menu.waitFor({ timeout: 5000 });
    const rows = await menu
      .locator('[data-menu-item]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-menu-item')));
    test.info().annotations.push({ type: 'More rows', description: rows.join(', ') });
    await page.keyboard.press('Escape');
    expect(rows).toContain('title.comments');
    expect(rows).toContain('title.presence');
  });

  row('chrome.title-row.name-after-first-write', async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    /* the first write on /new makes the deck; the next write on the deck is the first one its
       editor counts, and the route opens the name prompt on it (SPEC-3 0.18) */
    await firstWrite(page, scratch, 'Name plate deck');
    await settled(page);
    await page.keyboard.press('Escape');
    const before = (await invoke<{ revision: number }>(page, 'deck.info')).revision;
    await page.keyboard.press('Control+m');
    const wroteAt = Date.now();
    await waitRevision(page, before + 1, 10_000);
    type Facts = Awaited<ReturnType<typeof titleRowFacts>>;
    let seen: (Facts & { ms: number }) | null = null;
    let last: Facts | null = null;
    while (Date.now() - wroteAt < 5000) {
      last = await titleRowFacts(page);
      if (last.plate !== null) {
        seen = { ...last, ms: Date.now() - wroteAt };
        break;
      }
      await page.waitForTimeout(100);
    }
    test.info().annotations.push({
      type: 'name while the plate shows',
      description: JSON.stringify(seen ?? { plate: 'not shown within 5 s', last }),
    });
    expect(seen, 'the name plate shows within 5 s of the write').not.toBeNull();
    const facts = seen!;
    expect(facts.nameTruncated, `the deck name "${facts.nameText}" keeps its full width`).toBe(
      false,
    );
    expect(facts.name?.w ?? 0, 'the deck name is at least 96 px wide').toBeGreaterThanOrEqual(96);
    expect(
      facts.plate!.y >= (facts.row?.bottom ?? 44) - 0.5,
      `the plate sits under the row (plate top ${facts.plate!.y}, row bottom ${facts.row?.bottom})`,
    ).toBe(true);
    expect(
      facts.name!.right <= facts.plate!.x || facts.name!.bottom <= facts.plate!.y,
      'the plate does not cover the name',
    ).toBe(true);
    await ctl(page, 'dialog.namePrompt.close')
      .click({ timeout: 3000 })
      .catch(() => undefined);
  });

  row('chrome.title-row.one-status', async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    await page.goto('/new');
    await waitEditor(page);
    await page.waitForTimeout(600);
    const draft = await statusPhrases(page);
    test.info().annotations.push({ type: 'fresh draft', description: JSON.stringify(draft) });
    expect(
      draft.phrases.filter((p) => /Last edit/.test(p)),
      'a draft nobody edited shows no Last edit words',
    ).toEqual([]);
    expect(draft.clockLabel, 'the clock names no edit on the draft').toBe('Last edit');
    const info = await invoke<{ id: string }>(page, 'deck.info');
    scratch.add(info.id);
    await typeInto(page, await headingRun(page), 'One status phrase');
    await waitRevision(page, 1, 30_000);
    await page.waitForURL(/\/edit\//, { timeout: 30_000 });
    await settled(page);
    await ctl(page, 'dialog.namePrompt.close')
      .click({ timeout: 1500 })
      .catch(() => undefined);
    await page.waitForTimeout(800);
    const after = await statusPhrases(page);
    test.info().annotations.push({ type: 'after the write', description: JSON.stringify(after) });
    expect(after.saveState, 'the write is saved').toBe('saved');
    expect(after.phrases.length, `one status phrase (${after.phrases.join(' | ')})`).toBe(1);
    expect(after.phrases[0] ?? '', 'the phrase is the Last edit words').toMatch(/^Last edit /);
    expect(after.phrases[0] ?? '', 'the phrase names no author').not.toMatch(/ by /);
    expect(after.wordsTip ?? '', 'the tooltip names the author').toMatch(/^Last edit .+ by .+/);
    expect(after.clockLabel ?? '', 'the clock’s name names the author').toMatch(/ by /);
  });

  row('chrome.scroll.no-smooth', async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    const deck = await newDeck(page, scratch, 'No smooth scroll');
    /* every element of the page and its computed scroll-behavior: the ones that read smooth */
    const smooth = () =>
      page.evaluate(() => {
        const found: string[] = [];
        for (const el of [document.documentElement, ...document.querySelectorAll('*')]) {
          if (getComputedStyle(el).scrollBehavior !== 'smooth') continue;
          const cls = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '';
          found.push(`${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`);
        }
        return { count: document.querySelectorAll('*').length, smooth: found.slice(0, 12) };
      });
    const readings: Record<string, { count: number; smooth: string[] }> = {};
    await openEditor(page, deck);
    readings.editor = await smooth();
    await page.goto(`/deck/${deck}?mode=book`);
    await page.locator('.pt-book').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    readings.book = await smooth();
    for (const path of ['/home', '/decks']) {
      await page.goto(path);
      await page.waitForLoadState('load');
      await page.waitForTimeout(800);
      readings[path] = await smooth();
    }
    test.info().annotations.push({ type: 'smooth scroll', description: JSON.stringify(readings) });
    expect(readings.book!.count, 'the book view is drawn').toBeGreaterThan(20);
    for (const [where, reading] of Object.entries(readings))
      expect(reading.smooth, `no element on ${where} computes scroll-behavior: smooth`).toEqual([]);
  });

  row('chrome.selection.gt-blue', async ({ browser }) => {
    test.setTimeout(240_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    const deck = await newDeck(page, scratch, 'Selection colour');
    await openEditor(page, deck);
    const slideId = await addSlide(page);
    await placeBlock(page, slideId, {
      id: 'select-box',
      type: 'text',
      text: 'A selected box',
      pos: { x: 200, y: 200, w: 600, h: 80 },
    });
    const readings: Record<string, unknown>[] = [];
    for (const appearance of ['light', 'dark'] as const) {
      /* setup: the chrome and the deck in one appearance, the chrome's stored choice and the
         deck's /defaults/appearance (the Themes panel's write); never a driven step */
      await page.evaluate((a) => localStorage.setItem('ts-chrome-appearance', a), appearance);
      const s = await state(page);
      await invoke(page, 'deck.set', {
        baseRevision: s.revision,
        path: '/defaults/appearance',
        value: appearance,
      });
      await openEditor(page, deck, `#${slideId}`);
      await selectBlock(page, 'select-box');
      await page.waitForTimeout(300);
      const read = await page.evaluate(() => {
        const ring = document.querySelector('.ts-overlay .ts-select');
        const chip = document.querySelector('.ts-overlay .ts-select-chip');
        return {
          chrome: document.documentElement.dataset.theme ?? null,
          overlay: document.querySelector('.ts-overlay')?.getAttribute('data-theme') ?? null,
          ring: ring ? getComputedStyle(ring).borderTopColor : null,
          chip: chip ? getComputedStyle(chip).backgroundColor : null,
          chipText: chip ? getComputedStyle(chip).color : null,
        };
      });
      readings.push({ appearance, ...read });
      await page.keyboard.press('Escape');
    }
    test.info().annotations.push({ type: 'selection', description: JSON.stringify(readings) });
    for (const read of readings) {
      expect(read.ring, `the ring in ${read.appearance}`).toBe('rgb(47, 92, 224)');
      expect(read.chip, `the chip in ${read.appearance}`).toBe('rgb(47, 92, 224)');
      expect(read.chipText, `the chip's text in ${read.appearance}`).toBe('rgb(255, 255, 255)');
    }
    expect(readings.map((r) => r.overlay)).toEqual(['light', 'dark']);
  });

  row('chrome.ai.no-sparkle', async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    const deck = await newDeck(page, scratch, 'No sparkle');
    await openEditor(page, deck);
    const readings: Record<string, unknown> = {};
    readings.titleRow = await sparklesIn(page, '[data-control="title.row"]');
    readings.assist = await page.evaluate(() => {
      const el = document.querySelector('[data-control="title.assist"]');
      return el
        ? { text: (el.textContent ?? '').trim(), glyphs: el.querySelectorAll('svg').length }
        : null;
    });
    /* Search the menus (the tool finder) with a phrase that lists the assist's rows */
    await menuPath(page, 'help', 'help.searchMenus');
    await ctl(page, 'palette').waitFor({ timeout: 8000 });
    await page.keyboard.type('assist', { delay: 40 });
    await page.waitForTimeout(600);
    readings.finder = await sparklesIn(page, '[data-control="palette"]');
    await page.keyboard.press('Escape');
    /* the palette at its actions section (Tools > Developer > Run an action, a parked row): the
       Advanced tools switch on as setup, the browser's stored setting, and off again after */
    await page.evaluate(() =>
      localStorage.setItem('ts-editor-settings', JSON.stringify({ advancedTools: true })),
    );
    await openEditor(page, deck);
    await menuPath(page, 'tools', 'tools.advanced', 'tools.advanced.runAction');
    await ctl(page, 'palette').waitFor({ timeout: 8000 });
    await page.waitForTimeout(400);
    readings.actions = await sparklesIn(page, '[data-control="palette"]');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => localStorage.removeItem('ts-editor-settings'));
    test.info().annotations.push({ type: 'sparkles', description: JSON.stringify(readings) });
    const assist = readings.assist as { text: string; glyphs: number } | null;
    expect(assist?.text, 'Assist reads as the word').toBe('Assist');
    expect(assist?.glyphs, 'Assist draws no glyph').toBe(0);
    for (const where of ['titleRow', 'finder', 'actions'] as const) {
      const r = readings[where] as { rows: number; sparkles: number };
      expect(r.rows, `${where} is drawn`).toBeGreaterThan(0);
      expect(r.sparkles, `no sparkle glyph in ${where}`).toBe(0);
    }
  });

  row('chrome.mark.one-product-mark', async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    const deck = await newDeck(page, scratch, 'One product mark');
    const api = await request.newContext({ baseURL: baseURL ?? undefined, extraHTTPHeaders });
    const root = resolve(import.meta.dirname, '../../../..');
    /* the served icons are the build's files, the ones scripts/build-brand.ts writes from the one
       geometry of packages/theme/src/brand.ts (its --check compares them) */
    const icons: Record<string, { status: number; same: boolean }> = {};
    for (const path of ['/icon.svg', '/apple-touch-icon.png', '/favicon.ico']) {
      const res = await api.get(path);
      const body = Buffer.from(await res.body());
      const file = readFileSync(resolve(root, 'apps/studio/public', path.slice(1)));
      icons[path] = { status: res.status(), same: body.equals(file) };
    }
    await api.dispose();
    const marks: Record<string, unknown> = {};
    await openEditor(page, deck);
    marks.titleRow = await markIn(page, '[data-control="title.home"]');
    marks.editorGt = await gtMarks(page);
    await page.goto('/decks');
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    marks.decks = await markIn(page, '[data-control="appbar.home"]');
    marks.decksGt = await gtMarks(page);
    await page.goto(`/deck/${deck}`);
    await page.locator('.pt-sb').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    marks.view = await markIn(page, '.pt-sb-head');
    marks.viewGt = await gtMarks(page);
    /* the CLI banner of this checkout: the glyph lines the brand module's markBlocks returns */
    const banner = execFileSync(
      'node',
      [resolve(root, 'apps/cli/bin/turboslide.mjs'), '--version'],
      {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      },
    );
    const brand = (await import('../../../../packages/theme/src/brand')) as {
      markBlocks?: () => string[] | string;
    };
    const blocks = brand.markBlocks ? brand.markBlocks() : null;
    const glyph = Array.isArray(blocks)
      ? blocks
      : typeof blocks === 'string'
        ? blocks.split('\n')
        : [];
    const bannerHasGlyph =
      glyph.length > 0 && glyph.every((line) => banner.includes(line.trimEnd()));
    test.info().annotations.push({
      type: 'one mark',
      description: JSON.stringify({
        icons,
        marks,
        bannerHasGlyph,
        banner: banner.split('\n').slice(0, 8),
      }),
    });
    for (const [path, read] of Object.entries(icons)) {
      expect(read.status, `${path} answers`).toBe(200);
      expect(read.same, `${path} is the build's file`).toBe(true);
    }
    for (const where of ['titleRow', 'decks', 'view'] as const)
      expect(
        (marks[where] as { mark: number } | null)?.mark ?? 0,
        `the Turboslide mark on ${where}`,
      ).toBeGreaterThan(0);
    for (const where of ['editorGt', 'decksGt', 'viewGt'] as const)
      expect(marks[where], `no GT monogram outside a GT deck on ${where}`).toBe(0);
    expect(bannerHasGlyph, "the CLI banner draws the brand module's glyph").toBe(true);
  });

  row('chrome.stage.deck-appearance', async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page, scratch } = await contextAt(browser, 1440, 900);
    const deck = await newDeck(page, scratch, 'Deck appearance');
    await openEditor(page, deck);
    /* setup: a light deck (the Themes panel's write of /defaults/appearance) under dark chrome
       (the chrome's stored choice, Tools > Preferences > Appearance > Dark); never driven steps */
    const s = await state(page);
    await invoke(page, 'deck.set', {
      baseRevision: s.revision,
      path: '/defaults/appearance',
      value: 'light',
    });
    await settled(page);
    await page.evaluate(() => {
      localStorage.setItem('ts-chrome-appearance', 'dark');
      localStorage.setItem('gt-theme', 'dark');
    });
    await openEditor(page, deck);
    await page.waitForTimeout(800);
    /* the ground a point of the page paints: the first element up from it with a background */
    const facts = () =>
      page.evaluate(() => {
        const paint = (el: Element | null): string | null => {
          for (let at = el; at !== null; at = at.parentElement) {
            const bg = getComputedStyle(at).backgroundColor;
            if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
          }
          return null;
        };
        const probe = document.createElement('div');
        probe.style.background = 'var(--pt-plate)';
        probe.style.position = 'fixed';
        document.body.append(probe);
        const plate = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const sheet = document.querySelector('.ts-stagewrap .sheet, .ts-stagewrap .pt-slide');
        const r = sheet?.getBoundingClientRect();
        const wrap = document.querySelector('.pt-stagewrap')?.getBoundingClientRect();
        const outside =
          r && wrap
            ? document.elementFromPoint(Math.round(wrap.x + 8), Math.round((r.y + r.bottom) / 2))
            : null;
        const sheetAt = r
          ? document.elementFromPoint(
              Math.round(r.x + r.width / 2),
              Math.round(r.y + r.height * 0.9),
            )
          : null;
        return {
          chrome: document.documentElement.dataset.theme ?? null,
          stage: document.querySelector('.ts-stagewrap')?.getAttribute('data-theme') ?? null,
          sheetPaint: paint(sheetAt),
          workspacePaint: paint(outside),
          plate,
          cards: [...document.querySelectorAll('.ts-card .ts-sheet')].map((el) =>
            el.getAttribute('data-theme'),
          ),
          cardPaint: paint(
            document.querySelector('.ts-card .ts-sheet .sheet, .ts-card .ts-sheet .pt-slide'),
          ),
        };
      });
    const editor = await facts();
    /* the presenter view and the /deck view in the same browser */
    const presenter = await context.newPage();
    await presenter.goto(`/present/${deck}`);
    await presenter.locator('.ts-presenter').first().waitFor({ timeout: 30_000 });
    await presenter.waitForTimeout(1200);
    const present = await presenter.evaluate(() => ({
      chrome: document.documentElement.dataset.theme ?? null,
      clones: [...document.querySelectorAll('.ts-presenter .ts-sheet')].map((el) =>
        el.getAttribute('data-theme'),
      ),
    }));
    await presenter.close();
    const view = await context.newPage();
    await view.goto(`/deck/${deck}`);
    await view.locator('.ts-stagewrap').first().waitFor({ timeout: 30_000 });
    await view.waitForTimeout(1200);
    const viewer = await view.evaluate(() => ({
      chrome: document.documentElement.dataset.theme ?? null,
      stage: document.querySelector('.ts-stagewrap')?.getAttribute('data-theme') ?? null,
      cards: [...document.querySelectorAll('.pt-sb .ts-sheet')].map((el) =>
        el.getAttribute('data-theme'),
      ),
    }));
    await view.close();
    await page.evaluate(() => {
      localStorage.removeItem('ts-chrome-appearance');
      localStorage.removeItem('gt-theme');
    });
    test.info().annotations.push({
      type: 'appearance',
      description: JSON.stringify({ editor, present, viewer }),
    });
    expect(editor.chrome, 'the chrome is dark').toBe('dark');
    expect(editor.stage, 'the stage draws the light deck').toBe('light');
    expect(editor.sheetPaint, 'the slide paints white').toBe('rgb(255, 255, 255)');
    expect(editor.workspacePaint, 'the workspace reads the chrome’s --pt-plate').toBe(editor.plate);
    expect(editor.cards.length, 'the filmstrip draws its cards').toBeGreaterThan(0);
    expect(new Set(editor.cards), 'the filmstrip draws the light deck').toEqual(new Set(['light']));
    expect(present.chrome).toBe('dark');
    expect(present.clones.length, 'the presenter draws its frames').toBeGreaterThan(0);
    expect(new Set(present.clones), 'the presenter draws the light deck').toEqual(
      new Set(['light']),
    );
    expect(viewer.chrome).toBe('dark');
    expect(viewer.stage, 'the /deck view draws the light deck').toBe('light');
    expect(new Set(viewer.cards), 'the /deck view’s cards draw the light deck').toEqual(
      new Set(['light']),
    );
  });

  row('versions.panel.seam-and-time', async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 1440, 900);
    const deck = await newDeck(page, scratch, 'Version seam');
    await openEditor(page, deck);
    await ctl(page, 'deck.lastEdit').click();
    await page.locator('.ts-versions-tools').first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const facts = await page.evaluate(() => {
      const tools = document.querySelector('.ts-versions-tools');
      /* the panel's scroll body: its content box is the panel's width less the border and the
         scroll gutter, the width every row of the panel runs */
      const panel = tools?.closest('.ts-panel-body') ?? tools?.parentElement ?? null;
      const label = tools?.querySelector('.ts-versions-named');
      const t = tools?.getBoundingClientRect();
      const p = panel?.getBoundingClientRect();
      const times = [...document.querySelectorAll('.ts-versions *')]
        .filter((el) => el.children.length === 0)
        .map((el) => (el.textContent ?? '').match(/\b\d{1,2}:\d{2}\s?[AP]M\b/g) ?? [])
        .flat();
      return {
        tools: t ? { x: t.x, right: t.right, w: t.width } : null,
        panel: p ? { x: p.x, right: p.right, content: panel?.clientWidth ?? 0 } : null,
        toolsRule: tools ? getComputedStyle(tools).borderBottomWidth : null,
        labelRule: label ? getComputedStyle(label).borderBottomWidth : null,
        times,
      };
    });
    await page.keyboard.press('Escape');
    test.info().annotations.push({ type: 'versions', description: JSON.stringify(facts) });
    expect(facts.toolsRule, 'the tools row draws its rule').toBe('1px');
    expect(facts.labelRule, 'the label draws no rule of its own').toBe('0px');
    expect(
      facts.tools !== null &&
        facts.panel !== null &&
        Math.abs(facts.tools.x - facts.panel.x) <= 1 &&
        Math.abs(facts.tools.w - facts.panel.content) <= 1,
      `the rule runs the panel's width (${JSON.stringify(facts.tools)} in ${JSON.stringify(facts.panel)})`,
    ).toBe(true);
    expect(facts.times.length, 'the rows read a time').toBeGreaterThan(0);
    for (const time of facts.times)
      expect(time, 'a time reads "6:45 PM", the hour without a leading zero').toMatch(
        /^[1-9]\d?:\d{2}\s?[AP]M$/,
      );
  });

  row('chrome.phone.menus-key', async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, scratch } = await contextAt(browser, 390, 844);
    const deck = await newDeck(page, scratch, 'Phone editor');
    await openEditor(page, deck);
    await addSlide(page);
    await openEditor(page, deck);
    await page.waitForTimeout(600);
    const layout = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el || el.getClientRects().length === 0) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      };
      const cards = [...document.querySelectorAll('.ts-filmstrip .ts-card')].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y) };
      });
      return {
        viewport: window.innerWidth,
        scrollW: document.documentElement.scrollWidth,
        menubar: box('[data-control="menubar"]'),
        menusKey: box('[data-control="toolbar.menus"]'),
        stage: box('.pt-stagewrap'),
        filmstrip: box('.ts-filmstrip'),
        cards,
      };
    });
    await ctl(page, 'toolbar.menus').click();
    const menu = page.locator('#ts-menu-menus');
    await menu.waitFor({ timeout: 5000 });
    const rows = await menu
      .locator('[data-menu-item^="menus."]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-menu-item')));
    /* one menu opens from its row: Insert's own rows */
    await menu.locator('[data-menu-item="menus.insert"]').click();
    const insert = await page
      .locator('[role="menu"].is-sub [data-menu-item^="insert."]')
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    /* the submenu drops under its row, so the Insert row stays in view (Menu.tsx placeMenu) */
    const drop = await page.evaluate(() => {
      const row = document.querySelector('#ts-menu-menus [data-menu-item="menus.insert"]');
      const sub = document.querySelector('[role="menu"].is-sub');
      if (!row || !sub) return null;
      const r = row.getBoundingClientRect();
      const s = sub.getBoundingClientRect();
      return {
        rowBottom: r.bottom,
        rowLeft: r.left,
        subTop: s.top,
        subLeft: s.left,
        subRight: s.right,
      };
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'phone editor',
      description: JSON.stringify({ layout, rows, insert, drop }),
    });
    expect(layout.viewport).toBe(390);
    expect(layout.scrollW, 'nothing crosses the viewport').toBeLessThanOrEqual(390);
    expect(layout.menubar, 'the menu bar row leaves').toBeNull();
    expect(layout.menusKey, 'one Menus key is drawn').not.toBeNull();
    expect(rows, 'the Menus key opens the nine menus').toEqual([
      'menus.file',
      'menus.edit',
      'menus.view',
      'menus.insert',
      'menus.format',
      'menus.slide',
      'menus.arrange',
      'menus.tools',
      'menus.help',
    ]);
    expect(insert, 'a menu row opens that menu').toBe(true);
    expect(drop, 'the open submenu is drawn').not.toBeNull();
    expect(
      drop!.subTop >= drop!.rowBottom - 1 && drop!.subRight <= 390,
      `the submenu sits under its row and inside the viewport (${JSON.stringify(drop)})`,
    ).toBe(true);
    expect(layout.stage && layout.filmstrip, 'the sheet and the filmstrip are drawn').toBeTruthy();
    expect(
      layout.filmstrip!.y >= layout.stage!.bottom - 1,
      `the filmstrip runs under the sheet (${layout.filmstrip!.y} under ${layout.stage!.bottom})`,
    ).toBe(true);
    expect(layout.cards.length, 'two cards').toBeGreaterThanOrEqual(2);
    expect(new Set(layout.cards.map((c) => c.y)).size, 'the cards stand in one row').toBe(1);
  });

  return declared;
}
