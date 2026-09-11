import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// MILESTONES M3 acceptance, undo.spec.ts: performs ten mutations, presses Cmd Z ten times and
// asserts the document is byte identical to the start and the server log has twenty forward
// writes (SPEC 6.7: each undo is itself a forward write carrying the inverse mutations).
//
// Byte identity is read from disk. The start is the document as the editor opened it: the store
// writes the normalized form (layout defaults filled, keys in schema order; SPEC 4.1), so the
// baseline is the canonical JSON of slide.get at the start, which is what the file holds after any
// round trip, and deck.json is compared apart from `revision` and `updatedAt`, which every write
// moves by design. The spec works on a scratch copy of decks/fixture under decks/e2e-undo and
// removes it afterwards.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-undo';
const DECK_DIR = join(ROOT, 'decks', DECK);
const SLIDE = 'content-rule';
const SLIDE_FILE = join(DECK_DIR, 'slides', `${SLIDE}.json`);
const MANIFEST = join(DECK_DIR, 'deck.json');

// window.turboslide is declared by packages/agent/src/window/registry.ts, which the studio
// references, so the page callbacks below are typed against the real StudioAutomation shape.

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as {
    id: string;
  };
  manifest.id = DECK;
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

function manifestWithoutClock(): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;
  delete parsed.revision;
  delete parsed.updatedAt;
  return parsed;
}

function versionFiles(): number {
  const dir = join(DECK_DIR, 'versions');
  try {
    return readdirSync(dir).filter((name) => /^\d+\.json$/.test(name)).length;
  } catch {
    return 0;
  }
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${DECK}?author=agent:e2e-undo`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  await page.evaluate(() =>
    window.turboslide!.studio.invoke('view.goto', { slideId: 'content-rule' }),
  );
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', SLIDE);
}

/** One mutating action through the window API with the revision the editor reports. */
async function act(page: Page, action: string, input: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    async ([id, body]) => {
      const studio = window.turboslide!.studio;
      const revision = studio.describe().state.revision as number;
      await studio.invoke(id, { ...body, baseRevision: revision });
    },
    [action, input] as const,
  );
}

test.beforeAll(() => {
  seedDeck();
});

test.afterAll(() => {
  rmSync(DECK_DIR, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // private mode
    }
  });
});

test('ten mutations and ten Cmd Z leave the document byte identical after twenty forward writes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openEditor(page);

  // the start: the seed carries no version log, and the normalized slide is the baseline
  const seedFile = readFileSync(SLIDE_FILE);
  const manifestBefore = manifestWithoutClock();
  expect(versionFiles()).toBe(0);
  await expect(page.locator('.ts-status')).toHaveText(/^Saved · r\d+$/);
  const startRevision = await page.evaluate(
    () => window.turboslide!.studio.describe().state.revision as number,
  );
  const slideBefore = Buffer.from(
    await page.evaluate(async () => {
      const got = (await window.turboslide!.studio.invoke('slide.get', {
        slideId: 'content-rule',
      })) as { slide: unknown };
      return `${JSON.stringify(got.slide, null, 2)}\n`;
    }),
  );
  // the same document as the seed, in the store's canonical form
  expect(JSON.parse(slideBefore.toString('utf8'))).toMatchObject(
    JSON.parse(seedFile.toString('utf8')) as Record<string, unknown>,
  );

  // ten mutations, each one action call and one forward write
  const list = { slideId: SLIDE, blockId: 'list' };
  const p = { slideId: SLIDE, blockId: 'p' };
  await act(page, 'block.set', { ...list, path: '/size', value: 22 });
  await act(page, 'block.set', { ...list, path: '/size', value: 20 });
  await act(page, 'block.set', { ...list, path: '/size' });
  await act(page, 'block.set', { ...p, path: '/measure', value: 32 });
  await act(page, 'block.set', { ...p, path: '/tone', value: 'muted' });
  await act(page, 'block.set', { ...list, path: '/items/0/text', value: 'Legacy i18n: 14 weeks.' });
  await act(page, 'slide.update', {
    slideId: SLIDE,
    mutations: [{ op: 'slide.set', slideId: SLIDE, path: '/notes', value: 'Undo spec notes' }],
  });
  await act(page, 'slide.update', {
    slideId: SLIDE,
    mutations: [{ op: 'slide.set', slideId: SLIDE, path: '/layout/ratio', value: '5/7' }],
  });
  await act(page, 'block.set', { ...p, path: '/tone' });
  await act(page, 'block.set', { ...list, path: '/items/0/text', value: 'Legacy i18n: 12 weeks.' });

  await expect
    .poll(() => page.evaluate(() => window.turboslide!.studio.describe().state.revision as number))
    .toBe(startRevision + 10);
  await expect(page.locator('.ts-status')).toHaveText(`Saved · r${startRevision + 10}`);
  expect(readFileSync(SLIDE_FILE).equals(slideBefore)).toBe(false);
  expect(versionFiles()).toBe(10);

  // ten undos from the keyboard, with nothing focused but the page
  for (let i = 0; i < 10; i += 1) {
    await page.locator('body').press('ControlOrMeta+z');
  }

  await expect(page.locator('.ts-status')).toHaveText(`Saved · r${startRevision + 20}`, {
    timeout: 30_000,
  });
  await expect.poll(() => versionFiles()).toBe(20);

  // byte identical: the slide file against the start, and the manifest apart from revision and updatedAt
  expect(readFileSync(SLIDE_FILE).equals(slideBefore)).toBe(true);
  expect(manifestWithoutClock()).toEqual(manifestBefore);
  expect(JSON.parse(readFileSync(MANIFEST, 'utf8')).revision).toBe(startRevision + 20);

  // the server log: twenty forward writes, the last ten carrying the inverses in reverse order
  const log = (await page.evaluate(() => window.turboslide!.studio.invoke('version.list'))) as {
    n: number;
    revision: number;
    mutations: { op: string; path?: string; value?: unknown }[];
  }[];
  expect(log).toHaveLength(20);
  expect(log.every((entry) => entry.mutations.length > 0)).toBe(true);
  expect(log.map((entry) => entry.revision)).toEqual(
    Array.from({ length: 20 }, (_, i) => startRevision + i + 1),
  );
  const first = log[0]?.mutations[0];
  const last = log[19]?.mutations[0];
  expect(first).toEqual({
    op: 'block.set',
    slideId: SLIDE,
    blockId: 'list',
    path: '/size',
    value: 22,
  });
  // the inverse of the first write deletes the size the fixture never had
  expect(last).toEqual({ op: 'block.set', slideId: SLIDE, blockId: 'list', path: '/size' });

  // the editor's undo stack is empty and redo brings one forward write back
  await page.locator('body').press('ControlOrMeta+z');
  await page.locator('body').press('ControlOrMeta+Shift+z');
  await expect(page.locator('.ts-status')).toHaveText(`Saved · r${startRevision + 21}`, {
    timeout: 30_000,
  });
  expect(versionFiles()).toBe(21);
  expect(JSON.parse(readFileSync(SLIDE_FILE, 'utf8')).slots.right[0].size).toBe(22);
});
