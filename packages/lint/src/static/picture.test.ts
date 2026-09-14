// The picture and asset rules on constructed documents (MILESTONES M5 item 2): each rule fires on
// its planted defect and stays quiet on the clean form, the plate rectangle follows the slide's
// own plate, and the credit fix is the deck's credit line.
import { describe, expect, test } from 'vitest';

import type { Asset, Deck, DeckDocument, Slide } from '../contracts.ts';
import {
  FIXTURE_BACKGROUND_DITHER,
  FIXTURE_BACKGROUND_KEY,
  FIXTURE_DITHER_PLATE,
  FIXTURE_STRENGTH_DITHER,
  document as fixture,
  fixtureDitherKey,
} from '../fixtures/deck.ts';
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

  describe('the block level dither (gslides-parity SPEC-3 10.4)', () => {
    const files = {
      twins: { light: 'assets/h-light.png', dark: 'assets/h-dark.png' },
      sourceFile: 'assets/h.jpg',
    };
    const key = fixtureDitherKey(files, FIXTURE_BACKGROUND_DITHER, [1600, 900]);
    function continuous(metrics?: Asset['metrics']): Asset {
      return {
        id: 'h',
        role: 'other',
        alt: 'A harbour',
        ...files,
        size: [1600, 900],
        scale: 1,
        source: { kind: 'photo', origin: 'File:H.jpg', license: 'CC0 1.0', shareAlike: false },
        inline: 'resample-1280',
        ...(metrics !== undefined
          ? {
              variants: {
                [key]: {
                  key,
                  twins: {
                    light: 'assets/h.dither-x-light.png',
                    dark: 'assets/h.dither-x-dark.png',
                  },
                  size: [1600, 900] as [number, number],
                  scale: 2 as const,
                  metrics,
                  producedAt: '2026-09-13T00:00:00Z',
                },
              },
            }
          : {}),
      };
    }
    function canvas(plate: boolean, stripDither = false): Slide {
      return {
        schemaVersion: 1,
        id: 'c',
        kind: 'content',
        layout: { type: 'freeform' },
        slots: {
          main: [
            {
              id: 'bg',
              type: 'picture',
              asset: 'h',
              dither: FIXTURE_BACKGROUND_DITHER,
              pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
            },
            ...(plate
              ? [
                  {
                    id: 'plate',
                    type: 'box' as const,
                    fill: 'paper' as const,
                    strokeWidth: 0 as const,
                    pos: { x: 137, y: 506, w: 740, h: 265, z: 1, group: 'plate' },
                  },
                  {
                    id: 'big',
                    type: 'heading' as const,
                    level: 'big' as const,
                    text: 'Over the picture',
                    pos: { x: 163, y: 528, w: 688, h: 77, z: 2, group: 'plate' },
                  },
                ]
              : []),
            ...(stripDither
              ? [
                  {
                    id: 'strip',
                    type: 'picture' as const,
                    asset: 'h',
                    dither: FIXTURE_STRENGTH_DITHER,
                    pos: { x: 900, y: 129, w: 560, h: 315, z: 3 },
                  },
                ]
              : []),
          ],
        },
      };
    }

    test('the variant metrics drive blank-twin and plate-clear on the covering picture; a picture clear of the plate is not measured against it', () => {
      const blankUnder = document(
        [canvas(true, true)],
        [
          continuous({
            litFraction: 0.99,
            plateClear: { plate: FIXTURE_DITHER_PLATE, nearestLitPx: 0, litUnder: 5, litInBand: 2 },
          }),
        ],
      );
      const blank = rules(blankUnder, 'picture/blank-twin');
      expect(blank).toHaveLength(1);
      expect(blank[0]).toMatchObject({ blockId: 'bg', path: '/slots/main/0/dither', severity: 3 });
      expect(blank[0]?.evidence.measured).toEqual({ litFraction: 0.99 });
      const clear = rules(blankUnder, 'picture/plate-clear');
      expect(clear).toHaveLength(1);
      expect(clear[0]).toMatchObject({ blockId: 'bg', severity: 2 });
      expect(clear[0]?.evidence.box).toEqual(FIXTURE_DITHER_PLATE);
      expect(clear[0]?.evidence.measured).toMatchObject({ litUnder: 5 });
      expect(clear[0]?.proposal).toContain('5 lit cell(s) sit under the plate');
    });

    test('without a variant the plate rule reports at severity 1 that nothing is measured, and only when a plate group sits over the picture', () => {
      const unmeasured = rules(document([canvas(true)], [continuous()]), 'picture/plate-clear');
      expect(unmeasured).toHaveLength(1);
      expect(unmeasured[0]).toMatchObject({ blockId: 'bg', severity: 1 });
      expect(unmeasured[0]?.proposal).toContain('turboslide picture materialize c');
      expect(rules(document([canvas(true)], [continuous()]), 'picture/blank-twin')).toEqual([]);
      expect(rules(document([canvas(false)], [continuous()]), 'picture/plate-clear')).toEqual([]);
      const stale = rules(
        document(
          [canvas(true)],
          [
            continuous({
              litFraction: 0.4,
              plateClear: { plate: [0, 0, 10, 10], nearestLitPx: 3, litUnder: 0, litInBand: 0 },
            }),
          ],
        ),
        'picture/plate-clear',
      );
      expect(stale).toHaveLength(1);
      expect(stale[0]?.severity).toBe(1);
      expect(stale[0]?.proposal).toContain('measured against the plate at 0, 0, 10, 10');
      const quiet = rules(
        document(
          [canvas(true)],
          [
            continuous({
              litFraction: 0.4,
              plateClear: {
                plate: FIXTURE_DITHER_PLATE,
                nearestLitPx: 40,
                litUnder: 0,
                litInBand: 0,
              },
            }),
          ],
        ),
        'picture/plate-clear',
      );
      expect(quiet).toEqual([]);
    });

    test('an asset without a continuous source is skipped: the store refuses that dither before it is written', () => {
      const twoTone = photo('h', { twins: files.twins });
      const slide = canvas(true);
      expect(() => rules(document([slide], [twoTone]), 'picture/plate-clear')).not.toThrow();
      expect(rules(document([slide], [twoTone]), 'picture/plate-clear')).toEqual([]);
    });

    test('the fixture deck plants both rules on canvas-dither through its recorded variant', () => {
      const onFixture = lintStatic(fixture, { slideIds: ['canvas-dither'] });
      expect(
        onFixture.filter((f) => f.rule === 'picture/blank-twin').map((f) => f.blockId),
      ).toEqual(['bg']);
      expect(
        onFixture
          .filter((f) => f.rule === 'picture/plate-clear')
          .map((f) => [f.blockId, f.severity]),
      ).toEqual([['bg', 2]]);
      expect(fixture.deck.assets['dither-photo']?.variants?.[FIXTURE_BACKGROUND_KEY]).toBeDefined();
    });
  });
});
