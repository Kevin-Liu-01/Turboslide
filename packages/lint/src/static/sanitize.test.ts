// html/sanitize (gslides-parity SPEC-3 8.4): an html block without the `htmlSanitized` stamp
// carries a fix of the cleaned markup, the cleaned CSS and the stamp; a stamped block is quiet;
// the fix applies through the reducer and the finding is gone afterwards; the pattern pass
// removes a script and an event handler even before the parser loads.
import { describe, expect, test } from 'vitest';

import { applyMutations } from '@turboslide/schema/reduce';

import type { Deck, DeckDocument, Slide } from '../contracts.ts';
import { lintStatic } from '../lint-static.ts';

function escapeSlide(html: string, css: string, stamped: boolean): Slide {
  return {
    schemaVersion: 1,
    id: 'escape',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        { id: 'h', type: 'heading', level: 'h2', text: 'An escape' },
        {
          id: 'x',
          type: 'html',
          note: 'a legacy figure',
          css,
          html,
          ...(stamped ? { htmlSanitized: true as const } : {}),
        },
      ],
    },
  };
}

function document(slide: Slide): DeckDocument {
  const deck: Deck = {
    schemaVersion: 1,
    id: 'escapes',
    title: 'Escapes',
    theme: 'gt-ink-paper',
    sections: [{ id: 'one', name: 'One', slideIds: [slide.id] }],
    assets: {},
    revision: 1,
    createdAt: '2026-09-13T00:00:00Z',
    updatedAt: '2026-09-13T00:00:00Z',
  };
  return { deck, slides: { [slide.id]: slide } };
}

const rule = (doc: DeckDocument) => lintStatic(doc, { rules: ['html/sanitize'] });

describe('html/sanitize', () => {
  test('a block without the stamp carries the cleaned strings and the stamp as its fix; a stamped block is quiet', () => {
    const dirty = document(
      escapeSlide(
        '<div class="s-x"><p onclick="steal()">Text</p><script>alert(1)</script></div>',
        '.s-x .k { color: #ff0000; } @import url("https://evil.test/x.css");',
        false,
      ),
    );
    const findings = rule(dirty);
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.severity).toBe(2);
    expect(finding.blockId).toBe('x');
    expect(finding.path).toBe('/slots/main/1/htmlSanitized');
    expect(finding.fix?.map((m) => ('path' in m ? m.path : ''))).toEqual([
      '/html',
      '/css',
      '/htmlSanitized',
    ]);
    const html = finding.fix?.find((m) => 'path' in m && m.path === '/html');
    expect(html && 'value' in html ? String(html.value) : '').not.toMatch(/<script|onclick/);
    const css = finding.fix?.find((m) => 'path' in m && m.path === '/css');
    expect(css && 'value' in css ? String(css.value) : '').not.toContain('@import');
    expect(finding.evidence.measured).toMatchObject({ droppedCss: 1, markupChanged: 1 });
    expect(finding.proposal).toContain('turboslide fix --rule html/sanitize');
    const clean = document(
      escapeSlide('<div class="s-x"><p>Text</p></div>', '.s-x .k { color: #ff0000; }', true),
    );
    expect(rule(clean)).toEqual([]);
  });

  test('the fix applies through the reducer and the finding is gone; clean markup gets the stamp alone', () => {
    const doc = document(
      escapeSlide('<div class="s-x"><p>Text</p></div>', '.s-x .k { font-weight: 700; }', false),
    );
    const [finding] = rule(doc);
    expect(finding?.fix).toEqual([
      { op: 'block.set', slideId: 'escape', blockId: 'x', path: '/htmlSanitized', value: true },
    ]);
    const applied = applyMutations(doc, finding?.fix ?? []);
    expect(rule(applied.document)).toEqual([]);
    const block = Object.values(
      applied.document.slides.escape?.kind === 'content'
        ? applied.document.slides.escape.slots
        : {},
    )
      .flat()
      .find((b) => b.id === 'x');
    expect(block).toMatchObject({ type: 'html', htmlSanitized: true });
  });
});
