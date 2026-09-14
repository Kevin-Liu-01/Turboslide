#!/usr/bin/env node
// The published embed's gt-deck-slide message (share.spec.ts row 3; hotfix B request R2; SPEC-3
// 6.4): copies the fixture deck, publishes it through the window API, frames the embed address in
// an about:blank parent that records every message before the frame loads, and after 6 s reads
// what arrived, the frame's URL and status, `.pt-viewer`'s data-index inside the frame and the
// frame's console errors. Unpublishes, trashes and removes the copy.
//   node embed-message-probe.mjs --base http://localhost:4321
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4321').replace(/\/$/, '');
const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]', { timeout: 60_000 });
};
const browser = await chromium.launch({ headless: true });
const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await owner.newPage();
const copyId = `ship-embed-${Date.now().toString(36)}`;
let created = false;
try {
  await page.goto(`${BASE}/edit/fixture`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const src = await invoke(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: 'fixture',
    name: 'Embed probe',
    newId: copyId,
    baseRevision: src.revision,
  });
  created = true;
  await page.goto(`${BASE}/edit/${copyId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const share = await invoke(page, 'share.get', { id: copyId });
  const published = await invoke(page, 'deck.publish', {
    id: copyId,
    baseRevision: share.record?.revision ?? share.revision ?? 0,
  });
  console.log(
    `published: player ${published.url.replace(/p=[^&]+/, 'p=<token>')}; embed ${published.embed.replace(/p=[^&]+/, 'p=<token>')}`,
  );

  const parent = await browser.newContext();
  const pageP = await parent.newPage();
  const frameLogs = [];
  pageP.on('console', (m) => frameLogs.push(`${m.type()}: ${m.text().slice(0, 160)}`));
  pageP.on('pageerror', (e) => frameLogs.push(`pageerror: ${String(e).slice(0, 160)}`));
  const responses = [];
  pageP.on('response', (r) => {
    if (/\/embed\//.test(r.url()))
      responses.push(
        `${r.status()} ${r.url().replace(/p=[^&]+/, 'p=<token>')} x-frame-options=${r.headers()['x-frame-options'] ?? ''} csp=${(r.headers()['content-security-policy'] ?? '').slice(0, 80)}`,
      );
  });
  await pageP.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
  const embedRef = new URL(published.embed, `${BASE}/`);
  const embedPath = `${embedRef.pathname}${embedRef.search}`;
  await pageP.evaluate((src) => {
    window.__messages = [];
    window.addEventListener('message', (e) => window.__messages.push(e.data));
    const frame = document.createElement('iframe');
    frame.id = 'f';
    frame.src = src;
    frame.width = '960';
    frame.height = '540';
    document.body.appendChild(frame);
  }, embedPath);
  await pageP.waitForTimeout(6000);
  const messages = await pageP.evaluate(() => window.__messages);
  console.log(
    `parent received ${messages.length} message(s): ${JSON.stringify(messages).slice(0, 200)}`,
  );
  for (const r of responses) console.log(`embed response: ${r}`);
  const frames = pageP.frames();
  console.log(`frames: ${frames.length}`);
  const frame = frames.find((f) => /\/embed\//.test(f.url()));
  if (frame) {
    const facts = await frame
      .evaluate(() => ({
        url: location.href.replace(/p=[^&]+/, 'p=<token>'),
        title: document.title,
        viewer: document.querySelector('.pt-viewer')?.className ?? null,
        index: document.querySelector('.pt-viewer')?.getAttribute('data-index') ?? null,
        settled: document.querySelector('.pt-viewer')?.hasAttribute('data-settled') ?? null,
        framed: window.parent !== window,
        bodyText: document.body?.innerText?.slice(0, 160) ?? '',
      }))
      .catch((e) => ({ error: String(e).slice(0, 200) }));
    console.log(`frame facts: ${JSON.stringify(facts)}`);
  } else {
    console.log('no embed frame attached');
  }
  for (const l of frameLogs.slice(0, 12)) console.log(`console: ${l}`);
  await parent.close();
  await invoke(page, 'deck.unpublish', {
    id: copyId,
    baseRevision: (await invoke(page, 'share.get', { id: copyId })).record?.revision ?? 0,
  }).catch((e) => console.log(`unpublish: ${String(e).slice(0, 160)}`));
} catch (error) {
  console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      const info = await invoke(page, 'deck.info');
      await invoke(page, 'deck.trash', { id: copyId, baseRevision: info.revision });
      const t = await invoke(page, 'deck.info').catch(() => null);
      await invoke(page, 'deck.remove', {
        id: copyId,
        confirm: true,
        baseRevision: t?.revision ?? info.revision + 1,
      });
      console.log(`cleanup: ${copyId} trashed and removed`);
    } catch (error) {
      console.log(`cleanup FAIL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await browser.close();
}
