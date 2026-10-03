// The twins a template names past its seed deck's manifest (docs/NEXT.md 4.1.4, question 29; the
// Round 1 integrator's answer to b4.md request 2): a hosted tier's copy of the stored GT deck keeps
// its 85 slides while the GT template carries the 95 slide import, so the four new pictures come
// from the static source into the overlay's folder before deck.create copies it.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { missingTemplateTwins } from './templates.ts';
import { fetchTemplateTwins } from './tmp-store.ts';

let decksDir: string;

function template(id: string, assets: string, twins: string[]): void {
  const dir = join(decksDir, 'templates', id);
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(
    join(dir, 'template.json'),
    JSON.stringify({
      schemaVersion: 1,
      id,
      name: id,
      description: 'A template',
      theme: 'gt-ink-paper',
      deck: 'deck.json',
      slides: 'slides',
      assets,
      sections: [],
      archetypes: [],
    }),
  );
  writeFileSync(
    join(dir, 'deck.json'),
    JSON.stringify({
      assets: Object.fromEntries(twins.map((twin, i) => [`a${i}`, { twins: { light: twin } }])),
    }),
  );
}

beforeEach(() => {
  decksDir = join(mkdtempSync(join(tmpdir(), 'turboslide-twins-')), 'decks');
  mkdirSync(join(decksDir, 'gt-brand', 'assets'), { recursive: true });
  writeFileSync(join(decksDir, 'gt-brand', 'assets', 'mood-earth-light.jpg'), 'earth');
});
afterEach(() => {
  rmSync(join(decksDir, '..'), { recursive: true, force: true });
});

describe('the twins a template names past its seed deck', () => {
  test('names the missing files of a template whose assets folder is a seed deck folder', () => {
    template('gt-brand', '../../gt-brand/assets', [
      'assets/mood-earth-light.jpg',
      'assets/mood-tablet-light.jpg',
    ]);
    expect(missingTemplateTwins(decksDir, 'gt-brand', ['gt-brand'])).toEqual({
      seedId: 'gt-brand',
      assetsDir: join(decksDir, 'gt-brand', 'assets'),
      missing: ['assets/mood-tablet-light.jpg'],
    });
  });

  test('answers null for a template with its own folder, a folder of no seed deck, or none', () => {
    template('own', 'assets', ['assets/a.jpg']);
    expect(missingTemplateTwins(decksDir, 'own', ['gt-brand'])).toBeNull();
    template('gt-brand', '../../gt-brand/assets', ['assets/mood-tablet-light.jpg']);
    expect(missingTemplateTwins(decksDir, 'gt-brand', [])).toBeNull();
    expect(missingTemplateTwins(decksDir, 'nothing-here', ['gt-brand'])).toBeNull();
    expect(missingTemplateTwins(decksDir, '../gt-brand', ['gt-brand'])).toBeNull();
  });

  test('skips a twin path outside the assets folder', () => {
    template('gt-brand', '../../gt-brand/assets', ['assets/../deck.json', 'assets/a/b.jpg']);
    expect(missingTemplateTwins(decksDir, 'gt-brand', ['gt-brand'])?.missing).toEqual([]);
  });

  test('fetches each missing twin by the seed deck id into the overlay folder alone', async () => {
    template('gt-brand', '../../gt-brand/assets', [
      'assets/mood-earth-light.jpg',
      'assets/mood-tablet-light.jpg',
      'assets/mood-gloss-light.jpg',
    ]);
    const asked: string[] = [];
    const written = await fetchTemplateTwins(
      decksDir,
      'gt-brand',
      ['gt-brand'],
      async (deckId, file) => {
        asked.push(`${deckId}/${file}`);
        return file === 'mood-gloss-light.jpg' ? null : new TextEncoder().encode(file);
      },
      () => {},
    );
    expect(written).toBe(1);
    expect(asked.sort()).toEqual([
      'gt-brand/mood-gloss-light.jpg',
      'gt-brand/mood-tablet-light.jpg',
    ]);
    const tablet = join(decksDir, 'gt-brand', 'assets', 'mood-tablet-light.jpg');
    expect(readFileSync(tablet, 'utf8')).toBe('mood-tablet-light.jpg');
    expect(existsSync(join(decksDir, 'gt-brand', 'assets', 'mood-gloss-light.jpg'))).toBe(false);
  });
});
