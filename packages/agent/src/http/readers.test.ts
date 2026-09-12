// The read handlers over the linter's fixture deck (MILESTONES M4 item 1).
import { document } from '@turboslide/lint/fixtures/deck';
import { describe, expect, it } from 'vitest';

import { createDispatcher } from '../dispatch.ts';
import { assetIdsOf, registerReadActions, validateLoaded } from './readers.ts';

const context = { author: { kind: 'agent' as const, name: 'agent', runId: 'readers' } };
const lint = { properNouns: [], tokens: [], iconNames: [] };

describe('registerReadActions', () => {
  it('answers deck.info, slide.list, slide.get, lint.run and validate.run over the loaded document', async () => {
    const dispatcher = createDispatcher();
    registerReadActions(dispatcher, { load: () => document, lint, renderRecords: () => [] });
    expect(dispatcher.implemented()).toEqual([
      'deck.info',
      'slide.list',
      'slide.get',
      'lint.run',
      'validate.run',
    ]);
    const info = (await dispatcher.dispatch('deck.info', {}, context)) as {
      id: string;
      counts: { slides: number; skipped: number };
      defaults?: unknown;
      trashedAt?: string;
    };
    expect(info.id).toBe(document.deck.id);
    expect(info.counts.slides).toBeGreaterThan(0);
    // the parity round's facts (gslides-parity SPEC 7.2.1, 7.2.3 to 7.2.5): the skipped count is
    // always there, the defaults and the trash stamp only when the manifest carries them
    expect(info.counts.skipped).toBe(
      Object.values(document.slides).filter((slide) => slide.skip === true).length,
    );
    expect(info.defaults).toEqual(document.deck.defaults);
    expect(info.trashedAt).toEqual(document.deck.trashedAt);
    const rows = (await dispatcher.dispatch('slide.list', {}, context)) as {
      id: string;
      n: number;
      skip?: boolean;
      template?: string;
    }[];
    expect(rows.map((row) => row.n)).toEqual(rows.map((_row, i) => i + 1));
    for (const row of rows) {
      const slide = document.slides[row.id];
      expect(row.skip, row.id).toEqual(slide?.skip === true ? true : undefined);
      expect(row.template, row.id).toEqual(slide?.template);
    }
    const first = rows[0]!;
    const slide = (await dispatcher.dispatch('slide.get', { slideId: first.id }, context)) as {
      slide: { id: string };
      render: unknown;
      n: number;
    };
    expect(slide.slide.id).toBe(first.id);
    expect(slide.n).toBe(1);
    expect(slide.render).toBeNull();
    await expect(
      dispatcher.dispatch('slide.get', { slideId: 'no-such-slide' }, context),
    ).rejects.toBeInstanceOf(RangeError);
    const findings = (await dispatcher.dispatch(
      'lint.run',
      { slideIds: 'all', layers: 'static' },
      context,
    )) as {
      source: string;
    }[];
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.source === 'lint')).toBe(true);
    const one = (await dispatcher.dispatch(
      'lint.run',
      { slideIds: [first.id], layers: 'static' },
      context,
    )) as {
      slideId: string;
    }[];
    expect(one.every((finding) => finding.slideId === first.id)).toBe(true);
    const validated = (await dispatcher.dispatch('validate.run', {}, context)) as {
      ok: boolean;
      issues: unknown[];
    };
    expect(typeof validated.ok).toBe('boolean');
    expect(Array.isArray(validated.issues)).toBe(true);
    await expect(
      dispatcher.dispatch('validate.run', { path: '../etc' }, context),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('collects asset ids and validates a loaded document', () => {
    const slide = Object.values(document.slides).find((row) => 'picture' in row);
    expect(slide).toBeDefined();
    if (slide)
      expect(assetIdsOf(slide)).toContain((slide as { picture: { asset: string } }).picture.asset);
    expect(validateLoaded(document).ok).toBeTypeOf('boolean');
  });
});
