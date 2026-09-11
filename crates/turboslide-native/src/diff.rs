//! Image diffs (SPEC 10 diff.rs): the exact per-pixel count and a port of pixelmatch 7.2.0
//! (https://github.com/mapbox/pixelmatch, ISC), the perceptual diff the verify loop gates on
//! (SPEC 8.5 step 3). The port keeps pixelmatch's arithmetic and its evaluation order, so the
//! mismatch count and the diff image are the ones the npm package produces for the same inputs;
//! packages/effects/src/parity.test.ts holds them together.

/// Mismatched pixels between two RGBA buffers of the same length; alpha counts.
pub fn diff_exact(a: &[u8], b: &[u8]) -> u32 {
    let mut mismatched = 0u32;
    for (pa, pb) in a.chunks_exact(4).zip(b.chunks_exact(4)) {
        if pa != pb {
            mismatched += 1;
        }
    }
    mismatched
}

#[derive(Clone, Copy, Debug)]
pub struct PixelmatchOptions {
    /// Matching threshold, 0 to 1; smaller is more sensitive. pixelmatch's default is 0.1.
    pub threshold: f64,
    /// Count antialiasing suspects as differences instead of skipping them.
    pub include_aa: bool,
    /// Blend semi-transparent pixels against a checkerboard (true) or plain white.
    pub checkerboard: bool,
    /// Paint the diff image: gray original at alpha 0.1, red mismatches, yellow antialiasing.
    pub output: bool,
}

impl Default for PixelmatchOptions {
    fn default() -> Self {
        PixelmatchOptions {
            threshold: 0.1,
            include_aa: false,
            checkerboard: true,
            output: false,
        }
    }
}

pub struct PixelmatchResult {
    pub mismatched: u32,
    pub output: Option<Vec<u8>>,
}

const ALPHA: f64 = 0.1;
const AA_COLOR: [u8; 3] = [255, 255, 0];
const DIFF_COLOR: [u8; 3] = [255, 0, 0];

fn px4(img: &[u8], pos: usize) -> [u8; 4] {
    [img[pos], img[pos + 1], img[pos + 2], img[pos + 3]]
}

fn background(k: usize, checkerboard: bool) -> (f64, f64, f64) {
    if !checkerboard {
        return (255.0, 255.0, 255.0);
    }
    let kf = k as f64;
    let rb = 48.0 + 159.0 * (k % 2) as f64;
    let gb = 48.0 + 159.0 * (((kf / 1.618033988749895) as i32) % 2) as f64;
    let bb = 48.0 + 159.0 * (((kf / 2.618033988749895) as i32) % 2) as f64;
    (rb, gb, bb)
}

/// The signed squared YIQ distance, negative when the second pixel is lighter.
fn color_delta(img1: &[u8], img2: &[u8], k: usize, m: usize, checkerboard: bool) -> f64 {
    let [r1, g1, b1, a1] = px4(img1, k).map(|v| v as f64);
    let [r2, g2, b2, a2] = px4(img2, m).map(|v| v as f64);
    let mut dr = r1 - r2;
    let mut dg = g1 - g2;
    let mut db = b1 - b2;
    let da = a1 - a2;
    if a1 < 255.0 || a2 < 255.0 {
        let (rb, gb, bb) = background(k, checkerboard);
        dr = (r1 * a1 - r2 * a2 - rb * da) / 255.0;
        dg = (g1 * a1 - g2 * a2 - gb * da) / 255.0;
        db = (b1 * a1 - b2 * a2 - bb * da) / 255.0;
    }
    let y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
    let i = dr * 0.59597799 - dg * 0.27417610 - db * 0.32180189;
    let q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
    let delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
    if y > 0.0 { -delta } else { delta }
}

fn brightness_delta(img: &[u8], k: usize, m: usize, c: [f64; 4], checkerboard: bool) -> f64 {
    let [r1, g1, b1, a1] = c;
    let [r2, g2, b2, a2] = px4(img, m).map(|v| v as f64);
    let mut dr = r1 - r2;
    let mut dg = g1 - g2;
    let mut db = b1 - b2;
    let da = a1 - a2;
    if dr == 0.0 && dg == 0.0 && db == 0.0 && da == 0.0 {
        return 0.0;
    }
    if a1 < 255.0 || a2 < 255.0 {
        let (rb, gb, bb) = background(k, checkerboard);
        dr = (r1 * a1 - r2 * a2 - rb * da) / 255.0;
        dg = (g1 * a1 - g2 * a2 - gb * da) / 255.0;
        db = (b1 * a1 - b2 * a2 - bb * da) / 255.0;
    }
    dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223
}

fn has_many_siblings(img: &[u8], x1: usize, y1: usize, width: usize, height: usize) -> bool {
    let x0 = x1.saturating_sub(1);
    let y0 = y1.saturating_sub(1);
    let x2 = (x1 + 1).min(width - 1);
    let y2 = (y1 + 1).min(height - 1);
    let val = px4(img, (y1 * width + x1) * 4);
    let mut zeroes = if x1 == x0 || x1 == x2 || y1 == y0 || y1 == y2 {
        1
    } else {
        0
    };
    for x in x0..=x2 {
        for y in y0..=y2 {
            if x == x1 && y == y1 {
                continue;
            }
            if val == px4(img, (y * width + x) * 4) {
                zeroes += 1;
            }
            if zeroes > 2 {
                return true;
            }
        }
    }
    false
}

/// pixelmatch's antialiasing detector (Vysniauskas, 2009): a pixel with both a darker and a
/// brighter neighbour, one of which has three or more equal siblings in both images.
fn antialiased(
    img: &[u8],
    x1: usize,
    y1: usize,
    width: usize,
    height: usize,
    a: &[u8],
    b: &[u8],
    checkerboard: bool,
) -> bool {
    let x0 = x1.saturating_sub(1);
    let y0 = y1.saturating_sub(1);
    let x2 = (x1 + 1).min(width - 1);
    let y2 = (y1 + 1).min(height - 1);
    let pos4 = (y1 * width + x1) * 4;
    let c = px4(img, pos4).map(|v| v as f64);
    let mut zeroes = if x1 == x0 || x1 == x2 || y1 == y0 || y1 == y2 {
        1
    } else {
        0
    };
    let mut min = 0.0;
    let mut max = 0.0;
    let (mut min_x, mut min_y, mut max_x, mut max_y) = (0usize, 0usize, 0usize, 0usize);
    for x in x0..=x2 {
        for y in y0..=y2 {
            if x == x1 && y == y1 {
                continue;
            }
            let delta = brightness_delta(img, pos4, (y * width + x) * 4, c, checkerboard);
            if delta == 0.0 {
                zeroes += 1;
                if zeroes > 2 {
                    return false;
                }
            } else if delta < min {
                min = delta;
                min_x = x;
                min_y = y;
            } else if delta > max {
                max = delta;
                max_x = x;
                max_y = y;
            }
        }
    }
    if min == 0.0 || max == 0.0 {
        return false;
    }
    (has_many_siblings(a, min_x, min_y, width, height)
        && has_many_siblings(b, min_x, min_y, width, height))
        || (has_many_siblings(a, max_x, max_y, width, height)
            && has_many_siblings(b, max_x, max_y, width, height))
}

fn draw_pixel(out: &mut [u8], pos: usize, rgb: [u8; 3]) {
    out[pos] = rgb[0];
    out[pos + 1] = rgb[1];
    out[pos + 2] = rgb[2];
    out[pos + 3] = 255;
}

fn draw_gray_pixel(img: &[u8], i: usize, out: &mut [u8]) {
    let lum = img[i] as f64 * 0.29889531
        + img[i + 1] as f64 * 0.58662247
        + img[i + 2] as f64 * 0.11448223;
    let val = 255.0 + (lum - 255.0) * ALPHA * img[i + 3] as f64 / 255.0;
    let v = crate::jsmath::js_to_uint8(val);
    draw_pixel(out, i, [v, v, v]);
}

/// pixelmatch over two RGBA buffers of `width` by `height`. The caller checks the lengths.
pub fn pixelmatch(
    img1: &[u8],
    img2: &[u8],
    width: usize,
    height: usize,
    options: PixelmatchOptions,
) -> PixelmatchResult {
    let len = width * height;
    let mut output = if options.output {
        Some(vec![0u8; len * 4])
    } else {
        None
    };
    let identical = img1 == img2;
    if identical {
        if let Some(out) = output.as_mut() {
            for i in 0..len {
                draw_gray_pixel(img1, i * 4, out);
            }
        }
        return PixelmatchResult {
            mismatched: 0,
            output,
        };
    }
    let max_delta = 35215.0 * options.threshold * options.threshold;
    let mut diff = 0u32;
    for i in 0..len {
        let pos = i * 4;
        let same = img1[pos..pos + 4] == img2[pos..pos + 4];
        let delta = if same {
            0.0
        } else {
            color_delta(img1, img2, pos, pos, options.checkerboard)
        };
        if delta.abs() > max_delta {
            let x = i % width;
            let y = i / width;
            let excluded_aa = !options.include_aa
                && (antialiased(img1, x, y, width, height, img1, img2, options.checkerboard)
                    || antialiased(img2, x, y, width, height, img2, img1, options.checkerboard));
            if excluded_aa {
                if let Some(out) = output.as_mut() {
                    draw_pixel(out, pos, AA_COLOR);
                }
            } else {
                if let Some(out) = output.as_mut() {
                    draw_pixel(out, pos, DIFF_COLOR);
                }
                diff += 1;
            }
        } else if let Some(out) = output.as_mut() {
            draw_gray_pixel(img1, pos, out);
        }
    }
    PixelmatchResult {
        mismatched: diff,
        output,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(w: usize, h: usize, rgba: [u8; 4]) -> Vec<u8> {
        let mut v = Vec::with_capacity(w * h * 4);
        for _ in 0..w * h {
            v.extend_from_slice(&rgba);
        }
        v
    }

    #[test]
    fn exact_counts_pixels() {
        let a = solid(4, 1, [1, 2, 3, 255]);
        let mut b = a.clone();
        b[4] = 9;
        b[15] = 0;
        assert_eq!(diff_exact(&a, &a), 0);
        assert_eq!(diff_exact(&a, &b), 2);
    }

    #[test]
    fn identical_images_match_and_paint_gray() {
        let a = solid(3, 3, [200, 100, 50, 255]);
        let r = pixelmatch(
            &a,
            &a,
            3,
            3,
            PixelmatchOptions {
                output: true,
                ..PixelmatchOptions::default()
            },
        );
        assert_eq!(r.mismatched, 0);
        let out = r.output.unwrap();
        // lum = 200 * 0.2989 + 100 * 0.5866 + 50 * 0.1145 = 124.2; 255 + (124.2 - 255) * 0.1 = 241.9
        assert_eq!(out[0], 241);
        assert_eq!(out[3], 255);
    }

    #[test]
    fn a_single_changed_pixel_counts_once() {
        let a = solid(5, 5, [255, 255, 255, 255]);
        let mut b = a.clone();
        let center = (2 * 5 + 2) * 4;
        b[center] = 0;
        b[center + 1] = 0;
        b[center + 2] = 0;
        let r = pixelmatch(
            &a,
            &b,
            5,
            5,
            PixelmatchOptions {
                output: true,
                ..PixelmatchOptions::default()
            },
        );
        assert_eq!(r.mismatched, 1);
        let out = r.output.unwrap();
        assert_eq!(&out[center..center + 4], &[255, 0, 0, 255]);
    }

    #[test]
    fn a_faint_change_is_under_the_threshold() {
        let a = solid(2, 2, [120, 120, 120, 255]);
        let mut b = a.clone();
        b[0] = 122;
        assert_eq!(
            pixelmatch(&a, &b, 2, 2, PixelmatchOptions::default()).mismatched,
            0
        );
        assert_eq!(
            pixelmatch(
                &a,
                &b,
                2,
                2,
                PixelmatchOptions {
                    threshold: 0.0,
                    ..PixelmatchOptions::default()
                }
            )
            .mismatched,
            1
        );
    }
}
