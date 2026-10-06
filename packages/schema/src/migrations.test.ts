// The migration test of gslides-parity SPEC 7.8 and SPEC-2 7.8: SCHEMA_VERSION stays 1 and every
// field the rounds added is optional, so `migrate` on the committed GT deck, the GT template, the
// blank template and the round one fixture deck (`__fixtures__/gslides-r1`, the a65b313 copy of
// decks/fixture/gslides) returns documents deep equal to their inputs, and every file validates
// unchanged.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from './deck.ts';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrate } from './migrations.ts';
import { validateDeck } from './validate.ts';

const DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');

const COMMITTED = [
  { name: 'the GT deck', dir: join(DECKS, 'gt-brand') },
  { name: 'the GT template', dir: join(DECKS, 'templates', 'gt-brand') },
  { name: 'the blank template', dir: join(DECKS, 'templates', 'blank') },
  // the round one fixture deck as committed at a65b313, before round two grew decks/fixture/gslides
  // (gslides-parity MILESTONES-2 B1 item 6): every round two field is optional, so it reads unchanged
  {
    name: 'the round one fixture deck',
    dir: join(import.meta.dirname, '__fixtures__', 'gslides-r1'),
  },
];

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function slideFiles(dir: string): string[] {
  return readdirSync(join(dir, 'slides'))
    .filter((file) => file.endsWith('.json'))
    .sort();
}

describe('the schema version', () => {
  it('stays at 1 with the one stamping migration (SPEC 7.1 rule 1)', () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS.map((step) => [step.from, step.to])).toEqual([[0, 1]]);
  });
});

describe.each(COMMITTED)('migrate on $name', ({ dir }) => {
  it('returns the manifest and every slide unchanged, with nothing applied', () => {
    expect(existsSync(join(dir, 'deck.json'))).toBe(true);
    const manifest = readJson(join(dir, 'deck.json'));
    const migratedDeck = migrate(manifest, 'deck');
    expect(migratedDeck.applied).toEqual([]);
    expect(migratedDeck.ahead).toBeUndefined();
    expect(migratedDeck.value).toEqual(manifest);
    for (const file of slideFiles(dir)) {
      const slide = readJson(join(dir, 'slides', file));
      const migrated = migrate(slide, 'slide');
      expect(migrated.applied, file).toEqual([]);
      expect(migrated.value, file).toEqual(slide);
    }
  });

  it('validates with no severity 3 issue and no migrated issue', () => {
    const manifest = readJson(join(dir, 'deck.json'));
    const slides: Record<string, unknown> = {};
    for (const file of slideFiles(dir))
      slides[file.slice(0, -'.json'.length)] = readJson(join(dir, 'slides', file));
    const result = validateDeck({ deck: manifest, slides });
    expect(result.ok, result.issues.map((issue) => issue.message).join('; ')).toBe(true);
    /* the design round's theme migration (docs/DESIGN.md 7.9) maps the fixture's gt-ink-paper once;
       no schemaVersion migration runs */
    expect(
      result.issues.filter((issue) => issue.code === 'migrated' && issue.pointer !== '/theme'),
    ).toEqual([]);
    expect(result.deck?.theme).not.toBe('gt-ink-paper');
  });
});

describe('the blank template', () => {
  it('is one title slide with empty placeholders in the Simple theme, light, with no kit and no pictures (docs/DESIGN.md 7.3, 7.7)', () => {
    const dir = join(DECKS, 'templates', 'blank');
    const manifest = readJson(join(dir, 'deck.json')) as {
      title: string;
      theme: string;
      brand?: unknown;
      defaults?: { appearance?: string };
      assets: Record<string, unknown>;
    };
    expect(manifest.title).toBe('Untitled presentation');
    expect(manifest.theme).toBe('simple');
    expect(manifest.brand).toBeUndefined();
    expect(manifest.defaults?.appearance).toBe('light');
    expect(manifest.assets).toEqual({});
    expect(existsSync(join(dir, 'assets'))).toBe(false);
    const slide = readJson(join(dir, 'slides', 'title.json'));
    expect(slide).toMatchObject({ kind: 'title', heading: '', lead: '', template: 'title' });
    expect(slideFiles(dir)).toEqual(['title.json']);
  });
});
