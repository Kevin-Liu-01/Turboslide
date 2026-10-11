import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFileRoute } from '@tanstack/react-router';
import { errorResponse, jsonResponse } from '@turboslide/agent/http/errors';
import { boundedBlobClient } from '@turboslide/store/blob-store';

import { BACKUP_TOKEN_VARIABLES, backupBlobClient, runRestoreDrill } from '../../server/backup';
import { cronCredential, cronRefusal } from '../../server/cron';

// GET /api/cron/restore-drill (hardening O#1b, docs/hardening/HARDENING.md 4.8; RELIABILITY-13):
// the monthly restore drill, called by the Vercel cron of apps/studio/vercel.json at 06:00 UTC on
// the first of the month with the cron secret (server/cron.ts). It restores one deck, chosen by
// the date, from the newest complete night of the backup into a scratch id in a folder of this
// instance, reads it through the store, compares it with the backup, removes it and writes
// `backup/drills/<yyyy-mm>.json` (server/backup.ts `runRestoreDrill`). 200 when every check held,
// 500 with the reason when one did not (a line at error in the function's log; the alert of
// HR-O#3 reads it once that push lands), 503 without a backup store, 401 without the secret.
// `scripts/restore-drill.mjs` runs the same drill by hand.

/** The longest a store call of the drill waits. */
const DRILL_CALL_MS = 30_000;

async function serveDrill(request: Request): Promise<Response> {
  if (!cronCredential(request)) return cronRefusal('The restore drill');
  const backup = backupBlobClient();
  if (backup === null) {
    const message = `the backup store is not connected: set ${BACKUP_TOKEN_VARIABLES.join(' or ')} (docs/hosting.md, the backup)`;
    console.error(`turboslide restore drill: ${message}`);
    return jsonResponse({ error: { name: 'Error', status: 503, message } }, 503);
  }
  try {
    const record = await runRestoreDrill({
      backup: boundedBlobClient(backup, { readMs: DRILL_CALL_MS }),
      scratchRoot: mkdtempSync(join(tmpdir(), 'turboslide-drill-')),
      log: (line) => console.error(`turboslide restore drill: ${line}`),
    });
    return jsonResponse(record, record.ok ? 200 : 500);
  } catch (error) {
    console.error(
      `turboslide restore drill: the drill failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return errorResponse(error, 'restore-drill');
  }
}

export const Route = createFileRoute('/api/cron/restore-drill')({
  server: {
    handlers: {
      GET: ({ request }) => serveDrill(request),
    },
  },
});
