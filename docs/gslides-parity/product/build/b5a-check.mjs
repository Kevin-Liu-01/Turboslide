// B5a hand drive with Playwright (under .turboslide/e2e.lock): the six role tooltips the way the
// walk hovers them, and a Roboto pick on a text box with the revision read before and after.
import { chromium } from 'playwright-core';
const BASE = process.argv[2] ?? 'http://localhost:4415';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const out = {};
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 30000 });
  await sleep(1500);
  const ctl = (id) => page.locator(`[data-control="${id}"]`).first();
  await ctl('toolbar.theme').click();
  await ctl('panel.brand').waitFor({ timeout: 8000 });
  // the tooltips, hovered the way the walk does
  const tips = {};
  for (const role of ['text', 'background', 'caption', 'hint', 'primary', 'accent']) {
    const el = ctl(`panel.brand.color.${role}.swatch`);
    await el.scrollIntoViewIfNeeded();
    const r = await el.boundingBox();
    await page.mouse.move(720, 495);
    await sleep(450);
    const from = { x: r.x - 30, y: r.y + r.height / 2 };
    const to = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    for (let i = 1; i <= 6; i += 1) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
      await sleep(30);
    }
    await sleep(700);
    tips[role] = await page.evaluate(() => {
      const tip = document.querySelector('.pt-tip');
      const anchor = document.querySelector('[aria-describedby="pt-tip"]');
      return {
        text: tip && !tip.hidden ? tip.textContent : null,
        anchor: anchor?.getAttribute('data-control') ?? null,
        hovered: document.querySelector(':hover:not(:has(:hover))')?.tagName,
      };
    });
  }
  out.tips = tips;
  // a text box on a new blank slide through the window API, then the Font dropdown
  const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
  let s = await state();
  const slideId = s.slideId;
  const inserted = await page
    .evaluate(async (base) => {
      const st = window.turboslide.studio.describe().state;
      return window.turboslide.studio.invoke('slide.new', {
        layout: 'blank',
        after: st.slideId,
        baseRevision: st.revision,
      });
    }, null)
    .catch((e) => ({ error: String(e) }));
  out.inserted = JSON.stringify(inserted).slice(0, 200);
  await sleep(1500);
  s = await state();
  const newSlide = (inserted && inserted.slide && inserted.slide.id) || s.slideId;
  const box = await page
    .evaluate(async (id) => {
      const st = window.turboslide.studio.describe().state;
      return window.turboslide.studio.invoke('block.insert', {
        slideId: id,
        slot: 'main',
        block: {
          id: 'font-box',
          type: 'text',
          text: 'Renewal terms for the quarter',
          pos: { x: 160, y: 200, w: 900, h: 140 },
        },
        baseRevision: st.revision,
      });
    }, newSlide)
    .catch((e) => ({ error: String(e) }));
  out.box = JSON.stringify(box).slice(0, 200);
  await sleep(1500);
  await page
    .locator(`[data-control="filmstrip.slide.${newSlide}"]`)
    .first()
    .click()
    .catch(() => undefined);
  await sleep(800);
  const el = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="font-box"]').first();
  const b = await el.boundingBox();
  if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(600);
  const font = await page.evaluate(() => {
    const f = document.querySelector('[data-control="toolbar.font"]');
    return f ? { disabled: f.getAttribute('aria-disabled'), text: f.textContent } : null;
  });
  out.fontControl = font;
  const revBefore = (await state()).revision;
  await ctl('toolbar.font').click();
  await ctl('toolbar.font.search').waitFor({ timeout: 6000 });
  const rowFace = await page.evaluate(() => {
    const r = document.querySelector('[data-control="toolbar.font.row.merriweather"]');
    return r ? getComputedStyle(r).fontFamily : null;
  });
  out.rowFace = rowFace;
  await ctl('toolbar.font.row.roboto').click();
  await sleep(2500);
  const revAfter = (await state()).revision;
  const stored = await page.evaluate(
    () =>
      document.querySelector('.ts-stagewrap.ts-editor .pt-slide [data-block="font-box"]') &&
      getComputedStyle(
        document.querySelector(
          '.ts-stagewrap.ts-editor .pt-slide [data-block="font-box"] [data-run]',
        ) ?? document.querySelector('.ts-stagewrap.ts-editor .pt-slide [data-block="font-box"]'),
      ).fontFamily,
  );
  out.font = {
    revBefore,
    revAfter,
    drawn: stored,
    saved: await page.evaluate(
      () =>
        document.querySelector('.ts-title-save, [data-control="title.save"]')?.textContent ??
        document.title,
    ),
  };
  const deckId = (await state()).deckId;
  out.deckId = deckId;
} catch (error) {
  out.error = String(error);
} finally {
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
