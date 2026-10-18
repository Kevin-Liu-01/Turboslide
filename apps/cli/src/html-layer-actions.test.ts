// deck.setHtml and slide.setHtml over a deck folder (docs/html-layers.md): the layer is sanitized
// before the commit (no script, no event handler, no CSS the tokenizer refuses), stored without its
// empty fields, stamped with schema minor 1 on the files that hold it (so a release of minor 0 keeps
// it), and null removes it. The temp deck is created from the repository's blank template.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { openFileStore } from '@turboslide/store/file-store';
import { createDeck } from '@turboslide/store/templates';

import { lintLists } from './deps/theme.ts';
import type { StoreActionDeps } from './store-actions.ts';
import { registerStoreActions } from './store-actions.ts';

const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');

let root: string;
let deckDir: string;
let dispatcher: Dispatcher;
const context: ActionContext = { author: { kind: 'human', name: 'tester' } };

type Json = Record<string, unknown>;
const readJson = (path: string): Json => JSON.parse(readFileSync(path, 'utf8')) as Json;
const manifest = (): Json => readJson(join(deckDir, 'deck.json'));
const slideFile = (id: string): Json => readJson(join(deckDir, 'slides', `${id}.json`));

describe('the HtmlLayer actions over a deck folder', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-html-layer-'));
    const decksDir = join(root, 'decks');
    mkdirSync(join(decksDir, 'templates'), { recursive: true });
    symlinkSync(join(REPO_DECKS, 'templates', 'blank'), join(decksDir, 'templates', 'blank'));
    deckDir = createDeck(decksDir, { name: 'Layers', from: 'blank' }).dir;
    const deps: StoreActionDeps = { store: openFileStore({ dir: deckDir }), lint: lintLists() };
    dispatcher = createDispatcher();
    registerStoreActions(dispatcher, deps);
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('deck.setHtml stores the shared layer sanitized and stamps the manifest with minor 1', async () => {
    const revision = manifest().revision as number;
    const result = (await dispatcher.dispatch(
      'deck.setHtml',
      {
        html: {
          css: '@import url(https://evil.example/x.css); .h1 { letter-spacing: -0.02em }',
          markup: '<div class="band" onclick="alert(1)">Q4</div><script>alert(1)</script>',
        },
        baseRevision: revision,
      },
      context,
    )) as { html: Json | null; revision: number; droppedCss: string[] };
    expect(result.revision).toBe(revision + 1);
    expect(result.droppedCss.length).toBeGreaterThan(0);
    const stored = manifest();
    const html = stored.html as { css: string; markup: string };
    expect(html.markup).toBe('<div class="band">Q4</div>');
    expect(html.css).not.toContain('@import');
    expect(html.css).toContain('.h1');
    expect(stored.schemaMinor).toBe(1);
  });

  test('slide.setHtml writes the slide’s own layer with its place; null removes it', async () => {
    const revision = manifest().revision as number;
    const set = (await dispatcher.dispatch(
      'slide.setHtml',
      {
        slideIds: ['title'],
        html: { markup: '<p class="stamp">Draft</p>', css: '', layer: 'over' },
        baseRevision: revision,
      },
      context,
    )) as { slides: Json[]; revision: number };
    expect(set.revision).toBe(revision + 1);
    // the empty CSS is left out of the stored layer
    expect(slideFile('title').html).toEqual({
      markup: '<p class="stamp">Draft</p>',
      layer: 'over',
    });
    expect(slideFile('title').schemaMinor).toBe(1);
    await dispatcher.dispatch(
      'slide.setHtml',
      { slideIds: ['title'], html: null, baseRevision: set.revision },
      context,
    );
    expect(slideFile('title')).not.toHaveProperty('html');
  });

  test('deck.setHtml with a layer that has nothing left to draw removes the shared layer', async () => {
    const revision = manifest().revision as number;
    const result = (await dispatcher.dispatch(
      'deck.setHtml',
      { html: { markup: '<script>alert(1)</script>', layer: 'under' }, baseRevision: revision },
      context,
    )) as { html: Json | null };
    expect(result.html).toBeNull();
    expect(manifest()).not.toHaveProperty('html');
  });
});
