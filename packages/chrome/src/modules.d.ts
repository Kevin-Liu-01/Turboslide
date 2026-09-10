// Side-effect CSS imports (one small CSS file per component, SPEC 3.3 item 6) need a module
// shape under noUncheckedSideEffectImports. Vite serves them; the standalone build inlines them.
declare module '*.css';
