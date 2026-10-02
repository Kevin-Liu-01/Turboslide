import { describe, expect, it } from 'vitest';

import { forbiddenWordsIn } from '@turboslide/chrome/menus/strings';
import { SITE } from '@turboslide/theme/brand/site';
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
  CANVAS,
  DEFAULT_VIEW_EXEMPT,
  EXPORT,
  FOOTER,
  FORBIDDEN_PHRASES,
  FORBIDDEN_WORDS,
  HERO,
  HOME_COPY,
  HOME_META,
  HOME_PROPER_NOUNS,
  LICENCE,
  MENUS,
  NAV,
  NUMBERS,
  PRESENT,
  REPORT_WORDS,
  formatPercentFigure,
  formatPercentWord,
} from './copy';
import type { Text } from './copy';
import { formatCount } from './facts';
import type { HomeFacts } from './facts';

// The copy lints of the /home page (docs/POLISH.md 3.1 and 3.7; the round four rules of
// gslides-parity SPEC-4 2.2 stand under them): every string of copy.ts through the theme's
// copy rules (no em dash, no exclamation mark, no metaphor word, no "X, not Y" pair, sentence
// case headings without a trailing period, Title Case buttons), the default view words of the
// menu model kept out of every band a rep reads, the five words of 0.26 and the two phrases of
// R01 6.1 item 3 nowhere, and the rules of 3.1: no comma in a heading, no semicolon and no colon
// in any string a rep reads, every sentence one thought under 20 words, none of the report
// words, no file path and no date outside the agents section's command box, the page under 350
// words, and every count of the tree a function of the facts.

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

/** The keys whose values are addresses, ids or code, not prose. */
const NOT_PROSE = new Set(['href', 'path', 'deckId', 'anchor', 'id', 'external', 'shot', 'icon']);

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

const isCommand = (path: string): boolean => /\.command$/.test(path);
const isExempt = (path: string): boolean =>
  DEFAULT_VIEW_EXEMPT.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));

function wholeWord(word: string): RegExp {
  return new RegExp(`(^|[^A-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i');
}

/** The sentences of a prose string, as a reader splits them. */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** The strings a visitor sees rendered (never the head, an aria label or an alt text). */
function visibleStrings(): string[] {
  return [
    NAV.lockup.word,
    ...NAV.links.map((link) => link.label),
    NAV.appearance.light.label,
    NAV.appearance.dark.label,
    NAV.signIn.label,
    NAV.newPresentation.label,
    HERO.heading,
    HERO.lead,
    HERO.buttons.newPresentation.label,
    HERO.buttons.openDeck.label,
    ...HERO.facts.flatMap((fact) => [fact.key, fact.value]),
    ...NUMBERS.cells.flatMap((cell) => [cell.figure(PROBE), cell.sentence]),
    CANVAS.heading,
    CANVAS.lead,
    ...Object.values(CANVAS.diagram).filter((v) => v !== CANVAS.diagram.label),
    MENUS.heading,
    MENUS.lead,
    PRESENT.heading,
    PRESENT.lead,
    ...Object.values(PRESENT.diagram).filter((v) => v !== PRESENT.diagram.label),
    EXPORT.heading,
    EXPORT.lead,
    EXPORT.diagram.slide,
    EXPORT.diagram.pdf,
    EXPORT.diagram.pptx,
    AGENTS.heading,
    AGENTS.lead(PROBE),
    AGENTS.command,
    AGENTS.diagram.table(PROBE),
    ...AGENTS.diagram.sources,
    AGENTS.diagram.deck,
    AGENTS.link.label,
    LICENCE.heading,
    LICENCE.lead,
    LICENCE.button.label,
    NAV.lockup.word,
    ...FOOTER.links.map((link) => link.label),
    `${FOOTER.maker.before} ${FOOTER.maker.company}${FOOTER.maker.after}`,
    FOOTER.closing,
  ];
}

describe('every string of the page', () => {
  it('is collected with a path', () => {
    expect(every.length).toBeGreaterThan(60);
    expect(every.some((e) => e.path === 'hero.heading')).toBe(true);
    expect(every.some((e) => e.path === 'agents.lead' && e.resolved)).toBe(true);
    expect(every.some((e) => e.path === 'footer.closing')).toBe(true);
  });

  it('carries no em dash, en dash, exclamation mark, semicolon or colon', () => {
    for (const { text, path } of every) {
      expect(text, path).not.toContain(EM_DASH);
      expect(text, path).not.toContain(EN_DASH);
      expect(text, path).not.toContain(';');
      if (isCommand(path)) continue;
      expect(text, path).not.toContain(EXCLAMATION);
      expect(text, path).not.toContain(':');
    }
  });

  it('uses no metaphor word and no "X, not Y" pair', () => {
    for (const { text, path } of every) {
      expect(metaphorCandidates(text), path).toEqual([]);
      if (!isCommand(path))
        expect(CONTRAST_PAIR_PATTERN.test(text), `${path}: "${text}"`).toBe(false);
    }
  });

  it('never says instant, realtime, edge, lightweight or built on Rust, the two phrases or a report word', () => {
    for (const { text, path } of every) {
      for (const word of FORBIDDEN_WORDS)
        expect(wholeWord(word).test(text), `${path}: ${word}`).toBe(false);
      for (const phrase of FORBIDDEN_PHRASES)
        expect(text.toLowerCase(), path).not.toContain(phrase.toLowerCase());
      for (const word of REPORT_WORDS)
        expect(wholeWord(word).test(text), `${path}: ${word}`).toBe(false);
    }
  });

  it('names no file path and no date outside the command box', () => {
    for (const { text, path } of every) {
      if (isCommand(path)) continue;
      expect(/\b[\w-]+\/[\w./-]+/.test(text), `${path}: "${text}"`).toBe(false);
      expect(/\.(ts|tsx|mjs|md|json|css)\b/.test(text), `${path}: "${text}"`).toBe(false);
      expect(/\b20\d\d-\d\d-\d\d\b/.test(text), `${path}: "${text}"`).toBe(false);
    }
    expect(AGENTS.command).toContain('decks/pitch');
  });

  it('writes every sentence as one thought under 20 words', () => {
    for (const { text, path } of every) {
      if (isCommand(path)) continue;
      for (const sentence of sentencesOf(text))
        expect(wordCount(sentence), `${path}: "${sentence}"`).toBeLessThan(20);
    }
  });

  it('keeps the default view words out of every band a rep reads', () => {
    let checked = 0;
    for (const { text, path } of every) {
      if (isExempt(path) || isCommand(path)) continue;
      checked += 1;
      expect(forbiddenWordsIn(text), `${path}: "${text}"`).toEqual([]);
    }
    expect(checked).toBeGreaterThan(40);
    expect(DEFAULT_VIEW_EXEMPT).toEqual(['meta', 'agents', 'licence', 'numbers']);
    /* and the exemptions earn it: the agents section names the transport, the licence section says run */
    expect(forbiddenWordsIn(AGENTS.lead(PROBE))).toContain('MCP');
    expect(forbiddenWordsIn(LICENCE.lead)).toEqual(['run']);
  });

  it('holds the page under 350 words', () => {
    const words = visibleStrings().reduce((sum, text) => sum + wordCount(text), 0);
    expect(words).toBeGreaterThan(150);
    expect(words).toBeLessThan(350);
  });
});

describe('headings and buttons', () => {
  const headings: string[] = [
    HERO.heading,
    CANVAS.heading,
    MENUS.heading,
    PRESENT.heading,
    EXPORT.heading,
    AGENTS.heading,
    LICENCE.heading,
  ];

  it('are one thought each in sentence case with no trailing period, the section headings with no comma', () => {
    expect(headings.length).toBe(7);
    for (const heading of headings) {
      expect(wordsOutsideSentenceCase(heading, HOME_PROPER_NOUNS), heading).toEqual([]);
      expect(/[.:;,]$/.test(heading), heading).toBe(false);
      expect(wordCount(heading), heading).toBeLessThan(10);
    }
    for (const heading of headings.slice(1)) expect(heading, heading).not.toContain(',');
    /* the h1 is the sentence of 3.2 item 1 and the row decks.home.seller-lead: three verbs of
       one task with a list comma, never a clause after a comma */
    expect(HERO.heading).toBe('Build the pitch, present it and send the link');
    expect(/,\s+(in|on|at|with|from|which|that)\b/.test(HERO.heading)).toBe(false);
  });

  const buttons: string[] = [
    NAV.signIn.label,
    NAV.newPresentation.label,
    NAV.appearance.light.label,
    NAV.appearance.dark.label,
    HERO.buttons.newPresentation.label,
    HERO.buttons.openDeck.label,
    LICENCE.button.label,
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

  it('puts no icon before a heading and one in each key cell of the facts rows (DECK-GRAMMAR 40)', () => {
    for (const section of [CANVAS, MENUS, PRESENT, EXPORT, AGENTS, LICENCE])
      expect('icon' in section, section.id).toBe(false);
    const icons = HERO.facts.map((fact) => fact.icon);
    expect(new Set(icons).size).toBe(icons.length);
    expect(icons).toEqual(['bars-3', 'play', 'arrow-down-tray']);
  });
});

describe('the counts of the tree (SPEC-4 0.25)', () => {
  const counted: Text[] = [
    AGENTS.lead,
    AGENTS.diagram.label,
    AGENTS.diagram.table,
    ...NUMBERS.cells.map((cell) => cell.figure),
  ];

  it('flow through functions of the facts, never through digits in a string', () => {
    for (const text of counted) {
      expect(typeof text, 'a count bearing string must be a function of the facts').toBe(
        'function',
      );
      const fn = text as (f: HomeFacts) => string;
      const a = fn(PROBE);
      const b = fn(PROBE_2);
      expect(a).not.toBe(b);
      const markers = [
        formatCount(PROBE.actions),
        formatCount(PROBE.layouts),
        formatPercentWord(PROBE.mismatchPercent),
        formatPercentFigure(PROBE.mismatchPercent),
      ];
      expect(
        markers.some((marker) => a.includes(marker)),
        a,
      ).toBe(true);
    }
    expect(formatPercentWord(0.003)).toBe('0.003 percent');
    expect(formatPercentFigure(0.003)).toBe('0.003%');
  });

  it('keeps the plain strings free of a count of the tree', () => {
    /* a plain string may carry the 170 pages of the example export (85 slides in two appearances) and nothing else in digits */
    for (const { text, path, resolved } of every) {
      if (resolved || isCommand(path)) continue;
      for (const digits of text.match(/\d[\d,.]*\d|\d/g) ?? [])
        expect(digits, `${path}: ${digits} in "${text}"`).toBe('170');
    }
  });
});

describe('the shape of the page (POLISH.md 3.2)', () => {
  it('shares one description with the head, the manifest and the card', () => {
    expect(HERO.lead).toBe(SITE.description);
    expect(HOME_META.description).toBe(SITE.description);
    expect(SITE.manifest.description).toBe(SITE.description);
    /* a plain statement, no comma tail (docs/NEXT.md 4.1.3 item 9; DECK-GRAMMAR 66) */
    expect(HOME_META.title).toBe('Turboslide is a slides editor in the browser');
    expect(HOME_META.title).not.toContain(',');
    expect(sentencesOf(HERO.lead).length).toBe(3);
    expect(sentencesOf(HERO.lead)[0]).toBe('Turboslide is a slides editor in the browser.');
  });

  it('routes the hero, the navigation and the license as 3.2 says', () => {
    expect(HERO.buttons.newPresentation.href).toBe('/new');
    expect(NAV.newPresentation.href).toBe('/new');
    expect(HERO.buttons.openDeck.deckId).toBe('gt-brand');
    expect(HERO.buttons.openDeck.label).toBe('Open the Example Deck');
    /* GitHub moved to the footer and Sign In joined the bar (docs/NEXT.md 4.1.3 item 9) */
    expect(NAV.links.map((link) => link.label)).toEqual(['Documentation']);
    expect(NAV.signIn.label).toBe('Sign In');
    expect(LICENCE.button.href).toBe('https://github.com/Kevin-Liu-01/Turboslide');
    expect(AGENTS.link.href.startsWith('https://github.com/Kevin-Liu-01/Turboslide')).toBe(true);
    const record = NUMBERS.cells.find((cell) => cell.id === 'mismatch');
    expect(record !== undefined && 'href' in record ? record.href : '').toMatch(
      /\/docs\/pptx\.md$/,
    );
    expect(SITE.productionOrigin).toBe('https://www.turboslide.com');
  });

  it('gives the footer the lockup to the top, six links and the closing line', () => {
    expect(FOOTER.lockup.href).toBe('#top');
    expect(FOOTER.links.map((link) => link.label)).toEqual([
      'New presentation',
      'Your presentations',
      'Documentation',
      'GitHub',
      'License',
      'Third party notices',
    ]);
    /* American English in the words, the ids kept (docs/NEXT.md 4.1.3 item 9) */
    expect(FOOTER.links.find((link) => link.label === 'License')?.id).toBe('home.foot.licence');
    expect(LICENCE.heading).toBe('Free under the MIT license');
    expect(LICENCE.button.id).toBe('home.licence.github');
    for (const { text, path } of every)
      expect(/\blicence\b/i.test(text), `${path}: "${text}"`).toBe(false);
    expect(FOOTER.links.find((link) => link.label === 'Your presentations')?.href).toBe('/decks');
    expect(FOOTER.links.every((link) => !link.href.startsWith('/api/'))).toBe(true);
    expect(FOOTER.closing).toContain('Google Slides is a product of Google LLC');
    expect(FOOTER.maker.company).toBe('General Translation');
  });

  it('gives every diagram one sentence as its name', () => {
    for (const label of [
      CANVAS.diagram.label,
      PRESENT.diagram.label,
      EXPORT.diagram.label,
      AGENTS.diagram.label(PROBE),
    ]) {
      expect(label).toMatch(/^[A-Z].*\.$/);
      expect(sentencesOf(label).length).toBe(1);
    }
    expect(AGENTS.command).toBe(
      'pnpm exec turboslide slide new --layout split --deck decks/pitch --json',
    );
  });
});
