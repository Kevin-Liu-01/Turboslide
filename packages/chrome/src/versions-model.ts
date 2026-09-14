import type { Author, Version } from '@turboslide/schema/mutations';

import type { IdentityView, VersionDiffView } from './editor-shell';
import { PANELS } from './menus/strings';

/**
 * Version history by author (gslides-parity SPEC-3 0.45, 5.7; research 08 6.1, 6.2): the pure
 * grouping. Records group by day, newest first, then inside a day by a 15 minute window (a record
 * joins the window when its time is within 15 minutes of the previous record's); a named record
 * stands alone; a window row shows its distinct authors' marks (up to four, then "+N") and the
 * total change count. Attribution is per principal id, never a collective "All anonymous users";
 * a record whose principal cannot be resolved and whose label is round one's `studio` collapses
 * into "Earlier edits". The 40 named versions cap has its sentence. No React, no DOM.
 */
export const WINDOW_MS = 15 * 60 * 1000;
export const NAMED_CAP = 40;
export const MARKS_PER_WINDOW = 4;
export const LEGACY_AUTHOR = 'studio';

export type VersionWindow = {
  key: string;
  /** the newest record first */
  versions: Version[];
  /** the distinct authors in first appearance order */
  authors: IdentityView[];
  changes: number;
  /** a named record stands alone */
  named: boolean;
  from: string;
  to: string;
};

export type VersionDay = { day: string; windows: VersionWindow[] };

const time = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** The identity a record's author renders as: the resolved identity by principal id, else the typed name as a guest, else "Earlier edits". */
export function identityOfAuthor(
  author: Author,
  identities: Readonly<Record<string, IdentityView>> | undefined,
): IdentityView {
  const resolved = author.principalId === undefined ? undefined : identities?.[author.principalId];
  if (resolved !== undefined) return resolved;
  if (author.kind === 'agent')
    return {
      principalId: author.principalId ?? `agent:${author.runId ?? author.name}`,
      label: author.name,
      name: author.name,
      trust: 'agent',
      kind: 'agent',
      ...(author.runId === undefined ? {} : { runId: author.runId }),
    };
  if (author.name === LEGACY_AUTHOR && author.principalId === undefined)
    return {
      principalId: 'legacy:studio',
      label: PANELS.versionHistory.earlierEdits,
      trust: 'label',
      kind: 'anonymous',
    };
  return {
    principalId: author.principalId ?? `local:${author.name}`,
    label: author.name,
    name: author.name,
    trust: 'guest',
    kind: 'anonymous',
  };
}

/** True for a record the panel should hide under the Earlier edits author (an unresolved round one write). */
export function isLegacyAuthor(identity: IdentityView): boolean {
  return identity.principalId === 'legacy:studio';
}

export function dayLabelOf(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * The records newest first, grouped by day then by 15 minute window; named records alone;
 * `namedOnly` keeps the named ones.
 */
export function groupVersions(
  versions: readonly Version[],
  identities: Readonly<Record<string, IdentityView>> | undefined,
  namedOnly = false,
  now: Date = new Date(),
): VersionDay[] {
  const rows = [...versions].reverse().filter((version) => !namedOnly || version.note !== '');
  const days: VersionDay[] = [];
  for (const version of rows) {
    const day = dayLabelOf(version.createdAt, now);
    let current = days[days.length - 1];
    if (current === undefined || current.day !== day) {
      current = { day, windows: [] };
      days.push(current);
    }
    const identity = identityOfAuthor(version.author, identities);
    const last = current.windows[current.windows.length - 1];
    const joins =
      last !== undefined &&
      !last.named &&
      version.note === '' &&
      time(last.from) - time(version.createdAt) <= WINDOW_MS;
    if (joins && last !== undefined) {
      last.versions.push(version);
      last.from = version.createdAt;
      last.changes += version.mutations.length;
      if (!last.authors.some((each) => each.principalId === identity.principalId))
        last.authors.push(identity);
    } else {
      current.windows.push({
        key: `w${version.n}`,
        versions: [version],
        authors: [identity],
        changes: version.mutations.length,
        named: version.note !== '',
        from: version.createdAt,
        to: version.createdAt,
      });
    }
  }
  return days;
}

/** The count of named versions and the oldest named note, for the 40 cap sentence. */
export function namedCap(versions: readonly Version[]): {
  count: number;
  oldest: string | null;
  full: boolean;
} {
  const named = versions.filter((version) => version.note !== '');
  return { count: named.length, oldest: named[0]?.note ?? null, full: named.length >= NAMED_CAP };
}

/** The record before a version in the log, for `version.diff { from, to }`. */
export function previousOf(versions: readonly Version[], version: Version): Version | null {
  const index = versions.findIndex((each) => each.n === version.n);
  return index > 0 ? (versions[index - 1] ?? null) : null;
}

/** The hatch angle per author index (11 6.9): 45, 135, 0, 90, then a Bayer field; beyond five the chip alone distinguishes. */
export function hatchAngle(index: number): number | 'bayer' {
  const angles = [45, 135, 0, 90] as const;
  return index < angles.length ? angles[index]! : 'bayer';
}

/** The blocks a diff touched on one slide, per author in the diff's order. */
export function diffBlocksOnSlide(
  diff: VersionDiffView,
  slideId: string,
): Array<{
  author: VersionDiffView['byAuthor'][number]['author'];
  index: number;
  blockId: string;
  ops: readonly string[];
}> {
  const out: Array<{
    author: VersionDiffView['byAuthor'][number]['author'];
    index: number;
    blockId: string;
    ops: readonly string[];
  }> = [];
  diff.byAuthor.forEach((entry, index) => {
    for (const block of entry.blocks) {
      if (block.slideId !== slideId || block.blockId === undefined) continue;
      out.push({ author: entry.author, index, blockId: block.blockId, ops: block.ops });
    }
  });
  return out;
}
