import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The root route and the fresh presentation (gslides-parity SPEC 6.1, 6.3; SPEC 14.3
// `landing.spec.ts`): `/` redirects to /new with X-Robots-Tag: noindex; the draft shows Untitled
// presentation, the two prompts and Not saved yet; nothing is written to the store until the first
// edit; the first edit creates the deck under decks/untitled-<yyyymmdd>-<4 chars>, moves the
// address to /edit/<id> and renames the deck to the heading (the auto-title, one write). The
// draft decks the spec creates are removed afterwards with their caches, so `git status decks`
// stays empty. The editor on /new is edit.$deckId.tsx's EditorRoot (the integrator's file); the
// tests that need it say so in their names, so a run before that export lands reads as what it
// is. Rewritten this round: the earlier spec landed `/` on the newest deck and drove the /decks New
// deck form and the Export menu, three behaviours SPEC 6.1, 6.2 and 6.7 replace.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECKS = join(ROOT, 'decks');
const DRAFT_ID = /^untitled-\d{8}-[a-z0-9]{4}$/;

/** The draft decks on disk: the spec's own and any a visit left behind (there must be none). */
function draftDecks(): string[] {
  if (!existsSync(DECKS)) return [];
  return readdirSync(DECKS).filter((name) => DRAFT_ID.test(name));
}

function removeDeck(id: string): void {
  rmSync(join(DECKS, id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
}

const before = new Set<string>();

test.beforeAll(() => {
  for (const id of draftDecks()) before.add(id);
});

test.afterAll(() => {
  for (const id of draftDecks()) if (!before.has(id)) removeDeck(id);
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

/** The editor's write module, as Vite serves it to a page; a variable so tsc does not resolve it. */
const WRITE_MODULE = '/src/server/write.ts';

type Info = { id: string; title: string; revision: number; counts: { slides: number } };
type Row = { id: string; n: number; template?: string; skip?: boolean };

test.describe.configure({ mode: 'serial' });

test('/ answers a 307 to /new with X-Robots-Tag: noindex and the browser lands on /new', async ({
  page,
}) => {
  const response = await page.request.get('/', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()['location']).toMatch(/\/new$/);
  expect(response.headers()['x-robots-tag']).toMatch(/noindex/i);
  await page.goto('/');
  await expect(page).toHaveURL(/\/new$/);
  await expect(page).toHaveTitle('Untitled presentation, Turboslide');
});

test('/new is noindex and a visit that only looks writes nothing to the store', async ({
  page,
}) => {
  const html = await (await page.request.get('/new')).text();
  // round three stamps the CSP nonce on every head tag (routes/__root.tsx; VERIFICATION-3 step 21
  // "the robots meta carries a nonce"), so the meta closes after its attributes rather than right
  // after content; the noindex directive itself is unchanged
  expect(html).toMatch(/<meta name="robots" content="noindex"[^>]*\/?>/);
  const seen = draftDecks();
  await page.goto('/new');
  await expect(page).toHaveTitle('Untitled presentation, Turboslide');
  // the editor, when attached, boots on the draft; either way the store gains nothing
  await page.waitForTimeout(1500);
  expect(draftDecks()).toEqual(seen);
  /* a reload shows a fresh draft again (SPEC 6.1) */
  await page.reload();
  await expect(page).toHaveURL(/\/new$/);
  expect(draftDecks()).toEqual(seen);
});

test('the first write against a draft id creates the deck in the store (server functions, no editor)', async ({
  page,
}) => {
  /* the same two server functions the editor calls, driven from a page so the RPC stubs resolve:
     readDraftDeck hands out a draft, writeDeck against revision 0 creates the deck first */
  await page.goto('/decks');
  await page.locator('.ts-home-page[data-hydrated]').waitFor({ timeout: 30_000 });
  const outcome = await page.evaluate(async (specifier: string) => {
    const write = (await import(/* @vite-ignore */ specifier)) as {
      readDraftDeck: () => Promise<{ deckId: string; document: { deck: { title: string } } }>;
      writeDeck: (input: unknown) => Promise<{ ok: boolean; revision?: number; created?: true }>;
    };
    const draft = await write.readDraftDeck();
    const result = await write.writeDeck({
      deckId: draft.deckId,
      write: {
        baseRevision: 0,
        author: { kind: 'human', name: 'e2e-landing' },
        mutations: [{ op: 'slide.set', slideId: 'title', path: '/heading', value: 'Draft saved' }],
      },
    });
    return { deckId: draft.deckId, title: draft.document.deck.title, result };
  }, WRITE_MODULE);
  expect(outcome.title).toBe('Untitled presentation');
  expect(outcome.deckId).toMatch(DRAFT_ID);
  expect(outcome.result.ok).toBe(true);
  expect(outcome.result.created).toBe(true);
  expect(outcome.result.revision).toBe(1);
  const manifest = JSON.parse(readFileSync(join(DECKS, outcome.deckId, 'deck.json'), 'utf8')) as {
    id: string;
    revision: number;
    assets: Record<string, unknown>;
  };
  expect(manifest.id).toBe(outcome.deckId);
  expect(manifest.revision).toBe(1);
  expect(Object.keys(manifest.assets)).toHaveLength(4);
  const slide = JSON.parse(
    readFileSync(join(DECKS, outcome.deckId, 'slides', 'title.json'), 'utf8'),
  ) as { heading: string };
  expect(slide.heading).toBe('Draft saved');
  /* a second write against the saved deck is an ordinary write, not a second creation */
  const second = await page.evaluate(
    async ([specifier, deckId]: readonly [string, string]) => {
      const write = (await import(/* @vite-ignore */ specifier)) as {
        writeDeck: (input: unknown) => Promise<{ ok: boolean; revision?: number; created?: true }>;
      };
      return write.writeDeck({
        deckId,
        write: {
          baseRevision: 1,
          author: { kind: 'human', name: 'e2e-landing' },
          mutations: [{ op: 'slide.set', slideId: 'title', path: '/lead', value: 'Second write' }],
        },
      });
    },
    [WRITE_MODULE, outcome.deckId] as const,
  );
  expect(second.ok).toBe(true);
  expect(second.created).toBeUndefined();
  expect(second.revision).toBe(2);
  /* this test's own deck leaves now, so the next test's 'nothing written' check reads the visit alone */
  removeDeck(outcome.deckId);
});

test('the draft (editor attached) reads Untitled presentation, one Title slide, the two prompts and Not saved yet', async ({
  page,
}) => {
  await page.goto('/new');
  await editorReady(page);
  const info = await invoke<Info>(page, 'deck.info');
  expect(info.title).toBe('Untitled presentation');
  expect(info.id).toMatch(DRAFT_ID);
  expect(info.revision).toBe(0);
  expect(info.counts.slides).toBe(1);
  const rows = await invoke<Row[]>(page, 'slide.list');
  expect(rows).toHaveLength(1);
  expect(rows[0]?.template).toBe('title');
  /* the two prompts of the Title slide (SPEC 5.4, 13.11): Click to add title, Click to add subtitle */
  const prompts = page.locator('.pt-viewer [data-prompt]');
  await expect(prompts).toHaveCount(2, { timeout: 15_000 });
  await expect(prompts.nth(0)).toHaveText('Click to add title');
  await expect(prompts.nth(1)).toHaveText('Click to add subtitle');
  /* the title row's save words (SPEC 12 "Title row") */
  await expect(page.getByText('Not saved yet', { exact: true })).toBeVisible();
  /* nothing written */
  expect(draftDecks().filter((id) => !before.has(id))).toEqual([]);
});

test('the first edit (editor attached) creates the deck, moves the address to /edit/<id> and takes the heading as the title', async ({
  page,
}) => {
  await page.goto('/new');
  await editorReady(page);
  const info = await invoke<Info>(page, 'deck.info');
  expect(existsSync(join(DECKS, info.id))).toBe(false);
  /* the first heading commit, as InlineText writes it: slide.set /heading on the Title slide */
  const result = await invoke<{ revision: number }>(page, 'slide.update', {
    slideId: 'title',
    baseRevision: 0,
    mutations: [{ op: 'slide.set', slideId: 'title', path: '/heading', value: 'Q4 review' }],
  });
  expect(result.revision).toBe(1);
  /* the deck exists in the store now, under the draft's id, from the blank template */
  const manifestPath = join(DECKS, info.id, 'deck.json');
  await expect(async () => expect(existsSync(manifestPath)).toBe(true)).toPass({
    timeout: 20_000,
  });
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    id: string;
    title: string;
    revision: number;
    assets: Record<string, unknown>;
  };
  expect(manifest.id).toBe(info.id);
  expect(manifest.revision).toBe(1);
  expect(Object.keys(manifest.assets)).toHaveLength(4);
  expect(existsSync(join(DECKS, info.id, 'assets'))).toBe(true);
  /* the address follows the save without a reload (SPEC 6.1 history.replaceState) */
  await expect(page).toHaveURL(new RegExp(`/edit/${info.id}`));
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  /* the auto-title (SPEC 6.3): the same write renamed the deck to the heading, so one undo removes both */
  const after = await invoke<Info>(page, 'deck.info');
  expect(after.title).toBe('Q4 review');
  expect(manifest.title).toBe('Q4 review');
  const versions = await invoke<{ mutations: { op: string; path?: string }[] }[]>(
    page,
    'version.list',
  );
  expect(versions).toHaveLength(1);
  expect(versions[0]?.mutations.map((m) => `${m.op} ${m.path ?? ''}`.trim())).toEqual([
    'slide.set /heading',
    'deck.set /title',
  ]);
  /* a reload lands on the saved deck */
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/edit/${info.id}`));
  await editorReady(page);
  expect((await invoke<Info>(page, 'deck.info')).title).toBe('Q4 review');
});

test('a double click on the empty title placeholder edits it, and typing saves the deck (SPEC 6.1; VERIFICATION-3 finding 45)', async ({
  page,
}) => {
  // the first thing a sales user meets at the root address: double click the visible title
  // placeholder, type, and the first burst creates the deck and moves the address. Before the fix
  // the second click of the double blurred the session the first click opened (the empty
  // placeholder collapsed to the caret once its prompt left) and nothing was written.
  await page.goto('/new');
  await editorReady(page);
  const info = await invoke<Info>(page, 'deck.info');
  expect(existsSync(join(DECKS, info.id))).toBe(false);
  const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]');
  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  /* the double click opened the inline session and it stayed open (the run is editable, focused) */
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  const caretInside = await page.evaluate(() => {
    const selection = window.getSelection();
    const run = document.querySelector('.ts-stagewrap.ts-editor [data-run="heading/text"]');
    return Boolean(selection && run && run.contains(document.activeElement));
  });
  expect(caretInside).toBe(true);
  /* typing lands and the first burst creates the deck under the draft id and moves the address */
  await page.keyboard.type('Q4 review', { delay: 25 });
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`/edit/${info.id}`), { timeout: 20_000 });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  const after = await invoke<Info>(page, 'deck.info');
  expect(after.revision).toBe(1);
  expect(after.title).toBe('Q4 review');
  /* the deck exists in the store and the room attached over the stream after the first write */
  expect(existsSync(join(DECKS, info.id, 'deck.json'))).toBe(true);
  const sync = await page.evaluate(
    () =>
      window.turboslide!.studio.describe().state.sync as { transport: string; connected: boolean },
  );
  expect(sync.transport).toBe('sse');
  expect(sync.connected).toBe(true);
});

test('two tabs on /new (editor attached) get two drafts', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto('/new');
  await b.goto('/new');
  await editorReady(a);
  await editorReady(b);
  const idA = (await invoke<Info>(a, 'deck.info')).id;
  const idB = (await invoke<Info>(b, 'deck.info')).id;
  expect(idA).toMatch(DRAFT_ID);
  expect(idB).toMatch(DRAFT_ID);
  expect(idA).not.toBe(idB);
  await a.close();
  await b.close();
});
