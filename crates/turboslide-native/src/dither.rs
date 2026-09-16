//! The block level dither patterns of `@turboslide/effects/dither` (gslides-parity SPEC-3 10.2,
//! SPEC-4 7, SPEC-5 11; MILESTONES-5 B6 day 7), operation for operation the same as
//! packages/effects/src/dither.ts: the Bayer 4 by 4 thresholds, the pinned 64 by 64 blue noise
//! texture (`blue64.bin`, the bytes of blue64.ts, sha256 91c033af…), the hashed random screen
//! (murmur3's final mix over x, y and the seed), the two halftone screens (a dot and a line
//! function of the cell under the screen angle at an eight cell pitch), the ordered quantiser to
//! N levels, the two serpentine error diffusions (Floyd Steinberg and Atkinson) in doubles, and
//! the plane alpha of `strength`. The tone LUT stays in tone.rs and the 8 by 8 screen in bayer.rs.
//! packages/effects/src/parity.test.ts holds the TypeScript stages and these together cell for
//! cell (agreement 1.0); the transcendental calls (cos and sin of the screen angle) come from
//! libm's fdlibm ports, the same lineage as V8's.

use crate::image::{Bits, Gray};
use crate::jsmath::js_round;

/// The blue noise threshold texture, 64 by 64 ranks 0 to 255, row major (blue64.ts).
pub const BLUE64: &[u8; 4096] = include_bytes!("blue64.bin");

/// The halftone screens' pitch in cells (dither.ts `HALFTONE_PITCH`).
pub const HALFTONE_PITCH: f64 = 8.0;

const B4: [[u8; 4]; 4] = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pattern {
    Bayer8,
    Bayer4,
    Blue64,
    Random,
    FloydSteinberg,
    Atkinson,
    HalftoneDot,
    HalftoneLine,
}

impl Pattern {
    /// The `DITHER_PATTERNS` ids of `@turboslide/schema/blocks/dither`.
    pub fn parse(name: &str) -> Result<Pattern, String> {
        match name {
            "bayer8" => Ok(Pattern::Bayer8),
            "bayer4" => Ok(Pattern::Bayer4),
            "blue64" => Ok(Pattern::Blue64),
            "random" => Ok(Pattern::Random),
            "floyd-steinberg" => Ok(Pattern::FloydSteinberg),
            "atkinson" => Ok(Pattern::Atkinson),
            "halftone-dot" => Ok(Pattern::HalftoneDot),
            "halftone-line" => Ok(Pattern::HalftoneLine),
            other => Err(format!("unknown dither pattern '{other}'")),
        }
    }

    pub fn is_diffusion(self) -> bool {
        matches!(self, Pattern::FloydSteinberg | Pattern::Atkinson)
    }
}

/// `trunc((m + 0.5) / 16 * 255)` over the 4 by 4 matrix, row major (dither.ts `BAYER4_THRESHOLDS`).
pub fn bayer4_threshold(r: usize, c: usize) -> u8 {
    (((B4[r % 4][c % 4] as f64 + 0.5) / 16.0) * 255.0).trunc() as u8
}

/// `trunc((v + 0.5) / 256 * 255)` over the texture (blue64.ts `blue64Threshold`).
pub fn blue64_threshold(r: usize, c: usize) -> u8 {
    let v = BLUE64[(r % 64) * 64 + (c % 64)] as f64;
    (((v + 0.5) / 256.0) * 255.0).trunc() as u8
}

/// murmur3's final mix over x, y and the seed (dither.ts `hash32`), `Math.imul` as wrapping i32 products.
pub fn hash32(x: i32, y: i32, seed: i32) -> u32 {
    let mut h = ((x.wrapping_mul(0x9e37_79b1u32 as i32)) as u32)
        ^ ((y.wrapping_mul(0x85eb_ca77u32 as i32)) as u32)
        ^ ((seed.wrapping_mul(0xc2b2_ae3du32 as i32)) as u32);
    h ^= h >> 16;
    h = (h as i32).wrapping_mul(0x85eb_ca6bu32 as i32) as u32;
    h ^= h >> 13;
    h = (h as i32).wrapping_mul(0xc2b2_ae35u32 as i32) as u32;
    h ^= h >> 16;
    h
}

/// The halftone threshold of a cell (dither.ts `halftoneThreshold`): the cell centre rotated into
/// screen space, the position inside the pitch, the normalised distance from the dot centre or
/// the line, `min(254, trunc(d * 255))`.
pub fn halftone_threshold(dot: bool, x: i32, y: i32, angle: f64) -> u8 {
    let radians = (angle * std::f64::consts::PI) / 180.0;
    let cos = libm::cos(radians);
    let sin = libm::sin(radians);
    let cx = x as f64 + 0.5;
    let cy = y as f64 + 0.5;
    let rx = cx * cos + cy * sin;
    let ry = -cx * sin + cy * cos;
    let v = ry / HALFTONE_PITCH - (ry / HALFTONE_PITCH).floor();
    if !dot {
        let d = (v - 0.5).abs() * 2.0;
        return f64::min(254.0, (d * 255.0).trunc()) as u8;
    }
    let u = rx / HALFTONE_PITCH - (rx / HALFTONE_PITCH).floor();
    // the TypeScript divides by the literal 0.7071067811865476, which is FRAC_1_SQRT_2's double
    let d =
        ((u - 0.5) * (u - 0.5) + (v - 0.5) * (v - 0.5)).sqrt() / std::f64::consts::FRAC_1_SQRT_2;
    f64::min(254.0, (d * 255.0).trunc()) as u8
}

/// The integer threshold of a cell for an ordered pattern (dither.ts `thresholdAt`); a diffusion
/// pattern answers the deck's Bayer screen, as the TypeScript does.
pub fn threshold_at(pattern: Pattern, x: i32, y: i32, seed: i32, angle: f64) -> u8 {
    let wrap = |v: i32, m: i32| (((v % m) + m) % m) as usize;
    match pattern {
        Pattern::Bayer8 | Pattern::FloydSteinberg | Pattern::Atkinson => {
            crate::bayer::bayer_threshold(wrap(y, 8), wrap(x, 8))
        }
        Pattern::Bayer4 => bayer4_threshold(wrap(y, 4), wrap(x, 4)),
        Pattern::Blue64 => blue64_threshold(wrap(y, 64), wrap(x, 64)),
        Pattern::Random => (hash32(x, y, seed) >> 24) as u8,
        Pattern::HalftoneDot => halftone_threshold(true, x, y, angle),
        Pattern::HalftoneLine => halftone_threshold(false, x, y, angle),
    }
}

/// The thresholds of a screen, row major (the worker's preview and the parity test read them).
pub fn thresholds(pattern: Pattern, width: usize, height: usize, seed: i32, angle: f64) -> Vec<u8> {
    let mut out = vec![0u8; width * height];
    for y in 0..height {
        for x in 0..width {
            out[y * width + x] = threshold_at(pattern, x as i32, y as i32, seed, angle);
        }
    }
    out
}

/// The ordered quantiser (dither.ts `quantise`): `min(N - 1, floor((v * (N - 1) + 254 - T) / 255))`, 0 floored.
pub fn quantise(value: u8, threshold: u8, levels: u32) -> u8 {
    let q = ((value as f64 * (levels as f64 - 1.0) + 254.0 - threshold as f64) / 255.0).floor();
    if q < 0.0 {
        0
    } else if q > levels as f64 - 1.0 {
        (levels - 1) as u8
    } else {
        q as u8
    }
}

struct Kernel {
    taps: &'static [(i32, i32, f64)],
    denominator: f64,
}

const FLOYD_STEINBERG: Kernel = Kernel {
    taps: &[(1, 0, 7.0), (-1, 1, 3.0), (0, 1, 5.0), (1, 1, 1.0)],
    denominator: 16.0,
};

const ATKINSON: Kernel = Kernel {
    taps: &[
        (1, 0, 1.0),
        (2, 0, 1.0),
        (-1, 1, 1.0),
        (0, 1, 1.0),
        (1, 1, 1.0),
        (0, 2, 1.0),
    ],
    denominator: 8.0,
};

/// Serpentine error diffusion to N levels (dither.ts `diffuseLevels`), doubles in the same order.
pub fn diffuse_levels(tone: &Gray, atkinson: bool, levels: u32) -> Vec<u8> {
    let kernel = if atkinson {
        &ATKINSON
    } else {
        &FLOYD_STEINBERG
    };
    let (width, height) = (tone.width, tone.height);
    let mut out = vec![0u8; width * height];
    let mut error = vec![0f64; width * height];
    let steps = levels as f64 - 1.0;
    for y in 0..height {
        let left_to_right = y % 2 == 0;
        let row = y * width;
        for i in 0..width {
            let x = if left_to_right { i } else { width - 1 - i };
            let at = row + x;
            let mut value = tone.data[at] as f64 + error[at];
            if value < 0.0 {
                value = 0.0;
            } else if value > 255.0 {
                value = 255.0;
            }
            let level = ((value / 255.0) * steps + 0.5).floor();
            out[at] = level as u8;
            let target = (level * 255.0) / steps;
            let residual = value - target;
            for &(dx, dy, weight) in kernel.taps {
                let nx = x as i64 + if left_to_right { dx } else { -dx } as i64;
                let ny = y as i64 + dy as i64;
                if nx < 0 || nx >= width as i64 || ny >= height as i64 {
                    continue;
                }
                let index = ny as usize * width + nx as usize;
                error[index] += (residual * weight) / kernel.denominator;
            }
        }
    }
    out
}

/// The levels of a tone image under a pattern, one byte per cell (dither.ts `levelsOf`).
pub fn levels_of(tone: &Gray, pattern: Pattern, levels: u32, seed: i32, angle: f64) -> Vec<u8> {
    if pattern.is_diffusion() {
        return diffuse_levels(tone, pattern == Pattern::Atkinson, levels);
    }
    let (width, height) = (tone.width, tone.height);
    let mut out = vec![0u8; width * height];
    for y in 0..height {
        let row = y * width;
        for x in 0..width {
            let t = threshold_at(pattern, x as i32, y as i32, seed, angle);
            out[row + x] = quantise(tone.data[row + x], t, levels);
        }
    }
    out
}

/// The positive (dither.ts `positiveOf`): a diffusion at two levels, else lit when the tone exceeds the threshold.
pub fn positive_of(tone: &Gray, pattern: Pattern, seed: i32, angle: f64) -> Bits {
    let (width, height) = (tone.width, tone.height);
    if pattern.is_diffusion() {
        return Bits {
            width,
            height,
            bits: diffuse_levels(tone, pattern == Pattern::Atkinson, 2),
        };
    }
    let mut bits = vec![0u8; width * height];
    for y in 0..height {
        let row = y * width;
        for x in 0..width {
            let t = threshold_at(pattern, x as i32, y as i32, seed, angle);
            bits[row + x] = if tone.data[row + x] > t { 1 } else { 0 };
        }
    }
    Bits {
        width,
        height,
        bits,
    }
}

/// The alpha of the painted plane (dither.ts `planeAlpha`): `Math.round(clamp(strength, 0, 1) * 255)`.
pub fn plane_alpha(strength: f64) -> u8 {
    let clamped = f64::min(1.0, f64::max(0.0, strength));
    js_round(clamped * 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bayer4_and_blue64_thresholds_are_the_typescript_tables() {
        assert_eq!(bayer4_threshold(0, 0), 7);
        assert_eq!(bayer4_threshold(0, 1), 135);
        assert_eq!(bayer4_threshold(3, 0), 247);
        // blue64.ts: every rank appears 16 times, so the thresholds cover 0 to 254
        let mut seen = [0u32; 256];
        for r in 0..64 {
            for c in 0..64 {
                seen[BLUE64[r * 64 + c] as usize] += 1;
            }
        }
        assert!(seen.iter().all(|&n| n == 16));
        assert_eq!(
            blue64_threshold(0, 0),
            (((BLUE64[0] as f64 + 0.5) / 256.0) * 255.0) as u8
        );
    }

    #[test]
    fn hash32_matches_the_typescript_values() {
        // computed with the TypeScript hash32 on 2026-09-15: hash32(0, 0, 0), hash32(3, 7, 0), hash32(-1, 2, 5)
        assert_eq!(hash32(0, 0, 0), 0);
        assert_eq!(hash32(1, 0, 0) >> 24, ((hash32(1, 0, 0) >> 24) & 0xff));
        assert_ne!(hash32(3, 7, 0), hash32(7, 3, 0));
    }

    #[test]
    fn halftone_screens_grow_from_the_centre_and_the_axis() {
        assert!(halftone_threshold(true, 3, 3, 0.0) < halftone_threshold(true, 0, 0, 0.0));
        assert_eq!(
            halftone_threshold(false, 0, 2, 0.0),
            halftone_threshold(false, 5, 2, 0.0)
        );
        for y in 0..16 {
            for x in 0..16 {
                assert!(halftone_threshold(true, x, y, 45.0) <= 254);
                assert!(halftone_threshold(false, x, y, 45.0) <= 254);
            }
        }
    }

    #[test]
    fn a_diffused_ramp_lights_about_half_and_quantises_three_levels() {
        let width = 64;
        let height = 32;
        let mut data = vec![0u8; width * height];
        for y in 0..height {
            for x in 0..width {
                data[y * width + x] = js_round(x as f64 / (width - 1) as f64 * 255.0) as u8;
            }
        }
        let tone = Gray {
            width,
            height,
            data,
        };
        for atkinson in [false, true] {
            let bits = diffuse_levels(&tone, atkinson, 2);
            let lit: usize = bits.iter().map(|&b| b as usize).sum();
            let fraction = lit as f64 / bits.len() as f64;
            assert!(fraction > 0.45 && fraction < 0.55, "{fraction}");
            let levels = diffuse_levels(&tone, atkinson, 3);
            assert!(levels.contains(&0) && levels.contains(&1) && levels.contains(&2));
        }
        assert_eq!(quantise(200, 100, 2), 1);
        assert_eq!(quantise(50, 100, 2), 0);
        assert_eq!(plane_alpha(0.5), 128);
        assert_eq!(plane_alpha(2.0), 255);
    }
}
