// The draft's first save through a storage write freeze (HR-K1#4b; docs/hosting.md 10): a 503 with
// a wait is sent again after the wait, with the sentence shown meanwhile; any other error, or a
// freeze that outlasts its limit, is the caller's. The refusals are the page's reading of
// `writeDeck`'s busy answer (server/write.ts `readWriteDeckAnswer`): an Error with the freeze's
// name, message, `status` and `retryAfter`; write.test.ts sends that answer through the server
// function's serializer. The controller's wait says the sentence on the snackbar, since the save
// words read Saving… while anything is pending (finish round 2 regression finding 1).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { StorageFrozenError, StorageLayoutError } from '@turboslide/store/migrate';

import { readWriteDeckAnswer } from '../server/write';
import { DRAFT_FREEZE_RETRY_FOR_MS, sendThroughFreeze, storeWaitMs } from './draft-retry';

/** A refusal as it reaches the page: `writeDeck`'s busy answer, read by `readWriteDeckAnswer`. */
function deserialized(from: Error & { status: number; retryAfter: number }): Error {
  const busy = { ok: false, code: 'busy', name: from.name, message: from.message };
  try {
    readWriteDeckAnswer(JSON.stringify({ ...busy, retryAfter: from.retryAfter }));
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error('readWriteDeckAnswer read no refusal');
}

const frozen = () =>
  deserialized(new StorageFrozenError('Saving is paused while the documents move between stores'));

function clock() {
  const at = { t: 0 };
  return {
    at,
    now: () => at.t,
    sleep: async (ms: number) => {
      at.t += ms;
    },
  };
}

describe('the first save of a new deck through a write freeze', () => {
  it('reads the wait of a freeze and of a layout refusal, and none of any other error', () => {
    expect(storeWaitMs(frozen())).toBe(30_000);
    expect(storeWaitMs(deserialized(new StorageLayoutError('meta.json did not read')))).toBe(5_000);
    expect(storeWaitMs(new Error('The store did not answer; try again in 7 s'))).toBeNull();
    expect(storeWaitMs(Object.assign(new Error('busy'), { status: 503 }))).toBeNull();
    expect(storeWaitMs(new RangeError('No deck d1'))).toBeNull();
  });

  it('keeps the write through the freeze, shows its sentence and sends it again after each wait', async () => {
    const c = clock();
    const sent: number[] = [];
    const shown: string[] = [];
    const answer = await sendThroughFreeze(
      async () => {
        sent.push(c.at.t);
        if (sent.length <= 3) throw frozen();
        return { ok: true, revision: 1 };
      },
      { waiting: (refusal) => shown.push(refusal.message), sleep: c.sleep, now: c.now },
    );
    expect(answer).toEqual({ ok: true, revision: 1 });
    expect(sent).toEqual([0, 30_000, 60_000, 90_000]);
    expect(shown).toEqual(
      Array(3).fill('Saving is paused while the documents move between stores'),
    );
  });

  it("says each refusal's sentence on the snackbar while the first save waits", () => {
    const controller = readFileSync(join(import.meta.dirname, 'controller.tsx'), 'utf8');
    const from = controller.indexOf('sendThroughFreeze(() => writeDeck(');
    expect(from).toBeGreaterThan(0);
    const call = controller.slice(from, controller.indexOf('} catch (error) {', from));
    expect(call).toMatch(/waiting: \(refusal\) => \{[\s\S]*?\bsayRefusal\(refusal\);\s*\},/);
  });

  it('throws any other error at once, and a freeze that outlasts its limit', async () => {
    const c = clock();
    let tries = 0;
    await expect(
      sendThroughFreeze(
        async () => {
          tries += 1;
          throw new RangeError('No deck d1');
        },
        { waiting: () => undefined, sleep: c.sleep, now: c.now },
      ),
    ).rejects.toThrow('No deck d1');
    expect(tries).toBe(1);
    tries = 0;
    await expect(
      sendThroughFreeze(
        async () => {
          tries += 1;
          throw frozen();
        },
        { waiting: () => undefined, sleep: c.sleep, now: c.now },
      ),
    ).rejects.toMatchObject({ name: 'StorageFrozenError', status: 503 });
    // tried while the next wait still ends inside the limit: 30 waits of 30 s, then the last try
    expect(tries).toBe(DRAFT_FREEZE_RETRY_FOR_MS / 30_000 + 1);
  });
});
