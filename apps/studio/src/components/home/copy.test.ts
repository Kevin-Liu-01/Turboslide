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

import { VISIT_GAPS } from './boot.generated';
import {
  AGENTS,
  CANVAS,
  CLOSE,
  DEFAULT_VIEW_EXEMPT,
  EXPORT,
  FOOTER,
  FORBIDDEN_PHRASES,
  FORBIDDEN_WORDS,
  HERO,
  HISTORY,
  HOME_COPY,
  HOME_META,
  HOME_PROPER_NOUNS,
  NAV,
  PARTS,
  PRESENT,
  REPORT_WORDS,
  SLIDES,
  TAILOR,
} from './copy';
import { HOME_DECK, HOME_EXPORT_FACTS, HOME_RUN_FACTS, HOME_TAILOR_WORDS } from './deck.generated';
import { HOME_FACTS, formatCount } from './facts';
import type { HomeFacts } from './facts';
import { REQUEST_ONLY } from './panel-format';
import { HOME_RUN } from './run.generated';

// The copy lints of the landing (docs/LANDING.md 2.12 and the row decks.home.copy-rules): every
// string of copy.ts through the theme's copy rules (no em dash, en dash or exclamation mark, no
// metaphor word, no "X, not Y" pair, sentence case headings without a trailing period, Title Case
// buttons); no semicolon or colon outside the generated command lines; every sentence one thought
// under 20 words; none of the five words of SPEC-4 0.26, the phrases or the report words; no file
// path outside the generated command lines; the default view words of the menu model kept out of
// every band but the head, the agents band, the Command row's line and the parts table; the page's
// own copy under 350 words at rest with Sign In shown; every count of the tree a function of the
// facts; the hero's visit sentences at most 50 characters and the boot script's.

/** Distinct primes above 99,999, so every formatted probe carries a thousands separator and no two collide. */
const PROBE: HomeFacts = {
  actions: 100003,
  mcpTools: 100019,
  httpPaths: 100043,
  layouts: 100049,
  materials: 100069,
  checkSteps: 100103,
  parityRows: 100109,
  shapes: 100129,
  menus: 100151,
  cliCommands: 100153,
  mismatchPercent: 0.123,
  licence: 'PROBE',
};

/** The keys whose values are addresses, ids or code, not prose. */
const NOT_PROSE = new Set(['href', 'path', 'deckId', 'anchor', 'id', 'external', 'icon']);

type Visit = (text: string, path: string, resolved: boolean) => void;

/** A text function's probe call: the facts, or small numbers for a function of plain arguments. */
function probeCall(fn: (...args: never[]) => unknown, path: string): string {
  if (path.startsWith('parts.')) return String((fn as (f: HomeFacts) => string)(PROBE));
  if (path === 'export.rows.perfect.sentence')
    return (fn as (s: { width: number; height: number }, f: HomeFacts) => string)(
      { width: 3200, height: 1800 },
      PROBE,
    );
  if (path === 'canvas.log.pos')
    return (fn as (a: string, b: string, c: object) => string)('rosetta', 'h', {
      x: 612,
      y: 388,
      w: 520,
      h: 96,
    });
  if (path.startsWith('canvas.log.'))
    return (fn as (a: string, b: string, c: number) => string)('rosetta', 'h', 15);
  if (path === 'tailor.kitStatus') return (fn as (k: string, n: number) => string)('kestrel', 8);
  if (/^history\.(moved|resized|edited)$/.test(path))
    return (fn as (a: string, b: number) => string)('the title', 1);
  if (path === 'history.turned')
    return (fn as (a: string, b: number, c: number) => string)('the heading', 6, 15);
  if (/^history\.(tailored|kit)$/.test(path)) return (fn as (a: string) => string)('Globex');
  return String((fn as (a: number, b: number) => string)(3, 8));
}

/** Every string and every text function of a copy object, with a dotted path (an `id` names an array entry). */
function walk(value: unknown, path: string, visit: Visit): void {
  if (typeof value === 'string') {
    visit(value, path, false);
    return;
  }
  if (typeof value === 'function') {
    visit(probeCall(value as (...args: never[]) => unknown, path), path, true);
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

/** Generated command lines and the panel's prompt: code, not page copy. */
const isCommand = (path: string): boolean =>
  path.startsWith('canvas.log.') || path === 'agents.panel.prompt';
/** The slide's credit line, in the deck's own credit form ("Image: ..., 2007, public domain"). */
const isCredit = (path: string): boolean => path === 'slides.heroCredit';
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

/**
 * The page's own copy a visitor reads at rest with Sign In shown (docs/LANDING.md 2.12): outside
 * the slides (the h1, the subtitle, the credit and the slide titles of the Present list), the
 * `#101010` panel, the Command row's generated line, Version history's rows and the product's own
 * strings (the Tailor dialog's Replace, With, count and Apply). The skip link is shown on focus
 * only; Move Up and Move Down show under the chosen thumbnail at rest.
 */
function restingStrings(): string[] {
  return [
    NAV.lockup.word,
    ...NAV.links.map((link) => link.label),
    NAV.appearance.light.label,
    NAV.appearance.dark.label,
    NAV.signIn.label,
    NAV.newPresentation.label,
    HERO.caption.pointer,
    HERO.undo,
    HERO.lead,
    HERO.buttons.newPresentation.label,
    HERO.buttons.openDeck.label,
    AGENTS.h2,
    AGENTS.lead,
    AGENTS.run.again,
    AGENTS.stepLabel(3, 3),
    AGENTS.caption(HOME_RUN_FACTS.captionSeconds),
    AGENTS.historyLabel,
    TAILOR.h2,
    TAILOR.lead,
    TAILOR.examplesKey,
    TAILOR.placeholder,
    TAILOR.kits.gt.name,
    TAILOR.kits.kestrel.name,
    TAILOR.kits.fenwick.name,
    TAILOR.moveUp,
    TAILOR.moveDown,
    CANVAS.h2,
    CANVAS.lead,
    CANVAS.layoutKey,
    CANVAS.layout.mood,
    CANVAS.undo,
    CANVAS.commandKey,
    CANVAS.commandRest,
    PRESENT.h2,
    PRESENT.lead,
    PRESENT.present,
    PRESENT.print,
    EXPORT.h2,
    EXPORT.lead,
    EXPORT.labels.perfect,
    EXPORT.labels.editable,
    EXPORT.rows.perfect.key,
    EXPORT.rows.perfect.sentence(
      { width: HOME_EXPORT_FACTS.perfectWidth, height: HOME_EXPORT_FACTS.perfectHeight },
      HOME_FACTS,
    ),
    EXPORT.rows.perfect.link.label,
    EXPORT.rows.editable.key,
    EXPORT.rows.editable.sentence,
    EXPORT.rows.pdf.key,
    EXPORT.rows.pdf.sentence,
    EXPORT.rows.pdf.link,
    PARTS.h2,
    ...PARTS.rows.flatMap((row) => [row.key, row.where, row.figure(HOME_FACTS)]),
    CLOSE.h2,
    CLOSE.lead,
    CLOSE.buttons.newPresentation.label,
    CLOSE.buttons.openDeck.label,
    ...FOOTER.links.map((link) => link.label),
    `${FOOTER.maker.before} ${FOOTER.maker.company}${FOOTER.maker.after}`,
    FOOTER.closing,
  ];
}

describe('every string of the page', () => {
  it('is collected with a path', () => {
    expect(every.length).toBeGreaterThan(80);
    expect(every.some((e) => e.path === 'hero.heading')).toBe(true);
    expect(every.some((e) => e.path === 'agents.caption')).toBe(true);
    expect(every.some((e) => e.path === 'footer.closing')).toBe(true);
  });

  it('carries no em dash, en dash, exclamation mark, semicolon or colon', () => {
    for (const { text, path } of every) {
      expect(text, path).not.toContain(EM_DASH);
      expect(text, path).not.toContain(EN_DASH);
      expect(text, path).not.toContain(';');
      expect(text, path).not.toContain(EXCLAMATION);
      if (isCommand(path) || isCredit(path)) continue;
      expect(text, path).not.toContain(':');
    }
  });

  it('uses no metaphor word and no "X, not Y" pair', () => {
    for (const { text, path } of every) {
      if (isCommand(path)) continue;
      expect(metaphorCandidates(text), path).toEqual([]);
      expect(CONTRAST_PAIR_PATTERN.test(text), `${path}: "${text}"`).toBe(false);
    }
  });

  it('never says a forbidden word, phrase or report word', () => {
    for (const { text, path } of every) {
      for (const word of FORBIDDEN_WORDS)
        expect(wholeWord(word).test(text), `${path}: ${word}`).toBe(false);
      for (const phrase of FORBIDDEN_PHRASES)
        expect(text.toLowerCase(), path).not.toContain(phrase.toLowerCase());
      for (const word of REPORT_WORDS)
        expect(wholeWord(word).test(text), `${path}: ${word}`).toBe(false);
    }
  });

  it('names no file path and no date outside the generated command lines', () => {
    for (const { text, path } of every) {
      if (isCommand(path)) continue;
      expect(/\b[\w-]+\/[\w./-]+/.test(text), `${path}: "${text}"`).toBe(false);
      expect(/\.(ts|tsx|mjs|md|json|css)\b/.test(text), `${path}: "${text}"`).toBe(false);
      expect(/\b20\d\d-\d\d-\d\d\b/.test(text), `${path}: "${text}"`).toBe(false);
    }
  });

  it('writes every sentence as one thought under 20 words', () => {
    for (const { text, path } of every) {
      if (isCommand(path)) continue;
      for (const sentence of sentencesOf(text))
        expect(wordCount(sentence), `${path}: "${sentence}"`).toBeLessThan(20);
    }
  });

  it('keeps the default view words out of every band but the four that earn them', () => {
    let checked = 0;
    for (const { text, path } of every) {
      if (isExempt(path) || isCommand(path)) continue;
      checked += 1;
      expect(forbiddenWordsIn(text), `${path}: "${text}"`).toEqual([]);
    }
    expect(checked).toBeGreaterThan(60);
    expect(DEFAULT_VIEW_EXEMPT).toEqual(['meta', 'agents', 'canvas.log', 'parts']);
    /* and the exemptions earn it: the agents band names the transports */
    expect(forbiddenWordsIn(AGENTS.lead)).toContain('MCP');
    /* the canvas band's resting line names none of them (docs/LANDING.md 2.12) */
    expect(forbiddenWordsIn(CANVAS.commandRest)).toEqual([]);
  });

  it('holds the page under 350 words at rest', () => {
    const words = restingStrings().reduce((sum, text) => sum + wordCount(text), 0);
    expect(words).toBeGreaterThan(250);
    expect(words).toBeLessThan(350);
  });
});

describe('headings and buttons', () => {
  const headings: string[] = [
    HERO.heading,
    AGENTS.h2,
    TAILOR.h2,
    CANVAS.h2,
    PRESENT.h2,
    EXPORT.h2,
    PARTS.h2,
    CLOSE.h2,
  ];

  it('are one thought each in sentence case with no trailing period, the h2s with no comma', () => {
    for (const heading of headings) {
      expect(wordsOutsideSentenceCase(heading, HOME_PROPER_NOUNS), heading).toEqual([]);
      expect(/[.:;,]$/.test(heading), heading).toBe(false);
      expect(wordCount(heading), heading).toBeLessThan(10);
    }
    for (const heading of headings.slice(1)) expect(heading, heading).not.toContain(',');
    /* the h1 is the standing sentence of decks.home.seller-lead in three hand set lines */
    expect(HERO.heading).toBe('Build the pitch, present it and send the link');
    expect(HERO.h1Lines.join(' ')).toBe(HERO.heading);
    expect(HERO.h1Lines).toEqual(['Build the pitch,', 'present it and', 'send the link']);
    expect(/,\s+(in|on|at|with|from|which|that)\b/.test(HERO.heading)).toBe(false);
  });

  const buttons: string[] = [
    NAV.signIn.label,
    NAV.newPresentation.label,
    NAV.appearance.light.label,
    NAV.appearance.dark.label,
    HERO.undo,
    HERO.buttons.newPresentation.label,
    HERO.buttons.openDeck.label,
    AGENTS.run.again,
    AGENTS.run.step(2),
    TAILOR.moveUp,
    TAILOR.moveDown,
    CANVAS.undo,
    PRESENT.present,
    PRESENT.print,
    PRESENT.show.previous,
    PRESENT.show.next,
    PRESENT.show.exit,
    CLOSE.buttons.newPresentation.label,
    CLOSE.buttons.openDeck.label,
  ];
  const SMALL = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'in', 'on', 'this']);

  it('label the buttons in Title Case, and the text links in sentence case', () => {
    for (const label of buttons) {
      const words = label.split(' ');
      words.forEach((word, index) => {
        const capital = /^[A-Z0-9]/.test(word);
        if (index === 0 || index === words.length - 1 || !SMALL.has(word.toLowerCase()))
          expect(capital, label).toBe(true);
        else expect(capital, label).toBe(word === 'This');
      });
    }
    expect(EXPORT.rows.perfect.link.label).toBe('Read the record');
    expect(EXPORT.rows.pdf.link).toBe('Download the PDF');
  });

  it('puts the Heroicons in the parts table key cells only, never sparkles or cursor-arrow-rays', () => {
    const icons = PARTS.rows.map((row) => row.icon);
    expect(icons).toEqual([
      'bars-3',
      'squares-2x2',
      'cube',
      'paint-brush',
      'command-line',
      'server',
      'globe-alt',
      'scale',
    ]);
    for (const icon of icons) expect(['sparkles', 'cursor-arrow-rays']).not.toContain(icon);
  });
});

describe('the counts of the tree (SPEC-4 0.25)', () => {
  it('flow through functions of the facts in the parts table', () => {
    const figures = PARTS.rows.map((row) => row.figure(PROBE));
    expect(figures).toEqual([
      formatCount(PROBE.menus),
      formatCount(PROBE.layouts),
      formatCount(PROBE.shapes),
      formatCount(PROBE.materials),
      formatCount(PROBE.cliCommands),
      formatCount(PROBE.mcpTools),
      formatCount(PROBE.httpPaths),
      PROBE.licence,
    ]);
    /* and on today's tree the table reads LANDING.md 2.9 */
    expect(PARTS.rows.map((row) => row.figure(HOME_FACTS))).toEqual([
      '9',
      '22',
      '135',
      '17',
      '180',
      '169',
      '177',
      'MIT',
    ]);
  });

  it('keeps the plain strings free of a count of the tree', () => {
    /* a plain string may carry the facts of the page's own slides in digits (slide 7, 196 BC, the
       8 by 8 screen at 2 px cells, the filmstrip's slides 2 to 5, the 24 characters of a name) and
       nothing else */
    const allowed = new Set(['2', '5', '7', '8', '24', '196']);
    for (const { text, path, resolved } of every) {
      /* a function's digits are its arguments' (the probes above) */
      if (resolved || isCommand(path) || isCredit(path)) continue;
      for (const digits of text.match(/\d[\d,.]*\d|\d/g) ?? [])
        expect(allowed.has(digits), `${path}: ${digits} in "${text}"`).toBe(true);
    }
  });

  it("states the run's caption, the export's size and the CLI's count from the build", () => {
    expect(HOME_RUN_FACTS.captionSeconds).toBe(HOME_RUN.captionSeconds);
    expect(HOME_RUN.captionSeconds).toBe(Math.round(HOME_RUN.totalMs / 1000));
    expect(AGENTS.caption(HOME_RUN.captionSeconds)).toContain(`${HOME_RUN.captionSeconds} seconds`);
    expect(AGENTS.panel.refusal(5, HOME_FACTS.cliCommands)).toBe(HOME_RUN.refusal);
    expect(HOME_RUN.cliCommands).toBe(HOME_FACTS.cliCommands);
    expect(AGENTS.panel.requestOnly).toBe(REQUEST_ONLY);
    expect(HOME_EXPORT_FACTS.perfectWidth).toBe(3200);
    expect(HOME_EXPORT_FACTS.perfectHeight).toBe(1800);
  });
});

describe('the shape of the page (docs/LANDING.md section 2)', () => {
  it('shares one description with the head, the manifest and the card', () => {
    expect(HOME_META.description).toBe(SITE.description);
    expect(SITE.manifest.description).toBe(SITE.description);
    expect(HOME_META.title).toBe('Turboslide is a slides editor in the browser');
  });

  it("gives the hero three true visit sentences of at most 50 characters, the boot script's", () => {
    expect(HERO.visit.length).toBe(3);
    for (const sentence of HERO.visit) expect(sentence.length).toBeLessThanOrEqual(50);
    expect(HERO.visit[0]).toBe('Turboslide is a slides editor in the browser.');
    expect(VISIT_GAPS.map((table) => table.sentence)).toEqual([...HERO.visit]);
    for (const table of VISIT_GAPS) expect(table.lastKeyMs).toBeLessThanOrEqual(3970);
    /* the slide's markup holds the first sentence; the build's fixture spells it */
    expect(HOME_DECK.slides.title.objects.find((o) => o.id === 'title#lead')?.text).toBe(
      HERO.visit[0],
    );
    expect(HOME_DECK.slides.title.title).toBe(HERO.heading);
  });

  it('routes the buttons as section 2 says', () => {
    expect(HERO.buttons.newPresentation.href).toBe('/new');
    expect(CLOSE.buttons.newPresentation.href).toBe('/new');
    expect(NAV.newPresentation.href).toBe('/new');
    expect(HERO.buttons.openDeck.deckId).toBe('gt-brand');
    expect(CLOSE.buttons.openDeck.deckId).toBe('gt-brand');
    expect(HERO.buttons.openDeck.label).toBe('Open the Example Deck');
    expect(NAV.links.map((link) => link.label)).toEqual(['Documentation']);
    expect(NAV.skip).toBe('Skip to content');
    expect(EXPORT.rows.perfect.link.href).toMatch(/\/docs\/pptx\.md$/);
    expect(PARTS.rows.find((row) => row.id === 'license')?.href).toBe(
      'https://github.com/Kevin-Liu-01/Turboslide',
    );
  });

  it('uses the product strings of the Tailor dialog and its own two sentences', () => {
    expect(HOME_TAILOR_WORDS.from).toBe('Replace');
    expect(HOME_TAILOR_WORDS.to).toBe('With');
    expect(HOME_TAILOR_WORDS.apply).toBe('Apply');
    expect(HOME_TAILOR_WORDS.countRest).toBe(
      `${HOME_RUN.tailorCounts.rest.places} places on ${HOME_RUN.tailorCounts.rest.slides} slides`,
    );
    expect(TAILOR.empty).toBe('Type a customer name first.');
    expect(TAILOR.kitStatus('kestrel', 8)).toBe(
      "Kestrel, an example customer's kit, set the colors of 8 slides.",
    );
    expect(TAILOR.examplesKey).toBe('Example kits');
  });

  it('keeps the footer and the words of the history and the slides', () => {
    expect(FOOTER.lockup.href).toBe('#top');
    expect(FOOTER.links.find((link) => link.label === 'License')?.id).toBe('home.foot.licence');
    for (const { text, path } of every)
      expect(/\blicence\b/i.test(text), `${path}: "${text}"`).toBe(false);
    expect(HISTORY.slideMoved(2, 4)).toBe('Moved slide 2 to place 4');
    expect(HISTORY.tailored('Globex')).toBe('Tailored for Globex');
    expect(HOME_RUN.steps.map((step) => step.history)).toEqual([
      'Added slide 5 with the Ruled rows layout',
      'Set the title of slide 5',
      'Set the rows of slide 5',
    ]);
    expect(SLIDES.heroCredit).toBe('Image: NASA, Reto Stöckli, 2007, public domain');
    expect(CANVAS.log.pos('rosetta', 'h', { x: 612, y: 388, w: 520, h: 96 })).toBe(
      `turboslide block set rosetta#h /pos '{"x":612,"y":388,"w":520,"h":96}'`,
    );
    expect(CANVAS.log.rotate('rosetta', 'h', 15)).toBe('turboslide block rotate rosetta#h --to 15');
    expect(CANVAS.log.toCanvas('rosetta')).toBe('turboslide slide to-canvas rosetta');
    /* the three gesture forms were run against the page deck and accepted (run.generated.ts) */
    expect(HOME_RUN.gestures.map((g) => g.argv.join(' '))).toEqual([
      'slide to-canvas rosetta',
      `block set rosetta#h /pos {"x":612,"y":388,"w":520,"h":96}`,
      'block rotate rosetta#h --to 15',
    ]);
  });
});
