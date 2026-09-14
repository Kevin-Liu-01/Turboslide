// The share commands (gslides-parity SPEC-3 6.9, 12): the access record's general access, links,
// invitations, roles, expiries, the gear's switches, the requests, ownership, the claim, and
// `share get`. Every write takes the record's `--base-revision` (the current one when omitted)
// and prints the URL of a new link once against the studio's origin; the token is never stored,
// only its hash. On a checkout the record is `.turboslide/access.json` under the deck and the
// folder's holder is the owner; `--to <studio>` runs the same action hosted.
import type { AccessRecord, GrantRole, GrantWho } from '@turboslide/schema/access';
import { GRANT_ROLES } from '@turboslide/schema/access';

import { flagAll, flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { openStore, requirePositional } from '../write.ts';

export const SHARE_USAGE = `usage: turboslide share <get|access|link|revoke-link|rotate-link|stop|invite|role|remove|expire|settings|requests|respond|transfer|accept-ownership|decline-ownership|claim|email> <id> ...
  share get <id>                    the record, the caller's role and capabilities (share.get)
  share access <id> --mode restricted|link [--role viewer|commenter|editor]
                                    General access; link mints a token and prints its /s/ URL once (share.setGeneralAccess)
  share link <id> --role <role> [--label <text>] [--expires 7d|30d|90d|<iso>]
                                    a share link, its URL printed once (share.createLink)
  share revoke-link <id> <linkId> | share rotate-link <id> <linkId>
                                    (share.revokeLink, share.rotateLink)
  share stop <id>                   Restricted, every link revoked (share.stop)
  share invite <id> --email <a@x> [--email <b@y>] --role <role> [--message <text>] [--no-notify]
                                    one grant per address (share.invite)
  share role <id> --email <a@x>|--principal <id> --role <role>
                                    (share.setRole)
  share remove <id> --email <a@x>|--principal <id>
                                    (share.remove)
  share expire <id> --email <a@x>|--principal <id> --at <iso|7d|none>
                                    (share.setExpiry)
  share settings <id> [--editors-can-share true|false] [--viewers-can-download true|false]
           [--viewers-can-see-comments true|false] [--show-names-to-link-visitors true|false] [--allow-html-blocks true|false]
                                    the gear's five switches, owner only (share.settings)
  share requests <id> | share respond <id> <requestId> --grant <role>|--decline [--notify]
                                    (share.listRequests, share.respond)
  share transfer <id> --email <a@x>|--principal <id>
                                    (share.transferOwnership)
  share accept-ownership <id> | share decline-ownership <id> | share claim <id>
                                    (share.acceptOwnership, share.declineOwnership, share.claim)
  share email <id> --message <text> declared; not available in Turboslide yet (share.emailCollaborators)
  deck publish <id> | deck unpublish <id>
                                    the published player's token, printed once, and its revocation (deck.publish, deck.unpublish)
Every write takes --base-revision <n> (the record's revision; the current one when omitted), --to <studio> and --json.`;

function roleFlag(ctx: CommandContext, required: boolean): GrantRole | undefined {
  const value = flagString(ctx.args, 'role');
  if (value === undefined) {
    if (required) throw new UsageError(`--role wants viewer, commenter or editor\n${SHARE_USAGE}`);
    return undefined;
  }
  if (!(GRANT_ROLES as ReadonlyArray<string>).includes(value)) {
    throw new UsageError(`--role wants viewer, commenter or editor, got ${value}\n${SHARE_USAGE}`);
  }
  return value as GrantRole;
}

/** `--email <a@x>` or `--principal <id>`: who a grant names. */
export function whoFlag(ctx: CommandContext): GrantWho {
  const email = flagString(ctx.args, 'email');
  const principal = flagString(ctx.args, 'principal');
  if (email !== undefined && principal === undefined) return { email: email.trim().toLowerCase() };
  if (principal !== undefined && email === undefined) return { principalId: principal };
  throw new UsageError(
    `name the person with --email <a@x> or --principal <id>, not both\n${SHARE_USAGE}`,
  );
}

function boolFlag(ctx: CommandContext, name: string): boolean | undefined {
  const value = flagString(ctx.args, name);
  if (value === undefined) return ctx.args.flags[name] === true ? true : undefined;
  if (value === 'true' || value === '1' || value === 'on') return true;
  if (value === 'false' || value === '0' || value === 'off') return false;
  throw new UsageError(`--${name} wants true or false, got ${value}`);
}

/** The record's revision the write bases on: --base-revision, else the current record's. */
async function recordRevision(ctx: CommandContext, id: string): Promise<number> {
  const flag = flagString(ctx.args, 'base-revision');
  if (flag !== undefined) {
    const n = Number(flag);
    if (!Number.isInteger(n) || n < 0)
      throw new UsageError(`--base-revision wants a non-negative integer, got ${flag}`);
    return n;
  }
  const current = await runDeckAction<{ record: { revision?: number } }>(
    ctx,
    'share.get',
    { id },
    { deck: id },
  );
  return current.record.revision ?? 0;
}

function printRecord(
  ctx: CommandContext,
  verb: string,
  result: {
    record: AccessRecord;
    url?: string;
    embed?: string;
    link?: { id: string; role: string };
  },
): void {
  ctx.out.result(result);
  const record = result.record;
  const live = record.links.filter((link) => link.revokedAt === null).length;
  ctx.out.human(
    `${verb}: ${record.generalAccess.mode === 'link' ? `Anyone with the link as ${record.generalAccess.role}` : record.generalAccess.mode === 'open' ? 'Anyone with the address can view (legacy)' : 'Restricted'}, ${record.grants.length} grant${record.grants.length === 1 ? '' : 's'}, ${live} live link${live === 1 ? '' : 's'}${record.publish !== null && record.publish.revokedAt === null ? ', published' : ''}; record revision ${record.revision}`,
  );
  if (result.link !== undefined) ctx.out.human(`  link ${result.link.id} (${result.link.role})`);
  if (result.url !== undefined) ctx.out.human(`  ${result.url}`);
  if (result.embed !== undefined) ctx.out.human(`  ${result.embed}`);
}

/** The deck id the command names, or the resolved deck's. */
export function deckIdArg(ctx: CommandContext): string {
  const id = ctx.rest[0];
  if (id !== undefined && id !== '') return id;
  return openStore(ctx).id;
}

/** Runs a share write against the named deck: the deck folder `--deck` names must be that deck. */
async function shareWrite<T extends { record: AccessRecord }>(
  ctx: CommandContext,
  id: string,
  action: Parameters<typeof runDeckAction>[1],
  input: Record<string, unknown>,
): Promise<T> {
  const baseRevision = await recordRevision(ctx, id);
  return runDeckAction<T>(ctx, action, { id, ...input, baseRevision }, { deck: id });
}

export async function share(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  if (sub === undefined) throw new UsageError(SHARE_USAGE);
  const id = deckIdArg(inner);
  switch (sub) {
    case 'get': {
      const result = await runDeckAction<{
        record: Partial<AccessRecord>;
        role: string | null;
        via: string | null;
        capabilities: string[];
      }>(ctx, 'share.get', { id }, { deck: id });
      ctx.out.result(result);
      const record = result.record;
      ctx.out.human(
        `${id}: ${record.generalAccess?.mode ?? 'restricted'}${record.generalAccess?.mode === 'link' ? ` as ${record.generalAccess.role}` : ''}, owner ${record.owner ?? 'none'}; you are ${result.role ?? 'without access'}${result.via ? ` (${result.via})` : ''}: ${result.capabilities.join(', ')}`,
      );
      for (const grant of record.grants ?? []) {
        ctx.out.human(
          `  ${(grant.email ?? grant.principalId ?? '').padEnd(32)} ${grant.role}${grant.acceptedAt === null ? '  pending' : ''}${grant.expiresAt !== null ? `  until ${grant.expiresAt}` : ''}`,
        );
      }
      for (const link of record.links ?? []) {
        if (link.revokedAt !== null) continue;
        ctx.out.human(
          `  link ${link.id}  ${link.role}${link.label !== undefined ? `  ${link.label}` : ''}${link.expiresAt !== null ? `  until ${link.expiresAt}` : ''}`,
        );
      }
      return 0;
    }
    case 'access': {
      const mode = flagString(ctx.args, 'mode');
      if (mode !== 'restricted' && mode !== 'link')
        throw new UsageError(`--mode wants restricted or link\n${SHARE_USAGE}`);
      const role = roleFlag(ctx, false);
      const result = await shareWrite<{ record: AccessRecord; url?: string }>(
        ctx,
        id,
        'share.setGeneralAccess',
        { mode, ...(role !== undefined ? { role } : {}) },
      );
      printRecord(ctx, 'general access', result);
      return 0;
    }
    case 'link': {
      const role = roleFlag(ctx, true);
      const label = flagString(ctx.args, 'label');
      const expires = flagString(ctx.args, 'expires');
      const result = await shareWrite<{
        record: AccessRecord;
        link: { id: string; role: string };
        url: string;
      }>(ctx, id, 'share.createLink', {
        role,
        ...(label !== undefined ? { label } : {}),
        ...(expires !== undefined ? { expiresAt: expires } : {}),
      });
      printRecord(ctx, 'link created', result);
      return 0;
    }
    case 'revoke-link':
    case 'rotate-link': {
      const linkId = requirePositional(inner, 1, SHARE_USAGE);
      const result = await shareWrite<{
        record: AccessRecord;
        url?: string;
        link?: { id: string; role: string };
      }>(ctx, id, sub === 'revoke-link' ? 'share.revokeLink' : 'share.rotateLink', { linkId });
      printRecord(ctx, sub === 'revoke-link' ? 'link revoked' : 'link rotated', result);
      return 0;
    }
    case 'stop': {
      const result = await shareWrite<{ record: AccessRecord }>(ctx, id, 'share.stop', {});
      printRecord(ctx, 'sharing stopped', result);
      return 0;
    }
    case 'invite': {
      const emails = flagAll(ctx.args, 'email');
      if (emails.length === 0)
        throw new UsageError(`share invite wants --email <a@x>\n${SHARE_USAGE}`);
      const role = roleFlag(ctx, true);
      const message = flagString(ctx.args, 'message');
      const result = await shareWrite<{
        record: AccessRecord;
        invited: { email: string; status: string }[];
        url: string;
      }>(ctx, id, 'share.invite', {
        emails,
        role,
        ...(message !== undefined ? { message } : {}),
        ...(flagBoolean(ctx.args, 'no-notify') ? { notify: false } : {}),
      });
      printRecord(ctx, 'invited', result);
      for (const row of result.invited) ctx.out.human(`  ${row.email}: ${row.status}`);
      return 0;
    }
    case 'role': {
      const result = await shareWrite<{ record: AccessRecord }>(ctx, id, 'share.setRole', {
        who: whoFlag(ctx),
        role: roleFlag(ctx, true),
      });
      printRecord(ctx, 'role changed', result);
      return 0;
    }
    case 'remove': {
      const result = await shareWrite<{ record: AccessRecord }>(ctx, id, 'share.remove', {
        who: whoFlag(ctx),
      });
      printRecord(ctx, 'access removed', result);
      return 0;
    }
    case 'expire': {
      const at = flagString(ctx.args, 'at');
      if (at === undefined)
        throw new UsageError(`share expire wants --at <iso|7d|none>\n${SHARE_USAGE}`);
      const result = await shareWrite<{ record: AccessRecord }>(ctx, id, 'share.setExpiry', {
        who: whoFlag(ctx),
        expiresAt: at === 'none' ? null : at,
      });
      printRecord(ctx, 'expiry set', result);
      return 0;
    }
    case 'settings': {
      const patch: Record<string, boolean> = {};
      for (const [flag, key] of [
        ['editors-can-share', 'editorsCanShare'],
        ['viewers-can-download', 'viewersCanDownload'],
        ['viewers-can-see-comments', 'viewersCanSeeComments'],
        ['show-names-to-link-visitors', 'showNamesToLinkVisitors'],
        ['allow-html-blocks', 'allowHtmlBlocks'],
      ] as const) {
        const value = boolFlag(ctx, flag);
        if (value !== undefined) patch[key] = value;
      }
      if (Object.keys(patch).length === 0)
        throw new UsageError(`share settings wants at least one switch\n${SHARE_USAGE}`);
      const result = await shareWrite<{ record: AccessRecord }>(ctx, id, 'share.settings', patch);
      printRecord(ctx, 'settings changed', result);
      return 0;
    }
    case 'requests': {
      const result = await runDeckAction<{
        requests: {
          id: string;
          email: string | null;
          principalId: string | null;
          role: string;
          message?: string;
          askedAt: string;
        }[];
      }>(ctx, 'share.listRequests', { id }, { deck: id });
      ctx.out.result(result);
      if (result.requests.length === 0) ctx.out.human('No pending requests');
      for (const row of result.requests)
        ctx.out.human(
          `  ${row.id}  ${row.email ?? row.principalId ?? ''}  ${row.role}  ${row.askedAt}${row.message !== undefined ? `  "${row.message}"` : ''}`,
        );
      return 0;
    }
    case 'respond': {
      const requestId = requirePositional(inner, 1, SHARE_USAGE);
      const decline = flagBoolean(ctx.args, 'decline');
      const grant = flagString(ctx.args, 'grant');
      if (
        !decline &&
        (grant === undefined || !(GRANT_ROLES as ReadonlyArray<string>).includes(grant))
      ) {
        throw new UsageError(
          `share respond wants --grant viewer|commenter|editor or --decline\n${SHARE_USAGE}`,
        );
      }
      const result = await shareWrite<{ record: AccessRecord }>(ctx, id, 'share.respond', {
        requestId,
        grant: decline ? null : grant,
        ...(flagBoolean(ctx.args, 'notify') ? { notify: true } : {}),
      });
      printRecord(ctx, decline ? 'request declined' : 'request approved', result);
      return 0;
    }
    case 'transfer': {
      const result = await shareWrite<{ record: AccessRecord }>(
        ctx,
        id,
        'share.transferOwnership',
        { to: whoFlag(ctx) },
      );
      printRecord(ctx, 'ownership offered', result);
      return 0;
    }
    case 'accept-ownership':
    case 'decline-ownership':
    case 'claim': {
      const action =
        sub === 'accept-ownership'
          ? 'share.acceptOwnership'
          : sub === 'decline-ownership'
            ? 'share.declineOwnership'
            : 'share.claim';
      const result = await shareWrite<{ record: AccessRecord }>(ctx, id, action, {});
      printRecord(
        ctx,
        sub === 'claim'
          ? 'claimed'
          : sub === 'accept-ownership'
            ? 'ownership accepted'
            : 'ownership declined',
        result,
      );
      return 0;
    }
    case 'email': {
      const message = flagString(ctx.args, 'message');
      if (message === undefined)
        throw new UsageError(`share email wants --message <text>\n${SHARE_USAGE}`);
      await shareWrite(ctx, id, 'share.emailCollaborators', { to: 'all', message });
      return 0;
    }
    default:
      throw new UsageError(`unknown subcommand "share ${sub}"\n${SHARE_USAGE}`);
  }
}

/** `deck publish <id>` and `deck unpublish <id>` (deck.publish, deck.unpublish), called from the deck command. */
export async function publish(ctx: CommandContext, off: boolean): Promise<number> {
  const id = deckIdArg(ctx);
  const result = await shareWrite<{ record: AccessRecord; url?: string; embed?: string }>(
    ctx,
    id,
    off ? 'deck.unpublish' : 'deck.publish',
    {},
  );
  printRecord(ctx, off ? 'publishing stopped' : 'published', result);
  return 0;
}
