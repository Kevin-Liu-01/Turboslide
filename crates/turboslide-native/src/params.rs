//! The two-tone treatment as it crosses the binding boundary: a JSON string with the fields of
//! `TwoToneParams` in packages/effects/src/two-tone.ts (Asset.treatment for kind two-tone, SPEC
//! 4.2). Every field is optional and defaults as the TypeScript defaults; unknown fields are
//! ignored so an Asset.treatment object can be passed as is; a JSON `null` reads as absent, as
//! `??` treats it.

use serde::Deserialize;

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Unsharp {
    /// The row range [from, to) of the fitted image the mask applies to.
    pub rows: [f64; 2],
    /// Percent, Pillow's unit: 180 means 180 percent.
    pub amount: f64,
    pub radius: Option<f64>,
    pub threshold: Option<f64>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct TwoToneParams {
    pub kind: Option<String>,
    /// Left, top, right, bottom in source pixels; may reach past the source, padded with black.
    pub crop: Option<[f64; 4]>,
    pub channel: Option<String>,
    pub invert: Option<bool>,
    pub blur: Option<f64>,
    pub autocontrast: Option<f64>,
    pub black: Option<f64>,
    pub white: Option<f64>,
    pub gamma: Option<f64>,
    pub min_filter: Option<f64>,
    pub unsharp: Option<Unsharp>,
    /// Which twin the positive image becomes: dark-ground when the positive is mostly ink.
    pub polarity: Option<String>,
    pub cell: Option<f64>,
    pub bayer: Option<f64>,
    pub resampler: Option<String>,
}

impl TwoToneParams {
    pub fn from_json(json: &str) -> Result<TwoToneParams, String> {
        serde_json::from_str(json).map_err(|e| format!("two-tone params: {e}"))
    }

    /// `if (params.invert)`: true only.
    pub fn inverts(&self) -> bool {
        self.invert == Some(true)
    }

    /// `if (params.blur)`: a number other than 0 and NaN.
    pub fn blur_radius(&self) -> Option<f64> {
        truthy(self.blur)
    }

    pub fn min_filter_size(&self) -> Option<f64> {
        truthy(self.min_filter)
    }

    pub fn autocontrast_cutoff(&self) -> f64 {
        self.autocontrast.unwrap_or(0.5)
    }

    pub fn black_point(&self) -> f64 {
        self.black.unwrap_or(0.0)
    }

    pub fn white_point(&self) -> f64 {
        self.white.unwrap_or(255.0)
    }

    pub fn gamma_value(&self) -> f64 {
        self.gamma.unwrap_or(1.0)
    }

    pub fn dark_ground(&self) -> bool {
        self.polarity.as_deref().unwrap_or("dark-ground") == "dark-ground"
    }

    pub fn cell_size(&self) -> f64 {
        self.cell.unwrap_or(2.0)
    }
}

fn truthy(v: Option<f64>) -> Option<f64> {
    match v {
        Some(x) if x != 0.0 && !x.is_nan() => Some(x),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_deck_treatment_and_ignores_unknown_fields() {
        let p = TwoToneParams::from_json(
            r#"{"kind":"two-tone","crop":[300,330,1800,1174],"blur":0.5,"autocontrast":0.5,
                "black":0,"white":212,"gamma":0.8,"unsharp":{"rows":[150,260],"amount":180},
                "polarity":"dark-ground","cell":2,"bayer":8,"resampler":"lanczos3","extra":1}"#,
        )
        .unwrap();
        assert_eq!(p.crop, Some([300.0, 330.0, 1800.0, 1174.0]));
        assert_eq!(p.blur_radius(), Some(0.5));
        assert_eq!(p.unsharp.as_ref().unwrap().rows, [150.0, 260.0]);
        assert_eq!(p.unsharp.as_ref().unwrap().radius, None);
        assert!(p.dark_ground());
        assert_eq!(p.gamma_value(), 0.8);
    }

    #[test]
    fn defaults_and_nulls_read_as_absent() {
        let p = TwoToneParams::from_json(r#"{"black":null,"blur":0,"invert":false}"#).unwrap();
        assert_eq!(p.black_point(), 0.0);
        assert_eq!(p.white_point(), 255.0);
        assert_eq!(p.autocontrast_cutoff(), 0.5);
        assert_eq!(p.blur_radius(), None);
        assert!(!p.inverts());
        assert_eq!(p.cell_size(), 2.0);
        assert!(TwoToneParams::from_json("{}").unwrap().dark_ground());
        assert!(TwoToneParams::from_json("nope").is_err());
    }
}
