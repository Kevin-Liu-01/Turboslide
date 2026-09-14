#!/usr/bin/env node
// Three rows of the second verifier pass that the walks read weakly: VERIFICATION-3 finding 24
// (after `account.setName` the own chip keeps the label), the one prompt of SPEC-3 7.2 as the
// fix round rebuilt it (a floating card with no scrim: does it take focus, does the menu bar
// answer a click while it is open, does Esc close it, does Continue record the name), and the
// Forget this browser dialog of 7.4 (the confirm, the new label after the reload). One browser
// page on a one slide copy of gt-brand made through the window API; the copy is trashed and
// removed at the end.
//   node name-and-prompt-probe.mjs [--base http://localhost:4336] [--out <json>]
import { writeFileSync } from 'node:fs';

import { launchBrowser } from '../../../../packages/headless/src/launch.ts';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = value('base', 'http://localhost:4336').replace(/\/$/, '');
const OUT = value('out', null);
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const headers = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const rows = [];
const step = (name, ok, evidence) => {
  rows.push({ name, ok, evidence });
  console.log(
    `${ok ? 'ok  ' : ok === null ? 'note' : 'FAIL'} ${name}: ${String(evidence).slice(0, 400).replace(/\s+/g, ' ')}`,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const settled = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const chipTip = (page) =>
  page
    .$eval('[data-control="title.account"]', (el) => el.getAttribute('data-tip'))
    .catch(() => null);

const launched = await launchBrowser({ probeRenderer: false });
const context = await launched.browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: headers,
});
const page = await context.newPage();
await page.goto(`${BASE}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
await settled(page);
const info = await invoke(page, 'deck.info');
const slides = await invoke(page, 'slide.list');
const list = Array.isArray(slides) ? slides : slides.slides;
const text = list.find((s) => s.kind === 'title' || s.id === 'title') ?? list[1] ?? list[0];
const scratch = `verifier-name-${Date.now().toString(36)}`;
await invoke(page, 'deck.copy', {
  id: 'gt-brand',
  name: 'Verifier name probe',
  newId: scratch,
  slideIds: [text.id],
  baseRevision: info.revision,
});
await page.goto(`${BASE}/edit/${scratch}`, { waitUntil: 'domcontentloaded' });
await settled(page);
step('scratch deck', true, `${scratch} from gt-brand's ${text.id}`);

// 1. finding 24: setName then the own chip and the roster
const before = await chipTip(page);
const named = await invoke(page, 'account.setName', { name: 'Maya' }).catch((e) => ({
  error: String(e).slice(0, 160),
}));
await sleep(1500);
const after = await chipTip(page);
const st = await state(page);
await page.click('[data-control="title.account"]');
await sleep(300);
const menuName = await page
  .$eval('#ts-menu-account', (el) => el.textContent.replace(/\s+/g, ' ').trim())
  .catch(() => null);
await page.keyboard.press('Escape');
step(
  'finding 24: the own chip shows the typed name after account.setName (7.8: a typed name with guest)',
  after !== null && /Maya/.test(after),
  `chip before "${before}", after "${after}"; setName answered ${JSON.stringify(named).slice(0, 160)}; state.account ${JSON.stringify({ label: st.account?.label, name: st.account?.name, trust: st.account?.trust })}; the own menu reads "${menuName}"`,
);
const rosterOwn = await page
  .$eval(
    '[data-control="title.presence.me"]',
    (el) => `${el.getAttribute('data-tip') ?? ''} | ${el.textContent.replace(/\s+/g, ' ').trim()}`,
  )
  .catch(() => null);
step(
  'finding 24: the own presence chip after setName',
  rosterOwn !== null && /Maya/.test(rosterOwn),
  `own presence chip "${rosterOwn}"`,
);
await page.reload({ waitUntil: 'domcontentloaded' });
await settled(page);
const afterReload = await chipTip(page);
step(
  'finding 24: the typed name survives a reload',
  afterReload !== null && /Maya/.test(afterReload),
  `chip after reload "${afterReload}"`,
);

// 2. the one prompt: a fresh context types once
const context2 = await launched.browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: headers,
});
const p2 = await context2.newPage();
await p2.goto(`${BASE}/edit/${scratch}`, { waitUntil: 'domcontentloaded' });
await settled(p2);
const promptOnOpen = await p2.$('[data-control="dialog.namePrompt"]');
step(
  '7.2: no prompt on open',
  promptOnOpen === null,
  promptOnOpen === null ? 'absent' : 'present on open',
);
// type into the first text block through the canvas: a Title and body slide made through
// slide.new (the copied kind slides carry fixed fields, no slots), as the two browser walk does
const st0 = await state(p2);
await invoke(p2, 'slide.new', {
  layout: 'split',
  after: st0.slideId,
  baseRevision: st0.revision,
}).catch((e) => step('slide.new split', false, String(e).slice(0, 160)));
await sleep(800);
const list2 = await invoke(p2, 'slide.list');
const rows2 = Array.isArray(list2) ? list2 : list2.slides;
const target =
  rows2.find((r) => r.template === 'split' || r.layout === 'split') ??
  rows2.find((r) => r.id !== rows2[0].id) ??
  rows2[0];
await invoke(p2, 'view.goto', { slideId: target.id });
await sleep(500);
const slide = await invoke(p2, 'slide.get', { slideId: target.id });
const block = Object.values(slide.slide.slots ?? {})
  .flat()
  .find(
    (b) => typeof b.text === 'string' && ['heading', 'paragraph', 'text', 'box'].includes(b.type),
  );
const box = block ? await p2.$(`.ts-stagewrap .pt-slide [data-block="${block.id}"]`) : null;
if (!box)
  step(
    'a text block to type in',
    false,
    `no text block on ${target.id}: ${JSON.stringify(Object.keys(slide.slide.slots ?? {}))}`,
  );
else {
  await box.dblclick();
  await sleep(300);
  await p2.keyboard.type('hello from the probe');
  await sleep(200);
  await p2.keyboard.press('Escape');
  const shown = await p2
    .waitForSelector('[data-control="dialog.namePrompt"]', { timeout: 6000 })
    .catch(() => null);
  const shell = shown
    ? await p2.evaluate(() => {
        const card = document.querySelector('[data-control="dialog.namePrompt"]');
        const dialog = card.closest('.ts-dialog') ?? card;
        const wrap = dialog.parentElement;
        const r = dialog.getBoundingClientRect();
        return {
          wrapClass: wrap?.className ?? '',
          ariaModal: dialog.getAttribute('aria-modal'),
          focusInside: dialog.contains(document.activeElement),
          activeTag:
            document.activeElement?.tagName +
            (document.activeElement?.getAttribute('data-control')
              ? `[${document.activeElement.getAttribute('data-control')}]`
              : ''),
          box: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            vw: window.innerWidth,
            vh: window.innerHeight,
          },
          title: dialog.querySelector('.ts-dialog-title')?.textContent ?? '',
        };
      })
    : null;
  step(
    '7.2: the prompt opens after the first inline session ends',
    shown !== null,
    shown ? JSON.stringify(shell) : 'no prompt within 6 s',
  );
  if (shown) {
    step(
      'the prompt is a floating card with no scrim and takes no focus (fix round deviation 1)',
      /ts-dialog-float/.test(shell.wrapClass) &&
        shell.ariaModal === null &&
        shell.focusInside === false,
      `wrapper ${shell.wrapClass}; aria-modal ${shell.ariaModal}; focus inside ${shell.focusInside}; active ${shell.activeTag}; box ${JSON.stringify(shell.box)}`,
    );
    const t0 = Date.now();
    await p2.click('button[data-control="menubar.file"]', { timeout: 5000 }).catch(() => null);
    const menu = await p2
      .waitForSelector('[role="menu"] [data-menu-item]', { timeout: 3000 })
      .catch(() => null);
    step(
      'the menu bar answers a click while the prompt is open (finding 8)',
      menu !== null,
      `File menu ${menu ? 'open' : 'not open'} after ${Date.now() - t0} ms`,
    );
    await p2.keyboard.press('Escape');
    await sleep(200);
    const stillOpen = await p2.$('[data-control="dialog.namePrompt"]');
    step(
      'Esc on the menu leaves the prompt as it was, or closes it',
      true,
      `prompt ${stillOpen ? 'still open' : 'closed by the Esc that closed the menu'}`,
    );
    if (stillOpen) {
      await p2.fill('[data-control="dialog.namePrompt.name"]', 'Probe Person');
      await p2.click('[data-control="dialog.namePrompt.continue"]');
      const gone = await p2
        .waitForFunction(
          () => document.querySelector('[data-control="dialog.namePrompt"]') === null,
          null,
          { timeout: 5000 },
        )
        .then(
          () => true,
          () => false,
        );
      await sleep(800);
      const st2 = await state(p2);
      const tip2 = await chipTip(p2);
      step(
        'Continue records the name and closes the card',
        gone && /Probe Person/.test(tip2 ?? ''),
        `closed ${gone}; chip "${tip2}"; state.account ${JSON.stringify({ label: st2.account?.label, name: st2.account?.name, trust: st2.account?.trust })}`,
      );
    }
    // once only: a second inline session shows no prompt (the block is queried again: the card's
    // close re-renders the stage)
    const box2 = await p2.$(`.ts-stagewrap .pt-slide [data-block="${block.id}"]`);
    if (box2) await box2.dblclick();
    await sleep(200);
    await p2.keyboard.type(' again');
    await p2.keyboard.press('Escape');
    await sleep(1500);
    const again = await p2.$('[data-control="dialog.namePrompt"]');
    step(
      '7.2: the prompt is one prompt (no second time)',
      again === null,
      again === null ? 'absent after a second session' : 'shown again',
    );
  }
}

// 3. Forget this browser through the chrome
const principalBefore = (await state(p2)).account?.principalId ?? null;
await p2.click('[data-control="title.account"]');
await sleep(300);
await p2.click('[data-menu-item="title.account.forget"]').catch(() => null);
const confirm = await p2
  .waitForSelector('[data-control="dialog.forgetBrowser"]', { timeout: 4000 })
  .catch(() => null);
const lead = confirm
  ? await p2.$eval(
      '[data-control="dialog.forgetBrowser"] .ts-dialog-lead, [data-control="dialog.forgetBrowser"]',
      (e) => e.textContent.replace(/\s+/g, ' ').trim(),
    )
  : null;
step(
  '7.4: Forget this browser asks first with ACCOUNT.forgetConfirm (fix round deviation 2)',
  confirm !== null,
  lead ? `"${lead.slice(0, 200)}"` : 'no forgetBrowser dialog',
);
if (confirm) {
  await p2.click('[data-control="dialog.forgetBrowser.confirm"]');
  await p2
    .waitForFunction(
      (before) => {
        try {
          return window.turboslide?.studio?.describe().state.account?.principalId !== before;
        } catch {
          return false;
        }
      },
      principalBefore,
      { timeout: 30_000 },
    )
    .catch(() => null);
  await settled(p2).catch(() => null);
  await sleep(1000);
  const st3 = await state(p2).catch(() => ({}));
  const tip3 = await chipTip(p2);
  step(
    'Forget mints a new principal and label, and the page reloads as the new visitor',
    st3.account?.principalId !== principalBefore && tip3 !== null && !/Probe Person/.test(tip3),
    `principal ${principalBefore?.slice(0, 13)}… -> ${st3.account?.principalId?.slice(0, 13)}…; chip "${tip3}"`,
  );
}
await context2.close();
// cleanup through the first page (the owner)
const info2 = await invoke(page, 'deck.info');
await invoke(page, 'deck.trash', { id: scratch, baseRevision: info2.revision }).catch(() => null);
const info3 = await invoke(page, 'deck.info').catch(() => info2);
await invoke(page, 'deck.remove', {
  id: scratch,
  confirm: true,
  baseRevision: info3.revision,
}).catch((e) => step('cleanup', false, String(e).slice(0, 160)));
step('cleanup', true, `${scratch} trashed and removed`);
await launched.browser.close();
const fails = rows.filter((r) => r.ok === false).length;
console.log(`name and prompt probe: ${rows.filter((r) => r.ok === true).length} ok, ${fails} fail`);
if (OUT)
  writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), rows }, null, 2));
process.exit(fails > 0 ? 1 : 0);
