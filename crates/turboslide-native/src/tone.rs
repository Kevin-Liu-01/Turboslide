//! Tone stages of the two-tone pipeline (SPEC 5.4, 10), operation for operation the same as
//! packages/effects/src/tone.ts, which reproduces Pillow: the 16-bit fixed-point 299/587/114
//! luma or one channel, inversion, `ImageOps.autocontrast` at a percent cutoff, and the black
//! point, white point and gamma LUT built with Python's round.

use crate::image::Gray;
use crate::jsmath::{js_to_uint8, round_half_even};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Channel {
    Gray,
    R,
    G,
    B,
}

impl Channel {
    pub fn parse(name: Option<&str>) -> Result<Channel, String> {
        match name {
            None | Some("gray") => Ok(Channel::Gray),
            Some("r") => Ok(Channel::R),
            Some("g") => Ok(Channel::G),
            Some("b") => Ok(Channel::B),
            Some(other) => Err(format!("unknown channel '{other}' (gray, r, g or b)")),
        }
    }
}

/// RGBA to gray. `Gray` is `(r * 19595 + g * 38470 + b * 7471 + 32768) >> 16`; a channel pick
/// copies that channel. Alpha is ignored, as `Image.convert('RGB')` drops it.
pub fn to_gray(rgba: &[u8], width: usize, height: usize, channel: Channel) -> Gray {
    let n = width * height;
    let mut out = vec![0u8; n];
    match channel {
        Channel::Gray => {
            for (i, px) in rgba.chunks_exact(4).take(n).enumerate() {
                let r = px[0] as u32;
                let g = px[1] as u32;
                let b = px[2] as u32;
                out[i] = ((r * 19595 + g * 38470 + b * 7471 + 32768) >> 16) as u8;
            }
        }
        Channel::R | Channel::G | Channel::B => {
            let offset = match channel {
                Channel::R => 0,
                Channel::G => 1,
                _ => 2,
            };
            for (i, px) in rgba.chunks_exact(4).take(n).enumerate() {
                out[i] = px[offset];
            }
        }
    }
    Gray {
        width,
        height,
        data: out,
    }
}

pub fn invert(gray: &Gray) -> Gray {
    Gray {
        width: gray.width,
        height: gray.height,
        data: gray.data.iter().map(|&v| 255 - v).collect(),
    }
}

pub fn apply_lut(gray: &Gray, lut: &[u8; 256]) -> Gray {
    Gray {
        width: gray.width,
        height: gray.height,
        data: gray.data.iter().map(|&v| lut[v as usize]).collect(),
    }
}

pub fn histogram(gray: &Gray) -> [u32; 256] {
    let mut h = [0u32; 256];
    for &v in &gray.data {
        h[v as usize] += 1;
    }
    h
}

/// The LUT of `ImageOps.autocontrast(image, cutoff)`: remove `int(n * cutoff // 100)` pixels
/// from each end of the histogram, take the remaining extremes as lo and hi, stretch with
/// `scale = 255 / (hi - lo)` and `offset = -lo * scale`, truncating toward zero and clamping.
/// The counts are carried as doubles because the TypeScript version does, so the cut lands on
/// the same bins.
pub fn autocontrast_lut(gray: &Gray, cutoff: f64) -> [u8; 256] {
    let mut h: Vec<f64> = histogram(gray).iter().map(|&c| c as f64).collect();
    let mut lut = [0u8; 256];
    if cutoff > 0.0 {
        let mut n = 0.0;
        for &v in &h {
            n += v;
        }
        let mut cut = ((n * cutoff) / 100.0).floor();
        for lo in 0..256 {
            let v = h[lo];
            if cut > v {
                cut -= v;
                h[lo] = 0.0;
            } else {
                h[lo] = v - cut;
                cut = 0.0;
            }
            if cut <= 0.0 {
                break;
            }
        }
        cut = ((n * cutoff) / 100.0).floor();
        for hi in (0..256).rev() {
            let v = h[hi];
            if cut > v {
                cut -= v;
                h[hi] = 0.0;
            } else {
                h[hi] = v - cut;
                cut = 0.0;
            }
            if cut <= 0.0 {
                break;
            }
        }
    }
    let mut lo: i32 = 0;
    while lo < 256 && h[lo as usize] == 0.0 {
        lo += 1;
    }
    let mut hi: i32 = 255;
    while hi >= 0 && h[hi as usize] == 0.0 {
        hi -= 1;
    }
    if hi <= lo {
        for (i, slot) in lut.iter_mut().enumerate() {
            *slot = i as u8;
        }
        return lut;
    }
    let scale = 255.0 / (hi - lo) as f64;
    let offset = -(lo as f64) * scale;
    for (i, slot) in lut.iter_mut().enumerate() {
        let v = (i as f64 * scale + offset).trunc();
        *slot = if v < 0.0 {
            0
        } else if v > 255.0 {
            255
        } else {
            v as u8
        };
    }
    lut
}

pub fn autocontrast(gray: &Gray, cutoff: f64) -> Gray {
    apply_lut(gray, &autocontrast_lut(gray, cutoff))
}

/// The tone LUT of the deck's pipelines: `u = clamp((v - black) / max(1, white - black), 0, 1)`,
/// `lut[v] = round(u ** gamma * 255)` with Python's round. `pow` is libm's fdlibm port so the
/// addon, the wasm module and V8 evaluate the same function.
pub fn tone_lut(black: f64, white: f64, gamma: f64) -> [u8; 256] {
    let mut lut = [0u8; 256];
    let span = f64::max(1.0, white - black);
    for (v, slot) in lut.iter_mut().enumerate() {
        let u = f64::min(1.0, f64::max(0.0, (v as f64 - black) / span));
        *slot = js_to_uint8(round_half_even(libm::pow(u, gamma) * 255.0));
    }
    lut
}

pub fn tone(gray: &Gray, black: f64, white: f64, gamma: f64) -> Gray {
    apply_lut(gray, &tone_lut(black, white, gamma))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn luma_is_fixed_point() {
        let rgba = [255, 255, 255, 255, 0, 0, 0, 0, 200, 100, 50, 255];
        let g = to_gray(&rgba, 3, 1, Channel::Gray);
        assert_eq!(g.data, vec![255, 0, 124]);
        assert_eq!(to_gray(&rgba, 3, 1, Channel::R).data, vec![255, 0, 200]);
        assert_eq!(to_gray(&rgba, 3, 1, Channel::B).data, vec![255, 0, 50]);
    }

    #[test]
    fn identity_lut_at_defaults() {
        let lut = tone_lut(0.0, 255.0, 1.0);
        for (i, &v) in lut.iter().enumerate() {
            assert_eq!(v as usize, i);
        }
    }

    #[test]
    fn black_and_white_points_clip() {
        let lut = tone_lut(20.0, 235.0, 1.0);
        assert_eq!(lut[0], 0);
        assert_eq!(lut[20], 0);
        assert_eq!(lut[235], 255);
        assert_eq!(lut[255], 255);
        // u = 100/215 = 0.4651..., times 255 = 118.6 -> 119
        assert_eq!(lut[120], 119);
    }

    #[test]
    fn autocontrast_on_a_flat_image_is_identity() {
        let g = Gray {
            width: 4,
            height: 1,
            data: vec![7, 7, 7, 7],
        };
        let lut = autocontrast_lut(&g, 0.5);
        assert_eq!(lut[7], 7);
        assert_eq!(lut[200], 200);
    }

    #[test]
    fn autocontrast_stretches_to_the_extremes() {
        let g = Gray {
            width: 4,
            height: 1,
            data: vec![10, 20, 30, 40],
        };
        let lut = autocontrast_lut(&g, 0.0);
        assert_eq!(lut[10], 0);
        assert_eq!(lut[40], 255);
        assert_eq!(lut[25], 127);
    }
}
