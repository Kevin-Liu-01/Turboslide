#!/usr/bin/env node
// Removes one scratch deck from the shared Blob store by id, the way blob-store.ts `remove` does
// (the manifest first, then every object under the prefix, the presence record's copy, the
// presence folder and the pulse), for a deck whose anonymous principal's context is gone (the
// before drive's teardown named the wrong input shape). The token comes from the environment
// (BLOB_READ_WRITE_TOKEN, sourced from .turboslide/vercel-dev.env in a subshell); nothing is
// printed but pathnames and counts.
//   ( set -a; . .turboslide/vercel-dev.env; set +a; node store-sweep.mjs --deck <id> [--dry-run] )
import { deckPrefix } from '/Users/kevinliu/repos/Turboslide-live/packages/store/src/blob-store.ts';
import { vercelBlobClient } from '/Users/kevinliu/repos/Turboslide-live/packages/store/src/blob-vercel.ts';
import { STATE_DIR } from '/Users/kevinliu/repos/Turboslide-live/packages/store/src/file-store.ts';
import { pulsePath } from '/Users/kevinliu/repos/Turboslide-live/packages/store/src/pulse.ts';

const argv = process.argv.slice(2);
const at = argv.indexOf('--deck');
const id = at >= 0 ? argv[at + 1] : undefined;
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('usage: node store-sweep.mjs --deck <id> [--dry-run]');
  process.exit(2);
}
const dry = argv.includes('--dry-run');
const client = vercelBlobClient(process.env);
const prefix = deckPrefix(id);
const manifest = await client.head(`${prefix}deck.json`);
console.log(`${prefix}deck.json: ${manifest === null ? 'absent' : 'present'}`);
const record = await client.head(`${prefix}${STATE_DIR}/presence.json`).catch(() => null);
const rest = new Set((await client.list(prefix)).map((entry) => entry.pathname));
if (record !== null) {
  const hex = record.version.replace(/^W\//, '').replace(/"/g, '');
  rest.add(`${prefix}${STATE_DIR}/presence/${hex}.json`);
}
rest.add(`${prefix}${STATE_DIR}/presence.json`);
rest.add(pulsePath(id));
for (const entry of await client.list(`${prefix}${STATE_DIR}/presence/`)) rest.add(entry.pathname);
const listed = [...rest].filter((p) => p !== `${prefix}deck.json`);
console.log(
  `objects under ${prefix} (listed): ${(await client.list(prefix)).length}; to delete by name: ${listed.length + (manifest === null ? 0 : 1)}`,
);
for (const p of [...rest].sort()) console.log(`  ${p}`);
if (dry) {
  console.log('dry run: nothing deleted');
} else {
  if (manifest !== null) await client.del([`${prefix}deck.json`]);
  await client.del(listed);
  const after = await client.list(prefix);
  console.log(
    `after: ${after.length} objects under ${prefix}; manifest ${(await client.head(`${prefix}deck.json`)) === null ? 'absent' : 'present'}`,
  );
}
