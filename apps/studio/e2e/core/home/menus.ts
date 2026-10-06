import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { loadavg } from 'node:os';

import { HISTORY, MENUS } from '../../../src/components/home/copy';
import { MINI_MENUS } from '../../../src/components/home/menus.generated';
import type { MiniRow } from '../../../src/components/home/menus.generated';
import { title } from '../lib';
import { bandReady, openHome } from './objects';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.5, 6.7, the second pass). V2's, push
// V2#11: the miniature editor of the menus band. home.menus.bar reads the menu bar against
// `menus.generated.ts` (the editor's model as the build wrote it) in the Mac form and in a Linux
// context, its keys and hover, the Menus key at 390 and the rows the page does not run;
// home.menus.rows runs each row of 2.5's table by pointer or by its shortcut and reads the change
// on the miniature, the hero frame, the kits grid, the show and Version history. Every observation
// is through the page (the page deck's state through `window.tsHomeStore`, read only); /home
// writes no store.

export const ROWS: readonly string[] = ['home.menus.bar', 'home.menus.rows', 'home.menus.readout'];

/** A change shows within this long of its press (6.7 home.menus.rows), read at a load under 24. */
const CHANGE_BOUND_MS = 300;
const LOAD_LINE = 24;

/** The one minute load, and whether an interaction bound may be read now (LANDING.md 4.4). */
function loadReading(): { load: number; read: boolean } {
  const load = Math.round((loadavg()[0] ?? 0) * 10) / 10;
  return { load, read: load < LOAD_LINE };
}

const band = (page: Page): Locator => page.locator('[data-band="menus"]');

/** The page deck as the page holds it (read only). */
type Deck = {
  order: string[];
  skipped: Record<string, true>;
  blocks: { id: string; kind: string; slide: string }[];
  deleted: string[];
  styles: Record<string, { bold?: boolean; underline?: boolean; align?: string; z?: string }>;
  poses: Record<string, { x: number; y: number; w: number; h: number; rot: number }>;
  texts: Record<string, string>;
  kit: string;
  customer: string;
  deckTitle: string;
  notes: Record<string, string>;
  history: { words: string; author: string }[];
};

const deck = (page: Page): Promise<Deck> =>
  page.evaluate(() => (window as unknown as { tsHomeStore: { get(): Deck } }).tsHomeStore.get());

/** The rows a plate draws, in order, as the driver compares them with the model. */
type Drawn = { label: string; rule: boolean; key: string; sub: boolean; run: boolean };

function plateRows(page: Page, depth: number): Promise<Drawn[]> {
  return page.evaluate((d) => {
    const plate = document.querySelector(`[data-band="menus"] [data-mini-plate="${d}"]`);
    if (plate === null) return [];
    const out: Drawn[] = [];
    let rule = false;
    for (const el of plate.children) {
      if (el.getAttribute('role') === 'separator') {
        rule = true;
        continue;
      }
      if (!el.matches('[role^="menuitem"]') || el.classList.contains('is-back')) continue;
      out.push({
        label: el.querySelector('.ts-mini-row-label')?.textContent ?? '',
        rule,
        key: el.querySelector('.ts-mini-row-key')?.textContent ?? '',
        sub: el.getAttribute('aria-haspopup') === 'menu',
        run: el.classList.contains('is-run'),
      });
      rule = false;
    }
    return out;
  }, depth);
}

/** A row the page runs, or a submenu with such a row under it, which reads in ink (2.5, F10). */
const runsUnder = (r: MiniRow): boolean => r.run === true || (r.items ?? []).some(runsUnder);

const expected = (rows: readonly MiniRow[], mac: boolean): Drawn[] =>
  rows.map((r, i) => ({
    label: r.label,
    rule: r.rule === true && i > 0,
    key: r.items === undefined ? ((mac ? r.mac : r.win) ?? '') : '',
    sub: r.items !== undefined,
    run: runsUnder(r),
  }));

/** Opens a row's plate by its path of labels; the last label is hovered or clicked. */
async function openPath(page: Page, path: readonly string[], click = true): Promise<void> {
  const [top, ...rest] = path;
  const titleButton = band(page)
    .locator('.ts-mini-menu', { hasText: top ?? '' })
    .first();
  // with another menu open, a pointer over the title opens this one (2.5) and a click would close
  // it again, as Google's titles do; so the title is hovered first and pressed only when shut
  await titleButton.hover();
  if ((await titleButton.getAttribute('aria-expanded')) !== 'true') await titleButton.click();
  for (const [i, label] of rest.entries()) {
    const row = band(page)
      .locator(`[data-mini-plate="${i}"] .ts-mini-row`)
      .filter({ has: page.locator('.ts-mini-row-label', { hasText: label }) })
      .first();
    if (i < rest.length - 1 || !click) await row.hover();
    // a row the page does not run is `aria-disabled` and still answers a press with its sentence
    // (2.5), so the press does not wait for the row to be enabled
    else await row.click({ force: (await row.getAttribute('aria-disabled')) === 'true' });
  }
}

/**
 * Runs a row by pointer: its plate opened and the row hovered first, then the click timed to the
 * moment `done` holds in the page (bounded at 3 s); returns that time in ms.
 */
async function runRow(page: Page, path: readonly string[], done: string): Promise<number> {
  await openPath(page, path, false);
  const t0 = Date.now();
  await openPath(page, path, true);
  await page.waitForFunction(done, undefined, { timeout: 3000 });
  return Date.now() - t0;
}

function noteBound(what: string, ms: number): void {
  const { load, read } = loadReading();
  test.info().annotations.push({
    type: read ? 'reading' : 'not read: load',
    description: `${what}: ${ms} ms at load ${load}`,
  });
  if (read) expect(ms, `${what} within ${CHANGE_BOUND_MS} ms`).toBeLessThanOrEqual(CHANGE_BOUND_MS);
}

/** The newest Version history row's words, by the store and by the agents band's rows. */
async function newestRow(page: Page): Promise<string> {
  const d = await deck(page);
  return d.history.at(-1)?.words ?? '';
}

const stageSlide = (page: Page): Promise<string> =>
  page.evaluate(
    () =>
      document.querySelector<HTMLElement>('[data-mini-stage] [data-home-slides]')?.dataset[
        'slide'
      ] ?? '',
  );

export function rows(): void {
  test(title('home.menus.bar'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await openHome(browser);
    try {
      await bandReady(page, 'menus');
      const bar = band(page).locator('[data-menubar]');
      await expect(bar).toHaveAttribute('role', 'menubar');
      const titles = bar.locator('.ts-mini-menu');
      expect(await titles.allInnerTexts()).toEqual(MINI_MENUS.map((m) => m.label));
      // a roving tabindex: one title in the Tab order
      expect(
        await titles.evaluateAll(
          (els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length,
        ),
      ).toBe(1);

      // every menu, every submenu, two levels down: the model's rows in the Mac form
      const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
      for (const menu of MINI_MENUS) {
        await openPath(page, [menu.label], true);
        expect(await plateRows(page, 0), menu.label).toEqual(expected(menu.rows, mac));
        expect(
          await band(page)
            .locator(
              '[data-mini-plate="0"] .ts-mini-row-label, [data-mini-plate="0"] .ts-mini-row-key',
            )
            .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length),
          `${menu.label}: labels and keys whole`,
        ).toBe(0);
        for (const row of menu.rows) {
          if (row.items === undefined) continue;
          await openPath(page, [menu.label, row.label], false);
          expect(await plateRows(page, 1), `${menu.label} > ${row.label}`).toEqual(
            expected(row.items, mac),
          );
          for (const sub of row.items) {
            if (sub.items === undefined) continue;
            await openPath(page, [menu.label, row.label, sub.label], false);
            expect(await plateRows(page, 2), `${menu.label} > ${row.label} > ${sub.label}`).toEqual(
              expected(sub.items, mac),
            );
          }
        }
        await page.keyboard.press('Escape');
      }

      // the keys: Right moves between titles, Down opens with the first row focused, Up and Down
      // walk the rows, Escape closes and returns focus to the title
      await titles.first().focus();
      await page.keyboard.press('ArrowRight');
      await expect(titles.nth(1)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(band(page).locator('[data-mini-plate="0"]')).toBeVisible();
      const firstRow = band(page).locator('[data-mini-plate="0"] .ts-mini-row').first();
      await expect(firstRow).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(band(page).locator('[data-mini-plate="0"] .ts-mini-row').nth(1)).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(band(page).locator('[data-mini-plate]')).toHaveCount(0);
      await expect(titles.nth(1)).toBeFocused();
      // with a menu open a pointer over another title opens that one
      await titles.first().click();
      await titles.nth(2).hover();
      await expect(titles.nth(2)).toHaveAttribute('aria-expanded', 'true');
      await expect(titles.first()).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Escape');

      // a row the page does not run: titanium, and the status says the editor runs it
      const notRun = MINI_MENUS[0]?.rows.find((r) => r.run !== true && r.items === undefined);
      expect(notRun).toBeDefined();
      await openPath(page, ['File', notRun?.label ?? ''], false);
      const looks = await page.evaluate(() => {
        const off = document.querySelector<HTMLElement>(
          '[data-band="menus"] [data-mini-plate="0"] .ts-mini-row.is-off:not(:hover)',
        );
        const run = document.querySelector<HTMLElement>(
          '[data-band="menus"] [data-mini-plate="0"] .ts-mini-row.is-run:not(:hover)',
        );
        const titanium = getComputedStyle(document.documentElement)
          .getPropertyValue('--pt-titanium')
          .trim();
        const probe = document.createElement('i');
        probe.style.color = titanium;
        document.body.append(probe);
        const want = getComputedStyle(probe).color;
        probe.remove();
        return {
          off: off === null ? null : getComputedStyle(off).color,
          run: run === null ? null : getComputedStyle(run).color,
          titanium: want,
        };
      });
      expect(looks.off).toBe(looks.titanium);
      expect(looks.run).not.toBe(looks.titanium);
      // a submenu that leads to a row the page runs reads in ink, as the rows it leads to (File >
      // Download for PDF document, File > Version history for Name current version, Insert >
      // Shape for the rectangle and the ellipse); a submenu with none under it reads titanium
      const parents = MINI_MENUS.flatMap((m) =>
        m.rows
          .filter((r) => r.items !== undefined)
          .map((r) => ({ menu: m.label, row: r.label, run: runsUnder(r) })),
      );
      expect(parents.filter((p) => p.run).map((p) => `${p.menu} > ${p.row}`)).toEqual(
        expect.arrayContaining(['File > Download', 'File > Version history', 'Insert > Shape']),
      );
      for (const parent of [
        ...parents.filter((p) => p.run).slice(0, 3),
        ...parents.filter((p) => !p.run).slice(0, 1),
      ]) {
        await openPath(page, [parent.menu], true);
        const color = await band(page)
          .locator('[data-mini-plate="0"] .ts-mini-row.is-sub')
          .filter({ has: page.locator('.ts-mini-row-label', { hasText: parent.row }) })
          .first()
          .evaluate((el) => getComputedStyle(el).color);
        if (parent.run)
          expect(color, `${parent.menu} > ${parent.row} in ink`).not.toBe(looks.titanium);
        else expect(color, `${parent.menu} > ${parent.row} in titanium`).toBe(looks.titanium);
        await page.keyboard.press('Escape');
      }
      await openPath(page, ['File', notRun?.label ?? ''], true);
      await expect(band(page).locator('[data-mini-status]')).toHaveText(
        MENUS.editorRow(notRun?.doc ?? '').trim(),
      );
      const withDoc = MINI_MENUS.flatMap((m) =>
        m.rows.flatMap((r) =>
          (r.items ?? []).map((s) => ({ menu: m.label, row: r.label, sub: s })),
        ),
      ).find((x) => x.sub.run !== true && x.sub.doc !== undefined && x.sub.items === undefined);
      if (withDoc !== undefined) {
        await openPath(page, [withDoc.menu, withDoc.row, withDoc.sub.label], true);
        await expect(band(page).locator('[data-mini-status]')).toHaveText(
          MENUS.editorRow(withDoc.sub.doc ?? '').trim(),
        );
      }
    } finally {
      await context.close();
    }

    // a Linux context: every shortcut in the other form
    const linux = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await linux.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Linux x86_64' });
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => ({ platform: 'Linux' }),
      });
    });
    try {
      const page = await linux.newPage();
      await page.goto('/home');
      await page.locator('main[data-live="ready"]').waitFor({ timeout: 60_000 });
      await bandReady(page, 'menus');
      for (const menu of MINI_MENUS.slice(0, 2)) {
        await openPath(page, [menu.label], true);
        expect(await plateRows(page, 0), `${menu.label} on Linux`).toEqual(
          expected(menu.rows, false),
        );
        await page.keyboard.press('Escape');
      }
    } finally {
      await linux.close();
    }

    // at 390 one Menus key lists the nine menus and drills into one, with a row back
    const phone = await openHome(browser, { width: 390, height: 844 });
    try {
      const { page } = phone;
      await bandReady(page, 'menus');
      await expect(band(page).locator('.ts-mini-menu').first()).toBeHidden();
      const key = band(page).locator('.ts-mini-menus-key');
      await expect(key).toBeVisible();
      await key.click();
      const nine = band(page).locator('[data-mini-plate="0"] .ts-mini-row-label');
      expect(await nine.allInnerTexts()).toEqual(MINI_MENUS.map((m) => m.label));
      // each title reads whole: no label is cut by its column
      expect(
        await nine.evaluateAll(
          (els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
        ),
        'labels cut',
      ).toBe(0);
      await band(page)
        .locator('[data-mini-plate="0"] .ts-mini-row')
        .filter({ hasText: 'Insert' })
        .click();
      const insert = MINI_MENUS.find((m) => m.label === 'Insert');
      expect(await plateRows(page, 0)).toEqual(expected(insert?.rows ?? [], true));
      await band(page).locator('[data-mini-plate="0"] .ts-mini-row.is-back').click();
      expect(await nine.allInnerTexts()).toEqual(MINI_MENUS.map((m) => m.label));
      // a row at 44 px
      const h = await band(page)
        .locator('[data-mini-plate="0"] .ts-mini-row')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(h).toBe(44);
    } finally {
      await phone.context.close();
    }
  });

  test(title('home.menus.rows'), async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await openHome(browser);
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    try {
      await bandReady(page, 'menus');
      const status = band(page).locator('[data-mini-status]');
      const rows0 = (await deck(page)).history.length;
      expect(await stageSlide(page)).toBe('plan');

      // Insert > Text box: the renderer's text block at the centre, typing at once
      const t1 = await runRow(
        page,
        ['Insert', 'Text box'],
        `document.querySelector('[data-mini-stage] [data-inserted="text"] [data-block][data-type="text"][contenteditable="true"]') !== null`,
      );
      noteBound('Insert > Text box', t1);
      await page.keyboard.type('Plan with Northwind', { delay: 20 });
      await page.keyboard.press('Escape');
      let d = await deck(page);
      const text = d.blocks.find((b) => b.kind === 'text');
      expect(text?.slide).toBe('plan');
      expect(d.texts[text?.id ?? '']).toBe('Plan with Northwind');
      expect(d.history.slice(-2).map((r) => r.words)).toEqual([
        HISTORY.inserted('a text box', 2),
        HISTORY.edited('the text', 2),
      ]);
      // the change shows in the hero frame's filmstrip and the miniature's
      for (const where of ['[data-hero-thumb="plan"]', '[data-mini-thumb="plan"]'])
        await expect(page.locator(`${where} [data-inserted="text"]`)).toHaveText(
          'Plan with Northwind',
        );

      // Format > Text > Bold by its shortcut with the box selected; Align & indent > Center
      const box = band(page).locator(`[data-mini-stage] [data-object="${text?.id ?? ''}"]`);
      // Escape left the typing with the box selected and focused, as the editor's does
      await expect(box).toBeFocused();
      await page.keyboard.press('ControlOrMeta+b');
      await expect
        .poll(() => box.locator('[data-block]').evaluate((el) => getComputedStyle(el).fontWeight))
        .toBe('700');
      await page.keyboard.press('ControlOrMeta+Shift+e');
      await expect
        .poll(() => box.locator('[data-block]').evaluate((el) => getComputedStyle(el).textAlign))
        .toBe('center');
      await expect(
        page.locator(`[data-hero-thumb="plan"] [data-object="${text?.id ?? ''}"] [data-block]`),
      ).toHaveCSS('font-weight', '700');

      // Arrange > Rotate clockwise 90° and Center on page > Vertically (the pose)
      const t2 = await runRow(
        page,
        ['Arrange', 'Rotate', 'Rotate clockwise 90°'],
        `(window.tsHomeStore.get().poses['${text?.id ?? ''}'] ?? {}).rot === 90`,
      );
      noteBound('Arrange > Rotate clockwise', t2);
      await runRow(
        page,
        ['Arrange', 'Center on page', 'Vertically'],
        `Math.abs(((window.tsHomeStore.get().poses['${text?.id ?? ''}'] ?? {}).y ?? 0) + ((window.tsHomeStore.get().poses['${text?.id ?? ''}'] ?? {}).h ?? 0) / 2 - 450) < 1`,
      );

      // Edit > Duplicate (Cmd or Ctrl+D) on the selected box, then Edit > Delete (the Delete
      // key) on the copy, which the duplicate leaves selected
      await expect(box).toBeFocused();
      await page.keyboard.press('ControlOrMeta+d');
      await expect.poll(async () => (await deck(page)).blocks.length).toBe(2);
      d = await deck(page);
      const copy = d.blocks.find((b) => b.kind === 'copy');
      expect(copy).toBeDefined();
      await expect(
        band(page).locator(`[data-mini-stage] [data-object="${copy?.id ?? ''}"]`),
      ).toBeFocused();
      await page.keyboard.press('Delete');
      await expect.poll(async () => (await deck(page)).deleted).toEqual([copy?.id]);
      await expect(
        band(page).locator(`[data-mini-stage] [data-object="${copy?.id ?? ''}"]`),
      ).toBeHidden();

      // Insert > Shape > Rectangle: the renderer's shape, selected
      await runRow(
        page,
        ['Insert', 'Shape', 'Rectangle'],
        `document.querySelector('[data-mini-stage] [data-inserted="rect"] svg.shape-rectangle') !== null`,
      );
      await expect(page.locator('.ts-home-sel:not([hidden]) .ts-home-sel-chip')).toHaveText(
        'Shape',
      );

      // Edit > Undo with the band's key, five times: the shape, the delete, the copy, the poses
      for (let i = 0; i < 5; i += 1) await page.keyboard.press('ControlOrMeta+z');
      d = await deck(page);
      expect(d.blocks.map((b) => b.kind)).toEqual(['text']);
      expect(d.deleted).toEqual([]);
      expect(d.poses[text?.id ?? '']).toBeUndefined();
      // Edit > Redo says the page has none
      await openPath(page, ['Edit', 'Redo'], true);
      await expect(status).toHaveText(MENUS.noRedo);

      // Slide > New slide (Ctrl+M) after the shown slide: the blank layout, every counter n / 10
      await band(page).locator('[data-mini-thumb="plan"]').click();
      await page.keyboard.press('Control+m');
      await expect.poll(async () => (await deck(page)).order.length).toBe(10);
      d = await deck(page);
      expect(d.order[2]).toMatch(/^added-/);
      expect(await stageSlide(page)).toBe(d.order[2]);
      expect(
        await page.evaluate(
          () =>
            document
              .querySelector('[data-mini-stage] [data-home-slides] section.slide')
              ?.getAttribute('data-kind') ?? '',
        ),
      ).toBe('content');
      await expect(page.locator('[data-mini-count]')).toHaveText(MENUS.slides(10));
      await expect(page.locator('[data-hero-slide] [data-home-slides]').first()).toHaveAttribute(
        'data-counter',
        '1 / 10',
      );
      // Slide > Skip slide: the filmstrips mark it and the deck leaves it out of the show
      await openPath(page, ['Slide', 'Skip slide'], true);
      await expect(band(page).locator(`[data-mini-thumb="${d.order[2] ?? ''}"]`)).toHaveAttribute(
        'data-skipped',
        '',
      );
      expect((await deck(page)).skipped[d.order[2] ?? '']).toBe(true);
      // the Present list marks it and the show leaves it out (V3#16's list; read when it is there)
      await bandReady(page, 'present');
      const listed = page.locator(`[data-band="present"] [data-slide-row="${d.order[2] ?? ''}"]`);
      if ((await listed.count()) > 0) await expect(listed).toContainText('Skipped');
      else
        test.info().annotations.push({
          type: 'not reached',
          description:
            'Skip slide in the Present list and the show: the list draws no added slide on this tree (V3#16)',
        });
      await bandReady(page, 'menus');
      // Slide > Delete slide: every counter renumbers back to n / 9
      await openPath(page, ['Slide', 'Delete slide'], true);
      await expect.poll(async () => (await deck(page)).order.length).toBe(9);
      await expect(page.locator('[data-mini-count]')).toHaveText(MENUS.slides(9));
      await expect(page.locator('[data-hero-slide] [data-home-slides]').first()).toHaveAttribute(
        'data-counter',
        '1 / 9',
      );

      // Slide > Move slide > Move slide down with focus in the filmstrip (Cmd or Ctrl+Down)
      await band(page).locator('[data-mini-thumb="gets"]').click();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      await expect.poll(async () => (await deck(page)).order.indexOf('gets')).toBe(3);
      expect(await newestRow(page)).toBe(HISTORY.slideMoved(3, 4));

      // Slide > Change theme: the Brand kit's three kits; Kestrel on every slide of the page
      await openPath(page, ['Slide', 'Change theme'], true);
      await band(page).locator('[role="dialog"] [data-kit="kestrel"]').click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('[data-home-slides]')].every(
              (el) => getComputedStyle(el).getPropertyValue('--paper').trim() === '#f3efe6',
            ),
          ),
        )
        .toBe(true);

      // Tools > Tailor for a customer: one name on every slide
      await openPath(page, ['Tools', 'Tailor for a customer'], true);
      await page.keyboard.type('Initech');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await deck(page)).customer).toBe('Initech');
      // the names are set 55 ms apart in reading order (2.7)
      await expect
        .poll(() =>
          page.evaluate(() =>
            [...document.querySelectorAll('[data-home-slides]')].some((el) =>
              (el.textContent ?? '').includes('Northwind'),
            ),
          ),
        )
        .toBe(false);

      // File > Rename: the title rows of the miniature and the hero frame follow
      await openPath(page, ['File', 'Rename'], true);
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('Initech kickoff');
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-mini-title]')).toHaveText('Initech kickoff');
      if ((await page.locator('[data-hero-title]').count()) > 0)
        await expect(page.locator('[data-hero-title]')).toHaveText('Initech kickoff');

      // File > Version history > Name current version
      await openPath(page, ['File', 'Version history', 'Name current version'], true);
      await page.keyboard.type('Kickoff draft');
      await page.keyboard.press('Enter');
      expect(await newestRow(page)).toBe(HISTORY.versionNamed('Kickoff draft'));

      // View > Show speaker notes and Show filmstrip are check rows the page keeps
      await openPath(page, ['View', 'Show speaker notes'], true);
      await expect(band(page).locator('[data-mini-notes]')).toBeHidden();
      await openPath(page, ['View', 'Show speaker notes'], true);
      await expect(band(page).locator('[data-mini-notes]')).toBeVisible();

      // the notes field writes the shown slide's notes
      await band(page).locator('[data-mini-thumb="plan"]').click();
      const notes = band(page).locator('[data-mini-notes]');
      await notes.fill('Ask Initech who reviews each week. Bring the plan.');
      await notes.blur();
      await expect
        .poll(async () => (await deck(page)).notes['plan'])
        .toBe('Ask Initech who reviews each week. Bring the plan.');

      // Help > Search the menus (Option or Alt+/): a row found and run by Enter
      await band(page).locator('[data-mini-thumb="plan"]').focus();
      await page.keyboard.press('Alt+Slash');
      const search = band(page).locator('[role="dialog"] input');
      await expect(search).toBeFocused();
      await search.type('Text box');
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => (await deck(page)).blocks.filter((b) => b.kind === 'text').length)
        .toBe(2);
      await page.keyboard.press('Escape');
      // Help > Keyboard shortcuts lists the rows the page runs with their keys
      await band(page).locator('[data-mini-thumb="plan"]').focus();
      await page.keyboard.press('ControlOrMeta+Slash');
      await expect(band(page).locator('[role="dialog"] .ts-mini-keys li').first()).toBeVisible();
      await page.keyboard.press('Escape');

      // File > Download > PDF Document downloads the page's PDF
      if ((await page.locator('a[data-pdf]').count()) > 0) {
        const download = page.waitForEvent('download', { timeout: 10_000 });
        await openPath(page, ['File', 'Download', 'PDF Document (.pdf)'], true);
        expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
      } else
        test.info().annotations.push({
          type: 'not reached',
          description: 'File > Download > PDF Document: no Download the PDF link on this tree',
        });

      // every change wrote its Version history row: the agents band's rows read the store's
      d = await deck(page);
      expect(d.history.length).toBeGreaterThan(rows0 + 10);
      await bandReady(page, 'agents');
      await expect(page.locator('[data-band="agents"] [data-history-row]').first()).toContainText(
        d.history.at(-1)?.words ?? '',
      );

      // the kits grid draws the deck as it stands
      if ((await page.locator('[data-band="kits"]').count()) > 0) {
        await bandReady(page, 'kits');
        await expect(
          page.locator('[data-band="kits"] [data-kit-grid] [data-inserted="text"]').first(),
        ).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test(title('home.menus.readout'), async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await openHome(browser);
    try {
      await bandReady(page, 'menus');
      expect(await stageSlide(page)).toBe('plan');
      const readout = band(page).locator('[data-mini-readout]');
      /** an object's drawn place in units of its sheet (1,600 across) */
      const placed = (selector: string): Promise<{ x: number; y: number }> =>
        page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          const sheet = el?.closest<HTMLElement>('[data-home-slides]');
          if (el === null || el === undefined || sheet === null || sheet === undefined)
            throw new Error(`no ${sel}`);
          const r = el.getBoundingClientRect();
          const sr = sheet.getBoundingClientRect();
          const k = sr.width / 1600;
          return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k };
        }, selector);

      // slide 2 at rest is a layout slide: no pose, and its heading reads where the layout draws it
      expect(Object.keys((await deck(page)).poses)).toEqual([]);
      const heading = '[data-band="menus"] [data-mini-stage] [data-object="plan#h"]';
      await page.locator(heading).click();
      const h = await placed(heading);
      expect(h.x, 'the heading stands right of the sheet edge').toBeGreaterThan(100);
      expect(h.y, 'the heading stands under the sheet top').toBeGreaterThan(100);
      await expect(readout).toHaveText(MENUS.readout('Heading', h.x, h.y, 0));
      expect(Object.keys((await deck(page)).poses), 'reading the place frees nothing').toEqual([]);

      // Insert > Shape > Rectangle on the layout slide: the readout reads the inserted box's place
      await page.keyboard.press('Escape');
      await openPath(page, ['Insert', 'Shape', 'Rectangle'], true);
      const rect = band(page).locator('[data-mini-stage] [data-inserted="rect"]');
      await expect(rect).toHaveCount(1);
      const at = await rect.evaluate((el) => ({
        x: parseFloat((el as HTMLElement).style.left),
        y: parseFloat((el as HTMLElement).style.top),
      }));
      expect(at.x).toBeGreaterThan(0);
      await expect(readout).toHaveText(MENUS.readout('Shape', at.x, at.y, 0));
      expect(Object.keys((await deck(page)).poses)).toEqual([]);

      // a move turns the slide into a canvas, and the readout follows the store's pose
      await page.keyboard.press('Escape');
      await page.locator(heading).click();
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await deck(page)).poses['plan#h']?.x).toBeDefined();
      const pose = (await deck(page)).poses['plan#h'];
      expect(pose?.x ?? 0).toBeCloseTo(h.x + 1, 0);
      await expect(readout).toHaveText(MENUS.readout('Heading', pose?.x ?? 0, pose?.y ?? 0, 0));
    } finally {
      await context.close();
    }
  });
}
