// `deck watch` and `deck follow` (gslides-parity SPEC-3 3.7 f, 3.10, 12; 0.48): `deck watch <id>
// [--from <studio>] [--since <n>] [--timeout <ms>]` long polls for the checkpoints and comment
// entries since a revision, on the checkout's folder (fs.watch) or on the studio (`deck.watch`
// over the agent route); `deck follow <id> --from <studio> [--push] [--comments] [--once]` mirrors
// a hosted deck's version records into the checkout byte for byte as they land: every record the
// host holds past the local revision is applied forward through the FileStore with the record's
// author and note and the same reducer, the result's revision checked against the host's, the
// comment sidecar mirrored when asked, and local records the host lacks pushed back as writes
// under the per slide conflict rule (`slide.update` for a slide's mutations; a record that spans
// several slides or the deck level is listed as a conflict for `deck push`). Without `--once` the
// command keeps following until interrupted.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Thread } from '@turboslide/schema/comments';
import type { Mutation, Version } from '@turboslide/schema/mutations';
import { canonicalJson } from '@turboslide/schema/json';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import { flagBoolean, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { GateError, UsageError } from '../exit.ts';
import { normalizeHost } from '../hosts.ts';
import { readIndex } from '../records/comments.ts';
import { remoteAction } from '../remote.ts';
import { openStore, requirePositional, runAction } from '../write.ts';
import { decksDirFor } from './deck.ts';

export const FOLLOW_USAGE = `usage: turboslide deck watch <id> [--from <studio>] [--since <n>] [--timeout <ms>]
       turboslide deck follow <id> --from <studio> [--push] [--comments] [--once] [--force] [--theirs]
  deck watch                        the checkpoints and comment entries since a revision, as they land (deck.watch)
  deck follow                       mirror a hosted deck's records into decks/<id>, byte for byte (deck.follow)`;

type WatchAnswer = {
  since: number;
  revision: number;
  versions: Version[];
  comments: unknown[];
  commentsRevision: number;
  timedOut: boolean;
};

/** `deck watch <id>`: one long poll, printed; loops with --follow-forever left to the caller's shell. */
export async function deckWatchCommand(ctx: CommandContext): Promise<number> {
  const id = requirePositional(ctx, 0, FOLLOW_USAGE);
  const from = flagString(ctx.args, 'from');
  const since = flagString(ctx.args, 'since');
  const timeout = flagString(ctx.args, 'timeout');
  const input = {
    ...(since !== undefined ? { since: Number(since) } : {}),
    ...(timeout !== undefined ? { timeoutMs: flagNumber(ctx.args, 'timeout', 25_000) } : {}),
  };
  const answer =
    from !== undefined
      ? await runAction(ctx, () =>
          remoteAction<WatchAnswer>(ctx, from, 'deck.watch', input, { deck: id }),
        )
      : await runDeckAction<WatchAnswer>(
          {
            ...ctx,
            args: {
              ...ctx.args,
              flags: { ...ctx.args.flags, deck: ctx.args.flags.deck ?? join(decksDirFor(ctx), id) },
            },
          },
          'deck.watch',
          input,
        );
  ctx.out.result(answer);
  ctx.out.human(
    answer.timedOut
      ? `no change since revision ${answer.since} (comments revision ${answer.commentsRevision})`
      : `revision ${answer.revision}: ${answer.versions.length} record${answer.versions.length === 1 ? '' : 's'} since ${answer.since}; comments revision ${answer.commentsRevision}`,
  );
  for (const version of answer.versions)
    ctx.out.human(
      `  ${version.n}  r${version.revision}  ${version.author.name}  ${version.note || version.mutations.map((m) => m.op).join(', ')}`,
    );
  return 0;
}

type RemoteInfo = { id: string; revision: number };

/** The version records a studio holds past a revision. */
async function remoteVersions(
  ctx: CommandContext,
  from: string,
  id: string,
  after: number,
): Promise<Version[]> {
  const versions = await remoteAction<Version[]>(ctx, from, 'version.list', {}, { deck: id });
  return versions
    .filter((version) => version.revision > after)
    .sort((a, b) => a.revision - b.revision);
}

/** Applies a host's records forward through the FileStore with the record's author, note and mutations. */
async function applyForward(
  store: FileStore,
  records: Version[],
  log: (line: string) => void,
): Promise<number> {
  let applied = 0;
  for (const record of records) {
    const base = await store.revision();
    if (record.revision <= base) continue;
    const outcome = await store.write(
      {
        baseRevision: base,
        author: record.author,
        ...(record.note !== '' ? { note: record.note } : {}),
        mutations: record.mutations,
      },
      { force: true },
    );
    if (!outcome.ok)
      throw new GateError(
        `record ${record.n} (revision ${record.revision}) did not apply: ${outcome.message}`,
      );
    if (outcome.revision !== record.revision) {
      throw new GateError(
        `the checkout is at revision ${outcome.revision} after record ${record.n}, the host at ${record.revision}; the histories diverged (pass --theirs to pull the host's deck, or --force to push the checkout's)`,
      );
    }
    applied += 1;
    log(`  applied record ${record.n} (revision ${record.revision}) by ${record.author.name}`);
  }
  return applied;
}

/** The comment sidecar of the host, written under decks/<id>/comments/ as the host holds it (08 3.1). */
async function mirrorComments(
  ctx: CommandContext,
  from: string,
  store: FileStore,
): Promise<number> {
  const result = await remoteAction<{
    threads: (Thread & { placement: unknown })[];
    commentsRevision: number;
  }>(
    ctx,
    from,
    'comment.list',
    { state: 'all', includeDeleted: true, limit: 500 },
    { deck: store.id },
  );
  const dir = join(store.dir, 'comments');
  mkdirSync(dir, { recursive: true });
  const rows = result.threads.map(({ placement: _placement, ...thread }) => thread as Thread);
  for (const thread of rows) writeFileSync(join(dir, `${thread.id}.json`), canonicalJson(thread));
  const index = readIndex(store.dir, store.id);
  index.revision = result.commentsRevision;
  index.updatedAt = new Date().toISOString();
  index.threads = rows.map((thread) => ({
    id: thread.id,
    ...('slideId' in thread.anchor ? { slideId: thread.anchor.slideId } : {}),
    kind: thread.anchor.kind,
    open: thread.resolved === undefined,
    updatedAt: thread.updatedAt,
    count: 1 + thread.replies.filter((reply) => reply.deleted === undefined).length,
    ...(thread.assignee !== undefined ? { assignee: thread.assignee.to } : {}),
  }));
  writeFileSync(join(dir, 'index.json'), canonicalJson(index));
  return rows.length;
}

/** The slide a record's mutations all touch, or undefined when they span slides or the deck level. */
function oneSlideOf(mutations: ReadonlyArray<Mutation>): string | undefined {
  let slide: string | undefined;
  for (const mutation of mutations) {
    const id =
      'slideId' in mutation
        ? mutation.slideId
        : mutation.op === 'slide.insert'
          ? mutation.slide.id
          : undefined;
    if (id === undefined || (slide !== undefined && slide !== id)) return undefined;
    slide = id;
  }
  return slide;
}

/** `deck follow <id> --from <studio>`: pull the host's records forward, optionally push the local ones, repeat. */
export async function deckFollowCommand(ctx: CommandContext): Promise<number> {
  const id = requirePositional(ctx, 0, FOLLOW_USAGE);
  const from = flagString(ctx.args, 'from');
  if (from === undefined)
    throw new UsageError(`deck follow needs --from <studio>\n${FOLLOW_USAGE}`);
  const once = flagBoolean(ctx.args, 'once') || ctx.env.TURBOSLIDE_FOLLOW_ONCE === '1';
  const push = flagBoolean(ctx.args, 'push');
  const comments = flagBoolean(ctx.args, 'comments');
  const theirs = flagBoolean(ctx.args, 'theirs');
  const decksDir = decksDirFor(ctx);
  const dir = join(decksDir, id);
  const origin = normalizeHost(from);
  const summary = {
    deckId: id,
    from: origin,
    revision: 0,
    documents: 0,
    assets: 0,
    versions: 0,
    comments: 0,
    pushed: 0,
    conflicts: [] as string[],
  };
  const store = (() => {
    try {
      return openStore({ ...ctx, args: { ...ctx.args, flags: { ...ctx.args.flags, deck: dir } } });
    } catch {
      return undefined;
    }
  })();
  if (store === undefined) {
    // no local copy yet: the first follow is a pull (docs/deck-transfer.md)
    throw new UsageError(
      `decks/${id} is not on this checkout yet; run \`turboslide deck pull ${id} --from ${origin}\` once, then follow`,
    );
  }
  for (;;) {
    const info = await runAction(ctx, () =>
      remoteAction<RemoteInfo>(ctx, from, 'deck.info', {}, { deck: id }),
    );
    const local = await store.revision();
    if (info.revision > local) {
      const records = await runAction(ctx, () => remoteVersions(ctx, from, id, local));
      summary.versions += await runAction(ctx, () =>
        applyForward(store, records, (line) => ctx.out.human(line)),
      );
      summary.documents += records.length;
    } else if (info.revision < local && push) {
      const localRecords = (await store.listVersions()).filter(
        (version) => version.revision > info.revision,
      );
      for (const record of localRecords) {
        const slideId = oneSlideOf(record.mutations);
        if (slideId === undefined) {
          summary.conflicts.push(
            `record ${record.n} spans slides or the deck level; push it with \`turboslide deck push ${id} --to ${origin} --replace\``,
          );
          continue;
        }
        await runAction(ctx, () =>
          remoteAction(
            ctx,
            from,
            'slide.update',
            { slideId, mutations: record.mutations, baseRevision: record.revision - 1 },
            { deck: id, force: theirs ? false : flagBoolean(ctx.args, 'force') },
          ),
        );
        summary.pushed += 1;
        ctx.out.human(`  pushed record ${record.n} (revision ${record.revision}) to ${origin}`);
      }
    } else if (info.revision < local && !push) {
      summary.conflicts.push(
        `the checkout is at revision ${local}, the host at ${info.revision}; pass --push to send the local records`,
      );
    }
    if (comments) summary.comments = await runAction(ctx, () => mirrorComments(ctx, from, store));
    summary.revision = await store.revision();
    if (once) break;
    ctx.out.human(
      `following ${id} at revision ${summary.revision} from ${origin}; waiting for changes`,
    );
    const next = await runAction(ctx, () =>
      remoteAction<WatchAnswer>(
        ctx,
        from,
        'deck.watch',
        { since: summary.revision, timeoutMs: 25_000 },
        { deck: id },
      ),
    );
    if (next.timedOut) continue;
  }
  ctx.out.result(summary);
  ctx.out.human(
    `${id} at revision ${summary.revision}: ${summary.versions} record${summary.versions === 1 ? '' : 's'} applied, ${summary.pushed} pushed, ${summary.comments} thread${summary.comments === 1 ? '' : 's'} mirrored${summary.conflicts.length > 0 ? `, ${summary.conflicts.length} conflict${summary.conflicts.length === 1 ? '' : 's'}` : ''}`,
  );
  for (const line of summary.conflicts) ctx.out.human(`  ${line}`);
  return summary.conflicts.length > 0 ? 1 : 0;
}

void openFileStore;
