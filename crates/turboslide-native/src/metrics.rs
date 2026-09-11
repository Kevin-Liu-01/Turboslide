//! Plate metrics for two-tone pictures (SPEC 5.4; Asset.metrics in SPEC 4.2), the same numbers
//! and warning strings as packages/effects/src/metrics.ts: the lit fraction to four decimals,
//! the lit cells under a plate rectangle and in the 30 px band around it, the nearest lit cell,
//! and the uniform-screen, blank-twin and plate-clear warnings.

use crate::image::Bits;
use crate::jsmath::{js_hypot, js_round, js_to_fixed4};
use serde::Serialize;

pub const PLATE_BAND_PX: f64 = 30.0;

/// Left, top, width, height in sheet pixels, the Box of SPEC 4.2.
pub type Plate = [f64; 4];

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlateClear {
    pub plate: Plate,
    pub nearest_lit_px: f64,
    pub lit_under: u32,
    pub lit_in_band: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwoToneMetrics {
    pub lit_fraction: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plate_clear: Option<PlateClear>,
    pub warnings: Vec<String>,
}

/// Plate clearance on a bit image whose cells are `cell` sheet pixels wide. Distances use V8's
/// `Math.hypot` so a cell at exactly 30 px lands on the same side of the band as in TypeScript.
pub fn plate_clear(bits: &Bits, plate: Plate, cell: f64) -> PlateClear {
    let [px, py, pw, ph] = plate;
    let right = px + pw;
    let bottom = py + ph;
    let mut lit_under = 0u32;
    let mut lit_in_band = 0u32;
    let mut nearest = f64::INFINITY;
    for cy in 0..bits.height {
        let y0 = cy as f64 * cell;
        let y1 = y0 + cell;
        let dy = if y1 <= py {
            py - y1
        } else if y0 >= bottom {
            y0 - bottom
        } else {
            0.0
        };
        let row = cy * bits.width;
        for cx in 0..bits.width {
            if bits.bits[row + cx] == 0 {
                continue;
            }
            let x0 = cx as f64 * cell;
            let x1 = x0 + cell;
            let dx = if x1 <= px {
                px - x1
            } else if x0 >= right {
                x0 - right
            } else {
                0.0
            };
            let d = js_hypot(dx, dy);
            if d < nearest {
                nearest = d;
            }
            if dx == 0.0 && dy == 0.0 {
                lit_under += 1;
            } else if d < PLATE_BAND_PX {
                lit_in_band += 1;
            }
        }
    }
    PlateClear {
        plate,
        nearest_lit_px: if nearest.is_finite() {
            js_round(nearest)
        } else {
            js_round(js_hypot(
                bits.width as f64 * cell,
                bits.height as f64 * cell,
            ))
        },
        lit_under,
        lit_in_band,
    }
}

fn percent(lit: f64) -> String {
    // (lit * 100).toFixed(1) for the warning text: one decimal, rounded with Math.round.
    let v = lit * 100.0;
    let scaled = js_round(v * 10.0) / 10.0;
    format!("{scaled:.1}")
}

/// Metrics of the dark twin: lit means paper on the dark ground.
pub fn two_tone_metrics(dark_bits: &Bits, plate: Option<Plate>, cell: f64) -> TwoToneMetrics {
    let total = dark_bits.bits.len();
    let lit = if total == 0 {
        0.0
    } else {
        dark_bits.lit_count() as f64 / total as f64
    };
    let mut warnings = Vec::new();
    if lit > 0.92 || lit < 0.08 {
        warnings.push(format!(
            "uniform screen: {} percent of cells are lit; a two-tone picture needs an edge (OPENERS.md, round ten rule)",
            percent(lit)
        ));
    }
    if lit < 0.02 || lit > 0.98 {
        warnings.push(format!(
            "blank twin: {} percent lit; one twin shows an empty sheet (picture/blank-twin)",
            percent(lit)
        ));
    }
    let mut metrics = TwoToneMetrics {
        lit_fraction: js_to_fixed4(lit),
        plate_clear: None,
        warnings,
    };
    if let Some(plate) = plate {
        let clear = plate_clear(dark_bits, plate, cell);
        if clear.lit_under > 0 {
            metrics.warnings.push(format!(
                "{} lit cell(s) under the plate (picture/plate-clear)",
                clear.lit_under
            ));
        } else if clear.lit_in_band > 0 {
            metrics.warnings.push(format!(
                "{} lit cell(s) within {} px of the plate (picture/plate-clear)",
                clear.lit_in_band, PLATE_BAND_PX as u32
            ));
        }
        metrics.plate_clear = Some(clear);
    }
    metrics
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_lit_cell_far_from_the_plate_measures_its_distance() {
        let mut bits = Bits {
            width: 800,
            height: 450,
            bits: vec![0; 800 * 450],
        };
        bits.bits[0] = 1; // sheet pixels 0..2, 0..2
        let clear = plate_clear(&bits, [137.0, 500.0, 740.0, 271.0], 2.0);
        assert_eq!(clear.lit_under, 0);
        assert_eq!(clear.lit_in_band, 0);
        // dx = 137 - 2 = 135, dy = 500 - 2 = 498 -> hypot 515.97 -> 516
        assert_eq!(clear.nearest_lit_px, 516.0);
    }

    #[test]
    fn cells_under_and_beside_the_plate_are_counted() {
        let mut bits = Bits {
            width: 800,
            height: 450,
            bits: vec![0; 800 * 450],
        };
        bits.bits[(260 * 800) + 200] = 1; // sheet 400, 520: under the plate
        bits.bits[(240 * 800) + 200] = 1; // sheet 400, 480: 20 px above it
        let m = two_tone_metrics(&bits, Some([137.0, 500.0, 740.0, 271.0]), 2.0);
        let clear = m.plate_clear.unwrap();
        assert_eq!(clear.lit_under, 1);
        assert_eq!(clear.lit_in_band, 1);
        assert_eq!(clear.nearest_lit_px, 0.0);
        assert!(m.warnings.iter().any(|w| w.contains("uniform screen")));
        assert!(m.warnings.iter().any(|w| w.contains("blank twin")));
        assert!(
            m.warnings
                .iter()
                .any(|w| w == "1 lit cell(s) under the plate (picture/plate-clear)")
        );
    }

    #[test]
    fn percent_formats_one_decimal() {
        assert_eq!(percent(0.083), "8.3");
        assert_eq!(percent(0.0), "0.0");
        assert_eq!(percent(0.48884), "48.9");
    }
}
