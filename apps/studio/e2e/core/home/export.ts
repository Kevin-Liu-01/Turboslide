import { createHash } from 'node:crypto';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { HOME_ASSETS } from '../../../src/components/home/assets';
import { HOME_DECK } from '../../../src/components/home/deck.generated';
import { EXPORT, formatPercentFigure } from '../../../src/components/home/copy';
import { HOME_FACTS } from '../../../src/components/home/facts';
import FACTS from '../../../../../packages/theme/brand/facts.json' with { type: 'json' };
import { extraHTTPHeaders, title } from '../lib';
import { bandReady, freshPage, openHome } from './agents';

// A lane module of core/home.spec.ts (docs/LANDING.md 2.8, 6.7; build/integrator.md "Landing,
// day 0" 4.9 and 5.1). L3's, push 6: the seam (home.export.seam) and the figure with the PDF
// (home.export.figure). The files are read through the network as the page serves them and
// compared with `assets.json` (the build's record of each file's bytes, sha256 and size).

export const ROWS: readonly string[] = ['home.export.seam', 'home.export.figure'];

const band = (page: Page) => page.locator('[data-band="export"]');
const handle = (page: Page) => band(page).locator('[data-seam]');
const cutOf = (page: Page) =>
  handle(page).evaluate((el) => {
    let root: HTMLElement | null = el as HTMLElement;
    while (root !== null && !root.hasAttribute('data-seam-root')) root = root.parentElement;
    const host = root ?? (el.parentElement as HTMLElement);
    return parseFloat(getComputedStyle(host).getPropertyValue('--seam-cut'));
  });
const seamRoot = (page: Page) => band(page).locator('[data-seam-root]');

export function rows(): void {
  test(title('home.export.seam'), async ({ browser }) => {
    const page = await freshPage(browser);
    await openHome(page);
    await bandReady(page, 'export');
    /* the labels and the slider */
    await expect(band(page)).toContainText(EXPORT.labels.perfect);
    await expect(band(page)).toContainText(EXPORT.labels.editable);
    await expect(handle(page)).toHaveAttribute('role', 'slider');
    await expect(handle(page)).toHaveAttribute('aria-valuemin', '0');
    await expect(handle(page)).toHaveAttribute('aria-valuemax', '100');
    /* a drag follows the pointer 1:1 with no inertia */
    const box = (await seamRoot(page).boundingBox())!;
    const y = box.y + box.height * 0.25;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    for (const p of [0.35, 0.5, 0.62, 0.7]) {
      await page.mouse.move(box.x + box.width * p, y);
      expect(Math.abs((await cutOf(page)) - p * 100)).toBeLessThan(0.5);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(Math.abs((await cutOf(page)) - 70)).toBeLessThan(0.5);
    expect(await seamRoot(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(
      0,
    );
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '70');
    await expect(handle(page)).toHaveAttribute('aria-valuetext', EXPORT.slider(70));
    /* a click sets it */
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.1);
    expect(Math.abs((await cutOf(page)) - 20)).toBeLessThan(0.5);
    /* the keys: arrows 2, Shift 10, Page Up and Down 10, Home and End */
    await handle(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '22');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '32');
    await page.keyboard.press('PageDown');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '22');
    await page.keyboard.press('ArrowLeft');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '20');
    await page.keyboard.press('End');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('Home');
    await expect(handle(page)).toHaveAttribute('aria-valuenow', '0');
    /* the left side is the Perfect file's picture part, served as recorded */
    const perfect = HOME_ASSETS.find(
      (a) => a.role === 'export-perfect' && a.appearance === 'light',
    );
    expect(perfect).toBeDefined();
    const src = await band(page).locator('.ts-seam-perfect img.ts-only-light').getAttribute('src');
    expect(src).toBe(perfect!.path);
    const res = await page.request.get(src!, { headers: extraHTTPHeaders });
    const bytes = await res.body();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(perfect!.sha256);
    await expect(band(page)).toContainText(`${perfect!.width} by ${perfect!.height}`);
    /* the right side's text boxes are text, selectable */
    const texts = band(page).locator('[data-seam-text]');
    expect(await texts.count()).toBeGreaterThan(0);
    const selectable = await texts.first().evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return { text: selection.toString().trim(), user: getComputedStyle(el).userSelect };
    });
    expect(selectable.text.length).toBeGreaterThan(0);
    expect(selectable.user).not.toBe('none');
    await page.context().close();
  });

  test(title('home.export.figure'), async ({ browser }) => {
    const page = await freshPage(browser);
    const pdfRequests: string[] = [];
    page.on('request', (r) => {
      if (/\/home\/.*\.pdf/.test(r.url())) pdfRequests.push(r.url());
    });
    await openHome(page);
    await bandReady(page, 'export');
    await page.waitForTimeout(500);
    expect(pdfRequests).toEqual([]);
    /* the figure is facts.json's export reading, in the sentence that names its measure */
    const perfect = HOME_ASSETS.find(
      (a) => a.role === 'export-perfect' && a.appearance === 'light',
    );
    expect(perfect).toBeDefined();
    const size = { width: perfect!.width ?? 0, height: perfect!.height ?? 0 };
    await expect(band(page)).toContainText(EXPORT.rows.perfect.sentence(size, HOME_FACTS));
    expect(EXPORT.rows.perfect.sentence(size, HOME_FACTS)).toContain(
      `${formatPercentFigure(HOME_FACTS.mismatchPercent)}.`,
    );
    expect(EXPORT.rows.perfect.sentence(size, HOME_FACTS)).toContain('screenshot');
    expect(HOME_FACTS.mismatchPercent).toBe(FACTS.export.worstPageMismatchPercent);
    await expect(page.locator('main#top')).not.toContainText(/pixel for pixel/i);
    const record = band(page).locator('a[href$="docs/pptx.md"]');
    await expect(record).toHaveCount(1);
    /* Download the PDF: 8 pages, its sha256 in assets.json */
    const download = page.waitForEvent('download');
    await band(page).locator('a[data-pdf]').click();
    const file = await download;
    const path = await file.path();
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(path);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const pdf = HOME_ASSETS.find((a) => a.role === 'pdf' && a.sha256 === sha);
    expect(pdf, 'the downloaded PDF is a file of assets.json').toBeDefined();
    expect(pdf!.pages).toBe(HOME_DECK.order.length);
    expect((bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(
      HOME_DECK.order.length,
    );
    /* the link points at the file of the shown appearance, requested by this click alone */
    expect(new URL(file.url()).pathname).toBe(
      HOME_ASSETS.find((a) => a.role === 'pdf' && a.appearance === 'light')!.path,
    );
    await page.context().close();
  });
}
