// The pictures of the features round's ship two (docs/FEATURES.md section 6: "the pictures join
// the ship note"): every new surface in both appearances at 1440 and 1280 on the enforce preview.
// One Chromium; one context per width and appearance (the appearance through the chrome's own
// ts-chrome-appearance record, so the shot is what a seller who chose it sees); each context makes
// its own /new deck through the window API and trashes and removes it before it closes. The OIDC
// header comes from VERCEL_OIDC_TOKEN (never printed). Usage:
//   VERCEL_OIDC_TOKEN=... node docs/gslides-parity/features/build/integrator/pictures-ship-two.mjs \
//     --base https://<preview> --out docs/gslides-parity/features/build/integrator
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};
const BASE = argOf('--base', 'http://localhost:4418').replace(/\/$/, '');
const OUT = argOf('--out', 'docs/gslides-parity/features/build/integrator');
mkdirSync(OUT, { recursive: true });
/* --only <names>: re-shoot the named surfaces alone (the deck and the insert still happen) */
const ONLY = argOf('--only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const wanted = (name) => ONLY.length === 0 || ONLY.includes(name);
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

const WIDTHS = [1440, 1280];
const APPEARANCES = ['light', 'dark'];
const results = [];

const browser = await chromium.launch();
for (const width of WIDTHS) {
  for (const appearance of APPEARANCES) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      extraHTTPHeaders,
      colorScheme: appearance,
    });
    await context.addInitScript((mode) => {
      try {
        localStorage.setItem('ts-chrome-appearance', mode);
      } catch {
        /* storage refused: the shot follows the system */
      }
    }, appearance);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const invoke = (action, input) =>
      page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
    const describe = () => page.evaluate(() => window.turboslide.studio.describe());
    const shot = async (name) => {
      if (!wanted(name)) return;
      const file = join(OUT, `${name}-${width}-${appearance}.png`);
      await page.screenshot({ path: file, fullPage: false });
      results.push({ name, width, appearance, file, ok: true });
      console.log(`ok   ${name} ${width} ${appearance}`);
    };
    const miss = (name, why) => {
      results.push({ name, width, appearance, ok: false, why });
      console.log(`miss ${name} ${width} ${appearance}: ${why}`);
    };
    const control = (id) => page.locator(`[data-control="${id}"]`).first();
    const menuItem = (id) => page.locator(`[data-menu-item="${id}"]`).first();
    const closeAll = async () => {
      for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    };
    let deckId = null;
    let revision = 0;
    try {
      await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean(window.turboslide?.studio) && Boolean(document.querySelector('.pt-slide')),
        null,
        { timeout: 90_000 },
      );
      // the deck exists after its first write; the block.insert below is that write
      const d0 = await describe();
      const slideId = d0.state?.slideId ?? d0.slide?.id;

      // 1. Insert > Shader, the gallery
      try {
        await control('menubar.insert').click();
        await menuItem('insert.shader').click();
        await page.locator('[data-control="dialog.shader"]').waitFor();
        await page.locator('[data-control="dialog.shader.tile.paper:liquid-metal.thumb"][data-decoded="true"]').waitFor({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(400);
        await shot('gallery');
        // the first card inserts the liquid metal diamond and selects it (5.4)
        await page.locator('[data-control="dialog.shader.tile.paper:liquid-metal"]').click();
        await page.waitForFunction(() => window.turboslide.studio.describe().state?.blockId, null, {
          timeout: 30_000,
        });
      } catch (error) {
        if (!(error instanceof Error && error.message === 'skipped by --only'))
          miss('gallery', error.message ?? String(error));
        await closeAll();
      }
      await page.waitForTimeout(1500);
      const d1 = await describe();
      deckId = d1.deck?.id ?? d1.state?.deckId ?? null;
      revision = d1.deck?.revision ?? 0;
      const blockId = d1.state?.blockId ?? null;
      console.log(`deck ${deckId} slide ${slideId} block ${blockId} revision ${revision}`);

      // 2. the stage with the selected shader (the chip reads Shader) and the Shader section
      try {
        if (!blockId) throw new Error('no shader block selected after the gallery');
        await control('menubar.format').click();
        await menuItem('format.formatOptions').click();
        /* the id is on the section head and on B5's component root (build/integrator.md, the
           findings): the first is the head */
        await page.locator('[data-control="formatOptions.shader"]').first().waitFor();
        await page.waitForTimeout(1200);
        await shot('shader-section');
        await closeAll();
      } catch (error) {
        miss('shader-section', error instanceof Error ? error.message : String(error));
        await closeAll();
      }

      // 3. Change background, the Shader row with Choose open
      try {
        if (!wanted('background-shader')) throw new Error('skipped by --only');
        await control('menubar.slide').click();
        await menuItem('slide.changeBackground').click();
        await page.locator('[data-control="dialog.background"]').waitFor();
        await control('dialog.background.shader').click();
        await page.locator('[data-control="dialog.background"] [data-control="dialog.shader"]').waitFor();
        await page.waitForTimeout(800);
        await shot('background-shader');
        await closeAll();
      } catch (error) {
        if (!(error instanceof Error && error.message === 'skipped by --only'))
          miss('background-shader', error instanceof Error ? error.message : String(error));
        await closeAll();
      }

      // 4. View > Play shaders
      try {
        if (!wanted('view-play-shaders')) throw new Error('skipped by --only');
        await control('menubar.view').click();
        await menuItem('view.playShaders').hover();
        await menuItem('view.playShaders.show').waitFor();
        await page.waitForTimeout(300);
        await shot('view-play-shaders');
        await closeAll();
      } catch (error) {
        if (!(error instanceof Error && error.message === 'skipped by --only'))
          miss('view-play-shaders', error instanceof Error ? error.message : String(error));
        await closeAll();
      }

      // 5. the show's Options menu mirrors the row (the show is /deck/<id>?present=1; /present/<id>
      //    is the presenter console)
      try {
        if (!wanted('show-options-play-shaders')) throw new Error('skipped by --only');
        if (!deckId) throw new Error('no deck id for the show');
        await page.goto(`${BASE}/deck/${deckId}?present=1`, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-control="present.show"]').waitFor({ timeout: 60_000 });
        await page.mouse.move(width / 2, 880);
        await page.waitForTimeout(600);
        const ids = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control="present.toolbar"] [data-control]')].map(
            (el) => el.getAttribute('data-control'),
          ),
        );
        const optionsId = ids.find((id) => /options/i.test(id ?? ''));
        if (!optionsId) throw new Error(`no options control on the toolbar: ${ids.join(', ')}`);
        await control(optionsId).click();
        await menuItem('present.options.playShaders').hover();
        await menuItem('present.options.playShaders.show').waitFor();
        await page.waitForTimeout(300);
        await shot('show-options-play-shaders');
        await page.keyboard.press('Escape');
      } catch (error) {
        if (!(error instanceof Error && error.message === 'skipped by --only'))
          miss('show-options-play-shaders', error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      miss('context', error instanceof Error ? error.message : String(error));
    } finally {
      // the scratch deck leaves the shared store
      if (deckId) {
        try {
          await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 60_000 });
          const info = await invoke('deck.info', {}).catch(() => null);
          const rev = info?.revision ?? revision;
          await invoke('deck.trash', { id: deckId, baseRevision: rev }).catch(() => undefined);
          const again = await invoke('deck.info', {}).catch(() => null);
          /* confirm is the action's own guard (the schema's example); without it the deck stayed in
             the trash and the deck page's 404 was the trash's, not a removal (this note, section 8) */
          await invoke('deck.remove', {
            id: deckId,
            baseRevision: again?.revision ?? rev,
            confirm: true,
          }).catch(() => undefined);
          const gone = await page
            .goto(`${BASE}/deck/${deckId}`, { waitUntil: 'domcontentloaded' })
            .then((r) => r?.status())
            .catch(() => 'no response');
          console.log(`cleanup ${deckId}: trashed and removed; /deck answers ${gone}`);
        } catch (error) {
          console.log(`cleanup ${deckId} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      await context.close();
    }
  }
}
await browser.close();
const ok = results.filter((r) => r.ok).length;
console.log(`pictures: ${ok} of ${results.length} shots`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
