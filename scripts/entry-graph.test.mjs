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
});
