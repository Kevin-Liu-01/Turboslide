import { describe, expect, it } from 'vitest';

import { memoryBlobClient } from './blob-fake.ts';
import {
  FRESH_DECKS_MAX,
  FRESH_DECKS_PATH,
  FRESH_DECK_TTL_MS,
  freshDeckIds,
  freshDeckIdsOf,
  freshDecksBytes,
  noteFreshDeck,
  parseFreshDecks,
  withFreshDeck,
} from './blob-store.ts';

// The fresh deck index (the product round; RETURN VERIFICATION R2-F2): one record at a fixed
// pathname names the decks made in the last two minutes, so a listing on another instance shows
// a new deck before the store's folder listing does. Pure rows, then the record over the fake.

const T0 = Date.parse('2026-09-19T12:00:00.000Z');
const iso = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

describe('the fresh deck rows', () => {
  it('adds a deck newest first, drops the stale rows and repeats of the id, and caps the record', () => {
    const rows = withFreshDeck([], 'a', iso(0));
    expect(rows).toEqual([{ id: 'a', at: iso(0) }]);
    const two = withFreshDeck(rows, 'b', iso(1_000));
    expect(two.map((row) => row.id)).toEqual(['b', 'a']);
    // the same id noted again moves to the front once
    expect(withFreshDeck(two, 'a', iso(2_000)).map((row) => row.id)).toEqual(['a', 'b']);
    // a row past the ttl leaves when the next deck is noted
    const later = withFreshDeck(two, 'c', iso(FRESH_DECK_TTL_MS + 1_500));
    expect(later.map((row) => row.id)).toEqual(['c']);
    const many = Array.from({ length: FRESH_DECKS_MAX + 5 }, (_, i) => ({
      id: `d${i}`,
      at: iso(i),
    }));
    expect(withFreshDeck(many, 'e', iso(FRESH_DECKS_MAX + 5))).toHaveLength(FRESH_DECKS_MAX);
  });

  it('reads the ids younger than the ttl and nothing from a malformed record', () => {
    const rows = [
      { id: 'young', at: iso(0) },
      { id: 'old', at: iso(-FRESH_DECK_TTL_MS - 1) },
    ];
    expect(freshDeckIdsOf(rows, T0)).toEqual(['young']);
    expect(freshDeckIdsOf(rows, T0 + FRESH_DECK_TTL_MS + 1)).toEqual([]);
    expect(parseFreshDecks(freshDecksBytes(rows))).toEqual(rows);
    expect(parseFreshDecks(null)).toEqual([]);
    expect(parseFreshDecks(new TextEncoder().encode('not json'))).toEqual([]);
    expect(parseFreshDecks(new TextEncoder().encode('{"v":2,"decks":[]}'))).toEqual([]);
    // an id that is not a safe key never reaches the listing
    expect(
      parseFreshDecks(
        new TextEncoder().encode(
          JSON.stringify({
            v: 1,
            decks: [
              { id: '../x', at: iso(0) },
              { id: 'ok', at: 'never' },
            ],
          }),
        ),
      ),
    ).toEqual([]);
    expect(FRESH_DECKS_PATH.startsWith('decks/')).toBe(false);
  });
});

describe('the fresh deck record over the store', () => {
  it('notes a deck with one get and one put under the record’s version, and lists it until the ttl', async () => {
    const fake = memoryBlobClient();
    expect(await noteFreshDeck(fake, 'q4-review', iso(0))).toBe(true);
    expect(fake.calls.map((call) => call.op)).toEqual(['get', 'put']);
    expect(await noteFreshDeck(fake, 'acme-copy', iso(5_000))).toBe(true);
    expect(await freshDeckIds(fake, T0 + 6_000)).toEqual(['acme-copy', 'q4-review']);
    expect(await freshDeckIds(fake, T0 + FRESH_DECK_TTL_MS + 6_000)).toEqual([]);
  });

  it('tries a lost race once more and never throws; a record it cannot read lists nothing', async () => {
    const fake = memoryBlobClient();
    await noteFreshDeck(fake, 'first', iso(0));
    // another instance wrote between this instance's get and put: the fake refuses the stale
    // version once, the second try reads the new version and lands
    const racing = {
      ...fake,
      put: (() => {
        let raced = false;
        return async (
          pathname: string,
          bytes: Uint8Array,
          options: Parameters<typeof fake.put>[2],
        ) => {
          if (!raced && options.ifMatch !== undefined) {
            raced = true;
            await fake.put(pathname, freshDecksBytes([{ id: 'other', at: iso(1) }]), {
              overwrite: true,
            });
          }
          return fake.put(pathname, bytes, options);
        };
      })(),
    };
    expect(await noteFreshDeck(racing, 'second', iso(2))).toBe(true);
    expect(await freshDeckIds(fake, T0 + 10)).toEqual(['second', 'other']);
    const lines: string[] = [];
    const failing = {
      ...fake,
      put: async () => {
        throw new Error('Vercel Blob: Too many requests');
      },
    };
    expect(await noteFreshDeck(failing, 'third', iso(3), (line) => lines.push(line))).toBe(false);
    expect(lines[0]).toContain('the fresh deck index was not written for third');
    const unreadable = {
      ...fake,
      get: async () => {
        throw new Error('Vercel Blob: Too many requests');
      },
    };
    expect(await freshDeckIds(unreadable, T0 + 10)).toEqual([]);
  });
});
