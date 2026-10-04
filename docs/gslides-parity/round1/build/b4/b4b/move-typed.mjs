// On a deck made from the typed GT template: open the speed plate slide, select its drawing (the
// diagram block dia1), nudge it right by one arrow press (the first canvas write converts the slide
// to freeform), then drag it 120 px right and 40 px down with the mouse. Reads the boxes of the
// heading, the paragraphs, the caption and the drawing in sheet pixels before, after the nudge and
// after the drag, with pictures. The deck is trashed and deleted forever by id before it returns.
import { chromium } from '/Users/kevinliu/repos/Turboslide-next/node_modules/playwright-core/index.mjs';
const [base, outDir, slide, theme = 'light'] = process.argv.slice(2);
// the open surface of a local server; the deck is named by the query, as deck.info's input is empty
const surface = async (action, deck, input) => {
  const r = await fetch(`${base}/api/actions/${action}?deck=${encodeURIComponent(deck)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
await context.addInitScript((t) => { localStorage.setItem('ts-chrome-appearance', t); localStorage.setItem('gt-theme', t); }, theme);
const page = await context.newPage();
let deckId = null;
const IDS = ['h', 'p1', 'p2', 'p3', 'dia1'];
try {
  await page.goto(`${base}/decks`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.locator('[data-control="home.template.gt-brand"]').first().click();
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  deckId = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? null;
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForTimeout(2500);
  const card = page.locator(`[data-control="filmstrip.slide.${slide}"]`).first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForTimeout(1500);
  const read = () => page.evaluate(async ({ id, ids }) => {
    const s = await window.turboslide.studio.invoke('slide.get', { slideId: id }).catch((e) => ({ error: String(e) }));
    const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
    const sheet = stage?.getBoundingClientRect();
    const box = (el) => { if (!el || !sheet) return null; const r = el.getBoundingClientRect(); const k = 1600 / sheet.width; return [Math.round((r.left - sheet.left) * k), Math.round((r.top - sheet.top) * k), Math.round(r.width * k), Math.round(r.height * k)]; };
    const out = {};
    for (const b of ids) out[b] = box(document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${b}"]`));
    const sl = s.slide ?? s;
    return { layout: sl?.layout?.type ?? null, boxes: out };
  }, { id: slide, ids: IDS });
  const overlaps = (r) => { const d = r.boxes.dia1; if (!d) return null; return ['h', 'p1', 'p2', 'p3'].filter((k) => { const b = r.boxes[k]; return b && d[0] < b[0] + b[2] && b[0] < d[0] + d[2] && d[1] < b[1] + b[3] && b[1] < d[1] + d[3]; }); };
  const before = await read();
  await page.screenshot({ path: `${outDir}/move-${slide}-${theme}-before.jpg`, type: 'jpeg', quality: 70 });
  const dia = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="dia1"]').first();
  await dia.click();
  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(3000);
  const nudged = await read();
  await page.screenshot({ path: `${outDir}/move-${slide}-${theme}-nudged.jpg`, type: 'jpeg', quality: 70 });
  const r = await page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="dia1"]').first().boundingBox();
  const sheet = await page.locator('.ts-stagewrap.ts-editor .ts-stage').first().boundingBox();
  const k = sheet.width / 1600;
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) { await page.mouse.move(x + (120 * k * i) / 10, y + (40 * k * i) / 10); await page.waitForTimeout(30); }
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const dragged = await read();
  await page.screenshot({ path: `${outDir}/move-${slide}-${theme}-dragged.jpg`, type: 'jpeg', quality: 70 });
  console.log(JSON.stringify({ deckId, before, nudged, dragged, overlaps: { before: overlaps(before), nudged: overlaps(nudged), dragged: overlaps(dragged) } }));
} finally {
  await browser.close();
  if (deckId !== null) {
    const info = await surface('deck.info', deckId, {});
    const rev = info.body?.revision ?? 0;
    const trash = await surface('deck.trash', deckId, { id: deckId, baseRevision: rev });
    const info2 = await surface('deck.info', deckId, {});
    const remove = await surface('deck.remove', deckId, { id: deckId, confirm: true, baseRevision: info2.body?.revision ?? rev });
    const after = await fetch(`${base}/edit/${deckId}`).then((r) => r.status);
    console.log(`teardown ${deckId}: info ${info.status} trash ${trash.status} remove ${remove.status} /edit after ${after}`);
  }
}
