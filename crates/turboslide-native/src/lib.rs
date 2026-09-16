//! turboslide-native: the two-tone pipeline, the 1-bit PNG encoder and the image diffs of
//! `@turboslide/effects` in Rust (SPEC 10), one arithmetic for the browser preview, the CLI and
//! the render worker. The plain Rust API lives here; `bind_napi` and `bind_wasm` wrap it for
//! Node and for wasm-bindgen behind the `napi` and `wasm` features, and `@turboslide/native`
//! loads whichever is built. Every stage mirrors its TypeScript module operation for operation;
//! packages/effects/src/parity.test.ts holds the two together cell for cell.

// The stages mirror the TypeScript modules line for line so the two can be read side by side:
// index loops stay index loops, `!(x > 0.0)` stays the JavaScript truthiness test it reproduces,
// min/max pairs stay in the order Math.min(1, Math.max(0, x)) evaluates, and the pixelmatch
// binding keeps pixelmatch's eight parameters.
#![allow(
    clippy::needless_range_loop,
    clippy::neg_cmp_op_on_partial_ord,
    clippy::manual_clamp,
    clippy::too_many_arguments
)]

pub mod bayer;
pub mod diff;
pub mod dither;
pub mod dssim;
pub mod filters;
pub mod image;
pub mod jsmath;
pub mod metrics;
pub mod params;
pub mod png1;
pub mod resample;
pub mod tone;

#[cfg(feature = "napi")]
mod bind_napi;
#[cfg(feature = "wasm")]
mod bind_wasm;

use image::{Bits, Gray};
use metrics::{Plate, TwoToneMetrics};
use params::TwoToneParams;
use tone::Channel;

/// The screen size the deck dithers at (OPENERS.md steps 5 and 6).
pub const SCREEN_WIDTH: usize = 800;
pub const SCREEN_HEIGHT: usize = 450;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// The one-bit screen before polarity and the tone image it was cut from.
pub struct Screen {
    pub positive: Bits,
    pub tone: Gray,
}

/// Both twins of a picture plus the plate metrics of the dark twin.
pub struct TwoTone {
    pub screen: Screen,
    /// The screen scaled `cell` times nearest, dark twin polarity.
    pub dark: Bits,
    pub light: Bits,
    pub dark_png: Option<Vec<u8>>,
    pub light_png: Option<Vec<u8>>,
    pub metrics: TwoToneMetrics,
    pub cell: f64,
}

fn check_rgba(rgba: &[u8], width: usize, height: usize) -> Result<(), String> {
    let expected = width * height * 4;
    if rgba.len() != expected {
        return Err(format!(
            "rgba buffer has {} bytes, {}x{} needs {}",
            rgba.len(),
            width,
            height,
            expected
        ));
    }
    Ok(())
}

/// `twoToneScreen` of packages/effects/src/two-tone.ts: gray or one channel, crop, invert,
/// minimum filter, blur, cover fit to 800 by 450, unsharp band, autocontrast, the tone LUT, the
/// 8 by 8 screen.
pub fn two_tone_screen(
    rgba: &[u8],
    width: usize,
    height: usize,
    params: &TwoToneParams,
) -> Result<Screen, String> {
    check_rgba(rgba, width, height)?;
    let channel = Channel::parse(params.channel.as_deref())?;
    let mut gray = tone::to_gray(rgba, width, height, channel);
    let crop = params
        .crop
        .unwrap_or([0.0, 0.0, width as f64, height as f64]);
    gray = resample::crop_padded(&gray, crop);
    if params.inverts() {
        gray = tone::invert(&gray);
    }
    if let Some(size) = params.min_filter_size() {
        gray = filters::min_filter(&gray, size);
    }
    if let Some(radius) = params.blur_radius() {
        gray = filters::gaussian_blur(&gray, radius);
    }
    if gray.width == 0 || gray.height == 0 {
        return Err("the crop leaves no pixels".to_string());
    }
    gray = resample::fit_cover(&gray, SCREEN_WIDTH, SCREEN_HEIGHT);
    if let Some(u) = &params.unsharp {
        gray = filters::unsharp_band(&gray, u.rows, u.amount, u.radius, u.threshold);
    }
    gray = tone::autocontrast(&gray, params.autocontrast_cutoff());
    gray = tone::tone(
        &gray,
        params.black_point(),
        params.white_point(),
        params.gamma_value(),
    );
    Ok(Screen {
        positive: bayer::dither_gray(&gray),
        tone: gray,
    })
}

/// `twoTone` of packages/effects/src/two-tone.ts: the screen, polarity, the nearest upscale,
/// both twins as 1-bit PNGs when asked, and the plate metrics of the dark twin.
pub fn two_tone(
    rgba: &[u8],
    width: usize,
    height: usize,
    params: &TwoToneParams,
    plate: Option<Plate>,
    png: bool,
) -> Result<TwoTone, String> {
    let screen = two_tone_screen(rgba, width, height, params)?;
    let cell = params.cell_size();
    let dark_bits = if params.dark_ground() {
        screen.positive.clone()
    } else {
        screen.positive.inverted()
    };
    let light_bits = dark_bits.inverted();
    let dark = resample::scale_nearest(&dark_bits, cell);
    let light = resample::scale_nearest(&light_bits, cell);
    let (dark_png, light_png) = if png {
        (
            Some(png1::encode_png1(&dark, None, 6)),
            Some(png1::encode_png1(&light, None, 6)),
        )
    } else {
        (None, None)
    };
    let metrics = metrics::two_tone_metrics(&dark_bits, plate, cell);
    Ok(TwoTone {
        screen,
        dark,
        light,
        dark_png,
        light_png,
        metrics,
        cell,
    })
}

/// A plate as `[x, y, w, h]` JSON, the Box of SPEC 4.2.
pub fn parse_plate(json: Option<&str>) -> Result<Option<Plate>, String> {
    match json {
        None => Ok(None),
        Some(s) if s.trim().is_empty() || s.trim() == "null" => Ok(None),
        Some(s) => serde_json::from_str::<Plate>(s)
            .map(Some)
            .map_err(|e| format!("plate: {e}")),
    }
}

/// A two-entry palette as `[[r, g, b], [r, g, b]]` JSON, unlit first.
pub fn parse_palette(json: Option<&str>) -> Result<Option<[[u8; 3]; 2]>, String> {
    match json {
        None => Ok(None),
        Some(s) if s.trim().is_empty() || s.trim() == "null" => Ok(None),
        Some(s) => serde_json::from_str::<[[u8; 3]; 2]>(s)
            .map(Some)
            .map_err(|e| format!("palette: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gradient(width: usize, height: usize) -> Vec<u8> {
        let mut data = vec![0u8; width * height * 4];
        for y in 0..height {
            for x in 0..width {
                let v = jsmath::js_round(x as f64 / (width - 1) as f64 * 255.0) as u8;
                let i = (y * width + x) * 4;
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
                data[i + 3] = 255;
            }
        }
        data
    }

    #[test]
    fn a_gradient_dithers_to_a_ramp() {
        let (w, h) = (1000, 562);
        let rgba = gradient(w, h);
        let params = TwoToneParams::from_json(r#"{"polarity":"light-ground"}"#).unwrap();
        let out = two_tone(
            &rgba,
            w,
            h,
            &params,
            Some([137.0, 500.0, 740.0, 271.0]),
            true,
        )
        .unwrap();
        assert_eq!(
            (out.screen.positive.width, out.screen.positive.height),
            (800, 450)
        );
        assert_eq!((out.dark.width, out.dark.height), (1600, 900));
        assert!(out.metrics.lit_fraction > 0.4 && out.metrics.lit_fraction < 0.6);
        for i in 0..2000 {
            assert_eq!(out.dark.bits[i], 1 - out.light.bits[i]);
        }
        assert_eq!(&out.dark_png.unwrap()[..4], &[137, 80, 78, 71]);
        assert!(out.metrics.plate_clear.is_some());
    }

    #[test]
    fn a_wrong_buffer_length_is_an_error() {
        let params = TwoToneParams::default();
        assert!(two_tone_screen(&[0u8; 12], 2, 2, &params).is_err());
        assert!(parse_plate(Some("[1,2,3]")).is_err());
        assert_eq!(parse_plate(Some("null")).unwrap(), None);
        assert_eq!(
            parse_palette(Some("[[7,7,7],[242,242,240]]")).unwrap(),
            Some([[7, 7, 7], [242, 242, 240]])
        );
    }
}
