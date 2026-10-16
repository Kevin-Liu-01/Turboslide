import { definePlugin } from 'nitro';

import { flushRooms } from '../room';
import { settleDerivedSweep } from '../root';
import { createShutdown } from '../shutdown';

/**
 * The node-server build's SIGTERM and SIGINT (PERF-18, hardening HR-O#8): commit the open rooms,
 * let the derived sweep in flight settle, and exit within 10 s (server/shutdown.ts says how).
 * vite.deploy.config.ts lists this file for the node-server preset alone, and it does nothing on
 * Vercel, whose functions the platform starts and stops. Nitro requires the default export
 * (AGENTS.md, "No default exports except where a framework requires one").
 */
// eslint-disable-next-line no-restricted-syntax -- Nitro loads a plugin file by its default export
export default definePlugin((nitroApp) => {
  if (process.env.VERCEL !== undefined) return;
  const shutdown = createShutdown({
    flush: async () => {
      await settleDerivedSweep();
      await flushRooms();
    },
    exit: (code) => process.exit(code),
    log: (line) => console.error(line),
  });
  for (const name of ['SIGTERM', 'SIGINT'] as const)
    process.once(name, () => shutdown.signal(name));
  nitroApp.hooks.hook('close', () => shutdown.closed());
});
