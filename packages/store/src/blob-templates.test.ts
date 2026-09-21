// The saved templates across instances on the blob tier (the product round fix round;
// docs/PRODUCT.md 4.3; VERIFICATION.md "Product round, pass 1" finding 2): two blob collections
// over one fake store stand in for two function instances. A template saved and pushed on one
// lists on the other after a pull, a deck is made from it there, a rename and a deletion travel,
// the deployment default travels, a pull with nothing moved is one head, and the seed's own
// templates are never removed by a pull.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import {
  TEMPLATES_INDEX_PATH,
  TEMPLATES_PREFIX,
  parseTemplatesIndex,
  templateFolderFiles,
} from './blob-templates.ts';
import { loadDeckDir } from './file-store.ts';
import { openHostedDecks } from './hosted.ts';
import type { HostedDecks } from './hosted.ts';
import { directorySeed } from './seed.ts';
import { selectStore } from './select.ts';
import {
  deleteTemplate,
  readDefaultTemplateId,
  readTemplateIndex,
  renameTemplate,
  saveTemplate,
  setDefaultTemplate,
} from './templates.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** The worked deck as a seed folder with a template cut from it, as hosted.test.ts writes it. */
function writeSeedDecks(root: string): void {
  const deck = join(root, 'gt-brand');
  mkdirSync(join(deck, 'slides'), { recursive: true });
  mkdirSync(join(deck, 'assets'), { recursive: true });
  writeFileSync(join(deck, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(deck, 'slides', `${slide.id}.json`), canonicalJson(slide));
  for (const asset of Object.values(WORKED_DECK.assets))
    for (const twin of Object.values(asset.twins)) writeFileSync(join(deck, twin), PNG);
  const template = join(root, 'templates', 'gt-brand');
  mkdirSync(join(template, 'slides'), { recursive: true });
  writeFileSync(join(template, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(template, 'slides', `${slide.id}.json`), canonicalJson(slide));
  writeFileSync(
    join(template, 'template.json'),
    canonicalJson({
      schemaVersion: 1,
      id: 'gt-brand',
      name: 'GT brand deck',
      description: 'the worked deck as a template',
      theme: 'gt-ink-paper',
      deck: 'deck.json',
      slides: 'slides',
      assets: '../../gt-brand/assets',
      sections: [],
      archetypes: [],
      // the committed record carries the flag (decks/templates/gt-brand/template.json)
      organisation: true,
    }),
  );
}

describe('the saved templates across two blob instances', () => {
  let root: string;
  let seedRoot: string;
  let fake: FakeBlobClient;
  let a: HostedDecks;
  let b: HostedDecks;
  let clock = '2026-09-20T10:00:00.000Z';
  const now = (): string => clock;

  const collection = (overlay: string): HostedDecks =>
    openHostedDecks({
      selection: selectStore({ TURBOSLIDE_STORE: 'blob', BLOB_READ_WRITE_TOKEN: 'test' }),
      workspaceDecksDir: null,
      overlayRoot: overlay,
      seed: directorySeed(seedRoot),
      blob: fake,
      now,
    });

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-blob-templates-'));
    seedRoot = join(root, 'seed');
    writeSeedDecks(seedRoot);
    clock = '2026-09-20T10:00:00.000Z';
    fake = memoryBlobClient(undefined, { now });
    a = collection(join(root, 'overlay-a'));
    b = collection(join(root, 'overlay-b'));
    await a.ready();
    await b.ready();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Saves the seed deck as a template on `decks`, the way saveDeckAsTemplate does, and pushes it. */
  async function saveOn(decks: HostedDecks, name: string, sentence?: string): Promise<string> {
    await decks.open('gt-brand');
    await decks.ensureAssets('gt-brand');
    const saved = saveTemplate(
      decks.decksDir,
      { deckId: 'gt-brand', name, ...(sentence === undefined ? {} : { sentence }) },
      { now },
    );
    await decks.templates.push({ id: saved.id });
    return saved.id;
  }

  const ids = (decks: HostedDecks): string[] => readTemplateIndex(decks.decksDir).map((r) => r.id);

  it('lists a template saved on one instance on the other after a pull, and makes a deck from it there', async () => {
    const id = await saveOn(a, 'Acme sales 2026', 'The sales deck every seller starts from');
    expect(id).toBe('acme-sales-2026');
    // the store holds the folder and the index
    const keys = [...fake.blobs.keys()].filter((key) => key.startsWith(TEMPLATES_PREFIX)).sort();
    expect(keys).toContain(`${TEMPLATES_PREFIX}acme-sales-2026/template.json`);
    expect(keys).toContain(`${TEMPLATES_PREFIX}acme-sales-2026/deck.json`);
    expect(keys).toContain(TEMPLATES_INDEX_PATH);
    const index = parseTemplatesIndex(
      JSON.parse(new TextDecoder().decode(fake.blobs.get(TEMPLATES_INDEX_PATH)!.bytes)),
    );
    expect(Object.keys(index?.templates ?? {})).toEqual(['acme-sales-2026']);
    expect(Object.keys(index?.templates['acme-sales-2026']?.files ?? {}).sort()).toEqual(
      templateFolderFiles(join(a.decksDir, 'templates', 'acme-sales-2026')),
    );
    // the other instance lists blank and the seed alone until it pulls
    expect(ids(b)).toEqual(['gt-brand']);
    await b.templates.pull();
    expect(ids(b)).toEqual(['gt-brand', 'acme-sales-2026']);
    const row = readTemplateIndex(b.decksDir).find((r) => r.id === 'acme-sales-2026');
    expect(row).toMatchObject({
      name: 'Acme sales 2026',
      description: 'The sales deck every seller starts from',
      organisation: true,
      slides: WORKED_SLIDES.length,
    });
    // the pulled folder is the saved folder, byte for byte
    for (const relative of templateFolderFiles(join(a.decksDir, 'templates', 'acme-sales-2026'))) {
      expect(
        readFileSync(join(b.decksDir, 'templates', 'acme-sales-2026', ...relative.split('/'))),
      ).toEqual(
        readFileSync(join(a.decksDir, 'templates', 'acme-sales-2026', ...relative.split('/'))),
      );
    }
    // a deck from the saved template on the instance that never saved it
    const created = await b.create({ name: 'Acme pitch', from: 'acme-sales-2026' });
    const made = loadDeckDir(join(b.decksDir, created.deckId)).document;
    expect(Object.keys(made.slides)).toHaveLength(WORKED_SLIDES.length);
    expect(made.deck.title).toBe('Acme pitch');
  });

  it('carries a rename, a replacement and a deletion, and the deployment default, to the other instance', async () => {
    const id = await saveOn(a, 'Acme sales 2026');
    await b.templates.pull();
    expect(ids(b)).toContain(id);
    // a rename on A: the index's stamp moves, B reads the new name
    clock = '2026-09-20T10:01:00.000Z';
    renameTemplate(a.decksDir, { id, name: 'Acme sales 2027' });
    await a.templates.push({ id });
    await b.templates.pull();
    expect(readTemplateIndex(b.decksDir).find((r) => r.id === id)?.name).toBe('Acme sales 2027');
    // the same name saved again replaces it (saveTemplate keeps the slug) and B reads the stamp
    clock = '2026-09-20T10:02:00.000Z';
    const again = await saveOn(a, 'Acme sales 2027', 'Replaced');
    expect(again).toBe('acme-sales-2027');
    await b.templates.pull();
    expect(
      readTemplateIndex(b.decksDir)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['acme-sales-2026', 'acme-sales-2027', 'gt-brand'].sort());
    // the default set on A reaches B
    setDefaultTemplate(a.decksDir, 'acme-sales-2027');
    await a.templates.push();
    expect(readDefaultTemplateId(b.decksDir)).toBe('blank');
    await b.templates.pull();
    expect(readDefaultTemplateId(b.decksDir)).toBe('acme-sales-2027');
    // a deletion on A removes the folder and the row on B, and nothing else
    setDefaultTemplate(a.decksDir, 'blank');
    deleteTemplate(a.decksDir, { id });
    await a.templates.push({ id, removed: true });
    expect(
      [...fake.blobs.keys()].filter((key) => key.startsWith(`${TEMPLATES_PREFIX}${id}/`)),
    ).toEqual([]);
    await b.templates.pull();
    expect(existsSync(join(b.decksDir, 'templates', id))).toBe(false);
    expect(ids(b).sort()).toEqual(['acme-sales-2027', 'gt-brand'].sort());
    expect(readDefaultTemplateId(b.decksDir)).toBe('blank');
  });

  it('costs one head when nothing moved, and never removes the seed’s own templates', async () => {
    await saveOn(a, 'Acme sales 2026');
    await b.templates.pull();
    fake.calls.length = 0;
    await b.templates.pull();
    expect(fake.calls.map((call) => [call.op, call.pathname])).toEqual([
      ['head', TEMPLATES_INDEX_PATH],
    ]);
    // a fresh instance holds the seed's gt-brand (organisation on its record) and a pull of an
    // index that names other templates alone leaves it in place
    const c = collection(join(root, 'overlay-c'));
    await c.ready();
    await c.templates.pull();
    expect(ids(c).sort()).toEqual(['acme-sales-2026', 'gt-brand'].sort());
    expect(existsSync(join(c.decksDir, 'templates', 'gt-brand', 'template.json'))).toBe(true);
    // no index in the store: a pull reads one head and changes nothing
    const empty = memoryBlobClient(undefined, { now });
    const lone = openHostedDecks({
      selection: selectStore({ TURBOSLIDE_STORE: 'blob', BLOB_READ_WRITE_TOKEN: 'test' }),
      workspaceDecksDir: null,
      overlayRoot: join(root, 'overlay-lone'),
      seed: directorySeed(seedRoot),
      blob: empty,
      now,
    });
    await lone.ready();
    empty.calls.length = 0;
    await lone.templates.pull();
    expect(empty.calls.map((call) => call.op)).toEqual(['head']);
    expect(ids(lone)).toEqual(['gt-brand']);
  });

  it('reads the index the head names, not the copy the CDN kept from before an overwrite', async () => {
    // the product round's ship step: on Vercel Blob's public store the body read goes through the
    // CDN, whose copy lags an overwrite at the same pathname for a few seconds, so a gallery on
    // another instance listed a deleted template 1 s after the delete; the head names the version
    // and the read waits for the copy carrying it (BlobCallOptions.version)
    const first = await saveOn(a, 'First deck');
    await b.templates.pull();
    expect(ids(b).sort()).toEqual([first, 'gt-brand'].sort());
    fake.holdGet();
    const second = await saveOn(a, 'Second deck');
    const pull = b.templates.pull();
    await new Promise((resolve) => setTimeout(resolve, 60));
    // until the release, b's list stands as it was (the read waits instead of applying the old copy)
    expect(ids(b).sort()).toEqual([first, 'gt-brand'].sort());
    fake.releaseGet();
    await pull;
    expect(ids(b).sort()).toEqual([first, 'gt-brand', second].sort());
    // a delete on a travels the same way
    fake.holdGet();
    deleteTemplate(a.decksDir, { id: first });
    const removal = a.templates.push({ id: first, removed: true });
    await new Promise((resolve) => setTimeout(resolve, 60));
    fake.releaseGet();
    await removal;
    await b.templates.pull();
    expect(ids(b).sort()).toEqual(['gt-brand', second].sort());
  });

  it('keeps a page up when the store refuses a read for now: the pull is skipped and the next one lands', async () => {
    // the product round's ship step, the enforce preview: the public store's edge answered
    // "Failed to fetch blob: 403 Forbidden" on the just written index for minutes after every
    // index push, and a pull that threw took /new, the editor and the gallery to 500 with it
    // (pulse.ts isStoreBusy names the answer). A pull is a read into this instance's mirror, so
    // a refusal leaves the mirror standing and the next pull reads the store again
    const first = await saveOn(a, 'First deck');
    fake.failNextGet(
      TEMPLATES_INDEX_PATH,
      new Error('Vercel Blob: Failed to fetch blob: 403 Forbidden'),
    );
    await expect(b.templates.pull()).resolves.toBeUndefined();
    expect(ids(b)).toEqual(['gt-brand']);
    await b.templates.pull();
    expect(ids(b).sort()).toEqual([first, 'gt-brand'].sort());
    // a defect of the store is still a failure of the pull, never swallowed
    const second = await saveOn(a, 'Second deck');
    fake.failNextGet(TEMPLATES_INDEX_PATH, new TypeError('a defect the store named'));
    await expect(b.templates.pull()).rejects.toThrow('a defect the store named');
    await b.templates.pull();
    expect(ids(b).sort()).toEqual([first, 'gt-brand', second].sort());
  });

  it('puts the index before it deletes the folder, so a lost index write leaves the store consistent', async () => {
    const id = await saveOn(a, 'Doomed deck');
    deleteTemplate(a.decksDir, { id });
    fake.failNextPut(TEMPLATES_INDEX_PATH, new Error('the network dropped the put'));
    await expect(a.templates.push({ id, removed: true })).rejects.toThrow('the network dropped');
    // the folder is still in the store and the index still names it: another instance's pull holds
    expect(fake.blobs.has(`${TEMPLATES_PREFIX}${id}/template.json`)).toBe(true);
    await b.templates.pull();
    expect(ids(b).sort()).toEqual([id, 'gt-brand'].sort());
    // the push again finishes the delete
    await a.templates.push({ id, removed: true });
    expect(fake.blobs.has(`${TEMPLATES_PREFIX}${id}/template.json`)).toBe(false);
    await b.templates.pull();
    expect(ids(b)).toEqual(['gt-brand']);
  });

  it('skips a template the index names whose folder is gone, falls back to blank for it, and drops it on the next push', async () => {
    // the store the ship step found: a delete's folder removal landed and its index write did not
    const lost = await saveOn(a, 'Lost deck');
    const kept = await saveOn(a, 'Kept deck');
    setDefaultTemplate(a.decksDir, lost);
    await a.templates.push();
    for (const key of [...fake.blobs.keys()])
      if (key.startsWith(`${TEMPLATES_PREFIX}${lost}/`)) fake.blobs.delete(key);
    // the pull lands the other template and the default falls back to blank; nothing throws
    await b.templates.pull();
    expect(ids(b).sort()).toEqual([kept, 'gt-brand'].sort());
    expect(readDefaultTemplateId(b.decksDir)).toBe('blank');
    // b's next push drops the lost template from the store's index
    setDefaultTemplate(b.decksDir, kept);
    await b.templates.push();
    const index = parseTemplatesIndex(
      JSON.parse(new TextDecoder().decode(fake.blobs.get(TEMPLATES_INDEX_PATH)!.bytes)),
    );
    expect(Object.keys(index?.templates ?? {})).toEqual([kept]);
    expect(index?.default).toBe(kept);
    // and a pull on the instance that saved it (its folder still local) follows the index
    await a.templates.pull();
    expect(ids(a).sort()).toEqual([kept, 'gt-brand'].sort());
  });

  it('folds a push into an index another instance wrote in between, so neither template is lost', async () => {
    // both save before either pushes; the second push meets the first's index and merges
    await a.open('gt-brand');
    await a.ensureAssets('gt-brand');
    await b.open('gt-brand');
    await b.ensureAssets('gt-brand');
    const one = saveTemplate(a.decksDir, { deckId: 'gt-brand', name: 'From A' }, { now });
    const two = saveTemplate(b.decksDir, { deckId: 'gt-brand', name: 'From B' }, { now });
    await a.templates.push({ id: one.id });
    await b.templates.push({ id: two.id });
    const index = parseTemplatesIndex(
      JSON.parse(new TextDecoder().decode(fake.blobs.get(TEMPLATES_INDEX_PATH)!.bytes)),
    );
    expect(Object.keys(index?.templates ?? {}).sort()).toEqual(['from-a', 'from-b']);
    await a.templates.pull();
    await b.templates.pull();
    expect(ids(a).sort()).toEqual(['from-a', 'from-b', 'gt-brand'].sort());
    expect(ids(b).sort()).toEqual(['from-a', 'from-b', 'gt-brand'].sort());
  });
});
