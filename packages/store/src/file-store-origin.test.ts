// The origin contract of DeckStore.write on the FileStore (hardening HR-O#6, RELIABILITY-21): with
// `origins`, a write whose op id a record above its base names is answered with that record and
// commits nothing, and a committed write's record stores its origin, as the Blob store does. The
// tmp backend opens its stores this way; without the option (the Blob store's own FileStore) the
// origin is not read and not stored.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';

import { openFileStore, slidePath } from './file-store.ts';
import { readVersions } from './versions.ts';

const agent: Author = { kind: 'agent', name: 'agent', runId: 'o6', principalId: 'agent:tok' };
const origin = { clientId: 'agent:agent:tok', opIds: ['idem-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'] };
const setSize = (value: number): Mutation => ({
  op: 'block.set',
  slideId: 'content-rule',
  blockId: 'list',
  path: '/size',
  value,
});

describe('FileStore origins', () => {
  let root: string;
  let dir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-o6-'));
    dir = join(root, 'decks', 'gt-brand');
    mkdirSync(join(dir, 'slides'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(slidePath(dir, slide.id), canonicalJson(slide));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const versions = (): number => readdirSync(join(dir, 'versions')).length;

  it('answers the resend of a committed write with its record and commits it once', async () => {
    const store = openFileStore({ dir, origins: true });
    const write = { baseRevision: 412, author: agent, mutations: [setSize(22)], origin };
    const first = await store.write(write);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.replayed).toBeUndefined();
    expect(first.entry.origin).toEqual(origin);
    const again = await store.write(write);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.replayed?.n).toBe(first.entry.n);
    expect(again.revision).toBe(413);
    expect(again.changed).toEqual([]);
    expect(versions()).toBe(1);
    expect(await store.revision()).toBe(413);
    // the record on disk names the origin, so another process's store answers the resend too
    expect(readVersions(dir)[0]?.origin).toEqual(origin);
    const other = await openFileStore({ dir, origins: true }).write(write);
    expect(other.ok && other.replayed?.n).toBe(1);
  });

  it('commits a write under another op id, and a write without one, as before', async () => {
    const store = openFileStore({ dir, origins: true });
    expect(
      (await store.write({ baseRevision: 412, author: agent, mutations: [setSize(22)], origin }))
        .ok,
    ).toBe(true);
    const next = await store.write({
      baseRevision: 413,
      author: agent,
      mutations: [setSize(24)],
      origin: { ...origin, opIds: ['idem-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'] },
    });
    expect(next.ok && next.revision).toBe(414);
    const plain = await store.write({ baseRevision: 414, author: agent, mutations: [setSize(22)] });
    expect(plain.ok && plain.revision).toBe(415);
    expect(versions()).toBe(3);
  });

  it('neither reads nor stores the origin without the option', async () => {
    const store = openFileStore({ dir });
    const write = { baseRevision: 412, author: agent, mutations: [setSize(22)], origin };
    const first = await store.write(write);
    expect(first.ok && first.entry.origin).toBeUndefined();
    const again = await store.write(write);
    expect(again.ok).toBe(false);
    expect(versions()).toBe(1);
  });
});
