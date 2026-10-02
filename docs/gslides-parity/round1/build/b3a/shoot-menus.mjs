// B3a's pictures of the menus a push changes, at 1440 by 900 and 390 by 844 in both appearances.
// It opens /new (no write: the draft is made on its first edit, which this script never makes),
// sets the chrome's appearance through the product, opens each menu path and shoots the viewport.
//   node docs/gslides-parity/round1/build/b3a/shoot-menus.mjs --base <origin> --tag before|after \
//     --out <dir> [--layout old|new]
// `--layout old` walks the menus as they were before B3a#7 (View > Appearance), `new` as after it.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = opt('--base', 'http://localhost:4505');
const TAG = opt('--tag', 'after');
const LAYOUT = opt('--layout', 'new');
const OUT = opt('--out', new URL('.', import.meta.url).pathname + 'push7');
/* the surfaces B3a#7 changes by default; B3a#8 names its own with --only */
const ONLY = opt('--only', 'insert,tools,download,view');
mkdirSync(OUT, { recursive: true });
const load = () =>
  Number(execSync('sysctl -n vm.loadavg').toString().replace(/[{}]/g, '').trim().split(/\s+/)[0]);
if (load() >= 24) {
  console.error(`load ${load()}: not starting (the load rule)`);
  process.exit(3);
}
const APPEARANCE =
  LAYOUT === 'old'
    ? (mode) => ['view', 'view.appearance', `view.appearance.${mode}`]
    : (mode) => ['tools', 'tools.preferences', 'tools.preferences.appearance', `tools.preferences.appearance.${mode}`];
const SURFACES = {
  insert: ['insert', 'insert.image'],
  tools: LAYOUT === 'old' ? ['tools'] : ['tools', 'tools.preferences'],
  download: LAYOUT === 'old' ? ['file', 'file.download'] : ['file', 'file.download', 'file.download.more'],
  view: ['view'],
  file: ['file'],
  /* the Theme panel from the toolbar's Theme button (B3a#8), not a menu */
  theme: null,
};
const result = { base: BASE, tag: TAG, layout: LAYOUT, startedAt: new Date().toISOString(), loadAtStart: load(), shots: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 180_000 });
    await page.waitForTimeout(1500);
    const ctl = (id) => page.locator(`[data-control="${id}"]`).first();
    const escape = async () => {
      for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    };
    const open = async (menuId, ...rows) => {
      await escape();
      /* the phone editor folds the menu bar behind one Menus key (B3b's item 18, MenusKey.tsx):
         the key's menu lists the nine menus as rows `menus.<id>` */
      if (await ctl('toolbar.menus').isVisible().catch(() => false)) {
        await ctl('toolbar.menus').click();
        await page.locator('#ts-menu-menus').waitFor();
        await page.waitForTimeout(450);
        await ctl(`menu.menus.${menuId}`).hover();
        await page.waitForTimeout(450);
      } else {
        await ctl(`menubar.${menuId}`).click();
        await page.locator(`#ts-menu-${menuId}`).waitFor();
        /* the menu draws hidden until it has measured its place (Menu.tsx) */
        await page.waitForTimeout(450);
      }
      for (const row of rows) {
        await ctl(`menu.${row}`).hover();
        await page.waitForTimeout(450);
      }
    };
    for (const mode of ['light', 'dark']) {
      const path = APPEARANCE(mode);
      try {
        await open(path[0], ...path.slice(1, -1));
        await ctl(`menu.${path[path.length - 1]}`).click();
        await page.waitForTimeout(500);
      } catch (e) {
        result.shots.push({ width, mode, error: `appearance: ${String(e).slice(0, 160)}` });
      }
      for (const [name, path] of Object.entries(SURFACES)) {
        if (!ONLY.split(',').includes(name)) continue;
        const file = `${OUT}/${name}-${width}-${mode}-${TAG}.jpg`;
        try {
          if (path === null) {
            await escape();
            /* the toolbar's Theme button, or Slide > Change theme where the toolbar folds it */
            if (await ctl('toolbar.theme').isVisible().catch(() => false))
              await ctl('toolbar.theme').click({ timeout: 4000 }).catch(async () => {
                await open('slide');
                await ctl('menu.slide.changeTheme').click();
              });
            else {
              await open('slide');
              await ctl('menu.slide.changeTheme').click();
            }
            await page.locator('.ts-rpanel [data-control="panel.brand"]').first().waitFor();
            await page.waitForTimeout(500);
          } else await open(path[0], ...path.slice(1));
          await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
          result.shots.push({ name, width, mode, file: file.split('/').pop(), theme: await page.evaluate(() => document.documentElement.getAttribute('data-theme')) });
          if (path === null) await ctl('panel.brand.close').click({ timeout: 3000 }).catch(() => undefined);
        } catch (e) {
          await page.screenshot({ path: file, type: 'jpeg', quality: 70 }).catch(() => undefined);
          result.shots.push({ name, width, mode, error: String(e).slice(0, 200) });
        }
      }
      await escape();
    }
    const back = APPEARANCE('light');
    await open(back[0], ...back.slice(1, -1)).catch(() => undefined);
    await ctl(`menu.${back[back.length - 1]}`).click().catch(() => undefined);
    await context.close();
  }
} finally {
  result.endedAt = new Date().toISOString();
  result.loadAtEnd = load();
  writeFileSync(`${OUT}/shots-${TAG}.json`, JSON.stringify(result, null, 1));
  await browser.close();
  console.log(JSON.stringify(result.shots.filter((s) => s.error)), 'load', result.loadAtStart, result.loadAtEnd);
}
