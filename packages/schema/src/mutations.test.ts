// The mutation language after round three (gslides-parity SPEC-3 3.1, 0.4, 0.17): seventeen ops,
// the two text ops with their schemas, `text.replace` unchanged, and `Author.principalId`.
import { describe, expect, it } from 'vitest';
import {
  MUTATION_OPS,
  SLIDE_FIELD_IDS,
  TEXT_OPS,
  authorSchema,
  isSlideFieldPath,
  mutationSchema,
  parseAuthor,
  slideFieldOf,
  slideFieldPath,
  versionSchema,
  writeOriginSchema,
  writeSchema,
} from './mutations.ts';

describe('the slide field targets of the text ops (the sync round, docs/SYNC.md 3.4)', () => {
  it('names heading and lead on a title slide and big on a statement, and nothing on any other slide', () => {
    expect(SLIDE_FIELD_IDS).toEqual(['heading', 'lead', 'big']);
    expect(slideFieldOf({ kind: 'title' }, 'heading')).toBe('heading');
    expect(slideFieldOf({ kind: 'title' }, 'lead')).toBe('lead');
    expect(slideFieldOf({ kind: 'title' }, 'big')).toBeNull();
    expect(slideFieldOf({ kind: 'statement' }, 'big')).toBe('big');
    expect(slideFieldOf({ kind: 'statement' }, 'heading')).toBeNull();
    // a content slide's block whose id reads heading is a block
    expect(slideFieldOf({ kind: 'content' }, 'heading')).toBeNull();
    expect(slideFieldOf({ kind: 'opener' }, 'lead')).toBeNull();
  });

  it('spells the field pointer as the field name, and recognizes it', () => {
    expect(slideFieldPath('heading')).toBe('/heading');
    expect(slideFieldPath('big')).toBe('/big');
    expect(isSlideFieldPath('/heading')).toBe(true);
    expect(isSlideFieldPath('/lead')).toBe(true);
    expect(isSlideFieldPath('/big')).toBe(true);
    expect(isSlideFieldPath('/text')).toBe(false);
    expect(isSlideFieldPath('/notes')).toBe(false);
    expect(isSlideFieldPath('heading')).toBe(false);
    expect(isSlideFieldPath('')).toBe(false);
  });

  it('parses a splice and a mark addressed at a field the way it parses one addressed at a block', () => {
    const field = { slideId: 'title', blockId: 'heading', path: '/heading' };
    expect(
      mutationSchema.safeParse({ op: 'text.splice', ...field, at: 0, remove: 0, insert: 'A' })
        .success,
    ).toBe(true);
    expect(
      mutationSchema.safeParse({
        op: 'text.mark',
        ...field,
        range: [0, 3],
        edit: { kind: 'case', mode: 'upper' },
      }).success,
    ).toBe(true);
    expect(
      mutationSchema.safeParse({ op: 'text.replace', ...field, range: [0, 0], text: 'A' }).success,
    ).toBe(true);
  });
});

describe('Write.origin (the sync round, docs/SYNC.md 3.2)', () => {
  it('is a client id with at least one op id, and stays out of the write schema an agent posts', () => {
    expect(
      writeOriginSchema.safeParse({ clientId: 'a'.repeat(32), opIds: [`${'a'.repeat(32)}:1`] })
        .success,
    ).toBe(true);
    expect(writeOriginSchema.safeParse({ clientId: 'a'.repeat(32), opIds: [] }).success).toBe(
      false,
    );
    expect(writeOriginSchema.safeParse({ clientId: '', opIds: ['x'] }).success).toBe(false);
    expect(writeOriginSchema.safeParse({ clientId: 'a', opIds: ['x'], extra: 1 }).success).toBe(
      false,
    );
    const write = {
      baseRevision: 3,
      author: { kind: 'human', name: 'Kevin' },
      mutations: [{ op: 'deck.set', path: '/title', value: 'x' }],
    };
    expect(writeSchema.safeParse(write).success).toBe(true);
    // the room's channel attaches the origin in process; the HTTP write surface never takes one
    expect(
      writeSchema.safeParse({ ...write, origin: { clientId: 'a', opIds: ['a:1'] } }).success,
    ).toBe(false);
  });
});

describe('MUTATION_OPS', () => {
  it('holds seventeen ops with the two text ops after text.replace (SPEC-3 3.1)', () => {
    expect(MUTATION_OPS).toHaveLength(17);
    expect(MUTATION_OPS.indexOf('text.splice')).toBe(MUTATION_OPS.indexOf('text.replace') + 1);
    expect(MUTATION_OPS.indexOf('text.mark')).toBe(MUTATION_OPS.indexOf('text.replace') + 2);
    expect(TEXT_OPS).toEqual(['text.splice', 'text.mark']);
  });
});

describe('the text op schemas', () => {
  const address = { slideId: 'content-rule', blockId: 'p1', path: '/text' };

  it('parse a splice and refuse a carriage return, a negative offset and an unknown field', () => {
    expect(
      mutationSchema.safeParse({ op: 'text.splice', ...address, at: 3, remove: 0, insert: 'x' })
        .success,
    ).toBe(true);
    expect(
      mutationSchema.safeParse({ op: 'text.splice', ...address, at: 3, remove: 2, insert: '\n' })
        .success,
    ).toBe(true);
    expect(
      mutationSchema.safeParse({ op: 'text.splice', ...address, at: 3, remove: 0, insert: 'a\rb' })
        .success,
    ).toBe(false);
    expect(
      mutationSchema.safeParse({ op: 'text.splice', ...address, at: -1, remove: 0, insert: 'x' })
        .success,
    ).toBe(false);
    expect(
      mutationSchema.safeParse({
        op: 'text.splice',
        ...address,
        at: 0,
        remove: 0,
        insert: 'x',
        range: [0, 1],
      }).success,
    ).toBe(false);
  });

  it('parse a mark with flags, a clear list or a case mode and refuse anything else', () => {
    expect(
      mutationSchema.safeParse({
        op: 'text.mark',
        ...address,
        range: [0, 5],
        edit: { kind: 'marks', set: { i: true, link: 'https://x.y' }, clear: ['color'] },
      }).success,
    ).toBe(true);
    expect(
      mutationSchema.safeParse({
        op: 'text.mark',
        ...address,
        range: [0, 5],
        edit: { kind: 'case', mode: 'title' },
      }).success,
    ).toBe(true);
    expect(
      mutationSchema.safeParse({
        op: 'text.mark',
        ...address,
        range: [0, 5],
        edit: { kind: 'marks', clear: ['bold'] },
      }).success,
    ).toBe(false);
    expect(
      mutationSchema.safeParse({
        op: 'text.mark',
        ...address,
        range: [0, 5],
        edit: { kind: 'case', mode: 'shout' },
      }).success,
    ).toBe(false);
  });

  it('keeps text.replace as it was: markup offsets and a Text', () => {
    expect(
      mutationSchema.safeParse({ op: 'text.replace', ...address, range: [0, 4], text: '*x*' })
        .success,
    ).toBe(true);
  });
});

describe('Author.principalId (SPEC-3 0.17)', () => {
  it('is optional on authors and on stored versions, so old records parse as before', () => {
    expect(authorSchema.safeParse({ kind: 'human', name: 'Kevin' }).success).toBe(true);
    expect(
      authorSchema.safeParse({
        kind: 'human',
        name: 'Maya',
        principalId: 'anon_0f8fad5b-d9cb-469f-a165-70867728950e',
      }).success,
    ).toBe(true);
    expect(
      authorSchema.safeParse({
        kind: 'agent',
        name: 'reviewer',
        runId: 'r1',
        principalId: 'agent:tok_01J8Z2K',
      }).success,
    ).toBe(true);
    expect(authorSchema.safeParse({ kind: 'human', name: 'Kevin', principalId: '' }).success).toBe(
      false,
    );
    expect(
      versionSchema.safeParse({
        n: 1,
        revision: 3,
        author: { kind: 'human', name: 'studio' },
        note: '',
        createdAt: '2026-09-13T10:00:00.000Z',
        mutations: [],
      }).success,
    ).toBe(true);
    expect(parseAuthor('agent:r1')).toEqual({ kind: 'agent', name: 'agent', runId: 'r1' });
  });
});
