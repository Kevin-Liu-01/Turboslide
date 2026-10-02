import { describe, expect, it } from 'vitest';

import {
  CEILINGS,
  DO_ROWS,
  TIER_WORDS,
  counterBucket,
  counterDelta,
  counterHour,
  isDoRow,
  roomRequestsOf,
  roomTarget,
  roomWindow,
  wentBack,
  PRESENCE_COMMANDS,
  SAMPLE_FRACTIONS,
  TIER_CEILINGS,
  ceilingsFor,
  commandDelta,
  editorHour,
  parseCommandstats,
  presenceApart,
  redisTarget,
  respCommand,
  respParse,
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

describe('the realtime round (docs/REALTIME.md section 2): the Redis command row and the tiers', () => {
  it('restates the three store ceilings on the redis tier and keeps them elsewhere', () => {
    expect(ceilingsFor('cost.editor-idle.calls', 'redis')).toEqual({
      functionPerMinute: 12,
      simplePerMinute: 10,
      advancedPerMinute: 2,
    });
    /* the Cloudflare phase restated the redis editing column from the counters (docs/CLOUDFLARE.md 2.2) */
    expect(ceilingsFor('cost.editor-editing.calls', 'redis')).toEqual({
      functionPerMinute: 75,
      simplePerMinute: 40,
      advancedPerMinute: 65,
    });
    expect(ceilingsFor('cost.two-tabs-idle.calls', 'redis')).toEqual({
      list: 0,
      advancedPerMinute: 2,
    });
    expect(ceilingsFor('cost.editor-idle.calls', 'blob')).toEqual(
      CEILINGS['cost.editor-idle.calls'],
    );
    expect(ceilingsFor('cost.editor-idle.calls', null)).toEqual(CEILINGS['cost.editor-idle.calls']);
    expect(ceilingsFor('cost.show.calls', 'redis')).toEqual(CEILINGS['cost.show.calls']);
    expect(ceilingsFor('nothing', 'redis')).toBeUndefined();
    expect(Object.keys(TIER_CEILINGS)).toEqual(['redis', 'do']);
    expect(CEILINGS['cost.redis.commands']).toEqual({ redisCommandsPerHour: 12_000 });
  });

  it('judges a store row by the tier the counts name', () => {
    const counts = {
      minutes: 3,
      functionRequests: 24,
      functionPerMinute: 8,
      polls: 0,
      failedRequests: 0,
      connected: true,
      store: { simple: 20, advanced: 5, head: 20, get: 0, put: 5, list: 0, del: 0 },
      firstSampleStore: {
        simple: 20,
        advanced: 5,
        head: 20,
        get: 0,
        put: 5,
        list: 0,
        del: 0,
        own: 1,
      },
      ownMax: 1,
      instances: 1,
    };
    /* under the blob tier's ceilings 20 simple and 5 advanced pass; under the redis tier's they fail */
    expect(judgeRow('cost.editor-idle.calls', { ...counts, tier: 'blob' }, 'present').result).toBe(
      'passed',
    );
    const redis = judgeRow('cost.editor-idle.calls', { ...counts, tier: 'redis' }, 'present');
    expect(redis.result).toBe('failed');
    expect(redis.reason).toContain('store simple 20 a minute over 10');
    expect(redis.reason).toContain('store advanced 5 a minute over 2');
    expect(redis.measures[0]).toBe('tier redis');
  });

  it('parses INFO commandstats, differences two readings, counts the hour and the presence family apart', () => {
    const before = parseCommandstats(
      '# Commandstats\r\ncmdstat_get:calls=10,usec=100,usec_per_call=10.00\r\ncmdstat_evalsha:calls=3,usec=30,usec_per_call=10.00\r\ncmdstat_hset:calls=1,usec=1,usec_per_call=1.00\r\n',
    );
    expect(before).toEqual({ get: 10, evalsha: 3, hset: 1 });
    const after = { get: 16, evalsha: 9, hset: 8, publish: 7, zadd: 7, info: 2 };
    const delta = commandDelta(before, after);
    expect(delta.byName).toEqual({ get: 6, evalsha: 6, hset: 7, publish: 7, zadd: 7, info: 2 });
    expect(delta.total).toBe(35);
    expect(presenceApart(delta.byName)).toEqual({ presence: 21, evalsha: 6 });
    expect(PRESENCE_COMMANDS).toContain('publish');
    /* 600 commands over 3 editing minutes and 150 over 3 idle minutes: 200 and 50 a minute, the hour 200 × 12 + 50 × 48 */
    expect(editorHour({ commands: 600, minutes: 3 }, { commands: 150, minutes: 3 })).toEqual({
      editingPerMinute: 200,
      idlePerMinute: 50,
      hour: 4800,
    });
    expect(editorHour({ commands: 0, minutes: 0 }, { commands: 0, minutes: 0 }).hour).toBe(0);
  });

  it('names the Redis target without its password and speaks RESP', () => {
    expect(redisTarget('redis://default:s3cret@db.example.net:6380/5')).toEqual({
      host: 'db.example.net',
      port: 6380,
      db: 5,
      tls: false,
    });
    expect(redisTarget('rediss://x.upstash.io')).toEqual({
      host: 'x.upstash.io',
      port: 6379,
      db: 0,
      tls: true,
    });
    expect(JSON.stringify(redisTarget('redis://default:s3cret@h/1'))).not.toContain('s3cret');
    expect(respCommand(['INFO', 'commandstats'])).toBe(
      '*2\r\n$4\r\nINFO\r\n$12\r\ncommandstats\r\n',
    );
    expect(respParse(Buffer.from('+OK\r\n'))).toEqual({ value: 'OK', end: 5 });
    expect(respParse(Buffer.from(':42\r\n'))).toEqual({ value: 42, end: 5 });
    expect(respParse(Buffer.from('$5\r\nhello\r\n'))).toEqual({ value: 'hello', end: 11 });
    expect(respParse(Buffer.from('$-1\r\n'))).toEqual({ value: null, end: 5 });
    expect(respParse(Buffer.from('-ERR no\r\n'))).toEqual({ value: { error: 'ERR no' }, end: 9 });
    expect(respParse(Buffer.from('*2\r\n$1\r\na\r\n:1\r\n'))).toEqual({ value: ['a', 1], end: 15 });
    /* an incomplete bulk string answers null until the rest arrives */
    expect(respParse(Buffer.from('$5\r\nhel'))).toBeNull();
  });

  it('reads the Redis command row as not driven without a URL and judges it on the hour with one', () => {
    const base = {
      minutes: 3,
      functionRequests: 30,
      functionPerMinute: 10,
      polls: 0,
      failedRequests: 0,
      connected: true,
      tier: 'redis',
    };
    const none = judgeRow(
      'cost.redis.commands',
      { ...base, redis: { where: 'no-url', source: 'none' } },
      'zero',
    );
    expect(none.result).toBe('not driven');
    expect(none.reason).toContain('no Redis URL');
    const down = judgeRow(
      'cost.redis.commands',
      {
        ...base,
        redis: {
          where: 'unreachable',
          reason: 'the Redis at h:1 did not answer INFO commandstats: ECONNREFUSED',
          target: { host: 'h', port: 1, db: 0 },
        },
      },
      'zero',
    );
    expect(down.result).toBe('not driven');
    expect(down.reason).toContain('did not answer');
    const redis = {
      where: 'present',
      source: 'REDIS_URL',
      target: { host: 'h', port: 6379, db: 5, tls: false },
      editing: { commands: 600, minutes: 3, presencePosts: 150, opsPosts: 36, byName: {} },
      idle: { commands: 150, minutes: 3, presencePosts: 18, opsPosts: 0, byName: {} },
      byName: { evalsha: 300, publish: 200, hset: 200, get: 50 },
      editingPerMinute: 200,
      idlePerMinute: 50,
      hour: 4800,
      presence: 400,
      evalsha: 300,
      otherDbClients: 2,
    };
    const ok = judgeRow('cost.redis.commands', { ...base, redis }, 'zero');
    expect(ok.result).toBe('passed');
    expect(ok.measures.join(' | ')).toContain('Redis commands an editor hour 4800 (ceiling 12000)');
    expect(ok.measures.join(' | ')).toContain('400 calls of the presence family');
    expect(ok.measures.join(' | ')).toContain('2 client(s) of other databases');
    const over = judgeRow(
      'cost.redis.commands',
      { ...base, redis: { ...redis, hour: 15_000 } },
      'zero',
    );
    expect(over.result).toBe('failed');
    expect(over.reason).toBe('Redis commands an editor hour 15000 over 12000');
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

describe('the Cloudflare phase (docs/CLOUDFLARE.md 2.2): the do tier and the six rows per product', () => {
  it('names the four tier words, the six do rows and the do tier ceilings of the store rows', () => {
    expect(TIER_WORDS).toEqual(['redis', 'blob', 'memory', 'do']);
    expect(DO_ROWS).toEqual([
      'cost.do.requests',
      'cost.do.duration',
      'cost.do.rows-written',
      'cost.d1.reads',
      'cost.d1.writes',
      'cost.worker.requests',
    ]);
    for (const id of DO_ROWS) expect(isDoRow(id), id).toBe(true);
    expect(isDoRow('cost.redis.commands')).toBe(false);
    expect(ceilingsFor('cost.editor-idle.calls', 'do')).toEqual({
      functionPerMinute: 1,
      simplePerMinute: 0,
      advancedPerMinute: 0,
      objectRequestsPerMinute: 0,
      rowsWrittenPerMinute: 0,
    });
    expect(ceilingsFor('cost.editor-editing.calls', 'do')).toEqual({
      functionPerMinute: 15,
      simplePerMinute: 40,
      advancedPerMinute: 65,
      objectRequestsPerMinute: 20,
      rowsWrittenPerMinute: 60,
    });
    expect(ceilingsFor('cost.two-tabs-idle.calls', 'do')).toEqual({
      list: 0,
      advancedPerMinute: 2,
      objectRequestsPerMinute: 0,
    });
    expect(CEILINGS['cost.do.requests']).toEqual({ objectRequestsPerHour: 300 });
    expect(CEILINGS['cost.do.duration']).toEqual({ objectGbsPerHour: 20 });
    expect(CEILINGS['cost.do.rows-written']).toEqual({ rowsWrittenPerHour: 800 });
    expect(CEILINGS['cost.d1.reads']).toEqual({ d1RowsReadPerHour: 300 });
    expect(CEILINGS['cost.d1.writes']).toEqual({ d1RowsWrittenPerHour: 20 });
    expect(CEILINGS['cost.worker.requests']).toEqual({ workerRequestsPerHour: 90 });
  });

  it('reads the Worker counters: the request units by kind or as a number, the deltas with the own reads off, the hour', () => {
    expect(roomRequestsOf({ requests: 12 })).toBe(12);
    expect(roomRequestsOf({ requests: { total: 30, upgrades: 2, messages: 20, alarms: 8 } })).toBe(
      30,
    );
    expect(roomRequestsOf({ requests: { upgrades: 2, messages: 20, alarms: 8 } })).toBe(30);
    expect(roomRequestsOf({})).toBe(0);
    expect(roomRequestsOf(null)).toBe(0);
    /* R1's shape (build/r1.md R1-R5d): the persisted `total` bucket first, then `sinceWake` */
    expect(
      roomRequestsOf({ total: { requests: 50, rowsWritten: 9 }, sinceWake: { requests: 5 } }),
    ).toBe(50);
    expect(roomRequestsOf({ sinceWake: { requests: 5 } })).toBe(5);
    expect(counterBucket({ total: { requests: 1 } }).name).toBe('total');
    expect(counterBucket({ sinceWake: { requests: 1 } }).name).toBe('sinceWake');
    expect(counterBucket({ requests: 1 }).name).toBe('flat');
    expect(
      counterDelta(
        { total: { requests: 10, rowsWritten: 4 } },
        { total: { requests: 14, rowsWritten: 7 } },
        1,
      ),
    ).toEqual({ requests: 3, requestsRaw: 4, rowsRead: 0, rowsWritten: 3, queries: 0, batches: 0 });
    /* an answer that says its own read is not counted keeps every unit */
    expect(
      counterDelta({ requests: 10, countsSelf: false }, { requests: 14, countsSelf: false }, 1)
        .requests,
    ).toBe(4);
    const before = {
      requests: { total: 100 },
      rowsRead: 10,
      rowsWritten: 40,
      queries: 3,
      batches: 1,
    };
    const after = {
      requests: { total: 131 },
      rowsRead: 25,
      rowsWritten: 76,
      queries: 9,
      batches: 1,
    };
    expect(counterDelta(before, after, 1)).toEqual({
      requests: 30,
      requestsRaw: 31,
      rowsRead: 15,
      rowsWritten: 36,
      queries: 6,
      batches: 0,
    });
    /* a missing field reads 0 on either side; the own reads never push the units below 0 */
    expect(counterDelta({}, { rowsWritten: 2 }, 1)).toEqual({
      requests: 0,
      requestsRaw: 0,
      rowsRead: 0,
      rowsWritten: 2,
      queries: 0,
      batches: 0,
    });
    const editing = { minutes: 3, delta: counterDelta(before, after, 1) };
    const idle = {
      minutes: 3,
      delta: counterDelta(after, { ...after, requests: { total: 134 } }, 1),
    };
    /* 10 a minute editing and 2/3 a minute idle: 12 * 10 + 48 * 2/3 = 152 */
    expect(counterHour(editing, idle, 'requests')).toEqual({
      editingPerMinute: 10,
      idlePerMinute: 2 / 3,
      hour: 152,
    });
    expect(roomTarget('rt.example.workers.dev', false, true)).toEqual({
      host: 'rt.example.workers.dev',
      scheme: 'https',
      bearer: 'TURBOSLIDE_ROOM_BEARER',
    });
    expect(roomTarget('127.0.0.1:8795', true, false)).toEqual({
      host: '127.0.0.1:8795',
      scheme: 'http',
      bearer: 'none',
    });
  });

  it('reads the request units, takes the own reads and their own rows off, refuses a field that went back and takes the samples off a window (build/r1.md R1-R5f; VERIFICATION.md "Realtime round, pass 2" P2-6, P2-7)', () => {
    /* the object's units: the fetches, the alarms and the messages at 20:1 */
    expect(
      roomRequestsOf({ total: { requests: 3, alarms: 2, messages: 40, requestUnits: 7 } }),
    ).toBe(7);
    const at = (requestUnits, rowsWritten) => ({
      countsSelf: true,
      selfRowsWritten: 1,
      durable: true,
      total: { requests: 0, rowsWritten, requestUnits },
    });
    /* 36 edits as messages read 1.8 units and the counters read its own unit and its own row */
    expect(counterDelta(at(10, 5), at(12.8, 9), 1)).toEqual({
      requests: 1.8,
      requestsRaw: 2.8,
      rowsRead: 0,
      rowsWritten: 3,
      queries: 0,
      batches: 0,
    });
    /* a field that went back is named with its amount, never clamped to a reading */
    const back = counterDelta(at(10, 9), at(11, 7), 1);
    expect(back.back).toEqual([{ field: 'rowsWritten', amount: -2 }]);
    expect(wentBack(back)).toContain('rowsWritten -2');
    expect(wentBack(counterDelta(at(10, 5), at(12, 6), 1))).toBeNull();
    /* an idle window of two tabs: five samples cost 9 units and 3 rows between their brackets;
       the window's own reads are the closing read and the ten bracket reads */
    const target = { host: '127.0.0.1:8798', scheme: 'http', bearer: 'TURBOSLIDE_ROOM_BEARER' };
    const before = { where: 'present', status: 200, at: 0, body: at(100, 50) };
    const after = { where: 'present', status: 200, at: 1, body: at(120, 64) };
    const probe = { samples: 5, requests: 9, rowsWritten: 3, reads: 10 };
    const w = roomWindow(before, after, 3, probe, target);
    expect(w.where).toBe('present');
    expect(w.window.delta.requests).toBe(0);
    expect(w.window.delta.rowsWritten).toBe(0);
    expect(w.window.ownReads).toBe(11);
    expect(w.window.probe).toEqual(probe);
    /* without the samples taken off the same window reads the probe's own cost */
    const raw = roomWindow(before, after, 3, null, target);
    expect(raw.window.delta.requests).toBe(19);
    expect(raw.window.delta.rowsWritten).toBe(13);
  });

  it('judges the six do rows from one drive: not driven without a source, passed under the ceilings, failed over them', () => {
    const base = {
      minutes: 3,
      functionRequests: 30,
      functionPerMinute: 10,
      polls: 0,
      failedRequests: 0,
      connected: true,
      tier: 'do',
      edits: 36,
      roomRequests: 4,
      roomSockets: 1,
      roomRequestsHour: 32,
      signedIn: false,
    };
    const target = {
      host: 'rt.example.workers.dev',
      scheme: 'https',
      bearer: 'TURBOSLIDE_ROOM_BEARER',
    };
    const window = (requests, rowsRead, rowsWritten, queries, batches) => ({
      requests,
      requestsRaw: requests + 1,
      rowsRead,
      rowsWritten,
      queries,
      batches,
    });
    const room = {
      where: 'present',
      target,
      colo: 'IAD',
      ownReads: 2,
      editing: { minutes: 3, delta: window(45, 20, 120, 0, 0) },
      idle: { minutes: 3, delta: window(0, 0, 0, 0, 0) },
      hour: {},
    };
    const db = {
      where: 'present',
      target,
      ownReads: 2,
      editing: { minutes: 3, delta: window(0, 12, 1, 4, 0) },
      idle: { minutes: 3, delta: window(0, 3, 0, 1, 0) },
      hour: {},
    };
    for (const field of ['requests', 'rowsRead', 'rowsWritten', 'queries', 'batches']) {
      room.hour[field] = counterHour(room.editing, room.idle, field);
      db.hour[field] = counterHour(db.editing, db.idle, field);
    }
    /* another tier: every do row is not driven with the tier named */
    const blob = judgeRow('cost.do.requests', { ...base, tier: 'blob', room, db }, 'zero');
    expect(blob.result).toBe('not driven');
    expect(blob.reason).toBe("a do tier row; this run's tier is blob");
    /* no counters: not driven with the reason the reader gave */
    const none = judgeRow(
      'cost.do.requests',
      {
        ...base,
        room: {
          where: 'no-host',
          reason:
            'no room host (--room-host or TURBOSLIDE_ROOM_HOST): the Worker counters cannot be read',
        },
      },
      'zero',
    );
    expect(none.result).toBe('not driven');
    expect(none.reason).toContain('no room host');
    expect(none.measures.join(' | ')).toContain('the page made 10 function requests a minute');
    /* the counters: 45 units in 3 editing minutes and 0 idle is 180 an hour, under 300 */
    const requests = judgeRow('cost.do.requests', { ...base, room, db }, 'zero');
    expect(requests.result).toBe('passed');
    expect(requests.measures.join(' | ')).toContain(
      'object request units an editor hour 180 (ceiling 300)',
    );
    expect(requests.measures.join(' | ')).toContain("the object's colo IAD");
    /* 120 rows written in 3 editing minutes is 480 an hour, under 800; 300 would be 1200, over */
    expect(judgeRow('cost.do.rows-written', { ...base, room, db }, 'zero').result).toBe('passed');
    const heavy = {
      ...room,
      editing: { minutes: 3, delta: window(45, 20, 300, 0, 0) },
    };
    heavy.hour = {
      ...room.hour,
      rowsWritten: counterHour(heavy.editing, heavy.idle, 'rowsWritten'),
    };
    const over = judgeRow('cost.do.rows-written', { ...base, room: heavy, db }, 'zero');
    expect(over.result).toBe('failed');
    expect(over.reason).toBe('rows written by the object an editor hour 1200 over 800');
    /* the D1 rows: 12 read editing and 3 idle is 48 + 48 = 96 an hour; 1 written editing is 4 an hour */
    const reads = judgeRow('cost.d1.reads', { ...base, room, db }, 'zero');
    expect(reads.result).toBe('passed');
    expect(reads.measures.join(' | ')).toContain(
      'D1 rows read an editor hour 96 (ceiling 300; an anonymous tab',
    );
    expect(judgeRow('cost.d1.writes', { ...base, room, db }, 'zero').result).toBe('passed');
    const noDb = judgeRow(
      'cost.d1.reads',
      { ...base, room, db: { where: 'refused', reason: 'GET /db/counters on rt answered 404' } },
      'zero',
    );
    expect(noDb.result).toBe('not driven');
    expect(noDb.reason).toContain('answered 404');
    /* the dashboard rows: not driven without the file, judged on its figures with it */
    const noDash = judgeRow('cost.do.duration', { ...base, room, db }, 'zero');
    expect(noDash.result).toBe('not driven');
    expect(noDash.reason).toContain('--dashboard <json> with doDurationGbs');
    const dashboard = { readAt: '2026-10-01T20:00:00Z', doDurationGbs: 12.5, workerRequests: 70 };
    const duration = judgeRow('cost.do.duration', { ...base, room, db, dashboard }, 'zero');
    expect(duration.result).toBe('passed');
    expect(duration.measures.join(' | ')).toContain(
      'Durable Object duration for the hour 12.5 GB-s (ceiling 20)',
    );
    expect(
      judgeRow(
        'cost.do.duration',
        { ...base, room, db, dashboard: { ...dashboard, doDurationGbs: 25 } },
        'zero',
      ).result,
    ).toBe('failed');
    /* the Worker requests: an anonymous tab's ceiling is 30, a signed in tab's 90 */
    const worker = judgeRow('cost.worker.requests', { ...base, room, db, dashboard }, 'zero');
    expect(worker.result).toBe('failed');
    expect(worker.reason).toBe('Worker requests for the hour 70 over 30');
    expect(
      judgeRow('cost.worker.requests', { ...base, room, db, dashboard, signedIn: true }, 'zero')
        .result,
    ).toBe('passed');
    expect(judgeRow('cost.worker.requests', { ...base, room, db }, 'zero').result).toBe(
      'not driven',
    );
  });

  it('judges a store row on the do tier by the object half too, and reads it not driven without the counters', () => {
    const counts = {
      minutes: 3,
      functionRequests: 3,
      functionPerMinute: 1,
      polls: 0,
      failedRequests: 0,
      connected: true,
      store: { simple: 0, advanced: 0, head: 0, get: 0, put: 0, list: 0, del: 0 },
      firstSampleStore: {
        simple: 0,
        advanced: 0,
        head: 0,
        get: 0,
        put: 0,
        list: 0,
        del: 0,
        own: 0,
      },
      ownMax: 0,
      instances: 1,
      tier: 'do',
    };
    const target = { host: '127.0.0.1:8795', scheme: 'http', bearer: 'TURBOSLIDE_ROOM_BEARER' };
    const quiet = {
      where: 'present',
      target,
      colo: 'local',
      window: {
        minutes: 3,
        delta: { requests: 0, requestsRaw: 1, rowsRead: 0, rowsWritten: 0, queries: 0, batches: 0 },
        ownReads: 1,
        requestsPerMinute: 0,
        rowsWrittenPerMinute: 0,
      },
    };
    const ok = judgeRow('cost.editor-idle.calls', { ...counts, room: quiet }, 'zero');
    expect(ok.result).toBe('passed');
    expect(ok.measures.join(' | ')).toContain('object request units 0 a minute (ceiling 0');
    expect(ok.measures.join(' | ')).toContain("the object's colo local");
    const busy = {
      ...quiet,
      window: {
        ...quiet.window,
        delta: { ...quiet.window.delta, requests: 6, rowsWritten: 3 },
        requestsPerMinute: 2,
        rowsWrittenPerMinute: 1,
      },
    };
    const over = judgeRow('cost.editor-idle.calls', { ...counts, room: busy }, 'zero');
    expect(over.result).toBe('failed');
    expect(over.reason).toContain('object request units 2 a minute over 0');
    expect(over.reason).toContain('rows written by the object 1 a minute over 0');
    const unread = judgeRow(
      'cost.editor-idle.calls',
      {
        ...counts,
        room: {
          where: 'no-bearer',
          reason:
            'no room bearer (TURBOSLIDE_ROOM_BEARER in the environment): the object half is not driven',
        },
      },
      'zero',
    );
    expect(unread.result).toBe('not driven');
    expect(unread.reason).toContain('no room bearer');
    /* on the blob tier the row carries no object half and the counters are not asked for */
    expect(judgeRow('cost.editor-idle.calls', { ...counts, tier: 'blob' }, 'zero').result).toBe(
      'passed',
    );
  });
});
