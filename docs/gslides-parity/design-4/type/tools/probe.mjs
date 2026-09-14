import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const EXE =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  'file:///Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/type/home.html',
);
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll(
    'header, section, .editor-shot, footer, .card, .shot, img, svg',
  )) {
    const r = el.getBoundingClientRect();
    if (r.height > 900)
      out.push({
        tag: el.tagName,
        cls:
          el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className,
        h: Math.round(r.height),
        w: Math.round(r.width),
        src: el.getAttribute('src'),
      });
  }
  const imgs = [...document.images].map((i) => ({
    src: i.getAttribute('src').split('/').pop(),
    ok: i.complete && i.naturalWidth > 0,
    w: Math.round(i.getBoundingClientRect().width),
    h: Math.round(i.getBoundingClientRect().height),
  }));
  return {
    tall: out.slice(0, 20),
    imgs,
    fonts: document.fonts.check('500 20px "Inter Local"'),
    h: document.documentElement.scrollHeight,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
