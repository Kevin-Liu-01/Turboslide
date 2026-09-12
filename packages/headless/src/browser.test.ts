// One real Chromium pass over a synthetic sheet document: the readiness wait, the dither draw,
// the overflow scan, the block measurement, the 1x and 2x screenshots and the contact sheet with
// its cell map. Runs where the Chrome for Testing binary exists; TURBOSLIDE_SKIP_BROWSER_TESTS=1
// skips it. One browser and one page at a time (AGENTS.md).
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { BAYER8 } from '@turboslide/effects/bayer';

import { openSheetPage } from './context.ts';
import { sheetDocument, writeTempDocument } from './document.ts';
import { launchBrowser, resolveExecutable } from './launch.ts';
import type { LaunchedBrowser } from './launch.ts';
import { renderSlideRecord } from './record.ts';
import { renderContactSheet } from './sheet.ts';

const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' || !existsSync(resolveExecutable().path);

const STYLES = `
.ts-sheet { --paper: #ffffff; --ink: #070707; --hair: rgba(7,7,7,0.18); background: var(--paper); color: var(--ink); font-family: Inter, 'Helvetica Neue', Arial, sans-serif; }
.ts-sheet[data-theme="dark"] { --paper: #070707; --ink: #f2f2f0; --hair: rgba(242,242,240,0.22); }
.slide { position: absolute; inset: 57px; padding: 72px 80px; }
h2 { font-size: 44px; font-weight: 500; margin: 0 0 18px; }
p { font-size: 22px; line-height: 1.5; margin: 0; }
.cap { font-size: 12px; }
.rows > div { display: grid; grid-template-columns: 240px 1fr; gap: 32px; padding: 16px 0; border-bottom: 1px solid var(--hair); font-size: 20px; line-height: 1.45; }
.rows > div > b { font-weight: 500; }
canvas.dither { display: block; width: 400px; height: 220px; image-rendering: pixelated; }
.wide { position: absolute; left: 1400px; top: 700px; width: 400px; height: 40px; background: var(--hair); }
.table > .tr { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--hair); font-size: 20px; line-height: 1.45; }
.table .td { display: block; padding: 12px 16px; }
`;

const BODY = `
<div class="ts-sheet" data-theme="__THEME__">
  <section class="slide" data-slide="probe">
    <div class="in">
      <h2 data-block="h" data-type="heading">A heading that stays inside</h2>
      <p data-block="p1" data-type="paragraph" style="max-width: 600px">One paragraph of body text that wraps onto a second line at this measure, then a third.</p>
      <p class="cap" data-block="cap" data-type="paragraph">Twelve pixel caption under the floor.</p>
      <div class="rows" data-block="rows" data-type="rows" style="width: 700px; margin-top: 20px">
        <div><b>Key one</b><span>One line value.</span></div>
        <div><b>Key two</b><span>A value long enough to wrap onto three lines when the column is this narrow at twenty pixels.</span></div>
      </div>
      <canvas class="dither" data-block="ramp" data-type="dither" data-raster="dither"></canvas>
      <div class="table" data-block="grid" data-type="table" style="width: 700px; margin-top: 20px">
        <div class="tr header"><span class="td first">Plan</span><span class="td last">Price</span></div>
        <div class="tr"><span class="td first">Starter</span><span class="td last">A value long enough to wrap onto a second line at this width.</span></div>
      </div>
      <div class="wide" data-block="wide" data-type="html"></div>
    </div>
  </section>
</div>`;

describe.skipIf(skip)('headless render pass', () => {
  let started: LaunchedBrowser | undefined;
  let dir = '';
  const launched = (): LaunchedBrowser => {
    if (!started) throw new Error('the browser did not launch');
    return started;
  };

  beforeAll(async () => {
    started = await launchBrowser();
    dir = await mkdtemp(join(tmpdir(), 'turboslide-headless-'));
  }, 60_000);

  afterAll(async () => {
    await started?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('records the renderer string', () => {
    expect(launched().renderer).toMatch(/^Chrome for Testing \d+\.\d+\.\d+\.\d+, /);
    expect(launched().version.split('.').length).toBe(4);
  });

  test('renders a slide to a record at 1x with overflow, blocks, rows and fonts', async () => {
    const html = sheetDocument({
      theme: 'dark',
      body: BODY.replace('__THEME__', 'dark'),
      styles: [STYLES],
    });
    const doc = await writeTempDocument(html, 'probe-dark.html', dir);
    const sheetPage = await openSheetPage(launched().browser, { theme: 'dark', scale: 1 });
    try {
      const imagePath = join(dir, '01-probe-dark.png');
      const { record } = await renderSlideRecord(sheetPage, {
        url: doc.url,
        deckId: 'probe',
        slideId: 'probe',
        revision: 1,
        imagePath,
        imageRef: '01-probe-dark.png',
        renderer: launched().renderer,
        bayerTable: BAYER8.flat(),
      });
      expect(record.pageErrors).toEqual([]);
      expect(record.image).toBe('01-probe-dark.png');
      expect(record.overflow.length).toBeGreaterThanOrEqual(1);
      expect(record.overflow[0]?.blockId).toBe('wide');
      expect(record.overflow[0]?.box[0]).toBe(1457);
      expect(record.blocks.h?.fontSize).toBe(44);
      expect(record.blocks.h?.fontWeight).toBe(500);
      expect(record.blocks.h?.lines).toBe(1);
      expect(record.blocks.cap?.fontSize).toBe(12);
      expect(record.blocks.p1?.lines).toBeGreaterThanOrEqual(2);
      expect(record.blocks['rows/0']?.type).toBe('row');
      expect(record.blocks['rows/0']?.lines).toBe(1);
      expect(record.blocks['rows/1']?.lines).toBeGreaterThanOrEqual(3);
      // a table cell is `<blockId>/<row>/<column>` of type cell with its lines (gslides-parity SPEC 7.3)
      expect(record.blocks['grid/0/0']?.type).toBe('cell');
      expect(record.blocks['grid/0/0']?.lines).toBe(1);
      expect(record.blocks['grid/1/1']?.lines).toBeGreaterThanOrEqual(2);
      expect(record.blocks['grid/1/1']?.box[0]).toBeGreaterThan(
        record.blocks['grid/1/0']?.box[0] ?? 0,
      );
      expect(record.rasters).toHaveLength(1);
      expect(record.rasters[0]?.kind).toBe('dither');
      expect(record.fonts.status).toBe('partial');
      expect(record.fonts.faces.some((f) => f.startsWith('fallback:'))).toBe(true);
      const png = await readFile(imagePath);
      expect(png.readUInt32BE(16)).toBe(1600);
      expect(png.readUInt32BE(20)).toBe(900);
      expect(record.timing.readyMs).toBeGreaterThanOrEqual(0);
      // the same slide as a JPEG (render.slide format jpg, gslides-parity SPEC 7.6)
      const jpgPath = join(dir, '01-probe-dark.jpg');
      const jpg = await renderSlideRecord(sheetPage, {
        url: doc.url,
        deckId: 'probe',
        slideId: 'probe',
        revision: 1,
        imagePath: jpgPath,
        renderer: launched().renderer,
        bayerTable: BAYER8.flat(),
        format: 'jpg',
      });
      const bytes = await readFile(jpgPath);
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      expect(jpg.record.image).toBe(jpgPath);
    } finally {
      await sheetPage.close();
    }
  }, 60_000);

  test('a 2x page writes a 3200 by 1800 PNG and a contact sheet maps its cells', async () => {
    const html = sheetDocument({
      theme: 'light',
      body: BODY.replace('__THEME__', 'light'),
      styles: [STYLES],
    });
    const doc = await writeTempDocument(html, 'probe-light.html', dir);
    const sheetPage = await openSheetPage(launched().browser, { theme: 'light', scale: 2 });
    const imagePath = join(dir, '01-probe-light@2x.png');
    try {
      const { record } = await renderSlideRecord(sheetPage, {
        url: doc.url,
        deckId: 'probe',
        slideId: 'probe',
        revision: 1,
        imagePath,
        renderer: launched().renderer,
        bayerTable: BAYER8.flat(),
      });
      expect(record.scale).toBe(2);
      const png = await readFile(imagePath);
      expect(png.readUInt32BE(16)).toBe(3200);
      expect(png.readUInt32BE(20)).toBe(1800);
    } finally {
      await sheetPage.close();
    }
    const out = join(dir, 'sheet-light.png');
    const map = await renderContactSheet(
      launched().browser,
      [
        { slideId: 'probe', n: 1, section: 'Brand', image: imagePath },
        { slideId: 'probe-2', n: 2, section: 'Brand', image: imagePath },
        { slideId: 'probe-3', n: 3, section: 'Website', image: imagePath },
      ],
      { theme: 'light', cols: 2, thumb: 240, numbered: true },
      { png: out, map: join(dir, 'sheet-light.json') },
    );
    expect(map.cells).toHaveLength(3);
    expect(map.labels.map((l) => l.section)).toEqual(['Brand', 'Website']);
    expect(map.cells[0]?.box[2]).toBe(242);
    expect(map.cells[1]?.box[0]).toBeGreaterThan(map.cells[0]?.box[0] ?? 0);
    expect(map.cells[2]?.box[1]).toBeGreaterThan(map.cells[0]?.box[1] ?? 0);
    const png = await readFile(out);
    expect(png.readUInt32BE(16)).toBe(map.size[0]);
    expect(existsSync(join(dir, 'sheet-light.json'))).toBe(true);
  }, 60_000);
});
