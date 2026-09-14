// The version commands (SPEC 6.7, 7.1): version save -m <note> appends a named version at the
// current revision; version list prints the log, every committed write and every save with its
// author; version restore <n> is a write carrying the version.restore mutation, so it is undoable
// and visible in the log like any other write.
import type { Version } from '@turboslide/schema/mutations';
import { authorLabel } from '@turboslide/store/store';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { versionDiff, versionList, versionRestore, versionSave } from '../store-actions.ts';
import { baseRevision, openStore, runAction, storeDeps, writeContext } from '../write.ts';

const USAGE = `usage: turboslide version <save|list|restore> ...
  version save -m <note>            a named version at the current revision (also --message, --note)
  version list [--named]            the log: every write and every save, oldest first
  version restore <n>               restore version n as a write (--base-revision, --author, --json)
  version diff [<from> [<to>]] [--staged]
                                    the mutations between two revisions grouped by touched block and author, the data
                                    behind Show changes (version.diff)`;

export function formatVersion(version: Version): string {
  const what =
    version.note !== ''
      ? `"${version.note}"`
      : `${version.mutations.length} mutation(s)${version.mutations[0] ? `: ${version.mutations.map((m) => m.op).join(', ')}` : ''}`;
  return `${String(version.n).padStart(3)}  r${String(version.revision).padEnd(5)} ${version.createdAt}  ${authorLabel(version.author).padEnd(18)} ${what}`;
}

export async function version(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'save':
      return save(inner);
    case 'list':
      return list(inner);
    case 'restore':
      return restore(inner);
    case 'diff':
      return diff(inner);
    default:
      throw new UsageError(`unknown subcommand "version ${sub ?? ''}"\n${USAGE}`);
  }
}

async function save(ctx: CommandContext): Promise<number> {
  const note =
    flagString(ctx.args, 'm') ?? flagString(ctx.args, 'message') ?? flagString(ctx.args, 'note');
  if (note === undefined || note.trim() === '')
    throw new UsageError(`version save needs -m <note>\n${USAGE}`);
  const store = openStore(ctx);
  const saved = await runAction(ctx, () =>
    versionSave(storeDeps(ctx, store), { author: ctx.author, deckDir: store.dir }, { note }),
  );
  ctx.out.result(saved);
  ctx.out.human(`saved version ${saved.n} at revision ${saved.revision}: "${saved.note}"`);
  return 0;
}

async function list(ctx: CommandContext): Promise<number> {
  const store = openStore(ctx);
  const namedOnly = flagBoolean(ctx.args, 'named');
  const versions = (await runAction(ctx, () => versionList(storeDeps(ctx, store)))).filter(
    (row) => !namedOnly || row.note !== '',
  );
  ctx.out.result(versions);
  if (versions.length === 0) ctx.out.human('no versions yet');
  for (const row of versions) ctx.out.human(formatVersion(row));
  return 0;
}

async function restore(ctx: CommandContext): Promise<number> {
  const raw = ctx.rest[0];
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(n) || n < 1)
    throw new UsageError(`version restore wants a version number\n${USAGE}`);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    versionRestore(storeDeps(ctx, store), writeContext(ctx), {
      n,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(`restored version ${n}: revision ${result.revision}`);
  return 0;
}

async function diff(ctx: CommandContext): Promise<number> {
  const from = ctx.rest[0] === undefined ? undefined : Number(ctx.rest[0]);
  const to = ctx.rest[1] === undefined ? undefined : Number(ctx.rest[1]);
  if (
    (from !== undefined && !Number.isInteger(from)) ||
    (to !== undefined && !Number.isInteger(to))
  ) {
    throw new UsageError(`version diff wants revision numbers\n${USAGE}`);
  }
  const store = openStore(ctx);
  const result = await runAction(ctx, () =>
    versionDiff(storeDeps(ctx, store), {
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(flagBoolean(ctx.args, 'staged') ? { staged: true } : {}),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `${result.from} to ${result.to}: ${result.mutations.length} mutation(s) by ${result.byAuthor.length} author(s)`,
  );
  for (const group of result.byAuthor) {
    ctx.out.human(
      `  ${authorLabel(group.author)}: ${group.blocks.map((block) => `${block.slideId}${block.blockId !== undefined ? `#${block.blockId}` : ''} (${block.ops.join(', ')})`).join('; ')}`,
    );
  }
  return 0;
}
