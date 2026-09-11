# wasm/

Build output of `pnpm --filter @turboslide/native build` (or `build:wasm`): `turboslide_native.js`
(the `wasm-bindgen --target web` glue), `turboslide_native_bg.wasm`, and their `.d.ts` files. They
are git-ignored; this README is the only tracked file here. `docs/native.md` describes the build,
the targets and when the module is used.
