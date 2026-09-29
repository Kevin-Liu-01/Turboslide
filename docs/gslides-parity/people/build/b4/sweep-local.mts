// The janitor run by hand over a local server's own folder (docs/PEOPLE.md 4.6): the file
// avatar store under <overlay>/.turboslide/users and the profile rows of the server's SQLite
// identity database, a dry run then a run. Prints one JSON line.
//   node docs/gslides-parity/people/build/b4/sweep-local.mts <overlayRoot> <authDbPath>
import { fileAvatarStore, sweepOrphanAvatars } from '../../../../../apps/studio/src/server/auth/avatar.ts';
import { openAuthDb } from '../../../../../apps/studio/src/server/auth/db.ts';
import { dbProfileStore } from '../../../../../apps/studio/src/server/auth/profile.ts';

const [overlay, dbPath] = process.argv.slice(2);
const store = fileAvatarStore(`${overlay ?? ''}/.turboslide/users`);
const auth = openAuthDb({ kind: 'sqlite', path: dbPath ?? '', reason: 'b4 sweep drive' });
const profiles = dbProfileStore(auth.db);
const dry = await sweepOrphanAvatars(store, profiles, { dryRun: true });
const run = await sweepOrphanAvatars(store, profiles);
const profileKeys = (await profiles.avatarKeys()).length;
await auth.close();
process.stdout.write(`${JSON.stringify({ dry, run, profileKeys })}\n`);
