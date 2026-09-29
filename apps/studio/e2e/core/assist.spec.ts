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
  agentHeaders,
  snackbarText,
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

// ---------------------------------------------------------------------------------------------
// the polish round (docs/POLISH.md 2.9 items 113, 116, 117, 118 and 120, 5.1 `assist.*`): the
// panel offers what the deployment can do, one Tailor pass, an agent's write named by what
// changed, the panel's words and layout, and the agent surface's small words.

/** The deployment's assist mode as the panel draws it: `off`, `unconfigured` (no composer) or a model (the composer drawn). */
async function panelMode(): Promise<'off' | 'unconfigured' | 'model' | 'closed'> {
  if (
    !(await ctl(page, 'panel.assist')
      .isVisible()
      .catch(() => false))
  )
    return 'closed';
  if ((await ctl(page, 'panel.assist.off').count()) > 0) return 'off';
  if ((await ctl(page, 'panel.assist.unconfigured').count()) > 0) return 'unconfigured';
  return 'model';
}

test(title('assist.panel.mode-aware'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await openPanel();
  const mode = await panelMode();
  const facts = await page.evaluate(() => ({
    tailor: document.querySelector('[data-control="panel.assist.starter.tailor"]') !== null,
    shorter: document.querySelector('[data-control="panel.assist.starter.shorter"]') !== null,
    notes: document.querySelector('[data-control="panel.assist.starter.notes"]') !== null,
    composer: document.querySelector('[data-control="panel.assist.prompt"]') !== null,
    sentences: [
      ...document.querySelectorAll(
        '[data-control="panel.assist.unconfigured"], [data-control="panel.assist.off"], [data-control="panel.assist.firstLine"]',
      ),
    ].map((el) => (el.textContent ?? '').trim()),
  }));
  /* the palette: Search the menus offers no Ask row without a model */
  await closePanel();
  await menuPath(page, 'help', 'help.searchMenus');
  await ctl(page, 'palette')
    .waitFor({ timeout: 8000 })
    .catch(() => undefined);
  await ctl(page, 'palette.query')
    .click()
    .catch(() => undefined);
  await page.keyboard.type('make it shorter', { delay: 40 });
  await page.waitForTimeout(600);
  const askRow =
    (await page
      .locator('[data-control="finder.assist.ask"], [data-control="palette.finder.assist.ask"]')
      .count()) > 0;
  await page.keyboard.press('Escape');
  let staysAfterAnswer: boolean | null = null;
  if (mode === 'model') {
    await openPanel();
    await ctl(page, 'panel.assist.starter.shorter').click();
    await cardWithin(30_000).catch(() => undefined);
    staysAfterAnswer =
      (await ctl(page, 'panel.assist.starter.shorter').count()) > 0 &&
      (await ctl(page, 'panel.assist.prompt').count()) > 0;
    await closePanel();
  }
  test.info().annotations.push({
    type: 'mode',
    description: `panel mode ${mode}; starters tailor ${facts.tailor}, shorter ${facts.shorter}, notes ${facts.notes}; composer ${facts.composer}; sentences ${facts.sentences.join(' | ') || 'none'}; palette Ask row ${askRow}; after an answer the starters and the box stay ${staysAfterAnswer}`,
  });
  if (mode === 'unconfigured' || mode === 'off') {
    expect(facts.tailor, 'Tailor for a customer is offered').toBe(true);
    expect(facts.sentences.length, 'one sentence').toBeGreaterThan(0);
    expect(facts.shorter || facts.notes, 'no model starter').toBe(false);
    expect(facts.composer, 'no composer').toBe(false);
    expect(askRow, 'the palette offers no Ask row').toBe(false);
  } else {
    expect(mode, 'the panel opened').toBe('model');
    expect(staysAfterAnswer, 'the starters and the box stay after an answer').toBe(true);
  }
});

test(title('assist.tailor.one-pass'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const s0 = await settled(page);
  await placeBlock(page, slideId, {
    id: 'tailor-a',
    type: 'text',
    text: 'Acme renews with Acme in Q3',
    pos: { x: 200, y: 600, w: 900, h: 80 },
  });
  await placeBlock(page, slideId, {
    id: 'tailor-b',
    type: 'text',
    text: 'Acme again',
    pos: { x: 200, y: 700, w: 900, h: 80 },
  });
  void s0;
  const reach = async (): Promise<boolean> => {
    await ctl(page, 'menubar.tools').click();
    await page.locator('#ts-menu-tools').waitFor({ timeout: 8000 });
    const there = await ctl(page, 'menu.tools.tailor')
      .isVisible()
      .catch(() => false);
    if (there) await ctl(page, 'menu.tools.tailor').click();
    else await page.keyboard.press('Escape');
    return there;
  };
  let switched = false;
  if (!(await reach())) {
    await menuPath(page, 'tools', 'tools.advancedTools');
    switched = true;
    if (!(await reach())) {
      await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
      test.skip(true, 'not on this build: tools.tailor (docs/PRODUCT.md 7.1)');
    }
  }
  await ctl(page, 'dialog.tailor').waitFor({ timeout: 8000 });
  await ctl(page, 'dialog.tailor.from').click();
  await page.keyboard.type('Acme', { delay: 40 });
  await ctl(page, 'dialog.tailor.to').click();
  await page.keyboard.type('Globex', { delay: 40 });
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => {
    const dialog = document.querySelector('[data-control="dialog.tailor"]')!;
    const text = (dialog.textContent ?? '').replace(/\s+/g, ' ');
    const counts = text.match(/\d+ places? on \d+ slides?/g) ?? [];
    const disabledChecks = [...dialog.querySelectorAll('input[type="checkbox"]:disabled')].length;
    const apply = dialog.querySelector('[data-control="dialog.tailor.apply"]');
    return {
      counts,
      disabledChecks,
      applyDisabled:
        apply?.getAttribute('aria-disabled') === 'true' ||
        (apply as HTMLButtonElement | null)?.disabled === true,
    };
  });
  const t0 = Date.now();
  await ctl(page, 'dialog.tailor.apply').click();
  const closed = await expect(ctl(page, 'dialog.tailor'))
    .toHaveCount(0, { timeout: 300 })
    .then(() => true)
    .catch(() => false);
  const closeMs = Date.now() - t0;
  const words = await expect
    .poll(() => snackbarText(page), { timeout: 8000 })
    .toMatch(/Globex|place/i)
    .then(() => snackbarText(page))
    .catch(() => snackbarText(page));
  const undo = await ctl(page, 'snackbar.action')
    .textContent({ timeout: 3000 })
    .catch(() => null);
  if (switched) await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  test.info().annotations.push({
    type: 'tailor',
    description: `counts ${before.counts.join(' / ') || 'none'} (${before.counts.length} printed); disabled checkboxes ${before.disabledChecks}; the dialog closed within 300 ms ${closed} (${closeMs} ms); snackbar "${words}" with "${undo}"`,
  });
  expect(before.counts.length, 'the count once').toBe(1);
  expect(before.disabledChecks, 'no dead checkbox').toBe(0);
  expect(closed, 'Apply closes the dialog within 300 ms').toBe(true);
  expect(words ?? '', 'the snackbar carries the count').toMatch(/\d+ (place|slide)/i);
  expect(undo ?? '', 'with Undo').toMatch(/Undo/);
  await page.keyboard.press('Meta+z');
  await settled(page);
});

test(title('assist.snackbar.names-change'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const base = new URL(page.url()).origin;
  const headers = agentHeaders(base, { 'x-turboslide-author': 'assistant' });
  if (headers === null)
    test.skip(true, 'no bearer for this origin (the row writes over HTTP as an agent)');
  await placeBlock(page, slideId, {
    id: 'agent-box',
    type: 'text',
    text: 'Our renewal proposal covers the three regions',
    pos: { x: 200, y: 200, w: 1000, h: 80 },
  });
  const s = await settled(page);
  const post = async (action: string, input: Record<string, unknown>) => {
    const res = await page.request.post(
      `${base}/api/actions/${action}?deck=${encodeURIComponent(deck)}`,
      { headers: headers!, data: input, timeout: 60_000 },
    );
    return {
      status: res.status(),
      body: (await res.json().catch(() => null)) as Record<string, unknown> | null,
    };
  };
  /* the splice travels as a mutation of slide.update (text.splice is an op, not an action);
     the author is the request's x-turboslide-author header */
  const splice = await post('slide.update', {
    slideId,
    baseRevision: s.revision,
    mutations: [
      {
        op: 'text.splice',
        slideId,
        blockId: 'agent-box',
        path: '/text',
        at: 4,
        remove: 7,
        insert: 'contract',
      },
    ],
  });
  const spliceWords = await expect
    .poll(() => snackbarText(page), { timeout: 15_000 })
    .toMatch(/became|changed/i)
    .then(() => snackbarText(page))
    .catch(() => snackbarText(page));
  const spliceUndo = await ctl(page, 'snackbar.action')
    .textContent({ timeout: 3000 })
    .catch(() => null);
  await page.waitForTimeout(6000);
  const s2 = await settled(page);
  const tailor = await post('deck.tailor', {
    replacements: [{ from: 'Acme', to: 'Globex' }],
    baseRevision: s2.revision,
  });
  const tailorWords =
    tailor.status === 200
      ? await expect
          .poll(() => snackbarText(page), { timeout: 15_000 })
          .toMatch(/tailored|Globex/i)
          .then(() => snackbarText(page))
          .catch(() => snackbarText(page))
      : null;
  test.info().annotations.push({
    type: 'agent writes',
    description: `text.splice ${splice.status}: "${spliceWords}" with "${spliceUndo}"; deck.tailor ${tailor.status}: "${tailorWords}"`,
  });
  expect(splice.status, 'the splice was accepted').toBe(200);
  expect(spliceWords ?? '', 'renewal became contract').toMatch(/renewal became contract/);
  expect(spliceUndo ?? '', 'with Undo').toMatch(/Undo/);
  expect(tailor.status, 'deck.tailor was accepted').toBe(200);
  expect(tailorWords ?? '', 'Assistant tailored this presentation for Globex').toMatch(
    /tailored this presentation for Globex/,
  );
});

test(title('assist.panel.words-and-layout'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  /* the Ask row from the palette focuses the textarea after the panel mounts */
  await menuPath(page, 'help', 'help.searchMenus');
  await ctl(page, 'palette')
    .waitFor({ timeout: 8000 })
    .catch(() => undefined);
  await ctl(page, 'palette.query')
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await page.keyboard.type('ask the assistant', { delay: 40 });
  await page.waitForTimeout(600);
  const ask = page
    .locator('[data-control="finder.assist.ask"], [data-control="palette.finder.assist.ask"]')
    .first();
  let focusedAfterAsk: string | null = null;
  if ((await ask.count()) > 0) {
    await ask.click();
    await ctl(page, 'panel.assist')
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    await page.waitForTimeout(400);
    focusedAfterAsk = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('data-control') ??
        document.activeElement?.tagName.toLowerCase() ??
        'none',
    );
  } else await page.keyboard.press('Escape');
  await openPanel();
  const mode = await panelMode();
  const facts = await page.evaluate(() => {
    const panel = document.querySelector('[data-control="panel.assist"]')!;
    const prompt = panel.querySelector(
      '[data-control="panel.assist.prompt"]',
    ) as HTMLTextAreaElement | null;
    const firstLine = panel.querySelector('[data-control="panel.assist.firstLine"]');
    const starters = panel.querySelector('[data-control="panel.assist.starters"]');
    const slide = panel.querySelector('[data-control="panel.assist.slide"]');
    const box = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
    const providerLines = [...panel.querySelectorAll('p, .ts-assist-line, .ts-assist-note')]
      .filter((el) =>
        /Claude|Anthropic|model|provider|Nothing is written/i.test(el.textContent ?? ''),
      )
      .map((el) => ({
        text: (el.textContent ?? '').trim().slice(0, 80),
        top: el.getBoundingClientRect().top,
      }));
    const promptBox = box(prompt);
    const placeholderClipped = prompt
      ? prompt.scrollHeight > prompt.clientHeight + 1 && prompt.value === ''
      : null;
    const slideLines = slide
      ? new Set([...(slide as HTMLElement).getClientRects()].map((r) => Math.round(r.top))).size
      : null;
    const glyphs = [...panel.querySelectorAll('[data-control^="panel.assist.starter."] svg')]
      .length;
    const startersBox = box(starters);
    return {
      providerLines,
      placeholder: prompt?.placeholder ?? null,
      placeholderClipped,
      promptTop: promptBox?.top ?? null,
      slideText: (slide?.textContent ?? '').trim().slice(0, 80),
      slideLines,
      slideEllipsis: slide ? getComputedStyle(slide).textOverflow === 'ellipsis' : null,
      glyphs,
      gap: startersBox && promptBox ? Math.round(promptBox.top - startersBox.bottom) : null,
      firstLine: (firstLine?.textContent ?? '').trim(),
    };
  });
  await closePanel();
  test.info().annotations.push({
    type: 'panel',
    description: `mode ${mode}; provider lines ${facts.providerLines.map((l) => `"${l.text}" at ${Math.round(l.top)}`).join(' | ') || 'none'} (prompt at ${facts.promptTop}); placeholder "${facts.placeholder}" clipped ${facts.placeholderClipped}; slide label "${facts.slideText}" over ${facts.slideLines} line(s) ellipsis ${facts.slideEllipsis}; focus after the Ask row ${focusedAfterAsk}; starter glyphs ${facts.glyphs}; starters to composer ${facts.gap} px`,
  });
  if (mode !== 'model')
    test.skip(
      true,
      `the panel runs ${mode} on this deployment: the composer rows are the model panel's (docs/POLISH.md 2.9 item 113)`,
    );
  expect(
    facts.providerLines.filter((l) => facts.promptTop !== null && l.top < facts.promptTop),
    'no provider words above the composer',
  ).toEqual([]);
  expect(
    facts.providerLines.some((l) => /Nothing is written until you accept/.test(l.text)),
    'one line under the composer',
  ).toBe(true);
  expect(facts.placeholder, 'the placeholder').toBe('Ask the assistant');
  expect(facts.placeholderClipped, 'inside its box').toBe(false);
  expect(facts.slideLines, 'the slide label on one line').toBe(1);
  expect(focusedAfterAsk, 'the textarea focused after the Ask row').toBe('panel.assist.prompt');
  expect(facts.glyphs, 'no glyph on the starters').toBe(0);
  expect(facts.gap, "the starters' bottom within 16 px of the composer").toBeLessThanOrEqual(16);
});

test(title('assist.polish.agent-sweep'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const base = new URL(page.url()).origin;
  const headers = agentHeaders(base);
  const notes: string[] = [];
  const failures: string[] = [];
  /* POST /api/actions/assist.propose with no model answers 503 */
  if (headers !== null) {
    const s = await settled(page);
    const res = await page.request.post(
      `${base}/api/actions/assist.propose?deck=${encodeURIComponent(deck)}`,
      { headers, data: { slideId, kind: 'shorter', baseRevision: s.revision }, timeout: 60_000 },
    );
    const mode = await (async () => {
      await openPanel();
      const m = await panelMode();
      await closePanel();
      return m;
    })();
    notes.push(`assist.propose answered ${res.status()} (the panel runs ${mode})`);
    if (mode !== 'model' && res.status() !== 503)
      failures.push(`assist.propose answered ${res.status()} with no model`);
  } else notes.push('assist.propose: no bearer for this origin');
  /* Tools lists Developer under Advanced tools; View > Appearance carries a doc sentence */
  await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  await ctl(page, 'menubar.tools').click();
  await page.locator('#ts-menu-tools').waitFor({ timeout: 8000 });
  const advancedRow = page.locator('[data-control="menu.tools.advanced"]').first();
  const advancedLabel = (await advancedRow.textContent({ timeout: 3000 }).catch(() => '')) ?? '';
  await page.keyboard.press('Escape');
  await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  notes.push(`the Advanced tools submenu row reads "${advancedLabel.trim()}"`);
  if (!/Developer/.test(advancedLabel))
    failures.push(`the submenu under Tools reads "${advancedLabel.trim()}", not Developer`);
  /* Run an action opens the palette's actions section */
  await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  const runRow = await (async () => {
    await ctl(page, 'menubar.tools').click();
    await page.locator('#ts-menu-tools').waitFor({ timeout: 8000 });
    await ctl(page, 'menu.tools.advanced')
      .hover({ timeout: 3000 })
      .catch(() => undefined);
    await page.waitForTimeout(400);
    const there = await ctl(page, 'menu.tools.advanced.runAction')
      .isVisible()
      .catch(() => false);
    if (there) await ctl(page, 'menu.tools.advanced.runAction').click();
    else await page.keyboard.press('Escape');
    return there;
  })();
  let paletteSection: string | null = null;
  if (runRow) {
    await ctl(page, 'palette')
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    await page.waitForTimeout(500);
    paletteSection = await page.evaluate(() => {
      const palette = document.querySelector('[data-control="palette"]');
      const heads = [
        ...(palette?.querySelectorAll('h2, h3, .ts-palette-head, [data-section]') ?? []),
      ].map((el) => (el.textContent ?? el.getAttribute('data-section') ?? '').trim());
      const first = heads[0] ?? null;
      return first;
    });
    await page.keyboard.press('Escape');
  }
  await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  notes.push(`Run an action: row ${runRow}, the palette opened on "${paletteSection}"`);
  if (!runRow || !/action/i.test(paletteSection ?? ''))
    failures.push(`Run an action opened the palette on "${paletteSection}"`);
  /* the Save as template hint has no <title> token; one asset count; the CLI's plural rule are the unit tests' */
  const saveRow = await (async () => {
    await ctl(page, 'menubar.file').click();
    await page.locator('#ts-menu-file').waitFor({ timeout: 8000 });
    const there = await ctl(page, 'menu.file.saveAsTemplate')
      .isVisible()
      .catch(() => false);
    if (there) await ctl(page, 'menu.file.saveAsTemplate').click();
    else await page.keyboard.press('Escape');
    return there;
  })();
  const hint = saveRow
    ? await page
        .locator(
          '[data-control="dialog.saveAsTemplate.sentence"], [data-control="dialog.saveAsTemplate.fixedSentence"]',
        )
        .allTextContents()
        .catch(() => [] as string[])
    : [];
  await page.keyboard.press('Escape');
  notes.push(`Save as template hint "${hint.join(' ').trim().slice(0, 100)}"`);
  if (hint.some((h) => /<title>/.test(h)))
    failures.push('the Save as template hint carries a <title> token');
  test.info().annotations.push({ type: 'sweep', description: notes.join('; ') });
  expect(failures).toEqual([]);
});

coverage(import.meta.filename, [
  'assist.rewrite.card-accept-undo',
  'assist.notes.draft',
  'assist.free-ask.fallback-sentence',
  'assist.mark.chip-and-history',
  'assist.quota.429',
  /* the polish round (docs/POLISH.md 2.9) */
  'assist.panel.mode-aware',
  'assist.tailor.one-pass',
  'assist.snackbar.names-change',
  'assist.panel.words-and-layout',
  'assist.polish.agent-sweep',
]);
