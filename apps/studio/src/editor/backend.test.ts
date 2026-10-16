import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { serverBackend } from './backend-server';

// The editor's one seam to the server (docs/SITE.md D2; backend.ts): the editor's files reach the
// server's functions, the room's wire, the IndexedDB mirror and the page's own requests only
// through the bound backend. Read from the source, as scripts/entry-graph.test.mjs reads it: type
// imports are erased and allowed; a runtime import of ../server/ or ./transport is the server
// backend's alone.

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string): string => readFileSync(join(here, path), 'utf8');

/** The runtime import specifiers of a module, re-exports included. */
function runtimeImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/^(?:import|export)\s+(type\s+)?[\s\S]*?from\s+'([^']+)';/gm))
    if (m[1] === undefined && m[2] !== undefined) out.push(m[2]);
  return out;
}

const EDITOR_FILES = ['controller.tsx', 'EditorRoot.tsx', 'shell-bridge.tsx', 'backend.ts'];

describe('the editor backend seam', () => {
  it('the editor files import no runtime module of the server and not the transport', () => {
    for (const file of EDITOR_FILES) {
      const imports = runtimeImports(read(file));
      expect(
        imports.filter((spec) => spec.startsWith('../server/')),
        file,
      ).toEqual([]);
      expect(imports, file).not.toContain('./transport');
    }
  });

  it('the editor files call no route of the server by its address', () => {
    for (const file of ['controller.tsx', 'EditorRoot.tsx']) {
      const source = read(file);
      expect(source, file).not.toMatch(/fetch\(\s*[`'"]\/api\//);
    }
  });

  it('the server backend is the only editor module that imports the server and the transport', () => {
    const imports = runtimeImports(read('backend-server.ts'));
    expect(imports).toContain('../server/write');
    expect(imports).toContain('./transport');
  });

  it('the server backend has every member, each a function or a flag', () => {
    expect(serverBackend.kind).toBe('server');
    expect(serverBackend.tabOnly).toBeUndefined();
    expect(serverBackend.attachesSession).toBe(true);
    expect(serverBackend.recordsRecent).toBe(true);
    expect(serverBackend.assetBase('gt-brand')).toBe('/decks/gt-brand/');
    for (const [key, value] of Object.entries(serverBackend)) {
      if (key === 'kind' || key === 'attachesSession' || key === 'recordsRecent') continue;
      expect(typeof value, key).toBe('function');
    }
  });

  it('a document binds one backend once, before the editor reads it', async () => {
    vi.resetModules();
    const fresh = await import('./backend');
    const tab = { ...serverBackend, kind: 'tab' as const };
    fresh.bindEditorBackend(tab);
    expect(fresh.editorBackend()).toBe(tab);
    expect(() => fresh.bindEditorBackend(tab)).toThrow(/already bound/);
    vi.resetModules();
    const late = await import('./backend');
    expect(late.editorBackend().kind).toBe('server');
    expect(() => late.bindEditorBackend(tab)).toThrow(/read before/);
  });
});
