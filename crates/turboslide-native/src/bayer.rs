//! The 8 by 8 Bayer screen with the deck's permutation of 0 to 63 (SPEC 5.4;
//! Prototemplate/deck/parts/tail.html lines 100 to 103): the 4 by 4 matrix, each entry times
//! four, plus an offset by quadrant. Same table as `bayer8` in packages/effects/src/bayer.ts.

use crate::image::{Bits, Gray};

const B4: [[u8; 4]; 4] = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const Q: [u8; 4] = [0, 2, 3, 1];

/// The screen value at row r, column c, in 0 to 63.
pub fn bayer8(r: usize, c: usize) -> u8 {
    let rr = r % 8;
    let cc = c % 8;
    B4[rr % 4][cc % 4] * 4 + Q[(rr / 4) * 2 + cc / 4]
}

/// The integer threshold for a cell, `int((m + 0.5) / 64 * 255)`; a tone value lights the cell
/// when it exceeds the threshold.
pub fn bayer_threshold(r: usize, c: usize) -> u8 {
    (((bayer8(r, c) as f64 + 0.5) / 64.0) * 255.0).trunc() as u8
}

/// The 64 thresholds, row major.
pub fn bayer_thresholds() -> [u8; 64] {
    let mut t = [0u8; 64];
    for r in 0..8 {
        for c in 0..8 {
            t[r * 8 + c] = bayer_threshold(r, c);
        }
    }
    t
}

/// Ordered dither to one bit: a cell is lit when its value exceeds the screen.
pub fn dither_gray(gray: &Gray) -> Bits {
    let t = bayer_thresholds();
    let mut bits = vec![0u8; gray.width * gray.height];
    for y in 0..gray.height {
        let row_t = (y % 8) * 8;
        let row = y * gray.width;
        for x in 0..gray.width {
            bits[row + x] = if gray.data[row + x] > t[row_t + x % 8] {
                1
            } else {
                0
            };
        }
    }
    Bits {
        width: gray.width,
        height: gray.height,
        bits,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_table_is_a_permutation_of_0_to_63() {
        let mut seen = [false; 64];
        for r in 0..8 {
            for c in 0..8 {
                let v = bayer8(r, c) as usize;
                assert!(!seen[v], "{v} repeats");
                seen[v] = true;
            }
        }
        // The deck's first row (tail.html:100-103): 0, 32, 8, 40, 2, 34, 10, 42.
        let row0: Vec<u8> = (0..8).map(|c| bayer8(0, c)).collect();
        assert_eq!(row0, vec![0, 32, 8, 40, 2, 34, 10, 42]);
    }

    #[test]
    fn thresholds_are_the_pillow_map() {
        assert_eq!(bayer_threshold(0, 0), 1);
        assert_eq!(bayer_threshold(0, 1), 129);
        assert_eq!(bayer_thresholds().iter().max().copied(), Some(253));
    }
}
