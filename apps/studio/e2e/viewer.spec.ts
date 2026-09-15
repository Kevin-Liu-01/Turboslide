import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// MILESTONES M1 acceptance, viewer.spec.ts: open /deck/gt-brand, press g, b,
// d, p, type digits and Enter, and assert the mode, the theme, the present
// state and the active slide; /embed/gt-brand posts { type: 'gt-deck-slide',
// n } on navigation and applies { type: 'gt-theme' }. The spec reads the
// slide count from the page, so it runs against the imported deck (85) and
// against the two-slide fixture the studio serves while the import is missing.

const DECK = '/deck/gt-brand';

async function openDeck(page: Page, path = DECK): Promise<number> {
  await page.goto(path);
  const shell = page.locator('.pt-viewer:not(.ts-skeleton)');
  await expect(shell).toHaveAttribute('data-settled', '');
  const total = Number(await shell.getAttribute('data-total'));
  expect(total).toBeGreaterThan(0);
  return total;
}

test.beforeEach(async ({ page }) => {
  // the deck opens dark by default (SPEC 2.1): start every run from a clean store
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // private mode
    }
  });
});

test('the deck opens dark on its first slide with the sheet fitted', async ({ page }) => {
  await openDeck(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const shell = page.locator('.pt-viewer:not(.ts-skeleton)');
  await expect(shell).toHaveAttribute('data-mode', 'slide');
  await expect(shell).toHaveAttribute('data-index', '0');
  const sheet = page.locator('.pt-sheet-stage > .sheet');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.01);
  await expect(page.locator('.ts-stagewrap .ts-stage .pt-slide > .slide')).toBeVisible();
});

test('g, b, d and p change the mode, the theme and the present state', async ({ page }) => {
  await openDeck(page);
  const shell = page.locator('.pt-viewer:not(.ts-skeleton)');
  const body = page.locator('body');

  await body.press('g');
  await expect(shell).toHaveAttribute('data-mode', 'grid');
  await expect(page.locator('.pt-grid .pt-thumb').first()).toBeVisible();

  await body.press('b');
  await expect(shell).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('.pt-book .pt-page').first()).toBeVisible();

  await body.press('d');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.pt-book .ts-sheet').first()).toHaveAttribute('data-theme', 'light');
  await body.press('d');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // presenting from the book opens the slide first (SPEC 6.9)
  await body.press('p');
  await expect(shell).toHaveAttribute('data-mode', 'slide');
  await expect(shell).toHaveClass(/is-present/);
  await expect(page.locator('.pt-toolbar')).toBeHidden();
  await body.press('Escape');
  await expect(shell).not.toHaveClass(/is-present/);
});

test('digits then Enter go to a slide by number and write the stable hash', async ({ page }) => {
  const total = await openDeck(page);
  const shell = page.locator('.pt-viewer:not(.ts-skeleton)');
  const body = page.locator('body');
  const target = total >= 12 ? 12 : total;
  for (const digit of String(target)) await body.press(digit);
  await expect(page.locator('.pt-toast')).toHaveText(`Slide ${target}, press Enter`);
  await body.press('Enter');
  await expect(shell).toHaveAttribute('data-index', String(target - 1));
  const active = await shell.getAttribute('data-active');
  expect(active).toBeTruthy();
  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe(`#s/${encodeURIComponent(active ?? '')}`);
  await expect(page.locator('.pt-orow.is-active')).toHaveAttribute('data-id', active ?? '');
  await expect(page.locator('.pt-count b')).toHaveText(String(target).padStart(2, '0'));

  // the arrows page and the deck number form is read as well (SPEC 5.3)
  await body.press('ArrowLeft');
  await expect(shell).toHaveAttribute('data-index', String(Math.max(0, target - 2)));
  await page.goto(`${DECK}#${total}`);
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
    'data-index',
    String(total - 1),
  );
});

test('the toolbar seg, the sidebar rows and the grid tiles select', async ({ page }) => {
  const total = await openDeck(page);
  const shell = page.locator('.pt-viewer:not(.ts-skeleton)');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' }).click();
  await expect(shell).toHaveAttribute('data-mode', 'grid');
  const last = page.locator('.pt-grid .pt-thumb').last();
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(shell).toHaveAttribute('data-mode', 'slide');
  await expect(shell).toHaveAttribute('data-index', String(total - 1));
  await page.locator('.pt-orow').first().click();
  await expect(shell).toHaveAttribute('data-index', '0');
  await page.locator('body').press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.locator('body').press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
});

test('the embed posts gt-deck-slide on navigation and applies gt-theme', async ({ page }) => {
  // a same-origin host page around the frame, as Prototemplate's DeckFrame is; the deck list,
  // since / opens the newest deck in the editor (landing.spec.ts)
  await page.goto('/decks');
  const messages = await page.evaluateHandle(() => {
    const seen: { type: string; n?: number }[] = [];
    window.addEventListener('message', (event) => {
      const data = event.data as { type?: string; n?: number };
      if (data.type === 'gt-deck-slide') seen.push({ type: data.type, n: data.n });
    });
    const frame = document.createElement('iframe');
    frame.id = 'deck';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
    frame.src = '/embed/gt-brand#2';
    document.body.appendChild(frame);
    return seen;
  });
  const frame = page.frameLocator('#deck');
  await expect(frame.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await expect(frame.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-index', '1');
  const total = Number(
    await frame.locator('.pt-viewer:not(.ts-skeleton)').getAttribute('data-total'),
  );

  // the theme message from the host lands in the frame (SPEC 5.3)
  await page.evaluate(() => {
    const el = document.getElementById('deck') as HTMLIFrameElement;
    el.contentWindow?.postMessage({ type: 'gt-theme', theme: 'light' }, window.location.origin);
  });
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');

  // a pick inside the frame reaches the host as { type: 'gt-deck-slide', n } and the frame's hash is #NN;
  // the click also hands the frame keyboard focus, so the arrows page it afterwards
  await frame.locator('.pt-orow').first().click();
  await expect(frame.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-index', '0');
  await expect.poll(() => messages.evaluate((seen) => seen.map((m) => m.n))).toContain(1);
  if (total > 1) {
    /* the host hands the frame keyboard focus, as DeckFrame.tsx does on load */
    await page.locator('#deck').focus();
    await page.keyboard.press('ArrowRight');
    await expect(frame.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-index', '1');
    await expect.poll(() => messages.evaluate((seen) => seen.map((m) => m.n))).toContain(2);
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.getElementById('deck') as HTMLIFrameElement;
        return el.contentWindow?.location.hash ?? '';
      }),
    )
    .toBe(`#${total > 1 ? 2 : 1}`);
});

test('the document carries the first slide alone and the deferred slides arrive; the twins are not fetched again on a second visit (SPEC-4 3.11, 4.5)', async ({
  page,
}) => {
  /* the server's HTML: one rendered slide section and no other slide's markup, plain or encoded
     in a stream script (the first build streamed the other slides inside the document as the
     loader's deferred promise, which made the document 481 KB; VERIFICATION-4 finding 6). The
     second slide's id is read from the sidebar rows the document carries. */
  const html = await (await page.request.get(DECK)).text();
  expect((html.match(/<section class="slide/g) ?? []).length).toBe(1);
  const rowIds = [...html.matchAll(/class="pt-orow[^"]*"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
  console.log(`viewer document: ${html.length} bytes, ${rowIds.length} sidebar rows`);
  const second = rowIds[1];
  if (second !== undefined) {
    expect(html).not.toContain(`data-slide="${second}"`);
    expect(html).not.toContain(`data-slide=\\"${second}\\"`);
  }
  /* on the page the other slides arrive through one getDeckSlides request the viewer sends after
     it mounts (components/DeckViewer.tsx), and a later slide's sheet renders its markup. The
     server function's id in the URL is opaque (a base64 descriptor on the dev server, a hash in
     the build), so the answer is recognised by its shape in the router's serializer form: an
     object whose keys are `revision` and `html`, the html object keyed by slide id. */
  const slideAnswers: { status: number; cache: string | undefined; slides: number }[] = [];
  const slidesIn = (node: unknown): number | null => {
    if (node === null || typeof node !== 'object') return null;
    const record = node as { p?: { k?: unknown; v?: unknown[] } };
    const keys = record.p?.k;
    if (Array.isArray(keys) && keys[0] === 'revision' && keys[1] === 'html') {
      const html = record.p?.v?.[1] as { p?: { k?: unknown } } | undefined;
      return Array.isArray(html?.p?.k) ? html.p.k.length : 0;
    }
    for (const child of record.p?.v ?? []) {
      const found = slidesIn(child);
      if (found !== null) return found;
    }
    return null;
  };
  page.on('response', (response) => {
    if (!response.url().includes('/_serverFn/')) return;
    void response
      .json()
      .then((body: unknown) => {
        const slides = slidesIn(body);
        if (slides !== null)
          slideAnswers.push({
            status: response.status(),
            cache: response.headers()['cache-control'],
            slides,
          });
      })
      .catch(() => undefined);
  });
  const total = await openDeck(page);
  const shell = page.locator('.pt-viewer:not(.ts-skeleton)');
  const target = Math.min(total, 3);
  for (const digit of String(target)) await page.locator('body').press(digit);
  await page.locator('body').press('Enter');
  await expect(shell).toHaveAttribute('data-index', String(target - 1));
  /* the keyed fade keeps the outgoing sheet for 180 ms (SlideView.tsx), so the assertion names
     the active slide's own section */
  const active = await shell.getAttribute('data-active');
  expect(active).toBeTruthy();
  const sheet = page.locator(
    `.ts-stagewrap .ts-stage .pt-slide > .slide[data-slide="${active ?? ''}"]`,
  );
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  const laterHtml = await sheet.evaluate((el) => el.innerHTML.length);
  expect(laterHtml).toBeGreaterThan(100);
  if (total > 1) {
    /* one request, whatever the mount count (the viewer keeps the promise by its request key),
       answering every slide but the first; the cache header's value depends on how this reader
       reached the deck (server/decks.ts setDeckCacheHeader), so it is printed and not asserted */
    await expect.poll(() => slideAnswers.length).toBe(1);
    expect(slideAnswers[0]?.status).toBe(200);
    expect(slideAnswers[0]?.slides).toBe(total - 1);
    console.log(`getDeckSlides: cache-control ${slideAnswers[0]?.cache ?? '(none)'}`);
  }
  /* the twins on a second visit in the same context (SPEC-4 4.5): the deck's assets come from the
     browser's cache, none with bytes on the wire */
  await page.goto(DECK);
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await page.waitForTimeout(500);
  const twins = await page.evaluate(() =>
    (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((entry) => entry.name.includes('/decks/gt-brand/assets/'))
      .map((entry) => ({ name: entry.name.split('/').pop(), transfer: entry.transferSize })),
  );
  console.log(`twins on the second visit: ${JSON.stringify(twins)}`);
  expect(twins.length).toBeGreaterThan(0);
  expect(twins.filter((twin) => twin.transfer > 0)).toEqual([]);
});

test('the agent surface answers', async ({ request }) => {
  const agent = await request.get('/api/agent');
  expect(agent.ok()).toBeTruthy();
  const manifest = (await agent.json()) as { name: string; actions: unknown[] };
  expect(manifest.name).toBe('turboslide');
  expect(Array.isArray(manifest.actions)).toBeTruthy();
  const openapi = await request.get('/openapi.json');
  expect(openapi.ok()).toBeTruthy();
  expect(((await openapi.json()) as { openapi: string }).openapi).toMatch(/^3\.1/);
  const llms = await request.get('/llms.txt');
  expect(llms.ok()).toBeTruthy();
  expect(llms.headers()['content-type']).toContain('text/plain');
  expect(await llms.text()).toContain('Turboslide');
});

test('the grid mounts clones for the tiles near the viewport alone, and the home cards keep their captures (SPEC-4 0.30, 0.41)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const renders: { url: string; status: number }[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/render/'))
      renders.push({ url: response.url(), status: response.status() });
  });
  const total = await openDeck(page);
  await page.locator('body').press('g');
  const shell = page.locator('.pt-viewer:not(.ts-skeleton)');
  await expect(shell).toHaveAttribute('data-mode', 'grid');
  const tiles = page.locator('.pt-grid .pt-thumb');
  await expect(tiles).toHaveCount(total);
  /* every tile stays in the DOM; a clone mounts on the tiles inside the window and on no other.
     The viewer's grid carried no capture on the round three tree (the render route serves the
     home cards; the editor's filmstrip asked for captures and asks for none since round four) */
  await expect(page.locator('.pt-grid .pt-thumb[data-near] .is-clone').first()).toBeVisible();
  const counts = await page.evaluate(() => ({
    near: document.querySelectorAll('.pt-grid .pt-thumb[data-near]').length,
    clonesFar: document.querySelectorAll('.pt-grid .pt-thumb:not([data-near]) .is-clone').length,
    clonesNear: document.querySelectorAll('.pt-grid .pt-thumb[data-near] .is-clone').length,
  }));
  expect(counts.clonesFar).toBe(0);
  expect(counts.near).toBeGreaterThan(0);
  expect(counts.clonesNear).toBe(counts.near);
  if (total > 40) expect(counts.near).toBeLessThan(total);
  expect(renders).toEqual([]);
  /* the capture path stays for the home cards: /decks asks the render route for the first slide
     of a deck at its revision and gets a picture (a render on the first visit, a cache hit after) */
  await page.goto('/decks');
  await expect(page.locator('.pt-viewer, [data-hydrated]').first()).toBeAttached();
  await expect
    .poll(() => renders.some((row) => /[?&]w=320&r=\d+/.test(row.url) && row.status === 200), {
      timeout: 90_000,
    })
    .toBe(true);
});
