# The native module

`crates/turboslide-native` is the Rust crate of SPEC 10: the two-tone pipeline (Lanczos3, the tone
LUT, the filters, the 8 by 8 screen), the 1-bit PNG encoder, the exact and pixelmatch-compatible
diffs and DSSIM, behind a napi addon for Node and a wasm-bindgen module for the browser.
`packages/native` (`@turboslide/native`) loads whichever is built and presents one `NativeModule`;
`packages/effects/src/select.ts` picks the addon, then the wasm module, then the TypeScript stages
of the effects package, and `twoTone`, `twoToneScreen`, `diffExact`, `diffPixelmatch` and `dssim`
in `@turboslide/effects` run on whatever was picked. Nothing in the CLI, the studio or the render
worker needs a build to be present (MILESTONES M5 item 6). Written by the crate builder on
2026-09-10 on the M5 tree; every number below is from that machine (Apple M5 Max, macOS, Node
24.13.0, rustc 1.98.1, wasm-bindgen 0.2.128), deck revision 13.

## Why a native module

The slides experiment measured that Rust buys no throughput for this work (SPEC 10: PNG decode
dominates, the dither is 5 to 9 ms in plain JavaScript). The argument is determinism: three
Lanczos implementations disagreed on about 120 of 1.44 million cells, and a designer approving a
dither in the browser and an exporter producing it on a server must run the same arithmetic. So the
crate is not a faster pipeline; it is the same pipeline, operation for operation, compiled for
three places (Node addon, browser worker, TypeScript fallback), with a test that measures whether
they light the same cells.

## Layout

```
crates/turboslide-native/
  Cargo.toml          features napi (napi-rs 3) and wasm (wasm-bindgen 0.2.128); none on by default
  Cargo.lock          committed; the dependency tree is in THIRD_PARTY_NOTICES.md
  build.rs            napi-build's linker flags, only when the napi feature is on
  src/lib.rs          two_tone_screen, two_tone, parse_plate, parse_palette; the module list
  src/jsmath.rs       Math.round, Python round, ToUint8, V8's Math.hypot, Number(x.toFixed(4))
  src/tone.rs         luma, channel pick, invert, autocontrast, the tone LUT
  src/resample.rs     Pillow's Lanczos3, the padded crop, the cover box, nearest upscale
  src/filters.rs      Gaussian blur, minimum filter, unsharp band (the effects definitions)
  src/bayer.rs        the deck's permutation, the thresholds, the dither
  src/png1.rs         1-bit PNG with miniz_oxide, own CRC
  src/diff.rs         exact diff; the pixelmatch 7.2.0 port
  src/dssim.rs        multi-scale SSIM (see DSSIM below)
  src/metrics.rs      lit fraction, plate clearance, the warning strings
  src/params.rs       the treatment JSON (serde, unknown fields ignored, null reads as absent)
  src/bind_napi.rs    #[napi] functions and object structs
  src/bind_wasm.rs    #[wasm_bindgen] functions and readonly result classes
  tests/pillow.rs     byte parity with Pillow through packages/effects/fixtures
packages/native/
  package.json        scripts build, build:napi, build:wasm; optionalDependencies per platform
  turbo.json          build is never cached (its inputs live in crates/)
  scripts/build.mjs   cargo build, rename the cdylib to .node, wasm-bindgen --target web
  src/types.ts        NativeModule, the shape both bindings present
  src/platform.ts     the declared platforms, their triples, libc detection
  src/node.ts         loadNativeAddon, loadWasmNode, describeNative (Node only)
  src/wasm.ts         wrapWasmModule, initWasmSync (environment free)
  npm/<platform>/     one package.json per declared platform; the .node file is git-ignored
  wasm/               turboslide_native.js, turboslide_native_bg.wasm and .d.ts; git-ignored
packages/effects/src/
  backend.ts          EffectsBackend; typescriptBackend(); backendFromNative(module)
  select.ts           selectBackend, getBackend, setBackend, describeBackends (Node only)
  pipeline.ts         twoToneScreenTypeScript, the reference stage order
  pixelmatch.ts       the npm pixelmatch as the TypeScript perceptual diff
  dssim.ts            DSSIM in TypeScript, the same definition as dssim.rs
  parity.test.ts      the cell-identity test
```

## Building

Prerequisites: Rust 1.85 or later (`rustup`), the `wasm32-unknown-unknown` target
(`rustup target add wasm32-unknown-unknown`) and `wasm-bindgen-cli` at exactly the version of the
`wasm-bindgen` crate in `Cargo.toml` (`cargo install wasm-bindgen-cli --version 0.2.128 --locked`).
On this machine the target and the CLI were installed on 2026-09-10; the CLI compiled in about
three minutes.

```
cargo test --manifest-path crates/turboslide-native/Cargo.toml   # 37 unit tests plus 6 Pillow parity tests
pnpm --filter @turboslide/native build                            # the addon for this machine and the wasm module
pnpm --filter @turboslide/native build:napi                       # the addon only
pnpm --filter @turboslide/native build:wasm                       # the wasm module only
node packages/native/scripts/build.mjs --target aarch64-unknown-linux-gnu   # a cross build (CI)
```

The addon is `cargo build --release --features napi` with the cdylib copied to
`packages/native/npm/<platform>/turboslide-native.<platform>.node` (771,968 bytes for
darwin-arm64). The wasm module is `cargo build --release --target wasm32-unknown-unknown --features
wasm` followed by `wasm-bindgen --target web --out-dir packages/native/wasm --out-name
turboslide_native` (273,863 bytes of wasm plus 23 KB of glue). With nothing changed the script
finishes in about 0.3 s (cargo finds the artifacts current); a rebuild after a source edit takes a
few seconds under `lto` and `codegen-units = 1`; the first build compiled the 50 dependency crates
in about 32 seconds.

The build script is what the napi-rs CLI would run, done in 150 lines so the build has no npm
dependency and `@napi-rs/cli` is not in the lockfile. `turbo run build` includes the package; the
script exits 0 with a message when cargo, the wasm target or `wasm-bindgen` is missing (`--strict`
or `TURBOSLIDE_NATIVE_STRICT=1` makes that an error), so `pnpm check` step 6 passes on a checkout
without Rust and the effects package stays on TypeScript there. A failing `cargo build` is always
an error. Build outputs are git-ignored (`crates/*/target`, `*.node`, `packages/native/wasm/*`
except its README).

## Targets

| Key                | Triple                       | Built                                  |
| ------------------ | ---------------------------- | -------------------------------------- |
| `darwin-arm64`     | `aarch64-apple-darwin`       | here, 2026-09-10                       |
| `darwin-x64`       | `x86_64-apple-darwin`        | declared; the release CI matrix builds |
| `linux-x64-gnu`    | `x86_64-unknown-linux-gnu`   | declared; CI                           |
| `linux-arm64-gnu`  | `aarch64-unknown-linux-gnu`  | declared; CI                           |
| `linux-x64-musl`   | `x86_64-unknown-linux-musl`  | declared; CI                           |
| `linux-arm64-musl` | `aarch64-unknown-linux-musl` | declared; CI                           |
| `win32-x64-msvc`   | `x86_64-pc-windows-msvc`     | declared; CI                           |
| wasm               | `wasm32-unknown-unknown`     | here, 2026-09-10                       |

Each key is a package `@turboslide/native-<key>` under `packages/native/npm/<key>` with `os`,
`cpu` and (on Linux) `libc` fields, declared as an `optionalDependency` of `@turboslide/native`
with `workspace:*`, as SPEC 10 describes (napi-rs's layout, so a later move to its CLI keeps the
names). pnpm links only the package for the running platform. The loader tries the package first
and the local `npm/<key>/` file second, so a local build works before the workspace is
re-installed. SPEC 3.1 lists `packages/native/npm/*` among the workspace globs; the integrator adds
that line to `pnpm-workspace.yaml` and runs the install (the crate builder does not install).

## Loading order and how to pin it

`getBackend()` in `packages/effects/src/select.ts` resolves once per process:

1. the napi addon for `platformKey()` (`process.platform`, `process.arch`, glibc or musl from
   `process.report`), through `require` of the platform package or the local file;
2. the wasm module, through `require` of the `--target web` glue (Node 22.12 and later load an
   ESM file without top-level await synchronously) and `initSync({ module: bytes })`;
3. the TypeScript stages of the effects package.

`TURBOSLIDE_EFFECTS_BACKEND=native|wasm|typescript|auto` pins the choice; naming a backend that is
not built throws with the loader's attempts in the message rather than falling back silently.
`setBackend()` overrides it in code; `describeBackends()` reports the selection and what each loader
tried. `TwoToneResult.backend` names which implementation cut a screen.

A browser worker cannot use select.ts (it imports Node loaders). It imports the glue Vite serves,
awaits `init(url)`, and builds a backend with `backendFromNative(wrapWasmModule(glue))` from
`@turboslide/native/wasm` and `@turboslide/effects/backend`. The dither preview worker in
`apps/studio/src/workers/dither.worker.ts` still composes the TypeScript stages itself (M3); moving
it onto the wasm module is the studio builder's change, and the parity test is what makes it safe.

## What runs where

- Node (CLI, studio server, render worker): the addon when built, the wasm module when only that
  is built, TypeScript otherwise. The render worker's Docker image is unchanged this round and
  runs the TypeScript stages; the parity test is the argument that its twins are the addon's.
- The screen (every stage through the dither) is the part that crosses to the native module.
  Polarity, the nearest upscale, the 1-bit PNG encoder and the plate metrics stay in TypeScript in
  `two-tone.ts`: they are integer operations that cannot disagree, and keeping the PNG encoder on
  `node:zlib` means a regenerated twin has the same bytes on every backend. The crate's own
  `two_tone` (twins, PNGs through miniz_oxide, metrics) exists for the wasm worker and standalone
  use; its PNG bytes decode to the same cells but are not byte-identical to the TypeScript
  encoder's (3,815 against 3,845 bytes on the opener fixture; different deflate implementations).
- `diffPixelmatch` and `dssim` go to the native module when present; the verify loop in
  `packages/export` reaches them through `@turboslide/effects/diff`, with `cropRgba` from
  `@turboslide/effects/image` for per-block gates. Wiring dssim into the export report is the
  native PPTX builder's change.

## Parity results

`pnpm exec vitest run packages/effects/src/parity.test.ts` (25 tests, 7.7 s, addon and wasm both
loaded; `TURBOSLIDE_NATIVE_REQUIRED=1` fails instead of skipping when a build is missing). The run
writes `.turboslide/parity/report.json`. Measured 2026-09-10:

| Check                                                                                                 | Compared                                           | Disagreements              |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------- |
| Two-tone screen on the 15 deck two-tone assets from their recorded treatments, napi and wasm          | 30 screens, 360,000 cells each, and the tone image | 0 cells, 0 tone bytes      |
| `two_tone` metrics (lit fraction, plate clearance, warnings) against `twoToneMetrics`                 | 30                                                 | 0                          |
| The committed two-tone golden (fixtures/two-tone) at sheet size, TypeScript, napi, wasm               | 3 by 1,440,000 cells                               | 0                          |
| Pillow stage fixtures (gray, red, crop, resize down and up, fit, autocontrast, tone, dither, nearest) | `cargo test`, 6 tests                              | 0 bytes                    |
| Tone LUTs: 151 gammas (0.50 to 2.00 plus the deck's) by 14 black and white pairs, both bindings       | 4,228 LUTs                                         | 0                          |
| Lanczos tap tables for the cover fit of every deck crop plus 3200 to 800 and the fixture boxes        | 68 tables                                          | 0                          |
| Gaussian kernels for sigma 0.4, 0.5, 0.6, 1, 2, 8                                                     | 12                                                 | 0                          |
| pixelmatch port: 6 pairs by 4 option sets, count and diff image bytes against the npm package         | 48                                                 | 0                          |
| 1-bit PNG: the crate's encoder decoded against the TypeScript encoder's cells                         | 2 (gray and palette)                               | 0 cells                    |
| DSSIM against dssim.ts on 5 pairs                                                                     | 10                                                 | within 3.2e-15 (see below) |

Inputs. The source photographs and renders of the fifteen assets are not on disk (the
`scratchpad/photo` copies named in `Asset.source` were cleared on 2026-09-10), so each asset's own
dark twin JPEG at 1600 by 900 is the input, run through the recorded treatment: this exercises the
crop with padding (mood-earth's box reaches past the picture), the red channel pick, invert, blur
at 0.4 to 2, the minimum filter, the unsharp band and every gamma the deck uses, on real tonal
content. `TURBOSLIDE_TWO_TONE_SOURCES=<dir>` with `<assetId>.png|jpg` files runs the originals
instead; the report's `input` column says which was used. The result is agreement between
implementations, which is what SPEC 10 asks; agreement with the approved twins themselves is the
`asset dither --from-recorded --verify-cells` acceptance line (M5 item 2), which needs the sources.

Why it agrees. Every stage that reaches a cell is integer arithmetic or floating point in an order
the Rust writes exactly as the TypeScript does, and the three transcendental functions on that path
(`sin` in the Lanczos kernel, `exp` in the Gaussian kernel, `pow` in the tone LUT) come from the
`libm` crate, whose implementations are ports of the same FreeBSD msun (fdlibm) sources that V8's
`base::ieee754` ports. On the addon the crate never calls Apple's libm, and on wasm the same crate
is the only libm, so native and wasm agree by construction. JavaScript's rounding rules are
reproduced where they differ from Rust's (`Math.round` ties toward positive infinity in the crop
edges and the blur, Python's half-even in the LUT, `Uint8Array` storage modulo 256, V8's Kahan
`Math.hypot` in the plate metrics, `Number(x.toFixed(4))` on the exact double for the lit
fraction).

The one measured disagreement: DSSIM differs between TypeScript and Rust by up to 3.1e-15 relative
(twin against inverse twin at 320 by 180: 1.6011422433686784 against 1.6011422433686815; three of
five pairs agree to the bit). The cause is `cbrt` in the L\*a\*b\* conversion: `libm` 0.2.16
replaced its fdlibm `cbrt` with the correctly rounded CORE-MATH port in 2025, while V8's
`Math.cbrt` is still fdlibm's `s_cbrt.c`, and the two differ in the last bit for some inputs. No
cell stage uses `cbrt`, so the cells are unaffected; the test allows 1e-9 relative on the score and
records the deltas. Making the two bit-identical would mean porting fdlibm's `cbrt` into the crate
(about 60 lines) or shipping the CORE-MATH version in dssim.ts; neither was done because a
perceptual gate is compared with a threshold, not for identity.

## DSSIM

SPEC 10 names the `dssim` crate for the text gate. That crate is AGPL-3.0-or-later; linking it
would place the addon and the wasm module under the AGPL, which the provisional MIT license (SPEC
open question 14) does not allow without Kevin's decision, so the crate is not used and the
question is recorded here and in `THIRD_PARTY_NOTICES.md`. `dssim.rs` and `dssim.ts` are
Turboslide's own multi-scale SSIM, written from the published method:

1. sRGB bytes to linear light (IEC 61966-2-1), to CIE XYZ (D65) and CIE L\*a\*b\*; alpha ignored;
   channels scaled to L / 100, (a + 128) / 255, (b + 128) / 255.
2. Per scale, SSIM per channel with an 11-tap Gaussian window (sigma 1.5, normalized, separable,
   edges replicate), C1 = 0.01^2 and C2 = 0.03^2 on a data range of 1, the mean of the map;
   channels combine as (L + 0.5 a + 0.5 b) / 2.
3. Up to five scales by 2 by 2 box downsampling while both sides stay at least 11 px, weighted
   0.0448, 0.2856, 0.3001, 0.2363, 0.1333 (Wang, Simoncelli and Bovik 2003), renormalized over the
   scales that exist.
4. dssim = 1 / ssim - 1, with ssim floored at 1e-6; 0 for identical images.

Measured on the mood-wave twins at 320 by 180: identical 0; the dark twin against its inverse
1.601; a one-pixel horizontal shift of a dither 0.0591; the 137 by 91 Pillow fixture against a
one-pixel shift 0.1517. The thresholds for text blocks are the native PPTX builder's calibration.
The score is not numerically comparable with the `dssim` tool's output, which uses different
weights and a different color model.

## Costs

Measured on the mood-wave twins (1600 by 900 JPEGs) after a warm-up call, on the M5 Max:

| Operation                          | TypeScript | napi addon | wasm     |
| ---------------------------------- | ---------- | ---------- | -------- |
| Two-tone screen, 1600 by 900 input | 52 ms      | 20 ms      | 23 ms    |
| pixelmatch, 1600 by 900 pair       | 208 ms     | 153 ms     | 233 ms   |
| DSSIM, 1600 by 900 pair            | 1,849 ms   | 1,275 ms   | 2,019 ms |
| DSSIM, 400 by 225 crop             | 119 ms     | 86 ms      | 120 ms   |

Crossing to the addon copies nothing in (napi reads the typed array in place) and copies the
results out once (360,000 bytes of cells and 360,000 of tone). The wasm glue copies the RGBA input
into wasm memory (5.8 MB for a 1600 by 900 picture) and the results out, which is where its margin
over TypeScript goes. DSSIM is fifteen separable 11-tap blurs per scale on f64 planes and is not
tuned in either language, so the verify loop should crop to blocks before scoring; a text block of
400 by 225 scores in under 120 ms on every backend. As SPEC 10 measured, speed is not the reason
for the module; the parity run of fifteen assets through three implementations took 7.2 s of test
time including the JPEG decodes.

## Open items

- `pnpm-workspace.yaml` needs `packages/native/npm/*` and the root `tsconfig.json` a
  `packages/native` reference (the effects reference pulls it into `tsc -b` already); the
  integrator runs `pnpm install` for the new `@turboslide/native` and `pixelmatch` dependencies of
  `@turboslide/effects` and the optional platform packages.
- `tooling/eslint-config/index.js` should ignore `packages/native/wasm/**` (generated glue) and
  `crates/**`; without that `pnpm lint` parses the wasm-bindgen output on a machine that built it.
- The release CI matrix that builds the six other targets does not exist yet (SPEC 10: "CI builds
  the native matrix only on tagged releases").
- The dither preview worker still runs the TypeScript stages; the wasm module is built and wrapped
  for it but not mounted.
- Wiring `dssim` into `ExportReport.verify` as the text gate, with calibrated thresholds, is the
  native PPTX builder's change; the API is `dssim(cropRgba(ref, box), cropRgba(got, box))`.
- The parity test reads the twins as inputs until the source photographs are restored or pointed at
  with `TURBOSLIDE_TWO_TONE_SOURCES`.
