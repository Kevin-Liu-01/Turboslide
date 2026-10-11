#!/usr/bin/env node
// The restore drill by hand (hardening O#1b, docs/hardening/HARDENING.md 4.8; RELIABILITY-13): the
// same drill the monthly cron runs (`/api/cron/restore-drill`, apps/studio/src/server/backup.ts
// `runRestoreDrill`). It restores one deck from the newest complete night of the backup store into
// a scratch id in a folder of this machine, reads it through the store, compares it with the
// backup, removes the folder and writes `backup/drills/<yyyy-mm>.json` into the backup store.
//
//   ( set -a; . <env file>; set +a; node scripts/restore-drill.mjs [--deck <id>] [--day <yyyy-mm-dd>] [--keep <folder>] [--no-record] [--json <out>] )
//   TURBOSLIDE_BACKUP_DIR=<folder> node scripts/restore-drill.mjs ...   a folder as the backup store
//
// The backup store's token comes from the environment, TURBOSLIDE_BACKUP_BLOB_TOKEN or
// TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN, sourced in a subshell from a file that is never
// committed; it is never printed, written or passed on the command line. `--keep <folder>`
// restores into that folder and leaves it for a person to read (the deck sits under
// `store/decks/<scratch id>/`); `--no-record` writes nothing into the backup store. The script
// prints one line and exits 0 when every check held, 1 when one did not, 2 on a usage error or
// without a backup store. Node loads backup.ts with its type stripping.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BACKUP_TOKEN_VARIABLES,
  backupBlobClient,
  runRestoreDrill,
} from '../apps/studio/src/server/backup.ts';

const USAGE =
  'usage: node scripts/restore-drill.mjs [--deck <id>] [--day <yyyy-mm-dd>] [--keep <folder>] [--no-record] [--json <out>]';

export function parseArgs(argv) {
  const out = {
    deck: undefined,
    day: undefined,
    keep: null,
    record: true,
    json: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--deck') out.deck = argv[++i];
    else if (arg === '--day') out.day = argv[++i];
    else if (arg === '--keep') out.keep = argv[++i] ?? null;
    else if (arg === '--no-record') out.record = false;
    else if (arg === '--json') out.json = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new RangeError(`unknown argument ${arg}\n${USAGE}`);
  }
  if (out.day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(out.day))
    throw new RangeError(`--day takes yyyy-mm-dd\n${USAGE}`);
  return out;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const backup = backupBlobClient(process.env);
  if (backup === null) {
    console.error(
      `the backup store is not in the environment: ${BACKUP_TOKEN_VARIABLES.join(' or ')}, or TURBOSLIDE_BACKUP_DIR for a folder; nothing read`,
    );
    process.exit(2);
  }
  let scratchRoot;
  if (args.keep === null) scratchRoot = mkdtempSync(join(tmpdir(), 'turboslide-drill-'));
  else {
    scratchRoot = resolve(args.keep);
    mkdirSync(scratchRoot, { recursive: true });
  }
  const record = await runRestoreDrill({
    backup,
    scratchRoot,
    keep: args.keep !== null,
    record: args.record,
    ...(args.deck === undefined ? {} : { deckId: args.deck }),
    ...(args.day === undefined ? {} : { day: args.day }),
  });
  if (args.json !== null) writeFileSync(resolve(args.json), `${JSON.stringify(record, null, 2)}\n`);
  console.log(
    record.ok
      ? `restore drill: ${record.deckId} from ${record.day} restored as ${record.scratchId}, ${record.objects} objects, revision ${record.revision}; every check held (${record.elapsedMs} ms)${args.keep === null ? '' : `; kept in ${scratchRoot}`}`
      : `restore drill failed: ${record.reason}`,
  );
  process.exit(record.ok ? 0 : 1);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
