import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto('https://turboslide.vercel.app/new', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const found = await page.evaluate(() => {
    const out = [];
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    const root = sheet ?? document.body;
    for (const el of root.querySelectorAll('*')) {
      for (const pseudo of ['::before', '::after']) {
        const c = getComputedStyle(el, pseudo).content;
        if (c && c !== 'none' && c !== 'normal' && /\//.test(c))
          out.push({
            pseudo,
            content: c,
            cls: el.className?.toString().slice(0, 60),
            tag: el.tagName,
            text: el.textContent?.trim().slice(0, 40),
          });
      }
      if (el.children.length === 0 && /^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(el.textContent ?? ''))
        out.push({
          text: el.textContent,
          cls: el.className?.toString().slice(0, 60),
          tag: el.tagName,
          shadow: false,
        });
    }
    // shadow roots and iframes inside the sheet
    const hosts = [...root.querySelectorAll('*')].filter((el) => el.shadowRoot).length;
    const frames = root.querySelectorAll('iframe').length;
    return {
      out: out.slice(0, 10),
      hosts,
      frames,
      sheetCls: sheet?.className,
      sheetText: (sheet?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200),
    };
  });
  console.log(JSON.stringify(found, null, 1));
  // the pixel region: what element sits at the sheet's bottom right corner
  const at = await page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    if (!sheet) return null;
    const r = sheet.getBoundingClientRect();
    const el = document.elementFromPoint(r.right - 60, r.bottom - 20);
    const chain = [];
    let cur = el;
    while (cur && chain.length < 6) {
      chain.push(
        `${cur.tagName.toLowerCase()}.${(cur.className?.toString() ?? '').slice(0, 50)}${cur.shadowRoot ? '[shadow]' : ''}`,
      );
      cur = cur.parentElement;
    }
    const inner = el?.shadowRoot ? el.shadowRoot.textContent?.slice(0, 100) : null;
    return {
      chain,
      text: el?.textContent?.slice(0, 60),
      inner,
      after: el ? getComputedStyle(el, '::after').content : null,
      before: el ? getComputedStyle(el, '::before').content : null,
    };
  });
  console.log(JSON.stringify(at, null, 1));
} finally {
  await browser.close();
}
