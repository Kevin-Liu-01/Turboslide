# @turboslide/native

The loader for `crates/turboslide-native` (SPEC 10): the napi addon under `npm/<platform>/` or
the wasm-bindgen module under `wasm/`, presented as one `NativeModule` (`src/types.ts`).
`@turboslide/effects` selects the addon, then the wasm module, then its own TypeScript through
`packages/effects/src/select.ts`; nothing in the CLI or the studio depends on a build being present.

- `pnpm --filter @turboslide/native build` builds both for this machine; `build:napi` and
  `build:wasm` build one. The script skips with a message when cargo, the `wasm32-unknown-unknown`
  target or `wasm-bindgen` is missing, so `turbo run build` passes on a checkout without Rust.
- Two outputs are committed build products since the Google Slides parity round four
  (`docs/gslides-parity/SPEC-4.md` 0.38): the wasm module under `wasm/` (the glue, the `.wasm`
  and the two `.d.ts` files) and the Linux x64 glibc addon
  `npm/linux-x64-gnu/turboslide-native.linux-x64-gnu.node`, which the Vercel function loads. Every
  other platform's `.node` file stays git-ignored; `Cargo.lock` is committed.
- A committed output changes only in a commit that also carries the CI job's rebuild record
  (`.github/workflows/native.yml` builds against a glibc floor of 2.28; `BUILD-RECORD.json` holds
  the run id and the sha256 per file, written by the round's builder). `pnpm check` step 29
  rebuilds and diffs the wasm module when cargo is present. Edit the crate and rebuild through CI,
  never a committed output by hand.
- `docs/native.md` has the build, the declared targets, the loader order, the parity results, what
  runs where on a checkout, in the function and in the browser, the round four rule and the
  licensing note on DSSIM.
