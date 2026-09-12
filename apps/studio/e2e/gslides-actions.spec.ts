import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The integrator's spec for the fourteen actions of the Google Slides parity round (gslides-parity
// SPEC 7.5; MILESTONES Integrator item 2): every one resolves through window.turboslide.studio
// .invoke in the editor, the document actions through the editor's own commit (the local reducer
// first, then the server), the collection actions and slide.import through the server. The spec
// works on a scratch copy of decks/fixture under decks/e2e-gslides and a copy it makes of that
// deck, both removed afterwards with their worker caches. The dev server always runs on 4321
// (AGENTS.md) and serves any folder under decks/.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-gslides';
const COPY = 'e2e-gslides-copy';
const DECK_DIR = join(ROOT, 'decks', DECK);

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as { id: string };
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDecks(): void {
  for (const id of [DECK, COPY]) {
    rmSync(join(ROOT, 'decks', id), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
  }
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${DECK}?author=agent:e2e-gslides`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

type Info = {
  revision: number;
  counts: { slides: number; skipped: number };
  defaults?: unknown;
  trashedAt?: string;
};

type Row = { id: string; n: number; skip?: boolean; template?: string };

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

async function info(page: Page): Promise<Info> {
  return invoke<Info>(page, 'deck.info');
}

async function rows(page: Page): Promise<Row[]> {
  return invoke<Row[]>(page, 'slide.list');
}

/** The editor's confirmed revision: pending writes have reached the server. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const state = window.turboslide!.studio.describe().state as {
      revision?: number;
      serverRevision?: number;
      pending?: number;
    };
    return state.pending === 0 && state.revision === state.serverRevision;
  });
}

test.describe('the fourteen actions of the parity round through the window API', () => {
  test.beforeAll(() => {
    seedDeck();
  });
  test.afterAll(() => {
    removeDecks();
  });

  test('document actions run through the editor and reads carry the new facts', async ({
    page,
  }) => {
    // Four slides are created here and the filmstrip renders each one through the render worker
    // (one Chromium at a time); on the dev server that load holds every write for up to 10 s
    // (measured 2026-09-12: the same writes take 100 ms on an idle server), so the budget is the
    // load's, not the actions'.
    test.setTimeout(240_000);
    await openEditor(page);
    const start = await info(page);
    expect(start.counts.skipped).toBe(0);
    expect(start.trashedAt).toBeUndefined();

    // slide.new: a Big number after the copy test slide, selected on the stage
    const created = await invoke<{ slide: { id: string; template?: string }; revision: number }>(
      page,
      'slide.new',
      { layout: 'big-number', after: 'content-rule', baseRevision: start.revision },
    );
    expect(created.slide.template).toBe('big-number');
    expect(created.revision).toBe(start.revision + 1);
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', created.slide.id);
    let list = await rows(page);
    expect(list.map((row) => row.id)).toEqual(['title', 'content-rule', created.slide.id]);
    expect(list[2]?.template).toBe('big-number');

    // slide.duplicate: a fresh id right after the original
    const duplicated = await invoke<{ slides: { id: string }[]; revision: number }>(
      page,
      'slide.duplicate',
      { slideIds: [created.slide.id], baseRevision: created.revision },
    );
    expect(duplicated.slides).toHaveLength(1);
    const copyId = duplicated.slides[0]!.id;
    expect(copyId).not.toBe(created.slide.id);
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', copyId);

    // slide.skip: the row says so, deck.info counts it
    const skipped = await invoke<{ slideIds: string[]; skip: boolean; revision: number }>(
      page,
      'slide.skip',
      { slideIds: [copyId], skip: true, baseRevision: duplicated.revision },
    );
    expect(skipped.skip).toBe(true);
    list = await rows(page);
    expect(list.find((row) => row.id === copyId)?.skip).toBe(true);
    expect(list.find((row) => row.id === created.slide.id)?.skip).toBeUndefined();
    expect((await info(page)).counts.skipped).toBe(1);

    // slide.applyLayout: Title slide keeps the number as the heading, template follows
    const applied = await invoke<{
      slides: { id: string; template?: string }[];
      dropped: unknown[];
      revision: number;
    }>(page, 'slide.applyLayout', {
      slideIds: [created.slide.id],
      layout: 'title',
      baseRevision: skipped.revision,
    });
    expect(applied.slides[0]?.template).toBe('title');
    list = await rows(page);
    expect(list.find((row) => row.id === created.slide.id)?.template).toBe('title');

    // block.duplicate: the heading of the copy test slide, a fresh id after it
    const blocks = await invoke<{ blockIds: string[]; revision: number; slide: unknown }>(
      page,
      'block.duplicate',
      { slideId: 'content-rule', blockIds: ['h'], baseRevision: applied.revision },
    );
    expect(blocks.blockIds).toHaveLength(1);
    expect(blocks.blockIds[0]).not.toBe('h');

    // text.replaceAll and export.text: the replacement shows in the plain text
    const replaced = await invoke<{ replacements: number; slideIds: string[]; revision: number }>(
      page,
      'text.replaceAll',
      { find: 'copy test', replace: 'Globex test', baseRevision: blocks.revision },
    );
    expect(replaced.replacements).toBeGreaterThanOrEqual(2);
    expect(replaced.slideIds).toContain('content-rule');
    const text = await invoke<{ text: string; slides: number; bytes: number }>(
      page,
      'export.text',
      {},
    );
    expect(text.text).toContain('Globex test');
    expect(text.text).not.toContain('copy test');
    // the skipped copy is left out unless asked
    const withSkipped = await invoke<{ slides: number }>(page, 'export.text', {
      includeSkipped: true,
    });
    expect(withSkipped.slides).toBe(text.slides + 1);

    // view.zoom: a view action with no document field
    const zoomed = await invoke<{ zoom?: number | 'fit'; slideId: string }>(page, 'view.zoom', {
      zoom: 2,
    });
    expect(zoomed.zoom).toBe(2);
    const fit = await invoke<{ zoom?: number | 'fit' }>(page, 'view.zoom', { zoom: 'fit' });
    expect(fit.zoom).toBe('fit');
    await expect(invoke(page, 'view.zoom', { zoom: 0.1 })).rejects.toThrow();
    expect((await info(page)).revision).toBe(replaced.revision);

    await settled(page);
  });

  test('collection actions and slide.import run on the server', async ({ page }) => {
    await openEditor(page);
    const before = await info(page);

    // deck.list names this deck, never a trashed one
    const heads = await invoke<{ id: string; trashedAt?: string }[]>(page, 'deck.list');
    expect(heads.map((head) => head.id)).toContain(DECK);

    // deck.copy at the current revision, then trash, list both ways, restore, remove
    const copied = await invoke<{ deckId: string; revision: number; title: string }>(
      page,
      'deck.copy',
      { id: DECK, name: 'E2E gslides copy', newId: COPY, baseRevision: before.revision },
    );
    expect(copied.deckId).toBe(COPY);
    expect(copied.revision).toBe(0);
    expect(existsSync(join(ROOT, 'decks', COPY, 'deck.json'))).toBe(true);
    const trashed = await invoke<{ id: string; trashedAt: string | null }>(page, 'deck.trash', {
      id: COPY,
      baseRevision: 0,
    });
    expect(typeof trashed.trashedAt).toBe('string');
    expect((await invoke<{ id: string }[]>(page, 'deck.list')).map((h) => h.id)).not.toContain(
      COPY,
    );
    const withTrash = await invoke<{ id: string; trashedAt?: string }[]>(page, 'deck.list', {
      includeTrashed: true,
    });
    expect(withTrash.find((head) => head.id === COPY)?.trashedAt).toBe(trashed.trashedAt);
    const restored = await invoke<{ trashedAt: string | null }>(page, 'deck.restore', {
      id: COPY,
      baseRevision: 0,
    });
    expect(restored.trashedAt).toBeNull();
    // a stale baseRevision is refused
    await expect(invoke(page, 'deck.trash', { id: COPY, baseRevision: 7 })).rejects.toThrow();
    const removed = await invoke<{ id: string; removed: true }>(page, 'deck.remove', {
      id: COPY,
      confirm: true,
      baseRevision: 0,
    });
    expect(removed.removed).toBe(true);
    expect(existsSync(join(ROOT, 'decks', COPY))).toBe(false);

    // slide.import from the fixture: the id collides and is renamed, the slide lands after title
    const imported = await invoke<{
      slides: { id: string }[];
      renamed: { from: string; to: string }[];
      revision: number;
    }>(page, 'slide.import', {
      sourceDeckId: 'fixture',
      slideIds: ['content-rule'],
      after: 'title',
      baseRevision: before.revision,
    });
    expect(imported.slides).toHaveLength(1);
    expect(imported.renamed).toEqual([{ from: 'content-rule', to: imported.slides[0]!.id }]);
    expect(imported.revision).toBe(before.revision + 1);
    const list = await rows(page);
    expect(list[1]?.id).toBe(imported.slides[0]!.id);
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', imported.slides[0]!.id);
    await settled(page);
  });
});
