// RELIABILITY-19 (hardening HR-O#5) through the store: a deck a newer release wrote, with fields
// this release does not know on a slide of a higher `schemaMinor`, opens, saves and keeps them;
// removing that slide writes a record whose inverse holds the slide, and the log reads back; a
// record of an older shape (an unversioned slide in a slide.insert) replays through the chain.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author } from '@turboslide/schema/mutations';
import { validateDocument } from '@turboslide/schema/validate';

import { openFileStore, slidePath } from './file-store.ts';
import type { FileStore } from './file-store.ts';
import { parseVersionRecord, readVersions, versionRecordText } from './versions.ts';

type Json = Record<string, unknown>;
const agent: Author = { kind: 'agent', name: 'agent', runId: 'o5' };

/** The worked deck as this release writes it: normalized, canonical. */
function normalized(): { deck: Json; slides: Json[] } {
  const result = validateDocument({
    deck: structuredClone(WORKED_DECK),
    slides: Object.fromEntries(WORKED_SLIDES.map((slide) => [slide.id, structuredClone(slide)])),
  });
  if (!result.ok || result.deck === null) throw new Error('fixture');
  const json = (value: unknown): Json => JSON.parse(canonicalJson(value)) as Json;
  return { deck: json(result.deck), slides: Object.values(result.slides).map(json) };
}

/** `object` with `entries` placed right after the key `after`. */
function withAfter(object: Json, after: string, entries: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(object)) {
    out[key] = value;
    if (key === after) Object.assign(out, entries);
  }
  return out;
}

/** content-rule as a release of minor 1 writes it, with a slide field and a block field it added. */
function newer(slide: Json): Json {
  const stamped = withAfter(withAfter(slide, 'schemaVersion', { schemaMinor: 1 }), 'kind', {
    futureFrame: { inset: 12 },
  });
  const slots = stamped.slots as { left: Json[] };
  const heading = slots.left[0];
  if (heading === undefined) throw new Error('fixture');
  slots.left[0] = withAfter(heading, 'type', { futureShadow: 'soft' });
  return stamped;
}

describe('a deck a newer minor wrote (RELIABILITY-19)', () => {
  let root: string;
  let dir: string;
  let store: FileStore;
  let newerText: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-o5-'));
    dir = join(root, 'decks', 'gt-brand');
    mkdirSync(join(dir, 'slides'), { recursive: true });
    const { deck, slides } = normalized();
    writeFileSync(join(dir, 'deck.json'), canonicalJson(deck));
    for (const slide of slides) {
      const text = canonicalJson(slide.id === 'content-rule' ? newer(slide) : slide);
      if (slide.id === 'content-rule') newerText = text;
      writeFileSync(slidePath(dir, String(slide.id)), text);
    }
    store = openFileStore({ dir, now: () => '2026-10-12T05:00:00.000Z' });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('opens, and says which fields it kept', async () => {
    const read = await store.read();
    expect(read.ok, read.issues.map((row) => row.message).join('; ')).toBe(true);
    expect(read.issues.filter((row) => row.code === 'kept').map((row) => row.pointer)).toEqual([
      '/futureFrame',
      '/slots/left/0/futureShadow',
    ]);
  });

  it('saves a change to the slide and writes the fields back unchanged', async () => {
    const outcome = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'p1', path: '/text', value: 'Short.' },
      ],
    });
    expect(outcome.ok, outcome.ok ? '' : outcome.message).toBe(true);
    const expected = JSON.parse(newerText) as Json;
    const p1 = (expected.slots as { left: Json[] }).left[1];
    if (p1 === undefined) throw new Error('fixture');
    p1.text = 'Short.';
    expect(readFileSync(slidePath(dir, 'content-rule'), 'utf8')).toBe(canonicalJson(expected));
  });

  it('removes the slide, keeps it whole in the record, and restores it byte equal', async () => {
    const removed = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [{ op: 'slide.remove', slideId: 'content-rule' }],
    });
    expect(removed.ok, removed.ok ? '' : removed.message).toBe(true);
    const records = readVersions(dir);
    const record = records.at(-1);
    const inverse = record?.inverse[0];
    expect(inverse?.op).toBe('slide.insert');
    expect(inverse?.op === 'slide.insert' && inverse.slide).toMatchObject({
      schemaMinor: 1,
      futureFrame: { inset: 12 },
    });
    // undo is a forward write of the inverse (SPEC 6.7)
    const restored = await store.write({
      baseRevision: 413,
      author: agent,
      mutations: record?.inverse ?? [],
    });
    expect(restored.ok, restored.ok ? '' : restored.message).toBe(true);
    expect(readFileSync(slidePath(dir, 'content-rule'), 'utf8')).toBe(newerText);
  });
});

describe('a version record through the documents chain (RELIABILITY-19)', () => {
  const base = {
    n: 3,
    revision: 5,
    baseRevision: 4,
    author: agent,
    note: '',
    createdAt: '2026-10-12T05:00:00.000Z',
  };

  it('stamps an unversioned slide a slide.insert holds', () => {
    const slide = normalized().slides.find((row) => row.id === 'content-rule');
    if (slide === undefined) throw new Error('fixture');
    delete slide.schemaVersion;
    const text = JSON.stringify({
      ...base,
      mutations: [{ op: 'slide.insert', sectionId: 'brand', slide }],
      inverse: [{ op: 'slide.remove', slideId: 'content-rule' }],
    });
    const record = parseVersionRecord(text, 'versions/3.json');
    const insert = record.mutations[0];
    expect(insert?.op === 'slide.insert' && insert.slide.schemaVersion).toBe(1);
  });

  it('reads a record a newer minor stamped, keeps its field, and writes it back byte equal', () => {
    const text = canonicalJson({
      ...base,
      mutations: [],
      inverse: [],
      schemaMinor: 1,
      futureCause: 'import',
    });
    const record = parseVersionRecord(text, 'versions/3.json');
    expect(versionRecordText(record)).toBe(text);
  });

  it('still refuses a field it does not know on a record of its own minor', () => {
    const text = JSON.stringify({ ...base, mutations: [], inverse: [], futureCause: 'import' });
    expect(() => parseVersionRecord(text, 'versions/3.json')).toThrow(/not a version record/);
  });
});
