// The render worker process (MILESTONES M2 item 6): `node apps/render-worker/src/main.ts`, the
// Docker image's command. Environment: TURBOSLIDE_WORKER_TOKEN (the bearer, required: at least 32
// characters), TURBOSLIDE_WORKER_PORT (4322), TURBOSLIDE_WORKER_HOST (127.0.0.1; the image sets
// 0.0.0.0), TURBOSLIDE_DECKS_DIR and TURBOSLIDE_WORKER_DIR (paths.ts), TURBOSLIDE_CHROME and
// TURBOSLIDE_GPU (the headless package). `--local` serves 127.0.0.1 alone and needs no token, for
// a checkout (server.ts `workerStart`, hardening HR-PS#11a). Logs go to stderr, never to an
// unbounded file (AGENTS.md).
import { mkdirSync } from 'node:fs';

import { defaultPaths } from './paths.ts';
import { createQueue } from './queue.ts';
import { createWorkerServer, workerStart } from './server.ts';

const env = process.env;
const log = (line: string): void => {
  process.stderr.write(`${new Date().toISOString()} ${line}\n`);
};
let start: ReturnType<typeof workerStart>;
try {
  start = workerStart(process.argv.slice(2), env);
} catch (error) {
  log(`render-worker refuses to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const { host, port } = start;
const paths = defaultPaths(env);
mkdirSync(paths.workerDir, { recursive: true });

const queue = createQueue({ dir: paths.workerDir, log });
const server = createWorkerServer({
  queue,
  paths,
  ...(start.token === undefined ? {} : { token: start.token }),
  local: start.local,
  log,
});

server.listen(port, host, () => {
  log(
    `render-worker listening on http://${host}:${port}; decks ${paths.decksDir}; work ${paths.workerDir}`,
  );
});

const shutdown = (): void => {
  log('render-worker stopping');
  queue.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
