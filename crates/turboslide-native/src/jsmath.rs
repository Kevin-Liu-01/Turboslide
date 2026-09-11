//! JavaScript number semantics the TypeScript pipeline relies on, reproduced so the crate lands
//! on the same integers (SPEC 10: "the same arithmetic"). Every function here names the
//! JavaScript operation it stands in for.

/// `Math.round(x)`: the nearest integer, ties toward positive infinity. `f64::round` rounds ties
/// away from zero and would move a crop edge at -2.5 the other way.
pub fn js_round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 { f + 1.0 } else { f }
}

/// Python's `round()` and the effects package's `roundHalfEven`: ties to the even integer. The
/// tone LUT was built with it (packages/effects/src/tone.ts).
pub fn round_half_even(x: f64) -> f64 {
    let f = x.floor();
    let d = x - f;
    // Above a half rounds up; exactly a half rounds up only from an odd floor.
    if d > 0.5 || (d == 0.5 && f % 2.0 != 0.0) {
        f + 1.0
    } else {
        f
    }
}

/// Storing a number into a `Uint8Array`: ToUint8, which is modulo 256 after truncation toward
/// zero and 0 for NaN and the infinities. `as u8` would saturate instead.
pub fn js_to_uint8(x: f64) -> u8 {
    if !x.is_finite() {
        return 0;
    }
    let t = x.trunc();
    let m = t % 256.0;
    let m = if m < 0.0 { m + 256.0 } else { m };
    m as u8
}

/// `Math.hypot(x, y)` as V8 computes it: scale by the larger magnitude, sum the squares with
/// Kahan compensation, square root, scale back. A plain `sqrt(x * x + y * y)` can differ from it
/// in the last bit, which matters where the plate metrics compare a distance with 30 px.
pub fn js_hypot(x: f64, y: f64) -> f64 {
    let ax = x.abs();
    let ay = y.abs();
    let max = if ax > ay { ax } else { ay };
    if max == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0;
    let mut compensation = 0.0;
    for v in [ax, ay] {
        let n = v / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sum.sqrt() * max
}

/// `Number(x.toFixed(4))` for a finite x in [0, 1]: the integer n closest to x * 10^4 on the
/// exact value of the double, the larger n on a tie, then n / 10^4 as a double. Rust's `{:.4}`
/// rounds the tie to even, so 1/32 would print 0.0312 where JavaScript gives 0.0313.
pub fn js_to_fixed4(x: f64) -> f64 {
    if !(x > 0.0) {
        return 0.0;
    }
    let bits = x.to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as i32;
    let fraction = bits & ((1u64 << 52) - 1);
    let (mantissa, exp2) = if exponent == 0 {
        (fraction, -1074)
    } else {
        (fraction | (1u64 << 52), exponent - 1075)
    };
    // x = mantissa * 2^exp2; x * 10^4 = mantissa * 10000 * 2^exp2.
    let scaled = mantissa as u128 * 10_000u128;
    let n: u128 = if exp2 >= 0 {
        scaled << exp2
    } else {
        let shift = (-exp2) as u32;
        if shift >= 127 {
            0
        } else {
            let half = 1u128 << (shift - 1);
            (scaled + half) >> shift
        }
    };
    n as f64 / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_follows_javascript() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert_eq!(js_round(-1325.0), -1325.0);
    }

    #[test]
    fn half_even_follows_python() {
        assert_eq!(round_half_even(0.5), 0.0);
        assert_eq!(round_half_even(1.5), 2.0);
        assert_eq!(round_half_even(2.5), 2.0);
        assert_eq!(round_half_even(2.51), 3.0);
        assert_eq!(round_half_even(-1.5), -2.0);
    }

    #[test]
    fn uint8_store_wraps() {
        assert_eq!(js_to_uint8(255.9), 255);
        assert_eq!(js_to_uint8(256.0), 0);
        assert_eq!(js_to_uint8(-1.0), 255);
        assert_eq!(js_to_uint8(f64::INFINITY), 0);
        assert_eq!(js_to_uint8(f64::NAN), 0);
    }

    #[test]
    fn hypot_matches_exact_squares() {
        assert_eq!(js_hypot(3.0, 4.0), 5.0);
        assert_eq!(js_hypot(0.0, 0.0), 0.0);
        assert_eq!(js_hypot(0.0, 7.0), 7.0);
        assert!((js_hypot(18.0, 24.0) - 30.0).abs() < 1e-12);
    }

    #[test]
    fn to_fixed_rounds_ties_up() {
        assert_eq!(js_to_fixed4(0.03125), 0.0313);
        assert_eq!(js_to_fixed4(29_880.0 / 360_000.0), 0.083);
        assert_eq!(js_to_fixed4(0.0), 0.0);
        assert_eq!(js_to_fixed4(1.0), 1.0);
        assert_eq!(js_to_fixed4(0.48884), 0.4888);
        assert_eq!(js_to_fixed4(0.00004), 0.0);
        assert_eq!(js_to_fixed4(175_982.0 / 360_000.0), 0.4888);
    }
}
