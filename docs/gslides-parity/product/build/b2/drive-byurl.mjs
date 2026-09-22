// Image by URL alone: the switch, the row, the paused preview and the centred insert.
import { launch, bind, sleep } from './lib.mjs';

const { browser, page } = await launch();
const t = bind(page, 'drive-byurl');
try {
  const deck = await t.newDeck();
  const S = await t.setupSlide(deck.titleSlide, 'blank');
  await t.gotoSlide(S);
  const pic = await t.placePicture(S, { x: 400, y: 250, w: 240, h: 160 });
  const address = `${page.url().split('/edit/')[0]}/decks/${deck.id}/assets/${pic.block.asset}.png`;
  await t.clearAll();
  await t.step(
    'Tools > Advanced tools turns the switch on',
    'settings.advancedTools true',
    async () => {
      const before = (await t.state()).settings;
      await t.openMenu('tools');
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('#ts-menu-tools [data-control^="menu."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      await t.clickRow('tools.advancedTools');
      await sleep(500);
      const menuOpen = await t.has('#ts-menu-tools');
      await t.press('Escape', 2);
      await sleep(300);
      const after = (await t.state()).settings;
      return {
        ok: after?.advancedTools === true,
        observed: `before ${JSON.stringify(before)}; rows ${rows.join(',')}; menu still open after the click ${menuOpen}; after ${JSON.stringify(after)}`,
      };
    },
  );
  await t.step(
    'images.insert.by-url: no fetch until the pause; Insert centres the picture, selected',
    'one fetch after the pause, a centred shot',
    async () => {
      const before = await t.objectIds(S);
      const requests = [];
      const onRequest = (req) => {
        if (req.url().startsWith(address.slice(0, 40)) && req.url().includes('/assets/'))
          requests.push(req.url());
      };
      page.on('request', onRequest);
      await t.openMenu('insert');
      await t.hoverRow('insert.image');
      await sleep(500);
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu.insert.image."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      if (!rows.includes('menu.insert.image.byUrl')) {
        await t.press('Escape', 2);
        page.off('request', onRequest);
        return { ok: false, observed: `no By URL row; rows ${rows.join(',')}` };
      }
      await t.clickRow('insert.image.byUrl');
      await page.waitForSelector('[data-control="dialog.imageByUrl.url"]', { timeout: 6000 });
      requests.length = 0;
      await t.typeHuman(address);
      const duringTyping = requests.length;
      await sleep(1000);
      const afterPause = requests.length;
      const previewShown = await t.has('[data-control="dialog.imageByUrl.preview"]');
      await t.shot('by-url-dialog');
      await t.clickControl('dialog.imageByUrl.ok');
      const obj = await t.newObjectAfter(S, before, 20_000);
      page.off('request', onRequest);
      await sleep(600);
      const chip = await t.chip();
      const dialogGone = !(await t.has('[data-control="dialog.imageByUrl"]'));
      const centred = obj
        ? Math.abs(obj.pos.x + obj.pos.w / 2 - (137 + 1326 / 2)) <= 1 &&
          Math.abs(obj.pos.y + obj.pos.h / 2 - (129 + 642 / 2)) <= 1
        : false;
      await t.shot('by-url-inserted');
      return {
        ok:
          duringTyping === 0 &&
          afterPause === 1 &&
          previewShown &&
          Boolean(obj) &&
          centred &&
          chip === 'Image' &&
          dialogGone,
        observed: `image requests during typing ${duringTyping}, after the pause ${afterPause}; preview ${previewShown}; ${obj ? `${obj.type} at ${JSON.stringify(obj.pos)}` : 'nothing'} centred ${centred}; chip ${chip}; dialog closed ${dialogGone}`,
      };
    },
  );
  await t.step(
    'Replace image > By URL swaps the selected picture and keeps its box',
    'asset swapped, pos kept',
    async () => {
      await t.clearAll();
      const before = await t.blockOf(S, pic.id);
      await t.selectObject(pic.id);
      await t.clickControl('toolbar.replaceImage');
      await sleep(400);
      const row = page.locator('[data-control="menu.format.image.replaceImage.byUrl"]').first();
      if (!(await row.isVisible().catch(() => false))) {
        await t.press('Escape', 2);
        return { ok: false, observed: 'no By URL row under Replace image' };
      }
      await row.click();
      await page.waitForSelector('[data-control="dialog.imageByUrl.url"]', { timeout: 6000 });
      const other = (await t.objectsOf(S)).find((o) => o.type === 'shot' && o.id !== pic.id);
      const address2 = `${page.url().split('/edit/')[0]}/decks/${deck.id}/assets/${other.block.asset}.png`;
      await t.typeHuman(address2);
      await sleep(900);
      await t.clickControl('dialog.imageByUrl.ok');
      const after = await t.pollUntil(
        () => t.blockOf(S, pic.id),
        (b) => b && b.block.asset !== before.block.asset,
        15_000,
      );
      const snack = await t.snackbar();
      return {
        ok:
          after &&
          after.block.asset !== before.block.asset &&
          JSON.stringify(after.pos) === JSON.stringify(before.pos),
        observed: `asset ${before.block.asset} -> ${after?.block.asset}; pos kept ${JSON.stringify(after?.pos) === JSON.stringify(before.pos)}; snackbar ${JSON.stringify(snack)}`,
      };
    },
  );
  await t.openMenu('tools');
  await t.clickRow('tools.advancedTools');
  await t.press('Escape', 2);
  t.finish();
} finally {
  await browser.close();
}
