//! The optional spatial filters of the photograph pipeline, the Turboslide definitions pinned in
//! packages/effects/src/filters.ts (not Pillow's): a Gaussian blur with sigma = radius, kernel
//! radius ceil(3 sigma), weights exp(-x^2 / 2 sigma^2) normalized to one, separable, edges
//! replicate, each pass rounded with Math.round; a minimum filter over a size by size window;
//! and Pillow's unsharp rule applied to a band of rows.

use crate::image::Gray;
use crate::jsmath::js_round;

/// The normalized Gaussian taps, `exp` from libm so every target agrees with V8's fdlibm exp.
pub fn gaussian_kernel(sigma: f64) -> Vec<f64> {
    let radius = (3.0 * sigma).ceil() as i64;
    let len = (radius * 2 + 1) as usize;
    let mut k = vec![0f64; len];
    let mut sum = 0.0;
    for i in -radius..=radius {
        let w = libm::exp(-((i * i) as f64) / (2.0 * sigma * sigma));
        k[(i + radius) as usize] = w;
        sum += w;
    }
    for w in &mut k {
        *w /= sum;
    }
    k
}

fn clamp_index(i: i64, n: usize) -> usize {
    if i < 0 {
        0
    } else if i >= n as i64 {
        n - 1
    } else {
        i as usize
    }
}

fn round_clamp(acc: f64) -> u8 {
    let v = js_round(acc);
    if v < 0.0 {
        0
    } else if v > 255.0 {
        255
    } else {
        v as u8
    }
}

pub fn gaussian_blur(gray: &Gray, radius: f64) -> Gray {
    if !(radius > 0.0) {
        return gray.clone();
    }
    let (width, height) = (gray.width, gray.height);
    let k = gaussian_kernel(radius);
    let r = ((k.len() - 1) / 2) as i64;
    let mut tmp = vec![0u8; width * height];
    for y in 0..height {
        let row = y * width;
        for x in 0..width {
            let mut acc = 0.0;
            for i in -r..=r {
                acc +=
                    k[(i + r) as usize] * gray.data[row + clamp_index(x as i64 + i, width)] as f64;
            }
            tmp[row + x] = round_clamp(acc);
        }
    }
    let mut out = vec![0u8; width * height];
    for x in 0..width {
        for y in 0..height {
            let mut acc = 0.0;
            for i in -r..=r {
                acc +=
                    k[(i + r) as usize] * tmp[clamp_index(y as i64 + i, height) * width + x] as f64;
            }
            out[y * width + x] = round_clamp(acc);
        }
    }
    Gray {
        width,
        height,
        data: out,
    }
}

pub fn min_filter(gray: &Gray, size: f64) -> Gray {
    if !(size > 1.0) {
        return gray.clone();
    }
    let (width, height) = (gray.width, gray.height);
    let m = (size / 2.0).floor() as i64;
    let mut tmp = vec![0u8; width * height];
    for y in 0..height {
        let row = y * width;
        for x in 0..width {
            let mut v = 255u8;
            for i in -m..=m {
                let p = gray.data[row + clamp_index(x as i64 + i, width)];
                if p < v {
                    v = p;
                }
            }
            tmp[row + x] = v;
        }
    }
    let mut out = vec![0u8; width * height];
    for x in 0..width {
        for y in 0..height {
            let mut v = 255u8;
            for i in -m..=m {
                let p = tmp[clamp_index(y as i64 + i, height) * width + x];
                if p < v {
                    v = p;
                }
            }
            out[y * width + x] = v;
        }
    }
    Gray {
        width,
        height,
        data: out,
    }
}

/// The unsharp band: `out = in + (in - blur) * amount / 100` where |in - blur| > threshold, on
/// rows [from, to) of the fitted image only. `amount` is a percent, Pillow's unit.
pub fn unsharp_band(
    gray: &Gray,
    rows: [f64; 2],
    amount: f64,
    radius: Option<f64>,
    threshold: Option<f64>,
) -> Gray {
    let radius = radius.unwrap_or(8.0);
    let threshold = threshold.unwrap_or(3.0);
    let blurred = gaussian_blur(gray, radius);
    let mut out = gray.data.clone();
    let from = f64::max(0.0, rows[0]) as usize;
    let to = f64::min(gray.height as f64, rows[1]) as usize;
    for y in from..to {
        for x in 0..gray.width {
            let i = y * gray.width + x;
            let v = gray.data[i] as f64;
            let diff = v - blurred.data[i] as f64;
            if diff.abs() > threshold {
                let s = js_round(v + (diff * amount) / 100.0);
                out[i] = if s < 0.0 {
                    0
                } else if s > 255.0 {
                    255
                } else {
                    s as u8
                };
            }
        }
    }
    Gray {
        width: gray.width,
        height: gray.height,
        data: out,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kernel_sums_to_one() {
        for sigma in [0.4, 0.5, 0.6, 2.0, 8.0] {
            let k = gaussian_kernel(sigma);
            assert_eq!(k.len(), ((3.0 * sigma).ceil() as usize) * 2 + 1);
            let sum: f64 = k.iter().sum();
            assert!((sum - 1.0).abs() < 1e-12, "sigma {sigma} sums to {sum}");
        }
    }

    #[test]
    fn blur_keeps_a_flat_field() {
        let g = Gray {
            width: 5,
            height: 3,
            data: vec![90; 15],
        };
        assert_eq!(gaussian_blur(&g, 1.0).data, vec![90; 15]);
        assert_eq!(gaussian_blur(&g, 0.0).data, vec![90; 15]);
    }

    #[test]
    fn min_filter_takes_the_window_minimum() {
        let g = Gray {
            width: 3,
            height: 1,
            data: vec![10, 200, 50],
        };
        assert_eq!(min_filter(&g, 3.0).data, vec![10, 10, 50]);
        assert_eq!(min_filter(&g, 1.0).data, vec![10, 200, 50]);
    }
}
