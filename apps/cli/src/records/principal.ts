// The checkout's principal (gslides-parity SPEC-3 3.11, 5.9, 7.1, 7.9): the CLI's `--author` names
// the file store's author, so on a checkout the caller is the principal `local:<name>` (an agent
// author is `agent:<runId>`, its own format of 0.17) and the folder's holder is the owner (09
// 1.6). The record lives beside the studio's anonymous records under `.turboslide/principals/`
// at the repository root with the shape of `PrincipalRecord` (packages/identity/src/principal.ts,
// B3's): label, the chosen name, the avatar choice, the notification level and the live pointer
// switches. This module reads and writes it without the identity package (the CLI does not depend
// on it yet; b1.md requests the dependency), so the mark arithmetic below repeats identity's two
// byte rule (markHash) and is pinned against it once the package resolves here.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Author } from '@turboslide/schema/mutations';

export const PRINCIPALS_DIR = 'principals';

export type AvatarVariant = 'initials' | 'glyph' | 'dither' | 'picture';
export type AvatarChoice = { variant: AvatarVariant; initials?: string; salt?: number };
export type NotificationLevel = 'all' | 'forYou' | 'none';

/** The record of a principal on a checkout, the shape of identity's PrincipalRecord. */
export type LocalPrincipalRecord = {
  principalId: string;
  label: string;
  name?: string;
  avatar: AvatarChoice;
  linkGrants: unknown[];
  notificationSettings: NotificationLevel;
  livePointers: { collaborators: boolean; mine: Record<string, boolean> };
  createdAt: string;
  lastSeenAt: string;
};

/** The principal id of a CLI author: `agent:<runId>` for an agent, `local:<name>` for a person. */
export function principalIdOf(author: Author): string {
  if (author.principalId !== undefined) return author.principalId;
  if (author.kind === 'agent') return `agent:${author.runId ?? author.name}`;
  return `local:${author.name}`;
}

/** The file a principal record lives in: the id with every character outside [A-Za-z0-9_-] replaced. */
export function principalFileName(principalId: string): string {
  return `${principalId.replace(/[^A-Za-z0-9_-]/g, '-')}.json`;
}

function principalPath(stateDir: string, principalId: string): string {
  return join(stateDir, PRINCIPALS_DIR, principalFileName(principalId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The label of a local principal: the author's name (an agent's is Agent). */
export function localLabel(principalId: string): string {
  if (principalId.startsWith('local:')) return principalId.slice('local:'.length);
  if (principalId.startsWith('agent:')) return 'Agent';
  return principalId;
}

export function newLocalPrincipalRecord(principalId: string, now: string): LocalPrincipalRecord {
  return {
    principalId,
    label: localLabel(principalId),
    avatar: { variant: 'initials' },
    linkGrants: [],
    notificationSettings: 'forYou',
    livePointers: { collaborators: true, mine: {} },
    createdAt: now,
    lastSeenAt: now,
  };
}

/** Reads the record, or a fresh one when none is stored; a malformed file reads as fresh. */
export function readLocalPrincipal(
  stateDir: string,
  principalId: string,
  now: string = new Date().toISOString(),
): LocalPrincipalRecord {
  const path = principalPath(stateDir, principalId);
  if (!existsSync(path)) return newLocalPrincipalRecord(principalId, now);
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!isRecord(raw) || raw.principalId !== principalId) {
      return newLocalPrincipalRecord(principalId, now);
    }
    const fresh = newLocalPrincipalRecord(principalId, now);
    return {
      ...fresh,
      ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
      avatar: isRecord(raw.avatar) ? (raw.avatar as AvatarChoice) : fresh.avatar,
      notificationSettings:
        raw.notificationSettings === 'all' ||
        raw.notificationSettings === 'forYou' ||
        raw.notificationSettings === 'none'
          ? raw.notificationSettings
          : fresh.notificationSettings,
      livePointers: isRecord(raw.livePointers)
        ? {
            collaborators: raw.livePointers.collaborators !== false,
            mine: isRecord(raw.livePointers.mine)
              ? Object.fromEntries(
                  Object.entries(raw.livePointers.mine).map(([k, v]) => [k, v === true]),
                )
              : {},
          }
        : fresh.livePointers,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
      lastSeenAt: typeof raw.lastSeenAt === 'string' ? raw.lastSeenAt : now,
    };
  } catch {
    return newLocalPrincipalRecord(principalId, now);
  }
}

/** Writes the record atomically (a sibling file renamed into place). */
export function writeLocalPrincipal(stateDir: string, record: LocalPrincipalRecord): string {
  const path = principalPath(stateDir, record.principalId);
  mkdirSync(join(stateDir, PRINCIPALS_DIR), { recursive: true });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(partial, path);
  return path;
}

/** The display name a record shows: the chosen name, else the label. */
export function displayNameOf(record: LocalPrincipalRecord): string {
  const name = record.name?.trim();
  return name !== undefined && name !== '' ? name : record.label;
}

export type LocalTrust = 'label' | 'guest' | 'verified' | 'agent';

/** A local principal is a typed name (guest) or an agent; a checkout has no labels and no verified accounts. */
export function trustOf(record: LocalPrincipalRecord): LocalTrust {
  return record.principalId.startsWith('agent:') ? 'agent' : 'guest';
}

const LETTER = /\p{L}|\p{Nd}/u;

/** One or two letters from a display name (identity's initialsFor for a typed name). */
export function initialsFor(displayName: string): string {
  const words = displayName
    .split(/\s+/u)
    .map((word) => [...word].find((ch) => LETTER.test(ch)) ?? '')
    .filter((ch) => ch.length > 0);
  if (words.length === 0) return '';
  if (words.length >= 2) return `${words[0]}${words[1]}`.toUpperCase();
  const letters = [...(displayName.trim().split(/\s+/u)[0] ?? '')].filter((ch) => LETTER.test(ch));
  return letters.slice(0, 2).join('').toUpperCase();
}

/** identity's markHash: byte 8's low two bits give the plate density, bytes 12 to 15 the glyph seed. */
export function markHash(
  principalId: string,
  salt = 0,
): { density: 1 | 2 | 3 | 4; glyphSeed: number } {
  const digest = createHash('sha256').update(principalId).digest();
  const density = (((digest[8] ?? 0) & 3) + 1) as 1 | 2 | 3 | 4;
  const word =
    (((digest[12] ?? 0) << 24) |
      ((digest[13] ?? 0) << 16) |
      ((digest[14] ?? 0) << 8) |
      (digest[15] ?? 0)) >>>
    0;
  return { density, glyphSeed: (word ^ (salt >>> 0)) >>> 0 };
}

/** The MarkSpec of a local principal (identity's shape, b3.md decision 13): monochrome, no hue on a stored surface. */
export function localMarkSpec(record: LocalPrincipalRecord): Record<string, unknown> {
  const trust = trustOf(record);
  const displayName = displayNameOf(record);
  const { density, glyphSeed } = markHash(record.principalId, record.avatar.salt ?? 0);
  const label = trust === 'agent' ? `Agent, ${displayName}` : `${displayName}, guest`;
  if (trust === 'agent') {
    return {
      variant: 'agent',
      initials: '',
      density,
      glyphSeed,
      presenter: false,
      self: true,
      hue: null,
      trust,
      label,
    };
  }
  const variant = record.avatar.variant === 'picture' ? 'initials' : record.avatar.variant;
  const initials =
    variant === 'initials'
      ? (record.avatar.initials?.toUpperCase() ?? initialsFor(displayName))
      : '';
  return {
    variant,
    initials,
    density,
    glyphSeed,
    presenter: false,
    self: true,
    hue: null,
    trust,
    label,
  };
}
