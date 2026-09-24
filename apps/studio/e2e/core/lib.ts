import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { deflateSync, inflateRawSync, inflateSync } from 'node:zlib';

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
  /** the deck's asset records as the document holds them (the features round; `assetRecords` reads them) */
  assets?: Record<string, unknown>;
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
  ) {
    /* the floating card has an X; the Share dialog's modal prompt has Skip (docs/PRODUCT.md section 2 rank 4) */
    if ((await ctl(page, 'dialog.namePrompt.close').count()) > 0)
      await ctl(page, 'dialog.namePrompt.close')
        .click()
        .catch(() => undefined);
    else
      await ctl(page, 'dialog.namePrompt.skip')
        .click()
        .catch(() => undefined);
  }
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
    // the record is removed through the actions API below
  }
  /* the trash page's Delete forever carries the revision its listing read and hides the card
     before the answer; a checkpoint landing between the listing and the click (the room writes
     2 s after the last op) moves the revision and the removal is refused as stale ("baseRevision
     5 is stale; <id> is at revision 6. Reload the page and try again", the integrator's re-runs
     of core/sync.spec.ts, ship one: the offline replay row's teardown), so a deck that still
     answers after the page's delete is removed through the action with a fresh revision */
  const goneSoon = await expect
    .poll(() => statusOf(page, `/edit/${deckId}`), { timeout: 6000, intervals: [1000] })
    .toBe(404)
    .then(() => true)
    .catch(() => false);
  if (!goneSoon) {
    /* the trash page's second listing carries the revision the checkpoint moved the deck to */
    try {
      await deleteForever(page, deckId);
    } catch {
      // the action below
    }
    const goneNow = await expect
      .poll(() => statusOf(page, `/edit/${deckId}`), { timeout: 6000, intervals: [1000] })
      .toBe(404)
      .then(() => true)
      .catch(() => false);
    if (!goneNow) {
      try {
        await openEditor(page, deckId);
        const info = await invoke<{ revision: number }>(page, 'deck.info');
        await invoke(page, 'deck.remove', {
          id: deckId,
          baseRevision: info.revision,
          confirm: true,
        });
      } catch {
        // the 404 below tells the truth
      }
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

/**
 * The same person in a second browser (docs/SYNC.md 6.1's B; the ordering audit's run 2): a fresh
 * context that carries the first context's cookies and storage, so the second tab is an editor of
 * the deck the first made and its stream carries a client id of its own. No cookie is read or
 * printed here; Playwright copies the storage state from one context into the other.
 */
export async function sameCookiesContext(
  browser: Browser,
  of: BrowserContext,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    storageState: await of.storageState(),
  });
  const page = await context.newPage();
  return { context, page };
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

/**
 * The entries of a zip with their bytes (the features round: the PNG media of a PowerPoint, and
 * the inner .pptx of the export's bundle, which `zipEntries` cannot answer as text).
 */
export function zipEntriesRaw(bytes: Buffer): Map<string, () => Buffer> {
  const out = new Map<string, () => Buffer>();
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
      return method === 8 ? inflateRawSync(data) : Buffer.from(data);
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** The slide parts of a PPTX. */
export function pptxSlides(bytes: Buffer): string[] {
  return [...zipEntries(bytes).keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
}

// ---------------------------------------------------------------------------------------------
// the agent surface and the logo routes (the features round, docs/FEATURES.md 4.2, 4.11, 7.1)

/**
 * The bearer a spec sends to the agent surface on a deployment: TURBOSLIDE_TOKEN (the
 * deployment's bootstrap bearer, the rule of core/decks.spec.ts's teardown) or the origin's row of
 * ~/.config/turboslide/hosts.json (the walk toolkit's rule; read into memory, never printed).
 * A localhost server's surface is open to the checkout holder (TURBOSLIDE_LOCAL_OPEN=1), so no
 * bearer is sent there; a deployment run with no bearer answers null and the row records the reason.
 */
export function agentBearer(baseURL: string): string | null {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL)) return null;
  const env = process.env['TURBOSLIDE_TOKEN'];
  if (env !== undefined && env !== '') return env;
  try {
    const file = `${homedir()}/.config/turboslide/hosts.json`;
    if (!existsSync(file)) return null;
    const hosts =
      (JSON.parse(readFileSync(file, 'utf8')) as { hosts?: Record<string, { token?: string }> })
        .hosts ?? {};
    const row = hosts[baseURL] ?? hosts[baseURL.replace(/\/$/, '')];
    return typeof row?.token === 'string' && row.token !== '' ? row.token : null;
  } catch {
    return null;
  }
}

/**
 * True for a production base: not localhost and not a preview deployment (Vercel's preview
 * hosts carry the nine character deployment hash after the project name, or a -git- branch
 * segment). A row that writes a deployment wide record (the default template, a saved template)
 * skips on production, where every seller would see the write: on 2026-09-25 a gate run on
 * production set a test deck as the default for new presentations for two hours when the file's
 * teardown timed out (docs/gslides-parity/features/build/hotfix.md 16). TURBOSLIDE_GATE_PRODUCTION=1
 * names a base production by hand.
 */
export function isProductionBase(baseURL: string): boolean {
  if (isLocalBase(baseURL)) return false;
  if (process.env['TURBOSLIDE_GATE_PRODUCTION'] === '1') return true;
  let host = '';
  try {
    host = new URL(baseURL).hostname;
  } catch {
    return false;
  }
  const preview =
    /^[a-z0-9-]+-[a-z0-9]{9}-[a-z0-9-]+\.vercel\.app$/.test(host) || /-git-/.test(host);
  return !preview;
}

/** The reason a deployment wide write skips on production, for test.skip. */
export const PRODUCTION_WRITE_SKIP =
  "not driven on production: the row writes a deployment wide record every seller would see (the default template or a saved template); its reading is the preview run's";

/** True for a localhost base, where the agent surface is open without a bearer. */
export function isLocalBase(baseURL: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);
}

/** The headers of an agent call from a spec: the preview header, JSON, and the bearer where one exists. */
export function agentHeaders(
  baseURL: string,
  extra: Record<string, string> = {},
): Record<string, string> | null {
  const bearer = agentBearer(baseURL);
  if (bearer === null && !isLocalBase(baseURL)) return null;
  return {
    ...extraHTTPHeaders,
    'content-type': 'application/json',
    ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
    ...extra,
  };
}

/** The window API's action ids on a page (`describe().actions`). */
export async function windowActions(page: Page): Promise<Set<string>> {
  const list = await page.evaluate(() =>
    (window.turboslide?.studio.describe().actions ?? []).map((a: { id: string } | string) =>
      typeof a === 'string' ? a : a.id,
    ),
  );
  return new Set(list);
}

/** The dimensions of a PNG from its IHDR chunk, or null for other bytes. */
export function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes.toString('latin1', 1, 4) !== 'PNG') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------------------------
// the shader library (the features round, ship two; docs/FEATURES.md section 5, 7.1): the shader
// block on a slide, its frame asset, the Shader section's sliders, the stage's canvases and the
// pixel samples the frame rows compare. Every read goes through the page; a PNG or a JPEG the
// spec holds as bytes is decoded by the page's own canvas, so no image library is needed here.

/** An asset record of the deck, as `describe().state.assets` holds it (the integrator, ship one). */
export type AssetRecord = {
  id: string;
  role?: string;
  twins?: { light?: string; dark?: string; neutral?: string };
  source?: Record<string, unknown> & { kind?: string; frameKey?: string; backend?: string };
  [key: string]: unknown;
};

/** The deck's asset records by id (`describe().state.assets`), or an empty record. */
export async function assetRecords(page: Page): Promise<Record<string, AssetRecord>> {
  const raw = await page.evaluate(
    () =>
      (window.turboslide!.studio.describe().state as unknown as { assets?: unknown }).assets ??
      null,
  );
  if (raw === null || typeof raw !== 'object') return {};
  if (Array.isArray(raw))
    return Object.fromEntries((raw as AssetRecord[]).map((a) => [a.id, a] as const));
  return raw as Record<string, AssetRecord>;
}

/** The material (shader) blocks of a slide. */
export async function shaderBlocks(page: Page, slideId: string) {
  return (await objectsOf(page, slideId)).filter((o) => o.type === 'material');
}

/** The assets of the deck whose source is a shader frame (`source.kind: 'material'`). */
export async function frameAssets(page: Page): Promise<AssetRecord[]> {
  return Object.values(await assetRecords(page)).filter((a) => a.source?.kind === 'material');
}

/**
 * Opens Insert > Shader (the switch on when the row is parked); answers whether the gallery is
 * drawn. A build whose Insert menu still lists Material answers `open: false` with `material: true`.
 */
export async function openShaderGallery(
  page: Page,
): Promise<{ open: boolean; switched: boolean; material: boolean }> {
  const present = async (): Promise<'shader' | 'material' | null> => {
    await ctl(page, 'menubar.insert').click();
    await page.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
    const shader = await ctl(page, 'menu.insert.shader')
      .isVisible()
      .catch(() => false);
    if (!shader) {
      const material = await ctl(page, 'menu.insert.material')
        .isVisible()
        .catch(() => false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      return material ? 'material' : null;
    }
    await ctl(page, 'menu.insert.shader').click();
    return ctl(page, 'dialog.shader')
      .waitFor({ timeout: 8000 })
      .then(() => 'shader' as const)
      .catch(() => null);
  };
  let got = await present();
  if (got === 'shader') return { open: true, switched: false, material: false };
  let switched = false;
  if (got !== 'material' && (await state(page)).settings?.['advancedTools'] !== true) {
    await menuPath(page, 'tools', 'tools.advancedTools');
    await page.waitForTimeout(300);
    switched = true;
    got = await present();
    if (got !== 'shader')
      await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  }
  return {
    open: got === 'shader',
    switched: got === 'shader' && switched,
    material: got === 'material',
  };
}

/** The gallery's top level cards: their control id, material, title and thumbnail state. */
export async function shaderCards(
  page: Page,
): Promise<{ id: string; material: string | null; title: string; thumb: boolean }[]> {
  return page.evaluate(() => {
    const sel =
      '[data-control^="dialog.shader.tile."], [data-control^="dialog.shader.card."], [data-control^="dialog.shader.pick."]';
    const all = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0);
    return all
      .filter((e) => e.parentElement?.closest(sel) === null)
      .map((e) => {
        const img = e.querySelector('img');
        return {
          id: e.getAttribute('data-control') ?? '',
          material: e.getAttribute('data-material') ?? e.getAttribute('data-id'),
          title: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 60),
          thumb: img ? img.complete && img.naturalWidth > 0 : false,
        };
      });
  });
}

/**
 * A shader block on a slide, the seller's way first: Insert > Shader and a click on Liquid metal
 * when the gallery is on the build; else `shader.insert` on the window transport; else a
 * `block.insert` of a material block (a setup write). Answers the block id and the way it landed.
 */
export async function ensureShader(
  page: Page,
  slideId: string,
  options: {
    materialId?: string;
    preset?: string;
    pos?: { x: number; y: number; w: number; h: number };
  } = {},
): Promise<{ id: string; how: string; block: Record<string, unknown> }> {
  const materialId = options.materialId ?? 'paper:liquid-metal';
  await clickCard(page, slideId);
  const before = (await shaderBlocks(page, slideId)).map((o) => o.id);
  const landed = async (how: string) => {
    let found: { id: string; block: Record<string, unknown> } | null = null;
    await expect
      .poll(
        async () => {
          const list = (await shaderBlocks(page, slideId)).filter((o) => !before.includes(o.id));
          found = list[0] ?? null;
          return list.length;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    await settled(page);
    return { id: found!.id, how, block: found!.block };
  };
  const gallery = await openShaderGallery(page);
  if (gallery.open) {
    const cards = await shaderCards(page);
    const want = new RegExp(materialId.replace(/^paper:/, '').replace(/-/g, '[ -]?'), 'i');
    const card = cards.find((c) => want.test(c.title) || c.material === materialId) ?? cards[0];
    if (card) {
      await ctl(page, card.id).click();
      const out = await landed(`Insert > Shader, the card ${card.title}`);
      await expect(ctl(page, 'dialog.shader')).toHaveCount(0, { timeout: 10_000 });
      if (gallery.switched)
        await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
      return out;
    }
    await page.keyboard.press('Escape');
  }
  const actions = await windowActions(page);
  if (actions.has('shader.insert')) {
    try {
      const s = await settled(page);
      await invoke(
        page,
        'shader.insert',
        {
          slideId,
          materialId,
          ...(options.preset ? { preset: options.preset } : {}),
          baseRevision: s.revision,
        },
        60_000,
      );
      return await landed('shader.insert on the window transport');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/NotImplemented|not implemented|lands in P1|unknown action/i.test(message)) throw error;
    }
  }
  const s = await settled(page);
  const id = `shader-${Date.now().toString(36)}`;
  await invoke(page, 'block.insert', {
    baseRevision: s.revision,
    slideId,
    slot: 'main',
    block: {
      id,
      type: 'material',
      materialId,
      ...(options.preset
        ? { preset: options.preset }
        : materialId === 'paper:liquid-metal'
          ? { preset: 'diamond' }
          : {}),
      alt: `The ${materialId.replace(/^paper:/, '').replace(/-/g, ' ')} shader`,
      pos: options.pos ?? { x: 560, y: 400, w: 480, h: 272, z: 1 },
    },
  });
  return landed('block.insert of a material block through the window API');
}

/** The block's frame asset id once it names one other than `not`, or null after `timeout`. */
export async function waitFrame(
  page: Page,
  slideId: string,
  blockId: string,
  { not = null, timeout = 15_000 }: { not?: string | null; timeout?: number } = {},
): Promise<{ asset: string | null; ms: number }> {
  const t0 = Date.now();
  const until = t0 + timeout;
  for (;;) {
    const block = (await shaderBlocks(page, slideId)).find((o) => o.id === blockId)?.block ?? null;
    const asset = (block?.['asset'] as string | undefined) ?? null;
    if (asset !== null && asset !== not) return { asset, ms: Date.now() - t0 };
    if (Date.now() > until) return { asset: null, ms: Date.now() - t0 };
    await page.waitForTimeout(200);
  }
}

/**
 * The frame the agent's route makes when the client's capture did not come (FEATURES.md 5.5: the
 * hosted job is the fallback): `shader.capture` when the transport carries it, else
 * `material.capture` at the block's anchor with the asset written into the block. Answers the
 * asset id or null, with the way it was made.
 */
export async function captureFallback(
  page: Page,
  slideId: string,
  blockId: string,
): Promise<{ asset: string | null; how: string }> {
  const block = (await shaderBlocks(page, slideId)).find((o) => o.id === blockId)?.block ?? null;
  if (!block) return { asset: null, how: 'no block' };
  const actions = await windowActions(page);
  const s = await settled(page);
  if (actions.has('shader.capture')) {
    try {
      await invoke(page, 'shader.capture', { slideId, blockId, baseRevision: s.revision }, 120_000);
      const got = await waitFrame(page, slideId, blockId, { timeout: 10_000 });
      return { asset: got.asset, how: 'shader.capture' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/NotImplemented|not implemented|lands in P1/i.test(message))
        return { asset: null, how: `shader.capture refused: ${message.split('\n')[0]}` };
    }
  }
  if (!actions.has('material.capture')) return { asset: null, how: 'no capture action' };
  try {
    const made = (await invoke(
      page,
      'material.capture',
      {
        materialId: block['materialId'],
        ...(block['preset'] ? { preset: block['preset'] } : {}),
        ...(block['uniforms'] ? { uniforms: block['uniforms'] } : {}),
        anchors: [(block['anchor'] as number | undefined) ?? 5500],
        id: `${blockId}-frame`,
        role: 'frame',
        alt: block['alt'],
        baseRevision: s.revision,
      },
      180_000,
    )) as { id?: string } | { id?: string }[];
    const asset = Array.isArray(made) ? (made[0]?.id ?? null) : (made?.id ?? null);
    if (asset === null) return { asset: null, how: 'material.capture answered no asset' };
    const s2 = await settled(page);
    await invoke(page, 'block.set', {
      slideId,
      blockId,
      path: '/asset',
      value: asset,
      baseRevision: s2.revision,
    });
    await settled(page);
    return { asset, how: 'material.capture and block.set /asset' };
  } catch (error) {
    return {
      asset: null,
      how: `material.capture refused: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`,
    };
  }
}

/** The stage scale: CSS px per sheet px. */
export async function sheetScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    return sheet ? sheet.getBoundingClientRect().width / 1600 : 0;
  });
}

/** The viewport box of a block's drawing on the stage, or null. */
export async function blockRect(
  page: Page,
  blockId: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((id) => {
    const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
    if (!inner) return null;
    const el = inner.closest('.free') ?? inner;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, blockId);
}

/**
 * Resizes a selected block by one of its handles (`handle.<id>.resize.<dir>`) with a real drag of
 * `dx`, `dy` CSS px; answers whether the handle was drawn (a build without it leaves the block as
 * it was and the caller falls back to a write).
 */
export async function resizeByHandle(
  page: Page,
  blockId: string,
  dir: 'se' | 'e' | 's' | 'ne' | 'nw' | 'sw' | 'n' | 'w',
  dx: number,
  dy: number,
): Promise<boolean> {
  await selectBlock(page, blockId);
  const handle = page
    .locator(`.ts-overlay [data-control="handle.${blockId}.resize.${dir}"]`)
    .first();
  if ((await handle.count()) === 0) return false;
  const r = await handle.boundingBox();
  if (!r) return false;
  const from = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await page.mouse.move(from.x - 20, from.y - 12);
  await page.mouse.move(from.x, from.y, { steps: 4 });
  await page.mouse.down();
  await page.waitForTimeout(80);
  const steps = 14;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(200);
  await settled(page);
  return true;
}

/**
 * Selects a shader block and opens Format options at its Shader section; false when the section
 * is not on the build (FEATURES.md 5.3, B5's `inspector/shader.tsx`).
 */
export async function openShaderSection(page: Page, blockId: string): Promise<boolean> {
  await selectBlock(page, blockId);
  if ((await ctl(page, 'panel.formatOptions').count()) === 0) {
    if ((await ctl(page, 'toolbar.formatOptions').count()) > 0)
      await ctl(page, 'toolbar.formatOptions').click();
    else await menuPath(page, 'format', 'format.formatOptions').catch(() => undefined);
    await ctl(page, 'panel.formatOptions')
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
  }
  /* the section's root: FormatOptions' section (data-section) or B5's own root (.ts-shader with
     the section's id, inspector/shader.tsx); a collapsed section head is opened */
  const section = page.locator(SHADER_SECTION_ROOT).first();
  if ((await section.count()) === 0) return false;
  const head = page
    .locator('[data-section="shader"] > [data-control="formatOptions.shader"]')
    .first();
  if (
    (await head.count()) > 0 &&
    (await head.getAttribute('aria-expanded').catch(() => null)) === 'false'
  ) {
    await head.click();
    await page.waitForTimeout(250);
  }
  await section.scrollIntoViewIfNeeded().catch(() => undefined);
  return true;
}
/** The Shader section's root selector (lib.ts and the walk agree). */
export const SHADER_SECTION_ROOT =
  '[data-section="shader"], .ts-shader[data-control="formatOptions.shader"]';

/** The headings of the Shader section's groups, in order, as the seller reads them. */
export async function shaderGroupHeadings(page: Page): Promise<string[]> {
  return page.evaluate((rootSelector) => {
    const section = document.querySelector(rootSelector);
    if (!section) return [];
    const out: string[] = [];
    /* the Shader group of 5.3 (the thumbnail, the name, Change) is the section's head: the
       FormatOptions head's word, or B5's head block (inspector/shader.tsx .ts-shader-head) */
    const head = section.querySelector('.ts-panel-section-head span');
    if (head) out.push((head.textContent ?? '').replace(/\s+/g, ' ').trim());
    else if (section.querySelector('.ts-shader-head')) out.push('Shader');
    const nodes = [
      ...section.querySelectorAll(
        '.ts-shader-group-title, [data-group-title], [data-group] > :first-child, .ts-fo-group-title, .ts-fo-group > summary, .ts-fo-group > h3, .ts-fo-group > h4, h3, h4, legend, summary',
      ),
    ].filter((e) => e.getClientRects().length > 0);
    for (const node of nodes) {
      const group = node.closest('[data-group]');
      const text =
        group?.getAttribute('data-group-title') ??
        node.getAttribute('data-group-title') ??
        (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text && !out.includes(text)) out.push(text);
    }
    return out;
  }, SHADER_SECTION_ROOT);
}

/** A slider's facts: the range input under the control, its bounds and value, and its number field. */
export async function sliderFacts(
  page: Page,
  control: string,
): Promise<{
  range: boolean;
  number: boolean;
  value: number | null;
  min: number;
  max: number;
  step: number;
} | null> {
  return page.evaluate((c) => {
    const el = document.querySelector(`[data-control="${c}"]`);
    if (!el) return null;
    /* B5's slider: the range is `<control>.slider` beside the number field `<control>` */
    const beside = document.querySelector<HTMLInputElement>(
      `input[type="range"][data-control="${c}.slider"]`,
    );
    const range =
      beside ??
      (el instanceof HTMLInputElement && el.type === 'range'
        ? el
        : el.querySelector<HTMLInputElement>('input[type="range"]'));
    const number =
      el instanceof HTMLInputElement && el.type === 'number'
        ? el
        : (el.querySelector<HTMLInputElement>('input[type="number"]') ??
          el.parentElement?.querySelector<HTMLInputElement>('input[type="number"]') ??
          null);
    return {
      range: range !== null,
      number: number !== null,
      value: range ? Number(range.value) : number ? Number(number.value) : null,
      min: Number(range?.min ?? number?.min ?? 0),
      max: Number(range?.max ?? number?.max ?? 100),
      step: Number(range?.step ?? number?.step ?? 1),
    };
  }, control);
}

/**
 * Sets a Shader section slider to a value the way a seller does, through its number field (fill
 * and Enter, one commit); with no number field the range is focused and stepped with the arrow
 * keys (Shift steps ten). Answers the value the control reads after.
 */
export async function setSliderNumber(
  page: Page,
  control: string,
  value: number,
): Promise<number | null> {
  const root = ctl(page, control);
  const own = (await root.getAttribute('type').catch(() => null)) === 'number';
  let field = own ? root : root.locator('input[type="number"]').first();
  if (!own && (await field.count()) === 0)
    field = root.locator('xpath=..').locator('input[type="number"]').first();
  if ((await field.count()) > 0) {
    await field.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(String(value), { delay: 30 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await settled(page);
    return (await sliderFacts(page, control))?.value ?? null;
  }
  const facts = await sliderFacts(page, control);
  if (!facts || !facts.range) return null;
  const beside = page.locator(`input[type="range"][data-control="${control}.slider"]`).first();
  const range =
    (await beside.count()) > 0
      ? beside
      : (await root.getAttribute('type').catch(() => null)) === 'range'
        ? root
        : root.locator('input[type="range"]').first();
  await range.focus();
  const steps = Math.round((value - (facts.value ?? 0)) / facts.step);
  const key = steps > 0 ? 'ArrowRight' : 'ArrowLeft';
  let left = Math.abs(steps);
  while (left >= 10) {
    await page.keyboard.press(`Shift+${key}`);
    left -= 10;
  }
  for (let i = 0; i < left; i += 1) await page.keyboard.press(key);
  await page.waitForTimeout(200);
  await settled(page);
  return (await sliderFacts(page, control))?.value ?? null;
}

/** The canvases of the stage: per recipe root with its frame img, and the page's total. */
export async function stageCanvases(page: Page): Promise<{
  roots: { block: string | null; canvas: number; img: boolean; imgDecoded: boolean }[];
  stage: number;
  page: number;
}> {
  return page.evaluate(() => {
    const stage = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
    const roots = [...document.querySelectorAll(`${stage} [data-recipe]`)];
    return {
      roots: roots.map((r) => {
        const img = r.querySelector('img');
        return {
          block:
            r.getAttribute('data-block') ??
            r.closest('[data-block]')?.getAttribute('data-block') ??
            null,
          canvas: r.querySelectorAll('canvas').length,
          img: img !== null,
          imgDecoded: img ? img.complete && img.naturalWidth > 0 : false,
        };
      }),
      stage: document.querySelectorAll(`${stage} canvas`).length,
      page: document.querySelectorAll('canvas').length,
    };
  });
}

/**
 * Decodes a picture in the page (a PNG or JPEG as bytes, or a same origin URL) and samples it at
 * relative points (0 to 1 across the picture); answers the RGB of each with the picture's size.
 */
export async function samplePicture(
  page: Page,
  source: Buffer | string,
  points: readonly (readonly [number, number])[],
): Promise<{ width: number; height: number; rgb: [number, number, number][] } | null> {
  const src = Buffer.isBuffer(source)
    ? `data:${source.subarray(1, 4).toString('latin1') === 'PNG' ? 'image/png' : 'image/jpeg'};base64,${source.toString('base64')}`
    : source;
  return page.evaluate(
    async ([url, pts]) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url as string;
      try {
        await img.decode();
      } catch {
        return null;
      }
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      if (!g) return null;
      g.drawImage(img, 0, 0);
      const rgb = (pts as [number, number][]).map(([fx, fy]) => {
        const x = Math.min(c.width - 1, Math.max(0, Math.round(fx * (c.width - 1))));
        const y = Math.min(c.height - 1, Math.max(0, Math.round(fy * (c.height - 1))));
        const d = g.getImageData(x, y, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!] as [number, number, number];
      });
      return { width: c.width, height: c.height, rgb };
    },
    [src, points.map((p) => [p[0], p[1]])] as const,
  );
}

/** Samples a screenshot of a viewport clip at relative points, through the page's canvas. */
export async function sampleClip(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  points: readonly (readonly [number, number])[],
): Promise<{ width: number; height: number; rgb: [number, number, number][] } | null> {
  const shot = await page.screenshot({ clip, scale: 'css' });
  return samplePicture(page, shot, points);
}

/** The largest channel distance between two RGB samples. */
export function rgbDistance(a: readonly number[], b: readonly number[]): number {
  return Math.max(Math.abs(a[0]! - b[0]!), Math.abs(a[1]! - b[1]!), Math.abs(a[2]! - b[2]!));
}

/**
 * The largest image object of a PDF as a PNG the page can decode: Chromium writes a drawn PNG as
 * a FlateDecode RGB (or gray) image, sometimes with PNG predictors, and a JPEG as DCTDecode;
 * the raw rows are wrapped into a PNG file here (a filter byte per row) so one decoder reads
 * both. Answers null when the PDF carries no image.
 */
export function largestPdfImage(bytes: Buffer): {
  width: number;
  height: number;
  filter: string;
  png: Buffer | null;
  jpeg: Buffer | null;
} | null {
  const text = bytes.toString('latin1');
  const re = /<<([^>]*?\/Subtype\s*\/Image[^>]*?)>>\s*stream\r?\n/g;
  let best: { width: number; height: number; filter: string; start: number; dict: string } | null =
    null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const dict = m[1]!;
    const width = Number(/\/Width\s+(\d+)/.exec(dict)?.[1] ?? 0);
    const height = Number(/\/Height\s+(\d+)/.exec(dict)?.[1] ?? 0);
    if (/\/ImageMask\s+true/.test(dict)) continue;
    const filter = /\/Filter\s*\/(\w+)/.exec(dict)?.[1] ?? 'none';
    /* the frame's soft mask (a gray image of the same size) never wins over the colour image */
    const rgb = /\/DeviceRGB/.test(dict) ? 1 : 0;
    const bestRgb = best === null ? -1 : /\/DeviceRGB/.test(best.dict) ? 1 : 0;
    if (
      best === null ||
      width * height > best.width * best.height ||
      (width * height === best.width * best.height && rgb > bestRgb)
    )
      best = { width, height, filter, start: m.index + m[0].length, dict };
  }
  if (best === null) return null;
  const end = text.indexOf('endstream', best.start);
  const raw = bytes.subarray(best.start, end);
  if (best.filter === 'DCTDecode') return { ...best, png: null, jpeg: Buffer.from(raw) };
  let data: Buffer;
  try {
    data = best.filter === 'FlateDecode' ? inflateSync(raw) : Buffer.from(raw);
  } catch {
    return { ...best, png: null, jpeg: null };
  }
  const gray = /\/DeviceGray/.test(best.dict);
  const channels = gray ? 1 : 3;
  const rowLen = best.width * channels;
  let filtered: Buffer;
  if (data.length === best.height * (rowLen + 1)) filtered = data;
  else if (data.length === best.height * rowLen) {
    filtered = Buffer.alloc(best.height * (rowLen + 1));
    for (let y = 0; y < best.height; y += 1) {
      filtered[y * (rowLen + 1)] = 0;
      data.copy(filtered, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
    }
  } else return { ...best, png: null, jpeg: null };
  const chunk = (type: string, body: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([len, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(best.width, 0);
  ihdr.writeUInt32BE(best.height, 4);
  ihdr[8] = 8;
  ihdr[9] = gray ? 0 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { ...best, png, jpeg: null };
}

let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Wraps the page's requestAnimationFrame so the mount's loop can be counted (the hidden tab row of
 * FEATURES.md 5.6): every later `requestAnimationFrame` call is counted in `window.__tsRaf`.
 */
export async function installRafCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __tsRaf?: number; __tsRafWrapped?: boolean };
    if (w.__tsRafWrapped) return;
    w.__tsRaf = 0;
    w.__tsRafWrapped = true;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback) =>
      original((time) => {
        w.__tsRaf = (w.__tsRaf ?? 0) + 1;
        cb(time);
      });
  });
}
export async function rafCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __tsRaf?: number }).__tsRaf ?? 0);
}
