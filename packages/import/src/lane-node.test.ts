// The Node bridge of the import lane (gslides-parity SPEC-5 4.6, 5.2, 5.5): the template index and
// slides through the bridge, a building block by id, a `.pptx` dry run with the document, and the
// slide.import sources over a file (by number, fitted) and a template (by id) with their assets.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  importLaneDeps,
  importPptxIntoFolder,
  slideImportSourceFor,
  templateDocument,
} from './lane-node.ts';
import { FIXTURES } from './pptx/__tests__/unzip.ts';

const decksDir = join(import.meta.dirname, '..', '..', '..', 'decks');
const tmp = mkdtempSync(join(tmpdir(), 'turboslide-lane-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('importLaneDeps', () => {
  const deps = importLaneDeps({
    decksDir,
    cwd: FIXTURES,
    allowPaths: true,
    now: () => '2026-09-15T00:00:00.000Z',
  });

  it('lists the template index and one template’s slides', () => {
    const rows = deps.templates.list();
    expect(rows.map((row) => row.id).slice(0, 4)).toEqual([
      'blank',
      'blank-plate',
      'gt-brand',
      'sales-pitch',
    ]);
    const slides = deps.templates.slides('sales-pitch');
    expect(slides).toHaveLength(15);
    expect(slides[0]).toMatchObject({ index: 1, slideId: 'title', kind: 'title' });
    expect(slides.find((row) => row.slideId === 'pricing')?.title).toBe('Pricing');
    expect(() => deps.templates.slides('nope')).toThrow(RangeError);
  });

  it('reads the building blocks', () => {
    expect(deps.buildingBlocks.list('quotes').length).toBeGreaterThanOrEqual(3);
    expect(deps.buildingBlocks.read('cards/pricing-card').label).toBe('Pricing card');
  });

  it('answers a dry run with the report and the document, and refuses a path outside the policy', async () => {
    const answer = await deps.importPptx({ file: '04-charts-motion-media.pptx', dryRun: true }, {});
    expect(answer.summary.slides).toBe(4);
    expect(answer.deck?.id).toBe('04-charts-motion-media');
    expect(answer.slides).toHaveLength(4);
    expect(answer.deckId).toBeUndefined();
    const hosted = importLaneDeps({ decksDir, allowPaths: false });
    await expect(
      hosted.importPptx({ file: '04-charts-motion-media.pptx', dryRun: true }, {}),
    ).rejects.toThrow(TypeError);
  });

  it('reads the theme records of a file', async () => {
    const records = await deps.themeRecords({ file: '01-text.pptx' });
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0]?.source).toEqual({ file: '01-text.pptx', themeIndex: 0 });
  });
});

describe('slideImportSourceFor', () => {
  it('reads two slides of a file by number, fitted, with their asset files in memory', async () => {
    const targetDir = join(tmp, 'target-file');
    const source = await slideImportSourceFor(
      { sourceFile: join(FIXTURES, '03-pictures-tables.pptx'), slideIndexes: [1] },
      { decksDir, targetDir, allowPaths: true, currentPage: { width: 1600, height: 900 } },
    );
    expect(source.slideIds).toHaveLength(1);
    const slide = source.document.slides[source.slideIds[0]!];
    expect(slide?.kind).toBe('content');
    const assetIds = Object.keys(source.document.deck.assets);
    expect(assetIds.length).toBeGreaterThan(0);
    const asset = source.document.deck.assets[assetIds[0]!]!;
    const relative = Object.values(asset.twins)[0]!;
    await source.copyAsset(relative);
    expect(existsSync(join(targetDir, relative))).toBe(true);
    await expect(source.copyAsset('../deck.json')).rejects.toThrow(RangeError);
  });

  it('reads a template by slide id and copies its shared starter pictures', async () => {
    const targetDir = join(tmp, 'target-template');
    const source = await slideImportSourceFor(
      { sourceTemplateId: 'status-report', slideIds: ['status-board', 'closing'] },
      { decksDir, targetDir },
    );
    expect(source.slideIds).toEqual(['status-board', 'closing']);
    expect(source.document.slides.closing?.kind).toBe('closing');
    const closing = source.document.slides.closing!;
    const assetId = closing.kind === 'closing' ? closing.picture.asset : '';
    const twin = Object.values(source.document.deck.assets[assetId]!.twins)[0]!;
    await source.copyAsset(twin);
    expect(readFileSync(join(targetDir, twin)).byteLength).toBeGreaterThan(1000);
    await expect(
      slideImportSourceFor(
        { sourceTemplateId: 'status-report', slideIds: ['nope'] },
        { decksDir, targetDir },
      ),
    ).rejects.toThrow(RangeError);
  });

  it('carries the media records of a template with a clip', () => {
    const document = templateDocument(decksDir, 'sales-pitch');
    expect(document.deck.media?.demo?.durationMs).toBe(5000);
  });
});

describe('importPptxIntoFolder (the upload route)', () => {
  it('writes the deck under a free id twice, with the report naming the id', async () => {
    const decks = join(tmp, 'decks-upload');
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, '02-shapes.pptx')));
    const first = await importPptxIntoFolder(bytes, decks, { fileName: 'Quarter review.pptx' });
    expect(first.deckId).toBe('quarter-review');
    expect(first.report.deckId).toBe('quarter-review');
    expect(existsSync(join(first.dir, 'import-report.json'))).toBe(true);
    const second = await importPptxIntoFolder(bytes, decks, { fileName: 'Quarter review.pptx' });
    expect(second.deckId).toBe('quarter-review-2');
    await expect(
      importPptxIntoFolder(new Uint8Array([1, 2, 3]), decks, { fileName: 'x.pptx' }),
    ).rejects.toThrow(TypeError);
  });
});
