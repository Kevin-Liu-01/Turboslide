// The revision reads of the rows that judge "one write" by the revision (the Round 1 follow-up,
// lane D; verify-r1.md finding 1). On the memory, redis and do tiers the tab's revision follows
// the room's checkpoint 2 s after the last op, so a read right after the write had settled was the
// revision before it: production read logos.tailor.find-customer-logo "224 -> 224" and
// assist.tailor.dialog-one-undo "251 -> 251 -> 252" with the deck changed and one Cmd+Z restoring
// it. These steps read the revision once it has stopped moving (`t.stableRevision`, pinned in
// toolkit.test.mjs) around the write and the undo, and never `describe().state.revision` alone.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/** The text of one step: from its id to the next `await t.step(` of the module. */
function stepBody(file, id) {
  const source = readFileSync(new URL(`./areas/${file}`, import.meta.url), 'utf8');
  const at = source.indexOf(`'${id}',\n`, source.indexOf('await t.step('));
  expect(at, `${file} drives ${id}`).toBeGreaterThan(0);
  const next = source.indexOf('await t.step(', at);
  return source.slice(at, next === -1 ? source.length : next);
}

describe('the rows that judge one write by the revision', () => {
  it('logos.tailor.find-customer-logo reads the revision once it stops moving', () => {
    const body = stepBody('logos.mjs', 'logos.tailor.find-customer-logo');
    expect(body).toMatch(/const rev0 = await t\.stableRevision\(\);/);
    expect(body).toMatch(/const rev1 = await t\.stableRevision\(\);/);
    expect(body).toMatch(/const rev2 = await t\.stableRevision\(\);/);
    expect(body).not.toMatch(/const rev[012] = \(await t\.state\(\)\)\.revision/);
    expect(body).toContain('rev1 === rev0 + 1');
  });

  it('assist.tailor.dialog-one-undo reads the revision once it stops moving', () => {
    const body = stepBody('assist.mjs', 'assist.tailor.dialog-one-undo');
    expect(body).toMatch(/const revBefore = await t\.stableRevision\(\);/);
    expect(body).toMatch(/const revAfter = await t\.stableRevision\(\);/);
    expect(body).toMatch(/const revUndo = await t\.stableRevision\(\);/);
    expect(body).not.toMatch(/const rev(Before|After|Undo) = \(await t\.state\(\)\)\.revision/);
    expect(body).toContain('revAfter === revBefore + 1');
  });
});
