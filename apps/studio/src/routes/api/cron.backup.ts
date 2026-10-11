import { createFileRoute } from '@tanstack/react-router';
import { errorResponse, jsonResponse } from '@turboslide/agent/http/errors';
import { boundedBlobClient } from '@turboslide/store/blob-store';

import { BACKUP_TOKEN_VARIABLES, backupBlobClient, runBackup } from '../../server/backup';
import { cronCredential, cronRefusal } from '../../server/cron';
import { exportBlobClient } from '../../server/root';

// GET /api/cron/backup (hardening O#1a, docs/hardening/HARDENING.md 4.8; RELIABILITY-13): the
// nightly backup of the deck documents into the backup store, called by the Vercel cron of
// apps/studio/vercel.json every ten minutes from 03:00 to 05:59 UTC with the cron secret
// (server/cron.ts). One call copies for at most 240 s from the day's cursor and answers the
// day's counts (server/backup.ts); 200 while the night goes well, 500 when a copy failed, 503
// when this deployment has no backup store or no Blob store, 401 without the secret. Every call
// is one line in the function's log; nothing here prints a token.

/** The longest a store call of the backup waits: a listing of a prefix reads every page. */
const BACKUP_CALL_MS = 30_000;

function unavailable(message: string): Response {
  console.error(`turboslide backup: ${message}`);
  return jsonResponse({ error: { name: 'Error', status: 503, message } }, 503);
}

async function serveBackup(request: Request): Promise<Response> {
  if (!cronCredential(request)) return cronRefusal('The nightly backup');
  const target = backupBlobClient();
  if (target === null)
    return unavailable(
      `the backup store is not connected: set ${BACKUP_TOKEN_VARIABLES.join(' or ')} (docs/hosting.md, the backup)`,
    );
  const source = await exportBlobClient();
  if (source === null)
    return unavailable('the backup reads the Blob store, and this deployment runs the tmp store');
  try {
    const result = await runBackup({
      source: boundedBlobClient(source, { readMs: BACKUP_CALL_MS }),
      target: boundedBlobClient(target, { readMs: BACKUP_CALL_MS }),
      log: (line) => console.error(`turboslide backup: ${line}`),
    });
    const line = `turboslide backup: ${result.day} ${result.state}, ${result.decks} decks, ${result.objects} objects, ${result.copied} put by this call, ${result.failedCount} failed, ${result.pruned.length} days pruned, ${result.elapsedMs} ms`;
    if (result.failedCount > 0) console.error(`${line}; first: ${result.failed[0] ?? ''}`);
    else console.log(line);
    return jsonResponse(result, result.failedCount > 0 ? 500 : 200);
  } catch (error) {
    console.error(
      `turboslide backup: the call failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return errorResponse(error, 'backup');
  }
}

export const Route = createFileRoute('/api/cron/backup')({
  server: {
    handlers: {
      GET: ({ request }) => serveBackup(request),
    },
  },
});
