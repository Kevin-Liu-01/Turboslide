// R2's drive of fix round 3 (VERIFICATION.md "Realtime round, pass 3" finding 3): two anonymous
// people at a person's pace (90 ms a key) type at one point of one text, the way the verifier's hand
// drive does (docs/gslides-parity/cloudflare/verify/hand.mjs `title`): A on `--a`, B on `--b`, both
// open the run at its end, type a word each within 150 ms of each other, wait 700 ms, type a second
// word each, press Escape, three rounds. Two surfaces: `box`, a text box on slide 1 (the first
// `title` section's surface, where words were cut and spaces lost), and `cover`, the heading of a
// title slide of its own (where the heading wraps and the slide converts). Each round records both
// texts as the documents hold them, the words lost or doubled, and a picture of each stage in the
// last round. Nothing is judged here. The deck is made from /new by A and trashed and removed by its
// id at the end.
//
//   node docs/gslides-parity/realtime/build/r2/fix3/typers-drive.mjs --a http://127.0.0.1:4472 \
//     --b http://127.0.0.1:4482 --out <dir> [--width 1440] [--appearance light|dark]
//     [--sections box,cover] [--rounds 3]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const BASE_A = arg('a', 'http://127.0.0.1:4472').replace(/\/$/, '');
const BASE_B = arg('b', BASE_A).replace(/\/$/, '');
const WIDTH = Number(arg('width', '1440'));
const HEIGHT = WIDTH >= 1440 ? 900 : 800;
const APPEARANCE = arg('appearance', 'light') === 'dark' ? 'dark' : 'light';
const OUT = resolve(arg('out', `typers-${WIDTH}-${APPEARANCE}`));
const SECTIONS = new Set(arg('sections', 'box,cover').split(','));
const ROUNDS = Number(arg('rounds', '3'));
const HUMAN = 90;
mkdirSync(OUT, { recursive: true });

const facts = {
  startedAt: new Date().toISOString(),
  baseA: BASE_A,
  baseB: BASE_B,
  width: WIDTH,
  appearance: APPEARANCE,
  pictures: [],
};
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)?.slice(0, 600)}`);
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
};
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i ?? {}), [action, input]);
async function poll(fn, timeout = 30_000, every = 40) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  return last;
}
async function waitEditor(page) {
  await page.waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
    timeout: 90_000,
  });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 60_000 });
}
const connected = async (page) => Boolean((await state(page)).sync?.connected);
async function quiet(page, timeout = 8000) {
  await poll(
    async () => {
      const s = (await state(page)).sync;
      return s ? (s.pending ?? 0) === 0 && (s.inflight ?? 0) === 0 : true;
    },
    timeout,
    100,
  );
}
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list');
  const arr = Array.isArray(list) ? list : (list.slides ?? list.items ?? []);
  return arr.map((s) => (typeof s === 'string' ? s : s.id));
};
const slideJson = async (page, slideId) => {
  const got = await invoke(page, 'slide.get', { slideId });
  return got?.slide ?? got;
};
const isEditing = (page) =>
  page.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null);
async function escapeAll(page) {
  await page.keyboard.press('Escape');
  await sleep(100);
  await page.keyboard.press('Escape');
  await sleep(100);
}
async function clickCard(page, slideId) {
  await page.locator(`[data-control="filmstrip.slide.${slideId}"]`).first().click();
  await poll(async () => (await state(page)).slideId === slideId, 8000);
}
async function typeWord(page, word) {
  for (const ch of word) {
    await page.keyboard.type(ch);
    await sleep(HUMAN);
  }
}
/** Opens the run by a double click at its middle and puts the caret at the end of its text. */
async function openEnd(page, runOf) {
  await escapeAll(page);
  const run = await poll(() => runOf(page), 10_000, 100);
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  const box = await el.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 120, y + 80);
  await page.mouse.move(x, y, { steps: 8 });
  await sleep(80);
  await page.mouse.dblclick(x, y);
  if (!(await poll(() => isEditing(page), 5000, 50))) {
    await page.keyboard.press('Escape');
    await el.dblclick();
    await poll(() => isEditing(page), 5000, 50);
  }
  await sleep(150);
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.press('End');
}
async function shot(page, name) {
  await page.waitForTimeout(350);
  const stage = await page.locator('.ts-stagewrap.ts-editor').first().boundingBox();
  await page.screenshot({ path: join(OUT, `${name}.png`), ...(stage ? { clip: stage } : {}) });
  facts.pictures.push(`${name}.png`);
}
const count = (text, w) => text.split(w).length - 1;

const browser = await chromium.launch({ headless: true });
const mk = async (baseURL) => {
  const ctx = await browser.newContext({
    baseURL,
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: APPEARANCE,
  });
  await ctx.addInitScript((value) => {
    try {
      localStorage.setItem('ts-chrome-appearance', value);
      localStorage.setItem('gt-theme', value);
    } catch {}
  }, APPEARANCE);
  return ctx;
};
const ctxA = await mk(BASE_A);
const ctxB = await mk(BASE_B);
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let deckId = null;

/** Three rounds of two typers at one point of the run `runOf` names; `textOf` reads the document's text. */
async function rounds(name, runOf, textOf, words) {
  const out = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    const [p1, p2] = words(round);
    await openEnd(A, runOf);
    await openEnd(B, runOf);
    const delay = Math.floor(Math.random() * 150);
    await Promise.all([typeWord(A, p1[0]), sleep(delay).then(() => typeWord(B, p1[1]))]);
    await sleep(700);
    await Promise.all([typeWord(A, p2[0]), sleep(delay).then(() => typeWord(B, p2[1]))]);
    await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
    const escapeAt = Date.now();
    const four = [...p1, ...p2];
    const settled = await poll(
      async () => {
        const [a, b] = await Promise.all([textOf(A), textOf(B)]);
        return four.every((w) => count(a, w) === 1 && count(b, w) === 1) ? Date.now() : null;
      },
      3000,
      40,
    );
    await Promise.all([quiet(A), quiet(B)]);
    const [a, b] = await Promise.all([textOf(A), textOf(B)]);
    out.push({
      round,
      delayB: delay,
      load: (await import('node:os')).loadavg()[0].toFixed(2),
      bothMsAfterEscape: settled ? settled - escapeAt : null,
      a,
      b,
      equal: a === b,
      lost: four.filter((w) => count(a, w) !== 1 || count(b, w) !== 1),
    });
    if (round === ROUNDS) {
      await shot(A, `${name}-round${round}-a`);
      await shot(B, `${name}-round${round}-b`);
    }
    await escapeAll(A);
    await escapeAll(B);
  }
  say(`${name}.rounds`, out);
}

try {
  await A.goto('/new');
  await waitEditor(A);
  const heading = await A.evaluate(
    () =>
      document
        .querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]')
        ?.getAttribute('data-run') ?? null,
  );
  await A.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${heading}"]`)
    .first()
    .dblclick();
  await sleep(150);
  await A.keyboard.press('Meta+a');
  await A.keyboard.type('Typers drive', { delay: HUMAN });
  await A.keyboard.press('Escape');
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  await escapeAll(A);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  await poll(() => connected(A), 30_000, 100);
  const s1 = (await slideOrder(A))[0];
  {
    const st = await state(A);
    await invoke(A, 'block.insert', {
      baseRevision: st.revision,
      slideId: s1,
      slot: 'main',
      block: {
        id: 'typers-box',
        type: 'text',
        text: 'Two people type here',
        pos: { x: 160, y: 620, w: 1280, h: 140 },
      },
    });
    await quiet(A);
  }
  {
    const order = await slideOrder(A);
    const st = await state(A);
    await invoke(A, 'slide.new', {
      layout: 'title',
      after: order[order.length - 1],
      baseRevision: st.revision,
    });
    await quiet(A);
  }
  const slides = await slideOrder(A);
  const coverId = slides[slides.length - 1];
  await clickCard(A, coverId);
  {
    const run = await A.evaluate(() => {
      const ids = [
        ...document.querySelectorAll(
          '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
        ),
      ].map((el) => el.getAttribute('data-run') ?? '');
      return ids.find((r) => /heading/.test(r)) ?? ids[0] ?? null;
    });
    await A.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
      .first()
      .dblclick();
    await sleep(150);
    await A.keyboard.press('Meta+a');
    await A.keyboard.type('Two typers', { delay: HUMAN });
    await A.keyboard.press('Escape');
    await escapeAll(A);
    await quiet(A);
  }
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const link = opened.url
    ? opened.url.replace(/^https?:\/\/[^/]+/, BASE_B)
    : `${BASE_B}/edit/${deckId}`;
  await B.goto(link);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  await poll(() => connected(B), 20_000, 50);
  say('setup', {
    slides,
    coverId,
    syncA: await invoke(A, 'sync.status').then((s) => ({ tier: s.tier, transport: s.transport })),
  });

  if (SECTIONS.has('box')) {
    await clickCard(A, s1);
    await clickCard(B, s1);
    const boxRun = (page) =>
      page.evaluate(() => {
        const inner = document.querySelector(
          '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="typers-box"]',
        );
        const box = inner?.closest('.free') ?? inner;
        if (!box) return null;
        const el = box.matches('[data-run]') ? box : box.querySelector('[data-run]');
        return el?.getAttribute('data-run') ?? null;
      });
    const boxText = async (page) => {
      const slide = await slideJson(page, s1);
      const find = (node) => {
        if (Array.isArray(node)) {
          for (const x of node) {
            const r = find(x);
            if (r !== null) return r;
          }
          return null;
        }
        if (node && typeof node === 'object') {
          if (node.id === 'typers-box') return String(node.text ?? '');
          for (const v of Object.values(node)) {
            const r = find(v);
            if (r !== null) return r;
          }
        }
        return null;
      };
      return (find(slide) ?? '').replace(/ /g, ' ');
    };
    await rounds('box', boxRun, boxText, (r) => [
      [` ta${r}`, ` tb${r}`],
      [` ua${r}`, ` ub${r}`],
    ]);
  }
  if (SECTIONS.has('cover')) {
    await clickCard(A, coverId);
    await clickCard(B, coverId);
    const coverRun = (page) =>
      page.evaluate(() => {
        const ids = [
          ...document.querySelectorAll(
            '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
          ),
        ].map((el) => el.getAttribute('data-run') ?? '');
        return ids.find((r) => /heading/.test(r)) ?? ids[0] ?? null;
      });
    const coverText = async (page) => {
      const slide = await slideJson(page, coverId);
      if (slide?.kind === 'title') return String(slide.heading ?? '').replace(/ /g, ' ');
      const id = slide?.grammar?.slots?.main?.[1] ?? 'heading';
      const block = (slide?.slots?.main ?? []).find((b) => b.id === id);
      return String(block?.text ?? '').replace(/ /g, ' ');
    };
    await rounds('cover', coverRun, coverText, (r) => [
      [` ca${r}`, ` cb${r}`],
      [` da${r}`, ` db${r}`],
    ]);
    say('cover.kind', {
      a: (await slideJson(A, coverId))?.kind ?? null,
      b: (await slideJson(B, coverId))?.kind ?? null,
    });
  }
} catch (error) {
  say('error', String(error?.stack ?? error).slice(0, 2000));
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
  await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {});
} finally {
  await ctxB.close().catch(() => {});
  if (deckId) {
    try {
      const info = await invoke(A, 'deck.info');
      await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision });
      const trashed = await invoke(A, 'deck.info').catch(() => info);
      await invoke(A, 'deck.remove', { id: deckId, confirm: true, baseRevision: trashed.revision });
      const gone = await fetch(`${BASE_A}/edit/${deckId}`, { redirect: 'manual' });
      say('teardown', { id: deckId, editStatus: gone.status });
    } catch (error) {
      say('teardown.error', String(error).slice(0, 300));
    }
  }
  facts.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  await browser.close();
}
