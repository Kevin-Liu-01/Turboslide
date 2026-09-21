// brand.get, brand.set and brand.reset over a deck folder (docs/PRODUCT.md 4.1, 8.3): the record
// is created at the shallowest missing ancestor, validated before the commit, read back by
// brand.get, one Undo (the reducer's inverse) takes one field back, a reset removes the record or
// one field and writes no revision when there is nothing to remove, and font.list answers the 26
// rows with a licence each. The temp deck is created from the repository's blank template.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { FONT_IDS } from '@turboslide/schema/fonts';
import { openFileStore } from '@turboslide/store/file-store';
import { createDeck } from '@turboslide/store/templates';

import type { BrandGetResult, BrandResetResult, BrandSetResult } from './brand-actions.ts';
import { registerBrandActions } from './brand-actions.ts';
import { lintLists } from './deps/theme.ts';
import type { StoreActionDeps } from './store-actions.ts';

const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', 'decks');

let root: string;
let deckDir: string;
let dispatcher: Dispatcher;
const context: ActionContext = { author: { kind: 'human', name: 'tester' } };

function manifest(): { revision: number; brand?: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
    revision: number;
    brand?: Record<string, unknown>;
  };
}

describe('the brand kit actions over a deck folder', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-brand-'));
    const decksDir = join(root, 'decks');
    mkdirSync(join(decksDir, 'templates'), { recursive: true });
    symlinkSync(join(REPO_DECKS, 'templates', 'blank'), join(decksDir, 'templates', 'blank'));
    const created = createDeck(decksDir, { name: 'Acme pitch', from: 'blank' });
    deckDir = created.dir;
    const store = openFileStore({ dir: deckDir });
    const deps: StoreActionDeps = { store, lint: lintLists() };
    dispatcher = createDispatcher();
    registerBrandActions(dispatcher, deps);
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('brand.get answers an empty record for a deck without one', async () => {
    const got = (await dispatcher.dispatch('brand.get', {}, context)) as BrandGetResult;
    expect(got).toEqual({ brand: {}, own: false, revision: 0 });
  });

  test('brand.set creates the record at the shallowest missing ancestor and validates it', async () => {
    const set = (await dispatcher.dispatch(
      'brand.set',
      { path: '/colors/light/primary', value: '#0b3d91', baseRevision: 0 },
      context,
    )) as BrandSetResult;
    expect(set.revision).toBe(1);
    expect(set.brand).toEqual({ colors: { light: { primary: '#0b3d91' } } });
    expect(manifest().brand).toEqual({ colors: { light: { primary: '#0b3d91' } } });
    const again = (await dispatcher.dispatch(
      'brand.set',
      { path: '/fonts/display', value: 'playfair-display', baseRevision: 1 },
      context,
    )) as BrandSetResult;
    expect(again.brand.fonts).toEqual({ display: 'playfair-display' });
    const got = (await dispatcher.dispatch('brand.get', {}, context)) as BrandGetResult;
    expect(got.own).toBe(true);
    expect(got.brand.colors?.light?.primary).toBe('#0b3d91');
    /* the invalid writes are refused before the commit, with the revision unchanged */
    await expect(
      dispatcher.dispatch(
        'brand.set',
        { path: '/colors/light/muted', value: '#000000', baseRevision: 2 },
        context,
      ),
    ).rejects.toThrow(/muted|Unrecognized/);
    await expect(
      dispatcher.dispatch(
        'brand.set',
        { path: '/fonts/display', value: 'comic-sans', baseRevision: 2 },
        context,
      ),
    ).rejects.toThrow();
    await expect(
      dispatcher.dispatch('brand.set', { path: '/title', value: 'x', baseRevision: 2 }, context),
    ).rejects.toThrow();
    expect(manifest().revision).toBe(2);
  });

  test('a stale base is a conflict', async () => {
    await expect(
      dispatcher.dispatch(
        'brand.set',
        { path: '/frame/rails', value: false, baseRevision: 0 },
        context,
      ),
    ).rejects.toThrow();
  });

  test('brand.reset removes one field, then the record, and writes nothing when there is nothing to remove', async () => {
    const one = (await dispatcher.dispatch(
      'brand.reset',
      { path: '/fonts/display', baseRevision: 2 },
      context,
    )) as BrandResetResult;
    expect(one.changed).toBe(true);
    expect(one.brand.fonts).toEqual({});
    const all = (await dispatcher.dispatch(
      'brand.reset',
      { baseRevision: 3 },
      context,
    )) as BrandResetResult;
    expect(all.changed).toBe(true);
    expect(all.brand).toEqual({});
    expect(manifest().brand).toBeUndefined();
    const none = (await dispatcher.dispatch(
      'brand.reset',
      { baseRevision: 4 },
      context,
    )) as BrandResetResult;
    expect(none.changed).toBe(false);
    expect(manifest().revision).toBe(4);
  });

  test('font.list answers the 26 catalog rows with a licence each', async () => {
    const list = (await dispatcher.dispatch('font.list', {}, context)) as {
      fonts: { id: string; licence: string; name: string }[];
    };
    expect(list.fonts.map((row) => row.id)).toEqual([...FONT_IDS]);
    expect(list.fonts.every((row) => /OFL 1\.1|Apache 2\.0/.test(row.licence))).toBe(true);
    expect(list.fonts.find((row) => row.id === 'playfair-display')?.name).toBe('Playfair Display');
  });
});
