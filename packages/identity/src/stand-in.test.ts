import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { CommentOp, Thread } from '@turboslide/schema/comments';

import { isPrincipalId } from './ids.ts';
import {
  commentOpWithStandIns,
  hmacSha256,
  isStandIn,
  standInKey,
  standInOf,
  standInsWith,
  threadWithStandIns,
} from './stand-in.ts';

// The one definition of a stand-in (hardening HR-SD#1; the fix round after verifier pass 2, F2):
// the studio and the realtime Worker's deck room must make the same stand-in for one person on one
// deck, so the HMAC is pinned against node's, and every principal id a comment carries is mapped.

const here = dirname(fileURLToPath(import.meta.url));
const encoder = new TextEncoder();
const OWNER = 'usr_owner01';
const EDITOR = 'anon_11111111-1111-4111-8111-111111111111';
const READER = 'anon_22222222-2222-4222-8222-222222222222';
const AGENT = 'agent:tok_1';
const DECK = 'q4-review';
const AT = '2026-10-10T00:00:00.000Z';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Every principal id a value carries, read from its JSON text. */
function principalIdsIn(value: unknown): string[] {
  const text = JSON.stringify(value);
  return [...text.matchAll(/(?:anon_|usr_|agent:)[A-Za-z0-9_-]+/g)].map((match) => match[0]);
}

describe('the stand-in (@turboslide/identity/stand-in)', () => {
  it('computes the HMAC-SHA256 node computes, for a short, a block long and a long key', () => {
    for (const key of ['key', 'k'.repeat(64), 'a long key '.repeat(20)]) {
      for (const message of ['', 'The quick brown fox', 'stand-in\nq4-review\nusr_x'.repeat(9)]) {
        expect(hex(hmacSha256(encoder.encode(key), encoder.encode(message)))).toBe(
          createHmac('sha256', key).update(message).digest('hex'),
        );
      }
    }
  });

  it('is stable for one person on one deck, differs between decks, people and secrets, and is no principal id', () => {
    const key = standInKey('a-room-secret-for-tests-only-0123456789');
    const a = standInOf(key, DECK, OWNER);
    expect(a).toBe(standInOf(standInKey('a-room-secret-for-tests-only-0123456789'), DECK, OWNER));
    expect(a).not.toBe(standInOf(key, 'other-deck', OWNER));
    expect(a).not.toBe(standInOf(key, DECK, EDITOR));
    expect(a).not.toBe(standInOf(standInKey('another-secret-for-tests-only-012345'), DECK, OWNER));
    expect(a).toMatch(/^ref_[A-Za-z0-9_-]{22}$/);
    expect(isStandIn(a)).toBe(true);
    expect(isPrincipalId(a)).toBe(false);
    // the same key from the secret's bytes
    expect(standInOf(standInKey(encoder.encode('s3cret-bytes')), DECK, OWNER)).toBe(
      standInOf(standInKey('s3cret-bytes'), DECK, OWNER),
    );
  });

  it('passes the own ids and every string that is no principal id', () => {
    const key = standInKey('secret');
    const people = standInsWith((id) => standInOf(key, DECK, id), [READER, null, undefined, '']);
    expect(people(READER)).toBe(READER);
    expect(people(OWNER)).toBe(standInOf(key, DECK, OWNER));
    expect(people(AGENT)).toBe(standInOf(key, DECK, AGENT));
    for (const word of ['seed', 'legacy', 'local:studio', people(OWNER)])
      expect(people(word)).toBe(word);
  });

  it('maps every principal id of a thread and of each comment op', () => {
    const key = standInKey('secret');
    const people = standInsWith((id) => standInOf(key, DECK, id), [READER]);
    const thread: Thread & { placement: { slideId: string } } = {
      id: '01m3shbftjv64ww028yyhs386t',
      deckId: DECK,
      anchor: { kind: 'slide', slideId: 'title' },
      comment: {
        id: '01m3shbftjv64ww028yyhs386t',
        author: { principalId: OWNER, label: 'Olive', kind: 'human' },
        createdAt: AT,
        body: {
          text: 'For {@0} and {@1}',
          mentions: [
            { kind: 'principal', principalId: EDITOR },
            { kind: 'invite', inviteId: 'inv_1' },
          ],
        },
        reactions: [{ emoji: '👍', principalIds: [EDITOR, READER] }],
        deleted: { at: AT, by: OWNER },
      },
      replies: [
        {
          id: '01m3shbftjv64ww028yyhs386v',
          author: { principalId: AGENT, label: 'Agent', kind: 'agent' },
          createdAt: AT,
          body: { text: 'done', mentions: [] },
        },
      ],
      resolved: { at: AT, by: EDITOR },
      assignee: {
        to: { kind: 'principal', principalId: EDITOR },
        by: OWNER,
        at: AT,
        done: { at: AT, by: EDITOR },
      },
      createdAt: AT,
      updatedAt: AT,
      revision: 3,
      placement: { slideId: 'title' },
    };
    const mapped = threadWithStandIns(thread, people);
    expect(principalIdsIn(mapped)).toEqual([READER]);
    expect(mapped.placement).toEqual({ slideId: 'title' });
    expect(mapped.comment.author).toEqual({
      principalId: standInOf(key, DECK, OWNER),
      label: 'Olive',
      kind: 'human',
    });
    expect(mapped.comment.body.mentions[1]).toEqual({ kind: 'invite', inviteId: 'inv_1' });
    expect(mapped.comment.reactions?.[0]?.principalIds).toEqual([
      standInOf(key, DECK, EDITOR),
      READER,
    ]);

    const ops: CommentOp[] = [
      { op: 'add', thread },
      { op: 'reply', threadId: thread.id, comment: thread.comment },
      {
        op: 'edit',
        threadId: thread.id,
        commentId: thread.id,
        body: thread.comment.body,
        editedAt: AT,
        by: OWNER,
      },
      { op: 'delete', threadId: thread.id, commentId: thread.id, at: AT, by: OWNER },
      { op: 'resolve', threadId: thread.id, at: AT, by: OWNER },
      { op: 'reopen', threadId: thread.id, at: AT, by: OWNER },
      { op: 'assign', threadId: thread.id, to: thread.assignee!.to, at: AT, by: OWNER },
      { op: 'assign', threadId: thread.id, to: null, at: AT, by: OWNER },
      { op: 'reassign', threadId: thread.id, to: thread.assignee!.to, at: AT, by: OWNER },
      { op: 'done', threadId: thread.id, at: AT, by: OWNER },
      { op: 'react', threadId: thread.id, commentId: thread.id, emoji: '👍', principalId: OWNER },
      { op: 'unreact', threadId: thread.id, commentId: thread.id, emoji: '👍', principalId: OWNER },
      { op: 'move', threadId: thread.id, anchor: thread.anchor, at: AT, by: OWNER },
      { op: 'shift', threadId: thread.id, anchor: thread.anchor },
    ];
    for (const op of ops) {
      const seen = commentOpWithStandIns(op, people);
      expect(
        principalIdsIn(seen).filter((id) => id !== READER),
        op.op,
      ).toEqual([]);
      expect(seen.op).toBe(op.op);
    }
  });

  it('imports no node: module, so the Worker and the browser can load it', () => {
    const source = readFileSync(join(here, 'stand-in.ts'), 'utf8');
    const imports = source.split('\n').filter((line) => /^import\b/.test(line));
    expect(imports.filter((line) => /from 'node:/.test(line))).toEqual([]);
  });
});
