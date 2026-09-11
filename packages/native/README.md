# @turboslide/native

The loader for `crates/turboslide-native` (SPEC 10): the napi addon under `npm/<platform>/` or
the wasm-bindgen module under `wasm/`, presented as one `NativeModule` (`src/types.ts`).
`@turboslide/effects` selects the addon, then the wasm module, then its own TypeScript through
`packages/effects/src/select.ts`; nothing in the CLI or the studio depends on a build being present.

- `pnpm --filter @turboslide/native build` builds both for this machine; `build:napi` and
  `build:wasm` build one. The script skips with a message when cargo, the `wasm32-unknown-unknown`
  target or `wasm-bindgen` is missing, so `turbo run build` passes on a checkout without Rust.
- Build outputs (`npm/*/*.node`, `wasm/turboslide_native*`) are git-ignored; `Cargo.lock` is committed.
- `docs/native.md` has the build, the declared targets, the loader order, the parity results and
  the licensing note on DSSIM.
