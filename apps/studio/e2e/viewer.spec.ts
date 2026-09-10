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
  const shell = page.locator('.pt-viewer');
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
  const shell = page.locator('.pt-viewer');
  await expect(shell).toHaveAttribute('data-mode', 'slide');
  await expect(shell).toHaveAttribute('data-index', '0');
  const sheet = page.locator('.pt-sheet-stage > .sheet');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.01);
  await expect(page.locator('.ts-stage .pt-slide > .slide')).toBeVisible();
});

test('g, b, d and p change the mode, the theme and the present state', async ({ page }) => {
  await openDeck(page);
  const shell = page.locator('.pt-viewer');
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
  const shell = page.locator('.pt-viewer');
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
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-index', String(total - 1));
});

test('the toolbar seg, the sidebar rows and the grid tiles select', async ({ page }) => {
  const total = await openDeck(page);
  const shell = page.locator('.pt-viewer');
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
  // a same-origin host page around the frame, as Prototemplate's DeckFrame is
  await page.goto('/');
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
  await expect(frame.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  await expect(frame.locator('.pt-viewer')).toHaveAttribute('data-index', '1');
  const total = Number(await frame.locator('.pt-viewer').getAttribute('data-total'));

  // the theme message from the host lands in the frame (SPEC 5.3)
  await page.evaluate(() => {
    const el = document.getElementById('deck') as HTMLIFrameElement;
    el.contentWindow?.postMessage({ type: 'gt-theme', theme: 'light' }, window.location.origin);
  });
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');

  // a pick inside the frame reaches the host as { type: 'gt-deck-slide', n } and the frame's hash is #NN;
  // the click also hands the frame keyboard focus, so the arrows page it afterwards
  await frame.locator('.pt-orow').first().click();
  await expect(frame.locator('.pt-viewer')).toHaveAttribute('data-index', '0');
  await expect.poll(() => messages.evaluate((seen) => seen.map((m) => m.n))).toContain(1);
  if (total > 1) {
    /* the host hands the frame keyboard focus, as DeckFrame.tsx does on load */
    await page.locator('#deck').focus();
    await page.keyboard.press('ArrowRight');
    await expect(frame.locator('.pt-viewer')).toHaveAttribute('data-index', '1');
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
