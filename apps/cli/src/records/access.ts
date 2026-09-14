// The access record on a checkout (gslides-parity SPEC-3 2.2, 6.1, 6.4, 6.9; research-3 09 1, 7):
// `decks/<id>/.turboslide/access.json`, gitignored, written under the deck's write lock with the
// record's own `baseRevision` (a stale one is 409 with the current record). A missing file means
// the folder's holder is the owner (09 1.6), so every `share.*` command works on a fresh checkout
// and the first write persists the record with the holder as owner and `restricted` as the mode.
// Tokens are shown once in the answer and stored as `sha256:<hex>`; URLs are printed against the
// studio's origin (`TURBOSLIDE_ORIGIN`, else the dev server's). The same functions serve the
// hosted transports once B2's access store loads and saves the record (the deps take a loader
// and a saver), so one implementation answers the CLI, MCP, HTTP and window calls.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  AccessRecord,
  AccessRequest,
  AccessSettings,
  Capability,
  Grant,
  GrantRole,
  GrantWho,
  Role,
  ShareLink,
  Via,
} from '@turboslide/schema/access';
import {
  REQUEST_ACCESS_ANSWER,
  accessRecordSchema,
  capabilitiesForRole,
  grantIsLive,
  legacyAssetKey,
  linkIsLive,
  maxRole,
  newDeckRecord,
} from '@turboslide/schema/access';
import { ConflictError, ForbiddenError, NotImplementedError } from '@turboslide/schema/errors';
import { canonicalJson } from '@turboslide/schema/json';

import { appendActivity } from './activity.ts';
import { hashToken, recordId, shareToken, ulid } from './ids.ts';
import { STATE_DIR, withDeckLock } from './lock.ts';
import { pushNotification } from './inbox.ts';

export const ACCESS_FILE = 'access.json';

/** Who is asking: the principal, its verified email when signed in, and the admin flag. */
export type Caller = {
  principalId: string;
  email?: string;
  admin?: boolean;
  kind: 'anonymous' | 'account' | 'agent' | 'local';
};

export type AccessDeps = {
  deckDir: string;
  deckId: string;
  /** The repository's `.turboslide/`, where the inbox files live. */
  stateDir: string;
  caller: Caller;
  origin: string;
  now?: () => string;
  /** Loads the stored record, or null when none exists; the file under the deck by default. */
  load?: () => Promise<AccessRecord | null> | AccessRecord | null;
  /** Saves the record; the file under the deck by default. */
  save?: (record: AccessRecord) => Promise<void> | void;
};

function accessPath(deckDir: string): string {
  return join(deckDir, STATE_DIR, ACCESS_FILE);
}

/** The stored record of a deck folder, or null; a malformed file is a TypeError, never a silent legacy record. */
export function readAccessFile(deckDir: string): AccessRecord | null {
  const path = accessPath(deckDir);
  if (!existsSync(path)) return null;
  const parsed = accessRecordSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new TypeError(
      `${path} is not an access record: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    );
  }
  return parsed.data;
}

export function writeAccessFile(deckDir: string, record: AccessRecord): void {
  mkdirSync(join(deckDir, STATE_DIR), { recursive: true });
  const path = accessPath(deckDir);
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, canonicalJson(record));
  renameSync(partial, path);
}

function stamp(deps: AccessDeps): string {
  return deps.now?.() ?? new Date().toISOString();
}

/**
 * The record as the deps see it: the stored one, else the checkout's synthesized record, owned
 * by the folder's holder and restricted (09 1.6), at revision 0 so the first write's
 * `baseRevision: 0` matches. `stored` says which.
 */
export async function loadRecord(
  deps: AccessDeps,
): Promise<{ record: AccessRecord; stored: boolean }> {
  const stored = deps.load !== undefined ? await deps.load() : readAccessFile(deps.deckDir);
  if (stored !== null) return { record: stored, stored: true };
  return {
    record: newDeckRecord(
      deps.deckId,
      deps.caller.principalId,
      legacyAssetKey(deps.deckId),
      stamp(deps),
    ),
    stored: false,
  };
}

/** The caller's role on a record and how it was reached (SPEC-3 6.2), or null without access. */
export function standing(
  record: AccessRecord,
  caller: Caller,
  now: string,
): { role: Role; via: Via } | null {
  if (caller.admin === true) return { role: 'owner', via: 'admin' };
  if (record.owner !== null && record.owner === caller.principalId)
    return { role: 'owner', via: 'owner' };
  let best: { role: Role; via: Via } | null = null;
  for (const grant of record.grants) {
    if (!grantIsLive(grant, now)) continue;
    const mine =
      (grant.principalId !== null && grant.principalId === caller.principalId) ||
      (grant.email !== null &&
        caller.email !== undefined &&
        grant.email.toLowerCase() === caller.email.toLowerCase());
    if (!mine) continue;
    if (best === null || maxRole(best.role, grant.role) === grant.role)
      best = { role: grant.role, via: 'grant' };
  }
  if (record.generalAccess.mode === 'open') {
    const open = { role: record.generalAccess.role, via: 'open' as const };
    if (best === null || maxRole(best.role, open.role) === open.role) best = best ?? open;
  }
  return best;
}

export function capabilitiesOf(
  record: AccessRecord,
  standingOf: { role: Role } | null,
): Set<Capability> {
  return standingOf === null ? new Set() : capabilitiesForRole(standingOf.role, record.settings);
}

function require(
  record: AccessRecord,
  caller: Caller,
  now: string,
  capability: Capability,
  what: string,
): { role: Role; via: Via } {
  const mine = standing(record, caller, now);
  if (mine === null) {
    // a missing right and a missing deck read the same (09 8.2)
    throw new RangeError('This presentation is not available to you, or does not exist.');
  }
  if (!capabilitiesOf(record, mine).has(capability)) {
    throw new ForbiddenError(
      `${what} needs the ${capability} capability on this presentation`,
      capability,
    );
  }
  return mine;
}

/** Writes through the lock with the record's baseRevision rule; the mutator returns what the action answers beside the record. */
async function write<T>(
  deps: AccessDeps,
  baseRevision: number,
  mutate: (record: AccessRecord, now: string) => T,
  activity?: (
    record: AccessRecord,
    now: string,
    answer: T,
  ) => {
    kind: 'share' | 'request' | 'role';
    summary: string;
    data?: Record<string, unknown>;
  } | null,
): Promise<{ record: AccessRecord; answer: T }> {
  return withDeckLock(deps.deckDir, async () => {
    const now = stamp(deps);
    const { record } = await loadRecord(deps);
    if (record.revision !== baseRevision) {
      throw new ConflictError(
        `the access record is at revision ${record.revision}, not ${baseRevision}; re-read and retry`,
        { currentRevision: record.revision, current: record },
      );
    }
    const next: AccessRecord = structuredClone(record);
    const answer = mutate(next, now);
    next.revision = record.revision + 1;
    if (deps.save !== undefined) await deps.save(next);
    else writeAccessFile(deps.deckDir, next);
    const event = activity?.(next, now, answer);
    if (event !== null && event !== undefined) {
      appendActivity(deps.deckDir, {
        id: `access:${next.revision}:${ulid(Date.parse(now))}`,
        at: now,
        kind: event.kind,
        actor: deps.caller.principalId,
        deckId: deps.deckId,
        revision: next.revision,
        summary: event.summary,
        ...(event.data !== undefined ? { data: event.data } : {}),
      });
    }
    return { record: next, answer };
  });
}

function shareUrl(deps: AccessDeps, token: string): string {
  return `${deps.origin.replace(/\/$/, '')}/s/${token}`;
}

function linkView(link: ShareLink): {
  id: string;
  role: GrantRole;
  label?: string;
  createdAt: string;
  expiresAt: string | null;
} {
  return {
    id: link.id,
    role: link.role,
    ...(link.label !== undefined ? { label: link.label } : {}),
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
  };
}

/** The record for the caller (SPEC-3 12 share.get): whole for share holders, the viewer's partial view otherwise. */
export async function shareGet(deps: AccessDeps): Promise<{
  record: Partial<AccessRecord> & Pick<AccessRecord, 'deckId' | 'owner' | 'generalAccess'>;
  role: Role | null;
  via: Via | null;
  capabilities: Capability[];
}> {
  const now = stamp(deps);
  const { record } = await loadRecord(deps);
  const mine = standing(record, deps.caller, now);
  if (mine === null)
    throw new RangeError('This presentation is not available to you, or does not exist.');
  const capabilities = [...capabilitiesOf(record, mine)];
  if (!capabilities.includes('share')) {
    const own = record.grants.filter(
      (grant) =>
        (grant.principalId !== null && grant.principalId === deps.caller.principalId) ||
        (grant.email !== null &&
          deps.caller.email !== undefined &&
          grant.email === deps.caller.email),
    );
    return {
      // the revision travels with the partial view so a grantee's writes (accept, decline,
      // request) base on the current record without the share right
      record: {
        deckId: record.deckId,
        owner: record.owner,
        revision: record.revision,
        generalAccess: { mode: record.generalAccess.mode, role: record.generalAccess.role },
        grants: own,
      },
      role: mine.role,
      via: mine.via,
      capabilities,
    };
  }
  return { record, role: mine.role, via: mine.via, capabilities };
}

export async function shareSetGeneralAccess(
  deps: AccessDeps,
  input: { mode: 'restricted' | 'link'; role?: GrantRole; baseRevision: number },
): Promise<{ record: AccessRecord; url?: string }> {
  const { record, answer } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.setGeneralAccess');
      const role = input.role ?? 'viewer';
      if (input.mode === 'restricted') {
        next.generalAccess = { mode: 'restricted', role };
        return { url: undefined as string | undefined, token: undefined as string | undefined };
      }
      next.generalAccess = { mode: 'link', role };
      // the general access link: one live link per role mode, minted once and rotated by share.stop
      const token = shareToken();
      const link: ShareLink = {
        id: recordId('lnk'),
        hash: hashToken(token),
        role,
        createdAt: now,
        createdBy: deps.caller.principalId,
        revokedAt: null,
        expiresAt: null,
        label: 'Anyone with the link',
        useCount: 0,
      };
      for (const existing of next.links) {
        if (existing.label === 'Anyone with the link' && existing.revokedAt === null)
          existing.revokedAt = now;
      }
      next.links.push(link);
      return { url: shareUrl(deps, token), token };
    },
    (next) => ({
      kind: 'share',
      summary:
        next.generalAccess.mode === 'link'
          ? `General access set to Anyone with the link as ${next.generalAccess.role}`
          : 'General access set to Restricted',
    }),
  );
  return { record, ...(answer.url !== undefined ? { url: answer.url } : {}) };
}

/** An ISO time, or `7d`, `30d`, `90d` on the CLI; null clears. */
export function expiryOf(
  value: string | null | undefined,
  now: string,
  maxDays?: number,
): string | null {
  if (value === undefined || value === null || value === '' || value === 'none') return null;
  const match = /^(\d+)d$/.exec(value);
  const at =
    match !== null ? Date.parse(now) + Number(match[1]) * 24 * 60 * 60 * 1000 : Date.parse(value);
  if (Number.isNaN(at))
    throw new TypeError(`"${value}" is not an ISO time or a day count like 30d`);
  if (maxDays !== undefined && at - Date.parse(now) > maxDays * 24 * 60 * 60 * 1000) {
    throw new TypeError(`an expiry is at most ${maxDays} days ahead`);
  }
  return new Date(at).toISOString();
}

export async function shareCreateLink(
  deps: AccessDeps,
  input: { role: GrantRole; label?: string; expiresAt?: string; baseRevision: number },
): Promise<{ record: AccessRecord; link: ReturnType<typeof linkView>; url: string }> {
  const { record, answer } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.createLink');
      if (next.links.filter((link) => linkIsLive(link, now)).length >= 50) {
        throw new TypeError('a presentation holds at most 50 live links');
      }
      const token = shareToken();
      const link: ShareLink = {
        id: recordId('lnk'),
        hash: hashToken(token),
        role: input.role,
        createdAt: now,
        createdBy: deps.caller.principalId,
        revokedAt: null,
        expiresAt: expiryOf(input.expiresAt, now),
        ...(input.label !== undefined ? { label: input.label } : {}),
        useCount: 0,
      };
      next.links.push(link);
      return { link, url: shareUrl(deps, token) };
    },
    (_next, _now, answer) => ({
      kind: 'share',
      summary: `A ${answer.link.role} link was created${answer.link.label !== undefined ? ` (${answer.link.label})` : ''}`,
    }),
  );
  return { record, link: linkView(answer.link), url: answer.url };
}

function findLink(record: AccessRecord, linkId: string): ShareLink {
  const link = record.links.find((row) => row.id === linkId);
  if (link === undefined) throw new RangeError(`no link ${linkId} on this presentation`);
  return link;
}

export async function shareRevokeLink(
  deps: AccessDeps,
  input: { linkId: string; baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.revokeLink');
      const link = findLink(next, input.linkId);
      if (link.revokedAt === null) link.revokedAt = now;
      if (
        next.generalAccess.mode === 'link' &&
        !next.links.some((row) => row.label === 'Anyone with the link' && row.revokedAt === null)
      ) {
        next.generalAccess = { ...next.generalAccess, mode: 'restricted' };
      }
    },
    () => ({ kind: 'share', summary: 'A link was revoked' }),
  );
  return { record };
}

export async function shareRotateLink(
  deps: AccessDeps,
  input: { linkId: string; baseRevision: number },
): Promise<{ record: AccessRecord; link: ReturnType<typeof linkView>; url: string }> {
  const { record, answer } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.rotateLink');
      const old = findLink(next, input.linkId);
      old.revokedAt = old.revokedAt ?? now;
      const token = shareToken();
      const link: ShareLink = {
        ...old,
        id: recordId('lnk'),
        hash: hashToken(token),
        createdAt: now,
        createdBy: deps.caller.principalId,
        revokedAt: null,
        useCount: 0,
      };
      next.links.push(link);
      return { link, url: shareUrl(deps, token) };
    },
    () => ({ kind: 'share', summary: 'A link was rotated' }),
  );
  return { record, link: linkView(answer.link), url: answer.url };
}

export async function shareStop(
  deps: AccessDeps,
  input: { baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.stop');
      next.generalAccess = { mode: 'restricted', role: next.generalAccess.role };
      for (const link of next.links) if (link.revokedAt === null) link.revokedAt = now;
    },
    () => ({ kind: 'share', summary: 'Sharing stopped: Restricted, every link revoked' }),
  );
  return { record };
}

function sameWho(grant: Grant, who: GrantWho): boolean {
  if ('principalId' in who) return grant.principalId === who.principalId;
  return grant.email !== null && grant.email.toLowerCase() === who.email.toLowerCase();
}

export async function shareInvite(
  deps: AccessDeps,
  input: {
    emails: string[];
    role: GrantRole;
    message?: string;
    notify?: boolean;
    baseRevision: number;
  },
): Promise<{
  record: AccessRecord;
  invited: { email: string; status: 'sent' | 'queued' | 'no-mail' }[];
  url: string;
}> {
  const { record, answer } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.invite');
      if (next.grants.length + input.emails.length > 600)
        throw new TypeError('a presentation holds at most 600 grant holders');
      const invited: { email: string; status: 'sent' | 'queued' | 'no-mail' }[] = [];
      for (const raw of input.emails) {
        const email = raw.trim().toLowerCase();
        const existing = next.grants.find((grant) => sameWho(grant, { email }));
        if (existing !== undefined) {
          existing.role = input.role;
          existing.invitedAt = now;
          existing.invitedBy = deps.caller.principalId;
          if (input.message !== undefined) existing.message = input.message;
        } else {
          next.grants.push({
            principalId: null,
            email,
            role: input.role,
            invitedBy: deps.caller.principalId,
            invitedAt: now,
            acceptedAt: null,
            // pending invitations expire after 30 days (SPEC-3 6.5)
            expiresAt: new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString(),
            ...(input.message !== undefined ? { message: input.message } : {}),
          });
        }
        // a checkout sends no mail; the answer never says whether an account exists
        invited.push({ email, status: input.notify === false ? 'no-mail' : 'no-mail' });
      }
      return invited;
    },
    (_next, _now, invited) => ({
      kind: 'share',
      summary: `${invited.length} ${invited.length === 1 ? 'person' : 'people'} invited as ${input.role}`,
      data: { count: invited.length },
    }),
  );
  return { record, invited: answer, url: `${deps.origin.replace(/\/$/, '')}/deck/${deps.deckId}` };
}

export async function shareSetRole(
  deps: AccessDeps,
  input: { who: GrantWho; role: GrantRole; baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.setRole');
      if ('principalId' in input.who && next.owner === input.who.principalId) {
        throw new ForbiddenError("the owner's row is refused; transfer ownership instead", 'share');
      }
      const grant = next.grants.find((row) => sameWho(row, input.who));
      if (grant === undefined) throw new RangeError('no such grant on this presentation');
      grant.role = input.role;
    },
    () => ({ kind: 'role', summary: `A collaborator became ${input.role}` }),
  );
  return { record };
}

export async function shareRemove(
  deps: AccessDeps,
  input: { who: GrantWho; baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      const own = 'principalId' in input.who && input.who.principalId === deps.caller.principalId;
      if (!own) require(next, deps.caller, now, 'share', 'share.remove');
      const before = next.grants.length;
      next.grants = next.grants.filter((row) => !sameWho(row, input.who));
      if (next.grants.length === before) throw new RangeError('no such grant on this presentation');
    },
    () => ({ kind: 'share', summary: 'Access was removed' }),
  );
  return { record };
}

export async function shareSetExpiry(
  deps: AccessDeps,
  input: { who: GrantWho; expiresAt: string | null; baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.setExpiry');
      const grant = next.grants.find((row) => sameWho(row, input.who));
      if (grant === undefined) throw new RangeError('no such grant on this presentation');
      grant.expiresAt = expiryOf(input.expiresAt, now, 366);
    },
    () => ({ kind: 'share', summary: 'An access expiry was set' }),
  );
  return { record };
}

export async function shareSettings(
  deps: AccessDeps,
  input: Partial<AccessSettings> & { baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'settings', 'share.settings');
      for (const key of [
        'editorsCanShare',
        'viewersCanDownload',
        'viewersCanSeeComments',
        'showNamesToLinkVisitors',
        'allowHtmlBlocks',
      ] as const) {
        const value = input[key];
        if (value !== undefined) next.settings[key] = value;
      }
    },
    () => ({ kind: 'share', summary: 'The sharing settings changed' }),
  );
  return { record };
}

/** Always the one sentence (SPEC-3 6.5, 6.8); the request is recorded when the deck exists and the caller has none. */
export async function shareRequestAccess(
  deps: AccessDeps,
  input: { role: GrantRole; message?: string; email?: string },
): Promise<{ ok: true; message: typeof REQUEST_ACCESS_ANSWER }> {
  const answer: { ok: true; message: typeof REQUEST_ACCESS_ANSWER } = {
    ok: true,
    message: REQUEST_ACCESS_ANSWER,
  };
  if (deps.caller.kind === 'anonymous' && input.email === undefined) return answer;
  try {
    await withDeckLock(deps.deckDir, async () => {
      const now = stamp(deps);
      const { record, stored } = await loadRecord(deps);
      if (!stored && record.owner === deps.caller.principalId) return;
      if (standing(record, deps.caller, now) !== null) return;
      const mine = record.requests.filter(
        (row) =>
          row.respondedAt === null &&
          (row.principalId === deps.caller.principalId ||
            (input.email !== undefined && row.email === input.email)),
      );
      if (mine.length >= 3) return;
      const request: AccessRequest = {
        id: recordId('req'),
        principalId: deps.caller.kind === 'anonymous' ? null : deps.caller.principalId,
        email: input.email ?? deps.caller.email ?? null,
        role: input.role,
        ...(input.message !== undefined ? { message: input.message } : {}),
        askedAt: now,
        respondedAt: null,
      };
      record.requests.push(request);
      record.revision += 1;
      if (deps.save !== undefined) await deps.save(record);
      else writeAccessFile(deps.deckDir, record);
      appendActivity(deps.deckDir, {
        id: `access:${record.revision}:${ulid(Date.parse(now))}`,
        at: now,
        kind: 'request',
        actor: deps.caller.principalId,
        deckId: deps.deckId,
        revision: record.revision,
        summary: `Someone asked for ${input.role} access`,
      });
      if (record.owner !== null) {
        pushNotification(
          deps.stateDir,
          record.owner,
          { kind: 'accessRequest', deckId: deps.deckId, actor: deps.caller.principalId, at: now },
          () => ulid(),
        );
      }
    });
  } catch {
    // the answer is the same sentence whatever happened (09 4.4)
  }
  return answer;
}

export async function shareListRequests(
  deps: AccessDeps,
): Promise<{ requests: (AccessRequest & { label?: string })[] }> {
  const now = stamp(deps);
  const { record } = await loadRecord(deps);
  require(record, deps.caller, now, 'share', 'share.listRequests');
  return { requests: record.requests.filter((row) => row.respondedAt === null) };
}

export async function shareRespond(
  deps: AccessDeps,
  input: { requestId: string; grant: GrantRole | null; notify?: boolean; baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'share', 'share.respond');
      const request = next.requests.find((row) => row.id === input.requestId);
      if (request === undefined) throw new RangeError(`no request ${input.requestId}`);
      request.respondedAt = now;
      if (input.grant !== null) {
        next.grants.push({
          principalId: request.principalId,
          email: request.principalId === null ? request.email : null,
          role: input.grant,
          invitedBy: deps.caller.principalId,
          invitedAt: now,
          acceptedAt: request.principalId === null ? null : now,
          expiresAt: null,
        });
        if (request.principalId !== null) {
          pushNotification(
            deps.stateDir,
            request.principalId,
            { kind: 'granted', deckId: deps.deckId, actor: deps.caller.principalId, at: now },
            () => ulid(),
          );
        }
      }
    },
    () => ({
      kind: 'request',
      summary:
        input.grant === null
          ? 'An access request was declined'
          : `An access request was approved as ${input.grant}`,
    }),
  );
  return { record };
}

export async function shareTransferOwnership(
  deps: AccessDeps,
  input: { to: GrantWho; baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'transfer', 'share.transferOwnership');
      if ('principalId' in input.to && input.to.principalId.startsWith('anon_')) {
        throw new TypeError(
          'ownership goes to a signed in person; an anonymous principal cannot own a presentation',
        );
      }
      next.pendingOwner = {
        principalId: 'principalId' in input.to ? input.to.principalId : null,
        email: 'email' in input.to ? input.to.email : null,
        askedAt: now,
        askedBy: deps.caller.principalId,
      };
      // the target is raised to editor while the offer stands (SPEC-3 6.5)
      const grant = next.grants.find((row) => sameWho(row, input.to));
      if (grant === undefined) {
        next.grants.push({
          principalId: 'principalId' in input.to ? input.to.principalId : null,
          email: 'email' in input.to ? input.to.email : null,
          role: 'editor',
          invitedBy: deps.caller.principalId,
          invitedAt: now,
          acceptedAt: null,
          expiresAt: null,
        });
      } else if (grant.role !== 'editor') grant.role = 'editor';
    },
    () => ({ kind: 'share', summary: 'Ownership was offered' }),
  );
  return { record };
}

function isPendingOwner(record: AccessRecord, caller: Caller): boolean {
  const pending = record.pendingOwner;
  if (pending === null) return false;
  if (pending.principalId !== null && pending.principalId === caller.principalId) return true;
  return (
    pending.email !== null &&
    caller.email !== undefined &&
    pending.email.toLowerCase() === caller.email.toLowerCase()
  );
}

export async function shareAcceptOwnership(
  deps: AccessDeps,
  input: { baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      if (!isPendingOwner(next, deps.caller))
        throw new ForbiddenError(
          'no ownership offer stands for you on this presentation',
          'transfer',
        );
      const previous = next.owner;
      next.owner = deps.caller.principalId;
      next.pendingOwner = null;
      next.grants = next.grants.filter(
        (row) =>
          !sameWho(row, { principalId: deps.caller.principalId }) &&
          !(deps.caller.email !== undefined && sameWho(row, { email: deps.caller.email })),
      );
      if (previous !== null) {
        next.grants.push({
          principalId: previous,
          email: null,
          role: 'editor',
          invitedBy: deps.caller.principalId,
          invitedAt: now,
          acceptedAt: now,
          expiresAt: null,
        });
      }
      if (next.generalAccess.mode === 'open')
        next.generalAccess = { ...next.generalAccess, role: 'viewer' };
    },
    () => ({ kind: 'share', summary: 'Ownership was accepted' }),
  );
  return { record };
}

export async function shareDeclineOwnership(
  deps: AccessDeps,
  input: { baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next) => {
      if (!isPendingOwner(next, deps.caller))
        throw new ForbiddenError(
          'no ownership offer stands for you on this presentation',
          'transfer',
        );
      next.pendingOwner = null;
    },
    () => ({ kind: 'share', summary: 'Ownership was declined' }),
  );
  return { record };
}

/** A signed in principal claims an unowned deck; an admin any unowned deck; `open: viewer` afterwards (SPEC-3 6.1). */
export async function shareClaim(
  deps: AccessDeps,
  input: { baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      if (next.owner !== null && next.owner !== deps.caller.principalId) {
        throw new ForbiddenError('this presentation has an owner already', 'transfer');
      }
      if (deps.caller.kind === 'anonymous' && deps.caller.admin !== true) {
        throw new ForbiddenError('sign in to claim a presentation', 'transfer');
      }
      next.owner = deps.caller.principalId;
      if (next.createdBy === 'legacy') next.createdBy = deps.caller.principalId;
      next.generalAccess =
        next.generalAccess.mode === 'open' ? { mode: 'open', role: 'viewer' } : next.generalAccess;
      void now;
    },
    () => ({ kind: 'share', summary: 'The presentation was claimed' }),
  );
  return { record };
}

/** Declared this round; answers not implemented with the clause of SPEC-3 13.3 (round four). */
export function shareEmailCollaborators(): never {
  throw new NotImplementedError(
    'share.emailCollaborators',
    'round four (SPEC-3 6.5: The invitation carries your message)',
  );
}

export async function deckPublish(
  deps: AccessDeps,
  input: { baseRevision: number },
): Promise<{ record: AccessRecord; url: string; embed: string }> {
  const { record, answer } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'publish', 'deck.publish');
      const token = shareToken();
      next.publish = {
        hash: hashToken(token),
        publishedAt: now,
        publishedBy: deps.caller.principalId,
        revokedAt: null,
      };
      return token;
    },
    () => ({ kind: 'share', summary: 'Published to the web' }),
  );
  const origin = deps.origin.replace(/\/$/, '');
  return {
    record,
    url: `${origin}/deck/${deps.deckId}?p=${answer}&present=1`,
    embed: `${origin}/embed/${deps.deckId}?p=${answer}`,
  };
}

export async function deckUnpublish(
  deps: AccessDeps,
  input: { baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next, now) => {
      require(next, deps.caller, now, 'publish', 'deck.unpublish');
      if (next.publish !== null && next.publish.revokedAt === null) next.publish.revokedAt = now;
    },
    () => ({ kind: 'share', summary: 'Publishing stopped' }),
  );
  return { record };
}

/** An admin sets a deck's owner (SPEC-3 12 admin.assignOwner). */
export async function adminAssignOwner(
  deps: AccessDeps,
  input: { to: GrantWho; baseRevision: number },
): Promise<{ record: AccessRecord }> {
  const { record } = await write(
    deps,
    input.baseRevision,
    (next) => {
      if (deps.caller.admin !== true && deps.caller.kind !== 'local') {
        throw new ForbiddenError('assigning an owner is an admin action', 'transfer');
      }
      if ('email' in input.to) {
        // an email owner binds on the first verified session: recorded as a pending owner with a grant
        next.pendingOwner = {
          principalId: null,
          email: input.to.email,
          askedAt: stamp(deps),
          askedBy: deps.caller.principalId,
        };
        if (!next.grants.some((row) => sameWho(row, input.to))) {
          next.grants.push({
            principalId: null,
            email: input.to.email,
            role: 'editor',
            invitedBy: deps.caller.principalId,
            invitedAt: stamp(deps),
            acceptedAt: null,
            expiresAt: null,
          });
        }
        return;
      }
      next.owner = input.to.principalId;
      next.pendingOwner = null;
      if (next.createdBy === 'legacy') next.createdBy = input.to.principalId;
    },
    () => ({ kind: 'role', summary: 'An owner was assigned' }),
  );
  return { record };
}
