import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The landing's module graph (docs/SITE.md D1, D11, G.2): every module /home's route reaches
// through runtime imports, walked from the source (type imports are erased; dynamic imports are
// chunks of their own). The page never reaches the editor (its controller, its root, the shell or
// the viewer's editor: the live editor arrives in a frame of its own document), the action
// table's schemas, the shape definitions behind the icon table, or the old landing's modules.

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..', '..', '..');
const rel = (path: string): string => path.slice(ROOT.length + 1);

/** Each workspace package's name and folder, for its `exports` map. */
const packages = new Map<string, { dir: string; exports: Record<string, string> }>();
for (const name of readdirSync(join(ROOT, 'packages'))) {
  const file = join(ROOT, 'packages', name, 'package.json');
  if (!existsSync(file)) continue;
  const json = JSON.parse(readFileSync(file, 'utf8')) as {
    name: string;
    exports?: Record<string, string>;
  };
  packages.set(json.name, { dir: join(ROOT, 'packages', name), exports: json.exports ?? {} });
}

/** The runtime import specifiers of a module, side effect imports included. */
function runtimeImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/^(?:import|export)\s+(type\s+)?[\s\S]*?from\s+'([^']+)';/gm))
    if (m[1] === undefined && m[2] !== undefined) out.push(m[2]);
  for (const m of source.matchAll(/^import\s+'([^']+)';/gm)) if (m[1] !== undefined) out.push(m[1]);
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const bare = spec.replace(/\?.*$/, '');
  if (bare.startsWith('.')) {
    const base = resolve(dirname(from), bare);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    return null;
  }
  const match = /^(@turboslide\/[^/]+)(\/.*)?$/.exec(bare);
  if (match === null) return null;
  const pkg = packages.get(match[1] ?? '');
  if (pkg === undefined) return null;
  const target = pkg.exports[`.${match[2] ?? ''}`];
  return target === undefined ? null : join(pkg.dir, target);
}

function walk(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(?:ts|tsx|mts)$/.test(file)) continue;
    for (const spec of runtimeImports(readFileSync(file, 'utf8'))) {
      if (spec.includes('?url')) continue;
      const next = resolveImport(file, spec);
      if (next !== null) queue.push(next);
    }
  }
  return seen;
}

const graph = [...walk(join(ROOT, 'apps/studio/src/routes/home.tsx'))].map(rel);

describe("the landing's module graph", () => {
  it('reaches the site components and the chrome modules it draws', () => {
    expect(graph).toContain('apps/studio/src/components/site/Hero.tsx');
    expect(graph).toContain('apps/studio/src/components/site/AvatarStack.tsx');
    expect(graph).toContain('packages/chrome/src/presence/agent-marks.tsx');
    expect(graph).toContain('packages/chrome/src/icons.tsx');
  });

  it('never reaches the editor, the action table, the shape definitions or the old landing', () => {
    const forbidden = graph.filter(
      (file) =>
        file.startsWith('apps/studio/src/editor/') ||
        file.startsWith('apps/studio/src/try/') ||
        file === 'packages/chrome/src/EditorShell.tsx' ||
        file === 'packages/viewer/src/Editor.tsx' ||
        file === 'packages/schema/src/actions.ts' ||
        file === 'packages/schema/src/shapes.ts' ||
        file.startsWith('packages/schema/src/shapes/') ||
        (file.startsWith('apps/studio/src/components/home/') &&
          file !== 'apps/studio/src/components/home/sign-in.tsx'),
    );
    expect(forbidden).toEqual([]);
  });
});
