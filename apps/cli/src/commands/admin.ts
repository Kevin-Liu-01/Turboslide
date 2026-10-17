// The admin commands (gslides-parity SPEC-3 7.9, 8.12, 11.5, 12): `admin flag <name> [on|off]`
// reads or flips a kill switch (`.turboslide/flags.json` on a checkout, Redis hosted), `admin
// assign-owner <id> --email|--principal` sets a deck's owner, and `admin bootstrap`, `admin
// migrate-storage <step>`, `admin mail` and `admin avatar-sweep` run on a hosted studio only
// (`--to <url>`).
import { FLAG_NAMES } from '@turboslide/schema/access';
import { MIGRATION_STEPS } from '@turboslide/schema/actions';

import { flagBoolean, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { deckIdArg, whoFlag } from './share.ts';

/** The budget of one migration call the CLI sends (HR-K1#4b), in seconds. */
export const DEFAULT_MIGRATION_BUDGET_S = 240;

export const ADMIN_USAGE = `usage: turboslide admin <flag|assign-owner|bootstrap|migrate-storage|mail|avatar-sweep> ...
  admin flag <name> [on|off]        read or flip a kill switch (admin.flag); names: ${FLAG_NAMES.join(', ')}
  admin assign-owner <id> --email <a@x>|--principal <id>
                                    set a deck's owner (admin.assignOwner)
  admin bootstrap --to <url> --email <a@x>
                                    the static bearer gives an email the admin role and mints the first key (admin.bootstrap)
  admin migrate-storage <plan|freeze|copy|verify|switch|unfreeze|rekey|rollback|delete|sweep-produced> --to <url>
                       [--budget <s>] [--concurrency <n>] [--i-have-a-backup <iso>]
                                    one call of a step of the storage layout v2 migration in one
                                    window (admin.migrateStorage; docs/hosting.md 10): the call
                                    answers after --budget seconds (120 to 240, 240 by default);
                                    delete names the time the backup of the private store began;
                                    sweep-produced removes the exports and bundles HR-K1#5b left
                                    on the public store (production, on v2, final)
  admin mail --to <url> [--since <iso>] [--limit <n>]
                                    the mail captured under TURBOSLIDE_MAIL=capture (admin.mail.list)
  admin avatar-sweep --to <url> [--dry-run]
                                    remove picture files under u/ that no profile names (admin.avatar.sweep)`;

export async function admin(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'flag': {
      const name = rest[0];
      if (name === undefined || !(FLAG_NAMES as ReadonlyArray<string>).includes(name)) {
        throw new UsageError(`admin flag wants one of ${FLAG_NAMES.join(', ')}\n${ADMIN_USAGE}`);
      }
      const word = rest[1] ?? flagString(ctx.args, 'on');
      const on =
        word === undefined
          ? undefined
          : word === 'on' || word === 'true'
            ? true
            : word === 'off' || word === 'false'
              ? false
              : undefined;
      if (word !== undefined && on === undefined)
        throw new UsageError(`admin flag wants on or off, got ${word}`);
      const result = await runDeckAction<{
        name: string;
        on: boolean;
        default: boolean;
        source: string;
      }>(ctx, 'admin.flag', { name, ...(on !== undefined ? { on } : {}) });
      ctx.out.result(result);
      ctx.out.human(
        `${result.name}: ${result.on ? 'on' : 'off'} (${result.source}; ${result.default ? 'on' : 'off'} when the store is unreachable)`,
      );
      return 0;
    }
    case 'assign-owner': {
      const id = deckIdArg(inner);
      const base = flagString(ctx.args, 'base-revision');
      const baseRevision =
        base !== undefined
          ? Number(base)
          : ((
              await runDeckAction<{ record: { revision?: number } }>(
                ctx,
                'share.get',
                { id },
                { deck: id },
              )
            ).record.revision ?? 0);
      const result = await runDeckAction<{ record: { owner: string | null; revision: number } }>(
        ctx,
        'admin.assignOwner',
        { id, to: whoFlag(ctx), baseRevision },
        { deck: id },
      );
      ctx.out.result(result);
      ctx.out.human(
        `owner of ${id}: ${result.record.owner ?? 'pending'}; record revision ${result.record.revision}`,
      );
      return 0;
    }
    case 'bootstrap': {
      const email = flagString(ctx.args, 'email');
      if (email === undefined)
        throw new UsageError(`admin bootstrap wants --email <a@x>\n${ADMIN_USAGE}`);
      const result = await runDeckAction<{ principalId: string; tokenOnce: string }>(
        ctx,
        'admin.bootstrap',
        { email },
        { hostedOnly: true },
      );
      ctx.out.result(result);
      ctx.out.human(`${result.principalId} is the admin; the first key is in the JSON answer once`);
      return 0;
    }
    case 'migrate-storage': {
      const step = rest[0];
      if (step === undefined || !(MIGRATION_STEPS as ReadonlyArray<string>).includes(step)) {
        throw new UsageError(
          `admin migrate-storage wants one of ${MIGRATION_STEPS.join(', ')}\n${ADMIN_USAGE}`,
        );
      }
      const backupAt = flagString(ctx.args, 'i-have-a-backup');
      const concurrency = flagString(ctx.args, 'concurrency');
      const budget = flagNumber(ctx.args, 'budget', DEFAULT_MIGRATION_BUDGET_S);
      if (!(budget >= 120 && budget <= 240))
        throw new UsageError('admin migrate-storage wants --budget between 120 and 240 seconds');
      const result = await runDeckAction<{
        step: string;
        state: string;
        frozen: boolean;
        done: boolean;
        processed: number;
        remaining: number;
        rows: string[];
        rowCount: number;
        settlesAt: string | null;
        expiresAt: string | null;
        perSecond: number | null;
        rekeyAfter: string | null;
        note: string | null;
      }>(
        ctx,
        'admin.migrateStorage',
        {
          step,
          budgetMs: Math.round(budget * 1000),
          ...(concurrency === undefined
            ? {}
            : { concurrency: flagNumber(ctx.args, 'concurrency', 32) }),
          ...(backupAt === undefined ? {} : { backupAt }),
        },
        { hostedOnly: true },
      );
      ctx.out.result(result);
      const times = [
        ...(result.settlesAt === null ? [] : [`settles ${result.settlesAt}`]),
        ...(result.expiresAt === null ? [] : [`frozen until ${result.expiresAt} at most`]),
        ...(result.perSecond === null ? [] : [`${result.perSecond} a second`]),
        ...(result.rekeyAfter === null ? [] : [`run rekey again from ${result.rekeyAfter}`]),
      ];
      ctx.out.human(
        `${result.step}: ${result.state}${result.frozen ? ' frozen' : ''}, ${result.done ? 'done' : 'not done'}; ${result.processed} processed, ${result.remaining} remaining, ${result.rowCount} rows${times.length === 0 ? '' : `; ${times.join(', ')}`}`,
      );
      if (result.note !== null) ctx.out.human(`  ${result.note}`);
      for (const line of result.rows) ctx.out.human(`  ${line}`);
      return 0;
    }
    case 'mail': {
      const since = flagString(ctx.args, 'since');
      const result = await runDeckAction<{
        mail: { id: string; to: string; subject: string; kind: string; sentAt: string }[];
      }>(
        ctx,
        'admin.mail.list',
        {
          ...(since !== undefined ? { since } : {}),
          ...(flagString(ctx.args, 'limit') !== undefined
            ? { limit: flagNumber(ctx.args, 'limit', 100) }
            : {}),
        },
        { hostedOnly: true },
      );
      ctx.out.result(result);
      for (const row of result.mail)
        ctx.out.human(`${row.sentAt}  ${row.kind.padEnd(12)} ${row.to}  ${row.subject}`);
      return 0;
    }
    case 'avatar-sweep': {
      /* the people round's janitor (docs/archive/rounds/PEOPLE.md 4.6; build/b4.md R3): the orphans under u/ by
         key, listed on a dry run and removed on a run; refused without an identity database */
      const dryRun = flagBoolean(ctx.args, 'dry-run');
      const result = await runDeckAction<{
        dryRun: boolean;
        scanned: number;
        kept: number;
        young: number;
        orphans: string[];
        filesRemoved: number;
      }>(ctx, 'admin.avatar.sweep', dryRun ? { dryRun: true } : {}, { hostedOnly: true });
      ctx.out.result(result);
      ctx.out.human(
        `${result.scanned} scanned, ${result.kept} kept, ${result.young} young, ${result.orphans.length} orphan${result.orphans.length === 1 ? '' : 's'}; ${result.dryRun ? 'a dry run, nothing removed' : `${result.filesRemoved} file${result.filesRemoved === 1 ? '' : 's'} removed`}`,
      );
      return 0;
    }
    default:
      throw new UsageError(`unknown subcommand "admin ${sub ?? ''}"\n${ADMIN_USAGE}`);
  }
}
