import { describe, expect, it } from 'vitest';

import {
  CEILINGS,
  SAMPLE_FRACTIONS,
  SETTLE_EVERY_MS,
  SETTLE_MAX_MS,
  STORE_WINDOW_MS,
  classifyStoreCalls,
  foldSamples,
  judgeRow,
  ownReadsIn,
  quietFor,
  routeOf,
  serverFnKind,
  summarize,
} from './sync-cost-probe.mjs';
import { costRows } from './core-matrix.mjs';

// The cost probe's judgement (docs/SYNC.md 6.1, 6.3), without a browser: every cost row has a
// ceiling, the samples fold to a maximum per operation per instance, simple and advanced are
// counted as the pricing page counts them, a row over its ceiling fails, a deployment run without
// the counters is not driven with the reason, a localhost run asserts the function requests alone,
// and the request log classifies a poll, a static asset and a function request.

describe('the ceilings', () => {
  it('cover every cost probe row of the matrix and nothing else', () => {
    expect(Object.keys(CEILINGS).sort()).toEqual(
      costRows()
        .map((r) => r.id)
        .sort(),
    );
    expect(SAMPLE_FRACTIONS).toHaveLength(5);
    expect(SAMPLE_FRACTIONS[SAMPLE_FRACTIONS.length - 1]).toBe(1);
  });
});

describe('the store call samples', () => {
  const sample = (instance, head, get, put, list, del = 0) => ({
    counters: 'present',
    storeCalls: { head, get, put, list, del, windowMs: 60_000, instance },
  });

  it('keep the maximum per operation per instance and count the instances', () => {
    const folded = foldSamples([
      sample('i1', 10, 2, 3, 0),
      sample('i1', 30, 1, 2, 1),
      sample('i2', 5, 5, 5, 0),
      { counters: 'absent', storeCalls: null },
    ]);
    expect(folded.instances.sort()).toEqual(['i1', 'i2']);
    expect(folded.byInstance.i1).toEqual({ head: 30, get: 2, put: 3, list: 1, del: 0 });
    expect(folded.max).toEqual({ head: 30, get: 5, put: 5, list: 1, del: 0 });
  });

  it('count simple as head plus get and advanced as put plus list; del is free', () => {
    expect(classifyStoreCalls({ head: 30, get: 5, put: 5, list: 1, del: 7 })).toEqual({
      simple: 35,
      advanced: 6,
      head: 30,
      get: 5,
      put: 5,
      list: 1,
      del: 7,
    });
    expect(classifyStoreCalls(undefined).simple).toBe(0);
  });
});

describe('the settle before the window', () => {
  it('counts the probe’s own reads inside a sample’s window, the sample itself among them', () => {
    const t = 1_000_000;
    const reads = [t - 70_000, t - 60_000, t - 59_000, t - 30_000, t];
    /* (at - 60 s, at]: the read at exactly 60 s before is out, the one at 59 s in, the sample in */
    expect(ownReadsIn(reads, t)).toBe(3);
    expect(ownReadsIn(reads, t, 20_000)).toBe(1);
    expect(ownReadsIn([], t)).toBe(0);
    expect(STORE_WINDOW_MS).toBe(60_000);
    expect(SETTLE_EVERY_MS).toBeLessThan(SETTLE_MAX_MS);
  });

  it('reads the store quiet of the setup once no list is in the window, and for the show once nothing but the probe’s heads is', () => {
    const c = (o) => ({
      head: 0,
      get: 0,
      put: 0,
      list: 0,
      del: 0,
      windowMs: 60_000,
      instance: 'i',
      ...o,
    });
    /* the setup's card render: one put and one list at the deck's rest (card-thumb.ts, thumbs.ts) */
    expect(quietFor('cost.two-tabs-idle.calls', c({ head: 38, put: 19, list: 1, del: 1 }), 1)).toBe(
      false,
    );
    expect(quietFor('cost.two-tabs-idle.calls', c({ head: 34, put: 18, list: 0, del: 3 }), 1)).toBe(
      true,
    );
    expect(quietFor('sync.pull.no-listing', c({ head: 12, put: 3, list: 1 }), 2)).toBe(false);
    expect(quietFor('cost.editor-idle.calls', c({ head: 30, put: 18 }), 1)).toBe(true);
    /* the show: the editor tab's late close (its heads, the flush's put, the prune's list) */
    expect(quietFor('cost.show.calls', c({ head: 9, put: 1, list: 1 }), 1)).toBe(false);
    expect(quietFor('cost.show.calls', c({ head: 3, put: 1 }), 3)).toBe(false);
    expect(quietFor('cost.show.calls', c({ head: 3 }), 2)).toBe(false);
    expect(quietFor('cost.show.calls', c({ head: 2 }), 2)).toBe(true);
    expect(quietFor('cost.show.calls', c({ head: 1 }), 1)).toBe(true);
    /* no counters (a localhost base, a build without storeCalls): quiet at once */
    expect(quietFor('cost.show.calls', null, 0)).toBe(true);
    expect(quietFor('cost.two-tabs-idle.calls', undefined, 0)).toBe(true);
  });
});

describe('judgeRow', () => {
  const base = {
    minutes: 3,
    functionRequests: 27,
    functionPerMinute: 9,
    polls: 9,
    failedRequests: 0,
    connected: true,
    instances: 1,
    store: classifyStoreCalls({ head: 30, get: 5, put: 5, list: 0, del: 0 }),
  };

  it('passes an idle editor under its ceilings and names the counts beside them', () => {
    const v = judgeRow('cost.editor-idle.calls', base, 'present');
    expect(v.result).toBe('passed');
    expect(v.measures.join(' | ')).toContain('function requests 9 a minute (ceiling 12');
    expect(v.measures.join(' | ')).toContain(
      "store simple 35 a minute (ceiling 40; 0 of the heads the probe's own sync.status reads, which the ceiling carries, b3.md R7 b)",
    );
    expect(v.measures.join(' | ')).toContain('store advanced 5 a minute (ceiling 11)');
  });

  it('fails a row over any one ceiling and names which', () => {
    const fn = judgeRow('cost.editor-idle.calls', { ...base, functionPerMinute: 14 }, 'present');
    expect(fn.result).toBe('failed');
    expect(fn.reason).toContain('function requests 14 a minute over 12');
    const store = judgeRow(
      'cost.editor-idle.calls',
      { ...base, store: classifyStoreCalls({ head: 60, get: 10, put: 5, list: 0, del: 0 }) },
      'present',
    );
    expect(store.result).toBe('failed');
    expect(store.reason).toContain('store simple 70 a minute over 40');
    const polls = judgeRow(
      'cost.editor-hidden.calls',
      { ...base, functionPerMinute: 4, polls: 2 },
      'present',
    );
    expect(polls.result).toBe('failed');
    expect(polls.reason).toContain('2 session poll(s), ceiling none');
  });

  it('records a not driven hidden row with its visibility reason, whatever the visible tab read', () => {
    const v = judgeRow(
      'cost.editor-hidden.calls',
      {
        ...base,
        functionPerMinute: 4,
        polls: 0,
        notDriven: 'document.visibilityState read "visible"',
      },
      'present',
    );
    expect(v.result).toBe('not driven');
    expect(v.reason).toContain('visibilityState');
    /* the visible tab's 12 requests and 3 polls are over the hidden ceilings, and the row is still
       not driven: the state was never reached (the first --all smoke read it as failed) */
    const visible = judgeRow(
      'cost.editor-hidden.calls',
      {
        ...base,
        functionPerMinute: 12,
        polls: 3,
        notDriven: 'document.visibilityState read "visible"',
      },
      'zero',
    );
    expect(visible.result).toBe('not driven');
    expect(visible.measures.join(' ')).toContain('stayed visible');
  });

  it('asserts the function requests alone on a localhost base, and the two tab state', () => {
    const local = judgeRow(
      'cost.editor-idle.calls',
      { ...base, store: classifyStoreCalls({}) },
      'zero',
    );
    expect(local.result).toBe('passed');
    expect(local.measures.join(' | ')).toContain('the store half reads zero on this base');
    const tabs = judgeRow(
      'cost.two-tabs-idle.calls',
      { ...base, store: classifyStoreCalls({}), mutual: true },
      'zero',
    );
    expect(tabs.result).toBe('passed');
    const alone = judgeRow(
      'cost.two-tabs-idle.calls',
      { ...base, store: classifyStoreCalls({}), mutual: false },
      'zero',
    );
    expect(alone.result).toBe('failed');
    expect(alone.reason).toContain('never listed each other');
  });

  it('is not driven on a deployment whose counters cannot be read, and says why', () => {
    const noBearer = judgeRow('cost.editor-idle.calls', base, 'no-bearer');
    expect(noBearer.result).toBe('not driven');
    expect(noBearer.reason).toContain('no bearer for sync.status');
    const absent = judgeRow('cost.editor-idle.calls', base, 'absent');
    expect(absent.result).toBe('not driven');
    expect(absent.reason).toContain('B3');
    /* a row over its function ceiling fails even when the store half is unreadable */
    const over = judgeRow('cost.editor-idle.calls', { ...base, functionPerMinute: 20 }, 'absent');
    expect(over.result).toBe('failed');
  });

  it('judges the show on no function request and the first sample of the counters', () => {
    const quiet = judgeRow(
      'cost.show.calls',
      {
        ...base,
        functionRequests: 0,
        functionPerMinute: 0,
        polls: 0,
        store: classifyStoreCalls({ head: 4, get: 0, put: 0, list: 0, del: 0 }),
        firstSampleStore: classifyStoreCalls({}),
      },
      'present',
    );
    expect(quiet.result).toBe('passed');
    /* the probe's own sync.status read is one deck.json head (b3.md R7 b) and is not the page's:
       a first sample of head 1 with one own read passes, head 2 with one own read is the page's */
    const ownOnly = judgeRow(
      'cost.show.calls',
      {
        ...base,
        functionRequests: 0,
        functionPerMinute: 0,
        polls: 0,
        store: classifyStoreCalls({ head: 2, get: 0, put: 0, list: 0, del: 0 }),
        firstSampleStore: { ...classifyStoreCalls({ head: 1 }), own: 1 },
        settle: {
          settled: true,
          ms: 92_400,
          samples: 10,
          first: classifyStoreCalls({ head: 9, put: 1, list: 1 }),
          last: classifyStoreCalls({ head: 1 }),
          own: 1,
        },
      },
      'present',
    );
    expect(ownOnly.result).toBe('passed');
    expect(ownOnly.measures.join(' | ')).toContain(
      "of which 1 the probe's own sync.status read(s) (one deck.json head each, b3.md R7 b); the page's 0 (ceiling 0)",
    );
    expect(ownOnly.measures.join(' | ')).toContain(
      'the store settled 92.40 s after the state was ready (10 sync.status read(s) before the window; the first read: head 9, put 1, list 1, del 0)',
    );
    const pagesHead = judgeRow(
      'cost.show.calls',
      {
        ...base,
        functionRequests: 0,
        functionPerMinute: 0,
        polls: 0,
        store: classifyStoreCalls({ head: 2 }),
        firstSampleStore: { ...classifyStoreCalls({ head: 2 }), own: 1 },
      },
      'present',
    );
    expect(pagesHead.result).toBe('failed');
    expect(pagesHead.reason).toContain(
      "1 store call(s) in the window beyond the probe's own reads, ceiling none",
    );
    /* a put or a list is never the probe's, whatever `own` reads */
    const put = judgeRow(
      'cost.show.calls',
      {
        ...base,
        functionRequests: 0,
        functionPerMinute: 0,
        polls: 0,
        store: classifyStoreCalls({ head: 1, put: 1 }),
        firstSampleStore: { ...classifyStoreCalls({ head: 1, put: 1 }), own: 3 },
      },
      'present',
    );
    expect(put.result).toBe('failed');
    /* a settle that never quieted is recorded with its last read and the window's reading stands */
    const busy = judgeRow(
      'cost.show.calls',
      {
        ...base,
        functionRequests: 0,
        functionPerMinute: 0,
        polls: 0,
        store: classifyStoreCalls({ head: 1 }),
        firstSampleStore: { ...classifyStoreCalls({ head: 1 }), own: 1 },
        settle: {
          settled: false,
          ms: 150_300,
          samples: 16,
          first: classifyStoreCalls({ head: 9, put: 1, list: 1 }),
          last: classifyStoreCalls({ head: 3, put: 1 }),
          own: 1,
        },
        functionRequestsBeforeWindow: 0,
      },
      'present',
    );
    expect(busy.result).toBe('passed');
    expect(busy.measures.join(' | ')).toContain(
      "the store did not settle within 150.30 s and the window started anyway (the last read before it: head 3, get 0, put 1, list 0, del 0, 1 of the heads the probe's own)",
    );
    expect(busy.measures.join(' | ')).toContain(
      'function requests between the load and the window 0',
    );
    const polling = judgeRow(
      'cost.show.calls',
      {
        ...base,
        functionRequests: 6,
        functionPerMinute: 2,
        polls: 6,
        firstSampleStore: classifyStoreCalls({}),
      },
      'present',
    );
    expect(polling.result).toBe('failed');
    expect(polling.reason).toContain('6 function request(s) in the window');
  });

  it("judges the pull row on the pull's own listing (lists.versions), the commits and the words landing, and records the deck's other listings by folder", () => {
    const counts = {
      ...base,
      commits: 10,
      landed: true,
      store: classifyStoreCalls({ head: 40, get: 12, put: 30, list: 0, del: 0 }),
    };
    expect(judgeRow('sync.pull.no-listing', counts, 'present').result).toBe('passed');
    /* counters that do not name the folder (an older deployment): the whole count is judged */
    const listed = judgeRow(
      'sync.pull.no-listing',
      { ...counts, store: classifyStoreCalls({ head: 40, get: 12, put: 30, list: 3, del: 0 }) },
      'present',
    );
    expect(listed.result).toBe('failed');
    expect(listed.reason).toContain('store list 3, ceiling none');
    /* the folders named: a first open's assets/ listing and the card render's thumbs/ listing
       inside the window are recorded and never fail the row; the pull's versions/ listing does
       (VERIFICATION.md "Sync and costs round, pass 2" F2) */
    const lists = {
      versions: 0,
      snapshots: 0,
      assets: 1,
      thumbs: 1,
      presence: 0,
      deck: 0,
      other: 0,
    };
    const named = judgeRow(
      'sync.pull.no-listing',
      {
        ...counts,
        store: classifyStoreCalls({ head: 118, get: 25, put: 65, list: 2, del: 3, lists }),
      },
      'present',
    );
    expect(named.result).toBe('passed');
    expect(named.measures.join(' | ')).toContain('by folder: assets 1, thumbs 1');
    expect(named.measures.join(' | ')).toContain("the pull's own listing (versions) 0");
    const pulled = judgeRow(
      'sync.pull.no-listing',
      {
        ...counts,
        store: classifyStoreCalls({
          head: 118,
          get: 25,
          put: 65,
          list: 3,
          del: 3,
          lists: { ...lists, versions: 1 },
        }),
      },
      'present',
    );
    expect(pulled.result).toBe('failed');
    expect(pulled.reason).toContain('the pull listed versions/ 1 time(s)');
    expect(
      foldSamples([
        { storeCalls: { instance: 'a', list: 1, lists: { versions: 0, assets: 1 } } },
        { storeCalls: { instance: 'a', list: 2, lists: { versions: 1, assets: 1 } } },
        { storeCalls: { instance: 'b', list: 1, lists: { thumbs: 1 } } },
      ]).max,
    ).toMatchObject({ list: 2, lists: { versions: 1, assets: 1, thumbs: 1 } });
    const lost = judgeRow('sync.pull.no-listing', { ...counts, landed: false }, 'zero');
    expect(lost.result).toBe('failed');
    expect(lost.reason).toContain('A never read every word');
    expect(judgeRow('sync.pull.no-listing', { ...counts, commits: 7 }, 'zero').result).toBe(
      'failed',
    );
  });

  it('refuses a row that is not the cost probe’s', () => {
    expect(() => judgeRow('decks.home.new-presentation', base, 'present')).toThrow(RangeError);
  });
});

describe('the request log', () => {
  const origin = 'turboslide.example';
  it('classifies documents, the api and the server functions as function requests and assets as static', () => {
    expect(routeOf(`https://${origin}/edit/abc`, origin)).toEqual({
      route: '/edit/<id> (document)',
      kind: 'function',
    });
    expect(routeOf(`https://${origin}/api/decks/abc/presence`, origin).route).toBe(
      '/api/decks/<id>/presence',
    );
    expect(routeOf(`https://${origin}/_serverFn/abcdef1234567890`, origin)).toEqual({
      route: '/_serverFn/abcdef12…',
      kind: 'function',
    });
    expect(routeOf(`https://${origin}/assets/inter.css`, origin).kind).toBe('static');
    expect(routeOf(`https://${origin}/brand/figure.png`, origin).kind).toBe('static');
    expect(routeOf('https://x.public.blob.vercel-storage.com/decks/a/thumb.png', origin).kind).toBe(
      'store',
    );
    expect(routeOf(`https://other.example/x`, origin).kind).toBe('other');
  });

  it('names the session poll, the attach and the answer from a server function body', () => {
    expect(serverFnKind('{"data":"{\\"id\\":\\"s1\\",\\"timeoutMs\\":0}"}')).toBe('poll');
    expect(serverFnKind('{"deckId":"d","owner":{"kind":"editor"}}')).toBe('attach');
    expect(serverFnKind('{"id":"s1","answer":{"ok":true}}')).toBe('answer');
    expect(serverFnKind(null)).toBe('other');
  });

  it('sums a window per route and per minute and counts the polls', () => {
    const t0 = 1_000_000;
    const records = [
      {
        t: t0 + 10,
        route: '/api/decks/<id>/presence',
        kind: 'function',
        method: 'POST',
        status: 200,
        failed: null,
        fn: null,
      },
      {
        t: t0 + 20,
        route: '/_serverFn/aaaaaaaa…',
        kind: 'function',
        method: 'POST',
        status: 200,
        failed: null,
        fn: 'poll',
      },
      {
        t: t0 + 30,
        route: 'assets/* (static)',
        kind: 'static',
        method: 'GET',
        status: 200,
        failed: null,
        fn: null,
      },
      {
        t: t0 + 40,
        route: '/api/decks/<id>/ops',
        kind: 'function',
        method: 'POST',
        status: 503,
        failed: null,
        fn: null,
      },
      {
        t: t0 + 70_000,
        route: '/api/decks/<id>/presence',
        kind: 'function',
        method: 'POST',
        status: 200,
        failed: null,
        fn: null,
      },
    ];
    const s = summarize(records, t0, t0 + 60_000);
    expect(s.requests).toBe(4);
    expect(s.functionRequests).toBe(3);
    expect(s.functionPerMinute).toBe(3);
    expect(s.polls).toBe(1);
    expect(s.failedRequests).toBe(1);
    expect(s.rows[0].route).toBeDefined();
  });
});
