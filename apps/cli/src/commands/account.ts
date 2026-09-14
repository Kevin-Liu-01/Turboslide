// The account commands (gslides-parity SPEC-3 7.9, 12): `account me` (the caller's principal,
// trust, label, mark and avatar), `account name <name>` (the display name under the rules of
// 0.19), `account avatar --variant <v>` (the mark: initials, glyph, dither; a picture needs a
// signed in principal), `account decks --view <v>` (the caller's index) on a checkout or hosted;
// `account sessions`, `account sign-out` and `account tokens create|list|revoke` on a hosted studio
// only (`--to <url>`), where the identity store lives.
import { flagAll, flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';

export const ACCOUNT_USAGE = `usage: turboslide account <me|name|avatar|decks|sessions|sign-out|tokens> ...
  account me [--avatar-png <file>]  the caller's principal, trust, label, mark and avatar (account.me)
  account name <name>               the display name (account.setName)
  account avatar --variant initials|glyph|dither|picture [--initials <XY>] [--another]
                                    the mark (account.setAvatar)
  account decks [--view owned|shared|recent|trash|all]
                                    the caller's presentations (account.decks)
  account sessions --to <url>       the sign in sessions (account.sessions)
  account sign-out [--session <id>|--all] --to <url>
                                    end one session or every other one (account.signOut)
  account tokens create --to <url> --name <n> --scope read [--scope export] [--expires <iso>]
  account tokens list --to <url> | account tokens revoke <tokenId> --to <url>
                                    API keys (account.tokens.create, account.tokens.list, account.tokens.revoke)
Every command takes --to <studio> (required for sessions, sign-out and tokens), --author <name> and --json.`;

type Me = {
  principal: { id: string; kind: string };
  trust: string;
  label: string;
  name?: string;
  avatar: { variant: string } | null;
};

function printMe(ctx: CommandContext, me: Me): void {
  ctx.out.result(me);
  ctx.out.human(
    `${me.name ?? me.label} (${me.trust}) ${me.principal.id}; avatar ${me.avatar?.variant ?? 'none'}`,
  );
}

export async function account(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'me': {
      const png = flagString(ctx.args, 'avatar-png');
      if (png !== undefined) {
        throw new UsageError(
          '--avatar-png needs the mark renderer of @turboslide/identity, which lands with the identity package on the CLI (docs/gslides-parity/build-3/b1.md); the mark is in the JSON answer',
        );
      }
      printMe(ctx, await runDeckAction<Me>(ctx, 'account.me', {}));
      return 0;
    }
    case 'name': {
      const name = rest.join(' ').trim();
      if (name === '') throw new UsageError(`account name wants a name\n${ACCOUNT_USAGE}`);
      printMe(ctx, await runDeckAction<Me>(ctx, 'account.setName', { name }));
      return 0;
    }
    case 'avatar': {
      const variant = flagString(ctx.args, 'variant');
      if (
        variant !== 'initials' &&
        variant !== 'glyph' &&
        variant !== 'dither' &&
        variant !== 'picture'
      ) {
        throw new UsageError(
          `--variant wants initials, glyph, dither or picture\n${ACCOUNT_USAGE}`,
        );
      }
      const initials = flagString(ctx.args, 'initials');
      const salt = flagBoolean(ctx.args, 'another')
        ? Math.floor(Math.random() * 2 ** 31)
        : undefined;
      const picture = flagString(ctx.args, 'picture');
      printMe(
        ctx,
        await runDeckAction<Me>(ctx, 'account.setAvatar', {
          variant,
          ...(initials !== undefined ? { initials } : {}),
          ...(salt !== undefined ? { salt } : {}),
          ...(picture !== undefined ? { picture } : {}),
        }),
      );
      return 0;
    }
    case 'decks': {
      const view = flagString(ctx.args, 'view') ?? 'owned';
      if (!['owned', 'shared', 'recent', 'trash', 'all'].includes(view))
        throw new UsageError(`--view wants owned, shared, recent, trash or all\n${ACCOUNT_USAGE}`);
      const rows = await runDeckAction<
        {
          id: string;
          title: string;
          slides: number;
          revision: number;
          role?: string;
          owner?: string | null;
        }[]
      >(ctx, 'account.decks', { view });
      ctx.out.result(rows);
      if (rows.length === 0) ctx.out.human(`no presentations under ${view}`);
      for (const row of rows)
        ctx.out.human(
          `${row.id.padEnd(28)} ${String(row.slides).padStart(3)} slides  r${String(row.revision).padEnd(5)} ${row.role ?? ''}  ${row.title}`,
        );
      return 0;
    }
    case 'sessions': {
      const result = await runDeckAction<{
        sessions: {
          id: string;
          createdAt: string;
          lastSeenAt: string;
          current: boolean;
          userAgent?: string;
        }[];
      }>(ctx, 'account.sessions', {}, { hostedOnly: true });
      ctx.out.result(result);
      for (const row of result.sessions)
        ctx.out.human(
          `${row.current ? '*' : ' '} ${row.id}  ${row.lastSeenAt}  ${row.userAgent ?? ''}`,
        );
      return 0;
    }
    case 'sign-out': {
      const session = flagString(ctx.args, 'session');
      const all = flagBoolean(ctx.args, 'all');
      if (session === undefined && !all)
        throw new UsageError(`account sign-out wants --session <id> or --all\n${ACCOUNT_USAGE}`);
      const result = await runDeckAction<{ signedOut: number }>(
        ctx,
        'account.signOut',
        all ? { all: true } : { sessionId: session },
        { hostedOnly: true },
      );
      ctx.out.result(result);
      ctx.out.human(`${result.signedOut} session${result.signedOut === 1 ? '' : 's'} ended`);
      return 0;
    }
    case 'tokens':
      return tokens({ ...ctx, rest });
    default:
      throw new UsageError(`unknown subcommand "account ${sub ?? ''}"\n${ACCOUNT_USAGE}`);
  }
}

async function tokens(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'create': {
      const name = flagString(ctx.args, 'name');
      const scopes = flagAll(ctx.args, 'scope');
      if (name === undefined || scopes.length === 0)
        throw new UsageError(
          `account tokens create wants --name <n> and --scope <s>\n${ACCOUNT_USAGE}`,
        );
      const expires = flagString(ctx.args, 'expires');
      const result = await runDeckAction<{
        token: { tokenId: string; name: string; scopes: string[] };
        secret: string;
      }>(
        ctx,
        'account.tokens.create',
        { name, scopes, ...(expires !== undefined ? { expiresAt: expires } : {}) },
        { hostedOnly: true },
      );
      ctx.out.result(result);
      ctx.out.human(
        `key ${result.token.tokenId} (${result.token.scopes.join(', ')}) created; the secret is in the JSON answer once`,
      );
      return 0;
    }
    case 'list': {
      const result = await runDeckAction<{
        tokens: {
          tokenId: string;
          name: string;
          scopes: string[];
          createdAt: string;
          lastUsedAt: string | null;
        }[];
      }>(ctx, 'account.tokens.list', {}, { hostedOnly: true });
      ctx.out.result(result);
      for (const row of result.tokens)
        ctx.out.human(
          `${row.tokenId}  ${row.name}  ${row.scopes.join(',')}  ${row.createdAt}  ${row.lastUsedAt ?? 'never used'}`,
        );
      return 0;
    }
    case 'revoke': {
      const tokenId = rest[0];
      if (tokenId === undefined)
        throw new UsageError(`account tokens revoke wants <tokenId>\n${ACCOUNT_USAGE}`);
      const result = await runDeckAction<{
        tokenId: string;
        revoked: true;
        sessionsClosed: number;
      }>(ctx, 'account.tokens.revoke', { tokenId }, { hostedOnly: true });
      ctx.out.result(result);
      ctx.out.human(
        `${result.tokenId} revoked; ${result.sessionsClosed} session${result.sessionsClosed === 1 ? '' : 's'} closed`,
      );
      return 0;
    }
    default:
      throw new UsageError(`unknown subcommand "account tokens ${sub ?? ''}"\n${ACCOUNT_USAGE}`);
  }
}
