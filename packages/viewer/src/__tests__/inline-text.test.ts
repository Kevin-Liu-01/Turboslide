import { describe, expect, it } from 'vitest';

import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { Slide } from '@turboslide/schema/deck';
import { applyMutations } from '@turboslide/schema/reduce';
import { workedDocument } from '@turboslide/schema/fixtures';
import { canonicalText, mergeRuns, parseText, serializeRuns } from '@turboslide/schema/text';

import {
  absorbedSession,
  absorbedText,
  blurVerdict,
  CHROME_TRANSIENT_SELECTOR,
  burstRewrite,
  caretPlaced,
  clickEntry,
  entryCaret,
  forgetAbsorbed,
  handedText,
  listAppendMutation,
  noteAbsorbed,
  noteHanded,
  noteSessionCaret,
  pendingWhitespace,
  runKey,
  listRemoveMutation,
  nextCellPointer,
  paragraphsFromNode,
  readRunText,
  runsFromNode,
  sessionContextTarget,
  sessionPressVerdict,
  tableRowAppendMutation,
  textBurstMutation,
  textCommitMutation,
  textDiff,
  textFromNode,
  trimmedOffset,
} from '../InlineText';
import type { ClickEntryInput, RunNode } from '../InlineText';

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

  it("reads no mark from the run element's own tag: a list key drawn as <b data-run> stays plain", () => {
    /* render lists.ts draws a list's key as <b data-run>; a session that changed nothing wrote a
       bold mark over the whole key when it ended (the canvas walk's resize write carried it) */
    expect(runsFromNode(el('B', [text('/llms.txt')]))).toEqual([{ t: '/llms.txt' }]);
    expect(textFromNode(el('B', [text('/llms.txt')]))).toBe('/llms.txt');
    /* a mark inside the frame is still read */
    expect(runsFromNode(el('B', [text('one '), el('I', [text('two')])]))).toEqual([
      { t: 'one ' },
      { t: 'two', i: true },
    ]);
  });

  it('skips the prompt of an empty placeholder (SPEC 5.4)', () => {
    const empty = el('H1', [el('SPAN', [text('Click to add title')], { 'data-prompt': '' })]);
    expect(textFromNode(empty)).toBe('');
    expect(runsFromNode(empty)).toEqual([]);
  });
});

// The rewrite rule of a burst boundary (SPEC-2 0.54; build-4/hotfix-4.md cause W3): the editable
// is rewritten only when what the DOM serializes to is not the canonical string of its own runs,
// and the white space at the ends of a paragraph is never a reason. Kevin's "pressing space
// isn't working": the burst compared the DOM with the trimmed write form, so the space typed
// before the next word was rewritten away 100 ms after the keystroke.
describe('burstRewrite', () => {
  it('leaves a trailing space alone: the no-break space Chromium writes for it reads back as a space and is not a rewrite', () => {
    const typed = el('H1', [text('Quarterly review: Q3, ')]);
    const raw = serializeRuns(runsFromNode(typed));
    expect(raw).toBe('Quarterly review: Q3, ');
    expect(burstRewrite(raw)).toBeNull();
    /* the write trims it, as before */
    expect(textFromNode(typed)).toBe('Quarterly review: Q3,');
  });

  it('leaves the white space at either end of any paragraph alone', () => {
    expect(burstRewrite('x ')).toBeNull();
    expect(burstRewrite(' x')).toBeNull();
    expect(burstRewrite('Body copy, ')).toBeNull();
    expect(burstRewrite('one \ntwo\n three ')).toBeNull();
    expect(burstRewrite('*bold* ')).toBeNull();
    expect(burstRewrite('')).toBeNull();
  });

  it('rewrites only a string that is not its own canonical form, from the canonical form with its ends kept', () => {
    /* two adjacent bold runs are one in the canonical form; the trailing space stays */
    expect(canonicalText('*a**b* ')).toBe('*ab* ');
    expect(burstRewrite('*a**b* ')).toBe('*ab* ');
    /* what the DOM serializes to is canonical already */
    const dom = el('P', [text('one '), el('B', [text('two')]), text(' ')]);
    const raw = serializeRuns(runsFromNode(dom));
    expect(raw).toBe('one *two* ');
    expect(burstRewrite(raw)).toBeNull();
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

// The burst (gslides-parity SPEC 7.2.15; SPEC-3 3.1): the changed plain span as one text.splice,
// so the admission transforms it against a collaborator's typing and the version log reads as
// typing; a change of marks alone stays a text.replace of the markup span.
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

  it('writes one text.splice of the plain span on a block and the reducer lands the new text', () => {
    const from = readRunText(slide, 'p1', 'text');
    if (from === undefined) throw new Error('no paragraph text');
    const to = `${from.slice(0, 5)}brave ${from.slice(5)}`;
    const mutation = textBurstMutation(slide, 'p1', 'text', from, to);
    expect(mutation).toEqual([
      {
        op: 'text.splice',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        at: 5,
        remove: 0,
        insert: 'brave ',
      },
    ]);
    const after = applyMutations(document, mutation).document.slides['content-rule'];
    expect(after && readRunText(after, 'p1', 'text')).toBe(to);
    if (after === undefined) throw new Error('no slide after the write');
    expect(textBurstMutation(after, 'p1', 'text', to, to)).toEqual([]);
    // a deletion and a replacement travel as plain offsets too
    const deleted = textBurstMutation(after, 'p1', 'text', to, from);
    expect(deleted).toMatchObject([{ op: 'text.splice', at: 5, remove: 6, insert: '' }]);
    const replaced = textBurstMutation(
      slide,
      'p1',
      'text',
      from,
      `${from.slice(0, 5)}bold${from.slice(6)}`,
    );
    expect(replaced).toMatchObject([{ op: 'text.splice', at: 5, remove: 1, insert: 'bold' }]);
  });

  it('writes text.mark in plain offsets when only the marks changed (product pass 1 finding 5)', () => {
    const from = readRunText(slide, 'p1', 'text');
    if (from === undefined) throw new Error('no paragraph text');
    const to = `*${from.slice(0, 5)}*${from.slice(5)}`;
    const mutation = textBurstMutation(slide, 'p1', 'text', from, to);
    expect(mutation).toEqual([
      {
        op: 'text.mark',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        range: [0, 5],
        edit: { kind: 'marks', set: { b: true } },
      },
    ]);
    const after = applyMutations(document, mutation).document.slides['content-rule'];
    expect(after && readRunText(after, 'p1', 'text')).toBe(to);
    /* a link written over a word whose stored run carries another address the session did not
       draw: the plain range resolves against the document's marks and replaces the address, where
       the raw markup splice of the old text.replace left `)l](mailto:...)` standing */
    const linked = textBurstMutation(
      slide,
      'p1',
      'text',
      'Renewal',
      '[Renewal](https://acme.com/renewal)',
    );
    expect(linked).toEqual([
      {
        op: 'text.mark',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        range: [0, 7],
        edit: { kind: 'marks', set: { link: 'https://acme.com/renewal' } },
      },
    ]);
    const stale = structuredClone(document);
    const staleSlide = stale.slides['content-rule']!;
    const block = Object.values(
      (staleSlide as unknown as { slots: Record<string, { id: string; text?: string }[]> }).slots,
    )
      .flat()
      .find((b) => b.id === 'p1')!;
    block.text = '[Renewal](mailto:sales@acme.com)';
    const written = applyMutations(stale, linked).document.slides['content-rule'];
    expect(written && readRunText(written, 'p1', 'text')).toBe(
      '[Renewal](https://acme.com/renewal)',
    );
    /* a removal clears the flag; a mixed range writes one edit per segment */
    expect(textBurstMutation(slide, 'p1', 'text', to, from)).toEqual([
      expect.objectContaining({
        op: 'text.mark',
        range: [0, 5],
        edit: { kind: 'marks', clear: ['b'] },
      }),
    ]);
    const mixed = textBurstMutation(
      slide,
      'p1',
      'text',
      `*${from.slice(0, 2)}*${from.slice(2)}`,
      `*${from}*`,
    );
    expect(mixed).toEqual([
      expect.objectContaining({
        op: 'text.mark',
        range: [2, from.length],
        edit: { kind: 'marks', set: { b: true } },
      }),
    ]);
  });

  it('sends a burst on a title slide’s field as a text run at the field’s pointer (docs/archive/rounds/SYNC.md 3.4)', () => {
    const title = document.slides['title'];
    if (!title) throw new Error('no title slide');
    // the field is the run's blockId and the field's own pointer its path, never `/text`, so the
    // admission transforms two people's bursts on one cover past each other (audit-ordering item 1)
    expect(textBurstMutation(title, 'heading', 'text', 'Old', 'New')).toEqual([
      {
        op: 'text.splice',
        slideId: 'title',
        blockId: 'heading',
        path: '/heading',
        at: 0,
        remove: 3,
        insert: 'New',
      },
    ]);
    // a mark change on the field is a text.mark at the same pointer
    expect(textBurstMutation(title, 'heading', 'text', 'New', '*New*')).toEqual([
      expect.objectContaining({
        op: 'text.mark',
        slideId: 'title',
        blockId: 'heading',
        path: '/heading',
        range: [0, 3],
        edit: { kind: 'marks', set: { b: true } },
      }),
    ]);
  });

  it('carries a paragraph break as a character (SPEC 7.4)', () => {
    const from = readRunText(slide, 'p1', 'text') ?? '';
    const mutation = textBurstMutation(slide, 'p1', 'text', from, `${from}\nSecond.`);
    const first = mutation[0];
    expect(first?.op).toBe('text.splice');
    if (first?.op === 'text.splice') expect(first.insert).toBe('\nSecond.');
    const after = applyMutations(document, mutation).document.slides['content-rule'];
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
    // a table in a grammar slot has no box, so nothing grows
    expect(appended.grow).toBeNull();
  });

  it('appends the box grown by the row beside the rows write on a positioned table (the fix round of the objects round)', () => {
    const positioned = { ...table, pos: { x: 0, y: 0, w: 960, h: 109, z: 1 } };
    const appended = tableRowAppendMutation(slide, positioned);
    // two rows at 54 with the hairline, 109, plus the empty row's pitch at the table's size
    expect(appended.grow).toEqual({
      op: 'block.set',
      slideId: 's',
      blockId: 't',
      path: '/pos/h',
      value: 163,
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

describe('absorbedText (a collaborator typed in the run being edited, SPEC-3 3.5)', () => {
  it('re-applies the unflushed keystrokes after a remote insert before them and shifts the caret', () => {
    const base = 'Every post states';
    const dom = 'Every post statesBB'; // two unflushed keystrokes at the end
    const remote = 'AAAEvery post states'; // the collaborator's insert at the start landed
    const out = absorbedText(base, dom, remote, [19, 19]);
    expect(out.text).toBe('AAAEvery post statesBB');
    expect(out.selection).toEqual([22, 22]);
  });

  it('leaves the keystrokes before a remote insert where they are', () => {
    const out = absorbedText('abc', 'Xabc', 'abcYY', [1, 1]);
    expect(out.text).toBe('XabcYY');
    expect(out.selection).toEqual([1, 1]);
  });

  it('takes the document text as it is when nothing is unflushed and keeps marks', () => {
    const out = absorbedText('a **b** c', 'a **b** c', 'a **b** cd', [5, 5]);
    expect(out.text).toBe('a **b** cd');
    expect(out.selection).toEqual([5, 5]);
  });

  it('handles a remote removal that covers the caret', () => {
    const out = absorbedText('hello world', 'hello world!', 'hello', [12, 12]);
    expect(out.text).toBe('hello!');
    expect(out.selection).toEqual([6, 6]);
  });

  it("keeps a collapsed caret before another person's word that landed at its point (build/r2.md R2-R10)", () => {
    // A's caret rests at the end of its own last word; B's word lands exactly there. The room
    // placed B's word to the right of A's text, so A reads it appear after the caret and the
    // caret stays (docs/REALTIME.md 2, realtime.caret.offset-after-merge). Before this the caret
    // was carried past the insert like an offset of the base (11 read 19).
    const base = 'Alpha bravo';
    expect(absorbedText(base, base, 'Alpha bravo charlie', [11, 11])).toEqual({
      text: 'Alpha bravo charlie',
      selection: [11, 11],
    });
    // an insert before the caret still moves it, a range ending at the point still follows the
    // insert, and a removal at the point still clamps to its start
    expect(absorbedText(base, base, 'XX Alpha bravo', [11, 11]).selection).toEqual([14, 14]);
    expect(absorbedText(base, base, 'Alpha bravo charlie', [6, 11]).selection).toEqual([6, 19]);
    expect(absorbedText(base, base, 'Alpha', [11, 11]).selection).toEqual([5, 5]);
  });

  it("keeps unflushed keystrokes that begin where another person's word landed before that word, with the caret (build/r1.md R1-R2h)", () => {
    // A handed " ta" and still holds "3" in the editable when B's " tb" lands at the end of " ta":
    // the "3" finishes A's word and B's word follows (realtime.title.two-typers lost " ta3")
    const base = 'Heading ta';
    const dom = 'Heading ta3';
    expect(absorbedText(base, dom, 'Heading ta tb', [11, 11])).toEqual({
      text: 'Heading ta3 tb',
      selection: [11, 11],
    });
    // a caret before the keystrokes stays where it is
    expect(absorbedText(base, dom, 'Heading ta tb', [10, 10]).selection).toEqual([10, 10]);
    // a caret past the keystrokes in a longer text moves with the insertion
    expect(absorbedText('ab cd', 'ab3 cd', 'abXY cd', [5, 5])).toEqual({
      text: 'ab3XY cd',
      selection: [7, 7],
    });
    // an insertion elsewhere keeps the old rule: the keystrokes move past one before them
    expect(absorbedText(base, dom, 'Heading tb ta', [11, 11])).toEqual({
      text: 'Heading tb ta3',
      selection: [14, 14],
    });
  });

  it("moves the caret and the keystrokes past an insertion whose point is not certain (realtime.title.two-typers, ' ta1' lost)", () => {
    // B handed " t" at the end of "Realtime title"; A's " t" and then " ta" landed before it, as
    // the room placed them. The diff reads "a t" at 16, the end of B's " t", because its text
    // ends with the " t" before 16; the caret and B's unflushed "b" follow B's own " t"
    const base = 'Realtime title t';
    expect(absorbedText(base, base, 'Realtime title t t', [16, 16])).toEqual({
      text: 'Realtime title t t',
      selection: [18, 18],
    });
    expect(absorbedText(base, 'Realtime title tb', 'Realtime title ta t', [17, 17])).toEqual({
      text: 'Realtime title ta tb',
      selection: [20, 20],
    });
    // an insertion whose text does not end with the character before its point keeps both rules
    expect(absorbedText('Heading ta', 'Heading ta3', 'Heading ta tb', [11, 11])).toEqual({
      text: 'Heading ta3 tb',
      selection: [11, 11],
    });
    expect(
      absorbedText('Alpha bravo', 'Alpha bravo', 'Alpha bravo charlie', [11, 11]).selection,
    ).toEqual([11, 11]);
  });

  it('takes the point of the remote insertion from the splice the route names (realtime.title.two-typers, realtime.caret.offset-after-merge)', () => {
    // the room placed A's " t" at 14, before B's handed " t": the splice says so, and B's caret
    // and B's unflushed "b" follow B's own " t"
    const base = 'Realtime title t';
    const before = [{ at: 14, remove: 0, insert: ' t' }];
    expect(absorbedText(base, base, 'Realtime title t t', [16, 16], before)).toEqual({
      text: 'Realtime title t t',
      selection: [18, 18],
    });
    expect(absorbedText(base, 'Realtime title tb', 'Realtime title t t', [17, 17], before)).toEqual(
      {
        text: 'Realtime title t tb',
        selection: [19, 19],
      },
    );
    // the room placed B's " cb1" at A's caret, after A's " ca1": the strings alone read it one
    // character earlier (both words end in "1"), the splice keeps A's caret before B's word
    const caret = 'Caret ca1';
    const after = [{ at: 9, remove: 0, insert: ' cb1' }];
    expect(absorbedText(caret, caret, 'Caret ca1 cb1', [9, 9]).selection).toEqual([13, 13]);
    expect(absorbedText(caret, caret, 'Caret ca1 cb1', [9, 9], after).selection).toEqual([9, 9]);
    expect(absorbedText(caret, 'Caret ca12', 'Caret ca1 cb1', [10, 10], after)).toEqual({
      text: 'Caret ca12 cb1',
      selection: [10, 10],
    });
    // a splice that does not turn the base into the document's text is not used: the diff reads
    expect(
      absorbedText(base, base, 'Realtime title t t', [16, 16], [{ at: 3, remove: 0, insert: 'x' }])
        .selection,
    ).toEqual([18, 18]);
  });

  it('carries a caret after the unflushed keystrokes past a remote insert that begins between them and the caret (VERIFICATION.md C3S-F12)', () => {
    // four characters typed at 6 of the base while the collaborator's two landed at 8 of it
    const base = 'Every line of copy';
    const dom = 'Every AAAAline of copy';
    const remote = 'Every liBBne of copy';
    expect(absorbedText(base, dom, remote, [10, 10])).toEqual({
      text: 'Every AAAAliBBne of copy',
      selection: [10, 10],
    });
    // a caret inside the keystrokes follows their landing point; one past the remote insert
    // moves with it; one before the keystrokes is an offset of the base and stays
    expect(absorbedText(base, dom, remote, [8, 8]).selection).toEqual([8, 8]);
    expect(absorbedText(base, dom, remote, [14, 14]).selection).toEqual([16, 16]);
    expect(absorbedText(base, dom, remote, [3, 3]).selection).toEqual([3, 3]);
  });
});

describe('textBurstMutation diffs against the document when a collaborator moved the text (SPEC-3 3.5)', () => {
  it('emits the local splice at its shifted offset, never the remote insert', () => {
    const slide = structuredClone(workedDocument().slides['content-rule']!) as Slide;
    const block = Object.values(
      (slide as unknown as { slots: Record<string, { id: string }[]> }).slots,
    )
      .flat()
      .find((b) => b.id === 'p1') as unknown as { text: string };
    const before = block.text;
    // the session absorbed the collaborator's insert; the slide prop may still lag behind it
    noteAbsorbed(runKey('content-rule', 'p1', 'text'), `AAA${before}`);
    const mutation = textBurstMutation(slide, 'p1', 'text', before, `AAA${before}BB`);
    expect(mutation).toEqual([
      {
        op: 'text.splice',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        at: 3 + before.length,
        remove: 0,
        insert: 'BB',
      },
    ]);
    // the marker is consumed by one burst; the next diffs against the Editor's markup again
    expect(textBurstMutation(slide, 'p1', 'text', `AAA${before}BB`, `AAA${before}BB`)).toEqual([]);
    noteAbsorbed(runKey('content-rule', 'p1', 'text'), `AAA${before}`);
    expect(textBurstMutation(slide, 'p1', 'text', before, `AAA${before}`)).toEqual([]);
  });
});

describe("a burst's insertion ends at the session's caret (realtime.title.two-typers, ' ta1' stitched to B's ' t')", () => {
  it('moves a pure insertion the diff can read at several points to the one that ends at the caret', () => {
    // A typed " ta1" before B's " t", which landed at the same point: the diff reads "a1 t" after
    // B's " t"; the caret after "ta1" says the insertion is " ta1" before it
    const from = 'Realtime title t';
    const to = 'Realtime title ta1 t';
    const diff = textDiff(from, to);
    expect(diff).toEqual({ start: 16, end: 16, text: 'a1 t' });
    expect(caretPlaced(from, to, diff, 18)).toEqual({ start: 14, end: 14, text: ' ta1' });
    // the caret at the diff's own end, no caret, a caret no such insertion ends at, and a change
    // that is not a pure insertion keep the diff
    expect(caretPlaced(from, to, diff, 20)).toEqual(diff);
    expect(caretPlaced(from, to, diff, undefined)).toEqual(diff);
    expect(caretPlaced(from, to, diff, 17)).toEqual(diff);
    const removal = textDiff('abc', 'ac');
    expect(caretPlaced('abc', 'ac', removal, 1)).toEqual(removal);
    // typed after B's " t": the caret at the end keeps the diff's " t" after it
    expect(caretPlaced('X t', 'X t t', textDiff('X t', 'X t t'), 5)).toEqual({
      start: 3,
      end: 3,
      text: ' t',
    });
  });

  it('writes every burst at the caret the session reads, and diffs as before without a session', () => {
    const slide = structuredClone(workedDocument().slides['content-rule']!);
    const key = runKey('content-rule', 'p1', 'text');
    forgetAbsorbed(key);
    const from = 'Realtime title t';
    const to = 'Realtime title ta1 t';
    let caret: number | null = 18;
    noteSessionCaret(key, () => caret);
    const placed = {
      op: 'text.splice',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      at: 14,
      remove: 0,
      insert: ' ta1',
    };
    expect(textBurstMutation(slide, 'p1', 'text', from, to)).toEqual([placed]);
    // the reader is read at each write (the Editor's re-send reads it too), not taken by one
    expect(textBurstMutation(slide, 'p1', 'text', from, to)).toEqual([placed]);
    // a range reads no caret: the diff stands
    caret = null;
    expect(textBurstMutation(slide, 'p1', 'text', from, to)).toEqual([
      expect.objectContaining({ at: 16, insert: 'a1 t' }),
    ]);
    // the session ended: forgetAbsorbed drops the reader with the marker
    caret = 18;
    forgetAbsorbed(key);
    expect(textBurstMutation(slide, 'p1', 'text', from, to)).toEqual([
      expect.objectContaining({ at: 16, insert: 'a1 t' }),
    ]);
    forgetAbsorbed(key);
  });
});

describe('the space typed before the next word survives a collaborator\'s change (realtime.title.two-typers, "ta1ua1 tb1ub1")', () => {
  it('carries an offset of the editable into the text a write sends', () => {
    // a space at the end is trimmed: a caret after it reads the end of the letters
    expect(trimmedOffset('Heading ta1 ', 'Heading ta1', 12)).toBe(11);
    expect(trimmedOffset('Heading ta1 ', 'Heading ta1', 4)).toBe(4);
    expect(trimmedOffset('Heading', 'Heading', 9)).toBe(7);
    // a multiline run trims each paragraph, its start too
    const raw = 'one  \n  two \nthree';
    const trimmed = 'one\ntwo\nthree';
    expect(trimmedOffset(raw, trimmed, 5)).toBe(3);
    expect(trimmedOffset(raw, trimmed, 6)).toBe(4);
    expect(trimmedOffset(raw, trimmed, 9)).toBe(5);
    expect(trimmedOffset(raw, trimmed, 12)).toBe(7);
    expect(trimmedOffset(raw, trimmed, 13)).toBe(8);
    expect(trimmedOffset(raw, trimmed, 18)).toBe(13);
  });

  it("reads the white space before a caret at its paragraph's end and nothing else", () => {
    expect(pendingWhitespace('Heading ta1 ', 'Heading ta1', 12)).toBe(' ');
    expect(pendingWhitespace('Heading ta1  ', 'Heading ta1', 13)).toBe('  ');
    // the caret elsewhere, no white space, or a paragraph that keeps its end (a mark around it)
    expect(pendingWhitespace('Heading ta1 ', 'Heading ta1', 11)).toBe('');
    expect(pendingWhitespace('Heading ta1', 'Heading ta1', 11)).toBe('');
    expect(pendingWhitespace('Heading ta1 ', 'Heading ta1 ', 12)).toBe('');
    expect(pendingWhitespace('one \ntwo', 'one\ntwo', 4)).toBe(' ');
    expect(pendingWhitespace('one \ntwo', 'one\ntwo', 8)).toBe('');
  });

  it("keeps the space and the caret after it when the other person's word lands elsewhere", () => {
    // A typed " ta1" (handed) and a space; B's " tb1" landed at 8, before A's word
    const next = absorbedSession({
      base: 'Heading ta1',
      raw: 'Heading ta1 ',
      trimmed: 'Heading ta1',
      remote: 'Heading tb1 ta1',
      selection: [12, 12],
      splices: [{ at: 7, remove: 0, insert: ' tb1' }],
    });
    expect(next).toEqual({ text: 'Heading tb1 ta1 ', selection: [16, 16] });
    // before the fix the trimmed editable was absorbed: the space was gone and the next letter
    // joined the two words
    expect(absorbedText('Heading ta1', 'Heading ta1', 'Heading tb1 ta1', [12, 12]).text).toBe(
      'Heading tb1 ta1',
    );
  });

  it("keeps the space before the other person's word that lands at the caret, as a keystroke there", () => {
    // B's " tb1" landed at A's run end, where A's caret and A's space stand: the space is A's
    // unflushed keystroke at that point and stays before it, the caret after the space
    const next = absorbedSession({
      base: 'Heading ta1',
      raw: 'Heading ta1 ',
      trimmed: 'Heading ta1',
      remote: 'Heading ta1 tb1',
      selection: [12, 12],
      splices: [{ at: 11, remove: 0, insert: ' tb1' }],
    });
    expect(next).toEqual({ text: 'Heading ta1  tb1', selection: [12, 12] });
  });

  it('absorbs as before when nothing is pending', () => {
    expect(
      absorbedSession({
        base: 'Alpha bravo',
        raw: 'Alpha bravo',
        trimmed: 'Alpha bravo',
        remote: 'Alpha bravo charlie',
        selection: [11, 11],
        splices: [{ at: 11, remove: 0, insert: ' charlie' }],
      }),
    ).toEqual({ text: 'Alpha bravo charlie', selection: [11, 11] });
  });
});

describe("the unflushed keystrokes end at the caret (realtime.title.two-typers, a word typed into another's)", () => {
  it("places a local insertion the diff can read inside the other person's word at the caret", () => {
    // A's caret stood before B's " tb" (the caret rule); A typed " t" there: the diff alone reads
    // " t" between B's " t" and "b", and B's "1" landing at its run end then moved A's keys past
    // it ("X tb t1"); at the caret the keys stay before B's word and B's "1" finishes it
    const next = absorbedText(
      'X tb',
      'X t tb',
      'X tb1',
      [3, 3],
      [{ at: 4, remove: 0, insert: '1' }],
    );
    expect(next).toEqual({ text: 'X t tb1', selection: [3, 3] });
  });
});

describe('the absorbed marker lives as long as its session (VERIFICATION.md C3-F8, b7.md FR3.8)', () => {
  const key = runKey('content-rule', 'p1', 'text');
  function p1(): { slide: Slide; before: string } {
    const slide = structuredClone(workedDocument().slides['content-rule']!) as Slide;
    const block = Object.values(
      (slide as unknown as { slots: Record<string, { id: string }[]> }).slots,
    )
      .flat()
      .find((b) => b.id === 'p1') as unknown as { text: string };
    return { slide, before: block.text };
  }

  it('a burst with nothing to send consumes the marker, so the next burst diffs against the Editor', () => {
    const { slide, before } = p1();
    // B's session absorbed A's characters after its own last burst; the editable equals the
    // document, so the final write of the session has nothing to send
    noteAbsorbed(key, `AAA${before}`);
    expect(textBurstMutation(slide, 'p1', 'text', `AAA${before}`, `AAA${before}`)).toEqual([]);
    // the next burst on this run is a new session's first: its base is the Editor's markup, never
    // the marker the last session left
    expect(textBurstMutation(slide, 'p1', 'text', `U${before}`, `VVU${before}`)).toEqual([
      {
        op: 'text.splice',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        at: 0,
        remove: 0,
        insert: 'VV',
      },
    ]);
  });

  it('forgetAbsorbed drops a marker the session never reached, so a later session is not based on it', () => {
    const { slide, before } = p1();
    // the shape of C3-F8 without the fix: a stale marker two remote writes old against the
    // document's text sends the whole run back (remove all, insert all), which applied to the
    // longer document left its tail standing twice
    noteAbsorbed(key, before);
    const stale = textBurstMutation(slide, 'p1', 'text', `U${before} drag`, `VVU${before} drag`);
    expect(stale).toEqual([
      {
        op: 'text.splice',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        at: 0,
        remove: before.length,
        insert: `VVU${before} drag`,
      },
    ]);
    // startEdit and endEdit forget the run's marker: the same burst then travels as its two characters
    noteAbsorbed(key, before);
    forgetAbsorbed(key);
    expect(textBurstMutation(slide, 'p1', 'text', `U${before} drag`, `VVU${before} drag`)).toEqual([
      {
        op: 'text.splice',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        at: 0,
        remove: 0,
        insert: 'VV',
      },
    ]);
    // forgetting a run with no marker is nothing
    forgetAbsorbed(key);
    expect(textBurstMutation(slide, 'p1', 'text', before, before)).toEqual([]);
  });
});

describe('the handed text is the base of the next absorb (VERIFICATION.md C3S-F12, seam.md SEAM2-F1)', () => {
  const key = runKey('content-rule', 'p1', 'text');
  function p1(): { slide: Slide; before: string } {
    const slide = structuredClone(workedDocument().slides['content-rule']!) as Slide;
    const block = Object.values(
      (slide as unknown as { slots: Record<string, { id: string }[]> }).slots,
    )
      .flat()
      .find((b) => b.id === 'p1') as unknown as { text: string };
    return { slide, before: block.text };
  }

  it('textBurstMutation notes the text it hands the document, and forgetAbsorbed drops it with the marker', () => {
    const { slide, before } = p1();
    forgetAbsorbed(key);
    expect(handedText(key)).toBeUndefined();
    expect(textBurstMutation(slide, 'p1', 'text', before, `A${before}`)).toMatchObject([
      {
        op: 'text.splice',
        at: 0,
        remove: 0,
        insert: 'A',
      },
    ]);
    expect(handedText(key)).toBe(`A${before}`);
    // a burst with nothing to send leaves the record where the document is
    expect(textBurstMutation(slide, 'p1', 'text', `A${before}`, `A${before}`)).toEqual([]);
    expect(handedText(key)).toBe(`A${before}`);
    // the marker names the document's text: a burst equal to it sends nothing and records it
    noteAbsorbed(key, `A${before}Z`);
    expect(textBurstMutation(slide, 'p1', 'text', `A${before}`, `A${before}Z`)).toEqual([]);
    expect(handedText(key)).toBe(`A${before}Z`);
    forgetAbsorbed(key);
    expect(handedText(key)).toBeUndefined();
  });

  it('after the Editor re-sent keystrokes past the burst timer, the absorb re-applies only the newer ones and keeps the caret after them', () => {
    const { slide, before } = p1();
    forgetAbsorbed(key);
    // the session's burst: three characters at the start of the paragraph
    const burst = `AAA${before}`;
    expect(textBurstMutation(slide, 'p1', 'text', before, burst)).toMatchObject([
      {
        at: 0,
        remove: 0,
        insert: 'AAA',
      },
    ]);
    // the collaborator's two characters at the end, absorbed: the session notes the document's
    // text and the marker
    const absorbed = `${burst}BB`;
    noteHanded(key, absorbed);
    noteAbsorbed(key, absorbed);
    // the Editor's re-send (text-fit.ts sessionReconcile 'resend'): five characters the burst
    // timer had not flushed travel as one splice and the record follows them
    const resent = `AAAAAAAA${before}BB`;
    expect(textBurstMutation(slide, 'p1', 'text', absorbed, resent)).toMatchObject([
      {
        at: 3,
        remove: 0,
        insert: 'AAAAA',
      },
    ]);
    expect(handedText(key)).toBe(resent);
    // four more of the collaborator's land while two newer characters wait in the editable: the
    // absorb bases on the re-sent text, so the two land after the eight and the caret stays there
    const dom = `AAAAAAAAAA${before}BB`;
    const remote = `AAAAAAAA${before}BBBBBB`;
    expect(absorbedText(handedText(key) ?? '', dom, remote, [10, 10])).toEqual({
      text: `AAAAAAAAAA${before}BBBBBB`,
      selection: [10, 10],
    });
    // against the session's own last burst the five re-sent characters read as the
    // collaborator's change: the seven land four places into the paragraph and the caret with
    // them, the shape of the miss (98 A's, "Ever", 7 A's)
    const stale = absorbedText(absorbed, dom, remote, [10, 10]);
    expect(stale.text).toBe(`AAAAAAAA${before.slice(0, 4)}AAAAAAA${before.slice(4)}BBBBBB`);
    expect(stale.selection).toEqual([19, 19]);
    forgetAbsorbed(key);
  });
});

describe('a blur into the chrome (docs/FOCUS.md section 5 rank 10)', () => {
  it('parks the session for a button of a transient surface and takes the focus back', () => {
    expect(blurVerdict({ field: false, transient: true, button: true })).toBe('park-and-refocus');
  });

  it('parks the session for a menu row and leaves the focus with the menu', () => {
    expect(blurVerdict({ field: false, transient: true, button: false })).toBe('park');
  });

  it('ends the session for a field anywhere and for anything outside the chrome surfaces', () => {
    expect(blurVerdict({ field: true, transient: true, button: false })).toBe('end');
    expect(blurVerdict({ field: true, transient: false, button: false })).toBe('end');
    expect(blurVerdict({ field: false, transient: false, button: true })).toBe('end');
    expect(blurVerdict({ field: false, transient: false, button: false })).toBe('end');
  });

  it('names the toolbar, the plates, the right click menu, the menu bar and the menu plates as the transient surfaces', () => {
    for (const part of [
      '[role="toolbar"]',
      '.ts-tb-tail',
      '.ts-plate-anchored',
      '.ts-layout-plate',
      '.ts-context-menu',
      /* the return round (docs/archive/rounds/RETURN.md 2.14 item 2): a Format > Text row on a double clicked
         word marked the whole box because the menu bar press ended the session; the menu bar and
         every menu plate park it now, the rule the toolbar had */
      '.ts-menubar',
      '.ts-menu',
    ]) {
      expect(CHROME_TRANSIENT_SELECTOR).toContain(part);
    }
  });
});

describe('sessionPressVerdict (focus verification finding F5)', () => {
  const blockId = 'a1';
  it('leaves a press inside the run to the browser, whatever object is under it', () => {
    expect(sessionPressVerdict({ insideRun: true, under: 'a1', blockId })).toBe('caret');
    expect(sessionPressVerdict({ insideRun: true, under: null, blockId })).toBe('caret');
  });
  it('keeps the session on a press on the edited block outside its run (its padding)', () => {
    expect(sessionPressVerdict({ insideRun: false, under: 'a1', blockId })).toBe('keep');
  });
  it('ends the session and runs the press as a selection press on another object', () => {
    expect(sessionPressVerdict({ insideRun: false, under: 'a2', blockId })).toBe('end-and-select');
  });
  it('ends the session and keeps the block selected on the empty sheet', () => {
    expect(sessionPressVerdict({ insideRun: false, under: null, blockId })).toBe('end');
  });
});

describe('clickEntry (docs/gslides-parity/focus/AMENDMENTS.md A1, the click model)', () => {
  const textBox: ClickEntryInput = {
    clicks: 1,
    editing: false,
    kind: 'text',
    groupMember: false,
    hasRun: true,
  };

  it('rule 1: one click selects every kind of object and opens no session, a text box and a placeholder included', () => {
    expect(clickEntry(textBox)).toBe('select');
    expect(clickEntry({ ...textBox, kind: 'picture', hasRun: false })).toBe('select');
    expect(clickEntry({ ...textBox, kind: 'shape' })).toBe('select');
    expect(clickEntry({ ...textBox, kind: 'line', hasRun: false })).toBe('select');
    expect(clickEntry({ ...textBox, groupMember: true })).toBe('select');
    /* the placeholder ("Click to add title") is a text object with a run: the same rule (A1 rule 5) */
    expect(clickEntry({ ...textBox, kind: 'text' })).toBe('select');
  });

  it('rule 3: a double click on a text object opens its session; on a shape with text its text; on a picture crop; on a group its member', () => {
    expect(clickEntry({ ...textBox, clicks: 2 })).toBe('text');
    expect(clickEntry({ ...textBox, clicks: 2, kind: 'shape' })).toBe('text');
    expect(clickEntry({ ...textBox, clicks: 2, kind: 'picture', hasRun: false })).toBe('crop');
    expect(clickEntry({ ...textBox, clicks: 2, groupMember: true })).toBe('member');
    /* the member wins over the kind: the first double click enters the group, the next the text */
    expect(clickEntry({ ...textBox, clicks: 2, kind: 'picture', groupMember: true })).toBe(
      'member',
    );
  });

  it('rule 3: a double click inside an open session is the browser word selection', () => {
    expect(clickEntry({ ...textBox, clicks: 2, editing: true })).toBe('word');
    expect(clickEntry({ ...textBox, clicks: 2, editing: true, kind: 'shape' })).toBe('word');
  });

  it('a double click on a line, or on an object with no run, opens nothing', () => {
    expect(clickEntry({ ...textBox, clicks: 2, kind: 'line', hasRun: false })).toBe('none');
    expect(clickEntry({ ...textBox, clicks: 2, kind: 'shape', hasRun: false })).toBe('none');
    expect(clickEntry({ ...textBox, clicks: 2, kind: 'other', hasRun: false })).toBe('none');
  });
});

describe('entryCaret (AMENDMENTS.md A1 rules 3 and 4)', () => {
  it('the double click places the caret at its point, or at the end without one', () => {
    expect(entryCaret('double-click', { x: 120, y: 40 })).toEqual({ x: 120, y: 40 });
    expect(entryCaret('double-click', null)).toBe('end');
  });
  it('a printable key selects the whole text so the first character replaces it', () => {
    expect(entryCaret('typing', null)).toBe('all');
    expect(entryCaret('typing', { x: 1, y: 1 })).toBe('all');
  });
  it('Enter places the caret at the end', () => {
    expect(entryCaret('enter', null)).toBe('end');
  });
  it('the second click on the selected object places the caret at its release point, or at the end off the run (AMENDMENTS.md A2)', () => {
    expect(entryCaret('second-click', { x: 300, y: 64 })).toEqual({ x: 300, y: 64 });
    expect(entryCaret('second-click', null)).toBe('end');
  });
});

describe('sessionContextTarget (focus verification finding F4)', () => {
  it('opens the Text menu on selected text, in a text box and in a table cell alike', () => {
    expect(sessionContextTarget({ selected: true, cell: false })).toBe('textSelection');
    expect(sessionContextTarget({ selected: true, cell: true })).toBe('textSelection');
  });
  it('ends the session and opens the object menu on a collapsed caret instead of nothing', () => {
    expect(sessionContextTarget({ selected: false, cell: false })).toBe('object');
  });
  it('ends the session and opens the Table menu on a collapsed caret in a cell', () => {
    expect(sessionContextTarget({ selected: false, cell: true })).toBe('tableCell');
  });
});
