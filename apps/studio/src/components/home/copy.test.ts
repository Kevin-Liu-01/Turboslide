import { describe, expect, it } from 'vitest';

import { DIALOGS, forbiddenWordsIn } from '@turboslide/chrome/menus/strings';
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
  CLOSE,
  DEFAULT_VIEW_EXEMPT,
  EXPORT,
  FEATURES,
  FOOTER,
  FORBIDDEN_PHRASES,
  FORBIDDEN_WORDS,
  HERO,
  HISTORY,
  HOME_COPY,
  HOME_META,
  HOME_PROPER_NOUNS,
  KITS,
  MENUS,
  NAV,
  NUMBERS,
  PATTERNS,
  PEOPLE,
  PRESENT,
  REPORT_WORDS,
  SLIDES,
  TAILOR,
  VERSIONS,
} from './copy';
import { HOME_DECK, HOME_EXPORT_FACTS, HOME_RUN_FACTS, HOME_TAILOR_WORDS } from './deck.generated';
import {
  AGENTS_ROUND,
  CANVAS_ROUND,
  CLOSE_ROUND,
  DESIGN_COPY,
  FIGURES_ROUND,
  HERO_ROUND,
  KITS_ROUND,
  MENUS_ROUND,
  PEOPLE_ROUND,
  NAV_ICONS,
  NUMBERS_ROUND,
} from './design-copy';
import { FACTS_DATA } from './facts-data';
import { HOME_FACTS, formatCount } from './facts';
import type { HomeFacts } from './facts';
import { REQUEST_ONLY } from './panel-format';
import { HOME_RUN } from './run.generated';

// The copy lints of the landing (docs/LANDING.md 2.17, the second pass, and the row
// decks.home.copy-rules): every string of copy.ts through the theme's copy rules (no em dash, en
// dash or exclamation mark, no metaphor word, no "X, not Y" pair, sentence case headings without a
// trailing period, Title Case buttons and chips); no semicolon or colon outside the generated
// command lines and the product's own sentences; every sentence one thought under 20 words; none
// of the five words of SPEC-4 0.26, the phrases or the report words; no file path outside the
// generated command lines; the default view words of the menu model kept out of every band but the
// head, the hero's stage, the agents band, the Command row's line, the two people band and the
// features table; the page's own copy under 750 words at rest with Sign In shown; every count of
// the tree a function of the facts; the hero's visit sentences at most 50 characters.

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
  const call = fn as (...args: unknown[]) => string;
  if (path.startsWith('parts.') || path.startsWith('numbers.') || path === 'agents.lead')
    return String(call(PROBE));
  if (path === 'export.rows.perfect.sentence') return call({ width: 3200, height: 1800 }, PROBE);
  if (path === 'canvas.log.pos') return call('lighthouse', 'h', { x: 612, y: 388, w: 520, h: 96 });
  if (path.startsWith('canvas.log.')) return call('lighthouse', 'h', 15);
  if (path === 'kits.status.kit') return call('globex', 9);
  if (path === 'kits.status.background') return call('#e6e0d2');
  if (path === 'kits.status.contrast') return call('#777777', 4.4);
  if (path === 'menus.editorRow') return call('Opens the Rename dialog');
  if (path === 'menus.readout') return call('Title', 789, 362, 0);
  if (path === 'agents.versions.caption') return call(4, 6, 'Agent', '6:45 PM');
  if (path === 'agents.chips.tailor') return call('Initech');
  if (path === 'export.loupe.readout') return call(4, 196, 1210, 640);
  if (/^history\.(moved|resized|edited|deletedBlock|duplicatedBlock|cleared)$/.test(path))
    return call('the title', 1);
  if (path === 'history.turned' || path === 'history.rotated') return call('the heading', 6, 15);
  if (path === 'history.inserted') return call('a text box', 2);
  if (path === 'history.styled') return call('bold', 'the heading', 2);
  if (path === 'history.aligned') return call('the heading', 2, 'left');
  if (path === 'history.ordered') return call('the heading', 2, 'to the front');
  if (/^history\.(tailored|kit|renamed|versionNamed)$/.test(path)) return call('Globex');
  if (path === 'history.restored') return call('6:45 PM');
  if (path === 'history.background') return call('#e6e0d2');
  return String(call(3, 9));
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
/* the design round's words (design-copy.ts), under the same lints */
walk(DESIGN_COPY, 'design', (text, path, resolved) => every.push({ text, path, resolved }));

/** Generated command lines, the panel's prompt and a colour in code form: code, not page copy. */
const isCommand = (path: string): boolean =>
  path.startsWith('canvas.log.') ||
  path === 'agents.panel.prompt' ||
  path === 'kits.backgroundPlaceholder' ||
  path === 'hero.stage.terminal.folder';
/** The product's own sentences (the menu model's `doc`), exempt from the page's colon rule. */
const isProduct = (path: string): boolean => path === 'menus.editorRow';
/** The slide's credit line, in the deck's own credit form ("Image: ..., 2007, public domain"). */
const isCredit = (path: string): boolean => path === 'slides.heroCredit';
/* the design round's hero names the CLI and the MCP server in its lead and its terminal
   (docs/DESIGN.md 8.2), as LANDING.md lets the hero's stage and the agents band */
const DESIGN_VIEW_EXEMPT: ReadonlyArray<string> = [
  'design.hero',
  'design.numbers',
  'design.agents',
  /* the agents band's diagram names the transports, as the band's lead does (DESIGN.md 8.8) */
  'design.diagrams.agents',
  'design.diagramWords.agents',
];
const isExempt = (path: string): boolean =>
  [...DEFAULT_VIEW_EXEMPT, ...DESIGN_VIEW_EXEMPT].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}.`),
  );

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
    NAV.signIn.label,
    NAV.newPresentation.label,
    HERO.visit[0],
    /* the design round's hero (design-copy.ts): its lead, the terminal's head and the step rows */
    HERO_ROUND.lead,
    HERO.buttons.newPresentation.label,
    HERO.buttons.openDeck.label,
    ...HERO.stage.steps.map((step) => step.label),
    HERO_ROUND.terminal.agent,
    HERO_ROUND.terminal.recorded(19),
    /* the design round's numbers row (design-copy.ts): each figure's noun and menu path, the chips */
    ...NUMBERS.cells.map((cell) => cell.figure(HOME_FACTS)),
    ...FACTS_DATA.numbers.flatMap((cell) => cell.path),
    NUMBERS_ROUND.chips.cli,
    NUMBERS_ROUND.chips.mcp,
    NUMBERS_ROUND.chips.http,
    /* the design round's menus head and canvas readout (design-copy.ts); the panel's own words
       are the product's (chrome.generated.ts) */
    MENUS_ROUND.h2,
    MENUS_ROUND.lead,
    MENUS.slides(9),
    MENUS.statusRest,
    CANVAS.h2,
    CANVAS.lead,
    CANVAS.layout.mood,
    CANVAS_ROUND.command,
    CANVAS.commandRest,
    TAILOR.h2,
    TAILOR.lead,
    TAILOR.placeholder,
    KITS_ROUND.h2,
    KITS_ROUND.lead,
    KITS.kitsKey,
    KITS.kits.gt.name,
    KITS.kits.kestrel.name,
    KITS.kits.globex.name,
    KITS.backgroundKey,
    KITS.backgroundHelp,
    KITS.undo,
    AGENTS.h2,
    AGENTS_ROUND.lead,
    AGENTS.chips.tailor('Initech'),
    AGENTS.chips.turn,
    AGENTS.chips.row,
    AGENTS.chips.skip,
    AGENTS.chipsCaption,
    VERSIONS.label,
    VERSIONS.restore,
    PEOPLE.h2,
    PEOPLE.lead,
    PEOPLE.screens.maya,
    PEOPLE.screens.sam,
    PEOPLE.caption(14),
    PRESENT.h2,
    PRESENT.lead,
    PRESENT.present,
    PRESENT.print,
    EXPORT.h2,
    EXPORT.lead,
    EXPORT.labels.perfect,
    EXPORT.labels.editable,
    EXPORT.caption,
    EXPORT.rows.perfect.sentence(
      { width: HOME_EXPORT_FACTS.perfectWidth, height: HOME_EXPORT_FACTS.perfectHeight },
      HOME_FACTS,
    ),
    EXPORT.rows.perfect.link.label,
    EXPORT.rows.pdf.link,
    PATTERNS.h2,
    PATTERNS.lead,
    PATTERNS.labels.moving,
    PATTERNS.labels.still,
    FEATURES.h2,
    FEATURES.heads.feature,
    FEATURES.heads.where,
    FEATURES.heads.shortcut,
    ...FEATURES.rows.map((row) => row.key),
    ...FACTS_DATA.features.map((row) => row.where),
    CLOSE_ROUND.h2,
    CLOSE_ROUND.lead,
    CLOSE.buttons.newPresentation.label,
    CLOSE.buttons.openDeck.label,
    ...FOOTER.links.map((link) => link.label),
    `${FOOTER.maker.before} ${FOOTER.maker.company}${FOOTER.maker.after}`,
  ];
}

describe('every string of the page', () => {
  it('is collected with a path', () => {
    expect(every.length).toBeGreaterThan(80);
    expect(every.some((e) => e.path === 'hero.heading')).toBe(true);
    expect(every.some((e) => e.path === 'hero.stage.caption')).toBe(true);
    expect(every.some((e) => e.path === 'footer.maker.before')).toBe(true);
  });

  it('carries no em dash, en dash, exclamation mark, semicolon or colon', () => {
    for (const { text, path } of every) {
      expect(text, path).not.toContain(EM_DASH);
      expect(text, path).not.toContain(EN_DASH);
      expect(text, path).not.toContain(';');
      expect(text, path).not.toContain(EXCLAMATION);
      if (isCommand(path) || isCredit(path) || isProduct(path)) continue;
      /* a time of day in a generated line ("6:45 PM") is a figure, not a colon of prose */
      expect(text.replace(/\d:\d\d/g, ''), path).not.toContain(':');
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

  it('keeps the default view words out of every band but the ones that earn them', () => {
    let checked = 0;
    for (const { text, path } of every) {
      if (isExempt(path) || isCommand(path)) continue;
      checked += 1;
      expect(forbiddenWordsIn(text), `${path}: "${text}"`).toEqual([]);
    }
    expect(checked).toBeGreaterThan(60);
    expect(DEFAULT_VIEW_EXEMPT).toEqual([
      'meta',
      'hero.stage',
      'agents',
      'canvas.log',
      'people',
      'features',
    ]);
    /* and the exemptions earn it: the agents band names the transports */
    expect(forbiddenWordsIn(AGENTS.lead(HOME_FACTS))).toContain('MCP');
    /* the canvas band's resting line names none of them (docs/LANDING.md 2.12) */
    expect(forbiddenWordsIn(CANVAS.commandRest)).toEqual([]);
  });

  it('holds the page under 750 words at rest (question 12)', () => {
    const words = restingStrings().reduce((sum, text) => sum + wordCount(text), 0);
    expect(words).toBeGreaterThan(450);
    expect(words).toBeLessThan(750);
  });
});

describe('headings and buttons', () => {
  const headings: string[] = [
    HERO.heading,
    MENUS_ROUND.h2,
    CANVAS.h2,
    TAILOR.h2,
    KITS_ROUND.h2,
    AGENTS.h2,
    PEOPLE.h2,
    PRESENT.h2,
    EXPORT.h2,
    PATTERNS.h2,
    FEATURES.h2,
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
    HERO.undo,
    HERO.buttons.newPresentation.label,
    HERO.buttons.openDeck.label,
    ...HERO.stage.steps.map((step) => step.label),
    AGENTS.run.again,
    AGENTS.run.step(2),
    AGENTS.chips.tailor('Initech'),
    AGENTS.chips.tailor('Northwind'),
    AGENTS.chips.turn,
    AGENTS.chips.straighten,
    AGENTS.chips.row,
    AGENTS.chips.putBack,
    AGENTS.chips.skip,
    AGENTS.chips.unskip,
    VERSIONS.restore,
    PEOPLE.stop,
    TAILOR.moveUp,
    TAILOR.moveDown,
    KITS.undo,
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

  it("names the design round's controls and headings in sentence case (docs/DESIGN.md 8.1, 8.2)", () => {
    for (const name of [NAV_ICONS.motion.pause, NAV_ICONS.motion.play]) {
      expect(wordsOutsideSentenceCase(name, HOME_PROPER_NOUNS), name).toEqual([]);
      expect(wordCount(name), name).toBe(2);
    }
    expect(HERO_ROUND.heading).toBe('Presentations for people and agents');
    expect(wordsOutsideSentenceCase(CLOSE_ROUND.h2, HOME_PROPER_NOUNS)).toEqual([]);
    expect(/[.:;,]$/.test(CLOSE_ROUND.h2)).toBe(false);
    expect(HERO_ROUND.h1Lines.join(' ')).toBe(HERO_ROUND.heading);
    expect(wordsOutsideSentenceCase(HERO_ROUND.heading, HOME_PROPER_NOUNS)).toEqual([]);
    for (const text of [HERO_ROUND.heading, HERO_ROUND.lead])
      expect(/google/i.test(text), text).toBe(false);
  });

  it('puts the Heroicons in the features table key cells only, never sparkles or cursor-arrow-rays', () => {
    const icons = FEATURES.rows.map((row) => row.icon);
    expect(icons).toEqual([
      'bars-3',
      'pencil-square',
      'swatch',
      'chat-bubble-left-right',
      'clock',
      'user-group',
      'presentation-chart-bar',
      'arrow-down-tray',
      'cube',
      'command-line',
    ]);
    for (const icon of icons) expect(['sparkles', 'cursor-arrow-rays']).not.toContain(icon);
  });
});

describe('the counts of the tree (SPEC-4 0.25)', () => {
  it('flow through functions of the facts in the numbers row and the agents lead', () => {
    expect(NUMBERS.cells.map((cell) => cell.figure(PROBE))).toEqual([
      `${formatCount(PROBE.actions)} actions`,
      `${formatCount(PROBE.layouts)} layouts`,
      `${formatCount(PROBE.materials)} patterns`,
      `${formatCount(PROBE.shapes)} shapes`,
    ]);
    expect(AGENTS.lead(PROBE)).toContain(formatCount(PROBE.cliCommands));
    expect(AGENTS.lead(PROBE)).toContain(formatCount(PROBE.mcpTools));
    expect(AGENTS.lead(PROBE)).toContain(formatCount(PROBE.httpPaths));
    /* and on today's tree the row reads LANDING.md 2.3, the lead 2.9 */
    expect(NUMBERS.cells.map((cell) => cell.figure(HOME_FACTS))).toEqual([
      '194 actions',
      '22 layouts',
      '17 patterns',
      '135 shapes',
    ]);
    expect(AGENTS.lead(HOME_FACTS)).toBe(
      "The CLI takes 181 of the editor's actions, the MCP server 170 and the HTTP API 178. The commands below change the slide above them.",
    );
  });

  it("puts no figure in the features table, whose where cells are the menu model's", () => {
    expect(FACTS_DATA.features.map((row) => row.id)).toEqual(FEATURES.rows.map((row) => row.id));
    for (const row of FACTS_DATA.features) expect(/\d/.test(row.where), row.where).toBe(false);
    expect(FACTS_DATA.features.find((row) => row.id === 'versions')?.where).toBe(
      'File > Version history > See version history',
    );
    expect(FACTS_DATA.features.find((row) => row.id === 'menus')?.where).toBe('File to Help');
  });

  it('keeps the plain strings free of a count of the tree', () => {
    /* a plain string may carry the facts of the page's own slides in digits (slide 5, slide 7, the
       8 by 8 screen at 2 px cells, the filmstrip's slides 1 to 5, the 24 characters of a name) and
       nothing else */
    const allowed = new Set(['1', '2', '5', '7', '8', '24']);
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
    expect(HOME_RUN.refusal).toBe(
      AGENTS.panel.refusal(
        Number(/runs (\d+) of/.exec(HOME_RUN.refusal)?.[1]),
        HOME_FACTS.cliCommands,
      ),
    );
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

  it('gives the hero three true visit sentences of at most 50 characters', () => {
    expect(HERO.visit.length).toBe(3);
    for (const sentence of HERO.visit) expect(sentence.length).toBeLessThanOrEqual(50);
    expect(HERO.visit[0]).toBe('Turboslide is a slides editor in the browser.');
    /* slide 1 is the customer deck's cover (2.0): the h1 is page text, said once */
    expect(HOME_DECK.title).toBe('Onboarding plan');
    expect(HOME_DECK.slides.title.title).toBe('Onboarding plan for Northwind');
    expect(HOME_DECK.slides.title.objects.find((o) => o.id === 'title#lead')?.text).toBe(
      'Four weeks from the first call to the first deck.',
    );
    expect(HOME_DECK.order).toEqual([
      'title',
      'plan',
      'gets',
      'ships',
      'next-steps',
      'lighthouse',
      'field',
      'pattern',
      'close',
    ]);
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
    expect(FOOTER.links.find((link) => link.id === 'home.foot.github')?.href).toBe(
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
    expect(KITS.status.kit('globex', 9)).toBe(
      "Globex, an example customer's kit, set the colors of 9 slides.",
    );
  });

  it('keeps the footer and the words of the history and the slides', () => {
    expect(FOOTER.lockup.href).toBe('#top');
    expect(FOOTER.links.find((link) => link.label === 'MIT License')?.id).toBe('home.foot.licence');
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
    expect(CANVAS.log.pos('lighthouse', 'h', { x: 612, y: 388, w: 520, h: 96 })).toBe(
      `turboslide block set lighthouse#h /pos '{"x":612,"y":388,"w":520,"h":96}'`,
    );
    expect(CANVAS.log.rotate('lighthouse', 'h', 15)).toBe(
      'turboslide block rotate lighthouse#h --to 15',
    );
    expect(CANVAS.log.toCanvas('lighthouse')).toBe('turboslide slide to-canvas lighthouse');
    /* the three gesture forms were run against the page deck and accepted (run.generated.ts) */
    expect(HOME_RUN.gestures.map((g) => g.argv.join(' '))).toEqual([
      'slide to-canvas lighthouse',
      `block set lighthouse#h /pos {"x":612,"y":388,"w":520,"h":96}`,
      'block rotate lighthouse#h --to 15',
    ]);
  });
});

/* the PowerPoint modes by one name (DR-int fix, the design round's verifier pass 2 finding 1): the
   export band names the Download dialog's two modes by the dialog's own words, and no word of the
   band, its loupe, its slider or the captured dialog's alt names the mode the retired "Perfect" */
describe('the export band and the Download dialog', () => {
  it('name the two PowerPoint modes by the same words', () => {
    expect(EXPORT.labels.perfect).toBe(DIALOGS.download.perfect);
    expect(EXPORT.labels.editable).toBe(DIALOGS.download.editable);
    expect(EXPORT.loupe.perfect).toBe(`${DIALOGS.download.perfect} file`);
    expect(FIGURES_ROUND.download.alt).toContain(
      `${DIALOGS.download.perfect} or ${DIALOGS.download.editable}`,
    );
    const words = [
      EXPORT.lead,
      EXPORT.labels.perfect,
      EXPORT.labels.editable,
      EXPORT.slider(0),
      EXPORT.slider(50),
      EXPORT.sliderLabel,
      EXPORT.perfectAlt,
      EXPORT.caption,
      EXPORT.loupe.browser,
      EXPORT.loupe.perfect,
      EXPORT.loupe.target,
      EXPORT.rows.perfect.sentence(
        { width: HOME_EXPORT_FACTS.perfectWidth, height: HOME_EXPORT_FACTS.perfectHeight },
        HOME_FACTS,
      ),
      FIGURES_ROUND.download.alt,
    ];
    for (const text of words) expect(text, text).not.toMatch(/\bPerfect\b/);
    expect(EXPORT.slider(50)).toBe(
      'The Pictures file fills 50 percent of the slide and the Editable text file the rest',
    );
  });
});

/* the two people band's Share dialog speaks the editor's words (DESIGN.md 8.9) */
describe("the people band's Share dialog", () => {
  it('names each part as the editor does', () => {
    const share = PEOPLE_ROUND.share;
    expect(share.title('Onboarding plan')).toBe(DIALOGS.share.title('Onboarding plan'));
    expect(share.generalAccess).toBe(DIALOGS.share.generalAccess);
    expect(share.anyoneWithLink).toBe(DIALOGS.share.anyoneWithLink);
    expect(share.anyoneCanEdit).toBe(DIALOGS.share.anyoneCanEdit);
    expect(share.copyLink).toBe(DIALOGS.share.copyLink);
    expect(share.done).toBe(DIALOGS.share.done);
    expect(share.roles.owner).toBe(DIALOGS.share.roles.owner);
    expect(share.roles.editor).toBe(DIALOGS.share.roles.editor);
  });
});
