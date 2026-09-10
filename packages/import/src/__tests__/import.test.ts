// The importer's units (text markup, the css ledger, ids, sections) and its mapping of slide
// fragments; a smoke test over the real Prototemplate deck runs when the checkout is present.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { Assets } from '../assets.ts';
import { leftover, readStyleSheet, take } from '../css.ts';
import { parseHtmlFragment, find, hasClass } from '../dom.ts';
import { BlockIdAllocator, slideIdFromFile, slugify } from '../ids.ts';
import { importDeck } from '../import-deck.ts';
import { mapSlide } from '../map.ts';
import { parseSections } from '../sections.ts';
import { textOfElement } from '../text.ts';
import type { ContentSlide, OpenerSlide } from '@turboslide/schema/deck';
import { importResidual } from '@turboslide/schema/ext';

const DECK =
  process.env.TURBOSLIDE_PROTOTEMPLATE_DECK ?? '/Users/kevinliu/repos/Prototemplate/deck';
const hasDeck = existsSync(join(DECK, 'parts/head.html'));

function element(html: string, test: (el: { tagName: string }) => boolean = () => true) {
  const fragment = parseHtmlFragment(html);
  const el = find(fragment, (e) => test(e));
  if (!el) throw new Error('no element');
  return el;
}

describe('text markup from inline html', () => {
  it('writes the four rules and escapes literals', () => {
    const p = element(
      '<p>Engineers use <span class="gt-word"><svg></svg><span class="sr">GT</span></span> and <b>gt-next</b>. See <a href="https://x.com">x</a>. A literal GT and a * star.</p>',
    );
    expect(textOfElement(p)).toBe(
      'Engineers use GT and *gt-next*. See [x](https://x.com). A literal \\GT and a \\* star.',
    );
  });

  it('keeps no-break spans with word joiners and drops inline icons', () => {
    const b = element(
      '<b><svg class="ic"><use href="#i-cube"/></svg><span style="white-space:nowrap">gt-next</span>, <span class="nb">Per-character</span></b>',
    );
    expect(textOfElement(b)).toBe('gt-⁠next, Per-⁠character');
  });

  it('keeps breaks only when asked', () => {
    const span = element('<span>#2f5ce0 on light<br>#86a8ff on dark</span>');
    expect(textOfElement(span, { breaks: true })).toBe('#2f5ce0 on light\n#86a8ff on dark');
    expect(textOfElement(span)).toBe('#2f5ce0 on light #86a8ff on dark');
  });
});

describe('css ledger', () => {
  it('takes declarations and reports the rest under the rewritten scope', () => {
    const sheet = readStyleSheet(
      '.s09 .rules > div { padding: 13px 0; font-size: 19px; } .s09 .ex { --key: 190px; } /* note */',
      's09',
    );
    expect(take(sheet, 'SCOPE .ex', '--key')).toBe('190px');
    expect(take(sheet, 'SCOPE .rules > div', 'padding')).toBe('13px 0');
    const rest = leftover(sheet, '.ts-x-voice');
    expect(rest.css).toBe('.ts-x-voice .rules > div { font-size: 19px; }');
    expect(rest.rules).toEqual(['.s09 .rules > div { font-size }']);
  });
});

describe('ids and sections', () => {
  it('slugs slide ids from file names and section ids from names', () => {
    expect(slideIdFromFile('05-why.html')).toBe('why');
    expect(slideIdFromFile('60-opener-prototemplate.html')).toBe('opener-prototemplate');
    expect(slugify('Prototemplate and Glyphfield')).toBe('prototemplate-and-glyphfield');
  });

  it('allocates block ids in document order and honors the sidecar', () => {
    const next: Record<string, string> = {};
    const ids = new BlockIdAllocator(
      '05-why.html',
      { '05-why.html#/slots/right/0': 'table' },
      next,
    );
    expect(ids.allocate('heading', '/slots/left/0')).toBe('h');
    expect(ids.allocate('paragraph', '/slots/left/1')).toBe('p1');
    expect(ids.allocate('paragraph', '/slots/left/2')).toBe('p2');
    expect(ids.allocate('rows', '/slots/right/0')).toBe('table');
    expect(next['05-why.html#/slots/left/0']).toBe('h');
  });

  it('reads SECTIONS from tail.html', () => {
    const sections = parseSections(
      "var x; var SECTIONS = [[1, 'Brand'], [16, 'Design system'], [79, 'Status and plan']]; more",
    );
    expect(sections).toEqual([
      { start: 1, name: 'Brand', id: 'brand' },
      { start: 16, name: 'Design system', id: 'design-system' },
      { start: 79, name: 'Status and plan', id: 'status-and-plan' },
    ]);
  });
});

describe('mapSlide', () => {
  const section = { start: 1, name: 'Brand', id: 'brand' };
  const assets = () => new Assets(hasDeck ? DECK : tmpdir());

  it('maps a two-column slide with a ruled table', () => {
    const html = `<!-- why -->
    <section class="slide"><div class="in">
      <div class="cols wide-right">
        <div class="stack">
          <h2>Why the redesign</h2>
          <p>Three reasons drove the redesign.</p>
        </div>
        <div class="rows">
          <div><b><svg class="ic" aria-hidden="true"><use href="#i-rocket-launch"/></svg>Launch readiness</b><span>The site is the first contact point.</span></div>
        </div>
      </div>
    </div></section>`;
    const { slide, row } = mapSlide({
      file: '05-why.html',
      n: 5,
      html,
      section,
      assets: assets(),
      previousIds: {},
      nextIds: {},
    });
    expect(slide.kind).toBe('content');
    const content = slide as ContentSlide;
    expect(content.layout).toEqual({ type: 'cols', ratio: '4/8' });
    expect(content.slots.left?.map((b) => b.type)).toEqual(['heading', 'paragraph']);
    expect(content.slots.right?.[0]).toMatchObject({
      id: 'rows',
      type: 'rows',
      key: 240,
      items: [
        {
          key: 'Launch readiness',
          icon: { name: 'rocket-launch' },
          value: 'The site is the first contact point.',
        },
      ],
    });
    expect(row.html).toBeNull();
    expect(row.rulesLeftOver).toEqual([]);
  });

  it('maps an opener and drops its known style block', () => {
    const html = readFileSync(join(hasDeck ? DECK : '', 'slides/01-opener-brand.html'), 'utf8');
    const { slide, row } = mapSlide({
      file: '01-opener-brand.html',
      n: 1,
      html,
      section,
      assets: assets(),
      previousIds: {},
      nextIds: {},
    });
    const opener = slide as OpenerSlide;
    expect(opener.kind).toBe('opener');
    expect(opener.sectionId).toBe('brand');
    expect(opener.picture).toEqual({ asset: 'opener-brand', fit: 'cover' });
    expect(opener.plate.side).toBe('lower-left');
    expect(opener.plate.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'credit']);
    expect(row.rulesLeftOver).toEqual([]);
    expect(row.rulesConsumed).toBeGreaterThan(20);
  });

  it('falls back to an html escape with a reason and scoped css', () => {
    const html = `<section class="slide s99"><style>.s99 .two { display: grid; }</style><div class="in">
      <div class="lay"><div class="head"><h2>Fixed points</h2></div><div class="two"><h3>Fixed</h3></div></div>
    </div></section>`;
    const { slide, row } = mapSlide({
      file: '83-fixed-points.html',
      n: 83,
      html,
      section,
      assets: assets(),
      previousIds: {},
      nextIds: {},
    });
    expect(row.html?.reason).toContain('no block for <div class="two">');
    const content = slide as ContentSlide;
    const block = content.slots.main?.[0];
    expect(block?.type).toBe('html');
    if (block?.type === 'html') {
      expect(block.css).toContain('.ts-x-fixed-points-html .two { display: grid; }');
      expect(block.html).toContain('<h3>Fixed</h3>');
    }
  });

  it('keeps residual rules under the slide scope and the classes they name', () => {
    const html = `<section class="slide s09"><style>.s09 .rules > div { padding: 13px 0; }</style><div class="in">
      <div class="cols"><div class="stack"><h2>Writing style</h2>
        <div class="rows narrow tight rules" style="--key:150px"><div><b>Sentence</b><span>Short.</span></div></div></div>
        <div class="rows"><div><b>Key</b><span>Value.</span></div></div></div>
    </div></section>`;
    const { slide, row } = mapSlide({
      file: '12-voice.html',
      n: 12,
      html,
      section,
      assets: assets(),
      previousIds: {},
      nextIds: {},
    });
    expect(importResidual(slide.ext)?.css).toBe('.ts-x-voice .rules > div { padding: 13px 0; }');
    const rows = (slide as ContentSlide).slots.left?.[1];
    expect(importResidual(rows?.ext)?.classes).toEqual(['rules']);
    expect(rows).toMatchObject({ key: 150, tight: true });
    expect(row.rulesLeftOver).toEqual(['.s09 .rules > div { padding }']);
  });
});

describe('importDeck on a one-slide deck', () => {
  const from = mkdtempSync(join(tmpdir(), 'turboslide-source-'));
  const out = mkdtempSync(join(tmpdir(), 'turboslide-import-'));
  afterAll(() => {
    rmSync(from, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });

  it('stores the h2 of an html escape as the slide title', () => {
    // An escape slide has no typed heading; the importer writes the title its markup derives so
    // the sidebar, the sheet labels and the filter never show a placeholder (SPEC 4.2; tail:90-94).
    mkdirSync(join(from, 'parts'));
    mkdirSync(join(from, 'slides'));
    writeFileSync(join(from, 'parts/head.html'), '<style>:root { --paper: #ffffff; }</style>');
    writeFileSync(join(from, 'parts/tail.html'), "var SECTIONS = [[1, 'Status and plan']];");
    writeFileSync(
      join(from, 'slides/83-fixed-points.html'),
      `<section class="slide s83"><style>.s83 .two { display: grid; }</style><div class="in">
      <div class="lay"><div class="head"><h2>Fixed <b>points</b> &amp; limits</h2></div><div class="two"><h3>Fixed</h3></div></div>
    </div></section>`,
    );
    const report = importDeck({
      from,
      into: 'one',
      decksDir: out,
      skipAssets: true,
      now: () => '2026-09-10T00:00:00.000Z',
    });
    expect(report.slides).toBe(1);
    expect(report.htmlBlocks).toBe(1);
    const slide = JSON.parse(readFileSync(join(out, 'one/slides/fixed-points.json'), 'utf8')) as {
      title?: string;
      slots: { main: { type: string }[] };
    };
    expect(slide.slots.main[0]?.type).toBe('html');
    expect(slide.title).toBe('Fixed points & limits');
  });
});

describe.skipIf(!hasDeck)('the Prototemplate deck', () => {
  const out = mkdtempSync(join(tmpdir(), 'turboslide-import-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('imports 85 slides in 8 sections with at most 4 html blocks', () => {
    const report = importDeck({
      from: DECK,
      into: 'gt-brand',
      decksDir: out,
      skipAssets: true,
      now: () => '2026-09-10T00:00:00.000Z',
    });
    expect(report.slides).toBe(85);
    expect(report.sections).toBe(8);
    expect(report.htmlBlocks).toBeLessThanOrEqual(4);
    expect(report.rows.filter((r) => r.html).map((r) => r.id)).toEqual([
      'diagrams',
      'presenter-compare',
      'fixed-points',
      'goals',
    ]);
    expect(report.warnings).toEqual([]);
    // The four escapes carry the title their h2 derives (slides 25, 67, 83 and 84).
    const titles = Object.fromEntries(
      ['diagrams', 'presenter-compare', 'fixed-points', 'goals'].map((id) => [
        id,
        (
          JSON.parse(readFileSync(join(out, `gt-brand/slides/${id}.json`), 'utf8')) as {
            title?: string;
          }
        ).title,
      ]),
    );
    expect(titles).toEqual({
      diagrams: 'Diagrams',
      'presenter-compare': 'Compare and the presenter',
      'fixed-points': 'Fixed points',
      goals: 'Success criteria',
    });
    const deck = JSON.parse(readFileSync(join(out, 'gt-brand/deck.json'), 'utf8')) as {
      sections: { slideIds: string[] }[];
      assets: Record<string, unknown>;
    };
    expect(deck.sections.flatMap((s) => s.slideIds).length).toBe(85);
    expect(Object.keys(deck.assets).length).toBeGreaterThan(100);
    expect(existsSync(join(out, 'gt-brand/slides/content-rule.json'))).toBe(true);
    expect(existsSync(join(out, 'gt-brand/import-ids.json'))).toBe(true);
    expect(existsSync(join(out, 'gt-brand/import-report.json'))).toBe(true);
  });

  it('keeps ids stable on a second import', () => {
    const first = JSON.parse(readFileSync(join(out, 'gt-brand/import-ids.json'), 'utf8')) as Record<
      string,
      string
    >;
    importDeck({
      from: DECK,
      into: 'gt-brand',
      decksDir: out,
      skipAssets: true,
      now: () => '2026-09-10T00:00:01.000Z',
    });
    const second = JSON.parse(
      readFileSync(join(out, 'gt-brand/import-ids.json'), 'utf8'),
    ) as Record<string, string>;
    expect(second).toEqual(first);
  });
});

// The dom helpers are exercised above; this keeps the import explicit for the type checker.
void hasClass;
