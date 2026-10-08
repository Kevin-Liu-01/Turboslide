// The browser's zod jitless flag, without zod (polish two, P2-V1.4 finding 6; SPEC-4 3.12).
//
// zod's JIT compiles object parsers with the Function constructor and probes for it with
// `new Function("")`; a page under the studio's script-src policy reports both as `eval` on every
// parse (docs/archive/rounds/POLISH.md item 112: the polish round's verifier read two to four CSP
// reports a page, and the fix round captured every one as script-src / eval from zod's util and
// its compiled parser). The browser runs zod jitless; the server keeps the JIT.
//
// zod 4.6 keeps its configuration on `globalThis.__zod_globalConfig` (v4/core/core.js: it adopts
// the object when one is there and creates it otherwise), and an object schema reads `jitless`
// when it is constructed. This module writes the flag onto that object, so it needs no import of
// zod: it is the studio root route's first import (apps/studio/src/routes/__root.tsx), which sets
// the flag before any module that builds a schema runs, and zod stays out of the chunk every route
// loads. Off the window (the server, the CLI, the workers) it does nothing.
type ZodGlobal = { __zod_globalConfig?: Record<string, unknown> };

if (typeof window !== 'undefined') {
  const holder = globalThis as ZodGlobal;
  holder.__zod_globalConfig ??= {};
  holder.__zod_globalConfig.jitless = true;
}

export {};
