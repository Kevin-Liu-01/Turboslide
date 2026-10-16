// RELIABILITY-19 (hardening HR-O#5): a release reads what the release after it wrote. A newer
// release that adds a field stamps `schemaMinor` on the files it writes; this release keeps the
// fields it does not know of a file whose minor is above its own and writes them back unchanged,
// still refuses an unknown field of a file of its own minor (a typo stays an error), and refuses a
// newer major with `upgrade_pending`. Version records and the mutations they hold get the same
// chain (packages/store `parseVersionRecord`).
import { describe, expect, it } from 'vitest';

import type { Slide } from './deck.ts';
import { SCHEMA_MINOR } from './deck.ts';
import { CONTENT_RULE, WORKED_DECK, WORKED_SLIDES } from './fixtures.ts';
import { canonicalJson } from './json.ts';
import { CURRENT_SCHEMA_MINOR, migrateMutations, readMinor } from './migrations.ts';
import { applyMutations } from './reduce.ts';
import { validateDeck, validateManifest, validateSlide } from './validate.ts';

type Json = Record<string, unknown>;

/** The bytes this release writes for a slide: validated, normalized, canonical. */
function written(slide: Slide): Json {
  const result = validateSlide(structuredClone(slide));
  if (result.slide === null) throw new Error('fixture');
  return JSON.parse(canonicalJson(result.slide)) as Json;
}

/** A copy of `object` with `entries` placed right after the key `after`, in that order. */
function withAfter(object: Json, after: string, entries: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(object)) {
    out[key] = value;
    if (key === after) Object.assign(out, entries);
  }
  return out;
}

/** CONTENT_RULE as a release of minor 1 writes it: the stamp, a slide field and a block field it added. */
function newerSlide(): Json {
  const base = written(CONTENT_RULE);
  const slide = withAfter(base, 'schemaVersion', { schemaMinor: 1 });
  const stamped = withAfter(slide, 'kind', { futureFrame: { inset: 12, tone: 'warm' } });
  const slots = stamped.slots as { left: Json[] };
  const heading = slots.left[0];
  if (heading === undefined) throw new Error('fixture');
  slots.left[0] = withAfter(heading, 'type', { futureShadow: 'soft' });
  return stamped;
}

describe('a file of a newer minor (RELIABILITY-19)', () => {
  it('this release writes minor 0 and writes no schemaMinor', () => {
    expect(SCHEMA_MINOR).toBe(0);
    expect(CURRENT_SCHEMA_MINOR).toBe(0);
    expect(written(CONTENT_RULE)).not.toHaveProperty('schemaMinor');
    const deck = validateDeck({ deck: structuredClone(WORKED_DECK), slides: [...WORKED_SLIDES] });
    expect(deck.deck).not.toHaveProperty('schemaMinor');
  });

  it('reads a slide with fields it does not know and round trips it byte equal', () => {
    const text = canonicalJson(newerSlide());
    const result = validateSlide(JSON.parse(text));
    expect(result.ok, result.issues.map((row) => row.message).join('; ')).toBe(true);
    expect(canonicalJson(result.slide)).toBe(text);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'kept', severity: 1, pointer: '/futureFrame' }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'kept', severity: 1, pointer: '/slots/left/0/futureShadow' }),
    );
  });

  it('reads a manifest with a field it does not know and round trips it byte equal', () => {
    const base = JSON.parse(canonicalJson(WORKED_DECK)) as Json;
    const manifest = withAfter(withAfter(base, 'schemaVersion', { schemaMinor: 2 }), 'theme', {
      futurePalette: ['#000000', '#ffffff'],
    });
    const text = canonicalJson(manifest);
    const result = validateManifest(JSON.parse(text));
    expect(result.ok, result.issues.map((row) => row.message).join('; ')).toBe(true);
    expect(canonicalJson(result.deck)).toBe(text);
  });

  it('keeps the fields through a write of this release and writes them back unchanged', () => {
    const before = newerSlide();
    const slide = validateSlide(structuredClone(before)).slide;
    if (slide === null) throw new Error('fixture');
    const deck = validateManifest(structuredClone(WORKED_DECK)).deck;
    if (deck === null) throw new Error('fixture');
    const others = WORKED_SLIDES.filter((row) => row.id !== slide.id);
    const document = {
      deck,
      slides: Object.fromEntries([...others, slide].map((row) => [row.id, row])),
    };
    // a write of another block's text: the reducer's copy of the slide carries the fields along
    const { document: after } = applyMutations(document, [
      { op: 'block.set', slideId: slide.id, blockId: 'p1', path: '/text', value: 'Shorter.' },
    ]);
    const check = validateDeck({ deck: after.deck, slides: Object.values(after.slides) });
    expect(check.ok, check.issues.map((row) => row.message).join('; ')).toBe(true);
    const out = JSON.parse(canonicalJson(check.slides[slide.id])) as Json;
    expect(out.futureFrame).toEqual({ inset: 12, tone: 'warm' });
    expect((out.slots as { left: Json[] }).left[0]?.futureShadow).toBe('soft');
    expect(out.schemaMinor).toBe(1);
    // nothing else moved but the text that was written
    const expected = structuredClone(before);
    const p1 = (expected.slots as { left: Json[] }).left[1];
    if (p1 === undefined) throw new Error('fixture');
    p1.text = 'Shorter.';
    expect(canonicalJson(out)).toBe(canonicalJson(expected));
  });

  it('still refuses a field it does not know in a file of its own minor', () => {
    const slide = withAfter(written(CONTENT_RULE), 'kind', { futureFrame: { inset: 12 } });
    const result = validateSlide(slide);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('unknown_field');
  });

  it('refuses a file of a newer minor whose fault is not a new field', () => {
    const slide = newerSlide();
    slide.id = 'Not A Slug';
    const result = validateSlide(slide);
    expect(result.ok).toBe(false);
    expect(result.issues.some((row) => row.severity === 3)).toBe(true);
  });

  it('refuses a newer major with upgrade_pending', () => {
    const slide = { ...written(CONTENT_RULE), schemaVersion: 2 };
    const result = validateSlide(slide);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'upgrade_pending', severity: 3 });
    const manifest = { ...(JSON.parse(canonicalJson(WORKED_DECK)) as Json), schemaVersion: 2 };
    expect(validateManifest(manifest).issues[0]?.code).toBe('upgrade_pending');
  });

  it('reads the minor of a file as an integer, 0 when absent or malformed', () => {
    expect(readMinor({})).toBe(0);
    expect(readMinor({ schemaMinor: 3 })).toBe(3);
    expect(readMinor({ schemaMinor: -1 })).toBe(0);
    expect(readMinor({ schemaMinor: 1.5 })).toBe(0);
    expect(readMinor({ schemaMinor: '2' })).toBe(0);
  });
});

describe('the mutations a record holds take the documents chain (RELIABILITY-19)', () => {
  it('stamps an unversioned slide a slide.insert or a slide.replace carries', () => {
    const slide = written(CONTENT_RULE);
    delete slide.schemaVersion;
    const out = migrateMutations([
      { op: 'slide.insert', sectionId: 'brand', slide },
      { op: 'slide.replace', slideId: 'content-rule', slide },
      { op: 'block.remove', slideId: 'content-rule', blockId: 'h' },
    ]) as Json[];
    expect((out[0]?.slide as Json).schemaVersion).toBe(1);
    expect((out[1]?.slide as Json).schemaVersion).toBe(1);
    expect(out[2]).toEqual({ op: 'block.remove', slideId: 'content-rule', blockId: 'h' });
    // the input is not changed in place
    expect(slide).not.toHaveProperty('schemaVersion');
  });

  it('leaves a value that is not a list of objects as it is, for the schema to refuse', () => {
    expect(migrateMutations('nope')).toBe('nope');
    expect(migrateMutations([1, null])).toEqual([1, null]);
  });
});
