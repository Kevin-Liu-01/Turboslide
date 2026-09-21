// B2 text rows on the dev server: link detection, the address double click, Shift+Home, the link
// popover with Apply, Remove, the chip and a slide target, the show's jump, autofit grow and shrink,
// Find and replace's count. Human speed, the window API for setup.
import { launch, bind, sleep } from './lib.mjs';

const { browser, page, consoleErrors } = await launch();
const t = bind(page, 'drive-text');
const errorsSince = (n) => consoleErrors.slice(n).filter((e) => !/CSP|Content Security|Fast Refresh|hmr|\[vite\]|\[Server\]/i.test(e));
try {
  const deck = await t.newDeck();
  console.log('deck', deck.id);
  const S = await t.setupSlide(deck.titleSlide, 'blank');
  const S3 = await t.setupSlide(S, 'blank');
  await t.gotoSlide(S);

  const runOf = async (id) => (await t.runsOfBlock(id))[0];
  const openBox = async (id) => {
    const run = await runOf(id);
    const info = await t.runInfo(run);
    await t.dblclickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
    return run;
  };
  const html = async (run) => (await t.runInfo(run)).html;
  const stored = async (id) => (await t.blockOf(S, id))?.block.text ?? null;

  // ---- link detection
  await t.placeBlock(S, { id: 'tb-link', type: 'text', text: '', pos: { x: 200, y: 200, w: 700, h: 60, z: 5 } });
  await t.step('text.link.detect-url: typing generaltranslation.com then a space wraps a link; one Cmd+Z removes it and keeps the text', 'a link, then plain text', async () => {
    const run = await openBox('tb-link');
    await t.typeHuman('Visit generaltranslation.com');
    await sleep(300);
    await t.typeHuman(' ');
    await sleep(500);
    const linked = await html(run);
    await t.typeHuman('today');
    await sleep(700);
    const afterMore = await html(run);
    const storedBefore = await stored('tb-link');
    // a second box: the address, the space, then one Cmd+Z at once
    await t.press('Escape');
    await sleep(300);
    await t.placeBlock(S, { id: 'tb-link-2', type: 'text', text: '', pos: { x: 950, y: 200, w: 500, h: 60, z: 11 } });
    const run2 = await openBox('tb-link-2');
    await t.typeHuman('See acme.com ');
    await sleep(700);
    const linked2 = await stored('tb-link-2');
    await t.press('Meta+z');
    await sleep(800);
    const undone = await stored('tb-link-2');
    return {
      ok: /<a href="https:\/\/generaltranslation\.com"[^>]*>generaltranslation\.com<\/a>/.test(linked) && /<\/a>(&nbsp;| |\u00a0)today/.test(afterMore) && /\(https:\/\/generaltranslation\.com\) today$/.test(storedBefore ?? '') && /\[acme\.com\]\(https:\/\/acme\.com\)/.test(linked2 ?? '') && undone === 'See acme.com',
      observed: `linked html ${linked.slice(0, 200)} | after typing ${afterMore.slice(0, 200)} | stored ${JSON.stringify(storedBefore)} | second box stored ${JSON.stringify(linked2)} | after Cmd+Z ${JSON.stringify(undone)}`,
    };
  });
  await t.press('Escape');
  await sleep(300);

  await t.step('text.link.detect-email: an email then Enter wraps a mailto link', 'a mailto link', async () => {
    await t.placeBlock(S, { id: 'tb-mail', type: 'text', text: '', pos: { x: 200, y: 300, w: 700, h: 60, z: 6 } });
    const run = await openBox('tb-mail');
    await t.typeHuman('Write to kevin@generaltranslation.com');
    await sleep(300);
    await t.press('Enter');
    await sleep(300);
    await t.typeHuman('any time');
    await sleep(700);
    const h = await html(run);
    await t.press('Escape');
    await sleep(500);
    const s = await stored('tb-mail');
    return { ok: /<a href="mailto:kevin@generaltranslation\.com"[^>]*>kevin@generaltranslation\.com<\/a>/.test(h) && /any time/.test(s ?? '') && !/any time\]\(/.test(s ?? ''), observed: `html ${h.slice(0, 260)} | stored ${s}` };
  });

  // ---- shift home and the address double click on three lines
  await t.placeBlock(S, { id: 'tb-lines', type: 'text', text: '', autofit: 'grow', pos: { x: 200, y: 420, w: 600, h: 48, z: 7 } });
  await t.step('text.select.shift-home-line: Shift+Home on the third line selects that line alone', 'one line', async () => {
    const run = await openBox('tb-lines');
    await t.typeHuman('Kevin Liu, founder');
    await t.press('Enter');
    await t.typeHuman('kevin@generaltranslation.com');
    await t.press('Enter');
    await t.typeHuman('generaltranslation.com');
    await sleep(400);
    await t.press('Shift+Home');
    const sel = await t.selectionText();
    await t.press('ArrowRight');
    await t.press('Home');
    await t.press('Shift+End');
    const sel2 = await t.selectionText();
    return { ok: sel.trim() === 'generaltranslation.com' && sel2.trim() === 'generaltranslation.com', observed: `Shift+Home "${sel}"; Home, Shift+End "${sel2}"` };
  });
  await t.step('text.select.double-click-address: a double click on generaltranslation.com selects the whole address', 'the address', async () => {
    const run = await runOf('tb-lines');
    const point = await page.evaluate((r) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const v = node.nodeValue;
        const i = v.indexOf('generaltranslation.com');
        if (i >= 0 && !v.includes('@')) {
          const range = document.createRange();
          range.setStart(node, i + 3); range.setEnd(node, i + 4);
          const b = range.getBoundingClientRect();
          return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        }
      }
      return null;
    }, run);
    await t.dblclickAt(point.x, point.y);
    await sleep(300);
    const sel = await t.selectionText();
    return { ok: sel.trim() === 'generaltranslation.com', observed: `selection "${sel}"` };
  });

  // ---- the popover
  await t.step('text.link.popover-apply-remove: Cmd+K shows the popover with Link, the text, the field, the slides select, Apply and Remove; Enter applies; the chip shows Change and Remove; Remove takes the link off', 'popover, chip, removal', async () => {
    const run = await runOf('tb-lines');
    // select the word "founder" by double click inside the open session
    const point = await page.evaluate((r) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const i = node.nodeValue.indexOf('founder');
        if (i >= 0) { const range = document.createRange(); range.setStart(node, i + 2); range.setEnd(node, i + 3); const b = range.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
      }
      return null;
    }, run);
    await t.dblclickAt(point.x, point.y);
    await sleep(200);
    const word = await t.selectionText();
    await page.keyboard.press('Meta+k');
    await sleep(400);
    const parts = await page.evaluate(() => {
      const pop = document.querySelector('[data-control="popover.link"]');
      if (!pop) return null;
      return {
        label: pop.querySelector('.ts-link-pop-label')?.textContent,
        text: pop.querySelector('[data-control="popover.link.text"]')?.textContent,
        url: Boolean(pop.querySelector('[data-control="popover.link.url"]')),
        slide: [...pop.querySelectorAll('[data-control="popover.link.slide"] option')].map((o) => o.textContent).slice(0, 6),
        apply: Boolean(pop.querySelector('[data-control="popover.link.apply"]')),
        remove: Boolean(pop.querySelector('[data-control="popover.link.remove"]')),
        focused: document.activeElement?.getAttribute('data-control'),
      };
    });
    await t.shot('popover');
    await t.typeHuman('example.com/acme');
    await t.press('Enter');
    await sleep(600);
    const h1 = await html(run);
    // the chip: click inside the linked word
    const linkPoint = await page.evaluate((r) => {
      const a = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"] a`);
      if (!a) return null;
      const b = a.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, run);
    await t.clickAt(linkPoint.x, linkPoint.y);
    await sleep(400);
    const chip = await page.evaluate(() => {
      const c = document.querySelector('[data-control="chip.link"]');
      return c ? { href: c.querySelector('[data-control="chip.link.href"]')?.textContent, change: Boolean(c.querySelector('[data-control="chip.link.change"]')), remove: Boolean(c.querySelector('[data-control="chip.link.remove"]')) } : null;
    });
    await t.shot('chip');
    if (chip) await t.clickControl('chip.link.remove');
    await sleep(600);
    const h2 = await html(run);
    const chipGone = !(await t.has('[data-control="chip.link"]'));
    return {
      ok: parts !== null && parts.label === 'Link' && (parts.text ?? '').includes('founder') && parts.url && parts.apply && parts.remove && parts.slide.length >= 5 && parts.focused === 'popover.link.url' && /<a href="https:\/\/example\.com\/acme"[^>]*>founder<\/a>/.test(h1) && chip !== null && chip.change && chip.remove && /example\.com\/acme/.test(chip.href ?? '') && !/<a [^>]*>founder<\/a>/.test(h2) && /Kevin Liu, founder<\/span>/.test(h2) && chipGone,
      observed: `word "${word}"; popover ${JSON.stringify(parts)}; after Enter ${h1.slice(0, 200)}; chip ${JSON.stringify(chip)}; after Remove ${h2.slice(0, 160)}; chip gone ${chipGone}`,
    };
  });

  await t.step('text.link.slide-target: Slides in this presentation > slide 3 writes a slide link; the show jumps to it on a click', 'a #s link and the jump', async () => {
    const run = await runOf('tb-lines');
    // select "Kevin" and Cmd+K
    const point = await page.evaluate((r) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) { const i = node.nodeValue.indexOf('Kevin'); if (i >= 0) { const range = document.createRange(); range.setStart(node, i + 1); range.setEnd(node, i + 2); const b = range.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } }
      return null;
    }, run);
    await t.dblclickAt(point.x, point.y);
    await sleep(200);
    await page.keyboard.press('Meta+k');
    await sleep(400);
    const options = await page.evaluate(() => [...document.querySelectorAll('[data-control="popover.link.slide"] option')].map((o) => ({ v: o.value, t: o.textContent })));
    const third = options.find((o) => o.t.startsWith('3.'));
    await page.selectOption('[data-control="popover.link.slide"]', third.v);
    await sleep(200);
    await t.clickControl('popover.link.apply');
    await sleep(700);
    const h = await html(run);
    await t.press('Escape');
    await sleep(400);
    const s = await stored('tb-lines');
    // the show
    await t.press('Escape');
    await t.clickControl('present.open').catch(async () => { await t.invoke('view.present', { on: true }); });
    await sleep(1200);
    const showing = await t.has('[data-control="present.show"]');
    const linkInShow = await page.evaluate(() => {
      const a = document.querySelector('.ts-slideshow a[href^="#s/"], .pt-slide a[href^="#s/"]');
      if (!a) return null;
      const b = a.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, href: a.getAttribute('href'), target: a.getAttribute('target') };
    });
    let active = null;
    if (linkInShow) {
      await t.clickAt(linkInShow.x, linkInShow.y);
      await sleep(900);
      active = await page.evaluate(() => document.querySelector('[data-control="present.show"]')?.getAttribute('data-slide-id') ?? null);
    }
    await t.shot('show-after-link');
    await t.press('Escape');
    await sleep(600);
    return { ok: /href="#s\/[^"]+"/.test(h) && new RegExp(`#s/${S3}`).test(s ?? '') && showing && linkInShow !== null && linkInShow.target === null && active === S3, observed: `third option ${JSON.stringify(third)}; html ${h.slice(0, 160)}; stored ${s}; show ${showing}; link ${JSON.stringify(linkInShow)}; active after click ${active} (want ${S3})` };
  });

  // ---- autofit grow, live frame
  await t.gotoSlide(S);
  await t.step('text.autofit.textbox-grow: the frame follows the text while typing and the stored height holds it', 'no overflow during and after', async () => {
    await t.clearAll();
    const box = await t.placeBlock(S, { id: 'tb-grow', type: 'text', text: '', autofit: 'grow', pos: { x: 900, y: 500, w: 340, h: 48, z: 8 } });
    const run = await openBox(box.id);
    const para = 'The renewal terms apply to every seat in the workspace from the first day of the next quarter, with the discount held for two years and the support tier unchanged.';
    await t.typeHuman(para);
    await sleep(600);
    const live = await page.evaluate((id) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      const free = el?.closest('.free');
      const r = free?.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(el);
      const bottom = Math.max(...[...range.getClientRects()].map((x) => x.bottom));
      const ring = document.querySelector('.ts-overlay .ts-select.is-selected')?.getBoundingClientRect();
      return { frameH: r?.height, overflow: bottom - r.bottom, ringH: ring?.height ?? null };
    }, box.id);
    await t.press('Escape');
    await sleep(800);
    await t.settled();
    const after = await t.blockOf(S, box.id);
    const drawn = await t.boxOf(box.id);
    return { ok: live.overflow < 2 && after.pos.h > 100 && drawn.free.h > 60, observed: `live ${JSON.stringify(live)}; stored h ${after.pos.h}; drawn free h ${drawn.free.h}` };
  });

  await t.step('text.autofit.shrink-on-overflow: with Shrink text on overflow a small box steps the size down until the text fits', 'the size steps down; no overflow', async () => {
    await t.clearAll();
    const box = await t.placeBlock(S, { id: 'tb-shrink', type: 'text', text: '', autofit: 'shrink', typography: { size: 22 }, pos: { x: 900, y: 300, w: 340, h: 90, z: 9 } });
    const run = await openBox(box.id);
    const para = 'Every seat in the workspace renews on the first day of the next quarter and the discount holds for two more years.';
    await t.typeHuman(para);
    await sleep(700);
    await t.press('Escape');
    await sleep(800);
    await t.settled();
    const after = await t.blockOf(S, box.id);
    const read = await page.evaluate((id) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      const free = el?.closest('.free');
      const r = free?.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(el);
      const bottom = Math.max(...[...range.getClientRects()].map((x) => x.bottom));
      return { font: getComputedStyle(el).fontSize, overflow: bottom - r.bottom };
    }, box.id);
    return { ok: (after.block.typography?.size ?? 22) < 22 && read.overflow < 4, observed: `stored size ${after.block.typography?.size}; drawn ${JSON.stringify(read)}` };
  });

  // ---- find and replace count
  await t.step('text.find-replace.count-while-typing: typing Acme reads "1 of 2"; Next moves the selection to the second', 'the count and the step', async () => {
    await t.clearAll();
    await t.placeBlock(S, { id: 'tb-acme', type: 'text', text: 'Acme renews in Q3', pos: { x: 200, y: 700, w: 500, h: 48, z: 10 } });
    await t.gotoSlide(S3);
    await t.placeBlock(S3, { id: 'tb-acme-2', type: 'text', text: 'Pricing for Acme', pos: { x: 200, y: 200, w: 500, h: 48, z: 1 } });
    await t.gotoSlide(S);
    await t.clearAll();
    await page.keyboard.press('Meta+Shift+h');
    await page.waitForSelector('[data-control="dialog.findReplace"]', { timeout: 6000 });
    await t.typeHuman('Acme');
    await sleep(400);
    const count1 = await page.evaluate(() => document.querySelector('[data-control="dialog.findReplace.count"]')?.textContent ?? null);
    // three matches: acme.com (tb-link-2) and Acme (tb-acme) on this slide, Acme on slide 3
    await t.clickControl('dialog.findReplace.next');
    await sleep(900);
    const count2 = await page.evaluate(() => document.querySelector('[data-control="dialog.findReplace.count"]')?.textContent ?? null);
    const st2 = await t.state();
    await t.clickControl('dialog.findReplace.next');
    await sleep(1200);
    const count3 = await page.evaluate(() => document.querySelector('[data-control="dialog.findReplace.count"]')?.textContent ?? null);
    const st3 = await t.state();
    await t.shot('find-replace');
    await t.press('Escape');
    return { ok: count1 === '1 of 3' && count2 === '2 of 3' && st2.blockId === 'tb-acme' && count3 === '3 of 3' && st3.slideId === S3 && st3.blockId === 'tb-acme-2', observed: `count ${count1} -> ${count2} -> ${count3}; after Next: slide ${st2.slideId} block ${st2.blockId}; after Next: slide ${st3.slideId} (want ${S3}) block ${st3.blockId}` };
  });

  const errs = errorsSince(0);
  t.record('console errors during the text drive', 'none', errs.join(' | ') || 'none', errs.length === 0);
  t.finish();
} finally {
  await browser.close();
}
