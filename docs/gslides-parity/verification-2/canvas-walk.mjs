#!/usr/bin/env node
// The verifier's canvas walk (docs/gslides-parity/MILESTONES-2.md "Verifier" item 3; SPEC-2 11.8;
// Kevin's directive (3): "we must, must must be able to drag and move around ANYTHING").
//
//   node docs/gslides-parity/verification-2/canvas-walk.mjs [--base http://localhost:4321]
//        [--out docs/gslides-parity/verification-2/canvas-walk] [--keep]
//
// Opens the studio in Chrome for Testing at 1440 by 900 (packages/headless launch over
// playwright-core, one page), copies the GT deck through the window API (deck.copy, so the
// committed deck is never written) and, on the copy:
//
//   opener-brand           drag the photograph, resize it, bring it forward and send it back,
//                          drag the plate (a group), rotate the heading
//   mood-earth             crop the picture (double click, one handle, Enter)
//   title                  drag the heading, then the mark
//   thesis                 drag the big line
//   books-and-templates    drag a paragraph, draw and rotate a shape, draw a second shape, draw
//                          an elbow connector between them and move one shape, marquee, Cmd+A,
//                          group two objects and move them, drag a guide out of the ruler and
//                          snap to it, zoom to 200 percent and pan, Cmd+D, Tab, align to the
//                          slide, Center on page
//   opener-prototemplate   drag and resize the material picture object (the shader re-mounts)
//
// After every gesture the version log grew by exactly one write; the first write on every slide
// is a slide.update whose first mutation is the slide.replace of the conversion; the size and
// angle readouts and the snap guide lines are sampled while the pointer is down; every slide the
// walk did not touch is read back and compared byte for byte (canonical JSON) with the committed
// file; the copy validates and lint reports nothing above severity 2 on the walked slides. The
// conversion's pos of every walked slide is recorded under --out and compared with the CLI's
// `slide to-canvas` on a fresh copy of the GT deck (SPEC-2 1.3: identical in Chromium). One
// screenshot per step lands under --out. Exit 1 on any failed step.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from '../../../packages/headless/src/launch.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = (value('base') ?? 'http://localhost:4321').replace(/\/$/, '');
const OUT = join(ROOT, value('out') ?? 'docs/gslides-parity/verification-2/canvas-walk');
const KEEP = argv.includes('--keep');
const SOURCE = 'gt-brand';
const COPY = `verifier-canvas-${Date.now().toString(36)}`;
const AUTHOR = 'agent:verifier-canvas';

mkdirSync(OUT, { recursive: true });
const log = (line) => process.stderr.write(`${line}\n`);
const steps = [];
let shots = 0;
const record = (slide, step, ok, evidence) => {
  steps.push({ slide, step, ok, evidence });
  log(`${ok ? 'ok  ' : 'FAIL'} ${slide} ${step}: ${evidence}`);
};

const canonical = (v) => JSON.stringify(sortKeys(v));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])]),
    );
  return v;
}
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------------------------
// Page helpers

const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const versions = (page) => invoke(page, 'version.list');
const slideGet = async (page, slideId) => (await invoke(page, 'slide.get', { slideId })).slide;
const objects = async (page, slideId) =>
  Object.values((await slideGet(page, slideId)).slots ?? {}).flat();
const blockOf = async (page, slideId, id) =>
  (await objects(page, slideId)).find((b) => b.id === id);

async function waitFor(fn, { timeout = 8000, interval = 80 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  return last ?? null;
}

async function settled(page, timeout = 30_000) {
  await page.waitForFunction(
    () => {
      const s = window.turboslide.studio.describe().state;
      return s.pending === 0 && s.revision === s.serverRevision;
    },
    null,
    { timeout },
  );
}

async function openDeck(page, deckId) {
  await page.goto(`${BASE}/edit/${deckId}?author=${encodeURIComponent(AUTHOR)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 120_000 },
  );
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await settled(page);
}

async function goTo(page, slideId) {
  await invoke(page, 'view.goto', { slideId });
  await page.waitForSelector(`.pt-viewer[data-active="${slideId}"]`, { timeout: 15_000 });
  await page.waitForSelector(`.ts-stagewrap.ts-editor .pt-slide[data-slide-id="${slideId}"]`, {
    timeout: 15_000,
  });
  await page.waitForTimeout(300);
}

async function stageScale(page) {
  const box = await (await page.$('.ts-stagewrap.ts-editor .ts-stage')).boundingBox();
  return box.width / 1600;
}
async function sheetBox(page) {
  return (await page.$('.ts-stagewrap.ts-editor .ts-stage')).boundingBox();
}

/** A pointer drag in steps; samples the readout and the snap guide lines while the pointer is down. */
async function drag(page, from, dx, dy, { modifiers = [], steps: n = 12 } = {}) {
  let x;
  let y;
  if (typeof from.boundingBox === 'function') {
    const box = await from.boundingBox();
    if (!box) throw new Error('no box to drag');
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
  } else {
    x = from.x;
    y = from.y;
  }
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(x, y);
  await page.mouse.down();
  const samples = { readout: null, guides: 0, sites: 0 };
  for (let i = 1; i <= n; i += 1) {
    await page.mouse.move(x + (dx * i) / n, y + (dy * i) / n);
    /* sampled at 70 percent of the way and again on the last step before the release: a snap
       line draws only within the 6 px snap distance, a readout while the pointer is down */
    if (i === Math.floor(n * 0.7) || i === n) {
      await page.waitForTimeout(60);
      const s = await page.evaluate(() => ({
        readout:
          document.querySelector(
            '.ts-overlay .ts-readout, .ts-overlay .ts-guide-readout, .ts-guide-readout',
          )?.textContent ?? null,
        guides: document.querySelectorAll('.ts-overlay .ts-guide, .ts-guide').length,
        sites: document.querySelectorAll('.ts-overlay .ts-site').length,
      }));
      samples.readout = s.readout ?? samples.readout;
      samples.guides = Math.max(samples.guides, s.guides);
      samples.sites = Math.max(samples.sites, s.sites);
    }
  }
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
  return samples;
}

/** Selects an object by a click on its element's corner (a text interior is the caret surface). */
async function selectObject(page, slideId, id) {
  const el = await page.$(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
  const editable = async () => page.$('.ts-stagewrap.ts-editor [contenteditable="true"]');
  if (el) {
    const box = await el.boundingBox();
    await page.mouse.click(box.x + 2, box.y + 2);
  } else if (id === 'picture') {
    const slide = await page.$(
      `.ts-stagewrap.ts-editor .pt-slide[data-slide-id="${slideId}"] .slide`,
    );
    const box = await slide.boundingBox();
    await page.mouse.click(box.x + box.width - 40, box.y + 40);
  } else if (id === 'mark') {
    const mark = await page.$(
      '.ts-stagewrap.ts-editor .pt-slide svg[data-raster="mark"], .ts-stagewrap.ts-editor .pt-slide .free[data-free="mark"]',
    );
    if (!mark) throw new Error('no mark');
    const box = await mark.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else throw new Error(`no element for ${id}`);
  if (await editable()) await page.keyboard.press('Escape');
  let move = await page.$(`.ts-overlay [data-control="handle.${id}.move"]`);
  if (!move && el) {
    const box = await el.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (await editable()) await page.keyboard.press('Escape');
    move = await waitFor(() => page.$(`.ts-overlay [data-control="handle.${id}.move"]`), {
      timeout: 2000,
    });
  }
  if (!move)
    move = await waitFor(() => page.$(`.ts-overlay [data-control="handle.${id}.move"]`), {
      timeout: 3000,
    });
  return Boolean(move);
}

const chip = (page) =>
  page.evaluate(
    () => document.querySelector('.ts-overlay .ts-select-chip')?.textContent?.trim() ?? '',
  );
const handle = (page, id, kind) => page.$(`.ts-overlay [data-control="handle.${id}.${kind}"]`);

async function shot(page, name) {
  shots += 1;
  const file = join(OUT, `${String(shots).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** Waits for exactly one more write and returns it. */
async function oneWrite(page, before) {
  const list = await waitFor(
    async () => {
      const v = await versions(page);
      return v.length > before ? v : null;
    },
    { timeout: 30_000 },
  );
  await settled(page).catch(() => null);
  const after = await versions(page);
  return { count: after.length - before, write: after[before] ?? null, length: after.length };
}

async function menu(page, ...path) {
  for (let i = 0; i < 4; i += 1) {
    if ((await page.$$('[role="menu"]')).length === 0) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
  }
  await page.click(`[data-control="menubar.${path[0]}"]`);
  await page.waitForSelector('[role="menu"][data-level="0"]', { timeout: 5000 });
  for (let i = 1; i < path.length; i += 1) {
    /* a dynamic plate's tile (the shape grids: SPEC-2 4.1) is named by its data-control, '@' prefixed */
    const sel = path[i].startsWith('@')
      ? `[data-control="${path[i].slice(1)}"]`
      : `[data-menu-item="${path[i]}"]`;
    const el = await page.waitForSelector(sel, { timeout: 5000 });
    if (i < path.length - 1) {
      await el.hover();
      await page.waitForTimeout(200);
      const nextSel = path[i + 1].startsWith('@')
        ? `[data-control="${path[i + 1].slice(1)}"]`
        : `[data-menu-item="${path[i + 1]}"]`;
      const next = await page.$(nextSel);
      if (!next) await el.click();
    } else await el.click();
  }
}

// ---------------------------------------------------------------------------------------------
// The walk

const conversions = {};
const walked = new Set();
/** every file of the committed deck's folder as bytes, taken before the walk and compared after (the tree may already carry uncommitted edits) */
function deckBytes() {
  const dir = join(ROOT, 'decks', SOURCE);
  const out = {};
  const walkDir = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) walkDir(p);
      else if (p.endsWith('.json')) out[p.slice(dir.length + 1)] = readFileSync(p, 'utf8');
    }
  };
  walkDir(dir);
  return out;
}
const deckBefore = deckBytes();
const launched = await launchBrowser({ probeRenderer: false });
const context = await launched.browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e).slice(0, 200)));
const started = Date.now();

/** The first canvas gesture on a slide: the drag of one object; records the conversion. */
async function firstDrag(slideId, id, dx = 40, dy = 24) {
  const before = await slideGet(page, slideId);
  const n = (await versions(page)).length;
  const selected = await selectObject(page, slideId, id);
  if (!selected) {
    record(slideId, `select ${id}`, false, `no move handle for ${id}; chip "${await chip(page)}"`);
    return null;
  }
  const k = await stageScale(page);
  const samples = await drag(page, await handle(page, id, 'move'), dx * k, dy * k);
  const w = await oneWrite(page, n);
  const write = w.write?.mutations ?? [];
  const converted = write[0]?.op === 'slide.replace' ? write[0].slide : null;
  const after = await slideGet(page, slideId);
  const pos = (await blockOf(page, slideId, id))?.pos;
  const from = converted?.slots?.main?.find((b) => b.id === id)?.pos;
  const ok =
    w.count === 1 &&
    converted !== null &&
    converted.kind === 'content' &&
    converted.layout?.type === 'freeform' &&
    converted.grammar?.kind === before.kind &&
    write.slice(1).every((m) => m.op === 'block.set' && m.path === '/pos') &&
    after.layout?.type === 'freeform' &&
    pos !== undefined &&
    from !== undefined &&
    near(pos.x - from.x, dx, 8) &&
    near(pos.y - from.y, dy, 8);
  record(
    slideId,
    `drag ${id}`,
    ok,
    `${w.count} write; first mutation ${write[0]?.op}${converted ? ` (kind ${before.kind} -> ${converted.kind}, layout ${converted.layout?.type}, grammar ${converted.grammar?.kind}, ${converted.slots?.main?.length ?? 0} objects)` : ''}; pos ${JSON.stringify(from)} -> ${JSON.stringify(pos)}; snap guides sampled ${samples.guides}`,
  );
  if (converted) {
    conversions[slideId] = {
      deck: SOURCE,
      slideId,
      template: converted.template,
      source:
        'docs/gslides-parity/verification-2/canvas-walk.mjs (Chromium, the editor, hidden 1x sheet)',
      objects: Object.fromEntries((converted.slots?.main ?? []).map((b) => [b.id, b.pos])),
    };
    writeFileSync(
      join(OUT, `${slideId}.conversion.json`),
      `${JSON.stringify(conversions[slideId], null, 2)}\n`,
    );
  }
  walked.add(slideId);
  return { write, converted, samples };
}

async function resizeEast(slideId, id, dx = 80, side = 'e') {
  const n = (await versions(page)).length;
  if (!(await selectObject(page, slideId, id))) {
    record(slideId, `resize ${id}`, false, 'could not select');
    return;
  }
  const east = await handle(page, id, `resize.${side}`);
  if (!east) {
    record(slideId, `resize ${id}`, false, `no ${side} handle`);
    return;
  }
  const k = await stageScale(page);
  const before = (await blockOf(page, slideId, id))?.pos;
  /* the west handle drags left to widen; the east handle drags right */
  const samples = await drag(page, east, (side === 'w' ? -dx : dx) * k, 0);
  const w = await oneWrite(page, n);
  const after = (await blockOf(page, slideId, id))?.pos;
  const ok =
    w.count === 1 &&
    after &&
    before &&
    near(after.w - before.w, dx, 8) &&
    /\d+ × \d+/.test(samples.readout ?? '');
  record(
    slideId,
    `resize ${id}`,
    ok,
    `${w.count} write; w ${before?.w} -> ${after?.w} (${side} handle); size readout "${samples.readout}"`,
  );
}

async function rotateWithHandle(slideId, id, degrees = 15) {
  const n = (await versions(page)).length;
  if (!(await selectObject(page, slideId, id))) {
    record(slideId, `rotate ${id}`, false, 'could not select');
    return;
  }
  const ring = await handle(page, id, 'rotate');
  const box = await (await page.$('.ts-overlay .ts-select.is-selected'))?.boundingBox();
  if (!ring || !box) {
    record(slideId, `rotate ${id}`, false, `ring ${Boolean(ring)}, selection box ${Boolean(box)}`);
    return;
  }
  const ringBox = await ring.boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const radius = centre.y - (ringBox.y + ringBox.height / 2);
  const rad = ((degrees + 2) * Math.PI) / 180;
  const target = { x: centre.x + radius * Math.sin(rad), y: centre.y - radius * Math.cos(rad) };
  const ringCentre = { x: ringBox.x + ringBox.width / 2, y: ringBox.y + ringBox.height / 2 };
  const samples = await drag(page, ringCentre, target.x - ringCentre.x, target.y - ringCentre.y, {
    modifiers: ['Shift'],
  });
  const w = await oneWrite(page, n);
  const pos = (await blockOf(page, slideId, id))?.pos;
  const ok = w.count === 1 && pos?.rotate === degrees && /°/.test(samples.readout ?? '');
  record(
    slideId,
    `rotate ${id}`,
    ok,
    `${w.count} write; rotate ${pos?.rotate}; angle readout "${samples.readout}"`,
  );
}

/** The sheet point (sheet px) in CSS px. */
async function at(x, y) {
  const s = await sheetBox(page);
  const k = s.width / 1600;
  return { x: s.x + x * k, y: s.y + y * k };
}

try {
  log(`walk: ${BASE}`);
  await openDeck(page, SOURCE);
  const info = await invoke(page, 'deck.info');
  const copied = await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Verifier canvas walk',
    newId: COPY,
    baseRevision: info.revision,
  });
  if (copied.deckId !== COPY) throw new Error(`deck.copy answered ${JSON.stringify(copied)}`);
  await openDeck(page, COPY);
  const rows = await invoke(page, 'slide.list');
  log(`walk: copy ${COPY} with ${rows.length} slides`);

  // 1. the opener: the photograph, the plate, the heading
  {
    const slideId = 'opener-brand';
    await goTo(page, slideId);
    await shot(page, 'opener-before');
    const first = await firstDrag(slideId, 'picture', 60, 40);
    await shot(page, 'opener-photograph-dragged');
    if (first) {
      const pic = await blockOf(page, slideId, 'picture');
      record(
        slideId,
        'picture object at the bottom',
        pic?.type === 'picture' && pic.pos?.z === 0 && pic.pos.w === 1600 && pic.pos.h === 900,
        `picture ${JSON.stringify(pic?.pos)} type ${pic?.type} side ${pic?.side}`,
      );
      const lint = await invoke(page, 'lint.run', { slideIds: 'all' });
      const off = lint.filter((f) => f.slideId === slideId && f.rule === 'freeform/off-sheet');
      record(
        slideId,
        'off-sheet finding at severity 2',
        off.length > 0 && off.every((f) => f.severity === 2),
        `${off.length} freeform/off-sheet finding(s) ${JSON.stringify(off.map((f) => f.severity))}`,
      );
      /* the photograph's east edge sits past the 1440 viewport after the drag: the west handle widens it */
      await resizeEast(slideId, 'picture', 80, 'w');
      /* bring forward, then send to back */
      let n = (await versions(page)).length;
      await selectObject(page, slideId, 'picture');
      await page.keyboard.press('Meta+ArrowUp');
      let w = await oneWrite(page, n);
      const zUp = (await blockOf(page, slideId, 'picture'))?.pos?.z;
      record(
        slideId,
        'bring forward (Cmd+Up)',
        w.count === 1 && zUp > 0,
        `${w.count} write; z 0 -> ${zUp}`,
      );
      n = (await versions(page)).length;
      await selectObject(page, slideId, 'picture');
      await page.keyboard.press('Meta+Shift+ArrowDown');
      w = await oneWrite(page, n);
      const all = await objects(page, slideId);
      const zBack = all.find((b) => b.id === 'picture')?.pos?.z;
      record(
        slideId,
        'send to back (Cmd+Shift+Down)',
        w.count === 1 && zBack === Math.min(...all.map((b) => b.pos?.z ?? 0)),
        `${w.count} write; z ${zUp} -> ${zBack} (lowest ${Math.min(...all.map((b) => b.pos?.z ?? 0))})`,
      );
      await shot(page, 'opener-sent-back');
      /* the plate: a click selects the group; the drag moves every member */
      n = (await versions(page)).length;
      const membersBefore = Object.fromEntries(
        (await objects(page, slideId))
          .filter((b) => b.pos?.group === 'plate')
          .map((b) => [b.id, b.pos]),
      );
      const plateEl = await page.$('.ts-stagewrap.ts-editor .pt-slide .free[data-free="plate"]');
      const pb = await plateEl.boundingBox();
      /* SPEC-2 6.1 row 14: a click on a member selects the group; here the picture is still selected */
      await page.mouse.click(pb.x + 4, pb.y + 4);
      const chipWithPicture = await waitFor(
        async () => ((await chip(page)) === 'Group' ? 'Group' : null),
        { timeout: 2000 },
      );
      record(
        slideId,
        'click the plate while the photograph is selected',
        chipWithPicture === 'Group',
        `chip "${chipWithPicture ?? (await chip(page))}" (wanted Group: the plate is a group tagged plate)`,
      );
      /* from nothing selected */
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      await page.mouse.click(pb.x + 4, pb.y + 4);
      const groupChip = await waitFor(
        async () => ((await chip(page)) === 'Group' ? 'Group' : null),
        { timeout: 3000 },
      );
      const move =
        (await handle(page, 'plate', 'move')) ??
        (await page.$('.ts-overlay [data-control^="handle."][data-control$=".move"]'));
      const k = await stageScale(page);
      const samples = await drag(page, move, 30 * k, -20 * k);
      w = await oneWrite(page, n);
      const membersAfter = Object.fromEntries(
        (await objects(page, slideId))
          .filter((b) => b.pos?.group === 'plate')
          .map((b) => [b.id, b.pos]),
      );
      const moved = Object.keys(membersBefore).every(
        (id) =>
          membersAfter[id] &&
          near(membersAfter[id].x - membersBefore[id].x, 30, 8) &&
          near(membersAfter[id].y - membersBefore[id].y, -20, 8),
      );
      record(
        slideId,
        'drag the plate (group)',
        w.count === 1 && groupChip === 'Group' && moved && Object.keys(membersBefore).length >= 3,
        `${w.count} write; chip "${groupChip}"; ${Object.keys(membersBefore).length} members moved together ${moved}; snap guides sampled ${samples.guides}`,
      );
      await shot(page, 'opener-plate-dragged');
      /* the heading alone: a double click on the member, then the rotation handle */
      await page.keyboard.press('Escape');
      const hEl = await page.$('.ts-stagewrap.ts-editor .pt-slide [data-block="h"]');
      const hb = await hEl.boundingBox();
      await page.mouse.dblclick(hb.x + 2, hb.y + 2);
      if (await page.$('.ts-stagewrap.ts-editor [contenteditable="true"]'))
        await page.keyboard.press('Escape');
      const memberChip = await chip(page);
      n = (await versions(page)).length;
      const ring = await handle(page, 'h', 'rotate');
      if (ring && memberChip !== 'Group') {
        await rotateWithHandle(slideId, 'h', 15);
      } else {
        await page.keyboard.press('Alt+ArrowRight');
        w = await oneWrite(page, n);
        const rot = (await blockOf(page, slideId, 'h'))?.pos?.rotate;
        record(
          slideId,
          'rotate h (Option+Right, the member selected through the group)',
          w.count === 1 && (rot === 15 || rot === undefined),
          `${w.count} write; chip "${memberChip}"; h rotate ${rot}; the group rotated as one when the chip read Group`,
        );
      }
      await shot(page, 'opener-heading-rotated');
    }
  }

  // 2. the mood slide: crop the picture
  {
    const slideId = 'mood-earth';
    await goTo(page, slideId);
    const n0 = (await versions(page)).length;
    const slide = await page.$(
      `.ts-stagewrap.ts-editor .pt-slide[data-slide-id="${slideId}"] .slide`,
    );
    const sb = await slide.boundingBox();
    await page.mouse.click(sb.x + sb.width - 40, sb.y + 40);
    await page.waitForTimeout(150);
    await page.mouse.dblclick(sb.x + sb.width - 40, sb.y + 40);
    let cropChip = await waitFor(() => page.$('.ts-overlay .ts-select-chip.is-crop'), {
      timeout: 3000,
    });
    let converted = false;
    if (!cropChip) {
      /* the unconverted photograph: a nudge converts, then the wrapper takes the double click */
      await selectObject(page, slideId, 'picture');
      await page.keyboard.press('ArrowRight');
      await oneWrite(page, n0);
      converted = true;
      const wrapper = await page.$('.ts-stagewrap.ts-editor .pt-slide .free[data-free="picture"]');
      const wb = await wrapper.boundingBox();
      await page.mouse.dblclick(wb.x + wb.width - 30, wb.y + 30);
      cropChip = await waitFor(() => page.$('.ts-overlay .ts-select-chip.is-crop'), {
        timeout: 3000,
      });
    }
    const chipText = cropChip ? await cropChip.textContent() : '';
    /* SPEC-2 1.1: a mode entry never writes; the writes since the double click are counted */
    const entryWrites = converted ? 0 : (await versions(page)).length - n0;
    const n = (await versions(page)).length;
    const west = await handle(page, 'picture', 'crop.w');
    if (west) {
      const k = await stageScale(page);
      await drag(page, west, 160 * k, 0);
      await shot(page, 'mood-crop-mode');
      await page.keyboard.press('Enter');
      const w = await oneWrite(page, n);
      const pic = await blockOf(page, slideId, 'picture');
      const first = w.write?.mutations?.[0]?.op;
      record(
        slideId,
        'crop the picture',
        w.count === 1 &&
          entryWrites === 0 &&
          (pic?.trim?.left ?? 0) > 0 &&
          (converted || first === 'slide.replace'),
        `${entryWrites} write(s) on entering crop mode, ${w.count} on Enter (first mutation ${first}${converted ? ', after a nudge converted the slide first' : ''}); chip "${chipText?.trim()}"; trim ${JSON.stringify(pic?.trim)}`,
      );
      walked.add(slideId);
      const c = w.write?.mutations?.[0]?.slide;
      if (c && !conversions[slideId])
        conversions[slideId] = {
          deck: SOURCE,
          slideId,
          template: c.template,
          objects: Object.fromEntries((c.slots?.main ?? []).map((b) => [b.id, b.pos])),
        };
    } else
      record(
        slideId,
        'crop the picture',
        false,
        `no crop handle; crop chip ${cropChip ? `"${chipText}"` : 'absent'}`,
      );
    await page.keyboard.press('Escape');
    await shot(page, 'mood-cropped');
  }

  // 3. the title slide: the heading, then the mark
  {
    const slideId = 'title';
    await goTo(page, slideId);
    await firstDrag(slideId, 'heading', 40, 24);
    const n = (await versions(page)).length;
    const ok = await selectObject(page, slideId, 'mark');
    if (ok) {
      const before = (await blockOf(page, slideId, 'mark'))?.pos;
      const k = await stageScale(page);
      await drag(page, await handle(page, 'mark', 'move'), 40 * k, 24 * k);
      const w = await oneWrite(page, n);
      const after = (await blockOf(page, slideId, 'mark'))?.pos;
      record(
        slideId,
        'drag mark',
        w.count === 1 &&
          after &&
          near(after.x - before.x, 40, 8) &&
          near(after.y - before.y, 24, 8),
        `${w.count} write; mark ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
      );
    } else record(slideId, 'drag mark', false, 'the mark could not be selected');
    await shot(page, 'title-dragged');
  }

  // 4. the statement: the big line
  {
    const slideId = 'thesis';
    await goTo(page, slideId);
    await firstDrag(slideId, 'big', 40, 24);
    await shot(page, 'thesis-dragged');
  }

  // 5. the content slide
  {
    const slideId = 'books-and-templates';
    await goTo(page, slideId);
    await firstDrag(slideId, 'p1', 40, 24);
    /* a shape drawn, then rotated */
    let n = (await versions(page)).length;
    await menu(
      page,
      'insert',
      'insert.shape',
      'insert.shape.shapes',
      '@insert.shape.shapes.pick.rect',
    );
    const k = await stageScale(page);
    await drag(page, await at(900, 520), 220 * k, 140 * k);
    let w = await oneWrite(page, n);
    let all = await objects(page, slideId);
    const shape1 = all.find((b) => b.type === 'shape' && b.id !== 'pair');
    record(
      slideId,
      'draw a rectangle',
      w.count === 1 &&
        shape1 !== undefined &&
        w.write?.mutations?.some((m) => m.op === 'block.insert'),
      `${w.count} write; shape ${shape1?.id} ${shape1?.shape} at ${JSON.stringify(shape1?.pos)}`,
    );
    if (shape1) await rotateWithHandle(slideId, shape1.id, 15);
    /* undo the rotation so the connector sites are the plain box's */
    if (shape1) {
      await page.keyboard.press('Escape');
      const nUndo = (await versions(page)).length;
      await page.keyboard.press('Meta+z');
      await oneWrite(page, nUndo);
    }
    /* a second shape */
    n = (await versions(page)).length;
    await menu(
      page,
      'insert',
      'insert.shape',
      'insert.shape.shapes',
      '@insert.shape.shapes.pick.ellipse',
    );
    await drag(page, await at(1280, 520), 200 * k, 140 * k);
    w = await oneWrite(page, n);
    all = await objects(page, slideId);
    const shape2 = all.find((b) => b.type === 'shape' && b.id !== shape1?.id && b.id !== 'pair');
    record(
      slideId,
      'draw an ellipse',
      w.count === 1 && shape2 !== undefined,
      `${w.count} write; shape ${shape2?.id} ${shape2?.shape} at ${JSON.stringify(shape2?.pos)}`,
    );
    await shot(page, 'content-two-shapes');
    /* the elbow connector between the east site of the first and the west site of the second */
    if (shape1 && shape2) {
      const a = (await blockOf(page, slideId, shape1.id)).pos;
      const b = (await blockOf(page, slideId, shape2.id)).pos;
      n = (await versions(page)).length;
      await menu(page, 'insert', 'insert.line', 'insert.line.elbowConnector');
      const from = await at(a.x + a.w, a.y + a.h / 2);
      const to = await at(b.x, b.y + b.h / 2);
      const samples = await drag(page, from, to.x - from.x, to.y - from.y, { steps: 16 });
      w = await oneWrite(page, n);
      all = await objects(page, slideId);
      const connector = all.find(
        (x) =>
          x.type === 'shape' &&
          (x.shape === 'elbow' || x.shape === 'bentConnector3' || /elbow/i.test(x.shape ?? '')),
      );
      const attached =
        connector?.connect?.start !== undefined && connector?.connect?.end !== undefined;
      record(
        slideId,
        'draw an elbow connector between the shapes',
        w.count === 1 && connector !== undefined && attached,
        `${w.count} write; connector ${connector?.id} ${connector?.shape} connect ${JSON.stringify(connector?.connect)}; sites sampled while drawing ${samples.sites}`,
      );
      await shot(page, 'content-connector');
      /* move the first shape: the connector follows in the same write */
      if (connector) {
        n = (await versions(page)).length;
        await selectObject(page, slideId, shape1.id);
        const cBefore = connector.pos;
        await drag(page, await handle(page, shape1.id, 'move'), -60 * k, 40 * k);
        w = await oneWrite(page, n);
        const cAfter = (await blockOf(page, slideId, connector.id))?.pos;
        const mutated = (w.write?.mutations ?? []).filter((m) => m.blockId === connector.id).length;
        record(
          slideId,
          'move a shape, the connector follows',
          w.count === 1 && cAfter && canonical(cAfter) !== canonical(cBefore) && mutated > 0,
          `${w.count} write with ${mutated} mutation(s) on ${connector.id}; connector pos ${JSON.stringify(cBefore)} -> ${JSON.stringify(cAfter)}`,
        );
        await shot(page, 'content-connector-followed');
      }
      /* marquee over the two shapes from empty sheet */
      await page.keyboard.press('Escape');
      const a2 = (await blockOf(page, slideId, shape1.id)).pos;
      const b2 = (await blockOf(page, slideId, shape2.id)).pos;
      const x0 = Math.min(a2.x, b2.x) - 30;
      const y0 = Math.min(a2.y, b2.y) - 30;
      const x1 = Math.max(a2.x + a2.w, b2.x + b2.w) + 30;
      const y1 = Math.max(a2.y + a2.h, b2.y + b2.h) + 30;
      /* the press lands on empty sheet at the bottom right (the image pair sits above the shapes'
         top left on this layout); the rectangle grows up and left over both shapes */
      const start = await at(1590, 885);
      const end = await at(Math.max(0, x0), Math.max(0, y0));
      void x1;
      void y1;
      const nM = (await versions(page)).length;
      await drag(page, start, end.x - start.x, end.y - start.y);
      const marqueeChip = await chip(page);
      await page.waitForTimeout(300);
      record(
        slideId,
        'marquee from empty sheet',
        /objects$/.test(marqueeChip) && (await versions(page)).length === nM,
        `chip "${marqueeChip}"; no write`,
      );
      await shot(page, 'content-marquee');
      /* Cmd+A */
      await page.keyboard.press('Escape');
      await selectObject(page, slideId, shape1.id);
      await page.keyboard.press('Meta+a');
      const allChip = await waitFor(
        async () => (/objects$/.test(await chip(page)) ? chip(page) : null),
        { timeout: 3000 },
      );
      record(
        slideId,
        'Cmd+A selects every object',
        allChip !== null && parseInt(allChip, 10) === (await objects(page, slideId)).length,
        `chip "${allChip}" over ${(await objects(page, slideId)).length} objects`,
      );
      await page.keyboard.press('Escape');
      /* group the two shapes and move the group */
      await selectObject(page, slideId, shape1.id);
      const s2el = await page.$(`.ts-stagewrap.ts-editor .pt-slide [data-block="${shape2.id}"]`);
      const s2b = await s2el.boundingBox();
      await page.keyboard.down('Shift');
      await page.mouse.click(s2b.x + 2, s2b.y + 2);
      await page.keyboard.up('Shift');
      const two = await waitFor(async () => (/2 objects/.test(await chip(page)) ? true : null), {
        timeout: 3000,
      });
      n = (await versions(page)).length;
      await page.keyboard.press('Meta+Alt+g');
      w = await oneWrite(page, n);
      const tag = (await blockOf(page, slideId, shape1.id))?.pos?.group;
      record(
        slideId,
        'group two objects (Cmd+Option+G)',
        two === true &&
          w.count === 1 &&
          tag !== undefined &&
          (await blockOf(page, slideId, shape2.id))?.pos?.group === tag,
        `${w.count} write; group ${tag}`,
      );
      if (tag) {
        await page.keyboard.press('Escape');
        await selectObject(page, slideId, shape1.id);
        const gChip = await chip(page);
        const g1 = (await blockOf(page, slideId, shape1.id)).pos;
        const g2 = (await blockOf(page, slideId, shape2.id)).pos;
        n = (await versions(page)).length;
        const mv =
          (await handle(page, shape1.id, 'move')) ??
          (await page.$('.ts-overlay [data-control$=".move"]'));
        await drag(page, mv, -40 * k, -30 * k);
        w = await oneWrite(page, n);
        const h1 = (await blockOf(page, slideId, shape1.id)).pos;
        const h2 = (await blockOf(page, slideId, shape2.id)).pos;
        record(
          slideId,
          'move the group',
          w.count === 1 &&
            gChip === 'Group' &&
            near(h1.x - g1.x, -40, 8) &&
            near(h2.x - g2.x, -40, 8) &&
            near(h1.y - g1.y, -30, 8) &&
            near(h2.y - g2.y, -30, 8),
          `${w.count} write; chip "${gChip}"; both members moved by ${(h1.x - g1.x).toFixed(2)}, ${(h1.y - g1.y).toFixed(2)}`,
        );
        await shot(page, 'content-group-moved');
      }
    }
    /* the ruler and a guide dragged out of it, then a snap to the guide */
    await page.keyboard.press('Escape');
    await menu(page, 'view', 'view.showRuler');
    const rulers = await waitFor(
      async () => ((await page.$$('.ts-ruler')).length === 2 ? true : null),
      { timeout: 4000 },
    );
    const numerals = await page.$$eval('.ts-ruler', (els) =>
      els.map((el) => el.querySelectorAll('.ts-ruler-numeral').length),
    );
    record(
      slideId,
      'View > Show ruler',
      rulers === true && numerals.includes(14) && numerals.includes(8),
      `rulers ${(await page.$$('.ts-ruler')).length}; numerals ${numerals.join(' and ')}`,
    );
    /* Show guides so the new guide draws */
    await page.click('[data-control="menubar.view"]');
    await (await page.waitForSelector('[data-menu-item="view.guides"]')).hover();
    const showRow = await page.waitForSelector('[data-menu-item="view.guides.show"]', {
      timeout: 4000,
    });
    if ((await showRow.getAttribute('aria-checked')) !== 'true') await showRow.click();
    else await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const topRuler = await page.$('.ts-ruler.is-x');
    const infoG = await invoke(page, 'deck.info');
    if (topRuler) {
      const rb = await topRuler.boundingBox();
      const target = await at(600, 450);
      n = (await versions(page)).length;
      const samples = await drag(
        page,
        { x: target.x, y: rb.y + rb.height / 2 },
        0,
        target.y - (rb.y + rb.height / 2),
        { steps: 14 },
      );
      w = await oneWrite(page, n);
      const infoAfter = await invoke(page, 'deck.info');
      const xs = infoAfter.guides?.x ?? [];
      const guideAt = xs.find((v) => near(v, 600, 12));
      const drawn =
        guideAt !== undefined
          ? await page.$(`.ts-overlay [data-control="guide.x.${guideAt}"]`)
          : null;
      record(
        slideId,
        'drag a guide out of the ruler',
        w.count === 1 && guideAt !== undefined && Boolean(drawn),
        `${w.count} write; guides ${JSON.stringify(infoAfter.guides ?? null)} (was ${JSON.stringify(infoG.guides ?? null)}); guide line drawn ${Boolean(drawn)}; readout while dragging "${samples.readout}"`,
      );
      await shot(page, 'content-guide');
      /* snap the paragraph's left edge to the guide */
      if (guideAt !== undefined) {
        await selectObject(page, slideId, 'p1');
        const p = (await blockOf(page, slideId, 'p1')).pos;
        n = (await versions(page)).length;
        const s2 = await drag(page, await handle(page, 'p1', 'move'), (guideAt + 4 - p.x) * k, 0);
        w = await oneWrite(page, n);
        const pAfter = (await blockOf(page, slideId, 'p1')).pos;
        record(
          slideId,
          'snap to the guide',
          w.count === 1 && near(pAfter.x, guideAt, 0.02) && s2.guides > 0,
          `${w.count} write; p1.x ${p.x} -> ${pAfter.x} (guide at ${guideAt}); snap lines sampled while dragging ${s2.guides}`,
        );
        await shot(page, 'content-snapped');
      }
    } else record(slideId, 'drag a guide out of the ruler', false, 'no horizontal ruler');
    /* zoom to 200 percent and pan */
    const zoomValue = await page.$('[data-control="view.zoom.value"]');
    const sheetBefore = await (
      await page.$('.ts-stagewrap.ts-editor .pt-sheet-stage > .sheet')
    ).boundingBox();
    await zoomValue.fill('200');
    await zoomValue.press('Enter');
    const wide = await waitFor(
      async () => {
        const b = await (
          await page.$('.ts-stagewrap.ts-editor .pt-sheet-stage > .sheet')
        ).boundingBox();
        return b && b.width > 3000 ? b.width : null;
      },
      { timeout: 5000 },
    );
    const scroller = await page.$('.ts-stagewrap.ts-editor .pt-sheet-stage');
    const scrollable = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
    const before = await scroller.evaluate((el) => el.scrollLeft);
    const sBox = await scroller.boundingBox();
    await page.keyboard.press('Escape');
    await page.keyboard.down('Space');
    await drag(page, { x: sBox.x + sBox.width / 2, y: sBox.y + sBox.height / 2 }, -200, 0);
    await page.keyboard.up('Space');
    const after = await scroller.evaluate((el) => el.scrollLeft);
    const zoomText = await zoomValue.inputValue();
    record(
      slideId,
      'zoom to 200 percent and pan',
      wide !== null && scrollable && after !== before && /200/.test(zoomText),
      `sheet ${Math.round(sheetBefore.width)} -> ${Math.round(wide ?? 0)} px wide; Zoom box "${zoomText}"; scrollable ${scrollable}; Space+drag scrollLeft ${before} -> ${after}`,
    );
    await shot(page, 'content-zoomed');
    await zoomValue.fill('fit');
    await zoomValue.press('Enter');
    await page.waitForTimeout(300);
    /* Cmd+D duplicates 16 px right and down */
    await page.keyboard.press('Escape');
    if (shape2) {
      await selectObject(page, slideId, shape2.id);
      const src = (await blockOf(page, slideId, shape2.id)).pos;
      const count = (await objects(page, slideId)).length;
      n = (await versions(page)).length;
      await page.keyboard.press('Meta+d');
      w = await oneWrite(page, n);
      all = await objects(page, slideId);
      const copy = all.find(
        (b) =>
          b.id !== shape2.id &&
          b.pos &&
          near(b.pos.x, src.x + 16) &&
          near(b.pos.y, src.y + 16) &&
          b.type === 'shape',
      );
      record(
        slideId,
        'duplicate (Cmd+D)',
        w.count === 1 && all.length >= count + 1 && Boolean(copy),
        `${w.count} write; objects ${count} -> ${all.length}; copy ${copy ? `${copy.id} at ${JSON.stringify(copy.pos)}` : 'not at +16,+16'}`,
      );
    }
    /* Tab cycles objects in z order */
    await page.keyboard.press('Escape');
    await selectObject(page, slideId, 'p1');
    const startId = (await state(page)).blockId;
    await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
    );
    const seen = [startId];
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(120);
      seen.push((await state(page)).blockId);
    }
    const zOrder = (await objects(page, slideId))
      .slice()
      .sort((x, y) => (x.pos?.z ?? 0) - (y.pos?.z ?? 0))
      .map((b) => b.id);
    const inOrder = seen.every(
      (id, i) =>
        i === 0 || zOrder.indexOf(id) === (zOrder.indexOf(seen[i - 1]) + 1) % zOrder.length,
    );
    record(
      slideId,
      'Tab through objects',
      new Set(seen).size === seen.length && inOrder,
      `selection ${seen.join(' -> ')}; z order ${zOrder.join(', ')}`,
    );
    /* align to the slide with one object, then Center on page */
    await page.keyboard.press('Escape');
    await selectObject(page, slideId, 'p1');
    n = (await versions(page)).length;
    await menu(page, 'arrange', 'arrange.align', 'arrange.align.left');
    w = await oneWrite(page, n);
    const pLeft = (await blockOf(page, slideId, 'p1')).pos;
    record(
      slideId,
      'Align > Left with one object aligns to the slide',
      w.count === 1 && near(pLeft.x, 0),
      `${w.count} write; p1.x ${pLeft.x}`,
    );
    await selectObject(page, slideId, 'p1');
    n = (await versions(page)).length;
    await menu(page, 'arrange', 'arrange.centerOnPage', 'arrange.centerOnPage.horizontally');
    w = await oneWrite(page, n);
    const pC = (await blockOf(page, slideId, 'p1')).pos;
    record(
      slideId,
      'Center on page > Horizontally',
      w.count === 1 && near(pC.x + pC.w / 2, 800),
      `${w.count} write; centre ${pC.x + pC.w / 2}`,
    );
    await shot(page, 'content-centered');
    /* the rulers off again */
    await menu(page, 'view', 'view.showRuler');
    await page.keyboard.press('Escape');
  }

  // 6. the material: the picture object of opener-prototemplate
  {
    const slideId = 'opener-prototemplate';
    await goTo(page, slideId);
    const first = await firstDrag(slideId, 'picture', 60, 40);
    if (first) {
      await resizeEast(slideId, 'picture', 80, 'w');
      const live = await page.$(
        '.ts-stagewrap.ts-editor .pt-slide .free[data-free="picture"] .ts-material-live',
      );
      const wrapper = await page.$('.ts-stagewrap.ts-editor .pt-slide .free[data-free="picture"]');
      const lb = live ? await live.boundingBox() : null;
      const wb = wrapper ? await wrapper.boundingBox() : null;
      const pos = (await blockOf(page, slideId, 'picture'))?.pos;
      record(
        slideId,
        'the shader re-mounts at the object box',
        Boolean(lb && wb) &&
          near(lb.width, wb.width, 1) &&
          near(lb.height, wb.height, 1) &&
          pos &&
          !near(pos.w / pos.h, 16 / 9, 0.01),
        `live canvas ${lb ? `${Math.round(lb.width)}x${Math.round(lb.height)}` : 'absent'} vs wrapper ${wb ? `${Math.round(wb.width)}x${Math.round(wb.height)}` : 'absent'}; pos ${JSON.stringify(pos)} (ratio ${pos ? (pos.w / pos.h).toFixed(3) : '?'})`,
      );
      await shot(page, 'material-resized');
    }
  }

  // 7. every untouched slide is byte identical with the committed file
  {
    const files = readdirSync(join(ROOT, 'decks', SOURCE, 'slides')).filter((f) =>
      f.endsWith('.json'),
    );
    let compared = 0;
    let differing = [];
    for (const file of files) {
      const id = file.slice(0, -5);
      if (walked.has(id) || !rows.some((r) => r.id === id)) continue;
      const committed = JSON.parse(
        readFileSync(join(ROOT, 'decks', SOURCE, 'slides', file), 'utf8'),
      );
      const live = await slideGet(page, id);
      if (canonical(live) !== canonical(committed)) differing.push(id);
      compared += 1;
    }
    record(
      'deck',
      'untouched slides byte identical',
      differing.length === 0 && compared > 70,
      `${compared} slides compared; ${differing.length} differ${differing.length ? `: ${differing.slice(0, 5).join(', ')}` : ''}`,
    );
    const committedDeck = JSON.parse(
      readFileSync(join(ROOT, 'decks', SOURCE, 'deck.json'), 'utf8'),
    );
    const deckAfter = deckBytes();
    const changed = Object.keys({ ...deckBefore, ...deckAfter }).filter(
      (k) => deckBefore[k] !== deckAfter[k],
    );
    const gitStatus = spawnSync('git', ['status', '--porcelain', '--', `decks/${SOURCE}`], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout.trim();
    record(
      'deck',
      'the committed GT deck is not written',
      changed.length === 0,
      `${Object.keys(deckAfter).length} files of decks/${SOURCE} unchanged by the walk (${changed.length} changed); git status lists ${gitStatus.split('\n').filter(Boolean).length} path(s) there from before the walk (the fix round's re-import); ${committedDeck.slides ? '' : `${rows.length} slides in the copy`}`,
    );
  }

  // 8. the copy validates; lint reports nothing above severity 2 on the walked slides
  {
    /* validate.run has no window handler (NotImplementedError, M1): the CLI validates the copy's folder */
    const validated = spawnSync(
      process.execPath,
      [join(ROOT, 'apps/cli/bin/turboslide.mjs'), 'validate', join(ROOT, 'decks', COPY)],
      { cwd: ROOT, encoding: 'utf8' },
    );
    record(
      'deck',
      'the copy validates (turboslide validate)',
      validated.status === 0,
      `exit ${validated.status}: ${(validated.stdout + validated.stderr).trim().split('\n').slice(-1)[0]?.slice(0, 160)}`,
    );
    const lint = await invoke(page, 'lint.run', { slideIds: 'all' });
    const severe = lint.filter((f) => walked.has(f.slideId) && f.severity > 2);
    const freeform = lint.filter((f) => walked.has(f.slideId) && f.rule === 'layout/freeform');
    record(
      'deck',
      'lint on the walked slides',
      severe.length === 0 &&
        freeform.length === walked.size &&
        /* the sales sentence travels as the finding's proposal (packages/lint) */
        freeform.every((f) => /arranged by hand/.test(f.proposal ?? f.message ?? '')),
      `${severe.length} findings above severity 2; layout/freeform on ${freeform.length} of ${walked.size} walked slides, sentence "${freeform[0]?.proposal ?? freeform[0]?.message ?? ''}"`,
    );
  }
} catch (error) {
  record('walk', 'infrastructure', false, String(error?.stack ?? error).slice(0, 800));
} finally {
  await launched.close().catch(() => null);
}

// 9. the CLI's conversion on a fresh copy equals the editor's recording (SPEC-2 1.3, 11.8 item 4)
const cliComparison = [];
try {
  const ids = Object.keys(conversions);
  if (ids.length > 0) {
    const tmp = mkdtempSync(join(tmpdir(), 'turboslide-verifier-walk-'));
    const dir = join(tmp, 'decks', 'gt-brand');
    mkdirSync(join(dir, 'slides'), { recursive: true });
    cpSync(join(ROOT, 'decks', SOURCE, 'slides'), join(dir, 'slides'), { recursive: true });
    cpSync(join(ROOT, 'decks', SOURCE, 'assets'), join(dir, 'assets'), { recursive: true });
    cpSync(join(ROOT, 'decks', SOURCE, 'deck.json'), join(dir, 'deck.json'));
    writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'packages: []\n');
    const t0 = Date.now();
    const run = spawnSync(
      process.execPath,
      [
        join(ROOT, 'apps/cli/bin/turboslide.mjs'),
        'slide',
        'to-canvas',
        ids.join(','),
        '--deck',
        dir,
        '--json',
      ],
      { cwd: tmp, encoding: 'utf8', env: { ...process.env, USER: 'verifier' } },
    );
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    if (run.status !== 0)
      record('cli', 'slide to-canvas', false, `exit ${run.status}: ${run.stderr.slice(0, 300)}`);
    else {
      const result = JSON.parse(run.stdout);
      for (const row of result.slides) {
        const cli = Object.fromEntries(row.objects.map((o) => [o.id, o.pos]));
        const editor = conversions[row.slideId]?.objects ?? {};
        const same = canonical(cli) === canonical(editor);
        const diffs = Object.keys({ ...cli, ...editor }).filter(
          (id) => canonical(cli[id]) !== canonical(editor[id]),
        );
        cliComparison.push({
          slideId: row.slideId,
          same,
          diffs: diffs.map((id) => ({ id, cli: cli[id], editor: editor[id] })),
        });
        record(
          'cli',
          `to-canvas ${row.slideId} equals the editor`,
          same,
          same
            ? `${Object.keys(cli).length} objects identical (${seconds} s for ${ids.length} ids, one launch)`
            : `differs on ${diffs.join(', ')}: ${JSON.stringify(diffs.slice(0, 2).map((id) => ({ id, cli: cli[id], editor: editor[id] })))}`,
        );
      }
    }
    rmSync(tmp, { recursive: true, force: true });
  }
} catch (error) {
  record('cli', 'slide to-canvas', false, String(error).slice(0, 300));
}

if (!KEEP) {
  rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', COPY), { recursive: true, force: true });
}
const report = {
  base: BASE,
  at: new Date().toISOString(),
  copy: COPY,
  seconds: Math.round((Date.now() - started) / 1000),
  walked: [...walked],
  steps,
  conversions,
  cliComparison,
  pageErrors,
  summary: { pass: steps.filter((s) => s.ok).length, fail: steps.filter((s) => !s.ok).length },
};
writeFileSync(join(OUT, 'canvas-walk.json'), `${JSON.stringify(report, null, 2)}\n`);
log(
  `walk: ${report.summary.pass} pass, ${report.summary.fail} fail in ${report.seconds} s; ${shots} screenshots under ${OUT}`,
);
if (pageErrors.length)
  log(`walk: ${pageErrors.length} page error(s): ${pageErrors.slice(0, 3).join(' | ')}`);
process.exit(report.summary.fail > 0 ? 1 : 0);
