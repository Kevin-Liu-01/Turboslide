// The wait for a write's acknowledgement (gslides-parity SPEC-3 3.10: the answer of a write is
// the base of the next one). The controller's `commitAs` and `replayDraftQueue` hand a window
// API caller the revision its write made; on the memory tier that revision exists only once the
// room's checkpointer has committed the entry, and the checkpointer runs at 2 s idle or at its
// 10 s hard limit while ops keep arriving (server/checkpoint.ts CHECKPOINT_IDLE_MS and
// CHECKPOINT_MAX_MS). Pure, so the policy is unit tested (ack-wait.test.ts); the controller
// passes its reported revision and its snapshot subscription.

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
 *
 * `subscribe` registers a listener for every change the reported revision is read from (the
 * controller's snapshot subscription: the room client's `onStatus` publishes after every move of
 * its revision) and answers the unsubscribe. The wait reads the revision when a listener call
 * comes and holds one timer, the cap's. It polled every 20 ms before, so each write in flight on
 * the memory tier set 100 to 500 timers until its checkpoint (about 1,550 a second in the
 * landing's hero frame while its agents typed, measured 2026-11-09).
 */
export function awaitAcknowledged(
  reported: () => number,
  base: number,
  subscribe: (listener: () => void) => () => void,
  options: AckWaitOptions = {},
): Promise<number> {
  if (reported() > base) return Promise.resolve(reported());
  return new Promise<number>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(cap);
      unsubscribe?.();
      resolve(reported());
    };
    const cap = setTimeout(finish, options.waitMs ?? ACK_WAIT_MS);
    unsubscribe = subscribe(() => {
      if (reported() > base) finish();
    });
    // a subscription that called its listener at once has already finished the wait
    if (settled) unsubscribe();
  });
}
