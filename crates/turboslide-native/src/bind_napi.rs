//! The Node addon (feature `napi`). Function and field names are camelCase in JavaScript, which
//! napi-derive does by default; the shapes are `NativeModule` in packages/native/src/types.ts.
//! Typed arrays coming in are read in place; results are copied out once.

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::diff::PixelmatchOptions;
use crate::params::TwoToneParams;

fn reason(e: String) -> Error {
    Error::from_reason(e)
}

#[napi(object)]
pub struct ScreenResult {
    pub positive: Uint8Array,
    pub tone: Uint8Array,
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct TwoToneResult {
    pub positive: Uint8Array,
    pub tone: Uint8Array,
    pub dark_bits: Uint8Array,
    pub light_bits: Uint8Array,
    pub dark_png: Option<Uint8Array>,
    pub light_png: Option<Uint8Array>,
    pub metrics_json: String,
    pub width: u32,
    pub height: u32,
    pub cell: f64,
}

#[napi(object)]
pub struct PixelmatchResult {
    pub mismatched: u32,
    pub output: Option<Uint8Array>,
}

#[napi(object)]
pub struct DssimResult {
    pub dssim: f64,
    pub ssim: f64,
    pub scales: u32,
}

#[napi(object)]
pub struct CoeffsResult {
    pub ksize: u32,
    pub bounds: Int32Array,
    pub kk: Int32Array,
}

#[napi]
pub fn version() -> String {
    format!("{}+napi", crate::VERSION)
}

#[napi]
pub fn two_tone_screen(
    rgba: Uint8Array,
    width: u32,
    height: u32,
    params_json: String,
) -> Result<ScreenResult> {
    let params = TwoToneParams::from_json(&params_json).map_err(reason)?;
    let screen =
        crate::two_tone_screen(&rgba, width as usize, height as usize, &params).map_err(reason)?;
    Ok(ScreenResult {
        width: screen.positive.width as u32,
        height: screen.positive.height as u32,
        positive: Uint8Array::new(screen.positive.bits),
        tone: Uint8Array::new(screen.tone.data),
    })
}

#[napi]
pub fn two_tone(
    rgba: Uint8Array,
    width: u32,
    height: u32,
    params_json: String,
    plate_json: Option<String>,
    png: bool,
) -> Result<TwoToneResult> {
    let params = TwoToneParams::from_json(&params_json).map_err(reason)?;
    let plate = crate::parse_plate(plate_json.as_deref()).map_err(reason)?;
    let out = crate::two_tone(&rgba, width as usize, height as usize, &params, plate, png)
        .map_err(reason)?;
    let metrics_json = serde_json::to_string(&out.metrics).map_err(|e| reason(e.to_string()))?;
    Ok(TwoToneResult {
        width: out.dark.width as u32,
        height: out.dark.height as u32,
        cell: out.cell,
        positive: Uint8Array::new(out.screen.positive.bits),
        tone: Uint8Array::new(out.screen.tone.data),
        dark_bits: Uint8Array::new(out.dark.bits),
        light_bits: Uint8Array::new(out.light.bits),
        dark_png: out.dark_png.map(Uint8Array::new),
        light_png: out.light_png.map(Uint8Array::new),
        metrics_json,
    })
}

#[napi]
pub fn encode_png1(
    bits: Uint8Array,
    width: u32,
    height: u32,
    palette_json: Option<String>,
    level: u32,
) -> Result<Uint8Array> {
    let (w, h) = (width as usize, height as usize);
    if bits.len() != w * h {
        return Err(reason(format!(
            "bit buffer has {} cells, {}x{} needs {}",
            bits.len(),
            w,
            h,
            w * h
        )));
    }
    let palette = crate::parse_palette(palette_json.as_deref()).map_err(reason)?;
    let image = crate::image::Bits {
        width: w,
        height: h,
        bits: bits.to_vec(),
    };
    Ok(Uint8Array::new(crate::png1::encode_png1(
        &image,
        palette,
        level.min(10) as u8,
    )))
}

#[napi]
pub fn diff_exact(a: Uint8Array, b: Uint8Array) -> Result<u32> {
    if a.len() != b.len() {
        return Err(reason(format!(
            "buffers differ in length: {} and {}",
            a.len(),
            b.len()
        )));
    }
    Ok(crate::diff::diff_exact(&a, &b))
}

#[napi]
pub fn diff_pixelmatch(
    a: Uint8Array,
    b: Uint8Array,
    width: u32,
    height: u32,
    threshold: f64,
    include_aa: bool,
    want_output: bool,
    checkerboard: bool,
) -> Result<PixelmatchResult> {
    let (w, h) = (width as usize, height as usize);
    if a.len() != w * h * 4 || b.len() != w * h * 4 {
        return Err(reason(format!(
            "pixelmatch: buffers of {} and {} bytes for {}x{}",
            a.len(),
            b.len(),
            w,
            h
        )));
    }
    let r = crate::diff::pixelmatch(
        &a,
        &b,
        w,
        h,
        PixelmatchOptions {
            threshold,
            include_aa,
            checkerboard,
            output: want_output,
        },
    );
    Ok(PixelmatchResult {
        mismatched: r.mismatched,
        output: r.output.map(Uint8Array::new),
    })
}

#[napi]
pub fn dssim(a: Uint8Array, b: Uint8Array, width: u32, height: u32) -> Result<DssimResult> {
    let (w, h) = (width as usize, height as usize);
    if a.len() != w * h * 4 || b.len() != w * h * 4 {
        return Err(reason(format!(
            "dssim: buffers of {} and {} bytes for {}x{}",
            a.len(),
            b.len(),
            w,
            h
        )));
    }
    let r = crate::dssim::dssim(&a, &b, w, h);
    Ok(DssimResult {
        dssim: r.dssim,
        ssim: r.ssim,
        scales: r.scales,
    })
}

#[napi]
pub fn tone_lut(black: f64, white: f64, gamma: f64) -> Uint8Array {
    Uint8Array::new(crate::tone::tone_lut(black, white, gamma).to_vec())
}

#[napi]
pub fn lanczos_coeffs(in_size: u32, in0: f64, in1: f64, out_size: u32) -> CoeffsResult {
    let c = crate::resample::precompute_coeffs(in_size as usize, in0, in1, out_size as usize);
    CoeffsResult {
        ksize: c.ksize as u32,
        bounds: Int32Array::new(c.bounds),
        kk: Int32Array::new(c.kk),
    }
}

#[napi]
pub fn gaussian_kernel(sigma: f64) -> Float64Array {
    Float64Array::new(crate::filters::gaussian_kernel(sigma))
}

#[napi]
pub fn bayer_thresholds() -> Uint8Array {
    Uint8Array::new(crate::bayer::bayer_thresholds().to_vec())
}
