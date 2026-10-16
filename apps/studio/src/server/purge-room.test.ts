// The function's half of the purge (RELIABILITY-20; hardening HR-RT#13): `deck.remove` calls
// `purgeRoom` once the store removed the deck, and an instance on the do tier posts
// `/rooms/:id/purge` under the bearer, so the deck's Durable Object deletes its entries, rows and
// alarm (the object's half is apps/realtime-worker/test/purge.test.ts). A purge the Worker does
// not answer is logged and never fails the removal. The Worker is a fake fetch here.
import { afterAll, describe, expect, it, vi } from 'vitest';

const ENV: Record<string, string> = {
  TURBOSLIDE_REALTIME: 'do',
  TURBOSLIDE_ROOM_HOST: 'rooms.example.test',
  TURBOSLIDE_ROOM_SECRET: 'a-room-secret-for-the-purge-test-0123456789',
  TURBOSLIDE_ROOM_BEARER: 'a-room-bearer-for-the-purge-test-0123456789',
};
const saved: Record<string, string | undefined> = {};
for (const [name, value] of Object.entries(ENV)) {
  saved[name] = process.env[name];
  process.env[name] = value;
}

type Seen = { method: string; url: string; authorization: string | null };
const seen: Seen[] = [];
let purgeStatus = 200;
vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  seen.push({
    method: init?.method ?? 'GET',
    url,
    authorization: new Headers(init?.headers).get('authorization'),
  });
  if (url.endsWith('/health'))
    return Response.json({ ok: true, protocol: 1, commit: '', realtime: 'on', appOrigin: '' });
  return Response.json({ ok: purgeStatus === 200, purged: true }, { status: purgeStatus });
});

const { purgeRoom } = await import('./room');

afterAll(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('purgeRoom (HR-RT#13)', () => {
  it('posts the purge of the removed deck to its object under the bearer', async () => {
    await purgeRoom('a-removed-deck');
    const purges = seen.filter((call) => call.url.endsWith('/purge'));
    expect(purges).toEqual([
      {
        method: 'POST',
        url: 'https://rooms.example.test/rooms/a-removed-deck/purge',
        authorization: `Bearer ${ENV.TURBOSLIDE_ROOM_BEARER}`,
      },
    ]);
  });

  it('logs a purge the Worker refused and lets the removal stand', async () => {
    purgeStatus = 503;
    const lines: string[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    await expect(purgeRoom('another-deck')).resolves.toBeUndefined();
    error.mockRestore();
    expect(seen.filter((call) => call.url.endsWith('/rooms/another-deck/purge'))).toHaveLength(1);
    expect(lines.join('\n')).toContain(
      'another-deck: the object was not purged after the removal: the realtime Worker answered 503 on purge',
    );
  });
});
