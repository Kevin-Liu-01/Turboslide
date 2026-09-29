import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AccessRecord } from '@turboslide/schema/access';
import { legacyAssetKey, linkIsLive, newDeckRecord } from '@turboslide/schema/access';

import { shareSetGeneralAccess } from './access.ts';
import type { AccessDeps } from './access.ts';

// The general access writes (docs/POLISH.md items 79 and 96; the rows share.role-change.keeps-link
// and share.dialog.restricted-and-more): a role change alone keeps the live general link's token,
// so an address a seller already sent keeps opening; Restricted revokes every live link, so
// "Only you can open this presentation" holds for anyone holding a link.

const NOW = '2026-09-28T12:00:00.000Z';

function depsFor(dir: string, stored: { record: AccessRecord | null }): AccessDeps {
  return {
    deckDir: dir,
    deckId: 'q4-review',
    stateDir: join(dir, '.state'),
    caller: { principalId: 'anon_owner', kind: 'anonymous' },
    origin: 'https://x.test',
    now: () => NOW,
    load: () => stored.record,
    save: (record) => {
      stored.record = record;
    },
  };
}

describe('share.setGeneralAccess', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the live general link and its token on a role change alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-access-'));
    dirs.push(dir);
    const stored = {
      record: newDeckRecord('q4-review', 'anon_owner', legacyAssetKey('q4-review'), NOW),
    };
    const deps = depsFor(dir, stored);
    const first = await shareSetGeneralAccess(deps, {
      mode: 'link',
      role: 'viewer',
      baseRevision: 0,
    });
    expect(first.url).toMatch(/^https:\/\/x\.test\/s\/[A-Za-z0-9_-]{22}$/);
    const minted = first.record.links[0];
    expect(minted).toBeDefined();
    expect(first.record.generalAccess).toEqual({ mode: 'link', role: 'viewer' });

    const second = await shareSetGeneralAccess(deps, {
      mode: 'link',
      role: 'editor',
      baseRevision: 1,
    });
    /* no new address: the same link, its hash unchanged, its role rewritten */
    expect(second.url).toBeUndefined();
    expect(second.record.links).toHaveLength(1);
    expect(second.record.links[0]?.id).toBe(minted?.id);
    expect(second.record.links[0]?.hash).toBe(minted?.hash);
    expect(second.record.links[0]?.role).toBe('editor');
    expect(linkIsLive(second.record.links[0]!, NOW)).toBe(true);
    expect(second.record.generalAccess).toEqual({ mode: 'link', role: 'editor' });
  });

  it('revokes every live link under Restricted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-access-'));
    dirs.push(dir);
    const stored = {
      record: newDeckRecord('q4-review', 'anon_owner', legacyAssetKey('q4-review'), NOW),
    };
    const deps = depsFor(dir, stored);
    await shareSetGeneralAccess(deps, { mode: 'link', role: 'viewer', baseRevision: 0 });
    const restricted = await shareSetGeneralAccess(deps, { mode: 'restricted', baseRevision: 1 });
    expect(restricted.record.generalAccess.mode).toBe('restricted');
    expect(restricted.record.links.every((link) => !linkIsLive(link, NOW))).toBe(true);
    /* Anyone with the link again mints a fresh link: the old token is gone for good */
    const again = await shareSetGeneralAccess(deps, {
      mode: 'link',
      role: 'viewer',
      baseRevision: 2,
    });
    expect(again.url).toBeDefined();
    expect(again.record.links.filter((link) => linkIsLive(link, NOW))).toHaveLength(1);
  });
});
