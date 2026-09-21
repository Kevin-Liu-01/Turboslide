import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  coverage,
  ctl,
  extraHTTPHeaders,
  invoke,
  menuPath,
  newDeck,
  openEditor,
  ownerContext,
  placeBlock,
  runsOfBlock,
  selectBlock,
  settled,
  slideJson,
  state,
  teardownAll,
  title,
  typeInto,
} from './lib';

// The assist panel, the spec rows (docs/PRODUCT.md section 6, 8.1 `assist.rewrite.card-accept-
// undo`, `assist.notes.draft`, `assist.free-ask.fallback-sentence`, `assist.mark.chip-and-history`
// and `assist.quota.429` with the driver core/assist.spec.ts): the two model cards, the fallback
// sentence, the Assistant mark with its history row, and the quota. On the preview the route
// answers from TURBOSLIDE_ASSIST=fixture (6.3) and the panel behaves as it does with the model;
// on production each card is one real call. The spec reads nothing of the environment: it drives
// the panel and reads the deck. The panel and its ids are B6's (PRODUCT.md 7.1); a row whose
// control is not on the build is skipped with the control's id, which the gate reads as not driven.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/assist.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
let slideId = '';
const BODY =
  'Our renewal proposal covers the three regions your team asked about, adds the two new products at the volume price, keeps the services desk on the same terms, moves the review to each quarter, and holds the price for the first two years of the agreement so budgeting stays simple for your finance team.';
/** The cards a `panel.assist.card.<n>` id names, without their buttons. */
const CARD = /^panel\.assist\.card\.[^.]+$/;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Assist spec deck');
  slideId = await addSlide(page);
  await placeBlock(page, slideId, {
    id: 'long-body',
    type: 'text',
    text: BODY,
    pos: { x: 160, y: 200, w: 1200, h: 300 },
  });
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

/** Opens the panel from the title row; skips the test when the entry is not on the build. */
async function openPanel(): Promise<void> {
  if (
    await ctl(page, 'panel.assist')
      .isVisible()
      .catch(() => false)
  )
    return;
  let entry = await ctl(page, 'title.assist')
    .isVisible()
    .catch(() => false);
  if (!entry && (await state(page)).settings?.['advancedTools'] !== true) {
    /* the entry may be parked on this build: with the switch on it draws; the switch goes back
       when it does not, so the file leaves the setting as it found it */
    await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
    await page.waitForTimeout(300);
    entry = await ctl(page, 'title.assist')
      .isVisible()
      .catch(() => false);
    if (!entry) await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  }
  if (!entry) test.skip(true, 'not on this build: title.assist (docs/PRODUCT.md 7.1, B6)');
  await ctl(page, 'title.assist').click();
  await ctl(page, 'panel.assist').waitFor({ timeout: 8000 });
}
async function closePanel(): Promise<void> {
  const close = ctl(page, 'panel.assist.close');
  if ((await close.count()) > 0) await close.click();
  await page.waitForTimeout(200);
}
/** The cards drawn in the panel, each with its sentence and whether it has Accept. */
async function cards(): Promise<{ id: string; text: string; accept: boolean }[]> {
  return page.evaluate((pattern) => {
    const re = new RegExp(pattern);
    return [
      ...document.querySelectorAll(
        '[data-control="panel.assist"] [data-control^="panel.assist.card."]',
      ),
    ]
      .filter((el) => re.test(el.getAttribute('data-control') ?? ''))
      .map((el) => ({
        id: el.getAttribute('data-control') ?? '',
        text: el.textContent?.trim().slice(0, 240) ?? '',
        accept: Boolean(el.querySelector('[data-control$=".accept"]')),
      }));
  }, CARD.source);
}
/** Waits for a card with Accept, within the model call's bound (6.3: about ten seconds; 20 s). */
async function cardWithin(ms = 20_000): Promise<{ id: string; text: string; accept: boolean }> {
  const t0 = Date.now();
  await expect
    .poll(async () => (await cards()).filter((c) => c.accept).length, { timeout: ms })
    .toBeGreaterThan(0);
  const card = (await cards()).filter((c) => c.accept)[0]!;
  test.info().annotations.push({
    type: 'card',
    description: `${card.id} after ${Date.now() - t0} ms: "${card.text.slice(0, 120)}"`,
  });
  return card;
}
const bodyText = async () => JSON.stringify(await slideJson(page, slideId));
const snackbarUndo = async () => {
  const action = ctl(page, 'snackbar.action');
  await action.waitFor({ timeout: 6000 }).catch(() => undefined);
  const label = (await action.count()) > 0 ? await action.textContent() : null;
  const said = await ctl(page, 'snackbar')
    .textContent()
    .catch(() => null);
  return { said, undo: /undo/i.test(label ?? '') };
};
/** The versions of the deck, newest first, as the window API lists them. */
async function versions(): Promise<
  { n?: number; label?: string; note?: string; author?: string }[]
> {
  const list = await invoke<unknown>(page, 'version.list', {});
  const arr = Array.isArray(list) ? list : ((list as { versions?: unknown[] }).versions ?? []);
  return arr as { n?: number; label?: string; note?: string; author?: string }[];
}

test(title('assist.rewrite.card-accept-undo'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await selectBlock(page, 'long-body');
  await openPanel();
  const before = await bodyText();
  const revBefore = (await settled(page)).revision;
  await ctl(page, 'panel.assist.starter.shorter').click();
  const card = await cardWithin();
  expect(card.text, 'the card shows a sentence and the before and after').toMatch(
    /shorter|words|Slide/i,
  );
  await ctl(page, `${card.id}.accept`).click();
  await expect
    .poll(async () => (await state(page)).revision, { timeout: 15_000 })
    .toBe(revBefore + 1);
  await settled(page);
  const after = await bodyText();
  expect(after, 'the body changed').not.toBe(before);
  const { said, undo } = await snackbarUndo();
  expect(undo, `the snackbar carries Undo ("${said ?? 'none'}")`).toBe(true);
  /* version.list answers the log in order, the oldest first: the accept's record is the newest */
  const listed = await versions();
  const latest = listed.reduce<(typeof listed)[number] | undefined>(
    (best, v) => (best === undefined || (v.n ?? 0) > (best.n ?? 0) ? v : best),
    undefined,
  );
  test.info().annotations.push({ type: 'version', description: JSON.stringify(latest ?? null) });
  expect(
    `${latest?.label ?? ''} ${latest?.note ?? ''}`,
    'the revision is labelled Assist:',
  ).toMatch(/Assist:/);
  await closePanel();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+z');
  await expect.poll(bodyText, { timeout: 10_000 }).toBe(before);
  await settled(page);
});

test(title('assist.notes.draft'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await openPanel();
  const notesBefore = (await slideJson(page, slideId))['notes'] ?? null;
  const revBefore = (await settled(page)).revision;
  await ctl(page, 'panel.assist.starter.notes').click();
  const card = await cardWithin();
  await ctl(page, `${card.id}.accept`).click();
  await expect
    .poll(async () => (await state(page)).revision, { timeout: 15_000 })
    .toBe(revBefore + 1);
  await settled(page);
  const notes = String((await slideJson(page, slideId))['notes'] ?? '');
  expect(notes.length, 'the slide carries the notes').toBeGreaterThan(20);
  await expect(ctl(page, 'notes.text'), 'the pane shows the notes').toContainText(
    notes.slice(0, 20),
    { timeout: 8000 },
  );
  await closePanel();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+z');
  await expect
    .poll(async () => (await slideJson(page, slideId))['notes'] ?? null, { timeout: 10_000 })
    .toEqual(notesBefore);
  await settled(page);
});

test(title('assist.free-ask.fallback-sentence'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await openPanel();
  const revBefore = (await settled(page)).revision;
  await ctl(page, 'panel.assist.prompt').click();
  await page.keyboard.type('add a video', { delay: 40 });
  await page.keyboard.press('Enter');
  /* the fallback is a sentence line of the panel's log (Assist.tsx `panel.assist.sentence`,
     ASSIST_SENTENCES.fallback), never a card with Accept (docs/PRODUCT.md 6.1) */
  const sentences = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-control="panel.assist"] [data-control="panel.assist.sentence"], [data-control="panel.assist"] [data-control^="panel.assist.card."]',
        ),
      ].map((el) => ({
        id: el.getAttribute('data-control') ?? '',
        text: el.textContent?.trim().slice(0, 240) ?? '',
        accept: Boolean(el.querySelector('[data-control$=".accept"]')),
      })),
    );
  await expect
    .poll(
      async () =>
        (await sentences()).filter((c) => /shorter or write its speaker notes/.test(c.text)).length,
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  const drawn = await sentences();
  const fallback = drawn.find((c) => /shorter or write its speaker notes/.test(c.text));
  test.info().annotations.push({
    type: 'cards',
    description: drawn.map((c) => `${c.id}: ${c.text.slice(0, 100)}`).join(' | '),
  });
  expect(fallback, 'the fallback sentence is drawn').toBeTruthy();
  expect(fallback!.accept, 'the fallback has no Accept').toBe(false);
  await page.waitForTimeout(3000);
  expect((await state(page)).revision, 'the revision does not move').toBe(revBefore);
  await closePanel();
});

test(title('assist.mark.chip-and-history'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await selectBlock(page, 'long-body');
  await openPanel();
  const revBefore = (await settled(page)).revision;
  await ctl(page, 'panel.assist.starter.shorter').click();
  const card = await cardWithin();
  await ctl(page, `${card.id}.accept`).click();
  await expect
    .poll(async () => (await state(page)).revision, { timeout: 15_000 })
    .toBe(revBefore + 1);
  await settled(page);
  await closePanel();
  /* the chip word on the written block */
  await selectBlock(page, 'long-body');
  const chip = await page.evaluate(
    () =>
      document.querySelector('.ts-overlay .ts-select-chip')?.textContent?.trim() ??
      document
        .querySelector(
          '.ts-stagewrap.ts-editor .pt-slide [data-block="long-body"] [data-assist], .ts-stagewrap.ts-editor [data-control^="chip.assist"]',
        )
        ?.textContent?.trim() ??
      null,
  );
  expect(chip ?? '', 'the block shows the Assistant chip').toMatch(/Assistant/);
  /* Version history lists the revision as its own row named Assistant with the agent mark */
  await menuPath(page, 'file', 'file.versionHistory', 'file.versionHistory.see');
  await ctl(page, 'panel.versionHistory').waitFor({ timeout: 8000 });
  for (const w of await page.locator('[data-control^="versionHistory.window."]').all())
    await w.click().catch(() => undefined);
  await page.waitForTimeout(400);
  /* the row around the pick button: the button carries the note or the time, the author's word
     and the mark stand beside it in the row (VersionsPanel.tsx, `li[data-author]`) */
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".pick"]')].map(
      (el) => {
        const row = el.closest('li, [data-author]') ?? el;
        return {
          text: row.textContent?.trim().slice(0, 160) ?? '',
          agentMark: Boolean(
            row.querySelector('[data-mark="agent"], .ts-mark-agent, [data-trust="agent"]'),
          ),
        };
      },
    ),
  );
  test.info().annotations.push({
    type: 'history',
    description: rows
      .map((r) => `"${r.text}"${r.agentMark ? ' [agent]' : ''}`)
      .slice(0, 6)
      .join(' | '),
  });
  const assistant = rows.find((r) => /Assistant/.test(r.text));
  expect(assistant, 'a history row is named Assistant').toBeTruthy();
  expect(assistant!.agentMark, 'the row carries the agent mark').toBe(true);
  await ctl(page, 'panel.versionHistory.close')
    .click()
    .catch(() => undefined);
  /* editing the block takes the chip off */
  const run = (await runsOfBlock(page, 'long-body'))[0]!;
  await typeInto(page, run, BODY);
  await settled(page);
  await selectBlock(page, 'long-body');
  const chipAfter = await page.evaluate(
    () => document.querySelector('.ts-overlay .ts-select-chip')?.textContent?.trim() ?? '',
  );
  expect(chipAfter, 'the chip leaves once the seller edits the block').not.toMatch(/Assistant/);
  await page.keyboard.press('Escape');
});

/** The deployment's rate limit backend, from the agent manifest's instance facts where readable. */
async function limiterBackend(): Promise<string | null> {
  const res = await page.request.get('/api/agent', { headers: extraHTTPHeaders }).catch(() => null);
  if (!res || res.status() !== 200) return null;
  const body = (await res.json().catch(() => null)) as {
    instance?: Record<string, unknown>;
  } | null;
  const instance = body?.instance ?? {};
  const value = instance['rateLimit'] ?? instance['rateLimiter'] ?? instance['limiter'] ?? null;
  return typeof value === 'string' ? value : value === null ? null : JSON.stringify(value);
}

test(title('assist.quota.429'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await openPanel();
  const backend = await limiterBackend();
  test.info().annotations.push({
    type: 'limiter',
    description:
      backend ?? 'the manifest names no rate limit backend, or answered without the bearer',
  });
  if (backend === null || !/upstash/i.test(backend))
    test.skip(
      true,
      `not driven: the quota counts across instances only with Upstash and this base ${backend === null ? 'does not say which limiter it runs (GET /api/agent instance facts)' : `runs ${backend}`}; the unit test apps/studio/src/server/ratelimit.test.ts covers the rows (PRODUCT.md 8.2)`,
    );
  let refused: string | null = null;
  for (let i = 0; i < 7; i += 1) {
    await ctl(page, 'panel.assist.prompt').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type(`shorter please ${i}`, { delay: 20 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const text = await ctl(page, 'panel.assist').textContent();
    if (/Too many assistant requests/.test(text ?? '')) {
      refused = `ask ${i + 1}`;
      break;
    }
  }
  expect(refused, 'the seventh ask within a minute is refused with the sentence').toBe('ask 7');
  await closePanel();
});

coverage(import.meta.filename, [
  'assist.rewrite.card-accept-undo',
  'assist.notes.draft',
  'assist.free-ask.fallback-sentence',
  'assist.mark.chip-and-history',
  'assist.quota.429',
]);
