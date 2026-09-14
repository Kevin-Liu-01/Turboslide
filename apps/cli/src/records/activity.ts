// The activity feed on a checkout (gslides-parity SPEC-3 5.7; research-3 08 6.5, 8): the version
// records (a window per record, named versions and restores by their own kinds), the comment
// sidecar (threads, replies, resolutions) and `.turboslide/activity.jsonl` under the deck, which
// the share actions append to (share, request, role, rename, export, import, trash), merged by
// time, newest first. Editors and the owner read it; commenters when the owner allows
// (notification.settings activityForCommenters), the record actions check the role.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ActivityKind } from '@turboslide/schema/actions';
import { ACTIVITY_KINDS } from '@turboslide/schema/actions';
import type { Thread } from '@turboslide/schema/comments';
import type { Version } from '@turboslide/schema/mutations';

import { STATE_DIR } from './lock.ts';

export const ACTIVITY_FILE = 'activity.jsonl';

export type ActivityEvent = {
  id: string;
  at: string;
  kind: ActivityKind;
  actor?: string;
  deckId: string;
  slideId?: string;
  threadId?: string;
  revision?: number;
  summary: string;
  data?: Record<string, unknown>;
};

function activityPath(deckDir: string): string {
  return join(deckDir, STATE_DIR, ACTIVITY_FILE);
}

/** Appends one line: what the share and record actions call after a write. */
export function appendActivity(deckDir: string, event: ActivityEvent): void {
  mkdirSync(join(deckDir, STATE_DIR), { recursive: true });
  appendFileSync(activityPath(deckDir), `${JSON.stringify(event)}\n`);
}

function isKind(value: unknown): value is ActivityKind {
  return typeof value === 'string' && (ACTIVITY_KINDS as ReadonlyArray<string>).includes(value);
}

export function readAppended(deckDir: string): ActivityEvent[] {
  const path = activityPath(deckDir);
  if (!existsSync(path)) return [];
  const out: ActivityEvent[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const raw = JSON.parse(line) as unknown;
      if (
        typeof raw === 'object' &&
        raw !== null &&
        typeof (raw as ActivityEvent).id === 'string' &&
        isKind((raw as ActivityEvent).kind) &&
        typeof (raw as ActivityEvent).at === 'string' &&
        typeof (raw as ActivityEvent).summary === 'string'
      ) {
        out.push(raw as ActivityEvent);
      }
    } catch {
      // a torn line from a crashed writer is skipped
    }
  }
  return out;
}

function authorId(author: Version['author']): string {
  if (author.principalId !== undefined) return author.principalId;
  return author.kind === 'agent' ? `agent:${author.runId ?? author.name}` : `local:${author.name}`;
}

/** The version records as events: named versions and restores by their own kinds. */
export function versionEvents(deckId: string, versions: ReadonlyArray<Version>): ActivityEvent[] {
  return versions.map((version) => {
    const restore = version.mutations.some((mutation) => mutation.op === 'version.restore');
    const kind: ActivityKind = version.note !== '' ? 'named' : restore ? 'restore' : 'version';
    const who = authorId(version.author);
    const summary =
      kind === 'named'
        ? `${version.author.name} named version ${version.n} "${version.note}"`
        : kind === 'restore'
          ? `${version.author.name} restored a version (revision ${version.revision})`
          : `${version.author.name} made ${version.mutations.length} change${version.mutations.length === 1 ? '' : 's'} (revision ${version.revision})`;
    return {
      id: `version:${version.n}`,
      at: version.createdAt,
      kind,
      actor: who,
      deckId,
      revision: version.revision,
      summary,
      data: { n: version.n, ops: version.mutations.map((mutation) => mutation.op) },
    };
  });
}

/** The comment sidecar as events: one per thread, reply and resolution. */
export function commentEvents(deckId: string, threads: ReadonlyArray<Thread>): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const thread of threads) {
    const slide = 'slideId' in thread.anchor ? { slideId: thread.anchor.slideId } : {};
    out.push({
      id: `comment:${thread.id}`,
      at: thread.createdAt,
      kind: 'comment',
      actor: thread.comment.author.principalId,
      deckId,
      threadId: thread.id,
      ...slide,
      summary: `${thread.comment.author.label} commented${'slideId' in slide ? ` on slide ${slide.slideId}` : ''}`,
    });
    for (const reply of thread.replies) {
      out.push({
        id: `reply:${reply.id}`,
        at: reply.createdAt,
        kind: 'comment',
        actor: reply.author.principalId,
        deckId,
        threadId: thread.id,
        ...slide,
        summary: `${reply.author.label} replied${'slideId' in slide ? ` on slide ${slide.slideId}` : ''}`,
      });
    }
    if (thread.resolved !== undefined) {
      out.push({
        id: `resolved:${thread.id}:${thread.resolved.at}`,
        at: thread.resolved.at,
        kind: 'comment',
        actor: thread.resolved.by,
        deckId,
        threadId: thread.id,
        ...slide,
        summary: `A comment was resolved${'slideId' in slide ? ` on slide ${slide.slideId}` : ''}`,
      });
    }
  }
  return out;
}

export function mergeActivity(
  events: ReadonlyArray<ActivityEvent>,
  options: { since?: string; kinds?: ReadonlyArray<ActivityKind>; limit?: number } = {},
): ActivityEvent[] {
  const since = options.since === undefined ? undefined : Date.parse(options.since);
  const kinds = options.kinds === undefined ? undefined : new Set(options.kinds);
  return [...events]
    .filter((event) => (kinds === undefined ? true : kinds.has(event.kind)))
    .filter((event) =>
      since === undefined || Number.isNaN(since) ? true : Date.parse(event.at) > since,
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, options.limit ?? 200);
}
