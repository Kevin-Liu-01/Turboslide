// The server side window actions that create a /new draft's deck before they run (docs/FOCUS.md
// rank 6; audit-images row 1: the first upload on a fresh draft answered "No deck in the Blob
// store"): every one writes this deck's document, so the deck must exist first, the way the
// draft's first `writeDeck` creates it; the collection actions name other decks and never do.
import { describe, expect, it } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

import {
  DRAFT_CREATING_ACTIONS,
  SERVER_SIDE_WINDOW_ACTIONS,
  SERVER_SIDE_WINDOW_ACTIONS_F1,
  SERVER_SIDE_WINDOW_ACTIONS_F1_IDS,
  SERVER_SIDE_WINDOW_ACTIONS_F2,
  SERVER_SIDE_WINDOW_ACTIONS_F2_IDS,
  SHADER_DRAFT_CREATING_IDS,
  createsDraft,
  outputAccepts,
  registerStoreStatusActions,
} from './agent-actions';

describe('createsDraft', () => {
  it('names the server side actions that write this deck, each a mutating window action', () => {
    for (const action of DRAFT_CREATING_ACTIONS) {
      expect(SERVER_SIDE_WINDOW_ACTIONS).toContain(action);
      expect(ACTIONS[action].mutates).toBe(true);
      expect(createsDraft(action)).toBe(true);
    }
    expect(createsDraft('asset.add')).toBe(true);
    expect(createsDraft('slide.import')).toBe(true);
  });

  it('carries the logo picker’s three ids once the action table names them (docs/FEATURES.md 4.11)', () => {
    // the pattern of SERVER_SIDE_WINDOW_ACTIONS_PENDING: the list is filtered through the table,
    // so on a tree before B6's entries land it is empty and nothing here is claimed
    expect([...SERVER_SIDE_WINDOW_ACTIONS_F1_IDS]).toEqual([
      'logo.search',
      'logo.insert',
      'logo.refresh',
    ]);
    for (const id of SERVER_SIDE_WINDOW_ACTIONS_F1_IDS) {
      if (!isActionId(id)) {
        expect(SERVER_SIDE_WINDOW_ACTIONS_F1).not.toContain(id);
        continue;
      }
      expect(SERVER_SIDE_WINDOW_ACTIONS_F1).toContain(id);
      expect(SERVER_SIDE_WINDOW_ACTIONS).toContain(id);
      expect(createsDraft(id)).toBe(id === 'logo.insert');
      if (id === 'logo.insert') expect(ACTIONS[id].mutates).toBe(true);
    }
  });

  it('carries the shader library’s ids once the action table names them (docs/FEATURES.md 5.8)', () => {
    // the same filter as the logo ids: empty on a tree before B5's entries land, every named id
    // on both lists once they do, the writes creating a /new draft's deck
    expect([...SERVER_SIDE_WINDOW_ACTIONS_F2_IDS]).toEqual([
      'shader.list',
      'shader.insert',
      'shader.set',
      'shader.frame',
      'shader.capture',
      'shader.render',
      'slide.setBackgroundShader',
    ]);
    // the ids as strings: a literal outside the table narrows to never under `isActionId`
    const named: readonly string[] = SERVER_SIDE_WINDOW_ACTIONS_F2_IDS;
    for (const id of named) {
      if (!isActionId(id)) {
        expect(SERVER_SIDE_WINDOW_ACTIONS_F2).not.toContain(id);
        continue;
      }
      expect(SERVER_SIDE_WINDOW_ACTIONS_F2).toContain(id);
      expect(SERVER_SIDE_WINDOW_ACTIONS).toContain(id);
      const writes = SHADER_DRAFT_CREATING_IDS.has(id);
      expect(createsDraft(id)).toBe(writes);
      expect(ACTIONS[id].mutates).toBe(writes);
    }
    expect([...SHADER_DRAFT_CREATING_IDS]).toEqual([
      'shader.insert',
      'shader.set',
      'shader.frame',
      'shader.capture',
      'slide.setBackgroundShader',
    ]);
  });

  it('leaves the collection actions and the reads alone', () => {
    for (const action of [
      'deck.list',
      'deck.copy',
      'deck.trash',
      'deck.restore',
      'deck.remove',
      'material.list',
      'presence.list',
      'comment.add',
    ] as const) {
      expect(createsDraft(action)).toBe(false);
    }
  });
});

// The store status handlers of the sync and costs round (docs/SYNC.md 6.3, 3.6): `sync.status`
// answers the store's view with the call counters once the table names `storeCalls`, and
// `deck.info` counts the log's records and holes once the table names them. A fake store with a
// log that misses record 2; the dispatcher parses every answer against the table, so the test
// passes on a tree before and after the integrator's schema entries land.
describe('registerStoreStatusActions', () => {
  const record = (n: number): VersionRecord => ({
    n,
    revision: 412 + n,
    baseRevision: 411 + n,
    author: { kind: 'human', name: 'kevin' },
    note: '',
    createdAt: '2026-09-21T10:00:00.000Z',
    mutations: [],
    inverse: [],
  });
  const store = {
    id: 'gt-brand',
    read: async () => ({ document: workedDocument(), issues: [], ok: true }),
    revision: async () => 415,
    records: async () => [record(1), record(3)],
    snapshots: async () => 7,
  } as unknown as DeckStore;

  it('answers sync.status with the store’s position, and storeCalls once the table names it', async () => {
    const dispatcher = createDispatcher();
    registerStoreStatusActions(dispatcher, { deckId: 'gt-brand', store, tier: 'blob' });
    const status = (await dispatcher.dispatch(
      'sync.status',
      {},
      { author: { kind: 'human', name: 'kevin' } },
    )) as Record<string, unknown>;
    expect(status).toMatchObject({
      seq: 415,
      revision: 415,
      pending: 0,
      retained: 0,
      tier: 'blob',
      transport: 'file',
      connected: false,
    });
    if (outputAccepts('sync.status', ['storeCalls'])) {
      expect(status.storeCalls).toMatchObject({ windowMs: 60_000 });
      expect((status.storeCalls as { instance: string }).instance).toMatch(/^[0-9a-f]{8}$/);
    } else {
      expect(status).not.toHaveProperty('storeCalls');
    }
  });

  it('answers deck.info with the reader’s counts, the snapshots, and the records and holes once the table names them', async () => {
    const dispatcher = createDispatcher();
    registerStoreStatusActions(dispatcher, { deckId: 'gt-brand', store, tier: 'blob' });
    const info = (await dispatcher.dispatch(
      'deck.info',
      {},
      { author: { kind: 'human', name: 'kevin' } },
    )) as { id: string; revision: number; counts: Record<string, number | undefined> };
    expect(info.id).toBe('gt-brand');
    expect(info.counts.slides).toBeGreaterThan(0);
    expect(info.counts.snapshots).toBe(7);
    if (outputAccepts('deck.info', ['counts', 'records'])) {
      expect(info.counts.records).toBe(2);
      expect(info.counts.holes).toBe(1);
    } else {
      expect(info.counts).not.toHaveProperty('records');
      expect(info.counts).not.toHaveProperty('holes');
    }
  });

  it('reads the table’s output shape by path', () => {
    expect(outputAccepts('deck.info', ['counts', 'slides'])).toBe(true);
    expect(outputAccepts('deck.info', ['counts', 'snapshots'])).toBe(true);
    expect(outputAccepts('deck.info', ['counts', 'never-a-field'])).toBe(false);
    expect(outputAccepts('sync.status', ['revision'])).toBe(true);
    expect(outputAccepts('sync.status', ['revision', 'deeper'])).toBe(false);
  });
});
