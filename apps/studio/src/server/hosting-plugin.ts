import { definePlugin } from 'nitro';
import { useStorage } from 'nitro/storage';

import { layoutBlobClient } from '@turboslide/store/blob-vercel';
import { registerHostingProviders } from '@turboslide/store/hosted';
import { keyValueSeed } from '@turboslide/store/seed';
import { hasBlobToken } from '@turboslide/store/select';

/**
 * The Nitro plugin that hands the store what only the deployment build has (the hosting round;
 * docs/hosting.md): the bundled seed decks and the Blob client. vite.deploy.config.ts lists this
 * file under `plugins` and bundles `decks/templates` and `decks/gt-brand` as the `decks` server
 * asset group, which Nitro exposes at runtime through `useStorage('assets:decks')`; the plugin
 * runs once when the function starts and registers a seed over that storage plus, when
 * BLOB_READ_WRITE_TOKEN is set, a factory for the @vercel/blob client. The `packages` group
 * (the theme CSS and sprite, the Inter woff2 and CSS, the export faces, calibration.json) is the
 * second seed: the renderer and the exporter read those files from the workspace, which the
 * function does not have, so root.ts materializes them and points TURBOSLIDE_PACKAGES_DIR there. server/root.ts reads the
 * registration and falls back to the checkout's decks/ folder when there is none (the dev
 * server, the tests), so no module the browser bundles imports `nitro/storage` or `@vercel/blob`.
 * Nitro requires the default export (AGENTS.md, "No default exports except where a framework
 * requires one").
 */
// eslint-disable-next-line no-restricted-syntax -- Nitro loads a plugin file by its default export
export default definePlugin(() => {
  const storage = useStorage('assets:decks');
  const packages = useStorage('assets:packages');
  registerHostingProviders({
    source: 'nitro-plugin',
    seed: keyValueSeed('nitro:assets:decks', {
      getKeys: (base) => storage.getKeys(base),
      getItemRaw: (key) => storage.getItemRaw(key),
    }),
    packages: keyValueSeed('nitro:assets:packages', {
      getKeys: (base) => packages.getKeys(base),
      getItemRaw: (key) => packages.getItemRaw(key),
    }),
    // layout v2 through the split client when TURBOSLIDE_BLOB_PRIVATE_TOKEN is set, the public
    // client alone otherwise (gslides-parity SPEC-3 11.4; docs/hosting.md section 10; b2.md R9)
    blob: hasBlobToken(process.env) ? () => Promise.resolve(layoutBlobClient(process.env)) : null,
  });
});
