import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { LAYERS } from '@turboslide/theme/scale';

import {
  Scratch,
  ctl,
  extraHTTPHeaders,
  headingRun,
  invoke,
  openEditor,
  settled,
  teardownAll,
  title,
  typeInto,
  waitEditor,
  waitRevision,
} from './lib';
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
        const lengths = (layer.replace(/(rgba?|oklch|color|hsla?)\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []).map(
          (n) => Number.parseFloat(n),
        );
        const [x = 0, y = 0, blur = 0] = lengths;
        if (x !== 0 || y !== 0 || blur !== 0) {
          out.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}: ${layer.trim()}`);
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
      await page.locator('#pt-tip:not([hidden])').waitFor({ timeout: 8000 }).catch(() => undefined);
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
      if (phone) await subRow.click().catch(() => undefined);
      await page.locator('.ts-menu.is-sub').first().waitFor({ timeout: 5000 }).catch(() => undefined);
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
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 8000 }).catch(() => undefined);
      await take(walk.floating, 'a context menu', '.ts-context-menu');
      await closeAll(page);
    }
    /* the account plate menu (the title row hides the presence slot under 720 px) */
    if (!phone && (await visible('title.account'))) {
      await ctl(page, 'title.account').click();
      await page.locator('.ts-plate-menu').first().waitFor({ timeout: 8000 }).catch(() => undefined);
      await take(walk.floating, 'the account plate menu', '.ts-plate-menu');
      walk.shadows.push(...(await blurredShadows(page)));
      await closeAll(page);
    } else walk.absent.push('the account plate menu (no presence slot at this width)');
    /* the layout plate */
    if (await visible('toolbar.layout')) {
      await ctl(page, 'toolbar.layout').click();
      await page.locator('.ts-layout-plate').first().waitFor({ timeout: 8000 }).catch(() => undefined);
      await take(walk.floating, 'the layout plate', '.ts-layout-plate');
      await closeAll(page);
    } else walk.absent.push('the layout plate (the Layout button folds at this width)');
    /* the title selected: the selection, its chip, a block; the colour and font pickers */
    const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block]').first();
    await heading.click();
    await page.waitForTimeout(400);
    await take(walk.structure, 'a block on the slide', '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block]');
    await take(walk.structure, 'the selection ring', '.ts-select.is-selected');
    await take(walk.structure, 'the selection chip', '.ts-select-chip');
    for (const [control, name, plate] of [
      ['toolbar.textColor', 'the colour plate', '.ts-color-plate'],
      ['toolbar.font', 'the font picker', '.ts-font-plate'],
    ] as const) {
      if (await visible(control)) {
        await ctl(page, control).click();
        await page.locator(plate).first().waitFor({ timeout: 8000 }).catch(() => undefined);
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
      await page.locator('.ts-panel').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
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
        await page.locator('.pt-preview.is-on').waitFor({ timeout: 8000 }).catch(() => undefined);
        await take(walk.windows, 'the hover preview', '.pt-preview.is-on');
      }
    } else if (phone) walk.absent.push('the hover preview (no hover on a phone layout)');
    await closeAll(page);
    /* the Share dialog: the window, its select, field, checkbox and solid button; the snackbar */
    await openShare(page);
    await take(walk.windows, 'the Share dialog', '[data-control="dialog.share"]');
    await take(walk.controls, "the dialog's select", '[data-control="dialog.share"] select');
    await take(walk.controls, "the dialog's field", '[data-control="dialog.share.address"]');
    await take(walk.controls, 'the solid button', '[data-control="dialog.share"] .pt-ib.is-solid');
    await take(walk.checkboxes, "the dialog's checkbox", '[data-control="dialog.share"] .ts-dialog-check-box');
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

export function chromeSurfaces(): string[] {
  const declared: string[] = [];
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (!isCoreId(id)) return;
    declared.push(id);
    test(title(id), body);
  };
  test.afterAll(async () => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    for (const person of [...people.values()]) {
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
    people.clear();
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
     dialogs of the editor raise the browser's own select lists (Share's General access and role)
     and the tooltip of their controls; the select takes its change with the dialog in the top
     layer, and the tooltip of the dialog's Done button is the first element at its centre */
  row('chrome.layers.menu-over-dialog', async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await fresh(await personIn(browser, 'light'));
    await openShare(page);
    const select = page.locator('[data-control="dialog.share"] select').first();
    await select.waitFor({ timeout: 10_000 });
    const box = await select.boundingBox();
    expect(box, 'the first select of the Share dialog').not.toBeNull();
    const hit = await topAt(page, box!.x + box!.width / 2, box!.y + box!.height / 2);
    const before = await select.inputValue();
    const values = await select.evaluate((el) =>
      [...(el as HTMLSelectElement).options].map((o) => o.value),
    );
    const other = values.find((v) => v !== before);
    expect(other, 'a second option to pick').toBeDefined();
    await select.selectOption(other!);
    await expect(select).toHaveValue(other!);
    await page.waitForTimeout(500);
    await select.selectOption(before);
    await expect(select).toHaveValue(before);
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
      description: `the select at its centre: ${hit.join(' > ')}; values ${before} -> ${other} -> ${before}; the dialog ${JSON.stringify(dialog)}; the close button's tooltip ${JSON.stringify(tip)}`,
    });
    expect(hit[0] ?? '', 'the select is the first element at its centre').toMatch(/^select/);
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
      if (walk.windows.length < 2) failures.push(`${walk.combo}: ${walk.windows.length} windows read`);
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
          failures.push(`${walk.combo}: ${f.name} frame ${f.borderWidth} ${f.border} (want ${f.edge})`);
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

  return declared;
}
