import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  DEFAULT_MENU_CONTEXT,
  TOOLBAR_HEAD,
  TOOLBAR_TAIL_DEFAULT,
  findItem,
  tooltipDoc,
} from '@turboslide/chrome/menus/model';
import { forbiddenWordsIn } from '@turboslide/chrome/menus/strings';

import { ctl, menuPath, openEditor, state, title } from './lib';

// Lane B3a's rows of Round 1 in core/chrome.spec.ts (docs/NEXT.md 4.1.3 items 20 to 22, 4.1.5):
// the cuts of the clutter audit read in the menu bar a person opens, and the words of the default
// view against the extended forbidden list. The spec file calls
// `chromeMenus()` once with its 1440 by 900 person and spreads the ids into its coverage list, so
// the rows live in one module of the lane and the shared spec file carries three lines of it.
// Each test reads the menus with Tools > Advanced tools off, the default view.

type Row = { id: string; label: string; sub: boolean; role: string | null };

/** The rows a menu element draws at its own level, in order: id, label, whether it opens a submenu. */
async function rowsOf(page: Page, menuElementId: string): Promise<Row[] | null> {
  return page.evaluate((id) => {
    const root = document.getElementById(id);
    if (!root) return null;
    return [...root.querySelectorAll(':scope > .ts-menu-group > [data-menu-item]')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        id: el.getAttribute('data-menu-item') ?? '',
        label: (el.querySelector('.ts-menu-label')?.textContent ?? el.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
        sub: el.getAttribute('aria-haspopup') === 'menu',
        role: el.getAttribute('role'),
      }));
  }, menuElementId);
}

/** Opens a menubar menu and answers its first level rows. */
async function openMenuRows(page: Page, menuId: string): Promise<Row[]> {
  await page.keyboard.press('Escape');
  await ctl(page, `menubar.${menuId}`).click();
  await page.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
  await page.waitForTimeout(250);
  return (await rowsOf(page, `ts-menu-${menuId}`)) ?? [];
}

/** Hovers a row of an open menu and answers the rows of the submenu it opens. */
async function submenuRows(page: Page, parentElementId: string, rowId: string): Promise<Row[]> {
  await ctl(page, `menu.${rowId}`).hover();
  const childId = `${parentElementId}-${rowId}`;
  await page.locator(`[id="${childId}"]`).waitFor({ timeout: 6000 });
  await page.waitForTimeout(250);
  return (await rowsOf(page, childId)) ?? [];
}

async function closeMenus(page: Page): Promise<void> {
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

/** Tools > Advanced tools off, the default view these rows read. */
async function switchOff(page: Page): Promise<void> {
  if ((await state(page)).settings?.['advancedTools'] === true) {
    await menuPath(page, 'tools', 'tools.advancedTools');
    await expect
      .poll(async () => (await state(page)).settings?.['advancedTools'] === true, {
        timeout: 5000,
      })
      .toBe(false);
  }
}

const labels = (rows: Row[]) => rows.map((row) => row.label);

/**
 * Declares the lane's menu rows against the spec file's person at 1440 by 900; returns their ids
 * for the spec file's coverage list.
 */
export function chromeMenus(person: () => { page: Page; deck: string }): string[] {
  test(title('chrome.menus.one-logo-row'), async () => {
    test.setTimeout(120_000);
    const { page, deck } = person();
    await openEditor(page, deck);
    await switchOff(page);
    const insert = await openMenuRows(page, 'insert');
    const image = await submenuRows(page, 'ts-menu-insert', 'insert.image');
    await closeMenus(page);
    const tools = await openMenuRows(page, 'tools');
    await closeMenus(page);
    const format = await openMenuRows(page, 'format');
    const formatDrawn = await page
      .locator('#ts-menu-format [data-menu-item="format.textFitting"]')
      .count();
    await closeMenus(page);
    const slide = await openMenuRows(page, 'slide');
    await closeMenus(page);
    const logoRows = [...insert, ...image].filter((row) => row.label === 'Logo');
    const themeRows = slide.filter((row) => /\btheme\b/i.test(row.label));
    test.info().annotations.push({
      type: 'menus',
      description: `Insert: ${labels(insert).join(', ')}; Insert > Image: ${labels(image).join(', ')}; Tools: ${labels(tools).join(', ')}; Format: ${labels(format).join(', ')}; Slide: ${labels(slide).join(', ')}`,
    });
    expect(
      logoRows.map((row) => row.id),
      'one Logo row in Insert, under Image',
    ).toEqual(['insert.image.logo']);
    expect(insert.map((row) => row.id)).not.toContain('insert.logo');
    expect(labels(tools), 'Tools has no Assist row').not.toContain('Assist');
    expect(tools.map((row) => row.id)).not.toContain('tools.assist');
    expect(labels(format), 'Format has no Text fitting row').not.toContain('Text fitting');
    expect(formatDrawn, 'no Text fitting row anywhere in the open Format menu').toBe(0);
    expect(labels(themeRows), 'Slide has one Theme row').toHaveLength(1);
  });

  test(title('chrome.menus.preferences-named'), async () => {
    test.setTimeout(120_000);
    const { page, deck } = person();
    await openEditor(page, deck);
    await switchOff(page);
    const tools = await openMenuRows(page, 'tools');
    const preferences = await submenuRows(page, 'ts-menu-tools', 'tools.preferences');
    await closeMenus(page);
    test.info().annotations.push({
      type: 'tools',
      description: `Tools: ${labels(tools).join(', ')}; Tools > Preferences: ${labels(preferences).join(', ')}`,
    });
    expect(labels(tools), 'Tools opens on the four named rows').toEqual([
      'Preferences',
      'Tailor for a customer',
      'Check slides',
      'Advanced tools',
    ]);
    expect(tools[0]?.sub, 'Preferences opens a submenu').toBe(true);
    /* no toggle of a group drawn at the first level without the group's name */
    for (const lone of ['Link detection', 'Turn on collaborator announcements'])
      expect(labels(tools), lone).not.toContain(lone);
    expect(labels(preferences)).toEqual([
      'Link detection',
      'Play animated patterns',
      'Appearance',
      'Turn on collaborator announcements',
    ]);
  });

  test(title('chrome.menus.download-four-first'), async () => {
    test.setTimeout(120_000);
    const { page, deck } = person();
    await openEditor(page, deck);
    await switchOff(page);
    await openMenuRows(page, 'file');
    const download = await submenuRows(page, 'ts-menu-file', 'file.download');
    const more = await submenuRows(page, 'ts-menu-file-file.download', 'file.download.more');
    await closeMenus(page);
    test.info().annotations.push({
      type: 'download',
      description: `File > Download: ${labels(download).join(', ')}; More formats: ${labels(more).join(', ')}`,
    });
    expect(labels(download), 'the four Google formats, then More formats').toEqual([
      'Microsoft PowerPoint (.pptx)',
      'PDF Document (.pdf)',
      'JPEG image (.jpg, current slide)',
      'PNG image (.png, current slide)',
      'More formats',
    ]);
    expect(more.map((row) => row.id)).toEqual([
      'file.download.html',
      'file.download.zip',
      'file.download.options',
    ]);
  });

  test(title('chrome.words.no-process-words'), async () => {
    test.setTimeout(300_000);
    const { page, deck } = person();
    await openEditor(page, deck);
    await switchOff(page);
    const texts: { where: string; text: string }[] = [];
    const drawn = new Set<string>();
    /* every menu of the bar, its submenus hovered two levels down; a row whose submenu is a plate
       (the layouts, the shape grids) opens no menu and is read at its own level alone */
    const readLevel = async (elementId: string, depth: number): Promise<void> => {
      const rows = (await rowsOf(page, elementId)) ?? [];
      for (const row of rows) {
        drawn.add(row.id);
        texts.push({ where: row.id, text: row.label });
      }
      if (depth >= 2) return;
      for (const row of rows.filter((r) => r.sub)) {
        const childId = `${elementId}-${row.id}`;
        await ctl(page, `menu.${row.id}`)
          .hover()
          .catch(() => undefined);
        const opened = await page
          .locator(`[id="${childId}"]`)
          .waitFor({ timeout: 1500 })
          .then(() => true)
          .catch(() => false);
        if (opened) await readLevel(childId, depth + 1);
      }
    };
    const menuIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="menubar."]')]
        .filter((el) => el.tagName.toLowerCase() === 'button' && el.getClientRects().length > 0)
        .map((el) => (el.getAttribute('data-control') ?? '').replace('menubar.', '')),
    );
    let slide: Row[] = [];
    for (const id of menuIds) {
      const top = await openMenuRows(page, id);
      if (id === 'slide') slide = top;
      await readLevel(`ts-menu-${id}`, 0);
      await closeMenus(page);
    }
    /* each drawn row's tooltip sentence, the one the plate shows on hover (tooltipDoc) */
    for (const id of drawn) {
      const item = findItem(id);
      const doc = item === undefined ? undefined : tooltipDoc(item, DEFAULT_MENU_CONTEXT);
      if (doc !== undefined) texts.push({ where: `${id} (tooltip)`, text: doc });
    }
    /* the toolbar and the title row as drawn: the labels, the tooltip names and the accessible names */
    const chrome = await page.evaluate(() => {
      const out: { where: string; text: string }[] = [];
      const roots = document.querySelectorAll('.ts-toolbar, .ts-title-row');
      for (const root of roots)
        for (const el of root.querySelectorAll('[data-tip], [aria-label], button')) {
          if (el.getClientRects().length === 0 || el.closest('.pt-slide')) continue;
          const where = el.getAttribute('data-control') ?? el.tagName.toLowerCase();
          for (const text of [
            el.getAttribute('data-tip'),
            el.getAttribute('aria-label'),
            (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          ])
            if (text) out.push({ where, text });
        }
      return out;
    });
    texts.push(...chrome);
    /* the toolbar's own tooltip sentences, for the controls drawn */
    for (const control of [...TOOLBAR_HEAD, ...TOOLBAR_TAIL_DEFAULT]) {
      if (control.doc === undefined) continue;
      if (chrome.some((entry) => entry.where === control.control))
        texts.push({ where: `${control.control} (tooltip)`, text: control.doc });
    }
    const hits = texts
      .map((entry) => ({ ...entry, words: forbiddenWordsIn(entry.text) }))
      .filter((entry) => entry.words.length > 0);
    /* the one noun: the toolbar button, the Slide rows and the panel title */
    const button = ((await ctl(page, 'toolbar.theme').textContent()) ?? '').trim();
    const themeRows = slide.filter((row) => /\btheme\b|brand kit/i.test(row.label));
    await ctl(page, 'toolbar.theme').click();
    await page
      .locator('.ts-rpanel [data-control="panel.brand"]')
      .first()
      .waitFor({ timeout: 8000 });
    await page.waitForTimeout(300);
    const panelTitle = await page.evaluate(
      () =>
        document
          .querySelector(
            '.ts-rpanel h1, .ts-rpanel h2, .ts-rpanel h3, .ts-rpanel [role="heading"], .ts-rpanel .ts-panel-title',
          )
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? null,
    );
    await ctl(page, 'toolbar.theme')
      .click()
      .catch(() => undefined);
    /* the own chip's tooltip name for this visitor, who typed no name */
    const accountTip = await ctl(page, 'title.account').getAttribute('data-tip');
    test.info().annotations.push({
      type: 'words',
      description: `${texts.length} labels, tooltip names and tooltip sentences read over ${drawn.size} menu rows of ${menuIds.length} menus, the toolbar and the title row; hits ${hits.map((h) => `${h.where}: ${h.words.join(', ')} ("${h.text.slice(0, 60)}")`).join('; ') || 'none'}`,
    });
    test.info().annotations.push({
      type: 'theme',
      description: `toolbar "${button}"; Slide rows ${themeRows.map((row) => `"${row.label}"`).join(', ') || 'none'}; panel title "${panelTitle}"; the account tooltip "${accountTip}"`,
    });
    expect(drawn.size, 'the menus were read').toBeGreaterThan(150);
    expect(hits, 'no forbidden word in the default view').toEqual([]);
    expect(button).toBe('Theme');
    expect(themeRows.map((row) => row.label)).toEqual(['Change theme']);
    expect(panelTitle).toBe('Theme');
    expect(accountTip, 'the account tooltip').toBe('You');
  });

  return [
    'chrome.menus.one-logo-row',
    'chrome.menus.preferences-named',
    'chrome.menus.download-four-first',
    'chrome.words.no-process-words',
  ];
}
