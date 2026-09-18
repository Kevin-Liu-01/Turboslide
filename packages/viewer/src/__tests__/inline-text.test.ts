import { describe, expect, it } from 'vitest';

import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { Slide } from '@turboslide/schema/deck';
import { applyMutations } from '@turboslide/schema/reduce';
import { workedDocument } from '@turboslide/schema/fixtures';
import { canonicalText, mergeRuns, parseText, serializeRuns } from '@turboslide/schema/text';

import {
  absorbedText,
  blurVerdict,
  CHROME_TRANSIENT_SELECTOR,
  burstRewrite,
  clickEntry,
  entryCaret,
  forgetAbsorbed,
  listAppendMutation,
  noteAbsorbed,
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
    expect(mutation).toEqual({
      op: 'text.splice',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      at: 5,
      remove: 0,
      insert: 'brave ',
    });
    const after = applyMutations(document, [mutation!]).document.slides['content-rule'];
    expect(after && readRunText(after, 'p1', 'text')).toBe(to);
    if (after === undefined) throw new Error('no slide after the write');
    expect(textBurstMutation(after, 'p1', 'text', to, to)).toBeNull();
    // a deletion and a replacement travel as plain offsets too
    const deleted = textBurstMutation(after, 'p1', 'text', to, from);
    expect(deleted).toMatchObject({ op: 'text.splice', at: 5, remove: 6, insert: '' });
    const replaced = textBurstMutation(
      slide,
      'p1',
      'text',
      from,
      `${from.slice(0, 5)}bold${from.slice(6)}`,
    );
    expect(replaced).toMatchObject({ op: 'text.splice', at: 5, remove: 1, insert: 'bold' });
  });

  it('keeps text.replace of the markup span when only the marks changed', () => {
    const from = readRunText(slide, 'p1', 'text');
    if (from === undefined) throw new Error('no paragraph text');
    const to = `*${from.slice(0, 5)}*${from.slice(5)}`;
    const mutation = textBurstMutation(slide, 'p1', 'text', from, to);
    expect(mutation?.op).toBe('text.replace');
    const after = applyMutations(document, [mutation!]).document.slides['content-rule'];
    expect(after && readRunText(after, 'p1', 'text')).toBe(to);
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
    expect(mutation?.op).toBe('text.splice');
    if (mutation?.op === 'text.splice') expect(mutation.insert).toBe('\nSecond.');
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
    expect(mutation).toEqual({
      op: 'text.splice',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      at: 3 + before.length,
      remove: 0,
      insert: 'BB',
    });
    // the marker is consumed by one burst; the next diffs against the Editor's markup again
    expect(textBurstMutation(slide, 'p1', 'text', `AAA${before}BB`, `AAA${before}BB`)).toBeNull();
    noteAbsorbed(runKey('content-rule', 'p1', 'text'), `AAA${before}`);
    expect(textBurstMutation(slide, 'p1', 'text', before, `AAA${before}`)).toBeNull();
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
    expect(textBurstMutation(slide, 'p1', 'text', `AAA${before}`, `AAA${before}`)).toBeNull();
    // the next burst on this run is a new session's first: its base is the Editor's markup, never
    // the marker the last session left
    expect(textBurstMutation(slide, 'p1', 'text', `U${before}`, `VVU${before}`)).toEqual({
      op: 'text.splice',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      at: 0,
      remove: 0,
      insert: 'VV',
    });
  });

  it('forgetAbsorbed drops a marker the session never reached, so a later session is not based on it', () => {
    const { slide, before } = p1();
    // the shape of C3-F8 without the fix: a stale marker two remote writes old against the
    // document's text sends the whole run back (remove all, insert all), which applied to the
    // longer document left its tail standing twice
    noteAbsorbed(key, before);
    const stale = textBurstMutation(slide, 'p1', 'text', `U${before} drag`, `VVU${before} drag`);
    expect(stale).toEqual({
      op: 'text.splice',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      at: 0,
      remove: before.length,
      insert: `VVU${before} drag`,
    });
    // startEdit and endEdit forget the run's marker: the same burst then travels as its two characters
    noteAbsorbed(key, before);
    forgetAbsorbed(key);
    expect(textBurstMutation(slide, 'p1', 'text', `U${before} drag`, `VVU${before} drag`)).toEqual({
      op: 'text.splice',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      at: 0,
      remove: 0,
      insert: 'VV',
    });
    // forgetting a run with no marker is nothing
    forgetAbsorbed(key);
    expect(textBurstMutation(slide, 'p1', 'text', before, before)).toBeNull();
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

  it('names the toolbar, the plates and the right click menu as the transient surfaces, and leaves the menu bar out', () => {
    for (const part of [
      '[role="toolbar"]',
      '.ts-tb-tail',
      '.ts-plate-anchored',
      '.ts-layout-plate',
      '.ts-context-menu',
    ]) {
      expect(CHROME_TRANSIENT_SELECTOR).toContain(part);
    }
    /* a menu bar click ends the session as the blur did: the menus' rows read the focus as the
       caret's while a session is parked, and Insert > Text box refused itself under it */
    expect(CHROME_TRANSIENT_SELECTOR).not.toContain('menubar');
    expect(CHROME_TRANSIENT_SELECTOR).not.toContain('[role="menu"]');
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
