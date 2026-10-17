// `turboslide admin migrate-storage` on the studio (gslides-parity SPEC-3 11.5; MILESTONES-3 B2
// day 6): the `admin.migrateStorage` handler over the two Blob clients, the public store the
// deployment runs on (`exportBlobClient`) and the private documents store of layout v2
// (`TURBOSLIDE_BLOB_PRIVATE_TOKEN` or `TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN`, blob-vercel.ts
// `DOCUMENTS_TOKEN_VARIABLES`; `TURBOSLIDE_BLOB_PRIVATE_DIR` opens a folder as the
// private store for a rehearsal on a checkout). One call of a step at a time, inside its budget
// (packages/store/src/migrate.ts; docs/hosting.md section 10). The route that runs it is the
// admin's bearer through B4's dispatcher (`registerMigrateStorage`, b2.md request); nothing here
// checks the caller.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { diskBlobClient } from '@turboslide/store/blob-disk';
import type { BlobClient } from '@turboslide/store/blob-store';
import {
  hasDocumentsToken,
  vercelBlobClient,
  vercelDocumentsClient,
} from '@turboslide/store/blob-vercel';
import { MIGRATION_STEPS, MigrationRefusal, runMigrationStep } from '@turboslide/store/hosted';
import type { MigrationClients, MigrationResult, MigrationStep } from '@turboslide/store/hosted';
import { hasBlobToken, sharesPublicStore } from '@turboslide/store/select';

import { exportBlobClient } from './root';

export const DOCUMENTS_DIR_VARIABLE = 'TURBOSLIDE_BLOB_PRIVATE_DIR';

let documents: BlobClient | undefined;

/** The private documents store: the Vercel store by token, or a folder for a rehearsal. */
export function documentsBlobClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
): BlobClient {
  if (documents !== undefined) return documents;
  const dir = env[DOCUMENTS_DIR_VARIABLE];
  if (dir !== undefined && dir !== '') {
    documents = diskBlobClient(dir, { hidden: true });
    return documents;
  }
  if (!hasDocumentsToken(env)) {
    throw new TypeError(
      'The private store is not connected: set TURBOSLIDE_BLOB_PRIVATE_TOKEN or connect the store with the prefix TURBOSLIDE_BLOB_PRIVATE (docs/hosting.md, the private store) before migrating',
    );
  }
  documents = vercelDocumentsClient(env);
  return documents;
}

/**
 * The two stores as they are, not through the deployment's client: on Vercel the public store by
 * its own token (the deployment's client routes by the layout and the deck keys, which the steps
 * themselves move; hardening K1#4), else the backend's client (a checkout's rehearsal).
 */
export async function migrationClients(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<MigrationClients> {
  const deployment = await exportBlobClient();
  if (deployment === null)
    throw new TypeError('The migration needs the Blob store; this deployment runs the tmp store');
  const legacy = hasBlobToken(env) ? vercelBlobClient(env) : deployment;
  return { legacy, documents: documentsBlobClient(env) };
}

export type MigrateStorageInput = {
  step: MigrationStep;
  budgetMs?: number;
  concurrency?: number;
  backupAt?: string;
};

export function isMigrationStep(value: unknown): value is MigrationStep {
  return typeof value === 'string' && (MIGRATION_STEPS as readonly string[]).includes(value);
}

/**
 * `sweep-produced` without the public store's own token, before any store call (HR-K1#5b): the
 * step removes what it lists, and without the token the public client is the deployment's, which
 * on a deployment with a private store lists the produced files there.
 */
export const SWEEP_NEEDS_PUBLIC_TOKEN =
  "sweep-produced runs only on the public store opened by its own token (BLOB_READ_WRITE_TOKEN); without it the step would list the deployment's client";

/**
 * One call of a step; the action's output. Whether the deployment shares the public store with
 * production (a preview, or anything but production that holds the public token) is read from its
 * environment, never from the input.
 */
export async function runMigrateStorage(
  input: MigrateStorageInput,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<MigrationResult> {
  if (!isMigrationStep(input.step))
    throw new TypeError(`step must be one of ${MIGRATION_STEPS.join(', ')}`);
  if (input.step === 'sweep-produced' && !hasBlobToken(env))
    throw new MigrationRefusal(SWEEP_NEEDS_PUBLIC_TOKEN);
  const { budgetMs, concurrency, backupAt } = input;
  return runMigrationStep(await migrationClients(env), input.step, {
    ...(budgetMs === undefined ? {} : { budgetMs }),
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(backupAt === undefined ? {} : { backupAt }),
    sharedPublicStore: sharesPublicStore(env),
  });
}

/** Registers `admin.migrateStorage` on a dispatcher whose caller was checked as the admin. */
export function registerMigrateStorage(dispatcher: Dispatcher): void {
  dispatcher.register('admin.migrateStorage', (input) =>
    runMigrateStorage(input as MigrateStorageInput),
  );
}
