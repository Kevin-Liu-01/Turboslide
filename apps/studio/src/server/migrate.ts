// `turboslide admin migrate-storage` on the studio (gslides-parity SPEC-3 11.5; MILESTONES-3 B2
// day 6): the `admin.migrateStorage` handler over the two Blob clients, the public store the
// deployment runs on (`exportBlobClient`) and the private documents store of layout v2
// (`TURBOSLIDE_BLOB_PRIVATE_TOKEN` or `TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN`, blob-vercel.ts
// `DOCUMENTS_TOKEN_VARIABLES`; `TURBOSLIDE_BLOB_PRIVATE_DIR` opens a folder as the
// private store for a rehearsal on a checkout). One step per call, resumable from the cursor
// `meta.json` keeps (packages/store/src/migrate.ts). The route that runs it is the admin's
// bearer through B4's dispatcher (`registerMigrateStorage`, b2.md request); nothing here checks
// the caller.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { diskBlobClient } from '@turboslide/store/blob-disk';
import type { BlobClient } from '@turboslide/store/blob-store';
import {
  hasDocumentsToken,
  vercelBlobClient,
  vercelDocumentsClient,
} from '@turboslide/store/blob-vercel';
import { MIGRATION_STEPS, runMigrationStep } from '@turboslide/store/hosted';
import type { MigrationClients, MigrationResult, MigrationStep } from '@turboslide/store/hosted';
import { hasBlobToken } from '@turboslide/store/select';

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
    documents = diskBlobClient(dir);
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

export type MigrateStorageInput = { step: MigrationStep; batch?: number };

export function isMigrationStep(value: unknown): value is MigrationStep {
  return typeof value === 'string' && (MIGRATION_STEPS as readonly string[]).includes(value);
}

/** One step from the cursor; the action's output. */
export async function runMigrateStorage(input: MigrateStorageInput): Promise<MigrationResult> {
  if (!isMigrationStep(input.step))
    throw new TypeError(`step must be one of ${MIGRATION_STEPS.join(', ')}`);
  const clients = await migrationClients();
  return runMigrationStep(
    clients,
    input.step,
    input.batch === undefined ? {} : { batch: input.batch },
  );
}

/** Registers `admin.migrateStorage` on a dispatcher whose caller was checked as the admin. */
export function registerMigrateStorage(dispatcher: Dispatcher): void {
  dispatcher.register('admin.migrateStorage', (input) =>
    runMigrateStorage(input as MigrateStorageInput),
  );
}
