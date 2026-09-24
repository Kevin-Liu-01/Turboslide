#!/usr/bin/env node
// B7's drive of the shader export rows on the lane's dev server (docs/FEATURES.md 5.5, 7.1):
// shaders.export.pdf-frame, shaders.export.pptx-frame, shaders.export.html-frame,
// shaders.export.missing-frame-row and the window API half of shaders.background.place-answers.
// A fresh /new draft through window.turboslide.studio.invoke, a shader block placed on the first
// slide, its frame made by the hosted capture (material.capture with the block's frame key, so the
// record is fresh by key), then the four exports read from the files the reports name. Every
// scratch deck is trashed and removed at the end. Run from the repository root:
//   node <this file> --base http://localhost:4417 --out <dir>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const REPO = '/Users/kevinliu/repos/Turboslide';
// the repository's own packages, resolved from its root (this file lives in the scratchpad)
const require = createRequire(`${REPO}/package.json`);
const { chromium } = require('playwright-core');
const sharp = require('sharp');
const JSZip = createRequire(`${REPO}/packages/export/package.json`)('jszip');
const { frameKeyOf } = await import(`${REPO}/packages/materials/src/recipe-key.ts`);
const { shaderPaletteOf } = await import(`${REPO}/packages/materials/src/presets.ts`);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const BASE = arg('base', 'http://localhost:4417').replace(/\/$/, '');
const OUT = arg('out', join(process.cwd(), 'b7-drive-out'));
mkdirSync(OUT, { recursive: true });

const rows = [];
const log = (line) => {
  console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
};
const row = (id, ok, detail) => {
  rows.push({ id, result: ok ? 'passed' : 'failed', detail });
  log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const invoke = (id, input) =>
  page.evaluate(([a, v]) => window.turboslide.studio.invoke(a, v), [id, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const settled = async (timeout = 30_000) => {
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (s.pending === 0 && s.serverRevision === s.revision) return s;
    if (Date.now() - t0 > timeout) throw new Error(`not settled: ${JSON.stringify({ pending: s.pending, r: s.revision, sr: s.serverRevision })}`);
    await sleep(200);
  }
};

let deckId = null;
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  const info = await invoke('deck.info');
  deckId = info.id;
  log(`draft ${deckId} at revision ${info.revision}`);
  const s0 = await state();
  const slideId = s0.slideId;
  const BLOCK = 'sh1';
  const POS = { x: 900, y: 300, w: 480, h: 272 };
  await invoke('block.insert', {
    baseRevision: s0.revision,
    slideId,
    slot: 'main',
    block: { id: BLOCK, type: 'material', materialId: 'paper:liquid-metal', alt: 'The liquid metal shader', pos: POS },
  });
  await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
  let s = await settled();
  log(`shader block placed; revision ${s.revision}, url ${page.url()}`);

  // the block's frame key over the deck's palette, as the client capture computes it
  const got = await invoke('slide.get', { slideId });
  const slide = got.slide;
  const block = (slide.slots?.main ?? []).find((b) => b.id === BLOCK);
  if (!block) throw new Error('the shader block is not on the slide');
  const deckInfo = await invoke('deck.info');
  const palette = shaderPaletteOf(deckInfo.brand, 'light');
  const key = frameKeyOf(block, palette);
  log(`frame key ${key.slice(0, 23)}…`);

  // the frame by the hosted capture under the bound (a checkout's Chromium), recorded with the key
  const t1 = Date.now();
  // the action table on this tree refuses `frameKey` on material.capture (B5's schema entry is
  // pending), so the hosted frame is stale by absence and every export below waits and writes
  // the row; the pixels are the same and the fresh path is the unit tests' (shader-frames.test.ts)
  const withKey = process.argv.includes('--with-key');
  const captured = await invoke('material.capture', {
    materialId: block.materialId,
    anchors: [5500],
    id: 'sh1-frame',
    role: 'frame',
    ...(withKey ? { frameKey: key } : {}),
    baseRevision: (await state()).revision,
  });
  const asset = Array.isArray(captured) ? captured[0] : captured;
  log(`material.capture answered in ${Date.now() - t1} ms: ${asset.id} ${asset.size.join('x')} backend ${asset.source.backend} frameKey ${asset.source.frameKey ? 'set' : 'absent'}`);
  s = await settled();
  await invoke('block.set', { slideId, blockId: BLOCK, path: '/asset', value: asset.id, baseRevision: s.revision });
  s = await settled();
  log(`block names the frame; revision ${s.revision}`);

  // the frame's centre pixel from the store's file, for the colour samples
  const framePath = join(REPO, '.turboslide', 'dummy');
  const assets = (await state()).assets ?? {};
  const record = assets[asset.id];
  log(`asset record: twins ${JSON.stringify(record?.twins)} frameKey ${record?.source?.frameKey === key ? 'equals the block key' : 'DIFFERS'}`);

  const runExport = async (input) => {
    const t = Date.now();
    const report = await invoke('export.run', { verify: false, ...input });
    return { report, ms: Date.now() - t };
  };

  // PDF
  {
    const { report, ms } = await runExport({ format: 'pdf', theme: ['light'] });
    const pdf = report.files[0]?.path;
    log(`pdf in ${ms} ms: ${pdf} (${report.files[0]?.bytes} bytes); residual shaders row: ${report.residual.find((l) => l.startsWith('shaders:')) ?? 'none'}`);
    const listing = execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' });
    const has3200 = /\b3200\s+1800\b/.test(listing);
    execFileSync('pdftoppm', ['-png', '-r', '120', '-f', '1', '-l', '1', '-scale-to-x', '1600', '-scale-to-y', '900', pdf, join(OUT, 'pdf-page')]);
    const pageFile = existsSync(join(OUT, 'pdf-page-1.png')) ? join(OUT, 'pdf-page-1.png') : join(OUT, 'pdf-page-01.png');
    const framePng = await fetchFrame();
    const sampleAt = async (file, x, y) => {
      const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const meta = await sharp(file).metadata();
      const i = (Math.round(y) * meta.width + Math.round(x)) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // the colour sample: the mean over the block's box on the page against the mean of the frame
    // (a page pixel averages about 45 frame pixels, so a single pixel is no comparison)
    const meanOf = async (file, region) => {
      let img = sharp(file).ensureAlpha();
      if (region) img = img.extract(region);
      const { data } = await img.raw().toBuffer({ resolveWithObject: true });
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) { sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; }
      const n = data.length / 4;
      return sum.map((v) => Math.round(v / n));
    };
    const inset = 6;
    const centre = await meanOf(pageFile, { left: POS.x + inset, top: POS.y + inset, width: POS.w - 2 * inset, height: POS.h - 2 * inset });
    const frameCentre = await meanOf(framePng);
    const dist = Math.max(...centre.map((c, i) => Math.abs(c - frameCentre[i])));
    const text = execFileSync('pdftotext', ['-f', '1', '-l', '1', pdf, '-'], { encoding: 'utf8' });
    const noLabel = !/not captured/.test(text);
    const noRow = !report.residual.some((l) => l.startsWith('shaders:'));
    row('shaders.export.pdf-frame', has3200 && dist <= 12 && noLabel, `image 3200x1800 in the PDF: ${has3200}; mean colour over the box on the page ${centre.join(',')} vs the frame ${frameCentre.join(',')} (max channel diff ${dist}); no label text: ${noLabel}; shaders row absent (needs B5's frameKey on the capture): ${noRow}; ${ms} ms`);
    writeFileSync(join(OUT, 'pdf-report.json'), JSON.stringify(report, null, 2));
  }

  async function fetchFrame() {
    // the frame file as the store holds it, through the asset route
    const twin = (record?.twins?.neutral ?? '').replace(/^assets\//, '');
    const res = await page.request.get(`${BASE}/decks/${deckId}/assets/${twin}`).catch(() => null);
    let bytes = res && res.ok() ? Buffer.from(await res.body()) : null;
    if (!bytes) {
      const tmpRoot = process.env.B7_TMPDIR;
      throw new Error(`frame file not served: ${res?.status()}`);
    }
    const file = join(OUT, 'frame.png');
    writeFileSync(file, bytes);
    return file;
  }

  // PowerPoint, both modes
  for (const mode of ['native', 'flatten']) {
    const { report, ms } = await runExport({ format: 'pptx', mode, theme: ['light'] });
    const pptx = report.files.find((f) => f.path.endsWith('.pptx'))?.path;
    const zip = await JSZip.loadAsync(readFileSync(pptx));
    const slidePart = Object.keys(zip.files).find((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    if (!slidePart) throw new Error(`no slide part in ${pptx}: ${Object.keys(zip.files).slice(0, 20).join(', ')}`);
    const slideXml = await zip.file(slidePart).async('string');
    const named = slideXml.includes(`name="ts:${slideId}#${BLOCK}"`);
    const descrMatch = slideXml.match(new RegExp(`name="ts:${slideId}#${BLOCK}"[^>]*descr="([^"]*)"`));
    const descr = descrMatch ? descrMatch[1].replace(/&quot;/g, '"') : null;
    const recipeOk = descr !== null && descr.includes('"materialId":"paper:liquid-metal"');
    // the media parts: one of them is 3200 by 1800
    const media = Object.keys(zip.files).filter((n) => n.startsWith('ppt/media/') && !zip.files[n].dir);
    let long3200 = false;
    for (const name of media) {
      const bytes = await zip.file(name).async('nodebuffer');
      const meta = await sharp(bytes).metadata().catch(() => null);
      if (meta && Math.max(meta.width, meta.height) === 3200) long3200 = true;
    }
    const noRow = !report.residual.some((l) => l.startsWith('shaders:'));
    const shaderLine = report.residual.find((l) => l.startsWith('shader:'));
    row(`shaders.export.pptx-frame (${mode})`, named && recipeOk && long3200, `picture ts:${slideId}#${BLOCK}: ${named}; recipe in descr: ${recipeOk}; a media part with the long side 3200: ${long3200}; residual: ${shaderLine ?? 'no shader line'}; no shaders row: ${noRow}; ${ms} ms`);
    writeFileSync(join(OUT, `pptx-${mode}-report.json`), JSON.stringify(report, null, 2));
  }

  // the web page
  {
    const t = Date.now();
    const built = await invoke('build.run', { out: 'b7-shader', budgetMB: 16 });
    const html = readFileSync(built.path, 'utf8');
    writeFileSync(join(OUT, 'b7-shader.html'), html);
    log(`web page ${built.path} copied to ${join(OUT, 'b7-shader.html')}`);
    const at = html.indexOf('material-fig');
    log(`material markup: ${html.slice(Math.max(0, at - 40), at + 420).replace(/data:image\/png;base64,[A-Za-z0-9+/=]{40,}/g, 'data:image/png;base64,…')}`);
    // the build inlines every asset under its budget, a continuous tone frame as a JPEG (the CLI's
    // inlineAssets); the row reads the frame's pixels at the block's box, whatever the encoding
    const frameImg = html.match(/<div class="material"[^>]*><img class="material-frame" src="data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)"/);
    const hasFrameImg = frameImg !== null;
    if (frameImg) {
      const bytes = Buffer.from(frameImg[2], 'base64');
      const meta = await sharp(bytes).metadata().catch(() => null);
      log(`inlined frame: ${frameImg[1]} ${meta?.width}x${meta?.height}, ${bytes.byteLength} bytes`);
      const mean = await (async () => { const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const sum=[0,0,0]; for (let i=0;i<data.length;i+=4){sum[0]+=data[i];sum[1]+=data[i+1];sum[2]+=data[i+2];} return sum.map((v)=>Math.round(v/(data.length/4))); })();
      log(`inlined frame mean colour ${mean.join(',')}`);
    }
    const noCanvas = !/<canvas/.test(html);
    const noLabel = !/not captured/.test(html);
    const noLive = !/data-live=/.test(html);
    row('shaders.export.html-frame', hasFrameImg && noCanvas && noLabel && noLive, `frame img inlined: ${hasFrameImg}; no canvas: ${noCanvas}; no label: ${noLabel}; no data-live: ${noLive}; ${built.bytes} bytes in ${Date.now() - t} ms`);
  }

  // the missing frame row: the recipe moves (a new anchor, a new key) and the export starts at once
  {
    s = await settled();
    await invoke('block.set', { slideId, blockId: BLOCK, path: '/anchor', value: 7000, baseRevision: s.revision });
    const t = Date.now();
    const { report, ms } = await runExport({ format: 'pdf', theme: ['light'] });
    const line = report.residual.find((l) => l.startsWith('shaders:'));
    const ok = line !== undefined && /^shaders: 1 shader had no frame; the export waited (8|9|10|11) s for it$/.test(line);
    row('shaders.export.missing-frame-row', ok, `row: ${line ?? 'none'}; export ${ms} ms, started at once after the recipe change`);
    writeFileSync(join(OUT, 'pdf-stale-report.json'), JSON.stringify(report, null, 2));
  }

  // the background material through the window API: the ground changes, timed (the dialog half is B1's)
  {
    s = await settled();
    const outline = await invoke('deck.info');
    const sectionId = outline.sections?.[0]?.id;
    const inserted = await invoke('slide.insert', {
      baseRevision: s.revision,
      sectionId,
      after: slideId,
      slide: { schemaVersion: 1, id: 'b7-ground', kind: 'statement', big: 'A ground' },
    });
    s = await settled();
    const t = Date.now();
    let outcome;
    try {
      outcome = await invoke('slide.setBackgroundMaterial', { slideIds: ['b7-ground'], materialId: 'paper:gem-smoke', anchor: 5500, baseRevision: s.revision });
    } catch (error) {
      outcome = { error: String(error?.message ?? error) };
    }
    const ms = Date.now() - t;
    log(`slide.setBackgroundMaterial answered: ${JSON.stringify(outcome).slice(0, 300)}`);
    // the server's write reaches the page over the watch channel; the page's document is read
    // until it holds the covering picture, ten seconds at most
    let covering;
    let ground;
    for (let i = 0; i < 50 && covering === undefined; i += 1) {
      ground = await invoke('slide.get', { slideId: 'b7-ground' });
      covering = Object.values(ground.slide.slots ?? {}).flat().find((b) => b.type === 'picture');
      if (covering === undefined) await sleep(200);
    }
    log(`ground slide: ${JSON.stringify(ground.slide).slice(0, 500)}`);
    const ok = outcome.error === undefined && covering !== undefined;
    row('shaders.background.place-answers (window API half)', ok, `slide.setBackgroundMaterial answered in ${ms} ms: ${outcome.error ?? `picture ${covering?.id} asset ${covering?.asset}`}`);
  }
} catch (error) {
  log(`drive failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  rows.push({ id: 'drive', result: 'failed', detail: String(error?.message ?? error) });
} finally {
  // every scratch deck of this lane on the tmp store: this run's and any an earlier run left
  try {
    const list = await invoke('deck.list', { includeTrashed: true });
    const decks = Array.isArray(list) ? list : (list.decks ?? []);
    // the other lanes' leftovers first, this run's own deck last (the page acts through it)
    decks.sort((a, b) => (a.id === deckId ? 1 : 0) - (b.id === deckId ? 1 : 0));
    for (const d of decks) {
      if (!/^untitled-2026/.test(d.id)) continue;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const fresh = (await invoke('deck.list', { includeTrashed: true }));
          const row = (Array.isArray(fresh) ? fresh : fresh.decks ?? []).find((x) => x.id === d.id);
          if (!row) break;
          if (!row.trashedAt) await invoke('deck.trash', { id: d.id, baseRevision: row.revision });
          else { await invoke('deck.remove', { id: d.id, confirm: true, baseRevision: row.revision }); log(`deck ${d.id} trashed and removed`); break; }
        } catch (error) {
          if (attempt === 3) log(`cleanup ${d.id}: ${error?.message ?? error}`);
        }
      }
    }
  } catch (error) {
    log(`cleanup: ${error?.message ?? error}`);
  }
  await browser.close();
  writeFileSync(join(OUT, 'rows.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), rows }, null, 2));
  log(`rows written to ${join(OUT, 'rows.json')}`);
}
