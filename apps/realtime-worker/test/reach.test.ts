// Which failed app calls count as the deployment failing (deck-room.ts AppCallError.reach): two in
// a row flag the callbacks row and move every tab to the blob tier. A seed 503 is the store's "not
// now", which the seed route answers with retry-after (HR-K1#4b: a layout record that did not
// read, a freeze), so it does not count; a seed 500 or 502 still does.
import { describe, expect, it } from 'vitest';

import { AppCallError } from '../src/deck-room.ts';

describe('AppCallError.reach', () => {
  it("counts a seed 5xx as the deployment failing, but not a seed 503, the store's not now", () => {
    expect(new AppCallError('seed', 500).reach).toBe(true);
    expect(new AppCallError('seed', 502).reach).toBe(true);
    expect(new AppCallError('seed', 0).reach).toBe(true);
    expect(new AppCallError('seed', 503).reach).toBe(false);
    expect(new AppCallError('checkpoint', 500).reach).toBe(false);
    expect(new AppCallError('checkpoint', 401).reach).toBe(true);
  });
});
