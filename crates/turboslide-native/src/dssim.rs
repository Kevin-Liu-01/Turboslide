//! DSSIM, the perceptual score the verify loop uses as its text gate (SPEC 8.5, 10). This is
//! Turboslide's own definition of multi-scale SSIM (Wang, Bovik, Sheikh and Simoncelli, 2004;
//! Wang, Simoncelli and Bovik, 2003) and not the `dssim` crate, which is AGPL-3.0 and would put
//! the addon under that license (docs/native.md, "DSSIM"). packages/effects/src/dssim.ts is the
//! same arithmetic in TypeScript, operation for operation, so both fallbacks score alike.
//!
//! Definition:
//! 1. sRGB bytes to linear light through a 256-entry table (the IEC 61966-2-1 curve), then to
//!    CIE XYZ (D65) and CIE L*a*b*; alpha is ignored. Channels are scaled to L / 100,
//!    (a + 128) / 255 and (b + 128) / 255.
//! 2. At each scale, SSIM per channel with an 11-tap Gaussian window (sigma 1.5, normalized),
//!    separable, edges replicate, C1 = 0.01^2 and C2 = 0.03^2 on a data range of 1; the mean of
//!    the SSIM map over all pixels. Channels combine as (L + 0.5 a + 0.5 b) / 2.
//! 3. Scales: the image and up to four 2 by 2 box downsamples while both sides stay at least 11
//!    pixels, weighted 0.0448, 0.2856, 0.3001, 0.2363, 0.1333 (renormalized over the scales that
//!    exist).
//! 4. dssim = 1 / ssim - 1: 0 for identical images, growing without bound as they diverge; ssim
//!    is floored at 1e-6 first.

pub const WINDOW_SIGMA: f64 = 1.5;
pub const WINDOW_RADIUS: usize = 5;
pub const C1: f64 = 0.01 * 0.01;
pub const C2: f64 = 0.03 * 0.03;
pub const SCALE_WEIGHTS: [f64; 5] = [0.0448, 0.2856, 0.3001, 0.2363, 0.1333];
pub const MIN_SIDE: usize = 11;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DssimResult {
    pub dssim: f64,
    pub ssim: f64,
    pub scales: u32,
}

fn srgb_to_linear_table() -> [f64; 256] {
    let mut t = [0f64; 256];
    for (i, slot) in t.iter_mut().enumerate() {
        let c = i as f64 / 255.0;
        *slot = if c <= 0.04045 {
            c / 12.92
        } else {
            libm::pow((c + 0.055) / 1.055, 2.4)
        };
    }
    t
}

fn lab_f(t: f64) -> f64 {
    const DELTA3: f64 = 216.0 / 24389.0;
    if t > DELTA3 {
        libm::cbrt(t)
    } else {
        (841.0 / 108.0) * t + 4.0 / 29.0
    }
}

/// Three planes in 0..1 (L, a, b scaled), row major.
pub struct Planes {
    pub width: usize,
    pub height: usize,
    pub l: Vec<f64>,
    pub a: Vec<f64>,
    pub b: Vec<f64>,
}

pub fn to_lab(rgba: &[u8], width: usize, height: usize) -> Planes {
    let table = srgb_to_linear_table();
    let n = width * height;
    let mut l = vec![0f64; n];
    let mut a = vec![0f64; n];
    let mut b = vec![0f64; n];
    for (i, px) in rgba.chunks_exact(4).take(n).enumerate() {
        let r = table[px[0] as usize];
        let g = table[px[1] as usize];
        let bl = table[px[2] as usize];
        let x = r * 0.4124564 + g * 0.3575761 + bl * 0.1804375;
        let y = r * 0.2126729 + g * 0.7151522 + bl * 0.0721750;
        let z = r * 0.0193339 + g * 0.1191920 + bl * 0.9503041;
        let fx = lab_f(x / 0.95047);
        let fy = lab_f(y / 1.0);
        let fz = lab_f(z / 1.08883);
        l[i] = (116.0 * fy - 16.0) / 100.0;
        a[i] = (500.0 * (fx - fy) + 128.0) / 255.0;
        b[i] = (200.0 * (fy - fz) + 128.0) / 255.0;
    }
    Planes {
        width,
        height,
        l,
        a,
        b,
    }
}

pub fn window() -> [f64; 2 * WINDOW_RADIUS + 1] {
    let mut k = [0f64; 2 * WINDOW_RADIUS + 1];
    let mut sum = 0.0;
    for i in 0..k.len() {
        let d = i as f64 - WINDOW_RADIUS as f64;
        let w = libm::exp(-(d * d) / (2.0 * WINDOW_SIGMA * WINDOW_SIGMA));
        k[i] = w;
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

/// Separable Gaussian blur of a plane with replicated edges, horizontal then vertical.
pub fn blur(src: &[f64], width: usize, height: usize, k: &[f64]) -> Vec<f64> {
    let r = ((k.len() - 1) / 2) as i64;
    let mut tmp = vec![0f64; width * height];
    for y in 0..height {
        let row = y * width;
        for x in 0..width {
            let mut acc = 0.0;
            for i in -r..=r {
                acc += k[(i + r) as usize] * src[row + clamp_index(x as i64 + i, width)];
            }
            tmp[row + x] = acc;
        }
    }
    let mut out = vec![0f64; width * height];
    for y in 0..height {
        for x in 0..width {
            let mut acc = 0.0;
            for i in -r..=r {
                acc += k[(i + r) as usize] * tmp[clamp_index(y as i64 + i, height) * width + x];
            }
            out[y * width + x] = acc;
        }
    }
    out
}

/// The mean SSIM of two planes.
pub fn ssim_plane(x: &[f64], y: &[f64], width: usize, height: usize, k: &[f64]) -> f64 {
    let n = width * height;
    let mu_x = blur(x, width, height, k);
    let mu_y = blur(y, width, height, k);
    let xx: Vec<f64> = x.iter().map(|v| v * v).collect();
    let yy: Vec<f64> = y.iter().map(|v| v * v).collect();
    let xy: Vec<f64> = x.iter().zip(y).map(|(a, b)| a * b).collect();
    let e_xx = blur(&xx, width, height, k);
    let e_yy = blur(&yy, width, height, k);
    let e_xy = blur(&xy, width, height, k);
    let mut sum = 0.0;
    for i in 0..n {
        let mx = mu_x[i];
        let my = mu_y[i];
        let sx = e_xx[i] - mx * mx;
        let sy = e_yy[i] - my * my;
        let sxy = e_xy[i] - mx * my;
        let num = (2.0 * mx * my + C1) * (2.0 * sxy + C2);
        let den = (mx * mx + my * my + C1) * (sx + sy + C2);
        sum += num / den;
    }
    sum / n as f64
}

/// 2 by 2 box downsample; odd rows and columns at the far edges are dropped.
pub fn downsample(src: &[f64], width: usize, height: usize) -> (Vec<f64>, usize, usize) {
    let w = width / 2;
    let h = height / 2;
    let mut out = vec![0f64; w * h];
    for y in 0..h {
        for x in 0..w {
            let i = (2 * y) * width + 2 * x;
            out[y * w + x] = (src[i] + src[i + 1] + src[i + width] + src[i + width + 1]) / 4.0;
        }
    }
    (out, w, h)
}

pub fn dssim(a: &[u8], b: &[u8], width: usize, height: usize) -> DssimResult {
    let pa = to_lab(a, width, height);
    let pb = to_lab(b, width, height);
    let k = window();
    let mut planes_a = [pa.l, pa.a, pa.b];
    let mut planes_b = [pb.l, pb.a, pb.b];
    let (mut w, mut h) = (width, height);
    let mut weighted = 0.0;
    let mut weight_sum = 0.0;
    let mut scales = 0u32;
    for weight in SCALE_WEIGHTS {
        if w < MIN_SIDE || h < MIN_SIDE {
            break;
        }
        let sl = ssim_plane(&planes_a[0], &planes_b[0], w, h, &k);
        let sa = ssim_plane(&planes_a[1], &planes_b[1], w, h, &k);
        let sb = ssim_plane(&planes_a[2], &planes_b[2], w, h, &k);
        let s = (sl + 0.5 * sa + 0.5 * sb) / 2.0;
        weighted += weight * s;
        weight_sum += weight;
        scales += 1;
        let (nw, nh) = (w / 2, h / 2);
        if nw < MIN_SIDE || nh < MIN_SIDE {
            break;
        }
        for i in 0..3 {
            planes_a[i] = downsample(&planes_a[i], w, h).0;
            planes_b[i] = downsample(&planes_b[i], w, h).0;
        }
        w = nw;
        h = nh;
    }
    if scales == 0 {
        // Smaller than one window: fall back to the exact-match case.
        let same = a == b;
        return DssimResult {
            dssim: if same { 0.0 } else { 1.0 },
            ssim: if same { 1.0 } else { 0.5 },
            scales: 0,
        };
    }
    let ssim = weighted / weight_sum;
    let floored = f64::max(ssim, 1e-6);
    DssimResult {
        dssim: 1.0 / floored - 1.0,
        ssim,
        scales,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gradient(w: usize, h: usize, flip: bool) -> Vec<u8> {
        let mut v = Vec::with_capacity(w * h * 4);
        for y in 0..h {
            for x in 0..w {
                let t = ((x * 255) / (w - 1)) as u8;
                let t = if flip { 255 - t } else { t };
                let s = ((y * 255) / (h - 1)) as u8;
                v.extend_from_slice(&[t, s, 128, 255]);
            }
        }
        v
    }

    #[test]
    fn identical_images_score_zero() {
        let a = gradient(64, 40, false);
        let r = dssim(&a, &a, 64, 40);
        assert!(r.dssim.abs() < 1e-9, "{r:?}");
        assert!((r.ssim - 1.0).abs() < 1e-9);
        // 64 by 40, then 32 by 20; 16 by 10 is under the 11 px minimum side.
        assert_eq!(r.scales, 2);
    }

    #[test]
    fn different_images_score_above_zero() {
        let a = gradient(64, 40, false);
        let b = gradient(64, 40, true);
        let r = dssim(&a, &b, 64, 40);
        assert!(r.dssim > 0.01, "{r:?}");
        assert!(r.ssim < 1.0);
    }

    #[test]
    fn a_small_change_scores_low() {
        let a = gradient(64, 40, false);
        let mut b = a.clone();
        b[(20 * 64 + 30) * 4] ^= 0x40;
        let r = dssim(&a, &b, 64, 40);
        assert!(r.dssim > 0.0 && r.dssim < 0.01, "{r:?}");
    }

    #[test]
    fn the_window_is_normalized() {
        let k = window();
        assert_eq!(k.len(), 11);
        assert!((k.iter().sum::<f64>() - 1.0).abs() < 1e-12);
    }
}
