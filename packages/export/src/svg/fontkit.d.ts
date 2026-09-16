// The declaration fontkit 2.0.4 ships without (gslides-parity SPEC-5 6.4; the outline text mode):
// the one entry the SVG writer calls, `create(bytes)`, typed loosely here and narrowed in
// svg/fonts.ts to the members it reads (unitsPerEm, ascent, descent, layout). The package's Node
// build exports it as a default member, the browser build vite serves under vitest as a named one.
declare module 'fontkit' {
  export function create(buffer: Buffer | Uint8Array): unknown;
  const fontkit: { create: typeof create };
  export default fontkit;
}
