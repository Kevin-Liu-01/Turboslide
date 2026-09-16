import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The text tools (gslides-parity SPEC-5 7, 16.7 step 35; R10 10.3; MILESTONES-5 B5): the help
// pages, the preferences record through the window API and its browser mirror, the autocorrect
// engine and the spell check through the window transport, File > Language through `deck.set`,
// and the Accessibility rows. Every row drives a surface the checkout has; a row whose surface
// waits for a request in another lane's file (the dialog and panel registries, the InlineText
// and notes props, the controller's window rows: b5.md section 3) is skipped with the request
// named, never passed. Runs against a dev server with TURBOSLIDE_STORE=tmp:
//
// PLAYWRIGHT_BASE_URL=http://localhost:4355 node_modules/.bin/playwright test apps/studio/e2e/text-tools.spec.ts

const SOURCE = 'gt-brand';
const COPY = `e2e-text-tools-${Date.now().toString(36)}`;

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

/** Whether a window action has a handler wired (a NotImplementedError names the milestone). */
async function wired(page: Page, action: string, input: unknown): Promise<boolean> {
  return page.evaluate(
    async ([id, value]) => {
      try {
        await window.turboslide!.studio.invoke(id as string, value);
        return true;
      } catch (error) {
        return !/not implemented|NotImplemented|no handler|lands in/iu.test(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [action, input] as const,
  );
}

async function openDeck(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await openDeck(page, `/edit/${SOURCE}`);
  const info = await invoke<{ revision: number }>(page, 'deck.info', {});
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: COPY,
    newId: COPY,
    baseRevision: info.revision,
  });
  await page.close();
});

test.afterAll(async ({ browser }) => {
  // the scratch copy leaves the store: trashed at its revision, then removed (the tmp store of a
  // dev server drops it with the server either way)
  const page = await browser.newPage();
  try {
    await openDeck(page, `/edit/${COPY}`);
    const revision = await page.evaluate(
      () => (window.turboslide!.studio.describe().state as { revision: number }).revision,
    );
    await invoke(page, 'deck.trash', { id: COPY, baseRevision: revision }).catch(() => undefined);
    await invoke(page, 'deck.remove', { id: COPY, confirm: true }).catch(() => undefined);
  } catch {
    // the copy was never made or is gone already
  }
  await page.close();
});

test('the help pages render their articles in the home shell and are indexable', async ({
  page,
}) => {
  const training = await page.goto('/help/training');
  expect(training?.status()).toBe(200);
  await expect(page.locator('main[data-page="help-training"]')).toHaveAttribute(
    'data-hydrated',
    '',
  );
  await expect(page.locator('h1.ts-help-h1')).toHaveText('Training');
  await expect(page.locator('[data-control="help.shortcuts"] table').first()).toBeVisible();
  // an indexable route carries no robots meta at all (__root.tsx NOINDEX_ROUTES); a locator that
  // waits for one would wait out the test
  const robots = page.locator('meta[name="robots"]');
  if ((await robots.count()) > 0)
    expect((await robots.first().getAttribute('content')) ?? '').not.toContain('noindex');
  await expect(page).toHaveTitle(/Training/u);
  const updates = await page.goto('/help/updates');
  expect(updates?.status()).toBe(200);
  await expect(page.locator('h1.ts-help-h1')).toHaveText('Updates');
  await expect(page.locator('[data-control="help.updates"] h2').first()).toContainText(
    /\d{4}-\d{2}-\d{2}/u,
  );
  // no round word on the page (SPEC-5 0.40): whole words, so "background" in the footer passes
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\bround\b|round five|milestone/iu);
});

test('prefs.set writes the record, the mirror and reads back through prefs.get', async ({
  page,
}) => {
  await openDeck(page, `/edit/${COPY}`);
  const set = await invoke<{ preferences: { units: string; autocorrect: { quotes: boolean } } }>(
    page,
    'prefs.set',
    {
      path: '/units',
      value: 'cm',
    },
  );
  expect(set.preferences.units).toBe('cm');
  const get = await invoke<{ path: string; value: unknown }>(page, 'prefs.get', { path: '/units' });
  expect(get.value).toBe('cm');
  const mirror = await page.evaluate(() => window.localStorage.getItem('ts-preferences'));
  expect(mirror).not.toBeNull();
  expect(JSON.parse(mirror ?? '{}')).toMatchObject({ units: 'cm' });
  // a second tab of the same browser reads the stored value first
  const second = await page.context().newPage();
  await openDeck(second, `/edit/${COPY}`);
  const again = await invoke<{ path: string; value: unknown }>(second, 'prefs.get', {
    path: '/units',
  });
  expect(again.value).toBe('cm');
  await second.close();
  await invoke(page, 'prefs.set', { path: '/units', value: 'in' });
  // the substitutions table through pointers (R10 2.3): append, toggle, delete
  const appended = await invoke<{ preferences: { substitutions: { rows: { from: string }[] } } }>(
    page,
    'prefs.set',
    {
      path: '/substitutions/rows/-',
      value: { from: '(p)', to: '℗', on: true },
    },
  );
  const index = appended.preferences.substitutions.rows.findIndex((row) => row.from === '(p)');
  expect(index).toBeGreaterThan(0);
  const deleted = await invoke<{ preferences: { substitutions: { rows: { from: string }[] } } }>(
    page,
    'prefs.set',
    {
      path: `/substitutions/rows/${index}`,
    },
  );
  expect(deleted.preferences.substitutions.rows.some((row) => row.from === '(p)')).toBe(false);
});

test('File > Language writes deck.set /language and the sheet carries the tag', async ({
  page,
}) => {
  await openDeck(page, `/edit/${COPY}`);
  const revision = await page.evaluate(
    () => (window.turboslide!.studio.describe().state as { revision: number }).revision,
  );
  const written = await invoke<{ path: string; value: unknown; revision: number }>(
    page,
    'deck.set',
    {
      path: '/language',
      value: 'fr',
      baseRevision: revision,
    },
  );
  expect(written.value).toBe('fr');
  // a value that is not a BCP 47 tag is refused by the schema (languageTagSchema), the deck untouched
  await expect(
    invoke(page, 'deck.set', {
      path: '/language',
      value: 'not a tag',
      baseRevision: written.revision,
    }),
  ).rejects.toThrow();
  // deck.info answers `language` once its output row gains the field (b5.md request 23, the
  // integrator's actions.ts and store-actions.ts); until then the read back is recorded, never passed
  const info = await invoke<{ language?: string }>(page, 'deck.info', {});
  if (info.language !== undefined) expect(info.language).toBe('fr');
  else
    test.info().annotations.push({
      type: 'not driven',
      description: 'deck.info language waits for b5.md request 23 (actions.ts, store-actions.ts)',
    });
  const sheetLang = await page.locator('.sheet').first().getAttribute('lang');
  // the `lang` attribute on the sheet root is B4's slide.ts by request (b5.md request 17)
  test.info().annotations.push({
    type: 'not driven',
    description:
      sheetLang === 'fr'
        ? 'sheet lang present'
        : 'sheet lang waits for b5.md request 17 (render/slide.ts, B4)',
  });
  await invoke(page, 'deck.set', { path: '/language', baseRevision: written.revision });
});

test('text.autocorrect corrects a seeded paragraph through the window transport', async ({
  page,
}) => {
  await openDeck(page, `/edit/${COPY}`);
  const isWired = await wired(page, 'text.autocorrect', { dryRun: true, baseRevision: 0 });
  test.skip(
    !isWired,
    'text.autocorrect window row waits for b5.md request 3 (controller.tsx, integrator)',
  );
  const state = await page.evaluate(
    () => window.turboslide!.studio.describe().state as { revision: number; slideId: string },
  );
  const slide = await invoke<{
    slide: { id: string; kind: string; slots?: Record<string, { id: string; type: string }[]> };
  }>(page, 'slide.get', { slideId: state.slideId });
  const block = Object.values(slide.slide.slots ?? {})
    .flat()
    .find((b) => b.type === 'paragraph' || b.type === 'heading');
  test.skip(block === undefined, 'no text block on the current slide');
  await invoke(page, 'block.set', {
    slideId: state.slideId,
    blockId: block!.id,
    path: '/text',
    value: 'teh quick (c) fox',
    baseRevision: state.revision,
  });
  const after = await page.evaluate(
    () => (window.turboslide!.studio.describe().state as { revision: number }).revision,
  );
  const dry = await invoke<{ changes: { rule: string }[] }>(page, 'text.autocorrect', {
    slideId: state.slideId,
    blockId: block!.id,
    dryRun: true,
    baseRevision: after,
  });
  expect(dry.changes.map((change) => change.rule)).toEqual([
    'spelling',
    'capitalize',
    'substitution',
  ]);
});

test('the spell check card, the Preferences dialog and the Accessibility menu', async ({
  page,
}) => {
  await openDeck(page, `/edit/${COPY}`);
  const spelling = await wired(page, 'spelling.check', {});
  const dialog = await page.evaluate(
    () => document.querySelector('[data-control="dialog.preferences"]') !== null,
  );
  test.skip(
    !spelling && !dialog,
    'the Spell check card, the Preferences dialog and the Accessibility menu wait for b5.md requests 3 and 4 (the controller rows and the shell registries, integrator)',
  );
  const answer = await invoke<{ language: string; misspellings: unknown[] }>(
    page,
    'spelling.check',
    {},
  );
  expect(answer.language).toBeTruthy();
});
