// The fonts audit walk on production (audit-fonts): a scratch deck from /new, the Inter faces the
// page loads (document.fonts, the preload entries, the woff2 responses before the ready mark), the
// computed type of the title and body runs (family, weight, features, optical sizing), the true
// italic, the digit widths, the toolbar's Font control (its state, tooltip, what a click opens),
// the Format > Text menu rows, the 1280 by 800 fold, then File > Move to trash, Delete forever
// and the 404s. Human speed: mouse moves in steps, 40 to 90 ms per key, real double clicks.
// Imports nothing from the repository but playwright-core.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/features/audit-fonts';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const rows = [];
const record = (step, expected, observed, ok) => {
  rows.push({ n: rows.length + 1, step, expected, observed: String(observed), ok });
  const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(
    `${tag} ${String(rows.length).padStart(2)} ${step}\n       expected: ${expected}\n       observed: ${String(observed).slice(0, 900)}`,
  );
};
const step = async (name, expected, fn) => {
  try {
    const r = await fn();
    record(name, expected, r.observed, r.ok);
    return r;
  } catch (error) {
    record(
      name,
      expected,
      `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      null,
    );
    return { ok: null };
  }
};

const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(50, 90));
  }
};
const moveHuman = async (page, from, to, steps = 12) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const clickAt = async (page, x, y, opts = {}) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y, opts);
  await sleep(rand(120, 220));
};
const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(160, 260));
};
const hoverAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 60, y: y + 30 }, { x, y }, 8);
  await sleep(900);
};
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const settled = async (page, timeout = 20_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const runBox = async (page, which) => {
  const el = page
    .locator('.ts-stagewrap.ts-editor .pt-slide [data-run]')
    .filter({ has: page.locator(':scope') });
  const all = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]');
  const n = await all.count();
  const names = [];
  for (let i = 0; i < n; i += 1) names.push(await all.nth(i).getAttribute('data-run'));
  const idx =
    which === 'heading'
      ? names.findIndex((r) => /heading|title/i.test(r ?? ''))
      : names.findIndex((r) => !/heading|title/i.test(r ?? ''));
  const i = idx >= 0 ? idx : 0;
  const box = await all.nth(i).boundingBox();
  return { box, run: names[i], names };
};
const typeStyle = (page, which) =>
  page.evaluate((w) => {
    const all = [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')];
    const el =
      all.find(
        (e) => (w === 'heading') === /heading|title/i.test(e.getAttribute('data-run') ?? ''),
      ) ?? all[0];
    if (!el) return null;
    const target = el.querySelector('i, em') ?? el;
    const cs = getComputedStyle(target);
    return {
      run: el.getAttribute('data-run'),
      tag: target.tagName,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      fontSize: cs.fontSize,
      fontFeatureSettings: cs.fontFeatureSettings,
      fontVariationSettings: cs.fontVariationSettings,
      fontOpticalSizing: cs.fontOpticalSizing,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      fontVariantNumeric: cs.fontVariantNumeric,
      text: (el.textContent ?? '').slice(0, 80),
    };
  }, which);

const shots = [];
const shot = async (page, name, clip) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
  shots.push(file);
  return file;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
const fontResponses = [];
const t0 = Date.now();
page.on('response', (res) => {
  const url = res.url();
  if (/\.woff2?(\?|$)|\/fonts\//.test(url))
    fontResponses.push({
      url: url.replace(BASE, ''),
      status: res.status(),
      at: Date.now() - t0,
      type: res.headers()['content-type'] ?? '',
    });
});

let deckId = '';
let readyAt = null;
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  readyAt = Date.now() - t0;
  const info = await invoke(page, 'deck.info');
  deckId = info.id;
  record(
    'the draft opened from /new',
    'an untitled draft id',
    `${deckId}; ready at ${readyAt} ms`,
    /^untitled-/.test(deckId),
  );

  await step(
    'the Inter faces the page loaded',
    'Inter upright and italic loaded, the Inter Fallback face defined, nothing else',
    async () => {
      const faces = await page.evaluate(() =>
        [...document.fonts].map((f) => `${f.family} ${f.style} ${f.weight} ${f.status}`),
      );
      const resources = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter((e) => /\.woff2/.test(e.name))
          .map((e) => ({
            name: e.name.split('/').pop(),
            initiator: e.initiatorType,
            start: Math.round(e.startTime),
            end: Math.round(e.responseEnd),
            bytes: e.encodedBodySize,
          })),
      );
      const preloads = await page.evaluate(() =>
        [...document.querySelectorAll('link[rel="preload"][as="font"]')].map(
          (l) =>
            `${l.getAttribute('href')?.split('/').pop()} ${l.getAttribute('type')} ${l.getAttribute('crossorigin')}`,
        ),
      );
      return {
        ok:
          faces.some((f) => /^Inter normal/.test(f) && /loaded/.test(f)) &&
          faces.some((f) => /^Inter italic/.test(f) && /loaded/.test(f)),
        observed: JSON.stringify({ faces, resources, preloads, fontResponses, readyAt }),
      };
    },
  );

  await step(
    'the sheet root type',
    'font-family Inter first, font-optical-sizing auto, antialiased',
    async () => {
      const r = await page.evaluate(() => {
        const s = document.querySelector('.ts-sheet');
        if (!s) return null;
        const cs = getComputedStyle(s);
        return {
          fontFamily: cs.fontFamily,
          fontOpticalSizing: cs.fontOpticalSizing,
          smoothing: cs.webkitFontSmoothing,
          fontFeatureSettings: cs.fontFeatureSettings,
          textVar: cs.getPropertyValue('--text'),
          displayVar: cs.getPropertyValue('--display'),
        };
      });
      return { ok: r !== null && /Inter/.test(r.fontFamily), observed: JSON.stringify(r) };
    },
  );

  const head = await runBox(page, 'heading');
  record(
    'the runs of the title slide',
    'a heading run and a body run',
    head.names.join(', '),
    head.names.length >= 1,
  );

  await step(
    'the title typed with cv11 and ss01 letters',
    'a single storey a in the heading, the display features on the run',
    async () => {
      const b = head.box;
      await clickAt(page, b.x + b.width / 2, b.y + b.height / 2);
      await dblclickAt(page, b.x + b.width / 2, b.y + b.height / 2);
      await press(page, `${MOD}+a`);
      await typeHuman(page, 'Agenda for a quarterly plan 0123456789');
      await sleep(400);
      await settled(page);
      const ts = await typeStyle(page, 'heading');
      const nb = (await runBox(page, 'heading')).box;
      await shot(
        page,
        'title-cv11-ss01-zoom',
        nb
          ? {
              x: Math.max(0, nb.x - 8),
              y: Math.max(0, nb.y - 8),
              width: Math.min(1440 - nb.x + 8, nb.width + 16),
              height: Math.min(900 - nb.y + 8, nb.height + 16),
            }
          : undefined,
      );
      await shot(page, 'editor-title-typed');
      return {
        ok:
          ts !== null && /cv11/.test(ts.fontFeatureSettings) && /ss01/.test(ts.fontFeatureSettings),
        observed: JSON.stringify(ts),
      };
    },
  );

  await step(
    'the true italic by Cmd+I',
    'font-style italic on the run text and the italic face used',
    async () => {
      await press(page, `${MOD}+a`);
      await press(page, `${MOD}+i`);
      await sleep(500);
      await settled(page);
      const ts = await typeStyle(page, 'heading');
      const italicFace = await page.evaluate(() =>
        [...document.fonts]
          .filter((f) => f.style === 'italic')
          .map((f) => `${f.family} ${f.status}`),
      );
      const nb = (await runBox(page, 'heading')).box;
      await shot(
        page,
        'title-italic-zoom',
        nb
          ? {
              x: Math.max(0, nb.x - 8),
              y: Math.max(0, nb.y - 8),
              width: Math.min(1440 - nb.x + 8, nb.width + 16),
              height: Math.min(900 - nb.y + 8, nb.height + 16),
            }
          : undefined,
      );
      await press(page, `${MOD}+z`);
      await sleep(300);
      return {
        ok: ts !== null && ts.fontStyle === 'italic',
        observed: JSON.stringify({ ts, italicFace }),
      };
    },
  );

  await step(
    'digit widths in the sheet face',
    'whether 1111 and 0000 measure equal (tabular) at 500 22px Inter and with tnum',
    async () => {
      const r = await page.evaluate(() => {
        const c = document.createElement('canvas').getContext('2d');
        const out = {};
        for (const [k, font] of Object.entries({
          text22: '500 22px Inter',
          display44: '500 44px Inter',
        })) {
          c.font = font;
          out[k] = { ones: c.measureText('1111').width, zeros: c.measureText('0000').width };
        }
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;left:-9999px;font:500 22px Inter;white-space:pre';
        probe.textContent = '1111';
        document.body.appendChild(probe);
        const w1 = probe.getBoundingClientRect().width;
        probe.textContent = '0000';
        const w0 = probe.getBoundingClientRect().width;
        probe.style.fontFeatureSettings = "'tnum'";
        probe.textContent = '1111';
        const t1 = probe.getBoundingClientRect().width;
        probe.textContent = '0000';
        const t0 = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          canvas: out,
          dom: { ones: w1, zeros: w0 },
          tnum: { ones: t1, zeros: t0 },
          check: document.fonts.check('500 22px Inter'),
        };
      });
      return { ok: true, observed: JSON.stringify(r) };
    },
  );

  await step(
    'the toolbar Font control on a selected text block',
    'the control present in the text tail; its state, value and reason read',
    async () => {
      const b = (await runBox(page, 'heading')).box;
      await press(page, 'Escape');
      await sleep(200);
      await clickAt(page, b.x + 12, b.y + b.height / 2);
      await sleep(400);
      const el = ctl(page, 'toolbar.font').first();
      const present = (await el.count()) > 0;
      const info = present
        ? await el.evaluate((e) => ({
            tag: e.tagName,
            text: e.textContent?.trim().slice(0, 60),
            disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled'),
            title: e.getAttribute('title'),
            ariaLabel: e.getAttribute('aria-label'),
            describedBy: e.getAttribute('aria-describedby'),
            dataTip: e.getAttribute('data-tip'),
            cls: e.className,
            expanded: e.getAttribute('aria-expanded'),
            haspopup: e.getAttribute('aria-haspopup'),
            visible: e.getClientRects().length > 0,
          }))
        : null;
      const box = present ? await el.boundingBox() : null;
      await shot(page, 'toolbar-text-tail-1440', { x: 0, y: 0, width: 1440, height: 140 });
      return { ok: present, observed: JSON.stringify({ info, box }) };
    },
  );

  await step('the Font control tooltip on hover', 'the sentence the tooltip shows', async () => {
    const el = ctl(page, 'toolbar.font').first();
    const box = await el.boundingBox();
    if (!box) return { ok: null, observed: 'no control' };
    await hoverAt(page, box.x + box.width / 2, box.y + box.height / 2);
    const tips = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tooltip"], .ts-tooltip, .ts-tip, [data-tooltip]')]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => e.textContent?.trim().slice(0, 200)),
    );
    await shot(page, 'toolbar-font-tooltip', {
      x: Math.max(0, box.x - 260),
      y: 0,
      width: 620,
      height: 160,
    });
    return { ok: tips.length > 0, observed: JSON.stringify(tips) };
  });

  await step('a click on the Font control', 'what opens: a plate, a menu, or nothing', async () => {
    const el = ctl(page, 'toolbar.font').first();
    const box = await el.boundingBox();
    if (!box) return { ok: null, observed: 'no control' };
    await clickAt(page, box.x + box.width / 2, box.y + box.height / 2);
    await sleep(600);
    const opened = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-control^="toolbar.font."], [role="menu"], [role="listbox"], .ts-plate, [id^="ts-menu-"]',
        ),
      ]
        .filter((e) => e.getClientRects().length > 0)
        .map(
          (e) =>
            `${e.tagName}.${e.className.toString().slice(0, 40)}#${e.getAttribute('data-control') ?? e.id}`,
        ),
    );
    await shot(page, 'toolbar-font-clicked', { x: 0, y: 0, width: 1440, height: 420 });
    await press(page, 'Escape');
    return { ok: true, observed: JSON.stringify(opened) };
  });

  await step(
    'Format > Text menu rows',
    'the rows of the Text submenu and whether a Font row exists',
    async () => {
      await clickControl(page, 'menubar.format');
      await page.locator('#ts-menu-format').waitFor({ timeout: 8000 });
      const textTrigger = page.locator('[data-control="format.text"]').first();
      if ((await textTrigger.count()) > 0) {
        const b = await textTrigger.boundingBox();
        if (b) await hoverAt(page, b.x + b.width / 2, b.y + b.height / 2);
        await sleep(500);
      }
      const items = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="format.text"]')]
          .filter((e) => e.getClientRects().length > 0)
          .map(
            (e) =>
              `${e.getAttribute('data-control')}: ${e.textContent?.trim().slice(0, 40)}${e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled') ? ' (disabled)' : ''}`,
          ),
      );
      await shot(page, 'format-text-menu', { x: 0, y: 0, width: 900, height: 700 });
      await press(page, 'Escape');
      await sleep(200);
      if ((await page.locator('[id^="ts-menu-"]:visible').count()) > 0) await press(page, 'Escape');
      return { ok: items.length > 0, observed: JSON.stringify(items) };
    },
  );

  await step(
    'the text tail at 1280 by 800',
    'whether the Font control stays visible or folds into More',
    async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await sleep(600);
      const b = (await runBox(page, 'heading')).box;
      await clickAt(page, b.x + 12, b.y + b.height / 2);
      await sleep(500);
      const el = ctl(page, 'toolbar.font').first();
      const visible = (await el.count()) > 0 && (await el.first().isVisible());
      const more =
        (await ctl(page, 'toolbar.more').count()) > 0 &&
        (await ctl(page, 'toolbar.more').first().isVisible());
      await shot(page, 'toolbar-text-tail-1280', { x: 0, y: 0, width: 1280, height: 140 });
      await page.setViewportSize({ width: 1440, height: 900 });
      return { ok: true, observed: JSON.stringify({ fontVisible: visible, moreVisible: more }) };
    },
  );

  await step('the network after the walk', 'every font response of the session', async () => {
    return {
      ok: true,
      observed: JSON.stringify({ fontResponses, consoleErrors: consoleErrors.slice(0, 8) }),
    };
  });
} finally {
  let trashed = false;
  if (deckId) {
    await step(
      'File > Move to trash',
      'the address moves to /decks and the card is not listed',
      async () => {
        await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
        await editorReady(page);
        await settled(page);
        await press(page, 'Escape', 2);
        await clickControl(page, 'menubar.file');
        await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
        await clickControl(page, 'menu.file.moveToTrash');
        await page.waitForURL(/\/decks(\?.*)?$/, { timeout: 20_000 });
        await page
          .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 })
          .catch(() => undefined);
        const listed = await page
          .locator(`[data-control="home.card.${deckId}"]`)
          .first()
          .isVisible()
          .catch(() => false);
        trashed = true;
        return {
          ok: /\/decks/.test(page.url()) && !listed,
          observed: `${page.url()}; card listed ${listed}`,
        };
      },
    );
    if (!trashed) {
      try {
        await page
          .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
          .catch(() => undefined);
        await editorReady(page).catch(() => undefined);
        const info = await invoke(page, 'deck.info').catch(() => null);
        if (info)
          await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
            () => undefined,
          );
      } catch {}
    }
    await step(
      'Delete forever, then GET /edit and /deck',
      'the card leaves the trash and both addresses answer 404',
      async () => {
        let how = 'the trash page';
        try {
          await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector(
            '.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]',
            { timeout: 30_000 },
          );
          const card = page.locator(`[data-control="trash.card.${deckId}"]`);
          await card.waitFor({ timeout: 30_000 });
          await clickControl(page, `trash.delete.${deckId}`);
          await clickControl(page, 'trash.confirm.ok');
          await card.waitFor({ state: 'detached', timeout: 30_000 });
        } catch (error) {
          how = `the trash page failed (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); the actions API`;
          await page
            .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
            .catch(() => undefined);
          await editorReady(page).catch(() => undefined);
          const info = await invoke(page, 'deck.info').catch(() => null);
          if (info) {
            await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
              () => undefined,
            );
            const again = await invoke(page, 'deck.info').catch(() => null);
            await invoke(page, 'deck.remove', {
              id: deckId,
              baseRevision: again?.revision ?? info.revision,
              confirm: true,
            }).catch(() => undefined);
          }
        }
        const status = {};
        const until = Date.now() + 20_000;
        for (;;) {
          for (const p of ['edit', 'deck']) {
            const r = await context.request.get(`${BASE}/${p}/${deckId}`);
            status[p] = r.status();
          }
          if (status.edit === 404 && status.deck === 404) break;
          if (Date.now() > until) break;
          await sleep(1000);
        }
        return {
          ok: status.edit === 404 && status.deck === 404,
          observed: `${how}; /edit ${status.edit}, /deck ${status.deck}`,
        };
      },
    );
  }
  writeFileSync(
    path.join(OUT, 'walk.json'),
    JSON.stringify(
      {
        base: BASE,
        at: new Date().toISOString(),
        deckId,
        readyAt,
        rows,
        shots,
        fontResponses,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  const failures = rows.filter((r) => r.ok === false).length;
  console.log(
    `\n${rows.length} steps, ${failures} failed, ${rows.filter((r) => r.ok === null).length} not driven; deck ${deckId}`,
  );
}
