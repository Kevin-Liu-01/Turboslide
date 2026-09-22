import { describe, expect, it } from 'vitest';

import {
  SELLER_NAMES,
  coverageCounts,
  coverageHeaders,
  matchName,
  parseNames,
  renderCoverage,
  runCoverage,
} from './logo-coverage.mjs';

// The logo coverage list of a ship (docs/FEATURES.md 4.1): the judge's 146 names, the names file,
// the match rule (title, slug or alias, case folded, a hyphen as a space), the counts and the file,
// and a run over a fake search route.

describe('the names', () => {
  it("carries the judge's 146 names once each", () => {
    expect(SELLER_NAMES.length).toBe(146);
    expect(new Set(SELLER_NAMES).size).toBe(146);
    expect(SELLER_NAMES).toContain('general translation');
    expect(SELLER_NAMES).toContain('lokalise');
  });

  it('reads a names file one a line, folded, with comments and blanks skipped', () => {
    expect(parseNames('# the CRM list\nAcme\n\n  Globex Corp  # a prospect\nfigma\n')).toEqual([
      'acme',
      'globex corp',
      'figma',
    ]);
  });
});

describe('the match', () => {
  const rows = [
    { slug: 'figma', title: 'Figma', aliases: [] },
    { slug: 'coca-cola', title: 'Coca-Cola', aliases: ['coke'] },
    { slug: 'meta', title: 'Meta', aliases: ['facebook'] },
    { slug: 'figmatic', title: 'Figmatic', aliases: [] },
  ];
  it('matches the title, the slug or an alias, case folded, a hyphen as a space, and never a near match', () => {
    expect(matchName('Figma', rows)?.slug).toBe('figma');
    expect(matchName('coca cola', rows)?.slug).toBe('coca-cola');
    expect(matchName('coke', rows)?.slug).toBe('coca-cola');
    expect(matchName('facebook', rows)?.slug).toBe('meta');
    expect(matchName('figm', rows)).toBeNull();
    expect(matchName('lokalise', rows)).toBeNull();
    expect(matchName('figma', [])).toBeNull();
    expect(matchName('figma', undefined)).toBeNull();
  });
});

describe('the counts and the file', () => {
  const results = [
    { name: 'figma', slug: 'figma', status: 200 },
    { name: 'lokalise', slug: null, status: 200 },
    { name: 'stripe', slug: 'stripe', status: 200 },
  ];
  it('counts the present and the missing', () => {
    expect(coverageCounts(results)).toEqual({ names: 3, present: 2, missing: 1 });
    expect(coverageCounts([])).toEqual({ names: 0, present: 0, missing: 0 });
  });
  it('renders the head, one line a name and the missing at the foot', () => {
    const text = renderCoverage({
      base: 'https://turboslide.vercel.app',
      date: '2026-09-22',
      updatedAt: '2026-09-22T06:00:00.000Z',
      results,
      source: "judge-seller's 146 names",
    });
    expect(text).toContain(
      '# logo coverage: 2 of 3 names matched on https://turboslide.vercel.app on 2026-09-22; 1 missing',
    );
    expect(text).toContain('updated 2026-09-22T06:00:00.000Z');
    expect(text).toContain('figma\tfigma\n');
    expect(text).toContain('lokalise\t-\n');
    expect(text).toContain('# missing (1): lokalise');
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('the headers', () => {
  it('sends the preview header and the bearer where each exists, and no bearer on localhost', () => {
    expect(coverageHeaders('http://localhost:4414', {})).toEqual({ accept: 'application/json' });
    expect(coverageHeaders('http://localhost:4414', { VERCEL_OIDC_TOKEN: 'oidc' })).toEqual({
      accept: 'application/json',
      'x-vercel-trusted-oidc-idp-token': 'oidc',
    });
    expect(coverageHeaders('https://example.test', { TURBOSLIDE_TOKEN: 'abc' }).authorization).toBe(
      'Bearer abc',
    );
    expect(
      coverageHeaders('http://localhost:4414', { TURBOSLIDE_TOKEN: 'abc' }).authorization,
    ).toBeUndefined();
  });
});

describe('a run', () => {
  it('searches each name, matches the rows, keeps the index date and counts the failures apart', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      const q = decodeURIComponent(new URL(url).searchParams.get('q'));
      if (q === 'broken') return { status: 503, json: async () => ({}) };
      const rows =
        q === 'figma'
          ? [{ slug: 'figma', title: 'Figma', aliases: [] }]
          : q === 'coke'
            ? [{ slug: 'coca-cola', title: 'Coca-Cola', aliases: ['coke'] }]
            : [];
      return {
        status: 200,
        json: async () => ({ logos: rows, updatedAt: '2026-09-22T06:00:00.000Z' }),
      };
    };
    const run = await runCoverage({
      base: 'http://localhost:4414/',
      names: ['figma', 'coke', 'lokalise', 'broken'],
      limit: 3,
      fetchImpl,
      env: {},
    });
    expect(calls[0]).toBe('http://localhost:4414/api/logo/search?q=figma&limit=3');
    expect(run.updatedAt).toBe('2026-09-22T06:00:00.000Z');
    expect(run.results.map((r) => [r.name, r.slug])).toEqual([
      ['figma', 'figma'],
      ['coke', 'coca-cola'],
      ['lokalise', null],
      ['broken', null],
    ]);
    expect(run.failures).toEqual([{ name: 'broken', status: 503 }]);
    expect(coverageCounts(run.results)).toEqual({ names: 4, present: 2, missing: 2 });
  });
});
