//! A 1-bit PNG encoder (SPEC 5.4, 10): bit packing most significant first, one filter byte per
//! row, zlib deflate through miniz_oxide, CRC chunks. Grayscale at bit depth 1 by default (0
//! black, 1 white), the form of the deck's two-color files; a two-entry palette writes the exact
//! ink and paper of a theme instead. The pixels decode identically to the output of
//! packages/effects/src/png1.ts; the compressed bytes differ because zlib and miniz_oxide are
//! different deflate implementations, so a twin is compared by its cells, never by its bytes.

use crate::image::Bits;

const SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

fn crc_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    for (n, slot) in table.iter_mut().enumerate() {
        let mut c = n as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 {
                0xedb8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
        }
        *slot = c;
    }
    table
}

pub fn crc32(bytes: &[u8]) -> u32 {
    let table = crc_table();
    let mut c = 0xffff_ffffu32;
    for &b in bytes {
        c = table[((c ^ b as u32) & 0xff) as usize] ^ (c >> 8);
    }
    c ^ 0xffff_ffff
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], body: &[u8]) {
    out.extend_from_slice(&(body.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(body);
    let crc = crc32(&out[start..]);
    out.extend_from_slice(&crc.to_be_bytes());
}

/// PNG scanlines: filter byte 0, then bits most significant first.
pub fn pack_scanlines(bits: &Bits) -> Vec<u8> {
    let stride = bits.width.div_ceil(8);
    let mut out = vec![0u8; (stride + 1) * bits.height];
    for y in 0..bits.height {
        let row_in = y * bits.width;
        let row_out = y * (stride + 1) + 1;
        for x in 0..bits.width {
            if bits.bits[row_in + x] != 0 {
                out[row_out + (x >> 3)] |= 0x80 >> (x & 7);
            }
        }
    }
    out
}

/// Encode a bit image. `palette` is `[unlit rgb, lit rgb]`; `level` is the deflate level, 0 to
/// 10 (miniz_oxide's range; 6 is the default and the level the TypeScript encoder uses).
pub fn encode_png1(bits: &Bits, palette: Option<[[u8; 3]; 2]>, level: u8) -> Vec<u8> {
    let mut out = Vec::with_capacity(64 + bits.width * bits.height / 16);
    out.extend_from_slice(&SIGNATURE);
    let mut ihdr = [0u8; 13];
    ihdr[..4].copy_from_slice(&(bits.width as u32).to_be_bytes());
    ihdr[4..8].copy_from_slice(&(bits.height as u32).to_be_bytes());
    ihdr[8] = 1;
    ihdr[9] = if palette.is_some() { 3 } else { 0 };
    chunk(&mut out, b"IHDR", &ihdr);
    if let Some([unlit, lit]) = palette {
        let mut plte = [0u8; 6];
        plte[..3].copy_from_slice(&unlit);
        plte[3..].copy_from_slice(&lit);
        chunk(&mut out, b"PLTE", &plte);
    }
    let raw = pack_scanlines(bits);
    let deflated = miniz_oxide::deflate::compress_to_vec_zlib(&raw, level.min(10));
    chunk(&mut out, b"IDAT", &deflated);
    chunk(&mut out, b"IEND", &[]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc_of_iend_is_the_png_constant() {
        assert_eq!(crc32(b"IEND"), 0xae42_6082);
    }

    #[test]
    fn scanlines_pack_most_significant_first() {
        let bits = Bits {
            width: 10,
            height: 1,
            bits: vec![1, 0, 0, 0, 0, 0, 0, 1, 1, 0],
        };
        assert_eq!(pack_scanlines(&bits), vec![0, 0b1000_0001, 0b1000_0000]);
    }

    #[test]
    fn the_file_starts_with_the_signature_and_ihdr() {
        let bits = Bits {
            width: 3,
            height: 2,
            bits: vec![1, 0, 1, 0, 1, 0],
        };
        let png = encode_png1(&bits, None, 6);
        assert_eq!(&png[..8], &SIGNATURE);
        assert_eq!(&png[12..16], b"IHDR");
        assert_eq!(png[24], 1, "bit depth");
        assert_eq!(png[25], 0, "grayscale");
        let pal = encode_png1(&bits, Some([[7, 7, 7], [242, 242, 240]]), 6);
        assert_eq!(pal[25], 3, "palette");
        assert_eq!(&pal[37..41], b"PLTE");
    }
}
