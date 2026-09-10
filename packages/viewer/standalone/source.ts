import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

import { standaloneChromeHtml } from './chrome.ts';

/** The token runtime.ts holds where the chrome markup goes. */
export const CHROME_HTML_PLACEHOLDER = '__TURBOSLIDE_STANDALONE_CHROME__';

/**
 * The standalone runtime as classic JavaScript, for renderStandalone
 * (SPEC 5.2, 5.3): `renderStandalone(deck, slides, { ..., runtime:
 * standaloneRuntimeSource(deck.title) })`. runtime.ts is one IIFE with no
 * imports, no exports and erasable syntax only, so Node's own type stripping
 * turns it into a script that runs in a plain <script> tag; the chrome markup
 * and CSS (chrome.ts) are baked in at the placeholder, and the runtime
 * injects them when the document has no #viewer. Node only: the browser never
 * imports this module.
 */
export function standaloneRuntimeSource(title = 'Deck'): string {
  const source = readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');
  const js = stripTypeScriptTypes(source, { mode: 'strip' });
  const chrome = JSON.stringify(standaloneChromeHtml(title));
  return js.replace(`'${CHROME_HTML_PLACEHOLDER}'`, chrome);
}
