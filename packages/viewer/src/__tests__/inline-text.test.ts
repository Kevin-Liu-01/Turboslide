import { describe, expect, it } from 'vitest';

import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { Slide } from '@turboslide/schema/deck';
import { applyMutations } from '@turboslide/schema/reduce';
import { workedDocument } from '@turboslide/schema/fixtures';
import { canonicalText, mergeRuns, parseText, serializeRuns } from '@turboslide/schema/text';

import {
  listAppendMutation,
  listRemoveMutation,
  nextCellPointer,
  paragraphsFromNode,
  readRunText,
  runsFromNode,
  tableRowAppendMutation,
  textBurstMutation,
  textCommitMutation,
  textDiff,
  textFromNode,
} from '../InlineText';
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

  it('escapes typed markup characters, drops icons and reads a BR as a space on a one line pointer', () => {
    // gslides-parity SPEC 7.4 changes the editor depth behaviour: a BR is a break, and a break in
    // a one line Text is a space rather than nothing
    const run = el('SPAN', [
      el('svg', [el('use', [], { href: '#i-check-circle' })], {}, ['ic']),
      text('a * star [and'),
      el('BR', []),
      text('a bracket'),
    ]);
    expect(textFromNode(run)).toBe('a \\* star \\[and a bracket');
    expect(parseText(textFromNode(run))).toEqual([{ t: 'a * star [and a bracket' }]);
  });

  it('turns the editable trailing non-breaking space back into a space', () => {
    expect(runsFromNode(el('P', [text('one '), el('B', [text('two')])]))).toEqual([
      { t: 'one ' },
      { t: 'two', b: true },
    ]);
  });

  it('skips the prompt of an empty placeholder (SPEC 5.4)', () => {
    const empty = el('H1', [el('SPAN', [text('Click to add title')], { 'data-prompt': '' })]);
    expect(textFromNode(empty)).toBe('');
    expect(runsFromNode(empty)).toEqual([]);
  });
});

// The paragraph break (gslides-parity SPEC 7.4, 7.2.9): on a multiline pointer a BR, the
// renderer's .para spans and the DIVs a browser makes read back as `\n`; the markup is canonical
// per paragraph so a bold run never crosses a break.
describe('paragraphs', () => {
  it('reads a BR as a paragraph break and joins the paragraphs with \\n', () => {
    const run = el('P', [text('One.'), el('BR', []), text('Two.')]);
    expect(paragraphsFromNode(run)).toEqual([[{ t: 'One.' }], [{ t: 'Two.' }]]);
    expect(textFromNode(run, { multiline: true })).toBe('One.\nTwo.');
    expect(canonicalText('One.\nTwo.')).toBe('One.\nTwo.');
  });

  it("reads the renderer's .para spans and the browser's DIVs as paragraphs", () => {
    const rendered = el('P', [
      el('SPAN', [text('First ')], {}, ['para']),
      el('SPAN', [text('second')], {}, ['para']),
    ]);
    expect(textFromNode(rendered, { multiline: true })).toBe('First\nsecond');
    const typed = el('P', [text('a'), el('DIV', [text('b')]), el('DIV', [el('BR', [])])]);
    // the trailing empty paragraph a browser leaves is dropped
    expect(textFromNode(typed, { multiline: true })).toBe('a\nb');
  });

  it('keeps an empty paragraph in the middle and serializes bold per paragraph', () => {
    const run = el('P', [el('B', [text('Bold'), el('BR', []), el('BR', []), text('still')])]);
    expect(textFromNode(run, { multiline: true })).toBe('*Bold*\n\n*still*');
    expect(canonicalText('*Bold*\n\n*still*')).toBe('*Bold*\n\n*still*');
  });

  it('reads a raw newline in a text node as a break too, so the pre-paragraph render round trips', () => {
    expect(textFromNode(el('P', [text('a\nb')]), { multiline: true })).toBe('a\nb');
    expect(textFromNode(el('P', [text('a\r\nb')]), { multiline: true })).toBe('a\nb');
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

// The burst (gslides-parity SPEC 7.2.15): the changed span as one text.replace, so one Cmd Z
// removes one burst and the version log reads as typing.
describe('textDiff and textBurstMutation', () => {
  const document = workedDocument();
  const slide = document.slides['content-rule'];
  if (!slide) throw new Error('the worked document has no content-rule slide');

  it('finds the changed span between two texts', () => {
    expect(textDiff('Hello world', 'Hello brave world')).toEqual({
      start: 6,
      end: 6,
      text: 'brave ',
    });
    expect(textDiff('Hello world', 'Hello')).toEqual({ start: 5, end: 11, text: '' });
    expect(textDiff('abc', 'abc')).toEqual({ start: 3, end: 3, text: '' });
    expect(textDiff('', 'new')).toEqual({ start: 0, end: 0, text: 'new' });
    /* a surrogate pair is never split */
    const emoji = 'a\u{1F600}b';
    const diff = textDiff(emoji, 'a\u{1F601}b');
    expect(emoji.slice(0, diff.start) + diff.text + emoji.slice(diff.end)).toBe('a\u{1F601}b');
  });

  it('writes one text.replace of the span on a block and the reducer lands the new text', () => {
    const from = readRunText(slide, 'p1', 'text');
    if (from === undefined) throw new Error('no paragraph text');
    const to = `${from.slice(0, 5)}brave ${from.slice(5)}`;
    const mutation = textBurstMutation(slide, 'p1', 'text', from, to);
    expect(mutation).toEqual({
      op: 'text.replace',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      range: [5, 5],
      text: 'brave ',
    });
    const after = applyMutations(document, [mutation!]).document.slides['content-rule'];
    expect(after && readRunText(after, 'p1', 'text')).toBe(to);
    expect(textBurstMutation(slide, 'p1', 'text', to, to)).toBeNull();
  });

  it('falls back to slide.set for the fields of a title slide', () => {
    const title = document.slides['title'];
    if (!title) throw new Error('no title slide');
    expect(textBurstMutation(title, 'heading', 'text', 'Old', 'New')).toEqual({
      op: 'slide.set',
      slideId: 'title',
      path: '/heading',
      value: 'New',
    });
  });

  it('carries a paragraph break as a character (SPEC 7.4)', () => {
    const from = readRunText(slide, 'p1', 'text') ?? '';
    const mutation = textBurstMutation(slide, 'p1', 'text', from, `${from}\nSecond.`);
    expect(mutation?.op).toBe('text.replace');
    if (mutation?.op === 'text.replace') expect(mutation.text).toBe('\nSecond.');
    const after = applyMutations(document, [mutation!]).document.slides['content-rule'];
    expect(after && readRunText(after, 'p1', 'text')).toBe(`${from}\nSecond.`);
  });
});

// Tables and lists (gslides-parity SPEC 7.3, 7.4): Tab walks the cells and adds a row past the
// last; Enter appends a list item and Backspace on an empty one removes it.
describe('cells and list items', () => {
  const table: TableBlock = {
    id: 't',
    type: 'table',
    columns: [{}, {}],
    rows: [{ cells: ['A', 'B'], header: true }, { cells: ['c', 'd'] }],
  };
  const slide: Slide = {
    schemaVersion: 1,
    id: 's',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        table,
        { id: 'list', type: 'plain', items: [{ text: 'one' }, { text: 'two' }] },
        { id: 'rows', type: 'rows', key: 200, items: [{ key: 'k', value: 'v' }] },
        { id: 'refs', type: 'refs', items: ['r1'] },
      ],
    },
  };

  it('Tab moves through the cells in reading order and asks for a row past the last', () => {
    expect(nextCellPointer(table, 'rows/0/cells/0', 1)).toEqual({ pointer: 'rows/0/cells/1' });
    expect(nextCellPointer(table, 'rows/0/cells/1', 1)).toEqual({ pointer: 'rows/1/cells/0' });
    expect(nextCellPointer(table, 'rows/1/cells/1', 1)).toBe('append');
    expect(nextCellPointer(table, 'rows/1/cells/0', -1)).toEqual({ pointer: 'rows/0/cells/1' });
    expect(nextCellPointer(table, 'rows/0/cells/0', -1)).toBeNull();
    expect(nextCellPointer(table, 'text', 1)).toBeNull();
  });

  it('appends an empty row as one block.set /rows and names its first cell', () => {
    const appended = tableRowAppendMutation(slide, table);
    expect(appended.pointer).toBe('rows/2/cells/0');
    expect(appended.mutation).toEqual({
      op: 'block.set',
      slideId: 's',
      blockId: 't',
      path: '/rows',
      value: [{ cells: ['A', 'B'], header: true }, { cells: ['c', 'd'] }, { cells: ['', ''] }],
    });
  });

  it('appends a list item after the one being edited on plain, rows and refs', () => {
    const plain = listAppendMutation(slide, slide.slots.main![1]!, 'items/0/text');
    expect(plain?.pointer).toBe('items/1/text');
    expect(plain?.mutation).toEqual({
      op: 'block.set',
      slideId: 's',
      blockId: 'list',
      path: '/items',
      value: [{ text: 'one' }, { text: '' }, { text: 'two' }],
    });
    const rows = listAppendMutation(slide, slide.slots.main![2]!, 'items/0/value');
    expect(rows?.pointer).toBe('items/1/value');
    const refs = listAppendMutation(slide, slide.slots.main![3]!, 'items/0');
    expect(refs?.pointer).toBe('items/1');
    expect(refs?.mutation.op === 'block.set' && refs.mutation.value).toEqual(['r1', '']);
    expect(listAppendMutation(slide, table, 'rows/0/cells/0')).toBeNull();
  });

  it('removes an empty item and points at the one before; never the last item', () => {
    const removed = listRemoveMutation(slide, slide.slots.main![1]!, 'items/1/text');
    expect(removed?.pointer).toBe('items/0/text');
    expect(removed?.mutation.op === 'block.set' && removed.mutation.value).toEqual([
      { text: 'one' },
    ]);
    expect(listRemoveMutation(slide, slide.slots.main![1]!, 'items/0/text')?.pointer).toBeNull();
    expect(listRemoveMutation(slide, slide.slots.main![2]!, 'items/0/key')).toBeNull();
  });
});
