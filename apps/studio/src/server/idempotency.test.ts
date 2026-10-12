// Idempotency-Key on the agent surface (RELIABILITY-21, hardening HR-O#6), over a FileStore that
// keeps the origin contract as the tmp backend opens it: each write of a keyed request carries its
// own op id, a resend of the request is answered by the store with the records the first attempt
// made, the route's look up finds the first record, and another caller's same key is its own write.
// The wave 3b verify's findings 3 and 4: the resend of slide.new, run over `replayStore`, answers
// the slide the first attempt made and writes nothing, and the same key with another body is told
// apart from a resend.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import { idempotencyFingerprint, idempotentOpId } from '@turboslide/agent/http/dispatch';
import { registerStoreActions } from '@turboslide/cli/store-actions';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { openFileStore, slidePath } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';
import type { DeckStore } from '@turboslide/store/store';

import type { Idempotency } from './idempotency';
import { keyedStore, replayStore, replayedRecord, replayedResponse } from './idempotency';

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

  const fingerprint = idempotencyFingerprint('block.set', { size: [22, 24] });
  const scope = (caller: string, key: string): Idempotency => ({ caller, key, fingerprint });

  /** One attempt of an action that writes twice, as slide.toCanvas does. */
  const attempt = async (caller: string, key: string) => {
    const keyed = keyedStore(store, scope(caller, key));
    const first = await keyed.write({ baseRevision: 412, author: agent, mutations: [size(22)] });
    const second = await keyed.write({ baseRevision: 413, author: agent, mutations: [size(24)] });
    return { first, second };
  };

  it('gives each write of the request its own op id, under the room client id of its author', async () => {
    const { first, second } = await attempt('tok_a', 'k-1');
    expect(first.ok && first.entry.origin).toEqual({
      clientId: 'agent:agent:tok_a',
      opIds: [idempotentOpId(scope('tok_a', 'k-1'), 1)],
    });
    expect(second.ok && second.entry.origin?.opIds).toEqual([
      idempotentOpId(scope('tok_a', 'k-1'), 2),
    ]);
  });

  it('answers a resend with the records the first attempt made and writes nothing', async () => {
    await attempt('tok_a', 'k-1');
    const again = await attempt('tok_a', 'k-1');
    expect(again.first.ok && again.first.replayed?.n).toBe(1);
    expect(again.second.ok && again.second.replayed?.n).toBe(2);
    expect((await store.records()).length).toBe(2);
    expect(await store.revision()).toBe(414);
    const found = await replayedRecord(store, scope('tok_a', 'k-1'));
    expect(found?.record.n).toBe(1);
    expect(found?.sameRequest).toBe(true);
    const response = replayedResponse('block.set', found?.record ?? (await store.records())[0]!);
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
    expect(await replayedRecord(store, scope('tok_a', 'k-2'))).toBeUndefined();
    expect(await replayedRecord(store, scope('tok_b', 'k-1'))).toBeUndefined();
    const keyed = keyedStore(store, scope('tok_b', 'k-1'));
    const other = await keyed.write({ baseRevision: 414, author: agent, mutations: [size(22)] });
    expect(other.ok && other.replayed).toBeUndefined();
    expect(other.ok && other.revision).toBe(415);
  });

  it('tells a resend from the same key sent with another action or body', async () => {
    await attempt('tok_a', 'k-1');
    const other = {
      ...scope('tok_a', 'k-1'),
      fingerprint: idempotencyFingerprint('block.set', {}),
    };
    const found = await replayedRecord(store, other);
    expect(found?.record.n).toBe(1);
    expect(found?.sameRequest).toBe(false);
  });

  it('answers the resend of slide.new with the slide the first attempt made, and writes nothing', async () => {
    const input = { layout: 'blank', baseRevision: 412 };
    const keyedScope: Idempotency = {
      caller: 'tok_a',
      key: 'k-new',
      fingerprint: idempotencyFingerprint('slide.new', input),
    };
    const run = async (over: DeckStore): Promise<unknown> => {
      const dispatcher = createDispatcher();
      registerStoreActions(dispatcher, {
        store: over,
        lint: { properNouns: [], tokens: [], iconNames: [] },
      });
      return dispatcher.dispatch('slide.new', input, { author: agent });
    };
    const first = (await run(keyedStore(store, keyedScope))) as {
      slide: { id: string };
      revision: number;
      outline: unknown;
    };
    expect(first.revision).toBe(413);
    const earlier = await replayedRecord(store, keyedScope);
    expect(earlier?.sameRequest).toBe(true);
    if (earlier === undefined) throw new Error('no first record');
    const again = await run(replayStore(store, keyedScope, earlier));
    expect(again).toEqual(first);
    expect(await store.revision()).toBe(413);
    expect((await store.records()).length).toBe(1);
    // a later write moves the deck on; the resend still answers the first attempt's answer
    await store.write({ baseRevision: 413, author: agent, mutations: [size(22)] });
    const later = await run(
      replayStore(store, keyedScope, (await replayedRecord(store, keyedScope))!),
    );
    expect(later).toEqual(first);
    expect(await store.revision()).toBe(414);
  });
});
