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
const DOCS = join(here, '..', 'components', 'docs');

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

  // post-deploy review: `.site-block-body code` (inline code, ink at 0.875em) also matched the
  // `pre code` of CodePanel inside a block body, so /features drew #070707 commands on the #101010
  // panel in light at 11.4 px. A rule that colours or sizes `code` under a body names inline code
  // alone, and the panel's own rule sets its size and colour.
  it("keeps the inline code rule off a code panel's pre", () => {
    const all = selectors(readFileSync(join(SITE, 'site.css'), 'utf8'));
    const inline = all.filter((selector) =>
      /\.site-(?:block-body|faq-a)\b.*\bcode$/.test(selector),
    );
    expect(inline.length).toBeGreaterThan(0);
    expect(inline.filter((selector) => !/:not\(pre\) > code$/.test(selector))).toEqual([]);
    const panel = /\.ts-site \.site-term pre \{([^}]*)\}/.exec(
      readFileSync(join(SITE, 'site.css'), 'utf8'),
    )?.[1];
    expect(panel).toContain('font-size: 13px');
  });
});

// The docs (docs/SITE.md section 6) draw on the same root: /docs links the site's stylesheet and
// then its own from the layout route's head, no docs file imports a stylesheet as a module, and
// every selector of docs.css names the docs' root `.ts-docs`, which the site root carries on the
// docs alone.
describe("the docs' stylesheets", () => {
  it('are linked from the head of /docs, the site first, and imported as a module by no docs file', () => {
    const route = readFileSync(join(here, 'docs.tsx'), 'utf8');
    expect(cssImports(route).sort()).toEqual([
      '../components/docs/docs.css?url',
      '../components/site/site.css?url',
    ]);
    expect(route.indexOf('href: siteCss }')).toBeGreaterThan(0);
    expect(route.indexOf('href: siteCss }')).toBeLessThan(route.indexOf('href: docsCss }'));
    for (const name of readdirSync(DOCS).filter((file) => /\.tsx?$/.test(file)))
      expect(cssImports(readFileSync(join(DOCS, name), 'utf8')), name).toEqual([]);
  });

  it("names the docs' root in every selector", () => {
    const all = selectors(readFileSync(join(DOCS, 'docs.css'), 'utf8'));
    expect(all.length).toBeGreaterThan(100);
    expect(all.filter((selector) => !/(?:^|\s)\.ts-docs(?=$|[\s.:[])/.test(selector))).toEqual([]);
  });
});
