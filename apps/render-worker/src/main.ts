// The render worker process (MILESTONES M2 item 6): `node apps/render-worker/src/main.ts`, the
// Docker image's command. Environment: TURBOSLIDE_WORKER_PORT (4322), TURBOSLIDE_WORKER_HOST
// (127.0.0.1; the image sets 0.0.0.0), TURBOSLIDE_WORKER_TOKEN (bearer token, optional),
// TURBOSLIDE_DECKS_DIR and TURBOSLIDE_WORKER_DIR (paths.ts), TURBOSLIDE_CHROME and TURBOSLIDE_GPU
// (the headless package). Logs go to stderr, never to an unbounded file (AGENTS.md).
import { mkdirSync } from 'node:fs';

import { defaultPaths } from './paths.ts';
import { createQueue } from './queue.ts';
import { createWorkerServer } from './server.ts';

const env = process.env;
const paths = defaultPaths(env);
mkdirSync(paths.workerDir, { recursive: true });
const port = Number(env.TURBOSLIDE_WORKER_PORT ?? 4322);
const host = env.TURBOSLIDE_WORKER_HOST ?? '127.0.0.1';
const log = (line: string): void => {
  process.stderr.write(`${new Date().toISOString()} ${line}\n`);
};

const queue = createQueue({ dir: paths.workerDir, log });
const server = createWorkerServer({ queue, paths, token: env.TURBOSLIDE_WORKER_TOKEN, log });

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
