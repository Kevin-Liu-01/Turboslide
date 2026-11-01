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

/** folders that hold no stylesheet of ours: installs, build output and the native build */
const SKIP = new Set(['node_modules', 'dist', '.output', 'target', 'wasm', 'generated']);

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
    expect(route).toContain("{ rel: 'stylesheet', href: siteCss }");
    for (const name of readdirSync(SITE).filter((file) => /\.tsx?$/.test(file)))
      expect(cssImports(readFileSync(join(SITE, name), 'utf8')), name).toEqual([]);
  });

  it('names the site root in every selector', () => {
    const all = selectors(readFileSync(join(SITE, 'site.css'), 'utf8'));
    expect(all.length).toBeGreaterThan(100);
    expect(all.filter((selector) => !/(?:^|\s)\.ts-site(?=$|[\s.:[])/.test(selector))).toEqual([]);
  });

  // The other direction (2026-11-01): a route's module stylesheet stays loaded after a client
  // navigation leaves the route, so the root class is safe only while no other sheet names it.
  // The editor's overlay drew its connection sites as `.ts-site` (absolute, 7 px), and /home
  // reached from the editor without a reload was a 7 px dot with the bar packed against it.
  it('is the only sheet that names the site root, beside the docs', () => {
    const sheetsUnder = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (SKIP.has(entry.name)) return [];
        const at = join(dir, entry.name);
        if (entry.isDirectory()) return sheetsUnder(at);
        return entry.name.endsWith('.css') ? [at] : [];
      });
    const sheets = [
      ...sheetsUnder(join(here, '..')),
      ...sheetsUnder(join(here, '..', '..', '..', '..', 'packages')),
    ];
    expect(sheets.length).toBeGreaterThan(20);
    const own = new Set([join(SITE, 'site.css'), join(DOCS, 'docs.css')]);
    const naming = sheets.filter(
      (f) =>
        !own.has(f) && selectors(readFileSync(f, 'utf8')).some((s) => /\.ts-site(?![\w-])/.test(s)),
    );
    expect(naming).toEqual([]);
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

  // post-merge review: the on this page column scrolls on its own, and a scroll box clips at its
  // padding edge, so it cut the left side of the focus ring of Copy Page, View as Markdown and
  // Report an issue, and the top of Copy Page's ring on a page with no entries (/docs/agents/skills).
  it("keeps a page tool's focus ring inside the on this page column", () => {
    const ring =
      /\.ts-site :focus-visible \{\s*outline: (\d+)px solid [^;]+;\s*outline-offset: (\d+)px;/.exec(
        readFileSync(join(SITE, 'site.css'), 'utf8'),
      );
    const reach = Number(ring?.[1]) + Number(ring?.[2]);
    expect(reach).toBe(4);
    const aside = /\n\.ts-docs \.ts-docs-aside \{([^}]*)\}/.exec(
      readFileSync(join(DOCS, 'docs.css'), 'utf8'),
    )?.[1];
    expect(aside).toContain('overflow-y: auto;');
    const sides = (name: string): [number, number, number, number] => {
      const values = (new RegExp(`\\s${name}: ([^;]+);`).exec(aside ?? '')?.[1] ?? '')
        .split(' ')
        .map((value) => parseFloat(value));
      const [top = 0, right = top, bottom = top, left = right] = values;
      return [top, right, bottom, left];
    };
    const [top, right, , left] = sides('padding');
    for (const side of [top, right, left]) expect(side).toBeGreaterThanOrEqual(reach);
    /* the content stays where it was: each padding is given back by a negative margin */
    const [mTop, mRight, , mLeft] = sides('margin');
    expect([mTop, mRight, mLeft]).toEqual([-top, -right, -left]);
  });
});
