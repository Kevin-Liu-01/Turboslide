// The surface rows, second pass: the rows the first pass (surface.json) could not read because it
// took the converted grammar mark for the new text box, navigated the editor tab to the print
// route and imported playwright-core by name. Redone here: text overflow and Text fitting, alt
// text on a text box, a block linked to a slide and the click in the show, the print route, the
// .pptx refusal in Open and Import slides, Publish to web, the comment with a mention, paste and
// paste without formatting. One scratch deck from /new, trashed and deleted forever in the
// finally block.
//   node gaps-surface2.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE, EVIDENCE, bind, cleanupDeck, launch, makeTable, newDeck, request, sleep } from './lib.mjs';

const PPTX = path.join(path.dirname(new URL(import.meta.url).pathname), '01-text.pptx');
const table = makeTable('surface2');
const { browser, context, page, consoleErrors } = await launch();
const t = bind(page, table);
let deck = null;
const backToEditor = async () => {
  if (!/\/edit\//.test(page.url()) || !(await t.has('[data-control="menubar.file"]'))) {
    await page.goto(`${BASE}/edit/${deck.id}`, { waitUntil: 'domcontentloaded' });
    await t.editorReady();
    await t.settled();
  }
  await page.locator('[data-control="menubar.file"]').waitFor({ timeout: 15_000 });
  await t.dismissNamePrompt();
};
try {
  deck = await newDeck(t);
  table.record('a scratch deck from /new', 'the address moves to /edit/<id>', `${deck.id}; ${page.url().replace(BASE, '')}`, /\/edit\//.test(page.url()));
  const X = deck.titleSlide;
  await t.pollUntil(t.state, (s) => s.sync?.connected === true, 30_000);
  await t.setAdvanced(true);

  let boxId = null;
  await t.step('Text box: Insert > Text box, click at 900,500, type a long paragraph', 'the box grows or the text shrinks; the text stays inside the box', async () => {
    const obj = await t.insertByTool(X, ['insert.textBox'], { x: 900, y: 500 }, { text: null });
    if (!obj) return { ok: false, observed: 'no text box landed' };
    boxId = obj.id;
    if (!(await t.editing())) await t.openRun(obj.id);
    const long = 'Quarterly reviews included, onboarding for every regional team, a named success manager, priority support with a four hour response, and the usage dashboard for finance. Renewal terms follow the master agreement signed in March.';
    await t.typeHuman(long.slice(0, 100));
    await page.keyboard.type(long.slice(100));
    await sleep(800);
    const facts = await page.evaluate((id) => {
      const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      if (!inner) return null;
      const free = inner.closest('.free') ?? inner;
      const f = free.getBoundingClientRect();
      const run = inner.querySelector('[data-run]') ?? inner;
      const r = run.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(run);
      const rects = [...range.getClientRects()];
      const bottom = Math.max(...rects.map((x) => x.bottom));
      const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide').getBoundingClientRect();
      return { box: `${Math.round(f.width)}x${Math.round(f.height)}`, run: `${Math.round(r.width)}x${Math.round(r.height)}`, lines: new Set(rects.map((x) => Math.round(x.top))).size, textBottomPastBox: Math.round(bottom - f.bottom), pastSheet: Math.round(bottom - sheet.bottom), overflow: getComputedStyle(free).overflow, font: getComputedStyle(run).fontSize };
    }, obj.id);
    await t.press('Escape', 2);
    await t.settled();
    const block = (await t.objectsOf(X)).find((o) => o.id === obj.id)?.block;
    const shot = await t.shot('text-box-overflow');
    return { ok: facts !== null && facts.textBottomPastBox <= 2, observed: `${JSON.stringify(facts)}; autofit "${block?.autofit}"; pos ${JSON.stringify(block?.pos)}; ${shot}` };
  });
  await t.step('Format > Text fitting on the text box', 'Format options opens at Text fitting with Do not autofit, Shrink on overflow, Resize shape', async () => {
    if (!boxId) return { ok: false, observed: 'no text box' };
    await t.selectObject(boxId);
    await t.menuPath('format', 'format.textFitting');
    await sleep(800);
    const facts = await page.evaluate(() => {
      const panel = document.querySelector('[data-control="panel.formatOptions"]');
      const seg = document.querySelector('[data-control="formatOptions.textFitting.autofit"]');
      return { panel: panel !== null, sections: panel ? [...panel.querySelectorAll('.ts-panel-section-head')].map((h) => h.textContent?.trim()) : null, fitting: seg ? seg.textContent?.replace(/\s+/g, ' ').trim() : null, checked: seg ? [...seg.querySelectorAll('[aria-pressed="true"], [aria-checked="true"], .is-on, [data-on]')].map((b) => b.textContent?.trim()) : null };
    });
    const shot = await t.shot('text-fitting-panel');
    return { ok: facts.panel && facts.fitting !== null, observed: `${JSON.stringify(facts)}; ${shot}` };
  });
  await t.step('Alt text on the text box (Format options > Alt text)', 'a description field; the block carries alt after Tab', async () => {
    if (!boxId) return { ok: false, observed: 'no text box' };
    if (!(await t.visible('[data-control="formatOptions.altText.description"]'))) {
      const head = page.locator('[data-control="panel.formatOptions"] .ts-panel-section-head', { hasText: /alt text/i }).first();
      if ((await head.count()) > 0) { await head.click(); await sleep(400); }
    }
    const field = await t.rectOf('[data-control="formatOptions.altText.description"]');
    if (!field) return { ok: false, observed: 'no Alt text field in the panel' };
    await t.clickAt(field.x + field.w / 2, field.y + field.h / 2);
    await t.typeHuman('Renewal terms paragraph');
    await t.press('Tab');
    await t.settled();
    const block = (await t.objectsOf(X)).find((o) => o.id === boxId)?.block;
    const shot = await t.shot('alt-text');
    return { ok: typeof block?.alt === 'string' && block.alt.length > 0, observed: `alt "${block?.alt}"; ${shot}` };
  });
  await t.closeDialogs();

  let second = null;
  await t.step('Link the text box to slide 2: New slide, back to slide 1, select the box, Insert > Link, pick the slide, Apply', 'the block carries link { slide }', async () => {
    await t.invoke('slide.new', { layout: 'split', after: X, baseRevision: (await t.state()).revision });
    await t.settled();
    const ids = await t.slideIds();
    second = ids.find((id) => id !== X) ?? null;
    if (!boxId || !second) return { ok: false, observed: `box ${boxId}; slides ${ids.join(',')}` };
    const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
    if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
    await sleep(600);
    await t.selectObject(boxId);
    await t.menuPath('insert', 'insert.link');
    await sleep(700);
    const dialog = await t.visible('[data-control="dialog.link.slide"]');
    const pop = await t.visible('[data-control="run.link.href"]');
    let options = null;
    if (dialog) {
      options = await page.evaluate(() => [...document.querySelectorAll('[data-control="dialog.link.slide"] option')].map((o) => `${o.value}:${o.textContent?.trim()}`));
      await page.selectOption('[data-control="dialog.link.slide"]', second);
      await sleep(300);
    }
    const shot = await t.shot('link-block-dialog');
    if (dialog) await page.locator('[role="dialog"] button:has-text("Apply")').first().click();
    await sleep(900);
    await t.closeDialogs();
    await t.settled();
    const block = (await t.objectsOf(X)).find((o) => o.id === boxId)?.block;
    return { ok: dialog && JSON.stringify(block?.link ?? null).includes(second), observed: `dialog ${dialog}; popover ${pop}; options ${JSON.stringify(options)}; link ${JSON.stringify(block?.link)}; ${shot}` };
  });
  await t.step('The linked box in the show: Slideshow, click it', 'the show jumps to slide 2', async () => {
    if (!boxId || !second) return { ok: false, observed: 'no linked box' };
    const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
    if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
    await sleep(500);
    const show = await t.openShow();
    const before = await t.state();
    const target = await page.evaluate((id) => { const els = [...document.querySelectorAll(`[data-block="${id}"]`)].filter((el) => el.getClientRects().length > 0 && el.closest('.ts-stagewrap.ts-editor') === null); const el = els[0]; if (!el) return null; const r = el.getBoundingClientRect(); const a = el.closest('a') ?? el.querySelector('a'); return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: el.tagName, href: a?.getAttribute('href') ?? null, role: el.getAttribute('role'), cursor: getComputedStyle(el).cursor }; }, boxId);
    if (target) await t.clickAt(target.x, target.y);
    await sleep(1000);
    const after = await t.state();
    const shot = await t.shot('link-in-show');
    await t.press('Escape');
    await sleep(600);
    return { ok: show && Boolean(target) && after.slideId === second, observed: `show ${show}; target ${JSON.stringify(target)}; slide ${before.slideId} -> ${after.slideId} (linked ${second}); ${shot}` };
  });

  await t.step('File > Print settings and preview: the layout rows, paper and orientation', 'the handout rows are drawn disabled; no Paper or Orientation control', async () => {
    await backToEditor();
    const [tab] = await Promise.all([context.waitForEvent('page', { timeout: 10_000 }).catch(() => null), t.menuPath('file', 'file.printPreview')]);
    const p = tab ?? page;
    if (tab) await tab.waitForLoadState('domcontentloaded');
    await p.waitForSelector('[data-control="print.layout"]', { timeout: 30_000 });
    await sleep(1500);
    const facts = await p.evaluate(() => {
      const sel = document.querySelector('[data-control="print.layout"]');
      return { url: location.pathname, sameTab: true, options: sel ? [...sel.querSelectorAllSafe?.('option') ?? sel.querySelectorAll('option')].map((o) => `${o.textContent?.trim()}${o.disabled ? '(disabled)' : ''}`) : null, controls: [...document.querySelectorAll('[data-control^="print."]')].map((el) => el.getAttribute('data-control')).filter((c, i, a) => a.indexOf(c) === i && !/print\.notes\./.test(c)), paperWord: /Paper|Letter|A4/.test(document.body.textContent ?? ''), orientationWord: /Orientation|Landscape|Portrait/.test(document.body.textContent ?? ''), pages: document.querySelector('[data-control="print.pages"]')?.getAttribute('data-count') };
    });
    facts.sameTab = tab === null;
    const file = table.shotName('print-preview');
    await p.screenshot({ path: file });
    if (tab) await tab.close();
    await backToEditor();
    return { ok: Array.isArray(facts.options), observed: `${JSON.stringify(facts)}; ${path.basename(file)}` };
  });

  await t.step('File > Open > Upload with a .pptx', 'the file is refused with the PowerPoint sentence', async () => {
    await backToEditor();
    await t.menuPath('file', 'file.open');
    await page.locator('[role="dialog"]').first().waitFor({ timeout: 8000 });
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] [role="tab"], [role="dialog"] button')].map((b) => b.textContent?.trim()).filter(Boolean));
    const up = page.locator('[role="dialog"] [role="tab"]:has-text("Upload"), [role="dialog"] button:has-text("Upload")').first();
    if ((await up.count()) > 0) await up.click();
    await sleep(500);
    const input = page.locator('[data-control="dialog.open.file"]');
    const accept = (await input.count()) > 0 ? await input.getAttribute('accept') : null;
    const sentenceBefore = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent?.replace(/\s+/g, ' ').trim());
    if ((await input.count()) > 0) await input.setInputFiles(PPTX);
    await sleep(1500);
    const text = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent?.replace(/\s+/g, ' ').trim());
    const shot = await t.shot('open-pptx');
    await t.closeDialogs();
    return { ok: /PowerPoint import is not available/.test(text ?? ''), observed: `tabs ${tabs.join('/')}; accept "${accept}"; before "${sentenceBefore?.slice(0, 260)}"; after "${text?.slice(0, 420)}"; ${shot}` };
  });
  await t.step('File > Import slides > Upload with a .pptx', 'the same refusal', async () => {
    await backToEditor();
    await t.menuPath('file', 'file.importSlides');
    await page.locator('[role="dialog"]').first().waitFor({ timeout: 8000 });
    const up = page.locator('[role="dialog"] [role="tab"]:has-text("Upload"), [role="dialog"] button:has-text("Upload")').first();
    if ((await up.count()) > 0) await up.click();
    await sleep(500);
    const input = page.locator('[data-control="dialog.importSlides.file"]');
    if ((await input.count()) === 0) { const txt = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent?.replace(/\s+/g, ' ').slice(0, 300)); await t.closeDialogs(); return { ok: false, observed: `no upload input; dialog "${txt}"` }; }
    await input.setInputFiles(PPTX);
    await sleep(1500);
    const text = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent?.replace(/\s+/g, ' ').trim());
    const shot = await t.shot('import-slides-pptx');
    await t.closeDialogs();
    return { ok: /PowerPoint import is not available/.test(text ?? ''), observed: `dialog "${text?.slice(0, 420)}"; ${shot}` };
  });

  await t.step('File > Share > Publish to web: Publish, the link, fresh fetches, Embed, Done, reopen', 'a published link; Stop publishing offered on reopen; the player refuses without its token', async () => {
    await backToEditor();
    await t.menuPath('file', 'file.share', 'file.share.publish');
    await page.locator('[data-control="dialog.publish.state"]').waitFor({ timeout: 8000 });
    const before = await t.textOf('[data-control="dialog.publish.state"]');
    if (await t.visible('[data-control="dialog.publish.publish"]')) await t.clickControl('dialog.publish.publish');
    await sleep(3000);
    const after = await t.textOf('[data-control="dialog.publish.state"]');
    const link = await t.textOf('[data-control="dialog.publish.link.url"]');
    const shot = await t.shot('publish-dialog');
    const embedTab = page.locator('[role="dialog"] [role="tab"]:has-text("Embed"), [role="dialog"] button:has-text("Embed")').first();
    if ((await embedTab.count()) > 0) await embedTab.click();
    await sleep(500);
    const embed = await t.textOf('[data-control="dialog.publish.embed.code"]');
    const shot2 = await t.shot('publish-embed');
    await t.closeDialogs();
    const fetched = {};
    if (link && /^https?:/.test(link)) {
      const fresh = await request.newContext();
      fetched.withToken = (await fresh.get(link, { maxRedirects: 0 })).status();
      fetched.withoutToken = (await fresh.get(link.replace(/[?&]p=[^&]+/, '').replace(/\?$/, ''), { maxRedirects: 0 })).status();
      fetched.plainDeck = (await fresh.get(`${BASE}/deck/${deck.id}`, { maxRedirects: 0 })).status();
      fetched.embedNoToken = (await fresh.get(`${BASE}/embed/${deck.id}`, { maxRedirects: 0 })).status();
      await fresh.dispose();
    }
    await t.menuPath('file', 'file.share', 'file.share.publish');
    await page.locator('[data-control="dialog.publish.state"]').waitFor({ timeout: 8000 });
    const reopened = await t.textOf('[data-control="dialog.publish.state"]');
    const stop = await t.visible('[data-control="dialog.publish.stop"]');
    const shot3 = await t.shot('publish-reopened');
    await t.closeDialogs();
    return { ok: Boolean(link) && stop, observed: `state before "${before}"; after "${after}"; link ${link}; fresh fetch ${JSON.stringify(fetched)}; embed "${embed?.slice(0, 140)}"; reopened "${reopened}"; Stop publishing offered ${stop}; ${shot}; ${shot2}; ${shot3}` };
  });

  await t.step('Comment on the text box: Cmd+Option+M, type with an @, the mention list, Comment, the marker, Resolve', 'a composer with a mention picker of people; the thread posts within 20 s; Resolve works', async () => {
    await backToEditor();
    if (!boxId) return { ok: false, observed: 'no text box' };
    const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
    if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
    await sleep(500);
    await t.selectObject(boxId);
    await t.press('Meta+Alt+m');
    await sleep(900);
    const field = page.locator('[data-control$=".field"]').last();
    if (!((await field.count()) > 0 && (await field.isVisible()))) return { ok: false, observed: `no comment field; snackbar "${await t.snackbar()}"` };
    await field.click();
    await t.typeHuman('Swap the logo before the call @');
    await sleep(1000);
    const mentions = await page.evaluate(() => [...document.querySelectorAll('[data-control*=".mention."]')].filter((el) => el.getClientRects().length > 0).map((el) => el.textContent?.trim()?.slice(0, 60)));
    const shot = await t.shot('comment-mentions');
    await t.press('Backspace');
    await sleep(300);
    const submit = page.locator('[data-control$=".submit"]').last();
    const t0 = Date.now();
    await submit.click();
    const markers = await t.pollUntil(() => t.count('[data-control="comment.marker"]'), (n) => n > 0, 20_000);
    const ms = Date.now() - t0;
    const snack = await t.snackbar();
    const shot2 = await t.shot('comment-posted');
    let resolved = null;
    const marker = await t.rectOf('[data-control="comment.marker"]');
    if (marker) { await t.clickAt(marker.x + marker.w / 2, marker.y + marker.h / 2); await sleep(800); }
    const resolve = page.locator('[data-control$=".resolve"]').first();
    if ((await resolve.count()) > 0 && (await resolve.isVisible())) { await resolve.click(); await sleep(2000); resolved = await t.count('[data-control="comment.marker"]'); }
    const shot3 = await t.shot('comment-resolved');
    return { ok: markers > 0, observed: `mention list ${JSON.stringify(mentions)}; markers ${markers} after ${ms} ms; snackbar "${snack}"; markers after Resolve ${resolved}; ${shot}; ${shot2}; ${shot3}` };
  });
  await t.closeDialogs();

  await t.step('Paste plain text with Cmd+V, then with Cmd+Shift+V', 'both land the clipboard text in the body', async () => {
    await backToEditor();
    const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
    if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
    await sleep(400);
    await page.evaluate(() => navigator.clipboard.writeText('PASTED'));
    const on = await t.openRun(deck.bodyRun);
    await t.press('End');
    await t.press('Meta+v');
    await sleep(800);
    const afterV = (await t.runInfo(deck.bodyRun))?.text;
    await t.press('Meta+Shift+v');
    await sleep(800);
    const afterShiftV = (await t.runInfo(deck.bodyRun))?.text;
    const snack = await t.snackbar();
    await t.press('Escape', 2);
    await t.settled();
    return { ok: on && /PASTED/.test(afterV ?? '') && (afterShiftV ?? '').split('PASTED').length === 3, observed: `session ${on}; after Cmd+V "${afterV?.slice(0, 120)}"; after Cmd+Shift+V "${afterShiftV?.slice(0, 120)}"; snackbar "${snack}"` };
  });

  table.record('console errors of the run', 'recorded', `${consoleErrors.length}: ${consoleErrors.slice(0, 5).join(' || ')}`, true);
} finally {
  if (deck?.id) await cleanupDeck(t, deck.id, context);
  await browser.close().catch(() => undefined);
  const out = table.finish({ deck: deck?.id ?? null, consoleErrors: consoleErrors.slice(0, 60) });
  writeFileSync(path.join(EVIDENCE, 'surface2-console.json'), JSON.stringify(consoleErrors, null, 2));
  process.exitCode = out.failed > 0 ? 1 : 0;
}
