// Idempotency-Key on the agent surface (RELIABILITY-21, hardening HR-O#6), over a FileStore that
// keeps the origin contract as the tmp backend opens it: each write of a keyed request carries its
// own op id, a resend of the request is answered by the store with the records the first attempt
// made, the route's look up finds the first record, and another caller's same key is its own write.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { idempotentOpId } from '@turboslide/agent/http/dispatch';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { openFileStore, slidePath } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import { keyedStore, replayedRecord, replayedResponse } from './idempotency';

const agent: Author = { kind: 'agent', name: 'agent', runId: 'o6', principalId: 'agent:tok_a' };
const size = (value: number): Mutation => ({
  op: 'block.set',
  slideId: 'content-rule',
  blockId: 'list',
  path: '/size',
  value,
});

describe('a keyed agent request', () => {
  let root: string;
  let store: FileStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-idem-'));
    const dir = join(root, 'decks', 'gt-brand');
    mkdirSync(join(dir, 'slides'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(slidePath(dir, slide.id), canonicalJson(slide));
    store = openFileStore({ dir, origins: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** One attempt of an action that writes twice, as slide.toCanvas does. */
  const attempt = async (caller: string, key: string) => {
    const keyed = keyedStore(store, { caller, key });
    const first = await keyed.write({ baseRevision: 412, author: agent, mutations: [size(22)] });
    const second = await keyed.write({ baseRevision: 413, author: agent, mutations: [size(24)] });
    return { first, second };
  };

  it('gives each write of the request its own op id, under the room client id of its author', async () => {
    const { first, second } = await attempt('tok_a', 'k-1');
    expect(first.ok && first.entry.origin).toEqual({
      clientId: 'agent:agent:tok_a',
      opIds: [idempotentOpId('tok_a', 'k-1', 1)],
    });
    expect(second.ok && second.entry.origin?.opIds).toEqual([idempotentOpId('tok_a', 'k-1', 2)]);
  });

  it('answers a resend with the records the first attempt made and writes nothing', async () => {
    await attempt('tok_a', 'k-1');
    const again = await attempt('tok_a', 'k-1');
    expect(again.first.ok && again.first.replayed?.n).toBe(1);
    expect(again.second.ok && again.second.replayed?.n).toBe(2);
    expect((await store.records()).length).toBe(2);
    expect(await store.revision()).toBe(414);
    const found = await replayedRecord(store, { caller: 'tok_a', key: 'k-1' });
    expect(found?.n).toBe(1);
    const response = replayedResponse('block.set', found ?? (await store.records())[0]!);
    expect(response.status).toBe(200);
    expect(response.headers.get('idempotent-replayed')).toBe('true');
    expect(await response.json()).toMatchObject({
      replayed: true,
      revision: 413,
      record: { n: 1 },
    });
  });

  it('finds nothing for a key no write carried, and takes another caller’s key as a new write', async () => {
    await attempt('tok_a', 'k-1');
    expect(await replayedRecord(store, { caller: 'tok_a', key: 'k-2' })).toBeUndefined();
    expect(await replayedRecord(store, { caller: 'tok_b', key: 'k-1' })).toBeUndefined();
    const keyed = keyedStore(store, { caller: 'tok_b', key: 'k-1' });
    const other = await keyed.write({ baseRevision: 414, author: agent, mutations: [size(22)] });
    expect(other.ok && other.replayed).toBeUndefined();
    expect(other.ok && other.revision).toBe(415);
  });
});
