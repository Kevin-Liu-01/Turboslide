import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessRecord } from '@turboslide/identity/access';
import { synthesizeLegacyRecord, tokenHash } from '@turboslide/identity/access';
import { parsePrincipalId } from '@turboslide/identity/ids';

import { bindAuthorize, boundDecide } from './authorize';
import { setSecurityLogSink } from './log';
import type { SecurityLine } from './log';

// The deck card's rule (GF-2.1, deck-card.ts): a link unfurls with its first slide only when a
// stranger holding only that address may read the deck, through the deck's open general access
// or the address's live publish token. The decision is the real `decide()` over the records
// below; the store is a stand in that serves the slide orders the card reads.

type StoredDeck = {
  sections: { slideIds: string[] }[];
  skipped?: string[];
  trashedAt?: string | null;
};
const stored = new Map<string, StoredDeck>();
const drafts = new Set<string>();

vi.mock('./root', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./root')>();
  return {
    ...actual,
    isUnsavedDraft: (deckId: string) => Promise.resolve(drafts.has(deckId)),
    openDeckStore: (deckId: string) => {
      const deck = stored.get(deckId);
      if (deck === undefined) return Promise.reject(new RangeError(`no deck ${deckId}`));
      const slides: Record<string, { skip?: true }> = {};
      for (const id of deck.sections.flatMap((section) => section.slideIds))
        slides[id] = deck.skipped?.includes(id) === true ? { skip: true } : {};
      return Promise.resolve({
        read: () =>
          Promise.resolve({
            document: {
              deck: { sections: deck.sections, trashedAt: deck.trashedAt ?? null },
              slides,
            },
            issues: [],
          }),
      });
    },
  };
});

const { cardSlideOf, cardStanding, readerCardStanding, strangerContext } =
  await import('./deck-card');

const NOW = '2026-10-15T00:00:00.000Z';
const TOKEN = 'pub_card_token_0123456789';

function record(deckId: string, over: Partial<AccessRecord>): AccessRecord {
  return {
    ...synthesizeLegacyRecord(deckId),
    owner: 'usr_owner',
    createdBy: 'usr_owner',
    generalAccess: { mode: 'restricted', role: 'viewer' },
    ...over,
  };
}

const published = (revokedAt: string | null): AccessRecord['publish'] => ({
  hash: tokenHash(TOKEN),
  publishedAt: NOW,
  publishedBy: 'usr_owner',
  revokedAt,
});

const records = new Map<string, AccessRecord>([
  [
    'open-deck',
    record('open-deck', { owner: null, generalAccess: { mode: 'open', role: 'viewer' } }),
  ],
  ['kept-deck', record('kept-deck', {})],
  ['link-deck', record('link-deck', { generalAccess: { mode: 'link', role: 'viewer' } })],
  ['published-deck', record('published-deck', { publish: published(null) })],
  ['revoked-deck', record('revoked-deck', { publish: published(NOW) })],
]);

let lines: SecurityLine[] = [];
let loads = 0;

beforeEach(() => {
  lines = [];
  loads = 0;
  bindAuthorize({
    decide: boundDecide,
    loadRecord: (deckId) => {
      loads += 1;
      return Promise.resolve(records.get(deckId) ?? null);
    },
    now: () => Date.parse(NOW),
  });
  setSecurityLogSink((line) => lines.push(line));
});

afterEach(() => {
  bindAuthorize({ loadRecord: () => Promise.resolve(null) });
  setSecurityLogSink(undefined);
  stored.clear();
  drafts.clear();
});

describe('strangerContext', () => {
  it('is a fresh anonymous principal with no link grant, holding only a well formed token', () => {
    const a = strangerContext();
    const b = strangerContext(TOKEN);
    expect(parsePrincipalId(a.principal?.id ?? '')?.kind).toBe('anonymous');
    expect(a.principal?.id).not.toBe(b.principal?.id);
    expect(a.principal?.admin).toBe(false);
    expect(a.linkGrants).toEqual([]);
    expect(a.agent).toBeUndefined();
    expect(a.publishToken).toBeUndefined();
    expect(b.publishToken).toBe(TOKEN);
    expect(strangerContext('not a token!').publishToken).toBeUndefined();
  });
});

describe('cardStanding', () => {
  it('admits an open deck and a live publish token, and nothing else', async () => {
    const standing = async (deckId: string, token?: string) =>
      (await cardStanding(deckId, token)).standing;
    expect(await standing('open-deck')).toBe('open');
    // a token on an open deck changes nothing: the general access already admits the stranger
    expect(await standing('open-deck', TOKEN)).toBe('open');
    expect(await standing('published-deck', TOKEN)).toBe('publish');
    expect(await standing('kept-deck')).toBeNull();
    expect(await standing('kept-deck', TOKEN)).toBeNull();
    expect(await standing('link-deck')).toBeNull();
    expect(await standing('published-deck')).toBeNull();
    expect(await standing('published-deck', 'pub_some_other_token_99')).toBeNull();
    expect(await standing('missing-deck')).toBeNull();
  });

  it('carries the refusal, the 410 of a revoked token included', async () => {
    expect((await cardStanding('revoked-deck', TOKEN)).decision).toEqual({
      ok: false,
      status: 410,
      code: 'gone',
    });
    expect((await cardStanding('kept-deck', undefined)).decision).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("logs the picture request's refusal and never a page's probe", async () => {
    await cardStanding('kept-deck', undefined, { transport: 'route' });
    expect(lines.map((line) => [line.event, line.action, line.status])).toEqual([
      ['authorize.deny', 'deck.card', 404],
    ]);
    lines = [];
    await cardStanding('kept-deck', undefined, { probe: true });
    await cardStanding('revoked-deck', TOKEN, { probe: true });
    expect(lines).toEqual([]);
  });
});

describe('readerCardStanding', () => {
  it("answers a reader who came in as anyone would from the reader's own via, with no read", async () => {
    expect(await readerCardStanding('open-deck', undefined, 'open')).toBe('open');
    expect(await readerCardStanding('published-deck', TOKEN, 'publish')).toBe('publish');
    expect(loads).toBe(0);
  });

  it('asks as a stranger for every other reader, so the owner of a restricted deck gets no card', async () => {
    expect(await readerCardStanding('kept-deck', undefined, 'owner')).toBeNull();
    expect(await readerCardStanding('link-deck', undefined, 'link')).toBeNull();
    expect(await readerCardStanding('open-deck', undefined, 'owner')).toBe('open');
    expect(await readerCardStanding('published-deck', TOKEN, 'owner')).toBe('publish');
    expect(await readerCardStanding('revoked-deck', TOKEN, 'admin')).toBeNull();
    expect(loads).toBe(5);
    expect(lines).toEqual([]);
  });
});

describe('cardSlideOf', () => {
  it('is the first slide in section order that is not skipped', async () => {
    stored.set('q4', { sections: [{ slideIds: [] }, { slideIds: ['intro', 'plan'] }] });
    expect(await cardSlideOf('q4')).toBe('intro');
    stored.set('q4', { sections: [{ slideIds: ['intro', 'plan'] }], skipped: ['intro'] });
    expect(await cardSlideOf('q4')).toBe('plan');
  });

  it('is null for a deck in the trash, with no shown slide, unsaved or missing', async () => {
    stored.set('gone', { sections: [{ slideIds: ['intro'] }], trashedAt: NOW });
    stored.set('hidden', { sections: [{ slideIds: ['intro'] }], skipped: ['intro'] });
    stored.set('draft', { sections: [{ slideIds: ['intro'] }] });
    drafts.add('draft');
    expect(await cardSlideOf('gone')).toBeNull();
    expect(await cardSlideOf('hidden')).toBeNull();
    expect(await cardSlideOf('draft')).toBeNull();
    expect(await cardSlideOf('missing')).toBeNull();
    expect(await cardSlideOf('../etc')).toBeNull();
  });
});
