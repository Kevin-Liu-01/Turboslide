// The share and publish commands over a scratch copy of the fixture deck, no server (gslides-parity
// SPEC-3 6.9, 12, 16.6 cli row): the synthesized record of a checkout, general access by link with
// its URL printed once and the token never stored, named links with label and expiry, rotate and
// revoke, invitations, roles, expiries, removal, the gear's switches, stop, publish and unpublish,
// a stale base revision, the ownership offer and its acceptance by the other principal, the 403
// sentence for a caller without the right, the 404 sentence for a stranger, requests, the round
// four action, admin assign-owner and the activity feed. Every write validates the deck afterwards.
// Ids named for the coverage test: share.get, share.setGeneralAccess, share.createLink,
// share.revokeLink, share.rotateLink, share.stop, share.invite, share.setRole, share.remove,
// share.setExpiry, share.settings, share.listRequests, share.respond, share.transferOwnership,
// share.acceptOwnership, share.declineOwnership, share.claim, share.emailCollaborators,
// deck.publish, deck.unpublish, admin.assignOwner, admin.flag.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runCli } from '../cli.ts';

const FIXTURE = join(import.meta.dirname, '..', '..', '..', '..', 'decks', 'fixture', 'gslides');
const ORIGIN = 'https://studio.test';

type Run = { code: number; stdout: string; stderr: string; json: unknown };
type Record = {
  owner: string | null;
  revision: number;
  generalAccess: { mode: string; role: string };
  grants: {
    email: string | null;
    principalId: string | null;
    role: string;
    acceptedAt: string | null;
    expiresAt: string | null;
  }[];
  links: {
    id: string;
    hash: string;
    role: string;
    label?: string;
    revokedAt: string | null;
    expiresAt: string | null;
  }[];
  publish: { hash: string; revokedAt: string | null } | null;
  pendingOwner: { principalId: string | null; email: string | null } | null;
  settings: { viewersCanSeeComments: boolean; editorsCanShare: boolean };
};
type Answer = { record: Record; url?: string; embed?: string; link?: { id: string; role: string } };

let root: string;
let deckDir: string;

async function run(argv: string[], author = 'tester'): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', deckDir, '--json', '--author', author], {
    cwd: root,
    env: { USER: 'tester', TURBOSLIDE_ORIGIN: ORIGIN },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

function accessFile(): string {
  return readFileSync(join(deckDir, '.turboslide', 'access.json'), 'utf8');
}

async function validates(): Promise<void> {
  const result = await run(['validate', deckDir]);
  expect(result.code, result.stderr).toBe(0);
}

describe('turboslide share, deck publish and admin over the fixture deck', () => {
  let linkId = '';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-share-'));
    mkdirSync(join(root, 'decks'), { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    deckDir = join(root, 'decks', 'gslides');
    cpSync(FIXTURE, deckDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('share get on a fresh checkout answers the synthesized record: the caller owns it, restricted, nothing stored', async () => {
    const result = await run(['share', 'get', 'gslides']);
    expect(result.code, result.stderr).toBe(0);
    const answer = result.json as {
      record: Record;
      role: string;
      via: string;
      capabilities: string[];
    };
    expect(answer.record.owner).toBe('local:tester');
    expect(answer.record.generalAccess).toEqual({ mode: 'restricted', role: 'viewer' });
    expect(answer.record.revision).toBe(0);
    expect(answer.role).toBe('owner');
    expect(answer.via).toBe('owner');
    expect(answer.capabilities).toContain('share');
    expect(answer.capabilities).toContain('publish');
    expect(existsSync(join(deckDir, '.turboslide', 'access.json'))).toBe(false);
  });

  test('share access --mode link mints the general access link, prints its URL once and stores the hash only', async () => {
    const result = await run(['share', 'access', 'gslides', '--mode', 'link', '--role', 'viewer']);
    expect(result.code, result.stderr).toBe(0);
    const answer = result.json as Answer;
    expect(answer.record.generalAccess).toEqual({ mode: 'link', role: 'viewer' });
    expect(answer.record.revision).toBe(1);
    expect(answer.url).toMatch(new RegExp(`^${ORIGIN}/s/[A-Za-z0-9_-]{22}$`));
    const token = answer.url?.slice(answer.url.lastIndexOf('/') + 1) ?? '';
    const file = accessFile();
    expect(file).not.toContain(token);
    expect(answer.record.links[0]?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(answer.record.links[0]?.label).toBe('Anyone with the link');
    // the JSON answer carries the record, never the token beyond the URL
    expect(JSON.stringify(answer.record)).not.toContain(token);
    await validates();
  });

  test('share link creates a named link with a label and an expiry; rotate mints a new record and revokes the old; revoke ends one', async () => {
    const created = await run([
      'share',
      'link',
      'gslides',
      '--role',
      'commenter',
      '--label',
      'agency',
      '--expires',
      '30d',
    ]);
    expect(created.code, created.stderr).toBe(0);
    const answer = created.json as Answer;
    linkId = answer.link?.id ?? '';
    expect(linkId).toMatch(/^lnk_[A-Za-z0-9_-]{16}$/);
    expect(answer.link?.role).toBe('commenter');
    const stored = answer.record.links.find((row) => row.id === linkId);
    expect(stored?.label).toBe('agency');
    expect(stored?.expiresAt).not.toBeNull();
    const hashBefore = stored?.hash;
    // rotation mints a new record (SPEC-3 6.4): the old id is revoked, the new one keeps role, label and expiry
    const rotated = await run(['share', 'rotate-link', 'gslides', linkId]);
    expect(rotated.code, rotated.stderr).toBe(0);
    const rotatedAnswer = rotated.json as Answer;
    expect(rotatedAnswer.record.links.find((row) => row.id === linkId)?.revokedAt).not.toBeNull();
    const fresh = rotatedAnswer.record.links.find((row) => row.id === rotatedAnswer.link?.id);
    expect(fresh?.id).not.toBe(linkId);
    expect(fresh?.hash).not.toBe(hashBefore);
    expect(fresh).toMatchObject({ role: 'commenter', label: 'agency', revokedAt: null });
    expect(fresh?.expiresAt).toBe(stored?.expiresAt);
    expect(rotatedAnswer.url).toMatch(/\/s\/[A-Za-z0-9_-]{22}$/);
    linkId = fresh?.id ?? '';
    const listed = await run(['share', 'get', 'gslides']);
    expect(
      (listed.json as Answer).record.links.filter((row) => row.revokedAt === null),
    ).toHaveLength(2);
    const revoked = await run(['share', 'revoke-link', 'gslides', linkId]);
    expect(revoked.code, revoked.stderr).toBe(0);
    expect(
      (revoked.json as Answer).record.links.find((row) => row.id === linkId)?.revokedAt,
    ).not.toBeNull();
    const unknown = await run(['share', 'revoke-link', 'gslides', 'lnk_nowhere']);
    expect(unknown.code).toBe(2);
    await validates();
  });

  test('invite, role, expire and remove act on grants by address; the invitation status is no-mail on a checkout', async () => {
    const invited = await run([
      'share',
      'invite',
      'gslides',
      '--email',
      'A@Example.com',
      '--email',
      'b@example.com',
      '--role',
      'editor',
      '--message',
      'please review',
      '--no-notify',
    ]);
    expect(invited.code, invited.stderr).toBe(0);
    const answer = invited.json as Answer & { invited: { email: string; status: string }[] };
    expect(answer.invited.map((row) => row.email)).toEqual(['a@example.com', 'b@example.com']);
    expect(answer.invited.every((row) => row.status === 'no-mail')).toBe(true);
    expect(answer.record.grants.filter((row) => row.acceptedAt === null)).toHaveLength(2);
    const role = await run([
      'share',
      'role',
      'gslides',
      '--email',
      'a@example.com',
      '--role',
      'viewer',
    ]);
    expect(role.code, role.stderr).toBe(0);
    expect(
      (role.json as Answer).record.grants.find((row) => row.email === 'a@example.com')?.role,
    ).toBe('viewer');
    const expire = await run([
      'share',
      'expire',
      'gslides',
      '--email',
      'a@example.com',
      '--at',
      '7d',
    ]);
    expect(expire.code, expire.stderr).toBe(0);
    expect(
      (expire.json as Answer).record.grants.find((row) => row.email === 'a@example.com')?.expiresAt,
    ).not.toBeNull();
    const cleared = await run([
      'share',
      'expire',
      'gslides',
      '--email',
      'a@example.com',
      '--at',
      'none',
    ]);
    expect(
      (cleared.json as Answer).record.grants.find((row) => row.email === 'a@example.com')
        ?.expiresAt,
    ).toBeNull();
    const removed = await run(['share', 'remove', 'gslides', '--email', 'b@example.com']);
    expect(removed.code, removed.stderr).toBe(0);
    expect((removed.json as Answer).record.grants.map((row) => row.email)).toEqual([
      'a@example.com',
    ]);
    const missing = await run(['share', 'remove', 'gslides', '--email', 'nobody@example.com']);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toMatch(/no such grant/);
    const both = await run([
      'share',
      'role',
      'gslides',
      '--email',
      'a@example.com',
      '--principal',
      'local:x',
      '--role',
      'viewer',
    ]);
    expect(both.code).toBe(2);
    await validates();
  });

  test('share settings flips the gear switches; a stale --base-revision is a 409 with exit 1 and the current record', async () => {
    const settings = await run([
      'share',
      'settings',
      'gslides',
      '--viewers-can-see-comments',
      'true',
      '--editors-can-share',
      'false',
    ]);
    expect(settings.code, settings.stderr).toBe(0);
    expect((settings.json as Answer).record.settings).toMatchObject({
      viewersCanSeeComments: true,
      editorsCanShare: false,
    });
    const none = await run(['share', 'settings', 'gslides']);
    expect(none.code).toBe(2);
    const stale = await run(['share', 'stop', 'gslides', '--base-revision', '0']);
    expect(stale.code).toBe(1);
    const body = stale.json as {
      error: string;
      status: number;
      currentRevision: number;
      current: Record;
    };
    expect(body.error).toBe('ConflictError');
    expect(body.status).toBe(409);
    expect(body.currentRevision).toBeGreaterThan(0);
    expect(body.current.owner).toBe('local:tester');
  });

  test('deck publish prints the player URL and the embed once; unpublish revokes; share stop restricts and revokes every link', async () => {
    const published = await run(['deck', 'publish', 'gslides']);
    expect(published.code, published.stderr).toBe(0);
    const answer = published.json as Answer;
    expect(answer.url).toMatch(
      new RegExp(`^${ORIGIN}/deck/gslides\\?p=[A-Za-z0-9_-]{22}&present=1$`),
    );
    expect(answer.embed).toMatch(new RegExp(`^${ORIGIN}/embed/gslides\\?p=[A-Za-z0-9_-]{22}$`));
    const token = new URL(answer.url ?? '').searchParams.get('p') ?? '';
    expect(accessFile()).not.toContain(token);
    expect(answer.record.publish?.revokedAt).toBeNull();
    const unpublished = await run(['deck', 'unpublish', 'gslides']);
    expect(unpublished.code, unpublished.stderr).toBe(0);
    expect((unpublished.json as Answer).record.publish?.revokedAt).not.toBeNull();
    const stopped = await run(['share', 'stop', 'gslides']);
    expect(stopped.code, stopped.stderr).toBe(0);
    const record = (stopped.json as Answer).record;
    expect(record.generalAccess.mode).toBe('restricted');
    expect(record.links.every((row) => row.revokedAt !== null)).toBe(true);
    await validates();
  });

  test('a stranger reads the 404 sentence; share requests is empty; respond on an unknown request is refused; share email is round four', async () => {
    const stranger = await run(['share', 'get', 'gslides'], 'zed');
    expect(stranger.code).toBe(2);
    expect(stranger.stderr).toMatch(/not available to you, or does not exist/);
    const requests = await run(['share', 'requests', 'gslides']);
    expect(requests.code, requests.stderr).toBe(0);
    expect(requests.json).toEqual({ requests: [] });
    const respond = await run([
      'share',
      'respond',
      'gslides',
      'req_nowhere',
      '--grant',
      'commenter',
    ]);
    expect(respond.code).toBe(2);
    const email = await run(['share', 'email', 'gslides', '--message', 'hello']);
    expect(email.code).toBe(2);
    expect(email.stderr).toMatch(/share\.emailCollaborators/);
  });

  test('transfer offers ownership to a principal, who accepts; the previous owner is an editor and reads the 403 sentence on the gear', async () => {
    const offered = await run(['share', 'transfer', 'gslides', '--principal', 'local:maya']);
    expect(offered.code, offered.stderr).toBe(0);
    const record = (offered.json as Answer).record;
    expect(record.pendingOwner).toMatchObject({ principalId: 'local:maya' });
    expect(record.grants.find((row) => row.principalId === 'local:maya')?.role).toBe('editor');
    const notForZed = await run(['share', 'accept-ownership', 'gslides'], 'zed');
    expect(notForZed.code).toBe(2);
    const accepted = await run(['share', 'accept-ownership', 'gslides'], 'maya');
    expect(accepted.code, accepted.stderr).toBe(0);
    const after = (accepted.json as Answer).record;
    expect(after.owner).toBe('local:maya');
    expect(after.pendingOwner).toBeNull();
    expect(after.grants.find((row) => row.principalId === 'local:tester')?.role).toBe('editor');
    // the previous owner holds share (editorsCanShare was set back on by nobody, so it is off) and no settings right
    const gear = await run(['share', 'settings', 'gslides', '--viewers-can-see-comments', 'false']);
    expect(gear.code).toBe(2);
    expect(gear.stderr).toMatch(/needs the settings capability/);
    expect(gear.json).toMatchObject({ error: 'ForbiddenError', status: 403 });
    const inbox = await run(['notifications', 'settings', '--activity-for-commenters', 'true']);
    expect(inbox.code).toBe(2);
    const declineNothing = await run(['share', 'decline-ownership', 'gslides']);
    expect(declineNothing.code).toBe(2);
    const claim = await run(['share', 'claim', 'gslides'], 'zed');
    expect(claim.code).toBe(2);
    expect(claim.stderr).toMatch(/has an owner already|not available to you/);
    await validates();
  });

  test('admin assign-owner sets the owner on a checkout; admin flag reads and flips a kill switch under .turboslide/flags.json', async () => {
    const assigned = await run(
      ['admin', 'assign-owner', 'gslides', '--principal', 'local:tester'],
      'maya',
    );
    expect(assigned.code, assigned.stderr).toBe(0);
    expect((assigned.json as Answer).record.owner).toBe('local:tester');
    const read = await run(['admin', 'flag', 'comments']);
    expect(read.code, read.stderr).toBe(0);
    expect(read.json).toMatchObject({ name: 'comments', on: true, default: true });
    const off = await run(['admin', 'flag', 'comments', 'off']);
    expect(off.json).toMatchObject({ name: 'comments', on: false });
    expect(existsSync(join(root, '.turboslide', 'flags.json'))).toBe(true);
    const on = await run(['admin', 'flag', 'comments', 'on']);
    expect(on.json).toMatchObject({ name: 'comments', on: true });
    const bad = await run(['admin', 'flag', 'nothing']);
    expect(bad.code).toBe(2);
  });

  test('activity lists the share events with the actor and filters by kind', async () => {
    const result = await run(['activity', '--kind', 'share,role']);
    expect(result.code, result.stderr).toBe(0);
    const events = (result.json as { events: { kind: string; actor: string; summary: string }[] })
      .events;
    expect(events.length).toBeGreaterThanOrEqual(8);
    expect(events.every((event) => event.kind === 'share' || event.kind === 'role')).toBe(true);
    expect(events.some((event) => /Anyone with the link/.test(event.summary))).toBe(true);
    expect(events.some((event) => /Published to the web/.test(event.summary))).toBe(true);
    expect(events.some((event) => event.actor === 'local:maya')).toBe(true);
  });
});
