// The 320 px twin variant (gslides-parity SPEC-5 11 "The 320 px twin variant"; SPEC-4 7;
// MILESTONES-5 B2 day 7): written beside the twins at intake, by `picture.materialize --clone`
// for the pictures of an existing deck, once per asset, with digest named files the renderer's
// `srcset` names beside the stored twin.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decodeImage } from '@turboslide/effects/io';
import type { Asset } from '@turboslide/schema/assets';
import { TWIN_VARIANT_SIZE, isPictureAsset } from '@turboslide/schema/assets';
import {
  TWIN_VARIANT_FILE_PATTERN,
  twinSrcset,
  twinVariantOf,
} from '@turboslide/schema/blocks/media';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import {
  assetAdd,
  downsampleRgba,
  nearestRgba,
  pictureMaterialize,
  writeTwinVariant,
} from './actions.ts';
import type { AssetActionDeps, AssetWriteContext } from './actions.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(REPO, 'decks/fixture/gslides');
const ROSETTA = join(REPO, 'decks/gt-brand/assets/ref-rosetta.jpg');
const ctx: AssetWriteContext = { author: { kind: 'agent', name: 'b2-test' } };

let dir: string;
let store: FileStore;
let deps: AssetActionDeps;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ts-b2-twin-'));
  cpSync(FIXTURE, dir, { recursive: true });
  store = openFileStore({ dir });
  deps = { store, cwd: REPO, allowPaths: true, hosted: false };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the downsamples', () => {
  it('keeps the aspect, averages a continuous picture and keeps two colours for a two tone one', () => {
    const image = { width: 4, height: 2, data: new Uint8Array(4 * 2 * 4) };
    for (let x = 0; x < 4; x += 1)
      for (let y = 0; y < 2; y += 1) {
        const i = (y * 4 + x) * 4;
        const v = x < 2 ? 0 : 255;
        image.data.set([v, v, v, 255], i);
      }
    const box = downsampleRgba(image, 2);
    expect([box.width, box.height]).toEqual([2, 1]);
    expect(Array.from(box.data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    const mixed = downsampleRgba(image, 1);
    expect(Array.from(mixed.data.slice(0, 3))).toEqual([128, 128, 128]);
    const near = nearestRgba(image, 1);
    expect([near.width, near.height]).toEqual([1, 1]);
    expect(new Set(Array.from(near.data.slice(0, 3))).size).toBe(1);
    expect([0, 255]).toContain(near.data[0]);
  });
});

describe('the twin variant', () => {
  it('is written beside the twins by asset.add with digest named files 320 wide and found by the readers', async () => {
    const before = (await store.read()).document.deck.revision;
    const asset = await assetAdd(deps, ctx, {
      file: ROSETTA,
      role: 'other',
      alt: 'Rosetta',
      baseRevision: before,
    });
    const variant = twinVariantOf(asset);
    expect(variant).toBeDefined();
    expect(variant?.size[0]).toBe(TWIN_VARIANT_SIZE[0]);
    expect(variant?.scale).toBe(1);
    const files =
      'neutral' in variant!.twins
        ? [variant!.twins.neutral]
        : [variant!.twins.light, variant!.twins.dark];
    for (const file of files) {
      expect(file).toMatch(TWIN_VARIANT_FILE_PATTERN);
      expect(existsSync(join(dir, file))).toBe(true);
      const decoded = await decodeImage(readFileSync(join(dir, file)));
      expect(decoded.width).toBe(320);
      expect(decoded.height).toBeGreaterThan(0);
    }
    // one commit: the record with the variant is at the next revision
    const document = (await store.read()).document;
    expect(document.deck.revision).toBe(before + 1);
    expect(twinVariantOf(document.deck.assets[asset.id] as Asset)).toBeDefined();
    // the renderer's srcset names the small file first and the stored twin at its width
    const fullTwin = 'neutral' in asset.twins ? asset.twins.neutral : asset.twins.light;
    const srcset = twinSrcset(asset, 'light', `/d/${fullTwin}`, (path) => `/d/${path}`);
    expect(srcset).toMatch(
      /^\/d\/assets\/[^ ]+-320(?:-light)?\.png 320w, \/d\/assets\/[^ ]+ \d+w$/,
    );
    // a second write is the same files
    const again = await writeTwinVariant(deps, { ...asset, variants: undefined } as Asset);
    expect(again?.existed).toBe(true);
    expect(again?.key).toBe(variant?.key);
  });

  it('picture.materialize --clone writes the variant for every picture asset once and is idempotent', async () => {
    const document = (await store.read()).document;
    const pictures = Object.values(document.deck.assets).filter(isPictureAsset);
    expect(pictures.length).toBeGreaterThan(0);
    const before = document.deck.revision;
    const first = await pictureMaterialize(deps, ctx, { baseRevision: before, clone: true });
    expect(first.written.map((row) => row.assetId).sort()).toEqual(
      pictures.map((asset) => asset.id).sort(),
    );
    expect(first.revision).toBe(before + 1);
    const after = (await store.read()).document;
    for (const asset of Object.values(after.deck.assets).filter(isPictureAsset)) {
      const variant = twinVariantOf(asset);
      expect(variant).toBeDefined();
      for (const file of 'neutral' in variant!.twins
        ? [variant!.twins.neutral]
        : [variant!.twins.light, variant!.twins.dark])
        expect(existsSync(join(dir, file))).toBe(true);
    }
    const second = await pictureMaterialize(deps, ctx, {
      baseRevision: after.deck.revision,
      clone: true,
    });
    expect(second.written).toEqual([]);
    expect(second.revision).toBe(after.deck.revision);
    // a plain materialize (no clone) writes no twin variant on a deck with no dithered picture
    const plain = await pictureMaterialize(deps, ctx, { baseRevision: after.deck.revision });
    expect(plain.written).toEqual([]);
  });
});
