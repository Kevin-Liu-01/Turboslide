// Migrations by schemaVersion (SPEC 4.4). Every slide file and the manifest carry schemaVersion,
// so one slide can be read, validated and migrated alone. A migration takes a raw document at
// version n and returns it at version n + 1; validateDeck runs the chain before parsing and
// reports a `migrated` issue at severity 1 so the writer knows the file will change on save.
// Version 0 is the unversioned form (no schemaVersion field); the only migration today stamps it.
import { SCHEMA_VERSION } from './deck.ts';

export type MigrationTarget = 'deck' | 'slide';

export type Migration = {
  from: number;
  to: number;
  /** One sentence for the issue message and the docs. */
  note: string;
  deck: (raw: Record<string, unknown>) => Record<string, unknown>;
  slide: (raw: Record<string, unknown>) => Record<string, unknown>;
};

export const CURRENT_SCHEMA_VERSION: number = SCHEMA_VERSION;

const stamp = (raw: Record<string, unknown>): Record<string, unknown> => {
  const { schemaVersion: _dropped, ...rest } = raw;
  return { schemaVersion: 1, ...rest };
};

export const MIGRATIONS: ReadonlyArray<Migration> = [
  {
    from: 0,
    to: 1,
    note: 'stamps schemaVersion 1 on a file written before the field existed',
    deck: stamp,
    slide: stamp,
  },
];

export type MigrationResult = {
  value: Record<string, unknown>;
  /** The versions the document passed through: [] when it was already current. */
  applied: number[];
  /** Set when the document claims a version newer than this package knows. */
  ahead?: number;
};

function readVersion(raw: Record<string, unknown>): number {
  const value = raw.schemaVersion;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Runs the migration chain on a raw manifest or slide up to the current version. */
export function migrate(raw: Record<string, unknown>, target: MigrationTarget): MigrationResult {
  let value = raw;
  let version = readVersion(raw);
  const applied: number[] = [];
  if (version > CURRENT_SCHEMA_VERSION) return { value, applied, ahead: version };
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((migration) => migration.from === version);
    if (step === undefined) break;
    value = step[target](value);
    version = step.to;
    applied.push(version);
  }
  return { value, applied };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
