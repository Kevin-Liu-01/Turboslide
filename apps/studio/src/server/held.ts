import { isDoChannel } from '@turboslide/realtime/do';

import type { Room } from './room';

/**
 * The op ids the deck holds (RELIABILITY-6, hardening HR-RT#14): the ones a record's origin names
 * and, on the do tier, the ones the object's log holds that no checkpoint has committed yet (2 s
 * idle, 10 s under typing, longer while checkpoints fail). A read that fails throws: before this
 * it answered none held, and the plate offered words the room already held, which Apply wrote a
 * second time.
 *
 * A module of its own, which write.ts's `heldOpIdsFn` loads inside its handler as it loads
 * `./room`: write.ts is in the browser's entry graph for its server function stubs, and a static
 * import of `@turboslide/realtime/do` there kept do.ts, keys.ts, `@turboslide/schema/ids` and zod
 * in the chunk every page preloads (`vendor`, 518,333 B to 619,305 B on the node-server build).
 */
export async function heldOf(
  deckRoom: Pick<Room, 'deckId' | 'store' | 'channel'>,
  opIds: readonly string[],
): Promise<string[]> {
  const wanted = new Set(opIds);
  const held = new Set<string>();
  const records = await deckRoom.store.records();
  for (const record of records)
    for (const opId of record.origin?.opIds ?? []) if (wanted.has(opId)) held.add(opId);
  const channel = deckRoom.channel;
  if (isDoChannel(channel)) {
    const rest = opIds.filter((opId) => !held.has(opId));
    if (rest.length > 0)
      for (const opId of await channel.held(deckRoom.deckId, rest)) held.add(opId);
  }
  return opIds.filter((opId) => held.has(opId));
}
