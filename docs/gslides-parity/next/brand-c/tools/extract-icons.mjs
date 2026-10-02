// Reads packages/chrome/src/icons.tsx as text and evaluates its PATHS table in plain JS, so the
// mockups draw the product's own Heroicons 20 solid paths. Writes icons.json beside the tools.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../../..');
const src = readFileSync(join(root, 'packages/chrome/src/icons.tsx'), 'utf8');
const start = src.indexOf('/* bars-3-bottom-left');
const end = src.indexOf('export type IconProps');
let body = src.slice(start, end);
body = body
  .replace(/: readonly IconPath\[\]/g, '')
  .replace(/: Record<IconName, readonly IconPath\[\]>/g, '')
  .replace(/ as const/g, '')
  .replace(/shapePath\(/g, '__shape(');
const fn = new Function('__shape', `${body}; return PATHS;`);
const paths = fn(() => 'M0 0');
writeFileSync(join(here, 'icons.json'), JSON.stringify(paths, null, 0));
console.log(Object.keys(paths).length, 'icons');
