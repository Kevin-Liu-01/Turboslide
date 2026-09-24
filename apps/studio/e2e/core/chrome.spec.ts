import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  coverage,
  ctl,
  ensureShader,
  extraHTTPHeaders,
  menuPath,
  newDeck,
  openEditor,
  openShaderSection,
  placeBlock,
  selectBlock,
  settled,
  shaderGroupHeadings,
  state,
  teardownAll,
  title,
} from './lib';

// The chrome at two viewports, the spec rows (docs/PRODUCT.md 3.3, 3.4, 8.1 `slides.layout.
// plate-four-columns`, `share.dialog.more-row` and `chrome.toolbar.fold-any-width` with the driver
// core/chrome.spec.ts): the Apply layout plate at 1280 by 800, the Share dialog's height at 900
// and its scroll at 800, and the toolbar tail folding into More at both widths. Two contexts, one
// per viewport, each with its own deck created from /new and torn down through the product; the
// walk probe keeps its one 1440 by 900 page, so the viewport rows live here.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/chrome.spec.ts

type Person = { context: BrowserContext; page: Page; scratch: Scratch; deck: string };
const people: Person[] = [];

/** A context at a viewport with its own deck (a setup, never a driven step). */
async function personAt(browser: Browser, width: number, height: number): Promise<Person> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const scratch = new Scratch();
  const deck = await newDeck(page, scratch, `Chrome at ${width}`);
  const person = { context, page, scratch, deck };
  people.push(person);
  return person;
}
let wide: Person;
let laptop: Person;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  wide = await personAt(browser, 1440, 900);
  laptop = await personAt(browser, 1280, 800);
});
test.afterAll(async () => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  for (const person of people) {
    try {
      await teardownAll(person.page, person.scratch);
    } catch (error) {
      failures.push(
        error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error),
      );
    } finally {
      await person.context.close().catch(() => undefined);
    }
  }
  expect(failures, 'every deck of this file is torn down').toEqual([]);
});

/** The layout plate's facts: the tiles' columns, whether it scrolls, and the GT group's state. */
async function plateFacts(page: Page) {
  return page.evaluate(() => {
    const plate = document.querySelector('[data-control="layout.apply.plate"]');
    if (!plate) return null;
    const tiles = [...plate.querySelectorAll('.ts-layout-tile')].filter(
      (el) => el.getClientRects().length > 0,
    );
    const groups = [...plate.querySelectorAll('.ts-layout-tiles')];
    const google = groups[0] ? [...groups[0].querySelectorAll('.ts-layout-tile')] : [];
    const columns = new Set(google.map((el) => Math.round(el.getBoundingClientRect().x))).size;
    const gt = groups[1] ? [...groups[1].querySelectorAll('.ts-layout-tile')] : [];
    const gtShown = gt.filter((el) => el.getClientRects().length > 0).length;
    const disclosure = plate.querySelector(
      'details, [aria-expanded], [data-control="layout.apply.gt"], .ts-layout-disclosure',
    );
    const scroller = [plate, ...plate.querySelectorAll('*')].find(
      (el) =>
        el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY),
    );
    const r = plate.getBoundingClientRect();
    return {
      tiles: tiles.length,
      google: google.length,
      columns,
      gtShown,
      disclosure: Boolean(disclosure),
      scrolls: Boolean(scroller),
      size: `${Math.round(r.width)} by ${Math.round(r.height)}`,
      viewport: `${window.innerWidth} by ${window.innerHeight}`,
    };
  });
}

test(title('slides.layout.plate-four-columns'), async () => {
  test.setTimeout(120_000);
  const { page, deck } = laptop;
  await openEditor(page, deck);
  await ctl(page, 'toolbar.layout').click();
  await ctl(page, 'layout.apply.plate').waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  const facts = await plateFacts(page);
  await page.keyboard.press('Escape');
  expect(facts, 'the layout plate opened').not.toBeNull();
  test.info().annotations.push({ type: 'plate', description: JSON.stringify(facts) });
  expect(facts!.columns, `the Google tiles stand in four columns at ${facts!.viewport}`).toBe(4);
  expect(facts!.google, "Google's eleven layouts").toBeGreaterThanOrEqual(11);
  expect(facts!.scrolls, `the plate (${facts!.size}) does not scroll at 800`).toBe(false);
  expect(facts!.disclosure && facts!.gtShown === 0, 'the GT layouts are a collapsed group').toBe(
    true,
  );
});

/** The Share dialog's geometry and what its first stage shows. */
async function shareFacts(page: Page) {
  await ctl(page, 'share.open').click();
  /* the first Share on a fresh browser asks for a display name once (docs/PRODUCT.md section 2 rank 4) */
  const skip = ctl(page, 'dialog.namePrompt.skip');
  if (
    await skip
      .waitFor({ timeout: 1500 })
      .then(() => true)
      .catch(() => false)
  )
    await skip.click({ timeout: 2000 }).catch(() => undefined);
  await ctl(page, 'dialog.share').waitFor({ timeout: 10_000 });
  await expect(ctl(page, 'dialog.share.loading')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(400);
  const facts = await page.evaluate(() => {
    const dialog = document.querySelector('[data-control="dialog.share"]');
    const card = dialog?.closest('[role="dialog"]') ?? dialog;
    if (!card) return null;
    const visible = (c: string) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return Boolean(el && el.getClientRects().length > 0);
    };
    const scroller = [card, ...card.querySelectorAll('*')].find(
      (el) =>
        el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY),
    );
    return {
      height: Math.round(card.getBoundingClientRect().height),
      viewport: window.innerHeight,
      more: visible('dialog.share.more'),
      emails: visible('dialog.share.emails'),
      requests: visible('dialog.share.requests'),
      settings: visible('dialog.share.settings'),
      scrolls: Boolean(scroller),
    };
  });
  return facts;
}

test(title('share.dialog.more-row'), async () => {
  test.setTimeout(120_000);
  await openEditor(wide.page, wide.deck);
  const at900 = await shareFacts(wide.page);
  expect(at900, 'the Share dialog opened at 900').not.toBeNull();
  test.info().annotations.push({ type: 'share at 900', description: JSON.stringify(at900) });
  expect(at900!.more, 'a More row is drawn').toBe(true);
  expect(
    [at900!.emails, at900!.requests, at900!.settings],
    'Add people, the requests band and Settings sit behind More',
  ).toEqual([false, false, false]);
  await ctl(wide.page, 'dialog.share.more').click();
  await wide.page.waitForTimeout(300);
  const opened = await wide.page.evaluate(() =>
    ['dialog.share.emails', 'dialog.share.settings'].map((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return Boolean(el && el.getClientRects().length > 0);
    }),
  );
  expect(opened.some(Boolean), 'More opens the rows behind it').toBe(true);
  await wide.page.keyboard.press('Escape');
  await expect(ctl(wide.page, 'dialog.share')).toHaveCount(0, { timeout: 5000 });
  expect(
    at900!.height,
    `the dialog is under 520 px tall at 900 (${at900!.height} px)`,
  ).toBeLessThan(520);
  await openEditor(laptop.page, laptop.deck);
  const at800 = await shareFacts(laptop.page);
  await laptop.page.keyboard.press('Escape');
  await expect(ctl(laptop.page, 'dialog.share')).toHaveCount(0, { timeout: 5000 });
  test.info().annotations.push({ type: 'share at 800', description: JSON.stringify(at800) });
  expect(at800!.scrolls, `the dialog does not scroll at 800 (${at800!.height} px)`).toBe(false);
});

/** The tail's controls: inside the bar, inside More, or neither; and the three that stay. */
async function tailFacts(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.ts-toolbar');
    const barRect = bar?.getBoundingClientRect();
    const tail = document.querySelector('[data-control="toolbar.tail"]');
    const controls = [...(tail?.querySelectorAll('[data-control^="toolbar."]') ?? [])]
      .filter(
        (el) => el.getClientRects().length > 0 && !el.closest('[data-control="toolbar.more"]'),
      )
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-control') ?? '',
          inside: Boolean(barRect && r.left >= barRect.left - 1 && r.right <= barRect.right + 1),
        };
      });
    const visible = (c: string) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return Boolean(el && el.getClientRects().length > 0);
    };
    const first = tail?.querySelector('[data-control^="toolbar."]');
    const firstCs = first ? getComputedStyle(first) : null;
    return {
      viewport: window.innerWidth,
      controls,
      outside: controls.filter((c) => !c.inside).map((c) => c.id),
      more: visible('toolbar.more'),
      formatOptions: visible('toolbar.formatOptions'),
      pointer: visible('toolbar.pointer'),
      hideMenus: visible('toolbar.hideMenus'),
      first: first
        ? {
            id: first.getAttribute('data-control'),
            text: first.textContent?.trim().slice(0, 30) ?? '',
            disabled:
              first.getAttribute('aria-disabled') === 'true' || first.hasAttribute('disabled'),
            tag: first.tagName.toLowerCase(),
            chevron: Boolean(first.querySelector('svg, .ts-tb-chevron')),
            color: firstCs?.color ?? null,
          }
        : null,
    };
  });
}

async function foldAt(person: Person): Promise<{
  table: Awaited<ReturnType<typeof tailFacts>>;
  text: Awaited<ReturnType<typeof tailFacts>>;
}> {
  const { page, deck } = person;
  await openEditor(page, deck);
  const slideId = (await state(page)).slideId;
  const objects = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-block]')].map((el) =>
      el.getAttribute('data-block'),
    ),
  );
  if (!objects.includes('fold-table'))
    await placeBlock(page, slideId, {
      id: 'fold-table',
      type: 'table',
      columns: [{}, {}, {}],
      rows: [
        { cells: ['', '', ''], header: true },
        { cells: ['', '', ''] },
        { cells: ['', '', ''] },
      ],
      pos: { x: 120, y: 120, w: 720, h: 240 },
    });
  if (!objects.includes('fold-text'))
    await placeBlock(page, slideId, {
      id: 'fold-text',
      type: 'text',
      text: 'The tail with text selected',
      pos: { x: 120, y: 480, w: 720, h: 100 },
    });
  await settled(page);
  await selectBlock(page, 'fold-table');
  await page.waitForTimeout(400);
  const table = await tailFacts(page);
  await page.keyboard.press('Escape');
  await selectBlock(page, 'fold-text');
  await page.waitForTimeout(400);
  const text = await tailFacts(page);
  await page.keyboard.press('Escape');
  return { table, text };
}

test(title('chrome.toolbar.fold-any-width'), async () => {
  test.setTimeout(180_000);
  const at1440 = await foldAt(wide);
  const at1280 = await foldAt(laptop);
  for (const [label, facts] of [
    ['1440 table', at1440.table],
    ['1280 table', at1280.table],
  ] as const) {
    test.info().annotations.push({
      type: label,
      description: `${facts.controls.length} tail controls, outside the bar ${facts.outside.join(', ') || 'none'}, More ${facts.more}, Format options ${facts.formatOptions}, pointer ${facts.pointer}, Hide the menus ${facts.hideMenus}`,
    });
    expect(facts.outside, `${label}: every tail control is inside the bar or in More`).toEqual([]);
    expect(
      [facts.formatOptions, facts.pointer, facts.hideMenus],
      `${label}: Format options, the pointer and Hide the menus are visible`,
    ).toEqual([true, true, true]);
  }
  for (const [label, facts] of [
    ['1440 text', at1440.text],
    ['1280 text', at1280.text],
  ] as const) {
    test.info().annotations.push({ type: label, description: JSON.stringify(facts.first) });
    expect(facts.first, `${label}: the text tail has a first control`).not.toBeNull();
    expect(facts.first!.id, `${label}: the first control is the Font control`).toBe('toolbar.font');
    /* the dropdown with `fonts` present, or the read only family with `fonts` parked (3.4): a live
       button with a chevron, or a value reading Inter with no chevron; a disabled control with the
       old tooltip is neither */
    const dropdown = !facts.first!.disabled && facts.first!.chevron;
    const readOnly =
      /Inter/.test(facts.first!.text) && !facts.first!.chevron && !facts.first!.disabled;
    expect(
      dropdown || readOnly,
      `${label}: the Font dropdown or the read only family (${JSON.stringify(facts.first)})`,
    ).toBe(true);
  }
  void menuPath;
});

/**
 * Insert > Logo on a page (the switch on when the row is parked); answers whether the dialog is
 * drawn (the features round, docs/FEATURES.md 4.3; the menu row is the integrator's by request).
 */
async function openLogoDialog(page: Page): Promise<{ open: boolean; switched: boolean }> {
  const present = async (): Promise<boolean> => {
    await ctl(page, 'menubar.insert').click();
    await page.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
    const there = await ctl(page, 'menu.insert.logo')
      .isVisible()
      .catch(() => false);
    if (!there) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      return false;
    }
    await ctl(page, 'menu.insert.logo').click();
    return ctl(page, 'dialog.logo')
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);
  };
  if (await present()) return { open: true, switched: false };
  if ((await state(page)).settings?.['advancedTools'] !== true) {
    await menuPath(page, 'tools', 'tools.advancedTools');
    await page.waitForTimeout(300);
    const there = await present();
    if (!there) await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
    return { open: there, switched: there };
  }
  return { open: false, switched: false };
}
/** The logo dialog's grid facts: the tiles per row, the horizontal scroll, the card's ground and the halves. */
async function logoGridFacts(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[data-control="dialog.logo"]');
    const card = dialog?.closest('[role="dialog"]') ?? dialog;
    if (!card) return null;
    const tiles = [...card.querySelectorAll('[data-control^="dialog.logo.tile."]')].filter(
      (e) =>
        e.getClientRects().length > 0 &&
        e.matches('button, [role="option"]') &&
        !/\.(paper|ink|pair|variants)$/.test(e.getAttribute('data-control') ?? ''),
    );
    /* the tiles a row holds, read inside one group: the widest row of the results (or of the
       largest group), never the Your brand group's one or two tiles at the top of the dialog */
    const byGroup = new Map<string, Element[]>();
    for (const e of tiles) {
      const group =
        e.closest('[data-control^="dialog.logo.group."]')?.getAttribute('data-control') ?? '';
      byGroup.set(group, [...(byGroup.get(group) ?? []), e]);
    }
    let perRow = 0;
    for (const members of byGroup.values()) {
      const tops = new Map<number, number>();
      for (const e of members) {
        const top = Math.round(e.getBoundingClientRect().top);
        tops.set(top, (tops.get(top) ?? 0) + 1);
      }
      perRow = Math.max(perRow, ...tops.values());
    }
    const scrollers = [card, ...card.querySelectorAll('*')].filter(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX),
    );
    const halves = tiles.map((e) => {
      const id = e.getAttribute('data-control') ?? '';
      const paper = document.querySelector(`[data-control="${id}.paper"]`);
      const ink = document.querySelector(`[data-control="${id}.ink"]`);
      const box = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
      const p = box(paper);
      const i = box(ink);
      return Boolean(p && i && p.width > 8 && p.height > 8 && i.width > 8 && i.height > 8);
    });
    const ground = getComputedStyle(card).backgroundColor;
    const m = ground.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
    const luminance = 0.2126 * m[0]! + 0.7152 * m[1]! + 0.0722 * m[2]!;
    const r = card.getBoundingClientRect();
    return {
      tiles: tiles.length,
      perRow,
      scrollsX: scrollers.length,
      ground,
      dark: luminance < 90,
      halves: halves.filter(Boolean).length,
      width: Math.round(r.width),
      viewport: `${window.innerWidth} by ${window.innerHeight}`,
    };
  });
}

test(title('logos.picker.chrome-1280'), async () => {
  test.setTimeout(180_000);
  const { page, deck } = laptop;
  await openEditor(page, deck);
  const opened = await openLogoDialog(page);
  if (!opened.open)
    test.skip(
      true,
      'not on this build: insert.logo (docs/FEATURES.md 4.3, B1 by request in model.ts)',
    );
  await ctl(page, 'dialog.logo.search').click();
  await page.keyboard.type('figma', { delay: 60 });
  await expect
    .poll(async () => (await logoGridFacts(page))?.tiles ?? 0, {
      timeout: 15_000,
      message: 'the results draw',
    })
    .toBeGreaterThan(0);
  /* a query with many results, so the grid fills a row */
  await ctl(page, 'dialog.logo.search').click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('a', { delay: 60 });
  await expect
    .poll(async () => (await logoGridFacts(page))?.tiles ?? 0, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(5);
  const light = await logoGridFacts(page);
  await page.keyboard.press('Escape');
  await expect(ctl(page, 'dialog.logo')).toHaveCount(0, { timeout: 5000 });
  test.info().annotations.push({ type: 'light', description: JSON.stringify(light) });
  expect(light!.perRow, `five tiles wide at ${light!.viewport}`).toBe(5);
  expect(light!.scrollsX, 'no horizontal scroll').toBe(0);
  /* the dark appearance: View > Appearance > Dark, the dialog on ink with both halves in every tile */
  await menuPath(page, 'view', 'view.appearance', 'view.appearance.dark').catch(() => undefined);
  await page.waitForTimeout(400);
  const again = await openLogoDialog(page);
  expect(again.open, 'the dialog opens in the dark appearance').toBe(true);
  await ctl(page, 'dialog.logo.search').click();
  await page.keyboard.type('a', { delay: 60 });
  await expect
    .poll(async () => (await logoGridFacts(page))?.tiles ?? 0, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(5);
  const dark = await logoGridFacts(page);
  await page.keyboard.press('Escape');
  await expect(ctl(page, 'dialog.logo')).toHaveCount(0, { timeout: 5000 });
  await menuPath(page, 'view', 'view.appearance', 'view.appearance.light').catch(() => undefined);
  if (opened.switched) await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  test.info().annotations.push({ type: 'dark', description: JSON.stringify(dark) });
  expect(dark!.dark, `the dialog is on ink (${dark!.ground})`).toBe(true);
  expect(dark!.halves, 'every tile keeps its paper and ink halves').toBe(dark!.tiles);
});

/**
 * The features round, ship two (docs/FEATURES.md 5.3; the row `shaders.panel.section-groups`): the
 * Shader section's groups in order at both viewports with no field past the panel. The block lands
 * through Insert > Shader when the gallery is on the build, else through the window API (lib.ts
 * `ensureShader`, the matrix's setup); the groups are read by their headings inside
 * `[data-section="shader"]`; the P1 groups Frame and Play in the show are recorded when drawn and
 * judged by their own rows, never here.
 */
const SHADER_GROUPS = [
  'Shader',
  'Preset',
  'Colors',
  'Form',
  'Light and texture',
  'Orientation',
  'Motion',
  'Dither',
  'Advanced',
];
async function shaderSectionFacts(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-control="panel.formatOptions"]');
    const section = document.querySelector('[data-section="shader"]');
    if (!panel || !section) return null;
    const pr = panel.getBoundingClientRect();
    const fields = [...section.querySelectorAll('input, button, select, textarea')].filter(
      (e) => e.getClientRects().length > 0,
    );
    const past = fields
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.right > pr.right + 1 || r.left < pr.left - 1).length;
    const scrollers = [section, ...section.querySelectorAll('*')].filter(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX),
    ).length;
    return {
      fields: fields.length,
      past,
      scrollsX: scrollers,
      panel: `${Math.round(pr.width)} wide`,
      viewport: `${window.innerWidth} by ${window.innerHeight}`,
    };
  });
}
test(title('shaders.panel.section-groups'), async () => {
  test.setTimeout(240_000);
  const facts: string[] = [];
  let skipped: string | null = null;
  for (const person of [wide, laptop]) {
    const { page, deck } = person;
    await openEditor(page, deck);
    const slideId = (await state(page)).slideId;
    const made = await ensureShader(page, slideId);
    if (!(await openShaderSection(page, made.id))) {
      skipped = 'not on this build: formatOptions.shader (docs/FEATURES.md 5.3, B5)';
      break;
    }
    const headings = await shaderGroupHeadings(page);
    const section = await shaderSectionFacts(page);
    /* the nine groups appear in order among the headings read (a subsequence) */
    let at = 0;
    for (const heading of headings) if (heading === SHADER_GROUPS[at]) at += 1;
    const p1 = headings.filter((h) => /^frame$/i.test(h) || /play in the show/i.test(h));
    facts.push(
      `${section?.viewport ?? 'unread'}: ${made.how}; headings ${headings.join(' | ') || 'none'}; ${at} of ${SHADER_GROUPS.length} groups in order; ${section?.fields ?? 0} fields, ${section?.past ?? 'unread'} past the panel (${section?.panel ?? 'unread'}), ${section?.scrollsX ?? 'unread'} horizontal scrollers; P1 groups drawn: ${p1.join(', ') || 'none'}`,
    );
    expect(at, `the groups in order at ${section?.viewport}`).toBe(SHADER_GROUPS.length);
    expect(section?.past, `no field past the panel at ${section?.viewport}`).toBe(0);
    expect(section?.scrollsX, `no horizontal scroll at ${section?.viewport}`).toBe(0);
  }
  test
    .info()
    .annotations.push({ type: 'groups', description: (facts.join('; ') || skipped) ?? '' });
  if (skipped !== null) test.skip(true, skipped);
});

coverage(import.meta.filename, [
  'slides.layout.plate-four-columns',
  'share.dialog.more-row',
  'chrome.toolbar.fold-any-width',
  /* the features round, ship one (docs/FEATURES.md 7.1) */
  'logos.picker.chrome-1280',
  /* the features round, ship two (docs/FEATURES.md 7.1) */
  'shaders.panel.section-groups',
]);
