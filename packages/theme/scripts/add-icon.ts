// Adds a Heroicon to the sprite (SPEC 5.1: "a script that fetches a missing Heroicon from
// heroicons/optimized/20/solid and appends it"; DECK-GRAMMAR.md:40). Usage:
//   pnpm --filter @turboslide/theme add-icon lock-closed
// It fetches the optimized 20 solid SVG from the tailwindlabs/heroicons repository, appends a
// <symbol id="i-<name>" viewBox="0 0 20 20"> to assets/sprite.svg and assets/sprite-ids.json,
// regenerates src/sprite.ts, and prints the one manual step: append the name to ICON_NAMES in
// packages/schema/src/icons.ts (the schema owns the IconName union). Network access is needed
// only when this script runs; the sprite itself is committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSprite } from './build-sprite.ts';

const HEROICONS =
  'https://raw.githubusercontent.com/tailwindlabs/heroicons/master/optimized/20/solid';

export function symbolFromHeroicon(name: string, svg: string): string {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 20 20';
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
  if (inner === '') throw new TypeError(`No drawing found in the SVG for ${name}`);
  return `<symbol id="i-${name}" viewBox="${viewBox}">${inner}</symbol>`;
}

export function appendSymbol(sprite: string, symbol: string): string {
  const close = sprite.lastIndexOf('</svg>');
  if (close < 0) throw new TypeError('sprite.svg has no closing </svg>');
  return `${sprite.slice(0, close)}${symbol}${sprite.slice(close)}`;
}

async function main(): Promise<void> {
  const name = process.argv[2];
  if (name === undefined || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    process.stderr.write(
      'usage: add-icon <heroicon-name>   (kebab case, as in heroicons/optimized/20/solid)\n',
    );
    process.exit(2);
  }
  const spritePath = new URL('../assets/sprite.svg', import.meta.url);
  const idsPath = new URL('../assets/sprite-ids.json', import.meta.url);
  const sprite = readFileSync(spritePath, 'utf8');
  if (sprite.includes(`<symbol id="i-${name}"`)) {
    process.stderr.write(`add-icon: i-${name} is already in the sprite\n`);
    process.exit(0);
  }
  const response = await fetch(`${HEROICONS}/${name}.svg`);
  if (!response.ok) {
    process.stderr.write(`add-icon: ${response.status} fetching ${name}.svg from heroicons\n`);
    process.exit(1);
  }
  const symbol = symbolFromHeroicon(name, await response.text());
  writeFileSync(spritePath, appendSymbol(sprite, symbol));
  const ids = JSON.parse(readFileSync(idsPath, 'utf8')) as string[];
  ids.push(`i-${name}`);
  writeFileSync(idsPath, `${JSON.stringify(ids, null, 2)}\n`);
  const count = buildSprite(spritePath, new URL('../src/sprite.ts', import.meta.url));
  process.stderr.write(
    `add-icon: appended i-${name}; sprite.ts now has ${count} symbols.\n` +
      `Next: add '${name}' to ICON_NAMES in packages/schema/src/icons.ts, then run the theme tests.\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(`add-icon: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
