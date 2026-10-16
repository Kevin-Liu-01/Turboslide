// The wave 3b verify's finding 6, on the memory tier of a node server: a process that starts on a
// deck whose records cover the stream up to a seq (the ops ranges the process before it wrote)
// opens the deck's room with the memory stream's head at that seq, so the first entry it appends
// numbers above it and reaches the live document. Before, the head started at 0: a fresh tab's
// typing after a restart took seqs 1 to 3 under a covered 3, the live document never applied it
// and no checkpoint committed it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author } from '@turboslide/schema/mutations';
import { openFileStore, slidePath } from '@turboslide/store/file-store';

const env = ['TURBOSLIDE_ROOT', 'TURBOSLIDE_STORE', 'TURBOSLIDE_REALTIME'] as const;
const before = Object.fromEntries(env.map((name) => [name, process.env[name]]));
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-memory-restart-'));
  mkdirSync(join(root, 'decks'), { recursive: true });
  process.env.TURBOSLIDE_ROOT = root;
  process.env.TURBOSLIDE_STORE = 'file';
  process.env.TURBOSLIDE_REALTIME = 'memory';
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  for (const name of env) {
    const value = before[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const human: Author = { kind: 'human', name: 'A', principalId: 'anon_a' };

describe('a memory room opened after a restart (the wave 3b verify, finding 6)', () => {
  it('numbers the first entry above the seq the records cover, and the live document applies it', async () => {
    const deckId = 'gt-brand';
    const dir = join(root, 'decks', deckId);
    mkdirSync(join(dir, 'slides'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(slidePath(dir, slide.id), canonicalJson(slide));
    // the process before this one checkpointed the stream's seqs 1 to 3 into one record
    const previous = await openFileStore({ dir }).write(
      {
        baseRevision: 412,
        author: human,
        mutations: [
          {
            op: 'block.set',
            slideId: 'content-rule',
            blockId: 'p1',
            path: '/text',
            value: 'Before.',
          },
        ],
      },
      { ops: { fromSeq: 1, toSeq: 3 } },
    );
    expect(previous.ok).toBe(true);

    const { roomFor } = await import('./room');
    const room = await roomFor(deckId);
    expect(room.tier).toBe('memory');
    const live = await room.live();
    expect(live.seq).toBe(3);
    expect(await room.channel.head(deckId)).toBe(3);

    // a fresh tab's first entry, at the base the stream's hello gave it
    const appended = await room.channel.append(deckId, live.seq, [
      {
        rev: 413,
        kind: 'edit',
        author: human,
        clientId: 'c'.repeat(32),
        opId: `${'c'.repeat(32)}:1`,
        mutations: [
          {
            op: 'text.splice',
            slideId: 'content-rule',
            blockId: 'p1',
            path: '/text',
            at: 7,
            remove: 0,
            insert: ' After.',
          },
        ],
        at: new Date().toISOString(),
      },
    ]);
    expect(appended.ok && appended.entries.map((entry) => entry.seq)).toEqual([4]);
    const after = await room.live();
    expect(after.seq).toBe(4);
    const p1 = (
      after.document.slides['content-rule'] as unknown as {
        slots: { left: { id: string; text?: string }[] };
      }
    ).slots.left.find((block) => block.id === 'p1');
    expect(p1?.text).toBe('Before. After.');
    await room.close();
  });
});
