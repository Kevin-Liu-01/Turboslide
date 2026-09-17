import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

// Presence (gslides-parity SPEC-3 4.2 to 4.10, 16.3 `presence.spec.ts`; MILESTONES-3 B6): two
// browser contexts on one scratch deck against the dev server on the memory channel. The title
// row's five fixed slots exist at first paint with nobody present; a second person's chip appears
// in the presence slot without moving anything; the roster lists them with "Go to slide" (a label
// cannot be followed, 4.4); a selection in B draws the outline and the 120 by 18 flag in A; the
// pointer toggle flips through the toolbar's tail; Shift+Tab from the File menu focuses the
// roster; the collaborator announcements speak on join; twenty simulated participants through the
// presence channel fill four chips and "+16"; zero layout shift entries through the walk; the
// acceptance sentence of 4.10: the words B types arrive in A's heading as B types them.
//
// Runs against the builder's own dev server with TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory:
// PLAYWRIGHT_BASE_URL=http://localhost:4335 node_modules/.bin/playwright test apps/studio/e2e/presence.spec.ts

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SOURCE = 'gt-brand';
const COPY = `e2e-presence-${Date.now().toString(36)}`;
const SLIDE = 'mood-compass';

type Participant = {
  clientId: string;
  label: string;
  slideId?: string;
  selection?: { blockIds: string[] } | null;
};
type PresenceState = { self?: Participant; others: Participant[] };

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

async function state<T>(page: Page, key: string): Promise<T | undefined> {
  return page.evaluate(
    (k) =>
      (window.turboslide!.studio.describe().state as Record<string, unknown>)[k] as T | undefined,
    key,
  );
}

/** Records every layout shift entry from before the first script until read (05 5.2). */
async function armLayoutShift(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const entries: Array<{ value: number; hadRecentInput: boolean; sources: string[] }> = [];
    (window as unknown as { __tsShifts: typeof entries }).__tsShifts = entries;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<
          PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: Array<{ node?: Node | null }>;
          }
        >) {
          entries.push({
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            sources: (entry.sources ?? []).map((source) => {
              const node = source.node;
              return node instanceof Element
                ? `${node.tagName.toLowerCase()}.${node.className}`
                : String(node);
            }),
          });
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* no observer in this browser: the assertion below reads an empty list */
    }
  });
}

type Shift = { value: number; hadRecentInput: boolean; sources: string[] };

async function shifts(page: Page): Promise<Shift[]> {
  return page.evaluate(() => (window as unknown as { __tsShifts?: Shift[] }).__tsShifts ?? []);
}

async function openDeck(page: Page, deckId: string): Promise<void> {
  await page.goto(`/edit/${deckId}`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function goTo(page: Page, slideId: string): Promise<void> {
  await invoke(page, 'view.goto', { slideId });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', slideId);
}

/* the copy is restricted to the context that made it since the focus round (docs/FOCUS.md rank 1,
   ruling 2: a new deck's general access defaults to restricted), and a fresh context is a viewer of
   it; so the copying context mints one editor link and every other context opens the link first,
   which gives it its own identity and the editor role (comments.spec.ts's pattern; b6.md R9) */
let editLink = '';

async function scratchDeck(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openDeck(page, SOURCE);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Presence walk',
    newId: COPY,
    baseRevision: info.revision,
  });
  await openDeck(page, COPY);
  const access = await state<{ revision: number }>(page, 'access');
  const link = await invoke<{ url: string }>(page, 'share.createLink', {
    id: COPY,
    role: 'editor',
    label: 'Edit link',
    baseRevision: access?.revision ?? 0,
  });
  editLink = link.url;
  await context.close();
}

/**
 * Tools > Advanced tools, flipped through the product's own row (docs/FOCUS.md 3.1) and read back
 * from describe().state.settings; the roster's Go to slide is a parked row since the focus round
 * (3.2: `title.presence.goTo` carries `advanced: true`), so it is asserted behind the switch.
 */
async function setAdvancedTools(page: Page, on: boolean): Promise<void> {
  const read = () =>
    page.evaluate(
      () =>
        (window.turboslide!.studio.describe().state as { settings?: Record<string, unknown> })
          .settings?.['advancedTools'] === true,
    );
  if ((await read()) === on) return;
  await page.locator('[data-control="menubar.tools"]').click();
  await page.locator('[data-control="menu.tools.advancedTools"]').click();
  await expect.poll(read, { timeout: 5000 }).toBe(on);
  if ((await page.locator('#ts-menu-tools').count()) > 0) await page.keyboard.press('Escape');
  await expect(page.locator('#ts-menu-tools')).toHaveCount(0);
}

/** A context of its own identity holding the editor role on the copy, through the owner's link. */
async function editorContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(editLink);
  await page.waitForURL((url) => url.pathname === `/edit/${COPY}`);
  await page.close();
  return context;
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
});

test('the five fixed slots exist at first paint with nobody present and the page loads with zero layout shift entries', async ({
  browser,
}) => {
  await scratchDeck(browser);
  const context = await editorContext(browser);
  await armLayoutShift(context);
  const page = await context.newPage();
  await openDeck(page, COPY);
  const right = page.locator('.ts-title-r');
  await expect(right.locator('> *')).toHaveCount(5);
  const controls = await right
    .locator('> *')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-control')));
  expect(controls).toEqual([
    'title.presence',
    'title.comments.slot',
    'title.inbox.slot',
    'present.split',
    'share.slot',
  ]);
  const presence = page.locator('[data-control="title.presence"]');
  const box = await presence.boundingBox();
  expect(box?.width).toBe(184);
  expect(box?.height).toBe(32);
  await expect(presence.locator('.ts-presence-slot.is-empty')).toHaveCount(4);
  await expect(page.locator('[data-control="presence.more"]')).toHaveText('');
  await expect(page.locator('[data-control="title.inbox"]')).toHaveAttribute('data-unread', '0');
  await page.waitForTimeout(3000);
  const entries = await shifts(page);
  expect(entries.filter((entry) => entry.value > 0)).toEqual([]);
  await context.close();
});

test('a second person appears as a chip without moving the row; the roster lists them with Go to slide; a selection draws the outline and the flag; the words typed arrive (4.10)', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const a = await editorContext(browser);
  await armLayoutShift(a);
  const pageA = await a.newPage();
  await openDeck(pageA, COPY);
  await goTo(pageA, SLIDE);
  const presenceA = await state<PresenceState>(pageA, 'presence');
  expect(
    presenceA,
    'describe().state.presence is the room (SPEC-3 3.10); the route passes EditorShellInput.presence (B2 day 4)',
  ).toBeDefined();
  const slotBefore = await pageA.locator('[data-control="title.presence"]').boundingBox();
  const shareBefore = await pageA.locator('[data-control="share.open"]').boundingBox();

  const b = await editorContext(browser);
  const pageB = await b.newPage();
  await openDeck(pageB, COPY);
  await goTo(pageB, SLIDE);

  /* A sees B's chip within 2 s, in the first slot, with the label's initial; nothing moved */
  const chip = pageA.locator('[data-control^="presence.chip."]');
  await expect(chip).toHaveCount(1, { timeout: 5000 });
  const slotAfter = await pageA.locator('[data-control="title.presence"]').boundingBox();
  const shareAfter = await pageA.locator('[data-control="share.open"]').boundingBox();
  expect(slotAfter).toEqual(slotBefore);
  expect(shareAfter).toEqual(shareBefore);
  await expect(pageA.locator('[data-control="presence.more"]')).toHaveText('');
  const others = (await state<PresenceState>(pageA, 'presence'))?.others ?? [];
  expect(others).toHaveLength(1);
  const bClient = others[0]!.clientId;

  /* the roster: B's row with Go to slide (a label cannot be followed, 4.4), the own row, Join chat
     disabled. Since the focus round the roster's rows `title.presence.goTo` and `title.presence.me`
     and the Later stub `title.presence.joinChat` are parked (docs/FOCUS.md 3.2, 3.1) and so is the
     pointer toggle `toolbar.pointer` of the tail's end (3.3), so this part and the toggle run
     behind Tools > Advanced tools; the switch goes back off before the default view rows below */
  await setAdvancedTools(pageA, true);
  await pageA.locator('[data-control="presence.more"]').click();
  const roster = pageA.locator('#ts-menu-roster');
  await expect(roster).toBeVisible();
  await expect(roster.locator(`[data-control="presence.roster.${bClient}"]`)).toContainText(
    'Go to slide',
  );
  await expect(roster.locator('[data-menu-item="title.presence.joinChat"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await pageA.keyboard.press('Escape');
  await expect(roster).toHaveCount(0);

  /* B selects the heading: A draws the outline and a 120 by 18 flag */
  await pageB
    .locator('.ts-stagewrap.ts-editor [data-block="h"]')
    .click({ position: { x: 4, y: 4 } });
  const outline = pageA.locator('.ts-remote-outline, .ts-remote-caret').first();
  await expect(outline).toBeVisible({ timeout: 5000 });
  const flag = pageA.locator('.ts-flag').first();
  await expect(flag).toBeVisible();
  const flagBox = await flag.boundingBox();
  expect(Math.round(flagBox?.width ?? 0)).toBe(120);
  expect(Math.round(flagBox?.height ?? 0)).toBe(18);

  /* the pointer toggle at the tail's end flips aria-pressed (a parked control, 3.3: drawn while
     the switch is on) */
  const pointer = pageA.locator('[data-control="toolbar.pointer"]');
  await expect(pointer).toHaveAttribute('aria-pressed', 'false');
  await pointer.click();
  await expect(pointer).toHaveAttribute('aria-pressed', 'true');
  await pointer.click();
  await setAdvancedTools(pageA, false);

  /* Shift+Tab from the File menu focuses the roster (0.42): the menu closes, focus lands on the
     roster's first row and never returns to the File title (VERIFICATION-3 finding 13) */
  await pageA.locator('[data-control="menubar.file"]').click();
  await expect(pageA.locator('#ts-menu-file')).toBeVisible();
  await pageA.keyboard.press('Shift+Tab');
  await expect(pageA.locator('#ts-menu-roster')).toBeVisible();
  await expect(pageA.locator('#ts-menu-file')).toHaveCount(0);
  await expect
    .poll(() => pageA.evaluate(() => document.activeElement?.closest('#ts-menu-roster') !== null))
    .toBe(true);
  await pageA.keyboard.press('Escape');
  await expect(pageA.locator('#ts-menu-roster')).toHaveCount(0);
  await expect(pageA.locator('[data-control="presence.more"]')).toBeFocused();

  /* the announcements region speaks on the next join once it is on */
  await pageA.locator('[data-control="menubar.tools"]').click();
  await pageA.locator('[data-menu-item="tools.accessibilitySettings"]').hover();
  await pageA
    .locator('[data-menu-item="tools.accessibilitySettings.collaboratorAnnouncements"]')
    .click();
  await expect(pageA.locator('[data-control="presence.announcements"]')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  const c = await editorContext(browser);
  const pageC = await c.newPage();
  await openDeck(pageC, COPY);
  await expect(pageA.locator('[data-control="presence.announcements"]')).toContainText('joined', {
    timeout: 5000,
  });
  await c.close();

  /* 4.10: the words B types in the heading arrive in A as B types them */
  /* the session opens on a double click (AMENDMENTS.md A1; one click selects the block) */
  await pageB.locator('.ts-stagewrap.ts-editor [data-block="h"] [data-run]').first().dblclick();
  await pageB.keyboard.press('End');
  await pageB.keyboard.type(' live', { delay: 40 });
  await expect(pageA.locator('.ts-stagewrap.ts-editor [data-block="h"]')).toContainText('live', {
    timeout: 5000,
  });
  await pageB.keyboard.press('Escape');

  /* zero layout shift entries through the walk */
  const entries = await shifts(pageA);
  expect(entries.filter((entry) => entry.value > 0 && !entry.hadRecentInput)).toEqual([]);
  await b.close();
  await a.close();
});

test('twenty simulated participants fill four chips and +16, the filmstrip chips and twenty flags at 120 by 18, with zero layout shift entries', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const a = await editorContext(browser);
  await armLayoutShift(a);
  const pageA = await a.newPage();
  await openDeck(pageA, COPY);
  await goTo(pageA, SLIDE);
  const presence = await state<PresenceState>(pageA, 'presence');
  expect(presence, 'describe().state.presence is the room (SPEC-3 3.10)').toBeDefined();
  const clientId = presence?.self?.clientId ?? '';
  /* the presence channel of SPEC-3 3.3: one POST per simulated client; the route binds the client
     ids it issued, so the walk asks the room for twenty bound ids through the test hook the
     dev server exposes on the memory channel (B2's route) */
  const posted = await pageA.evaluate(
    async ([deckId, names, slideId]) => {
      const out: number[] = [];
      let i = 0;
      for (const name of names) {
        i += 1;
        const response = await fetch(`/api/decks/${encodeURIComponent(deckId)}/presence`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-turboslide-simulate': name },
          body: JSON.stringify({
            clientId: `sim-${i}`,
            clock: Date.now(),
            slideId,
            selection: {
              blockIds: ['h'],
              ...(i % 2 === 0 ? { caret: { blockId: 'h', path: '/text', offset: i } } : {}),
            },
            pointer: { x: 100 + i * 40, y: 200 },
            follow: null,
            pointerOn: true,
            presenting: i === 3,
          }),
        });
        out.push(response.status);
      }
      return out;
    },
    [COPY, Array.from({ length: 20 }, (_, i) => `sim ${i + 1}`), SLIDE] as const,
  );
  expect(
    posted.every((status) => status === 200 || status === 204),
    `presence POSTs answered ${posted.join(',')}`,
  ).toBe(true);
  expect(clientId).not.toBe('');
  await expect(pageA.locator('[data-control^="presence.chip."]')).toHaveCount(4, { timeout: 5000 });
  await expect(pageA.locator('[data-control="presence.more"]')).toHaveText('+16');
  await pageA.locator('[data-control="presence.more"]').click();
  await expect(pageA.locator('#ts-menu-roster [data-control^="presence.roster."]')).toHaveCount(21);
  await pageA.keyboard.press('Escape');
  await expect(
    pageA.locator(`[data-control="filmstrip.slide.${SLIDE}"] .ts-card-marks`),
  ).toBeVisible();
  const flags = pageA.locator('.ts-flag');
  await expect(flags.first()).toBeVisible();
  const boxes = await flags.evaluateAll((els) =>
    els
      .map((el) => el.getBoundingClientRect())
      .map((r) => [Math.round(r.width), Math.round(r.height)]),
  );
  for (const [w, h] of boxes) {
    expect(w).toBe(120);
    expect(h).toBe(18);
  }
  await expect(pageA.locator('.ts-remote-outline').first()).toBeVisible();
  const entries = await shifts(pageA);
  expect(entries.filter((entry) => entry.value > 0 && !entry.hadRecentInput)).toEqual([]);
  await a.close();
});
