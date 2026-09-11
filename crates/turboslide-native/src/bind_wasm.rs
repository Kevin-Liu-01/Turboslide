//! The wasm module (feature `wasm`), for the editor's dither preview worker and for Node when no
//! addon is built. Names are camelCase through `js_name` so the JavaScript surface is the one
//! `NativeModule` in packages/native/src/types.ts describes for both bindings. Results are
//! wasm-bindgen classes with readonly getters; `wrapWasmModule` reads the fields once and calls
//! `free()`.

use wasm_bindgen::prelude::*;

use crate::diff::PixelmatchOptions;
use crate::params::TwoToneParams;

fn js_error(e: String) -> JsError {
    JsError::new(&e)
}

#[wasm_bindgen(getter_with_clone)]
pub struct ScreenResult {
    #[wasm_bindgen(readonly)]
    pub positive: Vec<u8>,
    #[wasm_bindgen(readonly)]
    pub tone: Vec<u8>,
    #[wasm_bindgen(readonly)]
    pub width: u32,
    #[wasm_bindgen(readonly)]
    pub height: u32,
}

#[wasm_bindgen(getter_with_clone)]
pub struct TwoToneResult {
    #[wasm_bindgen(readonly)]
    pub positive: Vec<u8>,
    #[wasm_bindgen(readonly)]
    pub tone: Vec<u8>,
    #[wasm_bindgen(readonly, js_name = darkBits)]
    pub dark_bits: Vec<u8>,
    #[wasm_bindgen(readonly, js_name = lightBits)]
    pub light_bits: Vec<u8>,
    #[wasm_bindgen(readonly, js_name = darkPng)]
    pub dark_png: Option<Vec<u8>>,
    #[wasm_bindgen(readonly, js_name = lightPng)]
    pub light_png: Option<Vec<u8>>,
    #[wasm_bindgen(readonly, js_name = metricsJson)]
    pub metrics_json: String,
    #[wasm_bindgen(readonly)]
    pub width: u32,
    #[wasm_bindgen(readonly)]
    pub height: u32,
    #[wasm_bindgen(readonly)]
    pub cell: f64,
}

#[wasm_bindgen(getter_with_clone)]
pub struct PixelmatchResult {
    #[wasm_bindgen(readonly)]
    pub mismatched: u32,
    #[wasm_bindgen(readonly)]
    pub output: Option<Vec<u8>>,
}

#[wasm_bindgen]
pub struct DssimResult {
    #[wasm_bindgen(readonly)]
    pub dssim: f64,
    #[wasm_bindgen(readonly)]
    pub ssim: f64,
    #[wasm_bindgen(readonly)]
    pub scales: u32,
}

#[wasm_bindgen(getter_with_clone)]
pub struct CoeffsResult {
    #[wasm_bindgen(readonly)]
    pub ksize: u32,
    #[wasm_bindgen(readonly)]
    pub bounds: Vec<i32>,
    #[wasm_bindgen(readonly)]
    pub kk: Vec<i32>,
}

#[wasm_bindgen]
pub fn version() -> String {
    format!("{}+wasm", crate::VERSION)
}

#[wasm_bindgen(js_name = twoToneScreen)]
pub fn two_tone_screen(
    rgba: &[u8],
    width: u32,
    height: u32,
    params_json: &str,
) -> Result<ScreenResult, JsError> {
    let params = TwoToneParams::from_json(params_json).map_err(js_error)?;
    let screen =
        crate::two_tone_screen(rgba, width as usize, height as usize, &params).map_err(js_error)?;
    Ok(ScreenResult {
        width: screen.positive.width as u32,
        height: screen.positive.height as u32,
        positive: screen.positive.bits,
        tone: screen.tone.data,
    })
}

#[wasm_bindgen(js_name = twoTone)]
pub fn two_tone(
    rgba: &[u8],
    width: u32,
    height: u32,
    params_json: &str,
    plate_json: Option<String>,
    png: bool,
) -> Result<TwoToneResult, JsError> {
    let params = TwoToneParams::from_json(params_json).map_err(js_error)?;
    let plate = crate::parse_plate(plate_json.as_deref()).map_err(js_error)?;
    let out = crate::two_tone(rgba, width as usize, height as usize, &params, plate, png)
        .map_err(js_error)?;
    let metrics_json = serde_json::to_string(&out.metrics).map_err(|e| js_error(e.to_string()))?;
    Ok(TwoToneResult {
        width: out.dark.width as u32,
        height: out.dark.height as u32,
        cell: out.cell,
        positive: out.screen.positive.bits,
        tone: out.screen.tone.data,
        dark_bits: out.dark.bits,
        light_bits: out.light.bits,
        dark_png: out.dark_png,
        light_png: out.light_png,
        metrics_json,
    })
}

#[wasm_bindgen(js_name = encodePng1)]
pub fn encode_png1(
    bits: &[u8],
    width: u32,
    height: u32,
    palette_json: Option<String>,
    level: u32,
) -> Result<Vec<u8>, JsError> {
    let (w, h) = (width as usize, height as usize);
    if bits.len() != w * h {
        return Err(js_error(format!(
            "bit buffer has {} cells, {}x{} needs {}",
            bits.len(),
            w,
            h,
            w * h
        )));
    }
    let palette = crate::parse_palette(palette_json.as_deref()).map_err(js_error)?;
    let image = crate::image::Bits {
        width: w,
        height: h,
        bits: bits.to_vec(),
    };
    Ok(crate::png1::encode_png1(
        &image,
        palette,
        level.min(10) as u8,
    ))
}

#[wasm_bindgen(js_name = diffExact)]
pub fn diff_exact(a: &[u8], b: &[u8]) -> Result<u32, JsError> {
    if a.len() != b.len() {
        return Err(js_error(format!(
            "buffers differ in length: {} and {}",
            a.len(),
            b.len()
        )));
    }
    Ok(crate::diff::diff_exact(a, b))
}

#[wasm_bindgen(js_name = diffPixelmatch)]
pub fn diff_pixelmatch(
    a: &[u8],
    b: &[u8],
    width: u32,
    height: u32,
    threshold: f64,
    include_aa: bool,
    want_output: bool,
    checkerboard: bool,
) -> Result<PixelmatchResult, JsError> {
    let (w, h) = (width as usize, height as usize);
    if a.len() != w * h * 4 || b.len() != w * h * 4 {
        return Err(js_error(format!(
            "pixelmatch: buffers of {} and {} bytes for {}x{}",
            a.len(),
            b.len(),
            w,
            h
        )));
    }
    let r = crate::diff::pixelmatch(
        a,
        b,
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
        output: r.output,
    })
}

#[wasm_bindgen]
pub fn dssim(a: &[u8], b: &[u8], width: u32, height: u32) -> Result<DssimResult, JsError> {
    let (w, h) = (width as usize, height as usize);
    if a.len() != w * h * 4 || b.len() != w * h * 4 {
        return Err(js_error(format!(
            "dssim: buffers of {} and {} bytes for {}x{}",
            a.len(),
            b.len(),
            w,
            h
        )));
    }
    let r = crate::dssim::dssim(a, b, w, h);
    Ok(DssimResult {
        dssim: r.dssim,
        ssim: r.ssim,
        scales: r.scales,
    })
}

#[wasm_bindgen(js_name = toneLut)]
pub fn tone_lut(black: f64, white: f64, gamma: f64) -> Vec<u8> {
    crate::tone::tone_lut(black, white, gamma).to_vec()
}

#[wasm_bindgen(js_name = lanczosCoeffs)]
pub fn lanczos_coeffs(in_size: u32, in0: f64, in1: f64, out_size: u32) -> CoeffsResult {
    let c = crate::resample::precompute_coeffs(in_size as usize, in0, in1, out_size as usize);
    CoeffsResult {
        ksize: c.ksize as u32,
        bounds: c.bounds,
        kk: c.kk,
    }
}

#[wasm_bindgen(js_name = gaussianKernel)]
pub fn gaussian_kernel(sigma: f64) -> Vec<f64> {
    crate::filters::gaussian_kernel(sigma)
}

#[wasm_bindgen(js_name = bayerThresholds)]
pub fn bayer_thresholds() -> Vec<u8> {
    crate::bayer::bayer_thresholds().to_vec()
}
