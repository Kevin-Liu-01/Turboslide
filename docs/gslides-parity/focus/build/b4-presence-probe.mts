// A reading probe for b4.md C3T-R1 and C3T-R2 (the b4 fixer, 2026-09-18): two sharedPresence
// instances over one fake Blob store, the shape of presence-store.test.ts, run as
// `node docs/gslides-parity/focus/build/b4-presence-probe.mts` from the repository root (Node runs
// the TypeScript source, AGENTS.md erasable syntax). Prints what the store does; asserts nothing.
import { memoryBlobClient } from '../../../../packages/store/src/blob-fake.ts';
import {
  parsePresenceRecord,
  presencePath,
  sharedPresence,
} from '../../../../packages/store/src/presence-store.ts';

const DECK = 'probe-deck';
const C1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const C2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TTL = 120_000;
const row = (clientId: string, clock: number, label: string) => ({
  clientId,
  clock,
  slideId: 'cover',
  label,
});
const clock = (() => {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
})();

function instance(client: any, name: string, pushSpacingMs = 0) {
  const seen: string[] = [];
  const errors: string[] = [];
  const presence = sharedPresence<any>({
    client,
    now: clock.now,
    pushSpacingMs,
    pollMs: 2000,
    publish: (_d: string, e: any) =>
      seen.push(`${e.type}:${e.clientId.slice(0, 2)}${e.clock !== undefined ? '@' + e.clock : ''}`),
    proven: { fetchFresh: async () => null, sleep: async () => {}, retries: 0 },
    onError: (error: unknown, context: string) =>
      errors.push(`${context}: ${error instanceof Error ? error.message : String(error)}`),
  });
  return { presence, seen, errors, name };
}
const record = (client: any) => {
  const stored = client.blobs.get(presencePath(DECK));
  if (!stored) return 'no record';
  const p = parsePresenceRecord<any>(stored.bytes);
  return `rows [${[...p.rows.keys()].map((k) => k.slice(0, 2))}] left [${[...p.left.entries()].map(([k, at]) => `${k.slice(0, 2)}@${typeof at === 'object' && at !== null ? at.at : at}`)}]`;
};
const puts = (client: any) => client.calls.filter((c: any) => c.op === 'put').length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- C3T-R1: a push whose read did not prove the record schedules no retry
{
  console.log('== C3T-R1: the unproven read and the waiting leave');
  const base = memoryBlobClient();
  let copiesHidden = false;
  const client = new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === 'get')
        return async (pathname: string) => {
          if (copiesHidden && pathname.includes('/presence/')) return null; // the copy under the head's version is not found
          return target.get(pathname);
        };
      return Reflect.get(target, prop, receiver);
    },
  });
  const a = instance(client, 'a');
  const b = instance(client, 'b');
  await a.presence.set(DECK, C1, row(C1, 1, 'A'), TTL); // a's row lands (record v1, copy v1)
  base.holdGet(); // the CDN lags: get() keeps answering v1 from here on
  await b.presence.set(DECK, C2, row(C2, 1, 'B'), TTL); // b's row lands (record v2): a's remote is behind
  console.log('record after both sets:', record(base), 'puts', puts(base));
  copiesHidden = true; // and the copy under the head's version is not found
  clock.advance(100);
  await a.presence.leave(DECK, C1); // the closed tab's beacon lands on a
  console.log('a.errors after the leave:', JSON.stringify(a.errors));
  console.log('record after the leave:', record(base), 'puts', puts(base));
  base.releaseGet();
  copiesHidden = false; // the store is readable again
  clock.advance(10_000);
  await sleep(150); // past any floor, real time for a timer
  console.log('record 10 s later with no other event:', record(base), 'puts', puts(base));
  await b.presence.poll(DECK);
  console.log(
    'b roster 10 s later:',
    (await b.presence.roster(DECK)).map((r: any) => r.clientId.slice(0, 2)),
  );
  await a.presence.flush(DECK); // the next event on a
  console.log('record after a forced push on a:', record(base), 'puts', puts(base));
  await a.presence.close();
  await b.presence.close();
}

// ---- C3T-R2: a set that runs after its tab's leave lands and replaces the pending leave
{
  console.log('== C3T-R2 (one instance): a set after the leave, both pending');
  const client = memoryBlobClient();
  const a = instance(client, 'a', 60_000); // the floor holds the pushes
  await a.presence.set(DECK, C1, row(C1, 3, 'A'), TTL);
  await a.presence.flush(DECK);
  console.log('record:', record(client));
  clock.advance(100);
  await a.presence.leave(DECK, C1); // the beacon (the client would post clock 5)
  clock.advance(50);
  await a.presence.set(DECK, C1, row(C1, 4, 'A'), TTL); // the set whose handler ran after the leave
  console.log(
    'a roster after leave then set:',
    (await a.presence.roster(DECK)).map((r: any) => r.clientId.slice(0, 2)),
    'events',
    a.seen.join(' '),
  );
  await a.presence.flush(DECK);
  console.log('record after the push:', record(client));
  await a.presence.close();
}
{
  console.log(
    '== C3T-R2 (two instances): the tombstone landed, then the set on the other instance',
  );
  const client = memoryBlobClient();
  const a = instance(client, 'a');
  const b = instance(client, 'b');
  await a.presence.set(DECK, C1, row(C1, 3, 'A'), TTL);
  clock.advance(100);
  await a.presence.leave(DECK, C1); // the tombstone lands at once (spacing 0)
  console.log('record after the leave on a:', record(client));
  clock.advance(50);
  await b.presence.set(DECK, C1, row(C1, 2, 'A'), TTL); // the late set on b, a lower clock than the leave's
  console.log('record after the late set on b:', record(client));
  await a.presence.poll(DECK);
  console.log(
    'a roster after its poll:',
    (await a.presence.roster(DECK)).map((r: any) => r.clientId.slice(0, 2)),
    'a events',
    a.seen.join(' '),
  );
  await a.presence.close();
  await b.presence.close();
}
