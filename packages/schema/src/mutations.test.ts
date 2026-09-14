// The mutation language after round three (gslides-parity SPEC-3 3.1, 0.4, 0.17): seventeen ops,
// the two text ops with their schemas, `text.replace` unchanged, and `Author.principalId`.
import { describe, expect, it } from 'vitest';
import {
  MUTATION_OPS,
  TEXT_OPS,
  authorSchema,
  mutationSchema,
  parseAuthor,
  versionSchema,
} from './mutations.ts';

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
