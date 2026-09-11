// Per-slide leases (SPEC 6.7): records with a holder and an expiry, kept outside the committed
// tree because they are ephemeral. `slide.lease` takes ten minutes on a slide for an author;
// another author's lease on the same slide is a ConflictError carrying the holder unless `force`
// is set; leases expire and can be released. Whole-deck writes take no lease.
//
// Enforcement (MILESTONES M4 item 2): a write by an agent author to a slide another author holds
// is refused with 409, the holder and the current document unless the write carries `force`; a
// human's write goes through with a warning, as in M2 and M3, because a person at a shell or in
// the editor sees the lease dot and decides. `leasePolicyFor` is the one place that rule lives;
// FileStore reads it per write when it was opened without an explicit policy.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { ConflictError } from '@turboslide/schema/errors';
import type { SlideId } from '@turboslide/schema/ids';
import { canonicalJson, parseJson } from '@turboslide/schema/json';
import type { Author, Lease } from '@turboslide/schema/mutations';
import { leaseSchema } from '@turboslide/schema/mutations';

import type { LeasePolicy } from './store.ts';
import { authorLabel, sameAuthor } from './store.ts';

export const DEFAULT_LEASE_MINUTES = 10;
export const MAX_LEASE_MINUTES = 120;

/** Agent writes are enforced, human writes advisory (SPEC 6.7 "enforced for agent writes in M4"). */
export function leasePolicyFor(author: Author): LeasePolicy {
  return author.kind === 'agent' ? 'enforce' : 'advisory';
}

/** The 409 message a refused write carries; the CLI, MCP and HTTP bodies all show this text. */
export function leaseRefusalMessage(slideId: SlideId, held: Lease): string {
  return `Slide "${slideId}" is leased by ${authorLabel(held.holder)} until ${held.until}; pass force to write anyway`;
}

const leaseListSchema = leaseSchema.array();

/** The lease file is `{ leases: Lease[] }`; a file that is not one is a TypeError. */
export function readLeases(path: string): Lease[] {
  if (!existsSync(path)) return [];
  const raw = parseJson(readFileSync(path, 'utf8'), path);
  const list =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as { leases?: unknown }).leases
      : undefined;
  const parsed = leaseListSchema.safeParse(list);
  if (!parsed.success) throw new TypeError(`${path} is not a lease file ({ leases: Lease[] })`);
  return parsed.data;
}

export function writeLeases(path: string, leases: ReadonlyArray<Lease>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canonicalJson({ leases: [...leases] }));
}

/** The leases whose expiry is after `now`. */
export function activeLeases(leases: ReadonlyArray<Lease>, now: string): Lease[] {
  const t = Date.parse(now);
  return leases.filter((lease) => Date.parse(lease.until) > t);
}

/** The active lease another author holds on a slide, or undefined. */
export function leaseConflict(
  leases: ReadonlyArray<Lease>,
  slideId: SlideId,
  author: Author,
  now: string,
): Lease | undefined {
  return activeLeases(leases, now).find(
    (lease) => lease.slideId === slideId && !sameAuthor(lease.holder, author),
  );
}

export type TakeLeaseInput = {
  slideId: SlideId;
  holder: Author;
  now: string;
  minutes?: number;
  force?: boolean;
  /** The current revision, for the ConflictError. */
  currentRevision: number;
};

/**
 * Takes or renews a lease. Throws ConflictError with the holder when another author holds an
 * unexpired lease and `force` is not set; a TypeError when `minutes` is out of range.
 */
export function takeLease(
  leases: ReadonlyArray<Lease>,
  input: TakeLeaseInput,
): { leases: Lease[]; lease: Lease } {
  const minutes = input.minutes ?? DEFAULT_LEASE_MINUTES;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_LEASE_MINUTES) {
    throw new TypeError(`Lease minutes must be an integer from 1 to ${MAX_LEASE_MINUTES}`);
  }
  const held = leaseConflict(leases, input.slideId, input.holder, input.now);
  if (held !== undefined && input.force !== true) {
    throw new ConflictError(
      `Slide "${input.slideId}" is leased by ${authorLabel(held.holder)} until ${held.until}`,
      { currentRevision: input.currentRevision, holder: held.holder },
    );
  }
  const until = new Date(Date.parse(input.now) + minutes * 60_000).toISOString();
  const lease: Lease = { slideId: input.slideId, holder: input.holder, until };
  const kept = activeLeases(leases, input.now).filter((row) => row.slideId !== input.slideId);
  return { leases: [...kept, lease], lease };
}

/** Removes the holder's lease on a slide; returns the released lease when there was one. */
export function releaseLease(
  leases: ReadonlyArray<Lease>,
  slideId: SlideId,
  holder: Author,
  now: string,
): { leases: Lease[]; released: Lease | undefined } {
  const active = activeLeases(leases, now);
  const released = active.find(
    (lease) => lease.slideId === slideId && sameAuthor(lease.holder, holder),
  );
  return { leases: active.filter((lease) => lease !== released), released };
}

export function describeLease(lease: Lease): string {
  return `slide ${lease.slideId} leased by ${authorLabel(lease.holder)} until ${lease.until}`;
}
