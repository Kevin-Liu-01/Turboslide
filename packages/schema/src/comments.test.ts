// Comments (gslides-parity SPEC-3 5.1, 16.6): the schemas accept the fixtures and refuse a 4,001
// code point body, a 21st mention, an unresolved {@n} token, a bidi override in a label and an
// emoji outside the palette; resolveAnchor for the six kinds, a removed block, a removed slide, a
// slide.replace that keeps and drops ids, a version.restore round trip and a merged cell;
// shiftAnchors under the splice cases of 08 1.2 and a whole Text rewrite.
import { describe, expect, it } from 'vitest';
import type { Block } from './blocks.ts';
import {
  COMMENT_CAPS,
  EMOJI_PALETTE,
  bodyProblem,
  commentAnchorSchema,
  commentAuthorSchema,
  commentBodySchema,
  commentOpSchema,
  commentSchema,
  commentsIndexSchema,
  indexRowOf,
  mentionedIndexes,
  principalKind,
  quotedTextOf,
  reactionSchema,
  resolveAnchor,
  shiftAnchors,
  threadSchema,
} from './comments.ts';
import type { CommentAnchor, Thread } from './comments.ts';
import type { DeckDocument } from './deck.ts';
import { workedDocument } from './fixtures.ts';
import type { Mutation } from './mutations.ts';
import { applyMutations, applyWrite } from './reduce.ts';
import { plainOf } from './text.ts';
import { validateDocument } from './validate.ts';

const NOW = '2026-09-13T10:00:00.000Z';
const ULID = '01j8z2kmayaq4e0s7r9x2v8b3c';
const ULID2 = '01j8z2kmayaq4e0s7r9x2v8b3d';
const MAYA = 'usr_01J8Z2KMAYA';
const author = { principalId: MAYA, label: 'Maya', kind: 'human' as const };

function thread(anchor: CommentAnchor, overrides: Partial<Thread> = {}): Thread {
  return {
    id: ULID,
    deckId: 'gt-brand',
    anchor,
    comment: {
      id: ULID,
      author,
      createdAt: NOW,
      body: { text: 'Check this with {@0}', mentions: [{ kind: 'principal', principalId: MAYA }] },
    },
    replies: [],
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    ...overrides,
  };
}

function base(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

function textOfP1(document: DeckDocument): string {
  const slide = document.slides['content-rule'];
  if (slide?.kind !== 'content') throw new Error('fixture');
  for (const list of Object.values(slide.slots)) {
    const block = list.find((row) => row.id === 'p1');
    if (block !== undefined && 'text' in block) return block.text as string;
  }
  throw new Error('fixture');
}

const TEXT_ANCHOR: CommentAnchor = {
  kind: 'text',
  slideId: 'content-rule',
  blockId: 'p1',
  path: '/text',
  range: [6, 10],
  quoted: 'post',
};

describe('the comment schemas (SPEC-3 5.1)', () => {
  it('accept the fixtures', () => {
    const fixture = thread(TEXT_ANCHOR, {
      replies: [
        {
          id: ULID2,
          author: {
            principalId: 'anon_0f8fad5b-d9cb-469f-a165-70867728950e',
            label: 'Titanium 471',
            kind: 'human',
          },
          createdAt: NOW,
          body: { text: 'Done.', mentions: [] },
          reactions: [{ emoji: '👍', principalIds: [MAYA] }],
        },
      ],
      assignee: { to: { kind: 'principal', principalId: 'agent:tok_01J8Z2K' }, by: MAYA, at: NOW },
    });
    expect(threadSchema.safeParse(fixture).success).toBe(true);
    for (const anchor of [
      { kind: 'deck' },
      { kind: 'slide', slideId: 'content-rule' },
      { kind: 'block', slideId: 'content-rule', blockId: 'p1' },
      TEXT_ANCHOR,
      { kind: 'cell', slideId: 'content-rule', blockId: 't', cell: [1, 2] },
      { kind: 'notes', slideId: 'content-rule' },
    ]) {
      expect(commentAnchorSchema.safeParse(anchor).success, JSON.stringify(anchor)).toBe(true);
    }
    expect(
      commentsIndexSchema.safeParse({
        schemaVersion: 1,
        deckId: 'gt-brand',
        revision: 1,
        updatedAt: NOW,
        threads: [indexRowOf(fixture)],
      }).success,
    ).toBe(true);
    expect(indexRowOf(fixture)).toEqual({
      id: ULID,
      slideId: 'content-rule',
      kind: 'text',
      open: true,
      updatedAt: NOW,
      count: 2,
      assignee: { kind: 'principal', principalId: 'agent:tok_01J8Z2K' },
    });
    expect(principalKind(MAYA)).toBe('account');
    expect(principalKind('anon_x')).toBe('anonymous');
    expect(principalKind('agent:t')).toBe('agent');
  });

  it('refuse a 4,001 code point body, a 21st mention, an unresolved token and a stray brace', () => {
    expect(commentBodySchema.safeParse({ text: '😀'.repeat(4000), mentions: [] }).success).toBe(
      true,
    );
    expect(commentBodySchema.safeParse({ text: '😀'.repeat(4001), mentions: [] }).success).toBe(
      false,
    );
    const mention = { kind: 'principal', principalId: MAYA } as const;
    expect(
      commentBodySchema.safeParse({
        text: 'x',
        mentions: Array.from({ length: 20 }, () => mention),
      }).success,
    ).toBe(true);
    expect(
      commentBodySchema.safeParse({
        text: 'x',
        mentions: Array.from({ length: 21 }, () => mention),
      }).success,
    ).toBe(false);
    expect(commentBodySchema.safeParse({ text: 'Ask {@1}', mentions: [mention] }).success).toBe(
      false,
    );
    expect(commentBodySchema.safeParse({ text: 'A {brace}', mentions: [] }).success).toBe(false);
    expect(commentBodySchema.safeParse({ text: 'A {@x}', mentions: [] }).success).toBe(false);
    expect(commentBodySchema.safeParse({ text: 'Tab\tand\nline', mentions: [] }).success).toBe(
      true,
    );
    expect(commentBodySchema.safeParse({ text: 'Bell', mentions: [] }).success).toBe(false);
    expect(bodyProblem({ text: 'Ask {@1}', mentions: [mention] })).toMatch(/names no mention/);
    expect(mentionedIndexes('{@1} and {@0} and {@1}')).toEqual([1, 0]);
    expect(COMMENT_CAPS.replies).toBe(100);
  });

  it('refuse a bidi override in a label and an emoji outside the palette', () => {
    expect(commentAuthorSchema.safeParse(author).success).toBe(true);
    expect(commentAuthorSchema.safeParse({ ...author, label: 'Maya‮ayaM' }).success).toBe(false);
    expect(commentAuthorSchema.safeParse({ ...author, label: 'M'.repeat(41) }).success).toBe(false);
    expect(reactionSchema.safeParse({ emoji: '👍', principalIds: [MAYA] }).success).toBe(true);
    expect(reactionSchema.safeParse({ emoji: '🦄', principalIds: [MAYA] }).success).toBe(false);
    expect(EMOJI_PALETTE).toHaveLength(24);
    expect(new Set(EMOJI_PALETTE).size).toBe(24);
    expect(
      commentSchema.safeParse({
        id: ULID,
        author,
        createdAt: NOW,
        body: { text: 'x', mentions: [] },
        reactions: [{ emoji: 'thumbs up', principalIds: [] }],
      }).success,
    ).toBe(false);
    expect(threadSchema.safeParse(thread(TEXT_ANCHOR, { id: 'not-a-ulid' })).success).toBe(false);
  });

  it('parse the stream entries of 5.2', () => {
    expect(commentOpSchema.safeParse({ op: 'add', thread: thread(TEXT_ANCHOR) }).success).toBe(
      true,
    );
    expect(
      commentOpSchema.safeParse({ op: 'resolve', threadId: ULID, at: NOW, by: MAYA }).success,
    ).toBe(true);
    expect(
      commentOpSchema.safeParse({
        op: 'react',
        threadId: ULID,
        commentId: ULID,
        emoji: '🔥',
        principalId: MAYA,
      }).success,
    ).toBe(true);
    expect(
      commentOpSchema.safeParse({ op: 'shift', threadId: ULID, anchor: TEXT_ANCHOR }).success,
    ).toBe(true);
    expect(commentOpSchema.safeParse({ op: 'purge', threadId: ULID }).success).toBe(false);
  });
});

describe('resolveAnchor (08 1.2)', () => {
  it('resolves the six kinds on the worked deck', () => {
    const document = base();
    expect(resolveAnchor(document, { kind: 'deck' })).toEqual({
      orphaned: false,
      anchor: { kind: 'deck' },
    });
    expect(resolveAnchor(document, { kind: 'slide', slideId: 'thesis' })).toMatchObject({
      orphaned: false,
      slideId: 'thesis',
    });
    expect(
      resolveAnchor(document, { kind: 'notes', slideId: 'opener-prototemplate' }),
    ).toMatchObject({
      orphaned: false,
      slideId: 'opener-prototemplate',
    });
    expect(
      resolveAnchor(document, { kind: 'block', slideId: 'content-rule', blockId: 'list' }),
    ).toMatchObject({ orphaned: false, blockId: 'list', pointer: '/slots/right' });
    expect(
      resolveAnchor(document, { kind: 'block', slideId: 'opener-prototemplate', blockId: 'big' }),
    ).toMatchObject({ orphaned: false, pointer: '/plate/blocks' });
    expect(resolveAnchor(document, TEXT_ANCHOR)).toMatchObject({ orphaned: false, text: 'post' });
    expect(
      resolveAnchor(document, {
        kind: 'text',
        slideId: 'content-rule',
        blockId: 'list',
        path: '/items/3/text',
        range: [4, 6],
        quoted: 'GT',
      }),
    ).toMatchObject({ orphaned: false, text: 'GT' });
  });

  it('orphans a removed block, a removed slide, a missing path and a collapsed range, keeping the quote', () => {
    const document = base();
    const noBlock = applyMutations(document, [
      { op: 'block.remove', slideId: 'content-rule', blockId: 'p1' },
    ]).document;
    expect(resolveAnchor(noBlock, TEXT_ANCHOR)).toEqual({
      orphaned: true,
      reason: 'block removed',
      anchor: TEXT_ANCHOR,
      slideId: 'content-rule',
    });
    const noSlide = applyMutations(document, [
      { op: 'slide.remove', slideId: 'content-rule' },
    ]).document;
    expect(resolveAnchor(noSlide, TEXT_ANCHOR)).toMatchObject({
      orphaned: true,
      reason: 'slide removed',
    });
    expect(resolveAnchor(document, { ...TEXT_ANCHOR, path: '/caption' })).toMatchObject({
      orphaned: true,
      reason: 'path missing',
    });
    expect(resolveAnchor(document, { ...TEXT_ANCHOR, range: [6, 6] })).toMatchObject({
      orphaned: true,
      reason: 'text removed',
    });
    expect(resolveAnchor(document, { ...TEXT_ANCHOR, range: [900, 910] })).toMatchObject({
      orphaned: true,
      reason: 'range outside',
    });
    // a range past the end is clamped to the Text
    expect(resolveAnchor(document, { ...TEXT_ANCHOR, range: [100, 900] })).toMatchObject({
      orphaned: false,
      text: 't is excluded.',
    });
  });

  it('revives on an undo and a version.restore, and follows slide.replace by id', () => {
    const v1 = base();
    const removed = applyWrite(
      v1,
      {
        baseRevision: 412,
        author: { kind: 'human', name: 'Maya' },
        mutations: [{ op: 'block.remove', slideId: 'content-rule', blockId: 'p1' }],
      },
      { now: NOW },
    );
    if (!removed.ok) throw new Error(removed.message);
    expect(resolveAnchor(removed.document, TEXT_ANCHOR).orphaned).toBe(true);
    const undone = applyMutations(removed.document, removed.inverse).document;
    expect(resolveAnchor(undone, TEXT_ANCHOR)).toMatchObject({ orphaned: false, text: 'post' });
    const restored = applyWrite(
      removed.document,
      {
        baseRevision: 413,
        author: { kind: 'human', name: 'Maya' },
        mutations: [{ op: 'version.restore', n: 1 }],
      },
      { now: NOW, resolveVersion: (n) => (n === 1 ? v1 : undefined) },
    );
    if (!restored.ok) throw new Error(restored.message);
    expect(resolveAnchor(restored.document, TEXT_ANCHOR)).toMatchObject({
      orphaned: false,
      text: 'post',
    });
    // slide.replace keeps the threads whose ids survive and orphans the rest
    const slide = v1.slides['content-rule'];
    if (slide?.kind !== 'content') throw new Error('fixture');
    const replaced = applyMutations(v1, [
      {
        op: 'slide.replace',
        slideId: 'content-rule',
        slide: {
          ...slide,
          slots: { left: slide.slots.left ?? [], right: [] },
        },
      },
    ]).document;
    expect(resolveAnchor(replaced, TEXT_ANCHOR).orphaned).toBe(false);
    expect(
      resolveAnchor(replaced, { kind: 'block', slideId: 'content-rule', blockId: 'list' }),
    ).toMatchObject({ orphaned: true, reason: 'block removed' });
  });

  it('resolves a covered table cell to its span anchor and orphans a cell off the grid', () => {
    const document = base();
    const table: Block = {
      id: 't',
      type: 'table',
      columns: [{}, {}, {}],
      rows: [{ cells: ['a', 'b', 'c'] }, { cells: ['d', 'e', 'f'] }],
      spans: [{ row: 0, column: 1, rows: 2, columns: 2 }],
    };
    const withTable = applyMutations(document, [
      { op: 'block.insert', slideId: 'content-rule', slot: 'left', block: table },
    ]).document;
    const cell = (at: [number, number]): CommentAnchor => ({
      kind: 'cell',
      slideId: 'content-rule',
      blockId: 't',
      cell: at,
    });
    expect(resolveAnchor(withTable, cell([1, 2]))).toMatchObject({ orphaned: false, cell: [0, 1] });
    expect(resolveAnchor(withTable, cell([1, 0]))).toMatchObject({ orphaned: false, cell: [1, 0] });
    expect(resolveAnchor(withTable, cell([2, 0]))).toMatchObject({
      orphaned: true,
      reason: 'cell missing',
    });
    expect(
      resolveAnchor(withTable, {
        kind: 'cell',
        slideId: 'content-rule',
        blockId: 'p1',
        cell: [0, 0],
      }),
    ).toMatchObject({ orphaned: true, reason: 'cell missing' });
  });
});

describe('shiftAnchors (08 1.2, SPEC-3 0.52)', () => {
  const splice = (at: number, remove: number, insert: string): Mutation => ({
    op: 'text.splice',
    slideId: 'content-rule',
    blockId: 'p1',
    path: '/text',
    at,
    remove,
    insert,
  });
  const only = [thread(TEXT_ANCHOR)];

  it('moves a text anchor through the splice rules and emits one shift per changed anchor', () => {
    const cases: [Mutation, [number, number]][] = [
      [splice(0, 0, 'Now '), [10, 14]],
      [splice(8, 0, 'xx'), [6, 12]],
      [splice(0, 3, ''), [3, 7]],
      [splice(4, 4, ''), [4, 6]],
      [splice(8, 4, ''), [6, 8]],
      [splice(5, 6, ''), [5, 5]],
    ];
    for (const [mutation, range] of cases) {
      const { threads, shifts } = shiftAnchors(only, [mutation]);
      expect(threads[0]?.anchor, JSON.stringify(mutation)).toEqual({ ...TEXT_ANCHOR, range });
      expect(shifts).toEqual([{ threadId: ULID, anchor: { ...TEXT_ANCHOR, range } }]);
      expect(threads[0]?.anchor.kind === 'text' && threads[0].anchor.quoted).toBe('post');
    }
    // the collapsed anchor reads as text removed while the quote stays
    const collapsed = shiftAnchors(only, [splice(5, 6, '')]).threads[0];
    if (collapsed === undefined) throw new Error('fixture');
    const after = applyMutations(base(), [splice(5, 6, '')]).document;
    expect(resolveAnchor(after, collapsed.anchor)).toMatchObject({
      orphaned: true,
      reason: 'text removed',
    });
  });

  it('leaves other anchors, other Texts and marks alone', () => {
    const others = [
      thread({ kind: 'block', slideId: 'content-rule', blockId: 'p1' }),
      thread({ ...TEXT_ANCHOR, blockId: 'h' }, { id: ULID2 }),
    ];
    const { threads, shifts } = shiftAnchors(others, [
      splice(0, 0, 'Now '),
      {
        op: 'text.mark',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        range: [0, 5],
        edit: { kind: 'case', mode: 'upper' },
      },
    ]);
    expect(threads).toEqual(others);
    expect(shifts).toEqual([]);
  });

  it('keeps every anchor on its quoted text under 2,000 random splices around it (the transform property, SPEC-3 16.6)', () => {
    // a text anchor is a mark range without marks (08 1.2): a splice that does not touch the
    // range leaves the quoted characters under the shifted anchor; one that removes part of it
    // trims the quote; one that covers it collapses the range and resolveAnchor reports the text
    // as removed while `quoted` stays for the panel
    let seed = 20260913;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const document = base();
    const text = textOfP1(document);
    const plain = plainOf(text);
    let untouched = 0;
    let trimmed = 0;
    let removed = 0;
    for (let i = 0; i < 2_000; i += 1) {
      const start = Math.floor(random() * (plain.length - 4));
      const end = start + 1 + Math.floor(random() * Math.min(12, plain.length - start - 1));
      const anchor: CommentAnchor = {
        kind: 'text',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        range: [start, end],
        quoted: plain.slice(start, end),
      };
      const at = Math.floor(random() * (plain.length + 1));
      const remove = random() < 0.4 ? 0 : Math.min(plain.length - at, Math.floor(random() * 18));
      const insert = random() < 0.3 ? '' : 'xy'.slice(0, 1 + Math.floor(random() * 2));
      const mutation: Mutation = {
        op: 'text.splice',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        at,
        remove,
        insert,
      };
      const after = applyMutations(document, [mutation]).document;
      const shifted = shiftAnchors([thread(anchor)], [mutation], { before: document, after });
      const moved = shifted.threads[0];
      if (moved === undefined || moved.anchor.kind !== 'text') throw new Error('anchor');
      const placed = resolveAnchor(after, moved.anchor);
      const overlaps = at < end && at + remove > start;
      const covers = at <= start && at + remove >= end && remove > 0;
      if (covers) {
        removed += 1;
        // a collapsed range reads as text removed, or as range outside at the very end of the Text
        expect(placed.orphaned, `pair ${i} covers`).toBe(true);
        expect(moved.anchor.range[0]).toBe(moved.anchor.range[1]);
        expect(moved.anchor.quoted).toBe(anchor.quoted);
        continue;
      }
      if (!placed.orphaned) {
        const now = placed.text ?? '';
        if (overlaps) {
          trimmed += 1;
          // the surviving characters of the quote, in order, plus anything the splice inserted inside
          const kept = anchor.quoted
            .split('')
            .filter((_ch, index) => start + index < at || start + index >= at + remove)
            .join('');
          const inside = at > start && at < end ? insert : '';
          expect(now.replace(inside, ''), `pair ${i} trims`).toBe(kept);
        } else {
          untouched += 1;
          // an insertion strictly inside grows the range by the inserted text; elsewhere the quote is intact
          const inside = at > start && at < end && insert !== '' ? insert : '';
          expect(now.length, `pair ${i} untouched`).toBe(anchor.quoted.length + inside.length);
          expect(now.replace(inside, ''), `pair ${i} untouched`).toBe(anchor.quoted);
        }
      }
    }
    expect(untouched).toBeGreaterThan(1_000);
    expect(trimmed).toBeGreaterThan(50);
    expect(removed).toBeGreaterThan(5);
  });

  it('re-places an anchor by its quoted text after a whole Text rewrite, or collapses it', () => {
    const before = base();
    const rewrite: Mutation = {
      op: 'block.set',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      value: 'A new post states what was built.',
    };
    const after = applyMutations(before, [rewrite]).document;
    const placed = shiftAnchors(only, [rewrite], { before, after });
    expect(placed.threads[0]?.anchor).toEqual({ ...TEXT_ANCHOR, range: [6, 10] });
    const twice: Mutation = { ...rewrite, value: 'post and post' };
    const ambiguous = shiftAnchors(only, [twice], {
      before,
      after: applyMutations(before, [twice]).document,
    });
    expect(ambiguous.threads[0]?.anchor).toEqual({ ...TEXT_ANCHOR, range: [6, 6] });
    const gone: Mutation = { ...rewrite, value: 'Nothing here.' };
    const lost = shiftAnchors(only, [gone], {
      before,
      after: applyMutations(before, [gone]).document,
    });
    expect(lost.threads[0]?.anchor).toEqual({ ...TEXT_ANCHOR, range: [6, 6] });
    expect(lost.shifts).toHaveLength(1);
    // the quoted text a new thread stores comes from the document, capped at 200 code points
    expect(
      quotedTextOf(before, {
        kind: 'text',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        range: [6, 10],
      }),
    ).toBe('post');
  });
});
