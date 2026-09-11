import { describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { mergeRuns, parseText, serializeRuns } from '@turboslide/schema/text';

import { readRunText, runsFromNode, textCommitMutation, textFromNode } from '../InlineText';
import type { RunNode } from '../InlineText';

// A DOM stand-in: the walk reads nodeType, nodeName, nodeValue, childNodes, getAttribute and classList.
function text(value: string): RunNode {
  return { nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: [] };
}

function el(
  name: string,
  children: RunNode[],
  attrs: Record<string, string> = {},
  classes: string[] = [],
): RunNode {
  return {
    nodeType: 1,
    nodeName: name,
    childNodes: children,
    getAttribute: (attr) => attrs[attr] ?? null,
    classList: { contains: (cls) => classes.includes(cls) },
  };
}

/** The mark span as the renderer writes it (render/text.ts GT_WORD_HTML). */
function gtWord(): RunNode {
  return el(
    'SPAN',
    [el('svg', [el('use', [], { href: '#gt-mark' })]), el('SPAN', [text('GT')], {}, ['sr'])],
    {},
    ['gt-word'],
  );
}

describe('runsFromNode', () => {
  it('reads text, the weight 500 run, a link and a bare GT back as runs', () => {
    const run = el('P', [
      text('Hello '),
      el('B', [text('world')]),
      text(' and '),
      el('A', [text('the docs')], { href: 'https://generaltranslation.com/docs' }),
      text(' with GT inside.'),
    ]);
    expect(runsFromNode(run)).toEqual([
      { t: 'Hello ' },
      { t: 'world', b: true },
      { t: ' and ' },
      { t: 'the docs', link: 'https://generaltranslation.com/docs' },
      { t: ' with ' },
      { t: 'GT', gt: true },
      { t: ' inside.' },
    ]);
    expect(textFromNode(run)).toBe(
      'Hello *world* and [the docs](https://generaltranslation.com/docs) with GT inside.',
    );
  });

  it('round trips: the committed markup parses back to the same runs', () => {
    const run = el('P', [
      text('Ship '),
      el('B', [text('one'), text(' pull request')]),
      text(' with GT, not '),
      el('STRONG', [text('twelve')]),
      text(' weeks.'),
    ]);
    const runs = runsFromNode(run);
    const markup = textFromNode(run);
    expect(markup).toBe('Ship *one pull request* with GT, not *twelve* weeks.');
    expect(parseText(markup)).toEqual(mergeRuns(runs));
    expect(serializeRuns(parseText(markup))).toBe(markup);
  });

  it('keeps a typed bare GT as the mark and the document as the letters', () => {
    const typed = el('P', [text('Built with GT ')]);
    expect(runsFromNode(typed)).toEqual([{ t: 'Built with ' }, { t: 'GT', gt: true }, { t: ' ' }]);
    // the commit trims the trailing space the caret left
    expect(textFromNode(typed)).toBe('Built with GT');
    // and the mark span the at-once conversion inserted reads the same way
    const marked = el('P', [text('Built with '), gtWord(), text(' today')]);
    expect(textFromNode(marked)).toBe('Built with GT today');
    expect(parseText(textFromNode(marked))).toEqual([
      { t: 'Built with ' },
      { t: 'GT', gt: true },
      { t: ' today' },
    ]);
  });

  it('leaves GT letters inside a word, a package name and a link alone', () => {
    expect(textFromNode(el('P', [text('gt-next and GTM')]))).toBe('gt-next and GTM');
    const link = el('P', [el('A', [text('GT docs')], { href: 'https://x.y/' })]);
    expect(runsFromNode(link)).toEqual([{ t: 'GT docs', link: 'https://x.y/' }]);
    expect(textFromNode(link)).toBe('[GT docs](https://x.y/)');
  });

  it('escapes typed markup characters and drops line breaks and icons', () => {
    const run = el('SPAN', [
      el('svg', [el('use', [], { href: '#i-check-circle' })], {}, ['ic']),
      text('a * star [and'),
      el('BR', []),
      text('a bracket'),
    ]);
    expect(textFromNode(run)).toBe('a \\* star \\[anda bracket');
    expect(parseText(textFromNode(run))).toEqual([{ t: 'a * star [anda bracket' }]);
  });

  it('turns the editable trailing non-breaking space back into a space', () => {
    expect(runsFromNode(el('P', [text('one '), el('B', [text('two')])]))).toEqual([
      { t: 'one ' },
      { t: 'two', b: true },
    ]);
  });
});

describe('textCommitMutation', () => {
  const content: Slide = {
    schemaVersion: 1,
    id: 'content-rule',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        {
          id: 'list',
          type: 'rows',
          key: 240,
          items: [{ key: 'Legacy', value: '12 weeks.' }],
        },
      ],
    },
  };
  const title: Slide = {
    schemaVersion: 1,
    id: 'title',
    kind: 'title',
    mark: { w: 138, h: 88 },
    heading: 'Brand',
    lead: 'The deck.',
  };

  it('commits a run as one block.set of the whole markup at the run pointer', () => {
    expect(readRunText(content, 'list', 'items/0/value')).toBe('12 weeks.');
    expect(
      textCommitMutation(content, 'list', 'items/0/value', 'One pull request with GT.'),
    ).toEqual({
      op: 'block.set',
      slideId: 'content-rule',
      blockId: 'list',
      path: '/items/0/value',
      value: 'One pull request with GT.',
    });
  });

  it('commits the text of a title slide as slide.set, since it is a field', () => {
    expect(readRunText(title, 'lead', 'text')).toBe('The deck.');
    expect(textCommitMutation(title, 'heading', 'text', 'GT')).toEqual({
      op: 'slide.set',
      slideId: 'title',
      path: '/heading',
      value: 'GT',
    });
  });

  it('is null when the markup equals what the document holds', () => {
    expect(textCommitMutation(content, 'list', 'items/0/key', 'Legacy')).toBeNull();
    expect(textCommitMutation(title, 'lead', 'text', 'The deck.')).toBeNull();
  });
});
