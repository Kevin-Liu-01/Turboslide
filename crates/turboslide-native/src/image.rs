//! The raw buffers every stage works on, the shape of `GrayImage` and `BitImage` in
//! packages/effects/src/image.ts: one byte per pixel, row major.

/// One byte per pixel, 0 to 255.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Gray {
    pub width: usize,
    pub height: usize,
    pub data: Vec<u8>,
}

impl Gray {
    pub fn new(width: usize, height: usize) -> Self {
        Gray {
            width,
            height,
            data: vec![0; width * height],
        }
    }
}

/// One byte per cell, 0 or 1. 1 is a lit cell (paper on the dark twin).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bits {
    pub width: usize,
    pub height: usize,
    pub bits: Vec<u8>,
}

impl Bits {
    pub fn inverted(&self) -> Bits {
        Bits {
            width: self.width,
            height: self.height,
            bits: self
                .bits
                .iter()
                .map(|&b| if b == 0 { 1 } else { 0 })
                .collect(),
        }
    }

    pub fn lit_count(&self) -> usize {
        self.bits.iter().map(|&b| b as usize).sum()
    }
}

/// Left, top, right, bottom; right and bottom exclusive. The `Box4` of the effects package, kept
/// as doubles because `ImageOps.fit` hands the resampler a fractional box.
pub type Box4 = [f64; 4];
