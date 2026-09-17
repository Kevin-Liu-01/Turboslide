import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { forbiddenWordsIn } from '@turboslide/chrome/menus/strings';
import {
  CONTRAST_PAIR_PATTERN,
  EM_DASH,
  EN_DASH,
  EXCLAMATION,
  metaphorCandidates,
  wordsOutsideSentenceCase,
} from '@turboslide/theme/copy';

import {
  AGENTS,
  CARDS,
  COMPARE,
  DEFAULT_VIEW_EXEMPT,
  DITHERS,
  EDITOR,
  FOOTER,
  FORBIDDEN_PHRASES,
  FORBIDDEN_WORDS,
  HERO,
  HOME_COPY,
  HOME_PROPER_NOUNS,
  MEASURED,
  NAV,
  NUMBERS,
  SHOT_ALT,
  SPEED,
} from './copy';
import type { Text } from './copy';
import { FACT_KEYS, formatCount, formatPercent } from './facts';
import type { HomeFacts } from './facts';

// The copy lints of the /home page (gslides-parity SPEC-4 2.2, 0.20, 0.25, 0.26; MILESTONES-4 B2
// item 3): every string of copy.ts through packages/theme copy.ts's rules (no em dash, no
// exclamation mark, no metaphor word, no "X, not Y" pair, sentence case headings without a
// trailing period, Title Case buttons), the default view words list of the menu model over every
// band a rep reads, the five words of 0.26 and the two phrases of R01 6.1 item 3 nowhere, the
// literal count rule (a count of the tree is a function of the facts, never digits in a string),
// a source line beside every number, and the measured numbers cross checked against the
// verifier's JSON under docs/gslides-parity/verification-4/ when it is present.

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
/** The verifier's production run after the round four ship (VERIFICATION-4 section 5), the source of the measured numbers since the fixer round. */
const PRODUCTION_JSON = join(
  ROOT,
  'docs/gslides-parity/verification-4/perf-budget-production-2026-09-14.json',
);

/** Distinct primes above 99,999, so every formatted probe carries a thousands separator and no two collide. */
const PROBE: HomeFacts = {
  actions: 100003,
  mcpTools: 100019,
  httpPaths: 100043,
  layouts: 100049,
  materials: 100069,
  checkSteps: 100103,
  parityRows: 100109,
  mismatchPercent: 0.123,
  licence: 'PROBE',
};
const PROBE_2: HomeFacts = {
  actions: 200003,
  mcpTools: 200017,
  httpPaths: 200023,
  layouts: 200029,
  materials: 200041,
  checkSteps: 200063,
  parityRows: 200087,
  mismatchPercent: 0.456,
  licence: 'PROBE2',
};

/** The marks a resolved string must carry to prove its figure came from the facts. */
function probeMarkers(facts: HomeFacts): string[] {
  return [
    ...FACT_KEYS.map((key) => formatCount(facts[key])),
    formatCount(facts.layouts - 11),
    formatPercent(facts.mismatchPercent),
    facts.licence,
  ];
}

/** The keys whose values are addresses, ids or code, not prose. */
const NOT_PROSE = new Set([
  'href',
  'path',
  'deckId',
  'principalId',
  'anchor',
  'id',
  'external',
  'shot',
  'pair',
  'icon',
]);

type Visit = (text: string, path: string, resolved: boolean) => void;

/** Every string and every text function of a copy object, with a dotted path (an `id` names an array entry). */
function walk(value: unknown, path: string, visit: Visit): void {
  if (typeof value === 'string') {
    visit(value, path, false);
    return;
  }
  if (typeof value === 'function') {
    visit((value as (f: HomeFacts) => string)(PROBE), path, true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((each, index) => {
      const id =
        typeof each === 'object' &&
        each !== null &&
        typeof (each as { id?: unknown }).id === 'string'
          ? (each as { id: string }).id
          : String(index);
      walk(each, `${path}.${id}`, visit);
    });
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, each] of Object.entries(value)) {
      if (NOT_PROSE.has(key)) continue;
      walk(each, path === '' ? key : `${path}.${key}`, visit);
    }
  }
}

const every: { text: string; path: string; resolved: boolean }[] = [];
walk(HOME_COPY, '', (text, path, resolved) => every.push({ text, path, resolved }));

const isCommand = (path: string): boolean => /\.command(\.|$)|\.push$/.test(path);
const isSource = (path: string): boolean => /\.source$/.test(path);
const isExempt = (path: string): boolean =>
  DEFAULT_VIEW_EXEMPT.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)) ||
  isSource(path);

function wholeWord(word: string): RegExp {
  return new RegExp(`(^|[^A-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i');
}

describe('every string of the page', () => {
  it('is collected with a path', () => {
    expect(every.length).toBeGreaterThan(150);
    expect(every.some((e) => e.path === 'hero.sentence')).toBe(true);
    expect(every.some((e) => e.path === 'compare.rows.automation.turboslide')).toBe(true);
    expect(every.some((e) => e.path === 'footer.groups.agents.heading')).toBe(true);
  });

  it('carries no em dash, en dash or exclamation mark', () => {
    for (const { text, path } of every) {
      expect(text, path).not.toContain(EM_DASH);
      expect(text, path).not.toContain(EN_DASH);
      if (!isCommand(path)) expect(text, path).not.toContain(EXCLAMATION);
    }
  });

  it('uses no metaphor word and no "X, not Y" pair', () => {
    for (const { text, path } of every) {
      expect(metaphorCandidates(text), path).toEqual([]);
      if (!isCommand(path))
        expect(CONTRAST_PAIR_PATTERN.test(text), `${path}: "${text}"`).toBe(false);
    }
  });

  it('never says instant, realtime, edge, lightweight or built on Rust, and never the two phrases', () => {
    for (const { text, path } of every) {
      for (const word of FORBIDDEN_WORDS)
        expect(wholeWord(word).test(text), `${path}: ${word}`).toBe(false);
      for (const phrase of FORBIDDEN_PHRASES)
        expect(text.toLowerCase(), path).not.toContain(phrase.toLowerCase());
    }
  });

  it('keeps the default view words out of every band a rep reads', () => {
    let checked = 0;
    for (const { text, path } of every) {
      if (isExempt(path) || isCommand(path)) continue;
      checked += 1;
      expect(forbiddenWordsIn(text), `${path}: "${text}"`).toEqual([]);
    }
    expect(checked).toBeGreaterThan(100);
    /* the exemptions are the two technical bands, the Automation row and the footer's agents group */
    expect(DEFAULT_VIEW_EXEMPT).toEqual([
      'meta',
      'speed',
      'agents',
      'compare.rows.automation',
      'footer.groups.agents',
    ]);
    /* and they earn it: the agents band names the transport */
    expect(forbiddenWordsIn(AGENTS.rows[1]?.label ?? '')).toEqual(['MCP']);
  });
});

describe('headings and buttons', () => {
  const headings: string[] = [
    CARDS.heading,
    EDITOR.heading,
    DITHERS.heading,
    DITHERS.specimens.heading,
    SPEED.heading,
    AGENTS.heading,
    COMPARE.heading,
    COMPARE.columns.google,
    COMPARE.columns.turboslide,
    ...CARDS.cards.map((card) => card.title),
    ...SPEED.rows.map((row) => row.title),
    ...FOOTER.groups.map((group) => group.heading),
    ...COMPARE.rows.map((row) => row.row),
  ];

  it('are sentence case without a trailing period', () => {
    expect(headings.length).toBeGreaterThan(30);
    for (const heading of headings) {
      expect(wordsOutsideSentenceCase(heading, HOME_PROPER_NOUNS), heading).toEqual([]);
      expect(/[.:;,]$/.test(heading), heading).toBe(false);
    }
  });

  const buttons: string[] = [
    NAV.newPresentation.label,
    NAV.appearance.light.label,
    NAV.appearance.dark.label,
    HERO.buttons.newPresentation.label,
    HERO.buttons.openDeck.label,
    HERO.buttons.github.label,
  ];
  const SMALL = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'in', 'on']);

  it('label the buttons in Title Case', () => {
    for (const label of buttons) {
      const words = label.split(' ');
      words.forEach((word, index) => {
        const capital = /^[A-Z]/.test(word);
        if (index === 0 || index === words.length - 1 || !SMALL.has(word))
          expect(capital, label).toBe(true);
        else expect(capital, label).toBe(false);
      });
    }
  });

  it('gives every control a tooltip name and one sentence', () => {
    const tips = [
      NAV.lockup.tip,
      ...NAV.links.map((link) => link.tip),
      NAV.appearance.light.tip,
      NAV.appearance.dark.tip,
      NAV.newPresentation.tip,
      HERO.buttons.newPresentation.tip,
      HERO.buttons.openDeck.tip,
      HERO.buttons.github.tip,
      ...FOOTER.groups.flatMap((group) => group.links.map((link) => link.tip)),
      FOOTER.lockupTip,
    ];
    expect(tips.length).toBeGreaterThan(30);
    for (const tip of tips) {
      expect(tip.name.trim().length, tip.name).toBeGreaterThan(0);
      expect(/^[A-Z].*\.$/.test(tip.doc), `${tip.name}: "${tip.doc}"`).toBe(true);
      expect(tip.doc.split('. ').length, tip.doc).toBeLessThanOrEqual(2);
    }
  });
});

describe('the counts of the tree (SPEC-4 0.25)', () => {
  const counted: Text[] = [
    ...NUMBERS.map((n) => n.figure),
    ...CARDS.cards
      .filter((c) => ['layouts', 'objects', 'quality'].includes(c.id))
      .map((c) => c.copy),
    ...DITHERS.claims.filter((claim) => typeof claim !== 'string'),
    ...SPEED.rows.filter((row) => row.id === 'contracts').map((row) => row.figure),
    AGENTS.lead,
    ...COMPARE.rows
      .filter((row) => ['automation', 'layouts', 'pictures'].includes(row.id))
      .map((row) => row.turboslide),
  ];

  it('flow through functions of the facts, never through digits in a string', () => {
    expect(counted.length).toBe(15);
    for (const text of counted) {
      expect(typeof text, 'a count bearing string must be a function of the facts').toBe(
        'function',
      );
      const fn = text as (f: HomeFacts) => string;
      const a = fn(PROBE);
      const b = fn(PROBE_2);
      expect(a).not.toBe(b);
      const carries = probeMarkers(PROBE).filter((marker) => a.includes(marker));
      expect(carries.length, a).toBeGreaterThan(0);
      /* the derived GT layout count stays arithmetic on the facts, never a literal ten */
      if (a.includes('GT layouts')) expect(a).toContain(formatCount(PROBE.layouts - 11));
    }
  });

  it('reaches every fact key from at least one string', () => {
    const resolved = counted.map((text) => (text as (f: HomeFacts) => string)(PROBE)).join('\n');
    for (const key of FACT_KEYS) expect(resolved, key).toContain(formatCount(PROBE[key]));
  });

  it('has no plain string in the strip, the cards or the comparison with a three digit count', () => {
    /* the counts the page states are 21 layouts and above; a plain string may carry a hundred
       only as a measured fact or a product limit named in the README (1600 percent, 20 by 20,
       170 pages, 85 slides, 12 categories), and never one of the eight counts */
    const plain = every.filter(
      (e) => !e.resolved && /^(numbers|cards|compare)\./.test(e.path) && !isSource(e.path),
    );
    expect(plain.length).toBeGreaterThan(20);
    const allowed = new Set(['1600', '20', '170', '85', '12', '6', '409', '613', '0.003']);
    for (const { text, path } of plain) {
      for (const digits of text.match(/\d[\d,.]*\d|\d/g) ?? [])
        expect(allowed.has(digits), `${path}: ${digits} in "${text}"`).toBe(true);
    }
  });
});

describe('the numbers and their source lines (SPEC-4 0.20)', () => {
  it('give every figure of the strip a source naming a file or a dated document', () => {
    expect(NUMBERS.length).toBe(6);
    for (const figure of NUMBERS)
      expect(figure.source, figure.id).toMatch(/\.(ts|md|json)|LICENSE/);
    expect(NUMBERS.find((n) => n.id === 'mismatch')?.source).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('give every speed row two sentences, a figure and a source', () => {
    expect(SPEED.rows.length).toBe(8);
    for (const row of SPEED.rows) {
      expect(row.body.split(/\.\s/).length, row.id).toBeGreaterThanOrEqual(2);
      expect(row.source, row.id).toMatch(/\.(ts|mjs|md|json)/);
      expect(row.figure, row.id).toBeTruthy();
    }
    /* a measured row names the date it was read */
    for (const id of ['renderer', 'rust', 'export', 'batches', 'preload', 'immutable']) {
      const row = SPEED.rows.find((r) => r.id === id);
      expect(row?.source, id).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
    expect(SPEED.closing.source).toMatch(
      /verification-4\/perf-budget-production-2026-09-14\.json, 2026-09-14/,
    );
  });

  it('writes the Rust row and the preload row in the tense of the ship tree (PP section 4)', () => {
    expect(SPEED.rows.find((r) => r.id === 'rust')?.body).toContain(
      'The hosted studio runs the TypeScript stages today.',
    );
    /* the title row's mark is a same document link since round four (SPEC-4 0.16, 0.39): the
       sentence is in the present tense and never says the move is a document load */
    expect(SPEED.rows.find((r) => r.id === 'preload')?.body).toContain(
      'keeps the page and its code',
    );
    expect(SPEED.rows.find((r) => r.id === 'preload')?.body).not.toContain('document load');
    expect(SPEED.closing.text).toContain('one instance renders one slide at a time');
  });

  it("uses the verifier's post round production numbers, not the day 0 baseline or R04's", () => {
    expect(MEASURED.preload.text).toContain(String(MEASURED.preload.decksToEditGtBrandMs));
    expect(MEASURED.preload.text).toContain(String(MEASURED.preload.editToDecksMs));
    for (const stale of ['858', '399', '598', '544', '723'])
      expect(MEASURED.preload.text).not.toContain(stale);
    expect(SPEED.closing.text).not.toContain('823');
    expect(SPEED.closing.text).not.toContain('4.3 s');
  });

  const hasProduction = existsSync(PRODUCTION_JSON);

  it.skipIf(!hasProduction)(
    "matches the verifier's production JSON where it holds the number",
    () => {
      const json = JSON.parse(readFileSync(PRODUCTION_JSON, 'utf8')) as {
        routes: {
          route: string;
          kind?: string;
          ttfb?: number;
          ready?: number;
          jsDecoded?: number;
          samples?: { ttfb: number }[];
        }[];
        transitions: { name: string; ms: number }[];
        twins: { total: number; refetched: number };
      };
      const decksToEdit = json.transitions.find((t) => t.name === 'decks->edit');
      expect(Math.round(decksToEdit?.ms ?? 0)).toBe(MEASURED.preload.decksToEditGtBrandMs);
      const editToDecks = json.transitions.find((t) => t.name === 'edit->decks');
      expect(Math.round(editToDecks?.ms ?? 0)).toBe(MEASURED.preload.editToDecksMs);
      expect([json.twins.refetched, json.twins.total]).toEqual([
        ...MEASURED.immutable.twinsRefetched,
      ]);
      const cold = (route: string) =>
        json.routes.find((r) => r.route === route && r.kind === 'cold');
      expect(Math.round(cold('/new')?.ready ?? 0)).toBe(MEASURED.closing.newReadyColdMs);
      expect(Math.round(cold('/deck/gt-brand')?.ready ?? 0)).toBe(MEASURED.closing.deckReadyColdMs);
      expect(Math.round(cold('/decks')?.ttfb ?? 0)).toBe(MEASURED.closing.decksTtfbColdMs);
      const worst = Math.max(...(cold('/decks')?.samples ?? []).map((s) => s.ttfb));
      expect(Math.round(worst)).toBe(MEASURED.closing.decksTtfbWorstMs);
      const decoded = json.routes.map((r) => r.jsDecoded ?? 0).filter((n) => n > 0);
      expect(Math.round(Math.min(...decoded) / 1024)).toBe(MEASURED.closing.jsDecodedKb[0]);
      expect(Math.round(Math.max(...decoded) / 1024)).toBe(MEASURED.closing.jsDecodedKb[1]);
    },
  );
});

describe('the shape of the page', () => {
  it('has twelve cards over all fifteen README pictures, six rows for agents, twelve comparison rows and four footer groups', () => {
    expect(CARDS.cards.length).toBe(12);
    const shown = new Set<string>();
    for (const card of CARDS.cards) {
      if (card.shot !== undefined) shown.add(card.shot);
      if (card.pair !== undefined) shown.add(card.pair);
    }
    for (const name of [
      '01-new-presentation',
      '13-editor-light',
      '06-canvas-rotation',
      '12-slideshow-dither',
    ])
      shown.add(name);
    const readme = Object.keys(SHOT_ALT).filter((name) => name !== 'hero-frame');
    expect(readme.length).toBe(15);
    for (const name of readme) expect(shown.has(name), name).toBe(true);
    expect(AGENTS.rows.length).toBe(6);
    expect(COMPARE.rows.length).toBe(12);
    expect(FOOTER.groups.length).toBe(4);
    for (const alt of Object.values(SHOT_ALT)) expect(alt).toMatch(/\.$/);
  });

  it('keeps the rows where Turboslide has less and the affiliation sentence', () => {
    const turboslide = (id: string): string => {
      const row = COMPARE.rows.find((r) => r.id === id);
      return typeof row?.turboslide === 'string' ? row.turboslide : '';
    };
    expect(turboslide('export')).toContain('No ODP or SVG');
    expect(turboslide('import')).toContain('No PowerPoint import yet');
    expect(turboslide('transitions')).toMatch(/^None;/);
    expect(COMPARE.lead).toContain('Google Slides is a product of Google LLC');
    expect(FOOTER.closing).toContain('Google Slides is a product of Google LLC');
  });

  it('routes the hero as SPEC-4 2.5 says', () => {
    expect(HERO.buttons.newPresentation.href).toBe('/new');
    expect(HERO.buttons.openDeck.deckId).toBe('gt-brand');
    expect(HERO.buttons.github.href).toBe('https://github.com/Kevin-Liu-01/Turboslide');
    expect(HERO.credit).toBe(
      'Material: liquid metal, Paper Shaders, one frame through the two tone screen',
    );
  });
});
