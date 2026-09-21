// The batched export's plan (gslides-parity SPEC-2 8.1, 11.5 `batch/plan.test.ts`): the size and
// its constants, the play list against export-pptx.ts's, the batches, the asset hashes and the
// staleness they detect, the job names and the 24 h prune, the dialog's estimate.
import { describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import type { DeckDocument } from '@turboslide/schema/deck';

import { playList } from '../export-pptx.ts';
import {
  BATCH_BUDGET_S,
  EXPORT_BATCH_SIZE,
  FILE_NAME_MAX,
  MARGIN,
  SECONDS_PER_SLIDE,
  assetHashes,
  batchSize,
  derivedBatchSize,
  displayNameOf,
  exportFileName,
  fileNameBase,
  isStale,
  isUntitled,
  jobIdNow,
  jobPrefix,
  jobStartedAt,
  leftWords,
  partNames,
  planBatches,
  planPlayList,
  referencedAssets,
  secondsLeft,
  staleJobPaths,
} from './plan.ts';
import type { ExportPlan } from './plan.ts';

const document: DeckDocument = {
  deck: WORKED_DECK,
  slides: Object.fromEntries(WORKED_SLIDES.map((slide) => [slide.id, slide])),
};

describe('the batch size', () => {
  it('derives from the measured constants and is written as 60', () => {
    expect(BATCH_BUDGET_S).toBe(240);
    expect(SECONDS_PER_SLIDE).toBe(2.6);
    expect(MARGIN).toBe(1.5);
    expect(derivedBatchSize()).toBe(61);
    expect(EXPORT_BATCH_SIZE).toBe(60);
    // the GT deck's 85 slides are two batches of 60 and 25
    const ids = Array.from({ length: 85 }, (_, i) => `s${i}`);
    expect(planBatches(ids, EXPORT_BATCH_SIZE).map((b) => b.length)).toEqual([60, 25]);
  });

  it('reads TURBOSLIDE_EXPORT_BATCH as the override and ignores a value that is not a positive integer', () => {
    expect(batchSize({})).toBe(60);
    expect(batchSize({ TURBOSLIDE_EXPORT_BATCH: '3' })).toBe(3);
    expect(batchSize({ TURBOSLIDE_EXPORT_BATCH: '0' })).toBe(60);
    expect(batchSize({ TURBOSLIDE_EXPORT_BATCH: 'many' })).toBe(60);
    expect(batchSize({ TURBOSLIDE_EXPORT_BATCH: '2.5' })).toBe(60);
  });
});

describe('the play list and the batches', () => {
  it('computes the play list as export-pptx.ts does', () => {
    const cases: { includeSkipped?: boolean; slideIds?: 'all' | string[] }[] = [
      {},
      { includeSkipped: true },
      { slideIds: ['title', 'thesis'] },
      { slideIds: 'all' },
    ];
    for (const options of cases) {
      const ours = planPlayList(document, options);
      const theirs = playList(document, {
        ...(options.includeSkipped === undefined ? {} : { includeSkipped: options.includeSkipped }),
        ...(Array.isArray(options.slideIds) ? { slideIds: options.slideIds } : {}),
      });
      expect(ours).toEqual(theirs);
    }
  });

  it('cuts contiguous runs of at most the size, in order', () => {
    expect(planBatches(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g'],
    ]);
    expect(planBatches([], 3)).toEqual([]);
    expect(planBatches(['a'], 60)).toEqual([['a']]);
    expect(() => planBatches(['a'], 0)).toThrow(RangeError);
  });

  it('the fixture of 11.2 (26 unskipped slides) is 9 batches of 3', () => {
    const ids = Array.from({ length: 26 }, (_, i) => `s${i}`);
    const batches = planBatches(ids, 3);
    expect(batches).toHaveLength(9);
    expect(batches[8]).toEqual(['s24', 's25']);
  });
});

describe('the asset hashes', () => {
  it('names the assets the play list references: the picture kinds and the blocks that carry one', () => {
    const all = referencedAssets(document, planPlayList(document, {}).ids);
    expect(all.length).toBeGreaterThan(0);
    for (const id of all) expect(document.deck.assets[id]).toBeDefined();
    // a text only slide references nothing
    const textOnly = WORKED_SLIDES.find((slide) => slide.kind === 'statement');
    if (textOnly) expect(referencedAssets(document, [textOnly.id])).toEqual([]);
    // a picture kind references its picture
    const picture = WORKED_SLIDES.find((slide) => slide.kind === 'opener');
    expect(picture).toBeDefined();
    if (picture) expect(referencedAssets(document, [picture.id])).toContain(picture.picture.asset);
  });

  it('hashes every twin file through the reader and marks a missing one', async () => {
    const ids = planPlayList(document, {}).ids;
    const readAsset = async (relative: string): Promise<Uint8Array | null> =>
      relative.endsWith('-dark.png') ? null : new TextEncoder().encode(relative);
    const hashes = await assetHashes(document, ids, readAsset);
    expect(hashes.length).toBeGreaterThan(0);
    for (const row of hashes) {
      expect(row.file).toMatch(/^assets\//);
      if (row.file.endsWith('-dark.png')) expect(row.hash).toBe('missing');
      else expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
    }
    // deterministic: the same bytes hash the same
    expect(await assetHashes(document, ids, readAsset)).toEqual(hashes);
  });

  it('isStale answers revision when the deck moved, asset when a twin changed, null otherwise', async () => {
    const ids = planPlayList(document, {}).ids;
    const readAsset = async (relative: string) => new TextEncoder().encode(relative);
    const assets = await assetHashes(document, ids, readAsset);
    const plan = planOf(assets);
    expect(isStale(plan, document, assets)).toBeNull();
    const moved: DeckDocument = {
      ...document,
      deck: { ...document.deck, revision: document.deck.revision + 1 },
    };
    expect(isStale(plan, moved, assets)).toBe('revision');
    const replaced = await assetHashes(document, ids, async (relative) =>
      new TextEncoder().encode(`${relative}!`),
    );
    expect(isStale(plan, document, replaced)).toBe('asset');
    // a batch checks only its own slides' assets: a subset of the pinned rows is not stale
    const first = ids.slice(0, 1);
    const subset = await assetHashes(document, first, readAsset);
    expect(isStale(plan, document, subset)).toBeNull();
    // an asset the plan never pinned is stale too
    expect(isStale(plan, document, [{ id: 'new', file: 'assets/new.png', hash: 'x' }])).toBe(
      'asset',
    );
  });
});

function planOf(assets: ExportPlan['assets']): ExportPlan {
  const { play, ids, omitted } = planPlayList(document, {});
  return {
    version: 1,
    jobId: 'b1-00000000',
    deckId: document.deck.id,
    deckTitle: document.deck.title,
    revision: document.deck.revision,
    startedAt: '2026-09-12T00:00:00.000Z',
    input: { format: 'pptx' },
    mode: 'flatten',
    themes: ['light'],
    play,
    ids,
    omitted,
    batches: planBatches(ids, 3),
    assets,
  };
}

describe('the job names and the prune', () => {
  it('a job id carries its start time and the prefixes follow the round one layout', () => {
    const at = Date.parse('2026-09-12T10:00:00.000Z');
    const id = jobIdNow(at, 'deadbeef');
    expect(id).toBe(`b${at.toString(36)}-deadbeef`);
    expect(jobStartedAt(id)).toBe(at);
    expect(jobStartedAt('job-1234')).toBeNull();
    expect(jobIdNow()).toMatch(/^b[0-9a-z]+-[0-9a-f]{8}$/);
    expect(jobPrefix('gt-brand', id)).toBe(`exports/gt-brand/${id}/`);
    expect(partNames(3, 'thesis', 'light')).toEqual({
      scene: '03-thesis.light.scene.json',
      sheet: 'sheets/light/03-thesis@2x.png',
    });
  });

  it('prunes every file of a job older than 24 h, by upload time, else by the start time in its id', () => {
    const now = Date.parse('2026-09-12T12:00:00.000Z');
    const old = jobIdNow(now - 25 * 3600_000, '00000001');
    const fresh = jobIdNow(now - 1 * 3600_000, '00000002');
    const entries = [
      { pathname: `exports/gt-brand/${old}/plan.json` },
      { pathname: `exports/gt-brand/${old}/parts/01-a.light.scene.json` },
      { pathname: `exports/gt-brand/${fresh}/plan.json` },
      // the round one sync export's job, aged by its upload time alone
      {
        pathname: 'exports/gt-brand/job-legacy/gt-brand-light.pptx',
        uploadedAt: new Date(now - 30 * 3600_000).toISOString(),
      },
      {
        pathname: 'exports/gt-brand/job-recent/gt-brand-light.pptx',
        uploadedAt: new Date(now - 2 * 3600_000).toISOString(),
      },
      // no time at all: left alone
      { pathname: 'exports/gt-brand/job-unknown/gt-brand-light.pptx' },
      // another deck's job: not this prune's
      { pathname: `exports/other/${old}/plan.json` },
    ];
    expect(staleJobPaths(entries, 'gt-brand', { now })).toEqual([
      `exports/gt-brand/${old}/parts/01-a.light.scene.json`,
      `exports/gt-brand/${old}/plan.json`,
      'exports/gt-brand/job-legacy/gt-brand-light.pptx',
    ]);
    // a job whose newest upload is fresh stays whatever its id says
    expect(
      staleJobPaths(
        [
          {
            pathname: `exports/gt-brand/${old}/plan.json`,
            uploadedAt: new Date(now).toISOString(),
          },
        ],
        'gt-brand',
        { now },
      ),
    ).toEqual([]);
  });
});

describe('the dialog’s estimate', () => {
  it('recomputes the seconds left from the measured batches and rounds to the half minute', () => {
    expect(secondsLeft(0, 85, [])).toBeNull();
    // 60 slides in 156 s: 2.6 s per slide, 25 left is 65 s
    expect(secondsLeft(60, 85, [{ slides: 60, ms: 156_000 }])).toBeCloseTo(65, 5);
    expect(secondsLeft(85, 85, [{ slides: 85, ms: 200_000 }])).toBe(0);
    expect(leftWords(65)).toBe('1 minute');
    expect(leftWords(20)).toBe('half a minute');
    expect(leftWords(100)).toBe('1 and a half minutes');
    expect(leftWords(125)).toBe('2 minutes');
    expect(leftWords(0)).toBe('half a minute');
  });
});

describe('the file names a download saves as (docs/PRODUCT.md section 2 rank 7)', () => {
  it('names the file after the title, never the id, the appearance or the default mode', () => {
    expect(
      exportFileName({ title: 'GT pitch for Acme', deckId: 'gt-pitch-9x2k', format: 'pdf' }),
    ).toBe('GT pitch for Acme.pdf');
    expect(
      exportFileName({
        title: 'GT pitch for Acme',
        deckId: 'gt-pitch-9x2k',
        format: 'pptx',
        theme: 'light',
        mode: 'flatten',
      }),
    ).toBe('GT pitch for Acme.pptx');
  });

  it('joins the appearance only when both left one run and the mode only for Editable text', () => {
    const base = { title: 'GT pitch for Acme', deckId: 'gt-pitch-9x2k', format: 'pptx' as const };
    expect(exportFileName({ ...base, theme: 'dark', bothThemes: true })).toBe(
      'GT pitch for Acme (dark).pptx',
    );
    expect(exportFileName({ ...base, mode: 'native' })).toBe('GT pitch for Acme (editable).pptx');
    expect(exportFileName({ ...base, theme: 'light', bothThemes: true, mode: 'native' })).toBe(
      'GT pitch for Acme (light, editable).pptx',
    );
    // the PDF has one mode: never a mode mark
    expect(exportFileName({ ...base, format: 'pdf', mode: 'native' })).toBe(
      'GT pitch for Acme.pdf',
    );
  });

  it('removes the characters a file system refuses and keeps the id for an Untitled deck', () => {
    expect(fileNameBase('Q3: "Acme" <review> | a/b\\c *?')).toBe('Q3 Acme review abc');
    expect(fileNameBase('  spaced   out  ')).toBe('spaced out');
    expect(fileNameBase('ends with dots...')).toBe('ends with dots');
    expect(fileNameBase('x'.repeat(200))).toHaveLength(FILE_NAME_MAX);
    for (const title of ['Untitled presentation', 'untitled', '', '   ', '"?*']) {
      expect(isUntitled(title)).toBe(true);
      expect(exportFileName({ title, deckId: 'untitled-20260920-peg8', format: 'pdf' })).toBe(
        'untitled-20260920-peg8.pdf',
      );
    }
    expect(isUntitled('Untitled deck for Acme')).toBe(false);
  });

  it('reads the theme off the produced names when the run made both, and leaves a foreign name alone', () => {
    const input = { title: 'GT pitch for Acme', deckId: 'q4-review', mode: 'flatten' as const };
    const both = ['q4-review-r12-dark.pptx', 'q4-review-r12-light.pptx'];
    expect(displayNameOf(both[0]!, input, both)).toBe('GT pitch for Acme (dark).pptx');
    expect(displayNameOf(both[1]!, input, both)).toBe('GT pitch for Acme (light).pptx');
    expect(displayNameOf('q4-review-r12-dark.pptx', input)).toBe('GT pitch for Acme.pptx');
    expect(displayNameOf('q4-review.pdf', input)).toBe('GT pitch for Acme.pdf');
    expect(
      displayNameOf('q4-review-r12-flatten.zip', input, [...both, 'q4-review-r12-flatten.zip']),
    ).toBe('GT pitch for Acme.zip');
    expect(displayNameOf('q4-review-r12-dark.pptx', { ...input, mode: 'native' })).toBe(
      'GT pitch for Acme (editable).pptx',
    );
    expect(displayNameOf('export-report.json', input)).toBe('export-report.json');
  });
});
