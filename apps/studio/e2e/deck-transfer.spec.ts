import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Deck transfer in the studio's pages (docs/deck-transfer.md; gslides-parity SPEC 6.5): the home
// card menu's Download downloads `<id>-r<revision>.zip` through the bundle route with a ticket from
// the server function (no bearer in the page); the bundle route takes a zip `turboslide deck pack`
// wrote, creates the deck under a free sibling id and the editor opens it (the Upload tab of File
// > Open posts the same way); the editor's Export menu has Download deck bundle and its toolbar has
// Presentation, which opens /deck/<id>?present=1 in a new tab in present mode; the same address
// opens in present mode directly. Extended this round: Make a copy with selected slides and
// removed notes (`deck.copy`), and Import slides copying the assets the slides need
// (`slide.import`), both through the window API on a scratch deck cut from the blank template.
// The spec works on decks/fixture (always in a checkout) and removes what it creates. A click on
// /decks waits for the page to announce hydration (`data-hydrated`, decks.index.tsx): on the dev
// server the server's HTML takes a click up to 1.5 s before the handlers are attached and the
// click is lost (measured 2026-09-12: two of these tests timed out that way).

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'fixture';
const SOURCE = 'e2e-transfer-src';
const created: string[] = [];

function removeCreated(): void {
  for (const id of created) {
    rmSync(join(ROOT, 'decks', id), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
  }
  created.length = 0;
}

test.afterEach(removeCreated);

/* the source deck of the copy and import tests lives across them; it goes with the last test */
test.afterAll(() => {
  created.push(SOURCE);
  removeCreated();
});

/** /decks with its handlers attached. */
async function openDecks(page: Page): Promise<void> {
  await page.goto('/decks');
  await page.locator('.ts-home-page[data-hydrated]').waitFor({ timeout: 30_000 });
}

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

/** A scratch deck cut from the blank template: the four starter pictures and one Title slide. */
function seedFromBlank(id: string): void {
  const dir = join(ROOT, 'decks', id);
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(ROOT, 'decks', 'templates', 'blank'), dir, { recursive: true, dereference: true });
  rmSync(join(dir, 'template.json'), { force: true });
  const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
    id: string;
    title: string;
  };
  manifest.id = id;
  manifest.title = 'Transfer source';
  writeFileSync(join(dir, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const slidePath = join(dir, 'slides', 'title.json');
  const slide = JSON.parse(readFileSync(slidePath, 'utf8')) as Record<string, unknown>;
  slide.heading = 'Transfer source';
  slide.notes = 'Notes that a copy may drop.';
  writeFileSync(slidePath, `${JSON.stringify(slide, null, 2)}\n`);
}

test('Download on a home card downloads the deck as a zip', async ({ page }) => {
  await openDecks(page);
  const card = page.locator(`[data-control="home.card.${DECK}"]`);
  await expect(card).toBeVisible();
  await page.locator(`[data-control="home.more.${DECK}"]`).click();
  const download = page.waitForEvent('download');
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: 'Download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^fixture-r\d+\.zip$/);
  const path = await file.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(bytes.byteLength).toBeGreaterThan(1000);
});

test('a bundle posted to the upload route creates the deck under a free id and the editor opens it', async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'turboslide-e2e-upload-'));
  const zip = join(dir, 'fixture.zip');
  execFileSync(
    'node',
    [join(ROOT, 'apps', 'cli', 'bin', 'turboslide.mjs'), 'deck', 'pack', DECK, '--out', zip],
    { cwd: ROOT, stdio: 'ignore' },
  );
  expect(existsSync(zip)).toBe(true);
  // the Upload tab of File > Open posts the zip to this route with a ticket from the
  // bundleUploadTicket server function (docs/deck-transfer.md section 3); in a checkout the route
  // is open, so the spec posts it directly
  const response = await page.request.post('/api/decks/bundle', {
    data: readFileSync(zip),
    headers: { 'content-type': 'application/zip', accept: 'application/json' },
  });
  expect(response.status()).toBe(201);
  const answer = (await response.json()) as { deckId: string; editUrl: string };
  expect(answer.deckId).toMatch(/^fixture-\d+$/);
  created.push(answer.deckId);
  expect(existsSync(join(ROOT, 'decks', answer.deckId, 'deck.json'))).toBe(true);
  await page.goto(answer.editUrl);
  await page.waitForURL(new RegExp(`/edit/${answer.deckId}`), { timeout: 30_000 });
  await openDecks(page);
  await expect(page.locator(`[data-control="home.card.${answer.deckId}"]`)).toBeVisible();
  rmSync(dir, { recursive: true, force: true });
});

test('Make a copy with selected slides and removed notes, through deck.copy', async ({ page }) => {
  test.setTimeout(120_000);
  seedFromBlank(SOURCE);
  await page.goto(`/edit/${SOURCE}?author=agent:e2e-transfer`);
  await editorReady(page);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  /* a second slide, a Section header, which takes a starter picture (SPEC 5.2) */
  const added = await invoke<{ slide: { id: string }; revision: number }>(page, 'slide.new', {
    layout: 'opener',
    after: 'title',
    baseRevision: info.revision,
  });
  const copy = await invoke<{ deckId: string; counts: { slides: number; assets: number } }>(
    page,
    'deck.copy',
    {
      id: SOURCE,
      name: 'Transfer copy',
      slideIds: ['title'],
      removeNotes: true,
      baseRevision: added.revision,
    },
  );
  created.push(copy.deckId);
  expect(copy.deckId).toBe('transfer-copy');
  expect(copy.counts.slides).toBe(1);
  const dir = join(ROOT, 'decks', copy.deckId);
  const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
    title: string;
    revision: number;
    sections: { slideIds: string[] }[];
  };
  expect(manifest.title).toBe('Transfer copy');
  expect(manifest.revision).toBe(0);
  expect(manifest.sections.flatMap((section) => section.slideIds)).toEqual(['title']);
  expect(existsSync(join(dir, 'slides', `${added.slide.id}.json`))).toBe(false);
  const title = JSON.parse(readFileSync(join(dir, 'slides', 'title.json'), 'utf8')) as {
    notes?: string;
  };
  expect(title.notes).toBeUndefined();
  expect(existsSync(join(dir, 'assets'))).toBe(true);
});

test('Import slides copies the assets the slides need, through slide.import', async ({ page }) => {
  test.setTimeout(120_000);
  /* the target: a copy of decks/fixture, which has no assets at all */
  const target = 'e2e-transfer-target';
  const dir = join(ROOT, 'decks', target);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'decks', DECK, 'slides'), join(dir, 'slides'), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ROOT, 'decks', DECK, 'deck.json'), 'utf8')) as {
    id: string;
  };
  manifest.id = target;
  writeFileSync(join(dir, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  created.push(target);
  expect(existsSync(join(dir, 'assets'))).toBe(false);
  /* the source's Section header from the test above references a starter picture */
  const sourceManifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', SOURCE, 'deck.json'), 'utf8'),
  ) as { sections: { slideIds: string[] }[] };
  const opener = sourceManifest.sections.flatMap((s) => s.slideIds).find((id) => id !== 'title');
  expect(opener).toBeDefined();
  await page.goto(`/edit/${target}?author=agent:e2e-transfer`);
  await editorReady(page);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  const imported = await invoke<{ slides: { id: string }[]; revision: number }>(
    page,
    'slide.import',
    {
      sourceDeckId: SOURCE,
      slideIds: [opener],
      after: 'content-rule',
      baseRevision: info.revision,
    },
  );
  expect(imported.slides).toHaveLength(1);
  /* the picture's twins arrived under the target's assets folder */
  await expect(async () => {
    const files = existsSync(join(dir, 'assets')) ? readdirSync(join(dir, 'assets')) : [];
    expect(files.some((name) => name.endsWith('.jpg'))).toBe(true);
  }).toPass({ timeout: 15_000 });
  const targetManifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
    assets: Record<string, unknown>;
  };
  expect(Object.keys(targetManifest.assets).length).toBeGreaterThan(0);
});

test('File > Download > Turboslide bundle (.zip) downloads the deck from the editor', async ({
  page,
}) => {
  await page.goto(`/edit/${DECK}`);
  await editorReady(page);
  // the menu bar of gslides-parity SPEC 2.1: File, then the Download submenu, then the bundle row
  await page
    .getByRole('menubar')
    .getByRole('menuitem', { name: 'File' })
    .click({ timeout: 30_000 });
  const downloadRow = page.locator('[data-menu-item="file.download"]');
  await expect(downloadRow).toBeVisible();
  await downloadRow.click();
  const entry = page.locator('[data-menu-item="file.download.zip"]');
  await expect(entry).toBeVisible();
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await entry.click();
  expect((await download).suggestedFilename()).toMatch(/^fixture-r\d+\.zip$/);
});

test('/deck/<id>?present=1 opens the presentation in present mode', async ({ page }) => {
  await page.goto(`/deck/${DECK}?present=1`);
  await expect(page.locator('.pt-viewer.is-present')).toBeVisible({ timeout: 15_000 });
  await page.goto(`/deck/${DECK}`);
  await expect(page.locator('.pt-viewer')).toBeVisible();
  await expect(page.locator('.pt-viewer.is-present')).toHaveCount(0);
});
