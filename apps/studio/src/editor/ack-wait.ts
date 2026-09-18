// The wait for a write's acknowledgement (gslides-parity SPEC-3 3.10: the answer of a write is
// the base of the next one). The controller's `commitAs` and `replayDraftQueue` hand a window
// API caller the revision its write made; on the memory tier that revision exists only once the
// room's checkpointer has committed the entry, and the checkpointer runs at 2 s idle or at its
// 10 s hard limit while ops keep arriving (server/checkpoint.ts CHECKPOINT_IDLE_MS and
// CHECKPOINT_MAX_MS). Pure, so the policy is unit tested (ack-wait.test.ts); the controller
// passes its reported revision and the real clock.

/**
 * How long a write's answer waits for the acknowledgement that moves the revision above its
 * base. The memory tier's checkpoint fires within CHECKPOINT_MAX_MS (10 s) of the first entry
 * it covers whatever else arrives, and the store write and the checkpoint frame follow it; the
 * cap covers that limit with room for a loaded dev server (the round two spec measured writes
 * held for up to 10 s under the filmstrip's renders). The blob tier acknowledges on the ops
 * POST's answer, so nothing there waits this long. Before the fix round the cap was 5 s, short
 * of the hard limit, and check step 21's chained writes met it (VERIFICATION F22).
 */
export const ACK_WAIT_MS = 15_000;

export type AckWaitOptions = {
  /** the cap; ACK_WAIT_MS by default */
  waitMs?: number;
  /** the poll interval; 20 ms by default */
  pollMs?: number;
  /** the clock, for tests */
  now?: () => number;
  /** the sleep, for tests */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Answers the revision a write's caller may base its next write on: the reported revision once
 * it has moved above `base` (the acknowledgement landed), or the reported revision as it stands
 * at the cap. Never a number the page has not reported: the answer of an unacknowledged write
 * used to be `base + 1`, a floor the page itself refused as stale on the next write
 * ("baseRevision 9 is stale; the document is at revision 8", VERIFICATION F22, the two
 * gslides-actions.spec.ts chains), since `checkBase` compares against the reported revision. A
 * caller that reads the answer and writes with it therefore always passes `checkBase`; when the
 * cap was hit the answer equals its base and the revision arithmetic of a strict caller is off
 * by one until the checkpoint lands, which is the honest state of the memory tier.
 */
export async function awaitAcknowledged(
  reported: () => number,
  base: number,
  options: AckWaitOptions = {},
): Promise<number> {
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const waitMs = options.waitMs ?? ACK_WAIT_MS;
  const pollMs = options.pollMs ?? 20;
  const until = now() + waitMs;
  while (reported() <= base) {
    if (now() > until) return reported();
    await sleep(pollMs);
  }
  return reported();
}
