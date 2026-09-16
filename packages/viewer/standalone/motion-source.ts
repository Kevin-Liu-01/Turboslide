import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

/**
 * The standalone motion script as classic JavaScript, for renderStandalone (gslides-parity SPEC-5
 * 2.3): `renderStandalone(deck, slides, { ..., motionScript: standaloneMotionSource() })`.
 * motion.ts is one IIFE with no imports, no exports and erasable syntax only, so Node's own type
 * stripping turns it into a script that runs in a plain <script> tag after the runtime, the way
 * standalone/source.ts ports runtime.ts. Node only: the browser never imports this module.
 */
export function standaloneMotionSource(): string {
  const source = readFileSync(new URL('./motion.ts', import.meta.url), 'utf8');
  return stripTypeScriptTypes(source, { mode: 'strip' });
}
