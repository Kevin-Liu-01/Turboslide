import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AccessRecord } from '@turboslide/schema/access';
import { legacyAssetKey, newDeckRecord } from '@turboslide/schema/access';

import { shareGet } from './access.ts';
import type { AccessDeps } from './access.ts';

// Hardening HR-SD#1 (docs/hardening/HARDENING.md 4.4; DATA-V2): `share.get` over HTTP and MCP
// runs this record function on the studio, which passes the stand-in of another principal's id.
// A reader without the share capability reads the owner and the inviter of its own grant as
// stand-ins; a share holder reads the record as stored; a checkout (no stand-in) is unchanged.

const NOW = '2026-10-08T00:00:00.000Z';
const OWNER = 'anon_11111111-1111-4111-8111-111111111111';
const VIEWER = 'anon_22222222-2222-4222-8222-222222222222';
const standIn = (id: string): string => `ref_of_${id.slice(5, 13)}`;

function shared(): AccessRecord {
  return {
    ...newDeckRecord('q4-review', OWNER, legacyAssetKey('q4-review'), NOW),
    grants: [
      {
        principalId: VIEWER,
        email: null,
        role: 'viewer',
        invitedBy: OWNER,
        invitedAt: NOW,
        acceptedAt: NOW,
        expiresAt: null,
      },
    ],
  };
}

describe('share.get for a reader without share (HR-SD#1)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function deps(principalId: string, withStandIn: boolean): AccessDeps {
    const dir = mkdtempSync(join(tmpdir(), 'ts-stand-in-'));
    dirs.push(dir);
    return {
      deckDir: dir,
      deckId: 'q4-review',
      stateDir: join(dir, '.state'),
      caller: { principalId, kind: 'anonymous' },
      origin: 'https://x.test',
      now: () => NOW,
      load: () => shared(),
      ...(withStandIn ? { standIn } : {}),
    };
  }

  it('names the owner and the inviter by their stand-ins', async () => {
    const answer = await shareGet(deps(VIEWER, true));
    expect(answer.capabilities).not.toContain('share');
    expect(answer.record.owner).toBe(standIn(OWNER));
    expect(answer.record.grants?.map((grant) => [grant.principalId, grant.invitedBy])).toEqual([
      [VIEWER, standIn(OWNER)],
    ]);
    expect(JSON.stringify(answer)).not.toContain(OWNER);
  });

  it("answers the owner's own record unchanged, and a checkout's reader the ids", async () => {
    const owner = await shareGet(deps(OWNER, true));
    expect(owner.record).toEqual(shared());
    const checkout = await shareGet(deps(VIEWER, false));
    expect(checkout.record.owner).toBe(OWNER);
  });
});
