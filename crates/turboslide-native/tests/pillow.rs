//! Byte parity with Pillow 12.3 on every pinned stage, through the fixtures the effects package
//! committed under packages/effects/fixtures/pillow (made once by the scratchpad
//! make-pillow-fixtures.py), and the two-tone golden under fixtures/two-tone. The same files hold
//! the TypeScript stages in packages/effects/src/pillow.test.ts, so a pass here and there is the
//! bit identity SPEC 10 asks for at the stage level; parity.test.ts checks whole pictures.

use std::fs;
use std::path::{Path, PathBuf};

use turboslide_native::bayer::dither_gray;
use turboslide_native::image::{Bits, Gray};
use turboslide_native::params::TwoToneParams;
use turboslide_native::resample::{crop_padded, fit_cover, resize_lanczos3, scale_nearest};
use turboslide_native::tone::{Channel, autocontrast, to_gray, tone};

fn fixtures(dir: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/effects/fixtures")
        .join(dir)
}

fn bin(name: &str) -> Vec<u8> {
    fs::read(fixtures("pillow").join(name)).unwrap_or_else(|e| panic!("{name}: {e}"))
}

/// Decodes a PNG to 8-bit RGBA with the png crate (dev-dependency only).
fn read_png_rgba(path: &Path) -> (Vec<u8>, usize, usize) {
    let file = fs::File::open(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    let mut decoder = png::Decoder::new(std::io::BufReader::new(file));
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info().expect("png header");
    let mut buf = vec![0u8; reader.output_buffer_size().expect("png size")];
    let info = reader.next_frame(&mut buf).expect("png frame");
    let (w, h) = (info.width as usize, info.height as usize);
    let bytes = &buf[..info.buffer_size()];
    let rgba = match info.color_type {
        png::ColorType::Rgba => bytes.to_vec(),
        png::ColorType::Rgb => bytes
            .chunks_exact(3)
            .flat_map(|p| [p[0], p[1], p[2], 255])
            .collect(),
        png::ColorType::Grayscale => bytes.iter().flat_map(|&v| [v, v, v, 255]).collect(),
        png::ColorType::GrayscaleAlpha => bytes
            .chunks_exact(2)
            .flat_map(|p| [p[0], p[0], p[0], p[1]])
            .collect(),
        other => panic!("unexpected color type {other:?}"),
    };
    (rgba, w, h)
}

fn assert_same(got: &[u8], want: &[u8], label: &str) {
    assert_eq!(got.len(), want.len(), "{label}: length");
    let mut mismatched = 0;
    let mut max_delta = 0i32;
    for (g, w) in got.iter().zip(want) {
        let d = (*g as i32 - *w as i32).abs();
        if d != 0 {
            mismatched += 1;
        }
        max_delta = max_delta.max(d);
    }
    assert_eq!(
        (mismatched, max_delta),
        (0, 0),
        "{label}: {mismatched} bytes differ, max delta {max_delta}"
    );
}

fn source() -> (Vec<u8>, Gray) {
    let (rgba, w, h) = read_png_rgba(&fixtures("pillow").join("src.png"));
    assert_eq!((w, h), (137, 91));
    let gray = to_gray(&rgba, w, h, Channel::Gray);
    (rgba, gray)
}

#[test]
fn convert_l_is_the_fixed_point_luma() {
    let (rgba, gray) = source();
    assert_same(&gray.data, &bin("gray.bin"), "gray");
    let red = to_gray(&rgba, 137, 91, Channel::R);
    assert_same(&red.data, &bin("red.bin"), "red");
}

#[test]
fn crop_pads_with_black_past_the_source() {
    let (_, gray) = source();
    let got = crop_padded(&gray, [-20.0, 10.0, 150.0, 100.0]);
    assert_eq!((got.width, got.height), (170, 90));
    assert_same(&got.data, &bin("crop-padded.bin"), "crop");
}

#[test]
fn lanczos3_downscale_through_a_fractional_box() {
    let (_, gray) = source();
    let got = resize_lanczos3(&gray, 40, 23, Some([3.37, 2.5, 131.2, 88.9]));
    assert_same(&got.data, &bin("resize-down.bin"), "resize down");
}

#[test]
fn lanczos3_upscale() {
    let (_, gray) = source();
    let got = resize_lanczos3(&gray, 300, 200, None);
    assert_same(&got.data, &bin("resize-up.bin"), "resize up");
}

#[test]
fn fit_autocontrast_tone_screen_and_nearest() {
    let (_, gray) = source();
    let fit = fit_cover(&gray, 80, 45);
    assert_same(&fit.data, &bin("fit.bin"), "fit");
    let ac = autocontrast(&fit, 0.5);
    assert_same(&ac.data, &bin("autocontrast.bin"), "autocontrast");
    let toned = tone(&ac, 20.0, 235.0, 0.9);
    assert_same(&toned.data, &bin("tone.bin"), "tone");
    let bits = dither_gray(&toned);
    let as_gray: Vec<u8> = bits
        .bits
        .iter()
        .map(|&b| if b != 0 { 255 } else { 0 })
        .collect();
    assert_same(&as_gray, &bin("dither.bin"), "dither");
    let scaled = scale_nearest(&bits, 2.0);
    assert_eq!((scaled.width, scaled.height), (160, 90));
    let scaled_gray: Vec<u8> = scaled
        .bits
        .iter()
        .map(|&b| if b != 0 { 255 } else { 0 })
        .collect();
    assert_same(&scaled_gray, &bin("nearest2x.bin"), "nearest");
}

/// The committed golden of the whole pipeline (fixtures/two-tone/manifest.json `golden`):
/// src.png with crop -20, 10, 150, 100, black 20, white 235, gamma 0.9, dark ground.
#[test]
fn the_two_tone_golden_reproduces_cell_for_cell() {
    let (rgba, _) = source();
    let params = TwoToneParams::from_json(
        r#"{"crop":[-20,10,150,100],"black":20,"white":235,"gamma":0.9,"polarity":"dark-ground"}"#,
    )
    .unwrap();
    let out = turboslide_native::two_tone(
        &rgba,
        137,
        91,
        &params,
        Some([137.0, 500.0, 740.0, 271.0]),
        false,
    )
    .unwrap();
    let (golden, gw, gh) = read_png_rgba(&fixtures("two-tone").join("pillow-src-dark.png"));
    assert_eq!((gw, gh), (1600, 900));
    let golden_bits = Bits {
        width: gw,
        height: gh,
        bits: golden
            .chunks_exact(4)
            .map(|p| if p[0] > 127 { 1 } else { 0 })
            .collect(),
    };
    assert_eq!(out.dark.width, 1600);
    let mismatched = out
        .dark
        .bits
        .iter()
        .zip(&golden_bits.bits)
        .filter(|(a, b)| a != b)
        .count();
    assert_eq!(mismatched, 0, "cells differ from the golden");
    assert_eq!(out.screen.positive.lit_count(), 175_982);
    assert_eq!(out.metrics.lit_fraction, 0.4888);
    let clear = out.metrics.plate_clear.as_ref().unwrap();
    assert_eq!(
        (clear.lit_under, clear.lit_in_band, clear.nearest_lit_px),
        (25_049, 7_053, 0.0)
    );
    assert_eq!(
        out.metrics.warnings,
        vec!["25049 lit cell(s) under the plate (picture/plate-clear)".to_string()]
    );
}
