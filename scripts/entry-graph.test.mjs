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
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
