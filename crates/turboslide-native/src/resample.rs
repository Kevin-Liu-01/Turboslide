//! Resampling for the two-tone pipeline (SPEC 5.4, 10): the padded crop, Pillow's Lanczos3 step
//! for step (libImaging/Resample.c, as packages/effects/src/resample.ts reproduces it), the cover
//! fit and the nearest-neighbour upscale.
//!
//! The kernel is `sinc(x) sinc(x / 3)` on |x| < 3, the support scales with the downscale factor,
//! taps are centered at `in0 + (xx + 0.5) * scale` and rounded with `(int)(v + 0.5)`, the
//! coefficients are normalized to one and quantized to 22-bit fixed point, each pass goes through
//! 8-bit storage, and every sum is rounded with a half-unit bias and floored. Floating point is
//! evaluated in the order the TypeScript writes it; `sin` is libm's fdlibm port.

use crate::image::{Bits, Box4, Gray};
use crate::jsmath::js_round;

const SUPPORT: f64 = 3.0;
const PRECISION_BITS: u32 = 32 - 8 - 2;
const PRECISION: f64 = (1u64 << PRECISION_BITS) as f64;
const HALF: i64 = 1 << (PRECISION_BITS - 1);

fn sinc(x: f64) -> f64 {
    if x == 0.0 {
        return 1.0;
    }
    let px = x * std::f64::consts::PI;
    libm::sin(px) / px
}

fn lanczos(x: f64) -> f64 {
    if (-3.0..3.0).contains(&x) {
        sinc(x) * sinc(x / 3.0)
    } else {
        0.0
    }
}

/// The per-axis tap table: `ksize` coefficients per output pixel in `kk`, and for each output
/// pixel its first input index and tap count in `bounds`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Coeffs {
    pub ksize: usize,
    pub bounds: Vec<i32>,
    pub kk: Vec<i32>,
}

/// Pillow's `precompute_coeffs` plus `normalize_coeffs_8bpc` for one axis.
pub fn precompute_coeffs(in_size: usize, in0: f64, in1: f64, out_size: usize) -> Coeffs {
    let scale = (in1 - in0) / out_size as f64;
    let filterscale = if scale < 1.0 { 1.0 } else { scale };
    let support = SUPPORT * filterscale;
    let ksize = (support.ceil() as usize) * 2 + 1;
    let mut bounds = vec![0i32; out_size * 2];
    let mut kk = vec![0i32; out_size * ksize];
    let mut k = vec![0f64; ksize];
    let ss = 1.0 / filterscale;
    for xx in 0..out_size {
        let center = in0 + (xx as f64 + 0.5) * scale;
        let mut xmin = (center - support + 0.5).trunc() as i64;
        if xmin < 0 {
            xmin = 0;
        }
        let mut xmax = (center + support + 0.5).trunc() as i64;
        if xmax > in_size as i64 {
            xmax = in_size as i64;
        }
        xmax -= xmin;
        let xmax = xmax.max(0) as usize;
        let mut ww = 0.0;
        for x in 0..xmax {
            let w = lanczos(((x as f64 + xmin as f64) - center + 0.5) * ss);
            k[x] = w;
            ww += w;
        }
        for x in 0..xmax {
            if ww != 0.0 {
                k[x] /= ww;
            }
        }
        for x in xmax..ksize {
            k[x] = 0.0;
        }
        for x in 0..ksize {
            let v = k[x];
            kk[xx * ksize + x] = if v < 0.0 {
                (-0.5 + v * PRECISION).trunc() as i32
            } else {
                (0.5 + v * PRECISION).trunc() as i32
            };
        }
        bounds[xx * 2] = xmin as i32;
        bounds[xx * 2 + 1] = xmax as i32;
    }
    Coeffs { ksize, bounds, kk }
}

fn clip8(ss: i64) -> u8 {
    // ss / 2^22 floored: an arithmetic shift floors negatives too, as Math.floor does.
    let v = ss >> PRECISION_BITS;
    if v < 0 {
        0
    } else if v > 255 {
        255
    } else {
        v as u8
    }
}

fn horizontal_pass(src: &Gray, offset: usize, out_h: usize, out_w: usize, c: &Coeffs) -> Gray {
    let mut out = vec![0u8; out_w * out_h];
    for yy in 0..out_h {
        let in_row = (yy + offset) * src.width;
        let out_row = yy * out_w;
        for xx in 0..out_w {
            let xmin = c.bounds[xx * 2] as usize;
            let xmax = c.bounds[xx * 2 + 1] as usize;
            let k_base = xx * c.ksize;
            let mut ss: i64 = HALF;
            for x in 0..xmax {
                ss += src.data[in_row + x + xmin] as i64 * c.kk[k_base + x] as i64;
            }
            out[out_row + xx] = clip8(ss);
        }
    }
    Gray {
        width: out_w,
        height: out_h,
        data: out,
    }
}

fn vertical_pass(src: &Gray, out_h: usize, c: &Coeffs) -> Gray {
    let w = src.width;
    let mut out = vec![0u8; w * out_h];
    for yy in 0..out_h {
        let ymin = c.bounds[yy * 2] as usize;
        let ymax = c.bounds[yy * 2 + 1] as usize;
        let k_base = yy * c.ksize;
        let out_row = yy * w;
        for xx in 0..w {
            let mut ss: i64 = HALF;
            for y in 0..ymax {
                ss += src.data[(y + ymin) * w + xx] as i64 * c.kk[k_base + y] as i64;
            }
            out[out_row + xx] = clip8(ss);
        }
    }
    Gray {
        width: w,
        height: out_h,
        data: out,
    }
}

/// Pillow's `Image.resize(size, LANCZOS, box)` for an 8-bit image. The box is in source pixels
/// and may carry fractions.
pub fn resize_lanczos3(src: &Gray, dst_w: usize, dst_h: usize, bx: Option<Box4>) -> Gray {
    let [x0, y0, x1, y1] = bx.unwrap_or([0.0, 0.0, src.width as f64, src.height as f64]);
    if dst_w == src.width
        && dst_h == src.height
        && x0 == 0.0
        && y0 == 0.0
        && x1 == src.width as f64
        && y1 == src.height as f64
    {
        return src.clone();
    }
    let horiz = precompute_coeffs(src.width, x0, x1, dst_w);
    let mut vert = precompute_coeffs(src.height, y0, y1, dst_h);
    let need_horizontal = dst_w != src.width || x0 != 0.0 || x1 != dst_w as f64;
    let need_vertical = dst_h != src.height || y0 != 0.0 || y1 != dst_h as f64;
    let ybox_first = vert.bounds[0];
    let ybox_last = vert.bounds[dst_h * 2 - 2] + vert.bounds[dst_h * 2 - 1];
    let mut img: Option<Gray> = None;
    if need_horizontal {
        for i in 0..dst_h {
            vert.bounds[i * 2] -= ybox_first;
        }
        img = Some(horizontal_pass(
            src,
            ybox_first as usize,
            (ybox_last - ybox_first) as usize,
            dst_w,
            &horiz,
        ));
    }
    if need_vertical {
        let input = img.as_ref().unwrap_or(src);
        img = Some(vertical_pass(input, dst_h, &vert));
    }
    img.unwrap_or_else(|| src.clone())
}

/// Pillow's `Image.crop(box)`: the box may reach past the source on any side and the outside is
/// filled with black. The edges are rounded with `Math.round`, as the TypeScript does.
pub fn crop_padded(src: &Gray, bx: Box4) -> Gray {
    let l = js_round(bx[0]) as i64;
    let t = js_round(bx[1]) as i64;
    let r = js_round(bx[2]) as i64;
    let b = js_round(bx[3]) as i64;
    let width = (r - l).max(0) as usize;
    let height = (b - t).max(0) as usize;
    let mut out = vec![0u8; width * height];
    let y0 = t.max(0);
    let y1 = b.min(src.height as i64);
    let x0 = l.max(0);
    let x1 = r.min(src.width as i64);
    if x1 > x0 {
        let mut y = y0;
        while y < y1 {
            let src_row = y as usize * src.width;
            let out_row = (y - t) as usize * width;
            let from = src_row + x0 as usize;
            let to = src_row + x1 as usize;
            let at = out_row + (x0 - l) as usize;
            out[at..at + (to - from)].copy_from_slice(&src.data[from..to]);
            y += 1;
        }
    }
    Gray {
        width,
        height,
        data: out,
    }
}

/// The crop box `ImageOps.fit` computes for a cover fit: the largest box of the target aspect
/// inside the source, centered. Fractions are kept.
pub fn cover_box(src_w: usize, src_h: usize, dst_w: usize, dst_h: usize) -> Box4 {
    let (cx, cy) = (0.5, 0.5);
    let live_ratio = src_w as f64 / src_h as f64;
    let out_ratio = dst_w as f64 / dst_h as f64;
    let (crop_w, crop_h) = if live_ratio == out_ratio {
        (src_w as f64, src_h as f64)
    } else if live_ratio >= out_ratio {
        (out_ratio * src_h as f64, src_h as f64)
    } else {
        (src_w as f64, src_w as f64 / out_ratio)
    };
    let left = (src_w as f64 - crop_w) * cx;
    let top = (src_h as f64 - crop_h) * cy;
    [left, top, left + crop_w, top + crop_h]
}

/// `ImageOps.fit(image, (dst_w, dst_h), LANCZOS)`: cover, trimming the long side.
pub fn fit_cover(src: &Gray, dst_w: usize, dst_h: usize) -> Gray {
    resize_lanczos3(
        src,
        dst_w,
        dst_h,
        Some(cover_box(src.width, src.height, dst_w, dst_h)),
    )
}

/// Nearest-neighbour upscale by an integer factor: every cell becomes a k by k square.
pub fn scale_nearest(bits: &Bits, k: f64) -> Bits {
    let f = f64::max(1.0, js_round(k)) as usize;
    let width = bits.width * f;
    let height = bits.height * f;
    let mut out = vec![0u8; width * height];
    for y in 0..height {
        let src_row = (y / f) * bits.width;
        let out_row = y * width;
        for x in 0..width {
            out[out_row + x] = bits.bits[src_row + x / f];
        }
    }
    Bits {
        width,
        height,
        bits: out,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coefficients_normalize_to_one_unit() {
        let c = precompute_coeffs(100, 0.0, 100.0, 25);
        assert_eq!(c.ksize, 25);
        for xx in 0..25 {
            let sum: i64 = c.kk[xx * c.ksize..(xx + 1) * c.ksize]
                .iter()
                .map(|&v| v as i64)
                .sum();
            // Quantization leaves the sum within a few units of 2^22.
            assert!((sum - (1i64 << 22)).abs() <= 8, "sum {sum} at {xx}");
        }
    }

    #[test]
    fn crop_pads_with_black() {
        let src = Gray {
            width: 2,
            height: 2,
            data: vec![10, 20, 30, 40],
        };
        let out = crop_padded(&src, [-1.0, 0.0, 2.0, 3.0]);
        assert_eq!((out.width, out.height), (3, 3));
        assert_eq!(out.data, vec![0, 10, 20, 0, 30, 40, 0, 0, 0]);
    }

    #[test]
    fn cover_box_trims_the_long_side() {
        let b = cover_box(3200, 1800, 800, 450);
        assert_eq!(b, [0.0, 0.0, 3200.0, 1800.0]);
        let b = cover_box(1000, 1000, 800, 450);
        assert_eq!(b[1], 218.75);
        assert_eq!(b[3], 781.25);
    }

    #[test]
    fn nearest_doubles_every_cell() {
        let bits = Bits {
            width: 2,
            height: 1,
            bits: vec![1, 0],
        };
        let out = scale_nearest(&bits, 2.0);
        assert_eq!(out.bits, vec![1, 1, 0, 0, 1, 1, 0, 0]);
    }
}
