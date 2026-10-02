// The speed mark slides of the 95 slide GT deck (P:deck/slides/17 to 23, DECK-GRAMMAR.md:50 to 53)
// import as html blocks carrying the mark files' markup. Two of the deck rules read that markup:
// a mask's black is the cut of the plate, double cut and livery marks, and the ASCII mark's 10 px
// rows are cells of the mark (round1/build/b4.md request 7). A colour or a label beside them is
// still read.
import { describe, expect, test } from 'vitest';

import type { Deck, DeckDocument, Slide } from '../contracts.ts';
import { lintStatic } from '../lint-static.ts';
import { withoutMasks } from './color.ts';
import { withoutGlyphArt } from './type.ts';

const PLATE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 357.9 132" fill="currentColor" width="716" height="264"><defs><mask id="sm-plate-cut" maskUnits="userSpaceOnUse" x="-20" y="-20" width="389.9" height="160"><rect x="-20" y="-20" width="389.9" height="160" fill="#fff"/><path d="M48 92L35 40Z" fill="#000"/></mask></defs><g mask="url(#sm-plate-cut)"><path d="M337 0L12 120Z"/></g></svg>';
const ASCII =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 230" fill="currentColor" width="960" height="230"><text font-family="ui-monospace, \'SF Mono\', Menlo, Consolas, \'Liberation Mono\', monospace" font-size="10" xml:space="preserve"><tspan x="0" y="8" textLength="960" lengthAdjust="spacing">   @@@@ @ @</tspan></text></svg>';

function slide(id: string, html: string): Slide {
  return {
    schemaVersion: 1,
    id,
    kind: 'content',
    layout: { type: 'center' },
    slots: { main: [{ id: 'mark', type: 'html', note: 'a speed mark', css: '', html }] },
  };
}

function document(slides: Slide[]): DeckDocument {
  const deck: Deck = {
    schemaVersion: 1,
    id: 'speed',
    title: 'Speed marks',
    theme: 'gt-ink-paper',
    sections: [{ id: 'marks', name: 'Marks', slideIds: slides.map((s) => s.id) }],
    assets: {},
    revision: 1,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
  };
  return { deck, slides: Object.fromEntries(slides.map((s) => [s.id, s])) };
}

const rule = (doc: DeckDocument, id: string) =>
  lintStatic(doc, { rules: [id as never] }).map((f) => `${f.slideId} ${f.evidence.text ?? ''}`);

describe('the speed mark slides under the deck rules', () => {
  test("color/tokens-only reads no colour in a mask's luminance, and still reads one outside it", () => {
    expect(withoutMasks(PLATE)).not.toContain('#000');
    expect(rule(document([slide('speed-plate', PLATE)]), 'color/tokens-only')).toEqual([]);
    const painted = PLATE.replace(
      '<path d="M337 0L12 120Z"/>',
      '<path d="M337 0L12 120Z" fill="#ff3b6b"/>',
    );
    expect(rule(document([slide('speed-plate', painted)]), 'color/tokens-only')).toEqual([
      'speed-plate #ff3b6b',
    ]);
  });

  test("type/svg-label-min reads no label in the ASCII mark's glyph rows, and still reads a small label", () => {
    expect(withoutGlyphArt(ASCII)).not.toContain('font-size="10"');
    expect(rule(document([slide('speed-ascii', ASCII)]), 'type/svg-label-min')).toEqual([]);
    const labelled = ASCII.replace(
      '</svg>',
      '<text x="0" y="220" font-size="12">Mark</text></svg>',
    );
    expect(rule(document([slide('speed-ascii', labelled)]), 'type/svg-label-min')).toEqual([
      'speed-ascii font-size 12 px',
    ]);
    const proportional = ASCII.replace(/font-family="[^"]*"/, 'font-family="Inter"');
    expect(rule(document([slide('speed-ascii', proportional)]), 'type/svg-label-min')).toEqual([
      'speed-ascii font-size 10 px',
    ]);
  });
});
