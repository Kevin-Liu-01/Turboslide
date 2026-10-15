// The landing's stylesheet reaches no other page (docs/SITE.md D7). A stylesheet a route imports
// as a module goes into the stylesheet every page loads: Landing 1 (a21c7358) shipped unscoped
// `.ts-row` rules that way, /decks draws its list rows as tr.ts-row, the tr became a flex box and
// the title link was 0 px wide (the matrix row decks.list.open-title). So /home links
// components/site/site.css from its head with `?url`, the way /docs links docs.css, the site's
// components import no stylesheet, and every selector of site.css names the site's root
// `.ts-site`, which only /home and /docs draw.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, '..', 'components', 'site');

const cssImports = (source: string): string[] =>
  [...source.matchAll(/^import\s+(?:\w+\s+from\s+)?'([^']+\.css(?:\?[^']*)?)';$/gm)].map(
    (m) => m[1] ?? '',
  );

const STEPS = /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/;

function selectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{};]+)\{/g)]
    .map((m) => (m[1] ?? '').trim())
    .filter((prelude) => !prelude.startsWith('@') && !STEPS.test(prelude))
    .flatMap((prelude) => prelude.split(/,(?![^(]*\))/).map((s) => s.trim()));
}

describe("the landing's stylesheet", () => {
  it('is linked from the head of /home and imported as a module by no site file', () => {
    const route = readFileSync(join(here, 'home.tsx'), 'utf8');
    expect(cssImports(route)).toEqual(['../components/site/site.css?url']);
    expect(route).toContain("links: [{ rel: 'stylesheet', href: siteCss }]");
    for (const name of readdirSync(SITE).filter((file) => /\.tsx?$/.test(file)))
      expect(cssImports(readFileSync(join(SITE, name), 'utf8')), name).toEqual([]);
  });

  it('names the site root in every selector', () => {
    const all = selectors(readFileSync(join(SITE, 'site.css'), 'utf8'));
    expect(all.length).toBeGreaterThan(100);
    expect(all.filter((selector) => !/(?:^|\s)\.ts-site(?=$|[\s.:[])/.test(selector))).toEqual([]);
  });
});
