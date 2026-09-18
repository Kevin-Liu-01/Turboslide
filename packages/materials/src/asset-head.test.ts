// The plain asset.add writes its new record against the store's head (docs/FOCUS.md rank 5;
// audit-images rows 6 to 8, 57 and 61): on a scratch copy of the export fixture deck, a base
// behind the head lands the asset at head plus one, a base ahead of the head lands it too, a base
// equal to the head lands it as before, a record the head already holds under the id is refused
// as a conflict with the head's document, a moved head between the read and the write is read
// again, and `--replace-source` keeps the strict base.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import { ConflictError } from '@turboslide/schema/errors';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import { ASSET_HEAD_RETRIES, assetAdd, commitAssetsAtHead } from './actions.ts';
import type { AssetActionDeps, AssetWriteContext } from './actions.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(REPO, 'decks/fixture/gslides');
const ROSETTA = join(REPO, 'decks/gt-brand/assets/ref-rosetta.jpg');

const ctx: AssetWriteContext = { author: { kind: 'agent', name: 'b3-test' } };

let dir: string;
let store: FileStore;
let deps: AssetActionDeps;

async function revision(): Promise<number> {
  return (await store.read()).document.deck.revision;
}

/** One write that moves the head without touching the assets: the deck's title. */
async function moveHead(title: string): Promise<number> {
  const outcome = await store.write({
    baseRevision: await revision(),
    author: ctx.author,
    mutations: [{ op: 'deck.set', path: '/title', value: title }],
  });
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.revision;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ts-b3-asset-head-'));
  cpSync(FIXTURE, dir, { recursive: true });
  store = openFileStore({ dir });
  deps = { store, cwd: REPO, allowPaths: true, hosted: false };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('asset.add against the head', () => {
  it('lands a new asset when the caller’s base is one behind the head, at head plus one', async () => {
    const stale = await revision();
    const head = await moveHead('Moved once');
    expect(head).toBe(stale + 1);
    const asset = await assetAdd(deps, ctx, {
      baseRevision: stale,
      file: ROSETTA,
      id: 'dropped-logo',
      role: 'capture',
      alt: 'dropped logo',
    });
    expect(asset.id).toBe('dropped-logo');
    expect(await revision()).toBe(head + 1);
    const record = (await store.read()).document.deck.assets['dropped-logo'] as Asset;
    expect(record.alt).toBe('dropped logo');
    for (const file of Object.values(record.twins)) expect(existsSync(join(dir, file))).toBe(true);
  });

  it('lands a new asset when the caller’s base is ahead of the head', async () => {
    const head = await revision();
    const asset = await assetAdd(deps, ctx, {
      baseRevision: head + 3,
      file: ROSETTA,
      id: 'ahead-logo',
      role: 'capture',
      alt: 'ahead logo',
    });
    expect(asset.id).toBe('ahead-logo');
    expect(await revision()).toBe(head + 1);
  });

  it('lands a new asset as before when the base is the head', async () => {
    const head = await revision();
    await assetAdd(deps, ctx, {
      baseRevision: head,
      file: ROSETTA,
      id: 'exact-logo',
      role: 'capture',
      alt: 'exact logo',
    });
    expect(await revision()).toBe(head + 1);
    expect((await store.read()).document.deck.assets['exact-logo']).toBeDefined();
  });

  it('refuses a stale base whose id the head already holds, with the head’s document', async () => {
    const stale = await revision();
    await assetAdd(deps, ctx, {
      baseRevision: stale,
      file: ROSETTA,
      id: 'twice',
      role: 'capture',
      alt: 'first',
    });
    const head = await revision();
    let refused: unknown;
    try {
      await assetAdd(deps, ctx, {
        baseRevision: stale,
        file: ROSETTA,
        id: 'twice',
        role: 'capture',
        alt: 'second',
      });
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(ConflictError);
    const conflict = refused as ConflictError;
    expect(conflict.message).toContain(`baseRevision ${stale} is stale`);
    expect(conflict.message).toContain('already holds an asset "twice"');
    expect(conflict.currentRevision).toBe(head);
    expect(await revision()).toBe(head);
    expect(((await store.read()).document.deck.assets['twice'] as Asset).alt).toBe('first');
  });

  it('reads the head again when another write lands between the read and the write', async () => {
    const start = await revision();
    let moved = false;
    const racing: AssetActionDeps = {
      ...deps,
      store: {
        ...store,
        write: async (write, options) => {
          if (!moved) {
            moved = true;
            await moveHead('Raced');
          }
          return store.write(write, options);
        },
      },
    };
    const record = ((await store.read()).document.deck.assets['fixture-photo'] as Asset) ?? null;
    expect(record).not.toBeNull();
    const fresh: Asset = { ...record, id: 'raced-copy', alt: 'raced copy' };
    const committed = await commitAssetsAtHead(racing, ctx, start, [fresh]);
    // the title write took start plus one; the asset landed on top of it
    expect(committed.revision).toBe(start + 2);
    expect(committed.assets[0]?.id).toBe('raced-copy');
    expect((await store.read()).document.deck.title).toBe('Raced');
  });

  it('gives up after the bounded retries when the head keeps moving, with the last conflict', async () => {
    const start = await revision();
    let writes = 0;
    const racing: AssetActionDeps = {
      ...deps,
      store: {
        ...store,
        write: async (write, options) => {
          writes += 1;
          await moveHead(`Raced ${writes}`);
          return store.write(write, options);
        },
      },
    };
    const record = (await store.read()).document.deck.assets['fixture-photo'] as Asset;
    const fresh: Asset = { ...record, id: 'never-lands', alt: 'never lands' };
    await expect(commitAssetsAtHead(racing, ctx, start, [fresh])).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(writes).toBe(ASSET_HEAD_RETRIES + 1);
    expect((await store.read()).document.deck.assets['never-lands']).toBeUndefined();
  });

  it('keeps the strict base for --replace-source', async () => {
    const stale = await revision();
    await moveHead('Moved for replace');
    await expect(
      assetAdd(deps, ctx, {
        baseRevision: stale,
        file: ROSETTA,
        replaceSource: 'fixture-photo',
        role: 'other',
        alt: 'ignored',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
