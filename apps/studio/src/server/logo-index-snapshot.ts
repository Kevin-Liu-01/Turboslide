// The logo index snapshot bundled with the deployment (docs/FEATURES.md 4.2; build/hotfix.md
// section 9): the copy of `system/logo-index.json` that never passes through the public store's
// edge, so a cold instance answers the picker while the edge refuses the pathname for the minutes
// after a write of it (every refresh opens that window; before this a cold instance with no disk
// copy answered 503 on every logo route for its length). The file is
// `logo-index.snapshot.json` beside this module, written by `scripts/build-logo-index-snapshot.mjs`
// at each ship from the store's real build or from thesvg.org's `icons.json` through the refresh's
// own builder, and read here as text through Vite's `?raw` import (the pattern of contracts.ts),
// parsed once per process on the first call and never at module load. logos.ts serves it last in
// its load order (the instance's held copy, its disk mirror, the store's copy when the store
// answers, then this), names its `builtAt` on the search answer as `snapshotAt`, and asks the
// store again sooner than the hourly revalidation while it stands. Server only.
import { parseLogoIndex } from './logo-index';
import type { LogoIndex } from './logo-index';
import snapshotText from './logo-index.snapshot.json?raw';

let parsed: LogoIndex | null | undefined;

/**
 * The bundled snapshot as an index the service can hold, parsed once; null when the file does
 * not parse as the module wrote it (a build without the file answers 503 as the first hotfix did).
 * A fresh object is answered on every call so a holder's discoveries never write into the
 * module's copy.
 */
export function bundledLogoIndex(): LogoIndex | null {
  if (parsed === undefined) {
    try {
      parsed = parseLogoIndex(JSON.parse(snapshotText) as unknown);
    } catch {
      parsed = null;
    }
    // a snapshot never names a failure of its own day; the script strips it and the reader too
    if (parsed !== null) delete parsed.lastError;
  }
  return parsed === null ? null : (JSON.parse(JSON.stringify(parsed)) as LogoIndex);
}

/** The bytes of the bundled text, for the size the ship note records. */
export function bundledLogoIndexBytes(): number {
  return new TextEncoder().encode(snapshotText).byteLength;
}
