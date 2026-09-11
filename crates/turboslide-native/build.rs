// The napi addon needs the linker flags napi-build sets (`-undefined dynamic_lookup` on macOS,
// `-z nodelete` on glibc). Cargo exposes enabled features to build scripts as
// CARGO_FEATURE_<NAME>, so the wasm build and `cargo test` skip this.
fn main() {
    println!("cargo::rerun-if-changed=build.rs");
    if std::env::var_os("CARGO_FEATURE_NAPI").is_some() {
        napi_build::setup();
    }
}
