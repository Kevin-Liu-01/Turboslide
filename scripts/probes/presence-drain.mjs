#!/usr/bin/env node
// The drain of the hosting move (docs/HOSTING-MOVE.md section 5 step 5, section 9; the sync and
// costs round, build/b6.md R1): a read only count of the roster rows still alive across every
// live deck of the store, so the flip of step 7 runs only when no tab is writing.
//
//   ( set -a; . <env file naming BLOB_READ_WRITE_TOKEN>; set +a; node scripts/probes/presence-drain.mjs [--wait] [--until <minutes>] [--json <out>] )
//
// What it reads, the way the runtime reads it: the folders directly under `decks/` (one listing in
// folded mode, `BlobClient.folders`), the manifest `decks/<id>/deck.json` of each by a `head` (a
// folder without one is a removed deck's leftovers and is skipped), and the roster record
// `decks/<id>/.turboslide/presence.json` through `provenGet` (packages/store/src/access-store.ts:
// the head's version first, the body only when its md5 is that version, else the copy under the
// version), because the public host serves an overwritten object for up to thirty days and a
// plain get could read a roster from before the sellers left. A row is live when its `expiresAt`
// is in the future (the heartbeat renews a row for PRESENCE_SHARED_TTL_MS, 30 s, and a tab that
// stopped is gone from the roster within that) and no tombstone in `left` names its client at or
// after the row's own time (presence-store.ts: a tombstone at or after the row wins).
//
// It prints one line per read, `presence-drain: <live> live row(s) across <n> deck(s) at <time>`,
// and exits 0 at a count of 0, 1 otherwise. `--wait` reads again every minute while the count is
// above 0, up to `--until <minutes>` (the window's end; 30 by default), and exits with the last
// reading. `--json <out>` writes the readings with the deck ids that held a live row and nothing
// else. The token is BLOB_READ_WRITE_TOKEN in the environment (sourced in a subshell by the
// caller, the way audit-hosting/scripts/blob-sizing.mjs is run) and is never printed or written;
// nothing here puts, deletes or lists past the one folded listing. The counting is a pure function
// over a record's bytes (`liveRowsOf`) and the pass over a client (`drainOnce`) is tested against
// packages/store/src/blob-fake.ts in presence-drain.test.mjs; this script has never run against a
// real store.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { provenGet } from '../../packages/store/src/access-store.ts';
import { parsePresenceRecord, presencePath } from '../../packages/store/src/presence-store.ts';

export const DECKS_PREFIX = 'decks/';
export const DEFAULT_UNTIL_MINUTES = 30;
export const WAIT_MS = 60_000;

/** The deck id of a folder the listing returned (`decks/<id>/`), or null for anything else. */
export function deckIdOfFolder(folder) {
  if (!folder.startsWith(DECKS_PREFIX) || !folder.endsWith('/')) return null;
  const id = folder.slice(DECKS_PREFIX.length, -1);
  return id === '' || id.includes('/') ? null : id;
}

/**
 * The live rows of one roster record at `now`: `expiresAt` in the future and no tombstone at or
 * after the row's time. Unparseable bytes count as no rows (the runtime reads them the same way).
 */
export function liveRowsOf(bytes, now) {
  const { rows, left } = parsePresenceRecord(bytes);
  const live = [];
  for (const [clientId, row] of rows) {
    if (row.expiresAt <= now) continue;
    const tomb = left.get(clientId);
    if (tomb !== undefined && tomb.at >= row.at) continue;
    live.push(clientId);
  }
  return live;
}

/**
 * One pass over the store: every deck folder with a manifest, its roster read proven, the live
 * rows counted. Answers the count, the decks read and the ids of the decks holding a live row.
 */
export async function drainOnce(client, now = Date.now()) {
  const folders = await client.folders(DECKS_PREFIX);
  const decks = [];
  const live = [];
  let count = 0;
  for (const folder of folders) {
    const deckId = deckIdOfFolder(folder);
    if (deckId === null) continue;
    const manifest = await client.head(`${folder}deck.json`);
    if (manifest === null) continue;
    decks.push(deckId);
    const record = await provenGet(client, presencePath(deckId)).catch(() => null);
    if (record === null) continue;
    const rows = liveRowsOf(record.bytes, now);
    if (rows.length > 0) {
      count += rows.length;
      live.push({ deckId, rows: rows.length });
    }
  }
  return { at: new Date(now).toISOString(), decks: decks.length, live, count };
}

export function parseArgs(argv) {
  const out = { wait: false, untilMinutes: DEFAULT_UNTIL_MINUTES, json: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--wait') out.wait = true;
    else if (arg === '--until') out.untilMinutes = Number(argv[++i]);
    else if (arg === '--json') out.json = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!Number.isFinite(out.untilMinutes) || out.untilMinutes < 0)
    throw new Error('--until takes a number of minutes');
  return out;
}

export function usage() {
  return 'usage: node scripts/probes/presence-drain.mjs [--wait] [--until <minutes>] [--json <out>] (BLOB_READ_WRITE_TOKEN in the environment)';
}

export function lineOf(reading) {
  const rows = reading.count === 1 ? 'row' : 'rows';
  const decks = reading.decks === 1 ? 'deck' : 'decks';
  return `presence-drain: ${reading.count} live ${rows} across ${reading.decks} ${decks} at ${reading.at}`;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exit(2);
  }
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is not in the environment; nothing read');
    console.error(usage());
    process.exit(2);
  }
  const { vercelBlobClient } = await import('../../packages/store/src/blob-vercel.ts');
  const client = vercelBlobClient(process.env);
  const readings = [];
  const deadline = Date.now() + args.untilMinutes * WAIT_MS;
  for (;;) {
    const reading = await drainOnce(client, Date.now());
    readings.push(reading);
    console.log(lineOf(reading));
    if (reading.count === 0 || !args.wait || Date.now() + WAIT_MS > deadline) break;
    await new Promise((r) => setTimeout(r, WAIT_MS));
  }
  if (args.json) writeFileSync(resolve(args.json), `${JSON.stringify({ readings }, null, 2)}\n`);
  const last = readings[readings.length - 1];
  process.exit(last.count === 0 ? 0 : 1);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
