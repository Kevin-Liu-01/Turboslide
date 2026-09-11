// FileStore over a temp deck written the way the importer writes it (raw, not yet normalized):
// reads normalize, a write touches only the slide files it changed, a stale baseRevision returns
// the current document, an invalid write leaves the tree alone, versions record author and
// mutations, restore is a mutation with an exact inverse, history is rebuilt from inverses, and
// the lock keeps two writers apart.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import { WORKED_DECK, WORKED_SLIDES, workedDocument } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import { validateDocument } from '@turboslide/schema/validate';

import { openFileStore, slidePath } from './file-store.ts';
import type { FileStore } from './file-store.ts';
import { readVersions } from './versions.ts';

const agent: Author = { kind: 'agent', name: 'agent', runId: 'm2-test' };
const kevin: Author = { kind: 'human', name: 'kevin' };

/** The worked deck in its normalized form, the state a stored deck is always in. */
function normalized(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

/** Strips the fields a write always changes. */
function stable(document: DeckDocument): DeckDocument {
  return {
    deck: { ...document.deck, revision: 0, updatedAt: '' },
    slides: document.slides,
  };
}

function writeRawDeck(dir: string): void {
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES) writeFileSync(slidePath(dir, slide.id), canonicalJson(slide));
}

const setSize = (value: number): Mutation => ({
  op: 'block.set',
  slideId: 'content-rule',
  blockId: 'list',
  path: '/size',
  value,
});

describe('FileStore', () => {
  let root: string;
  let dir: string;
  let now: string;
  let store: FileStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-store-'));
    dir = join(root, 'decks', 'gt-brand');
    writeRawDeck(dir);
    now = '2026-09-10T20:00:00.000Z';
    store = openFileStore({ dir, now: () => now });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads the deck normalized without rewriting the files', async () => {
    const read = await store.read();
    expect(read.ok).toBe(true);
    expect(read.document.deck.revision).toBe(412);
    expect(stable(read.document)).toEqual(stable(normalized()));
    expect(readFileSync(slidePath(dir, 'content-rule'), 'utf8')).toBe(
      canonicalJson(WORKED_SLIDES.find((slide) => slide.id === 'content-rule')),
    );
    expect(store.id).toBe('gt-brand');
    expect(await store.revision()).toBe(412);
  });

  it('commits a write: only the touched slide file, deck.json and one version entry change', async () => {
    const before = Object.fromEntries(
      readdirSync(join(dir, 'slides')).map((f) => [
        f,
        readFileSync(join(dir, 'slides', f), 'utf8'),
      ]),
    );
    const outcome = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [setSize(22)],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.revision).toBe(413);
    expect(outcome.changed).toEqual(['content-rule']);
    expect(outcome.warnings).toEqual([]);
    const list = outcome.document.slides['content-rule'];
    expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({
      id: 'list',
      size: 22,
    });
    for (const [file, text] of Object.entries(before)) {
      const nowText = readFileSync(join(dir, 'slides', file), 'utf8');
      if (file === 'content-rule.json') expect(nowText).not.toBe(text);
      else expect(nowText, file).toBe(text);
    }
    const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
      revision: number;
      updatedAt: string;
    };
    expect(manifest).toMatchObject({ revision: 413, updatedAt: now });
    const versions = readVersions(dir);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      n: 1,
      revision: 413,
      baseRevision: 412,
      author: agent,
      note: '',
      createdAt: now,
      mutations: [setSize(22)],
    });
    expect(versions[0]?.inverse).toEqual([
      { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size' },
    ]);
    expect(existsSync(join(dir, 'versions', '1.json'))).toBe(true);
    // The rewritten slide is in its normalized form: the layout defaults are filled.
    const stored = JSON.parse(readFileSync(slidePath(dir, 'content-rule'), 'utf8')) as {
      layout: Record<string, unknown>;
    };
    expect(stored.layout).toEqual({ type: 'cols', ratio: '1/1', gap: 72, align: 'center' });
  });

  it('rejects a stale baseRevision with the current document and writes nothing', async () => {
    const first = await store.write({ baseRevision: 412, author: agent, mutations: [setSize(22)] });
    expect(first.ok).toBe(true);
    const stale = await store.write({ baseRevision: 412, author: kevin, mutations: [setSize(24)] });
    expect(stale.ok).toBe(false);
    if (stale.ok || stale.code !== 'conflict') throw new Error('expected a conflict');
    expect(stale.currentRevision).toBe(413);
    expect(stale.current.deck.revision).toBe(413);
    expect(stale.message).toMatch(/stale/);
    expect(readVersions(dir)).toHaveLength(1);
    expect(await store.revision()).toBe(413);
  });

  it('rejects an invalid write and leaves the tree untouched', async () => {
    const outcome = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'nope', path: '/size', value: 22 },
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.code !== 'invalid') throw new Error('expected invalid');
    expect(outcome.message).toContain('No block "nope"');
    expect(await store.revision()).toBe(412);
    expect(existsSync(join(dir, 'versions'))).toBe(false);
    const schemaViolation = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [setSize(23)],
    });
    expect(schemaViolation.ok).toBe(false);
    if (schemaViolation.ok || schemaViolation.code !== 'invalid')
      throw new Error('expected invalid');
    expect(schemaViolation.issues.some((issue) => issue.severity === 3)).toBe(true);
  });

  it('saves named versions and lists writes and saves in order', async () => {
    await store.write({ baseRevision: 412, author: agent, mutations: [setSize(22)] });
    now = '2026-09-10T20:01:00.000Z';
    const saved = await store.saveVersion(kevin, 'm2 acceptance');
    expect(saved).toEqual({
      n: 2,
      revision: 413,
      author: kevin,
      note: 'm2 acceptance',
      createdAt: now,
      mutations: [],
    });
    const versions = await store.listVersions();
    expect(versions.map((v) => [v.n, v.author.kind, v.note])).toEqual([
      [1, 'agent', ''],
      [2, 'human', 'm2 acceptance'],
    ]);
    expect(versions.some((v) => v.author.kind === 'agent' && v.author.runId === 'm2-test')).toBe(
      true,
    );
    expect(versions[0]).not.toHaveProperty('inverse');
    await expect(store.saveVersion(kevin, '  ')).rejects.toThrow(/needs a note/);
  });

  it('rebuilds any version from the inverses and restores one as a mutation', async () => {
    const v0 = (await store.read()).document;
    const w1 = await store.write({ baseRevision: 412, author: agent, mutations: [setSize(22)] });
    if (!w1.ok) throw new Error(w1.message);
    const w2 = await store.write({
      baseRevision: 413,
      author: agent,
      mutations: [
        { op: 'slide.remove', slideId: 'thesis' },
        { op: 'deck.set', path: '/title', value: 'Edited' },
      ],
    });
    if (!w2.ok) throw new Error(w2.message);
    expect(w2.changed).toEqual(['thesis']);
    expect(existsSync(slidePath(dir, 'thesis'))).toBe(false);

    expect(stable(await store.documentAt(0))).toEqual(stable(v0));
    expect((await store.documentAt(0)).deck.revision).toBe(412);
    expect(stable(await store.documentAt(1))).toEqual(stable(w1.document));
    expect((await store.documentAt(1)).deck.revision).toBe(413);
    expect(stable(await store.documentAt(2))).toEqual(stable(w2.document));
    expect(stable(await store.documentAtRevision(413))).toEqual(stable(w1.document));
    expect(stable(await store.documentAtRevision(412))).toEqual(stable(v0));
    await expect(store.documentAtRevision(999)).rejects.toThrow(/not in the version log/);
    await expect(store.documentAt(9)).rejects.toThrow(/No version 9/);

    // Restore version 1: a forward write whose mutation list is [version.restore]; the file for
    // thesis comes back and the title returns, and the entry's inverse undoes the restore.
    const restored = await store.write({
      baseRevision: 414,
      author: kevin,
      note: 'back to the size change',
      mutations: [{ op: 'version.restore', n: 1 }],
    });
    if (!restored.ok) throw new Error(restored.message);
    expect(restored.revision).toBe(415);
    expect(stable(restored.document)).toEqual(stable(w1.document));
    expect(existsSync(slidePath(dir, 'thesis'))).toBe(true);
    expect(restored.entry.mutations).toEqual([{ op: 'version.restore', n: 1 }]);
    expect(restored.entry.note).toBe('back to the size change');
    const undone = await store.write({
      baseRevision: 415,
      author: kevin,
      mutations: restored.entry.inverse,
    });
    if (!undone.ok) throw new Error(undone.message);
    expect(stable(undone.document)).toEqual(stable(w2.document));
    // History still rebuilds through the restore and its undo.
    expect(stable(await store.documentAt(2))).toEqual(stable(w2.document));
    expect(stable(await store.documentAt(0))).toEqual(stable(v0));
    expect((await store.listVersions()).map((v) => v.n)).toEqual([1, 2, 3, 4]);
  });

  it('refuses to rebuild history across a change made outside the store', async () => {
    await store.write({ baseRevision: 412, author: agent, mutations: [setSize(22)] });
    const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
      revision: number;
    };
    manifest.revision = 20;
    writeFileSync(join(dir, 'deck.json'), canonicalJson(manifest));
    await expect(store.documentAt(1)).rejects.toThrow(/changed outside the store/);
    // A restore through the reducer reports the same reason as an invalid write.
    const outcome = await store.write({
      baseRevision: 20,
      author: agent,
      mutations: [{ op: 'version.restore', n: 1 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.code !== 'invalid') throw new Error('expected invalid');
    expect(outcome.message).toMatch(/changed outside the store/);
  });

  it('keeps advisory leases: another author warns, enforce conflicts, force passes', async () => {
    const lease = await store.lease('content-rule', kevin, { minutes: 10 });
    expect(lease).toEqual({
      slideId: 'content-rule',
      holder: kevin,
      until: '2026-09-10T20:10:00.000Z',
    });
    expect(await store.leases()).toEqual([lease]);
    expect(existsSync(join(dir, '.turboslide', 'leases.json'))).toBe(true);
    await expect(store.lease('content-rule', agent)).rejects.toThrow(ConflictError);
    await expect(store.lease('content-rule', agent)).rejects.toMatchObject({
      status: 409,
      holder: kevin,
    });
    await expect(store.lease('no-such-slide', agent)).rejects.toThrow(RangeError);

    const advisory = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [setSize(22)],
    });
    expect(advisory.ok).toBe(true);
    if (advisory.ok) expect(advisory.warnings[0]).toMatch(/leased by kevin until/);

    const strict = openFileStore({ dir, now: () => now, leases: 'enforce' });
    const refused = await strict.write({
      baseRevision: 413,
      author: agent,
      mutations: [setSize(20)],
    });
    expect(refused.ok).toBe(false);
    if (refused.ok || refused.code !== 'conflict') throw new Error('expected a conflict');
    expect(refused.holder).toEqual(kevin);
    expect(refused.currentRevision).toBe(413);
    const forced = await strict.write(
      { baseRevision: 413, author: agent, mutations: [setSize(20)] },
      { force: true },
    );
    expect(forced.ok).toBe(true);
    // Whole-deck writes take no lease.
    const sections = await strict.write({
      baseRevision: 414,
      author: agent,
      mutations: [{ op: 'deck.set', path: '/title', value: 'Renamed' }],
    });
    expect(sections.ok).toBe(true);

    const taken = await store.lease('content-rule', agent, { force: true });
    expect(taken.holder).toEqual(agent);
    expect(await store.release('content-rule', kevin)).toBeUndefined();
    expect(await store.release('content-rule', agent)).toEqual(taken);
    expect(await store.leases()).toEqual([]);

    await store.lease('thesis', kevin, { minutes: 1 });
    now = '2026-09-10T20:02:00.000Z';
    expect(await store.leases()).toEqual([]);
    await expect(store.lease('thesis', agent, { minutes: 0 })).rejects.toThrow(TypeError);
  });

  it('waits for a fresh lock, fails after the timeout and sweeps a stale one', async () => {
    const lock = join(dir, '.turboslide', 'write.lock');
    mkdirSync(join(dir, '.turboslide'), { recursive: true });
    writeFileSync(lock, '');
    const quick = openFileStore({ dir, now: () => now, lockTimeoutMs: 120 });
    await expect(
      quick.write({ baseRevision: 412, author: agent, mutations: [setSize(22)] }),
    ).rejects.toThrow(/holds .*write\.lock/);
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    const swept = await quick.write({ baseRevision: 412, author: agent, mutations: [setSize(22)] });
    expect(swept.ok).toBe(true);
    expect(existsSync(lock)).toBe(false);
  });

  it('serializes concurrent writes so both land on the log', async () => {
    const results = await Promise.all([
      store.write({ baseRevision: 412, author: agent, mutations: [setSize(22)] }),
      store.write({ baseRevision: 412, author: kevin, mutations: [setSize(20)] }),
    ]);
    const ok = results.filter((r) => r.ok);
    const conflicts = results.filter((r) => !r.ok && r.code === 'conflict');
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(await store.revision()).toBe(413);
    expect(jsonEqual(readVersions(dir).length, 1)).toBe(true);
  });
});
