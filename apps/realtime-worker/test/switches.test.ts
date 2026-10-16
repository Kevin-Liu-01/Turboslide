import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import { FLAG_NAMES } from '@turboslide/schema/access';

import { dropFlagCache } from '../src/control.ts';

// HR-O#4 (RELIABILITY-15): the studio's kill switches are rows of `rt_flags`, read by every
// instance with `GET /control/flags` and written by `admin.flag` with `POST /control/flags`
// (apps/studio/src/server/flags.ts `workerFlagStore`). A switch takes `on` or `off` alone: a
// mistyped value is refused here instead of reading as the switch's default everywhere. Every
// value here is a test value.

const headers = {
  authorization: `Bearer ${env.TURBOSLIDE_ROOM_BEARER}`,
  'content-type': 'application/json',
};

async function write(body: Record<string, string>): Promise<Response> {
  return SELF.fetch('https://rooms.test/control/flags', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function table(): Promise<Record<string, string>> {
  const answer = (await (
    await SELF.fetch('https://rooms.test/control/flags', { headers })
  ).json()) as {
    flags: Record<string, string>;
  };
  return answer.flags;
}

afterEach(async () => {
  await env.ACCOUNTS.prepare("DELETE FROM rt_flags WHERE k <> 'realtime'").run();
  await env.ACCOUNTS.prepare("UPDATE rt_flags SET v = 'on' WHERE k = 'realtime'").run();
  dropFlagCache();
});

describe('the kill switches on rt_flags (HR-O#4)', () => {
  it('a switch written off reads off on the next GET, beside the realtime row', async () => {
    const written = await write({ readOnly: 'off', exports: 'on' });
    expect(written.status).toBe(200);
    expect(await table()).toEqual({ exports: 'on', readOnly: 'off', realtime: 'on' });
  });

  it('every switch takes on or off and nothing else; the refusal writes no row', async () => {
    for (const name of FLAG_NAMES) {
      const refused = await write({ [name]: 'of' });
      expect(refused.status).toBe(400);
      expect(((await refused.json()) as { message: string }).message).toBe(
        `"${name}" takes on or off`,
      );
    }
    expect(await table()).toEqual({ realtime: 'on' });
  });

  it('a row that is not a switch keeps the grammar it had', async () => {
    expect((await write({ notASwitch: 'any:value-1' })).status).toBe(200);
    expect((await write({ 'alert.health': 'open:1:1' })).status).toBe(400);
    expect(await table()).toEqual({ notASwitch: 'any:value-1', realtime: 'on' });
  });
});
