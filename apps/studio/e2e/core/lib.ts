import { inflateRawSync } from 'node:zlib';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Download, Locator, Page } from '@playwright/test';

import { coreTitle, rowsOfSpec } from './matrix';

// The shared library of the core specs (docs/FOCUS.md 6.1). The rules a core spec keeps so that
// it runs against production as written: no deck seeded from disk or a fixture, no environment
// variable read but PLAYWRIGHT_BASE_URL (the config's baseURL) and VERCEL_OIDC_TOKEN (sent as
// x-vercel-trusted-oidc-idp-token on a preview), every observation through the page,
// `window.turboslide.studio.describe()`, the network and the download, every deck created from
// /new by the spec itself and torn down through the product (File > Move to trash, Delete
// forever on /decks/trash, a 404 on /edit/<id>). `node:zlib` alone reads the files the browser
// downloaded. No spec clicks Empty trash or touches a deck it did not create.
//
// One browser context per spec file holds one anonymous principal, so the deck a spec created
// stays its own under the restricted default access (the orchestrator's ruling (2)); a second
// person is a second context. Typing goes at a human pace (60 ms between keys); clicks are
// Playwright's own. `retries` stays 0 in playwright.config.ts and no spec configures retries.

export const OIDC = process.env['VERCEL_OIDC_TOKEN'];
/** The header a preview behind Vercel Authentication needs; empty on production and localhost. */
export const extraHTTPHeaders: Record<string, string> = OIDC
  ? { 'x-vercel-trusted-oidc-idp-token': OIDC }
  : {};

export const TYPE_DELAY = 60;

/** A test title that carries the matrix id first, so the gate maps the report back to the row. */
export const title = coreTitle;

/**
 * Registers one failing test for every row of this spec file that no test drives, so a row the
 * spec forgot reads "no test" in the report and is never counted as passed (6.1).
 */
export function coverage(specFile: string, driven: readonly string[]): void {
  const set = new Set(driven);
  for (const row of rowsOfSpec(specFile)) {
    if (set.has(row.id)) continue;
    test(coreTitle(row.id), () => {
      throw new Error(`no test in ${specFile} drives the matrix row ${row.id}`);
    });
  }
}

/** The bound of a window API call: the toolkit's (VERIFICATION.md pass 2 F-stall, C2-F27). */
export const INVOKE_TIMEOUT_MS = 60_000;

/**
 * A window API call bounded in time. `page.evaluate` has no timeout, so an `asset.add` the blob
 * tier never answered (C2-F27: `images.replace.drop-on-picture`, two of two runs) held the test
 * to its own timeout and failed as "Execution context was destroyed", the teardown's navigation;
 * a call that has not answered within `ms` fails with the action's name and the title row's
 * words instead. The call itself keeps running in the page; its late answer is not read.
 */
export async function invoke<T = unknown>(
  page: Page,
  action: string,
  input?: unknown,
  ms = INVOKE_TIMEOUT_MS,
): Promise<T> {
  const evaluated = page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ late: true }>((resolve) => {
    timer = setTimeout(() => resolve({ late: true }), ms);
  });
  try {
    const won = await Promise.race([
      evaluated.then((value) => ({ late: false as const, value })),
      late,
    ]);
    if (won.late) {
      evaluated.catch(() => undefined);
      const words = await page
        .locator('[data-control="deck.saveState"]')
        .textContent({ timeout: 2000 })
        .catch(() => null);
      throw new Error(
        `window API ${action} did not answer within ${ms / 1000} s (the title row reads "${words?.trim() ?? 'unknown'}")`,
      );
    }
    return won.value;
  } finally {
    clearTimeout(timer);
  }
}

export type EditorState = {
  revision: number;
  serverRevision: number;
  pending: number;
  slideId: string;
  blockId: string | null;
  theme: string;
  zoom: number | 'fit';
  settings: Record<string, boolean | string>;
  sync: { connected: boolean; pending: number; tier: string; transport: string };
  presence: { clientId: string | null; others: { clientId: string }[]; count: number };
  access: { mode: string; role: string | null; revision?: number };
  comments?: {
    threads: { id: string; resolved?: boolean; replies: unknown[] }[];
    /** true once `comment.list` has answered after the room opened (b6's cycle 3 R3, with the integrator's controller projection) */
    loaded?: boolean;
  };
  view?: { present: boolean };
};

export async function state(page: Page): Promise<EditorState> {
  return page.evaluate(() => window.turboslide!.studio.describe().state as unknown as EditorState);
}

/** Waits until the editor shell has settled (the window API is up and the viewer is drawn). */
export async function waitEditor(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 90_000 },
  );
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
    'data-settled',
    '',
    {
      timeout: 60_000,
    },
  );
}

/** Waits until nothing is pending and the title row reads All changes saved. */
export async function settled(page: Page, timeout = 20_000): Promise<EditorState> {
  const until = Date.now() + timeout;
  let s = await state(page);
  while (Date.now() < until) {
    s = await state(page);
    const words = await page
      .locator('[data-control="deck.saveState"]')
      .textContent()
      .catch(() => null);
    if (
      (s.sync?.pending ?? s.pending ?? 0) === 0 &&
      (words === null || /All changes saved|Not saved yet/.test(words))
    )
      return s;
    await page.waitForTimeout(150);
  }
  return s;
}

export async function waitRevision(page: Page, want: number, timeout = 30_000): Promise<number> {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if (s.revision >= want || Date.now() > until) return s.revision;
    await page.waitForTimeout(150);
  }
}

export const ctl = (page: Page, control: string): Locator =>
  page.locator(`[data-control="${control}"]`).first();

/** The heading run of the current slide, or the first run. */
export async function headingRun(page: Page): Promise<string> {
  const runs = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run') ?? ''),
  );
  return runs.find((r) => /heading/.test(r)) ?? runs[0] ?? '';
}

/** Double clicks a run, selects its text and types over it at a human pace, then Escape. */
export async function typeInto(page: Page, run: string, text: string): Promise<void> {
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
}

/** The runs inside a block's box on the stage. */
export async function runsOfBlock(page: Page, blockId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
    const box = inner?.closest('.free') ?? inner;
    if (!box) return [];
    const own = box.matches('[data-run]') ? [box.getAttribute('data-run') ?? ''] : [];
    return [
      ...own,
      ...[...box.querySelectorAll('[data-run]')].map((el) => el.getAttribute('data-run') ?? ''),
    ];
  }, blockId);
}

/** True while a text session is open on the stage. */
export async function editing(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
  );
}

/**
 * Selects a block as an object with one click at its centre (AMENDMENTS.md A1 rule 1: one click
 * selects and places no caret). On a build that still opens a text session on that click, Escape
 * ends the session and keeps the block selected; the rows that judge the click model are the
 * probe's, so this helper only makes the selection the spec row needs. The move handle is waited
 * for.
 */
export async function selectBlock(page: Page, blockId: string): Promise<void> {
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`).first();
  await el.click();
  await page.waitForTimeout(200);
  if (await editing(page)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await expect(page.locator(`.ts-overlay [data-control="handle.${blockId}.move"]`)).toBeAttached({
    timeout: 5000,
  });
}

/**
 * Right clicks a block where the object menu opens: the block selected as an object first (a
 * right click inside a text run with its caret open shows no menu, F4), then the block element
 * itself. On the preview the block element opened the menu with its six rows while the overlay's
 * frame edge strip and the move handle opened nothing (the b4 repro right-click-edge).
 */
export async function rightClickBlock(page: Page, blockId: string): Promise<void> {
  await selectBlock(page, blockId);
  await page
    .locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`)
    .first()
    .click({ button: 'right' });
  await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 });
}

/** Opens a menubar menu, hovers the parents and clicks the last row. */
export async function menuPath(page: Page, menuId: string, ...rowIds: string[]): Promise<void> {
  await ctl(page, `menubar.${menuId}`).click();
  await page.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
  for (let i = 0; i < rowIds.length - 1; i += 1) {
    await ctl(page, `menu.${rowIds[i]}`).hover();
    await page
      .locator(`[data-control="menu.${rowIds[i + 1]}"]`)
      .first()
      .waitFor({ timeout: 6000 });
  }
  await ctl(page, `menu.${rowIds[rowIds.length - 1]}`).click();
  await page.waitForTimeout(250);
}

/** The slide ids in order, through slide.list. */
export async function slideOrder(page: Page): Promise<string[]> {
  const list = await invoke<
    { slides?: { id: string }[]; items?: { id: string }[] } | { id: string }[]
  >(page, 'slide.list', {});
  const arr = Array.isArray(list) ? list : (list.slides ?? list.items ?? []);
  return arr.map((s) => (typeof s === 'string' ? s : s.id));
}

export async function slideJson(page: Page, slideId: string): Promise<Record<string, unknown>> {
  const got = await invoke<{ slide?: Record<string, unknown> } & Record<string, unknown>>(
    page,
    'slide.get',
    { slideId },
  );
  return (got.slide ?? got) as Record<string, unknown>;
}

/** The positioned objects of a slide (id, type, pos), the probe's reading. */
export async function objectsOf(
  page: Page,
  slideId: string,
): Promise<
  {
    id: string;
    type: string;
    pos: { x: number; y: number; w: number; h: number };
    block: Record<string, unknown>;
  }[]
> {
  const slide = await slideJson(page, slideId);
  const out: {
    id: string;
    type: string;
    pos: { x: number; y: number; w: number; h: number };
    block: Record<string, unknown>;
  }[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      const n = node as Record<string, unknown>;
      if (
        typeof n['id'] === 'string' &&
        typeof n['type'] === 'string' &&
        n['pos'] &&
        typeof n['pos'] === 'object'
      )
        out.push({
          id: n['id'],
          type: n['type'],
          pos: n['pos'] as { x: number; y: number; w: number; h: number },
          block: n,
        });
      for (const v of Object.values(n)) walk(v);
    }
  };
  walk(slide);
  return out;
}

/** Adds a slide after the current one from the toolbar; returns the new id. */
export async function addSlide(page: Page): Promise<string> {
  const before = await slideOrder(page);
  await ctl(page, 'toolbar.newSlide').click();
  await expect
    .poll(async () => (await slideOrder(page)).length, { timeout: 20_000 })
    .toBe(before.length + 1);
  const after = await slideOrder(page);
  const id = after.find((x) => !before.includes(x)) ?? '';
  await settled(page);
  return id;
}

/** Clicks a filmstrip card. */
export async function clickCard(page: Page, slideId: string): Promise<void> {
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await expect.poll(async () => (await state(page)).slideId, { timeout: 8000 }).toBe(slideId);
  await page.waitForTimeout(300);
}

/** Skips the current slide through Slide > Skip slide. */
export async function skipCurrent(page: Page): Promise<void> {
  const id = (await state(page)).slideId;
  await menuPath(page, 'slide', 'slide.skipSlide');
  await expect(ctl(page, `filmstrip.slide.${id}`)).toHaveAttribute('data-skip', '', {
    timeout: 8000,
  });
  /* the document carries the skip before the caller reads a play list from it (the fix round's
     preview run started a show that counted the skipped slide while its write was in flight) */
  await expect
    .poll(async () => (await slideJson(page, id))['skip'] === true, { timeout: 10_000 })
    .toBe(true);
  await settled(page);
}

/** Types a speaker note under the current slide. */
export async function typeNote(page: Page, text: string): Promise<void> {
  await ctl(page, 'notes.text').click();
  await page.keyboard.type(text, { delay: TYPE_DELAY });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await settled(page);
}

/** Places a block through the window API: a setup write, never a driven step. */
export async function placeBlock(
  page: Page,
  slideId: string,
  block: Record<string, unknown>,
  slot = 'main',
): Promise<void> {
  const s = await state(page);
  await invoke(page, 'block.insert', { baseRevision: s.revision, slideId, slot, block });
  await settled(page);
}

/** A small two colour PNG drawn in the page, as a data URL. */
export function pngDataUrl(page: Page, w = 96, h = 64): Promise<string> {
  return page.evaluate(
    ([pw, ph]) => {
      const c = document.createElement('canvas');
      c.width = pw;
      c.height = ph;
      const g = c.getContext('2d')!;
      g.fillStyle = '#1b1b1b';
      g.fillRect(0, 0, pw, ph);
      g.fillStyle = '#e8e8e8';
      g.fillRect(pw / 8, ph / 5, (pw * 3) / 4, (ph * 3) / 5);
      return c.toDataURL('image/png');
    },
    [w, h] as const,
  );
}

/** The bytes of a PNG drawn in the page, for the file chooser and the drop. */
export async function pngBytes(page: Page, w = 96, h = 64): Promise<Buffer> {
  const url = await pngDataUrl(page, w, h);
  return Buffer.from(url.split(',')[1] ?? '', 'base64');
}

/**
 * Places a picture through the window API (asset.add then block.insert), the dialog's own writes.
 * `type` is the block the Insert image routes make (`shot`) or the covering `picture` block the
 * Change background dialog places and reads (its Remove picture row finds a `picture` block
 * covering the sheet, packages/chrome/src/dialogs/Background.tsx).
 */
export async function placePicture(
  page: Page,
  slideId: string,
  pos: { x: number; y: number; w: number; h: number },
  id = `shot-${Date.now().toString(36)}`,
  type: 'shot' | 'picture' = 'shot',
): Promise<string> {
  const url = await pngDataUrl(page);
  const s = await state(page);
  /* the asset id is passed (b7's cycle 3 C3-R3): a window API `asset.add` with a data URL and no
     id names every picture `assets/capture.png`, so a second picture with other bytes is refused
     ("exists with other bytes"); the spec's PNGs are byte identical, which is why the rows passed */
  const asset = await invoke<{ id: string; revision?: number }>(page, 'asset.add', {
    id: `${id}-asset`,
    url,
    role: 'capture',
    alt: 'core spec picture',
    baseRevision: s.revision,
  });
  await settled(page);
  const s2 = await state(page);
  await invoke(page, 'block.insert', {
    slideId,
    slot: 'main',
    block: { id, type, asset: asset.id, pos },
    baseRevision: Math.max(s2.revision, asset.revision ?? 0),
  });
  await settled(page);
  return id;
}

// ---------------------------------------------------------------------------------------------
// the scratch decks

/** The decks a spec created, torn down through the product in afterAll and in a finally. */
export class Scratch {
  readonly ids = new Set<string>();
  add(id: string): string {
    this.ids.add(id);
    return id;
  }
}

/**
 * A new deck from /new: the first write through the product (the title typed and committed)
 * creates it. Returns the deck id, registered for teardown.
 */
export async function newDeck(
  page: Page,
  scratch: Scratch,
  titleText = 'Core spec deck',
): Promise<string> {
  await page.goto('/new');
  await waitEditor(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  /* the fresh draft's paint (VERIFICATION.md C2-F26: one /new load of the enforce preview drew a
     dithered texture over the whole stage and the title read "covered by html" to the first
     click): the setup fails on the paint's own facts rather than on an actionability wait */
  const paint = await groundPaintFacts(page);
  expect(paint.ok, `the fresh draft's stage paints right (${paint.summary})`).toBe(true);
  const run = await headingRun(page);
  await typeInto(page, run, titleText);
  await waitRevision(page, 1, 30_000);
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(page);
  if (
    await ctl(page, 'dialog.namePrompt')
      .isVisible()
      .catch(() => false)
  )
    await ctl(page, 'dialog.namePrompt.close')
      .click()
      .catch(() => undefined);
  return scratch.add(info.id);
}

/**
 * The paint of a fresh draft's stage, the walk's reading (core-walk/toolkit.mjs `groundPaintFacts`):
 * every canvas outside the filmstrip against its box (the dither ramp draws one cell per two
 * layout px; a bitmap drawn before its box had a size is stretched), every painted element whose
 * box runs past the sheet while covering more than half the stage, and what the pointer meets at
 * the first run's centre and at the sheet's centre.
 */
export async function groundPaintFacts(page: Page): Promise<{ ok: boolean; summary: string }> {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const stage = document.querySelector('.ts-stagewrap.ts-editor');
    const sheet = stage?.querySelector('.pt-slide:not(.is-leaving)') ?? null;
    const filmstrip = document.querySelector('.ts-filmstrip, aside.pt-sb');
    const stretched = [...document.querySelectorAll('canvas')]
      .filter((c) => c.clientWidth > 0 && c.width > 0 && !filmstrip?.contains(c))
      .map((c) => ({
        cls: c.className || 'canvas',
        perCell: Math.round((c.clientWidth / c.width) * 100) / 100,
      }))
      .filter((c) => c.perCell > 3);
    const covers: string[] = [];
    if (stage && sheet) {
      const st = box(stage);
      const sh = box(sheet);
      for (const el of document.querySelectorAll(
        'canvas, img, video, svg, [style*="background"]',
      )) {
        if (filmstrip?.contains(el)) continue;
        const r = box(el);
        if (r.w === 0 || r.h === 0) continue;
        const ix = Math.max(0, Math.min(r.x + r.w, st.x + st.w) - Math.max(r.x, st.x));
        const iy = Math.max(0, Math.min(r.y + r.h, st.y + st.h) - Math.max(r.y, st.y));
        const past =
          r.x < sh.x - sh.w * 0.05 ||
          r.y < sh.y - sh.h * 0.05 ||
          r.x + r.w > sh.x + sh.w * 1.05 ||
          r.y + r.h > sh.y + sh.h * 1.05;
        if (ix * iy > (st.w * st.h) / 2 && past)
          covers.push(`${el.tagName.toLowerCase()} ${Math.round(r.w)}x${Math.round(r.h)}`);
      }
    }
    const hit = (x: number, y: number, within: Element | null) => {
      const el = document.elementFromPoint(x, y);
      const inside = Boolean(el && within && (within.contains(el) || el.contains(within)));
      return { name: el ? el.tagName.toLowerCase() : 'nothing', inside };
    };
    const run = sheet?.querySelector('[data-run]') ?? null;
    const rr = run?.getBoundingClientRect();
    const runHit = rr
      ? hit(rr.x + rr.width / 2, rr.y + rr.height / 2, run)
      : { name: 'no run', inside: false };
    const sr = sheet?.getBoundingClientRect();
    const sheetHit = sr
      ? hit(sr.x + sr.width / 2, sr.y + sr.height * 0.8, sheet)
      : { name: 'no sheet', inside: false };
    return {
      ok: stretched.length === 0 && covers.length === 0 && runHit.inside && sheetHit.inside,
      summary: `stretched canvases ${stretched.map((c) => `${c.cls} at ${c.perCell} px per cell`).join(', ') || 'none'}; covers past the sheet ${covers.join(', ') || 'none'}; at the title centre ${runHit.name} (inside the run ${runHit.inside}); at the sheet ${sheetHit.name} (inside the sheet ${sheetHit.inside})`,
    };
  });
}

export async function openEditor(page: Page, deckId: string, hash = ''): Promise<void> {
  await page.goto(`/edit/${deckId}${hash}`);
  await waitEditor(page);
  await settled(page);
}

/** GET a path with the preview header, following no redirect; the status. */
export async function statusOf(page: Page, path: string): Promise<number> {
  const res = await page.request.get(path, { headers: extraHTTPHeaders, maxRedirects: 0 });
  return res.status();
}

/**
 * Tears one deck down through the product: File > Move to trash in the editor, Delete forever on
 * /decks/trash, then a 404 on /edit/<id> within 20 s. The actions API is the fallback for the
 * record when the product path throws; the 404 is asserted either way.
 */
export async function teardown(page: Page, deckId: string): Promise<void> {
  let trashed = false;
  try {
    const status = await statusOf(page, `/edit/${deckId}`);
    if (status === 404) return;
    await openEditor(page, deckId);
    await page.keyboard.press('Escape');
    await ctl(page, 'menubar.file').click();
    await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
    await ctl(page, 'menu.file.moveToTrash').click();
    await page.waitForURL(/\/decks/, { timeout: 20_000 });
    trashed = true;
  } catch {
    // the record is trashed through the actions API below
  }
  if (!trashed) {
    try {
      await openEditor(page, deckId);
      const info = await invoke<{ revision: number }>(page, 'deck.info');
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision });
    } catch {
      // the trash page may still list it
    }
  }
  try {
    await deleteForever(page, deckId);
  } catch {
    try {
      await openEditor(page, deckId);
      const info = await invoke<{ revision: number }>(page, 'deck.info');
      await invoke(page, 'deck.remove', { id: deckId, baseRevision: info.revision, confirm: true });
    } catch {
      // the 404 below tells the truth
    }
  }
  await expect
    .poll(() => statusOf(page, `/edit/${deckId}`), { timeout: 20_000, intervals: [2000] })
    .toBe(404);
}

/** Delete forever on /decks/trash for one deck, through the product. */
export async function deleteForever(page: Page, deckId: string): Promise<void> {
  await page.goto('/decks/trash');
  await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
    timeout: 30_000,
  });
  const card = ctl(page, `trash.card.${deckId}`);
  await card.waitFor({ timeout: 30_000 });
  await ctl(page, `trash.delete.${deckId}`).click();
  await ctl(page, 'trash.confirm.ok').click();
  await card.waitFor({ state: 'detached', timeout: 30_000 });
}

/** Tears every registered deck down, each in its own try, and asserts the 404 for each. */
export async function teardownAll(page: Page, scratch: Scratch): Promise<void> {
  const failures: string[] = [];
  for (const id of [...scratch.ids]) {
    try {
      await teardown(page, id);
      scratch.ids.delete(id);
    } catch (error) {
      failures.push(
        `${id}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
  }
  expect(failures, 'every scratch deck is trashed, deleted forever and answers 404').toEqual([]);
}

/** One context for the whole spec file (one principal), with the preview header. */
export async function ownerContext(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  return { context, page };
}

/** A second person: another context with the same header and no cookie of the first. */
export async function otherContext(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  return ownerContext(browser);
}

// ---------------------------------------------------------------------------------------------
// downloads and the files

/**
 * Runs `start`, waits for the download the page begins within `timeout`, and reads its bytes.
 * A refused export (the anonymous quota of five a day, SPEC-3 8.3; b7's C2-R20 read the sixth
 * download of `core/export.spec.ts` refused 429 with "You have reached today's export limit"
 * while the row waited 30 s for a file) fails at once on the sentence the dialog or the snackbar
 * shows, so the ledger names the refusal and not the wait.
 */
export async function download(
  page: Page,
  start: () => Promise<void>,
  timeout = 30_000,
): Promise<{ name: string; bytes: Buffer; ms: number; download: Download }> {
  const t = Date.now();
  const waiting = page.waitForEvent('download', { timeout });
  waiting.catch(() => undefined);
  await start();
  const refusal = (async (): Promise<string | null> => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const text = await page
        .evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-control="dialog.download.pdf"], [data-control="dialog.download.pptx"], [data-control="snackbar"], .ts-snackbar, [role="alert"]',
            ),
          ]
            .map((el) => el.textContent ?? '')
            .join(' | '),
        )
        .catch(() => '');
      const m =
        /([^.|]*(?:export limit|too many downloads|try again tomorrow|could not be (?:made|exported|downloaded)|export failed)[^.|]*)/i.exec(
          text,
        );
      if (m) return m[1]!.trim();
      await page.waitForTimeout(400);
    }
    return null;
  })();
  const won = await Promise.race([
    waiting.then((d) => ({ d })),
    refusal.then((sentence) => ({ sentence })),
  ]);
  if ('sentence' in won && won.sentence !== null)
    throw new Error(
      `the export was refused ${Date.now() - t} ms after the click: "${won.sentence}"`,
    );
  const d = 'd' in won ? won.d : await waiting;
  const path = await d.path();
  const { readFileSync } = await import('node:fs');
  const bytes = readFileSync(path);
  return { name: d.suggestedFilename(), bytes, ms: Date.now() - t, download: d };
}

/** The pages of a PDF: the `/Type /Page` objects that are not the tree's `/Pages`. */
export function pdfPages(bytes: Buffer): number {
  const text = bytes.toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/** The image objects of a PDF. */
export function pdfImages(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length;
}

/** Every FlateDecode stream of a PDF inflated and joined, for a search of the content operators. */
export function pdfStreams(bytes: Buffer): string {
  const text = bytes.toString('latin1');
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    const head = text.slice(Math.max(0, m.index - 400), m.index);
    if (!/FlateDecode/.test(head)) continue;
    const raw = bytes.subarray(start, end);
    try {
      // a zlib stream: skip the two byte header and inflate raw
      out.push(inflateRawSync(raw.subarray(2)).toString('latin1'));
    } catch {
      // an image or an unsupported stream
    }
  }
  return out.join('\n');
}

/** The entries of a zip (a PPTX), names with their inflated text when asked. */
export function zipEntries(bytes: Buffer): Map<string, () => string> {
  const out = new Map<string, () => string>();
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return out;
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    out.set(name, () => {
      const localName = bytes.readUInt16LE(local + 26);
      const localExtra = bytes.readUInt16LE(local + 28);
      const start = local + 30 + localName + localExtra;
      const data = bytes.subarray(start, start + compressed);
      return method === 8 ? inflateRawSync(data).toString('utf8') : data.toString('utf8');
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** The slide parts of a PPTX. */
export function pptxSlides(bytes: Buffer): string[] {
  return [...zipEntries(bytes).keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
}
