// Which keyboard the browser has (gslides-parity SPEC 3.6 keys): `mac` for the Command chords,
// `win` for Control. Moved out of ./keys.ts in the focus round (cycle 3 stream fix round's fix
// round; VERIFICATION C2-F18): keys.ts imports the whole menu model, so the presenter route, which
// needs this one check, carried 74 KB of menus for it. ./keys.ts re-exports it by name.
import type { Platform } from './model.ts';

/** Apple platforms read Cmd, the others Ctrl; the studio's `apple` flag maps to this. */
export function detectPlatform(
  nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator,
): Platform {
  const text = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/i.test(text) ? 'mac' : 'win';
}
