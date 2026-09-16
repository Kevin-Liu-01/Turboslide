// The state files of the Blob mirror (gslides-parity SPEC-5-amendments A3 item 6; SPEC-5 10; B7,
// the fix round of VERIFICATION-5 findings 3 and 14): small documents under the deck's state
// folder that the blob channel shares between instances. A read is one head call and the body
// only when the version moved; a body that does not hash to the head's etag (the CDN serving an
// overwritten name stale) is read again and answered unproven when it never catches up; a write
// is a compare and swap on the version or a create under a new name; the listing is a lower
// bound; a name outside the state folder is refused.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import {
  BlobExistsError,
  BlobPreconditionError,
  openBlobStore,
  pushDeckDir,
  STATE_FILE_READ_RETRIES,
} from './blob-store.ts';
import type { BlobStore } from './blob-store.ts';

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);
const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('the state files of the Blob mirror', () => {
  let root: string;
  let fake: FakeBlobClient;
  let a: BlobStore;
  let b: BlobStore;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-blob-state-'));
    const seed = join(root, 'seed', 'gt-brand');
    mkdirSync(join(seed, 'slides'), { recursive: true });
    writeFileSync(join(seed, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(join(seed, 'slides', `${slide.id}.json`), canonicalJson(slide));
    fake = memoryBlobClient();
    await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
    a = openBlobStore({ client: fake, deckId: 'gt-brand', dir: join(root, 'a', 'gt-brand') });
    b = openBlobStore({ client: fake, deckId: 'gt-brand', dir: join(root, 'b', 'gt-brand') });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates once, swaps on the version, and answers an unchanged version from the copy', async () => {
    expect(await a.readStateFile('presence.json')).toBeNull();
    const created = await a.putStateFile('presence.json', bytesOf('{"rows":[]}'), { create: true });
    expect(fake.blobs.has('decks/gt-brand/.turboslide/presence.json')).toBe(true);
    // a second create meets the name
    await expect(
      b.putStateFile('presence.json', bytesOf('{"rows":[1]}'), { create: true }),
    ).rejects.toBeInstanceOf(BlobExistsError);
    // the other instance reads it proven
    const read = await b.readStateFile('presence.json');
    expect(read).toMatchObject({ name: 'presence.json', version: created.version, proven: true });
    expect(textOf(read?.bytes ?? new Uint8Array())).toBe('{"rows":[]}');
    // an unchanged version is one head call, no body
    const before = fake.calls.length;
    const again = await b.readStateFile('presence.json', {
      version: created.version,
      bytes: read?.bytes ?? new Uint8Array(),
    });
    expect(again?.proven).toBe(true);
    expect(fake.calls.slice(before).map((call) => call.op)).toEqual(['head']);
    // the swap on the version, and a stale version refused
    const swapped = await b.putStateFile('presence.json', bytesOf('{"rows":[2]}'), {
      ifMatch: created.version,
    });
    await expect(
      a.putStateFile('presence.json', bytesOf('{"rows":[3]}'), { ifMatch: created.version }),
    ).rejects.toBeInstanceOf(BlobPreconditionError);
    const fresh = await a.readStateFile('presence.json', {
      version: created.version,
      bytes: bytesOf('{"rows":[]}'),
    });
    expect(fresh).toMatchObject({ version: swapped.version, proven: true });
    expect(textOf(fresh?.bytes ?? new Uint8Array())).toBe('{"rows":[2]}');
    // the delete, and a missing file after it
    await a.deleteStateFile('presence.json');
    expect(await b.readStateFile('presence.json')).toBeNull();
    await a.deleteStateFile('presence.json');
  });

  it('reads a body the CDN serves stale again and answers it unproven when it never catches up', async () => {
    const first = await a.putStateFile('presence.json', bytesOf('one'), { create: true });
    await b.readStateFile('presence.json');
    fake.holdGet();
    await a.putStateFile('presence.json', bytesOf('two'), { ifMatch: first.version });
    const before = fake.calls.length;
    const stale = await b.readStateFile('presence.json');
    expect(stale?.proven).toBe(false);
    expect(textOf(stale?.bytes ?? new Uint8Array())).toBe('one');
    // one head, then the body STATE_FILE_READ_RETRIES + 1 times
    expect(fake.calls.slice(before).filter((call) => call.op === 'get')).toHaveLength(
      STATE_FILE_READ_RETRIES + 1,
    );
    fake.releaseGet();
    const caught = await b.readStateFile('presence.json');
    expect(caught?.proven).toBe(true);
    expect(textOf(caught?.bytes ?? new Uint8Array())).toBe('two');
  });

  it('lists a folder of the state folder by name and refuses a name outside it', async () => {
    await a.putStateFile('chat/1.json', bytesOf('{"n":1}'), { create: true });
    await a.putStateFile('chat/2.json', bytesOf('{"n":2}'), { create: true });
    expect((await b.listStateFiles('chat')).map((file) => file.name)).toEqual([
      'chat/1.json',
      'chat/2.json',
    ]);
    expect(await b.listStateFiles('nothing')).toEqual([]);
    for (const bad of ['', '/x.json', '../deck.json', 'chat/', '.turboslide/x.json', 'a/./b']) {
      await expect(a.readStateFile(bad)).rejects.toBeInstanceOf(RangeError);
    }
    // the deck's documents are untouched by the state files
    expect(fake.blobs.has('decks/gt-brand/deck.json')).toBe(true);
    expect(await a.revision()).toBe(412);
  });
});
