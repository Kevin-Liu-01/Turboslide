// The fixture gate (gslides-parity SPEC-5 5.4, 16.3; R04 10 tests 1 to 3): fixtures 01 to 04 deep
// equal their expected documents after `canonicalJson`, their reports equal row for row, every
// document validates with no blocking issue, every slide holds blocks, and the three counts sum to
// the source's objects. The expected files are written by `__fixtures__/pptx/write-expected.mjs`
// when the mapping changes on purpose (recorded in build-5/b3.md); this test never writes.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@turboslide/schema/json';
import { validateDeck } from '@turboslide/schema/validate';
import type { ImportReport } from '@turboslide/schema/import-report';

import { FIXTURES, fixtureBytes } from './__tests__/unzip.ts';
import { importPptxBytes } from './read.ts';
import type { ImportedDocument } from './import-pptx.ts';
import { fidelityOf } from './report.ts';

const FIXED_NOW = '2026-09-15T00:00:00.000Z';
const GENERATED = ['01-text', '02-shapes', '03-pictures-tables', '04-charts-motion-media'] as const;

const cache = new Map<string, Promise<ImportedDocument>>();
function imported(name: string): Promise<ImportedDocument> {
  let pending = cache.get(name);
  if (pending === undefined) {
    pending = importPptxBytes(fixtureBytes(`${name}.pptx`), {
      fileName: `${name}.pptx`,
      into: name.replace(/^\d+b?-/, ''),
      now: () => FIXED_NOW,
    });
    cache.set(name, pending);
  }
  return pending;
}

function expectedDocument(name: string): { deck: string; slides: Record<string, string> } {
  const dir = join(FIXTURES, `${name}.expected`);
  const slides: Record<string, string> = {};
  for (const file of readdirSync(join(dir, 'slides'))) {
    slides[file.replace(/\.json$/, '')] = readFileSync(join(dir, 'slides', file), 'utf8');
  }
  return { deck: readFileSync(join(dir, 'deck.json'), 'utf8'), slides };
}

describe.each(GENERATED)('fixture %s', (name) => {
  it('deep equals its expected document after canonicalJson', async () => {
    const document = await imported(name);
    const expected = expectedDocument(name);
    expect(canonicalJson(document.deck)).toBe(expected.deck);
    const ids = document.slides.map((slide) => slide.id);
    expect(ids.sort()).toEqual(Object.keys(expected.slides).sort());
    for (const slide of document.slides)
      expect(canonicalJson(slide)).toBe(expected.slides[slide.id]);
  });

  it('answers the expected report row for row', async () => {
    const document = await imported(name);
    const expected = JSON.parse(
      readFileSync(join(FIXTURES, `${name}.report.json`), 'utf8'),
    ) as ImportReport;
    expect(document.report.rows).toEqual(expected.rows);
    expect(document.report.summary).toEqual(expected.summary);
    expect(document.report.fonts).toEqual(expected.fonts);
    expect(document.report.source).toEqual(expected.source);
  });

  it('validates with no blocking issue and every slide holds blocks', async () => {
    const document = await imported(name);
    const result = validateDeck({ deck: document.deck, slides: document.slides });
    expect(result.issues.filter((issue) => issue.severity === 3)).toEqual([]);
    expect(document.report.validation.ok).toBe(true);
    for (const slide of document.slides) {
      expect(slide.kind).toBe('content');
      if (slide.kind !== 'content') continue;
      expect(slide.layout.type).toBe('freeform');
      expect(slide.template).toBe('blank');
      const blocks = slide.slots.main ?? [];
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks)
        expect(block.pos, `${slide.id}/${block.id} has a position`).toBeDefined();
    }
  });

  it('accounts for every source object once (kept, shown differently or dropped)', async () => {
    const document = await imported(name);
    const fidelity = fidelityOf(document.report);
    expect(fidelity.kept + fidelity.substituted + fidelity.dropped).toBe(document.shapeCount);
    expect(fidelity.objects).toBe(document.shapeCount);
  });

  it('writes an asset file for every picture and media record', async () => {
    const document = await imported(name);
    const files = new Set(document.files.map((file) => file.relative));
    for (const asset of Object.values(document.deck.assets)) {
      const twin = 'neutral' in asset.twins ? asset.twins.neutral : asset.twins.light;
      expect(files.has(twin), `${asset.id} has its file`).toBe(true);
    }
    for (const media of Object.values(document.deck.media ?? {}))
      expect(files.has(media.file)).toBe(true);
    for (const file of document.files) expect(file.bytes.byteLength).toBeGreaterThan(0);
  });
});

describe('the fixture set', () => {
  it('holds the six committed files with their expected documents and reports', () => {
    for (const name of [...GENERATED, '05-roundtrip', '05b-roundtrip-perfect']) {
      expect(existsSync(join(FIXTURES, `${name}.pptx`)), `${name}.pptx`).toBe(true);
      expect(existsSync(join(FIXTURES, `${name}.report.json`)), `${name}.report.json`).toBe(true);
      expect(existsSync(join(FIXTURES, `${name}.expected`, 'deck.json')), `${name}.expected`).toBe(
        true,
      );
    }
  });

  it('01-text: the title inherits its box from the layout and the body is a bulleted list', async () => {
    const document = await imported('01-text');
    const first = document.slides[0];
    expect(first?.kind).toBe('content');
    const blocks = first?.kind === 'content' ? (first.slots.main ?? []) : [];
    const heading = blocks.find((block) => block.type === 'heading');
    expect(heading?.type).toBe('heading');
    if (heading?.type === 'heading') {
      expect(heading.text).toBe('Import fixture');
      // the layout's ctrTitle box after the 16:9 widening: 914,400 by 2,130,425 EMU (b3.md 1.3)
      expect(heading.pos?.x).toBeCloseTo(120, 0);
      expect(heading.pos?.y).toBeCloseTo(279.58, 1);
    }
    const second = document.slides[1];
    const list =
      second?.kind === 'content'
        ? (second.slots.main ?? []).find((block) => block.type === 'plain')
        : undefined;
    expect(list?.type).toBe('plain');
    if (list?.type === 'plain') {
      expect(list.marker).toBe('bullet');
      expect(list.items.map((item) => item.level ?? 1)).toEqual([1, 2, 3, 1]);
    }
    const numbered =
      second?.kind === 'content'
        ? (second.slots.main ?? []).filter((block) => block.type === 'plain')[1]
        : undefined;
    expect(numbered?.type).toBe('plain');
    if (numbered?.type === 'plain') {
      expect(numbered.marker).toBe('number');
      expect(numbered.start).toBe(4);
    }
    expect(document.slides[2]?.skip).toBe(true);
    expect(document.deck.sections.map((section) => section.name)).toEqual(['Opening', 'Body']);
    expect(document.report.fonts[0]?.family).toBe('Calibri');
    expect(document.report.source.producer).toBe('python-pptx');
  });

  it('01-text: the marked runs land as the schema markup with the two links', async () => {
    const document = await imported('01-text');
    const second = document.slides[1];
    const text =
      second?.kind === 'content'
        ? (second.slots.main ?? []).find((block) => block.type === 'text')
        : undefined;
    expect(text?.type).toBe('text');
    if (text?.type === 'text') {
      expect(text.text).toContain('*bold, *');
      expect(text.text).toContain('[italic, ]{i}');
      expect(text.text).toContain('[underlined, ]{u}');
      expect(text.text).toContain('[struck, ]{s}');
      expect(text.text).toContain('[sup]{sup}');
      expect(text.text).toContain('[sub]{sub}');
      expect(text.text).toContain('{c:blue}');
      expect(text.text).toContain('[a link](https://turboslide.vercel.app)');
      expect(text.text).toContain('[a jump to the hidden slide](#s/slide-3)');
      expect(text.autofit).toBe('shrink');
      expect(text.valign).toBe('middle');
    }
  });

  it('02-shapes: the presets, the adjusts, the rotation, the flips, the connectors and the groups', async () => {
    const document = await imported('02-shapes');
    const first = document.slides[0];
    const blocks = first?.kind === 'content' ? (first.slots.main ?? []) : [];
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const rounded = byId.get('rounded-plate');
    expect(rounded?.type).toBe('shape');
    if (rounded?.type === 'shape') {
      expect(rounded.shape).toBe('roundRect');
      expect(rounded.radius).toBeCloseTo(54, 0);
      expect(rounded.fill).toBe('blue');
      expect(rounded.text).toBe('Rounded');
    }
    const triangle = byId.get('triangle');
    expect(triangle?.pos?.rotate).toBe(15);
    const chevron = byId.get('chevron');
    expect(chevron?.pos?.rotate).toBe(345);
    expect(byId.get('flipped-arrow')?.pos?.flip).toBe('h');
    expect(byId.get('flipped-both')?.pos?.flip).toBe('hv');
    // flowChartDecision and wedgeRectCallout are both inside the 135 presets (R04 5.3 assumed otherwise)
    const decision = byId.get('decision');
    expect(decision?.type === 'shape' ? decision.shape : undefined).toBe('flowChartDecision');
    const callout = byId.get('shape');
    expect(callout?.type === 'shape' ? [callout.shape, callout.adjust?.length] : undefined).toEqual(
      ['wedgeRectCallout', 2],
    );
    const shadowed = byId.get('shadowed');
    expect(shadowed?.type === 'shape' ? shadowed.shadow : undefined).toMatchObject({
      angle: 45,
      opacity: 0.4,
    });
    const second = document.slides[1];
    const lines = second?.kind === 'content' ? (second.slots.main ?? []) : [];
    const straight = lines.find((block) => block.id === 'straight-arrow');
    expect(
      straight?.type === 'shape' ? [straight.shape, straight.lineStart, straight.lineEnd] : [],
    ).toEqual(['arrow', 'fillCircle', 'fillArrow']);
    const elbow = lines.find((block) => block.id === 'elbow');
    expect(elbow?.type === 'shape' ? elbow.connect : undefined).toEqual({
      start: { block: 'left-box', site: 3 },
      end: { block: 'right-box', site: 1 },
    });
    const hair = lines.find((block) => block.id === 'hair-rule');
    expect(hair?.type).toBe('rule');
    const poly = lines.find((block) => block.type === 'shape' && block.shape === 'polyline');
    expect(poly?.type === 'shape' ? poly.closed : undefined).toBe(true);
    const third = document.slides[2];
    const grouped = third?.kind === 'content' ? (third.slots.main ?? []) : [];
    expect(grouped.filter((block) => block.pos?.group === 'trio')).toHaveLength(3);
    expect(grouped.filter((block) => block.pos?.group === 'outer/inner')).toHaveLength(2);
    expect(grouped.find((block) => block.id === 'outer-box')?.pos?.group).toBe('outer');
    expect(grouped.find((block) => block.id === 'lone-member')?.pos?.group).toBeUndefined();
    for (const block of grouped.filter((b) => b.pos?.group === 'trio'))
      expect(block.pos?.rotate).toBe(30);
  });

  it('03-pictures-tables: the pictures with their trims, mask and adjustments, the table with its merges', async () => {
    const document = await imported('03-pictures-tables');
    const first = document.slides[0];
    const blocks = first?.kind === 'content' ? (first.slots.main ?? []) : [];
    const jpeg = blocks.find((block) => block.id === 'jpeg-picture');
    expect(jpeg?.type === 'picture' ? jpeg.trim : undefined).toEqual({
      left: 0.1,
      top: 0.05,
      right: 0.1,
      bottom: 0,
    });
    const gif = blocks.find((block) => block.id === 'gif-picture');
    expect(gif?.type === 'picture' ? gif.mask : undefined).toBe('ellipse');
    const faded = blocks.find((block) => block.id === 'faded-picture');
    expect(faded?.type === 'picture' ? faded.adjust : undefined).toEqual({
      transparency: 0.4,
      brightness: 0.2,
      contrast: -0.1,
    });
    const gray = blocks.find((block) => block.id === 'grayscale-picture');
    expect(gray?.type === 'picture' ? gray.adjust?.recolor : undefined).toBe('grayscale');
    const framed = blocks.find((block) => block.id === 'framed-picture');
    expect(framed?.type === 'picture' ? framed.frame : undefined).toMatchObject({
      weight: 2,
      color: 'ink',
    });
    const bmp = blocks.find((block) => block.id === 'bmp-picture');
    expect(bmp?.type).toBe('box');
    // #F6F6F6 lies within 12 of paper on every channel, so adopt snaps it (b3.md 6.5 keeps plate out of the snap list)
    expect(first?.background).toEqual({ color: 'paper' });
    // the same PNG twice is one asset
    const png = blocks.find((block) => block.id === 'png-picture');
    const again = blocks.find((block) => block.id === 'same-png-again');
    expect(
      png?.type === 'picture' && again?.type === 'picture' ? png.asset === again.asset : false,
    ).toBe(true);
    const second = document.slides[1];
    const tables =
      second?.kind === 'content'
        ? (second.slots.main ?? []).filter((block) => block.type === 'table')
        : [];
    const plans = tables.find((block) => block.id === 'plans-table');
    expect(plans?.type).toBe('table');
    if (plans?.type === 'table') {
      expect(plans.rows).toHaveLength(5);
      expect(plans.columns).toHaveLength(4);
      expect(plans.rows[0]?.header).toBe(true);
      // the header cells are bold runs on white: the mark travels, the colour is the cell's own
      expect(plans.rows[0]?.cells[0]).toBe('*Plan*');
      expect(plans.spans).toEqual(
        expect.arrayContaining([
          { row: 4, column: 0, rows: 1, columns: 4 },
          { row: 2, column: 1, rows: 2, columns: 1 },
        ]),
      );
      expect(plans.cells?.some((cell) => cell.border?.left !== undefined)).toBe(true);
      // the header cells carry no bottom border, so the bottoms stay per cell (1 pt is 1.67 px, snapped to 1.5)
      expect(plans.border).toBeUndefined();
      expect(plans.cells?.filter((cell) => cell.border?.bottom !== undefined)).toHaveLength(16);
      expect(
        plans.cells?.find((cell) => cell.row === 1 && cell.column === 0)?.border?.bottom,
      ).toEqual({ weight: 1.5, color: 'ink' });
    }
    const wide = tables.find((block) => block.id === 'wide-table');
    expect(wide?.type === 'table' ? wide.columns.length : 0).toBe(20);
    expect(document.report.rows.some((row) => row.code === 'table.columns')).toBe(true);
    const background = second?.kind === 'content' ? (second.slots.main ?? [])[0] : undefined;
    expect(background?.type).toBe('picture');
    expect(background?.pos?.z).toBe(1);
  });

  it('04-charts-motion-media: the chart kinds, the caches, the fold of the transitions, the timing tree, the media and the equation', async () => {
    const document = await imported('04-charts-motion-media');
    const [charts, substitutions, motion, media] = document.slides;
    const chartBlocks =
      charts?.kind === 'content'
        ? (charts.slots.main ?? []).filter((block) => block.type === 'chart')
        : [];
    expect(chartBlocks.map((block) => (block.type === 'chart' ? block.kind : ''))).toEqual([
      'column',
      'bar',
      'line',
      'pie',
    ]);
    const column = chartBlocks[0];
    if (column?.type === 'chart') {
      expect(column.categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
      expect(column.series.map((s) => s.name)).toEqual(['Revenue', 'Cost']);
      expect(column.series[0]?.values).toEqual([1200, 1450, 1600, 2100]);
      expect(column.legend).toBe('bottom');
      expect(column.labels).toBe(true);
      expect(column.numberFormat).toBe('thousands');
      expect(column.title).toBe('Revenue and cost');
    }
    const bar = chartBlocks[1];
    if (bar?.type === 'chart') expect(bar.numberFormat).toBe('percent');
    const pie = chartBlocks[3];
    if (pie?.type === 'chart') expect([pie.legend, pie.numberFormat]).toEqual(['left', 'percent']);
    expect(charts?.transition).toEqual({ kind: 'fade', durationMs: 750 });
    expect(substitutions?.transition).toEqual({ kind: 'slideRight', durationMs: 500 });
    const subBlocks = substitutions?.kind === 'content' ? (substitutions.slots.main ?? []) : [];
    const wide = subBlocks.find(
      (block) => block.type === 'chart' && block.categories.length === 12,
    );
    expect(wide?.type === 'chart' ? wide.series.length : 0).toBe(6);
    expect(
      document.report.rows.filter((row) => row.slideIndex === 2 && row.status === 'substituted'),
    ).toHaveLength(5);
    expect(motion?.transition).toEqual({ kind: 'dissolve', durationMs: 1000 });
    expect(
      motion?.animations?.map((a) => [a.blockId, a.effect, a.trigger, a.byParagraph ?? false]),
    ).toEqual([
      ['appears', 'appear', 'click', false],
      ['fades-in', 'fadeIn', 'withPrevious', false],
      ['flies-in', 'flyIn', 'afterPrevious', false],
      ['fades-out', 'fadeOut', 'click', false],
      ['pricing-rows', 'appear', 'click', true],
    ]);
    expect(motion?.animations?.[2]?.direction).toBe('bottom');
    expect(motion?.animations?.[2]?.durationMs).toBe(750);
    expect(media?.transition).toEqual({ kind: 'flip', durationMs: 1250 });
    const mediaBlocks = media?.kind === 'content' ? (media.slots.main ?? []) : [];
    const clip = mediaBlocks.find((block) => block.id === 'demo-clip');
    expect(clip?.type).toBe('media');
    if (clip?.type === 'media') {
      expect(clip.kind).toBe('video');
      expect(clip.playback.start).toBe('click');
      expect(clip.poster).toBeDefined();
      const asset = 'asset' in clip.source ? document.deck.media?.[clip.source.asset] : undefined;
      expect(asset?.mime).toBe('video/mp4');
      expect(asset?.durationMs).toBeGreaterThan(900);
      expect(asset?.codecs.length).toBeGreaterThan(0);
    }
    const tone = mediaBlocks.find((block) => block.id === 'tone');
    expect(tone?.type === 'media' ? tone.kind : undefined).toBe('audio');
    const equation = mediaBlocks.find((block) => block.type === 'equation');
    expect(equation?.type).toBe('equation');
    if (equation?.type === 'equation') {
      expect(equation.tex).toBe('');
      expect(equation.mathml).toContain('<mfrac>');
      expect(equation.mathml).toContain('<msup>');
      expect(equation.mathml).toContain('<msqrt>');
    }
    expect(document.report.rows.some((row) => row.code === 'equation.mathml')).toBe(true);
  });
});
