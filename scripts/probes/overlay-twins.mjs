// The seed deck's twins in a local node server's overlay (the realtime round, R5 fix 3;
// VERIFICATION.md realtime pass 3 P3-4).
//
// The node-server build drops `gt-brand/assets/**` from the seed it bundles (gslides-parity
// SPEC-4 0.35). A tmp overlay fetches those twins from the deployment's static files by origin
// (apps/studio/src/server/root.ts `seedAssetOrigins`: TURBOSLIDE_PUBLIC_ORIGIN, then
// VERCEL_PROJECT_PRODUCTION_URL, then VERCEL_URL). A local node server has none of the three, so
// its overlay holds no twins and deck.create from the GT brand template answers "The template
// names an assets folder that is missing". That refusal is the class of
// `decks.list.gt-brand-deck`, `brand.appearance.default` and the two large deck export rows: red
// on every node-server run of the round, green on the runner's `vite dev` (the checkout's seed
// carries the twins) and on every Blob-store deployment read (the CDN answers the fetch).
//
// TURBOSLIDE_PUBLIC_ORIGIN is not the harness's switch for this: it also names the card's
// `og:url`, and `decks.home.links-and-card` reads www.turboslide.com there on a local base. So
// the gate places the checkout's twins in the server's overlay before its drivers run. These are
// the files a deployment's first `ensureAssets` fetches from its CDN into the same folder. A file
// the overlay already holds is never written.
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/** The seed decks whose twins the bundle drops (root.ts `SEED_FOLDERS` with an assets folder). */
export const SEED_TWIN_DECKS = ['gt-brand'];

/**
 * Copies every file of `<source>/<deck>/assets/` that `<overlay>/decks/<deck>/assets/` lacks,
 * for each seed deck, and answers per deck how many files it placed and how many were present.
 * `source` is the checkout's decks folder; a deck it does not hold is answered with `source: null`.
 * Each file is written under a temporary name and renamed, so a server reading the folder never
 * meets half a file.
 */
export function placeSeedTwins({ overlay, source, decks = SEED_TWIN_DECKS }) {
  const out = [];
  for (const deck of decks) {
    const from = join(source, deck, 'assets');
    if (!existsSync(from)) {
      out.push({ deck, placed: 0, present: 0, source: null });
      continue;
    }
    const to = join(overlay, 'decks', deck, 'assets');
    mkdirSync(to, { recursive: true });
    let placed = 0;
    let present = 0;
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const target = join(to, entry.name);
      if (existsSync(target)) {
        present += 1;
        continue;
      }
      const partial = `${target}.${process.pid}.tmp`;
      copyFileSync(join(from, entry.name), partial);
      renameSync(partial, target);
      placed += 1;
    }
    out.push({ deck, placed, present, source: from });
  }
  return out;
}
