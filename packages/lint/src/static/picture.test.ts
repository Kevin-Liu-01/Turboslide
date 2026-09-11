// The picture and asset rules on constructed documents (MILESTONES M5 item 2): each rule fires on
// its planted defect and stays quiet on the clean form, the plate rectangle follows the slide's
// own plate, and the credit fix is the deck's credit line.
import { describe, expect, test } from 'vitest';

import type { Asset, Deck, DeckDocument, Slide } from '../contracts.ts';
import { lintStatic } from '../lint-static.ts';
import { creditCovers } from './asset.ts';
import { slidePlateBox } from './picture.ts';

function photo(id: string, over: Partial<Asset> = {}): Asset {
  return {
    id,
    role: 'mood',
    alt: 'A photograph, dithered',
    twins: { light: `assets/${id}-light.png`, dark: `assets/${id}-dark.png` },
    size: [1600, 900],
    scale: 1,
    source: {
      kind: 'photo',
      origin: 'File:Rosetta Stone.JPG',
      artist: 'Hans Hillewaert',
      license: 'CC BY-SA 4.0',
      shareAlike: true,
    },
    treatment: {
      kind: 'two-tone',
      crop: [0, 300, 1539, 1166],
      autocontrast: 0.5,
      black: 140,
      white: 230,
      gamma: 0.9,
      polarity: 'dark-ground',
      cell: 2,
      bayer: 8,
      resampler: 'lanczos3',
    },
    credit: 'Photograph: Hans Hillewaert, CC BY-SA 4.0',
    inline: 'two-color',
    metrics: {
      litFraction: 0.31,
      plateClear: { plate: [851, 539, 612, 232], nearestLitPx: 40, litUnder: 0, litInBand: 0 },
    },
    ...over,
  };
}

function mood(id: string, asset: string, credit?: string): Slide {
  return {
    schemaVersion: 1,
    id,
    kind: 'mood',
    picture: { asset, fit: 'cover' },
    plate: {
      side: 'lower-right',
      maxWidth: 560,
      blocks: [
        { id: 't', type: 'heading', level: 'title', text: 'The Rosetta Stone' },
        ...(credit !== undefined ? [{ id: 'credit', type: 'credit' as const, text: credit }] : []),
      ],
    },
  };
}

function content(id: string): Slide {
  return {
    schemaVersion: 1,
    id,
    kind: 'content',
    layout: { type: 'center' },
    slots: { main: [{ id: 'h', type: 'heading', level: 'h2', text: 'A content slide' }] },
  };
}

function opener(id: string, asset: string): Slide {
  return {
    schemaVersion: 1,
    id,
    kind: 'opener',
    sectionId: 'brand',
    picture: { asset, fit: 'cover' },
    plate: {
      side: 'lower-left',
      maxWidth: 740,
      blocks: [{ id: 'big', type: 'heading', level: 'big', text: 'Brand' }],
    },
  };
}

function document(slides: Slide[], assets: Asset[]): DeckDocument {
  const deck: Deck = {
    schemaVersion: 1,
    id: 'pic',
    title: 'Pictures',
    theme: 'gt-ink-paper',
    sections: [{ id: 'brand', name: 'Brand', slideIds: slides.map((s) => s.id) }],
    assets: Object.fromEntries(assets.map((a) => [a.id, a])),
    revision: 1,
    createdAt: '2026-09-10T00:00:00Z',
    updatedAt: '2026-09-10T00:00:00Z',
  };
  return { deck, slides: Object.fromEntries(slides.map((s) => [s.id, s])) };
}

const rules = (doc: DeckDocument, rule: string) => lintStatic(doc, { rules: [rule as never] });

describe('picture rules', () => {
  test('the plate rectangle follows the slide plate', () => {
    expect(slidePlateBox(mood('m', 'a'))).toEqual([851, 539, 612, 232]);
    expect(slidePlateBox(opener('o', 'a'))).toEqual([137, 500, 740, 271]);
    const wide = mood('m', 'a');
    if (wide.kind === 'mood') wide.plate.maxWidth = 720;
    expect(slidePlateBox(wide)).toEqual([691, 539, 772, 232]);
    expect(slidePlateBox(content('c'))).toBeUndefined();
  });

  test('plate-clear fires on lit cells under or beside the plate and on stale metrics', () => {
    const clean = document(
      [content('a'), mood('m', 'p', 'Photograph: Hans Hillewaert, CC BY-SA 4.0'), content('b')],
      [photo('p')],
    );
    expect(rules(clean, 'picture/plate-clear')).toEqual([]);
    const under = photo('p', {
      metrics: {
        litFraction: 0.31,
        plateClear: { plate: [851, 539, 612, 232], nearestLitPx: 0, litUnder: 12, litInBand: 4 },
      },
    });
    const f = rules(
      document([content('a'), mood('m', 'p', under.credit), content('b')], [under]),
      'picture/plate-clear',
    );
    expect(f).toHaveLength(1);
    // a mood plate is opaque: lit cells under it are listed at severity 1 (OPENERS.md, Mood slide)
    expect(f[0]?.severity).toBe(1);
    expect(f[0]?.evidence.box).toEqual([851, 539, 612, 232]);
    expect(f[0]?.evidence.measured).toMatchObject({ litUnder: 12 });
    const openerUnder = photo('p', {
      role: 'opener',
      metrics: {
        litFraction: 0.31,
        plateClear: { plate: [137, 500, 740, 271], nearestLitPx: 0, litUnder: 40, litInBand: 9 },
      },
    });
    const o = rules(
      document([opener('o', 'p'), content('a')], [openerUnder]),
      'picture/plate-clear',
    );
    expect(o).toHaveLength(1);
    expect(o[0]?.severity).toBe(2);
    const stale = photo('p', {
      metrics: {
        litFraction: 0.31,
        plateClear: { plate: [137, 500, 740, 271], nearestLitPx: 108, litUnder: 0, litInBand: 0 },
      },
    });
    const s = rules(
      document([content('a'), mood('m', 'p', stale.credit), content('b')], [stale]),
      'picture/plate-clear',
    );
    expect(s).toHaveLength(1);
    expect(s[0]?.severity).toBe(1);
    expect(s[0]?.proposal).toContain('--plate lower-right');
    const unmeasured = photo('p', { metrics: { litFraction: 0.31 } });
    const u = rules(
      document([content('a'), mood('m', 'p', unmeasured.credit), content('b')], [unmeasured]),
      'picture/plate-clear',
    );
    expect(u).toHaveLength(1);
    expect(u[0]?.severity).toBe(1);
  });

  test('blank-twin fires on a two-tone asset shown by a picture or a shot', () => {
    const blank = photo('p', { metrics: { litFraction: 0.01 } });
    const shot: Slide = {
      schemaVersion: 1,
      id: 's',
      kind: 'content',
      layout: { type: 'center' },
      slots: { main: [{ id: 'fig', type: 'shot', asset: 'p' }] },
    };
    const f = rules(document([shot], [blank]), 'picture/blank-twin');
    expect(f).toHaveLength(1);
    expect(f[0]?.blockId).toBe('fig');
    expect(f[0]?.severity).toBe(3);
    expect(rules(document([shot], [photo('p')]), 'picture/blank-twin')).toEqual([]);
  });

  test('mood-placement fires against an opener before or after and against another mood', () => {
    const p = photo('p');
    const cases: [Slide[], number][] = [
      [[opener('o', 'p'), mood('m', 'p', p.credit), content('c')], 1],
      [[content('c'), mood('m', 'p', p.credit), opener('o', 'p')], 1],
      [[content('c'), mood('m', 'p', p.credit), mood('n', 'p', p.credit), content('d')], 1],
      [[opener('o', 'p'), content('c'), mood('m', 'p', p.credit), content('d')], 0],
    ];
    for (const [slides, count] of cases) {
      expect(
        rules(document(slides, [p]), 'picture/mood-placement'),
        slides.map((s) => s.id).join(','),
      ).toHaveLength(count);
    }
  });
});

describe('asset rules', () => {
  test('a share-alike credit must name the artist and the license', () => {
    const p = photo('p');
    expect(creditCovers('Photograph: Hans Hillewaert, CC BY-SA 4.0', p)).toBe(true);
    expect(creditCovers('Photograph: Hans Hillewaert', p)).toBe(false);
    expect(creditCovers('Image: Wikimedia Commons, CC BY-SA 4.0', p)).toBe(false);
    const pd = photo('q', {
      source: {
        kind: 'photo',
        origin: 'x',
        artist: 'NASA',
        license: 'public domain',
        shareAlike: false,
      },
    });
    expect(creditCovers('Image: NASA, 2007, public domain', pd)).toBe(true);
  });

  test('credit-on-plate fires without a credit and with a credit that lacks the license, with a fix', () => {
    const p = photo('p');
    const none = rules(
      document([content('a'), mood('m', 'p'), content('b')], [p]),
      'asset/credit-on-plate',
    );
    expect(none).toHaveLength(1);
    expect(none[0]?.severity).toBe(3);
    expect(none[0]?.fix?.[0]).toMatchObject({ op: 'block.insert', slot: 'plate', after: 't' });
    const partial = rules(
      document([content('a'), mood('m', 'p', 'Photograph: Hans Hillewaert'), content('b')], [p]),
      'asset/credit-on-plate',
    );
    expect(partial).toHaveLength(1);
    expect(partial[0]?.fix?.[0]).toMatchObject({
      op: 'block.set',
      blockId: 'credit',
      path: '/text',
      value: 'Photograph: Hans Hillewaert, CC BY-SA 4.0',
    });
    const ok = rules(
      document(
        [content('a'), mood('m', 'p', 'Photograph: Hans Hillewaert, CC BY-SA 4.0'), content('b')],
        [p],
      ),
      'asset/credit-on-plate',
    );
    expect(ok).toEqual([]);
  });

  test('license-missing fires on an unknown license and on a mood picture without a photo record', () => {
    const unknown = photo('p', {
      source: { kind: 'photo', origin: 'x', license: 'unknown', shareAlike: false },
    });
    expect(
      rules(
        document([content('a'), mood('m', 'p', 'Image: x, unknown'), content('b')], [unknown]),
        'asset/license-missing',
      ),
    ).toHaveLength(1);
    const file = photo('p', { source: { kind: 'file' } });
    expect(
      rules(
        document([content('a'), mood('m', 'p'), content('b')], [file]),
        'asset/license-missing',
      ),
    ).toHaveLength(1);
    const opener2 = photo('p', { role: 'opener', source: { kind: 'file' } });
    expect(
      rules(document([opener('o', 'p'), content('a')], [opener2]), 'asset/license-missing'),
    ).toEqual([]);
    expect(
      rules(
        document([content('a'), mood('m', 'p', photo('p').credit), content('b')], [photo('p')]),
        'asset/license-missing',
      ),
    ).toEqual([]);
  });
});
