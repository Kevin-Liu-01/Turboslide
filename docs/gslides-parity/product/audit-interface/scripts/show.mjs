// The in place show on a fresh deck with no key pressed before it: does the show raise a
// snackbar on entry, and does its bar show on a pointer move over the sheet. Own deck, destroyed.
//   node show.mjs
import {
  SCRATCH,
  chromium,
  clickControl,
  createDeck,
  destroyDeck,
  dismissPrompts,
  moveHuman,
  newContext,
  shot,
  sleep,
} from './lib.mjs';

const browser = await chromium.launch({ headless: true });
let deckId = null;
const STORAGE = `${SCRATCH}/show-storage.json`;
try {
  const context = await newContext(browser, { width: 1440, height: 900, theme: 'light' });
  const page = await context.newPage();
  deckId = await createDeck(page, 'Show check');
  await context.storageState({ path: STORAGE });
  await dismissPrompts(page);
  await sleep(3000);
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-snackbar.is-on')].map((e) => e.textContent.trim()),
  );
  await clickControl(page, 'present.open');
  const t0 = Date.now();
  const samples = [];
  for (let i = 0; i < 12; i += 1) {
    await sleep(250);
    samples.push(
      await page.evaluate(
        (t) => ({
          t,
          snack: [...document.querySelectorAll('.ts-snackbar.is-on')].map((e) =>
            e.textContent.trim(),
          ),
          bar: (() => {
            const b = document.querySelector('.ts-present-bar');
            return b ? getComputedStyle(b).opacity : null;
          })(),
        }),
        Date.now() - t0,
      ),
    );
  }
  await shot(page, '1440-light-show-entry');
  // a pointer move over the sheet, then over the bottom edge
  await moveHuman(page, { x: 300, y: 300 }, { x: 900, y: 500 }, 10);
  await sleep(500);
  const afterSheetMove = await page.evaluate(() => ({
    bar: getComputedStyle(document.querySelector('.ts-present-bar'))?.opacity,
    snack: [...document.querySelectorAll('.ts-snackbar.is-on')].map((e) => e.textContent.trim()),
  }));
  await shot(page, '1440-light-show-after-move');
  await moveHuman(page, { x: 900, y: 500 }, { x: 200, y: 880 }, 10);
  await sleep(500);
  const afterBottomMove = await page.evaluate(() => ({
    bar: getComputedStyle(document.querySelector('.ts-present-bar'))?.opacity,
    box: document.querySelector('.ts-present-bar')?.getBoundingClientRect().toJSON(),
  }));
  await sleep(3500);
  const later = await page.evaluate(() => ({
    bar: getComputedStyle(document.querySelector('.ts-present-bar'))?.opacity,
    snack: [...document.querySelectorAll('.ts-snackbar.is-on')].map((e) => e.textContent.trim()),
  }));
  console.log(JSON.stringify({ before, samples, afterSheetMove, afterBottomMove, later }, null, 1));
  await page.keyboard.press('Escape');
  await sleep(800);
  await context.close();
} finally {
  const context = await newContext(browser, {
    width: 1440,
    height: 900,
    theme: 'light',
    storageState: deckId ? STORAGE : null,
  });
  const page = await context.newPage();
  console.log(JSON.stringify(await destroyDeck(page, deckId)));
  await context.close();
  await browser.close();
}
