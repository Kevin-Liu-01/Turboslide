// The landing's stylesheets reach no other page. The route imports them, and the build puts every
// route's CSS in the stylesheet that every page loads. Landing 1 (a21c7358) shipped unscoped
// `.ts-row` rules: /decks draws its list rows as tr.ts-row, the tr became a flex box and the
// title link was 0 px wide (the matrix row decks.list.open-title). So every selector of a
// stylesheet that only home.tsx imports must name the landing's root `.ts-product`, or a class or
// data attribute that no markup outside the landing names.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..', '..');

const cssImports = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/^import '([^']+\.css)';$/gm)].map((m) =>
    resolve(dirname(file), m[1] ?? ''),
  );

const routeFiles = readdirSync(here)
  .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
  .map((name) => join(here, name));
const shared = new Set(routeFiles.filter((f) => !f.endsWith('/home.tsx')).flatMap(cssImports));
const sheets = cssImports(join(here, 'home.tsx')).filter((file) => !shared.has(file));

const outside = (path: string): boolean =>
  /\.tsx?$/.test(path) &&
  !/\.test\.|node_modules|routeTree\.gen\.ts$|\/components\/home\/|\/routes\/home\.tsx$/.test(path);
const sources = [
  join(ROOT, 'apps/studio/src'),
  ...readdirSync(join(ROOT, 'packages')).map((name) => join(ROOT, 'packages', name, 'src')),
].flatMap((dir) => {
  try {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((name) => join(dir, name));
  } catch {
    return [];
  }
});
/** Every word of the source outside the landing, so a class or attribute name is a lookup. A
    word after `.` or `-` is a selector or a custom property in a string, which draws nothing. */
const words = new Set(
  sources
    .filter(outside)
    .flatMap((file) => readFileSync(file, 'utf8').match(/(?<![\w.-])[A-Za-z][\w-]*/g) ?? []),
);

const STEPS = /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/;

function selectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{};]+)\{/g)]
    .map((m) => (m[1] ?? '').trim())
    .filter((prelude) => !prelude.startsWith('@') && !STEPS.test(prelude))
    .flatMap((prelude) => prelude.split(/,(?![^(]*\))/).map((s) => s.trim()));
}

function scoped(selector: string): boolean {
  const named = selector.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
  const classes = [...named.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1] ?? '');
  const attributes = [...named.matchAll(/\[\s*([\w-]+)/g)].map((m) => m[1] ?? '');
  return classes.includes('ts-product') || [...classes, ...attributes].some((n) => !words.has(n));
}

describe("the landing's stylesheets", () => {
  it('are the files only the landing route imports', () => {
    expect(sheets.map((file) => file.slice(ROOT.length + 1))).toContain(
      'apps/studio/src/routes/home.css',
    );
  });

  it('name the landing root or a name no other page draws in every selector', () => {
    const reach = sheets.flatMap((file) =>
      selectors(readFileSync(file, 'utf8'))
        .filter((selector) => !scoped(selector))
        .map((selector) => `${file.slice(ROOT.length + 1)}: ${selector}`),
    );
    expect(reach).toEqual([]);
  });
});
