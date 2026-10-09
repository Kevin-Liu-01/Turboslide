import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';

import { composite, contrastRatio, parseColor } from '@turboslide/theme/contrast';

import {
  Scratch,
  addSlide,
  clickCard,
  ctl,
  extraHTTPHeaders,
  headingRun,
  invoke,
  isLocalBase,
  menuPath,
  newDeck,
  openEditor,
  placeBlock,
  settled,
  slideOrder,
  state,
  teardownAll,
  title,
  waitRevision,
} from './lib';
import { setAdvancedTools } from '../advanced-tools';
import { chooseOption } from '../choose-option';
import { isCoreId } from './matrix';

// The dropdown round's rows in core/chrome.spec.ts (docs/DROPDOWNS.md 7.2, DD-C#2): the shared
// dropdown (packages/chrome/src/Select.tsx) on every surface that drew a native select, its keys,
// its pointer, its layer over a dialog, its placement, its phone width, its look and the window
// API's set(). The spec file calls `chromeDropdowns()` once and spreads its ids into its coverage
// list; a row registers once its id is in the matrix. Each row runs on a local server (the rows
// write) with a scratch deck of twelve slides holding a line, a table, a chart and a text box,
// made from /new by its owner and torn down through the product. The access page and the Request
// access dialog draw only where sharing is enforced, and the person row's role and expiry fields
// only for an invited account; their dropdowns are read by the S1 lane's rows and unit tests
// (DROPDOWNS.md 7.3), so these rows read the guest owner's surfaces.

type Appearance = 'light' | 'dark';
type Person = {
  context: BrowserContext;
  page: Page;
  scratch: Scratch;
  deck: string;
  slides: string[];
};

/** A trigger by its data-control. */
const triggerOf = (page: Page, control: string): Locator =>
  page.locator(`[data-control="${control}"][role="combobox"]`).first();

/** The list a trigger's aria-controls names. */
async function listOf(page: Page, trigger: Locator): Promise<Locator> {
  const id = await trigger.getAttribute('aria-controls');
  expect(id, 'the trigger names its list').not.toBeNull();
  return page.locator(`[id="${id}"][role="listbox"]`);
}

const people = new Map<string, Person>();

/**
 * The deck the rows read: twelve slides (the Link dialog lists None, four positions and every
 * slide), and on the first slide a line, a table, a chart and a text box for Format options.
 */
async function dropdownDeck(
  page: Page,
  scratch: Scratch,
): Promise<{ deck: string; slides: string[] }> {
  const deck = await newDeck(page, scratch, 'Dropdown rows');
  const first = (await state(page)).slideId;
  for (const block of [
    { id: 'dd-line', type: 'shape', shape: 'line', pos: { x: 120, y: 760, w: 480, h: 40 } },
    {
      id: 'dd-table',
      type: 'table',
      columns: [{}, {}, {}],
      rows: [{ cells: ['A', 'B', 'C'], header: true }, { cells: ['1', '2', '3'] }],
      pos: { x: 120, y: 520, w: 720, h: 160 },
    },
    {
      id: 'dd-chart',
      type: 'chart',
      kind: 'bar',
      categories: ['Q1', 'Q2', 'Q3'],
      series: [{ name: 'Revenue', values: [12, 18, 9] }],
      pos: { x: 1000, y: 360, w: 640, h: 400 },
    },
    { id: 'dd-text', type: 'text', text: 'A text box', pos: { x: 1000, y: 820, w: 640, h: 100 } },
  ])
    await placeBlock(page, first, block);
  /* a thread, so the Comments panel draws its filter (it arrives with the first comment) */
  await invoke(page, 'comment.add', {
    anchor: { kind: 'block', slideId: first, blockId: 'dd-text' },
    body: { text: 'A thread for the filter.', mentions: [] },
  });
  await settled(page);
  for (let i = 0; i < 11; i += 1) await addSlide(page);
  const slides = await slideOrder(page);
  await clickCard(page, first);
  return { deck, slides };
}

/** The owner of a scratch deck in an appearance at a width, made once per worker and kept. */
async function personAt(browser: Browser, appearance: Appearance, width = 1440): Promise<Person> {
  const key = `${appearance}-${width}`;
  const known = people.get(key);
  if (known !== undefined) return known;
  const phone = width < 720;
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height: phone ? 844 : 900 },
    colorScheme: appearance,
    ...(phone ? { hasTouch: true, isMobile: true } : {}),
  });
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('gt-theme', value);
    } catch {
      /* a storage that refuses keeps the system's appearance */
    }
  }, appearance);
  const page = await context.newPage();
  const scratch = new Scratch();
  const { deck, slides } = await dropdownDeck(page, scratch);
  const person = { context, page, scratch, deck, slides };
  people.set(key, person);
  return person;
}

/** Back to the editor with nothing open. */
async function freshEditor(person: Person): Promise<Page> {
  await openEditor(person.page, person.deck);
  return person.page;
}

/** Opens the Share dialog, past the name prompt's Skip when it asks once. */
async function openShare(page: Page): Promise<void> {
  await ctl(page, 'share.open').click();
  const skip = ctl(page, 'dialog.namePrompt.skip');
  if (
    await skip
      .waitFor({ timeout: 2500 })
      .then(() => true)
      .catch(() => false)
  )
    await skip.click();
  await page
    .locator('[data-control="dialog.share.mode"][role="combobox"]:not([disabled])')
    .first()
    .waitFor({ timeout: 30_000 });
}

/** Closes whatever dialog is open with Escape. */
async function closeDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 3 && (await page.locator('.ts-dialog').count()) > 0; i += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

/** The DOM contract of DROPDOWNS.md 3.2 for one closed trigger, as a list of the parts it misses. */
async function contractOf(trigger: Locator): Promise<{ control: string; misses: string[] }> {
  return trigger.evaluate((el) => {
    const misses: string[] = [];
    const want = (ok: boolean, what: string) => {
      if (!ok) misses.push(what);
    };
    want(el.tagName === 'BUTTON', 'a button');
    want(el.classList.contains('ts-dropdown-trigger'), '.ts-dropdown-trigger');
    want(el.getAttribute('aria-haspopup') === 'listbox', 'aria-haspopup listbox');
    want(el.getAttribute('aria-expanded') === 'false', 'aria-expanded false');
    want((el.getAttribute('aria-label') ?? '').trim() !== '', 'an accessible name');
    want(el.hasAttribute('value'), 'a value attribute');
    const list = document.getElementById(el.getAttribute('aria-controls') ?? '');
    want(list?.getAttribute('role') === 'listbox', 'aria-controls naming a listbox');
    const rows = list === null ? [] : [...list.querySelectorAll('[role="option"]')];
    want(rows.length > 0, 'options');
    want(
      rows.every((row) => row.hasAttribute('data-value')),
      'data-value on every option',
    );
    const chosen = rows.filter((row) => row.getAttribute('aria-selected') === 'true');
    const value = el.getAttribute('value') ?? '';
    const carried = rows.some((row) => row.getAttribute('data-value') === value);
    want(
      carried
        ? chosen.length === 1 && chosen[0]?.getAttribute('data-value') === value
        : chosen.length === 0,
      'aria-selected on the chosen option alone',
    );
    return { control: el.getAttribute('data-control') ?? '(none)', misses };
  });
}

/**
 * Reads every dropdown trigger on the page: no select element, each trigger on the contract, a
 * click opens its list in the popover layer, Escape closes it with the value unchanged.
 */
async function everyDropdown(page: Page, surface: string, readings: string[], failures: string[]) {
  const selects = await page.locator('select').count();
  if (selects > 0) failures.push(`${surface}: ${selects} select elements`);
  const triggers = page.locator('[role="combobox"].ts-dropdown-trigger:visible');
  const count = await triggers.count();
  if (count === 0) failures.push(`${surface}: no dropdown drawn`);
  const seen: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const trigger = triggers.nth(i);
    if (await trigger.isDisabled()) continue;
    const { control, misses } = await contractOf(trigger);
    seen.push(control);
    if (misses.length > 0) failures.push(`${surface} ${control}: misses ${misses.join(', ')}`);
    const before = await trigger.getAttribute('value');
    await trigger.click();
    /* a page the server drew answers a click once it has hydrated: a second click a second later */
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await page.waitForTimeout(1000);
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    }
    const list = await listOf(page, trigger);
    const open = await list
      .evaluate((el) => ({
        open: el.matches(':popover-open'),
        layer: (el as HTMLElement).dataset.layer ?? null,
      }))
      .catch(() => ({ open: false, layer: null }));
    if (!open.open || open.layer !== 'popover')
      failures.push(`${surface} ${control}: the list is not open in the popover layer`);
    await trigger.press('Escape');
    const after = {
      expanded: await trigger.getAttribute('aria-expanded'),
      value: await trigger.getAttribute('value'),
    };
    if (after.expanded !== 'false' || after.value !== before)
      failures.push(`${surface} ${control}: Escape left ${JSON.stringify(after)}`);
  }
  readings.push(`${surface}: ${seen.join(', ') || 'none'}`);
}

/** The facts of an open list against its trigger and the viewport. */
async function openFacts(trigger: Locator) {
  return trigger.evaluate((el) => {
    const list = document.getElementById(el.getAttribute('aria-controls') ?? '') as HTMLElement;
    const t = el.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const rows = [...list.querySelectorAll<HTMLElement>('[role="option"]')].map((row) => {
      const r = row.getBoundingClientRect();
      const inView = r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5;
      const first = inView
        ? document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)[0]
        : null;
      return {
        value: row.dataset.value ?? '',
        height: r.height,
        inView,
        first: first === null ? null : Boolean(first && row.contains(first)),
      };
    });
    return {
      trigger: { left: t.left, top: t.top, bottom: t.bottom, width: t.width },
      list: {
        left: l.left,
        right: l.right,
        top: l.top,
        bottom: l.bottom,
        width: l.width,
        height: l.height,
        place: list.dataset.place ?? null,
        layer: list.dataset.layer ?? null,
        open: list.matches(':popover-open'),
        scrollable: list.scrollHeight > list.clientHeight + 1,
        gutter: list.offsetWidth - list.clientWidth - 2,
      },
      rows,
      viewport: { width: innerWidth, height: innerHeight },
      scrollX: document.documentElement.scrollWidth > innerWidth,
      selects: document.querySelectorAll('select').length,
    };
  });
}

/**
 * The calls of one action the page sent while `run` runs: an action goes through the deck action
 * server function, whose body names it as `"action":"<name>"` (escaped once per serialization),
 * or through /api/actions/<name>.
 */
async function writesDuring(page: Page, action: string, run: () => Promise<void>): Promise<number> {
  let count = 0;
  const listen = (request: {
    url: () => string;
    method: () => string;
    postData: () => string | null;
  }) => {
    if (request.method() !== 'POST') return;
    const named = /action\\*"\s*:\s*\\*"([a-zA-Z.]+)/.exec(request.postData() ?? '')?.[1];
    if (named === action || request.url().includes(`/api/actions/${action}`)) count += 1;
  };
  page.on('request', listen);
  try {
    await run();
    await page.waitForTimeout(2000);
  } finally {
    page.off('request', listen);
  }
  return count;
}

/** Selects an object by its block id: a click on its box (a line's is thin), then its handle. */
async function pick(page: Page, blockId: string): Promise<void> {
  await page.keyboard.press('Escape');
  await page
    .locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`)
    .first()
    .click({ force: true });
  await page.waitForTimeout(300);
  /* a click that opened a text session (a second click on a text box) is taken back to the object */
  if (
    await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.isContentEditable === true,
    )
  )
    await page.keyboard.press('Escape');
  await page
    .locator(`.ts-overlay [data-control="handle.${blockId}.move"]`)
    .waitFor({ state: 'attached', timeout: 10_000 });
}

/** Opens Format options for the selected object; its dropdowns carry `formatOptions.` ids. */
async function formatOptions(page: Page): Promise<void> {
  const field = page.locator('[data-control^="formatOptions."][role="combobox"]:visible').first();
  if (!(await field.isVisible().catch(() => false)))
    await ctl(page, 'toolbar.formatOptions').click();
  await field.waitFor({ timeout: 15_000 });
}

/** Opens the Link dialog: Insert > Link with the line selected (a text box opens the popover). */
async function openLinkDialog(page: Page): Promise<void> {
  await pick(page, 'dd-line');
  await menuPath(page, 'insert', 'insert.link');
  await triggerOf(page, 'dialog.link.slide').waitFor({ timeout: 15_000 });
}

/** Opens File > Share > Publish to web (an Advanced tools row) on its Embed tab, where the size is. */
async function openPublishEmbed(page: Page): Promise<void> {
  await setAdvancedTools(page, true);
  await menuPath(page, 'file', 'file.share', 'file.share.publish');
  await ctl(page, 'dialog.publish.tab.embed').click({ timeout: 15_000 });
  const size = triggerOf(page, 'dialog.publish.size');
  if (!(await size.isVisible().catch(() => false))) {
    const publish = ctl(page, 'dialog.publish.publish');
    if (await publish.isVisible().catch(() => false)) await publish.click();
  }
  await size.waitFor({ timeout: 15_000 });
}

/** Opens File > Download > PowerPoint with More options open. */
async function openDownloadMore(page: Page): Promise<void> {
  await menuPath(page, 'file', 'file.download', 'file.download.pptx');
  const more = ctl(page, 'dialog.download.more');
  await more.waitFor({ timeout: 30_000 });
  if ((await more.getAttribute('open')) === null) await more.locator('summary').click();
  await triggerOf(page, 'dialog.download.fonts').waitFor({ timeout: 15_000 });
}

export function chromeDropdowns(): string[] {
  const declared: string[] = [];
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (!isCoreId(id)) return;
    declared.push(id);
    test(title(id), body);
  };

  test.afterAll(async () => {
    test.setTimeout(900_000);
    const failures: string[] = [];
    const all = [...people.values()];
    people.clear();
    await Promise.all(
      all.map(async (person) => {
        try {
          await teardownAll(person.page, person.scratch);
        } catch (error) {
          failures.push(
            error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
          );
        } finally {
          await person.context.close().catch(() => undefined);
        }
      }),
    );
    expect(failures, 'every deck of the dropdown rows is torn down').toEqual([]);
  });

  /* DROPDOWNS.md 2.1: every surface a guest owner reaches draws the shared dropdown, never a
     select, on the contract of 3.2, and each list opens in the popover layer and closes on Escape
     with its value unchanged */
  row('chrome.select.every-site', async ({ browser, baseURL }) => {
    test.skip(!isLocalBase(baseURL ?? ''), 'writes a scratch deck: a local server only');
    test.setTimeout(1_800_000);
    const person = await personAt(browser, 'light');
    const page = person.page;
    const readings: string[] = [];
    const failures: string[] = [];
    const surface = async (name: string, open: () => Promise<void>) => {
      try {
        await open();
        await page.waitForTimeout(400);
        await everyDropdown(page, name, readings, failures);
      } catch (error) {
        failures.push(
          `${name}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      }
      await closeDialogs(page);
    };
    await surface('/decks', async () => {
      await page.goto('/decks');
      await triggerOf(page, 'home.sort').waitFor({ timeout: 60_000 });
    });
    await surface('/print', async () => {
      await page.goto(`/print/${person.deck}`);
      await triggerOf(page, 'print.layout').waitFor({ timeout: 60_000 });
    });
    /* the auth gallery is a local page: a server without TURBOSLIDE_LOCAL_OPEN=1 answers 404
       (dev.auth.tsx galleryOpen), as production does, and the row says so */
    if ((await page.request.get('/dev/auth')).status() === 404)
      readings.push('/dev/auth: closed on this server (404), not read');
    else
      await surface('/dev/auth', async () => {
        await page.goto('/dev/auth');
        await page
          .locator('[data-control^="gallery.pick"][role="combobox"]')
          .first()
          .waitFor({ timeout: 60_000 });
      });
    await freshEditor(person);
    await surface('Share, restricted', () => openShare(page));
    await surface('Share, anyone with the link', async () => {
      await openShare(page);
      await chooseOption(page, 'dialog.share.mode', 'link');
      await triggerOf(page, 'dialog.share.linkRole').waitFor({ timeout: 15_000 });
    });
    await openShare(page);
    await chooseOption(page, 'dialog.share.mode', 'restricted');
    await closeDialogs(page);
    await surface('Download, More options', () => openDownloadMore(page));
    await surface('Insert link', () => openLinkDialog(page));
    await surface('More fonts', async () => {
      await pick(page, 'dd-text');
      await ctl(page, 'toolbar.font').click();
      await ctl(page, 'toolbar.font.more').click();
      await triggerOf(page, 'dialog.moreFonts.category').waitFor({ timeout: 15_000 });
    });
    await surface('Publish to the web', () => openPublishEmbed(page));
    await surface('Special characters', async () => {
      await pick(page, 'dd-text');
      await menuPath(page, 'insert', 'insert.specialCharacters');
      await triggerOf(page, 'dialog.specialCharacters.category').waitFor({ timeout: 15_000 });
    });
    await surface('Comments panel', async () => {
      const slot = page.locator('[data-control="title.comments.slot"] button').first();
      if ((await slot.count()) > 0) await slot.click();
      else await ctl(page, 'title.comments').click();
      await triggerOf(page, 'panel.comments.filter').waitFor({ timeout: 15_000 });
    });
    await page.keyboard.press('Escape');
    await surface('Theme panel', async () => {
      await menuPath(page, 'slide', 'slide.changeTheme');
      await ctl(page, 'panel.brand').waitFor({ timeout: 15_000 });
      await page
        .locator('[data-control^="panel.brand."][role="combobox"]')
        .first()
        .waitFor({ timeout: 15_000 });
    });
    await freshEditor(person);
    for (const block of ['dd-line', 'dd-table', 'dd-chart', 'dd-text'])
      await surface(`Format options, ${block}`, async () => {
        await pick(page, block);
        await formatOptions(page);
      });
    await freshEditor(person);
    await surface('the link popover', async () => {
      const run = await headingRun(page);
      await page
        .locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]`)
        .first()
        .dblclick();
      await page.keyboard.press('ControlOrMeta+k');
      await triggerOf(page, 'popover.link.slide').waitFor({ timeout: 15_000 });
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    test.info().annotations.push({ type: 'surfaces', description: readings.join('; ') });
    expect(failures, 'every surface draws the shared dropdown on its contract').toEqual([]);
  });

  /* DROPDOWNS.md 3.3: the select only combobox's keys, with DOM focus on the trigger throughout */
  row('chrome.select.keyboard', async ({ browser, baseURL }) => {
    test.skip(!isLocalBase(baseURL ?? ''), 'writes a scratch deck: a local server only');
    test.setTimeout(600_000);
    const person = await personAt(browser, 'light');
    const page = await freshEditor(person);
    await openLinkDialog(page);
    const url = ctl(page, 'dialog.link.url');
    const trigger = triggerOf(page, 'dialog.link.slide');
    await trigger.waitFor({ timeout: 15_000 });
    const active = () =>
      trigger.evaluate((el) => {
        const id = el.getAttribute('aria-activedescendant');
        const row = id === null ? null : document.getElementById(id);
        return row?.getAttribute('data-value') ?? null;
      });
    const label = (value: string | null) =>
      trigger.evaluate((el, v) => {
        const list = document.getElementById(el.getAttribute('aria-controls') ?? '');
        return list?.querySelector(`[data-value="${v}"]`)?.getAttribute('data-tip') ?? null;
      }, value);
    const focused = () => trigger.evaluate((el) => document.activeElement === el);
    const steps: string[] = [];
    const focusLog: boolean[] = [];
    const read = async (what: string) => {
      steps.push(`${what}: ${await label(await active())}`);
      focusLog.push(await focused());
    };
    /* Tab from the link field reaches the trigger */
    await url.focus();
    await page.keyboard.press('Tab');
    expect(await focused(), 'Tab from the link field reaches the trigger').toBe(true);
    await page.keyboard.press('ArrowDown');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await read('Down opens');
    expect(await label(await active())).toBe('None');
    for (const key of ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp']) {
      await page.keyboard.press(key);
      await read(key);
    }
    expect(steps[3], 'End reaches the last slide').toMatch(/End: 12\. /);
    expect(steps[4], 'Home reaches None').toBe('Home: None');
    expect(steps[5], 'PageDown moves ten rows').toMatch(/PageDown: 6\. /);
    expect(steps[6], 'PageUp moves back to None').toBe('PageUp: None');
    const typed = async (keys: string, wait = true) => {
      if (wait) await page.waitForTimeout(1100);
      for (const key of keys) await page.keyboard.press(key);
      return label(await active());
    };
    expect(await typed('n'), '"n" from None').toBe('Next slide');
    expect(await typed('n', false), '"n" again').toBe('None');
    expect(await typed('l'), '"l"').toBe('Last slide');
    expect(await typed('pr'), '"pr" within a second').toBe('Previous slide');
    focusLog.push(await focused());
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await trigger.getAttribute('value'), 'Escape changes nothing').toBe('');
    await expect(ctl(page, 'dialog.link')).toBeVisible();
    /* Enter opens and Enter chooses the third slide; the link field empties */
    await url.fill('https://example.com');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    for (let i = 0; i < 7; i += 1) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await trigger.locator('.ts-dropdown-text').textContent()).toMatch(/^3\. /);
    await expect(url).toHaveValue('');
    /* Space opens and Space chooses (after the typing buffer has lapsed) */
    await page.waitForTimeout(1100);
    await page.keyboard.press(' ');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press(' ');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await trigger.locator('.ts-dropdown-text').textContent()).toMatch(/^4\. /);
    /* Alt+Down opens and Alt+Up chooses */
    await page.keyboard.press('Alt+ArrowDown');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await trigger.locator('.ts-dropdown-text').textContent()).toMatch(/^5\. /);
    focusLog.push(await focused());
    /* Tab with the list open chooses the active option and moves the focus on */
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    expect(await trigger.locator('.ts-dropdown-text').textContent()).toMatch(/^6\. /);
    expect(await focused(), 'Tab moved the focus on').toBe(false);
    expect(focusLog.every(Boolean), 'the trigger kept the focus at every step but the last').toBe(
      true,
    );
    await closeDialogs(page);
    /* /print: the disabled handout rows are skipped by Down and by type ahead */
    await page.goto(`/print/${person.deck}`);
    const layout = triggerOf(page, 'print.layout');
    await layout.waitFor({ timeout: 60_000 });
    /* the server draws the trigger before React attaches its keys (the page's hydration mark,
       core/export.spec.ts): keys pressed earlier opened nothing and read no active row */
    await page.waitForSelector('[data-control="print.page"][data-hydrated]', { timeout: 60_000 });
    await layout.focus();
    await page.keyboard.press('ArrowDown');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown');
    const afterDown = await layout.evaluate(
      (el) =>
        document.getElementById(el.getAttribute('aria-activedescendant') ?? '')?.dataset.value,
    );
    await page.waitForTimeout(1100);
    await page.keyboard.press('h');
    const afterH = await layout.evaluate(
      (el) =>
        document.getElementById(el.getAttribute('aria-activedescendant') ?? '')?.dataset.value,
    );
    await page.keyboard.press('Escape');
    expect(afterDown, 'Down stops at the last enabled row').toBe('notes');
    expect(afterH, 'type ahead skips the disabled handout rows').not.toMatch(/^handout/);
    /* Share: Escape on the open list sends nothing and leaves the dialog; a second closes it */
    const share = await freshEditor(person);
    await openShare(share);
    const mode = triggerOf(share, 'dialog.share.mode');
    const writes = await writesDuring(share, 'share.setGeneralAccess', async () => {
      await mode.focus();
      await share.keyboard.press('ArrowDown');
      await share.keyboard.press('ArrowDown');
      await share.keyboard.press('Escape');
    });
    await expect(ctl(share, 'dialog.share')).toBeVisible();
    await share.keyboard.press('Escape');
    await expect(ctl(share, 'dialog.share')).toBeHidden();
    /* the focus after a choice (the keyboard verifier's pass 1 on the round, finding 1): the
       trigger keeps it through the write its choice starts, never the disabled attribute that
       dropped it to the body, and no key a person presses next reaches the table selected behind
       the dialog; a focus put on the body goes back into the dialog */
    await pick(share, 'dd-table');
    const behind = await settled(share);
    await openShare(share);
    const general = triggerOf(share, 'dialog.share.mode');
    await general.focus();
    await share.keyboard.press('ArrowDown');
    await share.keyboard.press('ArrowDown');
    await share.keyboard.press('Enter');
    const during = await general.evaluate((el) => ({
      focused: document.activeElement === el,
      disabled: el.hasAttribute('disabled'),
    }));
    await expect(general).toHaveAttribute('value', 'link');
    await expect(general).not.toHaveAttribute('aria-disabled', 'true');
    const kept = await general.evaluate((el) => document.activeElement === el);
    for (const key of ['Delete', 'Backspace']) await share.keyboard.press(key);
    await share.keyboard.press('z');
    await share.keyboard.press('Escape');
    await share.keyboard.press('Tab');
    const inside = () =>
      share.evaluate(() => {
        const card = document.querySelector('[data-control="dialog.share"]');
        const now = document.activeElement;
        return now !== null && now !== document.body && card?.contains(now) === true;
      });
    const afterTab = await inside();
    await share.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await share.waitForTimeout(200);
    const afterBlur = await inside();
    for (const key of ['Tab', 'Shift+Tab', 'Delete', 'x']) await share.keyboard.press(key);
    const stillInside = await inside();
    /* the chords on a plain button of the dialog (the final pass 1, finding 1): from Done, Cmd+D,
       Cmd+A and Cmd+Z leave the deck behind the dialog, Cmd+/ leaves the dialog, and Shift+Tab
       moves the focus back inside the dialog, neither to Close nor out to the Collaborators list */
    const done = ctl(share, 'dialog.share.done');
    await done.focus();
    for (const key of ['ControlOrMeta+d', 'ControlOrMeta+a', 'ControlOrMeta+z', 'ControlOrMeta+/'])
      await share.keyboard.press(key);
    await share.waitForTimeout(300);
    const onButton = await share.evaluate(() => ({
      share: document.querySelector('[data-control="dialog.share"]') !== null,
      shortcuts: document.querySelector('.ts-shortcuts') !== null,
      done: document.activeElement?.getAttribute('data-control') ?? null,
    }));
    await share.keyboard.press('Shift+Tab');
    await share.waitForTimeout(300);
    const back = await share.evaluate(() => {
      const card = document.querySelector('[data-control="dialog.share"]');
      const now = document.activeElement;
      return {
        control: now?.getAttribute('data-control') ?? now?.tagName ?? null,
        inside: now !== null && card?.contains(now) === true,
        roster: document.querySelector('#ts-menu-roster') !== null,
      };
    });
    await chooseOption(share, 'dialog.share.mode', 'restricted');
    await closeDialogs(share);
    const after = await settled(share);
    const table = await share
      .locator('.ts-stagewrap.ts-editor .pt-slide [data-block="dd-table"]')
      .count();
    test.info().annotations.push({
      type: 'keys',
      description: `${steps.join('; ')}; print Down ${afterDown}, h ${afterH}; Share Escape writes ${writes}; Share choice by Enter: focused ${during.focused}, disabled attribute ${during.disabled}, focused after the write ${kept}; after Tab inside ${afterTab}, after a blur inside ${afterBlur}, after Tab, Shift+Tab, Delete, x inside ${stillInside}; on Done after Cmd+D, Cmd+A, Cmd+Z, Cmd+/: Share ${onButton.share}, Keyboard shortcuts ${onButton.shortcuts}, focus ${onButton.done}; Shift+Tab to ${back.control}, inside ${back.inside}, Collaborators list ${back.roster}; behind the dialog: revision ${behind.revision} to ${after.revision}, selected ${behind.blockId} to ${after.blockId}, table ${table}`,
    });
    expect(writes, 'Escape sends no share.setGeneralAccess').toBe(0);
    expect(during, 'the trigger keeps the focus while its write runs').toEqual({
      focused: true,
      disabled: false,
    });
    expect(kept, 'and after the write').toBe(true);
    expect(afterTab, 'Tab moves inside the dialog').toBe(true);
    expect(afterBlur, 'a focus put on the body goes back into the dialog').toBe(true);
    expect(stillInside, 'the keys after it stay in the dialog').toBe(true);
    expect(onButton, 'the chords on Done leave the dialog open and focused').toEqual({
      share: true,
      shortcuts: false,
      done: 'dialog.share.done',
    });
    expect(back.inside, 'Shift+Tab from Done stays in the dialog').toBe(true);
    expect(back.control, 'Shift+Tab from Done goes back, not to Close').not.toMatch(
      /^dialog\.share\.(close|done)$/,
    );
    expect(back.roster, 'Shift+Tab from Done opens no Collaborators list').toBe(false);
    expect(after.revision, 'nothing written to the deck behind the dialog').toBe(behind.revision);
    expect(after.blockId, 'the selection behind the dialog unchanged').toBe('dd-table');
    expect(table, 'the selected table stays').toBe(1);
    /* a focus move from a control that changes the dialog as it loses the focus lands where the
       person aimed (the keyboard verifier's final pass 2 on the round, F1: the card moved the
       focus in the middle of the browser's move, and Shift+Tab from the expiry field reached
       Settings, a click into Add people by email lost the typed address, and Tab from the Image
       by URL address reached Close) */
    const focusedControl = () =>
      share.evaluate(() => document.activeElement?.getAttribute('data-control') ?? null);
    await openShare(share);
    const more = ctl(share, 'dialog.share.more');
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
    const guest = 'dd-keys-guest@example.test';
    const emails = ctl(share, 'dialog.share.emails');
    await emails.fill(guest);
    await ctl(share, 'dialog.share.send').click();
    const guestRole = triggerOf(share, `dialog.share.grant.${guest}.role`);
    await guestRole.waitFor({ timeout: 15_000 });
    await expect(guestRole).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });
    const openExpiry = async () => {
      await guestRole.focus();
      for (const key of ['ArrowDown', 'End', 'ArrowUp', 'Enter']) await share.keyboard.press(key);
      const expiry = triggerOf(share, `dialog.share.grant.${guest}.expiry`);
      await expiry.waitFor({ timeout: 10_000 });
      await expiry.focus();
    };
    await openExpiry();
    await share.keyboard.press('Shift+Tab');
    await share.waitForTimeout(300);
    const fromExpiry = await focusedControl();
    await openExpiry();
    await emails.click();
    await share.keyboard.type('pat@example.test');
    await share.waitForTimeout(300);
    const clicked = { focus: await focusedControl(), value: await emails.inputValue() };
    await emails.fill('');
    /* the guest leaves again: Remove access, with the browser's confirmation accepted */
    share.once('dialog', (dialog) => void dialog.accept());
    await guestRole.focus();
    for (const key of ['ArrowDown', 'End', 'Enter']) await share.keyboard.press(key);
    await expect(share.locator(`li[data-control="dialog.share.grant.${guest}"]`)).toHaveCount(0, {
      timeout: 15_000,
    });
    await closeDialogs(share);
    await menuPath(share, 'insert', 'insert.image', 'insert.image.byUrl');
    await ctl(share, 'dialog.imageByUrl.url').waitFor({ timeout: 10_000 });
    await share.keyboard.type('https://example.test/picture.png');
    await share.keyboard.press('Tab');
    await share.waitForTimeout(300);
    const fromAddress = await focusedControl();
    await closeDialogs(share);
    test.info().annotations.push({
      type: 'moves',
      description: `Shift+Tab from the expiry field to ${fromExpiry}; a click into Add people by email from the expiry field: focus ${clicked.focus}, value "${clicked.value}"; Tab from the typed Image by URL address to ${fromAddress}`,
    });
    expect(fromExpiry, 'Shift+Tab from the expiry field reaches the role field above it').toBe(
      `dialog.share.grant.${guest}.role`,
    );
    expect(clicked, 'a click from the expiry field into the email field keeps the typing').toEqual({
      focus: 'dialog.share.emails',
      value: 'pat@example.test',
    });
    expect(fromAddress, 'Tab from the typed address reaches Cancel').toBe(
      'dialog.imageByUrl.cancel',
    );
  });

  /* DROPDOWNS.md 3.4, 3.5: the pointer in the Share dialog and inside the Download dialog's label */
  row('chrome.select.pointer', async ({ browser, baseURL }) => {
    test.skip(!isLocalBase(baseURL ?? ''), 'writes a scratch deck: a local server only');
    test.setTimeout(600_000);
    const person = await personAt(browser, 'light');
    const page = await freshEditor(person);
    await openShare(page);
    const mode = triggerOf(page, 'dialog.share.mode');
    await mode.click();
    const list = await listOf(page, mode);
    const facts = await openFacts(mode);
    expect(Math.abs(facts.list.left - facts.trigger.left), 'left edges').toBeLessThanOrEqual(1);
    expect(facts.list.width, 'at least the trigger wide').toBeGreaterThanOrEqual(
      facts.trigger.width - 0.5,
    );
    expect(facts.list.top, 'under the trigger').toBeGreaterThanOrEqual(facts.trigger.bottom);
    const chosen = list.locator('[role="option"][aria-selected="true"]');
    await expect(chosen).toHaveAttribute('data-value', 'restricted');
    await expect(chosen.locator('.ts-menu-check svg')).toBeVisible();
    const link = list.locator('[data-value="link"]');
    await link.hover();
    const lit = await link.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--pt-plate)';
      el.append(probe);
      const plate = getComputedStyle(probe).color;
      probe.remove();
      return { ground: getComputedStyle(el).backgroundColor, plate };
    });
    expect(parseColor(lit.ground), 'the hovered row draws --pt-plate').toEqual(
      parseColor(lit.plate),
    );
    const choose = await writesDuring(page, 'share.setGeneralAccess', () => link.click());
    await expect(mode).toHaveAttribute('aria-expanded', 'false');
    await expect(mode).toHaveAttribute('value', 'link');
    await expect(triggerOf(page, 'dialog.share.linkRole')).toBeVisible();
    expect(choose, 'one share.setGeneralAccess').toBe(1);
    const toggle = await writesDuring(page, 'share.setGeneralAccess', async () => {
      await mode.click();
      await expect(mode).toHaveAttribute('aria-expanded', 'true');
      await mode.click();
      await expect(mode).toHaveAttribute('aria-expanded', 'false');
      await mode.click();
      /* the dialog's title: the open list covers the sentence under the field */
      await page.locator('[data-control="dialog.share"] .ts-dialog-title').click();
      await expect(mode).toHaveAttribute('aria-expanded', 'false');
    });
    expect(toggle, 'the open trigger and the sentence send nothing').toBe(0);
    await expect(ctl(page, 'dialog.share')).toBeVisible();
    await chooseOption(page, 'dialog.share.mode', 'restricted');
    await closeDialogs(page);
    /* the Download dialog's Appearance inside its label: a click on Dark stays closed */
    await openDownloadMore(page);
    const appearance = triggerOf(page, 'dialog.download.theme');
    await appearance.click();
    await (await listOf(page, appearance)).locator('[data-value="dark"]').click();
    await page.waitForTimeout(500);
    await expect(appearance).toHaveAttribute('aria-expanded', 'false');
    await expect(appearance.locator('.ts-dropdown-text')).toHaveText('Dark');
    test.info().annotations.push({
      type: 'pointer',
      description: `list ${JSON.stringify(facts.list)} under trigger ${JSON.stringify(facts.trigger)}; writes on choosing ${choose}, on the open trigger and the sentence ${toggle}`,
    });
    await closeDialogs(page);
  });

  /* DROPDOWNS.md 3.6 and DESIGN.md 2.2: the list over the dialog card and its scrim */
  row('chrome.select.over-dialog', async ({ browser, baseURL }) => {
    test.skip(!isLocalBase(baseURL ?? ''), 'writes a scratch deck: a local server only');
    test.setTimeout(600_000);
    const readings: string[] = [];
    for (const appearance of ['light', 'dark'] as const) {
      const person = await personAt(browser, appearance);
      const page = await freshEditor(person);
      await openShare(page);
      const mode = triggerOf(page, 'dialog.share.mode');
      await mode.click();
      const facts = await openFacts(mode);
      readings.push(
        `${appearance}: ${JSON.stringify(facts.list)} rows ${JSON.stringify(facts.rows)}`,
      );
      expect(facts.list.open, `${appearance}: :popover-open`).toBe(true);
      expect(facts.list.layer, `${appearance}: the popover layer`).toBe('popover');
      for (const each of facts.rows)
        expect(each.first, `${appearance}: ${each.value} first at its centre`).toBe(true);
      await mode.press('Escape');
      await closeDialogs(page);
      /* the Fonts list inside More options draws whole and choosing keeps the dialog */
      await openDownloadMore(page);
      const fonts = triggerOf(page, 'dialog.download.fonts');
      await fonts.click();
      const whole = await openFacts(fonts);
      readings.push(`${appearance} Fonts: ${JSON.stringify(whole.list)}`);
      for (const each of whole.rows)
        expect(each.first, `${appearance}: Fonts ${each.value} first at its centre`).toBe(true);
      expect(whole.list.scrollable, `${appearance}: the Fonts list draws whole`).toBe(false);
      await (await listOf(page, fonts)).locator('[data-value="exact"]').click();
      await expect(fonts).toHaveAttribute('value', 'exact');
      await expect(ctl(page, 'dialog.download.more')).toBeVisible();
      await closeDialogs(page);
    }
    test.info().annotations.push({ type: 'layers', description: readings.join('; ') });
  });

  /* DROPDOWNS.md 3.6: the flip near the bottom, the margins, the ten row cap, the width, the
     close on a panel scroll and the follow on a resize */
  row('chrome.select.placement', async ({ browser, baseURL }) => {
    test.skip(!isLocalBase(baseURL ?? ''), 'writes a scratch deck: a local server only');
    test.setTimeout(600_000);
    const person = await personAt(browser, 'light');
    const page = person.page;
    const readings: string[] = [];
    const inside = (f: Awaited<ReturnType<typeof openFacts>>) =>
      f.list.left >= 7.5 &&
      f.list.top >= 7.5 &&
      f.list.right <= f.viewport.width - 7.5 &&
      f.list.bottom <= f.viewport.height - 7.5;
    await page.setViewportSize({ width: 1440, height: 600 });
    try {
      await freshEditor(person);
      await pick(page, 'dd-line');
      await formatOptions(page);
      const end = triggerOf(page, 'formatOptions.line.end');
      await end.waitFor({ timeout: 15_000 });
      /* the trigger within 120 px of the bottom: the panel scrolled until it is */
      await end.evaluate((el) => {
        let node: HTMLElement | null = el.parentElement;
        while (node && node.scrollHeight <= node.clientHeight + 1) node = node.parentElement;
        if (!node) return;
        const r = el.getBoundingClientRect();
        node.scrollTop += r.bottom - (innerHeight - 60);
      });
      await page.waitForTimeout(300);
      await end.click();
      const flipped = await openFacts(end);
      readings.push(
        `Line end: ${JSON.stringify({ trigger: flipped.trigger, list: flipped.list })}`,
      );
      expect(flipped.trigger.bottom, 'the trigger within 120 px of the bottom').toBeGreaterThan(
        600 - 120,
      );
      expect(flipped.list.place, 'the list flips above').toBe('above');
      expect(inside(flipped), 'inside the viewport by 8 px').toBe(true);
      expect(flipped.list.width).toBeGreaterThanOrEqual(flipped.trigger.width - 0.5);
      expect(flipped.list.width).toBeLessThanOrEqual(Math.max(320, flipped.trigger.width) + 0.5);
      /* a scroll the page makes itself (a layout, scroll anchoring, a smooth scroll already
         running) leaves the list open on its trigger (the keyboard verifier's pass 1 on the
         round, finding 5); the person's wheel over the panel closes it with no change */
      const value = await end.getAttribute('value');
      /* the panel scrolls 40 px toward the side it has room on, and the wheel turns back the way
         it came, where it has at least those 40 px */
      const made = await end.evaluate((el) => {
        let node: HTMLElement | null = el.parentElement;
        while (node && node.scrollHeight <= node.clientHeight + 1) node = node.parentElement;
        if (!node) return { sign: 0, moved: 0 };
        const sign = node.scrollHeight - node.clientHeight - node.scrollTop >= 40 ? 1 : -1;
        const from = node.scrollTop;
        node.scrollTop += sign * 40;
        return { sign, moved: node.scrollTop - from };
      });
      await page.waitForTimeout(300);
      const followed = await openFacts(end);
      readings.push(
        `after a scroll of ${made.moved} px the page made: ${JSON.stringify({ trigger: followed.trigger, list: { open: followed.list.open, top: followed.list.top, bottom: followed.list.bottom } })}`,
      );
      expect(Math.abs(made.moved), 'the panel scrolled').toBeGreaterThan(0);
      expect(followed.list.open, 'a scroll the page made leaves the list open').toBe(true);
      expect(
        Math.abs(followed.list.left - followed.trigger.left),
        'on its trigger after the scroll',
      ).toBeLessThanOrEqual(1);
      const at = (await end.boundingBox())!;
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.wheel(0, -made.sign * 120);
      await expect(end).toHaveAttribute('aria-expanded', 'false');
      expect(await end.getAttribute('value'), 'the scroll changes nothing').toBe(value);
      await page.keyboard.press('Escape');
      /* the Link dialog's seventeen options: 288 px at most, scrolling, the active row in view */
      await openLinkDialog(page);
      const slide = triggerOf(page, 'dialog.link.slide');
      await slide.click();
      const tall = await openFacts(slide);
      readings.push(`Link: ${JSON.stringify(tall.list)} ${tall.rows.length} rows`);
      expect(tall.rows.length, 'None, four positions and twelve slides').toBe(17);
      expect(tall.list.height, 'ten rows at most').toBeLessThanOrEqual(288.5);
      expect(tall.list.scrollable, 'the list scrolls').toBe(true);
      expect(inside(tall), 'inside the viewport by 8 px').toBe(true);
      for (const key of ['PageDown', 'PageDown']) {
        await slide.press(key);
        const seen = await slide.evaluate((el) => {
          const list = document.getElementById(el.getAttribute('aria-controls') ?? '')!;
          const row = document.getElementById(el.getAttribute('aria-activedescendant') ?? '')!;
          const l = list.getBoundingClientRect();
          const r = row.getBoundingClientRect();
          return r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5;
        });
        expect(seen, `${key}: the active row in view`).toBe(true);
      }
      await slide.press('Escape');
      await closeDialogs(page);
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    /* a resize from 1440 to 900 keeps an open Share list in the viewport and under its trigger */
    await openShare(page);
    const mode = triggerOf(page, 'dialog.share.mode');
    await mode.click();
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(600);
    const resized = await openFacts(mode);
    await page.setViewportSize({ width: 1440, height: 900 });
    readings.push(
      `Share at 900: ${JSON.stringify({ trigger: resized.trigger, list: resized.list })}`,
    );
    test.info().annotations.push({ type: 'placement', description: readings.join('; ') });
    expect(resized.list.open, 'the list stays open through the resize').toBe(true);
    expect(inside(resized), 'inside the viewport at 900').toBe(true);
    expect(
      Math.abs(resized.list.left - resized.trigger.left),
      'under its trigger at 900',
    ).toBeLessThanOrEqual(1);
    expect(resized.list.top, 'under its trigger at 900').toBeGreaterThanOrEqual(
      resized.trigger.bottom,
    );
    await closeDialogs(page);
  });

  /* DROPDOWNS.md 3.8: the same list at 390 with touch */
  row('chrome.select.phone', async ({ browser, baseURL }) => {
    test.skip(!isLocalBase(baseURL ?? ''), 'writes a scratch deck: a local server only');
    test.setTimeout(600_000);
    const readings: string[] = [];
    for (const appearance of ['light', 'dark'] as const) {
      const person = await personAt(browser, appearance, 390);
      const page = await freshEditor(person);
      await openShare(page);
      const mode = triggerOf(page, 'dialog.share.mode');
      await mode.tap();
      const facts = await openFacts(mode);
      readings.push(
        `${appearance}: ${JSON.stringify({ trigger: facts.trigger, list: facts.list, scrollX: facts.scrollX, selects: facts.selects })}`,
      );
      expect(facts.list.left, `${appearance}: 8 px from the left`).toBeGreaterThanOrEqual(7.5);
      expect(facts.list.right, `${appearance}: 8 px from the right`).toBeLessThanOrEqual(390 - 7.5);
      expect(facts.list.width).toBeGreaterThanOrEqual(facts.trigger.width - 0.5);
      for (const each of facts.rows)
        expect(each.height, `${appearance}: ${each.value} row`).toBeGreaterThanOrEqual(28);
      expect(facts.scrollX, `${appearance}: no horizontal scroll`).toBe(false);
      expect(facts.selects, `${appearance}: no select element`).toBe(0);
      const writes = await writesDuring(page, 'share.setGeneralAccess', async () => {
        await (await listOf(page, mode)).locator('[data-value="link"]').tap();
      });
      expect(writes, `${appearance}: a tap writes once`).toBe(1);
      await expect(mode).toHaveAttribute('value', 'link');
      await chooseOption(page, 'dialog.share.mode', 'restricted');
      await closeDialogs(page);
    }
    test.info().annotations.push({ type: 'phone', description: readings.join('; ') });
  });

  /* DESIGN.md 3.1, 3.2, 4.5, 5.3: the trigger's and the list's look in both appearances */
  row('chrome.select.look', async ({ browser, baseURL }) => {
    test.skip(!isLocalBase(baseURL ?? ''), 'writes a scratch deck: a local server only');
    test.setTimeout(600_000);
    const readings: string[] = [];
    for (const [appearance, width] of [
      ['light', 1440],
      ['dark', 1440],
      ['light', 390],
      ['dark', 390],
    ] as const) {
      const person = await personAt(browser, appearance, width);
      const page = await freshEditor(person);
      await openShare(page);
      const mode = triggerOf(page, 'dialog.share.mode');
      await mode.click();
      /* the pointer off the trigger: a hovered trigger draws its boundary in --pt-ink-2 */
      await page.mouse.move(4, 4);
      const look = await mode.evaluate((el) => {
        const list = document.getElementById(el.getAttribute('aria-controls') ?? '') as HTMLElement;
        const token = (name: string) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${name})`;
          list.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        };
        const t = getComputedStyle(el);
        const l = getComputedStyle(list);
        const row =
          list.querySelector<HTMLElement>('[role="option"].is-active') ??
          list.querySelector<HTMLElement>('[role="option"]')!;
        const quiet =
          [...list.querySelectorAll<HTMLElement>('[role="option"]')].find((r) => r !== row) ?? row;
        const r = getComputedStyle(row);
        return {
          trigger: {
            height: el.getBoundingClientRect().height,
            radius: t.borderRadius,
            border: `${t.borderTopWidth} ${t.borderTopColor}`,
            ground: t.backgroundColor,
            ink: t.color,
            font: t.fontFamily.split(',')[0],
            numerals: t.fontVariantNumeric,
            chevron: el.querySelector('.ts-dropdown-chevron svg') !== null,
          },
          list: {
            radius: l.borderRadius,
            border: `${l.borderTopWidth} ${l.borderTopColor}`,
            shadow: l.boxShadow,
          },
          row: {
            height: row.getBoundingClientRect().height,
            radius: r.borderRadius,
            numerals: r.fontVariantNumeric,
            litGround: r.backgroundColor,
            litInk: r.color,
            quietInk: getComputedStyle(quiet).color,
          },
          tokens: {
            field: token('--pt-field'),
            paper: token('--pt-paper'),
            ink: token('--pt-ink'),
            edge: token('--pt-edge'),
            plate: token('--pt-plate'),
          },
        };
      });
      readings.push(`${appearance} ${width}: ${JSON.stringify(look)}`);
      const where = `${appearance} ${width}`;
      expect(look.trigger.height, `${where}: 32 px`).toBeCloseTo(32, 0);
      expect(look.trigger.radius, `${where}: 6 px`).toBe('6px');
      expect(look.trigger.border, `${where}: the field boundary`).toBe(`1px ${look.tokens.field}`);
      expect(look.trigger.ground).toBe(look.tokens.paper);
      expect(look.trigger.ink).toBe(look.tokens.ink);
      expect(look.trigger.font).toMatch(/Inter/);
      expect(look.trigger.numerals).toMatch(/tabular-nums/);
      expect(look.trigger.chevron).toBe(true);
      expect(look.list.radius).toBe('6px');
      expect(look.list.border).toBe(`1px ${look.tokens.edge}`);
      expect(look.list.shadow, `${where}: a ring with no blur or offset`).toMatch(
        /^rgba?\([^)]*\) 0px 0px 0px 1px, rgba?\([^)]*\) 0px 0px 0px 2px$/,
      );
      expect(look.row.height).toBeCloseTo(28, 0);
      expect(look.row.radius).toBe('0px');
      expect(look.row.numerals).toMatch(/tabular-nums/);
      expect(look.row.litGround).toBe(look.tokens.plate);
      expect(
        contrastRatio(look.row.quietInk, look.tokens.paper),
        `${where}: row text on paper`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        /* the plate is translucent in the dark appearance: composited over the paper */
        contrastRatio(
          look.row.litInk,
          composite(parseColor(look.tokens.plate)!, parseColor(look.tokens.paper)!),
        ),
        `${where}: lit ink on the plate`,
      ).toBeGreaterThanOrEqual(4.5);
      await mode.press('Escape');
      await closeDialogs(page);
    }
    /* the compact trigger: Format options of the table, 22 px */
    const person = await personAt(browser, 'light');
    const page = await freshEditor(person);
    await pick(page, 'dd-table');
    await formatOptions(page);
    const compact = page
      .locator('[data-control^="formatOptions."][role="combobox"].is-compact')
      .first();
    await compact.waitFor({ timeout: 15_000 });
    const height = await compact.evaluate((el) => el.getBoundingClientRect().height);
    readings.push(`compact ${height}`);
    expect(height, 'the compact trigger is 22 px').toBeCloseTo(22, 0);
    /* tabular figures: "480" and "960" of the Publish size list measure the same width */
    await openPublishEmbed(page);
    const size = triggerOf(page, 'dialog.publish.size');
    await size.click();
    const widths = await size.evaluate((el) => {
      const list = document.getElementById(el.getAttribute('aria-controls') ?? '')!;
      const measure = (digits: string) => {
        const row = [...list.querySelectorAll<HTMLElement>('.ts-menu-label')].find((label) =>
          label.textContent?.includes(digits),
        );
        if (!row) return null;
        const range = document.createRange();
        const node = row.firstChild!;
        const at = (node.textContent ?? '').indexOf(digits);
        range.setStart(node, at);
        range.setEnd(node, at + digits.length);
        return range.getBoundingClientRect().width;
      };
      return { small: measure('480'), medium: measure('960') };
    });
    readings.push(`figures ${JSON.stringify(widths)}`);
    expect(widths.small, 'the 480 of Small').not.toBeNull();
    expect(widths.small).toBeCloseTo(widths.medium ?? 0, 1);
    await size.press('Escape');
    await closeDialogs(page);
    /* forced colours (Windows High Contrast, emulated): the active option takes the system's
       Highlight pair, the chosen row keeps its check, and the focused trigger's ring stands
       outside its border (the keyboard verifier's pass 1 on the round, finding 2: the active
       option was invisible and a focused trigger looked unfocused) */
    await page.emulateMedia({ forcedColors: 'active' });
    try {
      await openShare(page);
      const mode = triggerOf(page, 'dialog.share.mode');
      await mode.focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      const forced = await mode.evaluate((el) => {
        const list = document.getElementById(el.getAttribute('aria-controls') ?? '')!;
        const system = (name: string) => {
          const probe = document.createElement('span');
          probe.style.cssText = `forced-color-adjust: none; color: ${name}`;
          document.body.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        };
        const active = document.getElementById(el.getAttribute('aria-activedescendant') ?? '')!;
        const chosen = list.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')!;
        const check = chosen.querySelector<SVGElement>('.ts-menu-check svg');
        const a = getComputedStyle(active);
        const t = getComputedStyle(el);
        return {
          matches: matchMedia('(forced-colors: active)').matches,
          highlight: system('Highlight'),
          highlightText: system('HighlightText'),
          canvas: getComputedStyle(list).backgroundColor,
          active: {
            value: active.dataset.value ?? null,
            ground: a.backgroundColor,
            ink: a.color,
            label: getComputedStyle(active.querySelector('.ts-menu-label')!).color,
          },
          chosen: {
            value: chosen.dataset.value ?? null,
            check:
              check === null
                ? null
                : {
                    fill: getComputedStyle(check).fill,
                    width: check.getBoundingClientRect().width,
                  },
          },
          ring: {
            style: t.outlineStyle,
            width: t.outlineWidth,
            offset: t.outlineOffset,
            color: t.outlineColor,
            border: t.borderTopWidth,
          },
        };
      });
      await page.keyboard.press('Escape');
      const closedRing = await mode.evaluate((el) => {
        const t = getComputedStyle(el);
        return {
          focused: document.activeElement === el,
          width: t.outlineWidth,
          offset: t.outlineOffset,
        };
      });
      readings.push(
        `forced colours ${JSON.stringify(forced)} closed ${JSON.stringify(closedRing)}`,
      );
      expect(forced.matches, 'forced colours emulated').toBe(true);
      expect(forced.active.value).toBe('link');
      expect(forced.active.ground, 'the active option: Highlight').toBe(forced.highlight);
      expect(forced.active.ink, 'its ink: HighlightText').toBe(forced.highlightText);
      expect(forced.active.label).toBe(forced.highlightText);
      expect(
        contrastRatio(forced.active.ink, forced.active.ground),
        'HighlightText on Highlight',
      ).toBeGreaterThanOrEqual(4.5);
      expect(forced.chosen.value).toBe('restricted');
      expect(forced.chosen.check?.width ?? 0, 'the chosen row draws its check').toBeGreaterThan(0);
      expect(
        contrastRatio(forced.chosen.check?.fill ?? forced.canvas, forced.canvas),
        'the check on the list ground',
      ).toBeGreaterThanOrEqual(3);
      expect(forced.ring, 'the ring 1 px outside the border, 2 px wide').toMatchObject({
        style: 'solid',
        width: '2px',
        offset: '1px',
        color: forced.highlight,
      });
      expect(closedRing).toEqual({ focused: true, width: '2px', offset: '1px' });
    } finally {
      await page.emulateMedia({ forcedColors: 'none' });
      await closeDialogs(page);
    }
    test.info().annotations.push({ type: 'look', description: readings.join('; ') });
  });

  /* DROPDOWNS.md 3.11: the window API sets a dropdown by value and by label, once */
  row('chrome.select.agent-set', async ({ browser, baseURL }) => {
    test.skip(!isLocalBase(baseURL ?? ''), 'writes a scratch deck: a local server only');
    test.setTimeout(600_000);
    const person = await personAt(browser, 'light');
    const page = await freshEditor(person);
    await openShare(page);
    const mode = triggerOf(page, 'dialog.share.mode');
    const toLink = await writesDuring(page, 'share.setGeneralAccess', () =>
      page.evaluate(() => window.turboslide!.studio.set('dialog.share.mode', 'link')),
    );
    await expect(mode).toHaveAttribute('value', 'link');
    await expect(mode).toHaveAttribute('aria-expanded', 'false');
    const row = await page.evaluate(() =>
      window.turboslide!.studio.controls().find((c) => c.control === 'dialog.share.mode'),
    );
    expect(row).toEqual({
      kind: 'select',
      label: 'General access',
      control: 'dialog.share.mode',
      value: 'link',
    });
    const back = await writesDuring(page, 'share.setGeneralAccess', () =>
      page.evaluate(() => window.turboslide!.studio.set('General access', 'Restricted')),
    );
    await expect(mode).toHaveAttribute('value', 'restricted');
    const refused = await page.evaluate(() => {
      try {
        window.turboslide!.studio.set('dialog.share.mode', 'public');
        return null;
      } catch (error) {
        return { name: (error as Error).name, message: (error as Error).message };
      }
    });
    expect(refused?.name).toBe('RangeError');
    expect(refused?.message).toMatch(/General access/);
    expect(refused?.message).toMatch(/public/);
    expect([toLink, back], 'one write per set').toEqual([1, 1]);
    await closeDialogs(page);
    /* Format options: a dropdown of the table set by its id, once */
    await pick(page, 'dd-table');
    await formatOptions(page);
    const weight = page.locator('[role="combobox"][data-control$=".border.weight"]').first();
    await weight.waitFor({ timeout: 15_000 });
    const control = (await weight.getAttribute('data-control'))!;
    const before = (await state(page)).revision;
    await page.evaluate((id) => window.turboslide!.studio.set(id, 2), control);
    await expect(weight).toHaveAttribute('value', '2');
    /* the trigger shows the value before the write answers: at a load of 88 the table's write
       stood pending for 1 to 3 s with the revision unchanged, and settled() reads the realtime
       channel's pending count, 0 on this tier, so it returned before the write (the integrator's
       open item 2, read red here once more); the revision is read once it moves, or after 30 s,
       and again 2 s later, so a second write would still count */
    await waitRevision(page, before + 1);
    await page.waitForTimeout(2000);
    const after = (await settled(page)).revision;
    test.info().annotations.push({
      type: 'agent',
      description: `Share writes ${toLink} and ${back}; refused ${JSON.stringify(refused)}; ${control} revision ${before} to ${after}`,
    });
    expect(after - before, `${control}: one write`).toBe(1);
  });

  return declared;
}
