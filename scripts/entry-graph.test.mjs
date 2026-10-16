// The studio's entry chunk graph, pinned at the source (the focus round, cycle 3 stream fix
// round's fix round; VERIFICATION C2-F18; check step 31's `js decoded` rows). The route files'
// loaders import apps/studio/src/server/write.ts, so that module's client copy rides the entry
// chunk of every route, and the dither worker and the viewer's dither host import the effects
// pipeline. Two mechanisms put zod (99 KB decoded) into the entry and 67 KB of it into the worker
// on the tree the fix round read: write.ts kept the editor's pure `autoTitleMutations`, which
// read `plainText` from @turboslide/schema/text (zod schemas at its top), and the pipeline read
// `resolveDither` from @turboslide/schema/blocks/dither, whose `pictureDitherSchema` is zod. A third
// path stood once those two were cut: the theme's sprite and the renderer's primitives read
// `iconSymbolId` from @turboslide/schema/icons, whose `iconNameSchema` is a top level `z.enum`, so
// zod moved into a chunk /home, /present and /deck load. The values now live in modules without
// zod and the loaders' module no longer carries the editor's function; these assertions keep it
// so, since the bundle numbers of step 31 are minutes of build away from a source edit.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
/** The runtime import specifiers of a module (type only imports are erased by the compiler). */
function runtimeImports(source) {
  const out = [];
  for (const m of source.matchAll(/^import\s+(type\s+)?[\s\S]*?from\s+'([^']+)';/gm)) {
    if (m[1] === undefined) out.push(m[2]);
  }
  return out;
}

/*
 * The static runtime graph of a module, within the workspace (hardening HR-PC#1 to HR-PC#3): every
 * file a static import, a side effect import or an `export ... from` reaches, as paths from the
 * repository root. `@turboslide/<package>/<sub>` resolves through the package's `exports`, a
 * relative specifier through the file, `.ts`, `.tsx` and `index.ts`; a library, a stylesheet and
 * a `?url` asset end the walk. A dynamic `import()` is a chunk of its own and is not followed, so
 * the graph is what the bundler puts in the chunk of the module and the chunks it imports.
 */
const PACKAGE_DIRS = new Map();
for (const dir of ['packages', 'apps']) {
  for (const name of [
    'agent',
    'chrome',
    'effects',
    'export',
    'fonts',
    'headless',
    'identity',
    'import',
    'lint',
    'materials',
    'mcp',
    'native',
    'realtime',
    'render',
    'schema',
    'store',
    'theme',
    'viewer',
    'cli',
    'render-worker',
  ]) {
    const json = resolve(ROOT, dir, name, 'package.json');
    if (!existsSync(json)) continue;
    const manifest = JSON.parse(readFileSync(json, 'utf8'));
    PACKAGE_DIRS.set(manifest.name, {
      dir: resolve(ROOT, dir, name),
      exports: manifest.exports ?? {},
    });
  }
}
function resolveSpecifier(specifier, from) {
  if (/\.(?:css|woff2?|png|jpe?g|svg|json)(?:\?.*)?$/.test(specifier) || specifier.includes('?'))
    return null;
  if (specifier.startsWith('.')) {
    const base = resolve(dirname(from), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')]) {
      if (existsSync(candidate) && !candidate.endsWith('/')) {
        try {
          if (readFileSync(candidate)) return candidate;
        } catch {
          /* a directory */
        }
      }
    }
    throw new Error(`${relative(ROOT, from)}: cannot resolve ${specifier}`);
  }
  const match = /^(@turboslide\/[^/]+)(\/.*)?$/.exec(specifier);
  if (match === null) return null;
  const pkg = PACKAGE_DIRS.get(match[1]);
  if (pkg === undefined) throw new Error(`${relative(ROOT, from)}: unknown package ${match[1]}`);
  const target = pkg.exports[`.${match[2] ?? ''}`];
  if (typeof target !== 'string')
    throw new Error(`${relative(ROOT, from)}: ${specifier} is not exported`);
  return resolve(pkg.dir, target);
}
function staticSpecifiers(source) {
  const out = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of code.matchAll(/^\s*import\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?'([^']+)';/gm)) {
    if (m[1] === undefined) out.push(m[2]);
  }
  for (const m of code.matchAll(
    /^\s*export\s+(type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+'([^']+)';/gm,
  )) {
    if (m[1] === undefined) out.push(m[2]);
  }
  return out;
}
/** The TypeScript sources under a folder, tests left out, as paths from the repository root. */
function walkSources(dir) {
  const out = [];
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__')
        out.push(...walkSources(path));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}
function runtimeGraph(entry) {
  const seen = new Set();
  const stack = [resolve(ROOT, entry)];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of staticSpecifiers(readFileSync(file, 'utf8'))) {
      const next = resolveSpecifier(specifier, file);
      if (next !== null && !seen.has(next)) stack.push(next);
    }
  }
  return new Set([...seen].map((file) => relative(ROOT, file)));
}

describe('the entry chunk graph stays without zod', () => {
  it('server/write.ts, imported by the /new and /edit loaders, reads no schema text and no chrome strings', () => {
    const imports = runtimeImports(read('apps/studio/src/server/write.ts'));
    expect(imports).not.toContain('@turboslide/schema/text');
    expect(imports).not.toContain('@turboslide/chrome/menus/strings');
    expect(read('apps/studio/src/server/write.ts')).not.toContain('autoTitleMutations');
  });

  it('the auto-title is the editor module the controller imports', () => {
    expect(read('apps/studio/src/editor/auto-title.ts')).toContain(
      'export function autoTitleMutations',
    );
    expect(read('apps/studio/src/editor/controller.tsx')).toContain("from './auto-title'");
  });

  it('the dither values module imports nothing and the pipeline, the walk, the worker path and the material actions read it', () => {
    expect(runtimeImports(read('packages/schema/src/blocks/dither-values.ts'))).toEqual([]);
    for (const path of [
      'packages/effects/src/dither.ts',
      'packages/effects/src/dither-io.ts',
      'packages/render/src/dither-walk.ts',
      'packages/materials/src/actions.ts',
    ]) {
      const imports = runtimeImports(read(path));
      expect(imports, path).not.toContain('@turboslide/schema/blocks/dither');
      expect(imports, path).toContain('@turboslide/schema/blocks/dither-values');
    }
  });

  it('the icon names module imports nothing and the sprite and the renderer read it, not the schema over it', () => {
    expect(runtimeImports(read('packages/schema/src/icon-names.ts'))).toEqual([]);
    for (const path of [
      'packages/theme/src/sprite.ts',
      'packages/render/src/blocks/primitives.ts',
    ]) {
      const imports = runtimeImports(read(path));
      expect(imports, path).not.toContain('@turboslide/schema/icons');
      expect(imports, path).toContain('@turboslide/schema/icon-names');
    }
  });

  it('the presenter reads the platform check without the menu model behind menus/keys', () => {
    expect(runtimeImports(read('packages/chrome/src/menus/platform.ts'))).toEqual([]);
    const presenter = runtimeImports(read('apps/studio/src/components/PresenterPage.tsx'));
    expect(presenter).not.toContain('@turboslide/chrome/menus/keys');
    // and the five console icons come from the studio's own module, not the chrome's icon set
    expect(presenter).not.toContain('@turboslide/chrome/icons');
    expect(runtimeImports(read('apps/studio/src/components/presenter-icons.tsx'))).toEqual([]);
  });

  /* polish two, P2-V1.4 finding 6: on the tree it read, the schema (521 KB) and zod (99 KB) were
     back in the chunk every route loads through four modules the route files reach */
  it('the root sets the jitless flag without zod, and the error classes import no zod', () => {
    const root = runtimeImports(read('apps/studio/src/routes/__root.tsx'));
    expect(read('apps/studio/src/routes/__root.tsx')).toContain(
      "import '@turboslide/schema/jitless';",
    );
    expect(root).not.toContain('@turboslide/schema/errors');
    expect(runtimeImports(read('packages/schema/src/jitless.ts'))).toEqual([]);
    expect(runtimeImports(read('packages/schema/src/errors.ts'))).not.toContain('zod');
  });

  it('the viewer routes read the agent flag from a module without imports, not the session hook', () => {
    expect(runtimeImports(read('apps/studio/src/components/agent-search.ts'))).toEqual([]);
    for (const path of [
      'apps/studio/src/routes/deck.$deckId.tsx',
      'apps/studio/src/routes/present.$deckId.tsx',
    ]) {
      const imports = runtimeImports(read(path));
      expect(imports, path).toContain('../components/agent-search');
      expect(imports, path).not.toContain('../components/useStudioSession');
    }
  });

  it('server/write.ts exports nothing that names the realtime protocol or the identity marks', () => {
    const write = read('apps/studio/src/server/write.ts');
    expect(runtimeImports(write)).not.toContain('@turboslide/realtime/protocol');
    expect(write).not.toMatch(/^export (?:async )?function (?:ownIdentityOf|peopleOf)\b/m);
    expect(runtimeImports(read('apps/studio/src/server/origins.ts'))).toContain(
      '@turboslide/realtime/protocol',
    );
  });

  it('the refused page and the template copy read a slug from the module without zod', () => {
    expect(runtimeImports(read('packages/schema/src/slug.ts'))).toEqual([]);
    for (const path of [
      'apps/studio/src/routes/-refused-page.tsx',
      'apps/studio/src/server/templates.ts',
    ]) {
      const imports = runtimeImports(read(path));
      expect(imports, path).toContain('@turboslide/schema/slug');
      expect(imports, path).not.toContain('@turboslide/schema/ids');
    }
  });

  it("the editor's skeleton reads the default menu titles, not the menu model", () => {
    const imports = runtimeImports(read('apps/studio/src/components/EditorSkeleton.tsx'));
    expect(imports).toEqual(['@turboslide/chrome/menus/default-titles']);
    expect(runtimeImports(read('packages/chrome/src/menus/default-titles.ts'))).toEqual([]);
  });
});

/* hardening HR-PC#1 (PERF-10): the icon set drew its three shape glyphs with the schema's
   `shapePath`, so every page that drew an icon fetched the 221 KB shape table (`shapes-*.js`,
   234,190 B on the node-server build of f7e97039) after load: /docs, /decks, the viewer and the
   presenter. The glyphs are constants now, and __tests__/icons.test.ts holds them equal to
   `shapePath(kind, 16, 12)`. */
describe('the shape table stays out of the pages that draw icons', () => {
  it('the icon set reaches no shape definitions and no schema module', () => {
    const graph = runtimeGraph('packages/chrome/src/icons.tsx');
    expect(graph.has('packages/schema/src/shapes/definitions.ts')).toBe(false);
    expect(graph.has('packages/schema/src/shapes.ts')).toBe(false);
    expect([...graph].filter((path) => path.startsWith('packages/schema/'))).toEqual([]);
  });

  it('the walk follows the import that would bring it back', () => {
    expect(
      runtimeGraph('packages/schema/src/shapes.ts').has(
        'packages/schema/src/shapes/definitions.ts',
      ),
    ).toBe(true);
  });
});

/* hardening HR-PC#2 (PERF-9): /decks preloaded 698,800 B against its 600,000 B ceiling and /docs
   618,407 B against 450,000 on the node-server build of f7e97039. The chunk every route loads held
   the dither pipeline (the router registers the worker factory), the 25 KB strings file (the page
   titles of the route files read `HOME` and `TITLE_ROW`) and the sign in gallery's states (an
   export of its route file); /decks loaded the 4,000 line menu model and its key tables for one
   constant and the menu's context readers; every page that drew an icon loaded the whole 51 KB
   icon table. */
const ICON_BASE_PAGES = [
  'packages/chrome/src/Menu.tsx',
  'packages/chrome/src/Select.tsx',
  'packages/chrome/src/Dialog.tsx',
  'packages/chrome/src/Snackbar.tsx',
  'apps/studio/src/routes/decks.index.tsx',
  'apps/studio/src/routes/decks.trash.tsx',
  'apps/studio/src/routes/decks.templates.tsx',
  'apps/studio/src/components/docs/CopyPage.tsx',
  'apps/studio/src/components/docs/CopyPageMenu.tsx',
  'apps/studio/src/components/docs/DocsShell.tsx',
  'apps/studio/src/components/docs/SearchWindow.tsx',
  'apps/studio/src/components/docs/mdx.tsx',
];
/** The glyph names a module names in source: `<Icon name="x">`, `icon: 'x'`, `icon('x')`, a `Record<string, IconName>` value, a `?? 'x'` fallback in an `Icon`. */
function glyphNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/<Icon\s+name=\{?\s*["']([a-z0-9-]+)["']/g)) names.add(m[1]);
  for (const m of source.matchAll(/\bicon(?::\s*|\(\s*)'([a-z0-9-]+)'/g)) names.add(m[1]);
  for (const m of source.matchAll(/<Icon\s+name=\{[^}]*\?\?\s*'([a-z0-9-]+)'\s*\}/g))
    names.add(m[1]);
  for (const m of source.matchAll(/Record<string, IconName> = \{([^}]*)\}/g)) {
    for (const v of m[1].matchAll(/:\s*'([a-z0-9-]+)'/g)) names.add(v[1]);
  }
  return names;
}

describe('the pages outside the editor load the parts of the chrome they draw', () => {
  it('the router registers the dither worker without the dither pipeline', () => {
    const router = runtimeImports(read('apps/studio/src/router.tsx'));
    expect(router).toContain('@turboslide/viewer/dither-factory');
    expect(router).not.toContain('@turboslide/viewer/dither');
    expect(runtimeImports(read('packages/viewer/src/dither-factory.ts'))).toEqual([]);
  });

  it('a menu reads its context and its chord labels without the menu table and the key tables', () => {
    const graph = runtimeGraph('packages/chrome/src/Menu.tsx');
    for (const path of [
      'packages/chrome/src/menus/model.ts',
      'packages/chrome/src/menus/keys.ts',
      'packages/chrome/src/icons.tsx',
    ]) {
      expect(graph.has(path), path).toBe(false);
    }
    expect(graph.has('packages/chrome/src/menus/context.ts')).toBe(true);
    expect(graph.has('packages/chrome/src/menus/chords.ts')).toBe(true);
    for (const path of [
      'packages/chrome/src/menus/context.ts',
      'packages/chrome/src/menus/chords.ts',
    ]) {
      expect(runtimeImports(read(path)), path).not.toContain('./model.ts');
    }
  });

  it('the decks pages take the default menu context from the module without the model', () => {
    for (const path of [
      'apps/studio/src/routes/decks.index.tsx',
      'apps/studio/src/routes/decks.templates.tsx',
    ]) {
      const imports = runtimeImports(read(path));
      expect(imports, path).toContain('@turboslide/chrome/menus/context');
      expect(imports, path).not.toContain('@turboslide/chrome/menus/model');
    }
  });

  it('the page titles read the page words, a module without imports, not the strings file', () => {
    expect(runtimeImports(read('packages/chrome/src/menus/page-words.ts'))).toEqual([]);
    expect(runtimeImports(read('packages/chrome/src/menus/strings.ts'))).toContain(
      './page-words.ts',
    );
    for (const path of [
      'apps/studio/src/routes/new.tsx',
      'apps/studio/src/routes/decks.index.tsx',
      'apps/studio/src/routes/decks.templates.tsx',
      'apps/studio/src/routes/decks.trash.tsx',
    ]) {
      expect(runtimeImports(read(path)), path).toContain('@turboslide/chrome/menus/page-words');
    }
    // the trash, the gallery and the new page import nothing else of the strings file
    for (const path of [
      'apps/studio/src/routes/new.tsx',
      'apps/studio/src/routes/decks.templates.tsx',
      'apps/studio/src/routes/decks.trash.tsx',
    ]) {
      expect(runtimeImports(read(path)), path).not.toContain('@turboslide/chrome/menus/strings');
    }
  });

  it('the sign in gallery exports its route alone, so its states stay in its own chunk', () => {
    const exports = [
      ...read('apps/studio/src/routes/dev.auth.tsx').matchAll(
        /^export\s+(?:const|function|let)\s+(\w+)/gm,
      ),
    ].map((m) => m[1]);
    expect(exports).toEqual(['Route']);
  });

  it('the shared controls and the pages outside the editor draw from the icon base', () => {
    const base = read('packages/chrome/src/icons-base.tsx');
    const table = base.slice(
      base.indexOf('export const BASE_ICON_PATHS'),
      base.indexOf('} as const'),
    );
    const baseNames = new Set(
      [...table.matchAll(/^ {2}(?:'([a-z0-9-]+)'|([a-z0-9]+)): \[/gm)].map((m) => m[1] ?? m[2]),
    );
    expect(baseNames.size).toBeGreaterThan(20);
    expect(runtimeImports(base)).toEqual([]);
    for (const path of ICON_BASE_PAGES) {
      const source = read(path);
      const imports = runtimeImports(source);
      expect(imports, path).not.toContain('@turboslide/chrome/icons');
      expect(imports, path).not.toContain('./icons');
      const missing = [...glyphNames(source)].filter((name) => !baseNames.has(name));
      expect(missing, path).toEqual([]);
    }
    for (const path of [
      'packages/chrome/src/Dialog.tsx',
      'packages/chrome/src/Select.tsx',
      'packages/chrome/src/Snackbar.tsx',
      'apps/studio/src/components/docs/DocsShell.tsx',
    ]) {
      expect(runtimeGraph(path).has('packages/chrome/src/icons.tsx'), path).toBe(false);
    }
  });

  it('every module that draws from the icon base is one of the pages above', () => {
    const importers = [];
    for (const dir of ['packages/chrome/src', 'apps/studio/src']) {
      for (const path of walkSources(dir)) {
        const imports = runtimeImports(read(path));
        if (imports.includes('./icons-base') || imports.includes('@turboslide/chrome/icons-base')) {
          importers.push(path);
        }
      }
    }
    const outside = importers.filter(
      (path) => path !== 'packages/chrome/src/icons.tsx' && !ICON_BASE_PAGES.includes(path),
    );
    expect(outside).toEqual([]);
    expect(importers.length).toBeGreaterThan(8);
  });
});
