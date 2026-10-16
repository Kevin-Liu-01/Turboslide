// The rollback gate (RELIABILITY-19, hardening HR-O#5): the validator of the release production
// served before this one, pinned in fixtures/previous-validator/ by
// scripts/pin-previous-validator.mjs, reads every document this release writes. A push that adds
// a field without raising SCHEMA_MINOR, or renames one without raising SCHEMA_VERSION, fails here,
// because the release a rollback lands on would refuse the decks the push saved.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from './fixtures.ts';
import { canonicalJson } from './json.ts';
import { validateDeck } from './validate.ts';
import type { ValidationResult } from './validate.ts';

const PINNED = join(import.meta.dirname, '..', 'fixtures', 'previous-validator');
const DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');

type Pin = { sha: string; zod: string; bytes: number; sha256: string };
type Previous = { validateDeck: (input: unknown) => ValidationResult };

const pin = JSON.parse(readFileSync(join(PINNED, 'PIN.json'), 'utf8')) as Pin;
const code = readFileSync(join(PINNED, 'validate.mjs'));

/** The committed decks, read as the store reads them: the manifest and every slide file. */
function committed(dir: string): { deck: unknown; slides: Record<string, unknown> } {
  const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const slides: Record<string, unknown> = {};
  for (const file of readdirSync(join(dir, 'slides')).filter((name) => name.endsWith('.json')))
    slides[file.slice(0, -'.json'.length)] = read(join(dir, 'slides', file));
  return { deck: read(join(dir, 'deck.json')), slides };
}

/** What this release writes for a document: validated, normalized, then its canonical bytes read back. */
function writtenByThisRelease(input: { deck: unknown; slides: unknown }): {
  deck: unknown;
  slides: unknown[];
} {
  const result = validateDeck(input);
  if (!result.ok || result.deck === null)
    throw new Error(result.issues.map((row) => row.message).join('; '));
  const bytes = (value: unknown): unknown => JSON.parse(canonicalJson(value)) as unknown;
  return { deck: bytes(result.deck), slides: Object.values(result.slides).map(bytes) };
}

const DOCUMENTS = [
  { name: 'the worked deck', input: () => ({ deck: WORKED_DECK, slides: [...WORKED_SLIDES] }) },
  { name: 'the GT deck', input: () => committed(join(DECKS, 'gt-brand')) },
  { name: 'the GT template', input: () => committed(join(DECKS, 'templates', 'gt-brand')) },
  { name: 'the blank template', input: () => committed(join(DECKS, 'templates', 'blank')) },
];

describe('the pinned previous validator', () => {
  it('is the bundle its pin names', () => {
    expect(pin.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(code.byteLength).toBe(pin.bytes);
    expect(createHash('sha256').update(code).digest('hex')).toBe(pin.sha256);
  });

  it.each(DOCUMENTS)(
    'reads $name as this release writes it',
    async ({ input }) => {
      const previous = (await import(pathToFileURL(join(PINNED, 'validate.mjs')).href)) as Previous;
      const written = writtenByThisRelease(input());
      const result = previous.validateDeck(written);
      const refused = result.issues.filter((row) => row.severity === 3);
      expect(refused.map((row) => `${row.file}${row.pointer}: ${row.message}`)).toEqual([]);
      expect(result.ok).toBe(true);
    },
    120_000,
  );

  it('refuses a field it does not know, so the gate catches a push that adds one unstamped', async () => {
    const previous = (await import(pathToFileURL(join(PINNED, 'validate.mjs')).href)) as Previous;
    const written = writtenByThisRelease({ deck: WORKED_DECK, slides: [...WORKED_SLIDES] });
    const result = previous.validateDeck({
      ...written,
      deck: { ...(written.deck as Record<string, unknown>), futurePalette: ['#000000'] },
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'unknown_field', pointer: '/futurePalette' });
  }, 120_000);
});
