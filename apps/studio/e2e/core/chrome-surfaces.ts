import { inflateSync } from 'node:zlib';

import { chromium, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { contrastRatio, parseColor } from '@turboslide/theme/contrast';

import { LAYERS } from '@turboslide/theme/scale';

import {
  Scratch,
  ctl,
  extraHTTPHeaders,
  headingRun,
  invoke,
  menuPath,
  openEditor,
  settled,
  teardownAll,
  title,
  typeInto,
  waitEditor,
  waitRevision,
} from './lib';
import { chooseOption } from '../choose-option';
import { isCoreId } from './matrix';

// Lane D2's rows of the design round in core/chrome.spec.ts (docs/DESIGN.md 10.2, 11): the
// editor's floating surfaces in their layers of the stacking scale (the browser's top layer
// through the Layer primitive) and on their anchors (place()). The spec file calls
// `chromeSurfaces()` once and spreads its ids into its coverage list, the shape of
// chrome-foundation.ts; a row registers once its id is in the matrix. Each appearance has one
// context and one deck, made from /new by the first write as a seller makes one, which is also the
// edit that opens the name prompt bar; the decks are torn down through the product.

type Appearance = 'light' | 'dark';
type Person = { context: BrowserContext; page: Page; scratch: Scratch; deck: string };
const people = new Map<string, Person>();

/**
 * A context at 1440 by 900 in an appearance, on a fresh deck with the name prompt bar open; `key`
 * names a context of its own, so a row that reads the bar on its first write gets a fresh one.
 */
async function personIn(
  browser: Browser,
  appearance: Appearance,
  key: string = appearance,
  width = 1440,
): Promise<Person> {
  const known = people.get(key);
  if (known) return known;
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height: width < 720 ? 844 : 900 },
    colorScheme: appearance,
    permissions: ['clipboard-read', 'clipboard-write'],
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
  /* the deck as newDeck makes it, without closing the name prompt: the first write by a browser
     with no chosen name opens the bar (dialogs/NamePrompt.tsx NamePromptPlate) */
  await page.goto('/new');
  await waitEditor(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  const run = await headingRun(page);
  await typeInto(page, run, `Layers ${appearance}`);
  await waitRevision(page, 1, 30_000);
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(page);
  const person = { context, page, scratch, deck: scratch.add(info.id) };
  people.set(key, person);
  await nameBar(page, run);
  return person;
}

/**
 * Waits for the name prompt bar. It opens on an edit in the room by a browser with no chosen name
 * (apps/studio/src/editor/controller.tsx); the draft's first write creates the deck, so when that
 * write was the whole edit, one more edit to the title opens it (the research's repro of Kevin's
 * screenshot did the same).
 */
async function nameBar(page: Page, run: string): Promise<void> {
  const bar = ctl(page, 'dialog.namePrompt');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (
      await bar
        .waitFor({ timeout: 5000 })
        .then(() => true)
        .catch(() => false)
    )
      return;
    const heading = page
      .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
      .first();
    await heading.dblclick();
    await page.waitForTimeout(200);
    await page.keyboard.press('End');
    await page.keyboard.type(` ${attempt + 2}`, { delay: 60 });
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await settled(page);
  }
  await bar.waitFor({ timeout: 10_000 });
}

/** The facts of a plate: its box, corner, frame colour, ring and layer. */
type PlateFacts = {
  box: { left: number; top: number; right: number; bottom: number };
  radius: string;
  border: string;
  borderWidth: string;
  shadow: string;
  layer: string | null;
  open: boolean;
};

/** Reads a plate's facts and the colours the tokens resolve to in its own scope. */
async function plateFacts(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    /* what --pt-edge and --pt-ring compute to where the plate sits */
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:-50px;top:-50px;width:10px;height:10px;border:1px solid var(--pt-edge);box-shadow:var(--pt-ring)';
    el.parentElement?.append(probe);
    const want = getComputedStyle(probe);
    const tokens = { edge: want.borderTopColor, ring: want.boxShadow };
    probe.remove();
    const facts: PlateFacts = {
      box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      radius: cs.borderTopLeftRadius,
      border: cs.borderTopColor,
      borderWidth: cs.borderTopWidth,
      shadow: cs.boxShadow,
      layer: el.dataset.layer ?? null,
      open: el.matches(':popover-open'),
    };
    return { facts, tokens };
  }, selector);
}

/** The pairs of parallel edges two boxes share within half a pixel. */
function sharedEdges(a: PlateFacts['box'], b: PlateFacts['box']): string[] {
  const near = (x: number, y: number) => Math.abs(x - y) < 0.5;
  const shared: string[] = [];
  const overlapX = a.left <= b.right + 4 && b.left <= a.right + 4;
  const overlapY = a.top <= b.bottom + 4 && b.top <= a.bottom + 4;
  if (overlapX) {
    if (near(a.top, b.top)) shared.push('top on top');
    if (near(a.bottom, b.bottom)) shared.push('bottom on bottom');
    if (near(a.top, b.bottom)) shared.push('top on bottom');
    if (near(a.bottom, b.top)) shared.push('bottom on top');
  }
  if (overlapY) {
    if (near(a.left, b.left)) shared.push('left on left');
    if (near(a.right, b.right)) shared.push('right on right');
    if (near(a.left, b.right)) shared.push('left on right');
    if (near(a.right, b.left)) shared.push('right on left');
  }
  return shared;
}

/** Rests the pointer on the presence slot's left end until its tooltip shows. */
async function presenceTooltip(page: Page): Promise<void> {
  const slot = await ctl(page, 'title.presence').boundingBox();
  if (!slot) throw new Error('no presence slot in the title row');
  await page.mouse.move(slot.x + 4, slot.y + slot.height / 2, { steps: 3 });
  await page.waitForTimeout(200);
  await page.mouse.move(slot.x + 6, slot.y + slot.height / 2, { steps: 2 });
  await page.locator('#pt-tip:not([hidden])').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
}

/**
 * Removes a deck of this file through the action surface as its owner (the page's cookies):
 * deck.trash, then deck.remove with confirm, then deck.info answers 404. The product's own path
 * (File > Move to trash, then Delete forever on the trash page) is lib.ts teardownAll, which this
 * falls back to; on a server whose trash had grown long the trash card it waits for was not drawn
 * and the hook ran out its time.
 */
async function removeDeck(page: Page, id: string): Promise<boolean> {
  const call = async (action: string, input: unknown) => {
    const answer = await page.request.post(
      `/api/actions/${action}?deck=${encodeURIComponent(id)}`,
      {
        data: input,
        timeout: 30_000,
      },
    );
    const body = (await answer.json().catch(() => null)) as {
      revision?: number;
      result?: { revision?: number };
      deck?: { revision?: number };
    } | null;
    return {
      status: answer.status(),
      revision: body?.revision ?? body?.result?.revision ?? body?.deck?.revision,
    };
  };
  try {
    const info = await call('deck.info', {});
    if (info.status === 404) return true;
    await call('deck.trash', { id, baseRevision: info.revision });
    const again = await call('deck.info', {});
    await call('deck.remove', { id, confirm: true, baseRevision: again.revision ?? info.revision });
    return (await call('deck.info', {})).status === 404;
  } catch {
    return false;
  }
}

/** The editor of the person's deck loaded again, so a row starts with no surface open. */
async function fresh(person: Person): Promise<Page> {
  await openEditor(person.page, person.deck);
  return person.page;
}

/** Opens the Share dialog, passing the first Share's name question with Skip. */
async function openShare(page: Page): Promise<void> {
  await ctl(page, 'share.open').click();
  const skip = ctl(page, 'dialog.namePrompt.skip');
  if (
    await skip
      .waitFor({ timeout: 1500 })
      .then(() => true)
      .catch(() => false)
  )
    await skip.click({ timeout: 2000 }).catch(() => undefined);
  await ctl(page, 'dialog.share').waitFor({ timeout: 10_000 });
}

async function closeShare(page: Page): Promise<void> {
  const done = ctl(page, 'dialog.share.done');
  if ((await done.count()) > 0) await done.click();
  else await ctl(page, 'dialog.share.close').click();
  await expect(ctl(page, 'dialog.share')).toHaveCount(0, { timeout: 5000 });
}

/** The first element at a point, described by its id, control id or class. */
async function topAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) => {
      const list = document.elementsFromPoint(px as number, py as number).slice(0, 4);
      return list.map((el) => {
        const control = el.getAttribute('data-control');
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${control ? `[${control}]` : ''}.${el.className.toString().split(' ').filter(Boolean).slice(0, 2).join('.')}`;
      });
    },
    [x, y],
  );
}

// ---------------------------------------------------------------------------------------------
// DR-D2#2: the walk of the editor's surfaces at one width and appearance, read once and shared by
// the corner and plate rows (docs/DESIGN.md 3.1 to 3.4).

/** One element's corner, frame and shadow, with the tokens resolved where it sits. */
type SurfaceFacts = {
  name: string;
  radius: string;
  border: string;
  borderWidth: string;
  shadow: string;
  edge: string;
  ring: string;
};

type Walk = {
  combo: string;
  floating: SurfaceFacts[];
  windows: SurfaceFacts[];
  chips: SurfaceFacts[];
  controls: SurfaceFacts[];
  checkboxes: SurfaceFacts[];
  structure: SurfaceFacts[];
  /** elements whose box-shadow has a layer with a blur or an offset that is not an inset line */
  shadows: string[];
  /** surfaces this width does not draw, with the reason */
  absent: string[];
};

const walks = new Map<string, Promise<Walk>>();

/** The facts of the first visible element a selector names, or null. */
async function surface(page: Page, name: string, selector: string): Promise<SurfaceFacts | null> {
  return page.evaluate(
    ([label, sel]) => {
      const el = [...document.querySelectorAll<HTMLElement>(sel as string)].find((each) => {
        const r = each.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!el) return null;
      const cs = getComputedStyle(el);
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;left:-50px;top:-50px;width:10px;height:10px;border:1px solid var(--pt-edge);box-shadow:var(--pt-ring)';
      (el.parentElement ?? document.body).append(probe);
      const want = getComputedStyle(probe);
      const facts = {
        name: label as string,
        radius: cs.borderTopLeftRadius,
        border: cs.borderTopColor,
        borderWidth: cs.borderTopWidth,
        shadow: cs.boxShadow,
        edge: want.borderTopColor,
        ring: want.boxShadow,
      };
      probe.remove();
      return facts;
    },
    [name, selector],
  );
}

/** Every element of the page whose box-shadow has a blur or an offset on a layer that is not inset. */
async function blurredShadows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const value = getComputedStyle(el).boxShadow;
      if (value === 'none' || value === '') continue;
      /* the layers, split at the commas outside a colour's parentheses */
      const layers: string[] = [];
      let depth = 0;
      let from = 0;
      for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        else if (ch === ',' && depth === 0) {
          layers.push(value.slice(from, i));
          from = i + 1;
        }
      }
      layers.push(value.slice(from));
      for (const layer of layers) {
        if (/\binset\b/.test(layer)) continue;
        const lengths = (
          layer.replace(/(rgba?|oklch|color|hsla?)\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []
        ).map((n) => Number.parseFloat(n));
        const [x = 0, y = 0, blur = 0] = lengths;
        if (x !== 0 || y !== 0 || blur !== 0) {
          out.push(
            `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}: ${layer.trim()}`,
          );
          break;
        }
      }
    }
    return out;
  });
}

async function closeAll(page: Page): Promise<void> {
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
  await page.mouse.move(5, 300);
  await page.waitForTimeout(250);
}

async function walkOf(browser: Browser, width: number, appearance: Appearance): Promise<Walk> {
  const combo = `${width} ${appearance}`;
  const known = walks.get(combo);
  if (known) return known;
  const run = (async (): Promise<Walk> => {
    const person = await personIn(browser, appearance, `walk ${combo}`, width);
    const { page } = person;
    const walk: Walk = {
      combo,
      floating: [],
      windows: [],
      chips: [],
      controls: [],
      checkboxes: [],
      structure: [],
      shadows: [],
      absent: [],
    };
    const take = async (list: SurfaceFacts[], name: string, selector: string) => {
      const facts = await surface(page, name, selector);
      if (facts) list.push(facts);
      else walk.absent.push(name);
    };
    const visible = async (control: string) =>
      (await ctl(page, control).count()) > 0 && (await ctl(page, control).isVisible());
    const phone = width < 720;
    /* the bar the first write opened, and the controls and structure at rest */
    await take(walk.floating, 'the name prompt bar', '.ts-title-name-plate');
    await take(walk.controls, 'Share', '[data-control="share.open"]');
    await take(walk.controls, 'Slideshow', '[data-control="present.split"]');
    await take(walk.controls, 'a toolbar button', '[data-control="toolbar.undo"]');
    await take(walk.controls, 'the font size field', '.ts-tb-size-field');
    await take(walk.structure, 'the title row', '.ts-title-row');
    if (!phone) await take(walk.structure, 'the menu bar', '.ts-menubar');
    await take(walk.structure, 'the filmstrip column', '.pt-sb');
    await take(walk.structure, 'a thumbnail', '.ts-thumb');
    await take(walk.structure, 'the sheet', '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    await take(walk.structure, 'the speaker notes', '.ts-notes-field');
    if (!phone) await take(walk.structure, 'an identity chip', '.ts-presence-me');
    walk.shadows.push(...(await blurredShadows(page)));
    /* the tooltip of a toolbar button with a key */
    const undo = await ctl(page, 'toolbar.undo').boundingBox();
    if (undo) {
      await page.mouse.move(undo.x + 2, undo.y + 2, { steps: 2 });
      await page.waitForTimeout(150);
      await page.mouse.move(undo.x + undo.width / 2, undo.y + undo.height / 2, { steps: 2 });
      await page
        .locator('#pt-tip:not([hidden])')
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      await take(walk.floating, 'the tooltip', '#pt-tip');
      await take(walk.chips, "the tooltip's key", '#pt-tip .pt-tip-key');
      await page.mouse.move(5, 300);
    }
    /* a menu and its submenu */
    await ctl(page, phone ? 'toolbar.menus' : 'menubar.insert').click();
    await page.locator('.ts-menu').first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(300);
    await take(walk.floating, 'a menu', '.ts-menu');
    const subRow = page.locator('.ts-menu .ts-menu-item[aria-haspopup="menu"]').first();
    if ((await subRow.count()) > 0) {
      await subRow.hover();
      await page.waitForTimeout(500);
      if (phone) await subRow.click({ timeout: 3000 }).catch(() => undefined);
      await page
        .locator('.ts-menu.is-sub')
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => undefined);
      await take(walk.floating, 'a submenu', '.ts-menu.is-sub');
    }
    walk.shadows.push(...(await blurredShadows(page)));
    await closeAll(page);
    /* a context menu on the sheet */
    const sheet = await page
      .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
      .first()
      .boundingBox();
    if (sheet) {
      await page.mouse.click(sheet.x + sheet.width - 20, sheet.y + sheet.height - 20, {
        button: 'right',
      });
      await page
        .locator('.ts-context-menu')
        .first()
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      await take(walk.floating, 'a context menu', '.ts-context-menu');
      await closeAll(page);
    }
    /* the account plate menu (the title row hides the presence slot under 720 px) */
    if (!phone && (await visible('title.account'))) {
      await ctl(page, 'title.account').click();
      await page
        .locator('.ts-plate-menu')
        .first()
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      await take(walk.floating, 'the account plate menu', '.ts-plate-menu');
      walk.shadows.push(...(await blurredShadows(page)));
      await closeAll(page);
    } else walk.absent.push('the account plate menu (no presence slot at this width)');
    /* the layout plate */
    if (await visible('toolbar.layout')) {
      await ctl(page, 'toolbar.layout').click();
      await page
        .locator('.ts-layout-plate')
        .first()
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      await take(walk.floating, 'the layout plate', '.ts-layout-plate');
      await closeAll(page);
    } else walk.absent.push('the layout plate (the Layout button folds at this width)');
    /* the title selected: the selection, its chip, a block; the colour and font pickers */
    const heading = page
      .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block]')
      .first();
    await heading.click();
    await page.waitForTimeout(400);
    await take(
      walk.structure,
      'a block on the slide',
      '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block]',
    );
    await take(walk.structure, 'the selection ring', '.ts-select.is-selected');
    await take(walk.structure, 'the selection chip', '.ts-select-chip');
    for (const [control, name, plate] of [
      ['toolbar.textColor', 'the colour plate', '.ts-color-plate'],
      ['toolbar.font', 'the font picker', '.ts-font-plate'],
    ] as const) {
      if (await visible(control)) {
        await ctl(page, control).click();
        await page
          .locator(plate)
          .first()
          .waitFor({ timeout: 8000 })
          .catch(() => undefined);
        await take(walk.floating, name, plate);
        walk.shadows.push(...(await blurredShadows(page)));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
      } else walk.absent.push(`${name} (its control folds at this width)`);
    }
    /* Format options for the selected title: its segmented control (Position) and a docked panel */
    await heading.click();
    await page.waitForTimeout(300);
    if (await visible('toolbar.formatOptions')) {
      await ctl(page, 'toolbar.formatOptions').click();
      await page
        .locator('.ts-panel')
        .first()
        .waitFor({ timeout: 10_000 })
        .catch(() => undefined);
      await take(walk.controls, 'a segmented control', '.ts-panel .pt-seg');
      await take(walk.structure, 'a docked panel', '.ts-panel');
    } else walk.absent.push('Format options (its button folds at this width)');
    await closeAll(page);
    /* the search card, its key chips and the hover preview of a slide row */
    await ctl(page, 'toolbar.search').click();
    await page.locator('.pt-search-card').waitFor({ timeout: 8000 });
    await take(walk.windows, 'the search card', '.pt-search-card');
    await page.keyboard.type('#');
    await page.waitForTimeout(400);
    await take(walk.chips, "the search card's key chip", '.pt-search .pt-kbd');
    const slideRow = page.locator('.pt-search [data-preview]').first();
    if (!phone && (await slideRow.count()) > 0) {
      const rb = await slideRow.boundingBox();
      if (rb) {
        await page.mouse.move(rb.x + 10, rb.y + rb.height / 2, { steps: 3 });
        await page.mouse.move(rb.x + 30, rb.y + rb.height / 2, { steps: 3 });
        await page
          .locator('.pt-preview.is-on')
          .waitFor({ timeout: 8000 })
          .catch(() => undefined);
        await take(walk.windows, 'the hover preview', '.pt-preview.is-on');
      }
    } else if (phone) walk.absent.push('the hover preview (no hover on a phone layout)');
    await closeAll(page);
    /* the Share dialog: the window, its dropdown, field, checkbox and solid button; the snackbar */
    await openShare(page);
    await take(walk.windows, 'the Share dialog', '[data-control="dialog.share"]');
    await take(
      walk.controls,
      "the dialog's dropdown",
      '[data-control="dialog.share"] [role="combobox"]',
    );
    await take(walk.controls, "the dialog's field", '[data-control="dialog.share.address"]');
    await take(walk.controls, 'the solid button', '[data-control="dialog.share"] .pt-ib.is-solid');
    await take(
      walk.checkboxes,
      "the dialog's checkbox",
      '[data-control="dialog.share"] .ts-dialog-check-box',
    );
    walk.shadows.push(...(await blurredShadows(page)));
    await ctl(page, 'dialog.share.copy').click();
    await page.locator('[data-control="snackbar"].is-on').waitFor({ timeout: 10_000 });
    await take(walk.floating, 'the snackbar', '[data-control="snackbar"]');
    await closeShare(page);
    /* the shortcuts dialog's key chips */
    await page.keyboard.press('Meta+/');
    if (
      await page
        .locator('.ts-shortcuts')
        .first()
        .waitFor({ timeout: 6000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await take(walk.chips, "the shortcuts dialog's key chip", '.ts-shortcuts .pt-kbd');
      await closeAll(page);
    } else walk.absent.push('the shortcuts dialog (Cmd+/ did not open it)');
    return walk;
  })();
  walks.set(combo, run);
  return run;
}

const COMBOS = [
  [1440, 'light'],
  [1440, 'dark'],
  [390, 'light'],
  [390, 'dark'],
] as const;

/** Each surface's facts as one line for the row's annotation. */
function line(list: SurfaceFacts[]): string {
  return list.map((f) => `${f.name} ${f.radius}`).join(', ');
}

// ---------------------------------------------------------------------------------------------
// DR-D2#3: the scrollbar read from the pixels. Playwright's Chromium runs with
// `--hide-scrollbars`, so these rows launch one Chromium of their own without it (research-scroll
// 2, the D5 rows' way) and read a scroller's vertical gutter as offsetWidth - clientWidth less its
// borders, then its thumb from a screenshot of the gutter: the columns of the longest run that
// differs from the track, its colour against the track.

let bars: Browser | null = null;
const barPeople: Person[] = [];

async function barsBrowser(): Promise<Browser> {
  bars ??= await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  return bars;
}

/** A context on the bars browser at a size and an appearance, on a fresh deck. */
async function barPerson(
  baseURL: string | undefined,
  width: number,
  height: number,
  appearance: Appearance,
): Promise<Person> {
  const browser = await barsBrowser();
  const context = await browser.newContext({
    ...(baseURL === undefined ? {} : { baseURL }),
    extraHTTPHeaders,
    viewport: { width, height },
    colorScheme: appearance,
  });
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('gt-theme', value);
    } catch {
      /* a storage that refuses keeps the system's appearance, which is the same here */
    }
  }, appearance);
  const page = await context.newPage();
  const scratch = new Scratch();
  await page.goto('/new');
  await waitEditor(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  const run = await headingRun(page);
  await typeInto(page, run, `Bars ${appearance}`);
  await waitRevision(page, 1, 30_000);
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(page);
  const person = { context, page, scratch, deck: scratch.add(info.id) };
  barPeople.push(person);
  const bar = ctl(page, 'dialog.namePrompt.close');
  if (await bar.isVisible().catch(() => false))
    await bar.click({ timeout: 3000 }).catch(() => undefined);
  return person;
}

/** What a gutter strip's pixels say: the thumb's width and colour and the track's colour. */
type Strip = { thumb: number; thumbColor: string; track: string; ratio: number; rows: number };

/**
 * The pixels of a PNG screenshot (8 bit RGB or RGBA, not interlaced: what Chromium writes),
 * decoded here with zlib, so the reading needs no image library and no work in the page.
 */
function decodePng(bytes: Buffer): {
  width: number;
  height: number;
  rgb: (x: number, y: number) => number[];
} {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25] ?? 6;
  const channels = colorType === 6 ? 4 : 3;
  const idat: Buffer[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0;
      const a = i >= channels ? (out[y * stride + i - channels] ?? 0) : 0;
      const b = y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0;
      const c = i >= channels && y > 0 ? (out[(y - 1) * stride + i - channels] ?? 0) : 0;
      let v = x;
      if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + i] = v & 255;
    }
  }
  return {
    width,
    height,
    rgb: (x, y) => {
      const i = y * stride + x * channels;
      return [out[i] ?? 0, out[i + 1] ?? 0, out[i + 2] ?? 0];
    },
  };
}

/** Reads a vertical gutter strip of `width` px at `x` from `top` to `bottom` in the viewport. */
async function stripOf(
  page: Page,
  box: { x: number; top: number; bottom: number; width: number },
): Promise<(Strip & { mid: number }) | null> {
  const height = Math.max(1, Math.floor(box.bottom - box.top));
  const shot = await page.screenshot({
    clip: { x: box.x, y: box.top, width: box.width, height },
  });
  const png = decodePng(shot);
  const same = (a: number[], b: number[]) =>
    Math.abs((a[0] ?? 0) - (b[0] ?? 0)) +
      Math.abs((a[1] ?? 0) - (b[1] ?? 0)) +
      Math.abs((a[2] ?? 0) - (b[2] ?? 0)) <
    12;
  const track = png.rgb(0, Math.floor(png.height / 2));
  /* per column, the longest run of pixels that differ from the track */
  const runs: { len: number; mid: number; x: number }[] = [];
  for (let x = 0; x < png.width; x += 1) {
    let best = 0;
    let bestMid = 0;
    let len = 0;
    for (let y = 0; y < png.height; y += 1) {
      if (!same(png.rgb(x, y), track)) {
        len += 1;
        if (len > best) {
          best = len;
          bestMid = y - Math.floor(len / 2);
        }
      } else len = 0;
    }
    runs.push({ len: best, mid: bestMid, x });
  }
  const trackCss = `rgb(${track.join(', ')})`;
  const longest = Math.max(...runs.map((r) => r.len));
  if (longest < 16)
    return { thumb: 0, thumbColor: '', track: trackCss, ratio: 0, rows: longest, mid: 0 };
  const cols = runs.filter((r) => r.len >= longest * 0.6);
  const middle = cols[Math.floor(cols.length / 2)] ?? cols[0];
  const color = png.rgb(middle?.x ?? 0, middle?.mid ?? 0);
  const thumbColor = `rgb(${color.join(', ')})`;
  const a = parseColor(thumbColor);
  const b = parseColor(trackCss);
  return {
    thumb: cols.length,
    thumbColor,
    track: trackCss,
    ratio: a && b ? contrastRatio(a, b) : 0,
    rows: longest,
    mid: middle?.mid ?? 0,
  };
}

type BarReading = {
  name: string;
  gutter: number;
  overflows: boolean;
  rest: (Strip & { mid: number }) | null;
  hover: (Strip & { mid: number }) | null;
};

/** One scroller's vertical bar: its gutter, its thumb at rest and under the pointer. */
async function barOf(page: Page, name: string, selector: string): Promise<BarReading | null> {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0 || !(await el.isVisible())) return null;
  const geo = await el.evaluate((node) => {
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    const bl = Number.parseFloat(cs.borderLeftWidth) || 0;
    const br = Number.parseFloat(cs.borderRightWidth) || 0;
    const bt = Number.parseFloat(cs.borderTopWidth) || 0;
    const bb = Number.parseFloat(cs.borderBottomWidth) || 0;
    const h = node as HTMLElement;
    return {
      gutter: Math.round(h.offsetWidth - h.clientWidth - bl - br),
      overflows: h.scrollHeight > h.clientHeight + 1,
      right: r.right - br,
      top: r.top + bt,
      bottom: r.bottom - bb,
    };
  });
  const reading: BarReading = {
    name,
    gutter: geo.gutter,
    overflows: geo.overflows,
    rest: null,
    hover: null,
  };
  if (!geo.overflows || geo.gutter < 4) return reading;
  const box = {
    x: Math.round(geo.right - geo.gutter),
    top: Math.round(geo.top),
    bottom: Math.round(geo.bottom),
    width: geo.gutter,
  };
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  reading.rest = await stripOf(page, box);
  const mid = reading.rest?.mid;
  if (reading.rest && reading.rest.thumb > 0 && mid !== undefined) {
    /* into the gutter from its right, so the pointer crosses no row of a menu on its way (a row
       under a moving pointer takes the focus and scrolls the list) */
    await page.mouse.move(box.x + box.width + 24, box.top + mid);
    await page.mouse.move(box.x + box.width / 2, box.top + mid, { steps: 3 });
    await page.waitForTimeout(250);
    reading.hover = await stripOf(page, box);
    await page.mouse.move(5, 5);
  }
  return reading;
}

function barLine(r: BarReading): string {
  return `${r.name}: gutter ${r.gutter}, ${r.overflows ? 'scrolls' : 'does not scroll'}${r.rest ? `, thumb ${r.rest.thumb} px ${r.rest.thumbColor} on ${r.rest.track} ${r.rest.ratio.toFixed(2)}:1` : ''}${r.hover ? `, under the pointer ${r.hover.thumb} px` : ''}`;
}

export function chromeSurfaces(): string[] {
  const declared: string[] = [];
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (!isCoreId(id)) return;
    declared.push(id);
    test(title(id), body);
  };
  test.afterAll(async () => {
    /* every context tears its own decks down at once: one after another, the walk's four decks
       and the bars' three took more than five minutes at a load of 150 */
    test.setTimeout(900_000);
    const failures: string[] = [];
    const all = [...people.values(), ...barPeople.splice(0)];
    people.clear();
    await Promise.all(
      all.map(async (person) => {
        try {
          const left: string[] = [];
          for (const id of person.scratch.ids)
            if (!(await removeDeck(person.page, id))) left.push(id);
          if (left.length > 0) {
            const rest = new Scratch();
            for (const id of left) rest.add(id);
            await teardownAll(person.page, rest);
          }
        } catch (error) {
          failures.push(
            error instanceof Error
              ? (error.message.split('\n')[0] ?? error.message)
              : String(error),
          );
        } finally {
          await person.context.close().catch(() => undefined);
        }
      }),
    );
    await bars?.close().catch(() => undefined);
    bars = null;
    expect(failures, 'every deck of the D2 rows is torn down').toEqual([]);
  });

  /* DESIGN.md 2.5 (Kevin's screenshot 1): the name prompt bar 4 px under the title row, so it and
     the presence slot's tooltip share no edge line; moved over the bar, the tooltip is the first
     element at the overlap; both plates draw the 6 px corner, the --pt-edge frame and the ring */
  row('chrome.layers.tooltip-over-bar', async ({ browser }) => {
    test.setTimeout(300_000);
    const readings: string[] = [];
    for (const appearance of ['light', 'dark'] as const) {
      const { page } = await personIn(browser, appearance);
      await ctl(page, 'dialog.namePrompt').waitFor({ timeout: 30_000 });
      await presenceTooltip(page);
      const row = await page.evaluate(() => {
        const r = document.querySelector('.ts-title-row')?.getBoundingClientRect();
        return r ? r.bottom : null;
      });
      const tip = await plateFacts(page, '#pt-tip');
      const bar = await plateFacts(page, '.ts-title-name-plate');
      expect(row, 'the title row').not.toBeNull();
      expect(tip, 'the presence tooltip').not.toBeNull();
      expect(bar, 'the name prompt bar').not.toBeNull();
      const t = tip!.facts;
      const b = bar!.facts;
      const shared = sharedEdges(t.box, b.box);
      readings.push(
        `${appearance}: row bottom ${row}, bar ${Math.round(b.box.left)},${b.box.top} to ${Math.round(b.box.right)},${b.box.bottom} (${b.radius}, ${b.border} ${b.borderWidth}, ${b.shadow}, layer ${b.layer}, top layer ${b.open}); tooltip ${Math.round(t.box.left)},${t.box.top} to ${Math.round(t.box.right)},${t.box.bottom} (${t.radius}, ${t.border}, layer ${t.layer}, top layer ${t.open}); shared edges ${shared.join(', ') || 'none'}`,
      );
      expect(
        b.box.top - (row as number),
        `${appearance}: the bar 4 px under the row`,
      ).toBeGreaterThanOrEqual(3.5);
      expect(shared, `${appearance}: no shared edge line`).toEqual([]);
      for (const [name, f, want] of [
        ['bar', b, bar!.tokens],
        ['tooltip', t, tip!.tokens],
      ] as const) {
        expect(f.radius, `${appearance}: the ${name}'s corner`).toBe('6px');
        expect(f.borderWidth, `${appearance}: the ${name}'s frame`).toBe('1px');
        expect(f.border, `${appearance}: the ${name}'s frame is --pt-edge`).toBe(want.edge);
        expect(f.shadow, `${appearance}: the ${name}'s ring`).toBe(want.ring);
      }
      /* the tooltip moved 120 px right, over the bar, with its pointer events on for the hit test */
      const forced = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('#pt-tip');
        const plate = document.querySelector<HTMLElement>('.ts-title-name-plate');
        if (!el || !plate) return null;
        el.style.left = `${Math.round(el.getBoundingClientRect().left + 120)}px`;
        el.style.pointerEvents = 'auto';
        const t2 = el.getBoundingClientRect();
        const p = plate.getBoundingClientRect();
        const x = Math.max(t2.left, p.left) + 20;
        const y = (Math.max(t2.top, p.top) + Math.min(t2.bottom, p.bottom)) / 2;
        const first = document.elementsFromPoint(x, y)[0];
        const answer = { x, y, tipFirst: first !== undefined && el.contains(first) };
        el.style.pointerEvents = '';
        return answer;
      });
      readings.push(
        `${appearance}: over the bar the first element is the tooltip: ${forced?.tipFirst}`,
      );
      expect(forced?.tipFirst, `${appearance}: the tooltip is first at the overlap`).toBe(true);
      await page.mouse.move(700, 600);
      await page.keyboard.press('Escape');
    }
    test.info().annotations.push({ type: 'layers', description: readings.join('; ') });
  });

  /* DESIGN.md 2.2 (question 5): Share > Copy Link raises the snackbar in the toast layer over the
     open Share dialog, so its centre hits the snackbar first */
  row('chrome.layers.toast-over-dialog', async ({ browser }) => {
    test.setTimeout(300_000);
    const readings: string[] = [];
    for (const appearance of ['light', 'dark'] as const) {
      const page = await fresh(await personIn(browser, appearance));
      await openShare(page);
      await ctl(page, 'dialog.share.copy').click();
      const snackbar = page.locator('[data-control="snackbar"].is-on');
      await snackbar.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(400);
      const box = await snackbar.boundingBox();
      expect(box, `${appearance}: the snackbar's box`).not.toBeNull();
      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height / 2;
      const facts = await page.evaluate(
        ([x, y]) => {
          const bar = document.querySelector<HTMLElement>('[data-control="snackbar"]');
          const scrim = document.querySelector<HTMLElement>('.ts-dialog-scrim');
          const first = document.elementsFromPoint(x as number, y as number)[0];
          return {
            first: first
              ? (first.getAttribute('data-control') ?? first.className.toString())
              : null,
            snackbarFirst: Boolean(bar && first && bar.contains(first)),
            text: bar?.textContent ?? '',
            snackbarLayer: bar?.dataset.layer ?? null,
            snackbarOpen: bar?.matches(':popover-open') ?? false,
            dialogLayer: scrim?.dataset.layer ?? null,
            dialogOpen: scrim?.matches(':popover-open') ?? false,
          };
        },
        [cx, cy],
      );
      readings.push(`${appearance}: ${JSON.stringify(facts)}`);
      expect(facts.dialogOpen, `${appearance}: the Share dialog is open`).toBe(true);
      expect(facts.snackbarFirst, `${appearance}: the snackbar is first at its centre`).toBe(true);
      await closeShare(page);
    }
    test.info().annotations.push({ type: 'layers', description: readings.join('; ') });
  });

  /* DESIGN.md 2.2: a surface opened from a dialog paints above it and takes the pointer. The
     dialogs of the editor raise the shared dropdown's list (Share's General access and role,
     DROPDOWNS.md 3.6) and the tooltip of their controls; the list opens in the popover layer over
     the dialog, its row is the first element at the row's centre and a click there chooses it
     with the dialog in the top layer, and the tooltip of the dialog's Done button is the first
     element at its centre */
  row('chrome.layers.menu-over-dialog', async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await fresh(await personIn(browser, 'light'));
    await openShare(page);
    const trigger = page.locator('[data-control="dialog.share"] [role="combobox"]').first();
    await trigger.waitFor({ timeout: 10_000 });
    const control = (await trigger.getAttribute('data-control')) ?? '';
    const before = (await trigger.getAttribute('value')) ?? '';
    await trigger.click();
    await expect(trigger, 'the first dropdown of the Share dialog opens').toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const list = page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`);
    const values = await list
      .locator('[role="option"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-value') ?? ''));
    const other = values.find((v) => v !== before);
    expect(other, 'a second option to pick').toBeDefined();
    const option = list.locator(`[role="option"][data-value="${other}"]`);
    const box = await option.boundingBox();
    expect(box, 'the row of the open list').not.toBeNull();
    const at = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const hit = await topAt(page, at.x, at.y);
    const plate = await list.evaluate(
      (el, { point, value }) => {
        const first = document.elementsFromPoint(point.x, point.y)[0];
        const row = [...el.querySelectorAll('[role="option"]')].find(
          (each) => each.getAttribute('data-value') === value,
        );
        return {
          layer: (el as HTMLElement).dataset.layer ?? null,
          open: el.matches(':popover-open'),
          rowFirst: Boolean(first && row?.contains(first)),
        };
      },
      { point: at, value: other! },
    );
    await page.mouse.click(at.x, at.y);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toHaveAttribute('value', other!);
    await page.waitForTimeout(500);
    await chooseOption(page, control, before);
    await expect(trigger).toHaveAttribute('value', before);
    const dialog = await page.evaluate(() => {
      const scrim = document.querySelector<HTMLElement>('.ts-dialog-scrim');
      return {
        layer: scrim?.dataset.layer ?? null,
        open: scrim?.matches(':popover-open') ?? false,
      };
    });
    /* a control's tooltip from inside the dialog: the dialog's close button */
    const close = ctl(page, 'dialog.share.close');
    const closeBox = await close.boundingBox();
    expect(closeBox, 'the dialog close button').not.toBeNull();
    await page.mouse.move(closeBox!.x + 4, closeBox!.y + 4, { steps: 3 });
    await page.waitForTimeout(150);
    await page.mouse.move(closeBox!.x + closeBox!.width / 2, closeBox!.y + closeBox!.height / 2, {
      steps: 2,
    });
    await page.locator('#pt-tip:not([hidden])').waitFor({ timeout: 10_000 });
    const tip = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('#pt-tip');
      if (!el) return null;
      el.style.pointerEvents = 'auto';
      const r = el.getBoundingClientRect();
      const first = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      const answer = {
        first: Boolean(first && el.contains(first)),
        layer: el.dataset.layer ?? null,
        open: el.matches(':popover-open'),
      };
      el.style.pointerEvents = '';
      return answer;
    });
    test.info().annotations.push({
      type: 'layers',
      description: `the row at its centre: ${hit.join(' > ')}; the list ${JSON.stringify(plate)}; values ${before} -> ${other} -> ${before}; the dialog ${JSON.stringify(dialog)}; the close button's tooltip ${JSON.stringify(tip)}`,
    });
    expect(plate.open, 'the list is in the top layer').toBe(true);
    expect(plate.rowFirst, 'the row is the first element at its centre').toBe(true);
    expect(dialog.open, 'the dialog is in the top layer').toBe(true);
    expect(dialog.layer).toBe('dialog');
    expect(tip?.first, "the tooltip of a dialog's control is first at its centre").toBe(true);
    await page.mouse.move(700, 600);
    await closeShare(page);
  });

  /* DESIGN.md 2.3: every open floating surface is in the top layer with its layer's name, and no
     element outside the stage computes a z-index of 5 or more off the scale */
  row('chrome.layers.top-layer', async ({ browser }) => {
    test.setTimeout(360_000);
    /* a context of its own, so its first write opens the name prompt bar */
    const { page } = await personIn(browser, 'light', 'top-layer');
    const readings: string[] = [];
    const failures: string[] = [];
    const check = async (name: string, selector: string, layer: string) => {
      const facts = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return null;
        return { open: el.matches(':popover-open'), layer: el.dataset.layer ?? null };
      }, selector);
      readings.push(
        `${name}: ${facts ? `top layer ${facts.open}, layer ${facts.layer}` : 'absent'}`,
      );
      if (!facts) failures.push(`${name} did not open`);
      else if (!facts.open || facts.layer !== layer)
        failures.push(
          `${name}: top layer ${facts.open}, layer ${facts.layer} where ${layer} is asked`,
        );
    };
    /* the name prompt bar the first write opened */
    await ctl(page, 'dialog.namePrompt').waitFor({ timeout: 30_000 });
    await check('the name prompt bar', '.ts-title-name-plate', 'bar');
    /* the tooltip */
    await presenceTooltip(page);
    await check('the tooltip', '#pt-tip', 'tooltip');
    await page.mouse.move(700, 600);
    /* a menu and its submenu */
    await ctl(page, 'menubar.insert').click();
    await page.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
    await check('the Insert menu', '#ts-menu-insert', 'popover');
    const subRow = page.locator('#ts-menu-insert .ts-menu-item[aria-haspopup="menu"]').first();
    await subRow.hover();
    await page.waitForTimeout(500);
    await check('a submenu', '#ts-menu-insert .ts-menu.is-sub', 'popover');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    /* a context menu on the sheet */
    const sheet = await page
      .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
      .first()
      .boundingBox();
    if (sheet) {
      await page.mouse.click(sheet.x + sheet.width - 30, sheet.y + sheet.height - 30, {
        button: 'right',
      });
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 8000 });
      await check('the context menu', '.ts-context-menu', 'popover');
      await page.keyboard.press('Escape');
    } else failures.push('no sheet to right click');
    /* a plate menu: the own chip's account menu */
    const account = ctl(page, 'title.account');
    if ((await account.count()) > 0) {
      await account.click();
      await page.locator('.ts-plate-menu').first().waitFor({ timeout: 8000 });
      await check('the account plate', '.ts-plate-menu', 'popover');
      await page.keyboard.press('Escape');
    } else readings.push('the account plate: no own chip on this server');
    /* a picker: the layout plate under the toolbar's Layout button */
    const layout = ctl(page, 'toolbar.layout');
    if ((await layout.count()) > 0 && (await layout.isVisible())) {
      await layout.click();
      await page.locator('.ts-layout-plate').first().waitFor({ timeout: 8000 });
      await check('the layout plate', '.ts-layout-plate', 'popover');
      await page.keyboard.press('Escape');
    } else readings.push('the layout plate: the Layout button is folded at this width');
    /* the hover preview: a slide row of the search card the toolbar's Search opens */
    await ctl(page, 'toolbar.search').click();
    await page.locator('.pt-search').waitFor({ timeout: 8000 });
    await check('the search card', '.pt-search', 'dialog');
    await page.keyboard.type('#');
    const slideRow = page.locator('.pt-search [data-preview]').first();
    if ((await slideRow.count()) > 0) {
      const rb = await slideRow.boundingBox();
      if (rb) {
        await page.mouse.move(rb.x + 10, rb.y + rb.height / 2, { steps: 3 });
        await page.mouse.move(rb.x + 30, rb.y + rb.height / 2, { steps: 3 });
        await page
          .locator('.pt-preview.is-on')
          .waitFor({ timeout: 8000 })
          .catch(() => undefined);
        await check('the hover preview', '.pt-preview', 'preview');
      }
    } else readings.push('the hover preview: no slide row in the search card');
    await page.keyboard.press('Escape');
    await page.mouse.move(700, 600);
    /* a dialog and a snackbar over it */
    await openShare(page);
    await check('the Share dialog', '.ts-dialog-scrim', 'dialog');
    await ctl(page, 'dialog.share.copy').click();
    await page.locator('[data-control="snackbar"].is-on').waitFor({ timeout: 10_000 });
    await check('the snackbar', '[data-control="snackbar"]', 'toast');
    await closeShare(page);
    /* every z-index of 5 or more outside the stage is a value of the scale */
    const off = await page.evaluate((values) => {
      const allowed = new Set<number>(values);
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (el.closest('.pt-stagewrap')) continue;
        const z = Number.parseInt(getComputedStyle(el).zIndex, 10);
        if (Number.isNaN(z) || z < 5 || allowed.has(z)) continue;
        out.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} ${z}`);
      }
      return out;
    }, Object.values(LAYERS));
    readings.push(`z-index off the scale outside the stage: ${off.join(', ') || 'none'}`);
    for (const each of off) failures.push(`off the scale: ${each}`);
    test.info().annotations.push({ type: 'layers', description: readings.join('; ') });
    expect(failures).toEqual([]);
  });

  /* DESIGN.md 2.4: an open plate follows its anchor while its panel scrolls, and a menu stays in
     the viewport when the window shrinks */
  row('chrome.layers.follows-anchor', async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await fresh(await personIn(browser, 'light'));
    const readings: string[] = [];
    /* the font picker under the Theme panel's Display font control */
    await ctl(page, 'toolbar.theme').click();
    await ctl(page, 'panel.brand').waitFor({ timeout: 10_000 });
    const control = ctl(page, 'panel.brand.font.display');
    await control.waitFor({ timeout: 10_000 });
    /* the control at about a third of the window, so the plate has its room below it */
    await control.evaluate(
      (el) => {
        const body = el.closest('.ts-panel-body');
        if (!body) return;
        const r = el.getBoundingClientRect();
        body.scrollTop += r.top - window.innerHeight / 3;
      },
      null,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(300);
    await control.click();
    const plate = page.locator('[data-control="panel.brand.font.display.plate"]');
    await plate.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);
    const read = () =>
      page.evaluate(() => {
        const a = document.querySelector('[data-control="panel.brand.font.display"]');
        const p = document.querySelector('[data-control="panel.brand.font.display.plate"]');
        if (!a || !p) return null;
        return {
          anchor: a.getBoundingClientRect().bottom,
          top: p.getBoundingClientRect().top,
          layer: (p as HTMLElement).dataset.layer ?? null,
          open: p.matches(':popover-open'),
        };
      });
    const before = await read();
    await page.evaluate(() => {
      const body = document
        .querySelector('[data-control="panel.brand.font.display"]')
        ?.closest('.ts-panel-body');
      if (body) body.scrollTop += 120;
    });
    /* the next frame: autoUpdate places on the scroll event */
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const after = await read();
    readings.push(
      `font picker: before anchor ${before?.anchor} top ${before?.top}; after a 120 px scroll anchor ${after?.anchor} top ${after?.top}; layer ${after?.layer}, top layer ${after?.open}`,
    );
    expect(before, 'the plate opened').not.toBeNull();
    expect(after, 'the plate stayed open').not.toBeNull();
    expect(
      Math.abs((before!.anchor ?? 0) - (after!.anchor ?? 0)),
      'the panel scrolled',
    ).toBeGreaterThan(100);
    expect(
      Math.abs(after!.top - after!.anchor),
      "the plate's top on its anchor's bottom",
    ).toBeLessThanOrEqual(2);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    /* the Slideshow options menu, then the window from 1440 to 900 */
    await ctl(page, 'present.arrow').click();
    const menu = page.locator('.ts-menu').first();
    await menu.waitFor({ timeout: 8000 });
    await page.setViewportSize({ width: 900, height: 900 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.waitForTimeout(300);
    const inside = await page.evaluate(() => {
      const m = document.querySelector('.ts-menu');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: window.innerWidth - r.right,
        bottom: window.innerHeight - r.bottom,
      };
    });
    readings.push(`the Slideshow options menu at 900 px: ${JSON.stringify(inside)}`);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
    test.info().annotations.push({ type: 'layers', description: readings.join('; ') });
    expect(inside, 'the menu stayed open').not.toBeNull();
    for (const side of ['left', 'top', 'right', 'bottom'] as const)
      expect(inside![side], `8 px to spare on the ${side}`).toBeGreaterThanOrEqual(8);
  });

  /* DESIGN.md 3.1: the small floating plates at the 6 px corner and every key chip at 4 px */
  row('chrome.radius.floating', async ({ browser }) => {
    test.setTimeout(900_000);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const [width, appearance] of COMBOS) {
      const walk = await walkOf(browser, width, appearance);
      readings.push(`${walk.combo}: ${line(walk.floating)}; chips ${line(walk.chips)}`);
      for (const f of walk.floating)
        if (f.radius !== '6px') failures.push(`${walk.combo}: ${f.name} ${f.radius}`);
      for (const f of walk.chips)
        if (f.radius !== '4px') failures.push(`${walk.combo}: ${f.name} ${f.radius}`);
      /* a phone folds the account plate, the layout plate and the toolbar's pickers */
      const least = width < 720 ? 5 : 9;
      if (walk.floating.length < least)
        failures.push(`${walk.combo}: ${walk.floating.length} plates read`);
    }
    test.info().annotations.push({ type: 'radius', description: readings.join('; ') });
    expect(failures).toEqual([]);
  });

  /* DESIGN.md 3.1: the windows at 8 px */
  row('chrome.radius.windows', async ({ browser }) => {
    test.setTimeout(900_000);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const [width, appearance] of COMBOS) {
      const walk = await walkOf(browser, width, appearance);
      readings.push(`${walk.combo}: ${line(walk.windows)}`);
      for (const f of walk.windows)
        if (f.radius !== '8px') failures.push(`${walk.combo}: ${f.name} ${f.radius}`);
      if (walk.windows.length < 2)
        failures.push(`${walk.combo}: ${walk.windows.length} windows read`);
    }
    test.info().annotations.push({ type: 'radius', description: readings.join('; ') });
    expect(failures).toEqual([]);
  });

  /* DESIGN.md 3.1: Share, Slideshow, the buttons, fields, selects and segmented controls at 6 px,
     the checkbox at 4 px */
  row('chrome.radius.controls', async ({ browser }) => {
    test.setTimeout(900_000);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const [width, appearance] of COMBOS) {
      const walk = await walkOf(browser, width, appearance);
      readings.push(`${walk.combo}: ${line(walk.controls)}; checkboxes ${line(walk.checkboxes)}`);
      for (const f of walk.controls)
        if (f.radius !== '6px') failures.push(`${walk.combo}: ${f.name} ${f.radius}`);
      for (const f of walk.checkboxes)
        if (f.radius !== '4px') failures.push(`${walk.combo}: ${f.name} ${f.radius}`);
      for (const name of ['Share', 'Slideshow'])
        if (!walk.controls.some((f) => f.name === name)) failures.push(`${walk.combo}: no ${name}`);
    }
    test.info().annotations.push({ type: 'radius', description: readings.join('; ') });
    expect(failures).toEqual([]);
  });

  /* DESIGN.md 3.1: structure, the sheet, thumbnails, blocks, the selection and identity chips square */
  row('chrome.radius.structure-square', async ({ browser }) => {
    test.setTimeout(900_000);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const [width, appearance] of COMBOS) {
      const walk = await walkOf(browser, width, appearance);
      readings.push(`${walk.combo}: ${line(walk.structure)}`);
      for (const f of walk.structure)
        if (f.radius !== '0px') failures.push(`${walk.combo}: ${f.name} ${f.radius}`);
      if (walk.structure.length < 7) failures.push(`${walk.combo}: ${walk.structure.length} read`);
    }
    test.info().annotations.push({ type: 'radius', description: readings.join('; ') });
    expect(failures).toEqual([]);
  });

  /* DESIGN.md 3.4: every floating plate and window draws the --pt-edge frame and the ring; no
     element draws a shadow with a blur or an offset (an inset line drawn inside a box, the table
     seams, is a rule and not a shadow, the brand lint's reading) */
  row('chrome.plates.separation', async ({ browser }) => {
    test.setTimeout(900_000);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const [width, appearance] of COMBOS) {
      const walk = await walkOf(browser, width, appearance);
      for (const f of [...walk.floating, ...walk.windows]) {
        if (f.borderWidth !== '1px' || f.border !== f.edge)
          failures.push(
            `${walk.combo}: ${f.name} frame ${f.borderWidth} ${f.border} (want ${f.edge})`,
          );
        if (f.shadow !== f.ring) failures.push(`${walk.combo}: ${f.name} ring ${f.shadow}`);
      }
      const shadows = [...new Set(walk.shadows)];
      for (const each of shadows) failures.push(`${walk.combo}: ${each}`);
      readings.push(
        `${walk.combo}: ${walk.floating.length + walk.windows.length} plates with frame and ring; shadows with a blur or an offset ${shadows.length}; not drawn at this width: ${walk.absent.join(', ') || 'none'}`,
      );
    }
    test.info().annotations.push({ type: 'plates', description: readings.join('; ') });
    expect(failures).toEqual([]);
  });

  /* DESIGN.md 6.1 to 6.3: every scroller of the editor draws the one bar: an 8 px gutter, a 4 px
     thumb at 3:1 or more on its track, 6 px under the pointer; no 15 px platform bar */
  row('chrome.scroll.default-everywhere', async ({ browser: _browser, baseURL }) => {
    test.setTimeout(600_000);
    const readings: string[] = [];
    const failures: string[] = [];
    const judge = (r: BarReading | null, name: string, mustScroll: boolean) => {
      if (r === null) {
        readings.push(`${name}: not drawn`);
        failures.push(`${name} was not drawn`);
        return;
      }
      readings.push(barLine(r));
      if (r.gutter !== 8) failures.push(`${name}: gutter ${r.gutter}`);
      if (!r.overflows) {
        if (mustScroll) failures.push(`${name} does not scroll`);
        return;
      }
      if (!r.rest || r.rest.thumb !== 4)
        failures.push(`${name}: thumb at rest ${r.rest?.thumb ?? 'unread'} px`);
      if (!r.rest || r.rest.ratio < 3)
        failures.push(`${name}: thumb ${r.rest?.ratio.toFixed(2) ?? 'unread'}:1`);
      if (!r.hover || r.hover.thumb !== 6)
        failures.push(`${name}: thumb under the pointer ${r.hover?.thumb ?? 'unread'} px`);
    };
    for (const appearance of ['light', 'dark'] as const) {
      const { page } = await barPerson(baseURL, 1440, 900, appearance);
      /* the filmstrip: seven more slides make it scroll */
      for (let i = 0; i < 7; i += 1) {
        await ctl(page, 'toolbar.newSlide').click();
        await page.waitForTimeout(250);
      }
      await settled(page);
      judge(
        await barOf(page, `${appearance} the filmstrip`, '.pt-viewer.is-editor .ts-film'),
        `${appearance} the filmstrip`,
        true,
      );
      /* the speaker notes: thirty lines */
      const notes = page.locator('.ts-notes-field').first();
      await notes.click();
      await page.keyboard.type(Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n'), {
        delay: 0,
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      judge(
        await barOf(page, `${appearance} the speaker notes`, '.ts-notes-field'),
        `${appearance} the speaker notes`,
        true,
      );
      /* Format options for the title; the font list */
      const heading = page
        .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block]')
        .first();
      await heading.click();
      await page.waitForTimeout(300);
      await ctl(page, 'toolbar.formatOptions').click();
      await page.locator('.ts-panel').first().waitFor({ timeout: 10_000 });
      judge(
        await barOf(page, `${appearance} Format options`, '.ts-panel .ts-panel-body'),
        `${appearance} Format options`,
        false,
      );
      await ctl(page, 'toolbar.font').click();
      await page.locator('.ts-font-list').first().waitFor({ timeout: 10_000 });
      judge(
        await barOf(page, `${appearance} the font list`, '.ts-font-list'),
        `${appearance} the font list`,
        true,
      );
      await page.keyboard.press('Escape');
      /* a menu in a 360 px tall window */
      await page.setViewportSize({ width: 1440, height: 360 });
      await page.waitForTimeout(300);
      await ctl(page, 'menubar.insert').click();
      await page.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
      await page.waitForTimeout(300);
      judge(
        await barOf(page, `${appearance} the Insert menu at 360 px`, '#ts-menu-insert'),
        `${appearance} the Insert menu at 360 px`,
        true,
      );
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 900 });
      /* the Import slides list, when this server lists another presentation */
      await menuPath(page, 'file', 'file.importSlides').catch(() => undefined);
      const list = page.locator('[role="dialog"] .ts-dialog-list:not(.is-loading)').first();
      if (
        await list
          .waitFor({ timeout: 6000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const r = await barOf(
          page,
          `${appearance} the Import slides list`,
          '[role="dialog"] .ts-dialog-list:not(.is-loading)',
        );
        if (r) readings.push(barLine(r));
        if (r && r.gutter === 15)
          failures.push(`${appearance} the Import slides list draws a 15 px bar`);
      } else readings.push(`${appearance} the Import slides list: no list on this server`);
      await page.keyboard.press('Escape');
    }
    test.info().annotations.push({ type: 'scroll', description: readings.join('; ') });
    expect(failures).toEqual([]);
  });

  /* DESIGN.md 6.2, 6.4: at 200 % the stage's bars draw their track in the chrome's paper, the thumb
     reads 3:1 over a dark slide in light chrome, and the notes handle sits under the seam */
  row('chrome.scroll.stage-track', async ({ baseURL }) => {
    test.setTimeout(300_000);
    const { page } = await barPerson(baseURL, 1440, 900, 'light');
    /* the slides dark, the chrome light: Slide > Change theme (the toolbar's Theme button folds
       while the title the first write typed is still selected) */
    await menuPath(page, 'slide', 'slide.changeTheme');
    await ctl(page, 'panel.brand.appearance.dark').click({ timeout: 15_000 });
    await settled(page);
    await ctl(page, 'panel.brand.close')
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await menuPath(page, 'view', 'view.zoom', 'view.zoom.200');
    await page.waitForTimeout(800);
    const facts = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.ts-editor .pt-sheet-stage[data-zoom]');
      const handle = document.querySelector('.ts-notes-handle');
      if (!stage) return null;
      const r = stage.getBoundingClientRect();
      const h = handle?.getBoundingClientRect();
      const gutterY = stage.offsetHeight - stage.clientHeight;
      const gutterX = stage.offsetWidth - stage.clientWidth;
      return {
        chrome: document.documentElement.dataset.theme,
        gutterX,
        gutterY,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        handle: h ? { top: h.top, bottom: h.bottom, left: h.left, right: h.right } : null,
        bar: { top: r.bottom - gutterY, bottom: r.bottom, left: r.left, right: r.right - gutterX },
        paper: getComputedStyle(document.documentElement).getPropertyValue('--pt-paper').trim(),
      };
    });
    expect(facts, 'the stage at 200 %').not.toBeNull();
    const f = facts!;
    /* the vertical bar's strip at the stage's right edge */
    const strip = await stripOf(page, {
      x: Math.round(f.right - f.gutterX),
      top: Math.round(f.top),
      bottom: Math.round(f.bottom - f.gutterY),
      width: f.gutterX,
    });
    const paper = parseColor(f.paper);
    const track = strip ? parseColor(strip.track) : null;
    const trackIsPaper =
      paper !== null &&
      track !== null &&
      Math.abs(paper.r - track.r) + Math.abs(paper.g - track.g) + Math.abs(paper.b - track.b) < 12;
    const overlap =
      f.handle !== null &&
      f.handle.bottom > f.bar.top + 0.5 &&
      f.handle.top < f.bar.bottom - 0.5 &&
      f.handle.right > f.bar.left &&
      f.handle.left < f.bar.right;
    test.info().annotations.push({
      type: 'scroll',
      description: `chrome ${f.chrome}; gutters ${f.gutterX} by ${f.gutterY}; track ${strip?.track} (paper ${f.paper}); thumb ${strip?.thumb} px ${strip?.thumbColor} ${strip?.ratio.toFixed(2)}:1; the horizontal bar ${Math.round(f.bar.top)} to ${Math.round(f.bar.bottom)}, the notes handle ${f.handle ? `${Math.round(f.handle.top)} to ${Math.round(f.handle.bottom)}` : 'absent'}`,
    });
    expect(f.chrome).toBe('light');
    expect(f.gutterX, 'the stage scrolls at 200 %').toBe(8);
    expect(trackIsPaper, "the track is the chrome's paper").toBe(true);
    expect(strip?.ratio ?? 0, 'the thumb at 3:1 or more').toBeGreaterThanOrEqual(3);
    expect(overlap, 'the notes handle covers no part of the horizontal bar').toBe(false);
  });

  /* DESIGN.md 4.5: the editor's numbers in tabular figures */
  row('chrome.numerals.tabular', async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await fresh(await personIn(browser, 'light'));
    await menuPath(page, 'view', 'view.showRuler').catch(() => undefined);
    const heading = page
      .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block]')
      .first();
    await heading.click();
    await page.waitForTimeout(300);
    await ctl(page, 'toolbar.formatOptions').click();
    await page.locator('.ts-panel .ts-fo-field input').first().waitFor({ timeout: 10_000 });
    const facts = await page.evaluate(() => {
      const read = (name: string, sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        return { name, value: el ? getComputedStyle(el).fontVariantNumeric : 'absent' };
      };
      const list = [
        read('a ruler numeral', '.ts-ruler-numeral'),
        read('the zoom field', '.ts-tb-zoom-field'),
        read('a filmstrip number', '.ts-card-n'),
        read('a Format options field', '.ts-panel .ts-fo-field input'),
        read('the font size field', '.ts-tb-size-field'),
        read('the inbox count', '.ts-title-inbox-count'),
      ];
      /* "1111" and "0000" in a Format options field's face */
      const input = document.querySelector<HTMLElement>('.ts-panel .ts-fo-field input');
      let widths: number[] = [];
      if (input) {
        const cs = getComputedStyle(input);
        widths = ['1111', '0000'].map((text) => {
          const span = document.createElement('span');
          span.textContent = text;
          span.style.cssText = `position:fixed;left:-9999px;top:0;white-space:pre;font:${cs.font};font-variant-numeric:${cs.fontVariantNumeric};font-feature-settings:${cs.fontFeatureSettings}`;
          document.body.append(span);
          const w = span.getBoundingClientRect().width;
          span.remove();
          return w;
        });
      }
      return { list, widths };
    });
    /* Version history's times */
    await ctl(page, 'deck.lastEdit')
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await page
      .locator('.ts-version-meta')
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
    /* the meta lines and the rows' own times, a window's span and each version's button ("Oct 6,
       9:00 AM", the fix round of pass 2, finding 5): every one that holds a figure, with a window
       opened so its versions' buttons are drawn */
    const windowRow = page.locator('.ts-version-window-row[aria-expanded="false"]').first();
    if (
      (await page.locator('button.ts-version-note').count()) === 0 &&
      (await windowRow.count()) > 0
    )
      await windowRow.click();
    await page
      .locator('button.ts-version-note')
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
    const versions = await page.evaluate(() =>
      (
        [
          ["Version history's times", '.ts-version-meta'],
          ["Version history's row time", '.ts-version-note'],
        ] as const
      ).flatMap(([name, sel]) => {
        const els = [...document.querySelectorAll(sel)].filter((e) =>
          /\d/.test(e.textContent ?? ''),
        );
        if (els.length === 0) return [{ name, value: 'absent' }];
        return els.map((el) => ({
          name: `${name} (${el.tagName.toLowerCase()} "${el.textContent}")`,
          value: getComputedStyle(el).fontVariantNumeric,
        }));
      }),
    );
    await page.keyboard.press('Escape');
    /* the Keyboard shortcuts dialog's key chips: their font shorthand must not reset the figures */
    await page.keyboard.press('Meta+/');
    await page
      .locator('.ts-shortcuts-keys .pt-kbd')
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
    const chips = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.ts-shortcuts-keys .pt-kbd')].find((e) =>
        /\d/.test(e.textContent ?? ''),
      );
      return {
        name: `the shortcuts dialog's key chip "${el?.textContent ?? ''}"`,
        value: el ? getComputedStyle(el).fontVariantNumeric : 'absent',
      };
    });
    const all = [...facts.list, ...versions, chips];
    test.info().annotations.push({
      type: 'numerals',
      description: `${all.map((f) => `${f.name} ${f.value}`).join(', ')}; "1111" ${facts.widths[0]?.toFixed(2)} px and "0000" ${facts.widths[1]?.toFixed(2)} px`,
    });
    for (const f of all)
      if (f.value !== 'absent' || f.name !== 'the inbox count')
        expect(f.value, f.name).toContain('tabular-nums');
    expect(
      versions.some((v) => v.name.includes('(button')),
      "a version's own button read",
    ).toBe(true);
    expect(facts.widths.length).toBe(2);
    expect(Math.abs((facts.widths[0] ?? 0) - (facts.widths[1] ?? 1))).toBeLessThan(0.01);
    await page.keyboard.press('Escape');
  });

  /* DESIGN.md 4.2: no cv11 or ss01 in the chrome; a General Translation heading keeps them */
  row('chrome.type.default-glyphs', async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await fresh(await personIn(browser, 'light'));
    await ctl(page, 'menubar.insert').click();
    await page.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
    const chrome = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (el.closest('.pt-slide, .ts-thumb, .pt-preview-frame')) continue;
        const ff = getComputedStyle(el).fontFeatureSettings;
        if (/cv11|ss01/.test(ff))
          out.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} ${ff}`);
      }
      return out;
    });
    await page.keyboard.press('Escape');
    /* a heading of the General Translation brand deck, which every base serves */
    await page.goto('/deck/gt-brand');
    const headings = page.locator('.pt-slide h1, .pt-slide h2');
    await headings.first().waitFor({ state: 'attached', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    const heading = await headings
      .first()
      .evaluate((el) => getComputedStyle(el).fontFeatureSettings);
    test.info().annotations.push({
      type: 'type',
      description: `chrome elements with cv11 or ss01: ${chrome.length}${chrome.length ? ` (${chrome.slice(0, 8).join('; ')})` : ''}; a General Translation heading: ${heading}`,
    });
    expect(chrome).toEqual([]);
    expect(heading).toMatch(/cv11/);
    expect(heading).toMatch(/ss01/);
  });

  /* DESIGN.md question 6: a dark system gives dark chrome on /new and nothing is stored until the
     person picks an appearance */
  row('chrome.appearance.system-until-picked', async ({ browser }) => {
    test.setTimeout(300_000);
    const context = await browser.newContext({
      extraHTTPHeaders,
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    try {
      await page.goto('/new');
      await waitEditor(page);
      const ready = Date.now();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.waitForTimeout(Math.max(0, 10_000 - (Date.now() - ready)));
      const stored = await page.evaluate(() => ({
        theme: localStorage.getItem('gt-theme'),
        deck: localStorage.getItem('gt-deck-theme'),
        html: document.documentElement.dataset.theme,
      }));
      await menuPath(
        page,
        'tools',
        'tools.preferences',
        'tools.preferences.appearance',
        'tools.preferences.appearance.light',
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      const picked = await page.evaluate(() => localStorage.getItem('gt-theme'));
      await page.goto('/decks');
      await page.locator('.ts-home-page[data-hydrated]').first().waitFor({ timeout: 60_000 });
      const decks = await page.evaluate(() => document.documentElement.dataset.theme);
      test.info().annotations.push({
        type: 'appearance',
        description: `a dark system: html ${stored.html} 10 s after the editor was ready, gt-theme ${stored.theme}, gt-deck-theme ${stored.deck}; after Tools > Preferences > Appearance > Light gt-theme ${picked}; /decks then ${decks}`,
      });
      expect(stored.html).toBe('dark');
      expect(stored.theme).toBeNull();
      expect(picked).toBe('light');
      expect(decks).toBe('light');
    } finally {
      await context.close();
    }
  });

  return declared;
}
