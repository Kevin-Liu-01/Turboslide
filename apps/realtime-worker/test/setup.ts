// Applies the control migrations to the test D1 before each file (docs/CLOUDFLARE.md 3.6.2: the
// tables are made by a wrangler migration and never by the Worker), so `/health` reads `on` and
// the object can write its `rt_open` row as on a deployed Worker.
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.ACCOUNTS, env.TEST_MIGRATIONS);
