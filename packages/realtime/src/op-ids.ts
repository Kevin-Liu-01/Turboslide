// The op id forms the stream carries (gslides-parity SPEC-3 3.3; SPEC-5-amendments A3 items 5
// and 6): a client posts `<clientId>:<counter>` per operation (protocol.ts OP_ID_PATTERN), and a
// record the blob tier committed for one tab echoes the whole batch as one entry whose op id is
// `<clientId>:<first>+<count>`, the first counter and how many consecutive ones follow it. The
// author's tab settles every op of the batch from that one echo and every other tab applies the
// folded mutations once; a record written outside the room stays `store:<n>`. Browser safe, no
// imports: the room client and the blob channel both read it.

/** `<clientId>:<counter>` with an optional `+<count>` batch suffix. */
export const OP_ID_BATCH_PATTERN = /^([0-9a-f]{32}):([0-9]{1,12})(?:\+([0-9]{1,3}))?$/;

/**
 * The batch op id of one client's consecutive counters, or null when the ids are not one
 * client's consecutive counters (a record from outside the room, a fold of two writers).
 */
export function batchOpId(clientId: string, opIds: readonly string[]): string | null {
  if (opIds.length === 0) return null;
  const counters: number[] = [];
  for (const opId of opIds) {
    const match = /^([0-9a-f]{32}):([0-9]{1,12})$/.exec(opId);
    if (match === null || match[1] !== clientId) return null;
    counters.push(Number(match[2]));
  }
  for (let i = 1; i < counters.length; i += 1) {
    if (counters[i] !== (counters[i - 1] as number) + 1) return null;
  }
  return `${clientId}:${counters[0]}+${counters.length}`;
}

/**
 * The op ids an op id names, in order: a plain client op id answers itself, a batch op id its
 * consecutive counters, anything else (a store or server id) nothing.
 */
export function opIdsOfBatch(opId: string): string[] {
  const match = OP_ID_BATCH_PATTERN.exec(opId);
  if (match === null) return [];
  const [, clientId, first, count] = match;
  const n = Number(first);
  const k = count === undefined ? 1 : Number(count);
  return Array.from({ length: k }, (_, i) => `${clientId}:${n + i}`);
}

/** The client id an op id names, or null for a store or server id. */
export function clientOfOpId(opId: string): string | null {
  const match = OP_ID_BATCH_PATTERN.exec(opId);
  return match === null ? null : (match[1] as string);
}
