// Fixer probe: does the name prompt close on Escape after a first inline edit (realtime.spec endEdit)?
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:4331';
const browser = await chromium.launch();
const ready = async (p) => {
  await p.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 90_000 },
  );
  await p.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const inv = (p, id, input) =>
  p.evaluate(([i, v]) => window.turboslide.studio.invoke(i, v), [id, input]);
const S = await (await browser.newContext()).newPage();
await S.goto(`${base}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
await ready(S);
const copy = `fix-prompt-${Date.now().toString(36)}`;
await inv(S, 'deck.copy', {
  id: 'gt-brand',
  name: 'Prompt probe',
  newId: copy,
  baseRevision: (await inv(S, 'deck.info')).revision,
});
const A = await (await browser.newContext()).newPage();
await A.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
await ready(A);
await inv(A, 'view.goto', { slideId: 'content-rule' });
await A.waitForSelector('.pt-viewer[data-active="content-rule"]');
const run = A.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="p1/text"]');
const box = await run.boundingBox();
await A.mouse.click(box.x + 8, box.y + 8);
await A.waitForSelector(
  '.ts-stagewrap.ts-editor .pt-slide [data-run="p1/text"][contenteditable="true"]',
);
await A.keyboard.type(' probe', { delay: 20 });
await A.keyboard.press('Escape');
const prompt = A.locator('[data-control="dialog.namePrompt"]');
const opened = await prompt
  .waitFor({ state: 'visible', timeout: 3000 })
  .then(() => true)
  .catch(() => false);
console.log('prompt opened after the edit:', opened);
if (opened) {
  console.log(
    'prompt controls:',
    (
      await prompt
        .locator('[data-control]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-control')))
    ).join(', '),
  );
  console.log(
    'active element:',
    await A.evaluate(
      () => document.activeElement?.getAttribute('data-control') ?? document.activeElement?.tagName,
    ),
  );
  await A.keyboard.press('Escape');
  const hidden = await prompt
    .waitFor({ state: 'hidden', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  console.log('hidden after Escape:', hidden);
  if (!hidden) {
    await prompt.focus().catch(() => undefined);
    await A.keyboard.press('Escape');
    console.log(
      'hidden after focusing the dialog and Escape:',
      await prompt
        .waitFor({ state: 'hidden', timeout: 2000 })
        .then(() => true)
        .catch(() => false),
    );
  }
}
await inv(A, 'deck.trash', { id: copy, baseRevision: (await inv(A, 'deck.info')).revision }).catch(
  () => undefined,
);
await browser.close();
