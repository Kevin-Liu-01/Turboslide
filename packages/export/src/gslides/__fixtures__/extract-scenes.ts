// Regenerates the scene fixtures the Google Slides request builder tests read: decks/fixture (both
// slides) and decks/gt-brand slides 01, 08 and 33, light theme, native and flatten mode, through
// the same extractor the exporter uses (scene/extract.ts). The PNG paths the extractor writes are
// replaced by relative names, since the tests read the geometry and the text and never the pixels.
// Run from packages/export: `node src/gslides/__fixtures__/extract-scenes.ts` (Chromium required;
// about a minute). The fixture names the deck revision it was cut from in `revision`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import type { ExportMode } from '@turboslide/schema/export';

import { extractScenes } from '../../scene/extract.ts';
import type { Scene } from '../../scene/types.ts';

export type SceneFixture = {
  deckId: string;
  revision: number;
  mode: ExportMode;
  renderer: string;
  warnings: string[];
  scenes: Scene[];
};

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../../../..');

function loadDocument(deckDir: string, ids: string[]): DeckDocument {
  const deck = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const id of ids)
    slides[id] = JSON.parse(readFileSync(join(deckDir, 'slides', `${id}.json`), 'utf8')) as Slide;
  return { deck, slides };
}

function relativize(scene: Scene): Scene {
  const copy = JSON.parse(JSON.stringify(scene)) as Scene;
  for (const raster of copy.rasters)
    if (raster.file) raster.file = `rasters/${basename(raster.file)}`;
  if (copy.sheetImage) copy.sheetImage = `sheets/${basename(copy.sheetImage)}`;
  if (copy.pictureFile) copy.pictureFile = `pictures/${basename(copy.pictureFile)}`;
  return copy;
}

async function cut(deckDir: string, pick: (order: string[]) => string[]): Promise<void> {
  const deck = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as Deck;
  const ids = pick(slideOrder(deck));
  const document = loadDocument(deckDir, ids);
  const workDir = join(HERE, '.work');
  for (const mode of ['native', 'flatten'] as const) {
    const t0 = performance.now();
    const result = await extractScenes({
      deckDir,
      document,
      themes: ['light'],
      mode,
      slideIds: ids,
      workDir: join(workDir, deck.id, mode),
    });
    const fixture: SceneFixture = {
      deckId: deck.id,
      revision: deck.revision,
      mode,
      renderer: result.renderer,
      warnings: result.warnings,
      scenes: result.scenes.map(relativize),
    };
    const path = join(HERE, `${deck.id}-${mode}-light.json`);
    writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
    process.stderr.write(
      `${deck.id} ${mode}: ${fixture.scenes.length} scene(s) in ${Math.round(performance.now() - t0)} ms -> ${path}\n`,
    );
  }
  rmSync(workDir, { recursive: true, force: true });
}

mkdirSync(HERE, { recursive: true });
await cut(join(REPO, 'decks/fixture'), (order) => order);
await cut(join(REPO, 'decks/gt-brand'), (order) => [
  order[0] ?? '',
  order[7] ?? '',
  order[32] ?? '',
]);
